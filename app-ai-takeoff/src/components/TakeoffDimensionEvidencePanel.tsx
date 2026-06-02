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

export interface EvidenceReferenceTotal {
  id:               string;
  pageNumber?:      number | null;
  rawText:          string;
  label?:           string | null;
  countertopSf?:    number | null;
  backsplashSf?:    number | null;
  combinedSf?:      number | null;
  noBacksplash?:    boolean;
  backsplashHeightIn?: number | null;
  confidence:       "high" | "medium" | "low";
  notes?:           string[];
}

export interface DimensionEvidence {
  schemaVersion:         string;
  evidencePromptVersion?: string;
  sourcePages:           number[];
  dimensions:            EvidenceDimension[];
  notes:                 EvidenceNote[];
  cutouts:               EvidenceCutout[];
  referenceTotals?:      EvidenceReferenceTotal[];
  uncertainItems:        string[];
  reviewRequired:        boolean;
}

/** Minimal computed measurements type for reconciliation display. */
interface TakeoffComputedPartial {
  countertopExactSf: number;
  backsplashExactSf: number;
  combinedExactSf:   number;
}

/** Minimal diagnostic for coverage warnings display. */
interface TakeoffDiagnosticPartial {
  code:    string;
  level:   string;
  message: string;
}

interface Props {
  evidence:    DimensionEvidence;
  computed?:   TakeoffComputedPartial | null;
  validation?: { diagnostics: TakeoffDiagnosticPartial[] } | null;
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

const REF_CT_TOLERANCE       = 2;
const REF_BS_TOLERANCE       = 1;
const REF_COMBINED_TOLERANCE = 2;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function reconcileStatus(
  refVal: number | null | undefined,
  computedVal: number,
  tolerance: number
): "pass" | "mismatch" | null {
  if (refVal == null) return null;
  return Math.abs(round2(refVal) - round2(computedVal)) <= tolerance ? "pass" : "mismatch";
}

export default function TakeoffDimensionEvidencePanel({ evidence, computed, validation }: Props) {
  const dimCount    = evidence.dimensions.length;
  const noteCount   = evidence.notes.length;
  const cutoutCount = evidence.cutouts.length;
  const refTotals   = evidence.referenceTotals ?? [];

  const hasUncertain = evidence.uncertainItems.length > 0;

  const coverageWarnings = (validation?.diagnostics ?? []).filter(
    (d) => d.code === "EVIDENCE_DIMENSION_NOT_USED"
  );

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
          {refTotals.length > 0 && (
            <span className="ev-count ev-count--ref">{refTotals.length} ref total{refTotals.length !== 1 ? "s" : ""}</span>
          )}
          {coverageWarnings.length > 0 && (
            <span className="ev-count ev-count--warn">{coverageWarnings.length} coverage warning{coverageWarnings.length !== 1 ? "s" : ""}</span>
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

        {/* Reference totals + reconciliation (v5.6) */}
        {refTotals.length > 0 && (
          <details className="ev-section ev-section--ref" open>
            <summary className="ev-section-header ev-section-toggle ev-section-header--ref">
              Reference totals ({refTotals.length}) — visible estimator sqft callouts
            </summary>
            <div className="ev-ref-rule">
              Visible reference totals are high-priority reconciliation evidence but are
              not final pricing authority. eliteOS computed values from structured dimensions remain authoritative.
            </div>
            <table className="ev-ref-table">
              <thead>
                <tr>
                  <th>Raw text</th>
                  <th>CT ref</th>
                  <th>BS ref</th>
                  <th>No BS</th>
                  <th>Page</th>
                  <th>Conf</th>
                  {computed && <th>CT computed</th>}
                  {computed && <th>BS computed</th>}
                  {computed && <th>Status</th>}
                </tr>
              </thead>
              <tbody>
                {refTotals.map((ref) => {
                  const ctStatus  = computed ? reconcileStatus(ref.countertopSf, computed.countertopExactSf, REF_CT_TOLERANCE) : null;
                  const bsStatus  = computed ? reconcileStatus(ref.backsplashSf,  computed.backsplashExactSf, REF_BS_TOLERANCE) : null;
                  const noBsConflict = ref.noBacksplash && computed && computed.backsplashExactSf > 0;

                  const overallStatus =
                    ctStatus === "mismatch" || bsStatus === "mismatch" || noBsConflict
                      ? "mismatch"
                      : ctStatus === "pass" || bsStatus === "pass"
                        ? "pass"
                        : null;

                  return (
                    <tr key={ref.id ?? ref.rawText} className="ev-ref-row">
                      <td className="ev-ref-raw">&ldquo;{ref.rawText}&rdquo;</td>
                      <td className="ev-ref-ct">{ref.countertopSf != null ? `${ref.countertopSf} sf` : "—"}</td>
                      <td className="ev-ref-bs">{ref.backsplashSf != null ? `${ref.backsplashSf} sf` : "—"}</td>
                      <td className="ev-ref-nobs">{ref.noBacksplash ? <span className="ev-nobs-badge">No B/S</span> : "—"}</td>
                      <td className="ev-ref-page">{ref.pageNumber != null ? `p${ref.pageNumber}` : "—"}</td>
                      <td><span className={confidenceClass(ref.confidence)}>{ref.confidence}</span></td>
                      {computed && (
                        <td className="ev-ref-computed">
                          {round2(computed.countertopExactSf)} sf
                          {ref.countertopSf != null && (
                            <span className={`ev-ref-delta ${ctStatus === "mismatch" ? "ev-ref-delta--warn" : "ev-ref-delta--ok"}`}>
                              {" "}({round2(computed.countertopExactSf - ref.countertopSf) >= 0 ? "+" : ""}{round2(computed.countertopExactSf - ref.countertopSf).toFixed(1)})
                            </span>
                          )}
                        </td>
                      )}
                      {computed && (
                        <td className="ev-ref-computed">
                          {round2(computed.backsplashExactSf)} sf
                          {ref.backsplashSf != null && !ref.noBacksplash && (
                            <span className={`ev-ref-delta ${bsStatus === "mismatch" ? "ev-ref-delta--warn" : "ev-ref-delta--ok"}`}>
                              {" "}({round2(computed.backsplashExactSf - ref.backsplashSf) >= 0 ? "+" : ""}{round2(computed.backsplashExactSf - ref.backsplashSf).toFixed(1)})
                            </span>
                          )}
                          {noBsConflict && (
                            <span className="ev-ref-delta ev-ref-delta--warn"> ⚠ conflicts with No B/S</span>
                          )}
                        </td>
                      )}
                      {computed && (
                        <td>
                          {overallStatus === "pass" && <span className="ev-status-badge ev-status-badge--pass">Pass</span>}
                          {overallStatus === "mismatch" && <span className="ev-status-badge ev-status-badge--warn">Needs review</span>}
                          {overallStatus === null && <span className="ev-status-badge ev-status-badge--neutral">—</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        )}

        {/* Evidence coverage warnings (v5.6) */}
        {coverageWarnings.length > 0 && (
          <details className="ev-section ev-section--coverage" open>
            <summary className="ev-section-header ev-section-toggle ev-section-header--warn">
              Coverage warnings ({coverageWarnings.length}) — high-confidence dimensions not used in final runs
            </summary>
            <div className="ev-coverage-rule">
              These high-confidence evidence dimensions were extracted in the evidence pass but
              have no matching run in the final TakeoffResult. This may indicate the model
              dropped or merged these dimensions during TakeoffResult assembly.
              Estimator review required.
            </div>
            <ul className="ev-coverage-list">
              {coverageWarnings.map((w, i) => (
                <li key={i} className="ev-coverage-item">
                  <span className="ev-coverage-warn-icon">⚠</span>
                  <span className="ev-coverage-msg">{w.message}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

      </div>
    </details>
  );
}
