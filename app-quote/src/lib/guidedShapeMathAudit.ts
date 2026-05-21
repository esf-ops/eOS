import type { GuidedPiece, RoomDraft } from "./quoteTypes";
import {
  guidedCornerOverlapCount,
  guidedCornerOverlapDeductionSf,
  guidedCornerOverlapSqft,
  round2,
  sfFromGuidedPiece,
  STANDARD_BACKSPLASH_HEIGHT_IN,
  sumGuidedPiecesByType
} from "./measurementEngine";

export type GuidedPieceAuditRow = {
  pieceId: string;
  name: string;
  pieceType: string;
  shape: string;
  lengthIn: number;
  depthIn: number;
  rawSf: number;
  addSplashSf: number;
};

export type GuidedShapeMathAudit = {
  roomName: string;
  calcMode: string;
  layoutPreset: string;
  pieceRows: GuidedPieceAuditRow[];
  sumCounterRaw: number;
  sumSplashRaw: number;
  sumFhbRaw: number;
  cornerOverlapCount: number;
  cornerOverlapPerCornerSf: number | null;
  cornerOverlapDeductionSf: number;
  finalCounterSf: number;
  finalBacksplashFhbSf: number;
  detailLines: string[];
};

function shapeLabel(shape: GuidedPiece["shape"]): string {
  return shape === "tri" ? "Triangle" : "Rectangle";
}

/** Internal-only breakdown for guided-shape rooms (L/U overlap, per-piece SF). */
export function buildGuidedShapeMathAudit(room: RoomDraft): GuidedShapeMathAudit | null {
  if (room.roomType === "Vanity") return null;
  if (room.calcMode !== "Guided Shape") return null;

  const pieceRows: GuidedPieceAuditRow[] = [];
  let sumCounterRaw = 0;
  let sumSplashRaw = 0;
  let sumFhbRaw = 0;

  for (const p of room.guidedPieces) {
    const rawSf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
    let addSplashSf = 0;
    if (p.pieceType === "counter" && p.addSplash && p.lengthIn > 0) {
      addSplashSf = round2((p.lengthIn * STANDARD_BACKSPLASH_HEIGHT_IN) / 144);
    }
    pieceRows.push({
      pieceId: p.id,
      name: p.name || "Piece",
      pieceType: p.pieceType,
      shape: shapeLabel(p.shape),
      lengthIn: p.lengthIn,
      depthIn: p.depthIn,
      rawSf,
      addSplashSf
    });
    if (p.pieceType === "splash") sumSplashRaw += rawSf;
    else if (p.pieceType === "fhb") sumFhbRaw += rawSf;
    else {
      sumCounterRaw += rawSf;
      sumSplashRaw += addSplashSf;
    }
  }

  if (room.fhbMode === "Guided Shape") {
    for (const p of room.fhbPieces) {
      const rawSf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
      sumFhbRaw += rawSf;
      pieceRows.push({
        pieceId: p.id,
        name: p.name || "FHB piece",
        pieceType: "fhb",
        shape: shapeLabel(p.shape),
        lengthIn: p.lengthIn,
        depthIn: p.depthIn,
        rawSf,
        addSplashSf: 0
      });
    }
  } else if (room.fhbMode === "Manual Sq Ft") {
    sumFhbRaw += Number(room.fhbDirectSf) || 0;
  }

  const overlapCount = guidedCornerOverlapCount(room);
  const counters = room.guidedPieces.filter((p) => p.pieceType === "counter" && p.lengthIn > 0 && p.depthIn > 0);
  const cornerOverlapPerCornerSf =
    overlapCount === 1 && counters.length >= 2
      ? guidedCornerOverlapSqft(counters[0].depthIn, counters[1].depthIn)
      : overlapCount === 2 && counters.length >= 3
        ? guidedCornerOverlapSqft(counters[0].depthIn, counters[1].depthIn)
        : overlapCount > 0 && counters.length >= 2
          ? guidedCornerOverlapSqft(counters[0].depthIn, counters[1].depthIn)
          : null;

  const cornerOverlapDeductionSf = guidedCornerOverlapDeductionSf(room);
  const summed = sumGuidedPiecesByType(room.guidedPieces, {
    cornerOverlapDeductionSf,
    cornerOverlapNote:
      overlapCount > 0
        ? `Corner overlap deduction (${room.guidedLayoutPreset || "preset"}): −${cornerOverlapDeductionSf.toFixed(2)} sf`
        : undefined
  });

  let fhbExtra = 0;
  if (room.fhbMode === "Guided Shape") {
    for (const p of room.fhbPieces) {
      fhbExtra += sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
    }
  } else if (room.fhbMode === "Manual Sq Ft") {
    fhbExtra = Number(room.fhbDirectSf) || 0;
  }

  const detailLines = [...summed.lines];
  if (fhbExtra > 0 && room.fhbMode !== "Guided Shape") {
    detailLines.push(`Manual FHB sf: ${round2(fhbExtra).toFixed(2)} sf`);
  }
  if (overlapCount > 0) {
    detailLines.push(
      `L/U overlap rule: ${overlapCount} inside corner${overlapCount === 1 ? "" : "s"} × min(depth)×min(depth) in sq ft`
    );
    if (cornerOverlapPerCornerSf != null && overlapCount === 2) {
      detailLines.push(`Per-corner overlap (first pair): ${cornerOverlapPerCornerSf.toFixed(4)} sf`);
    }
  } else if (room.guidedPieces.filter((p) => p.pieceType === "counter").length >= 2 && !room.guidedLayoutPreset) {
    detailLines.push(
      "No corner overlap applied — choose L-Shape or U-Shape preset (or confirm dimensions) if inside corners should deduct overlap."
    );
  }

  return {
    roomName: room.name || "Room",
    calcMode: room.calcMode,
    layoutPreset: room.guidedLayoutPreset || "—",
    pieceRows,
    sumCounterRaw: round2(sumCounterRaw),
    sumSplashRaw: round2(sumSplashRaw),
    sumFhbRaw: round2(sumFhbRaw),
    cornerOverlapCount: overlapCount,
    cornerOverlapPerCornerSf,
    cornerOverlapDeductionSf,
    finalCounterSf: summed.counter,
    finalBacksplashFhbSf: round2(summed.splash + summed.fhb + fhbExtra),
    detailLines
  };
}

/** Cedar Valley / Spec 73 style L-shape regression (120″ + 60″ @ 25.5″, one corner). */
export function cedarValleySpec73StyleFixture(
  createRoom: () => RoomDraft
): { counterSf: number; backsplashSf: number } {
  const room = createRoom();
  room.name = "Cedar Valley style";
  room.calcMode = "Guided Shape";
  room.guidedLayoutPreset = "L-Shape";
  room.guidedPieces = [
    { id: "a", pieceType: "counter", name: "Main", lengthIn: 120, depthIn: 25.5, shape: "rect" },
    { id: "b", pieceType: "counter", name: "Return", lengthIn: 60, depthIn: 25.5, shape: "rect" },
    {
      id: "c",
      pieceType: "splash",
      name: "Backsplash",
      lengthIn: 120,
      depthIn: STANDARD_BACKSPLASH_HEIGHT_IN,
      shape: "rect"
    }
  ];
  room.fhbMode = "Off";
  const audit = buildGuidedShapeMathAudit(room);
  return {
    counterSf: audit?.finalCounterSf ?? 0,
    backsplashSf: audit?.finalBacksplashFhbSf ?? 0
  };
}
