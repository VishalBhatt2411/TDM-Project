import { BadRequestException, Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsInt, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import {
  CANCELLATION_CUTOFF_RANGE,
  CHECK_IN_OPENS_RANGE,
  FOLLOW_UP_DAYS_RANGE,
  MAX_BREAKS,
  MAX_CLOSURES,
  MAX_CLOSURE_NAME,
  NOTICE_MINUTES_RANGE,
  SLOT_MINUTES_RANGE,
  WEEKDAYS,
} from "@tdm/domain";
import { StaffAuthGuard } from "./staff-auth.guard";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { CurrentStaff } from "./current-staff.decorator";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { PERMISSIONS } from "./permissions";
import { ConfigScopeQueryDto, ConfigScopeResolver } from "./config-scope";
import { AdminBookingScheduleService } from "./admin-booking-schedule.service";

/** Shape only — the domain's parseBookingSchedule validates every time, window and weekday. */
class SaveBookingScheduleDto {
  @IsOptional() @IsInt() slotMinutes?: number;
  @IsOptional() @IsObject() weeklyHours?: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_BREAKS) breaks?: unknown[];
  @IsOptional() @IsInt() minNoticeMinutes?: number;
  @IsOptional() @IsInt() cancellationCutoffMinutes?: number;
  @IsOptional() @IsInt() checkInOpensMinutes?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(FOLLOW_UP_DAYS_RANGE.maxCount) followUpDays?: unknown[];
  @IsOptional() @IsString() @MaxLength(5) dayOfReminderTime?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_CLOSURES) closures?: unknown[];
}

/** Slot length, opening hours, breaks, closures, notice, cancellation cutoff, check-in window and follow-ups for test-drive bookings, company-wide or per dealership (never per branch). */
@Controller("admin/booking-schedule")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class AdminBookingScheduleController {
  constructor(
    private readonly schedules: AdminBookingScheduleService,
    private readonly scopes: ConfigScopeResolver,
  ) {}

  @Get()
  async get(@Query() query: ConfigScopeQueryDto, @CurrentStaffAccess() access: StaffAccess) {
    return { ...(await this.schedules.view(await this.resolveDealership(access, query))), schema: this.schema() };
  }

  /** Replaces the whole schedule at this scope — an omitted field is cleared and inherits again. */
  @Put()
  async save(
    @Query() query: ConfigScopeQueryDto,
    @Body() dto: SaveBookingScheduleDto,
    @CurrentStaffAccess() access: StaffAccess,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    const dealershipId = await this.resolveDealership(access, query);
    return { ...(await this.schedules.save({ ...dto }, dealershipId, staff.staffUserId)), schema: this.schema() };
  }

  /** What the editor needs to offer valid choices without duplicating the server's rules. */
  private schema() {
    return {
      slotMinutes: SLOT_MINUTES_RANGE,
      minNoticeMinutes: NOTICE_MINUTES_RANGE,
      cancellationCutoffMinutes: CANCELLATION_CUTOFF_RANGE,
      checkInOpensMinutes: CHECK_IN_OPENS_RANGE,
      followUpDays: FOLLOW_UP_DAYS_RANGE,
      maxBreaks: MAX_BREAKS,
      maxClosures: MAX_CLOSURES,
      maxClosureName: MAX_CLOSURE_NAME,
      weekdays: WEEKDAYS,
    };
  }

  private async resolveDealership(access: StaffAccess, query: ConfigScopeQueryDto): Promise<string | undefined> {
    if (query.branchId) throw new BadRequestException("Booking schedules can't be set per branch.");
    return (await this.scopes.resolve(access, query)).dealershipId;
  }
}
