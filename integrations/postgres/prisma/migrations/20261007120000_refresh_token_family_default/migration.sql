-- Expand/contract safety for 20261007100000_refresh_token_families: that migration made "familyId" NOT NULL, but a
-- deployment applies migrations at build time while the previous release still serves traffic (and a rollback runs it
-- again afterwards). Without a default, the previous release's RefreshToken inserts - which know nothing of families -
-- fail with a NOT NULL violation, i.e. nobody can sign in. A token inserted without a family simply starts its own.
ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET DEFAULT (gen_random_uuid())::text;
