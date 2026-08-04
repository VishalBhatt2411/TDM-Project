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

// --- Staff auth cookies (HttpOnly — never readable from browser JS) ---
export const ACCESS_TOKEN_COOKIE = "tdm_staff_at";
export const REFRESH_TOKEN_COOKIE = "tdm_staff_rt";
export const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = ACCESS_TOKEN_TTL_SECONDS * 1000;
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = REFRESH_TOKEN_TTL_MS;

// --- JWT scopes ---
// A customer token can never pass StaffAuthGuard and a staff token can never pass
// JwtAuthGuard, even though both are structurally valid JWTs signed with the same
// secret — this is the field that keeps the two identity spaces from crossing over.
export const AUTH_SCOPE = {
  CUSTOMER: "customer",
  STAFF: "staff",
} as const;
export type AuthScope = (typeof AUTH_SCOPE)[keyof typeof AUTH_SCOPE];
