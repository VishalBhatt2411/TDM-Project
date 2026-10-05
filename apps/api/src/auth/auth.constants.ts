/**
 * Single source of truth for authentication timing values and identifiers shared by
 * both the customer-facing auth module (./auth) and the staff/admin console auth
 * module (../admin). Do not redefine any of these values locally — import from here.
 */

// --- Token lifetimes (shared by customer + staff JWTs) ---
export const ACCESS_TOKEN_TTL = "15m";
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL = "7d";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// --- Staff "Login with Salesforce" OAuth2/PKCE flow ---
// How long a pending authorization (state + PKCE code_verifier, stored server-side —
// see StaffOAuthStateRepository) may be completed before it must be restarted.
export const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
// Binds a pending authorization to the browser that started it: the callback only proceeds if its
// `state` matches this cookie, so a victim can't be signed in with an attacker's authorization code.
export const STAFF_OAUTH_STATE_COOKIE = "tdm_staff_oauth";

// --- Staff auth cookies (HttpOnly — never readable from browser JS) ---
export const ACCESS_TOKEN_COOKIE = "tdm_staff_at";
export const REFRESH_TOKEN_COOKIE = "tdm_staff_rt";
export const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = ACCESS_TOKEN_TTL_SECONDS * 1000;
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = REFRESH_TOKEN_TTL_MS;

// --- Platform operator console (/platform) — cross-tenant, so short-lived and never refreshed ---
export const PLATFORM_OPERATOR_COOKIE = "tdm_platform_op";
export const PLATFORM_OPERATOR_SESSION_TTL_SECONDS = 30 * 60;

// --- JWT scopes ---
// A customer token can never pass StaffAuthGuard and a staff token can never pass
// JwtAuthGuard, even though both are structurally valid JWTs signed with the same
// secret — this is the field that keeps the two identity spaces from crossing over.
export const AUTH_SCOPE = {
  CUSTOMER: "customer",
  STAFF: "staff",
  CHECKIN: "checkin",
  PLATFORM_OPERATOR: "platform_operator",
} as const;
// --- JWT token types ---
// Access and refresh tokens carry the same identity payload and are signed with the same secret,
// so `typ` is what stops a long-lived refresh token being replayed as a bearer access token
// (which would outlive logout/revocation, since access tokens are never looked up in the database).
// A refresh token minted before `typ` existed carries none and is still honoured by /refresh only.
export const TOKEN_TYPE = { ACCESS: "access", REFRESH: "refresh" } as const;

export type AuthScope = (typeof AUTH_SCOPE)[keyof typeof AUTH_SCOPE];

// --- QR check-in token (customer-generated, staff-scanned at the booking) ---
// Deliberately long-lived relative to a single slot: a customer may open their booking
// and show the code any time on the day of the drive, not only in the exact 30-minute
// window, and clock skew between issue and scan should never cause a spurious failure.
export const CHECKIN_TOKEN_TTL_SECONDS = 12 * 60 * 60;
