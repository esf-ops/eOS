/**
 * Manual physical scope editor — authoritative measured geometry for manual estimates.
 * Confirmation is a separate explicit API call. Saving never publishes.
 */
import React, { useEffect, useState } from "react";
import { ApiError, apiGet, apiPatch, apiPost } from "../lib/api";

type PieceDraft = {
  id: string;
  name: string;
  pieceType: string;
  included: boolean;
  measurementMode: "dimensions" | "direct_area";
  lengthIn: number;
  depthIn: number;
  sqft: number;
  finishedEdgeLf: number;
  notes: string;
};

type BacksplashDraft = {
  includeBacksplash: boolean;
  backsplashHeightMode: "none" | "standard" | "custom" | "full_height";
  backsplashMeasuredLengthIn: number;
  backsplashHeightIn: number;
  backsplashNotes: string;
};

type RoomDraft = {
  id: string;
  name: string;
  roomType: string;
  included: boolean;
  pieces: PieceDraft[];
  backsplash: BacksplashDraft;
};

type Props = {
  authToken: string;
  caseId: string;
  estimateId: string;
  onConfirmed?: () => void;
};

const ROOM_TYPES = ["Kitchen", "Island", "Vanity", "Bar", "Laundry", "Fireplace", "Shower", "Other"];
const PIECE_TYPES = [
  { value: "counter", label: "Countertop run" },
  { value: "island", label: "Island" },
  { value: "vanity_top", label: "Vanity top (standard countertop pricing)" },
  { value: "bar_top", label: "Bar top" },
  { value: "waterfall", label: "Waterfall panel" },
  { value: "fireplace", label: "Fireplace piece" },
  { value: "shower", label: "Shower piece" },
  { value: "custom_rect", label: "Custom rectangular piece" },
  { value: "other", label: "Other / manual piece" }
];

const CUTOUT_FIELDS = [
  { key: "qty-sink" as const, label: "Kitchen sink openings" },
  { key: "qty-bar" as const, label: "Vanity / bar sink openings" },
  { key: "qty-cook" as const, label: "Cooktop openings" },
  { key: "qty-outlet" as const, label: "Electrical outlet openings" }
];

function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyBacksplash(): BacksplashDraft {
  return {
    includeBacksplash: false,
    backsplashHeightMode: "none",
    backsplashMeasuredLengthIn: 0,
    backsplashHeightIn: 4,
    backsplashNotes: ""
  };
}

function emptyPiece(): PieceDraft {
  return {
    id: rid("piece"),
    name: "Countertop",
    pieceType: "counter",
    included: true,
    measurementMode: "dimensions",
    lengthIn: 0,
    depthIn: 25.5,
    sqft: 0,
    finishedEdgeLf: 0,
    notes: ""
  };
}

function emptyRoom(name = "Kitchen"): RoomDraft {
  return {
    id: rid("room"),
    name,
    roomType: name === "Kitchen" ? "Kitchen" : "Other",
    included: true,
    pieces: [emptyPiece()],
    backsplash: emptyBacksplash()
  };
}

function backsplashSqft(bs: BacksplashDraft): number {
  if (!bs.includeBacksplash || bs.backsplashHeightMode === "none") return 0;
  const L = Number(bs.backsplashMeasuredLengthIn) || 0;
  const H =
    bs.backsplashHeightMode === "standard"
      ? Number(bs.backsplashHeightIn) > 0
        ? Number(bs.backsplashHeightIn)
        : 4
      : Number(bs.backsplashHeightIn) || 0;
  if (L <= 0 || H <= 0) return 0;
  return Math.round(((L * H) / 144) * 100) / 100;
}

function pieceSqft(p: PieceDraft): number {
  if (p.measurementMode === "direct_area") return Number(p.sqft) || 0;
  const L = Number(p.lengthIn) || 0;
  const D = Number(p.depthIn) || 0;
  return L > 0 && D > 0 ? Math.round(((L * D) / 144) * 100) / 100 : 0;
}

