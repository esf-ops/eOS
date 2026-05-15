import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GuidedPiece, RoomDraft } from "@quote-lib/quoteTypes";
import { sfFromGuidedPiece } from "@quote-lib/measurementEngine";
import { VANITY_PRICING } from "@quote-lib/prototypeQuoteMath";

/** Stable keys for client-only drag/rotate layout (never derive pricing from these). */
export type VisualRotation = 0 | 90 | 180 | 270;

export type VisualLayoutEntry = {
  x: number;
  y: number;
  rotation: VisualRotation;
};

const ROTATIONS: VisualRotation[] = [0, 90, 180, 270];

function nextRotation(r: VisualRotation): VisualRotation {
  const i = ROTATIONS.indexOf(r);
  return ROTATIONS[(i + 1) % 4];
}

function prevRotation(r: VisualRotation): VisualRotation {
  const i = ROTATIONS.indexOf(r);
  return ROTATIONS[(i + 3) % 4];
}

/** Keys currently rendered — parent should prune stale layout entries when rooms/pieces change. */
export function visualLayoutKeysForRooms(rooms: RoomDraft[]): Set<string> {
  const s = new Set<string>();
  for (const room of rooms) {
    if (room.roomType === "Vanity") {
      s.add(`v:${room.id}`);
      continue;
    }
    for (const p of room.guidedPieces) {
      s.add(`g:${room.id}:${p.id}`);
    }
    if (room.fhbMode === "Guided Shape") {
      for (const p of room.fhbPieces) {
        s.add(`f:${room.id}:${p.id}`);
      }
    }
  }
  return s;
}

/** Compact tier label for slab chips + summary line (Promo, A–F). */
export function abbrevMaterialTier(fullGroup: string): string {
  const g = String(fullGroup || "Group Promo").trim();
  const lower = g.toLowerCase();
  if (lower === "group promo" || lower === "promo") return "Promo";
  const m = g.match(/^group\s+([a-z])/i);
  if (m) return m[1].toUpperCase();
  return g.length > 10 ? `${g.slice(0, 9)}…` : g;
}

/** Summary for collapsed canvas card — visual-only; does not affect pricing. */
export function visualCanvasSummaryStats(rooms: RoomDraft[]): {
  roomCount: number;
  pieceCount: number;
  tierSummary: string;
} {
  const tiers = new Set<string>();
  let pieceCount = 0;
  for (const room of rooms) {
    if (room.roomType === "Vanity") {
      pieceCount += 1;
      tiers.add(abbrevMaterialTier(room.materialGroup || "Group Promo"));
      continue;
    }
    const rg = room.materialGroup?.trim() || "Group Promo";
    for (const p of room.guidedPieces) {
      pieceCount += 1;
      const g = p.materialOverride && p.materialGroup?.trim() ? p.materialGroup.trim() : rg;
      tiers.add(abbrevMaterialTier(g));
    }
    if (room.fhbMode === "Guided Shape") {
      for (const p of room.fhbPieces) {
        pieceCount += 1;
        const g = p.materialOverride && p.materialGroup?.trim() ? p.materialGroup.trim() : rg;
        tiers.add(abbrevMaterialTier(g));
      }
    }
  }
  const sorted = [...tiers].sort((a, b) => {
    if (a === "Promo") return -1;
    if (b === "Promo") return 1;
    return a.localeCompare(b);
  });
  return {
    roomCount: rooms.length,
    pieceCount,
    tierSummary: sorted.length ? sorted.join(" · ") : "—"
  };
}

type PieceCategory =
  | "countertop"
  | "island"
  | "backsplash"
  | "fhb"
  | "vanity"
  | "fireplace"
  | "bar"
  | "other";

function classifyPiece(room: RoomDraft, piece: GuidedPiece): PieceCategory {
  if (piece.pieceType === "splash") return "backsplash";
  if (piece.pieceType === "fhb") return "fhb";
  const name = (piece.name || "").toLowerCase();
  const rt = (room.roomType || "").toLowerCase();
  if (rt.includes("fireplace") || name.includes("fireplace")) return "fireplace";
  if (rt === "bar") return "bar";
  if (name.includes("island") || rt === "island") return "island";
  return "countertop";
}

