import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { BookingStatus } from "@tdm/domain";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { PERMISSIONS } from "./permissions";
import { CurrentStaff } from "./current-staff.decorator";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { AdminBookingsService } from "./admin-bookings.service";
import { AssignSalesRepDto, CheckInBookingDto, CompleteDriveDto, SetStaffNotesDto, StartDriveDto } from "./dto";
import { CancelBookingDto, RescheduleBookingDto } from "../bookings/dto";

/**
 * Every route requires a valid staff session with at least one active assignment. The
 * dealership-wide routes (list, assign-rep) additionally require MANAGE_BOOKINGS and are
 * limited to the dealerships where it's held. The per-booking action routes have no such
 * decorator — BookingAccessPolicy enforces that a rep without MANAGE_BOOKINGS there may
 * only act on bookings currently assigned to them.
 */
@Controller("admin/bookings")
@UseGuards(StaffAuthGuard, PermissionGuard)
export class AdminBookingsController {
  constructor(private readonly adminBookingsService: AdminBookingsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.MANAGE_BOOKINGS)
  list(
    @CurrentStaffAccess() access: StaffAccess,
    @Query("status") status?: BookingStatus,
    @Query("branchId") branchId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.adminBookingsService.list(
      {
        status,
        branchId,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      access,
    );
  }

  /** Bookings currently assigned to the signed-in staff member — any status. */
  @Get("mine")
  listMine(
    @CurrentStaffAccess() access: StaffAccess,
    @Query("status") status?: BookingStatus,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.adminBookingsService.listMine(access, {
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(":id")
  getById(@Param("id") id: string, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.getById(id, staff);
  }

  @Patch(":id/assign-rep")
  @RequirePermission(PERMISSIONS.MANAGE_BOOKINGS)
  assignRep(
    @Param("id") id: string,
    @Body() dto: AssignSalesRepDto,
    @CurrentStaff() staff: AuthenticatedStaff,
    @CurrentStaffAccess() access: StaffAccess,
  ) {
    return this.adminBookingsService.assignSalesRep(id, dto, staff.staffUserId, access);
  }

  /** A rep handing their own booking off to a colleague. */
  @Patch(":id/handoff")
  handoff(@Param("id") id: string, @Body() dto: AssignSalesRepDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.handoff(id, dto, staff);
  }

  @Patch(":id/check-in")
  checkIn(@Param("id") id: string, @Body() dto: CheckInBookingDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.checkIn(id, dto, staff);
  }

  @Patch(":id/start")
  start(@Param("id") id: string, @Body() dto: StartDriveDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.start(id, dto, staff);
  }

  @Patch(":id/complete")
  complete(@Param("id") id: string, @Body() dto: CompleteDriveDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.complete(id, dto, staff);
  }

  @Patch(":id/no-show")
  markNoShow(@Param("id") id: string, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.markNoShow(id, staff);
  }

  @Patch(":id/notes")
  setNotes(@Param("id") id: string, @Body() dto: SetStaffNotesDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.setNotes(id, dto, staff);
  }

  @Patch(":id/cancel")
  cancel(@Param("id") id: string, @Body() dto: CancelBookingDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.cancel(id, dto, staff);
  }

  @Patch(":id/reschedule")
  reschedule(@Param("id") id: string, @Body() dto: RescheduleBookingDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.reschedule(id, dto, staff);
  }
}
