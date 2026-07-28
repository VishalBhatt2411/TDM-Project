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
- **Salesforce CLI (`sf`)** and a Salesforce org (a free Developer Edition org works) with the TDM custom objects deployed from `integrations/salesforce/mdapi`. The backend does **not** store Salesforce credentials — it shells out to an already-authenticated `sf` CLI session to obtain a short-lived access token (see `integrations/salesforce/src/connection.ts`). This is explicitly a dev-mode convenience; production hosting requires replacing it with a Connected App using the JWT Bearer flow (see "Hosting" below).
- An email-sending capability if you want transactional emails (confirmation, magic link, OTP) to actually deliver — check `apps/api/src/notifications` / `apps/api/src/auth/otp-sender.ts` for the provider used in this environment.
- A **Salesforce Connected App** (OAuth2 Authorization Code flow) for staff "Login with Salesforce" — Setup → App Manager → New Connected App, enable OAuth, callback URL `http://localhost:3000/api/v1/admin/auth/salesforce/callback`, scopes `id` + `api`. Without this configured, `/admin/login` renders but clicking through will fail at Salesforce's authorization step.

## Running locally

1. **Install dependencies** (from the repo root):
   ```bash
   npm install
   ```

2. **Start Postgres**:
   ```bash
   docker compose -f infrastructure/docker-compose.yml up -d
   ```

3. **Configure environment variables**. Each service reads its own `.env` (see `apps/api/.env` and `integrations/postgres/.env` — not committed, `.gitignore`d):
   - `apps/api/.env`: `DATABASE_URL`, `JWT_SECRET`, `SF_TARGET_ORG_ALIAS`, `WEB_ORIGIN`, `ADMIN_WEB_ORIGIN`, `PORT`, `SF_OAUTH_CLIENT_ID`, `SF_OAUTH_CLIENT_SECRET`, `SF_OAUTH_REDIRECT_URI`, `SF_LOGIN_URL`
   - `integrations/postgres/.env`: `DATABASE_URL` (used by Prisma CLI commands)

4. **Authenticate the Salesforce CLI** against your org and give it the alias referenced by `SF_TARGET_ORG_ALIAS`:
   ```bash
   sf org login web --alias tdm-dev
   ```
   Deploy the TDM metadata (objects, Apex, LWC dashboard) if the org doesn't have it yet:
   ```bash
   sf project deploy start --source-dir integrations/salesforce/mdapi --target-org tdm-dev
   ```

5. **Run Prisma migrations** and generate the client:
   ```bash
   npm run prisma:migrate --workspace=integrations/postgres
   ```

6. **Seed initial data** (optional but needed for a usable demo):
   ```bash
   node integrations/salesforce/seed-catalog.mjs        # vehicles, branches, sales reps
   node integrations/postgres/seed-first-admin.mjs <your-email> "Your Name"   # first Admin Console user
   ```

7. **Start the backend and frontend** (two terminals, from repo root):
   ```bash
   npm run dev:api
   npm run dev:web
   ```
   - API: `http://localhost:3000/api/v1` (Swagger UI at `/api/docs`)
   - Frontend: `http://localhost:5173`

## Prerequisites for hosting on a server

- **Salesforce auth**: replace the `sf`-CLI-based `SalesforceConnectionProvider` with a Connected App using the JWT Bearer flow and a dedicated integration user — a real server has no interactive `sf` session to shell out to. This is a known, tracked hardening item in the code (see the comment in `integrations/salesforce/src/connection.ts`).
- **Managed PostgreSQL** for the auth/staff database (RDS, Cloud SQL, etc.), with `DATABASE_URL` pointed at it and migrations applied via `prisma migrate deploy`.
- **Secrets management** for `JWT_SECRET`, the Salesforce Connected App's private key/consumer key, and any email-provider credentials — injected as environment variables, never committed.
- **CORS**: set `WEB_ORIGIN` to the deployed frontend's real origin.
- **Process management**: run `npm run build` then `node apps/api/dist/main.js` behind a process manager (PM2/systemd) or containerize it; the frontend build (`npm run build --workspace=apps/web`) is static output servable via any CDN/static host (Nginx, S3+CloudFront, Vercel, etc.).
- **HTTPS** termination in front of both the API and the static frontend.
- **Salesforce API limits**: since Salesforce is the system of record for bookings/vehicles/customers, plan for org API call limits under real traffic (the domain layer's repository pattern makes it possible to add caching or a read-replica adapter later without touching business logic).
