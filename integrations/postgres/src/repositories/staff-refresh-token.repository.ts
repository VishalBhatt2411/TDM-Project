import { PrismaClient } from "@prisma/client";

export class StaffRefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(staffUserId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.staffRefreshToken.create({ data: { staffUserId, tokenHash, expiresAt } });
  }

  /** Atomically revokes a live token; true only for the single caller that did, so rotation is single-use. */
  async consume(staffUserId: string, tokenHash: string): Promise<boolean> {
    const result = await this.prisma.staffRefreshToken.updateMany({
      where: { staffUserId, tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    return result.count === 1;
  }

  async revoke(staffUserId: string, tokenHash: string): Promise<void> {
    await this.prisma.staffRefreshToken
      .update({ where: { staffUserId_tokenHash: { staffUserId, tokenHash } }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
}
