import EosSectionCard from "@eliteos-ui/EosSectionCard";
import EosStatusPill from "@eliteos-ui/EosStatusPill";
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

function workflowTone(status: string): "success" | "warn" | "info" | "neutral" {
  if (status === "approved_for_import" || status === "imported") return "success";
  if (status.includes("blocked") || status.includes("needs")) return "warn";
  if (status.includes("review")) return "info";
  return "neutral";
}

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

  const modifiers = blockers.length ? " import-readiness--blocked" : " import-readiness--ready";

  return (
    <EosSectionCard className={`import-readiness lab-card${modifiers}`}>
      <div className="import-readiness-header eos-import-readiness-head">
        <EosStatusPill tone={workflowTone(workflowStatus)}>{workflowLabel}</EosStatusPill>
        <span className="muted small">
          {canImport
            ? "Ready to import into Internal Estimate"
            : canApprove
              ? "All blockers resolved — save and approve"
              : `${blockers.length} blocker${blockers.length !== 1 ? "s" : ""} before approval`}
        </span>
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

      {canImport ? (
        <p className="import-readiness-hint muted small" style={{ padding: "0 1rem 1rem" }}>
          Account, project, branch, salesperson, pricing mode, and material/color selections will still be required in Internal Estimate before quote save.
        </p>
      ) : null}
    </EosSectionCard>
  );
}
