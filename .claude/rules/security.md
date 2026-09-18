# Security Standards

Secrets at rest:
- Anything reversible (a Salesforce refresh token, a Connected App consumer secret) must be encrypted at rest — see `integrations/postgres/src/crypto.ts` (AES-256-GCM). Never store it plaintext, even temporarily.
- Anything that only needs comparison (passwords, OTPs) stays one-way hashed — see `integrations/postgres/src/hash.ts`. Never "upgrade" a hash to encryption just to make it reversible.
- Never log a decrypted secret, access token, refresh token, or password — not even at debug level. Log identifiers (`organizationId`, `staffUserId`) and event names instead, matching the existing `JSON.stringify({ event: ..., ... })` logging convention.
- Master encryption/signing keys (`ENCRYPTION_KEY`, `JWT_SECRET`) come from environment variables, never hardcoded, never committed.

Multi-tenant isolation:
- A query or mutation that can return/affect more than one tenant's rows must filter by `organizationId` explicitly — never rely on a join or a default scope to enforce this implicitly.
- A uniqueness constraint that's supposed to be per-tenant (e.g. a future tenant-scoped staff email) must be a composite unique (`[organizationId, field]`), not a bare `@unique` — a global unique constraint on a per-tenant field is a cross-tenant collision risk, not just a UX bug.
- Fail closed: if tenant context can't be resolved, reject the request rather than falling back to a default tenant.

Auth:
- OAuth2 state must be single-use and server-validated (see `StaffOAuthStateRepository` / `StaffOAuthState`) — never trust a `state`/`code` pair without consuming it exactly once.
- PKCE code verifiers never leave the server (kept in `StaffOAuthState`, not round-tripped through the browser).
- JWT payloads stay minimal — never embed permissions or other fast-changing authorization data in a token; re-read it from the database at authorization time (see `PermissionGuard`, `AdminAuthService.getProfile`).

General:
- Salesforce is an implementation detail (see `salesforce-adapter.md`) — a security fix belongs in the adapter layer, never bypassed from `packages/domain` or a controller.
- Validate and whitelist all DTOs (`class-validator` + `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, already global in `main.ts`) — do not add a new endpoint that skips this.
