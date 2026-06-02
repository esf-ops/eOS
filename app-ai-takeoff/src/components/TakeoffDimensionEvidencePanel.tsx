/**
 * TakeoffDimensionEvidencePanel — compact dimension evidence view for the AI Takeoff Lab.
 *
 * Shows the result of the v5.5 second-pass dimension evidence extraction:
 *   - Summary: X dimensions · Y notes · Z cutouts
 *   - Dimensions table: label, raw text, dims (lengthIn × depthIn), category, confidence
 *   - Notes section (collapsed by default)
 *   - Cutouts section (with business rule note: these are NOT material deductions)
 *
 * This is Lab-internal only. Never shown in Internal Estimate or Quote Library.
 * Helps us see whether the model correctly extracted all labeled dimensions BEFORE
 * judging whether the final TakeoffResult is accurate.
 */
import React from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvidenceDimension {
  id:                  string;
  pageNumber:          number;
  label:               string;
  rawText?:            string | null;
  lengthIn:            number | null;
  depthIn:             number | null;
  confidence:          "high" | "medium" | "low";
  category:            string;
  interpretationNotes?: string[];
}

export interface EvidenceNote {
  pageNumber:  number;
  text:        string;
  category:    string;
  confidence:  "high" | "medium" | "low";
}

export interface EvidenceCutout {
  pageNumber:  number;
  type:        "sink" | "cooktop" | "faucet" | "other";
  label:       string;
  confidence:  "high" | "medium" | "low";
  notes?:      string[];
}

export interface DimensionEvidence {
  schemaVersion:         string;
  evidencePromptVersion?: string;
  sourcePages:           number[];
  dimensions:            EvidenceDimension[];
  notes:                 EvidenceNote[];
  cutouts:               EvidenceCutout[];
  uncertainItems:        string[];
  reviewRequired:        boolean;
}

