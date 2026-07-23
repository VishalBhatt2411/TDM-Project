-- CreateTable
CREATE TABLE "DealershipConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "logoText" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "operatingHours" TEXT,
    "primaryColorHex" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealershipConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLoginToken" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_bookingId_reminderType_key" ON "ReminderLog"("bookingId", "reminderType");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpLog_bookingId_intervalDays_key" ON "FollowUpLog"("bookingId", "intervalDays");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLoginToken_tokenHash_key" ON "MagicLoginToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLoginToken_customerId_idx" ON "MagicLoginToken"("customerId");
