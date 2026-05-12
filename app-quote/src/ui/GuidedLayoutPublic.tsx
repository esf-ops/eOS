import React from "react";
import { STANDARD_BACKSPLASH_HEIGHT_IN } from "../lib/measurementEngine";
import {
  CONFIDENCE_COPY,
  computeGuidedSimpleAreas,
  defaultGuidedSimpleForm,
  type GuidedLayoutPreset,
  type GuidedSimpleForm
} from "../lib/guidedHomeowner";
import type { GuidedPiece } from "../lib/quoteTypes";
import { createDefaultRoom } from "../lib/prototypeQuoteMath";

const PRESETS: Array<{ id: GuidedLayoutPreset; title: string }> = [
  { id: "straight", title: "Straight run" },
  { id: "l_shape", title: "L-shape" },
  { id: "u_shape", title: "U-shape" },
  { id: "galley", title: "Galley" },
  { id: "island", title: "Island only" },
  { id: "not_sure", title: "I'm not sure" }
];

type Props = {
  materialGroup: string;
  guidedPreset: GuidedLayoutPreset | null;
  setGuidedPreset: (p: GuidedLayoutPreset | null) => void;
  guidedSimpleForm: GuidedSimpleForm;
  setGuidedSimpleForm: React.Dispatch<React.SetStateAction<GuidedSimpleForm>>;
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
  guidedUseAdvanced,
  setGuidedUseAdvanced,
  guidedAdvancedOpen,
  setGuidedAdvancedOpen,
  guidedProjectPieces,
  setGuidedProjectPieces
}: Props) {
  const preview = computeGuidedSimpleAreas(guidedPreset, guidedSimpleForm);
  return (
    <div className="guided-layout">
      <h3 className="wizard-step-sub">Which layout is closest to your kitchen?</h3>
      <div className="preset-card-grid">
        {PRESETS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`preset-shape-card ${guidedPreset === c.id ? "on" : ""}`}
            onClick={() => setGuidedPreset(c.id)}
          >
            {c.title}
          </button>
        ))}
      </div>
      {guidedPreset === "not_sure" ? (
        <p className="callout guided-not-sure">
          No problem. Use your best guess — Elite will verify before final pricing.
        </p>
      ) : null}
      {guidedPreset && guidedPreset !== "not_sure" ? (
        <div className="guided-simple-fields">
          {guidedPreset === "straight" ? (
            <div className="grid3">
              <label>
                Main counter length (feet)
                <input
                  value={guidedSimpleForm.mainRunFt}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, mainRunFt: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Backsplash height (inches)
                <input
                  value={guidedSimpleForm.splashHeightIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, splashHeightIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Counter depth (inches)
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
                Long wall (feet)
                <input
                  value={guidedSimpleForm.longWallFt}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, longWallFt: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Short wall (feet)
                <input
                  value={guidedSimpleForm.shortWallFt}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, shortWallFt: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Backsplash height (inches)
                <input
                  value={guidedSimpleForm.splashHeightIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, splashHeightIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Counter depth (inches)
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
                Back wall (feet)
                <input
                  value={guidedSimpleForm.backWallFt}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, backWallFt: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Left side (feet)
                <input
                  value={guidedSimpleForm.leftWallFt}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, leftWallFt: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Right side (feet)
                <input
                  value={guidedSimpleForm.rightWallFt}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, rightWallFt: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Backsplash height (inches)
                <input
                  value={guidedSimpleForm.splashHeightIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, splashHeightIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Counter depth (inches)
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
                Side 1 (feet)
                <input
                  value={guidedSimpleForm.side1Ft}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, side1Ft: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Side 2 (feet)
                <input
                  value={guidedSimpleForm.side2Ft}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, side2Ft: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Backsplash height (inches)
                <input
                  value={guidedSimpleForm.splashHeightIn}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, splashHeightIn: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Counter depth (inches)
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
                Island length (feet)
                <input
                  value={guidedSimpleForm.islandLengthFt}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, islandLengthFt: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
              <label>
                Island width (feet)
                <input
                  value={guidedSimpleForm.islandWidthFt}
                  onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, islandWidthFt: e.target.value }))}
                  inputMode="decimal"
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="measure-preview-card">
        <h4 className="measure-preview-title">Size preview</h4>
        <div className="measure-preview-metrics">
          <div>
            <span className="muted small">Countertops (sq ft)</span>
            <strong>{preview.counter.toFixed(2)}</strong>
          </div>
          <div>
            <span className="muted small">Backsplash (sq ft)</span>
            <strong>{preview.splash.toFixed(2)}</strong>
          </div>
          <div>
            <span className="muted small">Total (sq ft)</span>
            <strong>{(preview.counter + preview.splash).toFixed(2)}</strong>
          </div>
        </div>
        {preview.lines.length ? (
          <ul className="measure-preview-lines">
            {preview.lines.map((ln, i) => (
              <li key={i}>{ln}</li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Choose a layout and enter sizes to see a simple preview.</p>
        )}
        <p className="confidence-label">{CONFIDENCE_COPY}</p>
      </div>
      <label className="check guided-advanced-toggle">
        <input type="checkbox" checked={guidedUseAdvanced} onChange={(e) => setGuidedUseAdvanced(e.target.checked)} />
        Use piece-by-piece measurements instead of the simple layout above
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
          <button
            type="button"
            className="btn secondary"
            onClick={() => setGuidedProjectPieces(createDefaultRoom(materialGroup).guidedPieces)}
          >
            Reset to L-shape pieces
          </button>
        </div>
      </details>
    </div>
  );
}
