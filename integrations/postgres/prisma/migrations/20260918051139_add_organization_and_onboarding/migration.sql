-- AlterTable
ALTER TABLE "StaffOAuthState" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sfConsumerKey" TEXT,
    "sfConsumerSecretEnc" TEXT,
    "sfRefreshTokenEnc" TEXT,
    "sfInstanceUrl" TEXT,
    "sfLoginUrl" TEXT NOT NULL DEFAULT 'https://login.salesforce.com',
    "sfOrgId" TEXT,
    "connectionStatus" TEXT NOT NULL DEFAULT 'pending',
    "connectionError" TEXT,
    "metadataDeployedAt" TIMESTAMP(3),
    "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "StaffOAuthState_organizationId_idx" ON "StaffOAuthState"("organizationId");

-- CreateIndex
CREATE INDEX "StaffUser_organizationId_idx" ON "StaffUser"("organizationId");

-- AddForeignKey
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffOAuthState" ADD CONSTRAINT "StaffOAuthState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
