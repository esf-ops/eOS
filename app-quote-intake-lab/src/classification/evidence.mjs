/**
 * Evidence helpers — never fabricate ranges; only return spans when found.
 */

/**
 * @param {string} haystack
 * @param {string} needle
 * @param {import("./classificationTypes.mjs").EvidenceSourceType} sourceType
 * @param {string} sourceId
 * @param {string} method
 * @param {number} confidence
 */
export function evidenceFromMatch(haystack, needle, sourceType, sourceId, method, confidence) {
  const text = String(haystack ?? "");
  const find = String(needle ?? "");
  if (!find) return null;
  const idx = text.toLowerCase().indexOf(find.toLowerCase());
  if (idx < 0) return null;
  const start = idx;
  const end = idx + find.length;
  const pad = 24;
  const excerptStart = Math.max(0, start - pad);
  const excerptEnd = Math.min(text.length, end + pad);
  const excerpt = text.slice(excerptStart, excerptEnd).replace(/\s+/g, " ").trim();
  return {
    sourceType,
    sourceId,
    excerpt: excerpt.length > 160 ? `${excerpt.slice(0, 157)}…` : excerpt,
    charStart: start,
    charEnd: end,
    extractionMethod: method,
    confidence,
    humanConfirmed: false,
    humanCorrected: false
  };
}

/**
 * @param {string} filename
 * @param {string} method
 * @param {number} confidence
 */
export function evidenceFromFilename(filename, method, confidence) {
  const name = String(filename ?? "");
  return {
    sourceType: "attachment_filename",
    sourceId: name,
    excerpt: name,
    charStart: null,
    charEnd: null,
    extractionMethod: method,
    confidence,
    humanConfirmed: false,
    humanCorrected: false
  };
}

/**
 * @param {string} note
 * @param {number} [confidence]
 */
export function evidenceFromManualCorrection(note, confidence = 1) {
  return {
    sourceType: "manual_correction",
    sourceId: "estimator",
    excerpt: String(note ?? "Estimator correction").slice(0, 160),
    charStart: null,
    charEnd: null,
    extractionMethod: "human_edit",
    confidence,
    humanConfirmed: true,
    humanCorrected: true
  };
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {object|null} evidence
 * @param {number|null} confidence
 * @param {string|null} [confidenceReason]
 */
export function makeExtractedField(key, value, evidence, confidence, confidenceReason = null) {
  const unknown = value == null || value === "" || value === "—";
  return {
    key,
    value: unknown ? null : value,
    unknown,
    confidence: unknown ? null : confidence,
    confidenceReason: unknown ? "No supporting excerpt in normalized inputs." : confidenceReason,
    evidence: unknown ? null : evidence,
    humanReviewState: "unreviewed",
    inferredWithoutEvidence: false
  };
}
