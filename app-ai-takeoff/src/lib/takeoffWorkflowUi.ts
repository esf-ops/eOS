/**
 * Estimator-facing workflow step, status, and CTA derivation for AI Takeoff.
 * UI-only — maps existing backend workflow state to a single coherent screen model.
 */

export const WORKFLOW_STEPS = ["upload", "generate", "review", "approve", "import"] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export const WORKFLOW_STEP_LABELS: Record<WorkflowStep, string> = {
  upload: "Upload",
  generate: "Generate",
  review: "Review",
  approve: "Approve",
  import: "Import",
};

export type UnifiedWorkflowStatus =
  | "draft"
  | "needs_review"
  | "review_complete"
  | "approved_for_import"
  | "imported";

export const UNIFIED_STATUS_LABELS: Record<UnifiedWorkflowStatus, string> = {
  draft: "Draft",
  needs_review: "Needs review",
  review_complete: "Review complete",
  approved_for_import: "Approved for import",
  imported: "Imported",
};

/** Map backend workflow status to unified estimator-facing label. */
export function unifiedStatusLabel(
  workflowStatus: string,
  opts: { approvalStale?: boolean } = {}
): string {
  if (opts.approvalStale) return UNIFIED_STATUS_LABELS.needs_review;
  switch (workflowStatus) {
    case "ai_draft":
      return UNIFIED_STATUS_LABELS.draft;
    case "needs_review":
      return UNIFIED_STATUS_LABELS.needs_review;
    case "review_complete":
      return UNIFIED_STATUS_LABELS.review_complete;
    case "approved_for_import":
      return UNIFIED_STATUS_LABELS.approved_for_import;
    case "imported":
      return UNIFIED_STATUS_LABELS.imported;
    default:
      return UNIFIED_STATUS_LABELS.needs_review;
  }
}

export function deriveCurrentWorkflowStep(input: {
  hasPlanFile: boolean;
  hasActiveSource: boolean;
  workflowStatus: string;
  approvalStale: boolean;
}): WorkflowStep {
  const { hasPlanFile, hasActiveSource, workflowStatus, approvalStale } = input;

  if (workflowStatus === "imported") return "import";
  if (workflowStatus === "approved_for_import" && !approvalStale) return "import";
  if (hasActiveSource) return "review";
  if (hasPlanFile) return "generate";
  return "upload";
}

export function isWorkflowStepComplete(
  step: WorkflowStep,
  input: {
    hasPlanFile: boolean;
    hasActiveSource: boolean;
    workflowStatus: string;
    approvalStale: boolean;
  }
): boolean {
  switch (step) {
    case "upload":
      return input.hasPlanFile;
    case "generate":
      return input.hasActiveSource;
    case "review":
      return (
        input.workflowStatus === "approved_for_import" ||
        input.workflowStatus === "imported" ||
        input.workflowStatus === "review_complete"
      );
    case "approve":
      return (
        (input.workflowStatus === "approved_for_import" || input.workflowStatus === "imported") &&
        !input.approvalStale
      );
    case "import":
      return input.workflowStatus === "imported";
    default:
      return false;
  }
}

export function stepTaskTitle(step: WorkflowStep): string {
  switch (step) {
    case "upload":
      return "Upload plan";
    case "generate":
      return "Generate AI takeoff";
    case "review":
      return "Review rooms & dimensions";
    case "approve":
      return "Approve takeoff";
    case "import":
      return "Import to Internal Estimate";
    default:
      return "AI Takeoff";
  }
}

export interface PrimaryCtaConfig {
  label: string;
  action: "upload" | "generate" | "save" | "approve" | "import" | "none";
  disabled?: boolean;
  loading?: boolean;
  title?: string;
}

