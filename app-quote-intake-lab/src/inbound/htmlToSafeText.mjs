/**
 * Convert HTML email bodies to plain display text.
 * Never executes scripts, styles, or remote content — string transforms only.
 */

/**
 * @param {string|null|undefined} html
 * @returns {string}
 */
export function htmlToSafeText(html) {
  let s = String(html ?? "");
  if (!s) return "";

  // Remove script/style/svg/object/iframe blocks entirely
  s = s.replace(/<(script|style|svg|object|embed|iframe|link|meta)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<(script|style|svg|object|embed|iframe|link|meta)\b[^>]*\/?>/gi, " ");

  // Drop HTML comments
  s = s.replace(/<!--[\s\S]*?-->/g, " ");

  // Line breaks
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  s = s.replace(/<\/\s*(p|div|tr|li|h[1-6])\s*>/gi, "\n");
  s = s.replace(/<\s*(p|div|tr|li|h[1-6])\b[^>]*>/gi, "\n");

  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, " ");

  // Decode a small set of entities (no DOM)
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      if (!Number.isFinite(code) || code < 32) return " ";
      try {
        return String.fromCodePoint(code);
      } catch {
        return " ";
      }
    });

  // Collapse whitespace
  s = s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return s;
}
