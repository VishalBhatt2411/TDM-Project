import { Module } from "@nestjs/common";
import { BrandingService } from "./branding.service";
import { BrandAssetService } from "./brand-asset.service";
import { RegionalSettingsService } from "./regional-settings.service";
import { BookingScheduleService } from "./booking-schedule.service";
import { ConfigController } from "./config.controller";
import { BrandAssetsController } from "./brand-assets.controller";

@Module({
  controllers: [ConfigController, BrandAssetsController],
  providers: [BrandingService, BrandAssetService, RegionalSettingsService, BookingScheduleService],
  exports: [BrandingService, BrandAssetService, RegionalSettingsService, BookingScheduleService],
})
export class DealershipConfigModule {}
