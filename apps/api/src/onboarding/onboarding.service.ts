import { randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { deployTdmMetadata, SalesforceIdentityProvider } from "@tdm/salesforce-adapter";
import {
  decryptSecret,
  encryptSecret,
  OrganizationRecord,
  OrganizationRepository,
  StaffOAuthStateRepository,
  StaffRole,
  StaffUserRepository,
} from "@tdm/postgres-adapter";
import { ORGANIZATION_REPOSITORY, STAFF_OAUTH_STATE_REPOSITORY, STAFF_USER_REPOSITORY } from "../infrastructure/tokens";
import { OAUTH_STATE_TTL_MS } from "../auth/auth.constants";
import { CreateOrganizationDto, SaveSalesforceCredentialsDto } from "./dto";

/** Scopes needed beyond staff-login's "id api" — refresh_token/offline_access lets the wizard persist a reusable connection instead of a one-time login. */
const ONBOARDING_OAUTH_SCOPE = "id api refresh_token";

export interface OrganizationStatusDto {
  id: string;
  name: string;
  slug: string;
  connectionStatus: OrganizationRecord["connectionStatus"];
  connectionError: string | null;
  metadataDeployedAt: string | null;
  /** The callback URL to register on the tenant's Connected App — always the server's actual configured value, never guessed on the frontend. */
  salesforceCallbackUrl: string;
}

function encryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new InternalServerErrorException("Server is missing its encryption key configuration.");
  }
  return key;
}