function categoryLabel(c: PieceCategory): string {
  switch (c) {
    case "countertop":
      return "Countertop";
    case "island":
      return "Island / bar top";
    case "backsplash":
      return "Backsplash";
    case "fhb":
      return "Waterfall / full height";
    case "vanity":
      return "Vanity";
    case "fireplace":
      return "Fireplace / surround";
    case "bar":
      return "Bar";
    default:
      return "Other";
  }
}

function catShort(cat: PieceCategory): string {
  switch (cat) {
    case "backsplash":
      return "Splash";
    case "fhb":
      return "FHB";
    case "island":
      return "Island";
    case "fireplace":
      return "Fire";
    case "bar":
      return "Bar";
    case "vanity":
      return "Vanity";
    default:
      return "Wall";
  }
}

/** Readable short title on narrow slabs — avoids meaningless single-letter ellipsis. */
function compactPieceTitle(raw: string, cat: PieceCategory, seq: number): string {
  const cleaned = raw.trim();
  if (cleaned.length >= 3 && cleaned.length <= 13) return cleaned;
  const words = cleaned.split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => !/^(the|a|an|and|or|for)$/i.test(w));
  const pick =
    meaningful.find((w) => w.length >= 5) ??
    meaningful.find((w) => w.length >= 4) ??
    meaningful[0];
  if (pick && pick.length <= 14) return pick.charAt(0).toUpperCase() + pick.slice(1);
  return `${catShort(cat)} ${seq}`;
}

/** Normal slab title — gentle truncation at word boundary when very long. */
function normalSlabTitle(raw: string): string {
  const t = raw.trim() || "Piece";
  if (t.length <= 26) return t;
  const cut = t.slice(0, 24).trimEnd();
  const sp = cut.lastIndexOf(" ");
  const base = sp > 10 ? cut.slice(0, sp) : cut;
  return `${base}…`;
}

function groupAccent(group: string): { border: string } {
  let h = 0;
  const g = group || "Group Promo";
  for (let i = 0; i < g.length; i++) h = (h * 31 + g.charCodeAt(i)) % 360;
  return {
    border: `hsl(${h} 32% 82%)`
  };
}

function visualFootprint(lengthIn: number, depthIn: number, rotation: VisualRotation): { w: number; h: number } {
  const scale = 1.12;
  let w = Math.max(80, Math.min(236, Math.max(lengthIn, 0.01) * scale));
  let h = Math.max(48, Math.min(136, Math.max(depthIn, 0.01) * scale));
  if (rotation === 90 || rotation === 270) [w, h] = [h, w];
  return { w, h };
}

function footprintDims(piece: GuidedPiece, rotation: VisualRotation): { w: number; h: number } {
  const hasDims = piece.lengthIn > 0 && piece.depthIn > 0;
  if (!hasDims) return { w: 148, h: 76 };
  return visualFootprint(piece.lengthIn, piece.depthIn, rotation);
}

function pieceArea(piece: GuidedPiece): number {
  return Math.max(0, piece.lengthIn) * Math.max(0, piece.depthIn);
}

function effectiveMaterialGroup(room: RoomDraft, piece: GuidedPiece): string {
  if (piece.materialOverride && piece.materialGroup?.trim()) return piece.materialGroup.trim();
  return String(room.materialGroup || "Group Promo").trim();
}

function effectiveColorLabel(room: RoomDraft, piece: GuidedPiece | null, estimateColorTbd: boolean): string {
  if (estimateColorTbd) return "Color TBD";
  if (piece?.materialOverride && piece.materialColor?.trim()) return piece.materialColor.trim();
  if (room.materialColor?.trim()) return room.materialColor.trim();
  return "—";
}

const PACK_PAD = 16;
const GAP_MAIN = 26;
const GAP_SMALL = 14;
const ISLAND_GAP = 36;

type PlanItem =
  | { kind: "vanity"; key: string }
  | { kind: "guided" | "fhb"; key: string; piece: GuidedPiece };

type SketchBucket = "wall" | "return" | "island" | "splash" | "fhb" | "fireplace";

function sketchBucket(room: RoomDraft, piece: GuidedPiece, cat: PieceCategory): SketchBucket {
  if (cat === "island" || cat === "bar") return "island";
  if (cat === "backsplash") return "splash";
  if (cat === "fhb") return "fhb";
  if (cat === "fireplace") return "fireplace";
  const n = (piece.name || "").toLowerCase();
  if (/\b(return|leg|short|galley|perpendicular|pantry)\b/.test(n)) return "return";
  return "wall";
}

