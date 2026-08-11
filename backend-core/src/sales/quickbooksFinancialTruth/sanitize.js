/**
 * Strip secrets / credential-like material from diagnostics before API responses.
 */

const SECRET_KEY =
  /(^|_)(password|passwd|secret|authorization|credential|token|apikey|api_key|private_key)$/i;
const SECRET_KEY_ALLOW = /_configured$/i;
const BASIC_AUTH = /(?:^|[\s"'])basic\s+[a-z0-9+/=._-]{8,}/i;

/**
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export function sanitizeFinancialTruthDiagnostics(value, depth = 0) {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (BASIC_AUTH.test(value)) return "[redacted]";
    if (/QB_GATEWAY_PASSWORD/i.test(value)) return "[redacted]";
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeFinancialTruthDiagnostics(v, depth + 1));
  }
  if (typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k) && !SECRET_KEY_ALLOW.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = sanitizeFinancialTruthDiagnostics(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * @param {string|null|undefined} message
 */
export function sanitizeErrorMessage(message) {
  const raw = String(message ?? "").trim();
  if (!raw) return "QuickBooks financial truth unavailable.";
  if (BASIC_AUTH.test(raw) || /password\s*[:=]/i.test(raw) || /QB_GATEWAY_PASSWORD/i.test(raw)) {
    return "QuickBooks financial truth unavailable (credentials redacted).";
  }
  return raw.slice(0, 400);
}
