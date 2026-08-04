import { CookieOptions, Response } from "express";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
} from "../auth/auth.constants";

// Scoped to the whole API (not just /admin) because staff-guarded routes also live
// outside that prefix — e.g. /api/v1/analytics — and still need the access-token
// cookie sent with every request.
const COOKIE_PATH = "/api/v1";

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Secure requires HTTPS; only enforced once the app is actually served over it.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
  };
}

/** Sets both staff auth cookies as HttpOnly — never readable from browser JavaScript. */
export function setStaffAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, { ...baseCookieOptions(), maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, { ...baseCookieOptions(), maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS });
}

/** Clears both staff auth cookies — used on logout. */
export function clearStaffAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, baseCookieOptions());
  res.clearCookie(REFRESH_TOKEN_COOKIE, baseCookieOptions());
}
