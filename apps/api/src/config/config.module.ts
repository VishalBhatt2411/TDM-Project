import { Module } from "@nestjs/common";
import { BrandingService } from "./branding.service";
import { BrandAssetService } from "./brand-asset.service";
import { ConfigController } from "./config.controller";
import { BrandAssetsController } from "./brand-assets.controller";

@Module({
  controllers: [ConfigController, BrandAssetsController],
  providers: [BrandingService, BrandAssetService],
  exports: [BrandingService, BrandAssetService],
})
export class DealershipConfigModule {}
