import { Customer, CustomerRepository } from "@tdm/domain";
import { SalesforceConnectionProvider } from "../connection";
import { contactToCustomer, customerToContactRecord } from "../mappers";
import { CONTACT_FIELDS, withConnection } from "../soql";

export class SalesforceCustomerRepository implements CustomerRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionProvider) {}

  async findById(id: string): Promise<Customer | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${CONTACT_FIELDS} FROM Contact WHERE Portal_User_Id__c = '${escapeSoql(id)}' LIMIT 1`,
      );
      const record = result.records[0];
      return record ? contactToCustomer(record) : null;
    });
  }

  async findByEmail(email: string): Promise<Customer | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${CONTACT_FIELDS} FROM Contact WHERE Email = '${escapeSoql(email.toLowerCase())}' LIMIT 1`,
      );
      const record = result.records[0];
      return record ? contactToCustomer(record) : null;
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

function escapeSoql(value: string): string {
  return value.replace(/'/g, "\\'");
}
