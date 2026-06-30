import React from "react";
import type { TakeoffImportReceiptMeta } from "./TakeoffImportReceiptPanel";

interface Props {
  open: boolean;
  onClose: () => void;
  meta: TakeoffImportReceiptMeta;
  takeoffLabUrl?: string;
}

export default function TakeoffSourcePlanDrawer({ open, onClose, meta, takeoffLabUrl }: Props) {
  if (!open) return null;

  const takeoffHref =
    meta.takeoffJobId && takeoffLabUrl
      ? `${takeoffLabUrl}/?takeoffJobId=${encodeURIComponent(meta.takeoffJobId)}`
      : null;

  return (
    <>
      <button type="button" className="ie-takeoff-drawer-backdrop" aria-label="Close source plan drawer" onClick={onClose} />
      <aside className="ie-takeoff-drawer" role="complementary" aria-label="Source takeoff context">
        <div className="ie-takeoff-drawer-head">
          <h2 className="ie-takeoff-drawer-title">Source plan context</h2>
          <button type="button" className="btn secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted small">
          Keep this drawer open while you edit imported measurements. Open the source takeoff in another tab to compare plan pages.
        </p>
        <dl className="ie-takeoff-drawer-grid">
          <div><dt>Plan</dt><dd>{meta.sourceFileName ?? "—"}</dd></div>
          <div><dt>Takeoff job</dt><dd>{meta.takeoffJobId ?? "—"}</dd></div>
          <div><dt>Approved by</dt><dd>{meta.approvedBy ?? "—"}</dd></div>
        </dl>
        <div className="ie-takeoff-drawer-actions">
          {takeoffHref ? (
            <a className="btn primary btn-sm" href={takeoffHref} target="_blank" rel="noopener noreferrer">
              Open source takeoff (new tab)
            </a>
          ) : (
            <p className="muted small">Set VITE_AI_TAKEOFF_HEAD_URL to enable deep links.</p>
          )}
        </div>
        {(meta.suggestedAddOns?.length ?? 0) > 0 ? (
          <div className="ie-takeoff-drawer-section">
            <p className="ie-takeoff-drawer-section-title">Suggested cutouts</p>
            <ul className="muted small">
              {meta.suggestedAddOns!.map((a, i) => (
                <li key={`${a.label}-${i}`}>{a.label}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
    </>
  );
}
