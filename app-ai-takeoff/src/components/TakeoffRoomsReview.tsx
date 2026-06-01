/**
 * TakeoffRoomsReview — read-only (editMode=false) or editable (editMode=true).
 *
 * Edit mode:
 *   - Room name: inline text input in the room header
 *   - Area label: inline text input in the area header
 *   - Run label/lengthIn/depthIn: inline inputs in the runs table
 *   - Backsplash linearIn/heightIn: inline number inputs on the backsplash row
 *
 * All inputs are uncontrolled (defaultValue). The parent's patch handlers produce
 * new immutable objects, triggering recompute. The `key` prop on this component
 * is bumped by the parent when the source resets, forcing a clean remount.
 *
 * No API calls. No state except UI expand/collapse.
 */
import React from "react";
import type { TakeoffResult, TakeoffArea, TakeoffRun } from "@takeoff-core/takeoffContract.mjs";
import type { TakeoffComputedMeasurements } from "@takeoff-core/takeoffMeasurementCalc.mjs";
import type { RoomPatch, AreaPatch, RunPatch } from "../TakeoffLabApp";

interface Props {
  result: TakeoffResult;
  computed: TakeoffComputedMeasurements;
  editMode: boolean;
  onPatchRoom: (roomIdx: number, patch: RoomPatch) => void;
  onPatchArea: (roomIdx: number, areaIdx: number, patch: AreaPatch) => void;
  onPatchRun: (roomIdx: number, areaIdx: number, runIdx: number, patch: RunPatch) => void;
}

function sf(n: number) { return `${n.toFixed(2)} sf`; }

