import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";
import { AuditLogRepository } from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY } from "../infrastructure/tokens";
import { env } from "../common/env";
import { IsRecordId, ParseRecordIdPipe } from "../common/record-id";
import { CustomDomainService } from "../tenancy/custom-domain.service";
import { StaffAuthGuard } from "./staff-auth.guard";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { CurrentStaff } from "./current-staff.decorator";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { PERMISSIONS } from "./permissions";
import { ConfigScopeResolver } from "./config-scope";

/** Longest DNS host name. */
const MAX_HOSTNAME_LENGTH = 253;

export class CompanyDomainDto {
  @IsString()
  @MaxLength(MAX_HOSTNAME_LENGTH)
  hostname!: string;
}

export class DealershipDomainDto {
  /** null clears the dealership's domain. */
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_HOSTNAME_LENGTH)
  hostname!: string | null;
}

export class VerifyDomainDto extends CompanyDomainDto {
  /** Omitted for a company-wide domain. */
  @IsOptional()
  @IsRecordId()
  dealershipId?: string;
}

/**
 * Custom domains for the tenant's customer sites. A domain routes only once its DNS publishes the
 * tenant's verification record; company-wide domains need company-wide config rights, a dealer's
 * domain needs config rights at that dealership.
 */
@Controller("admin/domains")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class CustomDomainsController {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly scopes: ConfigScopeResolver,
    private readonly domains: CustomDomainService,
  ) {}

  @Get()
  async list(@CurrentStaffAccess() access: StaffAccess) {
    const sites = await this.domains.listSites(access.isCompanyAdmin, (id) => access.canIn(PERMISSIONS.MANAGE_CONFIG, id));
    return { target: env.customDomainTarget, sites };
  }

  @Post()
  async addCompanyDomain(
    @Body() dto: CompanyDomainDto,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    await this.scopes.resolve(access, {});
    await this.domains.addCompanyDomain(dto.hostname);
    const view = await this.domains.verify(dto.hostname.trim(), null);
    await this.audit(staff, "CUSTOM_DOMAIN_ADDED", view.hostname, undefined);
    return view;
  }

  @Delete(":hostname")
  @HttpCode(204)
  async removeCompanyDomain(
    @Param("hostname") hostname: string,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ): Promise<void> {
    await this.scopes.resolve(access, {});
    await this.domains.removeCompanyDomain(hostname);
    await this.audit(staff, "CUSTOM_DOMAIN_REMOVED", hostname.toLowerCase(), undefined);
  }

  @Put("dealerships/:dealershipId")
  async setDealershipDomain(
    @Param("dealershipId", ParseRecordIdPipe) dealershipId: string,
    @Body() dto: DealershipDomainDto,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    await this.scopes.resolve(access, { dealershipId });
    await this.domains.setDealershipDomain(dealershipId, dto.hostname);
    await this.audit(staff, "CUSTOM_DOMAIN_SET", dto.hostname?.trim().toLowerCase() ?? dealershipId, dealershipId, {
      hostname: dto.hostname?.trim().toLowerCase() ?? null,
    });
    return dto.hostname === null ? { dealershipId, hostname: null } : this.domains.verify(dto.hostname.trim(), dealershipId);
  }

  /** Checks DNS now rather than waiting for the next scheduled sync. */
  @Post("verify")
  @HttpCode(200)
  async verify(@Body() dto: VerifyDomainDto, @CurrentStaffAccess() access: StaffAccess) {
    await this.scopes.resolve(access, dto.dealershipId ? { dealershipId: dto.dealershipId } : {});
    return this.domains.verify(dto.hostname.trim(), dto.dealershipId ?? null);
  }

  private audit(
    staff: AuthenticatedStaff,
    action: string,
    entityId: string,
    dealershipId: string | undefined,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    return this.auditLog.append({ actorId: staff.staffUserId, action, entityType: "CustomDomain", entityId, dealershipId, metadata });
  }
}
