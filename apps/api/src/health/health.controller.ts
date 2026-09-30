import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

/**
 * Unauthenticated liveness/readiness probe for process managers, load balancers,
 * and uptime monitoring — deliberately outside the versioned `/api/v1` prefix
 * (see main.ts) and outside RBAC, since infra tooling should never need a token
 * just to ask "is this process up".
 */
@SkipThrottle()
@Controller("health")
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  check() {
    return {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
