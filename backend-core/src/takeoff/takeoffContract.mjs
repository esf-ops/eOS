/**
 * eliteOS AI Takeoff — versioned contract schema v1.0.
 *
 * This module defines the JSON contract for takeoff results produced by AI extraction
 * or manual data entry. It does NOT call any AI API, perform file I/O, or touch
 * Internal Estimate state. All values are plain-data objects documented via JSDoc.
 *
 * Architecture rules:
 *   - AI provides a structured draft conforming to this schema.
 *   - eliteOS recomputes all measurements independently (takeoffMeasurementCalc.mjs).
 *   - AI-provided totals are stored for audit/comparison only; they are NOT used for pricing.
 *   - The validator (takeoffValidator.mjs) flags discrepancies before any import.
 *   - The import planner (takeoffImportPlanner.mjs) maps approved results to RoomScopeBuilder drafts.
 */

/** Current schema version — bump when breaking changes are made to the contract. */
export const TAKEOFF_SCHEMA_VERSION = "1.0";

/** Allowed status values for a takeoff result. */
export const TAKEOFF_STATUS = Object.freeze({
  DRAFT: "draft",
  REVIEWED: "reviewed",
  APPROVED: "approved",
  REJECTED: "rejected"
});

/** Confidence levels (from AI or manual reviewer). */
export const TAKEOFF_CONFIDENCE = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
});

/** Diagnostic severity levels returned by the validator. */
export const TAKEOFF_DIAGNOSTIC_LEVEL = Object.freeze({
  INFO: "info",
  WARNING: "warning",
  ERROR: "error"
});

/** Well-known diagnostic codes for structured error handling. */
export const TAKEOFF_DIAGNOSTIC_CODE = Object.freeze({
  // Schema
  UNKNOWN_SCHEMA_VERSION: "UNKNOWN_SCHEMA_VERSION",
  MISSING_ROOMS: "MISSING_ROOMS",

  // Dimensions
  MISSING_DIMENSION: "MISSING_DIMENSION",
  ZERO_LENGTH: "ZERO_LENGTH",
  ZERO_DEPTH: "ZERO_DEPTH",
  SUSPICIOUS_DEPTH: "SUSPICIOUS_DEPTH",
  SUSPICIOUS_LENGTH: "SUSPICIOUS_LENGTH",

  // Totals
  TOTAL_MISMATCH_COUNTERTOP: "TOTAL_MISMATCH_COUNTERTOP",
  TOTAL_MISMATCH_BACKSPLASH: "TOTAL_MISMATCH_BACKSPLASH",
  TOTAL_MISMATCH_COMBINED: "TOTAL_MISMATCH_COMBINED",

  // Backsplash
  MISSING_BACKSPLASH_HEIGHT: "MISSING_BACKSPLASH_HEIGHT",
  BACKSPLASH_WITHOUT_LINEAR: "BACKSPLASH_WITHOUT_LINEAR",
  AI_BACKSPLASH_TOTAL_NOT_STRUCTURED: "AI_BACKSPLASH_TOTAL_NOT_STRUCTURED",
  POSSIBLE_BACKSPLASH_NOTE: "POSSIBLE_BACKSPLASH_NOTE",

  // Import
  UNSUPPORTED_SHAPE: "UNSUPPORTED_SHAPE",
  MISSING_ROOM_NAME: "MISSING_ROOM_NAME",
  EMPTY_AREA: "EMPTY_AREA",

  // Review flags
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  PENDING_REVIEW: "PENDING_REVIEW",

  // Cutout handling (v5.5)
  CUTOUT_IN_EXCLUSIONS_WARNING: "CUTOUT_IN_EXCLUSIONS_WARNING",

  // Reference total reconciliation + evidence coverage (v5.6)
  REFERENCE_TOTAL_COUNTERTOP_MISMATCH: "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
  REFERENCE_TOTAL_BACKSPLASH_MISMATCH: "REFERENCE_TOTAL_BACKSPLASH_MISMATCH",
  REFERENCE_TOTAL_COMBINED_MISMATCH:   "REFERENCE_TOTAL_COMBINED_MISMATCH",
  REFERENCE_TOTAL_NO_BS_CONFLICT:      "REFERENCE_TOTAL_NO_BS_CONFLICT",
  EVIDENCE_DIMENSION_NOT_USED:         "EVIDENCE_DIMENSION_NOT_USED",

  // Nonstandard piece depth — island/peninsula/bar/desk/waterfall requires plan evidence (v5.9.2)
  NONSTANDARD_DEPTH_ASSUMED:           "NONSTANDARD_DEPTH_ASSUMED",

  // Evidence traceability — runs must be traceable to extracted dimension evidence (v6.0)
  // These fire when the final TakeoffResult geometry cannot be tied back to the evidence table.
  RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE: "RUN_LENGTH_NOT_SUPPORTED_BY_EVIDENCE",
  RUN_DEPTH_NOT_SUPPORTED_BY_EVIDENCE:  "RUN_DEPTH_NOT_SUPPORTED_BY_EVIDENCE",
  EVIDENCE_DIMENSION_CHANGED_IN_RUN:    "EVIDENCE_DIMENSION_CHANGED_IN_RUN",
  CONFLICTING_DIMENSIONS_USED_SILENTLY: "CONFLICTING_DIMENSIONS_USED_SILENTLY",
  UNSUPPORTED_CORNER_DEDUCTION:         "UNSUPPORTED_CORNER_DEDUCTION",
  DRAFT_ASSEMBLY_REVIEW_REQUIRED:       "DRAFT_ASSEMBLY_REVIEW_REQUIRED",

  // Fabrication rules engine — deterministic business-rule findings (v6.2)
  // These fire from takeoffFabricationRules.mjs and are surfaced via the validator + QA gate.
  REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET:       "REFERENCE_TOTAL_USED_AS_GEOMETRY_TARGET",
  NO_BACKSPLASH_CONFIRMED:                       "NO_BACKSPLASH_CONFIRMED",
  BACKSPLASH_SCOPE_CONFLICT:                     "BACKSPLASH_SCOPE_CONFLICT",
  CUTOUT_DEDUCTED_FROM_MATERIAL:                 "CUTOUT_DEDUCTED_FROM_MATERIAL",
  INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED:      "INFERRED_DUPLICATE_PIECE_REVIEW_REQUIRED",
  CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG: "CORNER_DEDUCTION_WITH_EXCLUDED_OR_MISSING_LEG",
  NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE:      "NONSTANDARD_DEPTH_VERIFIED_FROM_EVIDENCE",
  NONSTANDARD_DEPTH_UNSUPPORTED:                 "NONSTANDARD_DEPTH_UNSUPPORTED",
});

