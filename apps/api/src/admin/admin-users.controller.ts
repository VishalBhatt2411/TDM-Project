import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { PERMISSIONS } from "./permissions";
import { CurrentStaff } from "./current-staff.decorator";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { AdminUsersService } from "./admin-users.service";
import { CreateStaffUserDto, UpdateStaffUserDto } from "./dto";

@Controller("admin/users")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_USERS)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  list() {
    return this.adminUsersService.list();
  }

  @Post()
  create(@Body() dto: CreateStaffUserDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminUsersService.create(dto, staff);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateStaffUserDto, @CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminUsersService.update(id, dto, staff);
  }
}
