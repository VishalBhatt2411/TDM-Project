import { PrismaClient } from "@prisma/client";

export class StaffPasswordTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(staffUserId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.staffPasswordToken.create({ data: { staffUserId, tokenHash, expiresAt } });
  }

  /**
   * Consumes the token if valid (unexpired, unused) and returns the staffUserId, or null.
   * Atomic conditional update — same TOCTOU-safe pattern as MagicLoginRepository.consume.
   */
  async consume(tokenHash: string): Promise<string | null> {
    const result = await this.prisma.staffPasswordToken.updateMany({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (result.count === 0) return null;

    const record = await this.prisma.staffPasswordToken.findUnique({ where: { tokenHash } });
    return record?.staffUserId ?? null;
  }
}
