import {
  BrandAssetInfo,
  BrandAssetKind,
  BrandAssetRepository,
  BrandLayer,
  BrandingRepository,
  DataProviderOutdatedError,
  EMPTY_BRAND_LAYER,
  SiteContent,
  parseSiteContent,
} from "@tdm/domain";
import { Connection } from "jsforce";
import { SalesforceConnectionSource } from "../connection-source";
import { brandingFromRecord, brandingToRecord } from "../mappers";
import { BRANDING_FIELDS, escapeSoql, toEighteenCharId, withConnection } from "../soql";
import { isContentDocumentId, CONTENT_TYPE_BY_EXTENSION, EXTENSION_BY_CONTENT_TYPE, readAll } from "../files";

/** Must match Company_Profile__c's Singleton_Key_Value validation rule. */
const COMPANY_SINGLETON_KEY = "COMPANY";
const FEATURE = "site branding";

/** A tenant whose TDM package predates Company_Profile__c / Site_Content__c until it redeploys. */
function isMissingMetadata(err: any): boolean {
  return err?.errorCode === "INVALID_TYPE" || err?.errorCode === "INVALID_FIELD" || err?.errorCode === "NOT_FOUND";
}

function warn(event: string, fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify({ event, ...fields }));
}

/** Stored JSON is editable straight in Salesforce, so a malformed value is skipped rather than breaking the customer site. */
function siteContentFromRecord(record: any, object: string): SiteContent {
  const raw = record.Site_Content__c;
  if (!raw) return {};
  try {
    return parseSiteContent(JSON.parse(raw));
  } catch (err) {
    warn("site_content_invalid", { object, recordId: record.Id, reason: err instanceof Error ? err.message : String(err) });
    return {};
  }
}

function layerToRecord(layer: BrandLayer): Record<string, unknown> {
  const hasContent = Object.keys(layer.content).length > 0;
  return { ...brandingToRecord(layer.branding), Site_Content__c: hasContent ? JSON.stringify(layer.content) : null };
}

function assertSaved(result: any, what: string): void {
  if (!result?.success) throw new Error(`Failed to save ${what}: ${JSON.stringify(result?.errors)}`);
}

async function findCompanyProfile(conn: Connection): Promise<any | null> {
  const result = await conn.query(
    `SELECT Id, ${BRANDING_FIELDS}, Site_Content__c FROM Company_Profile__c WHERE Singleton_Key__c = '${COMPANY_SINGLETON_KEY}' LIMIT 1`,
  );
  return result.records[0] ?? null;
}

/** The singleton's id, creating an empty profile on first use. */
async function ensureCompanyProfileId(conn: Connection): Promise<string> {
  const existing = await findCompanyProfile(conn);
  if (existing) return existing.Id;
  const created: any = await conn.sobject("Company_Profile__c").create({ Singleton_Key__c: COMPANY_SINGLETON_KEY });
  assertSaved(created, "Company_Profile__c");
  return created.id;
}

/**
 * Brand layers on Dealership__c (per dealership) and the Company_Profile__c singleton
 * (company-wide). Both carry the same branding fields plus Site_Content__c JSON.
 */
export class SalesforceBrandingRepository implements BrandingRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async findLayer(dealershipId?: string): Promise<BrandLayer | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      if (!dealershipId) {
        try {
          const record = await findCompanyProfile(conn);
          return record ? { branding: brandingFromRecord(record), content: siteContentFromRecord(record, "Company_Profile__c") } : EMPTY_BRAND_LAYER;
        } catch (err) {
          if (!isMissingMetadata(err)) throw err;
          warn("branding_metadata_missing", { object: "Company_Profile__c" });
          return EMPTY_BRAND_LAYER;
        }
      }
      const where = `WHERE Id = '${escapeSoql(dealershipId)}' LIMIT 1`;
      let record: any;
      try {
        record = (await conn.query(`SELECT Id, ${BRANDING_FIELDS}, Site_Content__c FROM Dealership__c ${where}`)).records[0];
      } catch (err) {
        if (!isMissingMetadata(err)) throw err;
        warn("branding_metadata_missing", { object: "Dealership__c", field: "Site_Content__c" });
        record = (await conn.query(`SELECT Id, ${BRANDING_FIELDS} FROM Dealership__c ${where}`)).records[0];
      }
      return record ? { branding: brandingFromRecord(record), content: siteContentFromRecord(record, "Dealership__c") } : null;
    });
  }

  async saveLayer(layer: BrandLayer, dealershipId?: string): Promise<void> {
    await withConnection(this.connectionProvider, async (conn) => {
      try {
        const id = dealershipId ?? (await ensureCompanyProfileId(conn));
        const object = dealershipId ? "Dealership__c" : "Company_Profile__c";
        const result = await conn.sobject(object).update({ Id: id, ...layerToRecord(layer) });
        assertSaved(result, `${object} ${id}`);
      } catch (err) {
        if (isMissingMetadata(err)) throw new DataProviderOutdatedError(FEATURE);
        throw err;
      }
    });
  }
}

