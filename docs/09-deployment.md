# Deployment (Vercel + Render)

The web app is static and goes to Vercel. The API is a long-running Node service (in-process
schedulers, pooled Postgres connections) and goes to Render via `render.yaml`. The browser only
ever talks to the Vercel host: Vercel rewrites `/api/*` to the API, so the request host — which
selects the tenant — stays the customer-facing one, and cookies stay first-party.

## 1. API on Render

1. Push the branch to GitHub, then in Render choose **New → Blueprint** and select the repo.
   It creates `tdm-api` and the `tdm-platform-db` Postgres from `render.yaml`.
2. Enter the `sync: false` values (all URLs `https`):

   | Variable | Value |
   | --- | --- |
   | `ENCRYPTION_KEY` | 64 hex chars; generate once and keep it — rotating it forces every tenant to reconnect Salesforce |
   | `WEB_ORIGIN` | `https://<tenant label>.<TENANT_BASE_DOMAIN>` (the Vercel host) |
   | `TENANT_BASE_DOMAIN` | `vercel.app` while on `*.vercel.app`; your own domain later |
   | `SF_OAUTH_REDIRECT_URI` | `https://<web host>/api/v1/admin/auth/salesforce/callback` |
   | `SF_ONBOARDING_REDIRECT_URI` | `https://<web host>/api/v1/onboarding/salesforce/callback` |
   | `ANTHROPIC_API_KEY` | optional (AI licence check) |

3. Deploy. `preDeployCommand` applies migrations; `/health/ready` gates traffic.

## 2. Web on Vercel

1. Import the repo with **Root Directory** `apps/web` (framework: Vite). `apps/web/vercel.json`
   holds the build command, SPA fallback, security headers and the `/api/*` rewrite to the
   Render service URL.
2. Domains: tenants resolve from `<label>.<TENANT_BASE_DOMAIN>`, where the label is a company or
   dealer slug. On `*.vercel.app` add each tenant host as a project domain (e.g.
   `<dealer-slug>.vercel.app`, if that name is free). A real domain replaces this with a single
   wildcard `*.<domain>` (requires Vercel nameservers) — then set `TENANT_BASE_DOMAIN` to it.

## 3. Salesforce

Each tenant's Connected App must list both redirect URIs above as callback URLs. Tenants
connected before the move reconnect from the admin console (a new `ENCRYPTION_KEY` cannot read
credentials encrypted with the old one).

## 4. Verify

- `GET https://<render url>/health/ready` → 200.
- `GET https://<web host>/api/v1/config/dealership` → the tenant's dealership (or 503
  `TENANT_NOT_CONNECTED` until its Salesforce org is reconnected) — either proves the rewrite
  forwards the tenant host. 404 `unknown_tenant` means it doesn't: check `TRUST_PROXY_HOPS`
  against the number of proxies in front of the API.
