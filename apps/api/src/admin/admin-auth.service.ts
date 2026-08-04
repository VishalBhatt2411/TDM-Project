import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { SalesforceIdentityProvider } from "@tdm/salesforce-adapter";
import {
  sha256Hex,
  StaffOAuthStateRepository,
  StaffRefreshTokenRepository,
  StaffRole,
  StaffUserRepository,
} from "@tdm/postgres-adapter";
import {
  SALESFORCE_IDENTITY_PROVIDER,
  STAFF_OAUTH_STATE_REPOSITORY,
  STAFF_REFRESH_TOKEN_REPOSITORY,
  STAFF_USER_REPOSITORY,
} from "../infrastructure/tokens";
import { ACCESS_TOKEN_TTL, ACCESS_TOKEN_TTL_SECONDS, AUTH_SCOPE, OAUTH_STATE_TTL_MS, REFRESH_TOKEN_TTL, REFRESH_TOKEN_TTL_MS } from "../auth/auth.constants";

/** Public, stable error codes — the only thing ever exposed to the browser. Never a raw exception message. */
export const AdminAuthErrorCode = {
  INVALID_STATE: "invalid_state",
  NOT_PROVISIONED: "not_provisioned",
  INACTIVE: "inactive",
  EXCHANGE_FAILED: "exchange_failed",
  INTERNAL_ERROR: "internal_error",
} as const;
export type AdminAuthErrorCode = (typeof AdminAuthErrorCode)[keyof typeof AdminAuthErrorCode];

export interface StaffTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type SalesforceCallbackResult = ({ ok: true } & StaffTokenPair) | { ok: false; error: AdminAuthErrorCode };

export interface StaffProfile {
  staffUserId: string;
  role: StaffRole;
  permissions: string[];
}

