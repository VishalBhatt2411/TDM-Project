# Salesforce Adapter Rules

Salesforce is a swappable data provider, never a dependency of business logic:
- `packages/domain` must never import `jsforce` or anything Salesforce-specific. Business logic talks to repository interfaces only.
- All Salesforce-specific code lives under `integrations/salesforce`. A controller/service outside it may depend on a repository *interface* (from `@tdm/domain`) and DI tokens (`apps/api/src/infrastructure/tokens.ts`) — never on a concrete `Salesforce*Repository` class or `jsforce` type directly.
- `apps/api/src/infrastructure/infrastructure.module.ts` is the only module allowed to construct Salesforce adapter classes. Every other module injects against a token.

Connections are per-tenant, not global:
- Each client organization connects its own Salesforce org via its own Connected App (see `apps/api/src/onboarding`) — there is no shared "integration user" across tenants.
- Secrets (Consumer Secret, refresh token) are encrypted at rest per `security.md` and only ever decrypted inside `integrations/salesforce`/`integrations/postgres` adapter code, never in a controller.
- `SalesforceIdentityProvider` must be constructed per-tenant (per-request), not as a module-level singleton, wherever it's used against more than one org's Connected App.

Metadata deploys:
- The TDM package (`integrations/salesforce/mdapi`) must never include a `ConnectedApp` member in `package.xml` — each tenant hand-creates their own (many orgs block Connected App creation via the Metadata API entirely), and deploying one here would conflict with it.
- A metadata deploy failure is not necessarily a bug in this package — production orgs require ≥75% Apex code coverage org-wide to accept any deploy. Surface `componentFailures` verbatim (see `metadata-deploy.ts`) rather than collapsing them into a generic error.

OAuth:
- Staff "Login with Salesforce" (`SalesforceIdentityProvider.exchangeCodeForIdentity`) and the onboarding wizard's connection handshake (`exchangeCodeForConnection`) are separate concerns — identity verification vs. persisting a reusable business-data connection. Don't merge them; a login shouldn't require `refresh_token` scope, and a connection handshake needs it.
- Every app code path gets its Salesforce connection from `TenantSalesforceConnectionProvider`, keyed by the current `TenantContext`. The old CLI-backed `SalesforceConnectionProvider` (`sf org display`) was removed — never reintroduce a shared or CLI-derived connection; `sf` CLI use is limited to standalone dev seed scripts.
