/**
 * Client-side image preparation for base64 JSON uploads. Phone photos routinely exceed what a
 * request body may carry (the serverless host caps it at ~4.5 MB, and base64 adds a third), so an
 * image over its byte budget or dimension cap is decoded, scaled down and re-encoded before upload.
 */

export interface ImageBudget {
  /** Largest acceptable encoded size, in bytes. */
  maxBytes: number;
  /** Longest edge, in pixels, the uploaded image may have. */
  maxDimension: number;
}

export interface PreparedImage {
  blob: Blob;
  contentType: string;
}

/** Above this the decode itself risks exhausting memory on low-end phones, so refuse outright. */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const LOSSY_TYPES = new Set(["image/jpeg", "image/webp"]);
const QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66];
const SHRINK_FACTOR = 0.8;
const MAX_SHRINKS = 6;

export class ImageTooLargeError extends Error {
  constructor() {
    super("This image is too large to upload. Please choose a smaller photo.");
    this.name = "ImageTooLargeError";
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process the image."))), type, quality),
  );
}

/**
 * Returns the file unchanged when it already fits the budget; otherwise a scaled, re-encoded copy
 * in the same format (PNG stays lossless so a logo keeps its transparency).
 */
export async function prepareImageForUpload(file: File, budget: ImageBudget): Promise<PreparedImage> {
  if (file.size > MAX_SOURCE_BYTES) throw new ImageTooLargeError();

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This file couldn't be read as an image.");
  });
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (file.size <= budget.maxBytes && longest <= budget.maxDimension) return { blob: file, contentType: file.type };

    const lossy = LOSSY_TYPES.has(file.type);
    let scale = Math.min(1, budget.maxDimension / longest);
    for (let shrink = 0; shrink <= MAX_SHRINKS; shrink += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Couldn't process the image.");
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of lossy ? QUALITY_STEPS : [undefined]) {
        const blob = await encode(canvas, file.type, quality);
        // A browser that can't encode the source format falls back to PNG; keep the type honest.
        if (blob.size <= budget.maxBytes) return { blob, contentType: blob.type || file.type };
      }
      scale *= SHRINK_FACTOR;
    }
    throw new ImageTooLargeError();
  } finally {
    bitmap.close();
  }
}

/** Base64 payload (without the data: prefix) of a file or blob. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file."));
    reader.readAsDataURL(blob);
  });
}
