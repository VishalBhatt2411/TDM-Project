/** Raster formats only — SVG can carry script, so it is never accepted as an uploaded image. */
export const ALLOWED_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

/**
 * Checks a decoded upload's leading "magic bytes" against the content type the client
 * declared, so a mislabelled or non-image payload is rejected before it is stored and
 * later served back with that Content-Type.
 */
export function matchesImageSignature(data: Buffer, contentType: string): boolean {
  switch (contentType as AllowedImageType) {
    case "image/jpeg":
      return data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case "image/png":
      return data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp":
      return data.length > 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
    default:
      return false;
  }
}
