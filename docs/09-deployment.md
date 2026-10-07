# Deployment (Vercel + Neon + GitHub Actions)

Everything runs on free tiers. One Vercel project serves both the web app (static, `apps/web/dist`)
and the API (one Node function, `api/index.js`, wrapping `apps/api/src/serverless.ts`). The
platform store is a Neon Postgres. Because a serverless host has no long-running process, the API
runs with `SCHEDULER_MODE=external` and `.github/workflows/scheduled-jobs.yml` triggers the
reminder (15 min), follow-up (daily, 10:00 UTC) and housekeeping purge (daily, 03:30 UTC;
removes expired OTPs/tokens and old reminder markers) jobs over HTTPS.

The same build still runs as a long-running server (`node apps/api/dist/main.js`, default
`SCHEDULER_MODE=in-process`) on any container host.

## 1. Database

Create a Neon project (Vercel → Storage → Neon, or neon.tech). Use the pooled connection string
as `DATABASE_URL`; migrations run during the Vercel build against `DATABASE_URL_UNPOOLED` when it
is set (the Neon integration sets both), else `DATABASE_URL`.

### Staging environment (Vercel Preview + its own database)

Production (`master`) only ever shows merged work. Everything else is tested on **staging**: Vercel's
Preview environment, backed by its own Neon branch, served on its own stable address.

```
feature/*  ──PR──▶  staging  ──PR──▶  master
(preview URL)       (staging site)    (production)
```

The build command runs `db:deploy` on every deployment, so a Preview that shared the production
`DATABASE_URL` would apply unreviewed migrations to the live database. The build script
(`infrastructure/vercel-build.sh`) therefore **skips migrations on Preview builds** until
`PREVIEW_DB_ISOLATED=1` is set (step 3). One-time setup:

1. **Database.** In Neon create a branch (or project) for staging with **no tenant data** — a copy of
   production would carry each tenant's encrypted Salesforce credentials into preview code.
2. **Variables.** In Vercel → Settings → Environment Variables, the Neon variables (`DATABASE_URL`,
   `DATABASE_URL_UNPOOLED`, `POSTGRES_*`, `PG*`) are scoped *Production and Preview*. Re-scope each to
   **Production only**, then add the staging branch's `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`
   with **Preview only**. (Or use the Neon integration's per-preview database branches.)
3. **Preview-only values**, each scoped to Preview and different from production:

   | Variable | Value |
   | --- | --- |
   | `JWT_SECRET`, `ENCRYPTION_KEY` | new random values, so staging can never sign tokens for or decrypt production data |
   | `JOB_TRIGGER_SECRET` | its own random value, not the GitHub secret — nothing calls staging's job endpoints |
   | `SCHEDULER_MODE` / `NODE_ENV` / `TRUST_PROXY_HOPS` | `external` / `production` / `1` |
   | `TENANT_BASE_DOMAIN` | `vercel.app` |
   | `WEB_ORIGIN`, `SF_OAUTH_REDIRECT_URI`, `SF_ONBOARDING_REDIRECT_URI` | as in the production table, using the staging host |
   | `PREVIEW_DB_ISOLATED` | `1` — set last, once steps 1–2 are done |

   Leave `ANTHROPIC_API_KEY` unset so staging spends no API credit.
4. **Address.** Settings → Domains → add `<name>-staging.vercel.app` and assign it to the `staging` Git
   branch. The tenant is resolved from `<slug>.<TENANT_BASE_DOMAIN>`, so the company created on staging
   must use the slug `<name>-staging`. Add the staging redirect URIs to that company's Connected App.
5. **Check it.** Push `staging`, open its build log (it should run `prisma migrate deploy`), and
   confirm `_prisma_migrations` in the **production** database gained no new rows from that build.
6. Create the staging company through the onboarding wizard on the staging host (it can connect the
   same development Salesforce org; use a sandbox if staging data must stay apart from production's).

Branch URLs (`tdm-git-<branch>-…vercel.app`) do not resolve a tenant; to test a feature branch before it
reaches `staging`, point the staging domain at that branch under Settings → Domains.

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
| `ANTHROPIC_MODEL` | optional (defaults to `claude-sonnet-5-5`) |
| `PLATFORM_OPERATOR_PASSWORD_HASH` | optional; enables the operator console (below) |

Domains: each company has one customer site, `<company slug>.<TENANT_BASE_DOMAIN>`, shared by all
its dealerships. On `*.vercel.app` add each company host as a project domain (e.g.
`<company-slug>.vercel.app`, if that name is free). A real domain replaces this with one wildcard
`*.<domain>` (requires Vercel nameservers) — then set `TENANT_BASE_DOMAIN` to it.

## 3. Scheduled jobs

In the GitHub repo set variable `APP_URL` (`https://<tenant host>`) and secret
`JOB_TRIGGER_SECRET`. The workflow is inert until `APP_URL` exists. Run any job on demand from
Actions → Scheduled jobs → Run workflow.

Onboarding setup links expire 7 days after they are issued; **Reconnect** in the operator console issues a fresh one.

## 4. Salesforce

Each tenant's Connected App must list both redirect URIs above as callback URLs. Tenants
connected before the move reconnect from the admin console (a new `ENCRYPTION_KEY` cannot read
credentials encrypted with the old one).

## 5. Operator console

`https://<platform host>/platform` lists every connected company and can **Reconnect** (drops its
Salesforce connection, signs out its staff, and issues a one-time setup link that reruns the
onboarding wizard for the same org) or **Delete** it (removes everything the platform stores for
it; Salesforce data is untouched). It is unlinked from the UI and protected by one operator
password; sessions last 30 minutes and logins are throttled. Set the hash (never the password):

```bash
printf %s "<password of 16+ characters>" | npm run -s platform:hash-password -w apps/api
```

Without `PLATFORM_OPERATOR_PASSWORD_HASH` the console and its API return 404.

## 6. Serverless limits

- Request bodies are capped at ~4.5 MB. The web app downscales licence photos and brand images
  before upload, and the hero image cap is 3 MB to fit.
- Rate limiting (`ThrottlerModule`) is in-memory, so each warm function instance counts
  separately — limits are per instance, not global. A shared store (e.g. Redis) makes them global.
- A tenant's metadata deploy runs after the onboarding response via `waitUntil`, bounded by the
  function's `maxDuration` (60 s).

## 7. Verify

- `GET https://<tenant host>/health/ready` → 200.
- `GET https://<tenant host>/api/v1/config/dealership` → the tenant's dealership (or 503
  `TENANT_NOT_CONNECTED` until its Salesforce org is reconnected). 404 `unknown_tenant` means the
  host didn't resolve: check the company slug, `TENANT_BASE_DOMAIN`, the project's domains and `TRUST_PROXY_HOPS`.
