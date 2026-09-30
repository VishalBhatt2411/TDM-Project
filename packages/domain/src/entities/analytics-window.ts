/** One calendar day of the reporting period, as the instants it spans in the tenant's time zone. */
export interface AnalyticsDay {
  /** "YYYY-MM-DD" in the tenant's time zone. */
  date: string;
  start: Date;
  /** Inclusive. */
  end: Date;
}

/**
 * The instants a dashboard reads, already resolved in the tenant's time zone — a data provider
 * compares against these rather than its own notion of "today" (e.g. its integration user's zone).
 */
export interface AnalyticsWindow {
  now: Date;
  today: AnalyticsDay;
  /** Every day of the period, oldest first; the last one is today. */
  days: AnalyticsDay[];
}

export function analyticsPeriodStart(window: AnalyticsWindow): Date {
  return window.days[0]?.start ?? window.today.start;
}
