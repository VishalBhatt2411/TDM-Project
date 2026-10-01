import { randomBytes } from "node:crypto";
import { BadRequestException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OrganizationRecord, OrganizationRepository, sha256Hex, verifySecret } from "@tdm/postgres-adapter";
import { ORGANIZATION_REPOSITORY } from "../infrastructure/tokens";
import { AUTH_SCOPE, PLATFORM_OPERATOR_SESSION_TTL_SECONDS } from "../auth/auth.constants";
import { env } from "../common/env";

export interface PlatformOrganizationDto {
  id: string;
  name: string;
  slug: string;
  connectionStatus: OrganizationRecord["connectionStatus"];
  connectionError: string | null;
  sfOrgId: string | null;
  sfInstanceUrl: string | null;
  metadataDeployedAt: string | null;
  createdAt: string;
}

/** Cross-tenant administration for the platform operator: list tenants, force a reconnect, delete. */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    @Inject(ORGANIZATION_REPOSITORY) private readonly organizations: OrganizationRepository,
    private readonly jwtService: JwtService,
  ) {}

  /** Returns a signed session token for the right password; 404 while the console is disabled. */
  async login(password: string): Promise<string> {
    const passwordHash = env.platformOperatorPasswordHash;
    if (!passwordHash) throw new NotFoundException();
    if (!(await verifySecret(password, passwordHash))) {
      this.logger.warn(JSON.stringify({ event: "platform_operator_login_failed" }));
      throw new UnauthorizedException("Incorrect password.");
    }
    this.logger.log(JSON.stringify({ event: "platform_operator_login_succeeded" }));
    return this.jwtService.sign(
      { sub: "platform-operator", scope: AUTH_SCOPE.PLATFORM_OPERATOR },
      { expiresIn: PLATFORM_OPERATOR_SESSION_TTL_SECONDS },
    );
  }

  async listOrganizations(): Promise<PlatformOrganizationDto[]> {
    return (await this.organizations.listAll()).map(toDto);
  }

  /**
   * Disconnects the tenant's Salesforce org and issues a fresh setup link for its onboarding
   * wizard. The token travels in the URL fragment, so it never reaches a server log.
   */
  async reconnect(organizationId: string): Promise<{ setupUrl: string }> {
    const token = randomBytes(32).toString("hex");
    if (!(await this.organizations.resetConnection(organizationId, sha256Hex(token)))) {
      throw new NotFoundException("Organization not found.");
    }
    this.logger.log(JSON.stringify({ event: "platform_org_reconnect_issued", organizationId }));
    return { setupUrl: `${env.adminWebOrigin}/onboarding/${organizationId}/resume#setup=${token}` };
  }

  async deleteOrganization(organizationId: string, confirmSlug: string): Promise<void> {
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new NotFoundException("Organization not found.");
    if (confirmSlug.trim().toLowerCase() !== org.slug) {
      throw new BadRequestException("The confirmation doesn't match this organization's identifier.");
    }
    if (!(await this.organizations.deleteOrganization(organizationId))) {
      throw new NotFoundException("Organization not found.");
    }
    this.logger.log(JSON.stringify({ event: "platform_org_deleted", organizationId }));
  }
}

function toDto(org: OrganizationRecord): PlatformOrganizationDto {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    connectionStatus: org.connectionStatus,
    connectionError: org.connectionError,
    sfOrgId: org.sfOrgId,
    sfInstanceUrl: org.sfInstanceUrl,
    metadataDeployedAt: org.metadataDeployedAt?.toISOString() ?? null,
    createdAt: org.createdAt.toISOString(),
  };
}
