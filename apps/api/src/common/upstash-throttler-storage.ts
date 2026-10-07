import { Logger } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import { ThrottlerStorageService } from "@nestjs/throttler/dist/throttler.service";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import { Redis } from "@upstash/redis";

/**
 * Rate-limit counters shared by every serverless instance. The default in-memory store gives each
 * Vercel instance its own counter, so an attacker spread across instances gets N times the limit.
 *
 * Fixed window: the first hit creates the key with the window's TTL, every hit increments it, and a
 * client over the limit is blocked until the window ends. SET NX + INCR + PTTL run in one MULTI/EXEC
 * so a crash can never leave a counter without an expiry.
 *
 * Fails open onto a per-instance in-memory counter if Redis is unreachable: throttling degrades to
 * the old behaviour instead of turning a Redis outage into a full API outage.
 */
export class UpstashThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(UpstashThrottlerStorage.name);
  private readonly redis: Redis;
  private readonly fallback = new ThrottlerStorageService();

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

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
      this.logger.error(JSON.stringify({ event: "rate_limit_store_unavailable", errorCode: (err as { code?: string }).code ?? "unknown" }));
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
