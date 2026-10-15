import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import jsforce from "jsforce";
import { TenantContextMissingError, type ExclusiveLock } from "@tdm/domain";
import {
  TenantSalesforceConnectionProvider,
  type SalesforceSession,
  type TenantSalesforceConnectionProviderOptions,
} from "../integrations/salesforce/src/tenant-connection-provider";

const ORG = "org-1";
const credentials = { clientId: "id", clientSecret: "secret", loginUrl: "https://login.salesforce.com", refreshToken: "refresh-1" };

const sessionExpiringIn = (ms: number, accessToken = "shared-token"): SalesforceSession => ({
  accessToken,
  instanceUrl: "https://example.my.salesforce.com",
  salesforceOrgId: "00D000000000001AAA",
  integrationUserId: "005000000000001AAA",
  expiresAt: new Date(Date.now() + ms),
});

/** Counts what the provider asks of its collaborators; every option can be overridden per test. */
function harness(overrides: Partial<TenantSalesforceConnectionProviderOptions> = {}) {
  const calls = { loadSession: 0, saveSession: 0, lock: 0, loadCredentials: 0 };
  const refreshLock: ExclusiveLock = {
    runExclusive: async (_key, work) => {
      calls.lock++;
      return work();
    },
  };
  const provider = new TenantSalesforceConnectionProvider({
    resolveOrganizationId: () => ORG,
    loadCredentials: async () => {
      calls.loadCredentials++;
      return credentials;
    },
    onRefreshTokenRotated: async () => undefined,
    onCredentialsRejected: async () => undefined,
    refreshLock,
    loadSession: async () => {
      calls.loadSession++;
      return null;
    },
    saveSession: async () => {
      calls.saveSession++;
    },
    ...overrides,
  });
  return { provider, calls };
}

const oauth2 = jsforce.OAuth2.prototype as unknown as { refreshToken: (token: string) => Promise<unknown> };
const originalRefresh = oauth2.refreshToken;
let mints = 0;
function stubSalesforceMint(accessToken = "minted-token") {
  mints = 0;
  oauth2.refreshToken = async () => {
    mints++;
    return {
      access_token: accessToken,
      instance_url: "https://example.my.salesforce.com",
      id: "https://login.salesforce.com/id/00D000000000001AAA/005000000000001AAA",
    };
  };
}
afterEach(() => {
  oauth2.refreshToken = originalRefresh;
});

test("concurrent requests on a cold instance share one session lookup", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const { provider, calls } = harness({
    loadSession: async () => {
      calls.loadSession++;
      await gate;
      return sessionExpiringIn(10 * 60 * 1000);
    },
  });

  const pending = [provider.getConnection(), provider.getSalesforceOrgId(), provider.getIntegrationUserId()];
  release();
  await Promise.all(pending);

  assert.equal(calls.loadSession, 1, "one stored-session read for three waiting requests");
  assert.equal(calls.lock, 0, "a usable shared session needs no refresh lock");
});

test("a usable shared session is reused without calling Salesforce", async () => {
  stubSalesforceMint();
  const { provider, calls } = harness({ loadSession: async () => sessionExpiringIn(10 * 60 * 1000) });

  assert.equal(await provider.getSalesforceOrgId(), "00D000000000001AAA");
  assert.equal(mints, 0);
  assert.equal(calls.saveSession, 0);
});

test("a session about to lapse is replaced by a fresh mint, which is then shared", async () => {
  stubSalesforceMint();
  const { provider, calls } = harness({ loadSession: async () => sessionExpiringIn(5_000) });

  await provider.getConnection();
  await provider.getConnection();

  assert.equal(mints, 1, "minted once, then served from the instance cache");
  assert.equal(calls.saveSession, 1);
  assert.equal(calls.lock, 1);
});

test("a token Salesforce rejected is not taken back from the shared session", async () => {
  stubSalesforceMint("new-token");
  const stale = sessionExpiringIn(10 * 60 * 1000, "stale-token");
  const { provider } = harness({ loadSession: async () => stale });

  await provider.getConnection();
  assert.equal(mints, 0);
  await provider.invalidate();
  await provider.getConnection();
  assert.equal(mints, 1, "the rejected shared token forces a refresh");
});

test("a failed lookup is not cached: the next request tries again", async () => {
  let attempts = 0;
  const { provider } = harness({
    loadSession: async () => {
      if (++attempts === 1) throw new Error("db unavailable");
      return sessionExpiringIn(10 * 60 * 1000);
    },
  });

  await assert.rejects(provider.getConnection(), /db unavailable/);
  await provider.getConnection();
  assert.equal(attempts, 2);
});

test("an unknown tenant fails closed", async () => {
  const { provider } = harness({ resolveOrganizationId: () => undefined });
  await assert.rejects(provider.getConnection(), TenantContextMissingError);
});
