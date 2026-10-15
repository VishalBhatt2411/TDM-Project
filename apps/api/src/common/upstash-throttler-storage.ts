import { Logger } from "@nestjs/common";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import { Redis } from "@upstash/redis";

/** The record shape comes from the public interface, so no `@nestjs/throttler/dist/...` path (which a minor release may move) is imported. */
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

/** The only Redis surface used — lets a test substitute a double for the network client. */
export type RateLimitRedis = Pick<Redis, "multi">;

/** A request waits at most this long on Redis before taking the in-memory fallback. */
const REDIS_TIMEOUT_MS = 1_500;
/** While Redis is down every request would log the same failure; one line a minute is enough to alert on. */
const OUTAGE_LOG_INTERVAL_MS = 60_000;

/**
 * Rate-limit counters shared by every serverless instance. The default in-memory store gives each
 * Vercel instance its own counter, so an attacker spread across instances gets N times the limit.
 *
 * Fixed window: the first hit creates the key with the window's TTL, every hit increments it, and a
 * client over the limit is blocked until the window ends. SET NX + INCR + PTTL run in one MULTI/EXEC
 * so a crash can never leave a counter without an expiry.
 *
 * Fails open onto a per-instance in-memory counter if Redis is unreachable: throttling degrades to
 * the old behaviour instead of turning a Redis outage into a full API outage. The client is bounded
 * (one retry, hard timeout) so an outage costs a request at most about REDIS_TIMEOUT_MS, not the
 * library's default multi-second retry ladder.
 */
export class UpstashThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(UpstashThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();
  private lastOutageLoggedAt = 0;

  constructor(
    url: string,
    token: string,
    private readonly redis: RateLimitRedis = new Redis({
      url,
      token,
      retry: { retries: 1, backoff: () => 100 },
      signal: () => AbortSignal.timeout(REDIS_TIMEOUT_MS),
    }),
  ) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const redisKey = `rl:${throttlerName}:${key}`;
    try {
      const [, totalHits, ttlMs] = await this.redis
        .multi()
        .set(redisKey, 0, { px: ttl, nx: true })
        .incr(redisKey)
        .pttl(redisKey)
        .exec<["OK" | null, number, number]>();
      const timeToExpire = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : ttl) / 1000));
      const isBlocked = totalHits > limit;
      return { totalHits, timeToExpire, isBlocked, timeToBlockExpire: isBlocked ? timeToExpire : 0 };
    } catch (err) {
      this.logOutage(err);
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  private logOutage(err: unknown): void {
    const now = Date.now();
    if (now - this.lastOutageLoggedAt < OUTAGE_LOG_INTERVAL_MS) return;
    this.lastOutageLoggedAt = now;
    this.logger.error(JSON.stringify({ event: "rate_limit_store_unavailable", errorCode: (err as { code?: string }).code ?? "unknown" }));
  }
}
