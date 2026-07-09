/**
 * In-memory IP rate limiter for public visualizer renders (MVP).
 * Resets on process restart / deploy.
 */

/** @type {Map<string, { count: number, windowStartMs: number }>} */
const buckets = new Map();

/**
 * @param {import("express").Request} req
 * @returns {string}
 */
export function getRequestClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers["x-real-ip"];
  if (realIp) return String(realIp).trim();
  return String(req.ip ?? req.socket?.remoteAddress ?? "unknown");
}

/**
 * @param {string} ip
 * @param {number} maxPerHour
 * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number }}
 */
export function checkPublicRenderRateLimit(ip, maxPerHour) {
  const key = String(ip ?? "unknown");
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const limit = Math.max(1, maxPerHour);

  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStartMs >= windowMs) {
    bucket = { count: 0, windowStartMs: now };
    buckets.set(key, bucket);
  }

  if (bucket.count >= limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((windowMs - (now - bucket.windowStartMs)) / 1000),
    );
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

/** Test helper */
export function resetPublicRenderRateLimitsForTests() {
  buckets.clear();
}