function roomsFromScope(scope: Record<string, unknown> | null): RoomDraft[] {
  const rooms = Array.isArray(scope?.rooms) ? scope!.rooms : [];
  if (!rooms.length) return [emptyRoom()];
  return rooms.map((r: any) => {
    const modeRaw = String(r.backsplashHeightMode || "none").toLowerCase();
    const mode =
      modeRaw === "standard" || modeRaw === "custom" || modeRaw === "full_height" ? modeRaw : "none";
    return {
      id: String(r.id || rid("room")),
      name: String(r.name || "Room"),
      roomType: String(r.roomType || "Other"),
      included: r.included !== false,
      pieces: (Array.isArray(r.pieces) ? r.pieces : []).map((p: any) => {
        const fe = p.finishedEdge || {};
        const totalIn = Number(fe.totalFinishedEdgeLengthIn) || 0;
        return {
          id: String(p.id || rid("piece")),
          name: String(p.name || "Piece"),
          pieceType: String(p.pieceType || "counter"),
          included: p.included !== false,
          measurementMode:
            p.measurementMode === "direct_area" || p.directAreaOverride ? "direct_area" : "dimensions",
          lengthIn: Number(p.lengthIn) || 0,
          depthIn: Number(p.depthIn) || 0,
          sqft: Number(p.sqft) || 0,
          finishedEdgeLf: totalIn ? Math.round((totalIn / 12) * 100) / 100 : 0,
          notes: String(p.notes || "")
        } as PieceDraft;
      }),
      backsplash: {
        includeBacksplash: r.includeBacksplash === true,
        backsplashHeightMode: (r.includeBacksplash === true ? mode : "none") as BacksplashDraft["backsplashHeightMode"],
        backsplashMeasuredLengthIn: Number(r.backsplashMeasuredLengthIn) || 0,
        backsplashHeightIn: Number(r.backsplashHeightIn) || 4,
        backsplashNotes: String(r.backsplashNotes || "")
      }
    };
  });
}

function toApiRooms(rooms: RoomDraft[]) {
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    roomType: r.roomType,
    included: r.included,
    includeBacksplash: r.backsplash.includeBacksplash && r.backsplash.backsplashHeightMode !== "none",
    backsplashHeightMode: r.backsplash.includeBacksplash ? r.backsplash.backsplashHeightMode : "none",
    backsplashMeasuredLengthIn: r.backsplash.backsplashMeasuredLengthIn,
    backsplashHeightIn:
      r.backsplash.backsplashHeightMode === "standard" && !(r.backsplash.backsplashHeightIn > 0)
        ? 4
        : r.backsplash.backsplashHeightIn,
    backsplashNotes: r.backsplash.backsplashNotes,
    pieces: r.pieces.map((p) => ({
      id: p.id,
      name: p.name,
      pieceType: p.pieceType,
      included: p.included,
      measurementMode: p.measurementMode,
      lengthIn: p.lengthIn,
      depthIn: p.depthIn,
      sqft: p.sqft,
      notes: p.notes,
      finishedEdge:
        p.finishedEdgeLf > 0
          ? {
              frontEdgeLengthIn: Math.round(p.finishedEdgeLf * 12 * 100) / 100,
              leftExposedEdgeLengthIn: 0,
              rightExposedEdgeLengthIn: 0,
              otherExposedEdgeLengthIn: 0,
              totalFinishedEdgeLengthIn: Math.round(p.finishedEdgeLf * 12 * 100) / 100,
              approved: true,
              source: "estimator_confirmed"
            }
          : undefined
    }))
  }));
}

