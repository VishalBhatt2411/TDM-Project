import { Inject, Injectable } from "@nestjs/common";
import {
  AnalyticsDay,
  AnalyticsRepository,
  AnalyticsScope,
  AnalyticsWindow,
  CustomerSegmentCounts,
  DashboardSummary,
  FunnelStageCounts,
} from "@tdm/domain";
import { addIsoDays, zonedDayWindow, zonedIsoDate } from "@tdm/types";
import { ANALYTICS_REPOSITORY } from "../infrastructure/tokens";
import { RegionalSettingsService } from "../config/regional-settings.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves the reporting windows in the tenant's time zone before asking the data provider — a
 * scope of one dealership uses that dealership's zone, a wider one the company's.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(ANALYTICS_REPOSITORY) private readonly analytics: AnalyticsRepository,
    private readonly regional: RegionalSettingsService,
  ) {}

  async dashboard(scope: AnalyticsScope, periodDays: number): Promise<DashboardSummary> {
    return this.analytics.getDashboardSummary(await this.window(scope, periodDays), scope);
  }

  async funnel(scope: AnalyticsScope, periodDays: number): Promise<FunnelStageCounts> {
    return this.analytics.getFunnelCounts(await this.window(scope, periodDays), scope);
  }

  async customerSegments(scope: AnalyticsScope, dormantAfterDays: number): Promise<CustomerSegmentCounts> {
    return this.analytics.getCustomerSegments(new Date(Date.now() - dormantAfterDays * DAY_MS), scope);
  }

  private async window(scope: AnalyticsScope, periodDays: number, now: Date = new Date()): Promise<AnalyticsWindow> {
    const dealershipId = scope.dealershipIds?.length === 1 ? scope.dealershipIds[0] : undefined;
    const { timeZone } = await this.regional.resolve(dealershipId);
    const todayDate = zonedIsoDate(now, timeZone);
    const dayOf = (date: string): AnalyticsDay => ({ date, ...zonedDayWindow(date, timeZone) });
    const today = dayOf(todayDate);
    const days = Array.from({ length: periodDays - 1 }, (_, i) => dayOf(addIsoDays(todayDate, i - periodDays + 1)));
    return { now, today, days: [...days, today] };
  }
}
