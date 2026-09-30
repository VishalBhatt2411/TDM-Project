import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsOptional } from "class-validator";
import { AnalyticsScope, HeuristicInsightEngine } from "@tdm/domain";
import {
  ANALYTICS_PERIOD_DAYS,
  DEFAULT_ANALYTICS_PERIOD_DAYS,
  DEFAULT_DORMANT_AFTER_DAYS,
  DORMANT_AFTER_DAYS_OPTIONS,
} from "@tdm/types";
import { StaffAuthGuard } from "../admin/staff-auth.guard";
import { PermissionGuard } from "../admin/permission.guard";
import { RequirePermission } from "../admin/require-permission.decorator";
import { PERMISSIONS } from "../admin/permissions";
import { CurrentStaffAccess } from "../admin/current-staff-access.decorator";
import type { StaffAccess } from "../admin/staff-access";
import { IsRecordId } from "../common/record-id";
import { AnalyticsService } from "./analytics.service";

const insightEngine = new HeuristicInsightEngine();

class AnalyticsQueryDto {
  @IsOptional()
  @IsRecordId()
  branchId?: string;
}

class AnalyticsPeriodQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn(ANALYTICS_PERIOD_DAYS)
  periodDays?: number;
}

class CustomerSegmentsQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn(DORMANT_AFTER_DAYS_OPTIONS)
  dormantAfterDays?: number;
}

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
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("dashboard")
  getDashboard(@CurrentStaffAccess() access: StaffAccess, @Query() query: AnalyticsPeriodQueryDto) {
    return this.analytics.dashboard(dashboardScope(access, query.branchId), query.periodDays ?? DEFAULT_ANALYTICS_PERIOD_DAYS);
  }

  /** Booking->drive->opportunity conversion funnel with a heuristic drop-off diagnosis (see HeuristicInsightEngine.analyzeFunnel). */
  @Get("funnel")
  async getFunnel(@CurrentStaffAccess() access: StaffAccess, @Query() query: AnalyticsPeriodQueryDto) {
    const counts = await this.analytics.funnel(dashboardScope(access, query.branchId), query.periodDays ?? DEFAULT_ANALYTICS_PERIOD_DAYS);
    return { counts, insight: insightEngine.analyzeFunnel(counts) };
  }

  /** Lifetime customer-lifecycle segment breakdown for the Manager Dashboard (FR-42). */
  @Get("customer-segments")
  getCustomerSegments(@CurrentStaffAccess() access: StaffAccess, @Query() query: CustomerSegmentsQueryDto) {
    return this.analytics.customerSegments(
      dashboardScope(access, query.branchId),
      query.dormantAfterDays ?? DEFAULT_DORMANT_AFTER_DAYS,
    );
  }
}
