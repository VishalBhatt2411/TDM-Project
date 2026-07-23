import { Module } from "@nestjs/common";
import { StaffAuthModule } from "../admin/staff-auth.module";
import { AnalyticsController } from "./analytics.controller";

@Module({
  imports: [StaffAuthModule],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
