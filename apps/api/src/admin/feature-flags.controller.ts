import { Body, Controller, Get, Inject, Param, Put, Query, UseGuards } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { FeatureFlagRepository } from "@tdm/domain";
import { FEATURE_FLAG_REPOSITORY } from "../infrastructure/tokens";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { PERMISSIONS } from "./permissions";

export class SetFeatureFlagDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  branchId?: string;
}

/**
 * Known flag keys the Admin Console UI can offer as toggles. This is a curated
 * allowlist (not an open key/value store) so the admin UI has something concrete
 * to render — new flags are added here as features are built behind them.
 */
export const KNOWN_FEATURE_FLAGS = [
  { key: "ai_recommendations", label: "AI vehicle recommendations", description: "Show personalized vehicle recommendations on the customer dashboard." },
  { key: "wishlist", label: "Wishlist", description: "Let customers save vehicles to a wishlist." },
  { key: "qr_check_in", label: "QR check-in", description: "Allow staff to check customers in by scanning a QR code instead of a manual button." },
] as const;

@Controller("admin/feature-flags")
@UseGuards(StaffAuthGuard, PermissionGuard)
export class FeatureFlagsController {
  constructor(@Inject(FEATURE_FLAG_REPOSITORY) private readonly flags: FeatureFlagRepository) {}

  @Get()
  @RequirePermission(PERMISSIONS.MANAGE_CONFIG)
  async list(@Query("branchId") branchId?: string) {
    const entries = await Promise.all(
      KNOWN_FEATURE_FLAGS.map(async (flag) => ({
        ...flag,
        enabled: await this.flags.isEnabled(flag.key, { branchId }),
      })),
    );
    return entries;
  }

  @Put(":key")
  @RequirePermission(PERMISSIONS.MANAGE_CONFIG)
  async set(@Param("key") key: string, @Body() dto: SetFeatureFlagDto) {
    await this.flags.setFlag(key, dto.enabled, { branchId: dto.branchId });
    return { key, enabled: dto.enabled, branchId: dto.branchId };
  }
}
