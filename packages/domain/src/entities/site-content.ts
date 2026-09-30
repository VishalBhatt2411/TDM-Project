import { InvalidValueError } from "../errors";
import type { DealershipBranding } from "./dealership";

/** Customer home-page copy a tenant can override; each key falls back to the app's own translation when unset. */
export const SITE_COPY_FIELDS = {
  heroTitle: 120,
  heroSubtitle: 300,
  feature1Title: 80,
  feature1Body: 300,
  feature2Title: 80,
  feature2Body: 300,
  feature3Title: 80,
  feature3Body: 300,
  ctaTitle: 120,
  ctaSubtitle: 300,
} as const satisfies Record<string, number>;

export type SiteCopyKey = keyof typeof SITE_COPY_FIELDS;
export type SiteCopy = Partial<Record<SiteCopyKey, string>>;

/** Home-page vehicle sections a tenant can hide; each is shown unless explicitly turned off. */
export const SITE_SECTION_KEYS = ["featured", "bestSellers", "newLaunches"] as const;
export type SiteSectionKey = (typeof SITE_SECTION_KEYS)[number];

export const MAX_SITE_LANGUAGES = 10;
/** BCP 47 language, optionally with a region: "en", "hi", "en-IN". */
const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
/** Provider asset ids are opaque to the domain — only their shape is bounded. */
const ASSET_ID = /^[A-Za-z0-9_-]{1,64}$/;
const HTTPS_URL = /^https:\/\/[^\s"'<>]+$/;
const MAX_URL_LENGTH = 1000;

/** Tenant-authored home-page content, stored alongside a dealership's (or the company's) branding. */
export interface SiteContent {
  /** Uploaded logo — mutually exclusive with DealershipBranding.logoUrl. */
  logoAssetId?: string;
  heroImageUrl?: string;
  /** Uploaded hero image — mutually exclusive with heroImageUrl. */
  heroImageAssetId?: string;
  sections?: Partial<Record<SiteSectionKey, boolean>>;
  /** Copy per language code. */
  copy?: Record<string, SiteCopy>;
}

/** Everything one scope (a dealership, or company-wide) sets for its customer-facing brand. */
export interface BrandLayer {
  branding: DealershipBranding;
  content: SiteContent;
}

export const EMPTY_BRAND_LAYER: BrandLayer = Object.freeze({ branding: {}, content: {} }) as BrandLayer;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(value).find((k) => !allowed.includes(k));
  if (unknown) throw new InvalidValueError(`${path} has an unknown field "${unknown}".`);
}

