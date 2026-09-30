import { AuditLogEntry, AuditLogRepository } from "@tdm/domain";
import { PrismaClient } from "@prisma/client";

/**
 * Tenant-scoped audit log. The tenant comes from the caller's ambient context (the same
 * resolver the data-provider connection uses), and every read and write filters by it
 * explicitly — with no tenant resolved, the call fails rather than touching another tenant's rows.
 */
export class PostgresAuditLogRepository implements AuditLogRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly resolveOrganizationId: () => string | undefined,
  ) {}

  private organizationId(): string {
    const organizationId = this.resolveOrganizationId();
    if (!organizationId) throw new Error("Audit log access requires a resolved tenant.");
    return organizationId;
  }

  async append(entry: Omit<AuditLogEntry, "id" | "occurredAt">): Promise<void> {
    await this.prisma.auditLogEntry.create({
      data: {
        organizationId: this.organizationId(),
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata as any,
      },
    });
  }

  async query(filter: { entityType?: string; actorId?: string; limit?: number }): Promise<AuditLogEntry[]> {
    const records = await this.prisma.auditLogEntry.findMany({
      where: {
        organizationId: this.organizationId(),
        entityType: filter.entityType,
        actorId: filter.actorId,
      },
      orderBy: { occurredAt: "desc" },
      take: filter.limit ?? 50,
    });
    return records.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      metadata: r.metadata as Record<string, unknown>,
      occurredAt: r.occurredAt,
    }));
  }
}
