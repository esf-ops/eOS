/**
 * AI Takeoff import measurement helpers (v6.2) — backend/test canonical copy.
 * UI mirror: app-quote/src/lib/takeoffImportMeasurements.ts
 *
 * @module takeoffImportMeasurements
 */

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function sfFromGuidedPiece(lengthIn, depthIn, shape) {
  const l = Number(lengthIn) || 0;
  const d = Number(depthIn) || 0;
  if (l <= 0 || d <= 0) return 0;
  const base = (l * d) / 144;
  return shape === "tri" ? base / 2 : base;
}

function emptyTotals() {
  return {
    countertopSqft: 0,
    standardBacksplashSqft: 0,
    highBacksplashSqft: 0,
    fullHeightBacksplashSqft: 0,
    combinedSqft: 0,
  };
}

function bucketPieceSf(pieceType, sf, totals) {
  if (pieceType === "fhb") totals.fullHeightBacksplashSqft = round2(totals.fullHeightBacksplashSqft + sf);
  else if (pieceType === "splash") totals.standardBacksplashSqft = round2(totals.standardBacksplashSqft + sf);
  else totals.countertopSqft = round2(totals.countertopSqft + sf);
  totals.combinedSqft = round2(
    totals.countertopSqft + totals.standardBacksplashSqft + totals.highBacksplashSqft + totals.fullHeightBacksplashSqft
  );
}

function collectRoomPieces(room) {
  const groups = room.guidedShapeGroups ?? [];
  if (groups.length) return [...groups.flatMap((g) => g.pieces ?? []), ...(room.fhbPieces ?? [])];
  return [...(room.guidedPieces ?? []), ...(room.fhbPieces ?? [])];
}

function dimsForImportedSnapshot(piece) {
  const src = piece.takeoffImportSource;
  if (src?.originalDimensions) return src.originalDimensions;
  return { lengthIn: piece.lengthIn, depthIn: piece.depthIn, shape: piece.shape ?? "rect" };
}

function isExcludedImportedPiece(piece) {
  const src = piece.takeoffImportSource;
  return Boolean(src?.excludedFromQuote || src?.importState === "imported_excluded");
}

export const DEFAULT_TAKEOFF_MEASUREMENT_DELTA_THRESHOLD_SF = 2;

export function sumTakeoffMeasurementTotalsFromRooms(rooms, mode) {
  const totals = emptyTotals();
  for (const room of rooms ?? []) {
    for (const piece of collectRoomPieces(room)) {
      if (mode === "current") {
        if (isExcludedImportedPiece(piece)) continue;
        bucketPieceSf(
          piece.pieceType,
          sfFromGuidedPiece(piece.lengthIn, piece.depthIn, piece.shape),
          totals
        );
        continue;
      }
      const src = piece.takeoffImportSource;
      if (!src?.importedFromTakeoff) continue;
      if (src.importState === "imported_excluded" || src.excludedFromQuote) continue;
      const dims = dimsForImportedSnapshot(piece);
      bucketPieceSf(piece.pieceType, sfFromGuidedPiece(dims.lengthIn, dims.depthIn, dims.shape), totals);
    }
  }
  return totals;
}

export function computeTakeoffMeasurementDeltas(rooms, thresholdSf = DEFAULT_TAKEOFF_MEASUREMENT_DELTA_THRESHOLD_SF) {
  const imported = sumTakeoffMeasurementTotalsFromRooms(rooms, "imported_snapshot");
  const current = sumTakeoffMeasurementTotalsFromRooms(rooms, "current");
  const delta = {
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

export function ensureTakeoffOriginalDimensions(piece) {
  const src = piece.takeoffImportSource;
  if (src?.originalDimensions) return src.originalDimensions;
  return { lengthIn: piece.lengthIn, depthIn: piece.depthIn, shape: piece.shape ?? "rect" };
}

export function dimensionsMatchOriginal(piece) {
  const src = piece.takeoffImportSource;
  if (!src?.importedFromTakeoff) return false;
  const orig = ensureTakeoffOriginalDimensions(piece);
  return (
    round2(orig.lengthIn) === round2(piece.lengthIn) &&
    round2(orig.depthIn) === round2(piece.depthIn) &&
    (orig.shape ?? "rect") === (piece.shape ?? "rect")
  );
}

export function withTakeoffImportSource(piece, patch) {
  const existing = piece.takeoffImportSource ?? { importedFromTakeoff: true };
  return { ...piece, takeoffImportSource: { ...existing, ...patch } };
}

export function applyTakeoffPiecePatch(piece, patch) {
  const next = { ...piece, ...patch };
  const src = next.takeoffImportSource;
  if (!src?.importedFromTakeoff) return next;
  const orig = ensureTakeoffOriginalDimensions(piece);
  const hasDimChange =
    (patch.lengthIn != null && round2(patch.lengthIn) !== round2(piece.lengthIn)) ||
    (patch.depthIn != null && round2(patch.depthIn) !== round2(piece.depthIn)) ||
    (patch.shape != null && patch.shape !== piece.shape);
  let importState = src.importState ?? (dimensionsMatchOriginal(piece) ? "imported_unmodified" : "imported_edited");
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

export function restoreTakeoffOriginalDimensions(piece) {
  const src = piece.takeoffImportSource;
  if (!src?.importedFromTakeoff) return piece;
  const orig = ensureTakeoffOriginalDimensions(piece);
  return withTakeoffImportSource(
    { ...piece, lengthIn: orig.lengthIn, depthIn: orig.depthIn, shape: orig.shape ?? piece.shape },
    {
      originalDimensions: orig,
      importState: "imported_unmodified",
      excludedFromQuote: false,
      reviewStatus: src.reviewStatus === "manual_added" ? "manual_added" : "approved",
    }
  );
}

export function excludeImportedPieceFromQuote(piece) {
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

export function duplicateTakeoffPiece(piece, newId) {
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

export function splitTakeoffPiece(piece, newId) {
  const len = Number(piece.lengthIn) || 0;
  if (len < 2) return null;
  const half = round2(len / 2);
  const other = round2(len - half);
  const orig = ensureTakeoffOriginalDimensions(piece);
  const original = applyTakeoffPiecePatch({ ...piece, lengthIn: half, name: `${piece.name} (A)` }, {});
  const split = withTakeoffImportSource(
    { ...piece, id: newId, name: `${piece.name} (B)`, lengthIn: other },
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

export function buildTakeoffSourceMetaForImport(params) {
  return {
    importedFromTakeoff: true,
    takeoffJobId: params.takeoffJobId ?? null,
    takeoffSnapshotId: params.takeoffSnapshotId ?? null,
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

export function roomTakeoffVerificationComplete(room) {
  const v = room.takeoffImportVerification;
  if (!room.takeoffImportSource?.importedFromTakeoff) return true;
  return Boolean(v?.measurementsVerified && v?.addonsReviewed && v?.notesReviewed);
}
