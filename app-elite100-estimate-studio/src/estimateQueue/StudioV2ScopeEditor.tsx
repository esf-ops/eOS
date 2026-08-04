/**
 * Studio V2 scope review editor — dense workbench layout with piece selection panel.
 * Does not import V1 / AI Takeoff Review workspace components.
 */
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  backsplashNeedsRunLength,
  buildFinishedEdgeFromExposedSides,
  calculateExposedEdgeInches,
  countertopSfModeLabel,
  cutoutsSummary,
  defaultExposedSidesForTopology,
  displayCountertopSf,
  edgeProfileLabel,
  exposedSummaryText,
  formatExposedSidesSummary,
  formatInches,
  geometrySfFromDimensions,
  needsExposedSides,
  normalizeExposedSides,
  PIECE_TOPOLOGIES,
  round2,
  scopeReviewChecklist,
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

function roomStats(room: StudioV2EditableRoom) {
  let includedCount = 0;
  let geometrySf = 0;
  let splashWarn = 0;
  let needEdges = 0;
  for (const piece of room.pieces) {
    if (piece.included === false) continue;
    includedCount += 1;
    const geo = geometrySfFromDimensions(piece);
    if (geo != null) geometrySf = round2(geometrySf + geo);
    if (backsplashNeedsRunLength(piece)) splashWarn += 1;
    if (needsExposedSides(piece)) needEdges += 1;
  }
  return { includedCount, geometrySf, splashWarn, needEdges };
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
  planPreviewUrl?: string | null;
  planPreviewLabel?: string | null;
};

