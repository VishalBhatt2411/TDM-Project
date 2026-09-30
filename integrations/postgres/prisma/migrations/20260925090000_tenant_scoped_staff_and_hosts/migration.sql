-- Legacy pre-tenant staff are deleted and re-onboarded through the wizard (agreed rollout
-- decision) — a staff account with no tenant can't be scoped to any Salesforce org.
DELETE FROM "StaffRefreshToken" WHERE "staffUserId" IN (SELECT "id" FROM "StaffUser" WHERE "organizationId" IS NULL);
DELETE FROM "StaffUser" WHERE "organizationId" IS NULL;

-- Pending OAuth handshakes are short-lived (minutes); dropping in-flight ones only means a
-- user mid-login has to click "Login with Salesforce" again.
DELETE FROM "StaffOAuthState";

-- DropForeignKey
ALTER TABLE "StaffUser" DROP CONSTRAINT "StaffUser_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "StaffOAuthState" DROP CONSTRAINT "StaffOAuthState_organizationId_fkey";

-- DropIndex
DROP INDEX "StaffUser_email_key";

-- AlterTable
ALTER TABLE "StaffUser" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "StaffOAuthState" ADD COLUMN     "purpose" TEXT NOT NULL,
ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateTable
CREATE TABLE "TenantHost" (
    "hostname" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dealershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantHost_pkey" PRIMARY KEY ("hostname")
);

-- CreateTable
CREATE TABLE "TenantSubdomain" (
    "label" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dealershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubdomain_pkey" PRIMARY KEY ("label")
);

-- CreateIndex
CREATE INDEX "TenantSubdomain_organizationId_idx" ON "TenantSubdomain"("organizationId");

-- Every existing company keeps its platform subdomain: its slug becomes its company label.
INSERT INTO "TenantSubdomain" ("label", "organizationId", "dealershipId", "updatedAt")
SELECT "slug", "id", NULL, CURRENT_TIMESTAMP FROM "Organization";

-- CreateIndex
CREATE INDEX "TenantHost_organizationId_idx" ON "TenantHost"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_organizationId_email_key" ON "StaffUser"("organizationId", "email");

-- AddForeignKey
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffOAuthState" ADD CONSTRAINT "StaffOAuthState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantHost" ADD CONSTRAINT "TenantHost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubdomain" ADD CONSTRAINT "TenantSubdomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
