import { createParamDecorator, ExecutionContext, ForbiddenException } from "@nestjs/common";
import type { StaffAccess } from "./staff-access";

/** The access PermissionGuard resolved for this request. */
export const CurrentStaffAccess = createParamDecorator((_data: unknown, ctx: ExecutionContext): StaffAccess => {
  const access = ctx.switchToHttp().getRequest().staffAccess;
  if (!access) {
    throw new ForbiddenException("Staff access missing — PermissionGuard must run first.");
  }
  return access;
});
