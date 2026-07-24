-- AlterTable
ALTER TABLE "StaffUser" DROP COLUMN "passwordHash",
ADD COLUMN     "salesforceUserId" TEXT;

-- DropTable
DROP TABLE "StaffPasswordToken";

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_salesforceUserId_key" ON "StaffUser"("salesforceUserId");