/**
 * Supported piece types — mirrors RoomScopeBuilder GuidedPieceType.
 * "counter" | "splash" | "fhb"
 */
export const TAKEOFF_PIECE_TYPE = Object.freeze({
  COUNTER: "counter",
  SPLASH: "splash",
  FHB: "fhb"
});

/**
 * Supported shape types — mirrors RoomScopeBuilder GuidedShapeGroupType.
 * "straight" | "L-Shape" | "U-Shape" | "Galley" | "Island" | "manual" | "Backsplash" | "Waterfall"
 */
export const TAKEOFF_SHAPE_TYPE = Object.freeze({
  STRAIGHT: "straight",
  L_SHAPE: "L-Shape",
  U_SHAPE: "U-Shape",
  GALLEY: "Galley",
  ISLAND: "Island",
  BACKSPLASH: "Backsplash",
  WATERFALL: "Waterfall",
  MANUAL: "manual"
});

/**
 * Create a minimal valid TakeoffRun.
 *
 * @param {Partial<TakeoffRun>} overrides
 * @returns {TakeoffRun}
 *
 * @typedef {Object} TakeoffRun
 * @property {string} id
 * @property {string} label
 * @property {number} lengthIn
 * @property {number} depthIn
 * @property {"rect"|"tri"} [shape]
 * @property {"counter"|"splash"|"fhb"} [pieceType]
 * @property {number} [exposedEndOverhangIn]
 * @property {number[]} [sourcePages]
 * @property {string[]} [notes]
 * — Evidence trace fields (v6.0, optional — backward compatible) —
 * @property {string} [lengthEvidenceId]     id of the evidence dimension used for this run's length
 * @property {string} [depthEvidenceId]      id of the evidence dimension used for this run's depth
 * @property {string[]} [evidenceIds]        all evidence dim ids that contributed to this run
 * @property {number[]} [evidenceSourcePages] pages where evidence supporting this run appeared
 * @property {string} [assemblyNotes]        model's explanation of how evidence was assembled
 * @property {"high"|"medium"|"low"} [assemblyConfidence]  model's confidence in the assembly
 * @property {boolean} [requiresEstimatorReview]  true when model flagged conflicting or unclear evidence
 */
