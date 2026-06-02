/**
 * TakeoffPageInventoryPanel — compact page classification panel for the AI Takeoff Lab.
 *
 * Shows the result of the first-pass page inventory:
 *   - Recommended measurement pages
 *   - Pages to ignore
 *   - Per-page table: type, relevance, dimension presence, summary
 *   - Visible dimensions/notes per page (collapsed by default)
 *
 * This is Lab-internal only. Never shown in Internal Estimate or Quote Library.
 * Helps verify the model is using the correct page before judging extraction quality.
 */
import React, { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VisibleDimension {
  label:      string;
  value:      string;
  unit?:      string;
  confidence: "high" | "medium" | "low";
  rawText?:   string;
}

export interface VisibleNote {
  text:       string;
  category:   string;
  confidence: "high" | "medium" | "low";
}

export interface InventoryPage {
  pageNumber:                   number;
  pageType:                     string;
  measurementRelevance:         "high" | "medium" | "low" | "none";
  orientation:                  string;
  containsCountertopDimensions: boolean;
  containsBacksplashNotes:      boolean;
  containsCutoutNotes:          boolean;
  containsMaterialColorNotes:   boolean;
  summary:                      string;
  visibleDimensions:            VisibleDimension[];
  visibleNotes:                 VisibleNote[];
  recommendedForTakeoff:        boolean;
  reviewNotes:                  string[];
}

export interface PageInventory {
  schemaVersion:               string;
  inventoryPromptVersion?:     string;
  pages:                       InventoryPage[];
  recommendedMeasurementPages: number[];
  pagesToIgnore:               number[];
  overallNotes:                string[];
}

interface Props {
  inventory: PageInventory;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_TYPE_LABELS: Record<string, string> = {
  hand_sketch:    "Sketch",
  cabinet_plan:   "Cabinet plan",
  elevation:      "Elevation",
  email_context:  "Email/context",
  rendering:      "Rendering",
  spec:           "Spec sheet",
  floor_plan:     "Floor plan",
  irrelevant:     "Irrelevant",
  unknown:        "Unknown",
};

const PAGE_TYPE_COLORS: Record<string, string> = {
  hand_sketch:    "inv-badge--sketch",
  cabinet_plan:   "inv-badge--plan",
  elevation:      "inv-badge--elevation",
  email_context:  "inv-badge--email",
  rendering:      "inv-badge--rendering",
  spec:           "inv-badge--spec",
  floor_plan:     "inv-badge--floor",
  irrelevant:     "inv-badge--irrelevant",
  unknown:        "inv-badge--unknown",
};

const RELEVANCE_COLORS: Record<string, string> = {
  high:   "inv-rel--high",
  medium: "inv-rel--medium",
  low:    "inv-rel--low",
  none:   "inv-rel--none",
};

function Yesno({ value }: { value: boolean }) {
  return value
    ? <span className="inv-yesno inv-yesno--yes">✓</span>
    : <span className="inv-yesno inv-yesno--no">—</span>;
}

// ── Page row: table entry + expandable evidence ───────────────────────────────

function InventoryPageRow({
  page,
  isRecommended,
  isIgnored,
}: {
  page:          InventoryPage;
  isRecommended: boolean;
  isIgnored:     boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasEvidence =
    (page.visibleDimensions?.length ?? 0) > 0 ||
    (page.visibleNotes?.length ?? 0) > 0 ||
    (page.reviewNotes?.length ?? 0) > 0;

  return (
    <div className={`inv-page-row ${isRecommended ? "inv-page-row--recommended" : ""} ${isIgnored ? "inv-page-row--ignored" : ""}`}>
      <div className="inv-page-main">
        <span className="inv-page-number">Pg {page.pageNumber}</span>

        {isRecommended && <span className="inv-marker inv-marker--recommended">Measure</span>}
        {isIgnored      && <span className="inv-marker inv-marker--ignored">Ignore</span>}

        <span className={`inv-badge ${PAGE_TYPE_COLORS[page.pageType] ?? "inv-badge--unknown"}`}>
          {PAGE_TYPE_LABELS[page.pageType] ?? page.pageType}
        </span>

        <span className={`inv-rel ${RELEVANCE_COLORS[page.measurementRelevance] ?? ""}`}>
          {page.measurementRelevance}
        </span>

        <span className="inv-presence" title="Contains CT dimensions">
          <span className="inv-presence-label">CT</span>
          <Yesno value={page.containsCountertopDimensions} />
        </span>
        <span className="inv-presence" title="Contains BS notes">
          <span className="inv-presence-label">BS</span>
          <Yesno value={page.containsBacksplashNotes} />
        </span>

        <span className="inv-page-summary">{page.summary}</span>

        {hasEvidence && (
          <button
            type="button"
            className="inv-expand-btn"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse evidence" : "Show evidence"}
          >
            {open ? "▲ hide" : "▼ details"}
          </button>
        )}
      </div>

      {open && hasEvidence && (
        <div className="inv-page-evidence">
          {page.visibleDimensions?.length > 0 && (
            <div className="inv-evidence-group">
              <div className="inv-evidence-label">Visible dimensions</div>
              {page.visibleDimensions.map((d, i) => (
                <div key={i} className="inv-evidence-row">
                  <span className="inv-evidence-name">{d.label}</span>
                  <span className="inv-evidence-value">{d.value}{d.unit ? ` ${d.unit}` : ""}</span>
                  <span className={`inv-evidence-confidence inv-confidence--${d.confidence}`}>
                    {d.confidence}
                  </span>
                  {d.rawText && d.rawText !== d.value && (
                    <span className="inv-evidence-raw">raw: "{d.rawText}"</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {page.visibleNotes?.length > 0 && (
            <div className="inv-evidence-group">
              <div className="inv-evidence-label">Visible notes</div>
              {page.visibleNotes.map((n, i) => (
                <div key={i} className="inv-evidence-row">
                  <span className={`inv-badge inv-badge--note-${n.category}`}>{n.category}</span>
                  <span className="inv-evidence-value">"{n.text}"</span>
                  <span className={`inv-evidence-confidence inv-confidence--${n.confidence}`}>
                    {n.confidence}
                  </span>
                </div>
              ))}
            </div>
          )}

          {page.reviewNotes?.length > 0 && (
            <div className="inv-evidence-group">
              <div className="inv-evidence-label">Review notes</div>
              {page.reviewNotes.map((note, i) => (
                <div key={i} className="inv-review-note">{note}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TakeoffPageInventoryPanel({ inventory }: Props) {
  const recSet     = new Set(inventory.recommendedMeasurementPages ?? []);
  const ignoredSet = new Set(inventory.pagesToIgnore ?? []);

  const pageCount  = inventory.pages.length;
  const recCount   = recSet.size;

  return (
    <details className="inv-panel lab-card" open>
      <summary className="inv-panel-summary">
        <span className="inv-panel-title">Page inventory</span>
        <span className="inv-panel-meta">
          {pageCount} page{pageCount !== 1 ? "s" : ""} ·{" "}
          <span className="inv-meta-recommended">
            {recCount} measurement{recCount !== 1 ? "" : ""} page{recCount !== 1 ? "s" : ""}
          </span>
          {inventory.inventoryPromptVersion && (
            <span className="inv-meta-version">{inventory.inventoryPromptVersion}</span>
          )}
        </span>
      </summary>

      <div className="inv-panel-body">
        {/* Recommended + ignored summary */}
        <div className="inv-summary-row">
          <span className="inv-summary-label">Measure:</span>
          <span className="inv-summary-value">
            {recSet.size > 0
              ? Array.from(recSet).join(", ")
              : <em>none identified</em>
            }
          </span>
          {ignoredSet.size > 0 && (
            <>
              <span className="inv-summary-label inv-summary-label--ignore">Ignore:</span>
              <span className="inv-summary-value">{Array.from(ignoredSet).join(", ")}</span>
            </>
          )}
        </div>

        {/* Page rows */}
        <div className="inv-page-list">
          {inventory.pages.map((page) => (
            <InventoryPageRow
              key={page.pageNumber}
              page={page}
              isRecommended={recSet.has(page.pageNumber)}
              isIgnored={ignoredSet.has(page.pageNumber)}
            />
          ))}
        </div>

        {/* Overall notes */}
        {inventory.overallNotes?.length > 0 && (
          <div className="inv-overall-notes">
            <div className="inv-evidence-label">Overall notes</div>
            {inventory.overallNotes.map((note, i) => (
              <div key={i} className="inv-review-note">{note}</div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
