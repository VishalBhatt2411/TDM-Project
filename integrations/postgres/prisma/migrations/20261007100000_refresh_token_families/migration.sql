-- Refresh tokens rotate in chains. A chain ("family") shares one id and one start time, so a replayed (already
-- rotated) token can end the whole chain, and a session can be capped at an absolute age however often it refreshes.
ALTER TABLE "RefreshToken" ADD COLUMN "familyId" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "sessionStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "RefreshToken" SET "familyId" = "id";
ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
