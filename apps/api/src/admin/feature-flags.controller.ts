import { Body, Controller, Delete, Get, Inject, Param, ParseEnumPipe, Put, Query, UseGuards } from "@nestjs/common";
import { IsBoolean } from "class-validator";
import { AuditLogRepository, FeatureFlagRepository } from "@tdm/domain";
import { AUDIT_LOG_REPOSITORY, FEATURE_FLAG_REPOSITORY } from "../infrastructure/tokens";
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

/**
 * The features that can be switched — a registry of what the code actually gates, not an
 * open key/value store. A flag is set company-wide, per dealership or per branch; the most
 * specific setting wins (see FeatureFlagRepository.resolve).
 */
export const KNOWN_FEATURE_FLAGS = [
  { key: "ai_recommendations", label: "AI vehicle recommendations", description: "Show personalized vehicle recommendations on the customer dashboard." },
  { key: "wishlist", label: "Wishlist", description: "Let customers save vehicles to a wishlist." },
  { key: "qr_check_in", label: "QR check-in", description: "Allow staff to check customers in by scanning a QR code instead of a manual button." },
] as const;

const FLAG_KEYS = KNOWN_FEATURE_FLAGS.map((f) => f.key);

@Controller("admin/feature-flags")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class FeatureFlagsController {
  constructor(
    @Inject(FEATURE_FLAG_REPOSITORY) private readonly flags: FeatureFlagRepository,
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLog: AuditLogRepository,
    private readonly scopes: ConfigScopeResolver,
  ) {}

  @Get()
  async list(@Query() query: ConfigScopeQueryDto, @CurrentStaffAccess() access: StaffAccess) {
    const scope = await this.scopes.resolve(access, query);
    const settings = await this.flags.resolve(FLAG_KEYS, scope);
    return KNOWN_FEATURE_FLAGS.map((flag) => ({ ...flag, ...settings[flag.key] }));
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
    await this.auditLog.append({
      actorId: staff.staffUserId,
      action: "FEATURE_FLAG_SET",
      entityType: "FeatureFlag",
      entityId: key,
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
    await this.auditLog.append({
      actorId: staff.staffUserId,
      action: "FEATURE_FLAG_CLEARED",
      entityType: "FeatureFlag",
      entityId: key,
      metadata: scopeMetadata(scope),
    });
    return { key, cleared: true };
  }
}
