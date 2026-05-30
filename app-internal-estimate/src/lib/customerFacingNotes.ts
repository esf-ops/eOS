/** Default cap for customer PDF project notes — keeps print layout stable. */
export const CUSTOMER_FACING_NOTES_MAX_LINES = 12;

/**
 * Normalize raw estimator-entered project notes for customer print.
 * Trims lines, drops empties, preserves wording, caps line count. No markdown.
 */
export function parseCustomerFacingNoteLines(
  raw: string | null | undefined,
  maxLines: number = CUSTOMER_FACING_NOTES_MAX_LINES
): string[] {
  if (raw == null || !String(raw).trim()) return [];
  const limit = Math.max(1, Math.floor(Number(maxLines) || CUSTOMER_FACING_NOTES_MAX_LINES));
  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}
