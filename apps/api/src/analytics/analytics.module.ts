import { Module } from "@nestjs/common";
import { StaffAuthModule } from "../admin/staff-auth.module";
import { DealershipConfigModule } from "../config/config.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [StaffAuthModule, DealershipConfigModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
