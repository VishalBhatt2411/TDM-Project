import {
  DealershipScope,
  InstantWindow,
  InvalidValueError,
  SalesRepRepository,
  SalesRepresentative,
  StaffAssignment,
  StaffAssignmentConflictError,
  StaffAssignmentFilter,
  StaffAssignmentRepository,
  StaffDirectory,
  StaffDirectoryUser,
  UNASSIGNED_ID,
} from "@tdm/domain";
import { SalesforceConnectionSource } from "../connection-source";
import { staffAssignmentRecordToDomain, staffAssignmentRecordToSalesRep, staffAssignmentToRecord } from "../mappers";
import { dealershipCondition, escapeSoql, escapeSoqlLike, soqlIdList, STAFF_ASSIGNMENT_FIELDS, withConnection } from "../soql";

/** A tenant's staff runs to hundreds, not thousands — the cap only guards against a runaway org. */
const MAX_ASSIGNMENTS = 2000;
const MAX_DIRECTORY_RESULTS = 200;
/** Booking statuses that occupy a rep's day — the same set a slot conflict is checked against. */
const LOAD_STATUSES = "('Requested', 'Confirmed', 'InProgress')";

/** Only an active assignment of an active Salesforce user grants anything. */
const ACTIVE = "Is_Active__c = true AND User__r.IsActive = true";