export default function ManualPhysicalScopeEditor({ authToken, caseId, estimateId, onConfirmed }: Props) {
  const [rooms, setRooms] = useState<RoomDraft[]>([emptyRoom()]);
  const [cutouts, setCutouts] = useState({ "qty-sink": 0, "qty-cook": 0, "qty-outlet": 0, "qty-bar": 0 });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const body = (await apiGet(
          `/api/elite100-estimate-studio/intake-cases/${encodeURIComponent(caseId)}/estimate`,
          authToken
        )) as { estimate?: { id?: string; scope?: Record<string, unknown> } };
        if (cancelled) return;
        const scope = body.estimate?.scope || null;
        setRooms(roomsFromScope(scope));
        const addOns = (scope?.addOns || {}) as Record<string, number>;
        setCutouts({
          "qty-sink": Number(addOns["qty-sink"]) || 0,
          "qty-cook": Number(addOns["qty-cook"]) || 0,
          "qty-outlet": Number(addOns["qty-outlet"]) || 0,
          "qty-bar": Number(addOns["qty-bar"]) || 0
        });
        setConfirmed(scope?.manualScopeConfirmed === true);
        setDirty(false);
      } catch (e) {
        if (!cancelled) {
          setMessage(e instanceof ApiError ? e.message : "Unable to load manual scope");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authToken, caseId, estimateId]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const includedRooms = rooms.filter((r) => r.included);

  async function saveDraft() {
    setSaveState("saving");
    setMessage(null);
    setErrors([]);
    try {
      await apiPatch(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/manual-scope`,
        authToken,
        { scope: { rooms: toApiRooms(rooms), addOns: cutouts } }
      );
      setSaveState("saved");
      setConfirmed(false);
      setDirty(false);
      setMessage("Manual scope saved. Confirm when the physical scope is complete.");
    } catch (e) {
      setSaveState("failed");
      setMessage(e instanceof ApiError ? e.message : "Save failed");
    }
  }

  async function confirmScope() {
    setSaveState("saving");
    setMessage(null);
    setErrors([]);
    try {
      await apiPatch(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/manual-scope`,
        authToken,
        { scope: { rooms: toApiRooms(rooms), addOns: cutouts } }
      );
      const result = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/confirm-manual-scope`,
        authToken,
        { confirm: true, rooms: toApiRooms(rooms), addOns: cutouts }
      )) as { ok?: boolean; details?: string[] };
      setConfirmed(true);
      setDirty(false);
      setSaveState("saved");
      setMessage("Manual scope confirmed. Continue in Pricing Setup.");
      onConfirmed?.();
      if (Array.isArray(result.details)) setErrors(result.details);
    } catch (e) {
      setSaveState("failed");
      if (e instanceof ApiError && Array.isArray((e as any).details)) {
        setErrors((e as any).details);
      }
      setMessage(e instanceof ApiError ? e.message : "Unable to confirm manual scope");
    }
  }

  function markDirty(next: RoomDraft[]) {
    setRooms(next);
    setDirty(true);
    setConfirmed(false);
    setSaveState("idle");
  }

  if (loading) {
    return (
      <p className="muted" data-testid="manual-scope-loading">
        Loading manual scope…
      </p>
    );
  }

  return (
    <section className="manual-scope-editor" data-testid="manual-physical-scope-editor">
      <header className="manual-scope-header">
        <div>
          <h3>Manual Scope</h3>
          <p className="muted">
            Authoritative measured geometry for this estimate — rooms, pieces, finished edge,
            backsplash, and openings. Pricing Setup consumes this after confirmation and does not
            maintain a second measurement set.
          </p>
        </div>
        <p className="manual-scope-save-state" data-testid="manual-scope-save-state">
          {confirmed
            ? "Manual scope confirmed"
            : dirty
              ? "Unsaved changes"
              : saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : saveState === "failed"
                    ? "Save failed"
                    : "Ready"}
        </p>
      </header>

      {message ? (
        <p className="eq-state" role="status" data-testid="manual-scope-message">
          {message}
        </p>
      ) : null}
      {errors.length ? (
        <ul className="error-box" data-testid="manual-scope-errors">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}

      {rooms.map((room, ri) => {
        const roomPieces = room.pieces.filter((p) => p.included);
        const roomSf = roomPieces.reduce((s, p) => s + pieceSqft(p), 0);
        const roomEdge = roomPieces.reduce((s, p) => s + (Number(p.finishedEdgeLf) || 0), 0);
        const bsSf = backsplashSqft(room.backsplash);
        return (
          <article key={room.id} className="manual-scope-room" data-testid="manual-scope-room">
            <div className="manual-scope-room-head">
              <label>
                Room name
                <input
                  value={room.name}
                  onChange={(e) => {
                    const next = [...rooms];
                    next[ri] = { ...room, name: e.target.value };
                    markDirty(next);
                  }}
                />
              </label>
              <label>
                Room type
                <select
                  value={room.roomType}
                  onChange={(e) => {
                    const next = [...rooms];
                    next[ri] = { ...room, roomType: e.target.value };
                    markDirty(next);
                  }}
                >
                  {ROOM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="eq-check">
                <input
                  type="checkbox"
                  checked={room.included}
                  onChange={(e) => {
                    const next = [...rooms];
                    next[ri] = { ...room, included: e.target.checked };
                    markDirty(next);
                  }}
                />{" "}
                Included
              </label>
              <button
                type="button"
                className="eq-btn-secondary"
                onClick={() => {
                  if (!window.confirm("Remove this room from the draft?")) return;
                  markDirty(rooms.filter((_, i) => i !== ri));
                }}
              >
                Remove room
              </button>
            </div>

            <h4 className="manual-scope-subsection">Countertop pieces</h4>
            {room.pieces.map((piece, pi) => (
              <div key={piece.id} className="manual-scope-piece" data-testid="manual-scope-piece">
                <label>
                  Piece name
                  <input
                    value={piece.name}
                    onChange={(e) => {
                      const next = [...rooms];
                      const pieces = [...room.pieces];
                      pieces[pi] = { ...piece, name: e.target.value };
                      next[ri] = { ...room, pieces };
                      markDirty(next);
                    }}
                  />
                </label>
                <label>
                  Type
                  <select
                    value={piece.pieceType}
                    onChange={(e) => {
                      const next = [...rooms];
                      const pieces = [...room.pieces];
                      pieces[pi] = { ...piece, pieceType: e.target.value };
                      next[ri] = { ...room, pieces };
                      markDirty(next);
                    }}
                  >
                    {PIECE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Measurement
                  <select
                    value={piece.measurementMode}
                    onChange={(e) => {
                      const next = [...rooms];
                      const pieces = [...room.pieces];
                      pieces[pi] = {
                        ...piece,
                        measurementMode: e.target.value as PieceDraft["measurementMode"]
                      };
                      next[ri] = { ...room, pieces };
                      markDirty(next);
                    }}
                  >
                    <option value="dimensions">Length × depth</option>
                    <option value="direct_area">Direct area (SF)</option>
                  </select>
                </label>
                {piece.measurementMode === "dimensions" ? (
                  <>
                    <label>
                      Length (in)
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={piece.lengthIn || ""}
                        onChange={(e) => {
                          const next = [...rooms];
                          const pieces = [...room.pieces];
                          pieces[pi] = { ...piece, lengthIn: Number(e.target.value) || 0 };
                          next[ri] = { ...room, pieces };
                          markDirty(next);
                        }}
                      />
                    </label>
                    <label>
                      Depth (in)
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={piece.depthIn || ""}
                        onChange={(e) => {
                          const next = [...rooms];
                          const pieces = [...room.pieces];
                          pieces[pi] = { ...piece, depthIn: Number(e.target.value) || 0 };
                          next[ri] = { ...room, pieces };
                          markDirty(next);
                        }}
                      />
                    </label>
                  </>
                ) : (
                  <label>
                    Square footage
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={piece.sqft || ""}
                      onChange={(e) => {
                        const next = [...rooms];
                        const pieces = [...room.pieces];
                        pieces[pi] = { ...piece, sqft: Number(e.target.value) || 0 };
                        next[ri] = { ...room, pieces };
                        markDirty(next);
                      }}
                    />
                  </label>
                )}
                <label>
                  Finished edge (LF)
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={piece.finishedEdgeLf || ""}
                    data-testid="manual-piece-finished-edge-lf"
                    onChange={(e) => {
                      const next = [...rooms];
                      const pieces = [...room.pieces];
                      pieces[pi] = { ...piece, finishedEdgeLf: Number(e.target.value) || 0 };
                      next[ri] = { ...room, pieces };
                      markDirty(next);
                    }}
                  />
                </label>
                <label className="eq-check">
                  <input
                    type="checkbox"
                    checked={piece.included}
                    onChange={(e) => {
                      const next = [...rooms];
                      const pieces = [...room.pieces];
                      pieces[pi] = { ...piece, included: e.target.checked };
                      next[ri] = { ...room, pieces };
                      markDirty(next);
                    }}
                  />{" "}
                  Included
                </label>
                <button
                  type="button"
                  className="eq-btn-secondary"
                  onClick={() => {
                    const next = [...rooms];
                    next[ri] = { ...room, pieces: room.pieces.filter((_, i) => i !== pi) };
                    markDirty(next);
                  }}
                >
                  Remove piece
                </button>
              </div>
            ))}
            <button
              type="button"
              className="eq-btn-secondary"
              onClick={() => {
                const next = [...rooms];
                next[ri] = { ...room, pieces: [...room.pieces, emptyPiece()] };
                markDirty(next);
              }}
            >
              Add piece
            </button>

            <fieldset className="manual-scope-backsplash" data-testid="manual-scope-backsplash">
              <legend>Backsplash</legend>
              <label className="eq-check">
                <input
                  type="checkbox"
                  checked={room.backsplash.includeBacksplash}
                  onChange={(e) => {
                    const next = [...rooms];
                    const include = e.target.checked;
                    next[ri] = {
                      ...room,
                      backsplash: {
                        ...room.backsplash,
                        includeBacksplash: include,
                        backsplashHeightMode: include
                          ? room.backsplash.backsplashHeightMode === "none"
                            ? "standard"
                            : room.backsplash.backsplashHeightMode
                          : "none"
                      }
                    };
                    markDirty(next);
                  }}
                />{" "}
                Include backsplash
              </label>
              <label>
                Type
                <select
                  value={
                    room.backsplash.includeBacksplash
                      ? room.backsplash.backsplashHeightMode
                      : "none"
                  }
                  disabled={!room.backsplash.includeBacksplash}
                  data-testid="manual-backsplash-mode"
                  onChange={(e) => {
                    const mode = e.target.value as BacksplashDraft["backsplashHeightMode"];
                    const next = [...rooms];
                    next[ri] = {
                      ...room,
                      backsplash: {
                        ...room.backsplash,
                        includeBacksplash: mode !== "none",
                        backsplashHeightMode: mode,
                        backsplashHeightIn:
                          mode === "standard" && !(room.backsplash.backsplashHeightIn > 0)
                            ? 4
                            : room.backsplash.backsplashHeightIn
                      }
                    };
                    markDirty(next);
                  }}
                >
                  <option value="none">No backsplash</option>
                  <option value="standard">Standard backsplash (4 in)</option>
                  <option value="custom">Custom-height backsplash</option>
                  <option value="full_height">Full-height backsplash</option>
                </select>
              </label>
              <label>
                Measured length (in)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={room.backsplash.backsplashMeasuredLengthIn || ""}
                  disabled={!room.backsplash.includeBacksplash}
                  data-testid="manual-backsplash-length"
                  onChange={(e) => {
                    const next = [...rooms];
                    next[ri] = {
                      ...room,
                      backsplash: {
                        ...room.backsplash,
                        backsplashMeasuredLengthIn: Number(e.target.value) || 0
                      }
                    };
                    markDirty(next);
                  }}
                />
              </label>
              <label>
                Height (in)
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={room.backsplash.backsplashHeightIn || ""}
                  disabled={
                    !room.backsplash.includeBacksplash ||
                    room.backsplash.backsplashHeightMode === "none"
                  }
                  data-testid="manual-backsplash-height"
                  onChange={(e) => {
                    const h = Number(e.target.value) || 0;
                    const next = [...rooms];
                    next[ri] = {
                      ...room,
                      backsplash: {
                        ...room.backsplash,
                        backsplashHeightIn: h,
                        backsplashHeightMode:
                          h >= 48
                            ? "full_height"
                            : h > 4.5
                              ? "custom"
                              : room.backsplash.backsplashHeightMode === "full_height" ||
                                  room.backsplash.backsplashHeightMode === "custom"
                                ? room.backsplash.backsplashHeightMode
                                : "standard"
                      }
                    };
                    markDirty(next);
                  }}
                />
              </label>
              <p className="muted" data-testid="manual-backsplash-sqft">
                Calculated: {bsSf.toFixed(2)} SF
                {room.backsplash.includeBacksplash &&
                room.backsplash.backsplashMeasuredLengthIn > 0
                  ? ` (${room.backsplash.backsplashMeasuredLengthIn} in × ${
                      room.backsplash.backsplashHeightMode === "standard" &&
                      !(room.backsplash.backsplashHeightIn > 0)
                        ? 4
                        : room.backsplash.backsplashHeightIn
                    } in)`
                  : ""}
              </p>
              <label>
                Estimator note
                <input
                  value={room.backsplash.backsplashNotes}
                  disabled={!room.backsplash.includeBacksplash}
                  onChange={(e) => {
                    const next = [...rooms];
                    next[ri] = {
                      ...room,
                      backsplash: { ...room.backsplash, backsplashNotes: e.target.value }
                    };
                    markDirty(next);
                  }}
                />
              </label>
            </fieldset>

            <aside className="manual-scope-room-summary" data-testid="manual-scope-room-summary">
              <strong>{room.name || "Room"}</strong>
              <ul>
                <li>Countertop: {roomSf.toFixed(2)} SF</li>
                <li>Finished edge: {roomEdge.toFixed(2)} LF</li>
                <li>
                  Backsplash:{" "}
                  {room.backsplash.includeBacksplash
                    ? `${room.backsplash.backsplashMeasuredLengthIn || 0} in × ${
                        room.backsplash.backsplashHeightMode === "standard" &&
                        !(room.backsplash.backsplashHeightIn > 0)
                          ? 4
                          : room.backsplash.backsplashHeightIn || 0
                      } in = ${bsSf.toFixed(2)} SF`
                    : "none"}
                </li>
              </ul>
            </aside>
          </article>
        );
      })}

      <button
        type="button"
        className="eq-btn-secondary"
        data-testid="manual-scope-add-room"
        onClick={() => markDirty([...rooms, emptyRoom(`Room ${rooms.length + 1}`)])}
      >
        Add room
      </button>

      <fieldset className="manual-scope-cutouts" data-testid="manual-scope-openings">
        <legend>Openings</legend>
        <p className="muted">Physical opening counts for this estimate. Product model selection stays in Pricing Setup / Digital Estimate.</p>
        {CUTOUT_FIELDS.map(({ key, label }) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={0}
              step={1}
              value={cutouts[key] || ""}
              data-testid={`manual-opening-${key}`}
              onChange={(e) => {
                setCutouts((prev) => ({ ...prev, [key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }));
                setDirty(true);
                setConfirmed(false);
                setSaveState("idle");
              }}
            />
          </label>
        ))}
      </fieldset>

      <aside className="manual-scope-summary" data-testid="manual-scope-summary">
        <h4>Scope summary</h4>
        <ul>
          {includedRooms.map((r) => {
            const sf = r.pieces.filter((p) => p.included).reduce((s, p) => s + pieceSqft(p), 0);
            const edge = r.pieces.filter((p) => p.included).reduce((s, p) => s + (Number(p.finishedEdgeLf) || 0), 0);
            const bs = backsplashSqft(r.backsplash);
            return (
              <li key={r.id}>
                <strong>{r.name}</strong>
                <ul>
                  <li>Countertop: {sf.toFixed(2)} SF</li>
                  <li>Finished edge: {edge.toFixed(2)} LF</li>
                  <li>
                    Backsplash:{" "}
                    {r.backsplash.includeBacksplash
                      ? `${r.backsplash.backsplashMeasuredLengthIn || 0} in × ${
                          r.backsplash.backsplashHeightMode === "standard" &&
                          !(r.backsplash.backsplashHeightIn > 0)
                            ? 4
                            : r.backsplash.backsplashHeightIn || 0
                        } in = ${bs.toFixed(2)} SF`
                      : "none"}
                  </li>
                </ul>
              </li>
            );
          })}
          <li>
            Sink openings: {cutouts["qty-sink"]}; Vanity/bar: {cutouts["qty-bar"]}; Cooktop:{" "}
            {cutouts["qty-cook"]}; Outlets: {cutouts["qty-outlet"]}
          </li>
        </ul>
      </aside>

      <div className="manual-scope-actions">
        <button
          type="button"
          className="eq-btn-secondary"
          data-testid="manual-scope-save"
          disabled={saveState === "saving"}
          onClick={() => void saveDraft()}
        >
          Save Manual Scope
        </button>
        <button
          type="button"
          className="eq-btn-primary"
          data-testid="manual-scope-confirm"
          disabled={saveState === "saving"}
          onClick={() => void confirmScope()}
        >
          Confirm Manual Scope
        </button>
      </div>
    </section>
  );
}
