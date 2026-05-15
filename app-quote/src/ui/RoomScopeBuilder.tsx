import React from "react";
import type { EliteProgramColorRow, GuidedPiece, RoomCalcMode, RoomDraft } from "../lib/quoteTypes";
import { ADDON_CATALOG, VANITY_PRICING, createEstimatorRoom, newId } from "../lib/prototypeQuoteMath";
import {
  depthPatchForGuidedPieceTypeChange,
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
};

function updateRoom(rooms: RoomDraft[], id: string, patch: Partial<RoomDraft>): RoomDraft[] {
  return rooms.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

function updateRoomNested<K extends keyof RoomDraft>(rooms: RoomDraft[], id: string, key: K, val: RoomDraft[K]): RoomDraft[] {
  return rooms.map((r) => (r.id === id ? { ...r, [key]: val } : r));
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
    for (const p of room.guidedPieces) {
      const sf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
      if (p.pieceType === "splash") s += sf;
      else if (p.pieceType === "fhb") f += sf;
      else c += sf;
    }
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
  hideRapidLinear = false
}: Props) {
  const [colorQ, setColorQ] = React.useState<Record<string, string>>({});
  const [groupFilter, setGroupFilter] = React.useState<Record<string, string>>({});
  const [pieceOverridesOpen, setPieceOverridesOpen] = React.useState<Record<string, boolean>>({});
  const addRoom = () => onRoomsChange([...rooms, createEstimatorRoom(rooms[0]?.materialGroup || "Group Promo")]);
  const removeRoom = (id: string) => onRoomsChange(rooms.filter((r) => r.id !== id));

  const setPiece = (roomId: string, pieceId: string, patch: Partial<GuidedPiece>, list: "guided" | "fhb") => {
    const next = rooms.map((r) => {
      if (r.id !== roomId) return r;
      const arr = list === "guided" ? [...r.guidedPieces] : [...r.fhbPieces];
      const idx = arr.findIndex((p) => p.id === pieceId);
      if (idx < 0) return r;
      arr[idx] = { ...arr[idx], ...patch };
      return list === "guided" ? { ...r, guidedPieces: arr } : { ...r, fhbPieces: arr };
    });
    onRoomsChange(next);
  };

  const addPiece = (roomId: string, list: "guided" | "fhb") => {
    const piece: GuidedPiece = {
      id: newId(),
      pieceType: list === "fhb" ? "fhb" : "counter",
      name: list === "fhb" ? "Full height section" : "Counter section",
      lengthIn: 0,
      depthIn: list === "fhb" ? 18 : 25.5,
      shape: "rect"
    };
    onRoomsChange(
      rooms.map((r) => {
        if (r.id !== roomId) return r;
        if (list === "guided") return { ...r, guidedPieces: [...r.guidedPieces, piece] };
        return { ...r, fhbPieces: [...r.fhbPieces, piece] };
      })
    );
  };

  const removePiece = (roomId: string, pieceId: string, list: "guided" | "fhb") => {
    onRoomsChange(
      rooms.map((r) => {
        if (r.id !== roomId) return r;
        if (list === "guided") return { ...r, guidedPieces: r.guidedPieces.filter((p) => p.id !== pieceId) };
        return { ...r, fhbPieces: r.fhbPieces.filter((p) => p.id !== pieceId) };
      })
    );
  };

  type RoomLayoutPreset = "Rectangle" | "L-Shape" | "U-Shape" | "Galley" | "Island" | "Backsplash" | "Waterfall";

  const applyPreset = (roomId: string, preset: RoomLayoutPreset) => {
    const depth = 25.5;
    let pieces: GuidedPiece[] = [];
    if (preset === "Rectangle") {
      pieces = [
        {
          id: newId(),
          pieceType: "counter",
          name: "Main run",
          lengthIn: 0,
          depthIn: depth,
          shape: "rect",
          addSplash: true
        }
      ];
    } else if (preset === "L-Shape") {
      pieces = [
        { id: newId(), pieceType: "counter", name: "Main Wall Run", lengthIn: 0, depthIn: depth, shape: "rect" },
        { id: newId(), pieceType: "counter", name: "Short Return", lengthIn: 0, depthIn: depth, shape: "rect" }
      ];
    } else if (preset === "U-Shape") {
      pieces = [
        { id: newId(), pieceType: "counter", name: "Left Run", lengthIn: 0, depthIn: depth, shape: "rect" },
        { id: newId(), pieceType: "counter", name: "Back Run", lengthIn: 0, depthIn: depth, shape: "rect" },
        { id: newId(), pieceType: "counter", name: "Right Run", lengthIn: 0, depthIn: depth, shape: "rect" }
      ];
    } else if (preset === "Galley") {
      pieces = [
        { id: newId(), pieceType: "counter", name: "Left Wall", lengthIn: 0, depthIn: depth, shape: "rect" },
        { id: newId(), pieceType: "counter", name: "Right Wall", lengthIn: 0, depthIn: depth, shape: "rect" }
      ];
    } else if (preset === "Island") {
      pieces = [{ id: newId(), pieceType: "counter", name: "Island", lengthIn: 0, depthIn: 36, shape: "rect" }];
    } else if (preset === "Backsplash") {
      pieces = [
        {
          id: newId(),
          pieceType: "splash",
          name: "Backsplash run",
          lengthIn: 0,
          depthIn: STANDARD_BACKSPLASH_HEIGHT_IN,
          shape: "rect"
        }
      ];
    } else {
      pieces = [{ id: newId(), pieceType: "fhb", name: "Waterfall edge", lengthIn: 0, depthIn: 96, shape: "rect" }];
    }
    onRoomsChange(rooms.map((r) => (r.id === roomId ? { ...r, guidedPieces: pieces, calcMode: "Guided Shape" } : r)));
  };

  return (
    <div className="room-builder">
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
          <div key={room.id} className="room-card-lite card">
            <div className="room-card-head">
              <h3 className="room-card-title">Room / Area</h3>
              {rooms.length > 1 ? (
                <button type="button" className="btn secondary" onClick={() => removeRoom(room.id)}>
                  Remove
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
                <p className="muted small">Vanity program — Promo/Stock vs ESF Non-Stock paths (prototype v1.01).</p>
                <div className="grid3">
                  <label>
                    Vanity size
                    <select
                      value={room.vanity.size}
                      onChange={(e) =>
                        onRoomsChange(updateRoomNested(rooms, room.id, "vanity", { ...room.vanity, size: e.target.value }))
                      }
                    >
                      <option value="none">— Select —</option>
                      {Object.keys(VANITY_PRICING).map((k) => (
                        <option key={k} value={k}>
                          {VANITY_PRICING[k].name}
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
                      <option value="Promo / Stock 100 Remnant">Promo / Stock 100 Remnant</option>
                      <option value="ESF Non-Stock Remnant">ESF Non-Stock Remnant</option>
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
                  <label>
                    Depth (in) — non-stock
                    <input
                      type="number"
                      value={room.vanity.depth}
                      onChange={(e) =>
                        onRoomsChange(
                          updateRoomNested(rooms, room.id, "vanity", { ...room.vanity, depth: Number(e.target.value) || 0 })
                        )
                      }
                    />
                  </label>
                  <label>
                    Program sink upgrade ($)
                    <input
                      type="number"
                      value={room.vanity.programSink}
                      onChange={(e) =>
                        onRoomsChange(
                          updateRoomNested(rooms, room.id, "vanity", {
                            ...room.vanity,
                            programSink: Number(e.target.value) || 0
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
                </div>
              </div>
            ) : (
              <>
                <div className="grid3" style={{ marginTop: 12 }}>
                  <label>
                    Measurement method
                    {hideRapidLinear ? (
                      <div className="ie-measure-toggle" role="group" aria-label="Measurement method">
                        <button
                          type="button"
                          className={`ie-measure-toggle-btn ${room.calcMode === "Guided Shape" ? "on" : ""}`}
                          onClick={() => onRoomsChange(updateRoom(rooms, room.id, { calcMode: "Guided Shape" }))}
                        >
                          Guided Shape
                        </button>
                        <button
                          type="button"
                          className={`ie-measure-toggle-btn ${room.calcMode === "Manual Sq Ft" ? "on" : ""}`}
                          onClick={() => onRoomsChange(updateRoom(rooms, room.id, { calcMode: "Manual Sq Ft" }))}
                        >
                          Manual Sq Ft
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
                    <p className="muted small">Presets load example counter pieces — enter lengths in inches (depth defaults to 25.5″).</p>
                    <div className="mode-row room-preset-row" style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                      <button type="button" className="btn secondary" onClick={() => applyPreset(room.id, "Rectangle")}>
                        Rectangle
                      </button>
                      <button type="button" className="btn secondary" onClick={() => applyPreset(room.id, "L-Shape")}>
                        L-shape
                      </button>
                      <button type="button" className="btn secondary" onClick={() => applyPreset(room.id, "U-Shape")}>
                        U-shape
                      </button>
                      <button type="button" className="btn secondary" onClick={() => applyPreset(room.id, "Galley")}>
                        Galley
                      </button>
                      <button type="button" className="btn secondary" onClick={() => applyPreset(room.id, "Island")}>
                        Island
                      </button>
                      <button type="button" className="btn secondary" onClick={() => applyPreset(room.id, "Backsplash")}>
                        Backsplash
                      </button>
                      <button type="button" className="btn secondary" onClick={() => applyPreset(room.id, "Waterfall")}>
                        Waterfall
                      </button>
                    </div>
                    <label className="check" style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(pieceOverridesOpen[room.id])}
                        onChange={(e) =>
                          setPieceOverridesOpen((m) => ({ ...m, [room.id]: e.target.checked }))
                        }
                      />
                      Piece-level material overrides (advanced — off by default)
                    </label>
                    {room.guidedPieces.map((p) => (
                      <div key={p.id} className="piece-row grid3">
                        <label>
                          Label
                          <input
                            value={p.name}
                            onChange={(e) => setPiece(room.id, p.id, { name: e.target.value }, "guided")}
                          />
                        </label>
                        <label>
                          Type
                          <select
                            value={p.pieceType}
                            onChange={(e) => {
                              const nextType = e.target.value as GuidedPiece["pieceType"];
                              const depthPatch = depthPatchForGuidedPieceTypeChange(p.pieceType, nextType, p.depthIn);
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
                            onChange={(e) => setPiece(room.id, p.id, { shape: e.target.value as GuidedPiece["shape"] }, "guided")}
                          >
                            <option value="rect">Rectangle</option>
                            <option value="tri">Triangle</option>
                          </select>
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
                          {p.pieceType === "splash" ? "Height (in)" : "Depth / height (in)"}
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
                        {pieceOverridesOpen[room.id] ? (
                          <>
                            <label className="check" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(p.materialOverride)}
                                onChange={(e) =>
                                  setPiece(room.id, p.id, { materialOverride: e.target.checked, materialGroup: room.materialGroup }, "guided")
                                }
                              />
                              Override material for this piece
                            </label>
                            {p.materialOverride ? (
                              <>
                                <label>
                                  Piece material group
                                  <select
                                    value={p.materialGroup || room.materialGroup}
                                    onChange={(e) => setPiece(room.id, p.id, { materialGroup: e.target.value }, "guided")}
                                  >
                                    {materialGroups.map((g) => (
                                      <option key={g} value={g}>
                                        {g}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Piece color label
                                  <input
                                    value={p.materialColor || ""}
                                    onChange={(e) => setPiece(room.id, p.id, { materialColor: e.target.value }, "guided")}
                                    placeholder="Optional — display on estimate"
                                  />
                                </label>
                              </>
                            ) : null}
                          </>
                        ) : null}
                        <div style={{ display: "flex", alignItems: "flex-end" }}>
                          <button type="button" className="btn secondary" onClick={() => removePiece(room.id, p.id, "guided")}>
                            Remove piece
                          </button>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="btn secondary" style={{ marginTop: 8 }} onClick={() => addPiece(room.id, "guided")}>
                      + Counter / splash piece
                    </button>
                    {renderMiniVisual(room)}
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
                  <div className="room-panel grid3">
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
                        <div style={{ display: "flex", alignItems: "flex-end" }}>
                          <button type="button" className="btn secondary" onClick={() => removePiece(room.id, p.id, "fhb")}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="btn secondary" onClick={() => addPiece(room.id, "fhb")}>
                      + FHB piece
                    </button>
                  </div>
                ) : null}

                <h4 className="h3">Room add-ons</h4>
                <div className="grid3">
                  {ADDON_CATALOG.map((a) => (
                    <label key={a.id}>
                      {a.label}
                      <span className="muted small"> (${a.price})</span>
                      <input
                        type="number"
                        min={0}
                        value={room.addons[a.id] ?? ""}
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
                    </label>
                  ))}
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
