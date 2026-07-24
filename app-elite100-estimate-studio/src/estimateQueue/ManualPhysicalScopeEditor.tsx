/**
 * Manual physical scope editor — produces the same normalized room/piece shape
 * as Takeoff-seeded scope. Confirmation is a separate explicit API call.
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

type RoomDraft = {
  id: string;
  name: string;
  roomType: string;
  included: boolean;
  pieces: PieceDraft[];
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
  { value: "backsplash", label: "Backsplash" },
  { value: "waterfall", label: "Waterfall panel" },
  { value: "fireplace", label: "Fireplace piece" },
  { value: "shower", label: "Shower piece" },
  { value: "custom_rect", label: "Custom rectangular piece" },
  { value: "other", label: "Other / manual piece" }
];

function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
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
    pieces: [emptyPiece()]
  };
}

function roomsFromScope(scope: Record<string, unknown> | null): RoomDraft[] {
  const rooms = Array.isArray(scope?.rooms) ? scope!.rooms : [];
  if (!rooms.length) return [emptyRoom()];
  return rooms.map((r: any) => ({
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
    })
  }));
}

function toApiRooms(rooms: RoomDraft[]) {
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    roomType: r.roomType,
    included: r.included,
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
  const includedPieces = includedRooms.flatMap((r) => r.pieces.filter((p) => p.included));
  const totalSqft = includedPieces.reduce((s, p) => {
    if (p.measurementMode === "direct_area") return s + (Number(p.sqft) || 0);
    const L = Number(p.lengthIn) || 0;
    const D = Number(p.depthIn) || 0;
    return s + (L > 0 && D > 0 ? Math.round(((L * D) / 144) * 100) / 100 : 0);
  }, 0);
  const edgeByRoom = includedRooms.map((r) => ({
    name: r.name,
    lf: r.pieces.filter((p) => p.included).reduce((s, p) => s + (Number(p.finishedEdgeLf) || 0), 0)
  }));

  async function saveDraft() {
    setSaveState("saving");
    setMessage(null);
    setErrors([]);
    try {
      await apiPatch(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/manual-scope`,
        authToken,
        {
          scope: {
            rooms: toApiRooms(rooms),
            addOns: cutouts
          }
        }
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
    return <p className="muted" data-testid="manual-scope-loading">Loading manual scope…</p>;
  }

  return (
    <section className="manual-scope-editor" data-testid="manual-physical-scope-editor">
      <header className="manual-scope-header">
        <div>
          <h3>Manual Scope</h3>
          <p className="muted">
            Estimator-built physical scope. Same pricing engine as plan-based estimates. Saving never
            publishes. Vanity pieces use standard countertop pricing (Vanity Program is a later phase).
          </p>
        </div>
        <p className="manual-scope-save-state" data-testid="manual-scope-save-state">
          {confirmed ? "Manual scope confirmed" : dirty ? "Unsaved changes" : saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "failed" ? "Save failed" : "Ready"}
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

      {rooms.map((room, ri) => (
        <article key={room.id} className="manual-scope-room" data-testid="manual-scope-room">
          <div className="manual-scope-room-head">
            <input
              aria-label="Room name"
              value={room.name}
              onChange={(e) => {
                const next = [...rooms];
                next[ri] = { ...room, name: e.target.value };
                markDirty(next);
              }}
            />
            <select
              aria-label="Room type"
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
            <label>
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

          {room.pieces.map((piece, pi) => (
            <div key={piece.id} className="manual-scope-piece" data-testid="manual-scope-piece">
              <input
                aria-label="Piece name"
                value={piece.name}
                onChange={(e) => {
                  const next = [...rooms];
                  const pieces = [...room.pieces];
                  pieces[pi] = { ...piece, name: e.target.value };
                  next[ri] = { ...room, pieces };
                  markDirty(next);
                }}
              />
              <select
                aria-label="Piece type"
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
              <select
                aria-label="Measurement mode"
                value={piece.measurementMode}
                onChange={(e) => {
                  const mode = e.target.value === "direct_area" ? "direct_area" : "dimensions";
                  const next = [...rooms];
                  const pieces = [...room.pieces];
                  pieces[pi] = { ...piece, measurementMode: mode };
                  next[ri] = { ...room, pieces };
                  markDirty(next);
                }}
              >
                <option value="dimensions">Dimensions</option>
                <option value="direct_area">Direct area (estimator override)</option>
              </select>
              {piece.measurementMode === "dimensions" ? (
                <>
                  <label>
                    Length (in)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
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
                      step="0.01"
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
                  Approved SF
                  <input
                    type="number"
                    min={0}
                    step="0.01"
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
                Finished edge LF
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={piece.finishedEdgeLf || ""}
                  onChange={(e) => {
                    const next = [...rooms];
                    const pieces = [...room.pieces];
                    pieces[pi] = { ...piece, finishedEdgeLf: Number(e.target.value) || 0 };
                    next[ri] = { ...room, pieces };
                    markDirty(next);
                  }}
                />
              </label>
              <label>
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
        </article>
      ))}

      <button
        type="button"
        className="eq-btn-secondary"
        data-testid="manual-scope-add-room"
        onClick={() => markDirty([...rooms, emptyRoom(`Room ${rooms.length + 1}`)])}
      >
        Add room
      </button>

      <fieldset className="manual-scope-cutouts">
        <legend>Cutout quantities (pricing keys)</legend>
        {Object.entries(cutouts).map(([key, val]) => (
          <label key={key}>
            {key}
            <input
              type="number"
              min={0}
              value={val}
              onChange={(e) => {
                setCutouts({ ...cutouts, [key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) });
                setDirty(true);
                setConfirmed(false);
              }}
            />
          </label>
        ))}
      </fieldset>

      <aside className="manual-scope-summary" data-testid="manual-scope-summary">
        <h4>Scope summary</h4>
        <p>Rooms: {includedRooms.length}</p>
        <p>Included pieces: {includedPieces.length}</p>
        <p>Approved SF (approx): {totalSqft.toFixed(2)}</p>
        <ul>
          {edgeByRoom.map((e) => (
            <li key={e.name}>
              {e.name} finished edge: {e.lf.toFixed(2)} LF
            </li>
          ))}
        </ul>
        <p className="muted">Summary is for verification — not an alternate price calculator.</p>
      </aside>

      <div className="manual-scope-actions">
        <button
          type="button"
          className="eq-btn-secondary"
          data-testid="manual-scope-save"
          disabled={saveState === "saving"}
          onClick={() => void saveDraft()}
        >
          Save draft
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
