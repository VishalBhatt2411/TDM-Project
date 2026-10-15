import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { encryptSecret } from "../integrations/postgres/src/crypto";
import { OrganizationRepository } from "../integrations/postgres/src/repositories/organization.repository";

const KEY = "ab".repeat(32);
const OTHER_KEY = "cd".repeat(32);
const SESSION = {
  accessToken: "token-1",
  instanceUrl: "https://example.my.salesforce.com",
  salesforceOrgId: "00D000000000001AAA",
  integrationUserId: "005000000000001AAA",
};

interface StoredOrganization {
  connectionStatus: string;
  sfSessionEnc: string | null;
  sfSessionExpiresAt: Date | null;
}

function repoWith(record: StoredOrganization, key = KEY) {
  const prisma = {
    organization: {
      findUnique: async () => record,
      updateMany: async ({ data }: { data: Partial<StoredOrganization> }) => {
        Object.assign(record, data);
        return { count: 1 };
      },
    },
  };
  return new OrganizationRepository(prisma as unknown as PrismaClient, key);
}

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);
const connected = (sfSessionEnc: string | null): StoredOrganization => ({ connectionStatus: "connected", sfSessionEnc, sfSessionExpiresAt: inAnHour() });

// An unreadable session logs a warning by design; keep the test output clean and assert on it instead.
const warnings: string[] = [];
const originalWarn = console.warn;
beforeEach(() => {
  warnings.length = 0;
  console.warn = (message: string) => void warnings.push(message);
});
afterEach(() => {
  console.warn = originalWarn;
});

test("a saved session round-trips with its expiry", async () => {
  const record = connected(null);
  const repo = repoWith(record);
  await repo.saveSalesforceSession("org-1", { ...SESSION, expiresAt: inAnHour() });

  assert.deepEqual(await repo.loadSalesforceSession("org-1"), { ...SESSION, expiresAt: record.sfSessionExpiresAt });
  assert.equal(warnings.length, 0);
});

test("a session sealed under another key reads as no session instead of throwing", async () => {
  const repo = repoWith(connected(encryptSecret(JSON.stringify(SESSION), OTHER_KEY)));

  assert.equal(await repo.loadSalesforceSession("org-1"), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /salesforce_session_unreadable/);
  assert.match(warnings[0] ?? "", /org-1/);
  assert.doesNotMatch(warnings[0] ?? "", /token-1/, "never logs session material");
});

test("garbage ciphertext reads as no session", async () => {
  assert.equal(await repoWith(connected("not-a-ciphertext")).loadSalesforceSession("org-1"), null);
});

test("a session of an unexpected shape reads as no session", async () => {
  const payloads = ["null", "42", "not json", JSON.stringify({ accessToken: "x" }), JSON.stringify({ ...SESSION, instanceUrl: 7 })];
  for (const payload of payloads) {
    assert.equal(await repoWith(connected(encryptSecret(payload, KEY))).loadSalesforceSession("org-1"), null, payload);
  }
});

test("an expired or disconnected tenant has no session", async () => {
  const sealed = encryptSecret(JSON.stringify(SESSION), KEY);
  const expired = { connectionStatus: "connected", sfSessionEnc: sealed, sfSessionExpiresAt: new Date(Date.now() - 1) };
  const disconnected = { connectionStatus: "error", sfSessionEnc: sealed, sfSessionExpiresAt: inAnHour() };

  assert.equal(await repoWith(expired).loadSalesforceSession("org-1"), null);
  assert.equal(await repoWith(disconnected).loadSalesforceSession("org-1"), null);
});
