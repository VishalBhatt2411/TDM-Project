import { SalesOpportunity, SalesOpportunityRepository } from "@tdm/domain";
import { SalesforceConnectionProvider } from "../connection";
import { opportunityRecordToDomain } from "../mappers";
import { withConnection } from "../soql";

/**
 * Implements the "if everything goes well, create a Lead and an Opportunity" flow
 * described when the schema was designed: the customer already registered (so we
 * have verified email/phone as a Contact), and a completed drive with high interest
 * should produce both a Lead (for pipeline reporting/audit) and an Opportunity
 * (the actual sales pursuit), both traceable back to the booking that generated them.
 *
 * We do not use Salesforce's native Lead-conversion API here: the customer is already
 * a qualified Contact (registration-first policy), so there is nothing to "convert" —
 * we create the Lead as a parallel interest-capture record (Portal_Contact_Id__c keeps
 * it linked to the existing Contact) and create the Opportunity directly against that
 * Contact's Account, rather than letting conversion mint a duplicate Contact/Account.
 */
export class SalesforceSalesOpportunityRepository implements SalesOpportunityRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionProvider) {}

  async save(opportunity: SalesOpportunity): Promise<SalesOpportunity> {
    return withConnection(this.connectionProvider, async (conn) => {
      const props = opportunity.toProps();

      const contact = await this.fetchContact(conn, props.customerId);
      if (!contact) {
        throw new Error(`No Salesforce Contact found for platform customer id ${props.customerId}.`);
      }
      const vehicle = await this.fetchVehicle(conn, props.vehicleId);
      const accountId = await this.ensurePersonalAccount(conn, contact);

      await conn.sobject("Lead").create({
        FirstName: contact.FirstName,
        LastName: contact.LastName,
        Company: `${contact.FirstName} ${contact.LastName} (Individual)`,
        Email: contact.Email,
        Phone: contact.Phone,
        Booking__c: props.bookingId,
        Vehicle_Interest__c: props.vehicleId,
        Portal_Contact_Id__c: contact.Id,
        Source_Channel__c: "Test Drive Platform",
      });

      const closeDate = new Date();
      closeDate.setDate(closeDate.getDate() + 30);

      const created = await conn.sobject("Opportunity").create({
        Name: vehicle ? `${vehicle.Make__c} ${vehicle.Model__c} — ${contact.FirstName} ${contact.LastName}` : `Test Drive Opportunity — ${contact.FirstName} ${contact.LastName}`,
        AccountId: accountId,
        StageName: "Prospecting",
        CloseDate: closeDate.toISOString().slice(0, 10),
        Booking__c: props.bookingId,
        Vehicle__c: props.vehicleId,
      });

      if (!created.success) {
        throw new Error(`Failed to create Opportunity: ${JSON.stringify((created as any).errors)}`);
      }
      return opportunity.withAssignedId((created as any).id);
    });
  }

  async findByBooking(bookingId: string): Promise<SalesOpportunity | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT Id, Booking__c, Vehicle__c, StageName, CreatedDate, Booking__r.Contact__r.Portal_User_Id__c ` +
          `FROM Opportunity WHERE Booking__c = '${bookingId}' LIMIT 1`,
      );
      const record = result.records[0];
      return record ? opportunityRecordToDomain(record) : null;
    });
  }

  private async fetchContact(conn: any, platformCustomerId: string): Promise<any | null> {
    const result = await conn.query(
      `SELECT Id, FirstName, LastName, Email, Phone, AccountId FROM Contact WHERE Portal_User_Id__c = '${platformCustomerId}' LIMIT 1`,
    );
    return result.records[0] ?? null;
  }

  private async fetchVehicle(conn: any, vehicleId: string): Promise<any | null> {
    const result = await conn.query(`SELECT Make__c, Model__c FROM Vehicle__c WHERE Id = '${vehicleId}' LIMIT 1`);
    return result.records[0] ?? null;
  }

  /** Opportunity requires an AccountId; this org has no Person Accounts, so we lazily create a
   *  single-contact personal Account the first time a Contact needs one. */
  private async ensurePersonalAccount(conn: any, contact: any): Promise<string> {
    if (contact.AccountId) return contact.AccountId;

    const account = await conn.sobject("Account").create({
      Name: `${contact.FirstName} ${contact.LastName}`,
    });
    if (!account.success) {
      throw new Error(`Failed to create personal Account for contact ${contact.Id}: ${JSON.stringify((account as any).errors)}`);
    }
    await conn.sobject("Contact").update({ Id: contact.Id, AccountId: (account as any).id });
    return (account as any).id;
  }
}
