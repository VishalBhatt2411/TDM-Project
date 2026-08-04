-- CreateTable
CREATE TABLE "StaffOAuthState" (
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffOAuthState_pkey" PRIMARY KEY ("state")
);
