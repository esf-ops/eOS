/**
 * Default Entered by / Prepared by for new internal estimates.
 */

export function deriveDisplayNameFromEmail(email: string): string {
  const e = String(email || "").trim();
  if (!e) return "";
  const local = e.includes("@") ? e.split("@")[0] : e;
  const words = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return e;
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/** Prefer profile display name, then email-derived name, then raw email. */
export function resolveDefaultEnteredBy(
  metaName: string | null | undefined,
  email: string | null | undefined
): string {
  const meta = String(metaName ?? "").trim();
  if (meta) return meta;
  const derived = deriveDisplayNameFromEmail(String(email ?? ""));
  if (derived) return derived;
  return String(email ?? "").trim();
}

/** Auto-apply current-user default only on fresh quotes the user has not edited. */
export function shouldAutoApplyEnteredBy(urlQuoteId: string | null, userEdited: boolean): boolean {
  return !urlQuoteId && !userEdited;
}
