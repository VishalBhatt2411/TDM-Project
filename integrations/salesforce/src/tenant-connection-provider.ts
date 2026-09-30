import jsforce, { Connection } from "jsforce";
import { TenantContextMissingError, TenantNotConnectedError } from "@tdm/domain";
import { SalesforceConnectionSource } from "./connection-source";

export const SALESFORCE_API_VERSION = "62.0";

/** Decrypted, per-tenant material needed to mint an access token. Never logged. */
export interface SalesforceOrgCredentials {
  clientId: string;
  clientSecret: string;
  loginUrl: string;
  refreshToken: string;
}

export interface TenantSalesforceConnectionProviderOptions {
  /** Which tenant the current unit of work belongs to — undefined means "unknown", which fails closed. */
  resolveOrganizationId: () => string | undefined;
  /** Returns null when the tenant has no usable (connected) Salesforce org. */
  loadCredentials: (organizationId: string) => Promise<SalesforceOrgCredentials | null>;
  /** Salesforce rotated the refresh token during a refresh — the new one must be persisted or the next refresh fails. */
  onRefreshTokenRotated: (organizationId: string, refreshToken: string) => Promise<void>;
  /** Salesforce rejected the refresh token outright (revoked / Connected App policy changed) — the tenant must reconnect. */
  onCredentialsRejected: (organizationId: string) => Promise<void>;
  /** How long a minted access token is reused before proactively refreshing. */
  ttlMs?: number;
}

interface CachedTenantConnection {
  connection: Connection;
  integrationUserId: string;
  salesforceOrgId: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
/** Token response `id` is `https://<login host>/id/<orgId>/<userId>`. */
const IDENTITY_URL_PATTERN = /\/id\/([a-zA-Z0-9]{15,18})\/([a-zA-Z0-9]{15,18})\/?$/;

/**
 * One Salesforce org per tenant, chosen per call from the ambient tenant context — so the
 * repositories built on top stay process-wide singletons while every request (or
 * scheduled job iteration) talks only to its own tenant's org. Connections are minted
 * from each tenant's own Connected App + stored refresh token (OAuth refresh_token grant),
 * cached per tenant, and concurrent refreshes for the same tenant are deduplicated.
 */
export class TenantSalesforceConnectionProvider implements SalesforceConnectionSource {
  private readonly cache = new Map<string, CachedTenantConnection>();
  private readonly inFlight = new Map<string, Promise<CachedTenantConnection>>();
  private readonly ttlMs: number;

  constructor(private readonly options: TenantSalesforceConnectionProviderOptions) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  async getConnection(): Promise<Connection> {
    return (await this.current()).connection;
  }

  async getIntegrationUserId(): Promise<string> {
    return (await this.current()).integrationUserId;
  }

  async getSalesforceOrgId(): Promise<string> {
    return (await this.current()).salesforceOrgId;
  }

  async invalidate(): Promise<void> {
    this.cache.delete(this.requireOrganizationId());
  }

  async ping(): Promise<void> {
    const conn = await this.getConnection();
    await conn.identity();
  }

  private requireOrganizationId(): string {
    const organizationId = this.options.resolveOrganizationId();
    if (!organizationId) throw new TenantContextMissingError();
    return organizationId;
  }

  private async current(): Promise<CachedTenantConnection> {
    const organizationId = this.requireOrganizationId();
    const cached = this.cache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) return cached;

    let pending = this.inFlight.get(organizationId);
    if (!pending) {
      pending = this.connect(organizationId).finally(() => this.inFlight.delete(organizationId));
      this.inFlight.set(organizationId, pending);
    }
    const fresh = await pending;
    this.cache.set(organizationId, fresh);
    return fresh;
  }

  private async connect(organizationId: string): Promise<CachedTenantConnection> {
    const credentials = await this.options.loadCredentials(organizationId);
    if (!credentials) throw new TenantNotConnectedError(organizationId);

    const oauth2 = new jsforce.OAuth2({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      loginUrl: credentials.loginUrl,
    });

    let token;
    try {
      token = await oauth2.refreshToken(credentials.refreshToken);
    } catch (err: any) {
      if (err?.name === "invalid_grant" || err?.errorCode === "invalid_grant") {
        await this.options.onCredentialsRejected(organizationId);
        // Revoked or expired: only an admin reconnect fixes it, so report it as such rather than a 500.
        throw new TenantNotConnectedError(organizationId);
      }
      throw err;
    }

    if (token.refresh_token && token.refresh_token !== credentials.refreshToken) {
      await this.options.onRefreshTokenRotated(organizationId, token.refresh_token);
    }

    const [, salesforceOrgId, integrationUserId] = IDENTITY_URL_PATTERN.exec(token.id) ?? [];
    if (!salesforceOrgId || !integrationUserId) {
      throw new Error("Salesforce token response did not include a recognizable identity URL.");
    }

    return {
      connection: new jsforce.Connection({
        accessToken: token.access_token,
        instanceUrl: token.instance_url,
        version: SALESFORCE_API_VERSION,
      }),
      salesforceOrgId,
      integrationUserId,
      expiresAt: Date.now() + this.ttlMs,
    };
  }
}
