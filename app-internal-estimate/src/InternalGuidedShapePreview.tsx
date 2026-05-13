import React from "react";
import type { GuidedPiece } from "@quote-lib/quoteTypes";
import { sfFromGuidedPiece } from "@quote-lib/measurementEngine";

type Props = {
  pieces: GuidedPiece[];
  pieceCount: number;
  counterSqft: number;
  splashSqft: number;
};

/**
 * Non-CAD visual aid for guided pieces — rectangles scaled by relative length.
 */
export default function InternalGuidedShapePreview({ pieces, pieceCount, counterSqft, splashSqft }: Props) {
  const counters = pieces.filter((p) => p.pieceType === "counter" && p.lengthIn > 0 && p.depthIn > 0);
  const maxLen = Math.max(1, ...counters.map((p) => p.lengthIn));
  const scale = 220 / maxLen;

  return (
    <div className="internal-shape-preview card" style={{ marginTop: 12 }}>
      <h4 className="measure-preview-title">Layout preview (estimate aid)</h4>
      <p className="muted small" style={{ marginTop: 0 }}>
        Not a shop drawing — use to verify piece count and rough proportions before export.
      </p>
      <p className="small">
        <strong>Pieces:</strong> {pieceCount} &nbsp;|&nbsp; <strong>Countertop sf:</strong> {counterSqft.toFixed(2)} &nbsp;|&nbsp;{" "}
        <strong>Backsplash sf:</strong> {splashSqft.toFixed(2)}
      </p>
      <svg width="100%" height={Math.min(48 + counters.length * 36, 220)} viewBox="0 0 260 200" role="img" aria-label="Guided layout preview">
        {counters.map((p, i) => {
          const w = Math.max(8, p.lengthIn * scale);
          const h = Math.max(6, (p.depthIn / p.lengthIn) * w * 0.35);
          const y = 16 + i * 40;
          const x = 10;
          const sf = sfFromGuidedPiece(p.lengthIn, p.depthIn, p.shape);
          return (
            <g key={p.id}>
              <rect x={x} y={y} width={w} height={h} rx={3} fill={p.addSplash ? "#1e3a5f" : "#2d4a6f"} stroke="#8ab4ff" strokeWidth={1} />
              <text x={x + w + 8} y={y + h / 2 + 4} fill="#ccc" fontSize={11}>
                {p.name.slice(0, 18)}
                {sf > 0 ? ` · ${sf.toFixed(1)} sf` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
