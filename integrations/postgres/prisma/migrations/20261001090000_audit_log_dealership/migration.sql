-- Audit entries record the dealership they belong to, so dealer-level viewers see only theirs.
-- Existing rows stay NULL (company-wide): only unrestricted viewers see them — fail closed.
ALTER TABLE "AuditLogEntry" ADD COLUMN "dealershipId" TEXT;

CREATE INDEX "AuditLogEntry_organizationId_dealershipId_occurredAt_idx" ON "AuditLogEntry"("organizationId", "dealershipId", "occurredAt");