/** Inline text input for edit mode — reads its own defaultValue, patches on blur. */
function EditText({
  defaultValue,
  onCommit,
  className,
  placeholder
}: {
  defaultValue: string;
  onCommit: (val: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      className={`edit-input edit-input--text${className ? ` ${className}` : ""}`}
      defaultValue={defaultValue}
      placeholder={placeholder}
      onBlur={(e) => onCommit(e.target.value.trim())}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** Inline number input — patches on every valid change (live recompute). */
function EditNum({
  defaultValue,
  onCommit,
  step,
  min,
  className
}: {
  defaultValue: number;
  onCommit: (val: number) => void;
  step?: number;
  min?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      className={`edit-input edit-input--num${className ? ` ${className}` : ""}`}
      defaultValue={defaultValue}
      step={step ?? 0.5}
      min={min ?? 0}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        if (!isNaN(n) && n >= 0) onCommit(n);
        else if (e.target.value === "" || e.target.value === "0") onCommit(0);
      }}
      onBlur={(e) => {
        const n = parseFloat(e.target.value);
        e.target.value = String(isNaN(n) ? 0 : n);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export default function TakeoffRoomsReview({ result, computed, editMode, onPatchRoom, onPatchArea, onPatchRun }: Props) {
  // All rooms start expanded.
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const toggle = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="lab-rooms">
      {result.rooms.map((room, ri) => {
        const roomComputed = computed.roomBreakdown[ri];
        const isOpen = !collapsed[room.id];

        return (
          <div key={room.id} className={`room-block${editMode ? " room-block--edit" : ""}`}>
            {/* Room header */}
            <button
              className="room-header"
              onClick={() => toggle(room.id)}
              aria-expanded={isOpen}
            >
              <span className="room-header-name">
                <span className="room-header-icon">{isOpen ? "▾" : "▸"}</span>
                {editMode ? (
                  <EditText
                    defaultValue={room.name}
                    placeholder="Room name"
                    onCommit={(v) => onPatchRoom(ri, { name: v })}
                    className="edit-input--room-name"
                  />
                ) : (
                  room.name
                )}
                {room.roomType && !editMode && (
                  <span className="room-type-tag">{room.roomType}</span>
                )}
              </span>
              <span className="room-header-totals">
                <span className="room-total-chip">CT: {sf(roomComputed?.countertopSf ?? 0)}</span>
                <span className="room-total-chip">BS: {sf(roomComputed?.backsplashSf ?? 0)}</span>
                {(room.sourcePages?.length ?? 0) > 0 && (
                  <span className="room-page-chip">p. {room.sourcePages!.join(", ")}</span>
                )}
              </span>
            </button>

            {/* Room body */}
            {isOpen && (
              <div className="room-body">
                {/* Static assumptions (not editable in v3) */}
                {!editMode && (room.assumptions?.length ?? 0) > 0 && (
                  <div className="room-assumptions">
                    <span className="room-assumptions-label">Assumptions:</span>
                    {room.assumptions!.map((a, i) => (
                      <span key={i} className="room-assumption-tag">{a}</span>
                    ))}
                  </div>
                )}

                {/* Areas */}
                {room.areas.map((area: TakeoffArea, ai: number) => {
                  const areaComputed = roomComputed?.areaBreakdown[ai];

                  return (
                    <div key={area.id} className="area-block">
                      {/* Area header */}
                      <div className="area-header">
                        {editMode ? (
                          <EditText
                            defaultValue={area.label}
                            placeholder="Area label"
                            onCommit={(v) => onPatchArea(ri, ai, { label: v })}
                            className="edit-input--area-label"
                          />
                        ) : (
                          <span className="area-label">{area.label}</span>
                        )}
                        {area.areaType && !editMode && (
                          <span className="area-type-tag">{area.areaType}</span>
                        )}
                        <span className="area-totals">
                          {areaComputed && (
                            <>
                              {areaComputed.countertopSf > 0 && (
                                <span className="area-sf-chip">CT {sf(areaComputed.countertopSf)}</span>
                              )}
                              {areaComputed.backsplashSf > 0 && (
                                <span className="area-sf-chip area-sf-chip--bs">BS {sf(areaComputed.backsplashSf)}</span>
                              )}
                            </>
                          )}
                        </span>
                        {(area.sourcePages?.length ?? 0) > 0 && (
                          <span className="area-page-chip">p. {area.sourcePages!.join(", ")}</span>
                        )}
                      </div>

                      {/* Backsplash row — editable in edit mode */}
                      {((area.backsplashLinearIn ?? 0) > 0 || editMode) && (
                        <div className="backsplash-row">
                          <span className="backsplash-row-icon">◌</span>
                          <span className="backsplash-row-label">Backsplash</span>
                          {editMode ? (
                            <span className="backsplash-edit-inputs">
                              <EditNum
                                defaultValue={area.backsplashLinearIn ?? 0}
                                onCommit={(v) => onPatchArea(ri, ai, { backsplashLinearIn: v })}
                                step={1}
                                className="edit-input--bs-linear"
                              />
                              <span className="backsplash-edit-sep">" linear ×</span>
                              <EditNum
                                defaultValue={area.backsplashHeightIn ?? 4}
                                onCommit={(v) => onPatchArea(ri, ai, { backsplashHeightIn: v })}
                                step={0.5}
                                min={1}
                                className="edit-input--bs-height"
                              />
                              <span className="backsplash-edit-sep">" height</span>
                            </span>
                          ) : (
                            <span className="backsplash-row-dim">
                              {area.backsplashLinearIn}" linear × {area.backsplashHeightIn ?? 4}"
                            </span>
                          )}
                          {areaComputed && areaComputed.backsplashSf > 0 && (
                            <span className="backsplash-row-sf">{sf(areaComputed.backsplashSf)}</span>
                          )}
                        </div>
                      )}

                      {/* Runs table */}
                      {area.runs.length > 0 && (
                        <table className="runs-table">
                          <thead>
                            <tr>
                              <th>Run</th>
                              <th>Length″</th>
                              <th>Depth″</th>
                              <th>Type</th>
                              <th>sf</th>
                              {!editMode && <th>Page</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {area.runs.map((run: TakeoffRun, rni: number) => {
                              const l = Number(run.lengthIn) || 0;
                              const d = Number(run.depthIn) || 0;
                              const runSf = l > 0 && d > 0 ? (l * d) / 144 : 0;
                              const displaySf = Math.round(runSf * 100) / 100;

                              return (
                                <tr key={run.id} className={editMode ? "run-row--edit" : ""}>
                                  <td className="run-label">
                                    {editMode ? (
                                      <EditText
                                        defaultValue={run.label}
                                        placeholder="Run label"
                                        onCommit={(v) => onPatchRun(ri, ai, rni, { label: v })}
                                        className="edit-input--run-label"
                                      />
                                    ) : run.label}
                                  </td>
                                  <td className="run-dim">
                                    {editMode ? (
                                      <EditNum
                                        defaultValue={run.lengthIn}
                                        onCommit={(v) => onPatchRun(ri, ai, rni, { lengthIn: v })}
                                        step={0.5}
                                        className="edit-input--run-dim"
                                      />
                                    ) : `${run.lengthIn}"`}
                                  </td>
                                  <td className="run-dim">
                                    {editMode ? (
                                      <EditNum
                                        defaultValue={run.depthIn}
                                        onCommit={(v) => onPatchRun(ri, ai, rni, { depthIn: v })}
                                        step={0.5}
                                        className="edit-input--run-dim"
                                      />
                                    ) : `${run.depthIn}"`}
                                  </td>
                                  <td>
                                    <span className={`run-type-chip run-type--${run.pieceType ?? "counter"}`}>
                                      {run.pieceType ?? "counter"}
                                    </span>
                                  </td>
                                  <td className={`run-sf${editMode ? " run-sf--live" : ""}`}>
                                    {displaySf.toFixed(2)}
                                  </td>
                                  {!editMode && (
                                    <td className="run-page">
                                      {(run.sourcePages?.length ?? 0) > 0
                                        ? `p. ${run.sourcePages!.join(", ")}`
                                        : "—"}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}

                      {/* Area assumptions (read-only) */}
                      {!editMode && (area.assumptions?.length ?? 0) > 0 && (
                        <div className="area-assumptions">
                          {area.assumptions!.map((a: string, i: number) => (
                            <span key={i} className="area-assumption-tag">✦ {a}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
