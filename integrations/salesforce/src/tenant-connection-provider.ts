import jsforce, { Connection } from "jsforce";
import { ExclusiveLock, TenantContextMissingError, TenantNotConnectedError } from "@tdm/domain";
import { SalesforceConnectionSource } from "./connection-source";

export const SALESFORCE_API_VERSION = "62.0";

/** Decrypted, per-tenant material needed to mint an access token. Never logged. */
export interface SalesforceOrgCredentials {
  clientId: string;
  clientSecret: string;
  loginUrl: string;
  refreshToken: string;
}

/** A minted access token and what came with it — shared by every app instance until `expiresAt`. */
export interface SalesforceSession {
  accessToken: string;
  instanceUrl: string;
  salesforceOrgId: string;
  integrationUserId: string;
  expiresAt: Date;
}

export interface TenantSalesforceConnectionProviderOptions {
  /** Which tenant the current unit of work belongs to — undefined means "unknown", which fails closed. */
  resolveOrganizationId: () => string | undefined;
  /** Returns null when the tenant has no usable (connected) Salesforce org. */
  loadCredentials: (organizationId: string) => Promise<SalesforceOrgCredentials | null>;
  /**
   * Salesforce rotated the refresh token during a refresh — the new one must be persisted or the
   * next refresh fails. Persist only while `previousRefreshToken` is still the stored one.
   */
  onRefreshTokenRotated: (organizationId: string, previousRefreshToken: string, refreshToken: string) => Promise<void>;
  /**
   * Salesforce rejected `rejectedRefreshToken` outright (revoked / Connected App policy changed) —
   * the tenant must reconnect, unless the stored token is no longer the rejected one. `reason` is
   * Salesforce's own short explanation (e.g. "expired access/refresh token"), never a secret.
   */
  onCredentialsRejected: (organizationId: string, rejectedRefreshToken: string, reason: string) => Promise<void>;
  /**
   * Makes load-credentials → refresh → persist atomic across every instance of the app. Under a
   * refresh-token rotation policy each refresh kills the token it used, so two instances refreshing
   * at once (normal on serverless) would leave the stored token dead and the tenant disconnected.
   */
  refreshLock: ExclusiveLock;
  /**
   * The access token currently in use, shared across instances. Without it every cold instance mints
   * its own — and under rotation each mint logs the other instances' sessions out, so concurrent
   * requests fail with INVALID_SESSION_ID. Returns null when none is stored or it has expired.
   */
  loadSession: (organizationId: string) => Promise<SalesforceSession | null>;
  saveSession: (organizationId: string, session: SalesforceSession) => Promise<void>;
  /** How long a minted access token is reused before proactively refreshing. */
  ttlMs?: number;
}

