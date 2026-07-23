import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashSecret(plaintext: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(plaintext, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifySecret(plaintext: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derivedKey = (await scryptAsync(plaintext, salt, KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(hashHex, "hex");
  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}

export function generateOtpCode(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/**
 * Deterministic digest for values that must be looked up by exact match (e.g. refresh
 * tokens keyed by `(customerId, tokenHash)`). Unlike hashSecret (randomly salted, for
 * passwords/OTP verified via compare), this must produce the same output every time
 * for the same input, or an exact-match DB lookup can never succeed.
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
