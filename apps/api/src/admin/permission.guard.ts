import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { PERMISSION_KEY } from "./require-permission.decorator";
import type { PermissionKey } from "./permissions";

/**
 * Runs after StaffAuthGuard. "Admin" role implicitly has every permission — this
 * is a deliberate, hardcoded rule (not "Admin has permissions=[...all]" in the DB)
 * so an Admin can never be accidentally locked out by a stale/empty permissions array.
 * Every other role must have the specific permission key in their granted list.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<PermissionKey | undefined>(PERMISSION_KEY, context.getHandler());
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request & { staff?: AuthenticatedStaff }>();
    const staff = request.staff;
    if (!staff) {
      throw new ForbiddenException("Staff context missing — StaffAuthGuard must run first.");
    }
    if (staff.role === "Admin") return true;
    if (staff.permissions.includes(required)) return true;

    throw new ForbiddenException(`Missing required permission: ${required}`);
  }
}
