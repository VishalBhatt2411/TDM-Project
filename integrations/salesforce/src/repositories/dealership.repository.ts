import { Dealership, DealershipRepository } from "@tdm/domain";
import { SalesforceConnectionSource } from "../connection-source";
import { dealershipRecordToDomain } from "../mappers";
import { DEALERSHIP_FIELDS, escapeSoql, withConnection } from "../soql";

/** A company runs tens of dealerships, not thousands — the cap only guards against a runaway org. */
const MAX_DEALERSHIPS = 2000;

export class SalesforceDealershipRepository implements DealershipRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async findAll(): Promise<Dealership[]> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(`SELECT ${DEALERSHIP_FIELDS} FROM Dealership__c ORDER BY Name LIMIT ${MAX_DEALERSHIPS}`);
      return result.records.map(dealershipRecordToDomain);
    });
  }

  async findById(id: string): Promise<Dealership | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(`SELECT ${DEALERSHIP_FIELDS} FROM Dealership__c WHERE Id = '${escapeSoql(id)}' LIMIT 1`);
      const record = result.records[0];
      return record ? dealershipRecordToDomain(record) : null;
    });
  }
}
