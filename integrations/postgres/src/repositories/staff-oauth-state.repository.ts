import { PrismaClient } from "@prisma/client";

/**
 * Backs both per-tenant OAuth handshakes: staff "Login with Salesforce"
 * (AdminAuthService) and the onboarding wizard's "Connect Salesforce"
 * (OnboardingService). The authorization-request step saves the PKCE code_verifier
 * keyed by an opaque, randomly generated `state`; the callback consumes it exactly
 * once. Keeping the verifier server-side keeps it out of browser history, referrer
 * headers and access logs. `purpose` stops a state minted for one flow from being
 * redeemed by the other's callback.
 */
export type OAuthStatePurpose = "staff_login" | "onboarding";

export interface ConsumedOAuthState {
  codeVerifier: string;
  organizationId: string;
}

export class StaffOAuthStateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(input: {
    state: string;
    codeVerifier: string;
    expiresAt: Date;
    organizationId: string;
    purpose: OAuthStatePurpose;
  }): Promise<void> {
    await this.prisma.staffOAuthState.create({ data: input });
  }

  /**
   * Single-use: the record is deleted atomically as it's claimed, regardless of
   * whether it turns out to be expired or for another purpose, so a `state` value can
   * never be replayed — not even by two concurrent callbacks.
   */
  async consume(state: string, purpose: OAuthStatePurpose): Promise<ConsumedOAuthState | null> {
    const record = await this.prisma.staffOAuthState.delete({ where: { state } }).catch(() => null);
    if (!record) return null;
    if (record.purpose !== purpose || record.expiresAt.getTime() < Date.now()) return null;
    return { codeVerifier: record.codeVerifier, organizationId: record.organizationId };
  }
}