function optionalString(value: unknown, path: string, maxLength: number, pattern?: RegExp): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new InvalidValueError(`${path} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) throw new InvalidValueError(`${path} must be at most ${maxLength} characters.`);
  if (pattern && !pattern.test(trimmed)) throw new InvalidValueError(`${path} is not valid.`);
  return trimmed;
}

function parseCopy(value: unknown, path: string): SiteCopy | undefined {
  if (!isPlainObject(value)) throw new InvalidValueError(`${path} must be an object.`);
  const keys = Object.keys(SITE_COPY_FIELDS) as SiteCopyKey[];
  rejectUnknownKeys(value, keys, path);
  const copy: SiteCopy = {};
  for (const key of keys) {
    const text = optionalString(value[key], `${path}.${key}`, SITE_COPY_FIELDS[key]);
    if (text) copy[key] = text;
  }
  return Object.keys(copy).length > 0 ? copy : undefined;
}

/**
 * Validates untrusted site content (an admin's request, or JSON stored by the data provider)
 * into a normalized SiteContent: unknown fields are rejected, blank strings dropped.
 */
export function parseSiteContent(raw: unknown): SiteContent {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) throw new InvalidValueError("Site content must be an object.");
  rejectUnknownKeys(raw, ["logoAssetId", "heroImageUrl", "heroImageAssetId", "sections", "copy"], "Site content");

  const content: SiteContent = {};
  const logoAssetId = optionalString(raw.logoAssetId, "logoAssetId", 64, ASSET_ID);
  if (logoAssetId) content.logoAssetId = logoAssetId;
  const heroImageUrl = optionalString(raw.heroImageUrl, "heroImageUrl", MAX_URL_LENGTH, HTTPS_URL);
  const heroImageAssetId = optionalString(raw.heroImageAssetId, "heroImageAssetId", 64, ASSET_ID);
  if (heroImageUrl && heroImageAssetId) throw new InvalidValueError("Use either a hero image URL or an uploaded hero image, not both.");
  if (heroImageUrl) content.heroImageUrl = heroImageUrl;
  if (heroImageAssetId) content.heroImageAssetId = heroImageAssetId;

  if (raw.sections !== undefined && raw.sections !== null) {
    if (!isPlainObject(raw.sections)) throw new InvalidValueError("sections must be an object.");
    rejectUnknownKeys(raw.sections, SITE_SECTION_KEYS, "sections");
    const sections: Partial<Record<SiteSectionKey, boolean>> = {};
    for (const key of SITE_SECTION_KEYS) {
      const shown = raw.sections[key];
      if (shown === undefined || shown === null) continue;
      if (typeof shown !== "boolean") throw new InvalidValueError(`sections.${key} must be true or false.`);
      sections[key] = shown;
    }
    if (Object.keys(sections).length > 0) content.sections = sections;
  }

  if (raw.copy !== undefined && raw.copy !== null) {
    if (!isPlainObject(raw.copy)) throw new InvalidValueError("copy must be an object keyed by language.");
    const languages = Object.keys(raw.copy);
    if (languages.length > MAX_SITE_LANGUAGES) throw new InvalidValueError(`copy supports at most ${MAX_SITE_LANGUAGES} languages.`);
    const copy: Record<string, SiteCopy> = {};
    for (const language of languages) {
      if (!LANGUAGE_CODE.test(language)) throw new InvalidValueError(`"${language}" is not a language code.`);
      const parsed = parseCopy(raw.copy[language], `copy.${language}`);
      if (parsed) copy[language] = parsed;
    }
    if (Object.keys(copy).length > 0) content.copy = copy;
  }
  return content;
}

/** Asset ids a layer references — what must be verified on save and cleaned up when replaced. */
export function brandLayerAssetIds(layer: BrandLayer): string[] {
  return [layer.content.logoAssetId, layer.content.heroImageAssetId].filter((id): id is string => !!id);
}

/**
 * Overlays a narrower layer (a dealership's) on a wider one (the company's), field by field.
 * An image counts as one field whether set as a URL or an upload, so a dealership's logo URL
 * replaces a company-uploaded logo rather than competing with it.
 */
export function mergeBrandLayers(base: BrandLayer, override: BrandLayer): BrandLayer {
  const branding: DealershipBranding = { ...base.branding };
  for (const [key, value] of Object.entries(override.branding) as [keyof DealershipBranding, string | undefined][]) {
    if (value) branding[key] = value;
  }

  const content: SiteContent = {};
  const overridesLogo = !!(override.branding.logoUrl || override.content.logoAssetId);
  const logoSource = overridesLogo ? override : base;
  branding.logoUrl = logoSource.branding.logoUrl;
  if (logoSource.content.logoAssetId) content.logoAssetId = logoSource.content.logoAssetId;
  if (!branding.logoUrl) delete branding.logoUrl;

  const heroSource = override.content.heroImageUrl || override.content.heroImageAssetId ? override.content : base.content;
  if (heroSource.heroImageUrl) content.heroImageUrl = heroSource.heroImageUrl;
  if (heroSource.heroImageAssetId) content.heroImageAssetId = heroSource.heroImageAssetId;

  const sections = { ...base.content.sections, ...override.content.sections };
  if (Object.keys(sections).length > 0) content.sections = sections;

  const languages = new Set([...Object.keys(base.content.copy ?? {}), ...Object.keys(override.content.copy ?? {})]);
  if (languages.size > 0) {
    content.copy = {};
    for (const language of languages) {
      content.copy[language] = { ...base.content.copy?.[language], ...override.content.copy?.[language] };
    }
  }
  return { branding, content };
}
