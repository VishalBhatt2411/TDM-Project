import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { PostgresAuthRepository } from "../integrations/postgres/src/repositories/auth.repository";

interface Row {
  id: string;
  customerId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  familyId: string;
  sessionStartedAt: Date;
}
type Where = Partial<Record<keyof Row, unknown>>;
type ByToken = { customerId_tokenHash: { customerId: string; tokenHash: string } };

/** Just enough of Prisma's RefreshToken delegate for the repository's queries. */
function fakeStore() {
  const rows: Row[] = [];
  const matches = (row: Row, where: Where) =>
    Object.entries(where).every(([key, expected]) => {
      if (key === "expiresAt") return row.expiresAt > (expected as { gt: Date }).gt;
      return (row as unknown as Record<string, unknown>)[key] === expected;
    });
  const find = ({ customerId_tokenHash: key }: ByToken) => rows.find((row) => row.customerId === key.customerId && row.tokenHash === key.tokenHash);
  const refreshToken = {
    create: async ({ data }: { data: Omit<Row, "id" | "revokedAt"> }) => {
      rows.push({ id: String(rows.length + 1), revokedAt: null, ...data });
    },
    updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
      const hit = rows.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    },
    findUnique: async ({ where }: { where: ByToken }) => find(where) ?? null,
    update: async ({ where, data }: { where: ByToken; data: Partial<Row> }) => {
      const row = find(where);
      if (!row) throw new Error("not found");
      Object.assign(row, data);
    },
  };
  const row = (tokenHash: string): Row => {
    const found = rows.find((r) => r.tokenHash === tokenHash);
    assert.ok(found, `row ${tokenHash} exists`);
    return found;
  };
  return { repo: new PostgresAuthRepository({ refreshToken } as unknown as PrismaClient), row };
}

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);
/** Well outside the 10 s reuse grace window. */
const longAgo = () => new Date(Date.now() - 60_000);

async function rotate(repo: PostgresAuthRepository, from: string, to: string) {
  const consumed = await repo.consumeRefreshToken("c1", from);
  assert.equal(consumed.status, "ok");
  if (consumed.status !== "ok") throw new Error("unreachable");
  await repo.saveRefreshToken("c1", to, inAnHour(), consumed.session);
}

test("a refresh token rotates once and its successor continues the same session", async () => {
  const { repo, row } = fakeStore();
  await repo.saveRefreshToken("c1", "t1", inAnHour());
  await rotate(repo, "t1", "t2");

  assert.equal(row("t2").familyId, row("t1").familyId);
  assert.deepEqual(row("t2").sessionStartedAt, row("t1").sessionStartedAt);
});

test("a token replayed within the grace window is rejected without ending the session", async () => {
  const { repo, row } = fakeStore();
  await repo.saveRefreshToken("c1", "t1", inAnHour());
  await rotate(repo, "t1", "t2");

  assert.deepEqual(await repo.consumeRefreshToken("c1", "t1"), { status: "invalid" });
  assert.equal(row("t2").revokedAt, null, "the successor stays live");
});

test("a rotated token replayed after the grace window ends the whole session", async () => {
  const { repo, row } = fakeStore();
  await repo.saveRefreshToken("c1", "t1", inAnHour());
  await rotate(repo, "t1", "t2");
  row("t1").revokedAt = longAgo();

  assert.deepEqual(await repo.consumeRefreshToken("c1", "t1"), { status: "reused" });
  assert.notEqual(row("t2").revokedAt, null, "the successor is revoked");
});

test("a signed-out token replayed later is invalid, not reported as theft", async () => {
  const { repo, row } = fakeStore();
  await repo.saveRefreshToken("c1", "t1", inAnHour());
  await repo.revokeRefreshToken("c1", "t1");
  row("t1").revokedAt = longAgo();

  assert.deepEqual(await repo.consumeRefreshToken("c1", "t1"), { status: "invalid" });
});

test("once a reuse has ended the session, every token in it keeps answering invalid", async () => {
  const { repo, row } = fakeStore();
  await repo.saveRefreshToken("c1", "t1", inAnHour());
  await rotate(repo, "t1", "t2");
  row("t1").revokedAt = longAgo();
  assert.equal((await repo.consumeRefreshToken("c1", "t1")).status, "reused");
  row("t2").revokedAt = longAgo();

  assert.equal((await repo.consumeRefreshToken("c1", "t1")).status, "invalid");
  assert.equal((await repo.consumeRefreshToken("c1", "t2")).status, "invalid");
});

test("unknown and expired tokens are invalid", async () => {
  const { repo } = fakeStore();
  await repo.saveRefreshToken("c1", "old", new Date(Date.now() - 1000));

  assert.deepEqual(await repo.consumeRefreshToken("c1", "missing"), { status: "invalid" });
  assert.deepEqual(await repo.consumeRefreshToken("c1", "old"), { status: "invalid" });
});
