import { Booking, BookingListFilter, BookingRepository, BookingStatus, ComplianceRecord, DriveFeedback, UNASSIGNED_ID } from "@tdm/domain";
import { SalesforceConnectionProvider } from "../connection";
import { bookingRecordToDomain, bookingToRecord, complianceToRecord, feedbackRecordToDomain, feedbackToRecord } from "../mappers";
import { BOOKING_FIELDS, DRIVE_FEEDBACK_FIELDS, withConnection } from "../soql";

export class SalesforceBookingRepository implements BookingRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionProvider) {}

  async findById(id: string): Promise<Booking | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(`SELECT ${BOOKING_FIELDS} FROM Booking__c WHERE Id = '${id}' LIMIT 1`);
      const record = result.records[0];
      return record ? bookingRecordToDomain(record) : null;
    });
  }

  async findByCustomer(customerId: string): Promise<Booking[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const contactId = await this.resolveContactId(conn, customerId);
      if (!contactId) return [];
      const result = await conn.query(
        `SELECT ${BOOKING_FIELDS} FROM Booking__c WHERE Contact__c = '${contactId}' ORDER BY Scheduled_Start__c DESC`,
      );
      return result.records.map(bookingRecordToDomain);
    });
  }

  async findAll(filter: BookingListFilter): Promise<{ items: Booking[]; total: number }> {
    return withConnection(this.connectionProvider, async (conn) => {
      const clauses: string[] = [];
      if (filter.status) clauses.push(`Status__c = '${filter.status}'`);
      if (filter.branchId) clauses.push(`Branch__c = '${filter.branchId}'`);
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      const page = filter.page ?? 1;
      const pageSize = filter.pageSize ?? 25;
      const offset = (page - 1) * pageSize;

      const [itemsResult, countResult] = await Promise.all([
        conn.query(
          `SELECT ${BOOKING_FIELDS} FROM Booking__c ${where} ORDER BY Scheduled_Start__c DESC LIMIT ${pageSize} OFFSET ${offset}`,
        ),
        conn.query(`SELECT COUNT() FROM Booking__c ${where}`),
      ]);

      return {
        items: itemsResult.records.map(bookingRecordToDomain),
        total: (countResult as any).totalSize,
      };
    });
  }

  async findActiveByVehicle(vehicleId: string): Promise<Booking[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${BOOKING_FIELDS} FROM Booking__c WHERE Vehicle__c = '${vehicleId}' ` +
          `AND Status__c IN ('Confirmed', 'InProgress', 'Requested')`,
      );
      return result.records.map(bookingRecordToDomain);
    });
  }

  async findWaitlistedForVehicle(vehicleId: string): Promise<Booking[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${BOOKING_FIELDS} FROM Booking__c WHERE Vehicle__c = '${vehicleId}' AND Status__c = 'Waitlisted' ` +
          `ORDER BY Waitlist_Position__c ASC`,
      );
      return result.records.map(bookingRecordToDomain);
    });
  }

  async findByRepAndDate(salesRepId: string, date: Date): Promise<Booking[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      const result = await conn.query(
        `SELECT ${BOOKING_FIELDS} FROM Booking__c WHERE Sales_Rep__c = '${salesRepId}' ` +
          `AND Scheduled_Start__c >= ${dayStart.toISOString()} AND Scheduled_Start__c <= ${dayEnd.toISOString()} ` +
          `ORDER BY Scheduled_Start__c ASC`,
      );
      return result.records.map(bookingRecordToDomain);
    });
  }

  async save(booking: Booking): Promise<Booking> {
    return withConnection(this.connectionProvider, async (conn) => {
      const props = booking.toProps();
      const contactId = await this.resolveContactId(conn, props.customerId);
      if (!contactId) {
        throw new Error(`No Salesforce Contact found for platform customer id ${props.customerId}.`);
      }
      const record = { ...bookingToRecord(booking), Contact__c: contactId };
      const isNew = props.id === UNASSIGNED_ID;

      if (!isNew) {
        await conn.sobject("Booking__c").update({ Id: props.id, ...record });
        return booking;
      }

      const created = await conn.sobject("Booking__c").create(record);
      if (!created.success) {
        throw new Error(`Failed to create Booking__c: ${JSON.stringify((created as any).errors)}`);
      }
      return booking.withAssignedId((created as any).id);
    });
  }

  async saveCompliance(record: ComplianceRecord): Promise<void> {
    await withConnection(this.connectionProvider, async (conn) => {
      await conn.sobject("Compliance_Record__c").create(complianceToRecord(record));
    });
  }

  async saveFeedback(feedback: DriveFeedback): Promise<void> {
    await withConnection(this.connectionProvider, async (conn) => {
      await conn.sobject("Drive_Feedback__c").create(feedbackToRecord(feedback));
    });
  }

  async findFeedbackByBooking(bookingId: string): Promise<DriveFeedback | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${DRIVE_FEEDBACK_FIELDS} FROM Drive_Feedback__c WHERE Booking__c = '${bookingId}' ORDER BY CreatedDate DESC LIMIT 1`,
      );
      const record = result.records[0];
      return record ? feedbackRecordToDomain(record) : null;
    });
  }

  async findByStatusWithinWindow(status: BookingStatus, start: Date, end: Date): Promise<Booking[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${BOOKING_FIELDS} FROM Booking__c WHERE Status__c = '${status}' ` +
          `AND Scheduled_Start__c >= ${start.toISOString()} AND Scheduled_Start__c <= ${end.toISOString()} ` +
          `ORDER BY Scheduled_Start__c ASC`,
      );
      return result.records.map(bookingRecordToDomain);
    });
  }

  async findCompletedWithoutOpportunity(start: Date, end: Date): Promise<Booking[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${BOOKING_FIELDS} FROM Booking__c WHERE Status__c = 'Completed' ` +
          `AND Actual_End__c >= ${start.toISOString()} AND Actual_End__c <= ${end.toISOString()} ` +
          `AND Id NOT IN (SELECT Booking__c FROM Opportunity WHERE Booking__c != null) ` +
          `ORDER BY Actual_End__c ASC`,
      );
      return result.records.map(bookingRecordToDomain);
    });
  }

  private async resolveContactId(conn: any, platformCustomerId: string): Promise<string | null> {
    const result = await conn.query(
      `SELECT Id FROM Contact WHERE Portal_User_Id__c = '${platformCustomerId}' LIMIT 1`,
    );
    return result.records[0]?.Id ?? null;
  }
}