export function makeTakeoffRun(overrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID?.() ?? `run-${Math.random().toString(36).slice(2, 9)}`,
    label: overrides.label ?? "Run",
    lengthIn: Number(overrides.lengthIn) || 0,
    depthIn: Number(overrides.depthIn) || 0,
    shape: overrides.shape ?? "rect",
    pieceType: overrides.pieceType ?? "counter",
    ...(overrides.exposedEndOverhangIn != null && { exposedEndOverhangIn: Number(overrides.exposedEndOverhangIn) }),
    ...(overrides.sourcePages != null && { sourcePages: overrides.sourcePages }),
    ...(overrides.notes != null && { notes: overrides.notes }),
    // Evidence trace fields — optional, populated by AI model (v6.0)
    ...(overrides.lengthEvidenceId      != null && { lengthEvidenceId: String(overrides.lengthEvidenceId) }),
    ...(overrides.depthEvidenceId       != null && { depthEvidenceId: String(overrides.depthEvidenceId) }),
    ...(overrides.evidenceIds           != null && { evidenceIds: overrides.evidenceIds }),
    ...(overrides.evidenceSourcePages   != null && { evidenceSourcePages: overrides.evidenceSourcePages }),
    ...(overrides.assemblyNotes         != null && { assemblyNotes: String(overrides.assemblyNotes) }),
    ...(overrides.assemblyConfidence    != null && { assemblyConfidence: overrides.assemblyConfidence }),
    ...(overrides.requiresEstimatorReview != null && { requiresEstimatorReview: Boolean(overrides.requiresEstimatorReview) }),
  };
}

/**
 * Create a minimal valid TakeoffArea.
 *
 * @param {Partial<TakeoffArea>} overrides
 * @returns {TakeoffArea}
 *
 * @typedef {Object} TakeoffArea
 * @property {string} id
 * @property {string} label
 * @property {"countertop"|"backsplash"|"fhb"|"peninsula"|"island"} [areaType]
 * @property {TakeoffRun[]} runs
 * @property {boolean} [backsplashIncluded]
 * @property {number} [backsplashHeightIn]
 * @property {number} [backsplashLinearIn]
 * @property {number} [backsplashManualSf]
 *   Estimator-entered direct square-footage override for backsplash (v6.3).
 *   When set, overrides the linear×height calculation.
 *   When backsplashScope is "no_stone" or "tile_by_others", this value is ignored by the calc.
 * @property {"no_stone"|"standard"|"full_height"|"tile_by_others"|"needs_review"} [backsplashScope]
 *   Estimator-selected backsplash scope (v6.3).
 *   "no_stone" and "tile_by_others" force computed backsplash to 0 regardless of other fields.
 * @property {string} [backsplashReviewNote]
 *   Free-text reviewer note for the backsplash decision (v6.3).
 * @property {"none"|"L-Shape"|"U-Shape"|"auto"} [overlapMode]
 * @property {Array<{depthA_in:number,depthB_in:number,sfDeducted?:number}>} [cornerDeductions]
 * @property {Array<{label:string,lengthIn?:number,depthIn?:number,sfExcluded?:number}>} [exclusions]
 *   exclusions[] is for TRUE missing-material areas only (e.g. a window or missing slab section).
 *   Sink/cooktop/faucet cutouts MUST NOT be placed here — they are fabrication add-ons.
 * @property {Array<{type:string,label:string,confidence?:string,notes?:string[]}>} [cutouts]
 *   cutouts[] is for sink/cooktop/faucet openings that are fabrication operations, NOT material deductions.
 *   Presence in this array does NOT affect square footage calculations.
 * @property {string[]} [notes]
 * @property {string[]} [assumptions]
 * @property {number[]} [sourcePages]
 * @property {number} [aiProvidedSf]
 */
