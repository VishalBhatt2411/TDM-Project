import { AsyncLocalStorage } from "node:async_hooks";
import { UnauthorizedException } from "@nestjs/common";
import { errorCodeOf } from "../common/error-code";

interface TenantStore {
  /** Tenant the request's host (its company address) resolved to, if any. */
  hostOrganizationId?: string;
  /** Public origin of the resolved host, e.g. "https://acme.tdm.example.com"; absent when no host resolved. */
  hostSiteOrigin?: string;
  /** Tenant every data-provider call in this unit of work runs against. */
  organizationId?: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

/**
 * Ambient "which tenant is this unit of work for" — set once per HTTP request (by
 * TenantMiddleware from the host, then confirmed by the auth guards from the session
 * token) or per scheduled-job iteration (runForEachTenant). The Salesforce connection
 * source reads it on every call, so repositories stay process-wide singletons while
 * never touching another tenant's org. Absent context always fails closed.
 */
export const TenantContext = {
  run<T>(fn: () => T, organizationId?: string, siteOrigin?: string): T {
    const hostSiteOrigin = organizationId ? siteOrigin : undefined;
    return storage.run({ hostOrganizationId: organizationId, hostSiteOrigin, organizationId }, fn);
  },

  /**
   * Where the current customer is browsing — the origin links in their emails must point back
   * to, so they land on the same company site. Only ever a registered host (see TenantMiddleware),
   * never an arbitrary Host header.
   */
  hostSiteOrigin(): string | undefined {
    return storage.getStore()?.hostSiteOrigin;
  },

  currentOrganizationId(): string | undefined {
    return storage.getStore()?.organizationId;
  },

  hostOrganizationId(): string | undefined {
    return storage.getStore()?.hostOrganizationId;
  },

  /**
   * Binds the tenant an authenticated session belongs to. A session can never be used
   * against another tenant's host — that would let one company's token read another
   * company's org — so a mismatch is rejected rather than overridden.
   */
  bindSession(organizationId: string | undefined): void {
    const store = storage.getStore();
    if (!store || !organizationId) {
      throw new UnauthorizedException("Invalid or expired session.");
    }
    if (store.organizationId && store.organizationId !== organizationId) {
      throw new UnauthorizedException("This session belongs to a different organization.");
    }
    store.organizationId = organizationId;
  },
};

export interface TenantJobLogger {
  error(message: string): void;
}

/** Runs `job` once per tenant, each inside its own tenant context — one tenant's failure never stops the rest. */
export async function runForEachTenant(
  organizationIds: string[],
  job: (organizationId: string) => Promise<void>,
  logger: TenantJobLogger,
  event: string,
): Promise<void> {
  for (const organizationId of organizationIds) {
    try {
      await TenantContext.run(() => job(organizationId), organizationId);
    } catch (err) {
      logger.error(JSON.stringify({ event, organizationId, errorCode: errorCodeOf(err) }));
    }
  }
}
