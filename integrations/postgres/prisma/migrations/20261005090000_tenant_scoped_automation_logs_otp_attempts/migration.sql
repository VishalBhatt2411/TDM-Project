-- Reminder/follow-up de-duplication was keyed by bookingId alone. A booking id is a Salesforce record Id,
-- unique only within one org, so two tenants could share a key and one would silently never be reminded.
-- Rows are backfilled to the sole tenant when unambiguous; otherwise they're dropped (they are only
-- "already sent" markers, so the worst case is one repeated reminder inside its time window).
ALTER TABLE "ReminderLog" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "FollowUpLog" ADD COLUMN "organizationId" TEXT;

UPDATE "ReminderLog" SET "organizationId" = (SELECT "id" FROM "Organization" LIMIT 1)
  WHERE (SELECT COUNT(*) FROM "Organization") = 1;
UPDATE "FollowUpLog" SET "organizationId" = (SELECT "id" FROM "Organization" LIMIT 1)
  WHERE (SELECT COUNT(*) FROM "Organization") = 1;
DELETE FROM "ReminderLog" WHERE "organizationId" IS NULL;
DELETE FROM "FollowUpLog" WHERE "organizationId" IS NULL;

ALTER TABLE "ReminderLog" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "FollowUpLog" ALTER COLUMN "organizationId" SET NOT NULL;

DROP INDEX "ReminderLog_bookingId_reminderType_key";
DROP INDEX "FollowUpLog_bookingId_intervalDays_key";
CREATE UNIQUE INDEX "ReminderLog_organizationId_bookingId_reminderType_key" ON "ReminderLog"("organizationId", "bookingId", "reminderType");
CREATE UNIQUE INDEX "FollowUpLog_organizationId_bookingId_intervalDays_key" ON "FollowUpLog"("organizationId", "bookingId", "intervalDays");

ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpLog" ADD CONSTRAINT "FollowUpLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Customer OTP: count wrong guesses per code so it can be locked.
ALTER TABLE "OtpCode" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
