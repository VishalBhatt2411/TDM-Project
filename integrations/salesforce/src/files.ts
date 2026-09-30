/** Salesforce Files helpers shared by every adapter that stores binaries as ContentVersions. */
import { toEighteenCharId } from "./soql";

export const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
/** ContentDocument ids carry the `069` key prefix. */
const CONTENT_DOCUMENT_ID = /^069[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/;

/**
 * A well-formed ContentDocument id — for the 18-character form, including its checksum suffix.
 * Salesforce answers a query on an id with a wrong checksum with an error rather than no rows,
 * so an id must pass this before it reaches a query (public routes take ids from any caller).
 */
export function isContentDocumentId(id: string): boolean {
  if (!CONTENT_DOCUMENT_ID.test(id)) return false;
  return id.length === 15 || toEighteenCharId(id.slice(0, 15)).slice(15) === id.slice(15).toUpperCase();
}

export function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