interface Props {
  evidence: DimensionEvidence;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceClass(c: string): string {
  if (c === "high")   return "ev-conf ev-conf--high";
  if (c === "medium") return "ev-conf ev-conf--medium";
  return "ev-conf ev-conf--low";
}

function categoryLabel(cat: string): string {
  const MAP: Record<string, string> = {
    countertop_run: "CT run",
    island:         "Island",
    backsplash:     "B/S",
    waterfall:      "WF",
    cabinet:        "Cab",
    unknown:        "?",
  };
  return MAP[cat] ?? cat;
}

function categoryClass(cat: string): string {
  const MAP: Record<string, string> = {
    countertop_run: "ev-cat--ct",
    island:         "ev-cat--island",
    backsplash:     "ev-cat--bs",
    waterfall:      "ev-cat--wf",
    cabinet:        "ev-cat--cab",
  };
  return `ev-cat ${MAP[cat] ?? "ev-cat--unknown"}`;
}

function cutoutTypeLabel(t: string): string {
  const MAP: Record<string, string> = {
    sink:    "Sink",
    cooktop: "Cooktop",
    faucet:  "Faucet",
    other:   "Other",
  };
  return MAP[t] ?? t;
}

function noteCategoryLabel(cat: string): string {
  const MAP: Record<string, string> = {
    backsplash:     "B/S",
    cutout:         "Cutout",
    material_color: "Material",
    waterfall:      "WF",
    edge:           "Edge",
    other:          "Note",
  };
  return MAP[cat] ?? cat;
}

function formatDims(d: EvidenceDimension): string {
  if (d.lengthIn != null && d.depthIn != null) {
    return `${d.lengthIn}" × ${d.depthIn}"`;
  }
  if (d.lengthIn != null) return `${d.lengthIn}" × ?`;
  return "–";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DimensionRow({ dim }: { dim: EvidenceDimension }) {
  const hasNotes = dim.interpretationNotes && dim.interpretationNotes.length > 0;

  return (
    <tr className="ev-dim-row">
      <td className="ev-dim-page">p{dim.pageNumber}</td>
      <td className="ev-dim-label">
        <span className="ev-dim-label-text">{dim.label}</span>
        {dim.rawText && (
          <span className="ev-dim-raw" title="Raw text from plan">&ldquo;{dim.rawText}&rdquo;</span>
        )}
        {hasNotes && (
          <div className="ev-dim-notes">
            {dim.interpretationNotes!.map((n, i) => (
              <span key={i} className="ev-dim-note-item">{n}</span>
            ))}
          </div>
        )}
      </td>
      <td className="ev-dim-dims">{formatDims(dim)}</td>
      <td className="ev-dim-cat">
        <span className={categoryClass(dim.category)}>{categoryLabel(dim.category)}</span>
      </td>
      <td className="ev-dim-conf">
        <span className={confidenceClass(dim.confidence)}>{dim.confidence}</span>
      </td>
    </tr>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TakeoffDimensionEvidencePanel({ evidence }: Props) {
  const dimCount    = evidence.dimensions.length;
  const noteCount   = evidence.notes.length;
  const cutoutCount = evidence.cutouts.length;

  const hasUncertain = evidence.uncertainItems.length > 0;

  return (
    <details className="ev-panel lab-card">
      <summary className="ev-summary">
        <span className="ev-title">Dimension evidence</span>
        <span className="ev-summary-line">
          <span className="ev-count">{dimCount} dimension{dimCount !== 1 ? "s" : ""}</span>
          {noteCount > 0 && (
            <span className="ev-count">{noteCount} note{noteCount !== 1 ? "s" : ""}</span>
          )}
          {cutoutCount > 0 && (
            <span className="ev-count ev-count--cutout">{cutoutCount} cutout{cutoutCount !== 1 ? "s" : ""}</span>
          )}
          {evidence.reviewRequired && (
            <span className="ev-review-badge">Review required</span>
          )}
          {evidence.sourcePages.length > 0 && (
            <span className="ev-pages-badge">pages {evidence.sourcePages.join(", ")}</span>
          )}
        </span>
      </summary>

      <div className="ev-body">

        {/* Dimensions table */}
        {dimCount > 0 ? (
          <div className="ev-section">
            <div className="ev-section-header">Extracted dimensions</div>
            <table className="ev-dim-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Label / raw text</th>
                  <th>Dims (L × D)</th>
                  <th>Category</th>
                  <th>Conf</th>
                </tr>
              </thead>
              <tbody>
                {evidence.dimensions.map((dim) => (
                  <DimensionRow key={dim.id ?? `${dim.pageNumber}-${dim.label}`} dim={dim} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ev-empty">No dimensions extracted in evidence pass.</div>
        )}

        {/* Notes section */}
        {noteCount > 0 && (
          <details className="ev-section">
            <summary className="ev-section-header ev-section-toggle">
              Notes ({noteCount})
            </summary>
            <ul className="ev-notes-list">
              {evidence.notes.map((n, i) => (
                <li key={i} className="ev-note-row">
                  <span className="ev-note-cat">{noteCategoryLabel(n.category)}</span>
                  <span className="ev-note-text">&ldquo;{n.text}&rdquo;</span>
                  <span className={confidenceClass(n.confidence)}>{n.confidence}</span>
                  <span className="ev-note-page">p{n.pageNumber}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Cutouts section */}
        {cutoutCount > 0 && (
          <details className="ev-section">
            <summary className="ev-section-header ev-section-toggle">
              Cutouts ({cutoutCount}) — fabrication operations only
            </summary>
            <div className="ev-cutout-rule">
              Cutouts are fabrication add-ons. They do <strong>not</strong> reduce material
              square footage and should never appear in area exclusions.
            </div>
            <ul className="ev-cutouts-list">
              {evidence.cutouts.map((c, i) => (
                <li key={i} className="ev-cutout-row">
                  <span className="ev-cutout-type">{cutoutTypeLabel(c.type)}</span>
                  <span className="ev-cutout-label">{c.label}</span>
                  <span className={confidenceClass(c.confidence)}>{c.confidence}</span>
                  <span className="ev-note-page">p{c.pageNumber}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Uncertain items */}
        {hasUncertain && (
          <details className="ev-section">
            <summary className="ev-section-header ev-section-toggle ev-section-header--warn">
              Uncertain items ({evidence.uncertainItems.length}) — estimator review needed
            </summary>
            <ul className="ev-uncertain-list">
              {evidence.uncertainItems.map((u, i) => (
                <li key={i} className="ev-uncertain-item">{u}</li>
              ))}
            </ul>
          </details>
        )}

      </div>
    </details>
  );
}
