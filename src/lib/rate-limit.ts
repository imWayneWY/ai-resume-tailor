/**
 * In-memory rate limiter for API route protection.
 *
 * Uses a sliding window counter per IP address stored in a Map.
 * Entries are lazily cleaned up on each check to prevent unbounded growth.
 *
 * NOTE: This is per-process — in a serverless/multi-instance deployment each
 * instance keeps its own counters.  For stricter guarantees use an external
 * store (e.g. Redis + @upstash/ratelimit).
 */

interface RateLimitEntry {
  /** Timestamps (ms) of requests within the current window. */
  timestamps: number[];
}

interface RateLimiterOptions {
  /** Maximum number of requests allowed within `windowMs`. */
  limit: number;
  /** Time window in milliseconds (default: 60 000 = 1 minute). */
  windowMs?: number;
}

interface RateLimitResult {
  /** Whether the request should be allowed. */
  allowed: boolean;
  /** Number of remaining requests in the current window. */
  remaining: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { limit, windowMs = 60_000 } = options;
  const store = new Map<string, RateLimitEntry>();

  /** Remove expired timestamps and delete stale keys. */
  function cleanup(now: number) {
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }

  /** Check (and record) a request for the given key. */
  function check(key: string): RateLimitResult {
    const now = Date.now();

    // Lazy cleanup — run at most once every 60 s worth of calls
    if (store.size > 1000) {
      cleanup(now);
    }

    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Prune expired timestamps for this key
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= limit) {
      return { allowed: false, remaining: 0 };
    }

    entry.timestamps.push(now);
    return { allowed: true, remaining: limit - entry.timestamps.length };
  }

  return { check };
}

/**
 * Extract a best-effort client IP from the request.
 *
 * Checks `x-forwarded-for` first (set by most reverse proxies / Vercel / Cloudflare),
 * then falls back to `x-real-ip`, and finally to a generic fallback.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    // x-forwarded-for may contain a comma-separated list; first entry is the client
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}
