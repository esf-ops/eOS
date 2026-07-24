/**
 * Shared browser CORS allow-header list for authenticated eliteOS API requests.
 * Used by backend-core Express `cors()` middleware — never `Access-Control-Allow-Origin: *`
 * with credentials.
 *
 * Keep in sync with every authenticated head that sends custom request headers
 * (Authorization, Content-Type, Idempotency-Key, cron/org secrets).
 */

/** @type {readonly string[]} */
export const EOS_CORS_ALLOWED_HEADERS = Object.freeze([
  "Content-Type",
  "Authorization",
  "Idempotency-Key",
  "x-eos-cron-secret",
  "x-eliteos-cron-secret",
  "x-moraware-sync-secret",
  "x-organization-key"
]);

/** @type {readonly string[]} */
export const EOS_CORS_METHODS = Object.freeze([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS"
]);

/**
 * Case-insensitive membership check for an Access-Control-Allow-Headers value.
 * @param {string|null|undefined} allowHeadersHeader
 * @param {string} name
 */
export function corsAllowHeadersIncludes(allowHeadersHeader, name) {
  const want = String(name || "")
    .trim()
    .toLowerCase();
  if (!want) return false;
  return String(allowHeadersHeader || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(want);
}