/**
 * Staff (Admin/Manager/Sales Rep) authenticate with their real Salesforce identity
 * via OAuth2 Authorization Code flow — this app never sees or stores a Salesforce
 * password. Console access/permissions are still governed entirely by StaffUser
 * (role + permissions), matched by the email Salesforce's identity endpoint returns.
 *
 * Access/refresh tokens are handed back to the controller as plain strings — this
 * service has no knowledge of cookies/HTTP transport (that's AdminAuthController's
 * job), keeping it framework-transport-agnostic and easy to unit test.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @Inject(STAFF_USER_REPOSITORY) private readonly staffUsers: StaffUserRepository,
    @Inject(STAFF_REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: StaffRefreshTokenRepository,
    @Inject(STAFF_OAUTH_STATE_REPOSITORY) private readonly oauthStates: StaffOAuthStateRepository,
    @Inject(SALESFORCE_IDENTITY_PROVIDER) private readonly identityProvider: SalesforceIdentityProvider,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * `state` is now just an opaque, random, single-use lookup key (CSRF protection) —
   * the PKCE code_verifier it maps to is stored server-side (StaffOAuthStateRepository),
   * never round-tripped through the browser. Keeps the authorization URL short and
   * keeps the verifier out of browser history/referrer headers/access logs.
   */
  async buildAuthorizationUrl(): Promise<string> {
    const codeVerifier = this.identityProvider.generateCodeVerifier();
    const state = randomBytes(24).toString("hex");
    await this.oauthStates.save(state, codeVerifier, new Date(Date.now() + OAUTH_STATE_TTL_MS));
    return this.identityProvider.buildAuthorizationUrl(state, codeVerifier);
  }

  async handleCallback(code: string, state: string): Promise<SalesforceCallbackResult> {
    try {
      const codeVerifier = await this.oauthStates.consume(state);
      if (!codeVerifier) {
        this.logger.warn(JSON.stringify({ event: "admin_oauth_invalid_state", provider: "salesforce" }));
        return { ok: false, error: AdminAuthErrorCode.INVALID_STATE };
      }

      let identity;
      try {
        identity = await this.identityProvider.exchangeCodeForIdentity(code, codeVerifier);
      } catch (err) {
        this.logger.error(
          JSON.stringify({ event: "admin_oauth_exchange_failed", provider: "salesforce", reason: (err as Error).message }),
        );
        return { ok: false, error: AdminAuthErrorCode.EXCHANGE_FAILED };
      }

      const staff = await this.staffUsers.findByEmail(identity.email);
      if (!staff) {
        this.logger.warn(
          JSON.stringify({ event: "admin_login_denied", provider: "salesforce", email: identity.email, reason: "not_provisioned" }),
        );
        return { ok: false, error: AdminAuthErrorCode.NOT_PROVISIONED };
      }
      if (!staff.isActive) {
        this.logger.warn(
          JSON.stringify({ event: "admin_login_denied", provider: "salesforce", userId: staff.id, reason: "inactive" }),
        );
        return { ok: false, error: AdminAuthErrorCode.INACTIVE };
      }
      if (!staff.salesforceUserId) {
        await this.staffUsers.linkSalesforceUserId(staff.id, identity.salesforceUserId);
      }

      this.logger.log(JSON.stringify({ event: "admin_login_success", provider: "salesforce", userId: staff.id }));
      return { ok: true, ...(await this.issueTokens(staff.id, staff.role)) };
    } catch (err) {
      // Defense in depth: any unexpected failure (DB outage, etc.) must still map to
      // a generic code — never leak a stack trace or provider-specific message.
      this.logger.error(
        JSON.stringify({ event: "admin_oauth_unexpected_error", provider: "salesforce", reason: (err as Error).message }),
        (err as Error).stack,
      );
      return { ok: false, error: AdminAuthErrorCode.INTERNAL_ERROR };
    }
  }

  async refresh(refreshToken: string | undefined): Promise<StaffTokenPair> {
    if (!refreshToken) {
      throw new UnauthorizedException("Missing refresh token.");
    }

    let payload: { sub: string; scope?: string };
    try {
      payload = this.jwtService.verify<{ sub: string; scope?: string }>(refreshToken);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token.");
    }
    if (payload.scope !== AUTH_SCOPE.STAFF) {
      throw new UnauthorizedException("This token is not valid for admin console endpoints.");
    }

    const tokenHash = sha256Hex(refreshToken);
    const isValid = await this.refreshTokens.isValid(payload.sub, tokenHash);
    if (!isValid) {
      this.logger.warn(JSON.stringify({ event: "admin_refresh_rejected", userId: payload.sub, reason: "revoked_or_unknown" }));
      throw new UnauthorizedException("Refresh token has been revoked.");
    }
    // Rotation: this refresh token is single-use — revoke it immediately so replay
    // (e.g. a stolen cookie value reused after the legitimate client already rotated) fails.
    await this.refreshTokens.revoke(payload.sub, tokenHash);

    const staff = await this.staffUsers.findById(payload.sub);
    if (!staff || !staff.isActive) {
      throw new UnauthorizedException("Account is no longer active.");
    }
    return this.issueTokens(staff.id, staff.role);
  }

  /** Best-effort: revokes the refresh token if one was presented. Never throws — logout must always succeed from the client's point of view. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const payload = this.jwtService.verify<{ sub: string }>(refreshToken);
      await this.refreshTokens.revoke(payload.sub, sha256Hex(refreshToken));
    } catch {
      // Already invalid/expired/malformed — nothing to revoke.
    }
  }

  /**
   * Backs GET /admin/auth/me. Permissions are always read fresh from the database
   * here (never trusted from the JWT, which intentionally omits them — see
   * issueTokens) so the console UI reflects the latest grants on every page load.
   */
  async getProfile(staffUserId: string): Promise<StaffProfile | null> {
    const staff = await this.staffUsers.findById(staffUserId);
    if (!staff || !staff.isActive) return null;
    return { staffUserId: staff.id, role: staff.role, permissions: staff.permissions };
  }

  /**
   * JWT payload is intentionally minimal (sub/scope/role) — no permissions array.
   * Permissions can change (grant/revoke) faster than a 15-minute access token's
   * lifetime, so they're always loaded fresh from the DB at authorization time
   * (PermissionGuard) and for the console UI (getProfile), never trusted from a
   * token that may already be stale.
   */
  private async issueTokens(staffUserId: string, role: StaffRole): Promise<StaffTokenPair> {
    const payload = { sub: staffUserId, scope: AUTH_SCOPE.STAFF, role };
    const accessToken = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: REFRESH_TOKEN_TTL });
    await this.refreshTokens.save(staffUserId, sha256Hex(refreshToken), new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }
}
