import { Module } from "@nestjs/common";
import { BrandingService } from "./branding.service";
import { BrandAssetService } from "./brand-asset.service";
import { RegionalSettingsService } from "./regional-settings.service";
import { ConfigController } from "./config.controller";
import { BrandAssetsController } from "./brand-assets.controller";

@Module({
  controllers: [ConfigController, BrandAssetsController],
  providers: [BrandingService, BrandAssetService, RegionalSettingsService],
  exports: [BrandingService, BrandAssetService, RegionalSettingsService],
})
export class DealershipConfigModule {}
