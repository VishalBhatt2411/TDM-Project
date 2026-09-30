import { ProviderRegionalDefaults, TimeWindow, WEEKDAYS, WeeklyHours } from "@tdm/domain";
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
