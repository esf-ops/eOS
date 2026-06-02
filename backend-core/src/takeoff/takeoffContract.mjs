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
    ...(overrides.notes != null && { notes: overrides.notes })
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
