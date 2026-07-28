import { AuthCredentials, AuthRepository } from "@tdm/domain";
import { PrismaClient } from "@prisma/client";
import { verifySecret } from "../hash";

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveCredentials(creds: AuthCredentials): Promise<void> {
    await this.prisma.authCredential.upsert({
      where: { customerId: creds.customerId },
      create: { customerId: creds.customerId, passwordHash: creds.passwordHash, isTemporary: creds.isTemporary },
      update: { passwordHash: creds.passwordHash, isTemporary: creds.isTemporary },
    });
  }

  async findCredentials(customerId: string): Promise<AuthCredentials | null> {
    const record = await this.prisma.authCredential.findUnique({ where: { customerId } });
    return record ? { customerId: record.customerId, passwordHash: record.passwordHash, isTemporary: record.isTemporary } : null;
  }

  async saveOtp(customerId: string, codeHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.otpCode.create({ data: { customerId, codeHash, expiresAt } });
  }

  async consumeOtp(customerId: string, code: string): Promise<boolean> {
    const candidates = await this.prisma.otpCode.findMany({
      where: { customerId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    for (const candidate of candidates) {
      if (await verifySecret(code, candidate.codeHash)) {
        await this.prisma.otpCode.update({ where: { id: candidate.id }, data: { consumedAt: new Date() } });
        return true;
      }
    }
    return false;
  }

  async saveRefreshToken(customerId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.refreshToken.create({ data: { customerId, tokenHash, expiresAt } });
  }

  async isRefreshTokenValid(customerId: string, tokenHash: string): Promise<boolean> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { customerId_tokenHash: { customerId, tokenHash } },
    });
    if (!record || record.revokedAt) return false;
    return record.expiresAt.getTime() > Date.now();
  }

  async revokeRefreshToken(customerId: string, tokenHash: string): Promise<void> {
    await this.prisma.refreshToken
      .update({
        where: { customerId_tokenHash: { customerId, tokenHash } },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
}
