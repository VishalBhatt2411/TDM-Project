-- AlterTable
ALTER TABLE "AuthCredential" ADD COLUMN     "isTemporary" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: anyone who has ever successfully consumed a password-setup/reset token has,
-- by definition, chosen a real password — mark them as not temporary. Everyone else stays
-- at the safe default (true) since we can't retroactively prove otherwise.
UPDATE "AuthCredential"
SET "isTemporary" = false
WHERE "customerId" IN (
  SELECT DISTINCT "customerId" FROM "CustomerPasswordToken" WHERE "consumedAt" IS NOT NULL
);
