import { AuditLogEntry, AuditLogRepository } from "@tdm/domain";
import { PrismaClient } from "@prisma/client";

export class PostgresAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(entry: Omit<AuditLogEntry, "id" | "occurredAt">): Promise<void> {
    await this.prisma.auditLogEntry.create({
      data: {
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
