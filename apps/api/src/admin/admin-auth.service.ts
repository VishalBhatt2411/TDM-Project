import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { StaffAssignmentRepository, StaffRole } from "@tdm/domain";
import {
  OrganizationRecord,
  OrganizationRepository,
  sha256Hex,
  StaffOAuthStateRepository,
  StaffRefreshTokenRepository,
  StaffUserRepository,
} from "@tdm/postgres-adapter";
import {
  ORGANIZATION_REPOSITORY,
  SALESFORCE_IDENTITY_PROVIDER_FACTORY,
  STAFF_ASSIGNMENT_REPOSITORY,
  STAFF_OAUTH_STATE_REPOSITORY,
  STAFF_REFRESH_TOKEN_REPOSITORY,
  STAFF_USER_REPOSITORY,
} from "../infrastructure/tokens";
import type { SalesforceIdentityProviderFactory } from "../infrastructure/identity-provider-factory";
import { TenantContext } from "../tenancy/tenant-context";
import { ACCESS_TOKEN_TTL, ACCESS_TOKEN_TTL_SECONDS, AUTH_SCOPE, OAUTH_STATE_TTL_MS, REFRESH_TOKEN_TTL, REFRESH_TOKEN_TTL_MS } from "../auth/auth.constants";
import type { PermissionKey } from "./permissions";
import { StaffAccessService } from "./staff-access.service";
import type { AuthenticatedStaff } from "./staff-auth.guard";

