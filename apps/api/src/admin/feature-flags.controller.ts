import { Body, Controller, Delete, Get, Inject, Param, ParseEnumPipe, Put, Query, UseGuards } from "@nestjs/common";
import { IsBoolean } from "class-validator";
import { AuditLogRepository, FEATURE_FLAG_KEYS, FEATURE_FLAGS, FeatureFlagRepository } from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY, FEATURE_FLAG_REPOSITORY } from "../infrastructure/tokens";
import { FeatureFlagService } from "../config/feature-flag.service";
import { TenantContext } from "../tenancy/tenant-context";
import { StaffAuthGuard } from "./staff-auth.guard";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { CurrentStaff } from "./current-staff.decorator";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { PERMISSIONS } from "./permissions";
import { ConfigScopeQueryDto, ConfigScopeResolver, scopeMetadata } from "./config-scope";

export class SetFeatureFlagDto extends ConfigScopeQueryDto {
  @IsBoolean()
  enabled!: boolean;
}

const FLAG_KEYS = [...FEATURE_FLAG_KEYS];

/** Switches the features in FEATURE_FLAGS company-wide, per dealership or per branch; the most specific setting wins. */
@Controller("admin/feature-flags")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class FeatureFlagsController {
  constructor(
    @Inject(FEATURE_FLAG_REPOSITORY) private readonly flags: FeatureFlagRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly scopes: ConfigScopeResolver,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  @Get()
  async list(@Query() query: ConfigScopeQueryDto, @CurrentStaffAccess() access: StaffAccess) {
    const scope = await this.scopes.resolve(access, query);
    const settings = await this.featureFlags.resolve(scope);
    return FEATURE_FLAGS.map((flag) => ({ ...flag, ...settings[flag.key] }));
  }

  @Put(":key")
  async set(
    @Param("key", new ParseEnumPipe(FLAG_KEYS)) key: string,
    @Body() dto: SetFeatureFlagDto,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    const scope = await this.scopes.resolve(access, dto);
    await this.flags.setFlag(key, dto.enabled, scope);
    this.invalidate();
    await this.auditLog.append({
      actorId: staff.staffUserId,
      action: "FEATURE_FLAG_SET",
      entityType: "FeatureFlag",
      entityId: key,
      dealershipId: scope.dealershipId,
      metadata: { enabled: dto.enabled, ...scopeMetadata(scope) },
    });
    return { key, enabled: dto.enabled, ...scope };
  }

  /** Drops the setting at exactly this scope, so the flag inherits from the next wider one. */
  @Delete(":key")
  async clear(
    @Param("key", new ParseEnumPipe(FLAG_KEYS)) key: string,
    @Query() query: ConfigScopeQueryDto,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    const scope = await this.scopes.resolve(access, query);
    await this.flags.clearFlag(key, scope);
    this.invalidate();
    await this.auditLog.append({
      actorId: staff.staffUserId,
      action: "FEATURE_FLAG_CLEARED",
      entityType: "FeatureFlag",
      entityId: key,
      dealershipId: scope.dealershipId,
      metadata: scopeMetadata(scope),
    });
    return { key, cleared: true };
  }

  private invalidate(): void {
    const organizationId = TenantContext.currentOrganizationId();
    if (organizationId) this.featureFlags.invalidate(organizationId);
  }
}
