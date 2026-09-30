/** Reporting periods the dashboard offers, in days. */
export const ANALYTICS_PERIOD_DAYS = [7, 14, 30, 90] as const;
export type AnalyticsPeriodDays = (typeof ANALYTICS_PERIOD_DAYS)[number];
export const DEFAULT_ANALYTICS_PERIOD_DAYS: AnalyticsPeriodDays = 30;

/** Days without booking activity after which a customer counts as dormant. */
export const DORMANT_AFTER_DAYS_OPTIONS = [30, 60, 90, 180, 365] as const;
export const DEFAULT_DORMANT_AFTER_DAYS = 90;
