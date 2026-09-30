import { AssetPurpose, AssetRepository, StoredAsset } from "@tdm/domain";
import { SalesforceConnectionSource } from "../connection-source";
import { escapeSoql, withConnection } from "../soql";
import { isContentDocumentId, CONTENT_TYPE_BY_EXTENSION, EXTENSION_BY_CONTENT_TYPE, readAll } from "../files";

const PURPOSES: readonly AssetPurpose[] = ["license_photo", "signature"];

/**
 * Compliance images as Salesforce Files: each is a ContentVersion published to the booking's
 * Compliance_Record__c (not the Booking__c, so users who can see a booking but not its
 * compliance record — e.g. sales reps — can't open a customer's license). The asset id is the
 * ContentDocument id, which stays stable across versions and is what deletion targets.
 */
export class SalesforceAssetRepository implements AssetRepository {
  constructor(private readonly connectionProvider: SalesforceConnectionSource) {}

  async save(input: { contentType: string; data: Buffer; purpose: AssetPurpose; bookingId?: string }): Promise<{ id: string }> {
    const { bookingId } = input;
    if (!bookingId) throw new Error("A Salesforce File asset must belong to a booking.");
    const extension = EXTENSION_BY_CONTENT_TYPE[input.contentType];
    if (!extension) throw new Error(`Unsupported asset content type ${input.contentType}.`);

    return withConnection(this.connectionProvider, async (conn) => {
      const parent = await conn.query<{ Id: string }>(
        `SELECT Id FROM Compliance_Record__c WHERE Booking__c = '${escapeSoql(bookingId)}' LIMIT 1`,
      );
      const parentId = parent.records[0]?.Id;
      if (!parentId) throw new Error(`No Compliance_Record__c exists for booking ${bookingId}; save it before its assets.`);

      const created = await conn.sobject("ContentVersion").create({
        Title: input.purpose,
        PathOnClient: `${input.purpose}.${extension}`,
        VersionData: input.data.toString("base64"),
        FirstPublishLocationId: parentId,
      });
      if (!(created as any).success) {
        throw new Error(`Failed to create ContentVersion for booking ${bookingId}: ${JSON.stringify((created as any).errors)}`);
      }
      const version = await conn.query<{ ContentDocumentId: string }>(
        `SELECT ContentDocumentId FROM ContentVersion WHERE Id = '${escapeSoql((created as any).id)}' LIMIT 1`,
      );
      const documentId = version.records[0]?.ContentDocumentId;
      if (!documentId) throw new Error(`ContentVersion ${(created as any).id} has no ContentDocument.`);
      return { id: documentId };
    });
  }

  async findById(id: string): Promise<StoredAsset | null> {
    if (!isContentDocumentId(id)) return null;
    return withConnection(this.connectionProvider, async (conn) => {
      const result = await conn.query(
        `SELECT Id, Title, FileExtension, FirstPublishLocationId FROM ContentVersion WHERE ContentDocumentId = '${escapeSoql(id)}' AND IsLatest = true LIMIT 1`,
      );
      const version = result.records[0] as any;
      const contentType = version ? CONTENT_TYPE_BY_EXTENSION[String(version.FileExtension ?? "").toLowerCase()] : undefined;
      const purpose = PURPOSES.find((p) => p === version?.Title);
      if (!version?.FirstPublishLocationId || !contentType || !purpose) return null;

      // Only files published to a compliance record are assets — every other file in the org stays invisible here.
      const parent = await conn.query<{ Booking__c: string }>(
        `SELECT Booking__c FROM Compliance_Record__c WHERE Id = '${escapeSoql(version.FirstPublishLocationId)}' LIMIT 1`,
      );
      const bookingId = parent.records[0]?.Booking__c;
      if (!bookingId) return null;

      const data = await readAll(conn.sobject("ContentVersion").record(version.Id).blob("VersionData"));
      return { id, contentType, data, purpose, bookingId };
    });
  }

  async deleteMany(ids: string[]): Promise<void> {
    // Ids from another storage backend (e.g. pre-migration UUIDs) aren't files here — nothing to delete.
    const documentIds = ids.filter((id) => isContentDocumentId(id));
    if (documentIds.length === 0) return;
    await withConnection(this.connectionProvider, async (conn) => {
      const results = await conn.sobject("ContentDocument").destroy(documentIds);
      const failures = results.filter((r: any) => !r.success);
      if (failures.length > 0) {
        throw new Error(`Failed to delete ContentDocument(s): ${JSON.stringify(failures.map((r: any) => r.errors))}`);
      }
    });
  }
}
