/**
 * TakeoffRoomReviewWorkbench — room-first estimator review after AI generation.
 * Display-first room cards with selected-room detail editing.
 */
import EosSectionCard from "@eliteos-ui/EosSectionCard";
import EosStatusPill from "@eliteos-ui/EosStatusPill";
import React, { useMemo, useState } from "react";
import type { TakeoffResult, TakeoffArea, TakeoffRun, TakeoffRoom } from "@takeoff-core/takeoffContract.mjs";
import {
  ADD_PIECE_PRESETS,
  ROOM_TYPE_OPTIONS,
  computeRoomSubtotals,
  deriveRoomVerificationStatus,
} from "@takeoff-core/takeoffWorkbenchHelpers.mjs";
import type { AreaPatch, ManualRunInput, RoomPatch, RunPatch } from "../TakeoffLabApp";

const PIECE_TYPE_OPTIONS = [
  { id: "countertop", label: "Countertop run" },
  { id: "island", label: "Island" },
  { id: "vanity", label: "Vanity top" },
  { id: "backsplash", label: "Backsplash line" },
  { id: "waterfall", label: "Waterfall panel" },
  { id: "other", label: "Other" },
] as const;

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

interface RoomRow {
  roomIdx: number;
  room: TakeoffRoom;
  status: string;
  subtotals: ReturnType<typeof computeRoomSubtotals>;
}

export interface TakeoffRoomReviewWorkbenchProps {
  editDraft: TakeoffResult;
  excludedRunIds: Set<string>;
  excludedRoomIds: Set<string>;
  roomCompleteness: Record<string, boolean>;
  selectedRoomId: string | null;
  roomBlockerIds?: Set<string>;
  onSelectRoom: (roomId: string | null) => void;
  onSetRoomComplete: (roomId: string, complete: boolean) => void;
  onSetRoomExcluded: (roomId: string, excluded: boolean) => void;
  onPatchRoom: (roomIdx: number, patch: RoomPatch) => void;
  onAddRoom: (name: string, roomType?: string) => void;
  onPatchRun: (roomIdx: number, areaIdx: number, runIdx: number, patch: RunPatch) => void;
  onPatchArea: (roomIdx: number, areaIdx: number, patch: AreaPatch) => void;
  onSetRunIncluded: (runId: string, included: boolean) => void;
  onMoveRun: (runId: string, targetRoomIdx: number) => void;
  onAddManualRun: (input: ManualRunInput) => void;
}

