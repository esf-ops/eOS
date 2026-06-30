import React, { forwardRef, useImperativeHandle, useState } from "react";
import type { TakeoffImportPlan, ImportPlanRoom, ImportPlanGroup } from "@takeoff-core/takeoffImportPlanner.mjs";
import { TAKEOFF_BETA_LABEL, TAKEOFF_BETA_IMPORT_CONFIRMATION_TEXT } from "../lib/takeoffBeta";

interface ImportPayloadPreview {
  totals?: {
    countertopSqft?: number;
    standardBacksplashSqft?: number;
    highBacksplashSqft?: number;
    fullHeightBacksplashSqft?: number;
    combinedSqft?: number;
  };
  suggestedAddOns?: Array<{ type: string; label: string; quantity: number; reviewRequired?: boolean }>;
  importWarnings?: Array<{ level?: string; message: string }>;
  unresolvedWarnings?: Array<{ message: string }>;
}

interface Props {
  importPlan: TakeoffImportPlan;
  importPayload?: ImportPayloadPreview | null;
  canImport?: boolean;
  importBlockedReason?: string | null;
  onImport?: () => void;
  onImportCancelled?: () => void;
  onReportIssue?: () => void;
  importStatus?: "idle" | "importing" | "done" | "error";
  importMessage?: string | null;
  workflowStatus?: string;
  /** Hide duplicate import button when parent status card owns the primary CTA. */
  hideImportButton?: boolean;
}

export interface TakeoffImportPreviewHandle {
  openImportConfirm: () => void;
}

