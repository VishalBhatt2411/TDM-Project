# Overview & Setup Guide

## What this application is

The Test Drive Management (TDM) Platform is an enterprise web app that lets a car dealership's customers browse a vehicle catalog and book a test drive — either at the dealership or via home pickup — without creating a separate account up front. Staff get a companion Admin Console to manage bookings and reps, and a Salesforce Lightning dashboard gives sales managers live KPIs.

Customer-facing flow: browse vehicles → pick a vehicle/variant → choose a slot and drive type → submit contact details. A first-time visitor is transparently registered (no password) and gets a magic sign-in link by email to manage bookings later; a returning customer (matched by email) has their booking added to their existing record, with any changed name/phone synced back.

## How it works (architecture)

- **Hexagonal/Clean Architecture**: business logic (`packages/domain`) has zero knowledge of Salesforce, Postgres, or HTTP. Everything talks through repository interfaces; concrete data adapters live in `integrations/`.
- **Salesforce is a data provider, not a dependency** — it's used as the system of record for business entities (Contact/Customer, Vehicle, Branch, Booking, Sales Rep, Drive Feedback, etc.) but is reachable only through `integrations/salesforce`. Swapping it for another database only means writing a new adapter behind the same interfaces.
- **Postgres** holds only what Salesforce shouldn't: authentication credentials/OTPs for customers, and a separate staff/RBAC identity space for the Admin Console — both via Prisma. Staff (Admin/Manager/Sales Rep) authenticate with their **real Salesforce identity** via OAuth2 ("Login with Salesforce") — Postgres only stores who's provisioned and what they're allowed to do (role/permissions), never a password.
- **API-first**: the NestJS backend exposes a versioned REST API (`/api/v1/...`) with Swagger docs, validated DTOs, and centralized domain-error-to-HTTP-status mapping.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, React Router, React Query, React Hook Form + Zod, Framer Motion, Recharts |
| Backend API | NestJS 10 (Express), TypeScript, class-validator/class-transformer, Swagger |
| Domain layer | Plain TypeScript (framework-agnostic), packaged as `@tdm/domain` |
| Data — business records | Salesforce (Contact, custom objects: `Vehicle__c`, `Branch__c`, `Booking__c`, `Sales_Rep__c`, `Drive_Feedback__c`, etc.), accessed via `jsforce` |
| Data — auth/staff | PostgreSQL via Prisma (`@tdm/postgres-adapter`) |
| Sales dashboard | Salesforce Lightning Web Components + Apex (`integrations/salesforce/mdapi`) |
| Monorepo tooling | npm workspaces, TypeScript project references |

Repo layout:
```
apps/api          NestJS backend
apps/web           React frontend
packages/domain    Framework-agnostic entities, value objects, domain errors
packages/types     Shared DTOs between frontend and backend
packages/utils     Shared utilities
integrations/salesforce   Salesforce adapter (jsforce) + org metadata (mdapi)
integrations/postgres     Prisma schema/client for auth + staff identity
infrastructure/docker-compose.yml   Local Postgres container
```

## Prerequisites

- **Node.js 20+** and npm (npm workspaces are used — no yarn/pnpm).
- **Docker** (or a local PostgreSQL 16 instance) — used for the auth/staff database.
- **A Salesforce org** (a free Developer Edition org works) and permission to create a Connected App in it. Each company connects its own org through the onboarding wizard; the API stores that org's Connected App credentials and refresh token encrypted and never uses a shared or CLI-derived session. The `sf` CLI is only needed for the standalone dev seed scripts.
- An email-sending capability if you want transactional emails (confirmation, magic link, OTP) to actually deliver — check `apps/api/src/notifications` / `apps/api/src/auth/otp-sender.ts` for the provider used in this environment.
- A **Salesforce Connected App** per client org (OAuth2 Authorization Code + PKCE) — used both for staff "Login with Salesforce" and for the onboarding wizard's business-data connection. Most orgs block creating Connected Apps via the Metadata API, and the TDM package (`integrations/salesforce/mdapi`) deliberately never contains one, so each tenant creates it by hand: Setup → App Manager → New Connected App, with:
  - **Enable OAuth Settings:** on; **Require PKCE:** on; **Require Secret for Web Server Flow:** on.
  - **Callback URLs** (one per line): `<API origin>/api/v1/admin/auth/salesforce/callback` and `<API origin>/api/v1/onboarding/salesforce/callback` — the values of `SF_OAUTH_REDIRECT_URI` and `SF_ONBOARDING_REDIRECT_URI` (`http://localhost:3000/...` locally, `https://` in production).
  - **OAuth scopes:** *Access the identity URL service (id)*, *Manage user data via APIs (api)*, and *Perform requests at any time (refresh_token, offline_access)* — the last one is required for the onboarding connection handshake.
  - **Refresh Token Policy:** valid until revoked; **IP Relaxation:** enforce IP restrictions.
  - **Contact email:** the tenant's own Salesforce administrator.

  Without this configured, `/admin/login` renders but clicking through fails at Salesforce's authorization step.

## Running locally

1. **Install dependencies** (from the repo root):
   ```bash
   npm install
   ```

