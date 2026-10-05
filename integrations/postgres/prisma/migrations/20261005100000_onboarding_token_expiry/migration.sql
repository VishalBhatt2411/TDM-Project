-- A setup token used to stay valid forever, so a leaked one could keep reading or reconfiguring a
-- tenant's onboarding long after setup. Tokens now expire; any token already issued gets a fresh 7 days.
ALTER TABLE "Organization" ADD COLUMN "onboardingTokenExpiresAt" TIMESTAMP(3);
UPDATE "Organization" SET "onboardingTokenExpiresAt" = NOW() + INTERVAL '7 days' WHERE "onboardingTokenHash" IS NOT NULL;
