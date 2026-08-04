import React, { useState } from "react";
import type { QuoteFlowScopePiece, QuoteFlowScopeRoom } from "../lib/quoteFlowEstimatesApi";

type Props = {
  rooms: QuoteFlowScopeRoom[];
  onChange: (rooms: QuoteFlowScopeRoom[]) => void;
  disabled?: boolean;
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

function pieceHasFinishedEdge(piece: QuoteFlowScopePiece): boolean {
  return (
    (piece.finishedEdge && typeof piece.finishedEdge === "object") ||
    piece.finishedEdgeLf != null ||
    piece.openEdgeLf != null
  );
}

function finishedEdgeTotalIn(piece: QuoteFlowScopePiece): number {
  const fe = piece.finishedEdge && typeof piece.finishedEdge === "object" ? piece.finishedEdge : {};
  const totalIn = Number((fe as { totalFinishedEdgeLengthIn?: number }).totalFinishedEdgeLengthIn);
  if (Number.isFinite(totalIn) && totalIn > 0) return totalIn;
  const lf = Number(piece.openEdgeLf ?? piece.finishedEdgeLf) || 0;
  return Math.round(lf * 12 * 100) / 100;
}

export function roomsFromOfficialScope(rooms: QuoteFlowScopeRoom[] | undefined): QuoteFlowScopeRoom[] {
  if (!Array.isArray(rooms) || !rooms.length) return [emptyRoom()];
  return rooms.map((r) => ({
    ...r,
    id: r.id || rid("room"),
    name: r.name || "Room",
    roomType: r.roomType || "Other",
    included: r.included !== false,
    pieces: (Array.isArray(r.pieces) ? r.pieces : []).map((p) => ({
      ...p,
      id: p.id || rid("piece"),
      name: p.name || "Piece",
      pieceType: p.pieceType || "counter",
      lengthIn: Number(p.lengthIn) || 0,
      depthIn: Number(p.depthIn) || 0,
      quantity: Math.max(1, Math.floor(Number(p.quantity) || 1)),
      included: p.included !== false && p.excluded !== true && p.include !== false
    }))
  }));
}

export default function OfficialScopeEditor(props: Props) {
  const { rooms, onChange, disabled } = props;
  const [showEdgeHint] = useState(true);

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
    const next = rooms.map((r, i) => {
      if (i !== roomIndex) return r;
      const pieces = (r.pieces || []).map((p, pi) =>
        pi === pieceIndex ? { ...p, included: false, excluded: true } : p
      );
      return { ...r, pieces };
    });
    onChange(next);
  }

  return (
    <div className="qf-scope" data-testid="qf-official-scope-editor">
      <div className="qf-scope__intro">
        <h2>Official scope</h2>
        <p className="qf-muted">Manual edits here do not rerun AI Takeoff.</p>
        {showEdgeHint ? (
          <p className="qf-muted qf-scope__hint">
            Edit room and piece measurements for this estimate. Finished edge and backsplash fields
            appear when they already exist on the scope.
          </p>
        ) : null}
      </div>

      {rooms.map((room, roomIndex) => (
        <div
          key={room.id || `room-${roomIndex}`}
          className="qf-scope__room"
          data-testid="qf-scope-room"
        >
          <div className="qf-scope__room-head">
            <label>
              Room name
              <input
                type="text"
                value={String(room.name || "")}
                disabled={disabled}
                onChange={(e) => updateRoom(roomIndex, { name: e.target.value })}
              />
            </label>
            <label>
              Room type
              <input
                type="text"
                value={String(room.roomType || "")}
                disabled={disabled}
                onChange={(e) => updateRoom(roomIndex, { roomType: e.target.value })}
              />
            </label>
            <label className="qf-scope__check">
              <input
                type="checkbox"
                checked={room.included !== false}
                disabled={disabled}
                onChange={(e) => updateRoom(roomIndex, { included: e.target.checked })}
              />
              Include room
            </label>
          </div>

          {roomHasBacksplashFields(room) ? (
            <div className="qf-scope__backsplash" data-testid="qf-scope-backsplash">
              <label className="qf-scope__check">
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
                Include backsplash
              </label>
              {room.includeBacksplash === true ? (
                <>
                  <label>
                    Height (in)
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
                  <label>
                    Measured length (in)
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

          <ul className="qf-scope__pieces">
            {(room.pieces || []).map((piece, pieceIndex) => {
              const included =
                piece.included !== false && piece.excluded !== true && piece.include !== false;
              return (
                <li
                  key={piece.id || `piece-${pieceIndex}`}
                  className={included ? "qf-scope__piece" : "qf-scope__piece is-excluded"}
                  data-testid="qf-scope-piece"
                >
                  <label>
                    Piece name
                    <input
                      type="text"
                      value={String(piece.name || "")}
                      disabled={disabled}
                      onChange={(e) =>
                        updatePiece(roomIndex, pieceIndex, { name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Length (in)
                    <input
                      type="number"
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
                  </label>
                  <label>
                    Depth (in)
                    <input
                      type="number"
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
                  </label>
                  <label>
                    Qty
                    <input
                      type="number"
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
                  </label>
                  <label className="qf-scope__check">
                    <input
                      type="checkbox"
                      checked={included}
                      disabled={disabled}
                      onChange={(e) =>
                        updatePiece(roomIndex, pieceIndex, {
                          included: e.target.checked,
                          excluded: !e.target.checked
                        })
                      }
                    />
                    Include
                  </label>
                  {pieceHasFinishedEdge(piece) ? (
                    <label data-testid="qf-scope-finished-edge">
                      Finished edge (in)
                      <input
                        type="number"
                        min={0}
                        step={0.125}
                        value={finishedEdgeTotalIn(piece)}
                        disabled={disabled}
                        onChange={(e) => {
                          const totalIn = Number(e.target.value) || 0;
                          updatePiece(roomIndex, pieceIndex, {
                            finishedEdge: {
                              ...(typeof piece.finishedEdge === "object"
                                ? piece.finishedEdge
                                : {}),
                              frontEdgeLengthIn: totalIn,
                              totalFinishedEdgeLengthIn: totalIn,
                              approved: true,
                              source: "estimator_confirmed"
                            },
                            openEdgeLf: Math.round((totalIn / 12) * 100) / 100,
                            finishedEdgeLf: Math.round((totalIn / 12) * 100) / 100
                          });
                        }}
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="qf-btn-secondary"
                    disabled={disabled}
                    onClick={() => removePiece(roomIndex, pieceIndex)}
                  >
                    Exclude piece
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className="qf-btn-secondary"
            data-testid="qf-scope-add-piece"
            disabled={disabled}
            onClick={() => addPiece(roomIndex)}
          >
            Add piece
          </button>
        </div>
      ))}

      <button
        type="button"
        className="qf-btn-secondary"
        data-testid="qf-scope-add-room"
        disabled={disabled}
        onClick={addRoom}
      >
        Add room
      </button>
    </div>
  );
}
