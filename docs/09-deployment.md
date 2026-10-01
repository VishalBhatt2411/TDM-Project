# Deployment (Vercel + Neon + GitHub Actions)

Everything runs on free tiers. One Vercel project serves both the web app (static, `apps/web/dist`)
and the API (one Node function, `api/index.js`, wrapping `apps/api/src/serverless.ts`). The
platform store is a Neon Postgres. Because a serverless host has no long-running process, the API
runs with `SCHEDULER_MODE=external` and `.github/workflows/scheduled-jobs.yml` triggers the
reminder (15 min), host-sync (5 min) and follow-up (daily, 10:00 UTC) jobs over HTTPS.

The same build still runs as a long-running server (`node apps/api/dist/main.js`, default
`SCHEDULER_MODE=in-process`) on any container host.

## 1. Database

Create a Neon project (Vercel → Storage → Neon, or neon.tech). Use the pooled connection string
as `DATABASE_URL`; migrations run during the Vercel build against `DATABASE_URL_UNPOOLED` when it
is set (the Neon integration sets both), else `DATABASE_URL`.

## 2. Vercel project

Import the repo with the **repository root** as Root Directory; `vercel.json` holds the build,
rewrites (`/api/*`, `/health*` → the function; everything else → the SPA) and security headers.
Environment variables (Production):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon pooled URL |
| `JWT_SECRET` | ≥ 32 random characters |
| `ENCRYPTION_KEY` | 64 hex characters; keep it — rotating it forces every tenant to reconnect Salesforce |
| `SCHEDULER_MODE` | `external` |
| `JOB_TRIGGER_SECRET` | ≥ 32 random characters (same value as the GitHub secret) |
| `TENANT_BASE_DOMAIN` | `vercel.app` while on `*.vercel.app`; your own domain later |
| `TRUST_PROXY_HOPS` | `1` (Vercel's edge) |
| `WEB_ORIGIN` | `https://<tenant host>` |
| `SF_OAUTH_REDIRECT_URI` | `https://<tenant host>/api/v1/admin/auth/salesforce/callback` |
| `SF_ONBOARDING_REDIRECT_URI` | `https://<tenant host>/api/v1/onboarding/salesforce/callback` |
| `ANTHROPIC_API_KEY` | optional (AI licence check) |

Domains: a tenant resolves from `<label>.<TENANT_BASE_DOMAIN>`, where the label is a company or
dealer slug. On `*.vercel.app` add each tenant host as a project domain (e.g.
`<dealer-slug>.vercel.app`, if that name is free). A real domain replaces this with one wildcard
`*.<domain>` (requires Vercel nameservers) — then set `TENANT_BASE_DOMAIN` to it.

## 3. Scheduled jobs

In the GitHub repo set variable `APP_URL` (`https://<tenant host>`) and secret
`JOB_TRIGGER_SECRET`. The workflow is inert until `APP_URL` exists. Run any job on demand from
Actions → Scheduled jobs → Run workflow.

## 4. Salesforce

Each tenant's Connected App must list both redirect URIs above as callback URLs. Tenants
connected before the move reconnect from the admin console (a new `ENCRYPTION_KEY` cannot read
credentials encrypted with the old one).

## 5. Serverless limits

- Request bodies are capped at ~4.5 MB. The web app downscales licence photos and brand images
  before upload, and the hero image cap is 3 MB to fit.
- Rate limiting (`ThrottlerModule`) is in-memory, so each warm function instance counts
  separately — limits are per instance, not global. A shared store (e.g. Redis) makes them global.
- A tenant's metadata deploy runs after the onboarding response via `waitUntil`, bounded by the
  function's `maxDuration` (60 s).

## 6. Verify

- `GET https://<tenant host>/health/ready` → 200.
- `GET https://<tenant host>/api/v1/config/dealership` → the tenant's dealership (or 503
  `TENANT_NOT_CONNECTED` until its Salesforce org is reconnected). 404 `unknown_tenant` means the
  host didn't resolve: check `TENANT_BASE_DOMAIN`, the domain list and `TRUST_PROXY_HOPS`.
