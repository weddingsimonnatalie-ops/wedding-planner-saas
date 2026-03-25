/**
 * Simple in-memory cache with TTL for reference data that rarely changes.
 *
 * USAGE:
 * - Wrap Prisma queries with getCached() for endpoints that return static configuration
 * - Call invalidateCache() after any mutation that changes the cached data
 *
 * TTL: 5 minutes (300,000ms) - stale data is acceptable for a few minutes
 *
 * IMPORTANT: Only use for data that:
 * - Is rarely modified (admin-only configuration)
 * - Can tolerate being slightly stale
 * - Has corresponding invalidation on all mutation routes
 */

const cache = new Map<string, { data: unknown; expires: number }>();

export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data as T;
  }
  const data = await fetcher();
  cache.set(key, { data, expires: Date.now() + ttlMs });
  return data;
}

export function invalidateCache(key: string): void {
  cache.delete(key);
}