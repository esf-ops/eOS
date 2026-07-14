/**
 * Display provenance for Quote Intake Lab values (Phase 3.1.1).
 * Derived from dataSource + run providerMode + review state — never from confidence alone.
 */

/**
 * @typedef {"fixture_simulated"|"simulated_classifier"|"live_unreviewed"|"live_confirmed"|"human_corrected"|"human_accepted"} ProvenanceKind
 */

/**
 * @param {{
 *   dataSource?: string,
 *   providerMode?: string|null,
 *   humanReviewState?: string|null,
 *   fieldHumanReviewState?: string|null,
 *   hasClassification?: boolean
 * }} ctx
 * @returns {ProvenanceKind}
 */
export function resolveProvenance(ctx = {}) {
  const dataSource = ctx.dataSource ?? "fixture";
  const providerMode = ctx.providerMode ?? null;
  const runReview = ctx.humanReviewState ?? null;
  const fieldReview = ctx.fieldHumanReviewState ?? null;

  if (dataSource === "fixture" && !providerMode && !ctx.hasClassification) {
    return "fixture_simulated";
  }

  if (fieldReview === "corrected" || runReview === "corrected") {
    if (runReview === "accepted") return "human_accepted";
    return "human_corrected";
  }

  if (runReview === "accepted") return "human_accepted";

  if (fieldReview === "confirmed" && providerMode === "live") return "live_confirmed";
  if (fieldReview === "confirmed" && providerMode === "simulated") return "human_corrected";

  if (providerMode === "live") return "live_unreviewed";
  if (providerMode === "simulated") return "simulated_classifier";

  if (dataSource === "fixture") return "fixture_simulated";
  return "simulated_classifier";
}

/** @param {ProvenanceKind} kind */
export function provenanceLabel(kind) {
  switch (kind) {
    case "fixture_simulated":
      return "Fixture simulated";
    case "simulated_classifier":
      return "Simulated classifier";
    case "live_unreviewed":
      return "Live Gemini — unreviewed";
    case "live_confirmed":
      return "Live Gemini — human confirmed";
    case "human_corrected":
      return "Human corrected";
    case "human_accepted":
      return "Human accepted snapshot";
    default:
      return "Unknown provenance";
  }
}

/** Short suffix for compact UI (queue / summary). */
export function provenanceShortLabel(kind) {
  switch (kind) {
    case "fixture_simulated":
      return "fixture";
    case "simulated_classifier":
      return "simulated";
    case "live_unreviewed":
      return "Live Gemini · unreviewed";
    case "live_confirmed":
      return "Live Gemini · confirmed";
    case "human_corrected":
      return "human corrected";
    case "human_accepted":
      return "accepted";
    default:
      return "";
  }
}

/** Fixture asterisks only for built-in fixture cases without live/sim classifier overlay. */
export function usesFixtureAsterisk(kind) {
  return kind === "fixture_simulated";
}

/**
 * Format square footage with provenance-aware decoration.
 * @param {number|null|undefined} value
 * @param {ProvenanceKind} kind
 */
export function formatSfWithProvenance(value, kind) {
  if (value == null || !Number.isFinite(value)) return "—";
  const base = `${Number(value).toFixed(1)} sf`;
  if (usesFixtureAsterisk(kind)) return `${base}*`;
  if (kind === "live_unreviewed") return `${base} · AI extracted`;
  if (kind === "live_confirmed") return `${base} · confirmed`;
  if (kind === "human_corrected") return `${base} · corrected`;
  if (kind === "human_accepted") return `${base} · accepted`;
  if (kind === "simulated_classifier") return `${base} · simulated`;
  return base;
}

/**
 * Format confidence with provenance-aware decoration.
 * @param {number|null|undefined} value
 * @param {ProvenanceKind} kind
 */
export function formatConfidenceWithProvenance(value, kind) {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = `${Math.round(value * 100)}%`;
  if (usesFixtureAsterisk(kind)) return `${pct}*`;
  const short = provenanceShortLabel(kind);
  if (!short) return pct;
  if (kind === "live_unreviewed") return `${pct} · Live Gemini · unreviewed`;
  if (kind === "simulated_classifier") return `${pct} · simulated`;
  return `${pct} · ${short}`;
}

/**
 * Case-level provenance for queue / case summary (latest classification overlay).
 * @param {any} caseRow
 */
export function caseValueProvenance(caseRow) {
  return resolveProvenance({
    dataSource: caseRow?.dataSource,
    providerMode: caseRow?.classificationProviderMode ?? null,
    humanReviewState: caseRow?.classificationReviewState ?? null,
    hasClassification: Boolean(caseRow?.latestClassificationRunId)
  });
}
