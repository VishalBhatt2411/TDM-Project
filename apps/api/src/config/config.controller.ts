import { Controller, Get } from "@nestjs/common";
import { BrandingService } from "./branding.service";

@Controller("config")
export class ConfigController {
  constructor(private readonly branding: BrandingService) {}

  /** The branding and home-page content of the dealership (or company) this host serves. */
  @Get("dealership")
  getDealershipConfig() {
    return this.branding.resolve();
  }
}
