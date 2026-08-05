import React, { useMemo, useState } from "react";
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
        included: p.included !== false && p.excluded !== true && p.include !== false
      };
    })
  }));
}

export default function OfficialScopeEditor(props: Props) {
  const { rooms, onChange, disabled, heading, hint } = props;
  const [showEdgeHint] = useState(true);
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

  function excludePiece(roomIndex: number, pieceIndex: number) {
    const next = rooms.map((r, i) => {
      if (i !== roomIndex) return r;
      const pieces = (r.pieces || []).map((p, pi) =>
        pi === pieceIndex ? { ...p, included: false, excluded: true } : p
      );
      return { ...r, pieces };
    });
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
    <div className="qf-scope" data-testid="qf-official-scope-editor">
      <div className="qf-scope__intro">
        <h2>{heading || "Official scope"}</h2>
        <p className="qf-muted">{hint || "Manual edits here do not rerun AI Takeoff."}</p>
        {showEdgeHint && !heading ? (
          <p className="qf-muted qf-scope__hint">
            Edit room and piece measurements for this estimate. Open edge LF is the exposed edge
            length used later for pricing — it is scope data, not a price.
          </p>
        ) : null}
        <p className="qf-scope__sf-summary" data-testid="qf-scope-sf-summary">
          {localSummary.roomCount} room{localSummary.roomCount === 1 ? "" : "s"} ·{" "}
          {localSummary.pieceCount} piece{localSummary.pieceCount === 1 ? "" : "s"}
          {localSummary.countertopSf > 0
            ? ` · ${localSummary.countertopSf.toFixed(1)} SF countertop`
            : ""}
          {localSummary.backsplashSf > 0
            ? ` · ${localSummary.backsplashSf.toFixed(1)} SF backsplash`
            : ""}
          {` · ${(localSummary.openEdgeLf || 0).toFixed(1)} LF open edge`}
          {localSummary.excludedPieceCount > 0
            ? ` · ${localSummary.excludedPieceCount} excluded`
            : ""}
        </p>
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
            <button
              type="button"
              className="qf-btn-secondary"
              data-testid="qf-scope-remove-room"
              disabled={disabled}
              onClick={() => removeRoom(roomIndex)}
            >
              Remove room
            </button>
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
              const sf = pieceSf(piece);
              const openLf = resolvePieceOpenEdgeLf(piece);
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
                  <label data-testid="qf-scope-piece-sf">
                    Square feet
                    <input type="text" value={sf > 0 ? sf.toFixed(2) : "0.00"} readOnly disabled />
                  </label>
                  <label data-testid="qf-scope-open-edge-lf">
                    Open edge LF
                    <input
                      type="number"
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
                  <button
                    type="button"
                    className="qf-btn-secondary"
                    data-testid="qf-scope-exclude-piece"
                    disabled={disabled}
                    onClick={() => excludePiece(roomIndex, pieceIndex)}
                  >
                    Exclude piece
                  </button>
                  <button
                    type="button"
                    className="qf-btn-secondary"
                    data-testid="qf-scope-remove-piece"
                    disabled={disabled}
                    onClick={() => removePiece(roomIndex, pieceIndex)}
                  >
                    Remove piece
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
