/**
 * TakeoffRoomReviewWorkbench — room-first estimator review after AI generation.
 * Selected room detail is the primary editing surface for dimensions and scope.
 */
import EosSectionCard from "@eliteos-ui/EosSectionCard";
import EosStatusPill from "@eliteos-ui/EosStatusPill";
import React, { useCallback, useMemo, useState } from "react";
import type { TakeoffResult, TakeoffArea, TakeoffRun } from "@takeoff-core/takeoffContract.mjs";
import {
  canMarkRoomVerified,
  formatBacksplashScopeLabel,
  formatPieceTypeLabel,
} from "@takeoff-core/reviewedTakeoffMath.mjs";
import {
  ADD_PIECE_PRESETS,
  ROOM_TYPE_OPTIONS,
  deriveRoomVerificationStatus,
} from "@takeoff-core/takeoffWorkbenchHelpers.mjs";
import type { AreaPatch, ManualRunInput, RoomPatch, RunPatch } from "../TakeoffLabApp";

const PIECE_TYPE_OPTIONS = [
  { id: "countertop", label: "Countertop run", preset: "countertop" },
  { id: "island", label: "Island", preset: "island" },
  { id: "vanity", label: "Vanity top", preset: "vanity" },
  { id: "backsplash", label: "Backsplash line", preset: "backsplash" },
  { id: "waterfall", label: "Waterfall panel", preset: "waterfall" },
  { id: "other", label: "Other", preset: "countertop" },
] as const;

const BS_SCOPE_OPTIONS = [
  { value: "needs_review", label: "Needs review" },
  { value: "standard", label: "4\" backsplash" },
  { value: "full_height", label: "Full-height backsplash" },
  { value: "no_stone", label: "No stone backsplash" },
  { value: "tile_by_others", label: "No stone backsplash (tile by others)" },
] as const;

const PRESET_TO_CONTRACT: Record<string, { pieceType: string; isBacksplash: boolean }> = {
  countertop: { pieceType: "counter", isBacksplash: false },
  island: { pieceType: "counter", isBacksplash: false },
  vanity: { pieceType: "counter", isBacksplash: false },
  backsplash: { pieceType: "splash", isBacksplash: true },
  waterfall: { pieceType: "fhb", isBacksplash: false },
};

type ReviewedRoom = {
  roomId: string;
  roomIdx: number;
  roomName: string;
  roomType?: string;
  unknown?: boolean;
  manual?: boolean;
  countertopSf: number;
  backsplashDisplaySf: number;
  combinedSf: number;
  pieceCount: number;
  areas: Array<{
    areaIdx: number;
    label: string;
    needsReview?: boolean;
    notInScope?: boolean;
    backsplashScopeLabel?: string;
    backsplashDisplaySf?: number;
    areaLevelBacksplashSf?: number;
    backsplashLinearIn?: number;
    pieces: Array<{
      runId: string;
      runIdx: number;
      label: string;
      pieceType: string;
      pieceTypeLabel: string;
      lengthIn: number;
      depthIn: number;
      sfExact: number;
      excluded: boolean;
      manual?: boolean;
      sourcePages?: number[];
      backsplashLabel?: string | null;
    }>;
  }>;
};

function formatSf(n: number): string {
  return n.toFixed(2);
}

function verificationTone(status: string): "success" | "warn" | "info" | "neutral" {
  if (status === "verified") return "success";
  if (status === "needs_review") return "warn";
  if (status === "excluded") return "neutral";
  return "info";
}

function verificationLabel(status: string): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "excluded":
      return "Excluded";
    case "needs_review":
      return "Needs review";
    default:
      return "In progress";
  }
}

function presetFromRun(run: TakeoffRun): string {
  if (run.pieceType === "splash" || run.isBacksplash) return "backsplash";
  if (run.pieceType === "fhb") return "waterfall";
  const label = String(run.label ?? "").toLowerCase();
  if (label.includes("island")) return "island";
  if (label.includes("vanity")) return "vanity";
  return "countertop";
}

