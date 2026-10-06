import { useState } from "react";
import {
  STANDARD_BACKSPLASH_HEIGHT_IN,
  STANDARD_COUNTER_DEPTH_IN,
  guidedCornerOverlapSqft,
  round2,
  sfFromGuidedPiece
} from "@quote-lib/measurementEngine";
import type { EstimateRoom } from "../lib/estimateTypes";
import { formatInches, parseLengthInches } from "../lib/measure";

type PieceKind = "counter" | "splash";
type Piece = { id: number; kind: PieceKind; label: string; length: string; depth: string; qty: string };

let nextId = 1;
const newPiece = (kind: PieceKind, label = ""): Piece => ({
  id: nextId++,
  kind,
  label,
  length: "",
  depth: String(kind === "counter" ? STANDARD_COUNTER_DEPTH_IN : STANDARD_BACKSPLASH_HEIGHT_IN),
  qty: "1"
});

function pieceSf(p: Piece): number {
  const len = parseLengthInches(p.length);
  const depth = parseLengthInches(p.depth);
  const qty = Math.max(0, Math.floor(Number(p.qty) || 0));
  if (!len || !depth || !qty) return 0;
  return round2(sfFromGuidedPiece(len, depth, "rect") * qty);
}

export type CalculatorTarget = { kind: PieceKind; onUse: (sqft: number) => void };

type Props = {
  rooms: EstimateRoom[];
  initialRoomId: string | null;
  /** When opened from an item's square-feet field: show "Use X sf" instead of add buttons. */
  target?: CalculatorTarget | null;
  onAdd: (totals: { counterSf: number; splashSf: number }, roomId: string | null) => void;
  onClose: () => void;
};

