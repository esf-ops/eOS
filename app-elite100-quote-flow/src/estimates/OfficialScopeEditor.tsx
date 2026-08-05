import React, { useMemo } from "react";
import type { QuoteFlowScopePiece, QuoteFlowScopeRoom } from "../lib/quoteFlowEstimatesApi";
import { resolvePieceOpenEdgeLf, summarizeRoomsLocal } from "../lib/estimateGrouping.mjs";

type Props = {
  rooms: QuoteFlowScopeRoom[];
  onChange: (rooms: QuoteFlowScopeRoom[]) => void;
  disabled?: boolean;
  /** Optional heading override (Estimate Queue create mode). */
  heading?: string;
  /** Optional hint override. */
  hint?: string;
};

function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyPiece(): QuoteFlowScopePiece {
  return {
    id: rid("piece"),
    name: "Piece",
    pieceType: "counter",
    lengthIn: 0,
    depthIn: 0,
    quantity: 1,
    openEdgeLf: 0,
    finishedEdgeLf: 0,
    included: true,
    excluded: false
  };
}

function emptyRoom(): QuoteFlowScopeRoom {
  return {
    id: rid("room"),
    name: "Room",
    roomType: "Other",
    included: true,
    pieces: [emptyPiece()]
  };
}

function roomHasBacksplashFields(room: QuoteFlowScopeRoom): boolean {
  return (
    typeof room.includeBacksplash === "boolean" ||
    room.backsplashHeightMode != null ||
    room.backsplashMeasuredLengthIn != null ||
    room.backsplashHeightIn != null
  );
}

function pieceSf(piece: QuoteFlowScopePiece): number {
  const lengthIn = Number(piece.lengthIn) || 0;
  const depthIn = Number(piece.depthIn) || 0;
  const quantity = Math.max(1, Math.floor(Number(piece.quantity) || 1));
  if (!(lengthIn > 0 && depthIn > 0)) return 0;
  return Math.round(((lengthIn * depthIn * quantity) / 144) * 100) / 100;
}

function patchOpenEdgeLf(piece: QuoteFlowScopePiece, lf: number): Partial<QuoteFlowScopePiece> {
  const value = Math.max(0, Math.round((Number(lf) || 0) * 100) / 100);
  const inches = Math.round(value * 12 * 100) / 100;
  const fe =
    piece.finishedEdge && typeof piece.finishedEdge === "object"
      ? { ...piece.finishedEdge }
      : {};
  return {
    openEdgeLf: value,
    finishedEdgeLf: value,
    exposedEdgeLf: value,
    finishedEdge: {
      ...fe,
      totalFinishedEdgeLengthIn: inches,
      frontEdgeLengthIn:
        Number((fe as { frontEdgeLengthIn?: number }).frontEdgeLengthIn) > 0
          ? (fe as { frontEdgeLengthIn?: number }).frontEdgeLengthIn
          : inches,
      // Match working Studio DE publication: approved finishedEdge → room.edgeLinearFeet.
      approved: true,
      finishedEdgeConfirmed: true,
      source: "estimator_confirmed"
    }
  };
}

export function roomsFromOfficialScope(rooms: QuoteFlowScopeRoom[] | undefined): QuoteFlowScopeRoom[] {
  if (!Array.isArray(rooms) || !rooms.length) return [emptyRoom()];
  return rooms.map((r) => ({
    ...r,
    id: r.id || rid("room"),
    name: r.name || "Room",
    roomType: r.roomType || "Other",
    included: r.included !== false,
    pieces: (Array.isArray(r.pieces) ? r.pieces : []).map((p) => {
      const openEdgeLf = resolvePieceOpenEdgeLf(p);
      const inches = Math.round(openEdgeLf * 12 * 100) / 100;
      const fe =
        p.finishedEdge && typeof p.finishedEdge === "object" ? { ...p.finishedEdge } : {};
      return {
        ...p,
        id: p.id || rid("piece"),
        name: p.name || "Piece",
        pieceType: p.pieceType || "counter",
        lengthIn: Number(p.lengthIn) || 0,
        depthIn: Number(p.depthIn) || 0,
        quantity: Math.max(1, Math.floor(Number(p.quantity) || 1)),
        openEdgeLf,
        finishedEdgeLf: openEdgeLf,
        finishedEdge: {
          ...fe,
          totalFinishedEdgeLengthIn:
            Number((fe as { totalFinishedEdgeLengthIn?: number }).totalFinishedEdgeLengthIn) > 0
              ? (fe as { totalFinishedEdgeLengthIn?: number }).totalFinishedEdgeLengthIn
              : inches,
          frontEdgeLengthIn:
            Number((fe as { frontEdgeLengthIn?: number }).frontEdgeLengthIn) > 0
              ? (fe as { frontEdgeLengthIn?: number }).frontEdgeLengthIn
              : inches,
          approved: true,
          finishedEdgeConfirmed: true,
          source:
            (fe as { source?: string }).source || "estimator_confirmed"
        },
        included: p.included !== false && p.excluded !== true && p.include !== false
      };
    })
  }));
}

