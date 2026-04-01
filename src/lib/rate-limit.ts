/**
 * Rate limiting with Redis (multi-instance) or in-memory fallback (single-instance).
 *
 * CONFIGURATION:
 * Rate limits are configurable via environment variables:
 * - EMAIL_RATE_LIMIT_MAX (default: 50) — max emails per user per window
 * - EMAIL_RATE_LIMIT_WINDOW_MINUTES (default: 60) — email window duration
 * - RSVP_RATE_LIMIT_IP_MAX (default: 20) — max RSVP requests per IP
 * - RSVP_RATE_LIMIT_IP_WINDOW_SECONDS (default: 60) — IP window duration
 * - RSVP_RATE_LIMIT_TOKEN_MAX (default: 10) — max RSVP requests per token
 * - RSVP_RATE_LIMIT_TOKEN_WINDOW_SECONDS (default: 60) — token window duration
 * - BULK_GUEST_LIMIT (default: 500) — max guests per bulk operation
 * - BULK_EMAIL_LIMIT (default: 100) — max emails per bulk send
 *
 * REDIS (recommended for multi-instance):
 * - REDIS_URL: Redis connection URL (e.g., redis://localhost:6379)
 * - If REDIS_URL is set, Redis is used for rate limiting
 * - If not set, falls back to in-memory rate limiting
 *
 * IN-MEMORY (single-instance only):
 * - Works correctly for single-instance deployments
 * - Each instance has its own rate limit state
 * - Multi-instance deployments MUST use Redis to share state
 */

import Redis from "ioredis";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetAt: number;
}

// Redis client singleton (lazy-initialized)
let redis: Redis | null = null;
let redisConnectionError = false;

/**
 * Get or create Redis client.
 * Returns null if REDIS_URL is not set or connection fails.
 */
function getRedisClient(): Redis | null {
  if (redis) return redis;
  if (redisConnectionError) return null;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => {
        // Don't retry on connection failure
        return null;
      },
    });

    redis.on("error", (err) => {
      console.error("Redis connection error:", err.message);
      redisConnectionError = true;
      redis = null;
    });

    redis.on("connect", () => {
      redisConnectionError = false;
    });

    return redis;
  } catch (err) {
    console.error("Failed to create Redis client:", err);
    redisConnectionError = true;
    return null;
  }
}

// In-memory fallback store (for single-instance deployments)
const memoryStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes (only used for in-memory mode)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    memoryStore.forEach((entry, key) => {
      if (entry.resetAt < now) {
        memoryStore.delete(key);
      }
    });
  }, 5 * 60 * 1000);
}

/**
 * Check rate limit using Redis (atomic INCR + PEXPIRE).
 */
