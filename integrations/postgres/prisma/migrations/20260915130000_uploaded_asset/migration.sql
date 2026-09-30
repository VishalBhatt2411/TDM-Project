-- CreateTable
CREATE TABLE "UploadedAsset" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "purpose" TEXT NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadedAsset_bookingId_idx" ON "UploadedAsset"("bookingId");
