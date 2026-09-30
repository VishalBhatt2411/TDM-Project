import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { PERMISSIONS } from "./permissions";
import { CurrentStaff } from "./current-staff.decorator";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { CurrentStaffAccess } from "./current-staff-access.decorator";
import type { StaffAccess } from "./staff-access";
import { AdminUsersService } from "./admin-users.service";
import { CreateStaffAssignmentDto, StaffDirectoryQueryDto, UpdateStaffAssignmentDto } from "./dto";

/**
 * Staff access is managed as staff assignments (a Salesforce user holding a role at a
 * dealership) — there are no local accounts or invites. Every route is limited to the
 * dealerships where the actor holds MANAGE_USERS.
 */
@Controller("admin/users")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_USERS)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  list(@CurrentStaffAccess() access: StaffAccess) {
    return this.adminUsersService.list(access);
  }

  /** Salesforce users who can be granted access. */
  @Get("directory")
  directory(@Query() query: StaffDirectoryQueryDto) {
    return this.adminUsersService.searchDirectory(query.q);
  }

  @Post()
  create(
    @Body() dto: CreateStaffAssignmentDto,
    @CurrentStaff() staff: AuthenticatedStaff,
    @CurrentStaffAccess() access: StaffAccess,
  ) {
    return this.adminUsersService.create(dto, staff, access);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateStaffAssignmentDto,
    @CurrentStaff() staff: AuthenticatedStaff,
    @CurrentStaffAccess() access: StaffAccess,
  ) {
    return this.adminUsersService.update(id, dto, staff, access);
  }
}
