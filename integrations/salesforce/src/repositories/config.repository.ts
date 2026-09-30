import {
  ConfigScope,
  FeatureFlagRepository,
  FeatureFlagSetting,
  FeatureFlagSource,
  NotificationTemplateOverrideRecord,
  NotificationTemplateRepository,
} from "@tdm/domain";
import { Connection } from "jsforce";
import { SalesforceConnectionSource } from "../connection-source";
import { escapeSoql, soqlIdList, toEighteenCharId, withConnection } from "../soql";

/** Must match TdmScopeKeys (Apex), which recomputes the same key on every save. */
const COMPANY_SCOPE = "COMPANY";
const ALL_BRANCHES = "ALL";

function normalize(scope: ConfigScope | undefined): ConfigScope {
  if (scope?.branchId && !scope.dealershipId) throw new Error("A branch-scoped setting must name its dealership.");
  return {
    dealershipId: scope?.dealershipId ? toEighteenCharId(scope.dealershipId) : undefined,
    branchId: scope?.branchId ? toEighteenCharId(scope.branchId) : undefined,
  };
}

/** Exactly one scope level: `Field = null` (wider) or `Field = 'id'`. */
function scopeEquals(field: string, id: string | undefined): string {
  return id ? `${field} = '${escapeSoql(id)}'` : `${field} = null`;
}

/** The scope and everything wider than it. */
function scopeOrWider(field: string, id: string | undefined): string {
  return id ? `(${field} = null OR ${field} = '${escapeSoql(id)}')` : `${field} = null`;
}

function assertSaved(result: any, what: string): void {
  if (!result?.success) throw new Error(`Failed to save ${what}: ${JSON.stringify(result?.errors)}`);
}

async function destroyWhere(conn: Connection, object: string, where: string): Promise<void> {
  const existing = await conn.query<{ Id: string }>(`SELECT Id FROM ${object} WHERE ${where} LIMIT 1`);
  const id = existing.records[0]?.Id;
  if (!id) return;
  const result: any = await conn.sobject(object).destroy(id);
  if (!result?.success) throw new Error(`Failed to delete ${object} ${id}: ${JSON.stringify(result?.errors)}`);
}

const SOURCE_RANK: Record<FeatureFlagSource, number> = { default: 0, company: 1, dealership: 2, branch: 3 };

/** Feature flags as Feature_Flag__c rows — sparse: a row exists only where a scope sets the flag explicitly. */
export class SalesforceFeatureFlagRepository implements FeatureFlagRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async resolve(keys: readonly string[], scope?: ConfigScope): Promise<Record<string, FeatureFlagSetting>> {
    const { dealershipId, branchId } = normalize(scope);
    const settings: Record<string, FeatureFlagSetting> = {};
    for (const key of keys) settings[key] = { enabled: false, source: "default" };
    if (keys.length === 0) return settings;

    const records = await withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query<{ Key__c: string; Enabled__c: boolean; Dealership__c: string | null; Branch__c: string | null }>(
        `SELECT Key__c, Enabled__c, Dealership__c, Branch__c FROM Feature_Flag__c ` +
          `WHERE Key__c IN ${soqlIdList(keys)} AND ${scopeOrWider("Dealership__c", dealershipId)} AND ${scopeOrWider("Branch__c", branchId)}`,
      );
      return result.records;
    });

    for (const record of records) {
      const source: FeatureFlagSource = record.Branch__c ? "branch" : record.Dealership__c ? "dealership" : "company";
      const current = settings[record.Key__c];
      if (current && SOURCE_RANK[source] > SOURCE_RANK[current.source]) {
        settings[record.Key__c] = { enabled: !!record.Enabled__c, source };
      }
    }
    return settings;
  }

  async setFlag(key: string, enabled: boolean, scope?: ConfigScope): Promise<void> {
    const { dealershipId, branchId } = normalize(scope);
    const scopeKey = [key, dealershipId ?? COMPANY_SCOPE, branchId ?? ALL_BRANCHES].join(":");
    await withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.sobject("Feature_Flag__c").upsert(
        { Scope_Key__c: scopeKey, Key__c: key, Enabled__c: enabled, Dealership__c: dealershipId ?? null, Branch__c: branchId ?? null },
        "Scope_Key__c",
      );
      assertSaved(result, `feature flag ${key}`);
    });
  }

  async clearFlag(key: string, scope?: ConfigScope): Promise<void> {
    const { dealershipId, branchId } = normalize(scope);
    await withConnection(this.connectionProvider, (conn) =>
      destroyWhere(
        conn,
        "Feature_Flag__c",
        `Key__c = '${escapeSoql(key)}' AND ${scopeEquals("Dealership__c", dealershipId)} AND ${scopeEquals("Branch__c", branchId)}`,
      ),
    );
  }
}

