/**
 * Quote Intake Lab — TakeoffAdapter domain contract (Phase 4B.0).
 * Lab-owned types. Not production takeoff tables, IE import, or Quote Library.
 */

export const REVIEWED_TAKEOFF_SCHEMA_VERSION = "qil_reviewed_takeoff_v1";

export const PROVIDER_MODE_SIMULATED = "simulated";
export const PROVIDER_NAME_SIMULATED = "SimulatedTakeoffAdapter";
export const PROVIDER_VERSION_SIMULATED = "sim-takeoff-1.0.0";

export const PROVIDER_MODE_LIVE = "live";
export const PROVIDER_NAME_LIVE = "LiveGeminiTakeoffAdapter";
export const PROVIDER_VERSION_LIVE = "live-gemini-takeoff-1.0.0";

export const SUPPORTED_PLAN_MIME_TYPES = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export const TAKEOFF_WARNING_SEVERITY = Object.freeze({
  INFORMATIONAL: "informational",
  ESTIMATOR_REVIEW: "estimator_review",
  APPROVAL_BLOCKING: "approval_blocking"
});

export const LAB_TAKEOFF_STATUS = Object.freeze({
  NOT_STARTED: "qil_takeoff_not_started",
  SIMULATING: "qil_takeoff_simulating",
  REVIEW: "qil_takeoff_review",
  MANUAL_REVIEW: "qil_takeoff_manual_review",
  FAILED: "qil_takeoff_failed"
});

export const CONFIDENCE_LEVELS = Object.freeze(["high", "medium", "low"]);

export const PIECE_TYPES = Object.freeze(["counter", "splash", "fhb"]);
export const RUN_SHAPES = Object.freeze(["rect", "tri"]);

/**
 * @typedef {Object} TakeoffProviderMetadata
 * @property {string} name
 * @property {"simulated"|"live"|"fixture"} mode
 * @property {string} version
 * @property {string} note
 */

/**
 * @typedef {Object} TakeoffAttachment
 * @property {string} attachmentId
 * @property {string} caseId
 * @property {string} filename
 * @property {string} contentType
 * @property {number} sizeBytes
 * @property {string} contentHash
 * @property {"imported_eml"|"manual_paste"|"synthetic_fixture"} source
 * @property {boolean} transmissionAcknowledgmentPlaceholder
 */

/**
 * @typedef {Object} TakeoffRequest
 * @property {string} caseId
 * @property {string} acceptedIntakeSnapshotId
 * @property {"elite_100_candidate"} elite100Decision
 * @property {TakeoffAttachment} attachment
 * @property {string} requestedAt
 * @property {string} actorLabel
 * @property {string} [scenarioId]  Simulated fixture key (4B.0 only)
 */

/**
 * @typedef {Object} TakeoffPage
 * @property {number} pageNumber
 * @property {"plan"|"elevation"|"schedule"|"other"|"unknown"} [role]
 * @property {string[]} [notes]
 */

/**
 * @typedef {Object} TakeoffEvidence
 * @property {string} id
 * @property {number} pageNumber
 * @property {string} label
 * @property {number|string|null} value
 * @property {string|null} [unit]
 * @property {"high"|"medium"|"low"} [confidence]
 * @property {string|null} [locationNote]
 * @property {string} simulatedNote
 */

/**
 * @typedef {Object} TakeoffMeasurement
 * @property {number|null} lengthIn
 * @property {number|null} depthIn
 * @property {"rect"|"tri"} shape
 * @property {"counter"|"splash"|"fhb"} pieceType
 * @property {number} measuredSf
 * @property {string[]} [evidenceIds]
 */

/**
 * @typedef {Object} TakeoffPiece
 * @property {string} id
 * @property {string} label
 * @property {string} roomId
 * @property {string} [areaId]
 * @property {TakeoffMeasurement} measurement
 * @property {Array<{type:string,label?:string,confidence?:string}>} [cutouts]
 * @property {string[]} [notes]
 * @property {boolean} [requiresEstimatorReview]
 * @property {"no_stone"|"standard"|"full_height"|"tile_by_others"|"needs_review"|null} [backsplashScope]
 */

