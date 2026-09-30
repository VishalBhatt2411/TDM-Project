import { Controller, Get } from "@nestjs/common";
import { BrandingService } from "./branding.service";
import { RegionalSettingsService } from "./regional-settings.service";
import { FeatureFlagService } from "./feature-flag.service";

@Controller("config")
export class ConfigController {
  constructor(
    private readonly branding: BrandingService,
    private readonly regional: RegionalSettingsService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  /** The branding, home-page content, regional settings and customer-facing features of the dealership (or company) this host serves. */
  @Get("dealership")
  async getDealershipConfig() {
    const [branding, regional, flags] = await Promise.all([
      this.branding.resolve(),
      this.regional.resolve(),
      this.featureFlags.resolve(),
    ]);
    const features = {
      wishlist: flags.wishlist.enabled,
      aiRecommendations: flags.ai_recommendations.enabled,
      qrCheckIn: flags.qr_check_in.enabled,
    };
    return { ...branding, regional, features };
  }
}
