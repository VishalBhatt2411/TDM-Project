-- Staff access now derives from Staff_Assignment__c in the tenant's Salesforce org; the local
-- row is identity only. Rows never linked to a Salesforce user (unaccepted invites) can't sign
-- in under the new model, so they and their tokens are removed.
DELETE FROM "StaffRefreshToken" WHERE "staffUserId" IN (SELECT "id" FROM "StaffUser" WHERE "salesforceUserId" IS NULL);
DELETE FROM "StaffUser" WHERE "salesforceUserId" IS NULL;

-- DropIndex
DROP INDEX "StaffUser_salesforceUserId_key";

-- DropIndex
DROP INDEX "StaffUser_organizationId_email_key";

-- DropIndex
DROP INDEX "StaffUser_organizationId_idx";

-- AlterTable
ALTER TABLE "StaffUser" DROP COLUMN "role",
DROP COLUMN "permissions",
DROP COLUMN "branchId",
DROP COLUMN "maxDailyBookings",
DROP COLUMN "phone",
DROP COLUMN "isActive",
ALTER COLUMN "salesforceUserId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_organizationId_salesforceUserId_key" ON "StaffUser"("organizationId", "salesforceUserId");
