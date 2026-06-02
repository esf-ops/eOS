/**
 * takeoffBenchmark — sanitized benchmark fixtures + lightweight evaluation harness.
 *
 * Purpose:
 *   Declare sanitized truth fixtures for known plan types and compare eliteOS-computed
 *   measurements against them. Use before/after every prompt or model change to catch regressions.
 *
 * Architecture rules:
 *   - Pure functions only: no I/O, no DB calls, no AI calls, no pricing logic.
 *   - Always compares against eliteOS computed totals — never raw AI totals.
 *   - Source PDFs are private and NEVER committed to the repo.
 *   - Fixture labels use sanitized category names — no real customer/vendor names.
 *
 * Fixture schema (v5.7):
 *   benchmarkId, label, category, planType, truthConfidence, expectedStatus
 *   expectedCountertopSf, expectedStandardBacksplashSf, expectedHighBacksplashSf?,
 *   expectedFullHeightBacksplashSf?, expectedCombinedSf?, toleranceCountertopSf,
 *   toleranceBacksplashSf, expectedNoBacksplash?, expectedBacksplashType?,
 *   visibleReferenceTotals?, importantExpectedDimensions?, knownFailureModes,
 *   reviewGateReasons?, notes
 *
 * Backward-compat alias: expectedBacksplashSf = expectedStandardBacksplashSf
 *   (required by evaluateTakeoffAgainstBenchmark).
 *
 * Usage:
 *   import { evaluateTakeoffAgainstBenchmark, REFERENCE_BENCHMARK_001 } from "./takeoffBenchmark.mjs";
 *   const result = evaluateTakeoffAgainstBenchmark(computedMeasurements, REFERENCE_BENCHMARK_001);
 */

// ── Summary labels ─────────────────────────────────────────────────────────────

/** Outcome summary labels for a single benchmark evaluation or run comparison. */
export const BENCHMARK_RESULT = Object.freeze({
  /** All categories within tolerance. */
  PASS: "pass",
  /** One or more categories outside tolerance; human review needed. */
  NEEDS_REVIEW: "needs_review",
  /** Current run is farther from target than previous run. */
  REGRESSION: "regression",
});

// ── Benchmark fixtures ─────────────────────────────────────────────────────────

/**
 * Hand sketch benchmark 001 — private dev-only benchmark target.
 *
 * Source PDF: private, not committed to repo (PII + customer IP).
 * Estimator-approved targets supplied manually from the a private hand sketch job.
 * Use this fixture in manual QA and benchmark tests to guard against regression.
 *
 * Observed AI extraction history:
 *   v5 prompt v1 → countertop 76.97 sf / backsplash 0.00 sf  (CT close, BS missed)
 *   v5 prompt v2 → countertop 68.41 sf / backsplash 1.04 sf  (CT regressed, BS partial)
 */
