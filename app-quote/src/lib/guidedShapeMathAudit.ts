import type { GuidedPiece, RoomDraft } from "./quoteTypes";
import {
  chargeableCounterSqftFromExact,
  guidedCornerOverlapCountForMode,
  guidedCornerOverlapDeductionSf,
  overlapModeLabel,
  round2,
  sfFromGuidedPiece,
  STANDARD_BACKSPLASH_HEIGHT_IN,
  sumGuidedPiecesByType
} from "./measurementEngine";
import { groupTypeLabel, normalizeGuidedShapeRoom, sumGuidedShapeGroup } from "./guidedShapeGroups";

export type GuidedPieceAuditRow = {
  pieceId: string;
  groupName: string;
  name: string;
  pieceType: string;
  shape: string;
  lengthIn: number;
  depthIn: number;
  rawSf: number;
  addSplashSf: number;
  backsplashSource?: string;
};

export type GuidedShapeGroupAudit = {
  groupId: string;
  groupName: string;
  shapeType: string;
  overlapMode: string;
  backsplashMode: string;
  rawCounterSf: number;
  rawSplashSf: number;
  rawFhbSf: number;
  overlapDeductionSf: number;
  finalCounterSf: number;
  finalSplashFhbSf: number;
  detailLines: string[];
};

export type GuidedShapeMathAudit = {
  roomName: string;
  calcMode: string;
  layoutPreset: string;
  pieceRows: GuidedPieceAuditRow[];
  groupAudits: GuidedShapeGroupAudit[];
  sumCounterRaw: number;
  sumSplashRaw: number;
  sumFhbRaw: number;
  cornerOverlapCount: number;
  cornerOverlapDeductionSf: number;
  exactCounterSf: number;
  chargeableCounterSf: number;
  counterRoundingAdjustment: number;
  finalCounterSf: number;
  finalBacksplashFhbSf: number;
  detailLines: string[];
};

function shapeLabel(shape: GuidedPiece["shape"]): string {
  return shape === "tri" ? "Triangle" : "Rectangle";
}

