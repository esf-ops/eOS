import type {
  GuidedGroupBacksplashMode,
  GuidedLayoutPreset,
  GuidedOverlapMode,
  GuidedPiece,
  GuidedShapeGroup,
  GuidedShapeGroupType,
  RoomDraft
} from "./quoteTypes";
import {
  guidedCornerOverlapDeductionSfForGroup,
  guidedCornerOverlapDeductionSfForPieces,
  overlapModeLabel,
  round2,
  STANDARD_BACKSPLASH_HEIGHT_IN,
  STANDARD_COUNTER_DEPTH_IN,
  sumGuidedPiecesByType
} from "./measurementEngine";
function gid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2, 11)}`;
}

export type GroupSfTotals = {
  counter: number;
  splash: number;
  fhb: number;
  overlapDeduction: number;
  lines: string[];
};

const LAYOUT_GROUP_TYPES: GuidedShapeGroupType[] = ["L-Shape", "U-Shape", "Galley", "Island", "Backsplash", "Waterfall"];

export function isLayoutGroupType(t: GuidedShapeGroupType): t is GuidedLayoutPreset {
  return LAYOUT_GROUP_TYPES.includes(t as GuidedShapeGroupType);
}

export function groupTypeLabel(t: GuidedShapeGroupType): string {
  switch (t) {
    case "straight":
      return "Straight run";
    case "manual":
      return "Manual pieces";
    default:
      return t;
  }
}

export function defaultGroupName(shapeType: GuidedShapeGroupType, index: number): string {
  const base = groupTypeLabel(shapeType);
  return index > 0 ? `${base} ${index + 1}` : base;
}

/** Starter pieces for a new shape group preset (does not touch other groups). */
export function piecesForGroupPreset(shapeType: GuidedShapeGroupType): GuidedPiece[] {
  const depth = STANDARD_COUNTER_DEPTH_IN;
  const mk = (pieceType: GuidedPiece["pieceType"], name: string, d: number, addSplash?: boolean): GuidedPiece => ({
    id: gid(),
    pieceType,
    name,
    lengthIn: 0,
    depthIn: d,
    shape: "rect",
    addSplash
  });
  switch (shapeType) {
    case "straight":
      return [mk("counter", "Main run", depth)];
    case "L-Shape":
      return [mk("counter", "Main Wall Run", depth), mk("counter", "Short Return", depth)];
    case "U-Shape":
      return [
        mk("counter", "Left Run", depth),
        mk("counter", "Back Run", depth),
        mk("counter", "Right Run", depth)
      ];
    case "Galley":
      return [mk("counter", "Left Wall", depth), mk("counter", "Right Wall", depth)];
    case "Island":
      return [mk("counter", "Island", 36)];
    case "Backsplash":
      return [mk("splash", "Backsplash run", STANDARD_BACKSPLASH_HEIGHT_IN)];
    case "Waterfall":
      return [mk("fhb", "Waterfall edge", 96)];
    case "manual":
      return [mk("counter", "Counter section", depth)];
    default:
      return [mk("counter", "Counter section", depth)];
  }
}

export function flattenGuidedPiecesFromGroups(groups: GuidedShapeGroup[]): GuidedPiece[] {
  return groups.flatMap((g) => g.pieces.map((p) => ({ ...p })));
}

export function defaultOverlapModeForShapeType(shapeType: GuidedShapeGroupType): GuidedOverlapMode {
  return "auto";
}

export function piecesForGroupWithBacksplashFilter(group: GuidedShapeGroup): GuidedPiece[] {
  if (group.backsplashMode !== "exclude") return group.pieces;
  return group.pieces.filter((p) => p.pieceType === "counter");
}

export function sumGuidedShapeGroup(group: GuidedShapeGroup): GroupSfTotals {
  const overlap = guidedCornerOverlapDeductionSfForGroup(group);
  const excludeBs = group.backsplashMode === "exclude";
  const pieces = piecesForGroupWithBacksplashFilter(group);
  const modeLbl = overlapModeLabel(group.overlapMode, group.shapeType);
  const summed = sumGuidedPiecesByType(pieces, {
    cornerOverlapDeductionSf: overlap,
    cornerOverlapNote:
      overlap > 0
        ? `${group.name}: corner overlap −${overlap.toFixed(2)} sf (${modeLbl})`
        : undefined,
    skipAutoSplash: excludeBs,
    skipSplashPieces: excludeBs
  });
  return {
    counter: summed.counter,
    splash: summed.splash,
    fhb: summed.fhb,
    overlapDeduction: overlap,
    lines: summed.lines
  };
}

/** Sum all shape groups for priced room totals (guided calc mode). */
export function sumAllGuidedShapeGroups(room: RoomDraft): GroupSfTotals & { groupBreakdown: Array<GroupSfTotals & { groupId: string; groupName: string }> } {
  const groups = room.guidedShapeGroups?.length ? room.guidedShapeGroups : [];
  let counter = 0;
  let splash = 0;
  let fhb = 0;
  let overlapDeduction = 0;
  const lines: string[] = [];
  const groupBreakdown: Array<GroupSfTotals & { groupId: string; groupName: string }> = [];
  for (const g of groups) {
    const t = sumGuidedShapeGroup(g);
    counter = round2(counter + t.counter);
    splash = round2(splash + t.splash);
    fhb = round2(fhb + t.fhb);
    overlapDeduction = round2(overlapDeduction + t.overlapDeduction);
    lines.push(...t.lines.map((ln) => `[${g.name}] ${ln}`));
    groupBreakdown.push({ ...t, groupId: g.id, groupName: g.name });
  }
  return { counter, splash, fhb, overlapDeduction, lines, groupBreakdown };
}

/**
 * Migrate legacy flat `guidedPieces` + room `guidedLayoutPreset` into shape groups.
 * Keeps `guidedPieces` in sync as flattened pieces for API / canvas.
 */
export function normalizeGuidedShapeRoom(room: RoomDraft): RoomDraft {
  if (room.calcMode !== "Guided Shape") {
    return room;
  }
  let groups = room.guidedShapeGroups?.map((g) => ({
    ...g,
    overlapMode: g.overlapMode ?? defaultOverlapModeForShapeType(g.shapeType),
    backsplashMode: g.backsplashMode ?? "include",
    pieces: g.pieces.map((p) => ({ ...p }))
  }));
  if (!groups?.length) {
    const legacyPreset = room.guidedLayoutPreset;
    const shapeType: GuidedShapeGroupType =
      legacyPreset === "Rectangle"
        ? "straight"
        : legacyPreset && isLayoutGroupType(legacyPreset as GuidedShapeGroupType)
          ? (legacyPreset as GuidedShapeGroupType)
          : room.guidedPieces.length
            ? "manual"
            : "straight";
    const pieces = room.guidedPieces.length
      ? room.guidedPieces.map((p) => ({ ...p, id: p.id || gid() }))
      : piecesForGroupPreset(shapeType);
    groups = [
      {
        id: gid(),
        name: legacyPreset ? String(legacyPreset) : defaultGroupName(shapeType, 0),
        shapeType,
        overlapMode: defaultOverlapModeForShapeType(shapeType),
        backsplashMode: "include",
        pieces
      }
    ];
  }
  const guidedPieces = flattenGuidedPiecesFromGroups(groups);
  const single = groups.length === 1 && isLayoutGroupType(groups[0].shapeType) ? (groups[0].shapeType as GuidedLayoutPreset) : null;
  return {
    ...room,
    guidedShapeGroups: groups,
    guidedPieces,
    guidedLayoutPreset: single
  };
}

export function normalizeGuidedShapeRooms(rooms: RoomDraft[]): RoomDraft[] {
  return rooms.map((r) => normalizeGuidedShapeRoom(r));
}

export function createGuidedShapeGroup(shapeType: GuidedShapeGroupType, name?: string, index = 0): GuidedShapeGroup {
  return {
    id: gid(),
    name: name?.trim() || defaultGroupName(shapeType, index),
    shapeType,
    overlapMode: defaultOverlapModeForShapeType(shapeType),
    backsplashMode: "include",
    pieces: piecesForGroupPreset(shapeType)
  };
}

export function appendGuidedShapeGroup(room: RoomDraft, shapeType: GuidedShapeGroupType, customName?: string): RoomDraft {
  const norm = normalizeGuidedShapeRoom(room);
  const groups = [...(norm.guidedShapeGroups || [])];
  const next = createGuidedShapeGroup(shapeType, customName, groups.length);
  groups.push(next);
  return normalizeGuidedShapeRoom({ ...norm, guidedShapeGroups: groups, calcMode: "Guided Shape" });
}

/** Quick-add presets for common Internal Estimate layouts (Spec 73 / multi-area kitchens). */
export type GuidedShapeQuickPreset = "stove_wall" | "main_u" | "straight" | "l_shape" | "u_shape";

export function createGuidedShapeGroupFromPreset(
  preset: GuidedShapeQuickPreset,
  index = 0
): GuidedShapeGroup {
  const depth = STANDARD_COUNTER_DEPTH_IN;
  const mkCounter = (name: string, addSplash = false): GuidedPiece => ({
    id: gid(),
    pieceType: "counter",
    name,
    lengthIn: 0,
    depthIn: depth,
    shape: "rect",
    addSplash
  });
  switch (preset) {
    case "stove_wall":
      return {
        id: gid(),
        name: index > 0 ? `Stove wall ${index + 1}` : "Stove wall",
        shapeType: "straight",
        overlapMode: "none",
        backsplashMode: "exclude",
        pieces: [mkCounter("Left of stove"), mkCounter("Right of stove")]
      };
    case "main_u":
      return {
        id: gid(),
        name: index > 0 ? `Main U-shape ${index + 1}` : "Main U-shape",
        shapeType: "U-Shape",
        overlapMode: "none",
        backsplashMode: "include",
        pieces: [mkCounter("Left run"), mkCounter("Back / sink run"), mkCounter("Right run")]
      };
    case "l_shape":
      return {
        id: gid(),
        name: index > 0 ? `L-shape ${index + 1}` : "L-shape",
        shapeType: "L-Shape",
        overlapMode: "auto",
        backsplashMode: "include",
        pieces: piecesForGroupPreset("L-Shape")
      };
    case "u_shape":
      return {
        id: gid(),
        name: index > 0 ? `U-shape ${index + 1}` : "U-shape",
        shapeType: "U-Shape",
        overlapMode: "none",
        backsplashMode: "include",
        pieces: piecesForGroupPreset("U-Shape")
      };
    case "straight":
    default:
      return {
        id: gid(),
        name: index > 0 ? `Straight run ${index + 1}` : "Straight run",
        shapeType: "straight",
        overlapMode: "none",
        backsplashMode: "include",
        pieces: piecesForGroupPreset("straight")
      };
  }
}

export function appendGuidedShapeGroupFromPreset(room: RoomDraft, preset: GuidedShapeQuickPreset): RoomDraft {
  const norm = normalizeGuidedShapeRoom(room);
  const groups = [...(norm.guidedShapeGroups || [])];
  const next = createGuidedShapeGroupFromPreset(preset, groups.length);
  groups.push(next);
  return normalizeGuidedShapeRoom({ ...norm, guidedShapeGroups: groups, calcMode: "Guided Shape" });
}

export function updateGuidedShapeGroup(
  room: RoomDraft,
  groupId: string,
  patch: Partial<Pick<GuidedShapeGroup, "name" | "shapeType" | "pieces" | "overlapMode" | "backsplashMode">>
): RoomDraft {
  const norm = normalizeGuidedShapeRoom(room);
  const groups = (norm.guidedShapeGroups || []).map((g) => {
    if (g.id !== groupId) return g;
    const shapeType = patch.shapeType ?? g.shapeType;
    let pieces = patch.pieces ?? g.pieces;
    if (patch.shapeType && patch.shapeType !== g.shapeType && !patch.pieces) {
      const hasDims = g.pieces.some((p) => p.lengthIn > 0 || p.depthIn > 0);
      if (!hasDims) pieces = piecesForGroupPreset(shapeType);
    }
    return { ...g, ...patch, shapeType, pieces: pieces.map((p) => ({ ...p })) };
  });
  return normalizeGuidedShapeRoom({ ...norm, guidedShapeGroups: groups });
}

export function removeGuidedShapeGroup(room: RoomDraft, groupId: string): RoomDraft {
  const norm = normalizeGuidedShapeRoom(room);
  const groups = (norm.guidedShapeGroups || []).filter((g) => g.id !== groupId);
  return normalizeGuidedShapeRoom({ ...norm, guidedShapeGroups: groups });
}

/** Total room overlap sent to API — sum of per-group deductions (not cross-group). */
export function totalGuidedCornerOverlapDeductionSf(room: RoomDraft): number {
  const norm = normalizeGuidedShapeRoom(room);
  if (norm.calcMode !== "Guided Shape") return 0;
  let sum = 0;
  for (const g of norm.guidedShapeGroups || []) {
    sum = round2(sum + guidedCornerOverlapDeductionSfForGroup(g));
  }
  return sum;
}

export function groupTotalsPreview(group: GuidedShapeGroup): { counter: number; splashFhb: number; total: number; overlap: number } {
  const t = sumGuidedShapeGroup(group);
  return {
    counter: t.counter,
    splashFhb: round2(t.splash + t.fhb),
    total: round2(t.counter + t.splash + t.fhb),
    overlap: t.overlapDeduction
  };
}

export function roomGuidedGroupsPreview(room: RoomDraft): { counter: number; splashFhb: number; total: number } {
  const norm = normalizeGuidedShapeRoom(room);
  const all = sumAllGuidedShapeGroups(norm);
  return {
    counter: all.counter,
    splashFhb: round2(all.splash + all.fhb),
    total: round2(all.counter + all.splash + all.fhb)
  };
}
