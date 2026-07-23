import { PrismaClient } from "@prisma/client";

export class StaffRefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(staffUserId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.staffRefreshToken.create({ data: { staffUserId, tokenHash, expiresAt } });
  }

  async isValid(staffUserId: string, tokenHash: string): Promise<boolean> {
    const record = await this.prisma.staffRefreshToken.findUnique({
      where: { staffUserId_tokenHash: { staffUserId, tokenHash } },
    });
    if (!record || record.revokedAt) return false;
    return record.expiresAt.getTime() > Date.now();
  }

  async revoke(staffUserId: string, tokenHash: string): Promise<void> {
    await this.prisma.staffRefreshToken
      .update({ where: { staffUserId_tokenHash: { staffUserId, tokenHash } }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
}
