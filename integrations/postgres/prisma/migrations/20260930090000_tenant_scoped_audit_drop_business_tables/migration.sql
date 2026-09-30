-- Phase 5: business configuration now lives in the tenant's data provider (Dealership__c branding,
-- Feature_Flag__c, Notification_Template__c, Salesforce Files) — Postgres keeps security/ops records only.
DROP TABLE "DealershipConfig";
DROP TABLE "FeatureFlag";
DROP TABLE "NotificationTemplateOverride";
DROP TABLE "UploadedAsset";

-- The audit log becomes tenant-scoped. Pre-existing rows carry no tenant: they are attributed only
-- when exactly one organization exists (unambiguous). Otherwise SET NOT NULL below fails and the
-- migration stops, so no audit history is ever silently reassigned or discarded.
ALTER TABLE "AuditLogEntry" ADD COLUMN "organizationId" TEXT;
UPDATE "AuditLogEntry" SET "organizationId" = (SELECT "id" FROM "Organization")
  WHERE "organizationId" IS NULL AND (SELECT COUNT(*) FROM "Organization") = 1;
ALTER TABLE "AuditLogEntry" ALTER COLUMN "organizationId" SET NOT NULL;

DROP INDEX "AuditLogEntry_actorId_idx";
DROP INDEX "AuditLogEntry_entityType_entityId_idx";
CREATE INDEX "AuditLogEntry_organizationId_occurredAt_idx" ON "AuditLogEntry"("organizationId", "occurredAt");
CREATE INDEX "AuditLogEntry_organizationId_entityType_entityId_idx" ON "AuditLogEntry"("organizationId", "entityType", "entityId");
CREATE INDEX "AuditLogEntry_organizationId_actorId_idx" ON "AuditLogEntry"("organizationId", "actorId");

ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
