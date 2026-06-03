/**
 * Format a "prepared by" value for customer-facing display.
 *
 * Preference order:
 *   1. Non-email value (full name already set) — returned as-is after trim.
 *   2. ESF email local part — "peg.reid@..." → "Peg Reid".
 *   3. Raw email — returned verbatim as fallback.
 *   4. Empty/missing — returns "".
 */
export function formatPreparedByDisplayName(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  // If it doesn't look like an email, treat it as a plain name already.
  if (!s.includes("@")) return s;

  const local = s.split("@")[0];
  if (!local) return s;

  // Convert "first.last" → "First Last"
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
  }

  // Single-segment local (e.g. "casey") → capitalize it
  if (parts.length === 1) {
    const p = parts[0];
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }

  return s;
}
