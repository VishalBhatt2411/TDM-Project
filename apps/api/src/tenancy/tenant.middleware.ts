import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { TenantContext } from "./tenant-context";
import { TenantResolverService } from "./tenant-resolver.service";
import { siteOriginOf } from "./tenant-site-origin";

/**
 * Routes whose tenant comes from the authenticated staff session (or that are
 * tenant-less) rather than from the host — the admin console and onboarding wizard
 * are served from a shared platform origin, not a company's customer site.
 */
const HOST_OPTIONAL_PREFIXES = [
  "/api/v1/admin/",
  "/api/v1/analytics/",
  "/api/v1/assets/",
  "/api/v1/onboarding/",
  // Cross-tenant operator console, authenticated by its own password session.
  "/api/v1/platform/",
  // Job triggers are platform-wide (they fan out over every tenant) and authenticate by secret.
  "/api/v1/internal/",
  "/health/",
  "/api/docs/",
];

function isHostOptional(path: string): boolean {
  const normalized = path.endsWith("/") ? path : `${path}/`;
  return HOST_OPTIONAL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Opens the per-request tenant context and resolves the company address to its tenant.
 * Customer-facing routes on an unrecognized host are rejected outright (fail closed)
 * — never served from a default tenant.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly resolver: TenantResolverService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const hostOptional = isHostOptional(req.originalUrl.split("?")[0] ?? "");
    let organizationId: string | null;
    try {
      organizationId = await this.resolver.resolveHost(req.hostname);
    } catch (err) {
      // Host-optional routes (health, admin, onboarding) must stay reachable when the lookup
      // store is degraded; they re-derive tenant from the session. Customer routes fail closed.
      if (!hostOptional) {
        next(err);
        return;
      }
      this.logger.error(JSON.stringify({ event: "tenant_host_resolution_failed", reason: (err as Error).message }));
      organizationId = null;
    }
    if (!organizationId && !hostOptional) {
      res.status(404).json({ error: "unknown_tenant", message: "No dealership is configured for this address." });
      return;
    }
    // req.hostname only counts once it resolved to a tenant — the company slug vouches for it.
    const siteOrigin = organizationId ? siteOriginOf(req.hostname.toLowerCase()) : undefined;
    TenantContext.run(() => next(), organizationId ?? undefined, siteOrigin);
  }
}
