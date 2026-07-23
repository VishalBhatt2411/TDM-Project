import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { AnalyticsRepository } from "@tdm/domain";
import { ANALYTICS_REPOSITORY } from "../infrastructure/tokens";
import { StaffAuthGuard } from "../admin/staff-auth.guard";
import { PermissionGuard } from "../admin/permission.guard";
import { RequirePermission } from "../admin/require-permission.decorator";
import { PERMISSIONS } from "../admin/permissions";

/** Staff-only (Admin Console) — this is operational/business analytics, not a customer-facing feature. */
@Controller("analytics")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.VIEW_DASHBOARD)
export class AnalyticsController {
  constructor(@Inject(ANALYTICS_REPOSITORY) private readonly analytics: AnalyticsRepository) {}

  @Get("dashboard")
  getDashboard(@Query("branchId") branchId?: string) {
    return this.analytics.getDashboardSummary(branchId);
  }
}
