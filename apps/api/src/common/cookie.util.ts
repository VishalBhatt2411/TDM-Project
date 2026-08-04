/**
 * Minimal, dependency-free `Cookie` request-header parser. Writing cookies needs no
 * library at all (Express's built-in `res.cookie()`/`res.clearCookie()` handle
 * serialization); this only covers the read side, which Express itself does not
 * parse without the separate `cookie-parser` middleware.
 */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = part.slice(0, separatorIndex).trim();
    if (!key) continue;

    const rawValue = part.slice(separatorIndex + 1).trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }

  return cookies;
}
