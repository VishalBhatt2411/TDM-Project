import { Module } from "@nestjs/common";
import { BrandingService } from "./branding.service";
import { BrandAssetService } from "./brand-asset.service";
import { RegionalSettingsService } from "./regional-settings.service";
import { BookingScheduleService } from "./booking-schedule.service";
import { FeatureFlagService } from "./feature-flag.service";
import { ConfigController } from "./config.controller";
import { BrandAssetsController } from "./brand-assets.controller";

@Module({
  controllers: [ConfigController, BrandAssetsController],
  providers: [BrandingService, BrandAssetService, RegionalSettingsService, BookingScheduleService, FeatureFlagService],
  exports: [BrandingService, BrandAssetService, RegionalSettingsService, BookingScheduleService, FeatureFlagService],
})
export class DealershipConfigModule {}
