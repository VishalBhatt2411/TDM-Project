/**
 * An error reduced to what is safe to log: its code or class, never its message — data-provider
 * messages routinely echo field values (addresses, phone numbers, duplicate-rule matches).
 */
export function errorCodeOf(err: unknown): string {
  const e = err as { errorCode?: unknown; code?: unknown; name?: unknown } | null;
  for (const candidate of [e?.errorCode, e?.code, e?.name]) {
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return "UNKNOWN";
}
