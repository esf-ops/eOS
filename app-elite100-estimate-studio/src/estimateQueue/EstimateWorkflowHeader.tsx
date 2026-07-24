/**
 * Compact workflow status — one next action for the active Studio estimate revision.
 */
import React from "react";

export type WorkspaceWorkflow = {
  currentStage?: string | null;
  nextRequiredAction?: string | null;
  nextRequiredActionLabel?: string | null;
  nextRequiredActionDetail?: string | null;
  completedSteps?: string[];
  laterSteps?: string[];
  staleReason?: string | null;
  activeRevision?: number;
  estimateId?: string | null;
  status?: string | null;
  manualScopeCurrent?: boolean;
  calculationCurrent?: boolean;
  approvalCurrent?: boolean;
  display?: {
    calculationLabel?: string;
    approvalLabel?: string;
    manualScopeLabel?: string;
    statusBanner?: string | null;
  };
  historicalApproval?: {
    label?: string;
    exactInternalTotal?: number | null;
    revision?: number | null;
  } | null;
  allowedActions?: string[];
};

type Props = {
  workflow: WorkspaceWorkflow | null;
  transientError?: string | null;
  onPrimaryAction?: (action: string) => void;
  onRefreshStatus?: () => void;
  onRetry?: (() => void) | null;
  busy?: boolean;
};

const COMPLETED_LABELS: Record<string, string> = {
  manual_scope_draft: "Manual Scope draft",
  manual_scope_confirmed: "Manual scope confirmed",
  pricing_saved: "Pricing Setup saved",
  calculated: "Calculated",
  approved: "Approved",
  project_named: "Project named",
  published: "Digital Estimate published"
};

const LATER_LABELS: Record<string, string> = {
  confirm_manual_scope: "Confirm Manual Scope",
  calculate: "Calculate",
  approve: "Approve",
  publish: "Publish",
  configure_digital_estimate: "Configure Digital Estimate",
  replace_publication: "Replace publication"
};

export default function EstimateWorkflowHeader({
  workflow,
  transientError,
  onPrimaryAction,
  onRefreshStatus,
  onRetry,
  busy = false
}: Props) {
  if (!workflow && !transientError) return null;
  const next = workflow?.nextRequiredAction || null;
  const completed = (workflow?.completedSteps || [])
    .map((k) => COMPLETED_LABELS[k] || k)
    .filter(Boolean);
  const later = (workflow?.laterSteps || [])
    .map((k) => LATER_LABELS[k] || k)
    .filter(Boolean);

  return (
    <section className="eq-workflow-header" data-testid="eq-workflow-header" aria-label="Estimate workflow">
      {transientError ? (
        <div className="eq-state eq-state--warn" role="alert" data-testid="eq-workflow-transient-error">
          <strong>Service temporarily unavailable</strong>
          <p>{transientError}</p>
          <p className="eq-muted">
            Your changes were not confirmed by the server. Nothing was published or sent.
          </p>
          <div className="eq-action-row">
            {onRetry ? (
              <button
                type="button"
                className="eq-btn-primary"
                data-testid="eq-workflow-retry"
                disabled={busy}
                onClick={() => onRetry()}
              >
                Retry
              </button>
            ) : null}
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="eq-workflow-refresh-status"
              disabled={busy}
              onClick={() => onRefreshStatus?.()}
            >
              Refresh status
            </button>
          </div>
        </div>
      ) : null}

      {workflow ? (
        <>
          <div className="eq-workflow-current">
            <p className="eq-muted">Current step</p>
            <h3 data-testid="eq-workflow-next-label">
              {workflow.nextRequiredActionLabel || "Continue"}
            </h3>
            {workflow.nextRequiredActionDetail ? (
              <p className="eq-muted" data-testid="eq-workflow-next-detail">
                {workflow.nextRequiredActionDetail}
              </p>
            ) : null}
            <p className="eq-cell-meta" data-testid="eq-workflow-revision">
              Active revision {workflow.activeRevision ?? 1}
              {workflow.status ? ` · ${workflow.status}` : ""}
            </p>
          </div>

          {completed.length ? (
            <div data-testid="eq-workflow-completed">
              <p className="eq-muted">Completed</p>
              <ul>
                {completed.map((label) => (
                  <li key={label}>✓ {label}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {later.length ? (
            <div data-testid="eq-workflow-later">
              <p className="eq-muted">Later</p>
              <ul>
                {later.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {workflow.historicalApproval?.label ? (
            <p className="eq-footnote" data-testid="eq-workflow-historical-approval">
              Historical: {workflow.historicalApproval.label}
            </p>
          ) : null}

          {next && onPrimaryAction ? (
            <div className="eq-action-row">
              <button
                type="button"
                className="eq-btn-primary"
                data-testid="eq-workflow-primary-action"
                disabled={busy}
                onClick={() => onPrimaryAction(next)}
              >
                {workflow.nextRequiredActionLabel || "Continue"}
              </button>
              <button
                type="button"
                className="eq-btn-ghost"
                data-testid="eq-workflow-refresh"
                disabled={busy}
                onClick={() => onRefreshStatus?.()}
              >
                Refresh status
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