export function deriveWorkflowGuidance(input: {
  step: WorkflowStep;
  workflowStatus: string;
  approvalStale: boolean;
  blockerCount: number;
  unresolvedWorkbenchCount: number;
  hasBlockingValidation: boolean;
  hasQaBlocker: boolean;
  canApprove: boolean;
  canImport: boolean;
  saveStatus: string;
  approveStatus: string;
  importStatus: string;
  showApprovedInUi: boolean;
}): {
  statusLabel: string;
  statusHint: string;
  nextAction: string;
  primaryCta: PrimaryCtaConfig;
} {
  const {
    step,
    workflowStatus,
    approvalStale,
    blockerCount,
    unresolvedWorkbenchCount,
    hasBlockingValidation,
    hasQaBlocker,
    canApprove,
    canImport,
    saveStatus,
    approveStatus,
    importStatus,
    showApprovedInUi,
  } = input;

  const statusLabel = unifiedStatusLabel(workflowStatus, { approvalStale });
  const reviewItems = blockerCount + unresolvedWorkbenchCount;

  switch (step) {
    case "upload":
      return {
        statusLabel: UNIFIED_STATUS_LABELS.draft,
        statusHint: "Attach a plan PDF to start a takeoff workspace.",
        nextAction: "Upload your cabinet or measurement plan to begin.",
        primaryCta: { label: "Upload plan", action: "upload" },
      };

    case "generate":
      return {
        statusLabel: UNIFIED_STATUS_LABELS.draft,
        statusHint: "Plan attached — run AI extraction when ready.",
        nextAction: "Generate an AI measurement draft from the uploaded plan.",
        primaryCta: { label: "Generate AI takeoff", action: "generate" },
      };

    case "review": {
      const statusHint =
        reviewItems > 0
          ? `${reviewItems} item${reviewItems !== 1 ? "s" : ""} need review before approval.`
          : canApprove && !hasBlockingValidation && !hasQaBlocker
            ? "Ready to approve."
            : hasBlockingValidation || hasQaBlocker
              ? "Fix items before approval."
              : "Confirm each room's scope and dimensions.";
      const nextAction =
        canApprove && reviewItems === 0 && !hasBlockingValidation && !hasQaBlocker
          ? "All rooms verified — approve this takeoff to unlock import."
          : reviewItems > 0
            ? "Fix or acknowledge highlighted items, then save reviewed dimensions."
            : "AI found these rooms. Confirm the scope, verify dimensions, and add anything missing before approval.";
      const readyToApprove =
        canApprove && reviewItems === 0 && !hasBlockingValidation && !hasQaBlocker && !showApprovedInUi;
      return {
        statusLabel: readyToApprove ? UNIFIED_STATUS_LABELS.review_complete : statusLabel,
        statusHint,
        nextAction,
        primaryCta: readyToApprove
          ? {
              label: approveStatus === "approving" ? "Approving…" : "Approve takeoff",
              action: "approve",
              disabled: approveStatus === "approving" || saveStatus === "saving",
              loading: approveStatus === "approving",
            }
          : {
              label: saveStatus === "saving" ? "Saving…" : "Save reviewed dimensions",
              action: "save",
              disabled: saveStatus === "saving" || approveStatus === "approving",
              loading: saveStatus === "saving",
            },
      };
    }

    case "approve":
      return {
        statusLabel: approvalStale ? UNIFIED_STATUS_LABELS.needs_review : statusLabel,
        statusHint: approvalStale
          ? "Approved takeoff has unsaved edits — save and re-approve."
          : blockerCount > 0
            ? `${blockerCount} blocker${blockerCount !== 1 ? "s" : ""} remain before approval.`
            : "Review complete — approve to unlock import.",
        nextAction: approvalStale
          ? "Save reviewed dimensions, then approve again."
          : "Approve this takeoff to create an import-ready snapshot.",
        primaryCta: {
          label: approveStatus === "approving" ? "Approving…" : "Approve takeoff",
          action: "approve",
          disabled: !canApprove || approveStatus === "approving" || showApprovedInUi,
          loading: approveStatus === "approving",
        },
      };

    case "import":
      return {
        statusLabel,
        statusHint:
          workflowStatus === "imported"
            ? "Draft Internal Estimate created from this takeoff."
            : canImport
              ? "Approved — import verified measurements into Internal Estimate."
              : "Resolve any stale edits before importing.",
        nextAction:
          workflowStatus === "imported"
            ? "Open Internal Estimate to complete account, project, and material fields."
            : "Import creates an Internal Estimate draft after approval.",
        primaryCta: {
          label: importStatus === "importing" ? "Importing…" : "Import to Internal Estimate",
          action: "import",
          disabled: !canImport || importStatus === "importing" || workflowStatus === "imported",
          loading: importStatus === "importing",
        },
      };

    default:
      return {
        statusLabel,
        statusHint: "",
        nextAction: "",
        primaryCta: { label: "Continue", action: "none" },
      };
  }
}

/** Group approval blockers for the Items to review panel. */
export const REVIEW_GROUP_ORDER = [
  "measurements",
  "rooms",
  "backsplash",
  "reference",
  "addons",
] as const;

export type ReviewItemGroup = (typeof REVIEW_GROUP_ORDER)[number];

export const REVIEW_GROUP_LABELS: Record<ReviewItemGroup, string> = {
  measurements: "Measurements",
  rooms: "Rooms",
  backsplash: "Backsplash",
  reference: "Reference totals",
  addons: "Suggested add-ons",
};

const BLOCKER_CATEGORY_MAP: Record<string, ReviewItemGroup> = {
  dimensions: "measurements",
  review: "measurements",
  evidence: "measurements",
  validation: "measurements",
  fabrication: "measurements",
  waterfall: "measurements",
  qa: "measurements",
  ai_flag: "measurements",
  rooms: "rooms",
  backsplash: "backsplash",
  reference: "reference",
};

export interface ReviewItem {
  message: string;
  code?: string;
}

export function groupReviewItems(
  blockers: Array<{ code: string; message: string; category?: string }>,
  suggestedAddOns: Array<{ label: string; reviewRequired?: boolean }> = []
): Record<ReviewItemGroup, ReviewItem[]> {
  const grouped: Record<ReviewItemGroup, ReviewItem[]> = {
    measurements: [],
    rooms: [],
    backsplash: [],
    reference: [],
    addons: [],
  };

  for (const b of blockers) {
    const group = BLOCKER_CATEGORY_MAP[b.category ?? "review"] ?? "measurements";
    grouped[group].push({ message: b.message, code: b.code });
  }

  for (const addon of suggestedAddOns) {
    if (addon.reviewRequired) {
      grouped.addons.push({ message: `${addon.label} — confirm before import` });
    }
  }

  return grouped;
}

export function totalReviewItemCount(grouped: Record<ReviewItemGroup, ReviewItem[]>): number {
  return REVIEW_GROUP_ORDER.reduce((sum, key) => sum + grouped[key].length, 0);
}