/**
 * Estimator-sketch style defaults: main runs horizontally, returns stacked to the right (often rotated),
 * splash/FHB in a lower band, islands offset below wall clusters. Purely visual — does not affect pricing.
 */
function computeDefaultLayouts(room: RoomDraft, items: PlanItem[]): Record<string, VisualLayoutEntry> {
  const out: Record<string, VisualLayoutEntry> = {};
  if (!items.length) return out;

  if (items.length === 1 && items[0].kind === "vanity") {
    out[items[0].key] = { x: PACK_PAD + 24, y: PACK_PAD + 12, rotation: 0 };
    return out;
  }

  type Row = { key: string; piece: GuidedPiece; bucket: SketchBucket; area: number };
  const rows: Row[] = [];
  for (const it of items) {
    if (it.kind === "vanity") continue;
    const cat = classifyPiece(room, it.piece);
    const bucket = sketchBucket(room, it.piece, cat);
    const hasDims = it.piece.lengthIn > 0 && it.piece.depthIn > 0;
    rows.push({
      key: it.key,
      piece: it.piece,
      bucket,
      area: hasDims ? pieceArea(it.piece) : 0
    });
  }

  const walls = rows.filter((r) => r.bucket === "wall" || r.bucket === "fireplace").sort((a, b) => b.area - a.area);
  const returns = rows.filter((r) => r.bucket === "return").sort((a, b) => a.area - b.area);
  const islands = rows.filter((r) => r.bucket === "island").sort((a, b) => b.area - a.area);
  const splashes = rows.filter((r) => r.bucket === "splash").sort((a, b) => b.area - a.area);
  const fhbs = rows.filter((r) => r.bucket === "fhb").sort((a, b) => b.area - a.area);

  let cursorX = PACK_PAD;
  const wallY = PACK_PAD;
  let wallBottom = wallY + 72;
  let wallRightMax = PACK_PAD;

  for (const r of walls) {
    const rot: VisualRotation = 0;
    const { w, h } = footprintDims(r.piece, rot);
    out[r.key] = { x: cursorX, y: wallY, rotation: rot };
    cursorX += w + GAP_MAIN;
    wallBottom = Math.max(wallBottom, wallY + h);
    wallRightMax = Math.max(wallRightMax, cursorX - GAP_MAIN);
  }

  let rx = wallRightMax + GAP_MAIN;
  let ry = PACK_PAD;
  let returnsBottom = PACK_PAD;
  if (!walls.length && returns.length) {
    rx = PACK_PAD;
    ry = PACK_PAD;
  }
  for (const r of returns) {
    const rot: VisualRotation = 90;
    const { w, h } = footprintDims(r.piece, rot);
    out[r.key] = { x: rx, y: ry, rotation: rot };
    ry += h + GAP_SMALL;
    returnsBottom = Math.max(returnsBottom, ry);
    wallBottom = Math.max(wallBottom, ry);
  }

  const thinBandY = Math.max(wallBottom + GAP_MAIN, PACK_PAD + (walls.length || returns.length ? 88 : 0));

  let sx = PACK_PAD;
  let thinBottom = thinBandY + 40;
  const thinPieces = [...splashes, ...fhbs];
  for (const r of thinPieces) {
    const rot: VisualRotation = 0;
    const { w, h } = footprintDims(r.piece, rot);
    out[r.key] = { x: sx, y: thinBandY, rotation: rot };
    sx += w + GAP_SMALL;
    thinBottom = Math.max(thinBottom, thinBandY + h);
  }

  const islandBaseY = thinPieces.length ? thinBottom + ISLAND_GAP : Math.max(wallBottom + ISLAND_GAP, thinBandY + ISLAND_GAP);

  let ix = PACK_PAD + (islands.length > 1 ? 0 : 48);
  for (let i = 0; i < islands.length; i++) {
    const r = islands[i];
    const rot: VisualRotation = 0;
    const { w, h } = footprintDims(r.piece, rot);
    out[r.key] = {
      x: ix + i * 22,
      y: islandBaseY + i * 18,
      rotation: rot
    };
    ix += w + GAP_MAIN;
    thinBottom = Math.max(thinBottom, islandBaseY + h + PACK_PAD);
  }

  if (!walls.length && !returns.length && islands.length && !thinPieces.length) {
    ix = PACK_PAD;
    for (let i = 0; i < islands.length; i++) {
      const r = islands[i];
      const { w, h } = footprintDims(r.piece, 0);
      out[r.key] = { x: ix, y: PACK_PAD, rotation: 0 };
      ix += w + GAP_MAIN;
      thinBottom = Math.max(thinBottom, PACK_PAD + h + PACK_PAD);
    }
  }

  void returnsBottom;

  return out;
}

