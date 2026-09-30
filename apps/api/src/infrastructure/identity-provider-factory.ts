import type { OAuthStatePurpose } from "@tdm/postgres-adapter";

/** The staff member who completed the OAuth handshake, as the identity provider reports them. */
export interface StaffIdentity {
  salesforceUserId: string;
  email: string;
  displayName: string;
  /** The provider org's id — binds staff bootstrap to the connected tenant. */
  salesforceOrgId: string;
}

/** A handshake that also yields a reusable business-data connection (onboarding only). */
export interface ProviderConnectionGrant {
  identity: StaffIdentity;
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
  salesforceOrgId: string;
}

/**
 * One tenant's OAuth (PKCE) client. Staff login verifies identity only; the onboarding
 * handshake additionally persists a connection — kept as separate calls on purpose.
 */
export interface StaffIdentityProvider {
  generateCodeVerifier(): string;
  buildAuthorizationUrl(state: string, codeVerifier: string, scope?: string): string;
  exchangeCodeForIdentity(code: string, codeVerifier: string): Promise<StaffIdentity>;
  exchangeCodeForConnection(code: string, codeVerifier: string): Promise<ProviderConnectionGrant>;
}

/**
 * Builds a "Login with Salesforce" / "Connect Salesforce" OAuth client from one
 * tenant's own Connected App — never a shared, module-level instance, since every
 * tenant registers its own Consumer Key/Secret. Null when the tenant hasn't stored
 * Connected App credentials yet. Bound to SALESFORCE_IDENTITY_PROVIDER_FACTORY.
 */
export type SalesforceIdentityProviderFactory = (
  organizationId: string,
  purpose: OAuthStatePurpose,
) => Promise<StaffIdentityProvider | null>;
