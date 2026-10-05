import { Prisma, PrismaClient } from "@prisma/client";

export type ReminderType = "24h" | "2h" | "day_of";

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

function requireOrganizationId(resolve: () => string | undefined): string {
  const organizationId = resolve();
  if (!organizationId) throw new Error("Automation tracking requires a resolved tenant.");
  return organizationId;
}

/**
 * Claim-based de-duplication for scheduled sends. A booking id is a data-provider record Id —
 * unique only within one tenant's org — so every row is keyed by the tenant too. `claim` inserts
 * first and only the winner of the unique constraint may send; a failed send must `release` so the
 * next run retries instead of skipping it forever.
 */
export class ReminderLogRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly resolveOrganizationId: () => string | undefined,
  ) {}

  /** True when this caller now owns sending the reminder; false when it was already claimed. */
  async claim(bookingId: string, type: ReminderType): Promise<boolean> {
    const organizationId = requireOrganizationId(this.resolveOrganizationId);
    try {
      await this.prisma.reminderLog.create({ data: { organizationId, bookingId, reminderType: type } });
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) return false;
      throw err;
    }
  }

  async release(bookingId: string, type: ReminderType): Promise<void> {
    const organizationId = requireOrganizationId(this.resolveOrganizationId);
    await this.prisma.reminderLog.deleteMany({ where: { organizationId, bookingId, reminderType: type } });
  }
}

export class FollowUpLogRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly resolveOrganizationId: () => string | undefined,
  ) {}

  async claim(bookingId: string, intervalDays: number): Promise<boolean> {
    const organizationId = requireOrganizationId(this.resolveOrganizationId);
    try {
      await this.prisma.followUpLog.create({ data: { organizationId, bookingId, intervalDays } });
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) return false;
      throw err;
    }
  }

  async release(bookingId: string, intervalDays: number): Promise<void> {
    const organizationId = requireOrganizationId(this.resolveOrganizationId);
    await this.prisma.followUpLog.deleteMany({ where: { organizationId, bookingId, intervalDays } });
  }
}
