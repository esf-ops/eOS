import React from "react";
import { STANDARD_BACKSPLASH_HEIGHT_IN } from "../lib/measurementEngine";
import {
  CONFIDENCE_COPY,
  computeGuidedSimpleAreas,
  type GuidedLayoutPreset,
  type GuidedSimpleForm
} from "../lib/guidedHomeowner";
import type { GuidedPiece } from "../lib/quoteTypes";
import { createDefaultRoom } from "../lib/prototypeQuoteMath";

const PRESETS: Array<{ id: GuidedLayoutPreset; title: string; description: string }> = [
  { id: "straight", title: "Straight run", description: "One straight countertop run." },
  { id: "l_shape", title: "L-shape", description: "Two countertop runs that meet in a corner." },
  { id: "u_shape", title: "U-shape", description: "Three sides of countertops around the kitchen." },
  { id: "galley", title: "Galley", description: "Two straight runs across from each other." },
  { id: "island", title: "Island only", description: "A standalone island or single separate piece." },
  { id: "not_sure", title: "I'm not sure", description: "That's okay. Give us your best guess and Elite will review it." }
];

function LayoutShapeVisual({ preset }: { preset: GuidedLayoutPreset }) {
  const stroke = "rgba(30, 41, 59, 0.55)";
  const fill = "rgba(185, 28, 28, 0.12)";
  const w = 88;
  const h = 56;
  const s = 3;
  switch (preset) {
    case "straight":
      return (
        <svg className="layout-shape-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
          <rect x="8" y="22" width="72" height="14" rx="2" fill={fill} stroke={stroke} strokeWidth={s} />
        </svg>
      );
    case "l_shape":
      return (
        <svg className="layout-shape-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
          <path d="M 12 14 L 12 44 L 76 44 L 76 30 L 28 30 L 28 14 Z" fill={fill} stroke={stroke} strokeWidth={s} strokeLinejoin="round" />
        </svg>
      );
    case "u_shape":
      return (
        <svg className="layout-shape-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
          <path d="M 10 18 L 10 46 L 78 46 L 78 18 L 64 18 L 64 34 L 24 34 L 24 18 Z" fill={fill} stroke={stroke} strokeWidth={s} strokeLinejoin="round" />
        </svg>
      );
    case "galley":
      return (
        <svg className="layout-shape-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
          <rect x="10" y="10" width="68" height="10" rx="2" fill={fill} stroke={stroke} strokeWidth={s} />
          <rect x="10" y="36" width="68" height="10" rx="2" fill={fill} stroke={stroke} strokeWidth={s} />
        </svg>
      );
    case "island":
      return (
        <svg className="layout-shape-svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
          <rect x="22" y="16" width="44" height="26" rx="4" fill={fill} stroke={stroke} strokeWidth={s} />
        </svg>
      );
    case "not_sure":
    default:
      return (
        <svg className="layout-shape-svg layout-shape-svg--unsure" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
          <rect x="12" y="14" width="28" height="12" rx="2" fill={fill} stroke={stroke} strokeWidth={s} opacity={0.7} />
          <rect x="48" y="32" width="28" height="12" rx="2" fill={fill} stroke={stroke} strokeWidth={s} opacity={0.7} />
          <text x="44" y="26" textAnchor="middle" fontSize="22" fill="rgba(30,41,59,0.35)" fontWeight="700" fontFamily="system-ui,sans-serif">
            ?
          </text>
        </svg>
      );
  }
}

type Props = {
  materialGroup: string;
  guidedPreset: GuidedLayoutPreset | null;
  setGuidedPreset: (p: GuidedLayoutPreset | null) => void;
  guidedSimpleForm: GuidedSimpleForm;
  setGuidedSimpleForm: React.Dispatch<React.SetStateAction<GuidedSimpleForm>>;
  /** Form values used for preview (may reflect backsplash choice from a later step). */
  formForPreview: GuidedSimpleForm;
  guidedUseAdvanced: boolean;
  setGuidedUseAdvanced: (v: boolean) => void;
  guidedAdvancedOpen: boolean;
  setGuidedAdvancedOpen: (v: boolean) => void;
  guidedProjectPieces: GuidedPiece[];
  setGuidedProjectPieces: React.Dispatch<React.SetStateAction<GuidedPiece[]>>;
};

