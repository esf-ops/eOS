/**
 * Pure reviewed projection: clone source run rooms + apply correction ops.
 * Never mutates the source TakeoffRun.
 */

import { applyDeterministicMeasurements, sfFromRun } from "./labMeasurementCalc.mjs";
import {
  CORRECTION_OP,
  PIECE_REVIEW_STATUS,
  SUPPORTED_CORRECTION_SHAPES,
  SUPPORTED_PIECE_TYPES
} from "./correctionTypes.mjs";

/**
 * @param {object} sourceRun
 * @param {object} draft
 * @param {{ statedSquareFootage?: number|null }} [opts]
 */
export function buildReviewedProjection(sourceRun, draft, opts = {}) {
  const ops = Array.isArray(draft?.operations) ? draft.operations : [];
  const base = cloneRooms(sourceRun?.rooms ?? []);
  const state = {
    rooms: base,
    excludedPieceIds: new Set(),
    pieceStatus: /** @type {Record<string,string>} */ ({}),
    roomReviewed: /** @type {Record<string,boolean>} */ ({}),
    roomNames: /** @type {Record<string,string>} */ ({}),
    sinkCount: sourceRun?.calculation?.sinkCutoutCount ?? 0,
    sinkConfirmed: false,
    sinkNote: null,
    warningResolutions: /** @type {Record<string, any>} */ ({}),
    evidenceStates: /** @type {Record<string, any>} */ ({}),
    addedPieceIds: new Set()
  };

  for (const room of state.rooms) {
    for (const p of room.pieces ?? []) {
      state.pieceStatus[p.id] = PIECE_REVIEW_STATUS.UNREVIEWED;
    }
  }

  for (const op of ops) {
    applyOp(state, op);
  }

  // Apply room renames
  for (const room of state.rooms) {
    if (state.roomNames[room.id]) room.name = state.roomNames[room.id];
  }

  // Filter excluded pieces into projection (kept only as metadata list)
  const excludedPieces = [];
  for (const room of state.rooms) {
    const kept = [];
    for (const p of room.pieces ?? []) {
      if (state.excludedPieceIds.has(p.id)) {
        excludedPieces.push({ ...clone(p), roomId: room.id, reviewStatus: PIECE_REVIEW_STATUS.EXCLUDED });
      } else {
        kept.push({
          ...p,
          reviewStatus: state.pieceStatus[p.id] ?? PIECE_REVIEW_STATUS.UNREVIEWED
        });
      }
    }
    room.pieces = kept;
  }

  const providerTotals = {
    providerProposedCountertopSf: sourceRun?.calculation?.providerProposedCountertopSf ?? null,
    providerProposedBacksplashSf: sourceRun?.calculation?.providerProposedBacksplashSf ?? null,
    providerProposedCombinedSf: sourceRun?.calculation?.providerProposedCombinedSf ?? null
  };

  const { rooms: measuredRooms, calculation } = applyReviewedDeterministicMeasurements(
    state.rooms,
    providerTotals,
    {
      statedSquareFootage: opts.statedSquareFootage ?? null,
      originalMeasuredCombinedSf: sourceRun?.calculation?.measuredCombinedSf ?? null,
      sinkCutoutCountOverride: state.sinkCount
    }
  );

  return {
    rooms: measuredRooms,
    excludedPieces,
    calculation,
    pieceStatus: { ...state.pieceStatus },
    roomReviewed: { ...state.roomReviewed },
    sinkCount: state.sinkCount,
    sinkConfirmed: state.sinkConfirmed,
    sinkNote: state.sinkNote,
    warningResolutions: { ...state.warningResolutions },
    evidenceStates: { ...state.evidenceStates },
    addedPieceIds: [...state.addedPieceIds]
  };
}

/**
 * Deterministic measurements with estimator direct-SF exceptions.
 */
