import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { StaffRole, StaffUserRepository } from "@tdm/postgres-adapter";
import { STAFF_USER_REPOSITORY } from "../infrastructure/tokens";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { PERMISSION_KEY } from "./require-permission.decorator";
import type { PermissionKey } from "./permissions";

/**
 * Runs after StaffAuthGuard. "Admin" role implicitly has every permission — this
 * is a deliberate, hardcoded rule (not "Admin has permissions=[...all]" in the DB)
 * so an Admin can never be accidentally locked out by a stale/empty permissions array.
 *
 * Every other role's permissions are read fresh from the database on every check —
 * never trusted from the JWT (which deliberately omits them, see AdminAuthService)
 * — so granting or revoking a permission takes effect on the staff member's very
 * next request instead of waiting for their access token to expire.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(STAFF_USER_REPOSITORY) private readonly staffUsers: StaffUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<PermissionKey | undefined>(PERMISSION_KEY, context.getHandler());
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request & { staff?: AuthenticatedStaff }>();
    const staff = request.staff;
    if (!staff) {
      throw new ForbiddenException("Staff context missing — StaffAuthGuard must run first.");
    }
    if (staff.role === StaffRole.Admin) return true;

    const current = await this.staffUsers.findById(staff.staffUserId);
    if (!current || !current.isActive) {
      throw new ForbiddenException("Staff account is no longer active.");
    }
    if (current.permissions.includes(required)) return true;

    throw new ForbiddenException(`Missing required permission: ${required}`);
  }
}