function boardContentHeight(
  defaults: Record<string, VisualLayoutEntry>,
  items: PlanItem[],
  layoutMap: Record<string, VisualLayoutEntry>
): number {
  let maxBottom = PACK_PAD + 72;
  for (const it of items) {
    const key = it.key;
    const ent = layoutMap[key] ?? defaults[key];
    if (!ent) continue;
    let ph = 96;
    if (it.kind !== "vanity") {
      const p = it.piece;
      const hasDims = p.lengthIn > 0 && p.depthIn > 0;
      if (hasDims) {
        const { h } = visualFootprint(p.lengthIn, p.depthIn, ent.rotation);
        ph = h;
      }
    } else {
      ph = 112;
    }
    maxBottom = Math.max(maxBottom, ent.y + ph);
  }
  return maxBottom + PACK_PAD + 6;
}

export type VisualLayoutCanvasProps = {
  rooms: RoomDraft[];
  layoutByPieceKey: Record<string, VisualLayoutEntry>;
  setLayoutByPieceKey: React.Dispatch<React.SetStateAction<Record<string, VisualLayoutEntry>>>;
  estimateColorTbd: boolean;
};

export default function VisualLayoutCanvas({
  rooms,
  layoutByPieceKey,
  setLayoutByPieceKey,
  estimateColorTbd
}: VisualLayoutCanvasProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const dragRef = useRef<{
    key: string;
    fallback: VisualLayoutEntry;
    ox: number;
    oy: number;
    sx: number;
    sy: number;
    pw: number;
    ph: number;
    board: HTMLDivElement;
  } | null>(null);

  const boardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const roomPiecePlans = useMemo(() => {
    return rooms.map((room) => {
      if (room.roomType === "Vanity") {
        return { room, items: [{ kind: "vanity" as const, key: `v:${room.id}` }] as PlanItem[] };
      }
      const items: PlanItem[] = [];
      for (const p of room.guidedPieces) {
        items.push({ kind: "guided", key: `g:${room.id}:${p.id}`, piece: p });
      }
      if (room.fhbMode === "Guided Shape") {
        for (const p of room.fhbPieces) {
          items.push({ kind: "fhb", key: `f:${room.id}:${p.id}`, piece: p });
        }
      }
      return { room, items };
    });
  }, [rooms]);

  const anyRenderablePiece = useMemo(() => {
    return roomPiecePlans.some(({ room, items }) => {
      if (room.roomType === "Vanity") return true;
      return items.some((it) => it.kind !== "vanity" && it.piece.lengthIn > 0 && it.piece.depthIn > 0);
    });
  }, [roomPiecePlans]);

  const getEntry = useCallback(
    (key: string, fallback: VisualLayoutEntry) => layoutByPieceKey[key] ?? fallback,
    [layoutByPieceKey]
  );

  const rotatePieceTo = useCallback(
    (key: string, fallback: VisualLayoutEntry, rotation: VisualRotation) => {
      setLayoutByPieceKey((prev) => {
        const cur = prev[key] ?? fallback;
        return { ...prev, [key]: { ...cur, rotation } };
      });
    },
    [setLayoutByPieceKey]
  );

  const resetPieceLayout = useCallback((key: string) => {
    setLayoutByPieceKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [setLayoutByPieceKey]);

  const autoArrangeRoom = useCallback(
    (pieceKeys: string[]) => {
      setLayoutByPieceKey((prev) => {
        const next = { ...prev };
        for (const k of pieceKeys) delete next[k];
        return next;
      });
      setSelectedKey(null);
    },
    [setLayoutByPieceKey]
  );

  const handlePiecePointerDown = (
    e: React.PointerEvent,
    key: string,
    fallback: VisualLayoutEntry,
    pw: number,
    ph: number,
    roomId: string
  ) => {
    if ((e.target as HTMLElement).closest(".vlc-no-drag")) return;
    setSelectedKey(key);

    const board = boardRefs.current.get(roomId);
    if (!board) return;

    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const cur = layoutByPieceKey[key] ?? fallback;
    dragRef.current = {
      key,
      fallback,
      ox: cur.x,
      oy: cur.y,
      sx: e.clientX,
      sy: e.clientY,
      pw,
      ph,
      board
    };

    const clamp = (nx: number, ny: number) => {
      const d = dragRef.current;
      if (!d) return { x: nx, y: ny };
      const pad = 8;
      const bw = d.board.clientWidth;
      const bh = d.board.clientHeight;
      const maxX = Math.max(pad, bw - d.pw - pad);
      const maxY = Math.max(pad, bh - d.ph - pad);
      return {
        x: Math.min(Math.max(pad, nx), maxX),
        y: Math.min(Math.max(pad, ny), maxY)
      };
    };

    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.sx;
      const dy = ev.clientY - d.sy;
      const rawX = d.ox + dx;
      const rawY = d.oy + dy;
      const { x, y } = clamp(rawX, rawY);
      setLayoutByPieceKey((prev) => {
        const base = prev[d.key] ?? d.fallback;
        return { ...prev, [d.key]: { ...base, x, y } };
      });
    };
    const up = (ev: PointerEvent) => {
      dragRef.current = null;
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {
        /* released */
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    if (!selectedKey) return;

    const findCtx = (): {
      room: RoomDraft;
      items: PlanItem[];
      item: PlanItem;
      fallback: VisualLayoutEntry;
    } | null => {
      for (const { room, items } of roomPiecePlans) {
        const defs = computeDefaultLayouts(room, items);
        for (const it of items) {
          if (it.key === selectedKey) {
            return { room, items, item: it, fallback: defs[it.key] ?? { x: PACK_PAD, y: PACK_PAD, rotation: 0 } };
          }
        }
      }
      return null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))
        return;

      const ctx = findCtx();
      if (!ctx) return;

      const { key } = ctx.item;
      const entry = layoutByPieceKey[key] ?? ctx.fallback;
      let pw = 160;
      let ph = 88;
      if (ctx.item.kind === "vanity") {
        pw = 176;
        ph = 112;
      } else {
        const p = ctx.item.piece;
        const hasDims = p.lengthIn > 0 && p.depthIn > 0;
        if (hasDims) {
          const fh = visualFootprint(p.lengthIn, p.depthIn, entry.rotation);
          pw = fh.w;
          ph = fh.h;
        }
      }

      const boardEl = boardRefs.current.get(ctx.room.id);
      const nudge = e.shiftKey ? 16 : 4;

      const clampPos = (nx: number, ny: number) => {
        if (!boardEl) return { x: nx, y: ny };
        const pad = 8;
        const bw = boardEl.clientWidth;
        const bh = boardEl.clientHeight;
        const maxX = Math.max(pad, bw - pw - pad);
        const maxY = Math.max(pad, bh - ph - pad);
        return {
          x: Math.min(Math.max(pad, nx), maxX),
          y: Math.min(Math.max(pad, ny), maxY)
        };
      };

      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        rotatePieceTo(key, ctx.fallback, nextRotation(entry.rotation));
        return;
      }

      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -nudge;
      else if (e.key === "ArrowRight") dx = nudge;
      else if (e.key === "ArrowUp") dy = -nudge;
      else if (e.key === "ArrowDown") dy = nudge;
      else return;

      e.preventDefault();
      const { x, y } = clampPos(entry.x + dx, entry.y + dy);
      setLayoutByPieceKey((prev) => {
        const cur = prev[key] ?? ctx.fallback;
        return { ...prev, [key]: { ...cur, x, y } };
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedKey, layoutByPieceKey, roomPiecePlans, rotatePieceTo, setLayoutByPieceKey]);

  const renderInspector = (
    room: RoomDraft,
    items: PlanItem[],
    roomDefaults: Record<string, VisualLayoutEntry>,
    roomName: string
  ) => {
    const sel = selectedKey && items.some((i) => i.key === selectedKey) ? selectedKey : null;
    if (!sel) {
      return (
        <div className="vlc-inspector vlc-inspector-empty muted small">
          Select a piece on the board for dimensions, material, and rotation.{" "}
          <span className="vlc-kbd-hint">Arrow nudge · Shift+Arrow · R</span>
        </div>
      );
    }

    const fallback = roomDefaults[sel] ?? { x: PACK_PAD, y: PACK_PAD, rotation: 0 };
    const entry = layoutByPieceKey[sel] ?? fallback;
    const item = items.find((i) => i.key === sel);
    if (!item) return null;

    if (item.kind === "vanity") {
      const sk = room.vanity.size;
      const spec = sk !== "none" ? VANITY_PRICING[sk] : null;
      const label = spec?.name ?? "Vanity program";
      const g = String(room.materialGroup || "Group Promo").trim();
      return (
        <div className="vlc-inspector">
          <div className="vlc-inspector-main">
            <div className="vlc-inspector-grid">
              <div className="vlc-inspector-field">
                <span className="vlc-inspector-k">Room</span>
                <span className="vlc-inspector-v">{roomName}</span>
              </div>
              <div className="vlc-inspector-field">
                <span className="vlc-inspector-k">Piece</span>
                <span className="vlc-inspector-v">{label}</span>
              </div>
              <div className="vlc-inspector-field">
                <span className="vlc-inspector-k">Type</span>
                <span className="vlc-inspector-v">{categoryLabel("vanity")}</span>
              </div>
              <div className="vlc-inspector-field">
                <span className="vlc-inspector-k">Qty / depth</span>
                <span className="vlc-inspector-v">
                  ×{Math.max(1, Math.floor(room.vanity.qty) || 1)}
                  {spec ? ` · ${room.vanity.depth || 22.5}"` : ""}
                </span>
              </div>
              <div className="vlc-inspector-field">
                <span className="vlc-inspector-k">Material</span>
                <span className="vlc-inspector-v">{g}</span>
              </div>
              <div className="vlc-inspector-field">
                <span className="vlc-inspector-k">Color</span>
                <span className="vlc-inspector-v">{effectiveColorLabel(room, null, estimateColorTbd)}</span>
              </div>
              <div className="vlc-inspector-field">
                <span className="vlc-inspector-k">Rotation</span>
                <span className="vlc-inspector-v">{entry.rotation}°</span>
              </div>
            </div>
            <div className="vlc-inspector-actions vlc-no-drag">
              <button type="button" className="vlc-inspector-btn" onClick={() => rotatePieceTo(sel, fallback, prevRotation(entry.rotation))}>
                −90°
              </button>
              <button type="button" className="vlc-inspector-btn" onClick={() => rotatePieceTo(sel, fallback, nextRotation(entry.rotation))}>
                +90°
              </button>
              <button type="button" className="vlc-inspector-btn" onClick={() => resetPieceLayout(sel)}>
                Reset piece
              </button>
            </div>
          </div>
        </div>
      );
    }

    const piece = item.piece;
    const cat = classifyPiece(room, piece);
    const eg = effectiveMaterialGroup(room, piece);
    const rg = String(room.materialGroup || "Group Promo").trim();
    const mixed = eg !== rg;
    const hasDims = piece.lengthIn > 0 && piece.depthIn > 0;
    const sf = hasDims ? sfFromGuidedPiece(piece.lengthIn, piece.depthIn, piece.shape) : 0;

    return (
      <div className="vlc-inspector">
        <div className="vlc-inspector-main">
          <div className="vlc-inspector-grid">
            <div className="vlc-inspector-field">
              <span className="vlc-inspector-k">Room</span>
              <span className="vlc-inspector-v">{roomName}</span>
            </div>
            <div className="vlc-inspector-field">
              <span className="vlc-inspector-k">Piece</span>
              <span className="vlc-inspector-v">{piece.name.trim() || "Piece"}</span>
            </div>
            <div className="vlc-inspector-field">
              <span className="vlc-inspector-k">Type</span>
              <span className="vlc-inspector-v">{categoryLabel(cat)}</span>
            </div>
            <div className="vlc-inspector-field">
              <span className="vlc-inspector-k">Dimensions</span>
              <span className="vlc-inspector-v">
                {hasDims ? (
                  <>
                    {piece.lengthIn}" × {piece.depthIn}" ({piece.shape})
                  </>
                ) : (
                  <span className="vlc-inspector-warn">Enter in room builder</span>
                )}
              </span>
            </div>
            <div className="vlc-inspector-field">
              <span className="vlc-inspector-k">Est. SF</span>
              <span className="vlc-inspector-v">{hasDims ? `~${sf.toFixed(2)} sf` : "—"}</span>
            </div>
            <div className="vlc-inspector-field">
              <span className="vlc-inspector-k">Material</span>
              <span className="vlc-inspector-v">
                {eg}
                {mixed ? <span className="vlc-mixed-inline">Mixed tier</span> : null}
              </span>
            </div>
            <div className="vlc-inspector-field">
              <span className="vlc-inspector-k">Color</span>
              <span className="vlc-inspector-v">{effectiveColorLabel(room, piece, estimateColorTbd)}</span>
            </div>
            <div className="vlc-inspector-field">
              <span className="vlc-inspector-k">Rotation</span>
              <span className="vlc-inspector-v">{entry.rotation}°</span>
            </div>
            {piece.pieceType === "counter" && piece.addSplash ? (
              <div className="vlc-inspector-field vlc-inspector-span">
                <span className="vlc-inspector-k">Note</span>
                <span className="vlc-inspector-v muted small">Includes 4″ backsplash add-on on this piece.</span>
              </div>
            ) : null}
          </div>
          <div className="vlc-inspector-actions vlc-no-drag">
            <button type="button" className="vlc-inspector-btn" onClick={() => rotatePieceTo(sel, fallback, prevRotation(entry.rotation))}>
              −90°
            </button>
            <button type="button" className="vlc-inspector-btn" onClick={() => rotatePieceTo(sel, fallback, nextRotation(entry.rotation))}>
              +90°
            </button>
            <button type="button" className="vlc-inspector-btn" onClick={() => resetPieceLayout(sel)}>
              Reset piece
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!rooms.length) {
    return (
      <div className="vlc-scope">
        <div className="vlc-root vlc-root-empty">
          <p className="vlc-empty-title">No rooms yet</p>
          <p className="vlc-empty-hint">Add a room in <strong>Rooms / Areas</strong> to preview scope here.</p>
          <p className="vlc-disclaimer">Visual verification only — pricing uses entered dimensions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vlc-scope">
      <div className="vlc-root">
      <div className="vlc-banner" role="note">
        <strong>Visual verification only</strong> — pricing uses entered dimensions in the room builder. Layout gestures here do not change totals or saved
        geometry.
      </div>

      {!anyRenderablePiece ? (
        <div className="vlc-empty-board-msg">
          Add <strong>guided pieces</strong> with length and depth (or a <strong>Vanity</strong> room) to populate this canvas. Manual /
          linear sq ft entries stay in the room builder.
        </div>
      ) : null}

      <div className="vlc-room-grid">
        {roomPiecePlans.map(({ room, items }) => {
          const roomName = room.name.trim() || room.roomType || "Room";
          const roomDefaults = computeDefaultLayouts(room, items);
          const contentH = boardContentHeight(roomDefaults, items, layoutByPieceKey);
          const boardH = Math.min(Math.max(contentH, 112), 440);

          const pieceKeys = items.map((i) => i.key);
          let guidedSeq = 0;

          return (
            <div key={room.id} className="vlc-room-card">
              <div className="vlc-room-head-row">
                <header className="vlc-room-head">
                  <h3 className="vlc-room-title">{roomName}</h3>
                  <span className="vlc-room-meta muted small">
                    {room.roomType}
                    {room.calcMode === "Guided Shape" ? " · Guided shape" : ""}
                    {room.calcMode === "Manual Sq Ft" ? " · Manual sq ft" : ""}
                    {room.calcMode === "Rapid Linear Foot" ? " · Rapid linear" : ""}
                  </span>
                </header>
                <button
                  type="button"
                  className="vlc-room-arrange vlc-no-drag"
                  title="Reset visual positions for this room only"
                  onClick={() => autoArrangeRoom(pieceKeys)}
                >
                  Auto arrange
                </button>
              </div>

              <div
                className="vlc-room-board"
                style={{ height: boardH }}
                aria-label={`Visual layout for ${roomName}`}
                ref={(el) => {
                  if (el) boardRefs.current.set(room.id, el);
                  else boardRefs.current.delete(room.id);
                }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest(".vlc-slab")) return;
                  setSelectedKey(null);
                }}
              >
                {items.map((item) => {
                  if (item.kind === "vanity") {
                    const key = item.key;
                    const fb = roomDefaults[key] ?? { x: PACK_PAD, y: PACK_PAD, rotation: 0 };
                    const entry = getEntry(key, fb);
                    const pw = 176;
                    const ph = 112;
                    const sk = room.vanity.size;
                    const spec = sk !== "none" ? VANITY_PRICING[sk] : null;
                    const titleShort = compactPieceTitle(spec?.name ?? "Vanity", "vanity", 1);
                    const g = String(room.materialGroup || "Group Promo").trim();
                    const accent = groupAccent(g);
                    const sel = selectedKey === key;
                    const chip = abbrevMaterialTier(g);
                    return (
                      <div
                        key={key}
                        className={`vlc-slab vlc-slab-vanity vlc-draggable ${sel ? "vlc-slab-selected" : ""}`}
                        style={{
                          left: entry.x,
                          top: entry.y,
                          width: pw,
                          height: ph,
                          ["--vlc-face-edge" as string]: accent.border
                        }}
                        onPointerDown={(e) => handlePiecePointerDown(e, key, fb, pw, ph, room.id)}
                      >
                        <div className="vlc-slab-spin" style={{ transform: `rotate(${entry.rotation}deg)` }}>
                          <div className="vlc-slab-inner" style={{ transform: `rotate(${-entry.rotation}deg)` }}>
                            <div className="vlc-slab-cat-vanity">
                              <div className="vlc-slab-face vlc-slab-stone">
                                <span className="vlc-slab-title">{titleShort}</span>
                                <span className="vlc-slab-chip">{chip}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const piece = item.piece;
                  guidedSeq += 1;
                  const key = item.key;
                  const fb = roomDefaults[key] ?? { x: PACK_PAD, y: PACK_PAD, rotation: 0 };
                  const entry = getEntry(key, fb);
                  const hasDims = piece.lengthIn > 0 && piece.depthIn > 0;
                  const eg = effectiveMaterialGroup(room, piece);
                  const accent = groupAccent(eg);
                  const cat = classifyPiece(room, piece);
                  const { w: fw, h: fh } = hasDims ? visualFootprint(piece.lengthIn, piece.depthIn, entry.rotation) : { w: 148, h: 76 };
                  const sel = selectedKey === key;
                  const compact =
                    fw < 132 ||
                    fh < 56 ||
                    (hasDims && piece.lengthIn * piece.depthIn < 720 && fw < 160);
                  const titleNormal = normalSlabTitle(piece.name || "Piece");
                  const titleCompact = compactPieceTitle(piece.name || "", cat, guidedSeq);
                  const chip = abbrevMaterialTier(eg);
                  const showDualLine = !compact && fw >= 100 && fh >= 54;

                  return (
                    <div
                      key={key}
                      className={`vlc-slab vlc-draggable ${!hasDims ? "vlc-slab-incomplete" : ""} ${sel ? "vlc-slab-selected" : ""} ${compact ? "vlc-slab-compact" : ""}`}
                      style={{
                        left: entry.x,
                        top: entry.y,
                        width: fw,
                        height: fh,
                        ["--vlc-face-edge" as string]: accent.border
                      }}
                      onPointerDown={(e) => handlePiecePointerDown(e, key, fb, fw, fh, room.id)}
                    >
                      <div className="vlc-slab-spin" style={{ transform: `rotate(${entry.rotation}deg)` }}>
                        <div className="vlc-slab-inner" style={{ transform: `rotate(${-entry.rotation}deg)` }}>
                          <div className={`vlc-slab-cat-${cat}`}>
                            <div className="vlc-slab-face vlc-slab-stone">
                              {compact ? (
                                <div className="vlc-slab-micro">
                                  <span className="vlc-slab-micro-tier">{chip}</span>
                                  <span className="vlc-slab-micro-name">{titleCompact}</span>
                                </div>
                              ) : showDualLine ? (
                                <>
                                  <span className="vlc-slab-title">{titleNormal}</span>
                                  <span className="vlc-slab-chip">{chip}</span>
                                </>
                              ) : (
                                <div className="vlc-slab-micro">
                                  <span className="vlc-slab-micro-tier">{chip}</span>
                                  <span className="vlc-slab-micro-name">{titleNormal}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {renderInspector(room, items, roomDefaults, roomName)}
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}
