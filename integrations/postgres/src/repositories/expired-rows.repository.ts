import { PrismaClient } from "@prisma/client";

/** Spent rows are kept briefly after they stop mattering, so a support question about a recent login/reset can still be answered. */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Reminder/follow-up claims only need to outlive the windows they guard (hours to ~two weeks). */
const CLAIM_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export interface PurgeResult {
  [table: string]: number;
}

/**
 * Housekeeping for the platform store: short-lived credentials (OTPs, sign-in links, reset tokens,
 * refresh tokens, OAuth states) and de-duplication markers would otherwise accumulate forever.
 * Platform-wide by design — it only removes rows that are already unusable, never live data.
 */
export class ExpiredRowsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async purge(now: Date = new Date()): Promise<PurgeResult> {
    const spentBefore = new Date(now.getTime() - RETENTION_MS);
    const claimsBefore = new Date(now.getTime() - CLAIM_RETENTION_MS);
    // A row is purgeable once it expired, or was consumed/revoked, long enough ago.
    const unusable = { OR: [{ expiresAt: { lt: spentBefore } }, { consumedAt: { lt: spentBefore } }] };
    const unusableRevocable = { OR: [{ expiresAt: { lt: spentBefore } }, { revokedAt: { lt: spentBefore } }] };

    const [otpCodes, refreshTokens, magicLoginTokens, customerPasswordTokens, staffRefreshTokens, staffOAuthStates, reminderLogs, followUpLogs] =
      await Promise.all([
        this.prisma.otpCode.deleteMany({ where: unusable }),
        this.prisma.refreshToken.deleteMany({ where: unusableRevocable }),
        this.prisma.magicLoginToken.deleteMany({ where: unusable }),
        this.prisma.customerPasswordToken.deleteMany({ where: unusable }),
        this.prisma.staffRefreshToken.deleteMany({ where: unusableRevocable }),
        this.prisma.staffOAuthState.deleteMany({ where: { expiresAt: { lt: spentBefore } } }),
        this.prisma.reminderLog.deleteMany({ where: { sentAt: { lt: claimsBefore } } }),
        this.prisma.followUpLog.deleteMany({ where: { sentAt: { lt: claimsBefore } } }),
      ]);

    return {
      otpCodes: otpCodes.count,
      refreshTokens: refreshTokens.count,
      magicLoginTokens: magicLoginTokens.count,
      customerPasswordTokens: customerPasswordTokens.count,
      staffRefreshTokens: staffRefreshTokens.count,
      staffOAuthStates: staffOAuthStates.count,
      reminderLogs: reminderLogs.count,
      followUpLogs: followUpLogs.count,
    };
  }
}
