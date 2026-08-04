-- DropIndex
DROP INDEX IF EXISTS "StaffUser_linkedSalesRepId_key";

-- AlterTable
ALTER TABLE "StaffUser" DROP COLUMN IF EXISTS "linkedSalesRepId",
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "maxDailyBookings" INTEGER,
ADD COLUMN     "phone" TEXT;
