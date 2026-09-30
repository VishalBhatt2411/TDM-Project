import { Controller, Get, Inject, Logger, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { DataProviderHealth } from "@tdm/domain";
import { PLATFORM_STORE_HEALTH } from "../infrastructure/tokens";

/**
 * Unauthenticated liveness/readiness probe for process managers, load balancers,
 * and uptime monitoring — deliberately outside the versioned `/api/v1` prefix
 * (see main.ts) and outside RBAC, since infra tooling should never need a token
 * just to ask "is this process up".
 */
@SkipThrottle()
@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startedAt = Date.now();

  constructor(@Inject(PLATFORM_STORE_HEALTH) private readonly platformStore: DataProviderHealth) {}

  @Get()
  check() {
    return {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness: can this instance serve traffic? Only the platform store is checked — each tenant's
   * data provider is per-org (see admin system health), so one tenant's outage never drains the pool.
   */
  @Get("ready")
  async ready() {
    try {
      await this.platformStore.ping();
    } catch (err) {
      this.logger.error(JSON.stringify({ event: "readiness_failed", store: this.platformStore.name, reason: (err as Error)?.name }));
      throw new ServiceUnavailableException({ status: "unavailable", store: this.platformStore.name });
    }
    return { status: "ready", store: this.platformStore.name, timestamp: new Date().toISOString() };
  }
}
