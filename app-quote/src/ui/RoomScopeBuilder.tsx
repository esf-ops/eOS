import React from "react";
import type {
  EliteProgramColorRow,
  GuidedGroupBacksplashMode,
  GuidedOverlapMode,
  GuidedPiece,
  GuidedShapeGroupType,
  RoomCalcMode,
  RoomDraft,
  RoomUseTaxMode,
  VanityKitchenTier,
  VanitySinkType
} from "../lib/quoteTypes";
import { INTERNAL_ESTIMATE_MEASURE_OPTIONS } from "../lib/prototypeQuoteMath";
import {
  appendGuidedShapeGroup,
  appendGuidedShapeGroupFromPreset,
  groupTotalsPreview,
  groupTypeLabel,
  normalizeGuidedShapeRoom,
  removeGuidedShapeGroup,
  roomGuidedGroupsPreview,
  updateGuidedShapeGroup,
  type GuidedShapeQuickPreset
} from "../lib/guidedShapeGroups";
import {
  ADDON_CATALOG,
  createEstimatorRoom,
  defaultVanityKitchenTier,
  newId,
  priceVanityRoomDraft,
  resolveRoomUseTaxPercent,
  roomEditorDomId,
  VANITY_PRICING
} from "../lib/prototypeQuoteMath";
import { VANITY_PROGRAM_2026_RATES, VANITY_PROGRAM_YEAR } from "../lib/vanityProgram2026";
import { buildGuidedShapeMathAudit, detectLikelyBacksplashDoubleCount } from "../lib/guidedShapeMathAudit";
import {
  depthPatchForGuidedPieceTypeChange,
  qualifyingSfFromRoomDrafts,
  sfFromGuidedPiece,
  STANDARD_BACKSPLASH_HEIGHT_IN,
  STANDARD_COUNTER_DEPTH_IN
} from "../lib/measurementEngine";

type Props = {
  rooms: RoomDraft[];
  onRoomsChange: (next: RoomDraft[]) => void;
  materialGroups: string[];
  /** Optional Elite Program catalog from eliteOS Brain (search + filter). */
  eliteProgramColors?: EliteProgramColorRow[];
  /** Internal Estimate Head: hide rapid linear path (spec — not offered in this head). */
  hideRapidLinear?: boolean;
  /** Project default use tax % for rooms with inherit_project. */
  projectUseTaxPercent?: number;
  /** Show per-room use tax controls (Internal Estimate). */
  showRoomUseTax?: boolean;
  /** Internal Estimate: confirm destructive actions and show undo snackbar. */
  enableDestructiveGuards?: boolean;
};

