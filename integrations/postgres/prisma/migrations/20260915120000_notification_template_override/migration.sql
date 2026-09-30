-- CreateTable
CREATE TABLE "NotificationTemplateOverride" (
    "key" TEXT NOT NULL,
    "subject" TEXT,
    "note" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplateOverride_pkey" PRIMARY KEY ("key")
);
