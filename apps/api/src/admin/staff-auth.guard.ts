import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import type { StaffRole } from "@tdm/postgres-adapter";

export interface AuthenticatedStaff {
  staffUserId: string;
  role: StaffRole;
  permissions: string[];
  /** Sales_Rep__c record Id this staff account is linked to — undefined unless explicitly provisioned. */
  salesRepId?: string;
}

/**
 * Guards admin console endpoints. Requires `scope: "staff"` in the JWT payload —
 * the mirror image of JwtAuthGuard's `scope: "customer"` check. A customer's
 * access token, even though it's a structurally valid JWT signed with the same
 * secret, can never pass this guard, and a staff token can never pass JwtAuthGuard.
 */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { staff?: AuthenticatedStaff }>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token.");
    }
    const token = header.slice("Bearer ".length);
    try {
      const payload = this.jwtService.verify<{
        sub: string;
        scope?: string;
        role?: StaffRole;
        permissions?: string[];
        salesRepId?: string;
      }>(token);
      if (payload.scope !== "staff") {
        throw new UnauthorizedException("This token is not valid for admin console endpoints.");
      }
      request.staff = {
        staffUserId: payload.sub,
        role: payload.role ?? "Manager",
        permissions: payload.permissions ?? [],
        salesRepId: payload.salesRepId,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }
  }
}