const TITLE_PREFIX = "tdm_brand_";
const KINDS: readonly BrandAssetKind[] = ["logo", "hero"];

/**
 * Brand images as Salesforce Files published to the Dealership__c (or Company_Profile__c) they
 * brand. Only a file with a brand title and an image extension, published to one of those two
 * objects, counts as a brand asset — so the public image route can never expose any other file
 * in the org (compliance images, attachments, …). The asset id is the ContentDocument id.
 */
export class SalesforceBrandAssetRepository implements BrandAssetRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async save(input: { kind: BrandAssetKind; contentType: string; data: Buffer; dealershipId?: string }): Promise<{ id: string }> {
    const extension = EXTENSION_BY_CONTENT_TYPE[input.contentType];
    if (!extension) throw new Error(`Unsupported brand asset content type ${input.contentType}.`);
    return withConnection(this.connectionProvider, async (conn) => {
      let parentId: string;
      try {
        parentId = input.dealershipId ?? (await ensureCompanyProfileId(conn));
      } catch (err) {
        if (isMissingMetadata(err)) throw new DataProviderOutdatedError(FEATURE);
        throw err;
      }
      const title = `${TITLE_PREFIX}${input.kind}`;
      const created: any = await conn.sobject("ContentVersion").create({
        Title: title,
        PathOnClient: `${title}.${extension}`,
        VersionData: input.data.toString("base64"),
        FirstPublishLocationId: parentId,
      });
      assertSaved(created, "ContentVersion");
      const version = await conn.query<{ ContentDocumentId: string }>(
        `SELECT ContentDocumentId FROM ContentVersion WHERE Id = '${escapeSoql(created.id)}' LIMIT 1`,
      );
      const documentId = version.records[0]?.ContentDocumentId;
      if (!documentId) throw new Error(`ContentVersion ${created.id} has no ContentDocument.`);
      return { id: documentId };
    });
  }

  async describe(id: string): Promise<BrandAssetInfo | null> {
    return withConnection(this.connectionProvider, async (conn) => (await this.locate(conn, id))?.info ?? null);
  }

  async read(id: string): Promise<(BrandAssetInfo & { data: Buffer }) | null> {
    return withConnection(this.connectionProvider, async (conn) => {
      const found = await this.locate(conn, id);
      if (!found) return null;
      const data = await readAll(conn.sobject("ContentVersion").record(found.versionId).blob("VersionData"));
      return { ...found.info, data };
    });
  }

  async deleteMany(ids: string[]): Promise<void> {
    await withConnection(this.connectionProvider, async (conn) => {
      const brandIds: string[] = [];
      for (const id of new Set(ids)) if (await this.locate(conn, id)) brandIds.push(id);
      if (brandIds.length === 0) return;
      const results = await conn.sobject("ContentDocument").destroy(brandIds);
      const failures = results.filter((r: any) => !r.success);
      if (failures.length > 0) throw new Error(`Failed to delete ContentDocument(s): ${JSON.stringify(failures.map((r: any) => r.errors))}`);
    });
  }

  private async locate(conn: Connection, id: string): Promise<{ info: BrandAssetInfo; versionId: string } | null> {
    if (!isContentDocumentId(id)) return null;
    const result = await conn.query(
      `SELECT Id, Title, FileExtension, FirstPublishLocationId FROM ContentVersion WHERE ContentDocumentId = '${escapeSoql(id)}' AND IsLatest = true LIMIT 1`,
    );
    const version = result.records[0] as any;
    const kind = KINDS.find((k) => `${TITLE_PREFIX}${k}` === version?.Title);
    const contentType = version ? CONTENT_TYPE_BY_EXTENSION[String(version.FileExtension ?? "").toLowerCase()] : undefined;
    const parentId: string | undefined = version?.FirstPublishLocationId;
    if (!kind || !contentType || !parentId) return null;

    const documentId = toEighteenCharId(id);
    const dealership = await conn.query(`SELECT Id FROM Dealership__c WHERE Id = '${escapeSoql(parentId)}' LIMIT 1`);
    if (dealership.records[0]) {
      return { info: { id: documentId, kind, contentType, dealershipId: dealership.records[0].Id }, versionId: version.Id };
    }
    try {
      const company = await conn.query(`SELECT Id FROM Company_Profile__c WHERE Id = '${escapeSoql(parentId)}' LIMIT 1`);
      return company.records[0] ? { info: { id: documentId, kind, contentType }, versionId: version.Id } : null;
    } catch (err) {
      if (isMissingMetadata(err)) return null;
      throw err;
    }
  }
}
