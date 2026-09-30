import { Inject, Injectable } from "@nestjs/common";
import { HostRoute, OrganizationRepository } from "@tdm/postgres-adapter";
import { ORGANIZATION_REPOSITORY } from "../infrastructure/tokens";
import { env } from "../common/env";
import { isAssignableSubdomainLabel } from "./organization-slug";

const CACHE_TTL_MS = 60_000;
/** Host headers are client-controlled — bound the cache so random hostnames can't grow it without limit. */
const MAX_CACHE_ENTRIES = 1_000;

interface CachedResolution {
  route: HostRoute | null;
  expiresAt: number;
}

/**
 * Maps the hostname a customer app is served on to its tenant (and dealership, when the host
 * is a dealer's): a platform subdomain ("<label>.<TENANT_BASE_DOMAIN>") resolves through the
 * shared company/dealer label registry, anything else must be a registered custom domain.
 * Unknown hosts resolve to null.
 */
@Injectable()
export class TenantResolverService {
  private readonly cache = new Map<string, CachedResolution>();

  constructor(@Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository) {}

  async resolveHost(hostname: string | undefined): Promise<HostRoute | null> {
    const host = hostname?.trim().toLowerCase();
    if (!host) return null;

    const cached = this.cache.get(host);
    if (cached && cached.expiresAt > Date.now()) return cached.route;

    const route = await this.lookup(host);
    if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.clear();
    this.cache.set(host, { route, expiresAt: Date.now() + CACHE_TTL_MS });
    return route;
  }

  /** Drops a cached resolution after the host registry changed, so the new route applies at once. */
  forget(hostname: string): void {
    this.cache.delete(hostname.trim().toLowerCase());
  }

  private async lookup(host: string): Promise<HostRoute | null> {
    // The bare platform domain is the shared (tenant-less) origin — never a custom domain.
    if (host === env.tenantBaseDomain) return null;
    const suffix = `.${env.tenantBaseDomain}`;
    if (host.endsWith(suffix)) {
      const label = host.slice(0, -suffix.length);
      if (!isAssignableSubdomainLabel(label)) return null;
      return this.organizations.resolveSubdomainLabel(label);
    }
    return this.organizations.resolveCustomDomain(host);
  }
}
