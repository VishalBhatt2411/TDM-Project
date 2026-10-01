import { Inject, Injectable } from "@nestjs/common";
import { OrganizationRepository } from "@tdm/postgres-adapter";
import { ORGANIZATION_REPOSITORY } from "../infrastructure/tokens";
import { env } from "../common/env";
import { isAssignableSubdomainLabel } from "./organization-slug";

const CACHE_TTL_MS = 60_000;
/** Host headers are client-controlled — bound the cache so random hostnames can't grow it without limit. */
const MAX_CACHE_ENTRIES = 1_000;

interface CachedResolution {
  organizationId: string | null;
  expiresAt: number;
}

/**
 * Maps the hostname a customer app is served on to its tenant: every company has one platform
 * address, "<company slug>.<TENANT_BASE_DOMAIN>", and its customers pick their city and branch
 * on that one site. Any other host resolves to null.
 */
@Injectable()
export class TenantResolverService {
  private readonly cache = new Map<string, CachedResolution>();

  constructor(@Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository) {}

  /** The organization id the host belongs to, or null. */
  async resolveHost(hostname: string | undefined): Promise<string | null> {
    const host = hostname?.trim().toLowerCase();
    if (!host) return null;

    const cached = this.cache.get(host);
    if (cached && cached.expiresAt > Date.now()) return cached.organizationId;

    const organizationId = await this.lookup(host);
    if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.clear();
    this.cache.set(host, { organizationId, expiresAt: Date.now() + CACHE_TTL_MS });
    return organizationId;
  }

  private async lookup(host: string): Promise<string | null> {
    const suffix = `.${env.tenantBaseDomain}`;
    if (!host.endsWith(suffix)) return null;
    const label = host.slice(0, -suffix.length);
    if (!isAssignableSubdomainLabel(label)) return null;
    return (await this.organizations.findBySlug(label))?.id ?? null;
  }
}
