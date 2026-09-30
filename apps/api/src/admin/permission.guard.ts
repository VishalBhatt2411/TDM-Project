import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import type { AuthenticatedStaff } from "./staff-auth.guard";
import { PERMISSION_KEY } from "./require-permission.decorator";
import type { PermissionKey } from "./permissions";
import type { StaffAccess } from "./staff-access";
import { StaffAccessService } from "./staff-access.service";

/**
 * Runs after StaffAuthGuard. Resolves the staff member's access from their active staff
 * assignments on every request — never from the JWT, which carries identity only — and
 * exposes it as `request.staffAccess` (see CurrentStaffAccess) so handlers can scope their
 * queries. A staff member with no active assignment is refused even on routes that need no
 * specific permission, so removing someone's last assignment locks them out.
 *
 * `@RequirePermission` only establishes that the permission is held *somewhere*; handlers
 * must still limit their work to `scopeFor(permission)`.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly staffAccess: StaffAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { staff?: AuthenticatedStaff; staffAccess?: StaffAccess }>();
    const staff = request.staff;
    if (!staff) {
      throw new ForbiddenException("Staff context missing — StaffAuthGuard must run first.");
    }
    const access = await this.staffAccess.resolve(staff);
    if (!access) {
      throw new ForbiddenException("Your staff access has been removed.");
    }
    request.staffAccess = access;

    // Method-level @RequirePermission overrides a class-level one; a class-level one alone
    // must still apply to every handler, so both targets are consulted.
    const required = this.reflector.getAllAndOverride<PermissionKey | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || access.can(required)) return true;

    throw new ForbiddenException(`Missing required permission: ${required}`);
  }
}
