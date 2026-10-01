import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { RegionalSettings, RegionalSettingsRepository, ResolvedRegionalSettings, resolveRegionalSettings } from "@tdm/domain";
import { REGIONAL_SETTINGS_REPOSITORY } from "../infrastructure/tokens";
import { TenantContext } from "../tenancy/tenant-context";
import { DealershipSettingsCache } from "./dealership-settings-cache";

/**
 * Resolves the locale, time zone, currency and phone calling code a dealership operates in:
 * its own settings, else the company's, else the data provider org's defaults (see
 * resolveRegionalSettings). A dealership that no longer exists resolves to the company's.
 */
@Injectable()
export class RegionalSettingsService {
  private readonly cache = new DealershipSettingsCache<ResolvedRegionalSettings>();

  constructor(@Inject(REGIONAL_SETTINGS_REPOSITORY) private readonly regional: RegionalSettingsRepository) {}

  /** Settings for `dealershipId`, else the company's. */
  async resolve(dealershipId?: string): Promise<ResolvedRegionalSettings> {
    const organizationId = TenantContext.currentOrganizationId();
    if (!organizationId) throw new NotFoundException("Unknown dealership.");

    return this.cache.getOrLoad(organizationId, dealershipId, async () => {
      const [own, company, defaults] = await Promise.all([
        dealershipId ? this.regional.findLayer(dealershipId) : Promise.resolve(null),
        this.regional.findLayer(),
        this.regional.findProviderDefaults(),
      ]);
      const layers = [own, company].filter((layer): layer is RegionalSettings => !!layer);
      return resolveRegionalSettings(layers, defaults);
    });
  }

  /** The time zone of each dealership in `dealershipIds` — for grouping bookings of several dealerships. */
  async timeZonesOf(dealershipIds: Iterable<string | undefined>): Promise<Map<string | undefined, string>> {
    const unique = [...new Set(dealershipIds)];
    const zones = await Promise.all(unique.map(async (id) => [id, (await this.resolve(id)).timeZone] as const));
    return new Map(zones);
  }

  /** Drops cached settings after an edit: one dealership's, or — for a company-wide edit — all of the organization's. */
  invalidate(organizationId: string, dealershipId?: string): void {
    this.cache.invalidate(organizationId, dealershipId);
  }
}
