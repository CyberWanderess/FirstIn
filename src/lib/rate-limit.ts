/**
 * Simple in-memory rate limiter keyed by IP address.
 * Resets after the configured window expires.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

const WINDOW_MS = 60_000;     // 1 minute
const MAX_ATTEMPTS = 5;       // per window

/** Clean expired entries periodically */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

/**
 * Check if a request from the given IP is rate-limited.
 * Returns `true` if the request should be blocked (429).
 */
export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}
