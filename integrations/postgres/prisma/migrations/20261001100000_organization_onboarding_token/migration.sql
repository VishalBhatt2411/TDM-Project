-- The onboarding wizard's public endpoints require the setup token issued at creation.
-- Existing organizations have none, so their wizard endpoints are closed (fail closed).
ALTER TABLE "Organization" ADD COLUMN "onboardingTokenHash" TEXT;
