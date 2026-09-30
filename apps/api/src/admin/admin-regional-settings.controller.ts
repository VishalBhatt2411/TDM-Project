import { BadRequestException, Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { supportedTimeZones } from "@tdm/domain";
import { StaffAuthGuard } from "./staff-auth.guard";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { CurrentStaff } from "./current-staff.decorator";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { PERMISSIONS } from "./permissions";
import { ConfigScopeQueryDto, ConfigScopeResolver } from "./config-scope";
import { AdminRegionalSettingsService } from "./admin-regional-settings.service";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() || undefined : value);

/** Lengths mirror the data provider's field sizes (Locale__c / Time_Zone__c). */
const REGIONAL_MAX_LENGTH = { locale: 35, timeZone: 64 } as const;

/** Shape only — the domain's parseRegionalSettings canonicalizes each value and checks it's real. */
class SaveRegionalSettingsDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(REGIONAL_MAX_LENGTH.locale) locale?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(REGIONAL_MAX_LENGTH.timeZone) timeZone?: string;
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[1-9]\d{0,2}$/, { message: "phoneCountryCode must be a 1-3 digit calling code, e.g. 91." })
  phoneCountryCode?: string;
}

/** Locale, time zone and phone calling code, company-wide or per dealership (never per branch). */
@Controller("admin/regional-settings")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class AdminRegionalSettingsController {
  constructor(
    private readonly regional: AdminRegionalSettingsService,
    private readonly scopes: ConfigScopeResolver,
  ) {}

  @Get()
  async get(@Query() query: ConfigScopeQueryDto, @CurrentStaffAccess() access: StaffAccess) {
    return { ...(await this.regional.view(await this.resolveDealership(access, query))), schema: this.schema() };
  }

  /** Replaces the whole layer at this scope — an omitted field is cleared and inherits again. */
  @Put()
  async save(
    @Query() query: ConfigScopeQueryDto,
    @Body() dto: SaveRegionalSettingsDto,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    const dealershipId = await this.resolveDealership(access, query);
    return { ...(await this.regional.save({ ...dto }, dealershipId, staff.staffUserId)), schema: this.schema() };
  }

  /** What the editor needs to offer valid choices without duplicating the server's rules. */
  private schema() {
    return { maxLength: REGIONAL_MAX_LENGTH, timeZones: supportedTimeZones() };
  }

  private async resolveDealership(access: StaffAccess, query: ConfigScopeQueryDto): Promise<string | undefined> {
    if (query.branchId) throw new BadRequestException("Regional settings can't be set per branch.");
    return (await this.scopes.resolve(access, query)).dealershipId;
  }
}
