/**
 * Studio V2 Slice B + I + I.1 — Working Draft scope review editor.
 * Compact room/piece table with exposed-sides + cutouts popups.
 * Does not import V1 / AI Takeoff Review workspace components.
 */
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildFinishedEdgeFromExposedSides,
  calculateExposedEdgeInches,
  cutoutsSummary,
  defaultExposedSidesForTopology,
  exposedSummaryText,
  formatExposedSidesSummary,
  normalizeExposedSides,
  PIECE_TOPOLOGIES,
  suggestPieceTopology,
  type ExposedSides
} from "./studioV2ScopeReviewHelpers";

export const STUDIO_V2_ROOM_TYPES = [
  "Kitchen",
  "Island",
  "Vanity",
  "Bar",
  "Laundry",
  "Fireplace",
  "Shower",
  "Other"
] as const;

export const STUDIO_V2_EDGE_PROFILES = [
  { value: "edge_eased", label: "Eased" },
  { value: "edge_large_eased", label: "Large Eased" },
  { value: "edge_full_bullnose", label: "Full Bullnose" },
  { value: "edge_large_ogee", label: "Large Ogee" },
  { value: "edge_bevel", label: "Bevel" },
  { value: "edge_small_ogee", label: "Small Ogee" },
  { value: "edge_crescent", label: "Crescent" },
  { value: "edge_knife", label: "Knife" }
] as const;

export type StudioV2EditablePiece = {
  id: string;
  name: string;
  pieceType?: string;
  included: boolean;
  lengthIn: number;
  depthIn: number;
  quantity: number;
  approvedDirectSqft?: number | null;
  includeBacksplash?: boolean;
  backsplashEligibleLengthIn?: number | null;
  finishedEdgeLf?: number | null;
  exposedSides?: ExposedSides | null;
  pieceTopology?: string | null;
  exposedSidesSummary?: string | null;
  edgeProfileToken?: string | null;
  kitchenSinkCutouts?: number | null;
  vanityBarSinkCutouts?: number | null;
  cooktopCutouts?: number | null;
  outletCutouts?: number | null;
  popupOutletCutouts?: number | null;
  cutoutNote?: string | null;
  sideSplashLeft?: boolean;
  sideSplashRight?: boolean;
  notes?: string | null;
};

export type StudioV2EditableRoom = {
  id: string;
  name: string;
  roomType: string;
  included?: boolean;
  backsplashSqft?: number | null;
  edgeEligibleLinearFeet?: number | null;
  pieces: StudioV2EditablePiece[];
};

export type StudioV2EditableScope = {
  rooms: StudioV2EditableRoom[];
  openings: {
    kitchenSink: number;
    vanityBarSink: number;
    cooktop: number;
    outlet: number;
  };
  openingsSource?: "piece" | "estimate" | string;
  edgeProfileToken?: string | null;
};

export function emptyEditableScope(): StudioV2EditableScope {
  return {
    rooms: [],
    openings: { kitchenSink: 0, vanityBarSink: 0, cooktop: 0, outlet: 0 },
    openingsSource: "estimate",
    edgeProfileToken: "edge_eased"
  };
}

