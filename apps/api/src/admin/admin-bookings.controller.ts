import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { PERMISSIONS } from "./permissions";
import { CurrentStaff } from "./current-staff.decorator";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { AdminBookingsService } from "./admin-bookings.service";
import { AdminBookingListQueryDto, AssignSalesRepDto, BookingListQueryDto, CheckInBookingDto, CompleteDriveDto, SetStaffNotesDto, StartDriveDto } from "./dto";
import { CancelBookingDto, RescheduleBookingDto } from "../bookings/dto";
import { VehicleAvailabilityQueryDto } from "../vehicles/dto";
import { ParseRecordIdPipe } from "../common/record-id";

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
  list(@CurrentStaffAccess() access: StaffAccess, @Query() query: AdminBookingListQueryDto) {
    return this.adminBookingsService.list(query, access);
  }

  /** Bookings currently assigned to the signed-in staff member — any status. */
  @Get("mine")
  listMine(@CurrentStaffAccess() access: StaffAccess, @Query() query: BookingListQueryDto) {
    return this.adminBookingsService.listMine(access, query);
  }

  @Get(":id")
  getById(@Param("id", ParseRecordIdPipe) id: string, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.getById(id, staff);
  }

  @Patch(":id/assign-rep")
  @RequirePermission(PERMISSIONS.MANAGE_BOOKINGS)
  assignRep(
    @Param("id", ParseRecordIdPipe) id: string,
    @Body() dto: AssignSalesRepDto,
    @CurrentStaff() staff: AuthenticatedStaff,
    @CurrentStaffAccess() access: StaffAccess,
  ) {
    return this.adminBookingsService.assignSalesRep(id, dto, staff.staffUserId, access);
  }

  /** A rep handing their own booking off to a colleague. */
  @Patch(":id/handoff")
  handoff(@Param("id", ParseRecordIdPipe) id: string, @Body() dto: AssignSalesRepDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.handoff(id, dto, staff);
  }

  @Patch(":id/check-in")
  checkIn(@Param("id", ParseRecordIdPipe) id: string, @Body() dto: CheckInBookingDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.checkIn(id, dto, staff);
  }

  @Patch(":id/start")
  start(@Param("id", ParseRecordIdPipe) id: string, @Body() dto: StartDriveDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.start(id, dto, staff);
  }

  @Patch(":id/complete")
  complete(@Param("id", ParseRecordIdPipe) id: string, @Body() dto: CompleteDriveDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.complete(id, dto, staff);
  }

  @Patch(":id/no-show")
  markNoShow(@Param("id", ParseRecordIdPipe) id: string, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.markNoShow(id, staff);
  }

  @Patch(":id/notes")
  setNotes(@Param("id", ParseRecordIdPipe) id: string, @Body() dto: SetStaffNotesDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.setNotes(id, dto, staff);
  }

  @Patch(":id/cancel")
  cancel(@Param("id", ParseRecordIdPipe) id: string, @Body() dto: CancelBookingDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.cancel(id, dto, staff);
  }

  @Get(":id/slots")
  slots(@Param("id", ParseRecordIdPipe) id: string, @Query() query: VehicleAvailabilityQueryDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.slots(id, query.date, staff);
  }

  @Patch(":id/reschedule")
  reschedule(@Param("id", ParseRecordIdPipe) id: string, @Body() dto: RescheduleBookingDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.reschedule(id, dto, staff);
  }
}
