/**
 * AI Takeoff import measurement helpers (v6.2).
 *
 * Pure functions — no pricing math changes; only tracks edits, deltas, and piece actions.
 */

import { sfFromGuidedPiece } from "./measurementEngine";
import type {
  GuidedPiece,
  RoomDraft,
  TakeoffImportOriginalDimensions,
  TakeoffImportSourceMeta,
  TakeoffImportState,
} from "./quoteTypes";

export const DEFAULT_TAKEOFF_MEASUREMENT_DELTA_THRESHOLD_SF = 2;

export type TakeoffMeasurementTotals = {
  countertopSqft: number;
  standardBacksplashSqft: number;
  highBacksplashSqft: number;
  fullHeightBacksplashSqft: number;
  combinedSqft: number;
};

export type TakeoffMeasurementDeltaResult = {
  imported: TakeoffMeasurementTotals;
  current: TakeoffMeasurementTotals;
  delta: TakeoffMeasurementTotals;
  exceedsThreshold: boolean;
  thresholdSf: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pieceSf(piece: GuidedPiece, lengthIn: number, depthIn: number): number {
  return sfFromGuidedPiece(lengthIn, depthIn, piece.shape ?? "rect");
}

function bucketPieceSf(piece: GuidedPiece, sf: number, totals: TakeoffMeasurementTotals) {
  if (piece.pieceType === "fhb") {
    totals.fullHeightBacksplashSqft = round2(totals.fullHeightBacksplashSqft + sf);
  } else if (piece.pieceType === "splash") {
    totals.standardBacksplashSqft = round2(totals.standardBacksplashSqft + sf);
  } else {
    totals.countertopSqft = round2(totals.countertopSqft + sf);
  }
  totals.combinedSqft = round2(
    totals.countertopSqft + totals.standardBacksplashSqft + totals.highBacksplashSqft + totals.fullHeightBacksplashSqft
  );
}

function emptyTotals(): TakeoffMeasurementTotals {
  return {
    countertopSqft: 0,
    standardBacksplashSqft: 0,
    highBacksplashSqft: 0,
    fullHeightBacksplashSqft: 0,
    combinedSqft: 0,
  };
}

function dimsForImportedSnapshot(piece: GuidedPiece): TakeoffImportOriginalDimensions {
  const src = piece.takeoffImportSource;
  if (src?.originalDimensions) return src.originalDimensions;
  return { lengthIn: piece.lengthIn, depthIn: piece.depthIn, shape: piece.shape };
}

function isExcludedImportedPiece(piece: GuidedPiece): boolean {
  const src = piece.takeoffImportSource;
  return Boolean(src?.excludedFromQuote || src?.importState === "imported_excluded");
}

function collectRoomPieces(room: RoomDraft): GuidedPiece[] {
  const groups = room.guidedShapeGroups ?? [];
  if (groups.length) {
    return [...groups.flatMap((g) => g.pieces), ...room.fhbPieces];
  }
  return [...room.guidedPieces, ...room.fhbPieces];
}

/** Walk guided + FHB pieces and sum SF by bucket. */
export function sumTakeoffMeasurementTotalsFromRooms(
  rooms: RoomDraft[],
  mode: "current" | "imported_snapshot"
): TakeoffMeasurementTotals {
  const totals = emptyTotals();
  for (const room of rooms) {
    const pieces = collectRoomPieces(room);
    for (const piece of pieces) {
      if (mode === "current") {
        if (isExcludedImportedPiece(piece)) continue;
        bucketPieceSf(piece, pieceSf(piece, piece.lengthIn, piece.depthIn), totals);
        continue;
      }
      const src = piece.takeoffImportSource;
      if (!src?.importedFromTakeoff) continue;
      if (src.importState === "imported_excluded" || src.excludedFromQuote) continue;
      const dims = dimsForImportedSnapshot(piece);
      bucketPieceSf(piece, pieceSf(piece, dims.lengthIn, dims.depthIn), totals);
    }
  }
  return totals;
}

export function computeTakeoffMeasurementDeltas(
  rooms: RoomDraft[],
  thresholdSf = DEFAULT_TAKEOFF_MEASUREMENT_DELTA_THRESHOLD_SF
): TakeoffMeasurementDeltaResult {
  const imported = sumTakeoffMeasurementTotalsFromRooms(rooms, "imported_snapshot");
  const current = sumTakeoffMeasurementTotalsFromRooms(rooms, "current");
  const delta: TakeoffMeasurementTotals = {
    countertopSqft: round2(current.countertopSqft - imported.countertopSqft),
    standardBacksplashSqft: round2(current.standardBacksplashSqft - imported.standardBacksplashSqft),
    highBacksplashSqft: round2(current.highBacksplashSqft - imported.highBacksplashSqft),
    fullHeightBacksplashSqft: round2(current.fullHeightBacksplashSqft - imported.fullHeightBacksplashSqft),
    combinedSqft: round2(current.combinedSqft - imported.combinedSqft),
  };
  const exceedsThreshold =
    Math.abs(delta.countertopSqft) > thresholdSf ||
    Math.abs(delta.standardBacksplashSqft) > thresholdSf ||
    Math.abs(delta.fullHeightBacksplashSqft) > thresholdSf ||
    Math.abs(delta.combinedSqft) > thresholdSf;
  return { imported, current, delta, exceedsThreshold, thresholdSf };
}

export function ensureTakeoffOriginalDimensions(piece: GuidedPiece): TakeoffImportOriginalDimensions {
  const src = piece.takeoffImportSource;
  if (src?.originalDimensions) return src.originalDimensions;
  return { lengthIn: piece.lengthIn, depthIn: piece.depthIn, shape: piece.shape };
}

export function withTakeoffImportSource(
  piece: GuidedPiece,
  patch: Partial<TakeoffImportSourceMeta>
): GuidedPiece {
  const existing = piece.takeoffImportSource ?? { importedFromTakeoff: true };
  return {
    ...piece,
    takeoffImportSource: { ...existing, ...patch },
  };
}

export function dimensionsMatchOriginal(piece: GuidedPiece): boolean {
  const src = piece.takeoffImportSource;
  if (!src?.importedFromTakeoff) return false;
  const orig = ensureTakeoffOriginalDimensions(piece);
  return (
    round2(orig.lengthIn) === round2(piece.lengthIn) &&
    round2(orig.depthIn) === round2(piece.depthIn) &&
    (orig.shape ?? "rect") === (piece.shape ?? "rect")
  );
}

export function resolveTakeoffImportState(piece: GuidedPiece): TakeoffImportState | null {
  const src = piece.takeoffImportSource;
  if (!src?.importedFromTakeoff) return null;
  if (src.importState) return src.importState;
  if (src.excludedFromQuote) return "imported_excluded";
  if (dimensionsMatchOriginal(piece)) return "imported_unmodified";
  return "imported_edited";
}

export function applyTakeoffPiecePatch(
  piece: GuidedPiece,
  patch: Partial<GuidedPiece>
): GuidedPiece {
  const next: GuidedPiece = { ...piece, ...patch };
  const src = next.takeoffImportSource;
  if (!src?.importedFromTakeoff) return next;

  const orig = ensureTakeoffOriginalDimensions(piece);
  const hasDimChange =
    (patch.lengthIn != null && round2(patch.lengthIn) !== round2(piece.lengthIn)) ||
    (patch.depthIn != null && round2(patch.depthIn) !== round2(piece.depthIn)) ||
    (patch.shape != null && patch.shape !== piece.shape);

  let importState = src.importState ?? resolveTakeoffImportState(piece) ?? "imported_unmodified";
  if (hasDimChange && importState !== "imported_excluded") {
    importState = dimensionsMatchOriginal({ ...next, takeoffImportSource: { ...src, originalDimensions: orig } })
      ? "imported_unmodified"
      : "imported_edited";
  }

  return withTakeoffImportSource(next, {
    originalDimensions: orig,
    importState,
    reviewStatus: importState === "imported_edited" ? "edited" : src.reviewStatus ?? "approved",
  });
}

export function restoreTakeoffOriginalDimensions(piece: GuidedPiece): GuidedPiece {
  const src = piece.takeoffImportSource;
  if (!src?.importedFromTakeoff) return piece;
  const orig = ensureTakeoffOriginalDimensions(piece);
  return withTakeoffImportSource(
    {
      ...piece,
      lengthIn: orig.lengthIn,
      depthIn: orig.depthIn,
      shape: orig.shape ?? piece.shape,
    },
    {
      originalDimensions: orig,
      importState: "imported_unmodified",
      excludedFromQuote: false,
      reviewStatus: src.reviewStatus === "manual_added" ? "manual_added" : "approved",
    }
  );
}

export function excludeImportedPieceFromQuote(piece: GuidedPiece): GuidedPiece {
  const src = piece.takeoffImportSource;
  if (!src?.importedFromTakeoff) return piece;
  const orig = ensureTakeoffOriginalDimensions(piece);
  return withTakeoffImportSource(
    { ...piece, lengthIn: 0, depthIn: 0, addSplash: false },
    {
      originalDimensions: orig,
      importState: "imported_excluded",
      excludedFromQuote: true,
      reviewStatus: "edited",
    }
  );
}

export function convertImportedPieceToManual(piece: GuidedPiece): GuidedPiece {
  const next = { ...piece };
  delete next.takeoffImportSource;
  return next;
}

export function duplicateTakeoffPiece(piece: GuidedPiece, newId: string): GuidedPiece {
  return {
    ...piece,
    id: newId,
    name: `${piece.name} (copy)`,
    takeoffImportSource: piece.takeoffImportSource?.importedFromTakeoff
      ? {
          importedFromTakeoff: true,
          takeoffJobId: piece.takeoffImportSource.takeoffJobId,
          takeoffSnapshotId: piece.takeoffImportSource.takeoffSnapshotId,
          importState: "manually_added_after_import",
          reviewStatus: "manual_added",
        }
      : undefined,
  };
}

export function splitTakeoffPiece(
  piece: GuidedPiece,
  newId: string
): { original: GuidedPiece; split: GuidedPiece } | null {
  const len = Number(piece.lengthIn) || 0;
  if (len < 2) return null;
  const half = round2(len / 2);
  const other = round2(len - half);
  const orig = ensureTakeoffOriginalDimensions(piece);
  const original = applyTakeoffPiecePatch({ ...piece, lengthIn: half, name: `${piece.name} (A)` }, {});
  const split: GuidedPiece = withTakeoffImportSource(
    {
      ...piece,
      id: newId,
      name: `${piece.name} (B)`,
      lengthIn: other,
    },
    {
      importedFromTakeoff: true,
      takeoffJobId: piece.takeoffImportSource?.takeoffJobId,
      takeoffSnapshotId: piece.takeoffImportSource?.takeoffSnapshotId,
      sourcePage: piece.takeoffImportSource?.sourcePage,
      originalDimensions: { lengthIn: other, depthIn: piece.depthIn, shape: piece.shape },
      importState: "manually_added_after_import",
      reviewStatus: "manual_added",
    }
  );
  return {
    original: withTakeoffImportSource(original, { originalDimensions: { ...orig, lengthIn: half } }),
    split,
  };
}

export function createManualPieceAfterImport(piece: GuidedPiece, roomHasTakeoffImport: boolean): GuidedPiece {
  if (!roomHasTakeoffImport) return piece;
  return {
    ...piece,
    takeoffImportSource: {
      importedFromTakeoff: true,
      importState: "manually_added_after_import",
      reviewStatus: "manual_added",
    },
  };
}

export function takeoffImportStateLabel(state?: TakeoffImportState | null): string {
  switch (state) {
    case "imported_unmodified":
      return "Imported";
    case "imported_edited":
      return "Edited after import";
    case "imported_excluded":
      return "Excluded";
    case "manually_added_after_import":
      return "Manual after import";
    default:
      return "Imported";
  }
}

export function roomTakeoffVerificationComplete(room: RoomDraft): boolean {
  const v = room.takeoffImportVerification;
  if (!room.takeoffImportSource?.importedFromTakeoff) return true;
  return Boolean(v?.measurementsVerified && v?.addonsReviewed && v?.notesReviewed);
}

export function roomTakeoffVerificationBadge(room: RoomDraft): "complete" | "partial" | "pending" {
  if (!room.takeoffImportSource?.importedFromTakeoff) return "complete";
  const v = room.takeoffImportVerification ?? {};
  const done = [v.measurementsVerified, v.addonsReviewed, v.notesReviewed].filter(Boolean).length;
  if (done >= 3) return "complete";
  if (done > 0) return "partial";
  return "pending";
}

export function buildTakeoffSourceMetaForImport(params: {
  takeoffJobId: string | null;
  takeoffSnapshotId: string | null;
  sourcePages?: number[];
  sourcePlanName?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  lengthIn: number;
  depthIn: number;
  shape?: GuidedPiece["shape"];
  sourcePage?: number | null;
  reviewStatus?: TakeoffImportSourceMeta["reviewStatus"];
}): TakeoffImportSourceMeta {
  return {
    importedFromTakeoff: true,
    takeoffJobId: params.takeoffJobId,
    takeoffSnapshotId: params.takeoffSnapshotId,
    sourcePages: params.sourcePages,
    sourcePage: params.sourcePage ?? params.sourcePages?.[0] ?? null,
    sourcePlanName: params.sourcePlanName ?? null,
    approvedBy: params.approvedBy ?? null,
    approvedAt: params.approvedAt ?? null,
    reviewStatus: params.reviewStatus ?? "approved",
    importState: "imported_unmodified",
    originalDimensions: {
      lengthIn: params.lengthIn,
      depthIn: params.depthIn,
      shape: params.shape ?? "rect",
    },
  };
}
