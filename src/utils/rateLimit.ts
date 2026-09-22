/**
 * Lightweight, in-memory sliding-window rate limiter for Next.js API routes and Proxy.
 * Tracks requests per client IP with automatic garbage collection of expired buckets.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number; // Unix timestamp in milliseconds
}

// In-memory store: key -> RateLimitRecord
const rateLimitMap = new Map<string, RateLimitRecord>();

// Clean up stale entries every 5 minutes to prevent memory leaks
let lastCleanup = Date.now();
function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < 300000) return;
  lastCleanup = now;

  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

export interface RateLimitConfig {
  maxRequests: number; // Maximum allowed requests within windowMs
  windowMs: number;    // Sliding window duration in milliseconds
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds when the window resets
}

/**
 * Check if a request from the given identifier (IP) is allowed.
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 30, windowMs: 60000 }
): RateLimitResult {
  cleanupStaleEntries();

  const now = Date.now();
  const key = `${identifier}`;
  const existing = rateLimitMap.get(key);

  if (!existing || now > existing.resetAt) {
    // New or expired window
    const resetAt = now + config.windowMs;
    rateLimitMap.set(key, { count: 1, resetAt });
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      reset: Math.ceil(resetAt / 1000),
    };
  }

  // Existing active window
  if (existing.count >= config.maxRequests) {
    return {
      success: false,
      limit: config.maxRequests,
      remaining: 0,
      reset: Math.ceil(existing.resetAt / 1000),
    };
  }

  existing.count += 1;
  return {
    success: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - existing.count,
    reset: Math.ceil(existing.resetAt / 1000),
  };
}

/**
 * Extract client IP from Next.js request headers safely.
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "127.0.0.1";
}
