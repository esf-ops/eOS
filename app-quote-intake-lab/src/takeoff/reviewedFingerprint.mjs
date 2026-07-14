/**
 * Deterministic reviewed-projection fingerprints + material-change detection (Phase 4B.3.1).
 */

import { CORRECTION_OP, PIECE_REVIEW_STATUS } from "./correctionTypes.mjs";

const MATERIAL_OPS = new Set([
  CORRECTION_OP.EDIT_PIECE,
  CORRECTION_OP.REASSIGN_PIECE,
  CORRECTION_OP.EXCLUDE_PIECE,
  CORRECTION_OP.RESTORE_PIECE,
  CORRECTION_OP.ADD_PIECE,
  CORRECTION_OP.ADD_ROOM,
  CORRECTION_OP.RENAME_ROOM,
  CORRECTION_OP.EDIT_BACKSPLASH,
  CORRECTION_OP.SET_SINK_COUNT
]);

/**
 * Stable fingerprint of the reviewed projection used for acceptance idempotency.
 *
 * @param {{
 *   sourceRunId: string,
 *   sourceAttachmentHash: string,
 *   acceptedIntakeSnapshotId: string,
 *   projection: object,
 *   operations?: object[]
 * }} input
 */
export function computeReviewedFingerprint(input) {
  const projection = input.projection ?? {};
  const calc = projection.calculation ?? {};
  const payload = {
    sourceRunId: input.sourceRunId,
    sourceAttachmentHash: String(input.sourceAttachmentHash ?? "").toLowerCase(),
    acceptedIntakeSnapshotId: input.acceptedIntakeSnapshotId ?? null,
    rooms: normalizeRooms(projection.rooms ?? []),
    excludedPieceIds: (projection.excludedPieces ?? []).map((p) => p.id).sort(),
    addedPieceIds: [...(projection.addedPieceIds ?? [])].sort(),
    sinkCount: Number(projection.sinkCount ?? calc.sinkCutoutCount ?? 0),
    warningResolutions: normalizeResolutions(projection.warningResolutions ?? {}),
    finalTotals: {
      measuredCountertopSf: num(calc.measuredCountertopSf),
      measuredBacksplashSf: num(calc.measuredBacksplashSf),
      measuredFhbSf: num(calc.measuredFhbSf),
      measuredCombinedSf: num(calc.measuredCombinedSf)
    },
    // Include material ops only (confirm/ack noise does not change identity)
    materialOps: summarizeMaterialOps(input.operations ?? [])
  };
  return hashPayload(payload);
}

/**
 * True when human ops materially changed reviewed geometry/scope/totals vs provider run.
 * Confirm / acknowledge / mark-reviewed alone are review-only (not material corrections).
 */
export function hasMaterialCorrections(sourceRun, draft, projection) {
  const ops = draft?.operations ?? [];
  for (const op of ops) {
    if (!MATERIAL_OPS.has(op.type)) continue;
    if (op.type === CORRECTION_OP.SET_SINK_COUNT) {
      if (Number(op.sinkCount) !== Number(sourceRun?.calculation?.sinkCutoutCount ?? 0)) return true;
      continue;
    }
    return true;
  }

  if ((projection?.excludedPieces ?? []).length > 0) return true;
  if ((projection?.addedPieceIds ?? []).length > 0) return true;

  const orig = Number(sourceRun?.calculation?.measuredCombinedSf ?? 0);
  const reviewed = Number(projection?.calculation?.measuredCombinedSf ?? 0);
  if (Math.abs(orig - reviewed) > 0.001) return true;

  const origSink = Number(sourceRun?.calculation?.sinkCutoutCount ?? 0);
  const reviewedSink = Number(projection?.sinkCount ?? 0);
  if (origSink !== reviewedSink) return true;

  for (const status of Object.values(projection?.pieceStatus ?? {})) {
    if (
      status === PIECE_REVIEW_STATUS.CORRECTED ||
      status === PIECE_REVIEW_STATUS.ADDED ||
      status === PIECE_REVIEW_STATUS.EXCLUDED
    ) {
      return true;
    }
  }
  return false;
}

function normalizeRooms(rooms) {
  return [...rooms]
    .map((room) => ({
      id: room.id,
      name: room.name,
      areaMeta: normalizeAreaMeta(room.areaMeta),
      pieces: [...(room.pieces ?? [])]
        .map((p) => ({
          id: p.id,
          label: p.label,
          measurement: {
            lengthIn: p.measurement?.lengthIn ?? null,
            depthIn: p.measurement?.depthIn ?? null,
            shape: p.measurement?.shape ?? null,
            pieceType: p.measurement?.pieceType ?? null,
            measuredSf: num(p.measurement?.measuredSf),
            directSf: p.measurement?.directSf ?? null,
            directSfReason: p.measurement?.directSfReason ?? null
          }
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function normalizeAreaMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  return {
    backsplashScope: meta.backsplashScope ?? null,
    backsplashLinearIn: meta.backsplashLinearIn ?? null,
    backsplashHeightIn: meta.backsplashHeightIn ?? null,
    backsplashManualSf: meta.backsplashManualSf ?? null
  };
}

function normalizeResolutions(map) {
  return Object.keys(map)
    .sort()
    .map((k) => ({
      key: k,
      resolutionKind: map[k]?.resolutionKind ?? null,
      note: map[k]?.note ?? null
    }));
}

function summarizeMaterialOps(ops) {
  return ops
    .filter((op) => MATERIAL_OPS.has(op.type))
    .map((op) => ({
      type: op.type,
      pieceId: op.pieceId ?? null,
      roomId: op.roomId ?? null,
      sinkCount: op.sinkCount ?? null,
      patch: op.patch ?? null,
      piece: op.piece
        ? {
            id: op.piece.id,
            measurement: op.piece.measurement ?? null,
            label: op.piece.label ?? null
          }
        : null,
      name: op.name ?? null
    }));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function hashPayload(payload) {
  const raw = JSON.stringify(payload);
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `qil-fp-${(h >>> 0).toString(16).padStart(8, "0")}`;
}