export function applyReviewedDeterministicMeasurements(rooms, providerTotals = {}, opts = {}) {
  const working = clone(rooms);

  // Geometry pieces → existing bridge; directSf pieces get length/depth cleared for calc then patched.
  const geometryRooms = working.map((room) => ({
    ...room,
    pieces: (room.pieces ?? []).map((p) => {
      if (p.measurement?.directSf != null && Number(p.measurement.directSf) >= 0) {
        return {
          ...p,
          measurement: {
            ...p.measurement,
            lengthIn: null,
            depthIn: null,
            measuredSf: 0
          }
        };
      }
      return p;
    }),
    areaMeta: {
      ...(room.areaMeta ?? {}),
      ...(room.areaMeta?.backsplashManualSf != null
        ? { backsplashManualSf: room.areaMeta.backsplashManualSf }
        : {})
    }
  }));

  const { rooms: calcRooms, calculation } = applyDeterministicMeasurements(geometryRooms, providerTotals);

  // Patch direct SF onto pieces and add into totals by piece type.
  let extraCt = 0;
  let extraSplash = 0;
  let extraFhb = 0;
  const nextRooms = calcRooms.map((room, idx) => {
    const srcRoom = working[idx];
    const pieces = (room.pieces ?? []).map((p, pIdx) => {
      const src = srcRoom.pieces?.[pIdx];
      const direct = src?.measurement?.directSf;
      if (direct != null && Number.isFinite(Number(direct)) && Number(direct) >= 0) {
        const sf = Math.round(Number(direct) * 100) / 100;
        const type = src.measurement?.pieceType ?? "counter";
        if (type === "splash") extraSplash += sf;
        else if (type === "fhb") extraFhb += sf;
        else extraCt += sf;
        return {
          ...p,
          measurement: {
            ...src.measurement,
            measuredSf: sf,
            provenance: "estimator_entered",
            directSf: sf,
            directSfReason: src.measurement.directSfReason ?? src.notes?.[0] ?? null
          },
          notes: src.notes ?? p.notes,
          reviewStatus: src.reviewStatus ?? p.reviewStatus
        };
      }
      return { ...p, reviewStatus: src?.reviewStatus ?? p.reviewStatus };
    });

    // Room CT = geometry CT pieces + direct CT pieces
    const roomCt = pieces
      .filter((p) => (p.measurement?.pieceType ?? "counter") === "counter")
      .reduce((n, p) => n + Number(p.measurement?.measuredSf ?? 0), 0);
    const roomSplash = pieces
      .filter((p) => p.measurement?.pieceType === "splash")
      .reduce((n, p) => n + Number(p.measurement?.measuredSf ?? 0), 0);

    return {
      ...room,
      pieces,
      areaMeta: srcRoom.areaMeta ?? room.areaMeta,
      measuredCountertopSf: Math.round(roomCt * 100) / 100,
      measuredBacksplashSf: Math.round((Number(room.measuredBacksplashSf ?? 0) + roomSplash) * 100) / 100
    };
  });

  const measuredCountertopSf =
    Math.round((Number(calculation.measuredCountertopSf ?? 0) + extraCt) * 100) / 100;
  const measuredBacksplashSf =
    Math.round((Number(calculation.measuredBacksplashSf ?? 0) + extraSplash) * 100) / 100;
  const measuredFhbSf = Math.round((Number(calculation.measuredFhbSf ?? 0) + extraFhb) * 100) / 100;
  const measuredCombinedSf =
    Math.round((measuredCountertopSf + measuredBacksplashSf + measuredFhbSf) * 100) / 100;

  const sinkCutoutCount =
    opts.sinkCutoutCountOverride != null
      ? Number(opts.sinkCutoutCountOverride)
      : calculation.sinkCutoutCount;

  const stated = opts.statedSquareFootage ?? null;
  const originalMeasured = opts.originalMeasuredCombinedSf ?? null;

  const outCalc = {
    ...calculation,
    measuredCountertopSf,
    measuredBacksplashSf,
    measuredFhbSf,
    measuredCombinedSf,
    sinkCutoutCount,
    statedSquareFootage: stated,
    statedVersusReviewedVarianceSf:
      stated == null ? null : Math.round((measuredCombinedSf - Number(stated)) * 100) / 100,
    originalDeterministicCombinedSf: originalMeasured,
    originalVersusReviewedVarianceSf:
      originalMeasured == null
        ? null
        : Math.round((measuredCombinedSf - Number(originalMeasured)) * 100) / 100,
    providerVersusReviewedVarianceSf:
      calculation.providerProposedCombinedSf == null
        ? null
        : Math.round((Number(calculation.providerProposedCombinedSf) - measuredCombinedSf) * 100) /
          100,
    authorityNote:
      "Reviewed SF uses eliteOS deterministic calc plus explicitly labeled estimator direct-SF exceptions."
  };

  return { rooms: nextRooms, calculation: outCalc };
}

