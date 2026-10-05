import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended nonce length for GCM
const KEY_LENGTH = 32; // AES-256
const AUTH_TAG_LENGTH = 16; // full 128-bit GCM tag

/**
 * Reversible encryption for secrets that must be read back in full (a Salesforce
 * refresh token, a Connected App consumer secret) — unlike hashSecret/verifySecret
 * in hash.ts, which are one-way and only ever compared, never decrypted.
 */
export function encryptSecret(plaintext: string, masterKeyHex: string): string {
  const key = parseMasterKey(masterKeyHex);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSecret(stored: string, masterKeyHex: string): string {
  const key = parseMasterKey(masterKeyHex);
  const [ivHex, authTagHex, cipherHex] = stored.split(":");
  if (!ivHex || !authTagHex || !cipherHex) {
    throw new Error("Malformed encrypted secret — expected \"iv:authTag:cipher\" hex format.");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  // Node would otherwise accept a truncated tag (down to 4 bytes), weakening the integrity check.
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Malformed encrypted secret — unexpected IV or auth tag length.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(Buffer.from(cipherHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}

function parseMasterKey(masterKeyHex: string): Buffer {
  const key = Buffer.from(masterKeyHex, "hex");
  if (key.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be a ${KEY_LENGTH * 2}-character hex string (${KEY_LENGTH} bytes).`);
  }
  return key;
}
