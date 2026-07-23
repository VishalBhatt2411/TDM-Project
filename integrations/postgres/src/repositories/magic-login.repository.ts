import { PrismaClient } from "@prisma/client";

export class MagicLoginRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(customerId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.magicLoginToken.create({ data: { customerId, tokenHash, expiresAt } });
  }

  /**
   * Consumes the token if valid (unexpired, unused) and returns the customerId, or null.
   * Uses a single conditional `updateMany` (not read-then-write) so two near-simultaneous
   * requests for the same token — e.g. React StrictMode's double effect invocation in dev,
   * or a genuine double-click — can't both pass the check before either write commits.
   */
  async consume(tokenHash: string): Promise<string | null> {
    const result = await this.prisma.magicLoginToken.updateMany({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (result.count === 0) return null;

    const record = await this.prisma.magicLoginToken.findUnique({ where: { tokenHash } });
    return record?.customerId ?? null;
  }
}