interface CachedTenantConnection {
  accessToken: string;
  connection: Connection;
  integrationUserId: string;
  salesforceOrgId: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
/**
 * Pauses before re-reading the stored refresh token after an invalid_grant. Instances that don't
 * share memory (serverless) can refresh with the same token at once; under a rotation policy the
 * first wins and the rest are rejected until the winner's new token is persisted.
 */
const ROTATION_RECHECK_DELAYS_MS = [250, 750, 1500];
/** Refresh attempts with a newly rotated token before the rejection is treated as final. */
const MAX_ROTATION_RETRIES = 3;

/** A shared session closer to expiry than this is replaced rather than handed to a request that may outlive it. */
const MIN_SESSION_REMAINING_MS = 60 * 1000;

const REFRESH_LOCK_KEY = "salesforce-refresh";
const MAX_REJECTION_REASON_LENGTH = 100;

function isInvalidGrant(err: any): boolean {
  return err?.name === "invalid_grant" || err?.errorCode === "invalid_grant";
}

/** Salesforce's `error_description` for a rejected grant — a fixed phrase, but stripped to plain text before it is stored or logged. */
function rejectionReason(err: any): string {
  const text = typeof err?.message === "string" ? err.message.replace(/[^\w\s/.,:'()-]/g, "").trim() : "";
  return text.slice(0, MAX_REJECTION_REASON_LENGTH) || "no reason given";
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
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
  /** The access token Salesforce last rejected for each tenant, so it isn't taken back from the shared session. */
  private readonly rejectedAccessTokens = new Map<string, string>();
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
    const organizationId = this.requireOrganizationId();
    const cached = this.cache.get(organizationId);
    // Remember which token failed: the shared session may already hold a newer one, which must be reused, not replaced.
    if (cached) this.rejectedAccessTokens.set(organizationId, cached.accessToken);
    this.cache.delete(organizationId);
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

    // Another instance may already have minted a usable token — taking it needs no lock and no Salesforce call.
    const shared = await this.usableSharedSession(organizationId);
    if (shared) return this.remember(organizationId, shared);

    let pending = this.inFlight.get(organizationId);
    if (!pending) {
      pending = this.connect(organizationId).finally(() => this.inFlight.delete(organizationId));
      this.inFlight.set(organizationId, pending);
    }
    return this.remember(organizationId, await pending);
  }

  private remember(organizationId: string, connection: CachedTenantConnection): CachedTenantConnection {
    this.cache.set(organizationId, connection);
    return connection;
  }

  /** The shared session, unless it is the token Salesforce just rejected (or is about to lapse). */
  private async usableSharedSession(organizationId: string): Promise<CachedTenantConnection | null> {
    const session = await this.options.loadSession(organizationId);
    if (!session || session.expiresAt.getTime() - Date.now() < MIN_SESSION_REMAINING_MS) return null;
    if (session.accessToken === this.rejectedAccessTokens.get(organizationId)) return null;
    return this.toConnection(session);
  }

  private toConnection(session: SalesforceSession): CachedTenantConnection {
    return {
      accessToken: session.accessToken,
      connection: new jsforce.Connection({
        accessToken: session.accessToken,
        instanceUrl: session.instanceUrl,
        version: SALESFORCE_API_VERSION,
      }),
      salesforceOrgId: session.salesforceOrgId,
      integrationUserId: session.integrationUserId,
      expiresAt: session.expiresAt.getTime(),
    };
  }

  private connect(organizationId: string): Promise<CachedTenantConnection> {
    return this.options.refreshLock.runExclusive(REFRESH_LOCK_KEY, () => this.connectLocked(organizationId));
  }

  private async connectLocked(organizationId: string): Promise<CachedTenantConnection> {
    // Whoever held the lock before us may have just minted a token — reuse it rather than rotate again.
    const shared = await this.usableSharedSession(organizationId);
    if (shared) return shared;

    // Read inside the lock: whoever held it before us may have just rotated the token.
    const stored = await this.options.loadCredentials(organizationId);
    if (!stored) throw new TenantNotConnectedError(organizationId);

    let credentials: SalesforceOrgCredentials = stored;
    let token: Awaited<ReturnType<TenantSalesforceConnectionProvider["refresh"]>>;
    for (let retry = 0; ; retry++) {
      try {
        token = await this.refresh(credentials);
        break;
      } catch (err) {
        if (!isInvalidGrant(err)) throw err;
        const rotated: SalesforceOrgCredentials | null = retry < MAX_ROTATION_RETRIES ? await this.awaitRotatedCredentials(organizationId, credentials.refreshToken) : null;
        if (!rotated) {
          await this.options.onCredentialsRejected(organizationId, credentials.refreshToken, rejectionReason(err));
          // Revoked or expired: only an admin reconnect fixes it, so report it as such rather than a 500.
          throw new TenantNotConnectedError(organizationId);
        }
        credentials = rotated;
      }
    }

    if (token.refresh_token && token.refresh_token !== credentials.refreshToken) {
      await this.options.onRefreshTokenRotated(organizationId, credentials.refreshToken, token.refresh_token);
    }

    const [, salesforceOrgId, integrationUserId] = IDENTITY_URL_PATTERN.exec(token.id) ?? [];
    if (!salesforceOrgId || !integrationUserId) {
      throw new Error("Salesforce token response did not include a recognizable identity URL.");
    }

    const session: SalesforceSession = {
      accessToken: token.access_token,
      instanceUrl: token.instance_url,
      salesforceOrgId,
      integrationUserId,
      expiresAt: new Date(Date.now() + this.ttlMs),
    };
    await this.options.saveSession(organizationId, session);
    this.rejectedAccessTokens.delete(organizationId);
    return this.toConnection(session);
  }

  private refresh(credentials: SalesforceOrgCredentials) {
    const oauth2 = new jsforce.OAuth2({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      loginUrl: credentials.loginUrl,
    });
    return oauth2.refreshToken(credentials.refreshToken);
  }

  /** The tenant's credentials once its stored refresh token differs from `rejectedRefreshToken`, or null if it never does. */
  private async awaitRotatedCredentials(organizationId: string, rejectedRefreshToken: string): Promise<SalesforceOrgCredentials | null> {
    for (const delay of ROTATION_RECHECK_DELAYS_MS) {
      await sleep(delay);
      const latest = await this.options.loadCredentials(organizationId);
      if (!latest) return null;
      if (latest.refreshToken !== rejectedRefreshToken) return latest;
    }
    return null;
  }
}
