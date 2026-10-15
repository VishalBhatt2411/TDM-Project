-- Public sign-up used to create a live tenant host instantly. A company now has to prove it controls the contact
-- email first; unverified organizations are not served and are deleted after a week (see ExpiredRowsRepository).
ALTER TABLE "Organization" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "emailVerificationTokenHash" TEXT;
ALTER TABLE "Organization" ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3);
-- Every organization that exists today predates verification and stays live.
UPDATE "Organization" SET "emailVerifiedAt" = "createdAt";
