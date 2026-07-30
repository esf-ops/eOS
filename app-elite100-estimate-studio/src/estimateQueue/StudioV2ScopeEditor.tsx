/**
 * Studio V2 Slice B + I — physical Working Draft scope editor.
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

/** Supported priced edge profiles (matches studioEdgeAuthority). */
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
  backsplashEligibleLengthIn?: number | null;
  finishedEdgeLf?: number | null;
  edgeProfileToken?: string | null;
  kitchenSinkCutouts?: number | null;
  vanityBarSinkCutouts?: number | null;
  cooktopCutouts?: number | null;
  outletCutouts?: number | null;
  sideSplashLeft?: boolean;
  sideSplashRight?: boolean;
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
    backsplashEligibleLengthIn: null,
    finishedEdgeLf: null,
    edgeProfileToken: null,
    kitchenSinkCutouts: null,
    vanityBarSinkCutouts: null,
    cooktopCutouts: null,
    outletCutouts: null,
    sideSplashLeft: false,
    sideSplashRight: false
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

  const openingSummary = summarizeOpenings(value.rooms);
  const openingsFromPieces = openingSummary.fromPieces;

  function updateRoom(roomId: string, patch: Partial<StudioV2EditableRoom>) {
    onChange({
      ...value,
      rooms: value.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r))
    });
  }

  function updatePiece(roomId: string, pieceId: string, patch: Partial<StudioV2EditablePiece>) {
    const rooms = value.rooms.map((r) =>
      r.id !== roomId
        ? r
        : {
            ...r,
            pieces: r.pieces.map((p) => (p.id === pieceId ? { ...p, ...patch } : p))
          }
    );
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
          pieces: [emptyPiece("Main run")]
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
              pieces: [...r.pieces, emptyPiece(`Piece ${r.pieces.length + 1}`)]
            }
      )
    });
  }

  function removePiece(roomId: string, pieceId: string) {
    const rooms = value.rooms.map((r) =>
      r.id !== roomId ? r : { ...r, pieces: r.pieces.filter((p) => p.id !== pieceId) }
    );
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
        : value.openings
    });
  }

  const displayOpenings = openingsFromPieces
    ? {
        kitchenSink: openingSummary.kitchenSink,
        vanityBarSink: openingSummary.vanityBarSink,
        cooktop: openingSummary.cooktop,
        outlet: openingSummary.outlet
      }
    : value.openings;

  return (
    <section className="studio-v2-panel studio-v2-scope-editor" data-testid="studio-v2-scope-editor">
      <div className="studio-v2-panel__head">
        <div>
          <h2>Working Draft scope</h2>
          <p className="muted studio-v2-scope-editor__hint">
            Enter openings, finished edge, and edge profile on each piece. Physical measurements
            only — pricing stays on the server.
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
        <h3>Openings summary</h3>
        <p className="muted studio-v2-scope-editor__hint">
          {openingsFromPieces
            ? "Totals from piece-level cutouts (edit on each piece below)."
            : "Legacy project totals — prefer entering cutouts on each piece."}
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

            <div className="studio-v2-piece-list" data-testid="studio-v2-piece-list">
              {room.pieces.map((piece) => {
                const isVanity =
                  /vanity|bar/i.test(room.roomType || "") || /vanity|bar/i.test(piece.name || "");
                return (
                  <div key={piece.id} className="studio-v2-piece-card" data-testid="studio-v2-piece-row">
                    <div className="studio-v2-piece-card__geometry">
                      <label className="studio-v2-piece-card__include">
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
                        <span>Include</span>
                      </label>
                      <label>
                        <span>Piece</span>
                        <input
                          type="text"
                          disabled={readOnly}
                          value={piece.name}
                          onChange={(e) => updatePiece(room.id, piece.id, { name: e.target.value })}
                          data-testid="studio-v2-piece-label"
                        />
                      </label>
                      <label>
                        <span>Length in</span>
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
                      </label>
                      <label>
                        <span>Depth in</span>
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
                      </label>
                      <label>
                        <span>Qty</span>
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
                      </label>
                      <label>
                        <span>Direct SF</span>
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
                      </label>
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
                    </div>

                    <div
                      className="studio-v2-piece-card__detail"
                      data-testid="studio-v2-piece-detail"
                    >
                      <label>
                        <span>{isVanity ? "Vanity sink cutouts" : "Sink cutouts"}</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          disabled={readOnly}
                          value={
                            isVanity
                              ? (piece.vanityBarSinkCutouts ?? "")
                              : (piece.kitchenSinkCutouts ?? "")
                          }
                          onChange={(e) => {
                            const v =
                              e.target.value.trim() === ""
                                ? null
                                : Math.max(0, Math.floor(numInput(e.target.value)));
                            if (isVanity) {
                              updatePiece(room.id, piece.id, { vanityBarSinkCutouts: v });
                            } else {
                              updatePiece(room.id, piece.id, { kitchenSinkCutouts: v });
                            }
                          }}
                          data-testid={
                            isVanity
                              ? "studio-v2-piece-vanity-sink"
                              : "studio-v2-piece-kitchen-sink"
                          }
                        />
                      </label>
                      {!isVanity ? (
                        <label>
                          <span>Cooktop cutouts</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            disabled={readOnly}
                            value={piece.cooktopCutouts ?? ""}
                            onChange={(e) =>
                              updatePiece(room.id, piece.id, {
                                cooktopCutouts:
                                  e.target.value.trim() === ""
                                    ? null
                                    : Math.max(0, Math.floor(numInput(e.target.value)))
                              })
                            }
                            data-testid="studio-v2-piece-cooktop"
                          />
                        </label>
                      ) : null}
                      <label>
                        <span>Outlet count</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          disabled={readOnly}
                          value={piece.outletCutouts ?? ""}
                          onChange={(e) =>
                            updatePiece(room.id, piece.id, {
                              outletCutouts:
                                e.target.value.trim() === ""
                                  ? null
                                  : Math.max(0, Math.floor(numInput(e.target.value)))
                            })
                          }
                          data-testid="studio-v2-piece-outlet"
                        />
                      </label>
                      <label>
                        <span>Finished edge LF</span>
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
                      </label>
                      <label>
                        <span>Edge profile</span>
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
                      </label>
                      <label>
                        <span>Splash LF</span>
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
                      </label>
                      <label className="studio-v2-piece-card__check" title="Saved as scope detail — not priced yet">
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={Boolean(piece.sideSplashLeft)}
                          onChange={(e) =>
                            updatePiece(room.id, piece.id, { sideSplashLeft: e.target.checked })
                          }
                          data-testid="studio-v2-piece-side-splash-left"
                        />
                        <span>Side splash L (not priced yet)</span>
                      </label>
                      <label className="studio-v2-piece-card__check" title="Saved as scope detail — not priced yet">
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={Boolean(piece.sideSplashRight)}
                          onChange={(e) =>
                            updatePiece(room.id, piece.id, { sideSplashRight: e.target.checked })
                          }
                          data-testid="studio-v2-piece-side-splash-right"
                        />
                        <span>Side splash R (not priced yet)</span>
                      </label>
                    </div>
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
