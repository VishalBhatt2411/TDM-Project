import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { AnalyticsRepository } from "@tdm/domain";
import { ANALYTICS_REPOSITORY } from "../infrastructure/tokens";
import { JwtAuthGuard } from "../common/jwt-auth.guard";

@Controller("analytics")
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(@Inject(ANALYTICS_REPOSITORY) private readonly analytics: AnalyticsRepository) {}

  @Get("dashboard")
  getDashboard(@Query("branchId") branchId?: string) {
    return this.analytics.getDashboardSummary(branchId);
  }
}
