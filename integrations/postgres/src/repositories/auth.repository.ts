import { AuthCredentials, AuthRepository, RefreshConsumption, RefreshSession } from "@tdm/domain";
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { verifySecret } from "../hash";

/** Wrong guesses a one-time code tolerates before it's dead — a 6-digit code is otherwise brute-forceable inside its TTL. */
const MAX_OTP_ATTEMPTS = 5;

/** Two tabs refreshing together legitimately present the same token milliseconds apart; only a later replay is theft. */
const REUSE_GRACE_MS = 10_000;

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
      // The attempt is claimed *before* the guess is checked, so parallel requests cannot all read
      // attempts=0 and each try a different code: only MAX_OTP_ATTEMPTS claims can ever succeed.
      const attempt = await this.prisma.otpCode.updateMany({
        where: { id: candidate.id, consumedAt: null, attempts: { lt: MAX_OTP_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      if (attempt.count !== 1) continue;
      if (await verifySecret(code, candidate.codeHash)) {
        // Conditional claim: of two concurrent verifications of the same code, only one flips consumedAt.
        const claimed = await this.prisma.otpCode.updateMany({
          where: { id: candidate.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        return claimed.count === 1;
      }
    }
    return false;
  }

  async saveRefreshToken(customerId: string, tokenHash: string, expiresAt: Date, session?: RefreshSession): Promise<void> {
    await this.prisma.refreshToken.create({
      data: { customerId, tokenHash, expiresAt, familyId: session?.familyId ?? randomUUID(), sessionStartedAt: session?.startedAt ?? new Date() },
    });
  }

  async consumeRefreshToken(customerId: string, tokenHash: string): Promise<RefreshConsumption> {
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { customerId, tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    const record = await this.prisma.refreshToken.findUnique({ where: { customerId_tokenHash: { customerId, tokenHash } } });
    if (!record) return { status: "invalid" };
    if (claimed.count === 1) return { status: "ok", session: { familyId: record.familyId, startedAt: record.sessionStartedAt } };
    if (record.revokedAt && record.expiresAt > new Date() && Date.now() - record.revokedAt.getTime() > REUSE_GRACE_MS) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: record.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      return { status: "reused" };
    }
    return { status: "invalid" };
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
