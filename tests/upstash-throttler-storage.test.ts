import assert from "node:assert/strict";
import { test } from "node:test";
import { UpstashThrottlerStorage, type RateLimitRedis } from "../apps/api/src/common/upstash-throttler-storage";

/** A MULTI/EXEC double: SET NX + INCR + PTTL against one in-memory counter, or a failure. */
function fakeRedis(behaviour: { fail?: boolean; ttlMs?: number } = {}) {
  let hits = 0;
  let execs = 0;
  const chain = {
    set: () => chain,
    incr: () => chain,
    pttl: () => chain,
    exec: async () => {
      execs++;
      if (behaviour.fail) throw Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
      hits++;
      return [hits === 1 ? "OK" : null, hits, behaviour.ttlMs ?? 60_000];
    },
  };
  return { redis: { multi: () => chain } as unknown as RateLimitRedis, execs: () => execs };
}

/** Swaps the storage's Nest logger for a collector, so an outage doesn't spam the test output. */
function captureErrors(storage: UpstashThrottlerStorage): string[] {
  const errors: string[] = [];
  (storage as unknown as { logger: { error: (message: string) => void } }).logger.error = (message) => void errors.push(message);
  return errors;
}

test("counts hits in Redis and blocks once the limit is exceeded", async () => {
  const storage = new UpstashThrottlerStorage("https://redis.test", "token", fakeRedis({ ttlMs: 30_000 }).redis);

  assert.deepEqual(await storage.increment("ip", 60_000, 2, 0, "default"), { totalHits: 1, timeToExpire: 30, isBlocked: false, timeToBlockExpire: 0 });
  await storage.increment("ip", 60_000, 2, 0, "default");
  const third = await storage.increment("ip", 60_000, 2, 0, "default");
  assert.equal(third.isBlocked, true);
  assert.equal(third.timeToBlockExpire, 30);
});

test("falls back to a per-instance counter when Redis fails, and keeps counting", async () => {
  const storage = new UpstashThrottlerStorage("https://redis.test", "token", fakeRedis({ fail: true }).redis);
  captureErrors(storage);

  assert.equal((await storage.increment("ip", 60_000, 5, 0, "default")).totalHits, 1);
  assert.equal((await storage.increment("ip", 60_000, 5, 0, "default")).totalHits, 2);
});

test("an outage is logged once, not once per request, and never with the error message", async () => {
  const { redis, execs } = fakeRedis({ fail: true });
  const storage = new UpstashThrottlerStorage("https://redis.test", "token", redis);
  const errors = captureErrors(storage);

  for (let i = 0; i < 5; i++) await storage.increment("ip", 60_000, 5, 0, "default");

  assert.equal(execs(), 5);
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", /rate_limit_store_unavailable/);
  assert.match(errors[0] ?? "", /ETIMEDOUT/);
  assert.doesNotMatch(errors[0] ?? "", /connect ETIMEDOUT/, "the error code is logged, not the message");
});
