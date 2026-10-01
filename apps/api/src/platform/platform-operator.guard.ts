import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AUTH_SCOPE, PLATFORM_OPERATOR_COOKIE } from "../auth/auth.constants";
import { parseCookieHeader } from "../common/cookie.util";
import { env } from "../common/env";

/**
 * Guards the cross-tenant operator console. The session is an HttpOnly cookie holding a
 * short-lived JWT with `scope: "platform_operator"` — a staff or customer token never passes.
 * Without PLATFORM_OPERATOR_PASSWORD_HASH configured the console doesn't exist (404).
 */
@Injectable()
export class PlatformOperatorGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!env.platformOperatorPasswordHash) throw new NotFoundException();
    const request = context.switchToHttp().getRequest<Request>();
    const token = parseCookieHeader(request.headers.cookie)[PLATFORM_OPERATOR_COOKIE];
    if (!token) throw new UnauthorizedException("Not authenticated.");
    let payload: { scope?: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired session.");
    }
    if (payload.scope !== AUTH_SCOPE.PLATFORM_OPERATOR) {
      throw new UnauthorizedException("This token is not valid for the operator console.");
    }
    return true;
  }
}
