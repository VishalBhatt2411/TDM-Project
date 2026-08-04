import { PrismaClient } from "@prisma/client";

/**
 * Backs the "Login with Salesforce" PKCE handshake. The authorization-request step
 * (AdminAuthService.buildAuthorizationUrl) saves the code_verifier here keyed by an
 * opaque, randomly generated `state`; the callback step consumes it exactly once.
 * Keeping the verifier server-side (rather than embedded in the `state` value itself,
 * e.g. as a signed JWT claim) keeps the OAuth redirect URL short and keeps the
 * verifier out of browser history, referrer headers, and access logs.
 */
export class StaffOAuthStateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(state: string, codeVerifier: string, expiresAt: Date): Promise<void> {
    await this.prisma.staffOAuthState.create({ data: { state, codeVerifier, expiresAt } });
  }

  /**
   * Single-use: the record is deleted as soon as it's read, regardless of whether
   * it turns out to be expired, so a `state` value can never be replayed even
   * within its validity window.
   */
  async consume(state: string): Promise<string | null> {
    const record = await this.prisma.staffOAuthState.findUnique({ where: { state } });
    if (!record) return null;

    await this.prisma.staffOAuthState.delete({ where: { state } }).catch(() => undefined);
    if (record.expiresAt.getTime() < Date.now()) return null;

    return record.codeVerifier;
  }
}