export default function SqftCalculator({ rooms, initialRoomId, target, onAdd, onClose }: Props) {
  const [pieces, setPieces] = useState<Piece[]>(() =>
    target?.kind === "splash" ? [newPiece("splash", "Backsplash")] : [newPiece("counter", "Run 1"), ...(target ? [] : [newPiece("splash", "Backsplash")])]
  );
  const [corners, setCorners] = useState("0");
  const [roomId, setRoomId] = useState<string | null>(initialRoomId);

  const patch = (id: number, p: Partial<Piece>) => setPieces((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const cornerCount = Math.max(0, Math.floor(Number(corners) || 0));
  const cornerSf = round2(cornerCount * guidedCornerOverlapSqft(STANDARD_COUNTER_DEPTH_IN, STANDARD_COUNTER_DEPTH_IN));
  const grossCounter = round2(pieces.filter((p) => p.kind === "counter").reduce((s, p) => s + pieceSf(p), 0));
  const counterSf = Math.max(0, round2(grossCounter - cornerSf));
  const splashSf = round2(pieces.filter((p) => p.kind === "splash").reduce((s, p) => s + pieceSf(p), 0));

  const addLabel = [counterSf > 0 ? `${counterSf} sf countertop` : "", splashSf > 0 ? `${splashSf} sf backsplash` : ""].filter(Boolean).join(" + ");

  const renderRows = (kind: PieceKind) =>
    pieces
      .filter((p) => p.kind === kind)
      .map((p) => {
        const len = parseLengthInches(p.length);
        const depth = parseLengthInches(p.depth);
        const badLen = p.length.trim() !== "" && len == null;
        const badDepth = p.depth.trim() !== "" && depth == null;
        return (
          <tr key={p.id}>
            <td>
              <input className="eb-calc-label" value={p.label} placeholder={kind === "counter" ? "Run / island" : "Wall"} onChange={(e) => patch(p.id, { label: e.target.value })} aria-label="Piece label" />
            </td>
            <td>
              <input
                className={badLen ? "is-invalid" : ""}
                value={p.length}
                placeholder={`e.g. 126 or 10'6"`}
                onChange={(e) => patch(p.id, { length: e.target.value })}
                aria-label="Length"
                inputMode="text"
              />
              {len ? <span className="eb-calc-sub">{formatInches(len)}</span> : null}
            </td>
            <td>
              <input className={badDepth ? "is-invalid" : ""} value={p.depth} onChange={(e) => patch(p.id, { depth: e.target.value })} aria-label={kind === "counter" ? "Depth" : "Height"} />
            </td>
            <td>
              <input className="eb-calc-qty" value={p.qty} onChange={(e) => patch(p.id, { qty: e.target.value })} aria-label="Quantity" inputMode="numeric" />
            </td>
            <td className="eb-calc-num">{pieceSf(p) ? `${pieceSf(p)} sf` : "—"}</td>
            <td>
              <button type="button" className="eb-icon-btn" aria-label="Remove piece" onClick={() => setPieces((list) => list.filter((x) => x.id !== p.id))}>
                ×
              </button>
            </td>
          </tr>
        );
      });

  const showCounter = target?.kind !== "splash";
  const showSplash = target?.kind !== "counter";

  return (
    <div className="eb-overlay" onClick={onClose}>
      <div
        className="eb-dialog eb-calc"
        role="dialog"
        aria-modal="true"
        aria-label="Square footage calculator"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="eb-dialog-head">
          <h2>Square footage calculator</h2>
          {!target ? (
            <label className="eb-palette-room">
              <span>Room</span>
              <select value={roomId ?? ""} onChange={(e) => setRoomId(e.target.value || null)}>
                <option value="">Project (no room)</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" className="eb-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="eb-hint">Lengths in inches or feet-inches (126, 10'6", 10.5'). Depth defaults to 25.5″ countertop / 4″ splash.</p>

        <div className="eb-catalog-body">
        <table className="eb-calc-table">
          <thead>
            <tr>
              <th>Piece</th>
              <th>Length</th>
              <th>Depth / height (in)</th>
              <th>Qty</th>
              <th className="eb-calc-num">Sq ft</th>
              <th />
            </tr>
          </thead>
          {showCounter ? (
            <tbody>
              <tr className="eb-calc-group">
                <td colSpan={6}>Countertop</td>
              </tr>
              {renderRows("counter")}
              <tr>
                <td colSpan={6}>
                  <button type="button" className="eb-link" onClick={() => setPieces((l) => [...l, newPiece("counter", `Run ${l.filter((p) => p.kind === "counter").length + 1}`)])}>
                    + Countertop piece
                  </button>
                  <label className="eb-calc-corners">
                    Corners (L = 1, U = 2)
                    <input value={corners} onChange={(e) => setCorners(e.target.value)} inputMode="numeric" aria-label="Corner overlaps" />
                  </label>
                  {cornerSf ? <span className="eb-calc-sub">−{cornerSf} sf overlap</span> : null}
                </td>
              </tr>
            </tbody>
          ) : null}
          {showSplash ? (
            <tbody>
              <tr className="eb-calc-group">
                <td colSpan={6}>Backsplash</td>
              </tr>
              {renderRows("splash")}
              <tr>
                <td colSpan={6}>
                  <button type="button" className="eb-link" onClick={() => setPieces((l) => [...l, newPiece("splash")])}>
                    + Backsplash piece
                  </button>
                </td>
              </tr>
            </tbody>
          ) : null}
        </table>
        </div>

        <div className="eb-calc-totals">
          {showCounter ? (
            <div>
              <span>Countertop</span>
              <strong>{counterSf} sf</strong>
            </div>
          ) : null}
          {showSplash ? (
            <div>
              <span>Backsplash</span>
              <strong>{splashSf} sf</strong>
            </div>
          ) : null}
        </div>

        <div className="eb-catalog-foot">
          <span className="eb-muted eb-small" role="status">
            Exact square feet. The estimate's normal pricing rules apply when it's priced.
          </span>
          <span className="eb-spacer" />
          {target ? (
            <button
              type="button"
              className="eb-btn eb-btn-primary"
              disabled={!((target.kind === "counter" ? counterSf : splashSf) > 0)}
              onClick={() => {
                target.onUse(target.kind === "counter" ? counterSf : splashSf);
                onClose();
              }}
            >
              Use {target.kind === "counter" ? counterSf : splashSf} sf
            </button>
          ) : (
            <button
              type="button"
              className="eb-btn eb-btn-primary"
              disabled={!addLabel}
              onClick={() => {
                onAdd({ counterSf, splashSf }, roomId);
                onClose();
              }}
            >
              {addLabel ? `Add ${addLabel}` : "Add to estimate"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
