import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { RegionalSettings, RegionalSettingsRepository, ResolvedRegionalSettings, resolveRegionalSettings } from "@tdm/domain";
import { REGIONAL_SETTINGS_REPOSITORY } from "../infrastructure/tokens";
import { TenantContext } from "../tenancy/tenant-context";

/** Settings edited straight in the data provider reach scheduling and formatting within this window. */
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1000;

/**
 * Resolves the locale, time zone, currency and phone calling code a dealership operates in:
 * its own settings, else the company's, else the data provider org's defaults (see
 * resolveRegionalSettings). A dealership that no longer exists resolves to the company's.
 */
@Injectable()
export class RegionalSettingsService {
  private readonly cache = new Map<string, { settings: ResolvedRegionalSettings; expiresAt: number }>();

  constructor(@Inject(REGIONAL_SETTINGS_REPOSITORY) private readonly regional: RegionalSettingsRepository) {}

  /** Settings for `dealershipId`, else for the current request's host dealership, else the company's. */
  async resolve(dealershipId: string | undefined = TenantContext.hostDealershipId()): Promise<ResolvedRegionalSettings> {
    const organizationId = TenantContext.currentOrganizationId();
    if (!organizationId) throw new NotFoundException("Unknown dealership.");

    const cacheKey = `${organizationId}:${dealershipId ?? ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.settings;

    const [own, company, defaults] = await Promise.all([
      dealershipId ? this.regional.findLayer(dealershipId) : Promise.resolve(null),
      this.regional.findLayer(),
      this.regional.findProviderDefaults(),
    ]);
    const layers = [own, company].filter((layer): layer is RegionalSettings => !!layer);
    const settings = resolveRegionalSettings(layers, defaults);
    if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.clear();
    this.cache.set(cacheKey, { settings, expiresAt: Date.now() + CACHE_TTL_MS });
    return settings;
  }

  /** The time zone of each dealership in `dealershipIds` — for grouping bookings of several dealerships. */
  async timeZonesOf(dealershipIds: Iterable<string | undefined>): Promise<Map<string | undefined, string>> {
    const unique = [...new Set(dealershipIds)];
    const zones = await Promise.all(unique.map(async (id) => [id, (await this.resolve(id)).timeZone] as const));
    return new Map(zones);
  }

  /** Drops cached settings after an edit: one dealership's, or — for a company-wide edit — all of the organization's. */
  invalidate(organizationId: string, dealershipId?: string): void {
    if (dealershipId) {
      this.cache.delete(`${organizationId}:${dealershipId}`);
      return;
    }
    const prefix = `${organizationId}:`;
    for (const key of this.cache.keys()) if (key.startsWith(prefix)) this.cache.delete(key);
  }
}
