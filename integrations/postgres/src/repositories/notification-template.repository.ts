import { NotificationTemplateOverrideRecord, NotificationTemplateRepository } from "@tdm/domain";
import { PrismaClient } from "@prisma/client";

function toRecord(row: { key: string; subject: string | null; note: string | null; updatedBy: string | null; updatedAt: Date }): NotificationTemplateOverrideRecord {
  return {
    key: row.key,
    subject: row.subject ?? undefined,
    note: row.note ?? undefined,
    updatedBy: row.updatedBy ?? undefined,
    updatedAt: row.updatedAt,
  };
}

export class PostgresNotificationTemplateRepository implements NotificationTemplateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByKey(key: string): Promise<NotificationTemplateOverrideRecord | null> {
    const row = await this.prisma.notificationTemplateOverride.findUnique({ where: { key } });
    return row ? toRecord(row) : null;
  }

  async findAll(): Promise<NotificationTemplateOverrideRecord[]> {
    const rows = await this.prisma.notificationTemplateOverride.findMany();
    return rows.map(toRecord);
  }

  async upsert(key: string, patch: { subject?: string; note?: string }, updatedBy?: string): Promise<NotificationTemplateOverrideRecord> {
    const row = await this.prisma.notificationTemplateOverride.upsert({
      where: { key },
      create: { key, subject: patch.subject, note: patch.note, updatedBy },
      update: { subject: patch.subject, note: patch.note, updatedBy },
    });
    return toRecord(row);
  }

  async delete(key: string): Promise<void> {
    await this.prisma.notificationTemplateOverride.delete({ where: { key } }).catch(() => undefined);
  }
}