function applyOp(state, op) {
  if (!op || !op.type) return;
  switch (op.type) {
    case CORRECTION_OP.CONFIRM_PIECE: {
      if (!state.excludedPieceIds.has(op.pieceId)) {
        state.pieceStatus[op.pieceId] = PIECE_REVIEW_STATUS.CONFIRMED;
      }
      break;
    }
    case CORRECTION_OP.EDIT_PIECE: {
      const piece = findPiece(state.rooms, op.pieceId);
      if (!piece) break;
      const m = { ...piece.measurement };
      if (op.patch?.lengthIn !== undefined) m.lengthIn = op.patch.lengthIn;
      if (op.patch?.depthIn !== undefined) m.depthIn = op.patch.depthIn;
      if (op.patch?.shape !== undefined) {
        if (SUPPORTED_CORRECTION_SHAPES.includes(op.patch.shape)) m.shape = op.patch.shape;
      }
      if (op.patch?.pieceType !== undefined) {
        if (SUPPORTED_PIECE_TYPES.includes(op.patch.pieceType)) m.pieceType = op.patch.pieceType;
      }
      if (op.patch?.directSf !== undefined) {
        m.directSf = op.patch.directSf;
        m.directSfReason = op.patch.directSfReason ?? op.note ?? null;
        m.provenance = "estimator_entered";
        m.lengthIn = null;
        m.depthIn = null;
      }
      if (op.patch?.clearDirectSf) {
        delete m.directSf;
        delete m.directSfReason;
        delete m.provenance;
      }
      piece.measurement = m;
      if (op.patch?.label) piece.label = op.patch.label;
      if (op.note) piece.notes = [...(piece.notes ?? []), op.note];
      state.pieceStatus[op.pieceId] = state.addedPieceIds.has(op.pieceId)
        ? PIECE_REVIEW_STATUS.ADDED
        : PIECE_REVIEW_STATUS.CORRECTED;
      break;
    }
    case CORRECTION_OP.REASSIGN_PIECE: {
      const moved = removePiece(state.rooms, op.pieceId);
      if (!moved || !op.roomId) break;
      const room = state.rooms.find((r) => r.id === op.roomId);
      if (!room) break;
      moved.roomId = op.roomId;
      room.pieces = [...(room.pieces ?? []), moved];
      state.pieceStatus[op.pieceId] = state.addedPieceIds.has(op.pieceId)
        ? PIECE_REVIEW_STATUS.ADDED
        : PIECE_REVIEW_STATUS.CORRECTED;
      break;
    }
    case CORRECTION_OP.EXCLUDE_PIECE: {
      state.excludedPieceIds.add(op.pieceId);
      state.pieceStatus[op.pieceId] = PIECE_REVIEW_STATUS.EXCLUDED;
      break;
    }
    case CORRECTION_OP.RESTORE_PIECE: {
      state.excludedPieceIds.delete(op.pieceId);
      state.pieceStatus[op.pieceId] = PIECE_REVIEW_STATUS.UNREVIEWED;
      break;
    }
    case CORRECTION_OP.ADD_PIECE: {
      const room = state.rooms.find((r) => r.id === op.roomId) ?? state.rooms[0];
      if (!room) break;
      const piece = op.piece;
      if (!piece?.id) break;
      if (piece.measurement?.directSf != null) {
        if (!piece.measurement.directSfReason && !op.note) {
          // invalid — skip adding until reason provided
          break;
        }
        piece.measurement.provenance = "estimator_entered";
        piece.measurement.directSfReason =
          piece.measurement.directSfReason ?? op.note;
      }
      room.pieces = [...(room.pieces ?? []), clone(piece)];
      state.addedPieceIds.add(piece.id);
      state.pieceStatus[piece.id] = PIECE_REVIEW_STATUS.ADDED;
      break;
    }
    case CORRECTION_OP.ADD_ROOM: {
      if (!op.room?.id) break;
      if (state.rooms.some((r) => r.id === op.room.id)) break;
      state.rooms.push({
        id: op.room.id,
        name: op.room.name ?? "New room",
        roomType: op.room.roomType ?? "other",
        confidence: "medium",
        pieces: [],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: op.room.areaMeta ?? {}
      });
      break;
    }
    case CORRECTION_OP.RENAME_ROOM: {
      if (op.roomId && op.name) state.roomNames[op.roomId] = op.name;
      break;
    }
    case CORRECTION_OP.MARK_ROOM_REVIEWED: {
      if (op.roomId) state.roomReviewed[op.roomId] = true;
      break;
    }
    case CORRECTION_OP.EDIT_BACKSPLASH: {
      const room = state.rooms.find((r) => r.id === op.roomId);
      if (!room) break;
      const meta = { ...(room.areaMeta ?? {}) };
      if (op.patch?.backsplashLinearIn !== undefined) meta.backsplashLinearIn = op.patch.backsplashLinearIn;
      if (op.patch?.backsplashHeightIn !== undefined) meta.backsplashHeightIn = op.patch.backsplashHeightIn;
      if (op.patch?.backsplashScope !== undefined) meta.backsplashScope = op.patch.backsplashScope;
      if (op.patch?.backsplashManualSf !== undefined) {
        meta.backsplashManualSf = op.patch.backsplashManualSf;
        meta.backsplashManualSfReason = op.patch.reason ?? op.note ?? null;
      }
      if (op.patch?.exclude) {
        meta.backsplashScope = "no_stone";
        meta.backsplashLinearIn = 0;
        meta.backsplashManualSf = 0;
      }
      room.areaMeta = meta;
      break;
    }
    case CORRECTION_OP.SET_SINK_COUNT: {
      state.sinkCount = Number(op.sinkCount ?? 0);
      state.sinkConfirmed = false;
      state.sinkNote = op.note ?? null;
      break;
    }
    case CORRECTION_OP.CONFIRM_SINK_COUNT: {
      if (op.sinkCount != null) state.sinkCount = Number(op.sinkCount);
      state.sinkConfirmed = true;
      state.sinkNote = op.note ?? state.sinkNote;
      break;
    }
    case CORRECTION_OP.CONFIRM_EVIDENCE: {
      if (op.evidenceId) {
        state.evidenceStates[op.evidenceId] = {
          state: "confirmed",
          note: op.note ?? null
        };
      }
      break;
    }
    case CORRECTION_OP.MARK_EVIDENCE_UNSUPPORTED: {
      if (op.evidenceId) {
        state.evidenceStates[op.evidenceId] = {
          state: "unsupported",
          note: op.note ?? null
        };
      }
      break;
    }
    case CORRECTION_OP.ADD_EVIDENCE_NOTE: {
      if (op.evidenceId) {
        state.evidenceStates[op.evidenceId] = {
          ...(state.evidenceStates[op.evidenceId] ?? {}),
          note: op.note ?? null
        };
      }
      break;
    }
    case CORRECTION_OP.RESOLVE_WARNING: {
      if (!op.warningKey) break;
      // Blocking warnings cannot be blanket-dismissed.
      if (op.severity === "approval_blocking" && op.resolutionKind === "dismiss") {
        break;
      }
      state.warningResolutions[op.warningKey] = {
        severity: op.severity,
        resolutionKind: op.resolutionKind ?? "acknowledged",
        note: op.note ?? null,
        at: op.at ?? null,
        actorLabel: op.actorLabel ?? null
      };
      break;
    }
    case CORRECTION_OP.RESET_PIECE: {
      // Reset means restore from source — handled by draft recreate for simplicity;
      // here we clear exclusion and mark unreviewed if not added.
      if (state.addedPieceIds.has(op.pieceId)) break;
      state.excludedPieceIds.delete(op.pieceId);
      state.pieceStatus[op.pieceId] = PIECE_REVIEW_STATUS.UNREVIEWED;
      break;
    }
    case CORRECTION_OP.REOPEN_SINK_CONFIRMATION: {
      state.sinkConfirmed = false;
      break;
    }
    case CORRECTION_OP.REOPEN_ROOM_REVIEW: {
      if (op.roomId) state.roomReviewed[op.roomId] = false;
      break;
    }
    case CORRECTION_OP.REOPEN_WARNING_RESOLUTION: {
      if (op.warningKey) delete state.warningResolutions[op.warningKey];
      break;
    }
    default:
      break;
  }
}

function cloneRooms(rooms) {
  return clone(rooms ?? []);
}

function clone(v) {
  return JSON.parse(JSON.stringify(v ?? null));
}

function findPiece(rooms, pieceId) {
  for (const room of rooms) {
    const p = (room.pieces ?? []).find((x) => x.id === pieceId);
    if (p) return p;
  }
  return null;
}

function removePiece(rooms, pieceId) {
  for (const room of rooms) {
    const idx = (room.pieces ?? []).findIndex((x) => x.id === pieceId);
    if (idx >= 0) {
      const [p] = room.pieces.splice(idx, 1);
      return p;
    }
  }
  return null;
}

/** Preview a single piece SF from dims (lab UI helper). */
export function previewPieceSf(lengthIn, depthIn, shape = "rect") {
  if (lengthIn == null || depthIn == null) return null;
  if (!Number.isFinite(Number(lengthIn)) || !Number.isFinite(Number(depthIn))) return null;
  if (Number(lengthIn) <= 0 || Number(depthIn) <= 0) return null;
  return sfFromRun(Number(lengthIn), Number(depthIn), shape);
}
