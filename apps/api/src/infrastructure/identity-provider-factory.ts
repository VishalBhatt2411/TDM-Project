import type { OAuthStatePurpose } from "@tdm/postgres-adapter";
import type { SalesforceIdentityProvider } from "@tdm/salesforce-adapter";

/**
 * Builds a "Login with Salesforce" / "Connect Salesforce" OAuth client from one
 * tenant's own Connected App — never a shared, module-level instance, since every
 * tenant registers its own Consumer Key/Secret. Null when the tenant hasn't stored
 * Connected App credentials yet. Bound to SALESFORCE_IDENTITY_PROVIDER_FACTORY.
 */
export type SalesforceIdentityProviderFactory = (
  organizationId: string,
  purpose: OAuthStatePurpose,
) => Promise<SalesforceIdentityProvider | null>;
