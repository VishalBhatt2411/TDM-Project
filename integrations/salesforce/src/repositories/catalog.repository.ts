import {
  Branch,
  BranchRepository,
  DealershipScope,
  UNASSIGNED_ID,
  Vehicle,
  VehicleRepository,
  VehicleSearchCriteria,
  VehicleVariantRepository,
} from "@tdm/domain";
import { SalesforceConnectionSource } from "../connection-source";
import { branchRecordToDomain, branchToRecord, variantRecordToDomain, vehicleRecordToDomain, vehicleToFullRecord } from "../mappers";
import { BRANCH_FIELDS, dealershipCondition, escapeSoql, VEHICLE_FIELDS, VEHICLE_VARIANT_FIELDS, withConnection } from "../soql";

export class SalesforceVehicleRepository implements VehicleRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async findById(id: string): Promise<Vehicle | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(`SELECT ${VEHICLE_FIELDS} FROM Vehicle__c WHERE Id = '${escapeSoql(id)}' LIMIT 1`);
      const record = result.records[0];
      return record ? vehicleRecordToDomain(record) : null;
    });
  }

  async search(criteria: VehicleSearchCriteria): Promise<{ items: Vehicle[]; total: number }> {
    return withConnection(this.connectionProvider, async (conn) => {
      const where = this.buildWhereClause(criteria);
      const page = criteria.page ?? 1;
      const pageSize = criteria.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const [itemsResult, countResult] = await Promise.all([
        conn.query(
          `SELECT ${VEHICLE_FIELDS} FROM Vehicle__c ${where} ORDER BY Is_Featured__c DESC, CreatedDate DESC ` +
            `LIMIT ${pageSize} OFFSET ${offset}`,
        ),
        conn.query(`SELECT COUNT() FROM Vehicle__c ${where}`),
      ]);

      return {
        items: itemsResult.records.map(vehicleRecordToDomain),
        total: (countResult as any).totalSize,
      };
    });
  }

  async findFeatured(kind: "featured" | "bestSeller" | "newLaunch", limit = 8, scope?: DealershipScope): Promise<Vehicle[]> {
    const fieldByKind: Record<typeof kind, string> = {
      featured: "Is_Featured__c",
      bestSeller: "Is_Best_Seller__c",
      newLaunch: "Is_New_Launch__c",
    };
    const dealership = dealershipCondition("Dealership__c", scope?.dealershipIds);
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${VEHICLE_FIELDS} FROM Vehicle__c WHERE ${fieldByKind[kind]} = true${dealership ? ` AND ${dealership}` : ""} ` +
          `ORDER BY CreatedDate DESC LIMIT ${limit}`,
      );
      return result.records.map(vehicleRecordToDomain);
    });
  }

  async findRelated(vehicleId: string, limit = 4): Promise<Vehicle[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const current = await conn.query(
        `SELECT Body_Type__c, Dealership__c FROM Vehicle__c WHERE Id = '${escapeSoql(vehicleId)}' LIMIT 1`,
      );
      const { Body_Type__c: bodyType, Dealership__c: dealershipId } = (current.records[0] as any) ?? {};
      if (!bodyType || !dealershipId) return [];
      const result = await conn.query(
        `SELECT ${VEHICLE_FIELDS} FROM Vehicle__c WHERE Body_Type__c = '${escapeSoql(bodyType)}' ` +
          `AND Dealership__c = '${escapeSoql(dealershipId)}' AND Id != '${escapeSoql(vehicleId)}' ` +
          `ORDER BY Is_Featured__c DESC LIMIT ${limit}`,
      );
      return result.records.map(vehicleRecordToDomain);
    });
  }

  async save(vehicle: Vehicle): Promise<Vehicle> {
    return withConnection(this.connectionProvider, async (conn) => {
      const props = vehicle.toProps();
      const record = vehicleToFullRecord(vehicle);
      if (props.id === UNASSIGNED_ID) {
        const created = await conn.sobject("Vehicle__c").create(record);
        if (!(created as any).success) {
          throw new Error(`Failed to create Vehicle__c: ${JSON.stringify((created as any).errors)}`);
        }
        return Vehicle.restore({ ...props, id: (created as any).id });
      }
      const updated = await conn.sobject("Vehicle__c").update({ Id: props.id, ...record });
      if (!(updated as any).success) {
        throw new Error(`Failed to update Vehicle__c ${props.id}: ${JSON.stringify((updated as any).errors)}`);
      }
      return vehicle;
    });
  }

  async delete(id: string): Promise<void> {
    await withConnection(this.connectionProvider, async (conn) => {
      await conn.sobject("Vehicle__c").destroy(id);
    });
  }

  private buildWhereClause(criteria: VehicleSearchCriteria): string {
    const clauses: string[] = [];
    if (criteria.q) {
      const q = escapeSoql(criteria.q);
      clauses.push(`(Make__c LIKE '%${q}%' OR Model__c LIKE '%${q}%')`);
    }
    if (criteria.bodyType) clauses.push(`Body_Type__c = '${escapeSoql(criteria.bodyType)}'`);
    if (criteria.fuelType) clauses.push(`Fuel_Type__c = '${escapeSoql(criteria.fuelType)}'`);
    if (criteria.transmission) clauses.push(`Transmission__c = '${escapeSoql(criteria.transmission)}'`);
    if (criteria.branchId) clauses.push(`Branch__c = '${escapeSoql(criteria.branchId)}'`);
    if (criteria.status) clauses.push(`Status__c = '${escapeSoql(criteria.status)}'`);
    if (criteria.minPrice != null) clauses.push(`Price__c >= ${criteria.minPrice}`);
    if (criteria.maxPrice != null) clauses.push(`Price__c <= ${criteria.maxPrice}`);
    const dealership = dealershipCondition("Dealership__c", criteria.dealershipIds);
    if (dealership) clauses.push(dealership);
    return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  }
}

export class SalesforceBranchRepository implements BranchRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async findById(id: string): Promise<Branch | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(`SELECT ${BRANCH_FIELDS} FROM Branch__c WHERE Id = '${escapeSoql(id)}' LIMIT 1`);
      const record = result.records[0];
      return record ? branchRecordToDomain(record) : null;
    });
  }

  async findAll(scope?: DealershipScope): Promise<Branch[]> {
    return this.query(["Is_Active__c = true", dealershipCondition("Dealership__c", scope?.dealershipIds)]);
  }

  async findAllIncludingInactive(scope?: DealershipScope): Promise<Branch[]> {
    return this.query([dealershipCondition("Dealership__c", scope?.dealershipIds)]);
  }

  private query(conditions: (string | null)[]): Promise<Branch[]> {
    const clauses = conditions.filter((c): c is string => !!c);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(`SELECT ${BRANCH_FIELDS} FROM Branch__c ${where} ORDER BY Name`);
      return result.records.map(branchRecordToDomain);
    });
  }

  async save(branch: Branch): Promise<Branch> {
    return withConnection(this.connectionProvider, async (conn) => {
      const props = branch.toProps();
      const record = branchToRecord(branch);
      if (props.id === UNASSIGNED_ID) {
        const created = await conn.sobject("Branch__c").create(record);
        if (!(created as any).success) {
          throw new Error(`Failed to create Branch__c: ${JSON.stringify((created as any).errors)}`);
        }
        return Branch.restore({ ...props, id: (created as any).id });
      }
      const updated = await conn.sobject("Branch__c").update({ Id: props.id, ...record });
      if (!(updated as any).success) {
        throw new Error(`Failed to update Branch__c ${props.id}: ${JSON.stringify((updated as any).errors)}`);
      }
      return branch;
    });
  }
}

export class SalesforceVehicleVariantRepository implements VehicleVariantRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async findByVehicle(vehicleId: string) {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${VEHICLE_VARIANT_FIELDS} FROM Vehicle_Variant__c WHERE Vehicle__c = '${escapeSoql(vehicleId)}' ORDER BY Display_Order__c ASC`,
      );
      return result.records.map(variantRecordToDomain);
    });
  }

  async findById(id: string) {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${VEHICLE_VARIANT_FIELDS} FROM Vehicle_Variant__c WHERE Id = '${escapeSoql(id)}' LIMIT 1`,
      );
      const record = result.records[0];
      return record ? variantRecordToDomain(record) : null;
    });
  }
}
