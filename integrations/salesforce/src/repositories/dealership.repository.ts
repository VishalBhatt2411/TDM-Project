import { Dealership, DealershipRepository, InvalidValueError, NotFoundError } from "@tdm/domain";
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

  async setCustomDomain(id: string, hostname: string | null): Promise<void> {
    await withConnection(this.connectionProvider, async (conn) => {
      // A rejected save arrives as a failed SaveResult or, depending on the API path, a thrown error.
      const result: any = await conn
        .sobject("Dealership__c")
        .update({ Id: id, Custom_Domain__c: hostname })
        .catch((err: any) => ({ success: false, errors: [{ statusCode: err?.errorCode, message: err?.message }] }));
      if (result?.success) return;
      const errors: { statusCode?: string; message?: string }[] = result?.errors ?? [];
      if (errors.some((e) => e.statusCode === "ENTITY_IS_DELETED" || e.statusCode === "INVALID_CROSS_REFERENCE_KEY")) {
        throw new NotFoundError("Dealership", id);
      }
      if (errors.some((e) => e.statusCode === "DUPLICATE_VALUE")) {
        throw new InvalidValueError("Another dealership already uses this domain.");
      }
      const rule = errors.find((e) => e.statusCode === "FIELD_CUSTOM_VALIDATION_EXCEPTION");
      if (rule?.message) throw new InvalidValueError(rule.message);
      throw new Error(`Failed to update Dealership__c ${id}: ${JSON.stringify(errors)}`);
    });
  }
}
