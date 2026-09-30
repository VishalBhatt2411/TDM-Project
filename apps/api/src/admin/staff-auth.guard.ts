import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { ACCESS_TOKEN_COOKIE, AUTH_SCOPE } from "../auth/auth.constants";
import { parseCookieHeader } from "../common/cookie.util";
import { TenantContext } from "../tenancy/tenant-context";

export interface AuthenticatedStaff {
  staffUserId: string;
  /** Tenant the session was issued for — every staff request runs against this tenant only. */
  organizationId: string;
}

/**
 * Guards admin console endpoints. Reads the access token from the HttpOnly
 * `tdm_staff_at` cookie (never from an Authorization header or request body — the
 * token is never exposed to browser JavaScript) and requires `scope: "staff"` in
 * its payload — the mirror image of JwtAuthGuard's `scope: "customer"` check.
 *
 * Note the payload intentionally carries identity only (`sub`/`scope`/`org`) — roles and
 * dealership access are resolved per request by PermissionGuard. `org` binds the request's
 * tenant context; a token presented on another tenant's host is rejected.
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
    let payload: { sub: string; scope?: string; org?: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired session.");
    }
    if (payload.scope !== AUTH_SCOPE.STAFF) {
      throw new UnauthorizedException("This token is not valid for admin console endpoints.");
    }
    // Pre-tenancy tokens carry no `org` — bindSession rejects them, forcing a fresh login.
    TenantContext.bindSession(payload.org);
    request.staff = { staffUserId: payload.sub, organizationId: payload.org! };
    return true;
  }
}
