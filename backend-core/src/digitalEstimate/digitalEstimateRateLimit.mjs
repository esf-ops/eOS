/**
 * In-memory IP rate limiter for public digital-estimate GETs.
 *
 * IMPORTANT: This is process-local only. On serverless / multi-instance runtimes
 * it does NOT provide global distributed protection. Token entropy, generic 404s,
 * and non-enumerable hash lookup remain the primary defenses.
 */

/** @type {Map<string, { count: number, windowStartMs: number }>} */
const buckets = new Map();

/**
 * @param {import("express").Request} req
 */
export function getDigitalEstimateClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    const first = String(forwarded).split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers?.["x-real-ip"];
  if (realIp) return String(realIp).trim();
  return String(req.ip ?? req.socket?.remoteAddress ?? "unknown");
}

/**
 * @param {string} ip
 * @param {number} maxPerMinute
 */
export function checkDigitalEstimatePublicRateLimit(ip, maxPerMinute) {
  const key = String(ip ?? "unknown");
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = Math.max(1, maxPerMinute);

  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStartMs >= windowMs) {
    bucket = { count: 0, windowStartMs: now };
    buckets.set(key, bucket);
  }

  if (bucket.count >= limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((windowMs - (now - bucket.windowStartMs)) / 1000)
    );
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

export function resetDigitalEstimatePublicRateLimitsForTests() {
  buckets.clear();
}