function where(conditions: (string | null | undefined)[]): string {
  const clauses = conditions.filter((c): c is string => !!c);
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

/**
 * Salesforce's own validation (Staff_Assignment__c rules, the Company Admin guard trigger) is
 * authoritative; its failures are translated to domain errors so callers never see raw API codes.
 * The validation messages are this package's own wording, so they are safe to show.
 */
function toDomainError(errors: { statusCode?: string; errorCode?: string; message?: string }[]): Error {
  const error = errors[0] ?? {};
  const code = error.statusCode ?? error.errorCode;
  if (code === "DUPLICATE_VALUE") return new StaffAssignmentConflictError();
  if (code === "FIELD_CUSTOM_VALIDATION_EXCEPTION" && error.message) return new InvalidValueError(error.message);
  return new Error(`Failed to save Staff_Assignment__c: ${JSON.stringify(errors)}`);
}

export class SalesforceStaffAssignmentRepository implements StaffAssignmentRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async findById(id: string): Promise<StaffAssignment | null> {
    const records = await this.query(where([`Id = '${escapeSoql(id)}'`]), 1);
    return records[0] ?? null;
  }

  async findActiveByUser(userId: string): Promise<StaffAssignment[]> {
    return this.query(where([`User__c = '${escapeSoql(userId)}'`, ACTIVE]), MAX_ASSIGNMENTS);
  }

  async findAll(filter: StaffAssignmentFilter = {}): Promise<StaffAssignment[]> {
    return this.query(
      where([
        filter.userId ? `User__c = '${escapeSoql(filter.userId)}'` : null,
        filter.role ? `Role__c = '${escapeSoql(filter.role)}'` : null,
        filter.includeInactive ? null : ACTIVE,
        dealershipCondition("Dealership__c", filter.dealershipIds),
      ]),
      MAX_ASSIGNMENTS,
    );
  }

  async save(assignment: StaffAssignment): Promise<StaffAssignment> {
    return withConnection(this.connectionProvider, async (conn) => {
      const props = assignment.toProps();
      const record = staffAssignmentToRecord(assignment);
      const isNew = props.id === UNASSIGNED_ID;
      let result: any;
      try {
        result = isNew
          ? await conn.sobject("Staff_Assignment__c").create(record)
          : await conn.sobject("Staff_Assignment__c").update({ Id: props.id, ...record });
      } catch (err: any) {
        // An expired session is not a validation failure: let it reach withConnection, which retries on a fresh one.
        if (err?.errorCode && err.errorCode !== "INVALID_SESSION_ID") throw toDomainError([err]);
        throw err;
      }
      if (!result.success) throw toDomainError(result.errors ?? []);
      return isNew ? StaffAssignment.restore({ ...props, id: result.id }) : assignment;
    });
  }

  private query(whereClause: string, limit: number): Promise<StaffAssignment[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${STAFF_ASSIGNMENT_FIELDS} FROM Staff_Assignment__c ${whereClause} ORDER BY User__r.Name, CreatedDate LIMIT ${limit}`,
      );
      return result.records.map(staffAssignmentRecordToDomain);
    });
  }
}

/**
 * Assignable reps are users with an active Sales_Rep Staff_Assignment__c; a rep is identified by
 * their User id because that is what Booking__c.OwnerId holds. A user with Sales Rep assignments
 * at several dealerships is one rep — the first assignment (by creation) supplies their details.
 */
export class SalesforceSalesRepRepository implements SalesRepRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async findById(id: string): Promise<SalesRepresentative | null> {
    const reps = await this.query([`User__c = '${escapeSoql(id)}'`]);
    return reps[0] ?? null;
  }

  async findByBranch(branchId: string): Promise<SalesRepresentative[]> {
    return this.query([`Branch__c = '${escapeSoql(branchId)}'`]);
  }

  async findAllActive(scope?: DealershipScope): Promise<SalesRepresentative[]> {
    return this.query([dealershipCondition("Dealership__c", scope?.dealershipIds)]);
  }

  /** Day load is counted in one aggregate query rather than one booking query per rep. */
  async findLeastLoadedForBranch(branchId: string, day: InstantWindow): Promise<SalesRepresentative | null> {
    const reps = await this.findByBranch(branchId);
    if (reps.length === 0) return null;

    const loadByRep = await withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT OwnerId o, COUNT(Id) cnt FROM Booking__c WHERE OwnerId IN ${soqlIdList(reps.map((r) => r.id))} ` +
          `AND Scheduled_Start__c >= ${day.start.toISOString()} AND Scheduled_Start__c <= ${day.end.toISOString()} ` +
          `AND Status__c IN ${LOAD_STATUSES} GROUP BY OwnerId`,
      );
      return new Map<string, number>((result.records as any[]).map((r) => [r.o, r.cnt]));
    });

    let least: { rep: SalesRepresentative; load: number } | null = null;
    for (const rep of reps) {
      const load = loadByRep.get(rep.id) ?? 0;
      const cap = rep.toProps().maxDailyBookings;
      if (cap != null && load >= cap) continue;
      if (!least || load < least.load) least = { rep, load };
    }
    return least?.rep ?? null;
  }

  private query(conditions: (string | null)[]): Promise<SalesRepresentative[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${STAFF_ASSIGNMENT_FIELDS} FROM Staff_Assignment__c ` +
          `${where(["Role__c = 'Sales_Rep'", ACTIVE, ...conditions])} ORDER BY User__r.Name, CreatedDate LIMIT ${MAX_ASSIGNMENTS}`,
      );
      const seen = new Set<string>();
      const reps: SalesRepresentative[] = [];
      for (const record of result.records as any[]) {
        if (seen.has(record.User__c)) continue;
        seen.add(record.User__c);
        reps.push(staffAssignmentRecordToSalesRep(record));
      }
      return reps;
    });
  }
}

/** Salesforce Users with a full (Standard) license — the people a tenant can give staff access to. */
export class SalesforceStaffDirectory implements StaffDirectory {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async search(query?: string, limit = 50): Promise<StaffDirectoryUser[]> {
    const safeLimit = Math.min(Math.max(Math.floor(limit) || 1, 1), MAX_DIRECTORY_RESULTS);
    const term = query?.trim();
    const match = term ? `(Name LIKE '%${escapeSoqlLike(term)}%' OR Email LIKE '%${escapeSoqlLike(term)}%')` : null;
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT Id, Name, Email, IsActive FROM User ${where(["IsActive = true", "UserType = 'Standard'", match])} ` +
          `ORDER BY Name LIMIT ${safeLimit}`,
      );
      return (result.records as any[]).map(toDirectoryUser);
    });
  }

  async findById(id: string): Promise<StaffDirectoryUser | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT Id, Name, Email, IsActive FROM User WHERE Id = '${escapeSoql(id)}' AND UserType = 'Standard' LIMIT 1`,
      );
      const record = result.records[0];
      return record ? toDirectoryUser(record) : null;
    });
  }
}

function toDirectoryUser(record: any): StaffDirectoryUser {
  return { id: record.Id, name: record.Name ?? "", email: record.Email ?? "", isActive: !!record.IsActive };
}
