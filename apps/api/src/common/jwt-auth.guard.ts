import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";

export interface AuthenticatedUser {
  customerId: string;
}

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
      const payload = this.jwtService.verify<{ sub: string }>(token);
      request.user = { customerId: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }
  }
}