2. **Start Postgres**:
   ```bash
   docker compose -f infrastructure/docker-compose.yml up -d
   ```

3. **Configure environment variables**. Copy `apps/api/.env.example` to `apps/api/.env` and `integrations/postgres/.env.example` to `integrations/postgres/.env` (both `.gitignore`d). Every variable is documented in the example file and validated at boot by `apps/api/src/common/env.ts` — the API refuses to start on a missing or weak secret.

   There are no platform-wide Salesforce credentials: every tenant (company) connects its own org with its own Connected App.

4. **Connect a Salesforce org** through the onboarding wizard — open the Admin Console login page and choose "New company? Connect your Salesforce org". The wizard stores the Connected App credentials (encrypted), completes the OAuth handshake, deploys the TDM metadata package, and provisions the connecting user as the company's first Admin.

   **Tenant addresses:** a company is served at `<slug>.<TENANT_BASE_DOMAIN>`, and each of its dealerships at `<Dealership__c.Url_Slug__c>.<TENANT_BASE_DOMAIN>` or its `Custom_Domain__c`. Company and dealer labels share one global namespace (`TenantSubdomain`; custom domains in `TenantHost`); dealer entries are synced from Salesforce every 5 minutes, first registration wins, and a label already held elsewhere is logged as `dealership_host_conflict` rather than taken over. Labels such as `www`, `api`, `admin` are reserved (`organization-slug.ts`).

   **Salesforce access:** assign each staff User one permission set — `TDM_Full_Access` (company admin), `TDM_Dealer_Admin`, `TDM_Manager` or `TDM_Sales_Rep` — plus a `Staff_Assignment__c` record naming their dealership (blank for company admins), branch and role. Deploying the package requires ≥75% org-wide Apex coverage in production orgs. Locally, with `TENANT_BASE_DOMAIN=localhost`, open `http://<slug>.localhost:5173` — modern browsers resolve `*.localhost` to loopback, and the Vite proxy forwards the original `Host` so the API resolves the tenant. Customer routes on an unknown host return `404 unknown_tenant`.

5. **Run Prisma migrations** and generate the client:
   ```bash
   npm run prisma:migrate --workspace=integrations/postgres
   ```

6. **Seed initial data** (optional but needed for a usable demo):
   ```bash
   node integrations/salesforce/seed-catalog.mjs        # dealerships, branches, vehicle catalog + stock, Company Admin for the CLI user
   node integrations/salesforce/seed-demo-bookings.mjs  # demo bookings + feedback
   node integrations/salesforce/grant-company-admin.mjs <sf-target-org> <username>   # recovery only — onboarding grants the first Company Admin
   ```

7. **Start the backend and frontend** (two terminals, from repo root):
   ```bash
   npm run dev:api
   npm run dev:web
   ```
   - API: `http://localhost:3000/api/v1` (Swagger UI at `/api/docs`)
   - Frontend: `http://localhost:5173`

## Prerequisites for hosting on a server

- **Salesforce auth**: per tenant — each company's Connected App credentials and refresh token are stored encrypted (`ENCRYPTION_KEY`) and used per request via `TenantSalesforceConnectionProvider`. Register `SF_OAUTH_REDIRECT_URI` and `SF_ONBOARDING_REDIRECT_URI` as callback URLs on each tenant's Connected App.
- **DNS / TLS**: a wildcard record and certificate for `*.<TENANT_BASE_DOMAIN>`; serve the API same-host under `/api` so the tenant is resolved from the request host.
- **Managed PostgreSQL** for the auth/staff database (RDS, Cloud SQL, etc.), with `DATABASE_URL` pointed at it and migrations applied with `npm run db:deploy` as a release step, before new API instances take traffic.
- **Secrets management** for `JWT_SECRET`, `ENCRYPTION_KEY`, and any email-provider credentials — injected as environment variables, never committed.
- **CORS**: set `WEB_ORIGIN` to the deployed frontend's real origin.
- **Process management**: run `npm run build` then `node apps/api/dist/main.js` behind a process manager (PM2/systemd) or containerize it; the frontend build (`npm run build --workspace=apps/web`) is static output servable via any CDN/static host (Nginx, S3+CloudFront, Vercel, etc.).
- **HTTPS** termination in front of both the API and the static frontend.
- **Reverse proxy headers**: the tenant is resolved from the request host, and with `TRUST_PROXY_HOPS=N` the API trusts `X-Forwarded-Host`/`X-Forwarded-For` from exactly N proxies. Each proxy must **overwrite** those headers (never pass through client-supplied values); otherwise a client could pick another tenant's host or spoof its IP for rate limiting.
- **Health probes**: `GET /health` is liveness (process up); `GET /health/ready` is readiness (platform database reachable, 503 otherwise). A tenant's Salesforce connection is deliberately not part of readiness — one tenant's outage must not take instances out of rotation; staff see it in the admin System Health page.
- **Salesforce API limits**: since Salesforce is the system of record for bookings/vehicles/customers, plan for org API call limits under real traffic (the domain layer's repository pattern makes it possible to add caching or a read-replica adapter later without touching business logic).
