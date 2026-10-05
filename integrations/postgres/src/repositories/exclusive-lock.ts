import { PrismaClient } from "@prisma/client";

/** Longest a caller waits for the lock, and longest the holder may keep it, before the transaction is aborted. */
const MAX_WAIT_MS = 10_000;
const MAX_HOLD_MS = 30_000;

/**
 * Tenant-scoped exclusive lock on a transaction-level Postgres advisory lock. The lock lives exactly as
 * long as the surrounding transaction, so a crashed or timed-out holder can never leave it stuck, and it
 * works across serverless instances because the database is the single point of agreement.
 */
export class PostgresExclusiveLock {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly resolveOrganizationId: () => string | undefined,
  ) {}

  async runExclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    const organizationId = this.resolveOrganizationId();
    if (!organizationId) throw new Error("An exclusive lock requires a resolved tenant.");
    const lockKey = `${organizationId}:${key}`;
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        return work();
      },
      { maxWait: MAX_WAIT_MS, timeout: MAX_HOLD_MS },
    );
  }
}
