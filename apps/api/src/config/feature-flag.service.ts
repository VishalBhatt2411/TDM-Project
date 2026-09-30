import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  ConfigScope,
  FEATURE_FLAG_KEYS,
  FeatureFlagKey,
  FeatureFlagRepository,
  FeatureFlagSetting,
  featureFlagDefault,
} from "@tdm/domain";
import { FEATURE_FLAG_REPOSITORY } from "../infrastructure/tokens";
import { TenantContext } from "../tenancy/tenant-context";
import { DealershipSettingsCache } from "./dealership-settings-cache";

export type ResolvedFeatureFlags = Record<FeatureFlagKey, FeatureFlagSetting>;

/**
 * Whether a feature is on where it's used: the most specific admin setting (branch, dealership,
 * company-wide), else the feature's registry default (see FEATURE_FLAGS). Every gate — the
 * endpoint that serves a feature and the site that shows it — reads through here, so they agree.
 */
@Injectable()
export class FeatureFlagService {
  private readonly cache = new DealershipSettingsCache<ResolvedFeatureFlags>();

  constructor(@Inject(FEATURE_FLAG_REPOSITORY) private readonly flags: FeatureFlagRepository) {}

  /** Every flag's effective setting at `scope` — by default, the current request's host dealership. */
  async resolve(scope: ConfigScope = { dealershipId: TenantContext.hostDealershipId() }): Promise<ResolvedFeatureFlags> {
    const organizationId = TenantContext.currentOrganizationId();
    if (!organizationId) throw new NotFoundException("Unknown dealership.");

    const cacheKey = scope.branchId ? `${scope.dealershipId ?? ""}|${scope.branchId}` : scope.dealershipId;
    return this.cache.getOrLoad(organizationId, cacheKey, async () => {
      const settings = await this.flags.resolve(FEATURE_FLAG_KEYS, scope);
      const resolved = {} as ResolvedFeatureFlags;
      for (const key of FEATURE_FLAG_KEYS) {
        const setting = settings[key];
        resolved[key] =
          setting && setting.source !== "default" ? setting : { enabled: featureFlagDefault(key), source: "default" };
      }
      return resolved;
    });
  }

  async isEnabled(key: FeatureFlagKey, scope?: ConfigScope): Promise<boolean> {
    return (await this.resolve(scope))[key].enabled;
  }

  /** Rejects a request for a feature switched off where it would be used. */
  async assertEnabled(key: FeatureFlagKey, scope?: ConfigScope): Promise<void> {
    if (!(await this.isEnabled(key, scope))) {
      throw new ForbiddenException("This feature isn't available at this dealership.");
    }
  }

  /** Drops cached flags after an admin edit — all of the organization's, since every narrower scope inherits from a wider one. */
  invalidate(organizationId: string): void {
    this.cache.invalidate(organizationId);
  }
}