export interface TakeoffRoomReviewWorkbenchProps {
  editDraft: TakeoffResult;
  reviewedRooms: ReviewedRoom[];
  unassignedItems?: Array<{ message: string; runId?: string }>;
  excludedRunIds: Set<string>;
  excludedRoomIds: Set<string>;
  manualRunIds: Set<string>;
  manualRoomIds: Set<string>;
  roomCompleteness: Record<string, boolean>;
  selectedRoomId: string | null;
  roomBlockerIds?: Set<string>;
  hasGlobalBlockers?: boolean;
  onSelectRoom: (roomId: string | null) => void;
  onSetRoomComplete: (roomId: string, complete: boolean) => void;
  onSetRoomExcluded: (roomId: string, excluded: boolean) => void;
  onRemoveManualRoom?: (roomId: string) => void;
  onPatchRoom: (roomIdx: number, patch: RoomPatch) => void;
  onAddRoom: (name: string, roomType?: string) => void;
  onPatchRun: (roomIdx: number, areaIdx: number, runIdx: number, patch: RunPatch) => void;
  onPatchArea: (roomIdx: number, areaIdx: number, patch: AreaPatch) => void;
  onSetRunIncluded: (runId: string, included: boolean) => void;
  onRemoveManualRun: (runId: string) => void;
  onMoveRun: (runId: string, targetRoomIdx: number) => void;
  onAddManualRun: (input: ManualRunInput) => void;
}

type PieceEditDraft = {
  label: string;
  preset: string;
  lengthIn: string;
  depthIn: string;
  sourcePage: string;
  included: boolean;
};

type AreaBsEditDraft = {
  backsplashScope: string;
  backsplashHeightIn: string;
  backsplashLinearIn: string;
  backsplashManualSf: string;
};