function onboardingRedirectUri(): string {
  return process.env.SF_ONBOARDING_REDIRECT_URI ?? "http://localhost:3000/api/v1/onboarding/salesforce/callback";
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    @Inject(STAFF_OAUTH_STATE_REPOSITORY) private readonly oauthStates: StaffOAuthStateRepository,
    @Inject(STAFF_USER_REPOSITORY) private readonly staffUsers: StaffUserRepository,
  ) {}

  async createOrganization(dto: CreateOrganizationDto): Promise<OrganizationStatusDto> {
    const existing = await this.organizations.findBySlug(dto.slug);
    if (existing) {
      throw new ConflictException(`The identifier "${dto.slug}" is already taken. Choose another.`);
    }
    const org = await this.organizations.create({ name: dto.name, slug: dto.slug });
    return toStatusDto(org);
  }

  async saveSalesforceCredentials(organizationId: string, dto: SaveSalesforceCredentialsDto): Promise<OrganizationStatusDto> {
    const org = await this.getOrganizationOrThrow(organizationId);
    await this.organizations.saveSalesforceCredentials(org.id, {
      consumerKey: dto.consumerKey,
      consumerSecretEnc: encryptSecret(dto.consumerSecret, encryptionKey()),
      loginUrl: dto.loginUrl,
    });
    return toStatusDto((await this.organizations.findById(org.id))!);
  }

  /** Redirect target for the wizard's "Authorize with Salesforce" step. */
  async buildAuthorizationUrl(organizationId: string): Promise<string> {
    const org = await this.getOrganizationOrThrow(organizationId);
    if (!org.sfConsumerKey || !org.sfConsumerSecretEnc) {
      throw new BadRequestException("Save this organization's Salesforce Connected App credentials before connecting.");
    }

    const identityProvider = this.identityProviderFor(org);
    const codeVerifier = identityProvider.generateCodeVerifier();
    const state = randomBytes(24).toString("hex");
    await this.oauthStates.save(state, codeVerifier, new Date(Date.now() + OAUTH_STATE_TTL_MS), org.id);
    return identityProvider.buildAuthorizationUrl(state, codeVerifier, ONBOARDING_OAUTH_SCOPE);
  }

  /**
   * Completes the OAuth handshake, persists the connection, and kicks off the TDM
   * metadata deploy in the background — this must return quickly since it's the
   * tail end of a browser redirect, not a long-held request. Deploy progress is
   * surfaced separately via getStatus() polling.
   */
  async handleCallback(code: string, state: string): Promise<{ organizationId: string } | { error: string }> {
    const consumed = await this.oauthStates.consume(state);
    if (!consumed || !consumed.organizationId) {
      return { error: "invalid_state" };
    }

    const org = await this.getOrganizationOrThrow(consumed.organizationId);
    const identityProvider = this.identityProviderFor(org);

    let result;
    try {
      result = await identityProvider.exchangeCodeForConnection(code, consumed.codeVerifier);
    } catch (err) {
      this.logger.error(
        JSON.stringify({ event: "onboarding_oauth_exchange_failed", organizationId: org.id, reason: (err as Error).message }),
      );
      await this.organizations.recordConnectionError(org.id, "Couldn't complete the Salesforce authorization. Please try again.");
      return { error: "exchange_failed" };
    }

    await this.organizations.saveConnectionResult(org.id, {
      refreshTokenEnc: encryptSecret(result.refreshToken, encryptionKey()),
      instanceUrl: result.instanceUrl,
      sfOrgId: result.salesforceOrgId,
    });
    this.logger.log(JSON.stringify({ event: "onboarding_connected", organizationId: org.id }));

    void this.deployMetadataInBackground(org.id, identityProvider, result.refreshToken);

    return { organizationId: org.id };
  }

  async getStatus(organizationId: string): Promise<OrganizationStatusDto> {
    const org = await this.getOrganizationOrThrow(organizationId);
    return toStatusDto(org);
  }

  /**
   * Auto-provisions the connecting admin as the org's first StaffUser, re-deriving
   * their identity from the persisted refresh token rather than asking them to sign
   * in a second time. Explicitly does NOT issue a login session — tenant-aware
   * staff login is a separate, follow-up piece of work (see plan).
   */
  async completeOnboarding(organizationId: string): Promise<{ staffUserId: string; email: string; name: string }> {
    const org = await this.getOrganizationOrThrow(organizationId);
    if (org.connectionStatus !== "connected" || !org.sfRefreshTokenEnc) {
      throw new BadRequestException("Connect this organization's Salesforce org before provisioning an admin.");
    }

    const identityProvider = this.identityProviderFor(org);
    const refreshToken = decryptSecret(org.sfRefreshTokenEnc, encryptionKey());
    const conn = await identityProvider.connectWithRefreshToken(refreshToken);
    const identity = await conn.identity();

    const existing = await this.staffUsers.findByEmail(identity.email);
    if (existing) {
      throw new ConflictException(
        `A staff user with the email ${identity.email} already exists. Each Salesforce identity can only be provisioned for one organization today.`,
      );
    }

    const staff = await this.staffUsers.create({
      email: identity.email,
      name: identity.display_name,
      role: StaffRole.Admin,
      organizationId: org.id,
    });
    await this.staffUsers.linkSalesforceUserId(staff.id, identity.user_id);

    this.logger.log(JSON.stringify({ event: "onboarding_admin_provisioned", organizationId: org.id, staffUserId: staff.id }));
    return { staffUserId: staff.id, email: staff.email, name: staff.name };
  }

  private async deployMetadataInBackground(organizationId: string, identityProvider: SalesforceIdentityProvider, refreshToken: string): Promise<void> {
    try {
      const conn = await identityProvider.connectWithRefreshToken(refreshToken);
      const result = await deployTdmMetadata(conn);
      if (!result.success) {
        const summary = result.failures.map((f) => `${f.fullName}: ${f.problem}`).join("; ") || "Deploy did not succeed.";
        await this.organizations.recordMetadataDeployError(organizationId, summary);
        this.logger.warn(JSON.stringify({ event: "onboarding_metadata_deploy_failed", organizationId, summary }));
        return;
      }
      await this.organizations.markMetadataDeployed(organizationId);
      this.logger.log(JSON.stringify({ event: "onboarding_metadata_deployed", organizationId }));
    } catch (err) {
      await this.organizations.recordMetadataDeployError(organizationId, (err as Error).message);
      this.logger.error(
        JSON.stringify({ event: "onboarding_metadata_deploy_error", organizationId, reason: (err as Error).message }),
      );
    }
  }

  private identityProviderFor(org: OrganizationRecord): SalesforceIdentityProvider {
    return new SalesforceIdentityProvider({
      clientId: org.sfConsumerKey!,
      clientSecret: decryptSecret(org.sfConsumerSecretEnc!, encryptionKey()),
      redirectUri: onboardingRedirectUri(),
      loginUrl: org.sfLoginUrl,
    });
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
    salesforceCallbackUrl: onboardingRedirectUri(),
  };
}
