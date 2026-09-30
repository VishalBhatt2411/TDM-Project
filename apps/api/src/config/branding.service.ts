import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  BrandLayer,
  BrandProfile,
  BrandingRepository,
  DealershipRepository,
  EMPTY_BRAND_LAYER,
  SITE_SECTION_KEYS,
  SiteCopy,
  SiteSectionKey,
  mergeBrandLayers,
} from "@tdm/domain";
import type { OrganizationRepository } from "@tdm/postgres-adapter";
import { BRANDING_REPOSITORY, DEALERSHIP_REPOSITORY, ORGANIZATION_REPOSITORY } from "../infrastructure/tokens";
import { TenantContext } from "../tenancy/tenant-context";
import { tenantSiteOrigin } from "../tenancy/tenant-site-origin";
import { brandAssetPath } from "./brand-assets";

/** Branding edited outside the admin console (straight in the data provider) reaches customers within this window. */
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1000;

/** Home-page content ready to render: images as URLs, every section's visibility decided. */
export interface ResolvedSiteContent {
  heroImageUrl?: string;
  sections: Record<SiteSectionKey, boolean>;
  /** Tenant copy per language; a missing key falls back to the app's own translation. */
  copy: Record<string, SiteCopy>;
}

export interface ResolvedBrand extends BrandProfile {
  content: ResolvedSiteContent;
}

/** A resolved brand plus the tenant's public site origin, for surfaces without a request host. */
interface CachedBrand {
  brand: ResolvedBrand;
  siteOrigin?: string;
}

/** Turns a merged layer's asset ids into the URLs customers load them from. */
export function toResolvedBrand(name: string, layer: BrandLayer): ResolvedBrand {
  const { branding, content } = layer;
  const sections = Object.fromEntries(SITE_SECTION_KEYS.map((key) => [key, content.sections?.[key] ?? true])) as Record<
    SiteSectionKey,
    boolean
  >;
  const heroImageUrl = content.heroImageUrl ?? (content.heroImageAssetId ? brandAssetPath(content.heroImageAssetId) : undefined);
  const logoUrl = branding.logoUrl ?? (content.logoAssetId ? brandAssetPath(content.logoAssetId) : undefined);
  return {
    name,
    ...branding,
    ...(logoUrl ? { logoUrl } : {}),
    content: { ...(heroImageUrl ? { heroImageUrl } : {}), sections, copy: content.copy ?? {} },
  };
}

/**
 * Resolves what a customer-facing surface is branded with: the dealership's own layer over the
 * company-wide one (field by field — see mergeBrandLayers), or the company layer alone on a
 * company-wide host or for a dealership that no longer exists. Nothing here is a hardcoded
 * brand; every value is tenant data, and anything unset falls back to the app's own defaults.
 */
@Injectable()
export class BrandingService {
  private readonly cache = new Map<string, CachedBrand & { expiresAt: number }>();

  constructor(
    @Inject(DEALERSHIP_REPOSITORY) private readonly dealerships: DealershipRepository,
    @Inject(BRANDING_REPOSITORY) private readonly branding: BrandingRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
  ) {}

  /** Branding for `dealershipId`, else for the current request's host dealership, else the company's. */
  async resolve(dealershipId: string | undefined = TenantContext.hostDealershipId()): Promise<ResolvedBrand> {
    return (await this.resolveCached(dealershipId)).brand;
  }

  /**
   * Branding for an email: an uploaded image's same-origin path becomes an absolute URL on the
   * tenant's company site, since a mail client has no host to resolve it against.
   */
  async resolveForEmail(dealershipId: string | undefined): Promise<BrandProfile> {
    const { brand, siteOrigin } = await this.resolveCached(dealershipId);
    if (!siteOrigin || !brand.logoUrl?.startsWith("/")) return brand;
    return { ...brand, logoUrl: `${siteOrigin}${brand.logoUrl}` };
  }

  private async resolveCached(dealershipId: string | undefined): Promise<CachedBrand> {
    const organizationId = TenantContext.currentOrganizationId();
    if (!organizationId) throw new NotFoundException("Unknown dealership.");

    const cacheKey = `${organizationId}:${dealershipId ?? ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached;

    const loaded = await this.load(organizationId, dealershipId);
    if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.clear();
    this.cache.set(cacheKey, { ...loaded, expiresAt: Date.now() + CACHE_TTL_MS });
    return loaded;
  }

  /**
   * Drops cached branding after an edit: one dealership's, or — for a company-wide edit, which
   * every dealership inherits — all of the organization's. Other API instances catch up within CACHE_TTL_MS.
   */
  invalidate(organizationId: string, dealershipId?: string): void {
    if (dealershipId) {
      this.cache.delete(`${organizationId}:${dealershipId}`);
      return;
    }
    const prefix = `${organizationId}:`;
    for (const key of this.cache.keys()) if (key.startsWith(prefix)) this.cache.delete(key);
  }

  private async load(organizationId: string, dealershipId: string | undefined): Promise<CachedBrand> {
    const [company, dealership, own, organization] = await Promise.all([
      this.branding.findLayer(),
      dealershipId ? this.dealerships.findById(dealershipId) : Promise.resolve(null),
      dealershipId ? this.branding.findLayer(dealershipId) : Promise.resolve(null),
      this.organizations.findById(organizationId),
    ]);
    if (!organization) throw new NotFoundException("Unknown dealership.");
    // The company host always routes and serves every image of the tenant, while a dealer's host
    // stops routing when the dealership is deactivated — an image in an already-sent email must keep loading.
    const siteOrigin = tenantSiteOrigin(organization.slug);
    const companyLayer = company ?? EMPTY_BRAND_LAYER;
    if (dealership && own) {
      return { brand: toResolvedBrand(dealership.toProps().name, mergeBrandLayers(companyLayer, own)), siteOrigin };
    }
    return { brand: toResolvedBrand(organization.name, companyLayer), siteOrigin };
  }
}
