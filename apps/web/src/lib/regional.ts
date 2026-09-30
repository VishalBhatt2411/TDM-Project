import { zonedIsoDate } from "@tdm/types";
import type { RegionalSettingsDto } from "@/api/config";

type DateInput = string | number | Date;

/**
 * The locale values are formatted in: the UI language with the tenant's region, so a Hindi
 * speaker at an "en-IN" dealership gets "hi-IN" (Indian digit grouping, Hindi month names).
 * The tenant's own locale is kept whole when the language already matches it.
 */
export function formattingLocale(language: string | undefined, tenantLocale: string | undefined): string | undefined {
  if (!tenantLocale || !language) return tenantLocale ?? language;
  try {
    const tenant = new Intl.Locale(tenantLocale);
    const ui = new Intl.Locale(language);
    if (ui.language === tenant.language) return tenantLocale;
    return tenant.region ? `${ui.language}-${tenant.region}` : language;
  } catch {
    return tenantLocale;
  }
}

/**
 * Formats values the way the tenant's customers expect. Times are always written in a
 * dealership's zone (the one passed, else the tenant's), never the browser's — a drive
 * booked for 10:00 at the showroom reads 10:00 from anywhere. Until the tenant's settings
 * load, it falls back to the browser's own locale and zone.
 */
export interface RegionalFormatter {
  locale?: string;
  timeZone?: string;
  currencyCode?: string;
  phoneCountryCode?: string;
  /** `currency` defaults to the tenant's; a bare number is shown when neither is known yet. */
  money(amount: number, currency?: string): string;
  dateTime(value: DateInput, timeZone?: string): string;
  /** A time of day for display, in the locale's own style ("9:30 AM", "09:30"). */
  time(value: DateInput, timeZone?: string): string;
  /** Wall-clock "HH:mm" (24-hour) — for matching against slot times like "09:30". */
  wallTime(value: DateInput, timeZone?: string): string;
  /** Today's date ("YYYY-MM-DD") in the zone. */
  today(timeZone?: string): string;
}

export function createRegionalFormatter(settings: RegionalSettingsDto | undefined, language: string | undefined): RegionalFormatter {
  const locale = formattingLocale(language, settings?.locale);
  const zoneOf = (timeZone?: string) => timeZone ?? settings?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    locale,
    timeZone: settings?.timeZone,
    currencyCode: settings?.currencyCode,
    phoneCountryCode: settings?.phoneCountryCode,
    money(amount, currency = settings?.currencyCode) {
      const options: Intl.NumberFormatOptions = currency
        ? { style: "currency", currency, maximumFractionDigits: 0 }
        : { maximumFractionDigits: 0 };
      return new Intl.NumberFormat(locale, options).format(amount);
    },
    dateTime(value, timeZone) {
      return new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: zoneOf(timeZone) });
    },
    time(value, timeZone) {
      return new Date(value).toLocaleTimeString(locale, { timeStyle: "short", timeZone: zoneOf(timeZone) });
    },
    wallTime(value, timeZone) {
      return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zoneOf(timeZone) });
    },
    today(timeZone) {
      return zonedIsoDate(new Date(), zoneOf(timeZone));
    },
  };
}
