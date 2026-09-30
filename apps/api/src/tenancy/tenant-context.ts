import { AsyncLocalStorage } from "node:async_hooks";
import { UnauthorizedException } from "@nestjs/common";
import { DealershipScope } from "@tdm/domain";

interface TenantStore {
  /** Tenant the request's host (dealer URL) resolved to, if any. */
  hostOrganizationId?: string;
  /** Dealership (data-provider id) the host resolved to; absent on a company-wide host or no host. */
  hostDealershipId?: string;
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
  run<T>(fn: () => T, organizationId?: string, dealershipId?: string): T {
    const hostDealershipId = organizationId ? dealershipId : undefined;
    return storage.run({ hostOrganizationId: organizationId, hostDealershipId, organizationId }, fn);
  },

  currentOrganizationId(): string | undefined {
    return storage.getStore()?.organizationId;
  },

  hostOrganizationId(): string | undefined {
    return storage.getStore()?.hostOrganizationId;
  },

  hostDealershipId(): string | undefined {
    return storage.getStore()?.hostDealershipId;
  },

  /** What a customer on this host may see: one dealership on a dealer host, every dealership on a company-wide host. */
  hostDealershipScope(): DealershipScope {
    const dealershipId = storage.getStore()?.hostDealershipId;
    return dealershipId ? { dealershipIds: [dealershipId] } : {};
  },

  /** Whether a record owned by `dealershipId` is visible on this host (see hostDealershipScope). */
  isVisibleOnHost(dealershipId: string): boolean {
    const hostDealershipId = storage.getStore()?.hostDealershipId;
    return !hostDealershipId || hostDealershipId === dealershipId;
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
      logger.error(JSON.stringify({ event, organizationId, reason: (err as Error).message }));
    }
  }
}
