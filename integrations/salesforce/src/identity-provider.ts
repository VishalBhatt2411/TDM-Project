import { randomBytes, createHash } from "node:crypto";
import jsforce from "jsforce";

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

function base64UrlEscape(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Verifies a staff member's identity via Salesforce's OAuth2 Authorization Code
 * flow ("Login with Salesforce") — distinct from SalesforceConnectionProvider,
 * which authenticates the app's own integration user for business-data access.
 * This class never touches or stores a Salesforce password; Salesforce's own
 * hosted login page collects it, and this only exchanges the resulting code.
 *
 * PKCE: this org's Connected App policy requires a code_challenge/code_verifier
 * pair. Login and callback are two separate HTTP requests, so the caller
 * generates the verifier up front (generateCodeVerifier), carries it across
 * that gap itself (e.g. inside the signed `state`), and hands it back to
 * both buildAuthorizationUrl and exchangeCodeForIdentity.
 */
export class SalesforceIdentityProvider {
  constructor(private readonly config: SalesforceIdentityProviderConfig) {}

  /** RFC 7636 caps code_verifier at 128 characters — 96 random bytes base64url-encode to
   *  exactly that (96 / 3 * 4, no padding), the maximum entropy the spec allows. */
  generateCodeVerifier(): string {
    return base64UrlEscape(randomBytes(96).toString("base64"));
  }

  buildAuthorizationUrl(state: string, codeVerifier: string): string {
    const oauth2 = new jsforce.OAuth2(this.oauth2Config());
    const codeChallenge = base64UrlEscape(createHash("sha256").update(codeVerifier).digest("base64"));
    return oauth2.getAuthorizationUrl({ scope: "id api", state, code_challenge: codeChallenge });
  }

  async exchangeCodeForIdentity(code: string, codeVerifier: string): Promise<SalesforceIdentity> {
    const oauth2 = new jsforce.OAuth2(this.oauth2Config());
    oauth2.codeVerifier = codeVerifier;
    const conn = new jsforce.Connection({ oauth2 });
    await conn.authorize(code);
    const identity = await conn.identity();
    return {
      salesforceUserId: identity.user_id,
      email: identity.email,
      displayName: identity.display_name,
    };
  }

  private oauth2Config(): { clientId: string; clientSecret: string; redirectUri: string; loginUrl: string } {
    return {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: this.config.redirectUri,
      loginUrl: this.config.loginUrl ?? "https://login.salesforce.com",
    };
  }
}
