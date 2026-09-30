import { Closure, ProviderRegionalDefaults, TimeWindow, WEEKDAYS, WeeklyHours, formatWallTime } from "@tdm/domain";
import { Connection } from "jsforce";
import { SalesforceConnectionSource } from "./connection-source";

/** Org-level settings change rarely (Setup → Company Information); re-read at most this often. */
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 1000;

const cache = new Map<string, { defaults: ProviderRegionalDefaults; expiresAt: number }>();

/**
 * Salesforce locale keys are "<language>_<REGION>" with optional script/variant parts
 * ("en_IN", "zh_Hant_TW", "de_DE_EURO"); BCP 47 wants hyphens and no legacy variants.
 */
export function salesforceLocaleToBcp47(sidKey: string): string {
  const [language = "", ...rest] = sidKey.split("_");
  const script = rest.find((part) => /^[A-Z][a-z]{3}$/.test(part));
  const region = rest.find((part) => /^([A-Z]{2}|\d{3})$/.test(part));
  const candidates = [[language, script, region], [language, region]].map((parts) => parts.filter(Boolean).join("-"));
  for (const candidate of candidates) {
    try {
      const canonical = Intl.getCanonicalLocales(candidate)[0];
      if (canonical) return canonical;
    } catch {
      // Try the next, simpler form.
    }
  }
  return "en";
}

async function queryDefaults(conn: Connection): Promise<ProviderRegionalDefaults> {
  // Organization.DefaultCurrencyIsoCode exists only in multi-currency orgs; the SOAP user-info
  // call reports the org currency (the corporate one when multi-currency) in either kind of org.
  const [result, userInfo] = await Promise.all([
    conn.query<any>("SELECT DefaultLocaleSidKey, TimeZoneSidKey, Country FROM Organization LIMIT 1"),
    conn.soap.getUserInfo(),
  ]);
  const org = result.records[0];
  if (!org) throw new Error("Salesforce returned no Organization record.");
  if (!userInfo.orgDefaultCurrencyIsoCode) throw new Error("Salesforce reported no org currency.");
  return {
    locale: salesforceLocaleToBcp47(org.DefaultLocaleSidKey ?? ""),
    timeZone: org.TimeZoneSidKey,
    currencyCode: userInfo.orgDefaultCurrencyIsoCode,
    ...(org.Country ? { country: org.Country } : {}),
  };
}

/** The connected org's locale, time zone and currency (Setup → Company Information), cached per org. */
export async function orgRegionalDefaults(provider: SalesforceConnectionSource, conn: Connection): Promise<ProviderRegionalDefaults> {
  const orgId = await provider.getSalesforceOrgId();
  const cached = cache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached.defaults;
  const defaults = await queryDefaults(conn);
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(orgId, { defaults, expiresAt: Date.now() + CACHE_TTL_MS });
  return defaults;
}

const hoursCache = new Map<string, { hours: WeeklyHours; expiresAt: number }>();

/** A Salesforce Time value ("09:30:00.000Z") as "HH:MM". */
function wallTimeOf(value: string): string {
  return value.slice(0, 5);
}

/**
 * One weekday of BusinessHours: no start time is closed; 00:00 to 00:00 is open all day
 * ("24 hours" in Setup); an end of 00:00 otherwise means midnight at the end of the day.
 */
function dayWindow(start: string | null, end: string | null): TimeWindow | null {
  if (!start || !end) return null;
  const endTime = wallTimeOf(end);
  return { start: wallTimeOf(start), end: endTime === "00:00" ? "24:00" : endTime };
}

async function queryBusinessHours(conn: Connection): Promise<WeeklyHours> {
  const columns = WEEKDAYS.map((day) => {
    const name = day[0]!.toUpperCase() + day.slice(1);
    return `${name}StartTime, ${name}EndTime`;
  }).join(", ");
  const record = (await conn.query<any>(`SELECT ${columns} FROM BusinessHours WHERE IsDefault = true AND IsActive = true LIMIT 1`)).records[0];
  if (!record) throw new Error("Salesforce returned no active default BusinessHours record.");
  return Object.fromEntries(
    WEEKDAYS.map((day) => {
      const name = day[0]!.toUpperCase() + day.slice(1);
      return [day, dayWindow(record[`${name}StartTime`], record[`${name}EndTime`])];
    }),
  ) as WeeklyHours;
}