async function checkRateLimitRedis(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<RateLimitResult> {
  const client = getRedisClient();
  if (!client) {
    // Fall back to in-memory if Redis not available
    return checkRateLimitMemory(key, maxAttempts, windowMs);
  }

  const redisKey = `ratelimit:${key}`;
  const now = Date.now();
  const windowStart = now + windowMs;

  try {
    // Use Redis transaction for atomic check-and-increment
    const result = await client
      .multi()
      .incr(redisKey)
      .pttl(redisKey)
      .exec();

    if (!result) {
      return checkRateLimitMemory(key, maxAttempts, windowMs);
    }

    const [incrErr, count] = result[0] as [Error | null, number];
    const [pttlErr, ttl] = result[1] as [Error | null, number];

    if (incrErr || pttlErr) {
      console.error("Redis rate limit error:", incrErr || pttlErr);
      return checkRateLimitMemory(key, maxAttempts, windowMs);
    }

    // First request - set TTL
    if (count === 1) {
      await client.pexpire(redisKey, windowMs);
      return {
        limited: false,
        remaining: maxAttempts - 1,
        resetAt: windowStart,
      };
    }

    // TTL from Redis (in milliseconds, -1 if no expiry, -2 if key doesn't exist)
    const resetAt = ttl > 0 ? now + ttl : windowStart;

    if (count > maxAttempts) {
      return {
        limited: true,
        remaining: 0,
        resetAt,
      };
    }

    return {
      limited: false,
      remaining: maxAttempts - count,
      resetAt,
    };
  } catch (err) {
    console.error("Redis rate limit error:", err);
    return checkRateLimitMemory(key, maxAttempts, windowMs);
  }
}

/**
 * Check rate limit using in-memory store (single-instance fallback).
 */
function checkRateLimitMemory(
  key: string,
  maxAttempts: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    // No entry or window expired — start fresh
    memoryStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      limited: false,
      remaining: maxAttempts - 1,
      resetAt: now + windowMs,
    };
  }

  if (entry.count >= maxAttempts) {
    // Over the limit
    return {
      limited: true,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Increment count
  entry.count++;
  return {
    limited: false,
    remaining: maxAttempts - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Check if a key has exceeded its rate limit.
 * Uses Redis if configured, falls back to in-memory otherwise.
 *
 * @param key - Unique identifier (e.g., IP address, token, email)
 * @param maxAttempts - Maximum attempts allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns RateLimitResult with limited status and remaining attempts
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<RateLimitResult> {
  const client = getRedisClient();

  if (client) {
    return checkRateLimitRedis(key, maxAttempts, windowMs);
  }

  return checkRateLimitMemory(key, maxAttempts, windowMs);
}

/**
 * Extract client IP from request headers.
 * Handles Cloudflare Tunnel and other proxy headers.
 */
export function extractIp(req: Request): string {
  // Cloudflare sets this header with the real client IP
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  // Standard proxy header - first IP in the chain is the original client
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map(ip => ip.trim());
    // Return the first non-private IP (client IP, not internal proxy)
    for (const ip of ips) {
      if (ip && !isPrivateIp(ip)) return ip;
    }
    // Fall back to first IP if all are private
    return ips[0] || "unknown";
  }

  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Check if an IP address is a private/internal IP.
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  if (ip.startsWith("10.") ||
      ip.startsWith("192.168.") ||
      ip.startsWith("172.16.") ||
      ip.startsWith("172.17.") ||
      ip.startsWith("172.18.") ||
      ip.startsWith("172.19.") ||
      ip.startsWith("172.20.") ||
      ip.startsWith("172.21.") ||
      ip.startsWith("172.22.") ||
      ip.startsWith("172.23.") ||
      ip.startsWith("172.24.") ||
      ip.startsWith("172.25.") ||
      ip.startsWith("172.26.") ||
      ip.startsWith("172.27.") ||
      ip.startsWith("172.28.") ||
      ip.startsWith("172.29.") ||
      ip.startsWith("172.30.") ||
      ip.startsWith("172.31.") ||
      ip === "127.0.0.1" ||
      ip.startsWith("169.254.")) {
    return true;
  }

  // IPv6 private/local
  if (ip.startsWith("::") || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd")) {
    return true;
  }

  return false;
}

/**
 * Get email rate limit configuration from environment variables.
 * Defaults: 50 emails per hour per user.
 */
export function getEmailRateLimit(): { max: number; windowMs: number } {
  const max = parseInt(process.env.EMAIL_RATE_LIMIT_MAX ?? "50", 10);
  const windowMinutes = parseInt(process.env.EMAIL_RATE_LIMIT_WINDOW_MINUTES ?? "60", 10);
  return {
    max: isNaN(max) ? 50 : max,
    windowMs: (isNaN(windowMinutes) ? 60 : windowMinutes) * 60 * 1000,
  };
}

/**
 * Get RSVP rate limit configuration from environment variables.
 * Defaults: 20 requests per minute per IP, 10 per minute per token.
 */
export function getRsvpRateLimit(): { ipMax: number; ipWindowMs: number; tokenMax: number; tokenWindowMs: number } {
  const ipMax = parseInt(process.env.RSVP_RATE_LIMIT_IP_MAX ?? "20", 10);
  const ipWindowSeconds = parseInt(process.env.RSVP_RATE_LIMIT_IP_WINDOW_SECONDS ?? "60", 10);
  const tokenMax = parseInt(process.env.RSVP_RATE_LIMIT_TOKEN_MAX ?? "10", 10);
  const tokenWindowSeconds = parseInt(process.env.RSVP_RATE_LIMIT_TOKEN_WINDOW_SECONDS ?? "60", 10);

  return {
    ipMax: isNaN(ipMax) ? 20 : ipMax,
    ipWindowMs: (isNaN(ipWindowSeconds) ? 60 : ipWindowSeconds) * 1000,
    tokenMax: isNaN(tokenMax) ? 10 : tokenMax,
    tokenWindowMs: (isNaN(tokenWindowSeconds) ? 60 : tokenWindowSeconds) * 1000,
  };
}

/**
 * Get bulk operation limits from environment variables.
 * Defaults: 500 for database operations, 100 for email operations.
 */
export function getBulkLimits(): { guestLimit: number; emailLimit: number } {
  const guestLimit = parseInt(process.env.BULK_GUEST_LIMIT ?? "500", 10);
  const emailLimit = parseInt(process.env.BULK_EMAIL_LIMIT ?? "100", 10);

  return {
    guestLimit: isNaN(guestLimit) ? 500 : guestLimit,
    emailLimit: isNaN(emailLimit) ? 100 : emailLimit,
  };
}