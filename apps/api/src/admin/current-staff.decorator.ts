import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedStaff } from "./staff-auth.guard";

export const CurrentStaff = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedStaff => {
  const request = ctx.switchToHttp().getRequest();
  return request.staff;
});