export default function OfficialScopeEditor(props: Props) {
  const { rooms, onChange, disabled, heading, hint } = props;
  const localSummary = useMemo(() => summarizeRoomsLocal(rooms), [rooms]);

  function updateRoom(index: number, patch: Partial<QuoteFlowScopeRoom>) {
    const next = rooms.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  }

  function updatePiece(roomIndex: number, pieceIndex: number, patch: Partial<QuoteFlowScopePiece>) {
    const next = rooms.map((r, ri) => {
      if (ri !== roomIndex) return r;
      const pieces = (r.pieces || []).map((p, pi) => (pi === pieceIndex ? { ...p, ...patch } : p));
      return { ...r, pieces };
    });
    onChange(next);
  }

  function addRoom() {
    onChange([...rooms, emptyRoom()]);
  }

  function addPiece(roomIndex: number) {
    const next = rooms.map((r, i) =>
      i === roomIndex ? { ...r, pieces: [...(r.pieces || []), emptyPiece()] } : r
    );
    onChange(next);
  }

  function removePiece(roomIndex: number, pieceIndex: number) {
    const piece = rooms[roomIndex]?.pieces?.[pieceIndex];
    const label = String(piece?.name || "this piece");
    if (!window.confirm(`Remove ${label} from official scope?`)) return;
    const next = rooms.map((r, i) => {
      if (i !== roomIndex) return r;
      const pieces = (r.pieces || []).filter((_, pi) => pi !== pieceIndex);
      return { ...r, pieces: pieces.length ? pieces : [emptyPiece()] };
    });
    onChange(next);
  }

  function removeRoom(roomIndex: number) {
    const room = rooms[roomIndex];
    const label = String(room?.name || "this room");
    if (!window.confirm(`Remove ${label} from official scope?`)) return;
    if (rooms.length <= 1) {
      onChange([emptyRoom()]);
      return;
    }
    onChange(rooms.filter((_, i) => i !== roomIndex));
  }

  return (
    <div className="qf-scope qf-scope--worksheet" data-testid="qf-official-scope-editor">
      <header className="qf-scope__intro" data-testid="qf-scope-intro">
        <div className="qf-scope__intro-copy">
          <h2>{heading || "Official scope"}</h2>
          <p className="qf-muted">{hint || "Manual edits here do not rerun AI Takeoff."}</p>
        </div>
        <div className="qf-scope__metrics" data-testid="qf-scope-sf-summary" aria-label="Scope summary">
          <div className="qf-scope__metric">
            <span className="qf-scope__metric-val">{localSummary.roomCount}</span>
            <span className="qf-scope__metric-lbl">Rooms</span>
          </div>
          <div className="qf-scope__metric">
            <span className="qf-scope__metric-val">{localSummary.pieceCount}</span>
            <span className="qf-scope__metric-lbl">Pieces</span>
          </div>
          <div className="qf-scope__metric">
            <span className="qf-scope__metric-val">
              {localSummary.countertopSf > 0 ? localSummary.countertopSf.toFixed(1) : "0.0"}
            </span>
            <span className="qf-scope__metric-lbl">Countertop SF</span>
          </div>
          <div className="qf-scope__metric">
            <span className="qf-scope__metric-val">
              {localSummary.backsplashSf > 0 ? localSummary.backsplashSf.toFixed(1) : "0.0"}
            </span>
            <span className="qf-scope__metric-lbl">Backsplash SF</span>
          </div>
          <div className="qf-scope__metric" data-testid="qf-scope-summary-open-edge">
            <span className="qf-scope__metric-val">{(localSummary.openEdgeLf || 0).toFixed(1)}</span>
            <span className="qf-scope__metric-lbl">Open edge LF</span>
          </div>
        </div>
      </header>

      <div className="qf-scope__rooms">
        {rooms.map((room, roomIndex) => {
          const roomIncluded = room.included !== false;
          return (
            <section
              key={room.id || `room-${roomIndex}`}
              className={roomIncluded ? "qf-scope__room" : "qf-scope__room is-excluded"}
              data-testid="qf-scope-room"
            >
              <div className="qf-scope__room-head">
                <label className="qf-scope__field qf-scope__field--name">
                  <span className="qf-scope__field-lbl">Room name</span>
                  <input
                    type="text"
                    value={String(room.name || "")}
                    disabled={disabled}
                    onChange={(e) => updateRoom(roomIndex, { name: e.target.value })}
                  />
                </label>
                <label className="qf-scope__field qf-scope__field--type">
                  <span className="qf-scope__field-lbl">Room type</span>
                  <input
                    type="text"
                    value={String(room.roomType || "")}
                    disabled={disabled}
                    onChange={(e) => updateRoom(roomIndex, { roomType: e.target.value })}
                  />
                </label>
                <label className="qf-scope__toggle">
                  <input
                    type="checkbox"
                    checked={roomIncluded}
                    disabled={disabled}
                    onChange={(e) => updateRoom(roomIndex, { included: e.target.checked })}
                  />
                  <span>Include room</span>
                </label>
                <button
                  type="button"
                  className="qf-scope__link-btn"
                  data-testid="qf-scope-remove-room"
                  disabled={disabled}
                  onClick={() => removeRoom(roomIndex)}
                >
                  Remove room
                </button>
              </div>

              {roomHasBacksplashFields(room) ? (
                <div className="qf-scope__backsplash" data-testid="qf-scope-backsplash">
                  <label className="qf-scope__toggle">
                    <input
                      type="checkbox"
                      checked={room.includeBacksplash === true}
                      disabled={disabled}
                      onChange={(e) =>
                        updateRoom(roomIndex, {
                          includeBacksplash: e.target.checked,
                          backsplashHeightMode: e.target.checked
                            ? room.backsplashHeightMode || "standard"
                            : "none"
                        })
                      }
                    />
                    <span>Include backsplash</span>
                  </label>
                  {room.includeBacksplash === true ? (
                    <>
                      <label className="qf-scope__field qf-scope__field--compact">
                        <span className="qf-scope__field-lbl">Height (in)</span>
                        <input
                          type="number"
                          min={0}
                          step={0.125}
                          value={Number(room.backsplashHeightIn) || 0}
                          disabled={disabled}
                          onChange={(e) =>
                            updateRoom(roomIndex, {
                              backsplashHeightIn: Number(e.target.value) || 0
                            })
                          }
                        />
                      </label>
                      <label className="qf-scope__field qf-scope__field--compact">
                        <span className="qf-scope__field-lbl">Measured length (in)</span>
                        <input
                          type="number"
                          min={0}
                          step={0.125}
                          value={Number(room.backsplashMeasuredLengthIn) || 0}
                          disabled={disabled}
                          onChange={(e) =>
                            updateRoom(roomIndex, {
                              backsplashMeasuredLengthIn: Number(e.target.value) || 0
                            })
                          }
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="qf-scope__table-wrap">
                <table className="qf-scope__table" data-testid="qf-scope-piece-table">
                  <thead>
                    <tr>
                      <th scope="col">Piece name</th>
                      <th scope="col">Length in</th>
                      <th scope="col">Depth in</th>
                      <th scope="col">Qty</th>
                      <th scope="col">Square feet</th>
                      <th scope="col">Open edge LF</th>
                      <th scope="col">Included</th>
                      <th scope="col" className="qf-scope__col-actions">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(room.pieces || []).map((piece, pieceIndex) => {
                      const included =
                        piece.included !== false &&
                        piece.excluded !== true &&
                        piece.include !== false;
                      const sf = pieceSf(piece);
                      const openLf = resolvePieceOpenEdgeLf(piece);
                      return (
                        <tr
                          key={piece.id || `piece-${pieceIndex}`}
                          className={included ? undefined : "is-excluded"}
                          data-testid="qf-scope-piece"
                        >
                          <td data-label="Piece name">
                            <input
                              type="text"
                              aria-label="Piece name"
                              value={String(piece.name || "")}
                              disabled={disabled}
                              onChange={(e) =>
                                updatePiece(roomIndex, pieceIndex, { name: e.target.value })
                              }
                            />
                          </td>
                          <td data-label="Length in">
                            <input
                              type="number"
                              aria-label="Length in"
                              min={0}
                              step={0.125}
                              value={Number(piece.lengthIn) || 0}
                              disabled={disabled}
                              onChange={(e) =>
                                updatePiece(roomIndex, pieceIndex, {
                                  lengthIn: Number(e.target.value) || 0
                                })
                              }
                            />
                          </td>
                          <td data-label="Depth in">
                            <input
                              type="number"
                              aria-label="Depth in"
                              min={0}
                              step={0.125}
                              value={Number(piece.depthIn) || 0}
                              disabled={disabled}
                              onChange={(e) =>
                                updatePiece(roomIndex, pieceIndex, {
                                  depthIn: Number(e.target.value) || 0
                                })
                              }
                            />
                          </td>
                          <td data-label="Qty">
                            <input
                              type="number"
                              aria-label="Quantity"
                              min={1}
                              step={1}
                              value={Math.max(1, Math.floor(Number(piece.quantity) || 1))}
                              disabled={disabled}
                              onChange={(e) =>
                                updatePiece(roomIndex, pieceIndex, {
                                  quantity: Math.max(1, Math.floor(Number(e.target.value) || 1))
                                })
                              }
                            />
                          </td>
                          <td data-label="Square feet" data-testid="qf-scope-piece-sf">
                            <span className="qf-scope__readonly">{sf > 0 ? sf.toFixed(2) : "0.00"}</span>
                          </td>
                          <td data-label="Open edge LF" data-testid="qf-scope-open-edge-lf">
                            <input
                              type="number"
                              aria-label="Open edge LF"
                              min={0}
                              step={0.01}
                              value={openLf}
                              disabled={disabled}
                              onChange={(e) =>
                                updatePiece(
                                  roomIndex,
                                  pieceIndex,
                                  patchOpenEdgeLf(piece, Number(e.target.value) || 0)
                                )
                              }
                            />
                          </td>
                          <td data-label="Included">
                            <label className="qf-scope__toggle qf-scope__toggle--compact">
                              <input
                                type="checkbox"
                                aria-label="Included"
                                checked={included}
                                disabled={disabled}
                                onChange={(e) =>
                                  updatePiece(roomIndex, pieceIndex, {
                                    included: e.target.checked,
                                    excluded: !e.target.checked
                                  })
                                }
                              />
                              <span className="qf-scope__sr-only">Included</span>
                            </label>
                          </td>
                          <td data-label="Actions" className="qf-scope__col-actions">
                            <button
                              type="button"
                              className="qf-scope__link-btn"
                              data-testid="qf-scope-remove-piece"
                              disabled={disabled}
                              onClick={() => removePiece(roomIndex, pieceIndex)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="qf-scope__room-footer">
                <button
                  type="button"
                  className="qf-btn-secondary qf-scope__add-btn"
                  data-testid="qf-scope-add-piece"
                  disabled={disabled}
                  onClick={() => addPiece(roomIndex)}
                >
                  Add piece
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <div className="qf-scope__footer">
        <button
          type="button"
          className="qf-btn-secondary qf-scope__add-btn"
          data-testid="qf-scope-add-room"
          disabled={disabled}
          onClick={addRoom}
        >
          Add room
        </button>
      </div>
    </div>
  );
}
