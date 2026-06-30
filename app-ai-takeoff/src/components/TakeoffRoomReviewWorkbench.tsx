/**
 * TakeoffRoomReviewWorkbench — room-first estimator review after AI generation.
 * Display-first room cards with selected-room detail editing.
 */
import EosSectionCard from "@eliteos-ui/EosSectionCard";
import EosStatusPill from "@eliteos-ui/EosStatusPill";
import React, { useMemo, useState } from "react";
import type { TakeoffResult, TakeoffArea, TakeoffRun } from "@takeoff-core/takeoffContract.mjs";
import {
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
  { id: "waterfall", label: "Waterfall panel", preset: "countertop" },
  { id: "other", label: "Other", preset: "countertop" },
] as const;

type ReviewedRoom = {
  roomId: string;
  roomIdx: number;
  roomName: string;
  roomType?: string;
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

function PieceCard({
  roomIdx,
  areaIdx,
  runIdx,
  run,
  area,
  pieceMeta,
  excluded,
  isManual,
  editing,
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
  editing: boolean;
  roomOptions: Array<{ idx: number; name: string }>;
  onPatchRun: TakeoffRoomReviewWorkbenchProps["onPatchRun"];
  onSetRunIncluded: TakeoffRoomReviewWorkbenchProps["onSetRunIncluded"];
  onRemoveManualRun: TakeoffRoomReviewWorkbenchProps["onRemoveManualRun"];
  onMoveRun: TakeoffRoomReviewWorkbenchProps["onMoveRun"];
}) {
  const sf = pieceMeta?.sfExact ?? ((Number(run.lengthIn) || 0) * (Number(run.depthIn) || 0)) / 144;
  const sourcePage = run.sourcePages?.[0];
  const pieceTypeLabel =
    pieceMeta?.pieceTypeLabel ??
    formatPieceTypeLabel(run.pieceType, Boolean(run.isBacksplash));
  const bsLabel =
    pieceMeta?.backsplashLabel ??
    (run.pieceType === "splash" || run.isBacksplash
      ? formatBacksplashScopeLabel(area.backsplashScope, run.depthIn ?? area.backsplashHeightIn)
      : null);

  return (
    <div className={`takeoff-room-piece${excluded ? " takeoff-room-piece--excluded" : ""}`}>
      <div className="takeoff-room-piece-main">
        <span className="takeoff-room-piece-label">{run.label}</span>
        <span className="takeoff-room-piece-type muted small">{pieceTypeLabel}</span>
        {!editing ? (
          <span className="takeoff-room-piece-dim">
            {Number(run.lengthIn) || 0}" × {Number(run.depthIn) || 0}" · {formatSf(sf)} sf
          </span>
        ) : null}
        {bsLabel ? (
          <span className="takeoff-room-piece-bs muted small">Backsplash: {bsLabel}</span>
        ) : null}
      </div>

      {editing ? (
        <div className="takeoff-room-piece-edit-grid">
          <label className="field takeoff-room-field">
            <span className="takeoff-room-field-label">Piece</span>
            <input
              className="takeoff-room-input"
              type="text"
              value={run.label}
              onChange={(e) => onPatchRun(roomIdx, areaIdx, runIdx, { label: e.target.value })}
            />
          </label>
          <label className="field takeoff-room-field">
            <span className="takeoff-room-field-label">Length</span>
            <input
              className="takeoff-room-input"
              type="number"
              min={0}
              step={0.25}
              value={run.lengthIn ?? ""}
              onChange={(e) => onPatchRun(roomIdx, areaIdx, runIdx, { lengthIn: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="field takeoff-room-field">
            <span className="takeoff-room-field-label">Depth</span>
            <input
              className="takeoff-room-input"
              type="number"
              min={0}
              step={0.25}
              value={run.depthIn ?? ""}
              onChange={(e) => onPatchRun(roomIdx, areaIdx, runIdx, { depthIn: Number(e.target.value) || 0 })}
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
        </div>
      ) : null}

      <div className="takeoff-room-piece-meta">
        {sourcePage ? <span className="takeoff-room-page-badge">p.{sourcePage}</span> : null}
        {excluded ? <span className="takeoff-room-piece-excluded-tag">Excluded</span> : null}
        {isManual ? <span className="takeoff-room-piece-manual-tag">Manual</span> : null}
      </div>

      <div className="takeoff-room-piece-actions">
        {isManual ? (
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={() => onRemoveManualRun(run.id)}
          >
            Remove piece
          </button>
        ) : excluded ? (
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={() => onSetRunIncluded(run.id, true)}
          >
            Restore
          </button>
        ) : (
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={() => onSetRunIncluded(run.id, false)}
          >
            Exclude from takeoff
          </button>
        )}
      </div>
    </div>
  );
}

function AddPieceForm({
  roomIdx,
  areaIdx,
  areaLabel,
  onAddManualRun,
}: {
  roomIdx: number;
  areaIdx?: number;
  areaLabel?: string;
  onAddManualRun: TakeoffRoomReviewWorkbenchProps["onAddManualRun"];
}) {
  const [preset, setPreset] = useState("countertop");
  const [lengthIn, setLengthIn] = useState("");
  const [depthIn, setDepthIn] = useState(String(ADD_PIECE_PRESETS.countertop.defaultDepth));
  const [pieceLabel, setPieceLabel] = useState("Countertop run");

  const selectedPreset = PIECE_TYPE_OPTIONS.find((o) => o.preset === preset) ?? PIECE_TYPE_OPTIONS[0];

  return (
    <div className="takeoff-room-add-piece-form">
      <label className="field takeoff-room-field">
        <span className="takeoff-room-field-label">Piece type</span>
        <select
          className="takeoff-room-select"
          value={preset}
          onChange={(e) => {
            const opt = PIECE_TYPE_OPTIONS.find((o) => o.preset === e.target.value) ?? PIECE_TYPE_OPTIONS[0];
            setPreset(opt.preset);
            setPieceLabel(opt.label);
            setDepthIn(String(ADD_PIECE_PRESETS[opt.preset as keyof typeof ADD_PIECE_PRESETS]?.defaultDepth ?? 25.5));
          }}
        >
          {PIECE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.preset}>{opt.label}</option>
          ))}
        </select>
      </label>
      <label className="field takeoff-room-field">
        <span className="takeoff-room-field-label">Length (required)</span>
        <input
          className="takeoff-room-input"
          type="number"
          min={0}
          step={0.25}
          value={lengthIn}
          onChange={(e) => setLengthIn(e.target.value)}
        />
      </label>
      <label className="field takeoff-room-field">
        <span className="takeoff-room-field-label">Depth</span>
        <input
          className="takeoff-room-input"
          type="number"
          min={0}
          step={0.25}
          value={depthIn}
          onChange={(e) => setDepthIn(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn primary btn-sm"
        disabled={!(Number(lengthIn) > 0)}
        onClick={() => {
          const len = Number(lengthIn);
          if (!(len > 0)) return;
          onAddManualRun({
            roomIdx,
            areaLabel,
            preset: selectedPreset.preset,
            pieceLabel,
            lengthIn: len,
            depthIn: Number(depthIn) || ADD_PIECE_PRESETS.countertop.defaultDepth,
            includeInTakeoff: true,
          });
          setLengthIn("");
        }}
      >
        Add piece
      </button>
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
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [showExcludedRooms, setShowExcludedRooms] = useState(false);
  const [addPieceAreaIdx, setAddPieceAreaIdx] = useState<number | null>(null);

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
        return { ...rr, room, status };
      })
      .filter(Boolean) as Array<ReviewedRoom & { room: NonNullable<ReturnType<typeof roomById.get>>; status: string }>;
  }, [reviewedRooms, excludedRoomIds, roomById, roomCompleteness, roomBlockerIds]);

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

  const isEditing = selected ? editingRoomId === selected.roomId : false;

  return (
    <div className="takeoff-room-workbench">
      <div className="takeoff-room-workbench-head">
        <div>
          <h3 className="takeoff-room-workbench-title">Review rooms &amp; dimensions</h3>
          <p className="takeoff-room-workbench-desc muted small">
            AI found these rooms. Confirm the scope, verify dimensions, and add anything missing before approval.
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
        <select
          className="takeoff-room-select"
          value={newRoomType}
          onChange={(e) => setNewRoomType(e.target.value)}
          aria-label="New room type"
        >
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
        <details
          className="takeoff-excluded-rooms"
          open={showExcludedRooms}
          onToggle={(e) => setShowExcludedRooms((e.target as HTMLDetailsElement).open)}
        >
          <summary>Excluded rooms ({excludedRooms.length})</summary>
          <ul className="takeoff-excluded-rooms-list">
            {excludedRooms.map(({ room }) => (
              <li key={room.id}>
                <span>{room.name}</span>
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  onClick={() => onSetRoomExcluded(room.id, false)}
                >
                  Restore room
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {selected ? (
        <EosSectionCard className="takeoff-room-detail lab-card">
          <div className="takeoff-room-detail-head">
            <div>
              {isEditing ? (
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
                </div>
              ) : (
                <>
                  <h4 className="takeoff-room-detail-title">{selected.roomName}</h4>
                  <p className="takeoff-room-detail-sub">
                    {selected.roomType ?? "Room"} · CT {formatSf(selected.countertopSf)} sf · Backsplash {formatSf(selected.backsplashDisplaySf)} sf
                  </p>
                </>
              )}
            </div>
            <div className="takeoff-room-detail-actions">
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => setEditingRoomId(isEditing ? null : selected.roomId)}
              >
                {isEditing ? "Done editing" : "Edit room"}
              </button>
              {manualRoomIds.has(selected.roomId) && onRemoveManualRoom ? (
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  onClick={() => onRemoveManualRoom(selected.roomId)}
                >
                  Remove room
                </button>
              ) : (
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  onClick={() => onSetRoomExcluded(selected.roomId, true)}
                >
                  Exclude room from takeoff
                </button>
              )}
              <button
                type="button"
                className="btn primary btn-sm"
                disabled={selected.status === "verified"}
                onClick={() => onSetRoomComplete(selected.roomId, true)}
              >
                Mark room verified
              </button>
            </div>
          </div>

          <div className="takeoff-room-areas">
            {selected.areas.map((areaMeta) => {
              const area = selected.room.areas[areaMeta.areaIdx];
              if (!area) return null;
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

                  {(areaMeta.areaLevelBacksplashSf ?? 0) > 0 ? (
                    <div className="takeoff-room-area-bs-row muted small">
                      {areaMeta.backsplashScopeLabel} · {formatSf(areaMeta.areaLevelBacksplashSf ?? 0)} sf
                      {(areaMeta.backsplashLinearIn ?? 0) > 0
                        ? ` · ${areaMeta.backsplashLinearIn}" linear × ${area.backsplashHeightIn ?? 4}" height`
                        : ""}
                    </div>
                  ) : areaMeta.backsplashScopeLabel && areaMeta.backsplashDisplaySf === 0 ? (
                    <div className="takeoff-room-area-bs-row muted small">
                      {areaMeta.backsplashScopeLabel}
                    </div>
                  ) : null}

                  {areaMeta.needsReview ? (
                    <div className="takeoff-room-area-needs-review">
                      <p className="muted small">No included pieces or backsplash in this area yet.</p>
                      <div className="takeoff-room-area-actions">
                        <button
                          type="button"
                          className="btn secondary btn-sm"
                          onClick={() => setAddPieceAreaIdx(areaMeta.areaIdx)}
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
                      {addPieceAreaIdx === areaMeta.areaIdx ? (
                        <AddPieceForm
                          roomIdx={selected.roomIdx}
                          areaIdx={areaMeta.areaIdx}
                          areaLabel={areaMeta.label}
                          onAddManualRun={(input) => {
                            onAddManualRun(input);
                            setAddPieceAreaIdx(null);
                          }}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  <div className="takeoff-room-pieces">
                    {(area.runs ?? []).map((run, runIdx) => {
                      const pieceMeta = areaMeta.pieces.find((p) => p.runId === run.id);
                      return (
                        <PieceCard
                          key={run.id}
                          roomIdx={selected.roomIdx}
                          areaIdx={areaMeta.areaIdx}
                          runIdx={runIdx}
                          run={run}
                          area={area}
                          pieceMeta={pieceMeta}
                          excluded={excludedRunIds.has(run.id)}
                          isManual={manualRunIds.has(run.id)}
                          editing={isEditing}
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

          {isEditing && addPieceAreaIdx == null ? (
            <div className="takeoff-room-add-piece">
              <span className="takeoff-room-add-piece-label">Add piece to {selected.roomName}</span>
              <AddPieceForm roomIdx={selected.roomIdx} onAddManualRun={onAddManualRun} />
            </div>
          ) : null}
        </EosSectionCard>
      ) : null}
    </div>
  );
}
