/**
 * Quote Intake audit metadata sanitizer (Phase 6P.2).
 * Strips / rejects prohibited PII and secret-bearing fields.
 */

/** Keys never allowed in audit metadata (case-insensitive, snake + camel). */
export const PROHIBITED_AUDIT_METADATA_KEYS = Object.freeze([
  "subject",
  "body",
  "emailBody",
  "email_body",
  "htmlBody",
  "html_body",
  "textBody",
  "text_body",
  "from",
  "fromAddress",
  "from_address",
  "to",
  "cc",
  "bcc",
  "sender",
  "recipient",
  "recipients",
  "address",
  "addresses",
  "attachmentBytes",
  "attachment_bytes",
  "bytes",
  "base64",
  "fileBytes",
  "file_bytes",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "secret",
  "apiKey",
  "api_key",
  "geminiKey",
  "gemini_key",
  "graphToken",
  "graph_token",
  "authorization",
  "rawPrompt",
  "raw_prompt",
  "providerPayload",
  "provider_payload",
  "rawEmail",
  "raw_email"
]);

const PROHIBITED_SET = new Set(PROHIBITED_AUDIT_METADATA_KEYS.map((k) => k.toLowerCase()));

/**
 * @param {unknown} metadata
 * @param {{ strict?: boolean }} [opts] — strict: throw if any prohibited key present
 * @returns {Record<string, unknown>}
 */
export function sanitizeQuoteIntakeAuditMetadata(metadata, opts = {}) {
  const strict = opts.strict !== false;
  if (metadata == null) return {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    const err = new Error("audit metadata must be a plain object");
    err.code = "invalid_audit_metadata";
    err.statusCode = 400;
    throw err;
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lower = String(key).toLowerCase();
    if (PROHIBITED_SET.has(lower) || PROHIBITED_SET.has(key)) {
      if (strict) {
        const err = new Error(`Prohibited audit metadata field: ${key}`);
        err.code = "prohibited_audit_metadata";
        err.statusCode = 400;
        throw err;
      }
      continue;
    }
    // Nested objects: shallow reject if nested keys look prohibited
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeQuoteIntakeAuditMetadata(value, opts);
    } else if (typeof value === "string" && value.length > 500) {
      out[key] = value.slice(0, 500);
    } else {
      out[key] = value;
    }
  }
  return out;
}