export default function GuidedLayoutPublic({
  materialGroup,
  guidedPreset,
  setGuidedPreset,
  guidedSimpleForm,
  setGuidedSimpleForm,
  formForPreview,
  guidedUseAdvanced,
  setGuidedUseAdvanced,
  guidedAdvancedOpen,
  setGuidedAdvancedOpen,
  guidedProjectPieces,
  setGuidedProjectPieces
}: Props) {
  const preview = computeGuidedSimpleAreas(guidedPreset, formForPreview);
  const presetMeta = guidedPreset ? PRESETS.find((p) => p.id === guidedPreset) : null;

  return (
    <div className="guided-layout">
      <h3 className="wizard-step-sub">Which kitchen shape looks closest?</h3>
      <p className="muted small guided-layout-tip">Tip: 10 feet = 120 inches.</p>
      <div className="preset-visual-grid">
        {PRESETS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`preset-visual-card ${guidedPreset === c.id ? "on" : ""}`}
            onClick={() => setGuidedPreset(c.id)}
          >
            <span className="preset-visual-card__diagram" aria-hidden>
              <LayoutShapeVisual preset={c.id} />
            </span>
            <span className="preset-visual-card__title">{c.title}</span>
            <span className="preset-visual-card__desc">{c.description}</span>
          </button>
        ))}
      </div>
      {guidedPreset === "not_sure" ? (
        <p className="callout guided-not-sure">
          No problem — use your best guess. Elite will review everything before final pricing.
        </p>
      ) : null}
      {guidedPreset && guidedPreset !== "not_sure" ? (
        <div className="guided-simple-fields">
          {guidedPreset === "straight" ? (
            <div className="grid3">
              <label>
                Main run length (inches)
                <input
                  value={guidedSimpleForm.mainRunIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, mainRunIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Countertop depth (inches)
                <input
                  value={guidedSimpleForm.counterDepthIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, counterDepthIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
            </div>
          ) : null}
          {guidedPreset === "l_shape" ? (
            <div className="grid3">
              <label>
                Long run length (inches)
                <input
                  value={guidedSimpleForm.longWallIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, longWallIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Second run length (inches)
                <input
                  value={guidedSimpleForm.shortWallIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, shortWallIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Countertop depth (inches)
                <input
                  value={guidedSimpleForm.counterDepthIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, counterDepthIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
            </div>
          ) : null}
          {guidedPreset === "u_shape" ? (
            <div className="grid3">
              <label>
                Back run length (inches)
                <input
                  value={guidedSimpleForm.backWallIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, backWallIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Left run length (inches)
                <input
                  value={guidedSimpleForm.leftWallIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, leftWallIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Right run length (inches)
                <input
                  value={guidedSimpleForm.rightWallIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, rightWallIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Countertop depth (inches)
                <input
                  value={guidedSimpleForm.counterDepthIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, counterDepthIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
            </div>
          ) : null}
          {guidedPreset === "galley" ? (
            <div className="grid3">
              <label>
                First run length (inches)
                <input
                  value={guidedSimpleForm.side1In}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, side1In: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Opposite run length (inches)
                <input
                  value={guidedSimpleForm.side2In}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, side2In: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Countertop depth (inches)
                <input
                  value={guidedSimpleForm.counterDepthIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, counterDepthIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
            </div>
          ) : null}
          {guidedPreset === "island" ? (
            <div className="grid3">
              <label>
                Island length (inches)
                <input
                  value={guidedSimpleForm.islandLengthIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, islandLengthIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Island depth (inches)
                <input
                  value={guidedSimpleForm.islandWidthIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, islandWidthIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {guidedPreset && guidedPreset !== "not_sure" ? (
        <div className="layout-live-preview-card">
          <div className="layout-live-preview-card__header">
            <span className="layout-live-preview-card__shape" aria-hidden>
              <LayoutShapeVisual preset={guidedPreset} />
            </span>
            <div>
              <h4 className="layout-live-preview-card__title">Your kitchen shape</h4>
              <p className="layout-live-preview-card__subtitle muted small">{presetMeta?.title ?? ""}</p>
            </div>
          </div>
          {preview.lines.length ? (
            <ul className="layout-live-preview-runs">
              {preview.lines.map((ln, i) => (
                <li key={i}>{ln}</li>
              ))}
            </ul>
          ) : null}
          <div className="measure-preview-metrics layout-live-preview-metrics">
            <div>
              <span className="muted small">Estimated countertops (sq ft)</span>
              <strong>{preview.counter.toFixed(2)}</strong>
            </div>
            <div>
              <span className="muted small">Estimated backsplash (sq ft)</span>
              <strong>{preview.splash.toFixed(2)}</strong>
            </div>
            <div>
              <span className="muted small">Estimated total surface (sq ft)</span>
              <strong>{(preview.counter + preview.splash).toFixed(2)}</strong>
            </div>
          </div>
          <p className="layout-live-preview-disclaimer">{CONFIDENCE_COPY}</p>
        </div>
      ) : null}

      <label className="check guided-advanced-toggle">
        <input type="checkbox" checked={guidedUseAdvanced} onChange={(e) => setGuidedUseAdvanced(e.target.checked)} />
        Enter piece-by-piece measurements instead of the simple layout above
      </label>
      <details
        className="advanced-pieces-details"
        open={guidedAdvancedOpen}
        onToggle={(e) => setGuidedAdvancedOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>Advanced measurements</summary>
        <p className="muted small">Only use this if you are comfortable entering individual pieces.</p>
        {guidedProjectPieces.map((p) => (
          <div key={p.id} className="piece-row grid3">
            <label>
              Label
              <input
                value={p.name}
                onChange={(e) =>
                  setGuidedProjectPieces((prev) => prev.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))
                }
              />
            </label>
            <label>
              Type
              <select
                value={p.pieceType}
                onChange={(e) =>
                  setGuidedProjectPieces((prev) =>
                    prev.map((x) => (x.id === p.id ? { ...x, pieceType: e.target.value as GuidedPiece["pieceType"] } : x))
                  )
                }
              >
                <option value="counter">Counter</option>
                <option value="splash">Backsplash</option>
                <option value="fhb">Full height</option>
              </select>
            </label>
            <label>
              Shape
              <select
                value={p.shape}
                onChange={(e) =>
                  setGuidedProjectPieces((prev) =>
                    prev.map((x) => (x.id === p.id ? { ...x, shape: e.target.value as GuidedPiece["shape"] } : x))
                  )
                }
              >
                <option value="rect">Rectangle</option>
                <option value="tri">Triangle</option>
              </select>
            </label>
            <label>
              Length (in)
              <input
                type="number"
                value={p.lengthIn || ""}
                onChange={(e) =>
                  setGuidedProjectPieces((prev) =>
                    prev.map((x) => (x.id === p.id ? { ...x, lengthIn: Number(e.target.value) || 0 } : x))
                  )
                }
              />
            </label>
            <label>
              Depth / height (in)
              <input
                type="number"
                value={p.depthIn || ""}
                onChange={(e) =>
                  setGuidedProjectPieces((prev) =>
                    prev.map((x) => (x.id === p.id ? { ...x, depthIn: Number(e.target.value) || 0 } : x))
                  )
                }
              />
            </label>
            <div className="piece-row-actions">
              <button type="button" className="btn secondary" onClick={() => setGuidedProjectPieces((prev) => prev.filter((x) => x.id !== p.id))}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <div className="mode-row piece-add-row">
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              setGuidedProjectPieces((prev) => [
                ...prev,
                {
                  id: `gp-${Math.random().toString(36).slice(2, 9)}`,
                  pieceType: "counter",
                  name: "Counter section",
                  lengthIn: 0,
                  depthIn: 25.5,
                  shape: "rect"
                }
              ])
            }
          >
            + Counter piece
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              setGuidedProjectPieces((prev) => [
                ...prev,
                {
                  id: `gp-${Math.random().toString(36).slice(2, 9)}`,
                  pieceType: "splash",
                  name: "Backsplash",
                  lengthIn: 0,
                  depthIn: STANDARD_BACKSPLASH_HEIGHT_IN,
                  shape: "rect"
                }
              ])
            }
          >
            + Backsplash piece
          </button>
          <button type="button" className="btn secondary" onClick={() => setGuidedProjectPieces(createDefaultRoom(materialGroup).guidedPieces)}>
            Reset to L-shape pieces
          </button>
        </div>
      </details>
    </div>
  );
}
