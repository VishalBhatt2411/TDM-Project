-- CreateTable
CREATE TABLE "CustomerPasswordToken" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPasswordToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPasswordToken_tokenHash_key" ON "CustomerPasswordToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerPasswordToken_customerId_idx" ON "CustomerPasswordToken"("customerId");
