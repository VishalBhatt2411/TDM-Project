import { PrismaClient } from "@prisma/client";

export type ReminderType = "24h" | "2h" | "day_of";

export class ReminderLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async wasSent(bookingId: string, type: ReminderType): Promise<boolean> {
    const record = await this.prisma.reminderLog.findUnique({
      where: { bookingId_reminderType: { bookingId, reminderType: type } },
    });
    return !!record;
  }

  async markSent(bookingId: string, type: ReminderType): Promise<void> {
    await this.prisma.reminderLog
      .create({ data: { bookingId, reminderType: type } })
      .catch(() => undefined); // unique constraint race — already marked, safe to ignore
  }
}

export class FollowUpLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async wasSent(bookingId: string, intervalDays: number): Promise<boolean> {
    const record = await this.prisma.followUpLog.findUnique({
      where: { bookingId_intervalDays: { bookingId, intervalDays } },
    });
    return !!record;
  }

  async markSent(bookingId: string, intervalDays: number): Promise<void> {
    await this.prisma.followUpLog.create({ data: { bookingId, intervalDays } }).catch(() => undefined);
  }
}