function ShapeGroupRow({ group }: { group: ImportPlanGroup }) {
  return (
    <div className="import-group">
      <div className="import-group-header">
        <span className="import-group-name">{group.label}</span>
        <span className="import-shape-chip">{group.shapeType}</span>
        <span className="import-overlap-chip">overlap: {group.overlapMode}</span>
        <span className="import-bs-chip">backsplash: {group.backsplashMode}</span>
      </div>
      <div className="import-pieces">
        {group.pieces.map((p, i) => (
          <div key={i} className="import-piece">
            <span className={`import-piece-type import-piece-type--${p.pieceType}`}>{p.pieceType}</span>
            <span className="import-piece-label">{p.label}</span>
            <span className="import-piece-dim">{p.lengthIn}" × {p.depthIn}"</span>
            <span className="import-piece-sf">
              {((p.lengthIn * p.depthIn) / 144).toFixed(2)} sf
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomImportCard({ room }: { room: ImportPlanRoom }) {
  return (
    <div className="import-room">
      <div className="import-room-header">
        <span className="import-room-name">{room.name}</span>
        {room.roomType && <span className="import-room-type">{room.roomType}</span>}
        <span className="import-calc-mode">{room.calcMode}</span>
        {(room.sourcePages?.length ?? 0) > 0 && (
          <span className="import-page-chip">p. {room.sourcePages!.join(", ")}</span>
        )}
      </div>
      <div className="import-groups">
        {room.guidedShapeGroups.map((g, i) => <ShapeGroupRow key={i} group={g} />)}
      </div>
      {room.warnings.length > 0 && (
        <div className="import-room-warnings">
          {room.warnings.map((w, i) => (
            <div key={i} className="import-room-warning">
              <span className="import-warn-level">{w.level.toUpperCase()}</span>
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TakeoffImportPreview = forwardRef<TakeoffImportPreviewHandle, Props>(function TakeoffImportPreview(
  {
    importPlan,
    importPayload = null,
    canImport = false,
    importBlockedReason = null,
    onImport,
    onImportCancelled,
    onReportIssue,
    importStatus = "idle",
    importMessage = null,
    hideImportButton = false,
  },
  ref
) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  useImperativeHandle(ref, () => ({
    openImportConfirm: () => {
      if (!canImport || !onImport) return;
      setConfirmChecked(false);
      setConfirmOpen(true);
    },
  }), [canImport, onImport]);

  const totals = importPayload?.totals;
  const ctSf = totals?.countertopSqft ?? importPlan.computedSf.countertopExactSf;
  const stdBs = totals?.standardBacksplashSqft ?? importPlan.computedSf.backsplashExactSf;
  const highBs = totals?.highBacksplashSqft ?? 0;
  const fhbSf = totals?.fullHeightBacksplashSqft ?? 0;
  const combined = totals?.combinedSqft ?? importPlan.computedSf.combinedExactSf;

  return (
    <div className="lab-card import-preview eos-section-card">
      <div className={`import-status-bar ${canImport ? "import-status--ready" : "import-status--blocked"}`}>
        <span className="import-status-icon">{canImport ? "✓" : "✗"}</span>
        <span className="import-status-text">
          {canImport
            ? `Import ready — ${importPlan.rooms.length} room${importPlan.rooms.length !== 1 ? "s" : ""} will preload into Internal Estimate as a draft`
            : importBlockedReason ?? importPlan.blockedReason ?? "Resolve approval blockers before import"}
        </span>
      </div>

      {importPlan.rooms.length > 0 && (
        <div className="import-rooms-list">
          {importPlan.rooms.map((room, i) => (
            <RoomImportCard key={i} room={room} />
          ))}
        </div>
      )}

      <div className="import-sf-summary">
        <span className="import-sf-item">
          Countertop: <strong>{ctSf.toFixed(2)} sf</strong>
        </span>
        <span className="import-sf-sep" />
        <span className="import-sf-item">
          Std backsplash: <strong>{stdBs.toFixed(2)} sf</strong>
        </span>
        {highBs > 0 && (
          <>
            <span className="import-sf-sep" />
            <span className="import-sf-item">
              High BS: <strong>{highBs.toFixed(2)} sf</strong>
            </span>
          </>
        )}
        {fhbSf > 0 && (
          <>
            <span className="import-sf-sep" />
            <span className="import-sf-item">
              Full-height BS: <strong>{fhbSf.toFixed(2)} sf</strong>
            </span>
          </>
        )}
        <span className="import-sf-sep" />
        <span className="import-sf-item">
          Combined: <strong>{combined.toFixed(2)} sf</strong>
        </span>
      </div>

      {(importPayload?.suggestedAddOns?.length ?? 0) > 0 && (
        <div className="import-addons-preview">
          <div className="import-plan-warnings-label">Suggested add-ons / cutouts (not material deductions)</div>
          <ul className="import-addons-list">
            {importPayload!.suggestedAddOns!.map((a, i) => (
              <li key={i}>
                <span className="import-addon-type">{a.type}</span> {a.label}
                {a.reviewRequired ? " (review)" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="import-ie-required">
        <div className="import-plan-warnings-label">Internal Estimate will still require</div>
        <ul className="import-ie-required-list">
          <li>Account &amp; project info</li>
          <li>Branch &amp; salesperson</li>
          <li>Pricing mode</li>
          <li>Material group &amp; color</li>
          <li>Add-ons &amp; notes before quote save</li>
        </ul>
      </div>

      {(importPlan.warnings.length > 0 || (importPayload?.importWarnings?.length ?? 0) > 0) && (
        <div className="import-plan-warnings">
          <div className="import-plan-warnings-label">Import warnings</div>
          {[...importPlan.warnings, ...(importPayload?.importWarnings ?? [])].map((w, i) => (
            <div key={i} className="import-plan-warning-row">
              <span className={`import-warn-level import-warn--${w.level ?? "warning"}`}>
                {(w.level ?? "warning").toUpperCase()}
              </span>
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="import-action-row">
        {!hideImportButton ? (
        <button
          type="button"
          className={canImport ? "btn-import-enabled" : "btn-import-disabled"}
          disabled={!canImport || importStatus === "importing" || !onImport}
          onClick={() => {
            if (!canImport || !onImport) return;
            setConfirmChecked(false);
            setConfirmOpen(true);
          }}
        >
          {importStatus === "importing"
            ? "Creating Internal Estimate draft…"
            : "Import to Internal Estimate"}
        </button>
        ) : null}
        {onReportIssue ? (
          <button type="button" className="btn secondary btn-sm" onClick={onReportIssue}>
            Report takeoff issue
          </button>
        ) : null}
        {!canImport && (
          <span className="import-disabled-note">
            Only reviewed and approved takeoffs can import. Raw AI drafts never mutate quotes.
          </span>
        )}
        {importMessage && (
          <span className={`import-result-msg import-result-msg--${importStatus}`}>{importMessage}</span>
        )}
      </div>

      {confirmOpen ? (
        <div className="eos-modal-backdrop takeoff-modal-backdrop" role="presentation" onClick={() => {
          setConfirmOpen(false);
          onImportCancelled?.();
        }}>
          <div className="eos-modal takeoff-modal" role="dialog" aria-labelledby="takeoff-import-confirm-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="takeoff-import-confirm-title">Confirm Internal Estimate import</h3>
            <p className="muted small">{TAKEOFF_BETA_LABEL}</p>
            <label className="takeoff-import-confirm-check">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
              />
              <span>{TAKEOFF_BETA_IMPORT_CONFIRMATION_TEXT}</span>
            </label>
            <div className="eos-modal-actions takeoff-modal-actions">
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => {
                  setConfirmOpen(false);
                  onImportCancelled?.();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary btn-sm"
                disabled={!confirmChecked || importStatus === "importing"}
                onClick={() => {
                  setConfirmOpen(false);
                  onImport?.();
                }}
              >
                Create draft
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default TakeoffImportPreview;
