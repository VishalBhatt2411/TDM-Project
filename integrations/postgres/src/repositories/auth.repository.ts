import { AuthCredentials, AuthRepository } from "@tdm/domain";
import { PrismaClient } from "@prisma/client";
import { verifySecret } from "../hash";

/** Wrong guesses a one-time code tolerates before it's dead — a 6-digit code is otherwise brute-forceable inside its TTL. */
const MAX_OTP_ATTEMPTS = 5;

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
      where: { customerId, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: MAX_OTP_ATTEMPTS } },
      orderBy: { createdAt: "desc" },
    });
    for (const candidate of candidates) {
      if (await verifySecret(code, candidate.codeHash)) {
        // Conditional claim: of two concurrent verifications of the same code, only one flips consumedAt.
        const claimed = await this.prisma.otpCode.updateMany({
          where: { id: candidate.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        return claimed.count === 1;
      }
    }
    if (candidates.length > 0) {
      await this.prisma.otpCode.updateMany({
        where: { id: { in: candidates.map((c) => c.id) } },
        data: { attempts: { increment: 1 } },
      });
    }
    return false;
  }

  async saveRefreshToken(customerId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.refreshToken.create({ data: { customerId, tokenHash, expiresAt } });
  }

  async consumeRefreshToken(customerId: string, tokenHash: string): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { customerId, tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    return result.count === 1;
  }

  async revokeAllRefreshTokens(customerId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { customerId, revokedAt: null }, data: { revokedAt: new Date() } });
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