export function cloneEditableScope(scope: StudioV2EditableScope | null | undefined): StudioV2EditableScope {
  if (!scope) return emptyEditableScope();
  return structuredClone(scope);
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function numInput(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function emptyPiece(name: string): StudioV2EditablePiece {
  return {
    id: newId("piece"),
    name,
    pieceType: "counter",
    included: true,
    lengthIn: 0,
    depthIn: 25.5,
    quantity: 1,
    approvedDirectSqft: null,
    includeBacksplash: false,
    backsplashEligibleLengthIn: null,
    finishedEdgeLf: null,
    exposedSides: null,
    pieceTopology: null,
    edgeProfileToken: null,
    kitchenSinkCutouts: null,
    vanityBarSinkCutouts: null,
    cooktopCutouts: null,
    outletCutouts: null,
    popupOutletCutouts: null,
    cutoutNote: null,
    sideSplashLeft: false,
    sideSplashRight: false,
    notes: null
  };
}

function pieceHasOpenings(p: StudioV2EditablePiece): boolean {
  return (
    p.kitchenSinkCutouts != null ||
    p.vanityBarSinkCutouts != null ||
    p.cooktopCutouts != null ||
    p.outletCutouts != null
  );
}

function summarizeOpenings(rooms: StudioV2EditableRoom[]) {
  let kitchenSink = 0;
  let vanityBarSink = 0;
  let cooktop = 0;
  let outlet = 0;
  let fromPieces = false;
  for (const room of rooms) {
    if (room.included === false) continue;
    for (const p of room.pieces) {
      if (p.included === false || !pieceHasOpenings(p)) continue;
      fromPieces = true;
      kitchenSink += Math.max(0, Math.floor(Number(p.kitchenSinkCutouts) || 0));
      vanityBarSink += Math.max(0, Math.floor(Number(p.vanityBarSinkCutouts) || 0));
      cooktop += Math.max(0, Math.floor(Number(p.cooktopCutouts) || 0));
      outlet += Math.max(0, Math.floor(Number(p.outletCutouts) || 0));
    }
  }
  return { fromPieces, kitchenSink, vanityBarSink, cooktop, outlet };
}

type Props = {
  value: StudioV2EditableScope;
  readOnly: boolean;
  readOnlyMessage?: string | null;
  dirty: boolean;
  saveBusy: boolean;
  saveError?: string | null;
  saveNotice?: string | null;
  onChange: (next: StudioV2EditableScope) => void;
  onSave: () => void;
  /** Optional plan preview URL if V2 shell can supply one; otherwise placeholder. */
  planPreviewUrl?: string | null;
  planPreviewLabel?: string | null;
};

type EdgeModalTarget = { roomId: string; pieceId: string } | null;
type CutoutsTarget = { roomId: string; pieceId: string } | null;
type NotesTarget = { roomId: string; pieceId: string } | null;

function ExposedSidesModal(props: {
  open: boolean;
  roomName: string;
  piece: StudioV2EditablePiece;
  readOnly: boolean;
  onCancel: () => void;
  onConfirm: (patch: Partial<StudioV2EditablePiece>) => void;
}) {
  const { open, roomName, piece, readOnly, onCancel, onConfirm } = props;
  const baseId = useId();
  const suggested = suggestPieceTopology({ name: piece.name, label: piece.name });
  const [topology, setTopology] = useState(String(piece.pieceTopology || suggested || PIECE_TOPOLOGIES.CUSTOM));
  const [sides, setSides] = useState<ExposedSides>(
    piece.exposedSides
      ? normalizeExposedSides(piece.exposedSides)
      : { front: false, back: false, left: false, right: false }
  );

  useEffect(() => {
    if (!open) return;
    setTopology(String(piece.pieceTopology || suggested || PIECE_TOPOLOGIES.CUSTOM));
    setSides(
      piece.exposedSides
        ? normalizeExposedSides(piece.exposedSides)
        : { front: false, back: false, left: false, right: false }
    );
  }, [open, piece.id]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  const calc = calculateExposedEdgeInches(
    { lengthIn: piece.lengthIn, depthIn: piece.depthIn, quantity: piece.quantity },
    sides
  );
  const summary = formatExposedSidesSummary(sides, calc.totalLf);

  function applyTopology(next: string) {
    setTopology(next);
    if (next === PIECE_TOPOLOGIES.CUSTOM) return;
    setSides(defaultExposedSidesForTopology(next));
  }

  function handleConfirm() {
    const fe = buildFinishedEdgeFromExposedSides({
      lengthIn: piece.lengthIn,
      depthIn: piece.depthIn,
      quantity: piece.quantity,
      exposedSides: sides,
      topology,
      confirm: true
    });
    onConfirm({
      exposedSides: normalizeExposedSides(sides),
      pieceTopology: topology,
      finishedEdgeLf: Number((fe.totalFinishedEdgeLengthIn / 12).toFixed(2)),
      exposedSidesSummary: summary
    });
  }

  return createPortal(
    <div
      className="studio-v2-modal-backdrop"
      role="presentation"
      data-testid="studio-v2-exposed-sides-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="studio-v2-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        data-testid="studio-v2-exposed-sides-modal"
      >
        <header>
          <h3 id={`${baseId}-title`}>Set exposed sides</h3>
          <p className="muted">
            {roomName} · {piece.name} · {piece.lengthIn}″ × {piece.depthIn}″ · qty {piece.quantity}
          </p>
        </header>
        <div className="studio-v2-modal__body">
          <p className="muted">
            Mark physical sides that will be finished. Edge profile is chosen on the piece row.
            Geometry LF only — pricing stays on the server.
          </p>
          <label>
            <span>Piece type</span>
            <select
              value={topology}
              disabled={readOnly}
              onChange={(e) => applyTopology(e.target.value)}
              data-testid="studio-v2-edge-topology"
            >
              <option value={PIECE_TOPOLOGIES.WALL_RUN}>Wall / cabinet run</option>
              <option value={PIECE_TOPOLOGIES.ISLAND}>Island / exposed piece</option>
              <option value={PIECE_TOPOLOGIES.VANITY}>Vanity</option>
              <option value={PIECE_TOPOLOGIES.CUSTOM}>Other / manual</option>
            </select>
          </label>
          <div className="studio-v2-exposed-sides-grid" data-testid="studio-v2-exposed-sides-grid">
            {(
              [
                ["front", "Front (= length)"],
                ["back", "Back (= length)"],
                ["left", "Left (= depth)"],
                ["right", "Right (= depth)"]
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="studio-v2-check-row">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={sides[key]}
                  onChange={(e) => setSides((prev) => ({ ...prev, [key]: e.target.checked }))}
                  data-testid={`studio-v2-exposed-side-${key}`}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="studio-v2-modal__summary" data-testid="studio-v2-exposed-sides-summary">
            {summary}
          </p>
        </div>
        <footer className="studio-v2-modal__footer">
          <button type="button" className="eq-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          {!readOnly ? (
            <button
              type="button"
              className="eq-btn-primary"
              onClick={handleConfirm}
              data-testid="studio-v2-exposed-sides-confirm"
            >
              Apply
            </button>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body
  );
}

function CutoutsPopover(props: {
  open: boolean;
  anchorId: string;
  piece: StudioV2EditablePiece;
  readOnly: boolean;
  onClose: () => void;
  onChange: (patch: Partial<StudioV2EditablePiece>) => void;
}) {
  const { open, piece, readOnly, onClose, onChange } = props;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  function setCount(field: keyof StudioV2EditablePiece, raw: string) {
    const v = raw.trim() === "" ? null : Math.max(0, Math.floor(numInput(raw)));
    onChange({ [field]: v } as Partial<StudioV2EditablePiece>);
  }

  return (
    <div
      ref={panelRef}
      className="studio-v2-cutouts-pop"
      data-testid="studio-v2-cutouts-menu"
      role="dialog"
      aria-label="Piece cutouts"
    >
      <div className="studio-v2-cutouts-pop__grid">
        <label>
          <span>Kitchen sink</span>
          <input
            type="number"
            min={0}
            step={1}
            disabled={readOnly}
            value={piece.kitchenSinkCutouts ?? ""}
            onChange={(e) => setCount("kitchenSinkCutouts", e.target.value)}
            data-testid="studio-v2-cutout-kitchen-sink"
          />
        </label>
        <label>
          <span>Vanity / bar sink</span>
          <input
            type="number"
            min={0}
            step={1}
            disabled={readOnly}
            value={piece.vanityBarSinkCutouts ?? ""}
            onChange={(e) => setCount("vanityBarSinkCutouts", e.target.value)}
            data-testid="studio-v2-cutout-vanity-sink"
          />
        </label>
        <label>
          <span>Cooktop</span>
          <input
            type="number"
            min={0}
            step={1}
            disabled={readOnly}
            value={piece.cooktopCutouts ?? ""}
            onChange={(e) => setCount("cooktopCutouts", e.target.value)}
            data-testid="studio-v2-cutout-cooktop"
          />
        </label>
        <label>
          <span>Electrical outlet</span>
          <input
            type="number"
            min={0}
            step={1}
            disabled={readOnly}
            value={piece.outletCutouts ?? ""}
            onChange={(e) => setCount("outletCutouts", e.target.value)}
            data-testid="studio-v2-cutout-outlet"
          />
        </label>
        <label>
          <span>Pop-up outlet (not priced yet)</span>
          <input
            type="number"
            min={0}
            step={1}
            disabled={readOnly}
            value={piece.popupOutletCutouts ?? ""}
            onChange={(e) => setCount("popupOutletCutouts", e.target.value)}
            data-testid="studio-v2-cutout-popup"
          />
        </label>
      </div>
      <div className="studio-v2-cutouts-sidesplash">
        <span className="muted">Side splash eligible (not priced yet)</span>
        <label className="studio-v2-check-row">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={Boolean(piece.sideSplashLeft)}
            onChange={(e) => onChange({ sideSplashLeft: e.target.checked })}
            data-testid="studio-v2-cutout-side-splash-left"
          />
          <span>Left</span>
        </label>
        <label className="studio-v2-check-row">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={Boolean(piece.sideSplashRight)}
            onChange={(e) => onChange({ sideSplashRight: e.target.checked })}
            data-testid="studio-v2-cutout-side-splash-right"
          />
          <span>Right</span>
        </label>
      </div>
      <label>
        <span>Other cutout note (scope only)</span>
        <input
          type="text"
          disabled={readOnly}
          value={piece.cutoutNote || ""}
          onChange={(e) => onChange({ cutoutNote: e.target.value || null })}
          data-testid="studio-v2-cutout-note"
        />
      </label>
      <button type="button" className="eq-btn-secondary" onClick={onClose} data-testid="studio-v2-cutouts-done">
        Done
      </button>
    </div>
  );
}

export default function StudioV2ScopeEditor(props: Props) {
  const {
    value,
    readOnly,
    readOnlyMessage,
    dirty,
    saveBusy,
    saveError,
    saveNotice,
    onChange,
    onSave,
    planPreviewUrl = null,
    planPreviewLabel = null
  } = props;

  const [edgeTarget, setEdgeTarget] = useState<EdgeModalTarget>(null);
  const [cutoutsTarget, setCutoutsTarget] = useState<CutoutsTarget>(null);
  const [notesTarget, setNotesTarget] = useState<NotesTarget>(null);

  const openingSummary = summarizeOpenings(value.rooms);
  const openingsFromPieces = openingSummary.fromPieces;
  const displayOpenings = openingsFromPieces
    ? {
        kitchenSink: openingSummary.kitchenSink,
        vanityBarSink: openingSummary.vanityBarSink,
        cooktop: openingSummary.cooktop,
        outlet: openingSummary.outlet
      }
    : value.openings;

  function commitRooms(rooms: StudioV2EditableRoom[]) {
    const summary = summarizeOpenings(rooms);
    onChange({
      ...value,
      rooms,
      openings: summary.fromPieces
        ? {
            kitchenSink: summary.kitchenSink,
            vanityBarSink: summary.vanityBarSink,
            cooktop: summary.cooktop,
            outlet: summary.outlet
          }
        : value.openings,
      openingsSource: summary.fromPieces ? "piece" : value.openingsSource || "estimate"
    });
  }

  function updateRoom(roomId: string, patch: Partial<StudioV2EditableRoom>) {
    commitRooms(value.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)));
  }

  function updatePiece(roomId: string, pieceId: string, patch: Partial<StudioV2EditablePiece>) {
    commitRooms(
      value.rooms.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              pieces: r.pieces.map((p) => (p.id === pieceId ? { ...p, ...patch } : p))
            }
      )
    );
  }

  function addRoom() {
    commitRooms([
      ...value.rooms,
      {
        id: newId("room"),
        name: `Room ${value.rooms.length + 1}`,
        roomType: "Kitchen",
        included: true,
        backsplashSqft: null,
        edgeEligibleLinearFeet: null,
        pieces: [emptyPiece("Main run")]
      }
    ]);
  }

  function removeRoom(roomId: string) {
    commitRooms(value.rooms.filter((r) => r.id !== roomId));
  }

  function addPiece(roomId: string) {
    commitRooms(
      value.rooms.map((r) =>
        r.id !== roomId
          ? r
          : { ...r, pieces: [...r.pieces, emptyPiece(`Piece ${r.pieces.length + 1}`)] }
      )
    );
  }

  function removePiece(roomId: string, pieceId: string) {
    commitRooms(
      value.rooms.map((r) =>
        r.id !== roomId ? r : { ...r, pieces: r.pieces.filter((p) => p.id !== pieceId) }
      )
    );
  }

  const edgePiece =
    edgeTarget &&
    value.rooms
      .find((r) => r.id === edgeTarget.roomId)
      ?.pieces.find((p) => p.id === edgeTarget.pieceId);
  const edgeRoom = edgeTarget && value.rooms.find((r) => r.id === edgeTarget.roomId);
  const cutoutsPiece =
    cutoutsTarget &&
    value.rooms
      .find((r) => r.id === cutoutsTarget.roomId)
      ?.pieces.find((p) => p.id === cutoutsTarget.pieceId);
  const notesPiece =
    notesTarget &&
    value.rooms
      .find((r) => r.id === notesTarget.roomId)
      ?.pieces.find((p) => p.id === notesTarget.pieceId);

  return (
    <section className="studio-v2-panel studio-v2-scope-editor" data-testid="studio-v2-scope-editor">
      <div className="studio-v2-panel__head">
        <div>
          <h2>Working Draft scope</h2>
          <p className="muted studio-v2-scope-editor__hint">
            Compact piece review — set exposed sides and cutouts per piece. Pricing stays on the
            server after Calculate.
          </p>
        </div>
        {!readOnly ? (
          <button
            type="button"
            className="eq-btn-primary"
            disabled={saveBusy || !dirty}
            onClick={onSave}
            data-testid="studio-v2-save-scope"
          >
            {saveBusy ? "Saving…" : "Save Scope"}
          </button>
        ) : null}
      </div>

      {readOnly ? (
        <p className="studio-v2-approve-required" data-testid="studio-v2-scope-readonly">
          {readOnlyMessage || "Scope is read-only on this estimate."}
        </p>
      ) : null}
      {dirty && !readOnly ? (
        <p className="studio-v2-dirty" data-testid="studio-v2-scope-dirty">
          Unsaved scope changes
        </p>
      ) : null}
      {saveNotice ? (
        <p className="studio-v2-notice" data-testid="studio-v2-scope-saved">
          {saveNotice}
        </p>
      ) : null}
      {saveError ? (
        <div className="error-box" data-testid="studio-v2-scope-save-error">
          {saveError}
        </div>
      ) : null}

      <div className="studio-v2-scope-review" data-testid="studio-v2-scope-review">
        <div className="studio-v2-scope-review__main">
          <div className="studio-v2-openings" data-testid="studio-v2-openings">
            <h3>Openings summary</h3>
            <p className="muted studio-v2-scope-editor__hint">
              {openingsFromPieces
                ? "Totals from piece cutouts."
                : "Legacy project totals — prefer Cutouts on each piece."}
            </p>
            <div className="studio-v2-openings__grid">
              {(
                [
                  ["kitchenSink", "Kitchen sinks"],
                  ["vanityBarSink", "Vanity / bar sinks"],
                  ["cooktop", "Cooktops"],
                  ["outlet", "Outlets"]
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    disabled={readOnly || openingsFromPieces}
                    value={displayOpenings[key]}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        openings: {
                          ...value.openings,
                          [key]: Math.max(0, Math.floor(numInput(e.target.value)))
                        },
                        openingsSource: "estimate"
                      })
                    }
                    data-testid={`studio-v2-opening-${key}`}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="studio-v2-scope-editor__rooms">
            {value.rooms.length === 0 ? (
              <p className="muted" data-testid="studio-v2-scope-empty">
                No rooms yet. Add a room to start the Working Draft scope.
              </p>
            ) : null}

            {value.rooms.map((room) => (
              <article key={room.id} className="studio-v2-room-card" data-testid="studio-v2-room-card">
                <div className="studio-v2-room-card__head">
                  <label>
                    <span>Room name</span>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={room.name}
                      onChange={(e) => updateRoom(room.id, { name: e.target.value })}
                      data-testid="studio-v2-room-name"
                    />
                  </label>
                  <label>
                    <span>Room type</span>
                    <select
                      disabled={readOnly}
                      value={room.roomType || "Other"}
                      onChange={(e) => updateRoom(room.id, { roomType: e.target.value })}
                      data-testid="studio-v2-room-type"
                    >
                      {!STUDIO_V2_ROOM_TYPES.includes(
                        room.roomType as (typeof STUDIO_V2_ROOM_TYPES)[number]
                      ) ? (
                        <option value={room.roomType}>{room.roomType}</option>
                      ) : null}
                      {STUDIO_V2_ROOM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Room edge LF</span>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      disabled={readOnly}
                      value={room.edgeEligibleLinearFeet ?? ""}
                      onChange={(e) =>
                        updateRoom(room.id, {
                          edgeEligibleLinearFeet:
                            e.target.value.trim() === "" ? null : numInput(e.target.value)
                        })
                      }
                      data-testid="studio-v2-room-edge-lf"
                    />
                  </label>
                  <label>
                    <span>Backsplash SF</span>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      disabled={readOnly}
                      value={room.backsplashSqft ?? ""}
                      onChange={(e) =>
                        updateRoom(room.id, {
                          backsplashSqft:
                            e.target.value.trim() === "" ? null : numInput(e.target.value)
                        })
                      }
                      data-testid="studio-v2-room-backsplash-sf"
                    />
                  </label>
                  {!readOnly ? (
                    <button
                      type="button"
                      className="eq-btn-secondary"
                      onClick={() => removeRoom(room.id)}
                      data-testid="studio-v2-remove-room"
                    >
                      Remove room
                    </button>
                  ) : null}
                </div>

                <div className="studio-v2-piece-table-wrap">
                  <table className="studio-v2-piece-table studio-v2-piece-table--review" data-testid="studio-v2-piece-table">
                    <thead>
                      <tr>
                        <th>Include</th>
                        <th>Piece</th>
                        <th>L</th>
                        <th>D</th>
                        <th>Qty</th>
                        <th>Direct SF</th>
                        <th>Backsplash</th>
                        <th>Exposed edges</th>
                        <th>Cutouts</th>
                        <th>Edge profile</th>
                        <th>Notes</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {room.pieces.map((piece) => {
                        const cutId = `cutouts-${room.id}-${piece.id}`;
                        return (
                          <tr key={piece.id} data-testid="studio-v2-piece-row">
                            <td>
                              <input
                                type="checkbox"
                                disabled={readOnly}
                                checked={piece.included !== false}
                                onChange={(e) =>
                                  updatePiece(room.id, piece.id, { included: e.target.checked })
                                }
                                data-testid="studio-v2-piece-included"
                                aria-label={`Include ${piece.name}`}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                disabled={readOnly}
                                value={piece.name}
                                onChange={(e) =>
                                  updatePiece(room.id, piece.id, { name: e.target.value })
                                }
                                data-testid="studio-v2-piece-label"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                disabled={readOnly}
                                value={piece.lengthIn}
                                onChange={(e) =>
                                  updatePiece(room.id, piece.id, {
                                    lengthIn: numInput(e.target.value)
                                  })
                                }
                                data-testid="studio-v2-piece-length"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                disabled={readOnly}
                                value={piece.depthIn}
                                onChange={(e) =>
                                  updatePiece(room.id, piece.id, {
                                    depthIn: numInput(e.target.value)
                                  })
                                }
                                data-testid="studio-v2-piece-depth"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                disabled={readOnly}
                                value={piece.quantity}
                                onChange={(e) =>
                                  updatePiece(room.id, piece.id, {
                                    quantity: Math.max(1, Math.floor(numInput(e.target.value) || 1))
                                  })
                                }
                                data-testid="studio-v2-piece-quantity"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                disabled={readOnly}
                                value={piece.approvedDirectSqft ?? ""}
                                onChange={(e) =>
                                  updatePiece(room.id, piece.id, {
                                    approvedDirectSqft:
                                      e.target.value.trim() === ""
                                        ? null
                                        : numInput(e.target.value)
                                  })
                                }
                                data-testid="studio-v2-piece-direct-sf"
                              />
                            </td>
                            <td>
                              <select
                                disabled={readOnly}
                                value={piece.includeBacksplash ? "include" : "none"}
                                onChange={(e) => {
                                  const include = e.target.value === "include";
                                  updatePiece(room.id, piece.id, {
                                    includeBacksplash: include,
                                    backsplashEligibleLengthIn: include
                                      ? piece.backsplashEligibleLengthIn ??
                                        (piece.lengthIn > 0 ? piece.lengthIn : null)
                                      : null
                                  });
                                }}
                                data-testid="studio-v2-piece-backsplash"
                              >
                                <option value="none">No backsplash</option>
                                <option value="include">Include</option>
                              </select>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="eq-btn-ghost studio-v2-edge-trigger"
                                disabled={false}
                                onClick={() => {
                                  setCutoutsTarget(null);
                                  setNotesTarget(null);
                                  setEdgeTarget({ roomId: room.id, pieceId: piece.id });
                                }}
                                data-testid="studio-v2-set-exposed-sides"
                                aria-label={`Set exposed sides for ${piece.name}`}
                              >
                                {exposedSummaryText(piece)}
                              </button>
                            </td>
                            <td className="studio-v2-cutouts-cell">
                              <button
                                type="button"
                                className="eq-btn-ghost"
                                id={cutId}
                                onClick={() => {
                                  setEdgeTarget(null);
                                  setNotesTarget(null);
                                  setCutoutsTarget(
                                    cutoutsTarget?.pieceId === piece.id
                                      ? null
                                      : { roomId: room.id, pieceId: piece.id }
                                  );
                                }}
                                data-testid="studio-v2-cutouts"
                                aria-label={`Cutouts for ${piece.name}`}
                              >
                                <span data-testid="studio-v2-cutouts-summary">
                                  {cutoutsSummary(piece)}
                                </span>
                              </button>
                              {cutoutsTarget?.roomId === room.id &&
                              cutoutsTarget?.pieceId === piece.id &&
                              cutoutsPiece ? (
                                <CutoutsPopover
                                  open
                                  anchorId={cutId}
                                  piece={cutoutsPiece}
                                  readOnly={readOnly}
                                  onClose={() => setCutoutsTarget(null)}
                                  onChange={(patch) =>
                                    updatePiece(room.id, piece.id, patch)
                                  }
                                />
                              ) : null}
                            </td>
                            <td>
                              <select
                                disabled={readOnly}
                                value={piece.edgeProfileToken || ""}
                                onChange={(e) =>
                                  updatePiece(room.id, piece.id, {
                                    edgeProfileToken: e.target.value || null
                                  })
                                }
                                data-testid="studio-v2-piece-edge-profile"
                                aria-label={`Edge profile for ${piece.name}`}
                              >
                                <option value="">Estimate default</option>
                                {STUDIO_V2_EDGE_PROFILES.map((p) => (
                                  <option key={p.value} value={p.value}>
                                    {p.label}
                                  </option>
                                ))}
                                <option disabled value="__mitered_waterfall_placeholder__">
                                  Mitered / waterfall (not priced yet)
                                </option>
                              </select>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="eq-btn-ghost"
                                onClick={() => {
                                  setEdgeTarget(null);
                                  setCutoutsTarget(null);
                                  setNotesTarget(
                                    notesTarget?.pieceId === piece.id
                                      ? null
                                      : { roomId: room.id, pieceId: piece.id }
                                  );
                                }}
                                data-testid="studio-v2-piece-notes"
                              >
                                {piece.notes || piece.backsplashEligibleLengthIn != null
                                  ? "Details"
                                  : "—"}
                              </button>
                              {notesTarget?.roomId === room.id &&
                              notesTarget?.pieceId === piece.id &&
                              notesPiece ? (
                                <div className="studio-v2-notes-pop" data-testid="studio-v2-notes-menu">
                                  <label>
                                    <span>Splash LF</span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.1"
                                      disabled={readOnly || !notesPiece.includeBacksplash}
                                      value={notesPiece.backsplashEligibleLengthIn ?? ""}
                                      onChange={(e) =>
                                        updatePiece(room.id, piece.id, {
                                          backsplashEligibleLengthIn:
                                            e.target.value.trim() === ""
                                              ? null
                                              : numInput(e.target.value)
                                        })
                                      }
                                      data-testid="studio-v2-piece-splash-lf"
                                    />
                                  </label>
                                  <label>
                                    <span>Notes</span>
                                    <textarea
                                      disabled={readOnly}
                                      value={notesPiece.notes || ""}
                                      onChange={(e) =>
                                        updatePiece(room.id, piece.id, {
                                          notes: e.target.value || null
                                        })
                                      }
                                      rows={2}
                                      data-testid="studio-v2-piece-notes-input"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="eq-btn-secondary"
                                    onClick={() => setNotesTarget(null)}
                                  >
                                    Done
                                  </button>
                                </div>
                              ) : null}
                            </td>
                            <td>
                              {!readOnly ? (
                                <button
                                  type="button"
                                  className="eq-btn-ghost"
                                  onClick={() => removePiece(room.id, piece.id)}
                                  data-testid="studio-v2-remove-piece"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {!readOnly ? (
                  <button
                    type="button"
                    className="eq-btn-secondary"
                    onClick={() => addPiece(room.id)}
                    data-testid="studio-v2-add-piece"
                  >
                    Add piece
                  </button>
                ) : null}
              </article>
            ))}
          </div>

          {!readOnly ? (
            <button
              type="button"
              className="eq-btn-secondary"
              onClick={addRoom}
              data-testid="studio-v2-add-room"
            >
              Add room
            </button>
          ) : null}
        </div>

        <aside className="studio-v2-plan-preview" data-testid="studio-v2-plan-preview">
          <h3>Plan preview</h3>
          {planPreviewUrl ? (
            <iframe
              title={planPreviewLabel || "Plan preview"}
              src={planPreviewUrl}
              className="studio-v2-plan-preview__frame"
            />
          ) : (
            <p className="muted" data-testid="studio-v2-plan-preview-placeholder">
              Plan preview is not wired into Studio V2 yet. Open the takeoff or intake attachment
              in V1 if you need the drawing beside this review.
            </p>
          )}
        </aside>
      </div>

      {edgeTarget && edgePiece && edgeRoom ? (
        <ExposedSidesModal
          open
          roomName={edgeRoom.name}
          piece={edgePiece}
          readOnly={readOnly}
          onCancel={() => setEdgeTarget(null)}
          onConfirm={(patch) => {
            updatePiece(edgeTarget.roomId, edgeTarget.pieceId, patch);
            setEdgeTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}
