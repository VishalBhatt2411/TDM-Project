import { Controller, Get, Inject, Logger, UseGuards } from "@nestjs/common";
import { DataProviderHealth, DomainError } from "@tdm/domain";
import { getPrismaClient } from "@tdm/postgres-adapter";
import { DATA_PROVIDER_HEALTH } from "../infrastructure/tokens";
import { StaffAuthGuard } from "./staff-auth.guard";
import { PermissionGuard } from "./permission.guard";
import { RequirePermission } from "./require-permission.decorator";
import { PERMISSIONS } from "./permissions";

const prisma = getPrismaClient();

interface ComponentHealth {
  name: string;
  status: "ok" | "degraded" | "down";
  latencyMs?: number;
  message?: string;
}

const logger = new Logger("SystemHealth");

async function checkComponent(name: string, probe: () => Promise<void>): Promise<ComponentHealth> {
  const startedAt = Date.now();
  try {
    await probe();
    return { name, status: "ok", latencyMs: Date.now() - startedAt };
  } catch (err) {
    // Raw driver/provider errors can carry hostnames, SQL or instance URLs — log them, show a safe summary.
    logger.error(JSON.stringify({ event: "health_check_failed", component: name, reason: (err as Error)?.message }));
    const message = err instanceof DomainError ? err.message : "Unreachable — see server logs for details.";
    return { name, status: "down", latencyMs: Date.now() - startedAt, message };
  }
}

@Controller("admin/system-health")
@UseGuards(StaffAuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.MANAGE_CONFIG)
export class SystemHealthController {
  constructor(@Inject(DATA_PROVIDER_HEALTH) private readonly dataProvider: DataProviderHealth) {}

  @Get()
  async check() {
    const [database, dataProvider] = await Promise.all([
      checkComponent("Postgres (operational store)", async () => {
        await prisma.$queryRaw`SELECT 1`;
      }),
      checkComponent(`${this.dataProvider.name} (system of record)`, () => this.dataProvider.ping()),
    ]);

    const components = [database, dataProvider];
    const overall: ComponentHealth["status"] = components.some((c) => c.status === "down")
      ? "down"
      : components.some((c) => c.status === "degraded")
        ? "degraded"
        : "ok";

    return { status: overall, checkedAt: new Date().toISOString(), components };
  }
}
