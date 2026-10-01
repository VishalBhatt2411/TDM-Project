import type { BrandAssetKind } from "@tdm/domain";
import { ALLOWED_IMAGE_CONTENT_TYPES } from "../common/image-signature";
import type { AllowedImageType } from "../common/image-signature";

/** Public route (under the global api/v1 prefix) that serves uploaded brand images. */
export const BRAND_ASSET_ROUTE = "brand-assets";
const API_PREFIX = "/api/v1";

/** Same-origin path customers load a brand image from; the tenant is taken from the request host. */
export function brandAssetPath(assetId: string): string {
  return `${API_PREFIX}/${BRAND_ASSET_ROUTE}/${encodeURIComponent(assetId)}`;
}

/**
 * Formats each image kind may be uploaded as. A logo also goes into emails, where WebP doesn't
 * render in every client (Outlook desktop), so it's limited to PNG and JPEG.
 */
export const BRAND_IMAGE_CONTENT_TYPES: Record<BrandAssetKind, readonly AllowedImageType[]> = {
  logo: ["image/png", "image/jpeg"],
  hero: ALLOWED_IMAGE_CONTENT_TYPES,
};

/**
 * Decoded size caps per image kind — a hero is a full-width photo, a logo is a small mark. The hero
 * cap keeps the base64 upload body under a serverless host's ~4.5 MB request limit; the admin
 * console downscales larger files to fit before uploading.
 */
export const MAX_BRAND_IMAGE_BYTES = { logo: 1024 * 1024, hero: 3 * 1024 * 1024 } as const;
