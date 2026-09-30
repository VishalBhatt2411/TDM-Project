import { apiClient } from "@/lib/api-client";

export interface DealershipConfigDto {
  name: string;
  tagline?: string;
  logoText?: string;
  /** An https image URL; the header falls back to a generic mark without one. */
  logoUrl?: string;
  phone?: string;
  email?: string;
  address?: string;
  operatingHours?: string;
  primaryColorHex?: string;
  content: SiteContentConfigDto;
  regional: RegionalSettingsDto;
}

/** How the dealership (or company) this host serves formats and schedules — see useRegional. */
export interface RegionalSettingsDto {
  /** BCP 47 with a region, e.g. "en-IN". */
  locale: string;
  /** IANA zone, e.g. "Asia/Kolkata". */
  timeZone: string;
  /** ISO 4217 — the currency prices are stored in. */
  currencyCode: string;
  /** Calling code digits; absent means phone numbers are entered in full international format. */
  phoneCountryCode?: string;
}

/** Tenant home-page content. A copy key missing for a language falls back to the app's own translation. */
export interface SiteContentConfigDto {
  heroImageUrl?: string;
  /** Every home-page vehicle section, keyed by name, with whether it's shown. */
  sections: Record<string, boolean>;
  /** Copy per language code, then per copy key. */
  copy: Record<string, Record<string, string>>;
}

export async function getDealershipConfig(): Promise<DealershipConfigDto> {
  const { data } = await apiClient.get<DealershipConfigDto>("/config/dealership");
  return data;
}

/** Where an uploaded brand image (logo, hero) is served from — the path the API returns for it. */
export function brandAssetUrl(assetId: string): string {
  return `${apiClient.defaults.baseURL}/brand-assets/${encodeURIComponent(assetId)}`;
}
