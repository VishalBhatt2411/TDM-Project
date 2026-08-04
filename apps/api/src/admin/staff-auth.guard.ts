import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { StaffRole } from "@tdm/postgres-adapter";
import { ACCESS_TOKEN_COOKIE, AUTH_SCOPE } from "../auth/auth.constants";
import { parseCookieHeader } from "../common/cookie.util";

export interface AuthenticatedStaff {
  staffUserId: string;
  role: StaffRole;
}

/**
 * Guards admin console endpoints. Reads the access token from the HttpOnly
 * `tdm_staff_at` cookie (never from an Authorization header or request body — the
 * token is never exposed to browser JavaScript) and requires `scope: "staff"` in
 * its payload — the mirror image of JwtAuthGuard's `scope: "customer"` check.
 *
 * Note the payload intentionally carries only `sub`/`scope`/`role`, not
 * permissions — see AdminAuthService.issueTokens and PermissionGuard.
 */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { staff?: AuthenticatedStaff }>();
    const token = parseCookieHeader(request.headers.cookie)[ACCESS_TOKEN_COOKIE];
    if (!token) {
      throw new UnauthorizedException("Not authenticated.");
    }
    try {
      const payload = this.jwtService.verify<{ sub: string; scope?: string; role?: StaffRole }>(token);
      if (payload.scope !== AUTH_SCOPE.STAFF) {
        throw new UnauthorizedException("This token is not valid for admin console endpoints.");
      }
      request.staff = {
        staffUserId: payload.sub,
        role: payload.role ?? StaffRole.Manager,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired session.");
    }
  }
}
