import { Customer, CustomerRepository, InvalidValueError } from "@tdm/domain";
import { SalesforceConnectionSource } from "../connection-source";
import { Connection } from "jsforce";
import { contactPhoneNeedsCountryCode, contactToCustomer, customerToContactRecord } from "../mappers";
import { CONTACT_FIELDS, escapeSoql, soqlIdList, withConnection } from "../soql";
import { companyPhoneCountryCode } from "./branding.repository";

export class SalesforceCustomerRepository implements CustomerRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async findById(id: string): Promise<Customer | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${CONTACT_FIELDS} FROM Contact WHERE Portal_User_Id__c = '${escapeSoql(id)}' LIMIT 1`,
      );
      const record = result.records[0];
      return record ? toCustomer(conn, record) : null;
    });
  }

  async findByIds(ids: readonly string[]): Promise<Customer[]> {
    if (!ids.length) return [];
    return withConnection(this.connectionProvider, async (conn) => {
      // A booking references its customer by portal user id, or by Contact Id when staff booked
      // for a Contact that never registered on the portal (see bookingRecordToDomain) — match either.
      const idList = soqlIdList(ids);
      const { records } = await conn.query(
        `SELECT ${CONTACT_FIELDS} FROM Contact WHERE Portal_User_Id__c IN ${idList} OR Id IN ${idList}`,
      );
      const countryCode = records.some(contactPhoneNeedsCountryCode) ? await companyPhoneCountryCode(conn) : undefined;
      // A Contact edited directly in Salesforce can carry an email or phone the domain rejects;
      // skip it like an unknown id rather than failing every other customer in the batch.
      return records.flatMap((record: any) => {
        try {
          return [contactToCustomer({ ...record, Portal_User_Id__c: record.Portal_User_Id__c ?? record.Id }, countryCode)];
        } catch (error) {
          if (!(error instanceof InvalidValueError)) throw error;
          console.warn(JSON.stringify({ event: "customer_contact_invalid", contactId: record.Id }));
          return [];
        }
      });
    });
  }

  /**
   * Matches only Contacts actually registered as portal customers (Portal_User_Id__c
   * set) â€” a Contact can exist in Salesforce for all sorts of reasons unrelated to
   * this app (CRM data entry, lead conversion, an import) and must never be treated
   * as an existing portal account just because it happens to share an email.
   */
  async findByEmail(email: string): Promise<Customer | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${CONTACT_FIELDS} FROM Contact WHERE Email = '${escapeSoql(email.toLowerCase())}' AND Portal_User_Id__c != null LIMIT 1`,
      );
      const record = result.records[0];
      return record ? toCustomer(conn, record) : null;
    });
  }

  async save(customer: Customer): Promise<void> {
    await withConnection(this.connectionProvider, async (conn) => {
      const record = customerToContactRecord(customer);
      const existing = await conn.query(
        `SELECT Id FROM Contact WHERE Portal_User_Id__c = '${escapeSoql(customer.id)}' LIMIT 1`,
      );
      if (existing.records[0]) {
        await conn.sobject("Contact").update({ Id: (existing.records[0] as any).Id, ...record });
      } else {
        await conn.sobject("Contact").create(record);
      }
    });
  }
}

/** The company calling code is only looked up for a stored phone that lost its "+". */
async function toCustomer(conn: Connection, record: any): Promise<Customer> {
  return contactToCustomer(record, contactPhoneNeedsCountryCode(record) ? await companyPhoneCountryCode(conn) : undefined);
}
