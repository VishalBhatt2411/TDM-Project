import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";

export interface AuthenticatedUser {
  customerId: string;
}

/**
 * Guards customer-facing endpoints. Requires `scope: "customer"` in the JWT payload
 * so a staff (admin console) token — a structurally valid JWT signed with the same
 * secret — can never be used here. See StaffAuthGuard for the mirror-image check.
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
    try {
      const payload = this.jwtService.verify<{ sub: string; scope?: string }>(token);
      if (payload.scope !== "customer") {
        throw new UnauthorizedException("This token is not valid for customer endpoints.");
      }
      request.user = { customerId: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }
  }
}
