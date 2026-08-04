import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { BookingStatus } from "@tdm/domain";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { PERMISSIONS } from "./permissions";
import { CurrentStaff } from "./current-staff.decorator";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { AdminBookingsService } from "./admin-bookings.service";
import { AssignSalesRepDto } from "./dto";

@Controller("admin/bookings")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_BOOKINGS)
export class AdminBookingsController {
  constructor(private readonly adminBookingsService: AdminBookingsService) {}

  @Get()
  list(
    @Query("status") status?: BookingStatus,
    @Query("branchId") branchId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.adminBookingsService.list({
      status,
      branchId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.adminBookingsService.getById(id);
  }

  @Patch(":id/assign-rep")
  assignRep(@Param("id") id: string, @Body() dto: AssignSalesRepDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminBookingsService.assignSalesRep(id, dto, staff.staffUserId);
  }
}
