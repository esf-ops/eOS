/**
 * Studio V2 Slice B — physical Working Draft scope editor.
 * Local dirty state only. Save via PATCH /api/elite100-studio-v2/.../scope.
 * Does not import V1 Studio orchestration components.
 */
import React from "react";

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

export type StudioV2EditablePiece = {
  id: string;
  name: string;
  pieceType?: string;
  included: boolean;
  lengthIn: number;
  depthIn: number;
  quantity: number;
  approvedDirectSqft?: number | null;
  backsplashEligibleLengthIn?: number | null;
  finishedEdgeLf?: number | null;
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
};

export function emptyEditableScope(): StudioV2EditableScope {
  return {
    rooms: [],
    openings: { kitchenSink: 0, vanityBarSink: 0, cooktop: 0, outlet: 0 }
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
};

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
    onSave
  } = props;

  function updateRoom(roomId: string, patch: Partial<StudioV2EditableRoom>) {
    onChange({
      ...value,
      rooms: value.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r))
    });
  }

  function updatePiece(roomId: string, pieceId: string, patch: Partial<StudioV2EditablePiece>) {
    onChange({
      ...value,
      rooms: value.rooms.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              pieces: r.pieces.map((p) => (p.id === pieceId ? { ...p, ...patch } : p))
            }
      )
    });
  }

  function addRoom() {
    const id = newId("room");
    onChange({
      ...value,
      rooms: [
        ...value.rooms,
        {
          id,
          name: `Room ${value.rooms.length + 1}`,
          roomType: "Kitchen",
          included: true,
          backsplashSqft: null,
          edgeEligibleLinearFeet: null,
          pieces: [
            {
              id: newId("piece"),
              name: "Main run",
              pieceType: "counter",
              included: true,
              lengthIn: 0,
              depthIn: 25.5,
              quantity: 1,
              approvedDirectSqft: null,
              backsplashEligibleLengthIn: null,
              finishedEdgeLf: null
            }
          ]
        }
      ]
    });
  }

  function removeRoom(roomId: string) {
    onChange({
      ...value,
      rooms: value.rooms.filter((r) => r.id !== roomId)
    });
  }

  function addPiece(roomId: string) {
    onChange({
      ...value,
      rooms: value.rooms.map((r) =>
        r.id !== roomId
          ? r
          : {
              ...r,
              pieces: [
                ...r.pieces,
                {
                  id: newId("piece"),
                  name: `Piece ${r.pieces.length + 1}`,
                  pieceType: "counter",
                  included: true,
                  lengthIn: 0,
                  depthIn: 25.5,
                  quantity: 1,
                  approvedDirectSqft: null,
                  backsplashEligibleLengthIn: null,
                  finishedEdgeLf: null
                }
              ]
            }
      )
    });
  }

  function removePiece(roomId: string, pieceId: string) {
    onChange({
      ...value,
      rooms: value.rooms.map((r) =>
        r.id !== roomId ? r : { ...r, pieces: r.pieces.filter((p) => p.id !== pieceId) }
      )
    });
  }

  return (
    <section className="studio-v2-panel studio-v2-scope-editor" data-testid="studio-v2-scope-editor">
      <div className="studio-v2-panel__head">
        <div>
          <h2>Working Draft scope</h2>
          <p className="muted studio-v2-scope-editor__hint">
            Physical measurements only. Customer Digital Estimate does not edit scope.
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

      <div className="studio-v2-openings" data-testid="studio-v2-openings">
        <h3>Openings / cutouts</h3>
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
                disabled={readOnly}
                value={value.openings[key]}
                onChange={(e) =>
                  onChange({
                    ...value,
                    openings: {
                      ...value.openings,
                      [key]: Math.max(0, Math.floor(numInput(e.target.value)))
                    }
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
                  {!STUDIO_V2_ROOM_TYPES.includes(room.roomType as (typeof STUDIO_V2_ROOM_TYPES)[number]) ? (
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
                      backsplashSqft: e.target.value.trim() === "" ? null : numInput(e.target.value)
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
              <table className="studio-v2-piece-table">
                <thead>
                  <tr>
                    <th>Include</th>
                    <th>Label</th>
                    <th>Length in</th>
                    <th>Depth in</th>
                    <th>Qty</th>
                    <th>Direct SF</th>
                    <th>Splash LF</th>
                    <th>Edge LF</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {room.pieces.map((piece) => (
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
                          onChange={(e) => updatePiece(room.id, piece.id, { name: e.target.value })}
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
                            updatePiece(room.id, piece.id, { lengthIn: numInput(e.target.value) })
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
                            updatePiece(room.id, piece.id, { depthIn: numInput(e.target.value) })
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
                                e.target.value.trim() === "" ? null : numInput(e.target.value)
                            })
                          }
                          data-testid="studio-v2-piece-direct-sf"
                          title="Approved direct square footage (optional)"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          disabled={readOnly}
                          value={piece.backsplashEligibleLengthIn ?? ""}
                          onChange={(e) =>
                            updatePiece(room.id, piece.id, {
                              backsplashEligibleLengthIn:
                                e.target.value.trim() === "" ? null : numInput(e.target.value)
                            })
                          }
                          data-testid="studio-v2-piece-splash-lf"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          disabled={readOnly}
                          value={piece.finishedEdgeLf ?? ""}
                          onChange={(e) =>
                            updatePiece(room.id, piece.id, {
                              finishedEdgeLf:
                                e.target.value.trim() === "" ? null : numInput(e.target.value)
                            })
                          }
                          data-testid="studio-v2-piece-edge-lf"
                        />
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
                  ))}
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
    </section>
  );
}
