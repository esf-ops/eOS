/**
 * Square-footage calculator input parsing. Area math itself is `sfFromGuidedPiece` in
 * `@quote-lib/measurementEngine` (shared with Quote / Internal Estimate).
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Parse a length typed the way people read plans into inches:
 * `126`, `126"`, `126 in`, `10'`, `10' 6`, `10'6"`, `10 ft 6 in`, `10.5'`.
 * Returns null for anything else (including negatives).
 */
export function parseLengthInches(raw: string): number | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[”″]/g, '"')
    .replace(/[’′]/g, "'");
  if (!s) return null;
  const feet = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inches)?)?$/);
  if (feet) return round2(Number(feet[1]) * 12 + (feet[2] ? Number(feet[2]) : 0));
  const inches = s.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inches)?$/);
  return inches ? round2(Number(inches[1])) : null;
}

/** Inches → a short display like `10′ 6″` (whole feet + remaining inches). */
export function formatInches(inches: number): string {
  if (!(inches > 0)) return "";
  const ft = Math.floor(inches / 12);
  const rest = round2(inches - ft * 12);
  if (!ft) return `${rest}″`;
  return rest ? `${ft}′ ${rest}″` : `${ft}′`;
}