/**
 * @typedef {Object} TakeoffRoom
 * @property {string} id
 * @property {string} name
 * @property {string} [roomType]
 * @property {number[]} [sourcePages]
 * @property {"high"|"medium"|"low"} [confidence]
 * @property {TakeoffPiece[]} pieces
 * @property {number} measuredCountertopSf
 * @property {number} measuredBacksplashSf
 * @property {{backsplashScope?:string,backsplashLinearIn?:number,backsplashHeightIn?:number,cornerDeductions?:Array}} [areaMeta]
 */

/**
 * @typedef {Object} TakeoffWarning
 * @property {string} code
 * @property {"informational"|"estimator_review"|"approval_blocking"} severity
 * @property {string} message
 * @property {string|null} [roomId]
 * @property {string|null} [pieceId]
 * @property {string|null} [field]
 * @property {boolean} blocking
 * @property {boolean} estimatorActionRequired
 */

/**
 * @typedef {Object} TakeoffCorrection
 * @property {string} id
 * @property {string} at
 * @property {string} actorLabel
 * @property {string} path
 * @property {unknown} before
 * @property {unknown} after
 * @property {string|null} [note]
 */

/**
 * @typedef {Object} TakeoffCalculationSummary
 * @property {number} measuredCountertopSf
 * @property {number} measuredBacksplashSf
 * @property {number} measuredFhbSf
 * @property {number} measuredCombinedSf
 * @property {number} sinkCutoutCount
 * @property {number|null} providerProposedCountertopSf
 * @property {number|null} providerProposedBacksplashSf
 * @property {number|null} providerProposedCombinedSf
 * @property {number|null} countertopVarianceSf
 * @property {number|null} backsplashVarianceSf
 * @property {number|null} combinedVarianceSf
 * @property {string} authorityNote
 */

/**
 * @typedef {Object} TakeoffRun
 * @property {string} id
 * @property {string} caseId
 * @property {string} acceptedIntakeSnapshotId
 * @property {string} attachmentId
 * @property {string} attachmentContentHash
 * @property {TakeoffProviderMetadata} provider
 * @property {string} startedAt
 * @property {string|null} completedAt
 * @property {string} labTakeoffStatus
 * @property {"unreviewed"|"corrected"|"accepted"|"superseded"} humanReviewState
 * @property {TakeoffPage[]} pages
 * @property {TakeoffRoom[]} rooms
 * @property {TakeoffEvidence[]} evidence
 * @property {TakeoffWarning[]} warnings
 * @property {TakeoffCorrection[]} corrections
 * @property {TakeoffCalculationSummary} calculation
 * @property {"high"|"medium"|"low"|null} [confidence]
 * @property {{code:string,message:string}|null} [failure]
 * @property {string|null} [acceptedSnapshotId]
 * @property {string} [scenarioId]
 */

/**
 * @typedef {Object} ReviewedTakeoffSnapshot
 * @property {string} id
 * @property {"qil_reviewed_takeoff_v1"} schemaVersion
 * @property {string} caseId
 * @property {string} runId
 * @property {string} acceptedAt
 * @property {string} acceptedBy
 * @property {string} attachmentContentHash
 * @property {TakeoffRoom[]} rooms
 * @property {TakeoffCalculationSummary} calculation
 * @property {TakeoffEvidence[]} evidence
 * @property {TakeoffWarning[]} warnings
 * @property {TakeoffCorrection[]} corrections
 * @property {string} note
 */

/**
 * @typedef {Object} TakeoffAdapter
 * @property {(req: TakeoffRequest) => Promise<{ok:boolean,runId:string,status:string,run?:TakeoffRun}>} run
 * @property {(runId: string) => Promise<TakeoffRun|null>} getRun
 * @property {(caseId: string) => Promise<TakeoffRun[]>} listRuns
 */
