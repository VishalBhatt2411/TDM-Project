import jsforce, { OAuth2 } from "jsforce";

export interface SalesforceIdentity {
  salesforceUserId: string;
  email: string;
  displayName: string;
}

export interface SalesforceIdentityProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  loginUrl?: string;
}

/**
 * Verifies a staff member's identity via Salesforce's OAuth2 Authorization Code
 * flow ("Login with Salesforce") — distinct from SalesforceConnectionProvider,
 * which authenticates the app's own integration user for business-data access.
 * This class never touches or stores a Salesforce password; Salesforce's own
 * hosted login page collects it, and this only exchanges the resulting code.
 */
export class SalesforceIdentityProvider {
  constructor(private readonly config: SalesforceIdentityProviderConfig) {}

  getAuthorizationUrl(state: string): string {
    const oauth2 = this.buildOAuth2();
    return oauth2.getAuthorizationUrl({ scope: "id api", state });
  }

  async exchangeCodeForIdentity(code: string): Promise<SalesforceIdentity> {
    const oauth2 = this.buildOAuth2();
    const conn = new jsforce.Connection({ oauth2 });
    await conn.authorize(code);
    const identity = await conn.identity();
    return {
      salesforceUserId: identity.user_id,
      email: identity.email,
      displayName: identity.display_name,
    };
  }

  private buildOAuth2(): OAuth2 {
    return new jsforce.OAuth2({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: this.config.redirectUri,
      loginUrl: this.config.loginUrl ?? "https://login.salesforce.com",
    });
  }
}
