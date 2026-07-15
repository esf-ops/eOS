import { stripHtmlToText } from "./quoteIntakeFormat.mjs";

/** Redact obviously sensitive keys from audit metadata for display. */
export function sanitizeMetadataForDisplay(metadata) {
  const blocked = /secret|token|password|authorization|cookie|raw_?body|payload|html|bytes/i;
  const out = {};
  for (const [k, v] of Object.entries(metadata ?? {})) {
    if (blocked.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string" && /<|>/.test(v)) {
      out[k] = stripHtmlToText(v);
      continue;
    }
    out[k] = v;
  }
  return out;
}
