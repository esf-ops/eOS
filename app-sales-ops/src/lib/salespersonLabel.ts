const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const UNKNOWN_SALESPERSON_LABEL = "Unknown salesperson";

export function isUuidLike(value: unknown): boolean {
  return UUID_RE.test(String(value || "").trim());
}

export function salespersonDisplayName(...candidates: Array<string | null | undefined>): string {
  for (const raw of candidates) {
    const text = String(raw || "").trim();
    if (text && !isUuidLike(text)) return text;
  }
  return UNKNOWN_SALESPERSON_LABEL;
}
