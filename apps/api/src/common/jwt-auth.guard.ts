import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AUTH_SCOPE } from "../auth/auth.constants";
import { TenantContext } from "../tenancy/tenant-context";

export interface AuthenticatedUser {
  customerId: string;
}

/**
 * Guards customer-facing endpoints. Requires `scope: "customer"` in the JWT payload
 * so a staff (admin console) token — a structurally valid JWT signed with the same
 * secret — can never be used here. See StaffAuthGuard for the mirror-image check.
 * The token's `org` must match the company address's tenant (TenantContext.bindSession).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token.");
    }
    const token = header.slice("Bearer ".length);
    let payload: { sub: string; scope?: string; org?: string };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }
    if (payload.scope !== AUTH_SCOPE.CUSTOMER) {
      throw new UnauthorizedException("This token is not valid for customer endpoints.");
    }
    TenantContext.bindSession(payload.org);
    request.user = { customerId: payload.sub };
    return true;
  }
}
