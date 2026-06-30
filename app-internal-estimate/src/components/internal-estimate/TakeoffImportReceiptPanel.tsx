import React, { useState } from "react";
import { TAKEOFF_BETA_LABEL } from "../../lib/takeoffBeta";

export type TakeoffImportReceiptMeta = {
  status?: "active" | "detached" | string;
  schemaVersion?: string | null;
  takeoffJobId?: string | null;
  takeoffSnapshotId?: string | null;
  sourceFileName?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  importedAt?: string | null;
  importedBy?: string | null;
  importedRoomIds?: string[];
  totals?: {
    countertopSqft?: number;
    standardBacksplashSqft?: number;
    highBacksplashSqft?: number;
    fullHeightBacksplashSqft?: number;
    combinedSqft?: number;
  };
  suggestedAddOns?: Array<{ type: string; label: string; quantity?: number }>;
  importWarnings?: Array<{ message: string }>;
  snapshot?: unknown;
  auditEvents?: Array<{ type: string; at?: string; userId?: string | null; userEmail?: string | null }>;
};

interface Props {
  meta: TakeoffImportReceiptMeta;
  takeoffLabUrl?: string;
  quoteStatus?: string;
  onDetach?: () => void;
  detachBusy?: boolean;
  detachError?: string | null;
  onOpenSourceDrawer?: () => void;
  onReportIssue?: () => void;
}

function fmtSf(n?: number) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Number(n).toFixed(2)} sf`;
}

function fmtWhen(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function TakeoffImportReceiptPanel({
  meta,
  takeoffLabUrl,
  quoteStatus = "draft",
  onDetach,
  detachBusy = false,
  detachError = null,
  onOpenSourceDrawer,
  onReportIssue,
}: Props) {
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const detached = meta.status === "detached";
  const canDetach = quoteStatus === "draft" && !detached && Boolean(onDetach);

  return (
    <div className={`ie-takeoff-receipt${detached ? " ie-takeoff-receipt--detached" : ""}`} role="status">
      {!detached ? (
        <div className="ie-takeoff-beta-banner" role="note">
          <span className="ie-takeoff-beta-badge">Beta</span>
          <span>{TAKEOFF_BETA_LABEL}</span>
        </div>
      ) : null}
      <div className="ie-takeoff-receipt-head">
        <div>
          <p className="ie-takeoff-receipt-title">
            {detached ? "Takeoff import detached" : "Imported from reviewed AI Takeoff"}
          </p>
          <p className="ie-takeoff-receipt-sub muted small">
            Measurements came from an approved takeoff snapshot — not raw AI output.
          </p>
        </div>
        {canDetach ? (
          <button type="button" className="btn secondary btn-sm btn-danger-quiet" disabled={detachBusy} onClick={onDetach}>
            {detachBusy ? "Removing…" : "Remove imported takeoff"}
          </button>
        ) : null}
      </div>

      <dl className="ie-takeoff-receipt-grid">
        <div><dt>Plan</dt><dd>{meta.sourceFileName ?? "—"}</dd></div>
        <div><dt>Approved by</dt><dd>{meta.approvedBy ?? "—"}</dd></div>
        <div><dt>Approved at</dt><dd>{fmtWhen(meta.approvedAt)}</dd></div>
        <div><dt>Takeoff job</dt><dd>{meta.takeoffJobId ?? "—"}</dd></div>
        <div><dt>Snapshot</dt><dd>{meta.schemaVersion ?? "—"} {meta.takeoffSnapshotId ? `(${meta.takeoffSnapshotId.slice(0, 8)}…)` : ""}</dd></div>
        <div><dt>Imported</dt><dd>{fmtWhen(meta.importedAt)}</dd></div>
      </dl>

      <div className="ie-takeoff-receipt-totals">
        <span>CT {fmtSf(meta.totals?.countertopSqft)}</span>
        <span>Std BS {fmtSf(meta.totals?.standardBacksplashSqft)}</span>
        <span>High BS {fmtSf(meta.totals?.highBacksplashSqft)}</span>
        <span>FHBS {fmtSf(meta.totals?.fullHeightBacksplashSqft)}</span>
        <span>Combined {fmtSf(meta.totals?.combinedSqft)}</span>
      </div>

      {(meta.suggestedAddOns?.length ?? 0) > 0 && (
        <p className="muted small ie-takeoff-receipt-addons">
          {meta.suggestedAddOns!.length} suggested cutout/add-on note(s) from takeoff — review in Add-ons section.
        </p>
      )}

      <div className="ie-takeoff-receipt-actions">
        {onOpenSourceDrawer ? (
          <button type="button" className="btn primary btn-sm" onClick={onOpenSourceDrawer}>
            Review plan side-by-side
          </button>
        ) : null}
        {onReportIssue ? (
          <button type="button" className="btn secondary btn-sm" onClick={onReportIssue}>
            Report takeoff issue
          </button>
        ) : null}
        {meta.takeoffJobId && takeoffLabUrl ? (
          <a className="btn secondary btn-sm" href={`${takeoffLabUrl}/?takeoffJobId=${encodeURIComponent(meta.takeoffJobId)}`} target="_blank" rel="noopener noreferrer">
            Open source takeoff
          </a>
        ) : null}
        {meta.snapshot ? (
          <button type="button" className="btn secondary btn-sm" onClick={() => setSnapshotOpen((v) => !v)}>
            {snapshotOpen ? "Hide snapshot" : "View import snapshot"}
          </button>
        ) : null}
      </div>

      {snapshotOpen && meta.snapshot ? (
        <details className="ie-takeoff-snapshot-drawer" open>
          <summary className="muted small">takeoff_import_v1 snapshot (read-only)</summary>
          <pre className="ie-takeoff-snapshot-json">{JSON.stringify(meta.snapshot, null, 2)}</pre>
        </details>
      ) : null}

      {detachError ? <p className="error small ie-takeoff-receipt-error">{detachError}</p> : null}
      {!detached ? (
        <p className="muted small ie-takeoff-receipt-hint">
          Complete account, project, branch, salesperson, pricing mode, and material selections before calculate/save.
        </p>
      ) : null}
    </div>
  );
}