/** Internal-only breakdown for guided-shape rooms (per-group L/U overlap). */
export function buildGuidedShapeMathAudit(
  room: RoomDraft,
  measureOptions?: { chargeableCounterCeil?: boolean }
): GuidedShapeMathAudit | null {
  if (room.roomType === "Vanity") return null;
  if (room.calcMode !== "Guided Shape") return null;

  const norm = normalizeGuidedShapeRoom(room);
  const groups = norm.guidedShapeGroups || [];
  const pieceRows: GuidedPieceAuditRow[] = [];
  const groupAudits: GuidedShapeGroupAudit[] = [];
  let sumCounterRaw = 0;
  let sumSplashRaw = 0;
  let sumFhbRaw = 0;
  let cornerOverlapDeductionSf = 0;
  let cornerOverlapCount = 0;
  const detailLines: string[] = [];

  for (const grp of groups) {
    let rawCounter = 0;
    let rawSplash = 0;
    let rawFhb = 0;
    const excludeBs = grp.backsplashMode === "exclude";
    for (const p of grp.pieces) {
      const rawSf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
      let addSplashSf = 0;
      let backsplashSource: string | undefined;
      if (p.pieceType === "counter" && p.addSplash && p.lengthIn > 0 && !excludeBs) {
        addSplashSf = round2((p.lengthIn * STANDARD_BACKSPLASH_HEIGHT_IN) / 144);
        backsplashSource = `4″ on run (${p.name})`;
      }
      if (p.pieceType === "splash" && !excludeBs) {
        backsplashSource = "splash piece";
      }
      pieceRows.push({
        pieceId: p.id,
        groupName: grp.name,
        name: p.name || "Piece",
        pieceType: p.pieceType,
        shape: shapeLabel(p.shape),
        lengthIn: p.lengthIn,
        depthIn: p.depthIn,
        rawSf,
        addSplashSf,
        backsplashSource
      });
      if (p.pieceType === "splash") {
        if (!excludeBs) rawSplash += rawSf;
      } else if (p.pieceType === "fhb") {
        if (!excludeBs) rawFhb += rawSf;
      } else {
        rawCounter += rawSf;
        if (!excludeBs) rawSplash += addSplashSf;
      }
    }
    const summed = sumGuidedShapeGroup(grp);
    const overlap = summed.overlapDeduction;
    cornerOverlapDeductionSf = round2(cornerOverlapDeductionSf + overlap);
    cornerOverlapCount += guidedCornerOverlapCountForMode(grp.overlapMode, grp.shapeType);
    sumCounterRaw = round2(sumCounterRaw + rawCounter);
    sumSplashRaw = round2(sumSplashRaw + rawSplash);
    sumFhbRaw = round2(sumFhbRaw + rawFhb);
    const grpLines = summed.lines.map((ln) => `[${grp.name}] ${ln}`);
    detailLines.push(...grpLines);
    const modeLbl = overlapModeLabel(grp.overlapMode, grp.shapeType);
    if (overlap > 0) {
      detailLines.push(`${grp.name}: corner overlap −${overlap.toFixed(2)} sf (${modeLbl})`);
    } else if (grp.overlapMode === "none") {
      detailLines.push(`${grp.name}: gross runs — no corner deduction`);
    }
    if (excludeBs) {
      detailLines.push(`${grp.name}: backsplash excluded from this group`);
    }
    groupAudits.push({
      groupId: grp.id,
      groupName: grp.name,
      shapeType: groupTypeLabel(grp.shapeType),
      overlapMode: modeLbl,
      backsplashMode: excludeBs ? "Exclude backsplash" : "Include backsplash",
      rawCounterSf: round2(rawCounter),
      rawSplashSf: round2(rawSplash),
      rawFhbSf: round2(rawFhb),
      overlapDeductionSf: overlap,
      finalCounterSf: summed.counter,
      finalSplashFhbSf: round2(summed.splash + summed.fhb),
      detailLines: grpLines
    });
  }

  let fhbExtra = 0;
  if (room.fhbMode === "Guided Shape") {
    for (const p of room.fhbPieces) {
      const rawSf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
      fhbExtra += rawSf;
      sumFhbRaw = round2(sumFhbRaw + rawSf);
      pieceRows.push({
        pieceId: p.id,
        groupName: "FHB",
        name: p.name || "FHB piece",
        pieceType: "fhb",
        shape: shapeLabel(p.shape),
        lengthIn: p.lengthIn,
        depthIn: p.depthIn,
        rawSf,
        addSplashSf: 0,
        backsplashSource: "FHB piece"
      });
    }
  } else if (room.fhbMode === "Manual Sq Ft") {
    fhbExtra = Number(room.fhbDirectSf) || 0;
    sumFhbRaw = round2(sumFhbRaw + fhbExtra);
  }

  const roomOverlap = guidedCornerOverlapDeductionSf(norm);
  let exactCounter = 0;
  for (const ga of groupAudits) {
    exactCounter = round2(exactCounter + ga.finalCounterSf);
  }
  const chargeableCounterSf = measureOptions?.chargeableCounterCeil
    ? chargeableCounterSqftFromExact(exactCounter)
    : exactCounter;
  const counterRoundingAdjustment =
    measureOptions?.chargeableCounterCeil && chargeableCounterSf > exactCounter
      ? round2(chargeableCounterSf - exactCounter)
      : 0;

  const flatSummed = sumGuidedPiecesByType(norm.guidedPieces, {
    cornerOverlapDeductionSf: roomOverlap
  });

  if (fhbExtra > 0 && room.fhbMode !== "Guided Shape") {
    detailLines.push(`Manual FHB sf: ${round2(fhbExtra).toFixed(2)} sf`);
  }
  if (groups.length > 1) {
    detailLines.push(`Room total: ${groups.length} shape groups — overlap deducted within each group only.`);
  }
  if (counterRoundingAdjustment > 0) {
    detailLines.push(
      `Chargeable countertop: ${chargeableCounterSf.toFixed(0)} sf (rounded up from ${exactCounter.toFixed(2)} sf exact; +${counterRoundingAdjustment.toFixed(2)} sf)`
    );
  }
  detailLines.push(`Backsplash/FHB priced at exact SF (no round-up rule).`);

  return {
    roomName: room.name || "Room",
    calcMode: room.calcMode,
    layoutPreset: norm.guidedLayoutPreset || (groups.length === 1 ? groups[0]?.shapeType : "Multiple groups"),
    pieceRows,
    groupAudits,
    sumCounterRaw: round2(sumCounterRaw),
    sumSplashRaw: round2(sumSplashRaw),
    sumFhbRaw: round2(sumFhbRaw),
    cornerOverlapCount,
    cornerOverlapDeductionSf: roomOverlap,
    exactCounterSf: exactCounter,
    chargeableCounterSf,
    counterRoundingAdjustment,
    finalCounterSf: measureOptions?.chargeableCounterCeil ? chargeableCounterSf : flatSummed.counter,
    finalBacksplashFhbSf: round2(flatSummed.splash + flatSummed.fhb + fhbExtra),
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
  const audit = buildGuidedShapeMathAudit(room, { chargeableCounterCeil: true });
  return {
    counterSf: audit?.chargeableCounterSf ?? audit?.finalCounterSf ?? 0,
    backsplashSf: audit?.finalBacksplashFhbSf ?? 0
  };
}