export const HAND_SKETCH_BENCHMARK_001 = Object.freeze({
  benchmarkId:           "hand-sketch-benchmark-001",
  label:                 "Hand sketch benchmark 001",
  sourceFilename:        "hand_sketch_benchmark_001.pdf",   // private — not in repo
  expectedCountertopSf:  78,
  expectedBacksplashSf:  4,
  expectedCombinedSf:    82,
  toleranceSf:           2,
  notes: Object.freeze([
    "Messy hand sketch / email packet. Estimator-approved target supplied manually.",
    "Observed v5 prompt v1: 76.97 ct / 0.00 bs — countertop close, backsplash missed.",
    "Observed v5 prompt v2: 68.41 ct / 1.04 bs — countertop regressed (island shrank), backsplash partial.",
  ]),
  importantExpectedDimensions: Object.freeze([
    "Island should NOT shrink — estimator expects roughly 100\" × 42\" or similar; prompt v2 model shrank to 86\" × 56\".",
    "Computer/desk run should be captured as a separate area or run.",
    "Backsplash / tile / 'no B/S' ambiguity requires human review — some surfaces have no stone backsplash.",
  ]),
  knownFailureModes: Object.freeze([
    "Model may record aiProvidedTotals.backsplashExactSf > 0 without populating backsplashLinearIn (structured field missing).",
    "Model may produce contradictory output: 'No Back Splash' note alongside 1.04 sf backsplash.",
    "Prompt v2 regressed countertop from 76.97 sf to 68.41 sf due to island dimension shrinkage.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

// ── Reference benchmark fixtures (v5.6/v5.7) ─────────────────────────────────
//
// Sanitized benchmarks drawn from real plan types. Source PDFs are private.
// Fields ending in ...Sf follow the v5.7 schema with explicit type suffixes.
// expectedBacksplashSf is kept as an alias for backward compat with evaluateTakeoffAgainstBenchmark.

/**
 * A. Reference benchmark 001 — simple written-reference single piece.
 *
 * Source PDF: private, not committed.
 * Plan type: commercial/desk piece with a printed sqft reference.
 * Observed: v5.5 AI computed ~32.98 sf — close, within tolerance.
 */
export const REFERENCE_BENCHMARK_001 = Object.freeze({
  benchmarkId:                  "reference-benchmark-001",
  label:                        "Simple written-reference desk",
  category:                     "simple written-reference sanity case",
  planType:                     "commercial single piece",
  truthConfidence:              "high",
  expectedStatus:               "auto_pass",
  sourceFilename:               "reference_benchmark_001.pdf",   // private — not in repo
  expectedCountertopSf:         31,
  expectedStandardBacksplashSf: 0,
  expectedBacksplashSf:         0,                               // backward-compat alias
  expectedCombinedSf:           31,
  expectedNoBacksplash:         true,
  expectedBacksplashType:       "none",
  toleranceCountertopSf:        2,
  toleranceBacksplashSf:        1,
  toleranceSf:                  2,                               // backward-compat alias
  visibleReferenceTotals: Object.freeze([
    { rawText: "31 sq'", countertopSf: 31, noBacksplash: true, confidence: "high" },
  ]),
  notes: Object.freeze([
    "Single commercial countertop piece with explicit sqft callout.",
    "No backsplash expected.",
    "Observed v5.5: AI computed ~32.98 sf — close, within tolerance.",
  ]),
  knownFailureModes: Object.freeze([
    "Model may round differently from plan reference; expect ±2 sf tolerance.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

/**
 * B. Reference benchmark 002 — kitchen with 4 inch backsplash reference.
 *
 * Source PDF: private, not committed.
 * Plan type: handwritten kitchen sketch with CT + explicit 4" BSP = 6 sq' note.
 * Observed: v5.5 AI got ~54 sf CT; backsplash reconciliation unreliable.
 */
export const REFERENCE_BENCHMARK_002 = Object.freeze({
  benchmarkId:                  "reference-benchmark-002",
  label:                        "Kitchen with 4 inch backsplash reference",
  category:                     "written CT + standard backsplash reference",
  planType:                     "handwritten kitchen sketch",
  truthConfidence:              "high",
  expectedStatus:               "review_required",
  sourceFilename:               "reference_benchmark_002.pdf",   // private — not in repo
  expectedCountertopSf:         53,
  expectedStandardBacksplashSf: 6,
  expectedBacksplashSf:         6,                               // backward-compat alias
  expectedCombinedSf:           59,
  expectedNoBacksplash:         false,
  expectedBacksplashType:       "standard_4in",
  toleranceCountertopSf:        2,
  toleranceBacksplashSf:        1,
  toleranceSf:                  2,                               // backward-compat alias
  visibleReferenceTotals: Object.freeze([
    { rawText: "Kitchen 53 sq'",  countertopSf: 53, noBacksplash: false, confidence: "high" },
    { rawText: "4\" BSP = 6 sq'", backsplashSf: 6, backsplashHeightIn: 4, confidence: "high" },
  ]),
  reviewGateReasons: Object.freeze([
    "CT and standard 4\" backsplash must be separated correctly.",
    "Backsplash height and linear inches must be structured, not just an AI reference total.",
  ]),
  notes: Object.freeze([
    "Handwritten kitchen sketch with visible countertop and backsplash reference totals.",
    "4 inch backsplash at 6 sq ft explicitly stated on plan.",
    "Observed v5.5: AI got ~54 sf CT; backsplash reconciliation unreliable.",
  ]),
  knownFailureModes: Object.freeze([
    "Model may miss the backsplash sqft reference or fail to set backsplashLinearIn.",
    "Model may produce contradictory output: AI reference backsplash total > 0 but structured value = 0.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

/**
 * C. Reference benchmark 003 — no-backsplash kitchen reference.
 *
 * Source PDF: private, not committed.
 * Plan type: printed/digital cabinet plan with "49 / NO BS" notation.
 * Observed: v5.5 AI computed ~54 sf — overcounted by ~5 sf.
 */
export const REFERENCE_BENCHMARK_003 = Object.freeze({
  benchmarkId:                  "reference-benchmark-003",
  label:                        "No-backsplash kitchen reference",
  category:                     "no-backsplash written reference",
  planType:                     "printed/digital cabinet plan",
  truthConfidence:              "high",
  expectedStatus:               "auto_pass",
  sourceFilename:               "reference_benchmark_003.pdf",   // private — not in repo
  expectedCountertopSf:         49,
  expectedStandardBacksplashSf: 0,
  expectedBacksplashSf:         0,                               // backward-compat alias
  expectedCombinedSf:           49,
  expectedNoBacksplash:         true,
  expectedBacksplashType:       "none",
  toleranceCountertopSf:        2,
  toleranceBacksplashSf:        1,
  toleranceSf:                  2,                               // backward-compat alias
  visibleReferenceTotals: Object.freeze([
    { rawText: "Kitchen 49 / NO BS", countertopSf: 49, noBacksplash: true, backsplashSf: 0, confidence: "high" },
  ]),
  notes: Object.freeze([
    "Cabinet plan with explicit 49 sf countertop and NO BS notation.",
    "Backsplash must not be generated.",
    "Observed v5.5: AI computed ~54 sf — overcounted by ~5 sf.",
  ]),
  knownFailureModes: Object.freeze([
    "Model may invent additional dimensions not on plan, overcounting sf.",
    "Model may generate backsplash despite explicit NO BS note.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

/**
 * D. Reference benchmark 004 — no-backsplash sketch reference.
 *
 * Source PDF: private, not committed.
 * Plan type: plan with "50 sq' no b/s" notation.
 * Observed: v5.5 AI computed ~36 sf — significantly undercounted (~14 sf gap).
 */
export const REFERENCE_BENCHMARK_004 = Object.freeze({
  benchmarkId:                  "reference-benchmark-004",
  label:                        "No-backsplash sketch reference",
  category:                     "no-backsplash sketch reference",
  planType:                     "sketch with written reference",
  truthConfidence:              "high",
  expectedStatus:               "auto_pass",
  sourceFilename:               "reference_benchmark_004.pdf",   // private — not in repo
  expectedCountertopSf:         50,
  expectedStandardBacksplashSf: 0,
  expectedBacksplashSf:         0,                               // backward-compat alias
  expectedCombinedSf:           50,
  expectedNoBacksplash:         true,
  expectedBacksplashType:       "none",
  toleranceCountertopSf:        2,
  toleranceBacksplashSf:        1,
  toleranceSf:                  2,                               // backward-compat alias
  visibleReferenceTotals: Object.freeze([
    { rawText: "50 sq' no b/s", countertopSf: 50, noBacksplash: true, backsplashSf: 0, confidence: "high" },
  ]),
  notes: Object.freeze([
    "Plan with visible 50 sq ft reference and no-backsplash callout.",
    "Observed v5.5: AI computed ~36 sf — significantly undercounted (~14 sf gap).",
    "Primary regression benchmark for v5.6 reference total reconciliation.",
  ]),
  knownFailureModes: Object.freeze([
    "Model misses major countertop dimensions from this plan type.",
    "REFERENCE_TOTAL_COUNTERTOP_MISMATCH warning expected until extraction is improved.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

/**
 * E. Clean rectangle / multi-piece geometry benchmark.
 *
 * Source PDF: private, not committed.
 * Plan type: clean sketch with labeled pieces: 51x96, 147x25.5, 68.5x25.5, 33.125x25.5.
 * Expected CT: 51*96/144 + 147*25.5/144 + 68.5*25.5/144 + 33.125*25.5/144
 *            = 34.00 + 26.03 + 12.13 + 5.87 = ~78.03 sf
 * Rule: sink/cooktop cutouts must NOT reduce material sf.
 */
export const CLEAN_RECTANGLE_GEOMETRY_001 = Object.freeze({
  benchmarkId:                  "clean-rectangle-geometry-001",
  label:                        "Clean rectangle / multi-piece geometry",
  category:                     "clean labeled geometry",
  planType:                     "labeled dimension sketch",
  truthConfidence:              "high",
  expectedStatus:               "auto_pass",
  sourceFilename:               "clean_rectangle_geometry_001.pdf",  // private — not in repo
  expectedCountertopSf:         78,
  expectedStandardBacksplashSf: 0,
  expectedBacksplashSf:         0,                               // backward-compat alias
  expectedCombinedSf:           78,
  expectedNoBacksplash:         true,
  expectedBacksplashType:       "none",
  toleranceCountertopSf:        3,
  toleranceBacksplashSf:        1,
  toleranceSf:                  3,                               // backward-compat alias
  importantExpectedDimensions: Object.freeze([
    "51 x 96",
    "147 x 25.5",
    "68.5 x 25.5",
    "33.125 x 25.5",
  ]),
  notes: Object.freeze([
    "Expected CT from geometry: 34.00 + 26.03 + 12.13 + 5.87 = ~78.03 sf.",
    "Sink/cooktop cutouts must NOT reduce material sf.",
    "Source PDF: private, not committed.",
  ]),
  knownFailureModes: Object.freeze([
    "Model may add cutouts to exclusions[], reducing material sf incorrectly.",
    "Model may miss a run, especially the smallest 33.125 x 25.5 piece.",
    "Model may apply wrong depth to labeled width-only dimensions.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

/**
 * F. Waterfall / stepped-shape sketch benchmark.
 *
 * Source PDF: private, not committed.
 * Plan type: sketch with stepped shape and possible waterfall panel.
 * Rule: do NOT add waterfall vertical panel area without explicit panel height on the plan.
 */
export const WATERFALL_STEPPED_SHAPE_001 = Object.freeze({
  benchmarkId:                  "waterfall-stepped-shape-001",
  label:                        "Waterfall / stepped-shape sketch",
  category:                     "stepped shape with potential waterfall panel",
  planType:                     "field sketch with waterfall callout",
  truthConfidence:              "medium",
  expectedStatus:               "review_required",
  sourceFilename:               "waterfall_stepped_shape_001.pdf",   // private — not in repo
  expectedCountertopSf:         76.3,
  expectedStandardBacksplashSf: 0,
  expectedBacksplashSf:         0,                               // backward-compat alias
  expectedCombinedSf:           76.3,
  expectedBacksplashType:       "none",
  toleranceCountertopSf:        3,
  toleranceBacksplashSf:        1,
  toleranceSf:                  3,                               // backward-compat alias
  reviewGateReasons: Object.freeze([
    "Waterfall vertical panel area must not be added without explicit panel height.",
    "Stepped shapes often require human review to verify overlap deductions.",
    "Review required regardless of CT accuracy.",
  ]),
  notes: Object.freeze([
    "CT target ~76.3 sf is for horizontal countertop surfaces only, before waterfall panels.",
    "Waterfall vertical panel area adds to total ONLY if explicit panel height is stated on plan.",
    "Source PDF: private, not committed.",
  ]),
  knownFailureModes: Object.freeze([
    "Model may include a waterfall vertical panel area based on assumed height, not stated height.",
    "Model may misread the stepped shape and miss an overlap deduction.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

/**
 * G. CT + standard backsplash + full-height backsplash (mixed types) benchmark.
 *
 * Source PDF: private, not committed.
 * Plan type: kitchen plan with both 4" standard BS and full-height backsplash areas.
 * The standard BS and FHBS must be in separate structured areas — not merged.
 */
export const MIXED_CT_STANDARD_BS_FHBS_001 = Object.freeze({
  benchmarkId:                     "mixed-ct-standard-bs-fhbs-001",
  label:                           "CT + standard BS + full-height backsplash separation",
  category:                        "CT + standard backsplash + full-height backsplash separation",
  planType:                        "kitchen plan with mixed backsplash types",
  truthConfidence:                 "medium",
  expectedStatus:                  "review_required",
  sourceFilename:                  "mixed_ct_standard_bs_fhbs_001.pdf",  // private — not in repo
  expectedCountertopSf:            62,
  expectedStandardBacksplashSf:    11,
  expectedHighBacksplashSf:        0,
  expectedFullHeightBacksplashSf:  40,
  expectedBacksplashSf:            51,   // backward-compat alias: 11 + 40
  expectedCombinedSf:              113,  // 62 + 11 + 40
  expectedBacksplashType:          "mixed",
  toleranceCountertopSf:           3,
  toleranceBacksplashSf:           2,
  toleranceSf:                     3,    // backward-compat alias
  reviewGateReasons: Object.freeze([
    "Standard 4\" backsplash and full-height backsplash must be in separate structured areas.",
    "FHBS area must have correct height — not merged into CT or standard BS.",
    "Review required to confirm backsplash type separation.",
  ]),
  notes: Object.freeze([
    "Plan has both standard 4\" backsplash and a full-height backsplash section.",
    "Combined total 113 sf only if all three buckets are separated and correct.",
    "Source PDF: private, not committed.",
  ]),
  knownFailureModes: Object.freeze([
    "Model may merge FHBS into standard backsplash or into countertop.",
    "Model may fail to set correct FHBS height, causing area computation errors.",
    "Model may produce structured standard BS but leave FHBS as an AI-reference-only total.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

/**
 * H. High backsplash + mixed area / material split benchmark.
 *
 * Source PDF: private, not committed.
 * Plan type: kitchen with perimeter, island, pantry areas — mixed backsplash heights.
 * Expected area buckets:
 *   - Perimeter: ~49 sf CT, ~20 linear ft of 10" high BS (~16.7 sf)
 *   - Island:    ~51 sf CT, no backsplash
 *   - Pantry:    ~32 sf CT, ~7 ft of 10" high BS (~5.8 sf)
 * Total high BS: ~22.5 sf (approximately 23.2 sf with rounding).
 */
export const HIGH_BACKSPLASH_MIXED_AREA_001 = Object.freeze({
  benchmarkId:                  "high-backsplash-mixed-area-001",
  label:                        "High backsplash + mixed area / material split",
  category:                     "high backsplash + area/material split",
  planType:                     "multi-area kitchen with 10-inch high backsplash",
  truthConfidence:              "medium",
  expectedStatus:               "review_required",
  sourceFilename:               "high_backsplash_mixed_area_001.pdf",  // private — not in repo
  expectedCountertopSf:         132,  // 49 + 51 + 32
  expectedStandardBacksplashSf: 0,
  expectedHighBacksplashSf:     23.2, // ~20 lf + ~7 lf of 10"
  expectedFullHeightBacksplashSf: 0,
  expectedBacksplashSf:         23.2,  // backward-compat alias
  expectedCombinedSf:           155.2, // 132 + 23.2
  expectedBacksplashType:       "high_backsplash",
  toleranceCountertopSf:        3,
  toleranceBacksplashSf:        3,
  toleranceSf:                  3,    // backward-compat alias
  expectedAreaBuckets: Object.freeze([
    { label: "Perimeter",  countertopSf: 49,   backsplashType: "high_10in", backsplashLinearFt: 20 },
    { label: "Island",     countertopSf: 51,   backsplashType: "none" },
    { label: "Pantry",     countertopSf: 32,   backsplashType: "high_10in", backsplashLinearFt: 7 },
  ]),
  reviewGateReasons: Object.freeze([
    "High 10\" backsplash must be in separate structured area from countertop.",
    "Island must have no backsplash.",
    "Perimeter and pantry must each have their backsplash areas separated.",
    "Material split must be preserved in area buckets.",
  ]),
  notes: Object.freeze([
    "High 10\" backsplash: perimeter ~20 lf × 10\" / 144 = ~16.7 sf, pantry ~7 lf × 10\" / 144 = ~5.8 sf.",
    "Total high BS: ~22.5–23.2 sf depending on rounding.",
    "Source PDF: private, not committed.",
  ]),
  knownFailureModes: Object.freeze([
    "Model may merge high BS into standard BS or CT.",
    "Model may apply wrong backsplash height (4\" instead of 10\").",
    "Model may miss island no-backsplash rule.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

/**
 * I. Messy email + sketch benchmark.
 *
 * Source PDF: private, not committed.
 * Plan type: multi-page packet with email context + hand sketch.
 * Review required: multiple pieces, tile/no-deck-splash notes, rounded corners, cord hole, ambiguity.
 */
export const MESSY_EMAIL_SKETCH_001 = Object.freeze({
  benchmarkId:                  "messy-email-sketch-001",
  label:                        "Messy email + sketch (review required)",
  category:                     "messy email + sketch",
  planType:                     "email + hand sketch multi-page",
  truthConfidence:              "low",
  expectedStatus:               "review_required",
  sourceFilename:               "messy_email_sketch_001.pdf",   // private — not in repo
  expectedCountertopSf:         null,   // no single truth value; review required
  expectedStandardBacksplashSf: null,
  expectedBacksplashSf:         null,   // backward-compat alias
  expectedCombinedSf:           null,
  toleranceCountertopSf:        5,
  toleranceBacksplashSf:        3,
  toleranceSf:                  5,      // backward-compat alias
  reviewGateReasons: Object.freeze([
    "Multiple pieces with rounded corners — manual review required.",
    "Tile/no-deck-splash notes may conflict — stone backsplash scope unclear.",
    "Cord hole and other fabrication notes require estimator attention.",
    "Page context vs measurement page ambiguity.",
  ]),
  notes: Object.freeze([
    "Multiple countertop pieces, notes, backsplash ambiguity, and page/context confusion.",
    "CT and BS values are not pre-approved — review always required.",
    "Source PDF: private, not committed.",
  ]),
  knownFailureModes: Object.freeze([
    "Model may conflate email context with measurement data.",
    "Model may miss fabrication notes (cord hole, edge, material specs).",
    "Model may incorrectly resolve backsplash vs tile ambiguity.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

/**
 * J. Multi-page cabinet packet benchmark.
 *
 * Source PDF: private, not committed.
 * Plan type: multi-page cabinet design packet with elevations + field notes.
 * Review required: multiple rooms/pages, no single visible total, mixed backsplash notes.
 */
export const MULTI_PAGE_CABINET_PACKET_001 = Object.freeze({
  benchmarkId:                  "multi-page-cabinet-packet-001",
  label:                        "Multi-page cabinet packet (review required)",
  category:                     "multi-page cabinet packet",
  planType:                     "multi-page cabinet design packet",
  truthConfidence:              "low",
  expectedStatus:               "review_required",
  sourceFilename:               "multi_page_cabinet_packet_001.pdf",  // private — not in repo
  expectedCountertopSf:         null,   // no single truth value; review required
  expectedStandardBacksplashSf: null,
  expectedBacksplashSf:         null,   // backward-compat alias
  expectedCombinedSf:           null,
  toleranceCountertopSf:        5,
  toleranceBacksplashSf:        3,
  toleranceSf:                  5,      // backward-compat alias
  reviewGateReasons: Object.freeze([
    "Multiple rooms/pages — no single visible countertop total on plan.",
    "Mixed backsplash notes across pages require estimator interpretation.",
    "Elevation pages may show cabinet heights that are not countertop heights.",
    "Review required regardless of computed totals.",
  ]),
  notes: Object.freeze([
    "Multiple rooms/pages, no single visible total, mixed backsplash notes.",
    "Model must assign correct rooms; estimator must verify room breakdown.",
    "Source PDF: private, not committed.",
  ]),
  knownFailureModes: Object.freeze([
    "Model may miss a room or double-count a room from elevation and plan views.",
    "Model may misapply backsplash from one room to another.",
    "Model may treat a cabinet elevation dimension as a countertop dimension.",
  ]),
  createdAt: "2026-06-02T00:00:00.000Z",
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ── Evaluation ────────────────────────────────────────────────────────────────

/**
 * Evaluate eliteOS-computed measurements against a benchmark target.
 *
 * IMPORTANT: always pass eliteOS computed totals, NOT raw AI totals.
 * AI-provided totals are for audit only and must never be used for pricing or evaluation.
 *
 * @param {{ countertopExactSf: number, backsplashExactSf: number, combinedExactSf: number }} computed
 *   eliteOS-computed TakeoffComputedMeasurements (from computeTakeoffMeasurements).
 * @param {{ benchmarkId: string, label: string, expectedCountertopSf: number,
 *           expectedBacksplashSf: number, expectedCombinedSf?: number, toleranceSf?: number }} benchmark
 * @returns {TakeoffEvaluation}
 *
 * @typedef {Object} TakeoffEvaluation
 * @property {string}   benchmarkId
 * @property {string}   benchmarkLabel
 * @property {number}   toleranceSf
 * @property {number}   expectedCountertopSf
 * @property {number}   expectedBacksplashSf
 * @property {number}   expectedCombinedSf
 * @property {number}   computedCountertopSf
 * @property {number}   computedBacksplashSf
 * @property {number}   computedCombinedSf
 * @property {number}   countertopDeltaSf      computed − expected (negative = under)
 * @property {number}   backsplashDeltaSf
 * @property {number}   combinedDeltaSf
 * @property {number|null} countertopPctError  abs % error vs expected (null if expected = 0)
 * @property {number|null} backsplashPctError
 * @property {boolean}  countertopPass         |delta| ≤ tolerance
 * @property {boolean}  backsplashPass
 * @property {boolean}  backsplashHighSeverity  expected > 0 but computed = 0
 * @property {"pass"|"needs_review"|"regression"} summary
 */
export function evaluateTakeoffAgainstBenchmark(computed, benchmark) {
  const tolerance       = Number(benchmark.toleranceSf ?? 2);
  const expectedCombined = benchmark.expectedCombinedSf ??
    (benchmark.expectedCountertopSf + benchmark.expectedBacksplashSf);

  const countertopDeltaSf = round2(computed.countertopExactSf - benchmark.expectedCountertopSf);
  const backsplashDeltaSf = round2(computed.backsplashExactSf - benchmark.expectedBacksplashSf);
  const combinedDeltaSf   = round2(computed.combinedExactSf   - expectedCombined);

  const countertopPctError = benchmark.expectedCountertopSf > 0
    ? round2(Math.abs(countertopDeltaSf) / benchmark.expectedCountertopSf * 100)
    : null;
  const backsplashPctError = benchmark.expectedBacksplashSf > 0
    ? round2(Math.abs(backsplashDeltaSf) / benchmark.expectedBacksplashSf * 100)
    : null;

  const countertopPass       = Math.abs(countertopDeltaSf) <= tolerance;
  const backsplashPass       = Math.abs(backsplashDeltaSf) <= tolerance;
  // High severity: estimator expects backsplash but model produced none at all.
  const backsplashHighSeverity = benchmark.expectedBacksplashSf > 0 &&
    computed.backsplashExactSf === 0;

  let summary = BENCHMARK_RESULT.PASS;
  if (!countertopPass || !backsplashPass || backsplashHighSeverity) {
    summary = BENCHMARK_RESULT.NEEDS_REVIEW;
  }

  return {
    benchmarkId:           benchmark.benchmarkId,
    benchmarkLabel:        benchmark.label,
    toleranceSf:           tolerance,
    expectedCountertopSf:  benchmark.expectedCountertopSf,
    expectedBacksplashSf:  benchmark.expectedBacksplashSf,
    expectedCombinedSf:    expectedCombined,
    computedCountertopSf:  computed.countertopExactSf,
    computedBacksplashSf:  computed.backsplashExactSf,
    computedCombinedSf:    computed.combinedExactSf,
    countertopDeltaSf,
    backsplashDeltaSf,
    combinedDeltaSf,
    countertopPctError,
    backsplashPctError,
    countertopPass,
    backsplashPass,
    backsplashHighSeverity,
    summary,
  };
}

// ── Run comparison ────────────────────────────────────────────────────────────

/**
 * Compare two evaluation runs to detect regression or improvement.
 *
 * A run "regresses" when it moves farther from the target than the previous run
 * by more than REGRESSION_BUFFER_SF.
 *
 * @param {TakeoffEvaluation} previousEval  Prior evaluation (e.g. prompt v1 result)
 * @param {TakeoffEvaluation} currentEval   Current evaluation (e.g. prompt v2 result)
 * @returns {TakeoffRunComparison}
 *
 * @typedef {Object} TakeoffRunComparison
 * @property {string}  benchmarkId
 * @property {number}  countertopChange        current − previous computed sf
 * @property {number}  backsplashChange
 * @property {boolean} countertopRegressed     current error > previous error + buffer
 * @property {boolean} countertopImproved      current error < previous error − buffer
 * @property {boolean} backsplashRegressed
 * @property {boolean} backsplashImproved
 * @property {number}  previousCountertopSf
 * @property {number}  currentCountertopSf
 * @property {number}  previousBacksplashSf
 * @property {number}  currentBacksplashSf
 * @property {"pass"|"needs_review"|"regression"} summary
 */
export function compareAiTakeoffRuns(previousEval, currentEval) {
  const REGRESSION_BUFFER_SF = 0.5; // a change must exceed this to be called a regression/improvement

  const countertopChange = round2(currentEval.computedCountertopSf - previousEval.computedCountertopSf);
  const backsplashChange = round2(currentEval.computedBacksplashSf - previousEval.computedBacksplashSf);

  const prevCtError = Math.abs(previousEval.countertopDeltaSf);
  const currCtError = Math.abs(currentEval.countertopDeltaSf);
  const countertopRegressed = currCtError > prevCtError + REGRESSION_BUFFER_SF;
  const countertopImproved  = currCtError < prevCtError - REGRESSION_BUFFER_SF;

  const prevBsError = Math.abs(previousEval.backsplashDeltaSf);
  const currBsError = Math.abs(currentEval.backsplashDeltaSf);
  const backsplashRegressed = currBsError > prevBsError + REGRESSION_BUFFER_SF;
  const backsplashImproved  = currBsError < prevBsError - REGRESSION_BUFFER_SF;

  // Comparison summary: regression takes precedence, then delegate to current eval.
  let summary = currentEval.summary;
  if (countertopRegressed || backsplashRegressed) {
    summary = BENCHMARK_RESULT.REGRESSION;
  }

  return {
    benchmarkId:           currentEval.benchmarkId,
    countertopChange,
    backsplashChange,
    countertopRegressed,
    countertopImproved,
    backsplashRegressed,
    backsplashImproved,
    previousCountertopSf:  previousEval.computedCountertopSf,
    currentCountertopSf:   currentEval.computedCountertopSf,
    previousBacksplashSf:  previousEval.computedBacksplashSf,
    currentBacksplashSf:   currentEval.computedBacksplashSf,
    summary,
  };
}