export function makeTakeoffArea(overrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID?.() ?? `area-${Math.random().toString(36).slice(2, 9)}`,
    label: overrides.label ?? "Area",
    areaType: overrides.areaType ?? "countertop",
    runs: overrides.runs ?? [],
    ...(overrides.backsplashIncluded != null && { backsplashIncluded: Boolean(overrides.backsplashIncluded) }),
    ...(overrides.backsplashHeightIn != null && { backsplashHeightIn: Number(overrides.backsplashHeightIn) }),
    ...(overrides.backsplashLinearIn != null && { backsplashLinearIn: Number(overrides.backsplashLinearIn) }),
    ...(overrides.backsplashManualSf  != null && { backsplashManualSf:  Number(overrides.backsplashManualSf) }),
    ...(overrides.backsplashScope     != null && { backsplashScope:     String(overrides.backsplashScope) }),
    ...(overrides.backsplashReviewNote != null && { backsplashReviewNote: String(overrides.backsplashReviewNote) }),
    ...(overrides.overlapMode != null && { overlapMode: overrides.overlapMode }),
    ...(overrides.cornerDeductions != null && { cornerDeductions: overrides.cornerDeductions }),
    ...(overrides.exclusions != null && { exclusions: overrides.exclusions }),
    ...(overrides.cutouts   != null && { cutouts:    overrides.cutouts }),
    ...(overrides.notes     != null && { notes:      overrides.notes }),
    ...(overrides.assumptions != null && { assumptions: overrides.assumptions }),
    ...(overrides.sourcePages != null && { sourcePages: overrides.sourcePages }),
    ...(overrides.aiProvidedSf != null && { aiProvidedSf: Number(overrides.aiProvidedSf) })
  };
}

/**
 * Create a minimal valid TakeoffRoom.
 *
 * @param {Partial<TakeoffRoom>} overrides
 * @returns {TakeoffRoom}
 *
 * @typedef {Object} TakeoffRoom
 * @property {string} id
 * @property {string} name
 * @property {string} [roomType]
 * @property {TakeoffArea[]} areas
 * @property {string[]} [notes]
 * @property {string[]} [assumptions]
 * @property {TakeoffDiagnostic[]} [warnings]
 * @property {number[]} [sourcePages]
 * @property {"high"|"medium"|"low"} [confidence]
 */
export function makeTakeoffRoom(overrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID?.() ?? `room-${Math.random().toString(36).slice(2, 9)}`,
    name: overrides.name ?? "",
    areas: overrides.areas ?? [],
    ...(overrides.roomType != null && { roomType: overrides.roomType }),
    ...(overrides.notes != null && { notes: overrides.notes }),
    ...(overrides.assumptions != null && { assumptions: overrides.assumptions }),
    ...(overrides.warnings != null && { warnings: overrides.warnings }),
    ...(overrides.sourcePages != null && { sourcePages: overrides.sourcePages }),
    ...(overrides.confidence != null && { confidence: overrides.confidence })
  };
}

/**
 * Create a TakeoffResult — the top-level contract object.
 *
 * @param {Partial<TakeoffResult>} overrides
 * @returns {TakeoffResult}
 *
 * @typedef {Object} TakeoffResult
 * @property {string} schemaVersion
 * @property {string} id
 * @property {"draft"|"reviewed"|"approved"|"rejected"} status
 * @property {TakeoffRoom[]} rooms
 * @property {string} [organizationId]
 * @property {{fileName?:string,fileType?:string,pageCount?:number,sourceHash?:string}} [source]
 * @property {string} [createdAt]
 * @property {"high"|"medium"|"low"} [confidence]
 * @property {string[]} [projectAssumptions]
 * @property {TakeoffDiagnostic[]} [warnings]
 * @property {{countertopExactSf?:number,backsplashExactSf?:number,combinedExactSf?:number}} [aiProvidedTotals]
 *
 * @typedef {Object} TakeoffDiagnostic
 * @property {"info"|"warning"|"error"} level
 * @property {string} code
 * @property {string} message
 * @property {string} [path]
 * @property {number[]} [sourcePages]
 */
export function makeTakeoffResult(overrides = {}) {
  return {
    schemaVersion: TAKEOFF_SCHEMA_VERSION,
    id: overrides.id ?? crypto.randomUUID?.() ?? `takeoff-${Math.random().toString(36).slice(2, 9)}`,
    status: overrides.status ?? TAKEOFF_STATUS.DRAFT,
    rooms: overrides.rooms ?? [],
    ...(overrides.organizationId != null && { organizationId: overrides.organizationId }),
    ...(overrides.source != null && { source: overrides.source }),
    ...(overrides.createdAt != null && { createdAt: overrides.createdAt }),
    ...(overrides.confidence != null && { confidence: overrides.confidence }),
    ...(overrides.projectAssumptions != null && { projectAssumptions: overrides.projectAssumptions }),
    ...(overrides.warnings != null && { warnings: overrides.warnings }),
    ...(overrides.aiProvidedTotals != null && { aiProvidedTotals: overrides.aiProvidedTotals })
  };
}