/** Public, stable error codes — the only thing ever exposed to the browser. Never a raw exception message. */
export const AdminAuthErrorCode = {
  INVALID_STATE: "invalid_state",
  UNKNOWN_ORGANIZATION: "unknown_organization",
  WRONG_ORGANIZATION: "wrong_organization",
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
export type AuthorizationUrlResult = { ok: true; url: string } | { ok: false; error: AdminAuthErrorCode };

interface StaffTokenPayload {
  sub: string;
  scope?: string;
  org?: string;
}

export interface StaffProfile {
  staffUserId: string;
  name: string;
  email: string;
  /** The Salesforce User id bookings are assigned to — what "my test drives" matches on. */
  salesRepId: string;
  isCompanyAdmin: boolean;
  /** Held in at least one dealership — each route still limits the data to where it's held. */
  permissions: PermissionKey[];
  assignments: { id: string; role: StaffRole; dealershipId?: string; branchId?: string }[];
}

/**
 * Staff (Admin/Manager/Sales Rep) authenticate with their real Salesforce identity
 * via OAuth2 Authorization Code flow — this app never sees or stores a Salesforce
 * password. Login is always against one tenant (chosen by company identifier or the
 * dealer host) through that tenant's own Connected App, and the identity must come
 * from that tenant's connected Salesforce org. Console access comes entirely from the
 * user's active Staff_Assignment__c records in that org (see StaffAccessService) — a
 * Salesforce user with none can't sign in. The local StaffUser row is identity only.
 *
 * The first Company Admin assignment is granted to whoever authorizes the tenant's
 * Salesforce org through the onboarding wizard; later access is granted from the console
 * or directly in Salesforce.
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
    @Inject(STAFF_ASSIGNMENT_REPOSITORY) private readonly assignments: StaffAssignmentRepository,
    private readonly staffAccess: StaffAccessService,
    @Inject(STAFF_REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: StaffRefreshTokenRepository,
    @Inject(STAFF_OAUTH_STATE_REPOSITORY) private readonly oauthStates: StaffOAuthStateRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(SALESFORCE_IDENTITY_PROVIDER_FACTORY) private readonly identityProviders: SalesforceIdentityProviderFactory,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * `state` is now just an opaque, random, single-use lookup key (CSRF protection) —
   * the PKCE code_verifier it maps to is stored server-side (StaffOAuthStateRepository),
   * never round-tripped through the browser. Keeps the authorization URL short and
   * keeps the verifier out of browser history/referrer headers/access logs.
   */
  async buildAuthorizationUrl(organizationSlug: string | undefined): Promise<AuthorizationUrlResult> {
    const organization = await this.resolveLoginOrganization(organizationSlug);
    const identityProvider = organization ? await this.identityProviders(organization.id, "staff_login") : null;
    if (!organization || !identityProvider) {
      this.logger.warn(JSON.stringify({ event: "admin_oauth_unknown_organization", provider: "salesforce" }));
      return { ok: false, error: AdminAuthErrorCode.UNKNOWN_ORGANIZATION };
    }

    const codeVerifier = identityProvider.generateCodeVerifier();
    const state = randomBytes(24).toString("hex");
    await this.oauthStates.save({
      state,
      codeVerifier,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
      organizationId: organization.id,
      purpose: "staff_login",
    });
    return { ok: true, url: identityProvider.buildAuthorizationUrl(state, codeVerifier) };
  }

  /** Explicit company identifier wins; otherwise the dealer host's tenant. Only a connected tenant can sign staff in. */
  private async resolveLoginOrganization(organizationSlug: string | undefined): Promise<OrganizationRecord | null> {
    const hostOrganizationId = TenantContext.hostOrganizationId();
    const organization = organizationSlug
      ? await this.organizations.findBySlug(organizationSlug)
      : hostOrganizationId
        ? await this.organizations.findById(hostOrganizationId)
        : null;
    return organization?.connectionStatus === "connected" && organization.sfOrgId ? organization : null;
  }

  async handleCallback(code: string, state: string): Promise<SalesforceCallbackResult> {
    try {
      const consumed = await this.oauthStates.consume(state, "staff_login");
      if (!consumed) {
        this.logger.warn(JSON.stringify({ event: "admin_oauth_invalid_state", provider: "salesforce" }));
        return { ok: false, error: AdminAuthErrorCode.INVALID_STATE };
      }
      const { organizationId } = consumed;
      const organization = await this.organizations.findById(organizationId);
      const identityProvider = organization?.sfOrgId ? await this.identityProviders(organizationId, "staff_login") : null;
      if (!organization?.sfOrgId || !identityProvider) {
        this.logger.warn(JSON.stringify({ event: "admin_oauth_unknown_organization", provider: "salesforce", organizationId }));
        return { ok: false, error: AdminAuthErrorCode.UNKNOWN_ORGANIZATION };
      }

      let identity;
      try {
        identity = await identityProvider.exchangeCodeForIdentity(code, consumed.codeVerifier);
      } catch (err) {
        this.logger.error(
          JSON.stringify({
            event: "admin_oauth_exchange_failed",
            provider: "salesforce",
            organizationId,
            reason: (err as Error).message,
          }),
        );
        return { ok: false, error: AdminAuthErrorCode.EXCHANGE_FAILED };
      }

      // The Connected App may be usable from other orgs; only identities from the tenant's own org count.
      if (identity.salesforceOrgId !== organization.sfOrgId) {
        this.logger.warn(
          JSON.stringify({ event: "admin_login_denied", provider: "salesforce", organizationId, reason: "wrong_salesforce_org" }),
        );
        return { ok: false, error: AdminAuthErrorCode.WRONG_ORGANIZATION };
      }

      // The callback arrives on whichever host the Connected App redirects to, so the
      // assignment lookup is pinned to the tenant the login was started for.
      const assignments = await TenantContext.run(
        () => this.assignments.findActiveByUser(identity.salesforceUserId),
        organizationId,
      );
      if (assignments.length === 0) {
        this.logger.warn(
          JSON.stringify({ event: "admin_login_denied", provider: "salesforce", organizationId, reason: "not_provisioned" }),
        );
        return { ok: false, error: AdminAuthErrorCode.NOT_PROVISIONED };
      }

      const staff = await this.staffUsers.upsertFromIdentity({
        organizationId,
        salesforceUserId: identity.salesforceUserId,
        email: identity.email,
        name: identity.displayName,
      });
      this.staffAccess.invalidate(organizationId, identity.salesforceUserId);
      this.logger.log(JSON.stringify({ event: "admin_login_success", provider: "salesforce", userId: staff.id, organizationId }));
      return { ok: true, ...(await this.issueTokens(staff.id, organizationId)) };
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

    let payload: StaffTokenPayload;
    try {
      payload = this.jwtService.verify<StaffTokenPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token.");
    }
    if (payload.scope !== AUTH_SCOPE.STAFF) {
      throw new UnauthorizedException("This token is not valid for admin console endpoints.");
    }
    TenantContext.bindSession(payload.org);

    const tokenHash = sha256Hex(refreshToken);
    const isValid = await this.refreshTokens.isValid(payload.sub, tokenHash);
    if (!isValid) {
      this.logger.warn(JSON.stringify({ event: "admin_refresh_rejected", userId: payload.sub, reason: "revoked_or_unknown" }));
      throw new UnauthorizedException("Refresh token has been revoked.");
    }
    // Rotation: this refresh token is single-use — revoke it immediately so replay
    // (e.g. a stolen cookie value reused after the legitimate client already rotated) fails.
    await this.refreshTokens.revoke(payload.sub, tokenHash);

    // A session only outlives its access by one access-token lifetime: a user whose last
    // assignment was removed can't renew it.
    const access = await this.staffAccess.resolve({ staffUserId: payload.sub, organizationId: payload.org! }, { fresh: true });
    if (!access) {
      this.logger.warn(JSON.stringify({ event: "admin_refresh_rejected", userId: payload.sub, reason: "no_active_assignment" }));
      throw new UnauthorizedException("Account is no longer active.");
    }
    return this.issueTokens(access.staffUser.id, access.staffUser.organizationId);
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
   * Backs GET /admin/auth/me. Access is always resolved fresh from the staff assignments
   * here (never trusted from the JWT, which carries identity only — see issueTokens) so
   * the console UI reflects the latest grants on every page load.
   */
  async getProfile(staff: AuthenticatedStaff): Promise<StaffProfile | null> {
    const access = await this.staffAccess.resolve(staff, { fresh: true });
    if (!access) return null;
    return {
      staffUserId: access.staffUser.id,
      name: access.staffUser.name,
      email: access.staffUser.email,
      salesRepId: access.salesforceUserId,
      isCompanyAdmin: access.isCompanyAdmin,
      permissions: access.permissions(),
      assignments: access.assignments.map((a) => ({ id: a.id, role: a.role, dealershipId: a.dealershipId, branchId: a.branchId })),
    };
  }

  /**
   * JWT payload is intentionally identity only (sub/scope/org). Roles and dealership access
   * can change faster than a 15-minute access token's lifetime, so they're always resolved
   * from the staff assignments at authorization time (PermissionGuard, BookingAccessPolicy)
   * and for the console UI (getProfile), never trusted from a token that may already be stale.
   */
  private async issueTokens(staffUserId: string, organizationId: string): Promise<StaffTokenPair> {
    const payload = { sub: staffUserId, scope: AUTH_SCOPE.STAFF, org: organizationId };
    const accessToken = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: REFRESH_TOKEN_TTL });
    await this.refreshTokens.save(staffUserId, sha256Hex(refreshToken), new Date(Date.now() + REFRESH_TOKEN_TTL_MS));
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }
}