const TEMPLATE_FIELDS = "Key__c, Subject__c, Note__c, Dealership__c, LastModifiedDate";

function templateRecordToDomain(record: any): NotificationTemplateOverrideRecord {
  return {
    key: record.Key__c,
    subject: record.Subject__c ?? undefined,
    note: record.Note__c ?? undefined,
    dealershipId: record.Dealership__c ?? undefined,
    updatedAt: new Date(record.LastModifiedDate),
  };
}

/** Notification template overrides as Notification_Template__c rows (company-wide or per dealership). */
export class SalesforceNotificationTemplateRepository implements NotificationTemplateRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async findEffective(key: string, dealershipId?: string): Promise<NotificationTemplateOverrideRecord | null> {
    const scope = normalize({ dealershipId });
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${TEMPLATE_FIELDS} FROM Notification_Template__c ` +
          `WHERE Key__c = '${escapeSoql(key)}' AND ${scopeOrWider("Dealership__c", scope.dealershipId)}`,
      );
      // At most two rows (this dealership's, the company's) — the dealership's wins.
      const record = result.records.find((r: any) => r.Dealership__c) ?? result.records[0];
      return record ? templateRecordToDomain(record) : null;
    });
  }

  async findAtScope(dealershipId?: string): Promise<NotificationTemplateOverrideRecord[]> {
    const scope = normalize({ dealershipId });
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT ${TEMPLATE_FIELDS} FROM Notification_Template__c WHERE ${scopeEquals("Dealership__c", scope.dealershipId)} ORDER BY Key__c`,
      );
      return result.records.map(templateRecordToDomain);
    });
  }

  async upsert(key: string, patch: { subject?: string; note?: string }, dealershipId?: string): Promise<NotificationTemplateOverrideRecord> {
    const scope = normalize({ dealershipId });
    const scopeKey = [key, scope.dealershipId ?? COMPANY_SCOPE].join(":");
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.sobject("Notification_Template__c").upsert(
        {
          Scope_Key__c: scopeKey,
          Key__c: key,
          Subject__c: patch.subject ?? null,
          Note__c: patch.note ?? null,
          Dealership__c: scope.dealershipId ?? null,
        },
        "Scope_Key__c",
      );
      assertSaved(result, `notification template ${key}`);
      const saved = await conn.query(
        `SELECT ${TEMPLATE_FIELDS} FROM Notification_Template__c WHERE Scope_Key__c = '${escapeSoql(scopeKey)}' LIMIT 1`,
      );
      if (!saved.records[0]) throw new Error(`Notification template ${key} was saved but could not be read back.`);
      return templateRecordToDomain(saved.records[0]);
    });
  }

  async delete(key: string, dealershipId?: string): Promise<void> {
    const scope = normalize({ dealershipId });
    await withConnection(this.connectionProvider, (conn) =>
      destroyWhere(conn, "Notification_Template__c", `Key__c = '${escapeSoql(key)}' AND ${scopeEquals("Dealership__c", scope.dealershipId)}`),
    );
  }
}