function updateRoom(rooms: RoomDraft[], id: string, patch: Partial<RoomDraft>): RoomDraft[] {
  return rooms.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

function updateRoomNested<K extends keyof RoomDraft>(rooms: RoomDraft[], id: string, key: K, val: RoomDraft[K]): RoomDraft[] {
  return rooms.map((r) => (r.id === id ? { ...r, [key]: val } : r));
}

function overlapModeOptionLabel(mode: GuidedOverlapMode): string {
  switch (mode) {
    case "none":
      return "Gross runs (no corner deduction)";
    case "auto":
      return "Auto corner deduction (L/U)";
    case "L-Shape":
      return "L-shape — one corner";
    case "U-Shape":
      return "U-shape — two corners";
    default:
      return mode;
  }
}

function roomTotalsPreview(room: RoomDraft): { counter: number; splashFhb: number; total: number } {
  if (room.roomType === "Vanity") return { counter: 0, splashFhb: 0, total: 0 };
  let c = 0;
  let s = 0;
  let f = 0;
  if (room.calcMode === "Manual Sq Ft") {
    c = room.direct.counter;
    s = room.direct.splash;
  } else if (room.calcMode === "Rapid Linear Foot") {
    const w = room.linear.wallFt * 2.125;
    c += w;
    if (room.linear.splashIn > 0) s += room.linear.wallFt * (room.linear.splashIn / 12);
    c += room.linear.islandL * room.linear.islandW;
  } else {
    const g = roomGuidedGroupsPreview(normalizeGuidedShapeRoom(room));
    c = g.counter;
    s = g.splashFhb;
  }
  if (room.fhbMode === "Manual Sq Ft") f += room.fhbDirectSf;
  if (room.fhbMode === "Guided Shape") {
    for (const p of room.fhbPieces) {
      f += sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
    }
  }
  const t = c + s + f;
  return { counter: Math.round(c * 100) / 100, splashFhb: Math.round((s + f) * 100) / 100, total: Math.round(t * 100) / 100 };
}

function renderMiniVisual(room: RoomDraft): React.ReactNode {
  const pieces = room.guidedPieces.filter((p) => p.lengthIn > 0 && p.depthIn > 0);
  if (!pieces.length) {
    return <p className="muted small">Add guided pieces with length and depth to preview layout.</p>;
  }
  let y = 12;
  const blocks: React.ReactNode[] = [];
  let maxW = 120;
  for (const p of pieces.slice(0, 8)) {
    const w = Math.max(28, Math.min(120, p.lengthIn * 0.9));
    const h = Math.max(14, Math.min(48, p.depthIn * 1.1));
    const fill = p.pieceType === "counter" ? "#fee2e2" : "#dbeafe";
    const stroke = p.pieceType === "counter" ? "#b91c1c" : "#2563eb";
    blocks.push(
      <rect key={p.id} x={12} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={1} rx={3} />
    );
    blocks.push(
      <text key={`${p.id}-t`} x={16} y={y + 14} fontSize={9} fill="#334155">
        {(p.name || "Piece").slice(0, 18)}
      </text>
    );
    y += h + 8;
    maxW = Math.max(maxW, w + 24);
  }
  const h = Math.max(56, y + 8);
  return (
    <div className="room-visual-wrap">
      <div className="muted small" style={{ marginBottom: 6 }}>
        Layout preview (diagram only — not to scale)
      </div>
      <svg width="100%" viewBox={`0 0 ${maxW} ${h}`} style={{ maxHeight: 200, border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }}>
        {blocks}
      </svg>
    </div>
  );
}

export default function RoomScopeBuilder({
  rooms,
  onRoomsChange,
  materialGroups,
  eliteProgramColors,
  hideRapidLinear = false,
  projectUseTaxPercent = 0,
  showRoomUseTax = false,
  enableDestructiveGuards = false
}: Props) {
  const [colorQ, setColorQ] = React.useState<Record<string, string>>({});
  const [groupFilter, setGroupFilter] = React.useState<Record<string, string>>({});
  const [pieceOverridesOpen, setPieceOverridesOpen] = React.useState<Record<string, boolean>>({});
  const [selectedGroupByRoom, setSelectedGroupByRoom] = React.useState<Record<string, string>>({});
  const [undoSnapshot, setUndoSnapshot] = React.useState<{ rooms: RoomDraft[]; message: string } | null>(null);

  React.useEffect(() => {
    if (!undoSnapshot) return;
    const t = window.setTimeout(() => setUndoSnapshot(null), 12_000);
    return () => window.clearTimeout(t);
  }, [undoSnapshot]);

  const cloneRooms = (list: RoomDraft[]): RoomDraft[] =>
    list.map((r) => ({
      ...r,
      addons: { ...r.addons },
      direct: { ...r.direct },
      linear: { ...r.linear },
      vanity: { ...r.vanity },
      guidedPieces: r.guidedPieces.map((p) => ({ ...p })),
      guidedShapeGroups: r.guidedShapeGroups?.map((g) => ({ ...g, pieces: g.pieces.map((p) => ({ ...p })) })),
      fhbPieces: r.fhbPieces.map((p) => ({ ...p }))
    }));

  const addRoom = () => onRoomsChange([...rooms, createEstimatorRoom(rooms[0]?.materialGroup || "Group Promo")]);

  const removeRoom = (id: string) => {
    if (enableDestructiveGuards) {
      const room = rooms.find((r) => r.id === id);
      const label = room?.name?.trim() || "this room";
      if (
        !window.confirm(
          `Remove ${label}?\n\nThis removes the room and all pieces from the estimate. This can change the estimate total.`
        )
      ) {
        return;
      }
      setUndoSnapshot({ rooms: cloneRooms(rooms), message: "Room removed" });
    }
    onRoomsChange(rooms.filter((r) => r.id !== id));
  };

  const setPiece = (roomId: string, pieceId: string, patch: Partial<GuidedPiece>, list: "guided" | "fhb") => {
    const next = rooms.map((r) => {
      if (r.id !== roomId) return r;
      if (list === "fhb") {
        const arr = [...r.fhbPieces];
        const idx = arr.findIndex((p) => p.id === pieceId);
        if (idx < 0) return r;
        arr[idx] = { ...arr[idx], ...patch };
        return { ...r, fhbPieces: arr };
      }
      const norm = normalizeGuidedShapeRoom(r);
      const groups = (norm.guidedShapeGroups || []).map((g) => ({
        ...g,
        pieces: g.pieces.map((p) => (p.id === pieceId ? { ...p, ...patch } : p))
      }));
      return normalizeGuidedShapeRoom({ ...norm, guidedShapeGroups: groups });
    });
    onRoomsChange(next);
  };

  const addPiece = (roomId: string, list: "guided" | "fhb", groupId?: string) => {
    const piece: GuidedPiece = {
      id: newId(),
      pieceType: list === "fhb" ? "fhb" : "counter",
      name: list === "fhb" ? "Full height section" : "Counter section",
      lengthIn: 0,
      depthIn: list === "fhb" ? 18 : STANDARD_COUNTER_DEPTH_IN,
      shape: "rect"
    };
    onRoomsChange(
      rooms.map((r) => {
        if (r.id !== roomId) return r;
        if (list === "fhb") return { ...r, fhbPieces: [...r.fhbPieces, piece] };
        const norm = normalizeGuidedShapeRoom(r);
        const groups = norm.guidedShapeGroups || [];
        const targetId = groupId || selectedGroupByRoom[roomId] || groups[groups.length - 1]?.id;
        if (!targetId) return appendGuidedShapeGroup(r, "manual");
        const nextGroups = groups.map((g) =>
          g.id === targetId ? { ...g, pieces: [...g.pieces, piece] } : g
        );
        return normalizeGuidedShapeRoom({ ...norm, guidedShapeGroups: nextGroups });
      })
    );
  };

  const removePiece = (roomId: string, pieceId: string, list: "guided" | "fhb") => {
    if (enableDestructiveGuards) {
      const room = rooms.find((r) => r.id === roomId);
      const norm = room ? normalizeGuidedShapeRoom(room) : null;
      const piece =
        list === "guided"
          ? norm?.guidedPieces.find((p) => p.id === pieceId)
          : room?.fhbPieces.find((p) => p.id === pieceId);
      const label = piece?.name?.trim() || "this piece";
      if (!window.confirm(`Remove ${label}?\n\nThis can change the estimate total.`)) return;
      setUndoSnapshot({ rooms: cloneRooms(rooms), message: "Piece removed" });
    }
    onRoomsChange(
      rooms.map((r) => {
        if (r.id !== roomId) return r;
        if (list === "fhb") return { ...r, fhbPieces: r.fhbPieces.filter((p) => p.id !== pieceId) };
        const norm = normalizeGuidedShapeRoom(r);
        const groups = (norm.guidedShapeGroups || []).map((g) => ({
          ...g,
          pieces: g.pieces.filter((p) => p.id !== pieceId)
        }));
        return normalizeGuidedShapeRoom({ ...norm, guidedShapeGroups: groups });
      })
    );
  };

  const appendShapeGroup = (roomId: string, shapeType: GuidedShapeGroupType) => {
    onRoomsChange(
      rooms.map((r) => {
        if (r.id !== roomId) return r;
        const next = appendGuidedShapeGroup(r, shapeType);
        const gid = next.guidedShapeGroups?.[next.guidedShapeGroups.length - 1]?.id;
        if (gid) setSelectedGroupByRoom((m) => ({ ...m, [roomId]: gid }));
        return next;
      })
    );
  };

  const appendShapeGroupPreset = (roomId: string, preset: GuidedShapeQuickPreset) => {
    onRoomsChange(
      rooms.map((r) => {
        if (r.id !== roomId) return r;
        const next = appendGuidedShapeGroupFromPreset(r, preset);
        const gid = next.guidedShapeGroups?.[next.guidedShapeGroups.length - 1]?.id;
        if (gid) setSelectedGroupByRoom((m) => ({ ...m, [roomId]: gid }));
        return next;
      })
    );
  };

  const removeShapeGroup = (roomId: string, groupId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    const norm = room ? normalizeGuidedShapeRoom(room) : null;
    const grp = norm?.guidedShapeGroups?.find((g) => g.id === groupId);
    const label = grp?.name?.trim() || "this shape group";
    if (enableDestructiveGuards) {
      if (!window.confirm(`Remove shape group “${label}” and all its pieces?\n\nThis can change the estimate total.`)) return;
      setUndoSnapshot({ rooms: cloneRooms(rooms), message: "Shape group removed" });
    }
    onRoomsChange(rooms.map((r) => (r.id === roomId ? removeGuidedShapeGroup(r, groupId) : r)));
  };

  const renameShapeGroup = (roomId: string, groupId: string, name: string) => {
    onRoomsChange(rooms.map((r) => (r.id === roomId ? updateGuidedShapeGroup(r, groupId, { name }) : r)));
  };

  const setGroupOverlapMode = (roomId: string, groupId: string, overlapMode: GuidedOverlapMode) => {
    onRoomsChange(rooms.map((r) => (r.id === roomId ? updateGuidedShapeGroup(r, groupId, { overlapMode }) : r)));
  };

  const setGroupBacksplashMode = (roomId: string, groupId: string, backsplashMode: GuidedGroupBacksplashMode) => {
    onRoomsChange(rooms.map((r) => (r.id === roomId ? updateGuidedShapeGroup(r, groupId, { backsplashMode }) : r)));
  };

  const restoreUndo = () => {
    if (!undoSnapshot) return;
    onRoomsChange(undoSnapshot.rooms);
    setUndoSnapshot(null);
  };

  return (
    <div className="room-builder">
      {enableDestructiveGuards && undoSnapshot ? (
        <div className="ie-undo-toast" role="status">
          <span>{undoSnapshot.message}. </span>
          <button type="button" className="btn secondary btn-sm" onClick={restoreUndo}>
            Undo
          </button>
        </div>
      ) : null}
      <div className="room-builder-toolbar">
        <button type="button" className="btn secondary" onClick={addRoom}>
          + Add room
        </button>
        <span className="muted small">
          {rooms.length} room{rooms.length === 1 ? "" : "s"}
        </span>
      </div>

      {rooms.map((room) => {
        const prev = roomTotalsPreview(room);
        return (
          <div key={room.id} id={roomEditorDomId(room.id)} className="room-card-lite card">
            <div className="room-card-head">
              <h3 className="room-card-title">Room / Area</h3>
              {rooms.length > 1 ? (
                <button type="button" className="btn secondary btn-danger-quiet" onClick={() => removeRoom(room.id)}>
                  Remove room
                </button>
              ) : null}
            </div>

            <div className="grid3">
              <label>
                Name
                <input
                  value={room.name}
                  onChange={(e) => onRoomsChange(updateRoom(rooms, room.id, { name: e.target.value }))}
                />
              </label>
              <label>
                Type
                <select
                  value={room.roomType}
                  onChange={(e) => onRoomsChange(updateRoom(rooms, room.id, { roomType: e.target.value }))}
                >
                  {["Kitchen", "Island", "Laundry", "Bar", "Pantry", "Fireplace", "Shower", "Vanity", "Other"].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
                <label>
                  Price group (required for this room)
                  <select
                  value={room.materialGroup}
                  onChange={(e) => onRoomsChange(updateRoom(rooms, room.id, { materialGroup: e.target.value }))}
                >
                  {materialGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {eliteProgramColors && eliteProgramColors.length ? (
              <div className="grid3" style={{ marginTop: 10 }}>
                <label style={{ gridColumn: "1 / -1" }}>
                  Room color (optional — use &quot;Color TBD&quot; in notes if needed)
                  <input
                    value={colorQ[room.id] ?? ""}
                    onChange={(e) => setColorQ((m) => ({ ...m, [room.id]: e.target.value }))}
                    placeholder="Type to filter catalog, then pick a row below"
                  />
                </label>
                <label>
                  Price group filter
                  <select
                    value={groupFilter[room.id] ?? "__all__"}
                    onChange={(e) => setGroupFilter((m) => ({ ...m, [room.id]: e.target.value }))}
                  >
                    <option value="__all__">All groups</option>
                    {materialGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Pick catalog color (optional)
                  <select
                    value={room.materialCatalogId || ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) {
                        onRoomsChange(
                          updateRoom(rooms, room.id, {
                            materialCatalogId: null,
                            materialColor: undefined,
                            materialSupplier: undefined,
                            materialType: undefined
                          })
                        );
                        return;
                      }
                      const c = eliteProgramColors.find((x) => x.id === id);
                      if (!c) return;
                      onRoomsChange(
                        updateRoom(rooms, room.id, {
                          materialGroup: c.priceGroupLabel,
                          materialColor: c.colorName,
                          materialSupplier: c.supplier ?? undefined,
                          materialType: c.materialType ?? undefined,
                          materialCatalogId: c.id
                        })
                      );
                    }}
                  >
                    <option value="">— Color TBD / group only —</option>
                    {eliteProgramColors
                      .filter((c) => {
                        const q = (colorQ[room.id] || "").toLowerCase().trim();
                        const gf = groupFilter[room.id];
                        if (gf && gf !== "__all__" && c.priceGroupLabel !== gf) return false;
                        if (!q) return true;
                        return (
                          c.colorName.toLowerCase().includes(q) ||
                          (c.supplier || "").toLowerCase().includes(q) ||
                          (c.materialType || "").toLowerCase().includes(q) ||
                          c.priceGroupLabel.toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 500)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.priceGroupLabel} · {c.colorName}
                          {c.supplier ? ` (${c.supplier})` : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="muted small" style={{ gridColumn: "1 / -1", marginTop: 0 }}>
                  <strong>Room material</strong> applies to countertop and backsplash pieces in this room. Backsplash inherits the
                  room color unless you set a piece override (advanced).
                </p>
              </div>
            ) : null}

            {room.roomType === "Vanity" ? (
              <div className="room-vanity-block">
                <p className="muted small">
                  2026 Vanity Program — 22.5″ standard depth. PROMO / Elite 100 remnants. Customer display rounds to nearest $5.
                </p>
                <div className="grid3">
                  <label>
                    Vanity size
                    <select
                      value={room.vanity.size}
                      onChange={(e) => {
                        const code = e.target.value;
                        const row = VANITY_PROGRAM_2026_RATES.find((r) => r.code === code);
                        onRoomsChange(
                          updateRoomNested(rooms, room.id, "vanity", {
                            ...room.vanity,
                            size: code,
                            isVanityProgram: true,
                            vanityProgramYear: VANITY_PROGRAM_YEAR,
                            vanityWidth: row?.widthIn,
                            vanityBowlType: row?.bowlCount === 2 ? "double" : "single",
                            source: "Promo / Stock 100 Remnant"
                          })
                        );
                      }}
                    >
                      <option value="none">— Select —</option>
                      {VANITY_PROGRAM_2026_RATES.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Source
                    <select
                      value={room.vanity.source}
                      onChange={(e) =>
                        onRoomsChange(
                          updateRoomNested(rooms, room.id, "vanity", {
                            ...room.vanity,
                            source: e.target.value as RoomDraft["vanity"]["source"]
                          })
                        )
                      }
                    >
                      <option value="Promo / Stock 100 Remnant">2026 Vanity Program (Promo / Elite 100)</option>
                      <option value="ESF Non-Stock Remnant">ESF Non-Stock Remnant (legacy)</option>
                    </select>
                  </label>
                  <label>
                    Qty
                    <input
                      type="number"
                      min={1}
                      value={room.vanity.qty}
                      onChange={(e) =>
                        onRoomsChange(
                          updateRoomNested(rooms, room.id, "vanity", { ...room.vanity, qty: Number(e.target.value) || 1 })
                        )
                      }
                    />
                  </label>
                  {room.vanity.source === "Promo / Stock 100 Remnant" ? (
                    <>
                      <label>
                        Kitchen tier
                        <select
                          value={room.vanity.vanityTier ?? defaultVanityKitchenTier(qualifyingSfFromRoomDrafts(rooms))}
                          onChange={(e) =>
                            onRoomsChange(
                              updateRoomNested(rooms, room.id, "vanity", {
                                ...room.vanity,
                                vanityTier: e.target.value as VanityKitchenTier
                              })
                            )
                          }
                        >
                          <option value="kitchen_over_35">Kitchen tops ≥ 35 sf</option>
                          <option value="kitchen_under_35">Kitchen tops &lt; 35 sf</option>
                        </select>
                      </label>
                      <label>
                        Tier override note
                        <input
                          value={room.vanity.vanityTierOverrideReason ?? ""}
                          placeholder="e.g. Template/install with kitchen"
                          onChange={(e) =>
                            onRoomsChange(
                              updateRoomNested(rooms, room.id, "vanity", {
                                ...room.vanity,
                                vanityTierOverrideReason: e.target.value
                              })
                            )
                          }
                        />
                      </label>
                      <label>
                        Sink package
                        <select
                          value={room.vanity.vanitySinkType ?? "oval_white"}
                          onChange={(e) =>
                            onRoomsChange(
                              updateRoomNested(rooms, room.id, "vanity", {
                                ...room.vanity,
                                vanitySinkType: e.target.value as VanitySinkType
                              })
                            )
                          }
                        >
                          <option value="oval_white">White oval (included)</option>
                          <option value="oval_bisque">Bisque oval (+$10/sink)</option>
                          <option value="rectangular_white">Rectangular white (+$25/sink)</option>
                          <option value="rectangular_bisque">Rectangular bisque (+$25/sink)</option>
                        </select>
                      </label>
                      <label>
                        Extra template/install trips
                        <input
                          type="number"
                          min={0}
                          value={room.vanity.vanityExtraTrips ?? 0}
                          onChange={(e) =>
                            onRoomsChange(
                              updateRoomNested(rooms, room.id, "vanity", {
                                ...room.vanity,
                                vanityExtraTrips: Math.max(0, Math.floor(Number(e.target.value) || 0))
                              })
                            )
                          }
                        />
                      </label>
                      <label className="ie-check-row" style={{ gridColumn: "1 / -1" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(room.vanity.outsideProgram)}
                          onChange={(e) =>
                            onRoomsChange(
                              updateRoomNested(rooms, room.id, "vanity", {
                                ...room.vanity,
                                outsideProgram: e.target.checked
                              })
                            )
                          }
                        />
                        Quote outside vanity program (material purchase required)
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Depth (in)
                        <input
                          type="number"
                          value={room.vanity.depth}
                          onChange={(e) =>
                            onRoomsChange(
                              updateRoomNested(rooms, room.id, "vanity", {
                                ...room.vanity,
                                depth: Number(e.target.value) || 22.5
                              })
                            )
                          }
                        />
                      </label>
                      <label>
                        Bowl option (non-stock)
                        <select
                          value={String(room.vanity.bowl)}
                          onChange={(e) =>
                            onRoomsChange(
                              updateRoomNested(rooms, room.id, "vanity", { ...room.vanity, bowl: Number(e.target.value) })
                            )
                          }
                        >
                          <option value="0">No / partner provided ($0)</option>
                          <option value="35">Oval ($35)</option>
                          <option value="55">Rectangle ($55 + $25 rect.)</option>
                        </select>
                      </label>
                    </>
                  )}
                </div>
                {room.vanity.size !== "none" && room.vanity.source === "Promo / Stock 100 Remnant" ? (
                  <p className="muted small" style={{ marginTop: 8 }}>
                    {(() => {
                      const priced = priceVanityRoomDraft(room, qualifyingSfFromRoomDrafts(rooms));
                      if (!priced) return null;
                      return (
                        <>
                          Program estimate: <strong>${priced.exactTotal.toFixed(2)}</strong> exact ·{" "}
                          <strong>${priced.displayTotal.toLocaleString()}</strong> customer ($5 rounding) · {priced.tierLabel}
                        </>
                      );
                    })()}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="grid3" style={{ marginTop: 12 }}>
                  <label>
                    How to measure this room
                    {hideRapidLinear ? (
                      <div className="ie-measure-toggle" role="group" aria-label="How to measure this room">
                        <button
                          type="button"
                          className={`ie-measure-toggle-btn ${room.calcMode === "Guided Shape" ? "on" : ""}`}
                          onClick={() => onRoomsChange(updateRoom(rooms, room.id, { calcMode: "Guided Shape" }))}
                        >
                          Build from runs
                        </button>
                        <button
                          type="button"
                          className={`ie-measure-toggle-btn ${room.calcMode === "Manual Sq Ft" ? "on" : ""}`}
                          onClick={() => onRoomsChange(updateRoom(rooms, room.id, { calcMode: "Manual Sq Ft" }))}
                        >
                          Manual square footage
                        </button>
                      </div>
                    ) : (
                      <select
                        value={room.calcMode}
                        onChange={(e) =>
                          onRoomsChange(updateRoom(rooms, room.id, { calcMode: e.target.value as RoomCalcMode }))
                        }
                      >
                        <option>Guided Shape</option>
                        <option>Rapid Linear Foot</option>
                        <option>Manual Sq Ft</option>
                      </select>
                    )}
                  </label>
                  <label>
                    Raised bar?
                    <select
                      value={room.raised}
                      onChange={(e) =>
                        onRoomsChange(updateRoom(rooms, room.id, { raised: e.target.value as RoomDraft["raised"] }))
                      }
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </label>
                  <label>
                    Room notes
                    <input
                      value={room.notes}
                      onChange={(e) => onRoomsChange(updateRoom(rooms, room.id, { notes: e.target.value }))}
                      placeholder="Optional"
                    />
                  </label>
                </div>

                {room.calcMode === "Guided Shape" ? (
                  <div className="room-panel">
                    <p className="muted small" style={{ marginTop: 0 }}>
                      Enter each counter area as its own group (e.g. stove wall + main U-shape). Enter run lengths in inches; depth
                      defaults to 25.5″ for counters.
                    </p>
                    <div className="ie-esf-measure-callout muted small">
                      <strong>eliteOS pricing:</strong> Chargeable counter SF rounds up from exact measured SF. Backsplash uses exact
                      SF. Use <strong>gross runs</strong> when matching a quote measured by total run length.
                    </div>
                    <div className="ie-shape-group-add-row">
                      <span className="muted small">Quick add:</span>
                      {enableDestructiveGuards ? (
                        <>
                          <button
                            type="button"
                            className="btn secondary btn-sm ie-preset-btn"
                            onClick={() => appendShapeGroupPreset(room.id, "stove_wall")}
                          >
                            + Stove wall
                          </button>
                          <button
                            type="button"
                            className="btn secondary btn-sm ie-preset-btn"
                            onClick={() => appendShapeGroupPreset(room.id, "main_u")}
                          >
                            + Main U-shape
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        onClick={() => appendShapeGroup(room.id, "straight")}
                      >
                        + Straight run
                      </button>
                      <button type="button" className="btn secondary btn-sm" onClick={() => appendShapeGroup(room.id, "L-Shape")}>
                        + L-shape
                      </button>
                      <button type="button" className="btn secondary btn-sm" onClick={() => appendShapeGroup(room.id, "U-Shape")}>
                        + U-shape
                      </button>
                      <button type="button" className="btn secondary btn-sm" onClick={() => appendShapeGroup(room.id, "Island")}>
                        + Island
                      </button>
                    </div>
                    {(() => {
                      const norm = normalizeGuidedShapeRoom(room);
                      const groups = norm.guidedShapeGroups || [];
                      const selectedId = selectedGroupByRoom[room.id] || groups[groups.length - 1]?.id;
                      return groups.map((grp) => {
                        const gPrev = groupTotalsPreview(grp);
                        const isSelected = grp.id === selectedId;
                        return (
                          <div
                            key={grp.id}
                            className={`ie-shape-group-card${isSelected ? " is-selected" : ""}`}
                            onClick={() => setSelectedGroupByRoom((m) => ({ ...m, [room.id]: grp.id }))}
                          >
                            <div className="ie-shape-group-head">
                              <label className="ie-shape-group-name">
                                Area name
                                <input
                                  value={grp.name}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => renameShapeGroup(room.id, grp.id, e.target.value)}
                                />
                              </label>
                              <span className="ie-shape-group-type muted small">{groupTypeLabel(grp.shapeType)}</span>
                              <span className="ie-shape-group-sf muted small">
                                {gPrev.counter.toFixed(2)} counter sf · {gPrev.splashFhb.toFixed(2)} backsplash/FHB
                                {gPrev.overlap > 0 ? ` · −${gPrev.overlap.toFixed(2)} corners` : ""}
                              </span>
                              {groups.length > 1 ? (
                                <button
                                  type="button"
                                  className="btn secondary btn-danger-quiet btn-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeShapeGroup(room.id, grp.id);
                                  }}
                                >
                                  Remove area
                                </button>
                              ) : null}
                            </div>
                            {grp.pieces.map((p) => (
                              <div key={p.id} className="piece-row grid3 ie-piece-row-simple">
                                <label>
                                  Run label
                                  <input
                                    value={p.name}
                                    onChange={(e) => setPiece(room.id, p.id, { name: e.target.value }, "guided")}
                                  />
                                </label>
                                <label>
                                  Length (in)
                                  <input
                                    type="number"
                                    value={p.lengthIn || ""}
                                    onChange={(e) => setPiece(room.id, p.id, { lengthIn: Number(e.target.value) || 0 }, "guided")}
                                  />
                                </label>
                                <label>
                                  {p.pieceType === "splash" ? "Height (in)" : "Depth (in)"}
                                  <input
                                    type="number"
                                    value={p.depthIn || ""}
                                    placeholder={
                                      p.pieceType === "splash"
                                        ? String(STANDARD_BACKSPLASH_HEIGHT_IN)
                                        : String(STANDARD_COUNTER_DEPTH_IN)
                                    }
                                    onChange={(e) => setPiece(room.id, p.id, { depthIn: Number(e.target.value) || 0 }, "guided")}
                                  />
                                </label>
                                {p.pieceType === "counter" && grp.backsplashMode !== "exclude" ? (
                                  <label className="check ie-piece-splash-check">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(p.addSplash)}
                                      onChange={(e) => setPiece(room.id, p.id, { addSplash: e.target.checked }, "guided")}
                                    />
                                    Include 4″ backsplash on this run
                                  </label>
                                ) : null}
                                <div className="piece-row-remove">
                                  <button
                                    type="button"
                                    className="btn secondary btn-danger-quiet btn-sm"
                                    onClick={() => removePiece(room.id, p.id, "guided")}
                                  >
                                    Remove run
                                  </button>
                                </div>
                              </div>
                            ))}
                            <details className="ie-shape-group-advanced" onClick={(e) => e.stopPropagation()}>
                              <summary>Advanced measurement settings</summary>
                              <div className="ie-shape-group-advanced-body">
                                <ul className="ie-measure-help muted small">
                                  <li>Use gross runs when matching a quote measured by total run length.</li>
                                  <li>Use corner deduction when entered pieces overlap at corners.</li>
                                  <li>Chargeable counter SF rounds up from exact measured SF.</li>
                                  <li>Turn off backsplash for an area to price counter only (typical stove wall).</li>
                                </ul>
                                <label className="ie-shape-group-control">
                                  Corner / overlap
                                  <select
                                    value={grp.overlapMode ?? "auto"}
                                    onChange={(e) =>
                                      setGroupOverlapMode(room.id, grp.id, e.target.value as GuidedOverlapMode)
                                    }
                                  >
                                    <option value="none">{overlapModeOptionLabel("none")}</option>
                                    <option value="auto">{overlapModeOptionLabel("auto")}</option>
                                    <option value="L-Shape">{overlapModeOptionLabel("L-Shape")}</option>
                                    <option value="U-Shape">{overlapModeOptionLabel("U-Shape")}</option>
                                  </select>
                                </label>
                                <label className="ie-shape-group-control check">
                                  <input
                                    type="checkbox"
                                    checked={grp.backsplashMode !== "exclude"}
                                    onChange={(e) =>
                                      setGroupBacksplashMode(room.id, grp.id, e.target.checked ? "include" : "exclude")
                                    }
                                  />
                                  Include backsplash for this area
                                </label>
                                <label className="check">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(pieceOverridesOpen[room.id])}
                                    onChange={(e) =>
                                      setPieceOverridesOpen((m) => ({ ...m, [room.id]: e.target.checked }))
                                    }
                                  />
                                  Piece-level material overrides
                                </label>
                                {grp.pieces.map((p) => (
                                  <details key={`${p.id}-adv`} className="ie-piece-advanced">
                                    <summary>{p.name || "Run"} — type &amp; shape</summary>
                                    <div className="grid3">
                                      <label>
                                        Piece type
                                        <select
                                          value={p.pieceType}
                                          onChange={(e) => {
                                            const nextType = e.target.value as GuidedPiece["pieceType"];
                                            const depthPatch = depthPatchForGuidedPieceTypeChange(
                                              p.pieceType,
                                              nextType,
                                              p.depthIn
                                            );
                                            setPiece(room.id, p.id, { pieceType: nextType, ...depthPatch }, "guided");
                                          }}
                                        >
                                          <option value="counter">Counter</option>
                                          <option value="splash">Backsplash</option>
                                          <option value="fhb">Full height</option>
                                        </select>
                                      </label>
                                      <label>
                                        Shape
                                        <select
                                          value={p.shape}
                                          onChange={(e) =>
                                            setPiece(room.id, p.id, { shape: e.target.value as GuidedPiece["shape"] }, "guided")
                                          }
                                        >
                                          <option value="rect">Rectangle</option>
                                          <option value="tri">Triangle</option>
                                        </select>
                                      </label>
                                      {pieceOverridesOpen[room.id] && p.materialOverride !== undefined ? (
                                        <>
                                          <label className="check" style={{ gridColumn: "1 / -1" }}>
                                            <input
                                              type="checkbox"
                                              checked={Boolean(p.materialOverride)}
                                              onChange={(e) =>
                                                setPiece(
                                                  room.id,
                                                  p.id,
                                                  {
                                                    materialOverride: e.target.checked,
                                                    materialGroup: room.materialGroup
                                                  },
                                                  "guided"
                                                )
                                              }
                                            />
                                            Override material for this run
                                          </label>
                                          {p.materialOverride ? (
                                            <>
                                              <label>
                                                Material group
                                                <select
                                                  value={p.materialGroup || room.materialGroup}
                                                  onChange={(e) =>
                                                    setPiece(room.id, p.id, { materialGroup: e.target.value }, "guided")
                                                  }
                                                >
                                                  {materialGroups.map((g) => (
                                                    <option key={g} value={g}>
                                                      {g}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>
                                              <label>
                                                Color label
                                                <input
                                                  value={p.materialColor || ""}
                                                  onChange={(e) =>
                                                    setPiece(room.id, p.id, { materialColor: e.target.value }, "guided")
                                                  }
                                                />
                                              </label>
                                            </>
                                          ) : null}
                                        </>
                                      ) : null}
                                    </div>
                                  </details>
                                ))}
                              </div>
                            </details>
                            <div className="piece-add-row">
                              <button
                                type="button"
                                className="btn secondary btn-sm"
                                onClick={() => addPiece(room.id, "guided", grp.id)}
                              >
                                + Add run to {grp.name}
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()}
                    <details className="ie-layout-preview">
                      <summary className="muted small">Layout preview (diagram only)</summary>
                      {renderMiniVisual(normalizeGuidedShapeRoom(room))}
                    </details>
                    {enableDestructiveGuards ? (() => {
                      const backsplashDupWarnings = detectLikelyBacksplashDoubleCount(room);
                      const audit = buildGuidedShapeMathAudit(room, INTERNAL_ESTIMATE_MEASURE_OPTIONS);
                      if (!audit && !backsplashDupWarnings.length) return null;
                      return (
                        <>
                          {backsplashDupWarnings.length ? (
                            <div className="warn-box" style={{ marginTop: 10 }}>
                              <strong>Backsplash double-count risk</strong>
                              <ul className="mini-lines">
                                {backsplashDupWarnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {audit ? (
                        <details className="ie-guided-math-audit">
                          <summary>Shape math breakdown (audit — internal only)</summary>
                          <p className="muted small">
                            Priced totals use chargeable SF where noted.{" "}
                            {audit.groupAudits.length > 1 ? (
                              <>
                                <strong>{audit.groupAudits.length} shape groups</strong>
                              </>
                            ) : (
                              <>
                                Layout: <strong>{audit.layoutPreset}</strong>
                              </>
                            )}
                            {audit.cornerOverlapDeductionSf > 0 ? (
                              <>
                                {" "}
                                · Room overlap deducted: <strong>{audit.cornerOverlapDeductionSf.toFixed(2)} sf</strong>
                              </>
                            ) : null}
                          </p>
                          {audit.groupAudits.map((ga) => (
                            <div key={ga.groupId} className="ie-math-audit-group">
                              <p className="small">
                                <strong>{ga.groupName}</strong> ({ga.shapeType}) — {ga.overlapMode} · {ga.backsplashMode}
                                <br />
                                Counter {ga.finalCounterSf.toFixed(2)} sf
                                {ga.overlapDeductionSf > 0
                                  ? ` (raw ${ga.rawCounterSf.toFixed(2)} − overlap ${ga.overlapDeductionSf.toFixed(2)})`
                                  : ""}
                                {" · "}
                                splash/FHB {ga.finalSplashFhbSf.toFixed(2)} sf (exact)
                              </p>
                            </div>
                          ))}
                          <table className="ie-math-audit-table">
                            <thead>
                              <tr>
                                <th>Group</th>
                                <th>Piece</th>
                                <th>Type</th>
                                <th>Dimensions</th>
                                <th>Backsplash</th>
                                <th className="num">Raw SF</th>
                              </tr>
                            </thead>
                            <tbody>
                              {audit.pieceRows.map((row) => (
                                <tr key={row.pieceId}>
                                  <td>{row.groupName}</td>
                                  <td>{row.name}</td>
                                  <td>{row.pieceType}</td>
                                  <td>
                                    {row.lengthIn}&quot; × {row.depthIn}&quot; ({row.shape})
                                  </td>
                                  <td>{row.backsplashSource || (row.pieceType === "counter" ? "—" : row.pieceType)}</td>
                                  <td className="num">
                                    {row.rawSf.toFixed(2)}
                                    {row.addSplashSf > 0 ? ` + ${row.addSplashSf.toFixed(2)} splash` : ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <ul className="ie-math-audit-lines muted small">
                            {audit.detailLines.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                          <p className="muted small ie-math-audit-totals">
                            <strong>Exact counter SF:</strong> {audit.exactCounterSf.toFixed(2)}
                            {audit.counterRoundingAdjustment > 0 ? (
                              <>
                                {" "}
                                → <strong>Chargeable counter SF:</strong> {audit.chargeableCounterSf.toFixed(0)} (+
                                {audit.counterRoundingAdjustment.toFixed(2)} round-up)
                              </>
                            ) : (
                              <>
                                {" "}
                                · <strong>Chargeable counter SF:</strong> {audit.chargeableCounterSf.toFixed(2)}
                              </>
                            )}
                            <br />
                            <strong>Backsplash + FHB SF (exact, no round-up):</strong> {audit.finalBacksplashFhbSf.toFixed(2)}
                          </p>
                        </details>
                          ) : null}
                        </>
                      );
                    })() : null}
                  </div>
                ) : null}

                {room.calcMode === "Rapid Linear Foot" && !hideRapidLinear ? (
                  <div className="room-panel grid3">
                    <p className="muted small" style={{ gridColumn: "1 / -1" }}>
                      Wall cabinets in linear feet. Counter depth assumed 25.5″ (2.125 ft). Island in feet × feet.
                    </p>
                    <label>
                      Wall cabinets LF
                      <input
                        type="number"
                        value={room.linear.wallFt || ""}
                        onChange={(e) =>
                          onRoomsChange(
                            updateRoomNested(rooms, room.id, "linear", {
                              ...room.linear,
                              wallFt: Number(e.target.value) || 0
                            })
                          )
                        }
                      />
                    </label>
                    <label>
                      Splash height (in)
                      <input
                        type="number"
                        value={room.linear.splashIn || ""}
                        onChange={(e) =>
                          onRoomsChange(
                            updateRoomNested(rooms, room.id, "linear", {
                              ...room.linear,
                              splashIn: Number(e.target.value) || 0
                            })
                          )
                        }
                      />
                    </label>
                    <label>
                      Island length (ft)
                      <input
                        type="number"
                        value={room.linear.islandL || ""}
                        onChange={(e) =>
                          onRoomsChange(
                            updateRoomNested(rooms, room.id, "linear", {
                              ...room.linear,
                              islandL: Number(e.target.value) || 0
                            })
                          )
                        }
                      />
                    </label>
                    <label>
                      Island width (ft)
                      <input
                        type="number"
                        value={room.linear.islandW || ""}
                        onChange={(e) =>
                          onRoomsChange(
                            updateRoomNested(rooms, room.id, "linear", {
                              ...room.linear,
                              islandW: Number(e.target.value) || 0
                            })
                          )
                        }
                      />
                    </label>
                  </div>
                ) : null}

                {room.calcMode === "Manual Sq Ft" ? (
                  <div className="room-panel">
                    <p className="muted small" style={{ marginTop: 0 }}>
                      Enter total square footage when you already have measured numbers. For run-by-run entry with round-up
                      pricing, use <strong>Build from runs</strong> instead.
                    </p>
                    <div className="grid3">
                    <label>
                      Countertop sf
                      <input
                        type="number"
                        value={room.direct.counter || ""}
                        onChange={(e) =>
                          onRoomsChange(
                            updateRoomNested(rooms, room.id, "direct", {
                              ...room.direct,
                              counter: Number(e.target.value) || 0
                            })
                          )
                        }
                      />
                    </label>
                    <label>
                      Backsplash sf
                      <input
                        type="number"
                        value={room.direct.splash || ""}
                        onChange={(e) =>
                          onRoomsChange(
                            updateRoomNested(rooms, room.id, "direct", {
                              ...room.direct,
                              splash: Number(e.target.value) || 0
                            })
                          )
                        }
                      />
                    </label>
                    </div>
                  </div>
                ) : null}

                <div className="room-panel grid3" style={{ marginTop: 12 }}>
                  <label>
                    Full-height backsplash
                    <select
                      value={room.fhbMode}
                      onChange={(e) =>
                        onRoomsChange(updateRoom(rooms, room.id, { fhbMode: e.target.value as RoomDraft["fhbMode"] }))
                      }
                    >
                      <option value="Off">Off</option>
                      <option value="Manual Sq Ft">Manual Sq Ft</option>
                      <option value="Guided Shape">Guided Shape</option>
                    </select>
                  </label>
                  {room.fhbMode === "Manual Sq Ft" ? (
                    <label>
                      FHB square feet
                      <input
                        type="number"
                        value={room.fhbDirectSf || ""}
                        onChange={(e) => onRoomsChange(updateRoom(rooms, room.id, { fhbDirectSf: Number(e.target.value) || 0 }))}
                      />
                    </label>
                  ) : null}
                  <label>
                    FHB electrical cutouts ($30 ea)
                    <input
                      type="number"
                      min={0}
                      value={room.fhbOutlets || ""}
                      onChange={(e) => onRoomsChange(updateRoom(rooms, room.id, { fhbOutlets: Number(e.target.value) || 0 }))}
                    />
                  </label>
                </div>

                {room.fhbMode === "Guided Shape" ? (
                  <div className="room-panel">
                    {room.fhbPieces.map((p) => (
                      <div key={p.id} className="piece-row grid3">
                        <label>
                          Label
                          <input value={p.name} onChange={(e) => setPiece(room.id, p.id, { name: e.target.value }, "fhb")} />
                        </label>
                        <label>
                          Length (in)
                          <input
                            type="number"
                            value={p.lengthIn || ""}
                            onChange={(e) => setPiece(room.id, p.id, { lengthIn: Number(e.target.value) || 0 }, "fhb")}
                          />
                        </label>
                        <label>
                          Height (in)
                          <input
                            type="number"
                            value={p.depthIn || ""}
                            onChange={(e) => setPiece(room.id, p.id, { depthIn: Number(e.target.value) || 0 }, "fhb")}
                          />
                        </label>
                        <div className="piece-row-remove">
                          <button
                            type="button"
                            className="btn secondary btn-danger-quiet"
                            onClick={() => removePiece(room.id, p.id, "fhb")}
                          >
                            Remove FHB piece
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="piece-add-row">
                      <button type="button" className="btn secondary" onClick={() => addPiece(room.id, "fhb")}>
                        + Add FHB piece
                      </button>
                    </div>
                  </div>
                ) : null}

                <h4 className="h3">Room add-ons</h4>
                <p className="muted small">Enter quantity for each cutout or fixture. Default is 0 — use 1 when the item applies.</p>
                <div className="grid3 room-addon-grid">
                  {ADDON_CATALOG.map((a) => {
                    const isSink = a.id === "qty-sink" || a.id === "qty-bar";
                    const qty = room.addons[a.id] ?? 0;
                    return (
                      <label key={a.id} className={isSink ? "room-addon-row room-addon-row--sink" : "room-addon-row"}>
                        <span className="room-addon-label">
                          {a.label}
                          <span className="muted small"> (${a.price} ea)</span>
                        </span>
                        <span className="room-addon-qty-wrap">
                          <span className="room-addon-qty-label">Qty</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            aria-label={`${a.label} quantity`}
                            placeholder="0"
                            className="room-addon-qty-input"
                            value={qty > 0 ? qty : ""}
                            onChange={(e) => {
                              const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                              onRoomsChange(
                                rooms.map((r) => {
                                  if (r.id !== room.id) return r;
                                  return { ...r, addons: { ...r.addons, [a.id]: v } };
                                })
                              );
                            }}
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={room.tear}
                    onChange={(e) => onRoomsChange(updateRoom(rooms, room.id, { tear: e.target.checked }))}
                  />
                  Tear-out ($750)
                </label>
              </>
            )}

            {showRoomUseTax && room.roomType !== "Vanity" ? (
              <div className="room-use-tax-block" style={{ marginTop: 12 }}>
                <p className="muted small" style={{ margin: "0 0 8px" }}>
                  Use tax applies to <strong>countertop material in this room only</strong> (folded into customer material amount).
                </p>
                <div className="grid3">
                  <label>
                    Use tax
                    <select
                      value={room.useTaxMode ?? "inherit_project"}
                      onChange={(e) => {
                        const mode = e.target.value as RoomUseTaxMode;
                        onRoomsChange(
                          updateRoom(rooms, room.id, {
                            useTaxMode: mode,
                            useTaxPercent:
                              mode === "percent"
                                ? room.useTaxPercent ?? projectUseTaxPercent
                                : room.useTaxPercent
                          })
                        );
                      }}
                    >
                      <option value="inherit_project">
                        Inherit project default ({projectUseTaxPercent}%)
                      </option>
                      <option value="none">None</option>
                      <option value="percent">Custom for this room</option>
                    </select>
                  </label>
                  {room.useTaxMode === "percent" ? (
                    <label>
                      Room %
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={room.useTaxPercent ?? 0}
                        onChange={(e) =>
                          onRoomsChange(
                            updateRoom(rooms, room.id, {
                              useTaxMode: "percent",
                              useTaxPercent: Math.max(0, Number(e.target.value) || 0)
                            })
                          )
                        }
                      />
                    </label>
                  ) : (
                    <label>
                      Effective %
                      <input type="text" readOnly value={`${resolveRoomUseTaxPercent(room, projectUseTaxPercent)}%`} />
                    </label>
                  )}
                </div>
              </div>
            ) : null}

            <div className="room-summary-bar muted small">
              Preview sf — counter: <strong>{prev.counter}</strong> · splash+FHB: <strong>{prev.splashFhb}</strong> · total:{" "}
              <strong>{prev.total}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}