/** The connected org's default business hours (Setup → Business Hours), cached per org. */
export async function orgBusinessHours(provider: SalesforceConnectionSource, conn: Connection): Promise<WeeklyHours> {
  const orgId = await provider.getSalesforceOrgId();
  const cached = hoursCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached.hours;
  const hours = await queryBusinessHours(conn);
  if (hoursCache.size >= MAX_CACHE_ENTRIES) hoursCache.clear();
  hoursCache.set(orgId, { hours, expiresAt: Date.now() + CACHE_TTL_MS });
  return hours;
}

const holidaysCache = new Map<string, { closures: Closure[]; expiresAt: number }>();
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const INSTANCES = ["First", "Second", "Third", "Fourth"];
/** How many calendar years of recurring holidays to expand, from this one. */
const HOLIDAY_YEARS = 2;

const isoDate = (year: number, monthIndex: number, day: number) => new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);

/** The Nth (or last) weekday named by a single-day `mask` (Sunday = 1 … Saturday = 64) of a month. */
function nthWeekdayOfMonth(year: number, monthIndex: number, instance: string, mask: number): string | null {
  const weekday = Math.log2(mask);
  if (!Number.isInteger(weekday) || weekday > 6) return null;
  const dates: number[] = [];
  for (let day = 1; day <= 31; day++) {
    const date = new Date(Date.UTC(year, monthIndex, day));
    if (date.getUTCMonth() !== monthIndex) break;
    if (date.getUTCDay() === weekday) dates.push(day);
  }
  const day = instance === "Last" ? dates.at(-1) : dates[INSTANCES.indexOf(instance)];
  return day ? isoDate(year, monthIndex, day) : null;
}

/** A Holiday's dates this year and next: one-off, or yearly on a fixed date or the Nth weekday of a month. */
function holidayDates(record: any, thisYear: number): string[] {
  if (!record.IsRecurrence) return record.ActivityDate ? [record.ActivityDate] : [];
  const monthIndex = MONTHS.indexOf(record.RecurrenceMonthOfYear);
  if (monthIndex < 0) return [];
  const dates: string[] = [];
  for (let year = thisYear; year < thisYear + HOLIDAY_YEARS; year++) {
    const date =
      record.RecurrenceType === "RecursYearly"
        ? isoDate(year, monthIndex, record.RecurrenceDayOfMonth)
        : record.RecurrenceType === "RecursYearlyNth"
          ? nthWeekdayOfMonth(year, monthIndex, record.RecurrenceInstance, record.RecurrenceDayOfWeekMask)
          : null;
    if (!date) continue;
    if (record.RecurrenceStartDate && date < record.RecurrenceStartDate) continue;
    if (record.RecurrenceEndDateOnly && date > record.RecurrenceEndDateOnly) continue;
    dates.push(date);
  }
  return dates;
}

async function queryHolidays(conn: Connection): Promise<Closure[]> {
  const { records } = await conn.query<any>(
    "SELECT Id, Name, ActivityDate, IsAllDay, StartTimeInMinutes, EndTimeInMinutes, IsRecurrence, RecurrenceType, " +
      "RecurrenceStartDate, RecurrenceEndDateOnly, RecurrenceMonthOfYear, RecurrenceDayOfMonth, RecurrenceInstance, RecurrenceDayOfWeekMask FROM Holiday",
  );
  const thisYear = new Date().getUTCFullYear();
  return records.flatMap((record) => {
    if (record.IsRecurrence && record.RecurrenceType !== "RecursYearly" && record.RecurrenceType !== "RecursYearlyNth") {
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({ event: "holiday_recurrence_unsupported", holidayId: record.Id, recurrenceType: record.RecurrenceType }));
      return [];
    }
    const hours =
      record.IsAllDay || record.StartTimeInMinutes == null || record.EndTimeInMinutes == null
        ? {}
        : { start: formatWallTime(record.StartTimeInMinutes), end: formatWallTime(record.EndTimeInMinutes || 24 * 60) };
    return holidayDates(record, thisYear).map((date): Closure => ({ date, ...(record.Name ? { name: record.Name } : {}), ...hours }));
  });
}

/**
 * The connected org's holidays (Setup → Holidays) as closures, cached per org. Salesforce
 * doesn't expose which Business Hours a holiday is attached to, so every holiday in the org counts.
 */
export async function orgHolidays(provider: SalesforceConnectionSource, conn: Connection): Promise<Closure[]> {
  const orgId = await provider.getSalesforceOrgId();
  const cached = holidaysCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached.closures;
  const closures = await queryHolidays(conn);
  if (holidaysCache.size >= MAX_CACHE_ENTRIES) holidaysCache.clear();
  holidaysCache.set(orgId, { closures, expiresAt: Date.now() + CACHE_TTL_MS });
  return closures;
}
