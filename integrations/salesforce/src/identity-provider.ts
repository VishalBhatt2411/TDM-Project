import { randomBytes, createHash } from "node:crypto";
import jsforce, { Connection } from "jsforce";
import { SALESFORCE_API_VERSION } from "./tenant-connection-provider";

export interface SalesforceIdentity {
  salesforceUserId: string;
  email: string;
  displayName: string;
  /** Salesforce org id (`identity.organization_id`) — used to bind staff bootstrap to the connected tenant. */
  salesforceOrgId: string;
}

export interface SalesforceConnectionResult {
  identity: SalesforceIdentity;
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
  /** The Salesforce org's own id (identity.organization_id) — distinct from this platform's tenant Organization.id. */
  salesforceOrgId: string;
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
 * flow ("Login with Salesforce") — distinct from TenantSalesforceConnectionProvider,
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

  /** `scope` defaults to the staff-login flow's needs; the onboarding "Connect Salesforce" flow passes `"id api refresh_token"` to also obtain a persistable refresh token. */
  buildAuthorizationUrl(state: string, codeVerifier: string, scope = "id api"): string {
    const oauth2 = new jsforce.OAuth2(this.oauth2Config());
    const codeChallenge = base64UrlEscape(createHash("sha256").update(codeVerifier).digest("base64"));
    return oauth2.getAuthorizationUrl({ scope, state, code_challenge: codeChallenge });
  }

  async exchangeCodeForIdentity(code: string, codeVerifier: string): Promise<SalesforceIdentity> {
    const { identity } = await this.exchangeCode(code, codeVerifier);
    return identity;
  }

  /**
   * Same exchange as exchangeCodeForIdentity, but also returns the access/refresh
   * tokens and instance URL — used by the onboarding wizard to persist a long-lived
   * connection to the tenant's org (see OnboardingService). exchangeCodeForIdentity
   * discards these because staff-login only needs to verify who's signing in.
   */
  async exchangeCodeForConnection(code: string, codeVerifier: string): Promise<SalesforceConnectionResult> {
    const { identity, salesforceOrgId, conn } = await this.exchangeCode(code, codeVerifier);
    if (!conn.accessToken || !conn.refreshToken || !conn.instanceUrl) {
      throw new Error(
        "Salesforce did not return a refresh token — ensure the Connected App's OAuth scopes include refresh_token/offline_access.",
      );
    }
    return {
      identity,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      instanceUrl: conn.instanceUrl,
      salesforceOrgId,
    };
  }

  /**
   * Rebuilds a live, authenticated Connection from a persisted refresh token — used
   * by the onboarding wizard (OnboardingService) after the initial OAuth handshake,
   * both to run the TDM metadata deploy and to look up the connecting admin's
   * identity again later, without asking them to sign in a second time.
   */
  async connectWithRefreshToken(refreshToken: string): Promise<Connection> {
    const oauth2 = new jsforce.OAuth2(this.oauth2Config());
    const token = await oauth2.refreshToken(refreshToken);
    return new jsforce.Connection({ accessToken: token.access_token, instanceUrl: token.instance_url, version: SALESFORCE_API_VERSION });
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<{ identity: SalesforceIdentity; salesforceOrgId: string; conn: Connection }> {
    const oauth2 = new jsforce.OAuth2(this.oauth2Config());
    oauth2.codeVerifier = codeVerifier;
    const conn = new jsforce.Connection({ oauth2 });
    await conn.authorize(code);
    const rawIdentity = await conn.identity();
    return {
      identity: {
        salesforceUserId: rawIdentity.user_id,
        email: rawIdentity.email,
        displayName: rawIdentity.display_name,
        salesforceOrgId: rawIdentity.organization_id,
      },
      salesforceOrgId: rawIdentity.organization_id,
      conn,
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
