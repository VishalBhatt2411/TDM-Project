import { InvalidValueError } from "../errors";
import { PhoneNumber } from "../value-objects";

/**
 * How one scope (a dealership, or company-wide) formats and schedules for its customers.
 * A dealership inherits each unset field from the company, and the company from the data
 * provider's own org defaults — see resolveRegionalSettings.
 */
export interface RegionalSettings {
  /** BCP 47 with a region, e.g. "en-IN" — the region part drives number/date formatting. */
  locale?: string;
  /** IANA zone, e.g. "Asia/Kolkata" — slot times, day boundaries and every displayed time use it. */
  timeZone?: string;
  /** Calling code digits without "+", e.g. "91" — prefixed to a phone number entered without one. */
  phoneCountryCode?: string;
}

/**
 * What the data provider's own org is configured with. Prices are stored in `currencyCode`
 * (the provider holds no per-dealership currency, so it's never a tenant override — relabelling
 * a stored amount with another currency would misstate it).
 */
export interface ProviderRegionalDefaults {
  locale: string;
  timeZone: string;
  currencyCode: string;
  /** Free-text country of the org's address — a hint for the admin, never used to guess a calling code. */
  country?: string;
}

export interface ResolvedRegionalSettings {
  locale: string;
  timeZone: string;
  currencyCode: string;
  /** Unset means phone numbers must be entered in full international format. */
  phoneCountryCode?: string;
}

const REGIONAL_KEYS = ["locale", "timeZone", "phoneCountryCode"] as const;
const CALLING_CODE = /^[1-9]\d{0,2}$/;
const MAX_LENGTH = 64;

/** Canonical BCP 47 tag with a region ("en-in" → "en-IN"), or throws. */
export function canonicalLocale(value: string): string {
  let canonical: string | undefined;
  try {
    canonical = Intl.getCanonicalLocales(value)[0];
  } catch {
    canonical = undefined;
  }
  if (!canonical) throw new InvalidValueError(`"${value}" is not a locale.`);
  if (!new Intl.Locale(canonical).region) throw new InvalidValueError(`Locale "${value}" needs a region, e.g. "en-IN".`);
  return canonical;
}

/** Canonical IANA zone name ("asia/kolkata" → "Asia/Kolkata"), or throws. */
/**
 * IANA renames that ICU still reports under the old name (CLDR keeps legacy IDs stable).
 * Both resolve identically; the current name is what admins search for and what data
 * providers such as Salesforce return, so it's the one stored and offered.
 */
const CURRENT_ZONE_NAMES: Readonly<Record<string, string>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
};

const currentZoneName = (zone: string) => CURRENT_ZONE_NAMES[zone] ?? zone;

export function canonicalTimeZone(value: string): string {
  try {
    return currentZoneName(new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone);
  } catch {
    throw new InvalidValueError(`"${value}" is not a time zone.`);
  }
}

/** Every IANA zone this runtime knows, by current name — what an admin picks a time zone from. */
export function supportedTimeZones(): string[] {
  return [...new Set(Intl.supportedValuesOf("timeZone").map(currentZoneName))].sort();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new InvalidValueError(`${path} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_LENGTH) throw new InvalidValueError(`${path} must be at most ${MAX_LENGTH} characters.`);
  return trimmed;
}

/**
 * Validates untrusted settings (an admin's request, or values stored in the data provider)
 * into canonical form: unknown fields are rejected, blank values dropped.
 */
export function parseRegionalSettings(raw: unknown): RegionalSettings {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) throw new InvalidValueError("Regional settings must be an object.");
  const unknown = Object.keys(raw).find((k) => !(REGIONAL_KEYS as readonly string[]).includes(k));
  if (unknown) throw new InvalidValueError(`Regional settings has an unknown field "${unknown}".`);

  const settings: RegionalSettings = {};
  const locale = optionalText(raw.locale, "locale");
  if (locale) settings.locale = canonicalLocale(locale);
  const timeZone = optionalText(raw.timeZone, "timeZone");
  if (timeZone) settings.timeZone = canonicalTimeZone(timeZone);
  const phoneCountryCode = optionalText(raw.phoneCountryCode, "phoneCountryCode")?.replace(/^\+/, "");
  if (phoneCountryCode) {
    if (!CALLING_CODE.test(phoneCountryCode)) throw new InvalidValueError("phoneCountryCode must be 1-3 digits, e.g. 91.");
    settings.phoneCountryCode = phoneCountryCode;
  }
  return settings;
}

/** Narrowest scope first: each field comes from the first layer that sets it, else the provider's defaults. */
export function resolveRegionalSettings(
  layers: readonly RegionalSettings[],
  defaults: ProviderRegionalDefaults,
): ResolvedRegionalSettings {
  const pick = <K extends keyof RegionalSettings>(key: K) => layers.find((layer) => layer[key])?.[key];
  const resolved: ResolvedRegionalSettings = {
    locale: pick("locale") ?? defaults.locale,
    timeZone: pick("timeZone") ?? defaults.timeZone,
    currencyCode: defaults.currencyCode,
  };
  const phoneCountryCode = pick("phoneCountryCode");
  if (phoneCountryCode) resolved.phoneCountryCode = phoneCountryCode;
  return resolved;
}

/**
 * A customer-entered phone number as E.164: kept as-is when it starts with "+", otherwise
 * prefixed with the calling code (dropping a national trunk "0"). Without a calling code a
 * number must be entered in full international format.
 */
export function phoneNumberFromInput(input: string, phoneCountryCode: string | undefined): PhoneNumber {
  const compact = input.trim().replace(/[\s().-]/g, "");
  if (compact.startsWith("+")) return PhoneNumber.create(compact);
  if (!phoneCountryCode) {
    throw new InvalidValueError("Enter the phone number in international format, starting with + and the country code.");
  }
  return PhoneNumber.create(`+${phoneCountryCode}${compact.replace(/^0+/, "")}`);
}
