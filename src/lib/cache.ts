/**
 * Redis-backed cache with TTL for reference data that rarely changes.
 * All keys must be prefixed with `{weddingId}:` by callers to prevent cross-tenant pollution.
 *
 * USAGE:
 * - Wrap Prisma queries with getCached() for endpoints that return static configuration
 * - Call invalidateCache() after any mutation that changes the cached data
 *
 * TTL: 5 minutes (300,000ms) — stale data is acceptable for a few minutes
 *
 * IMPORTANT: Only use for data that:
 * - Is rarely modified (admin-only configuration)
 * - Can tolerate being slightly stale
 * - Has corresponding invalidation on all mutation routes
 */

import Redis from "ioredis";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    redis.on("error", () => {
      // Suppress connection errors — cache misses are handled gracefully
    });
  }
  return redis;
}

export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const client = getRedis();

  if (client) {
    try {
      const cached = await client.get(key);
      if (cached) return JSON.parse(cached) as T;
    } catch {
      // Redis unavailable — fall through to fetcher
    }
  }

  const data = await fetcher();

  if (client) {
    try {
      await client.set(key, JSON.stringify(data), "EX", Math.floor(ttlMs / 1000));
    } catch {
      // Redis unavailable — cache miss is acceptable
    }
  }

  return data;
}

export async function invalidateCache(key: string): Promise<void> {
  const client = getRedis();
  if (client) {
    try {
      await client.del(key);
    } catch {
      // Redis unavailable — invalidation is best-effort
    }
  }
}
