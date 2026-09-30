import { randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { StaffAssignment, StaffAssignmentConflictError, StaffAssignmentRepository } from "@tdm/domain";
import {
  OrganizationRecord,
  OrganizationRepository,
  OrganizationSlugTakenError,
  StaffOAuthStateRepository,
  StaffUserRepository,
} from "@tdm/postgres-adapter";
import {
  ORGANIZATION_REPOSITORY,
  SALESFORCE_IDENTITY_PROVIDER_FACTORY,
  STAFF_ASSIGNMENT_REPOSITORY,
  STAFF_OAUTH_STATE_REPOSITORY,
  STAFF_USER_REPOSITORY,
  TENANT_METADATA_DEPLOYER,
} from "../infrastructure/tokens";
import { SalesforceIdentityProviderFactory } from "../infrastructure/identity-provider-factory";
import { TenantMetadataDeployer } from "../infrastructure/metadata-deployer";
import { TenantContext } from "../tenancy/tenant-context";
import { OAUTH_STATE_TTL_MS } from "../auth/auth.constants";
import { CreateOrganizationDto, SaveSalesforceCredentialsDto } from "./dto";
import { env } from "../common/env";

/** Scopes needed beyond staff-login's "id api" — refresh_token/offline_access lets the wizard persist a reusable connection instead of a one-time login. */
const ONBOARDING_OAUTH_SCOPE = "id api refresh_token";

export interface OrganizationStatusDto {
  id: string;
  name: string;
  slug: string;
  connectionStatus: OrganizationRecord["connectionStatus"];
  connectionError: string | null;
  metadataDeployedAt: string | null;
  /**
   * Every callback URL the tenant's Connected App must list (onboarding handshake + staff login) —
   * always the server's actual configured values, never guessed on the frontend.
   */
  salesforceCallbackUrls: string[];
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(STAFF_OAUTH_STATE_REPOSITORY) private readonly oauthStates: StaffOAuthStateRepository,
    @Inject(STAFF_USER_REPOSITORY) private readonly staffUsers: StaffUserRepository,
    @Inject(STAFF_ASSIGNMENT_REPOSITORY) private readonly assignments: StaffAssignmentRepository,
    @Inject(SALESFORCE_IDENTITY_PROVIDER_FACTORY) private readonly identityProviders: SalesforceIdentityProviderFactory,
    @Inject(TENANT_METADATA_DEPLOYER) private readonly deployMetadata: TenantMetadataDeployer,
  ) {}

  async createOrganization(dto: CreateOrganizationDto): Promise<OrganizationStatusDto> {
    // The repository checks the shared company/dealer subdomain namespace atomically with the insert.
    try {
      return toStatusDto(await this.organizations.create({ name: dto.name, slug: dto.slug }));
    } catch (err) {
      if (err instanceof OrganizationSlugTakenError) {
        throw new ConflictException(`The identifier "${dto.slug}" is already taken. Choose another.`);
      }
      throw err;
    }
  }

  async saveSalesforceCredentials(organizationId: string, dto: SaveSalesforceCredentialsDto): Promise<OrganizationStatusDto> {
    const org = await this.getOrganizationOrThrow(organizationId);
    // The wizard is public and keyed only by organization id — it may finish a connection, never
    // re-point a live one. Changing a connected tenant's Connected App is an authenticated admin action.
    if (org.connectionStatus === "connected") {
      throw new ConflictException("This organization is already connected to Salesforce. Contact your administrator to change its Connected App.");
    }
    await this.organizations.saveSalesforceCredentials(org.id, {
      consumerKey: dto.consumerKey,
      consumerSecret: dto.consumerSecret,
      loginUrl: dto.loginUrl,
    });
    return toStatusDto((await this.organizations.findById(org.id))!);
  }

  /** Redirect target for the wizard's "Authorize with Salesforce" step. */
  async buildAuthorizationUrl(organizationId: string): Promise<string> {
    const org = await this.getOrganizationOrThrow(organizationId);
    const identityProvider = await this.identityProviders(org.id, "onboarding");
    if (!identityProvider) {
      throw new BadRequestException("Save this organization's Salesforce Connected App credentials before connecting.");
    }

    const codeVerifier = identityProvider.generateCodeVerifier();
    const state = randomBytes(24).toString("hex");
    await this.oauthStates.save({
      state,
      codeVerifier,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
      organizationId: org.id,
      purpose: "onboarding",
    });
    return identityProvider.buildAuthorizationUrl(state, codeVerifier, ONBOARDING_OAUTH_SCOPE);
  }

  /**
   * Completes the OAuth handshake, persists the connection, and kicks off the TDM
   * metadata deploy in the background — this must return quickly since it's the
   * tail end of a browser redirect, not a long-held request. Deploy progress is
   * surfaced separately via getStatus() polling. Once an org has been identified from
   * `state`, every outcome (success or failure) redirects to that org's /connecting
   * screen — it polls getStatus() and already renders connectionError correctly, so
   * failures shouldn't bounce the user back to a blank "start over" screen and lose
   * their already-saved credentials.
   */
  async handleCallback(code: string, state: string): Promise<{ organizationId: string } | { error: string }> {
    const consumed = await this.oauthStates.consume(state, "onboarding");
    if (!consumed) {
      return { error: "invalid_state" };
    }

    const org = await this.getOrganizationOrThrow(consumed.organizationId);
    const identityProvider = await this.identityProviders(org.id, "onboarding");
    if (!identityProvider) {
      await this.organizations.recordConnectionError(org.id, "Connected App credentials are missing. Save them and try again.");
      return { organizationId: org.id };
    }

    let result;
    try {
      result = await identityProvider.exchangeCodeForConnection(code, consumed.codeVerifier);
    } catch (err) {
      this.logger.error(
        JSON.stringify({ event: "onboarding_oauth_exchange_failed", organizationId: org.id, reason: (err as Error).message }),
      );
      await this.organizations.recordConnectionError(org.id, "Couldn't complete the Salesforce authorization. Please try again.");
      return { organizationId: org.id };
    }

    // A tenant is bound to the first Salesforce org it connects: its staff, bookings and customers
    // live there. Authorizing a different org would silently mix two orgs' ids in one tenant, so
    // that is refused — a company moving to a new org is onboarded as a new company.
    if (org.sfOrgId && org.sfOrgId !== result.salesforceOrgId) {
      this.logger.warn(JSON.stringify({ event: "onboarding_org_mismatch", organizationId: org.id }));
      await this.organizations.recordConnectionError(
        org.id,
        "You authorized a different Salesforce org than the one this company is linked to. Sign in to the original org, or onboard the new org as a new company.",
      );
      return { organizationId: org.id };
    }

    await this.organizations.saveConnectionResult(org.id, {
      refreshToken: result.refreshToken,
      instanceUrl: result.instanceUrl,
      sfOrgId: result.salesforceOrgId,
    });
    this.logger.log(JSON.stringify({ event: "onboarding_connected", organizationId: org.id }));

    // Identity only — the connecting user's access is the Company Admin assignment granted
    // once the metadata deploy has created Staff_Assignment__c in their org.
    await this.staffUsers.upsertFromIdentity({
      organizationId: org.id,
      salesforceUserId: result.identity.salesforceUserId,
      email: result.identity.email,
      name: result.identity.displayName,
    });
    const connectingUserId = result.identity.salesforceUserId;

    // Fire-and-forget, but never allowed to escape as an unhandled rejection — Node kills the
    // entire process on one of those by default, which would take down every tenant's traffic
    // over one org's deploy failure. deployMetadataInBackground already catches everything it
    // can attribute to a cause; this is the last-resort net for anything that still slips out
    // (e.g. the error-recording write itself failing).
    this.deployMetadataInBackground(org.id, connectingUserId).catch((err) => {
      this.logger.error(
        JSON.stringify({ event: "onboarding_metadata_deploy_unhandled", organizationId: org.id, reason: (err as Error).message }),
      );
    });

    return { organizationId: org.id };
  }

  /**
   * Salesforce redirects back with `error`/`error_description` instead of `code` when
   * authorization is denied or blocked (e.g. access_denied, or a cross-org OAuth block) —
   * a normal outcome of the handshake, not a malformed request. Still consumes the state
   * (single-use, same as the success path) and records the reason against the org so the
   * wizard's polling screen surfaces it instead of leaving the org stuck in "pending"
   * with an orphaned, unconsumed OAuth state forever.
   */
  async recordAuthorizationDenied(state: string, message: string): Promise<{ organizationId: string } | { error: string }> {
    const consumed = await this.oauthStates.consume(state, "onboarding");
    if (!consumed) {
      return { error: "invalid_state" };
    }
    await this.organizations.recordConnectionError(consumed.organizationId, message);
    this.logger.warn(
      JSON.stringify({ event: "onboarding_oauth_denied", organizationId: consumed.organizationId, reason: message }),
    );
    return { organizationId: consumed.organizationId };
  }

  async getStatus(organizationId: string): Promise<OrganizationStatusDto> {
    const org = await this.getOrganizationOrThrow(organizationId);
    return toStatusDto(org);
  }

  /**
   * Public, unauthenticated check the Admin Console's pre-login screen uses to decide
   * whether to show a "connect your Salesforce org" banner for one tenant (by `slug`,
   * else the dealer host's tenant). Keyed off whether anyone can actually sign in — the
   * first Company Admin assignment is granted with the metadata deploy — not whether the
   * org merely reached "connected".
   * An unknown or unidentified tenant reports no setup need — a fresh company starts
   * the wizard from the login page's own "new company" entry point instead.
   */
  async getSetupStatus(slug?: string): Promise<{ needsSetup: boolean }> {
    const org = slug
      ? await this.organizations.findBySlug(slug)
      : await this.findHostOrganization();
    if (!org) return { needsSetup: false };
    return { needsSetup: !org.metadataDeployedAt };
  }

  /**
   * Reports the Company Admin granted after the metadata deploy (the connecting Salesforce
   * user). Never re-derives identity from the stored refresh token — that secret stays
   * inside the adapter layer.
   */
  async completeOnboarding(organizationId: string): Promise<{ staffUserId: string; email: string; name: string }> {
    const org = await this.getOrganizationOrThrow(organizationId);
    if (org.connectionStatus !== "connected" || !org.hasRefreshToken) {
      throw new BadRequestException("Connect this organization's Salesforce org before provisioning an admin.");
    }
    if (!org.metadataDeployedAt) {
      throw new BadRequestException("Setup of this organization's Salesforce org hasn't finished yet.");
    }

    const [grant] = await TenantContext.run(() => this.assignments.findAll({ role: "Company_Admin" }), org.id);
    const admin = grant ? await this.staffUsers.findBySalesforceUserId(org.id, grant.userId) : null;
    if (!admin) {
      throw new ConflictException("No administrator was provisioned for this organization. Reconnect Salesforce to provision one.");
    }
    return { staffUserId: admin.id, email: admin.email, name: admin.name };
  }

  private async findHostOrganization(): Promise<OrganizationRecord | null> {
    const hostOrganizationId = TenantContext.hostOrganizationId();
    return hostOrganizationId ? this.organizations.findById(hostOrganizationId) : null;
  }

  private async deployMetadataInBackground(organizationId: string, connectingUserId: string): Promise<void> {
    try {
      const result = await this.deployMetadata(organizationId);
      if (!result.success) {
        const summary = result.failures.map((f) => `${f.fullName}: ${f.problem}`).join("; ") || "Deploy did not succeed.";
        await this.organizations.recordMetadataDeployError(organizationId, summary);
        this.logger.warn(JSON.stringify({ event: "onboarding_metadata_deploy_failed", organizationId, summary }));
        return;
      }
      // Runs outside any request, so the tenant is pinned explicitly for the Salesforce write.
      await TenantContext.run(() => this.grantFirstCompanyAdmin(organizationId, connectingUserId), organizationId);
      await this.organizations.markMetadataDeployed(organizationId);
      this.logger.log(JSON.stringify({ event: "onboarding_metadata_deployed", organizationId }));
    } catch (err) {
      await this.organizations.recordMetadataDeployError(organizationId, (err as Error).message);
      this.logger.error(
        JSON.stringify({ event: "onboarding_metadata_deploy_error", organizationId, reason: (err as Error).message }),
      );
    }
  }

  /**
   * The connecting user becomes the tenant's Company Admin — only while it has none, so
   * reconnecting (e.g. after a revoked token) never grants a second user the whole company.
   */
  private async grantFirstCompanyAdmin(organizationId: string, userId: string): Promise<void> {
    const existing = await this.assignments.findAll({ role: "Company_Admin" });
    if (existing.length > 0) return;
    try {
      const saved = await this.assignments.save(StaffAssignment.create({ userId, role: "Company_Admin" }));
      this.logger.log(JSON.stringify({ event: "onboarding_admin_provisioned", organizationId, assignmentId: saved.id }));
    } catch (err) {
      // A concurrent reconnect already granted it.
      if (!(err instanceof StaffAssignmentConflictError)) throw err;
    }
  }

  private async getOrganizationOrThrow(organizationId: string): Promise<OrganizationRecord> {
    const org = await this.organizations.findById(organizationId);
    if (!org) {
      throw new NotFoundException("Organization not found.");
    }
    return org;
  }
}

function toStatusDto(org: OrganizationRecord): OrganizationStatusDto {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    connectionStatus: org.connectionStatus,
    connectionError: org.connectionError,
    metadataDeployedAt: org.metadataDeployedAt ? org.metadataDeployedAt.toISOString() : null,
    salesforceCallbackUrls: [env.sfOnboardingRedirectUri, env.sfOAuthRedirectUri],
  };
}
