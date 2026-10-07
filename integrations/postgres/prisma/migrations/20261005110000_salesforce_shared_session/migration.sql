-- Serverless instances share no memory, so each one used to mint its own Salesforce access token — and with
-- refresh-token rotation every mint rotates the refresh token and logs the other instances' sessions out
-- (INVALID_SESSION_ID). The current session is now stored (encrypted) so every instance reuses it.
ALTER TABLE "Organization" ADD COLUMN "sfSessionEnc" TEXT;
ALTER TABLE "Organization" ADD COLUMN "sfSessionExpiresAt" TIMESTAMP(3);
