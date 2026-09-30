import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { AnalyticsRepository, AnalyticsScope, HeuristicInsightEngine } from "@tdm/domain";
import { ANALYTICS_REPOSITORY } from "../infrastructure/tokens";
import { StaffAuthGuard } from "../admin/staff-auth.guard";
import { PermissionGuard } from "../admin/permission.guard";
import { RequirePermission } from "../admin/require-permission.decorator";
import { PERMISSIONS } from "../admin/permissions";
import { CurrentStaffAccess } from "../admin/current-staff-access.decorator";
import type { StaffAccess } from "../admin/staff-access";

const insightEngine = new HeuristicInsightEngine();

/** A branch filter narrows within the actor's dealerships — a branch outside them yields empty figures. */
function dashboardScope(access: StaffAccess, branchId?: string): AnalyticsScope {
  return { branchId, ...(access.scopeFor(PERMISSIONS.VIEW_DASHBOARD) ?? { dealershipIds: [] }) };
}

/**
 * Staff-only (Admin Console) — this is operational/business analytics, not a customer-facing
 * feature. Every figure is limited to the dealerships where the actor holds VIEW_DASHBOARD.
 */
@Controller("analytics")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.VIEW_DASHBOARD)
export class AnalyticsController {
  constructor(@Inject(ANALYTICS_REPOSITORY) private readonly analytics: AnalyticsRepository) {}

  @Get("dashboard")
  getDashboard(@CurrentStaffAccess() access: StaffAccess, @Query("branchId") branchId?: string) {
    return this.analytics.getDashboardSummary(dashboardScope(access, branchId));
  }

  /** Booking->drive->opportunity conversion funnel with a heuristic drop-off diagnosis (see HeuristicInsightEngine.analyzeFunnel). */
  @Get("funnel")
  async getFunnel(@CurrentStaffAccess() access: StaffAccess, @Query("branchId") branchId?: string) {
    const counts = await this.analytics.getFunnelCounts(dashboardScope(access, branchId));
    return { counts, insight: insightEngine.analyzeFunnel(counts) };
  }

  /** Lifetime customer-lifecycle segment breakdown for the Manager Dashboard (FR-42). */
  @Get("customer-segments")
  getCustomerSegments(@CurrentStaffAccess() access: StaffAccess, @Query("branchId") branchId?: string) {
    return this.analytics.getCustomerSegments(dashboardScope(access, branchId));
  }
}