function PieceEditorCard({
  roomIdx,
  areaIdx,
  runIdx,
  run,
  area,
  pieceMeta,
  excluded,
  isManual,
  roomOptions,
  onPatchRun,
  onSetRunIncluded,
  onRemoveManualRun,
  onMoveRun,
}: {
  roomIdx: number;
  areaIdx: number;
  runIdx: number;
  run: TakeoffRun;
  area: TakeoffArea;
  pieceMeta?: ReviewedRoom["areas"][0]["pieces"][0];
  excluded: boolean;
  isManual: boolean;
  roomOptions: Array<{ idx: number; name: string }>;
  onPatchRun: TakeoffRoomReviewWorkbenchProps["onPatchRun"];
  onSetRunIncluded: TakeoffRoomReviewWorkbenchProps["onSetRunIncluded"];
  onRemoveManualRun: TakeoffRoomReviewWorkbenchProps["onRemoveManualRun"];
  onMoveRun: TakeoffRoomReviewWorkbenchProps["onMoveRun"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PieceEditDraft>(() => ({
    label: run.label,
    preset: presetFromRun(run),
    lengthIn: String(run.lengthIn ?? ""),
    depthIn: String(run.depthIn ?? ""),
    sourcePage: run.sourcePages?.[0] != null ? String(run.sourcePages[0]) : "",
    included: !excluded,
  }));

  const resetDraft = useCallback(() => {
    setDraft({
      label: run.label,
      preset: presetFromRun(run),
      lengthIn: String(run.lengthIn ?? ""),
      depthIn: String(run.depthIn ?? ""),
      sourcePage: run.sourcePages?.[0] != null ? String(run.sourcePages[0]) : "",
      included: !excluded,
    });
  }, [run, excluded]);

  const sf = pieceMeta?.sfExact ?? ((Number(run.lengthIn) || 0) * (Number(run.depthIn) || 0)) / 144;
  const pieceTypeLabel =
    pieceMeta?.pieceTypeLabel ?? formatPieceTypeLabel(run.pieceType, Boolean(run.isBacksplash));
  const bsLabel =
    pieceMeta?.backsplashLabel ??
    (run.pieceType === "splash" || run.isBacksplash
      ? formatBacksplashScopeLabel(area.backsplashScope, run.depthIn ?? area.backsplashHeightIn)
      : null);
  const sourcePage = run.sourcePages?.[0];

  const handleSave = () => {
    const contract = PRESET_TO_CONTRACT[draft.preset] ?? PRESET_TO_CONTRACT.countertop;
    const len = Number(draft.lengthIn);
    const depth = Number(draft.depthIn);
    const pageNum = draft.sourcePage.trim() ? Number(draft.sourcePage) : NaN;
    onPatchRun(roomIdx, areaIdx, runIdx, {
      label: draft.label.trim() || run.label,
      lengthIn: Number.isFinite(len) ? len : 0,
      depthIn: Number.isFinite(depth) ? depth : 0,
      pieceType: contract.pieceType,
      isBacksplash: contract.isBacksplash,
      ...(Number.isFinite(pageNum) && pageNum > 0 ? { sourcePages: [pageNum] } : {}),
    });
    if (draft.included !== !excluded) {
      onSetRunIncluded(run.id, draft.included);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    resetDraft();
    setEditing(false);
  };

  return (
    <div className={`takeoff-room-piece-card${excluded ? " takeoff-room-piece-card--excluded" : ""}`}>
      {!editing ? (
        <>
          <div className="takeoff-room-piece-card-head">
            <div className="takeoff-room-piece-card-title-row">
              <span className="takeoff-room-piece-label">{run.label}</span>
              {excluded ? (
                <EosStatusPill tone="neutral">Excluded</EosStatusPill>
              ) : isManual ? (
                <EosStatusPill tone="info">Manual</EosStatusPill>
              ) : (
                <EosStatusPill tone="success">Included</EosStatusPill>
              )}
            </div>
            <span className="takeoff-room-piece-type">{pieceTypeLabel}</span>
            <span className="takeoff-room-piece-dim">
              {Number(run.lengthIn) || 0}" × {Number(run.depthIn) || 0}" · {formatSf(sf)} sf
            </span>
            {bsLabel ? (
              <span className="takeoff-room-piece-bs muted small">Backsplash: {bsLabel}</span>
            ) : null}
            <div className="takeoff-room-piece-meta">
              {sourcePage ? <span className="takeoff-room-page-badge">p.{sourcePage}</span> : null}
            </div>
          </div>
          <div className="takeoff-room-piece-card-actions">
            <button type="button" className="btn secondary btn-sm" onClick={() => setEditing(true)}>
              Edit
            </button>
            {isManual ? (
              <button type="button" className="btn secondary btn-sm" onClick={() => onRemoveManualRun(run.id)}>
                Remove piece
              </button>
            ) : excluded ? (
              <button type="button" className="btn secondary btn-sm" onClick={() => onSetRunIncluded(run.id, true)}>
                Restore
              </button>
            ) : (
              <button type="button" className="btn secondary btn-sm" onClick={() => onSetRunIncluded(run.id, false)}>
                Exclude from takeoff
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="takeoff-room-piece-edit-grid">
            <label className="field takeoff-room-field">
              <span className="takeoff-room-field-label">Piece name</span>
              <input
                className="takeoff-room-input"
                type="text"
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              />
            </label>
            <label className="field takeoff-room-field">
              <span className="takeoff-room-field-label">Piece type</span>
              <select
                className="takeoff-room-select"
                value={draft.preset}
                onChange={(e) => {
                  const preset = e.target.value;
                  const p = ADD_PIECE_PRESETS[preset as keyof typeof ADD_PIECE_PRESETS];
                  setDraft((d) => ({
                    ...d,
                    preset,
                    depthIn: String(p?.defaultDepth ?? d.depthIn),
                  }));
                }}
              >
                {PIECE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.preset}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="field takeoff-room-field">
              <span className="takeoff-room-field-label">Length</span>
              <input
                className="takeoff-room-input"
                type="number"
                min={0}
                step={0.25}
                value={draft.lengthIn}
                onChange={(e) => setDraft((d) => ({ ...d, lengthIn: e.target.value }))}
              />
            </label>
            <label className="field takeoff-room-field">
              <span className="takeoff-room-field-label">Depth</span>
              <input
                className="takeoff-room-input"
                type="number"
                min={0}
                step={0.25}
                value={draft.depthIn}
                onChange={(e) => setDraft((d) => ({ ...d, depthIn: e.target.value }))}
              />
            </label>
            <label className="field takeoff-room-field">
              <span className="takeoff-room-field-label">Source page</span>
              <input
                className="takeoff-room-input"
                type="number"
                min={1}
                step={1}
                value={draft.sourcePage}
                onChange={(e) => setDraft((d) => ({ ...d, sourcePage: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label className="field takeoff-room-field">
              <span className="takeoff-room-field-label">Move to room</span>
              <select
                className="takeoff-room-select"
                value={roomIdx}
                onChange={(e) => {
                  const target = Number(e.target.value);
                  if (target !== roomIdx) onMoveRun(run.id, target);
                }}
              >
                {roomOptions.map((opt) => (
                  <option key={opt.idx} value={opt.idx}>{opt.name}</option>
                ))}
              </select>
            </label>
            <label className="takeoff-room-toggle takeoff-room-field">
              <input
                type="checkbox"
                checked={draft.included}
                onChange={(e) => setDraft((d) => ({ ...d, included: e.target.checked }))}
              />
              <span>Include in takeoff</span>
            </label>
          </div>
          <div className="takeoff-room-piece-card-actions">
            <button type="button" className="btn primary btn-sm" onClick={handleSave}>
              Save
            </button>
            <button type="button" className="btn secondary btn-sm" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AreaBacksplashEditor({
  area,
  areaMeta,
  roomIdx,
  areaIdx,
  onPatchArea,
}: {
  area: TakeoffArea;
  areaMeta: ReviewedRoom["areas"][0];
  roomIdx: number;
  areaIdx: number;
  onPatchArea: TakeoffRoomReviewWorkbenchProps["onPatchArea"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AreaBsEditDraft>(() => ({
    backsplashScope: area.backsplashScope ?? "needs_review",
    backsplashHeightIn: String(area.backsplashHeightIn ?? 4),
    backsplashLinearIn: String(area.backsplashLinearIn ?? ""),
    backsplashManualSf: String(area.backsplashManualSf ?? ""),
  }));

  const scopeLabel =
    areaMeta.backsplashScopeLabel ??
    formatBacksplashScopeLabel(area.backsplashScope, area.backsplashHeightIn);
  const showInputs =
    draft.backsplashScope !== "no_stone" && draft.backsplashScope !== "tile_by_others";

  const handleSave = () => {
    const patch: AreaPatch = {
      backsplashScope: draft.backsplashScope,
      backsplashHeightIn: Number(draft.backsplashHeightIn) || 4,
      backsplashLinearIn: Number(draft.backsplashLinearIn) || 0,
      backsplashManualSf: Number(draft.backsplashManualSf) || 0,
    };
    if (patch.backsplashScope === "no_stone" || patch.backsplashScope === "tile_by_others") {
      patch.backsplashManualSf = 0;
      patch.backsplashLinearIn = 0;
    }
    onPatchArea(roomIdx, areaIdx, patch);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="takeoff-room-area-bs-card">
        <div className="takeoff-room-area-bs-display">
          <span className="takeoff-room-area-bs-label">Area backsplash</span>
          <span className="takeoff-room-area-bs-value">
            {scopeLabel}
            {(areaMeta.backsplashDisplaySf ?? 0) > 0 ? ` · ${formatSf(areaMeta.backsplashDisplaySf ?? 0)} sf` : ""}
          </span>
          {(areaMeta.backsplashLinearIn ?? 0) > 0 ? (
            <span className="muted small">
              {areaMeta.backsplashLinearIn}" linear × {area.backsplashHeightIn ?? 4}" height
            </span>
          ) : null}
        </div>
        <button type="button" className="btn secondary btn-sm" onClick={() => setEditing(true)}>
          Edit backsplash
        </button>
      </div>
    );
  }

  return (
    <div className="takeoff-room-area-bs-card takeoff-room-area-bs-card--edit">
      <div className="takeoff-room-piece-edit-grid">
        <label className="field takeoff-room-field">
          <span className="takeoff-room-field-label">Backsplash scope</span>
          <select
            className="takeoff-room-select"
            value={draft.backsplashScope}
            onChange={(e) => setDraft((d) => ({ ...d, backsplashScope: e.target.value }))}
          >
            {BS_SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        {showInputs ? (
          <>
            <label className="field takeoff-room-field">
              <span className="takeoff-room-field-label">Height (in)</span>
              <input
                className="takeoff-room-input"
                type="number"
                min={0}
                step={0.5}
                value={draft.backsplashHeightIn}
                onChange={(e) => setDraft((d) => ({ ...d, backsplashHeightIn: e.target.value }))}
              />
            </label>
            <label className="field takeoff-room-field">
              <span className="takeoff-room-field-label">Linear (in)</span>
              <input
                className="takeoff-room-input"
                type="number"
                min={0}
                step={1}
                value={draft.backsplashLinearIn}
                onChange={(e) => setDraft((d) => ({ ...d, backsplashLinearIn: e.target.value }))}
              />
            </label>
            <label className="field takeoff-room-field">
              <span className="takeoff-room-field-label">Manual sf</span>
              <input
                className="takeoff-room-input"
                type="number"
                min={0}
                step={0.01}
                value={draft.backsplashManualSf}
                onChange={(e) => setDraft((d) => ({ ...d, backsplashManualSf: e.target.value }))}
              />
            </label>
          </>
        ) : null}
      </div>
      <div className="takeoff-room-piece-card-actions">
        <button type="button" className="btn primary btn-sm" onClick={handleSave}>Save</button>
        <button type="button" className="btn secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}

function AddPiecePanel({
  roomIdx,
  roomName,
  areaLabel,
  onAddManualRun,
  onClose,
}: {
  roomIdx: number;
  roomName: string;
  areaLabel?: string;
  onAddManualRun: TakeoffRoomReviewWorkbenchProps["onAddManualRun"];
  onClose?: () => void;
}) {
  const [preset, setPreset] = useState(areaLabel ? "countertop" : "countertop");
  const [lengthIn, setLengthIn] = useState("");
  const [depthIn, setDepthIn] = useState(String(ADD_PIECE_PRESETS.countertop.defaultDepth));
  const [pieceLabel, setPieceLabel] = useState("Countertop run");
  const [pageNumber, setPageNumber] = useState("");

  const selectedPreset = PIECE_TYPE_OPTIONS.find((o) => o.preset === preset) ?? PIECE_TYPE_OPTIONS[0];

  const handleAdd = () => {
    const len = Number(lengthIn);
    if (!(len > 0)) return;
    onAddManualRun({
      roomIdx,
      areaLabel,
      preset: selectedPreset.preset,
      pieceLabel,
      lengthIn: len,
      depthIn: Number(depthIn) || ADD_PIECE_PRESETS.countertop.defaultDepth,
      pageNumber: pageNumber.trim() || null,
      includeInTakeoff: true,
    });
    setLengthIn("");
    setPageNumber("");
    onClose?.();
  };

  return (
    <div className="takeoff-room-add-piece-panel">
      <h5 className="takeoff-room-add-piece-panel-title">
        Add piece to {roomName}{areaLabel ? ` · ${areaLabel}` : ""}
      </h5>
      <div className="takeoff-room-add-piece-type-row">
        {PIECE_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`btn secondary btn-sm${preset === opt.preset ? " takeoff-room-type-btn--active" : ""}`}
            onClick={() => {
              setPreset(opt.preset);
              setPieceLabel(opt.label);
              setDepthIn(String(ADD_PIECE_PRESETS[opt.preset as keyof typeof ADD_PIECE_PRESETS]?.defaultDepth ?? 25.5));
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="takeoff-room-piece-edit-grid">
        <label className="field takeoff-room-field">
          <span className="takeoff-room-field-label">Piece name</span>
          <input className="takeoff-room-input" type="text" value={pieceLabel} onChange={(e) => setPieceLabel(e.target.value)} />
        </label>
        <label className="field takeoff-room-field">
          <span className="takeoff-room-field-label">Length (required)</span>
          <input className="takeoff-room-input" type="number" min={0} step={0.25} value={lengthIn} onChange={(e) => setLengthIn(e.target.value)} />
        </label>
        <label className="field takeoff-room-field">
          <span className="takeoff-room-field-label">Depth</span>
          <input className="takeoff-room-input" type="number" min={0} step={0.25} value={depthIn} onChange={(e) => setDepthIn(e.target.value)} />
        </label>
        <label className="field takeoff-room-field">
          <span className="takeoff-room-field-label">Source page</span>
          <input className="takeoff-room-input" type="number" min={1} step={1} value={pageNumber} onChange={(e) => setPageNumber(e.target.value)} placeholder="Optional" />
        </label>
      </div>
      <div className="takeoff-room-piece-card-actions">
        <button type="button" className="btn primary btn-sm" disabled={!(Number(lengthIn) > 0)} onClick={handleAdd}>
          Add piece
        </button>
        {onClose ? (
          <button type="button" className="btn secondary btn-sm" onClick={onClose}>Cancel</button>
        ) : null}
      </div>
    </div>
  );
}

export default function TakeoffRoomReviewWorkbench({
  editDraft,
  reviewedRooms,
  unassignedItems = [],
  excludedRunIds,
  excludedRoomIds,
  manualRunIds,
  manualRoomIds,
  roomCompleteness,
  selectedRoomId,
  roomBlockerIds,
  hasGlobalBlockers = false,
  onSelectRoom,
  onSetRoomComplete,
  onSetRoomExcluded,
  onRemoveManualRoom,
  onPatchRoom,
  onAddRoom,
  onPatchRun,
  onPatchArea,
  onSetRunIncluded,
  onRemoveManualRun,
  onMoveRun,
  onAddManualRun,
}: TakeoffRoomReviewWorkbenchProps) {
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomType, setNewRoomType] = useState("Kitchen");
  const [editingRoomMeta, setEditingRoomMeta] = useState(false);
  const [showExcludedRooms, setShowExcludedRooms] = useState(false);
  const [addPieceAreaLabel, setAddPieceAreaLabel] = useState<string | null>(null);
  const [showAddPiece, setShowAddPiece] = useState(false);
  const [showExcludedPieces, setShowExcludedPieces] = useState(false);

  const roomById = useMemo(() => {
    const map = new Map<string, (typeof editDraft.rooms)[0]>();
    for (const room of editDraft.rooms ?? []) map.set(room.id, room);
    return map;
  }, [editDraft.rooms]);

  const activeRooms = useMemo(() => {
    return reviewedRooms
      .filter((rr) => !excludedRoomIds.has(rr.roomId))
      .map((rr) => {
        const room = roomById.get(rr.roomId);
        if (!room) return null;
        const status = deriveRoomVerificationStatus(room, {
          excludedRoomIds,
          roomCompleteness,
          hasUnresolvedBlockers: Boolean(roomBlockerIds?.has(room.id)),
        });
        const verify = canMarkRoomVerified(rr, { hasGlobalBlockers });
        return { ...rr, room, status, verifyBlockers: verify.blockers, canVerify: verify.ok };
      })
      .filter(Boolean) as Array<
        ReviewedRoom & {
          room: NonNullable<ReturnType<typeof roomById.get>>;
          status: string;
          verifyBlockers: Array<{ code: string; message: string }>;
          canVerify: boolean;
        }
      >;
  }, [reviewedRooms, excludedRoomIds, roomById, roomCompleteness, roomBlockerIds, hasGlobalBlockers]);

  const excludedRooms = useMemo(() => {
    return (editDraft.rooms ?? [])
      .map((room, roomIdx) => ({ room, roomIdx }))
      .filter(({ room }) => excludedRoomIds.has(room.id));
  }, [editDraft.rooms, excludedRoomIds]);

  const selected = useMemo(() => {
    if (!selectedRoomId) return activeRooms[0] ?? null;
    return activeRooms.find((r) => r.roomId === selectedRoomId) ?? activeRooms[0] ?? null;
  }, [activeRooms, selectedRoomId]);

  const roomOptions = useMemo(
    () => activeRooms.map((r) => ({ idx: r.roomIdx, name: r.roomName })),
    [activeRooms]
  );

  const excludedPiecesInRoom = useMemo(() => {
    if (!selected) return [];
    const out: Array<{ run: TakeoffRun; areaIdx: number; runIdx: number; label: string }> = [];
    for (const areaMeta of selected.areas) {
      const area = selected.room.areas[areaMeta.areaIdx];
      if (!area) continue;
      for (let runIdx = 0; runIdx < (area.runs ?? []).length; runIdx++) {
        const run = area.runs[runIdx];
        if (excludedRunIds.has(run.id) && !manualRunIds.has(run.id)) {
          out.push({ run, areaIdx: areaMeta.areaIdx, runIdx, label: run.label });
        }
      }
    }
    return out;
  }, [selected, excludedRunIds, manualRunIds]);

  return (
    <div className="takeoff-room-workbench">
      <div className="takeoff-room-workbench-head">
        <div>
          <h3 className="takeoff-room-workbench-title">Review rooms &amp; dimensions</h3>
          <p className="takeoff-room-workbench-desc muted small">
            Select a room beside the plan, edit pieces, add missing scope, and mark each room verified.
          </p>
        </div>
      </div>

      {unassignedItems.length > 0 ? (
        <EosSectionCard className="takeoff-unassigned-items lab-card">
          <h4 className="takeoff-unassigned-title">Unassigned items</h4>
          <p className="muted small">These pieces need a room assignment before approval.</p>
          <ul className="takeoff-unassigned-list">
            {unassignedItems.map((item, i) => (
              <li key={item.runId ?? i}>{item.message}</li>
            ))}
          </ul>
        </EosSectionCard>
      ) : null}

      <div className="takeoff-room-card-grid">
        {activeRooms.map((row) => {
          const selectedCard = selected?.roomId === row.roomId;
          return (
            <button
              key={row.roomId}
              type="button"
              className={`takeoff-room-card${selectedCard ? " takeoff-room-card--selected" : ""}`}
              onClick={() => onSelectRoom(row.roomId)}
            >
              <div className="takeoff-room-card-top">
                <span className="takeoff-room-card-name">{row.roomName}</span>
                <EosStatusPill tone={verificationTone(row.status)}>
                  {verificationLabel(row.status)}
                </EosStatusPill>
              </div>
              <p className="takeoff-room-card-metrics">
                {row.pieceCount} piece{row.pieceCount !== 1 ? "s" : ""} · CT {formatSf(row.countertopSf)} sf · Backsplash {formatSf(row.backsplashDisplaySf)} sf
              </p>
              <p className="takeoff-room-card-type">{row.roomType ?? "Room"}</p>
            </button>
          );
        })}
      </div>

      <div className="takeoff-room-add-row">
        <input
          className="takeoff-room-input takeoff-room-add-input"
          type="text"
          placeholder="Add missing room"
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newRoomName.trim()) {
              onAddRoom(newRoomName.trim(), newRoomType);
              setNewRoomName("");
            }
          }}
        />
        <select className="takeoff-room-select" value={newRoomType} onChange={(e) => setNewRoomType(e.target.value)} aria-label="New room type">
          {ROOM_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn secondary btn-sm"
          disabled={!newRoomName.trim()}
          onClick={() => {
            if (!newRoomName.trim()) return;
            onAddRoom(newRoomName.trim(), newRoomType);
            setNewRoomName("");
          }}
        >
          Add missing room
        </button>
      </div>

      {excludedRooms.length > 0 ? (
        <details className="takeoff-excluded-rooms" open={showExcludedRooms} onToggle={(e) => setShowExcludedRooms((e.target as HTMLDetailsElement).open)}>
          <summary>Excluded rooms ({excludedRooms.length})</summary>
          <ul className="takeoff-excluded-rooms-list">
            {excludedRooms.map(({ room }) => (
              <li key={room.id}>
                <span>{room.name}</span>
                <button type="button" className="btn secondary btn-sm" onClick={() => onSetRoomExcluded(room.id, false)}>
                  Restore room
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {selected ? (
        <EosSectionCard className="takeoff-room-detail lab-card takeoff-room-detail--editor">
          <div className="takeoff-room-detail-head">
            <div className="takeoff-room-detail-head-main">
              {editingRoomMeta ? (
                <div className="takeoff-room-detail-edit-name">
                  <input
                    className="takeoff-room-input takeoff-room-detail-name-input"
                    type="text"
                    value={selected.room.name}
                    onChange={(e) => onPatchRoom(selected.roomIdx, { name: e.target.value })}
                  />
                  <select
                    className="takeoff-room-select"
                    value={selected.room.roomType ?? "Other"}
                    onChange={(e) => onPatchRoom(selected.roomIdx, { roomType: e.target.value })}
                  >
                    {ROOM_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button type="button" className="btn secondary btn-sm" onClick={() => setEditingRoomMeta(false)}>Done</button>
                </div>
              ) : (
                <>
                  <div className="takeoff-room-detail-title-row">
                    <h4 className="takeoff-room-detail-title">{selected.roomName}</h4>
                    <EosStatusPill tone={verificationTone(selected.status)}>
                      {verificationLabel(selected.status)}
                    </EosStatusPill>
                  </div>
                  <p className="takeoff-room-detail-sub">
                    {selected.roomType ?? "Room"} · CT {formatSf(selected.countertopSf)} sf · Backsplash {formatSf(selected.backsplashDisplaySf)} sf
                  </p>
                  <button type="button" className="btn-link btn-sm takeoff-room-edit-meta-btn" onClick={() => setEditingRoomMeta(true)}>
                    Edit room name / type
                  </button>
                </>
              )}
            </div>
            <div className="takeoff-room-detail-actions">
              {manualRoomIds.has(selected.roomId) && onRemoveManualRoom ? (
                <button type="button" className="btn secondary btn-sm" onClick={() => onRemoveManualRoom(selected.roomId)}>
                  Remove room
                </button>
              ) : (
                <button type="button" className="btn secondary btn-sm" onClick={() => onSetRoomExcluded(selected.roomId, true)}>
                  Exclude room
                </button>
              )}
              <button
                type="button"
                className="btn primary btn-sm"
                disabled={selected.status === "verified" || !selected.canVerify}
                title={!selected.canVerify ? selected.verifyBlockers.map((b) => b.message).join(" ") : undefined}
                onClick={() => onSetRoomComplete(selected.roomId, true)}
              >
                Mark room verified
              </button>
            </div>
          </div>

          {!selected.canVerify && selected.verifyBlockers.length > 0 ? (
            <div className="takeoff-room-verify-blockers" role="note">
              <span className="takeoff-room-verify-blockers-label">Before verifying:</span>
              <ul>
                {selected.verifyBlockers.map((b) => (
                  <li key={b.code}>{b.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="takeoff-room-areas">
            {selected.areas.map((areaMeta) => {
              const area = selected.room.areas[areaMeta.areaIdx];
              if (!area) return null;
              const includedPieces = (area.runs ?? [])
                .map((run, runIdx) => ({ run, runIdx }))
                .filter(({ run }) => !excludedRunIds.has(run.id));

              return (
                <div key={area.id ?? areaMeta.areaIdx} className="takeoff-room-area-block">
                  <div className="takeoff-room-area-head">
                    <span className="takeoff-room-area-label">{areaMeta.label}</span>
                    {areaMeta.needsReview ? (
                      <EosStatusPill tone="warn">Needs review</EosStatusPill>
                    ) : areaMeta.notInScope ? (
                      <EosStatusPill tone="neutral">Not in scope</EosStatusPill>
                    ) : null}
                  </div>

                  <AreaBacksplashEditor
                    area={area}
                    areaMeta={areaMeta}
                    roomIdx={selected.roomIdx}
                    areaIdx={areaMeta.areaIdx}
                    onPatchArea={onPatchArea}
                  />

                  {areaMeta.needsReview ? (
                    <div className="takeoff-room-area-needs-review">
                      <p className="muted small">No included pieces or backsplash in this area yet.</p>
                      <div className="takeoff-room-area-actions">
                        <button
                          type="button"
                          className="btn secondary btn-sm"
                          onClick={() => {
                            setAddPieceAreaLabel(areaMeta.label);
                            setShowAddPiece(true);
                          }}
                        >
                          Add piece to this area
                        </button>
                        <button
                          type="button"
                          className="btn secondary btn-sm"
                          onClick={() =>
                            onPatchArea(selected.roomIdx, areaMeta.areaIdx, {
                              backsplashScope: "no_stone",
                              backsplashReviewNote: "Marked not in scope by estimator",
                            })
                          }
                        >
                          Mark not in scope
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="takeoff-room-pieces">
                    {includedPieces.map(({ run, runIdx }) => {
                      const pieceMeta = areaMeta.pieces.find((p) => p.runId === run.id);
                      return (
                        <PieceEditorCard
                          key={run.id}
                          roomIdx={selected.roomIdx}
                          areaIdx={areaMeta.areaIdx}
                          runIdx={runIdx}
                          run={run}
                          area={area}
                          pieceMeta={pieceMeta}
                          excluded={false}
                          isManual={manualRunIds.has(run.id)}
                          roomOptions={roomOptions}
                          onPatchRun={onPatchRun}
                          onSetRunIncluded={onSetRunIncluded}
                          onRemoveManualRun={onRemoveManualRun}
                          onMoveRun={onMoveRun}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {excludedPiecesInRoom.length > 0 ? (
            <details
              className="takeoff-excluded-pieces"
              open={showExcludedPieces}
              onToggle={(e) => setShowExcludedPieces((e.target as HTMLDetailsElement).open)}
            >
              <summary>Excluded pieces ({excludedPiecesInRoom.length})</summary>
              <ul className="takeoff-excluded-pieces-list">
                {excludedPiecesInRoom.map(({ run, areaIdx, runIdx, label }) => (
                  <li key={run.id}>
                    <span>{label}</span>
                    <button type="button" className="btn secondary btn-sm" onClick={() => onSetRunIncluded(run.id, true)}>
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className="takeoff-room-add-piece-section">
            {!showAddPiece && addPieceAreaLabel == null ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setShowAddPiece(true);
                  setAddPieceAreaLabel(null);
                }}
              >
                Add piece to this room
              </button>
            ) : (
              <AddPiecePanel
                roomIdx={selected.roomIdx}
                roomName={selected.roomName}
                areaLabel={addPieceAreaLabel ?? undefined}
                onAddManualRun={(input) => {
                  onAddManualRun(input);
                  setShowAddPiece(false);
                  setAddPieceAreaLabel(null);
                }}
                onClose={() => {
                  setShowAddPiece(false);
                  setAddPieceAreaLabel(null);
                }}
              />
            )}
          </div>
        </EosSectionCard>
      ) : null}
    </div>
  );
}
