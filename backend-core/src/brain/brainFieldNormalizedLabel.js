/**
 * Canonical snake_case labels for brain_fields.normalized_label (Supabase).
 * Does not alter Moraware SDK field objects or worksheet Sq.Ft. math — only string shaping for storage/search.
 */

function leafishText(v) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (Array.isArray(v)) return leafishText(v[0]);
  if (typeof v === "object") {
    const t = v._text ?? v["#text"];
    if (t != null) return String(t).trim();
  }
  return "";
}

/**
 * Best human-readable label for normalization (sync object or DB row shape).
 * Order: explicit label → name → Moraware XML-ish raw → field id fallback.
 */
export function pickBestHumanLabelForBrainField(fld) {
  if (!fld || typeof fld !== "object") return "";

  const direct =
    String(fld.label ?? fld.Label ?? "").trim() ||
    String(fld.name ?? fld.Name ?? "").trim() ||
    String(fld.fieldName ?? fld.FieldName ?? "").trim();

  if (direct) return direct;

  const raw = fld.raw ?? fld.raw_json;
  if (raw && typeof raw === "object") {
    const fromRaw =
      leafishText(raw.name) ||
      leafishText(raw.Name) ||
      leafishText(raw.jobFormFieldName) ||
      String(raw._attributes?.name ?? raw._attributes?.Name ?? "").trim();
    if (fromRaw) return fromRaw;
  }

  const fallbackId = String(fld.fieldId ?? fld.field_id ?? "").trim();
  if (fallbackId) return `field_${fallbackId}`;

  return "";
}

/**
 * Snake_case storage key: lowercase, trim, punctuation → underscores, collapse repeats.
 * Preserves semantic tokens (sqft, square_footage) via preprocess.
 */
export function normalizeLabelForBrainFieldStorage(raw) {
  let s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/\u00a0/g, " ");
  s = s.replace(/['`]/g, "");
  s = s.replace(/square\s+feet/gi, " square_footage ");
  s = s.replace(/sq\.\s*ft\.?|sq\s+ft|\bsqft\b/gi, " sqft ");
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/ /g, "_");
  s = s.replace(/_+/g, "_");
  s = s.replace(/^_|_$/g, "");
  return s;
}

/**
 * Value written to brain_fields.normalized_label on insert/update.
 */
export function computeNormalizedLabelForBrainFieldRow(fld) {
  const human = pickBestHumanLabelForBrainField(fld);
  let out = normalizeLabelForBrainFieldStorage(human);
  if (out) return out;

  const sdkNorm = String(fld?.normalizedLabel ?? fld?.normalized_label ?? "").trim();
  if (sdkNorm) {
    out = normalizeLabelForBrainFieldStorage(sdkNorm);
    if (out) return out;
  }

  const fid = String(fld?.fieldId ?? fld?.field_id ?? "").trim();
  if (fid) return normalizeLabelForBrainFieldStorage(`field_${fid}`) || `field_${fid.replace(/[^a-z0-9_]+/gi, "_")}`;

  return "";
}

/** True if stored normalized_label is missing or not useful for search. */
export function isNormalizedLabelMissingOrUnusable(stored) {
  const s = String(stored ?? "").trim();
  if (!s) return true;
  if (s === "(blank)") return true;
  return false;
}