type PieceTarget = { roomId: string; pieceId: string } | null;

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

  const lengthLabel = formatInches(piece.lengthIn);
  const depthLabel = formatInches(piece.depthIn);
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

  const sideDefs = [
    { key: "front" as const, label: `Front — ${lengthLabel}"`, dim: "length" },
    { key: "back" as const, label: `Back — ${lengthLabel}"`, dim: "length" },
    { key: "left" as const, label: `Left — ${depthLabel}"`, dim: "depth" },
    { key: "right" as const, label: `Right — ${depthLabel}"`, dim: "depth" }
  ];

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
          <p className="muted" data-testid="studio-v2-exposed-sides-piece-meta">
            {roomName} · {piece.name}
          </p>
          <dl className="studio-v2-exposed-dims" data-testid="studio-v2-exposed-sides-dims">
            <div>
              <dt>Length</dt>
              <dd>{lengthLabel}"</dd>
            </div>
            <div>
              <dt>Depth</dt>
              <dd>{depthLabel}"</dd>
            </div>
            <div>
              <dt>Qty</dt>
              <dd>{piece.quantity || 1}</dd>
            </div>
          </dl>
        </header>
        <div className="studio-v2-modal__body">
          <p className="muted">
            Mark physical sides that will be finished. Edge profile is chosen on the piece row.
            Geometry LF only — pricing stays on the server.
          </p>

          <div className="studio-v2-side-diagram" data-testid="studio-v2-side-diagram" aria-hidden="true">
            <div className="studio-v2-side-diagram__back">Back {lengthLabel}"</div>
            <div className="studio-v2-side-diagram__mid">
              <span>Left {depthLabel}"</span>
              <span className="studio-v2-side-diagram__piece">{piece.name || "Piece"}</span>
              <span>Right {depthLabel}"</span>
            </div>
            <div className="studio-v2-side-diagram__front">Front {lengthLabel}"</div>
          </div>

          <ul className="studio-v2-side-ref" data-testid="studio-v2-side-ref">
            <li>Front = length = {lengthLabel}"</li>
            <li>Back = length = {lengthLabel}"</li>
            <li>Left = depth = {depthLabel}"</li>
            <li>Right = depth = {depthLabel}"</li>
          </ul>

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
            {sideDefs.map(({ key, label }) => (
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
            Selected total: {Number(calc.totalLf || 0).toFixed(2)} LF
            {summary && summary !== "Set exposed sides" ? ` · ${summary}` : ""}
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

function ScopeWorkbenchPanel(props: {
  checklist: ReturnType<typeof scopeReviewChecklist>;
  selected: { room: StudioV2EditableRoom; piece: StudioV2EditablePiece } | null;
  planPreviewUrl: string | null;
  planPreviewLabel: string | null;
  onSelectWarningPiece?: (roomId: string, pieceId: string) => void;
  rooms: StudioV2EditableRoom[];
  estimateDefaultEdgeToken?: string | null;
}) {
  const { checklist, selected, planPreviewUrl, planPreviewLabel, rooms, estimateDefaultEdgeToken } =
    props;
  const selectedSf = selected ? displayCountertopSf(selected.piece) : null;
  const selectedProfile = selected
    ? edgeProfileLabel(
        selected.piece.edgeProfileToken,
        STUDIO_V2_EDGE_PROFILES,
        estimateDefaultEdgeToken
      )
    : null;

  const warningPieces: Array<{
    roomId: string;
    pieceId: string;
    roomName: string;
    pieceName: string;
  }> = [];
  for (const room of rooms) {
    if (room.included === false) continue;
    for (const piece of room.pieces) {
      if (piece.included === false) continue;
      if (backsplashNeedsRunLength(piece)) {
        warningPieces.push({
          roomId: room.id,
          pieceId: piece.id,
          roomName: room.name,
          pieceName: piece.name
        });
      }
    }
  }

  return (
    <aside className="studio-v2-workbench-panel" data-testid="studio-v2-workbench-panel">
      {selected ? (
        <div className="studio-v2-selected-piece" data-testid="studio-v2-selected-piece">
          <h3>Selected piece</h3>
          <p className="studio-v2-selected-piece__name">{selected.piece.name}</p>
          <p className="muted">
            {selected.room.name} · {selected.room.roomType}
          </p>
          <dl className="studio-v2-selected-piece__dl">
            <div>
              <dt>Included</dt>
              <dd>
                {selected.piece.included === false ? "Excluded from quote" : "Included in quote"}
              </dd>
            </div>
            <div>
              <dt>Dimensions</dt>
              <dd data-testid="studio-v2-selected-dims">
                {formatInches(selected.piece.lengthIn)}" × {formatInches(selected.piece.depthIn)}" ×{" "}
                {selected.piece.quantity || 1}
              </dd>
            </div>
            <div>
              <dt>Geometry SF</dt>
              <dd>
                {selectedSf?.geometrySf != null ? `${selectedSf.geometrySf.toFixed(2)} SF` : "—"}
              </dd>
            </div>
            <div>
              <dt>Countertop SF</dt>
              <dd>
                {selectedSf
                  ? countertopSfModeLabel(selectedSf.mode)
                  : "—"}
                {selectedSf?.mode === "direct" && selectedSf.countedSf != null
                  ? ` · ${selectedSf.countedSf.toFixed(2)} SF`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Backsplash</dt>
              <dd>
                {selected.piece.includeBacksplash
                  ? selected.piece.backsplashEligibleLengthIn
                    ? `Include · ${formatInches(Number(selected.piece.backsplashEligibleLengthIn))}" run`
                    : "Include · no run length"
                  : "No backsplash"}
              </dd>
            </div>
            <div>
              <dt>Finished edges</dt>
              <dd>{exposedSummaryText(selected.piece)}</dd>
            </div>
            <div>
              <dt>Edge profile</dt>
              <dd>
                {selectedProfile?.label || "Estimate default"}
                {selectedProfile?.upgraded ? " · Upgraded" : ""}
              </dd>
            </div>
            <div>
              <dt>Cutouts</dt>
              <dd>{cutoutsSummary(selected.piece)}</dd>
            </div>
            {selected.piece.notes ? (
              <div>
                <dt>Notes</dt>
                <dd>{selected.piece.notes}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : (
        <div className="studio-v2-scope-checklist" data-testid="studio-v2-scope-checklist">
          <h3>Scope review checklist</h3>
          <ul>
            <li data-testid="studio-v2-checklist-included">
              Included pieces: <strong>{checklist.includedPieces}</strong>
            </li>
            <li data-testid="studio-v2-checklist-geometry">
              Included geometry SF: <strong>{checklist.totalGeometrySf.toFixed(2)}</strong>
            </li>
            <li data-testid="studio-v2-checklist-edges">
              Need exposed sides: <strong>{checklist.needingExposedSides}</strong>
            </li>
            <li data-testid="studio-v2-checklist-splash">
              Backsplash run warnings: <strong>{checklist.backsplashWarnings.length}</strong>
            </li>
          </ul>
          {warningPieces.length > 0 ? (
            <div className="studio-v2-scope-checklist__warns">
              <p className="studio-v2-inline-warn">
                Backsplash selected, but no run length is available.
              </p>
              <ul>
                {warningPieces.map((w) => (
                  <li key={`${w.roomId}-${w.pieceId}`}>
                    <button
                      type="button"
                      className="eq-btn-ghost studio-v2-inline-action"
                      onClick={() => props.onSelectWarningPiece?.(w.roomId, w.pieceId)}
                    >
                      {w.roomName} · {w.pieceName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      <div className="studio-v2-plan-preview" data-testid="studio-v2-plan-preview">
        <h3>Plan preview</h3>
        {planPreviewUrl ? (
          <iframe
            title={planPreviewLabel || "Plan preview"}
            src={planPreviewUrl}
            className="studio-v2-plan-preview__frame"
          />
        ) : (
          <p className="muted" data-testid="studio-v2-plan-preview-placeholder">
            Open AI Takeoff Review to view the plan while verifying measurements.
          </p>
        )}
      </div>
    </aside>
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

  const [edgeTarget, setEdgeTarget] = useState<PieceTarget>(null);
  const [cutoutsTarget, setCutoutsTarget] = useState<PieceTarget>(null);
  const [selected, setSelected] = useState<PieceTarget>(null);

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

  const checklist = scopeReviewChecklist(value.rooms);

  let selectedPair: { room: StudioV2EditableRoom; piece: StudioV2EditablePiece } | null = null;
  if (selected) {
    const room = value.rooms.find((r) => r.id === selected.roomId);
    const piece = room?.pieces.find((p) => p.id === selected.pieceId);
    if (room && piece) selectedPair = { room, piece };
  }

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
    if (selected?.roomId === roomId) setSelected(null);
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
    if (selected?.roomId === roomId && selected?.pieceId === pieceId) setSelected(null);
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

  return (
    <section className="studio-v2-panel studio-v2-scope-editor" data-testid="studio-v2-scope-editor">
      <div className="studio-v2-panel__head">
        <div>
          <h2>Working Draft scope</h2>
          <p className="muted studio-v2-scope-editor__hint">
            Dense piece review workbench — dimensions, SF, backsplash, edges, and cutouts stay
            visible. Select a piece for the detail panel. Pricing stays on the server after
            Calculate.
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
          {readOnlyMessage || "Approved estimate is read-only."}
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

      <div className="studio-v2-scope-review studio-v2-scope-review--workbench" data-testid="studio-v2-scope-review">
        <div className="studio-v2-scope-review__main">
          <div className="studio-v2-scope-editor__rooms">
            {value.rooms.length === 0 ? (
              <p className="muted" data-testid="studio-v2-scope-empty">
                No rooms yet. Add a room to start the Working Draft scope.
              </p>
            ) : null}

            {value.rooms.map((room) => {
              const stats = roomStats(room);
              return (
                <article
                  key={room.id}
                  className="studio-v2-room-card studio-v2-room-card--compact"
                  data-testid="studio-v2-room-card"
                >
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
                    <div className="studio-v2-room-card__meta" data-testid="studio-v2-room-meta">
                      <span>
                        {stats.includedCount} piece{stats.includedCount === 1 ? "" : "s"}
                      </span>
                      <span>{stats.geometrySf.toFixed(2)} SF</span>
                      {stats.splashWarn > 0 ? (
                        <span className="studio-v2-badge studio-v2-badge--accent">
                          Splash warn ×{stats.splashWarn}
                        </span>
                      ) : null}
                      {stats.needEdges > 0 ? (
                        <span className="studio-v2-badge studio-v2-badge--muted">
                          Edges needed ×{stats.needEdges}
                        </span>
                      ) : null}
                    </div>
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

                  <div
                    className="studio-v2-piece-workbench"
                    data-testid="studio-v2-piece-table"
                    role="table"
                    aria-label={`Pieces in ${room.name}`}
                  >
                    <div className="studio-v2-piece-workbench__header" role="row">
                      <span>Incl</span>
                      <span>Piece</span>
                      <span>L</span>
                      <span>D</span>
                      <span>Qty</span>
                      <span>Geo SF</span>
                      <span>SF mode</span>
                      <span>Backsplash</span>
                      <span>Finished edges</span>
                      <span>Edge profile</span>
                      <span>Cutouts</span>
                      <span className="studio-v2-sr-only">Actions</span>
                    </div>

                    {room.pieces.map((piece) => {
                      const cutId = `cutouts-${room.id}-${piece.id}`;
                      const excluded = piece.included === false;
                      const sf = displayCountertopSf(piece);
                      const profile = edgeProfileLabel(
                        piece.edgeProfileToken,
                        STUDIO_V2_EDGE_PROFILES,
                        value.edgeProfileToken
                      );
                      const splashWarn = backsplashNeedsRunLength(piece);
                      const edgeSummary = exposedSummaryText(piece);
                      const isSelected =
                        selected?.roomId === room.id && selected?.pieceId === piece.id;

                      return (
                        <div
                          key={piece.id}
                          className={`studio-v2-piece-row${excluded ? " is-excluded" : ""}${
                            readOnly ? " is-readonly" : ""
                          }${isSelected ? " is-selected" : ""}`}
                          data-testid="studio-v2-piece-row"
                          data-excluded={excluded ? "true" : "false"}
                          role="row"
                          onClick={() => setSelected({ roomId: room.id, pieceId: piece.id })}
                          onFocusCapture={() =>
                            setSelected({ roomId: room.id, pieceId: piece.id })
                          }
                        >
                          <div className="studio-v2-piece-row__grid">
                            <label className="studio-v2-piece-row__include">
                              <input
                                type="checkbox"
                                disabled={readOnly}
                                checked={piece.included !== false}
                                onChange={(e) =>
                                  updatePiece(room.id, piece.id, { included: e.target.checked })
                                }
                                data-testid="studio-v2-piece-included"
                                aria-label={`Include ${piece.name} in quote`}
                              />
                              <span className="studio-v2-sr-only">
                                {excluded ? "Excluded from quote" : "Included in quote"}
                              </span>
                            </label>

                            <div className="studio-v2-piece-row__name-wrap">
                              <input
                                type="text"
                                className="studio-v2-piece-row__name"
                                disabled={readOnly}
                                value={piece.name}
                                onChange={(e) =>
                                  updatePiece(room.id, piece.id, { name: e.target.value })
                                }
                                data-testid="studio-v2-piece-label"
                                aria-label="Piece name"
                              />
                              {excluded ? (
                                <span className="studio-v2-badge studio-v2-badge--muted">
                                  Excluded from quote
                                </span>
                              ) : null}
                            </div>

                            <label className="studio-v2-piece-row__field">
                              <span className="studio-v2-piece-row__mobile-label">L</span>
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
                                aria-label={`Length inches for ${piece.name}`}
                              />
                            </label>

                            <label className="studio-v2-piece-row__field">
                              <span className="studio-v2-piece-row__mobile-label">D</span>
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
                                aria-label={`Depth inches for ${piece.name}`}
                              />
                            </label>

                            <label className="studio-v2-piece-row__field">
                              <span className="studio-v2-piece-row__mobile-label">Qty</span>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                disabled={readOnly}
                                value={piece.quantity}
                                onChange={(e) =>
                                  updatePiece(room.id, piece.id, {
                                    quantity: Math.max(
                                      1,
                                      Math.floor(numInput(e.target.value) || 1)
                                    )
                                  })
                                }
                                data-testid="studio-v2-piece-quantity"
                                aria-label={`Quantity for ${piece.name}`}
                              />
                            </label>

                            <div
                              className="studio-v2-piece-row__geo"
                              data-testid="studio-v2-piece-geometry-sf"
                            >
                              {sf.geometrySf != null ? sf.geometrySf.toFixed(2) : "—"}
                            </div>

                            <div data-testid="studio-v2-piece-sf-mode">
                              {excluded ? (
                                <span className="studio-v2-badge studio-v2-badge--muted">Excluded</span>
                              ) : (
                                <div className="studio-v2-sf-mode">
                                  <select
                                    disabled={readOnly}
                                    value={sf.mode === "direct" ? "direct" : "dimensions"}
                                    onChange={(e) => {
                                      if (e.target.value === "direct") {
                                        const seed =
                                          piece.approvedDirectSqft != null &&
                                          Number(piece.approvedDirectSqft) > 0
                                            ? Number(piece.approvedDirectSqft)
                                            : sf.geometrySf || 0;
                                        updatePiece(room.id, piece.id, {
                                          approvedDirectSqft: seed > 0 ? seed : 0
                                        });
                                      } else {
                                        updatePiece(room.id, piece.id, {
                                          approvedDirectSqft: null
                                        });
                                      }
                                    }}
                                    data-testid="studio-v2-piece-sf-mode-select"
                                    aria-label={`Countertop SF mode for ${piece.name}`}
                                  >
                                    <option value="dimensions">Use dimensions</option>
                                    <option value="direct">Direct SF</option>
                                  </select>
                                  {sf.mode === "direct" ? (
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
                                      aria-label="Direct square footage"
                                    />
                                  ) : null}
                                </div>
                              )}
                            </div>

                            <div className="studio-v2-piece-row__splash">
                              <select
                                disabled={readOnly || excluded}
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
                                aria-label={`Backsplash for ${piece.name}`}
                              >
                                <option value="none">No backsplash</option>
                                <option value="include">Include</option>
                              </select>
                              {piece.includeBacksplash ? (
                                <input
                                  type="number"
                                  min={0}
                                  step="0.1"
                                  disabled={readOnly || excluded}
                                  value={piece.backsplashEligibleLengthIn ?? ""}
                                  onChange={(e) =>
                                    updatePiece(room.id, piece.id, {
                                      backsplashEligibleLengthIn:
                                        e.target.value.trim() === ""
                                          ? null
                                          : numInput(e.target.value)
                                    })
                                  }
                                  data-testid="studio-v2-piece-splash-lf"
                                  aria-label={`Splash run inches for ${piece.name}`}
                                  placeholder="Run in"
                                />
                              ) : null}
                              {splashWarn ? (
                                <p
                                  className="studio-v2-inline-warn"
                                  data-testid="studio-v2-backsplash-run-warning"
                                >
                                  Backsplash selected, but no run length is available.
                                  {!readOnly && piece.lengthIn > 0 ? (
                                    <>
                                      {" "}
                                      <button
                                        type="button"
                                        className="eq-btn-ghost studio-v2-inline-action"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          updatePiece(room.id, piece.id, {
                                            backsplashEligibleLengthIn: piece.lengthIn
                                          });
                                        }}
                                        data-testid="studio-v2-use-piece-length"
                                      >
                                        Use piece length
                                      </button>
                                    </>
                                  ) : null}
                                </p>
                              ) : null}
                            </div>

                            <div>
                              <button
                                type="button"
                                className="eq-btn-secondary studio-v2-edge-trigger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCutoutsTarget(null);
                                  setSelected({ roomId: room.id, pieceId: piece.id });
                                  setEdgeTarget({ roomId: room.id, pieceId: piece.id });
                                }}
                                data-testid="studio-v2-set-exposed-sides"
                                aria-label={`Set exposed sides for ${piece.name}`}
                              >
                                <span data-testid="studio-v2-exposed-summary">{edgeSummary}</span>
                              </button>
                            </div>

                            <div className="studio-v2-piece-row__profile">
                              <select
                                disabled={readOnly || excluded}
                                value={piece.edgeProfileToken || ""}
                                onChange={(e) =>
                                  updatePiece(room.id, piece.id, {
                                    edgeProfileToken: e.target.value || null
                                  })
                                }
                                data-testid="studio-v2-piece-edge-profile"
                                aria-label={`Edge profile for ${piece.name}`}
                                className={profile.upgraded ? "is-upgraded" : undefined}
                              >
                                <option value="">
                                  {
                                    edgeProfileLabel(
                                      null,
                                      STUDIO_V2_EDGE_PROFILES,
                                      value.edgeProfileToken
                                    ).label
                                  }
                                </option>
                                {STUDIO_V2_EDGE_PROFILES.map((p) => (
                                  <option key={p.value} value={p.value}>
                                    {p.label}
                                  </option>
                                ))}
                                <option disabled value="__mitered_waterfall_placeholder__">
                                  Mitered / waterfall (not priced yet)
                                </option>
                              </select>
                              {profile.upgraded ? (
                                <span
                                  className="studio-v2-badge studio-v2-badge--accent"
                                  data-testid="studio-v2-edge-upgraded"
                                >
                                  Upgraded
                                </span>
                              ) : null}
                            </div>

                            <div className="studio-v2-cutouts-cell">
                              <button
                                type="button"
                                className="eq-btn-secondary"
                                id={cutId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEdgeTarget(null);
                                  setSelected({ roomId: room.id, pieceId: piece.id });
                                  setCutoutsTarget(
                                    cutoutsTarget?.pieceId === piece.id
                                      ? null
                                      : { roomId: room.id, pieceId: piece.id }
                                  );
                                }}
                                data-testid="studio-v2-cutouts"
                                aria-label={`Edit cutouts for ${piece.name}`}
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
                                  piece={cutoutsPiece}
                                  readOnly={readOnly}
                                  onClose={() => setCutoutsTarget(null)}
                                  onChange={(patch) => updatePiece(room.id, piece.id, patch)}
                                />
                              ) : null}
                            </div>

                            <div className="studio-v2-piece-row__actions">
                              <details>
                                <summary data-testid="studio-v2-piece-notes">Details</summary>
                                <label className="studio-v2-piece-review__notes">
                                  <span>Notes</span>
                                  <textarea
                                    disabled={readOnly}
                                    value={piece.notes || ""}
                                    onChange={(e) =>
                                      updatePiece(room.id, piece.id, {
                                        notes: e.target.value || null
                                      })
                                    }
                                    rows={2}
                                    data-testid="studio-v2-piece-notes-input"
                                  />
                                </label>
                                <p className="muted studio-v2-piece-review__scope-only">
                                  Scope-only / not priced yet: pop-up outlets, side splash, other
                                  cutout notes.
                                </p>
                              </details>
                              {!readOnly ? (
                                <button
                                  type="button"
                                  className="eq-btn-ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removePiece(room.id, piece.id);
                                  }}
                                  data-testid="studio-v2-remove-piece"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <span className="studio-v2-sr-only" data-testid="studio-v2-piece-dims">
                            {formatInches(piece.lengthIn)}" × {formatInches(piece.depthIn)}" ×{" "}
                            {piece.quantity || 1}
                          </span>
                        </div>
                      );
                    })}
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
              );
            })}
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

          <details className="studio-v2-legacy-openings" data-testid="studio-v2-openings">
            <summary>Legacy openings</summary>
            <p className="muted studio-v2-scope-editor__hint">
              Legacy openings are kept for older estimates. Prefer piece-level cutouts.
              {openingsFromPieces ? " Showing totals from piece cutouts." : ""}
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
          </details>
        </div>

        <ScopeWorkbenchPanel
          checklist={checklist}
          selected={selectedPair}
          rooms={value.rooms}
          estimateDefaultEdgeToken={value.edgeProfileToken}
          planPreviewUrl={planPreviewUrl}
          planPreviewLabel={planPreviewLabel}
          onSelectWarningPiece={(roomId, pieceId) => setSelected({ roomId, pieceId })}
        />
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
