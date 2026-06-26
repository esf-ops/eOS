import React from "react";

export interface ApprovalBlocker {
  code: string;
  message: string;
  path?: string | null;
  category?: string;
}

interface Props {
  blockers: ApprovalBlocker[];
  canApprove: boolean;
  canImport: boolean;
  workflowStatus: string;
  workflowLabel: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  dimensions: "Missing dimensions",
  backsplash: "Backsplash scope",
  rooms: "Room completeness",
  evidence: "Evidence reconciliation",
  ai_flag: "AI flags",
  qa: "QA gate",
  validation: "Validation",
  fabrication: "Fabrication rules",
  reference: "Reference totals",
  review: "Review required",
  waterfall: "Waterfall panels",
};

export default function TakeoffImportReadinessPanel({
  blockers,
  canApprove,
  canImport,
  workflowStatus,
  workflowLabel,
}: Props) {
  const grouped = blockers.reduce<Record<string, ApprovalBlocker[]>>((acc, b) => {
    const cat = b.category ?? "review";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(b);
    return acc;
  }, {});

  return (
    <div className={`import-readiness lab-card${blockers.length ? " import-readiness--blocked" : " import-readiness--ready"}`}>
      <div className="import-readiness-header">
        <span className={`import-readiness-chip import-readiness-chip--${workflowStatus.replace(/_/g, "-")}`}>
          {workflowLabel}
        </span>
        {canImport ? (
          <span className="import-readiness-ready-text">Ready to import into Internal Estimate</span>
        ) : canApprove ? (
          <span className="import-readiness-ready-text">All blockers resolved — save and approve</span>
        ) : (
          <span className="import-readiness-blocked-text">
            {blockers.length} blocker{blockers.length !== 1 ? "s" : ""} before approval
          </span>
        )}
      </div>

      {blockers.length > 0 && (
        <div className="import-readiness-blockers">
          <p className="import-readiness-blockers-title">What blocks import</p>
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="import-readiness-group">
              <div className="import-readiness-group-label">{CATEGORY_LABELS[cat] ?? cat}</div>
              <ul className="import-readiness-list">
                {items.map((b, i) => (
                  <li key={`${b.code}-${i}`}>{b.message}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {canImport && (
        <p className="import-readiness-hint muted small">
          Account, project, branch, salesperson, pricing mode, and material/color selections will still be required in Internal Estimate before quote save.
        </p>
      )}
    </div>
  );
}
