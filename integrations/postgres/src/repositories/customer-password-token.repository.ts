import { PrismaClient } from "@prisma/client";

export class CustomerPasswordTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(customerId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.customerPasswordToken.create({ data: { customerId, tokenHash, expiresAt } });
  }

  /**
   * Consumes the token if valid (unexpired, unused) and returns the customerId, or null.
   * Atomic conditional update — same TOCTOU-safe pattern as MagicLoginRepository.consume.
   */
  async consume(tokenHash: string): Promise<string | null> {
    const result = await this.prisma.customerPasswordToken.updateMany({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (result.count === 0) return null;

    const record = await this.prisma.customerPasswordToken.findUnique({ where: { tokenHash } });
    return record?.customerId ?? null;
  }
}
