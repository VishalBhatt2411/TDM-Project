import { Controller, Get } from "@nestjs/common";
import { BrandingService } from "./branding.service";
import { RegionalSettingsService } from "./regional-settings.service";

@Controller("config")
export class ConfigController {
  constructor(
    private readonly branding: BrandingService,
    private readonly regional: RegionalSettingsService,
  ) {}

  /** The branding, home-page content and regional settings of the dealership (or company) this host serves. */
  @Get("dealership")
  async getDealershipConfig() {
    const [branding, regional] = await Promise.all([this.branding.resolve(), this.regional.resolve()]);
    return { ...branding, regional };
  }
}
