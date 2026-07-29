import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { SalesforceIdentityProvider } from "@tdm/salesforce-adapter";
import { sha256Hex, StaffRefreshTokenRepository, StaffUserRepository } from "@tdm/postgres-adapter";
import { SALESFORCE_IDENTITY_PROVIDER, STAFF_REFRESH_TOKEN_REPOSITORY, STAFF_USER_REPOSITORY } from "../infrastructure/tokens";
import { StaffRefreshDto } from "./dto";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL = "5m";
const OAUTH_STATE_PURPOSE = "sf-oauth-state";

export type SalesforceCallbackResult =
  | { accessToken: string; refreshToken: string; expiresIn: number }
  | { error: "invalid_state" | "not_provisioned" | "inactive" | "exchange_failed" };

/**
 * Staff (Admin/Manager/Sales Rep) authenticate with their real Salesforce identity
 * via OAuth2 Authorization Code flow — this app never sees or stores a Salesforce
 * password. Console access/permissions are still governed entirely by StaffUser
 * (role + permissions), matched by the email Salesforce's identity endpoint returns.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @Inject(STAFF_USER_REPOSITORY) private readonly staffUsers: StaffUserRepository,
    @Inject(STAFF_REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: StaffRefreshTokenRepository,
    @Inject(SALESFORCE_IDENTITY_PROVIDER) private readonly identityProvider: SalesforceIdentityProvider,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * The "state" param is a short-lived signed JWT (not server-side session state) —
   * CSRF protection with no storage. It also carries the PKCE code_verifier across
   * the login->callback gap, since those are two separate HTTP requests.
   */
  buildAuthorizationUrl(): string {
    const codeVerifier = this.identityProvider.generateCodeVerifier();
    const state = this.jwtService.sign({ purpose: OAUTH_STATE_PURPOSE, codeVerifier }, { expiresIn: OAUTH_STATE_TTL });
    return this.identityProvider.buildAuthorizationUrl(state, codeVerifier);
  }

  async handleCallback(code: string, state: string): Promise<SalesforceCallbackResult> {
    let codeVerifier: string;
    try {
      const payload = this.jwtService.verify<{ purpose?: string; codeVerifier?: string }>(state);
      if (payload.purpose !== OAUTH_STATE_PURPOSE || !payload.codeVerifier) {
        return { error: "invalid_state" };
      }
      codeVerifier = payload.codeVerifier;
    } catch {
      return { error: "invalid_state" };
    }

    let identity;
    try {
      identity = await this.identityProvider.exchangeCodeForIdentity(code, codeVerifier);
    } catch (err) {
      this.logger.error(`Salesforce OAuth code exchange failed: ${(err as Error).message}`);
      return { error: "exchange_failed" };
    }

    const staff = await this.staffUsers.findByEmail(identity.email);
    if (!staff) {
      this.logger.warn(`Salesforce login denied — no StaffUser provisioned for ${identity.email}`);
      return { error: "not_provisioned" };
    }
    if (!staff.isActive) {
      return { error: "inactive" };
    }
    if (!staff.salesforceUserId) {
      await this.staffUsers.linkSalesforceUserId(staff.id, identity.salesforceUserId);
    }

    // identity.salesforceUserId (not staff.salesforceUserId) — this login just confirmed it,
    // whereas the in-memory `staff` record may still reflect the pre-link state above.
    return this.issueTokens(staff.id, staff.role, staff.permissions, identity.salesforceUserId);
  }

  async refresh(dto: StaffRefreshDto): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    let payload: { sub: string; scope?: string };
    try {
      payload = this.jwtService.verify<{ sub: string; scope?: string }>(dto.refreshToken);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token.");
    }
    if (payload.scope !== "staff") {
      throw new UnauthorizedException("This token is not valid for admin console endpoints.");
    }
    const isValid = await this.refreshTokens.isValid(payload.sub, sha256Hex(dto.refreshToken));
    if (!isValid) {
      throw new UnauthorizedException("Refresh token has been revoked.");
    }
    await this.refreshTokens.revoke(payload.sub, sha256Hex(dto.refreshToken));

    const staff = await this.staffUsers.findById(payload.sub);
    if (!staff || !staff.isActive) {
      throw new UnauthorizedException("Account is no longer active.");
    }
    return this.issueTokens(staff.id, staff.role, staff.permissions, staff.salesforceUserId);
  }

  private async issueTokens(
    staffUserId: string,
    role: string,
    permissions: string[],
    salesRepId?: string | null,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const payload = { sub: staffUserId, scope: "staff", role, permissions, salesRepId: salesRepId ?? undefined };
    const accessToken = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: "7d" });
    await this.refreshTokens.save(staffUserId, sha256Hex(refreshToken), new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }
}
