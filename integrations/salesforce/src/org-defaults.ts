import { ProviderRegionalDefaults } from "@tdm/domain";
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