function PieceRow({
  roomIdx,
  areaIdx,
  runIdx,
  run,
  area,
  excluded,
  editing,
  roomOptions,
  onPatchRun,
  onPatchArea,
  onSetRunIncluded,
  onMoveRun,
}: {
  roomIdx: number;
  areaIdx: number;
  runIdx: number;
  run: TakeoffRun;
  area: TakeoffArea;
  excluded: boolean;
  editing: boolean;
  roomOptions: Array<{ idx: number; name: string }>;
  onPatchRun: TakeoffRoomReviewWorkbenchProps["onPatchRun"];
  onPatchArea: TakeoffRoomReviewWorkbenchProps["onPatchArea"];
  onSetRunIncluded: TakeoffRoomReviewWorkbenchProps["onSetRunIncluded"];
  onMoveRun: TakeoffRoomReviewWorkbenchProps["onMoveRun"];
}) {
  const sf = ((Number(run.lengthIn) || 0) * (Number(run.depthIn) || 0)) / 144;
  const sourcePage = run.sourcePages?.[0];

  if (!editing) {
    return (
      <div className={`takeoff-room-piece${excluded ? " takeoff-room-piece--excluded" : ""}`}>
        <div className="takeoff-room-piece-main">
          <span className="takeoff-room-piece-label">{run.label}</span>
          <span className="takeoff-room-piece-dim">
            {Number(run.lengthIn) || 0}" × {Number(run.depthIn) || 0}" · {formatSf(sf)} sf
          </span>
        </div>
        <div className="takeoff-room-piece-meta">
          {sourcePage ? <span className="takeoff-room-page-badge">p.{sourcePage}</span> : null}
          {excluded ? <span className="takeoff-room-piece-excluded-tag">Excluded</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`takeoff-room-piece takeoff-room-piece--edit${excluded ? " takeoff-room-piece--excluded" : ""}`}>
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
      <div className="takeoff-room-piece-actions">
        <label className="takeoff-room-toggle">
          <input
            type="checkbox"
            checked={!excluded}
            onChange={(e) => onSetRunIncluded(run.id, e.target.checked)}
          />
          <span>Include in takeoff</span>
        </label>
        {area.backsplashScope != null ? (
          <span className="takeoff-room-bs-scope">BS: {area.backsplashScope}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function TakeoffRoomReviewWorkbench({
  editDraft,
  excludedRunIds,
  excludedRoomIds,
  roomCompleteness,
  selectedRoomId,
  roomBlockerIds,
  onSelectRoom,
  onSetRoomComplete,
  onSetRoomExcluded,
  onPatchRoom,
  onAddRoom,
  onPatchRun,
  onPatchArea,
  onSetRunIncluded,
  onMoveRun,
  onAddManualRun,
}: TakeoffRoomReviewWorkbenchProps) {
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomType, setNewRoomType] = useState("Kitchen");
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [showExcludedRooms, setShowExcludedRooms] = useState(false);

  const activeRooms = useMemo((): RoomRow[] => {
    return (editDraft.rooms ?? [])
      .map((room, roomIdx) => {
        if (excludedRoomIds.has(room.id)) return null;
        const status = deriveRoomVerificationStatus(room, {
          excludedRoomIds,
          roomCompleteness,
          hasUnresolvedBlockers: Boolean(roomBlockerIds?.has(room.id)),
        });
        return {
          roomIdx,
          room,
          status,
          subtotals: computeRoomSubtotals(room, excludedRunIds),
        };
      })
      .filter(Boolean) as RoomRow[];
  }, [editDraft.rooms, excludedRoomIds, excludedRunIds, roomCompleteness, roomBlockerIds]);

  const excludedRooms = useMemo(() => {
    return (editDraft.rooms ?? [])
      .map((room, roomIdx) => ({ room, roomIdx }))
      .filter(({ room }) => excludedRoomIds.has(room.id));
  }, [editDraft.rooms, excludedRoomIds]);

  const selected = useMemo(() => {
    if (!selectedRoomId) return activeRooms[0] ?? null;
    return activeRooms.find((r) => r.room.id === selectedRoomId) ?? activeRooms[0] ?? null;
  }, [activeRooms, selectedRoomId]);

  const roomOptions = useMemo(
    () => activeRooms.map((r) => ({ idx: r.roomIdx, name: r.room.name })),
    [activeRooms]
  );

  const isEditing = selected ? editingRoomId === selected.room.id : false;

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

      <div className="takeoff-room-card-grid">
        {activeRooms.map(({ room, roomIdx, status, subtotals }) => {
          const selectedCard = selected?.room.id === room.id;
          return (
            <button
              key={room.id}
              type="button"
              className={`takeoff-room-card${selectedCard ? " takeoff-room-card--selected" : ""}`}
              onClick={() => onSelectRoom(room.id)}
            >
              <div className="takeoff-room-card-top">
                <span className="takeoff-room-card-name">{room.name}</span>
                <EosStatusPill tone={verificationTone(status)}>
                  {verificationLabel(status)}
                </EosStatusPill>
              </div>
              <p className="takeoff-room-card-metrics">
                {subtotals.pieceCount} piece{subtotals.pieceCount !== 1 ? "s" : ""} · CT {formatSf(subtotals.countertopSf)} sf · BS {formatSf(subtotals.backsplashSf)} sf
              </p>
              <p className="takeoff-room-card-type">{room.roomType ?? "Room"}</p>
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
                  Restore
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
                  <h4 className="takeoff-room-detail-title">{selected.room.name}</h4>
                  <p className="takeoff-room-detail-sub">
                    {selected.room.roomType ?? "Room"} · CT {formatSf(selected.subtotals.countertopSf)} sf · BS {formatSf(selected.subtotals.backsplashSf)} sf
                  </p>
                </>
              )}
            </div>
            <div className="takeoff-room-detail-actions">
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => setEditingRoomId(isEditing ? null : selected.room.id)}
              >
                {isEditing ? "Done editing" : "Edit room"}
              </button>
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => onSetRoomExcluded(selected.room.id, true)}
              >
                Exclude from takeoff
              </button>
              <button
                type="button"
                className="btn primary btn-sm"
                disabled={selected.status === "verified"}
                onClick={() => onSetRoomComplete(selected.room.id, true)}
              >
                Mark room verified
              </button>
            </div>
          </div>

          <div className="takeoff-room-pieces">
            {(selected.room.areas ?? []).map((area, areaIdx) =>
              (area.runs ?? []).map((run, runIdx) => (
                <PieceRow
                  key={run.id}
                  roomIdx={selected.roomIdx}
                  areaIdx={areaIdx}
                  runIdx={runIdx}
                  run={run}
                  area={area}
                  excluded={excludedRunIds.has(run.id)}
                  editing={isEditing}
                  roomOptions={roomOptions}
                  onPatchRun={onPatchRun}
                  onPatchArea={onPatchArea}
                  onSetRunIncluded={onSetRunIncluded}
                  onMoveRun={onMoveRun}
                />
              ))
            )}
          </div>

          {isEditing ? (
            <div className="takeoff-room-add-piece">
              <span className="takeoff-room-add-piece-label">Add piece</span>
              <div className="takeoff-room-add-piece-buttons">
                {PIECE_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() =>
                      onAddManualRun({
                        roomIdx: selected.roomIdx,
                        preset: opt.id === "waterfall" ? "countertop" : opt.id === "other" ? "countertop" : opt.id,
                        pieceLabel: opt.label,
                        lengthIn: 0,
                        depthIn: ADD_PIECE_PRESETS.countertop.defaultDepth,
                        includeInTakeoff: true,
                      })
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </EosSectionCard>
      ) : null}
    </div>
  );
}
