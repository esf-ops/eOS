import {
  CONFIDENCE_LEVELS,
  LAB_TAKEOFF_STATUS,
  PIECE_TYPES,
  RUN_SHAPES,
  TAKEOFF_WARNING_SEVERITY
} from "./takeoffTypes.mjs";
import { isLabTakeoffStatus } from "./takeoffStates.mjs";

const VARIANCE_TOLERANCE_SF = 0.5;

/**
 * Validate a lab TakeoffRun (post-calc). Pure — no I/O.
 * @param {import("./takeoffTypes.mjs").TakeoffRun} run
 * @returns {{ ok: boolean, warnings: import("./takeoffTypes.mjs").TakeoffWarning[], labTakeoffStatus: string }}
 */
export function validateLabTakeoffRun(run) {
  /** @type {import("./takeoffTypes.mjs").TakeoffWarning[]} */
  const warnings = [...(run.warnings ?? [])];
  const ids = new Set();

  const claimId = (id, ctx) => {
    if (!id) {
      warnings.push(
        warn("MISSING_ID", TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING, `Missing id (${ctx})`, true, true)
      );
      return;
    }
    if (ids.has(id)) {
      warnings.push(
        warn(
          "DUPLICATE_ID",
          TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
          `Duplicate id “${id}” (${ctx})`,
          true,
          true,
          null,
          null,
          "id"
        )
      );
    }
    ids.add(id);
  };

  claimId(run.id, "run");
  for (const page of run.pages ?? []) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
      warnings.push(
        warn(
          "INVALID_PAGE",
          TAKEOFF_WARNING_SEVERITY.ESTIMATOR_REVIEW,
          "Page number must be a positive integer.",
          false,
          true,
          null,
          null,
          "pageNumber"
        )
      );
    }
  }

  const evidenceIds = new Set();
  const providerMode = run.provider?.mode;
  for (const ev of run.evidence ?? []) {
    claimId(ev.id, "evidence");
    evidenceIds.add(ev.id);
    const note = String(ev.simulatedNote ?? "").toLowerCase();
    if (providerMode === "live") {
      if (!note.includes("live") && !note.includes("gemini")) {
        warnings.push(
          warn(
            "EVIDENCE_NOT_LABELED_LIVE",
            TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
            `Evidence ${ev.id} must declare live lab evidence provenance.`,
            true,
            true,
            null,
            null,
            "simulatedNote"
          )
        );
      }
    } else if (!note.includes("simulated")) {
      warnings.push(
        warn(
          "EVIDENCE_NOT_LABELED_SIMULATED",
          TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
          `Evidence ${ev.id} must declare simulated fixture provenance.`,
          true,
          true,
          null,
          null,
          "simulatedNote"
        )
      );
    }
    // Simulated mode must not claim a live plan was read. Live mode may reference Gemini transport.
    if (
      providerMode !== "live" &&
      /gemini|human read|opened the (pdf|file)|ocr|visually inspected/i.test(String(ev.locationNote ?? ""))
    ) {
      warnings.push(
        warn(
          "FORBIDDEN_EVIDENCE_LANGUAGE",
          TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
          `Evidence ${ev.id} uses language implying a real plan was read.`,
          true,
          true
        )
      );
    }
  }

  const pieceIds = new Set();
  let pieceCount = 0;
  for (const room of run.rooms ?? []) {
    claimId(room.id, "room");
    if (room.confidence && !CONFIDENCE_LEVELS.includes(room.confidence)) {
      warnings.push(
        warn(
          "INVALID_CONFIDENCE",
          TAKEOFF_WARNING_SEVERITY.ESTIMATOR_REVIEW,
          `Room ${room.id} has invalid confidence.`,
          false,
          true,
          room.id,
          null,
          "confidence"
        )
      );
    }
    for (const piece of room.pieces ?? []) {
      pieceCount += 1;
      claimId(piece.id, "piece");
      pieceIds.add(piece.id);
      if (piece.roomId !== room.id) {
        warnings.push(
          warn(
            "ROOM_PIECE_MISMATCH",
            TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
            `Piece ${piece.id} roomId does not match parent room.`,
            true,
            true,
            room.id,
            piece.id,
            "roomId"
          )
        );
      }
      const m = piece.measurement ?? {};
      if (!PIECE_TYPES.includes(m.pieceType)) {
        warnings.push(
          warn(
            "UNSUPPORTED_PIECE_TYPE",
            TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
            `Piece ${piece.id} has unsupported pieceType.`,
            true,
            true,
            room.id,
            piece.id,
            "pieceType"
          )
        );
      }
      if (!RUN_SHAPES.includes(m.shape)) {
        warnings.push(
          warn(
            "UNSUPPORTED_SHAPE",
            TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
            `Piece ${piece.id} has unsupported shape.`,
            true,
            true,
            room.id,
            piece.id,
            "shape"
          )
        );
      }
      const missingLen = m.lengthIn == null || !(Number(m.lengthIn) > 0);
      const missingDepth = m.depthIn == null || !(Number(m.depthIn) > 0);
      if (m.pieceType === "counter" && (missingLen || missingDepth)) {
        warnings.push(
          warn(
            "MISSING_DIMENSION",
            TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
            `Piece ${piece.id} is missing a positive length/depth.`,
            true,
            true,
            room.id,
            piece.id,
            missingLen ? "lengthIn" : "depthIn"
          )
        );
      }
      if (Number(m.lengthIn) < 0 || Number(m.depthIn) < 0) {
        warnings.push(
          warn(
            "NON_POSITIVE_DIMENSION",
            TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
            `Piece ${piece.id} has non-positive dimensions.`,
            true,
            true,
            room.id,
            piece.id
          )
        );
      }
      for (const eid of m.evidenceIds ?? []) {
        if (!evidenceIds.has(eid)) {
          warnings.push(
            warn(
              "ORPHAN_EVIDENCE_LINK",
              TAKEOFF_WARNING_SEVERITY.ESTIMATOR_REVIEW,
              `Piece ${piece.id} references unknown evidence ${eid}.`,
              false,
              true,
              room.id,
              piece.id,
              "evidenceIds"
            )
          );
        }
      }
      if (piece.requiresEstimatorReview) {
        warnings.push(
          warn(
            "PIECE_REQUIRES_REVIEW",
            TAKEOFF_WARNING_SEVERITY.ESTIMATOR_REVIEW,
            `Piece ${piece.id} flagged for estimator review.`,
            false,
            true,
            room.id,
            piece.id
          )
        );
      }
    }
  }

  if (pieceCount === 0 && (run.labTakeoffStatus === LAB_TAKEOFF_STATUS.REVIEW || !run.failure)) {
    warnings.push(
      warn(
        "NO_PIECES",
        TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
        "Takeoff run has no countertop pieces.",
        true,
        true
      )
    );
  }

  // Orphan measurements: evidence not linked to any piece
  const linked = new Set();
  for (const room of run.rooms ?? []) {
    for (const piece of room.pieces ?? []) {
      for (const eid of piece.measurement?.evidenceIds ?? []) linked.add(eid);
    }
  }
  for (const ev of run.evidence ?? []) {
    if (!linked.has(ev.id) && String(ev.label ?? "").toLowerCase().includes("dimension")) {
      warnings.push(
        warn(
          "ORPHAN_EVIDENCE",
          TAKEOFF_WARNING_SEVERITY.INFORMATIONAL,
          `Evidence ${ev.id} is not linked to any piece.`,
          false,
          false
        )
      );
    }
  }

  const calc = run.calculation;
  if (calc) {
    for (const banned of ["chargeable", "priced", "sellSquare", "quoteTotal", "pricing"]) {
      if (Object.keys(calc).some((k) => k.toLowerCase().includes(banned.toLowerCase()))) {
        warnings.push(
          warn(
            "PRICING_FIELD_PRESENT",
            TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
            "Calculation summary must not include pricing fields.",
            true,
            true
          )
        );
      }
    }
    if (calc.combinedVarianceSf != null && Math.abs(calc.combinedVarianceSf) > VARIANCE_TOLERANCE_SF) {
      warnings.push(
        warn(
          "PROVIDER_TOTAL_VARIANCE",
          TAKEOFF_WARNING_SEVERITY.ESTIMATOR_REVIEW,
          `Provider-proposed combined SF differs from measured by ${calc.combinedVarianceSf} sf (provider is non-authoritative).`,
          false,
          true,
          null,
          null,
          "providerProposedCombinedSf"
        )
      );
    }
  }

  // Forbidden production identifiers anywhere on the run surface
  const serialized = safeSerialize(run);
  if (/quote_takeoff_|eliteos-quote-files|\/api\/takeoff|import-from-takeoff|quote_headers/i.test(serialized)) {
    warnings.push(
      warn(
        "PRODUCTION_REFERENCE",
        TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
        "Run payload contains forbidden production takeoff/quote references.",
        true,
        true
      )
    );
  }
  if (/takeoff_import_v1|internal_ui\.takeoff_import|quoteLibrary|quote_library/i.test(serialized)) {
    warnings.push(
      warn(
        "IE_OR_LIBRARY_FIELD",
        TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
        "Run payload must not include IE import or Quote Library fields.",
        true,
        true
      )
    );
  }

  if (run.labTakeoffStatus && !isLabTakeoffStatus(run.labTakeoffStatus)) {
    warnings.push(
      warn(
        "INVALID_STATUS",
        TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
        `Unknown lab takeoff status ${run.labTakeoffStatus}.`,
        true,
        true,
        null,
        null,
        "labTakeoffStatus"
      )
    );
  }

  if (run.confidence && !CONFIDENCE_LEVELS.includes(run.confidence)) {
    warnings.push(
      warn(
        "INVALID_CONFIDENCE",
        TAKEOFF_WARNING_SEVERITY.ESTIMATOR_REVIEW,
        "Run confidence is invalid.",
        false,
        true,
        null,
        null,
        "confidence"
      )
    );
  }

  if (providerMode !== "simulated" && providerMode !== "live") {
    warnings.push(
      warn(
        "PROVIDER_MODE_UNSUPPORTED",
        TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
        "provider.mode must be simulated or live.",
        true,
        true
      )
    );
  }

  const blocking = warnings.some((w) => w.blocking || w.severity === TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING);
  const needsManual =
    warnings.some((w) => w.code === "MISSING_DIMENSION" || w.code === "UNSUPPORTED_GEOMETRY") ||
    warnings.some((w) => w.code === "CONFLICTING_DIMENSION") ||
    run.labTakeoffStatus === LAB_TAKEOFF_STATUS.MANUAL_REVIEW;

  let labTakeoffStatus = run.labTakeoffStatus ?? LAB_TAKEOFF_STATUS.REVIEW;
  if (run.failure) labTakeoffStatus = LAB_TAKEOFF_STATUS.FAILED;
  else if (needsManual || (blocking && warnings.some((w) => w.code === "MISSING_DIMENSION"))) {
    labTakeoffStatus = LAB_TAKEOFF_STATUS.MANUAL_REVIEW;
  } else if (!blocking) {
    labTakeoffStatus = LAB_TAKEOFF_STATUS.REVIEW;
  } else {
    labTakeoffStatus = LAB_TAKEOFF_STATUS.MANUAL_REVIEW;
  }

  return {
    ok: !run.failure && warnings.every((w) => w.severity !== TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING || w.code === "MISSING_DIMENSION" || w.code === "UNSUPPORTED_GEOMETRY" || w.code === "CONFLICTING_DIMENSION"),
    warnings: dedupeWarnings(warnings),
    labTakeoffStatus
  };
}

/**
 * @param {string} code
 * @param {string} severity
 * @param {string} message
 * @param {boolean} blocking
 * @param {boolean} estimatorActionRequired
 */
export function warn(
  code,
  severity,
  message,
  blocking,
  estimatorActionRequired,
  roomId = null,
  pieceId = null,
  field = null
) {
  return {
    code,
    severity,
    message,
    roomId,
    pieceId,
    field,
    blocking: Boolean(blocking),
    estimatorActionRequired: Boolean(estimatorActionRequired)
  };
}

function dedupeWarnings(list) {
  const seen = new Set();
  const out = [];
  for (const w of list) {
    const key = `${w.code}|${w.pieceId}|${w.roomId}|${w.field}|${w.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

function safeSerialize(run) {
  try {
    return JSON.stringify(run);
  } catch {
    return "";
  }
}
