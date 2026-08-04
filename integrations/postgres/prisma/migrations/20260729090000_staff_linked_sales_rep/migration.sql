-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "linkedSalesRepId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_linkedSalesRepId_key" ON "StaffUser"("linkedSalesRepId");
