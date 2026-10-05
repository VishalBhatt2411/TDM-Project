import { CookieOptions, Response } from "express";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  OAUTH_STATE_TTL_MS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  STAFF_OAUTH_STATE_COOKIE,
} from "../auth/auth.constants";
import { env } from "../common/env";

// Scoped to the whole API (not just /admin) because staff-guarded routes also live
// outside that prefix — e.g. /api/v1/analytics — and still need the access-token
// cookie sent with every request.
const COOKIE_PATH = "/api/v1";

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Secure requires HTTPS — always on in production (common/env enforces https origins there).
    secure: env.isProduction,
    sameSite: "lax",
    path: COOKIE_PATH,
  };
}

/** Sets both staff auth cookies as HttpOnly — never readable from browser JavaScript. */
export function setStaffAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, { ...baseCookieOptions(), maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, { ...baseCookieOptions(), maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS });
}

// Only the OAuth endpoints ever need it, so it isn't sent with every API request.
const OAUTH_STATE_COOKIE_PATH = "/api/v1/admin/auth/salesforce";

/** Remembers which browser started a Salesforce login — checked again on the callback. */
export function setOAuthStateCookie(res: Response, state: string): void {
  res.cookie(STAFF_OAUTH_STATE_COOKIE, state, { ...baseCookieOptions(), path: OAUTH_STATE_COOKIE_PATH, maxAge: OAUTH_STATE_TTL_MS });
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(STAFF_OAUTH_STATE_COOKIE, { ...baseCookieOptions(), path: OAUTH_STATE_COOKIE_PATH });
}

/** Clears both staff auth cookies — used on logout. */
export function clearStaffAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, baseCookieOptions());
  res.clearCookie(REFRESH_TOKEN_COOKIE, baseCookieOptions());
}
