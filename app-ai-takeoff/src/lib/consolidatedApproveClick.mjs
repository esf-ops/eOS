/**
 * Deterministic consolidated approve-click helpers (pure — no React).
 * One button → optional window.confirm → one request with confirmAdvisories: true.
 *
 * @module consolidatedApproveClick
 */

/**
 * Build the immutable approval request body after the user has confirmed.
 * Always acknowledges advisories so the server never returns
 * approval_advisory_confirmation_required for this path.
 *
 * @param {{ takeoffResult: unknown, reviewState: unknown }} parts
 */
export function buildConfirmedApproveBody(parts) {
  return Object.freeze({
    takeoffResult: parts.takeoffResult,
    reviewState: parts.reviewState,
    confirmAdvisories: true,
    acceptAdvisoryWarnings: true
  });
}

/**
 * Whether to show the advisory confirmation dialog before the API call.
 * @param {{ blockingCount?: number, advisoryCount?: number }} counts
 */
export function shouldConfirmAdvisoriesDialog(counts = {}) {
  const blocking = Number(counts.blockingCount ?? 0) || 0;
  const advisory = Number(counts.advisoryCount ?? 0) || 0;
  return blocking === 0 && advisory > 0;
}

/**
 * Dialog copy for N advisory warnings.
 * @param {number} advisoryCount
 */
export function advisoryConfirmDialogMessage(advisoryCount) {
  const n = Number(advisoryCount) || 0;
  return `This takeoff has ${n} advisory warning${n === 1 ? "" : "s"}. Approve and continue to Estimate Scope?`;
}

/**
 * Primary button label.
 * @param {{ approveStatus: string, advisoryCount: number, blockingCount: number }} input
 */
export function approveButtonLabel(input) {
  if (input.approveStatus === "approving") return "Approving…";
  if (input.approveStatus === "approved") return "Approved";
  if (
    (Number(input.blockingCount) || 0) === 0 &&
    (Number(input.advisoryCount) || 0) > 0
  ) {
    const n = Number(input.advisoryCount) || 0;
    return `Approve with ${n} advisory warning${n === 1 ? "" : "s"}`;
  }
  return "Approve Takeoff & Build Estimate";
}

/**
 * Safe diagnostic summary from last approval attempt (no secrets).
 * @param {{
 *   confirmAdvisories?: boolean,
 *   httpStatus?: number|null,
 *   reviewStatus?: string|null,
 *   errorCode?: string|null,
 *   message?: string|null,
 *   blockingCount?: number,
 *   advisoryCount?: number
 * }} d
 */
export function formatApprovalDiagnostic(d = {}) {
  return {
    confirmAdvisories: Boolean(d.confirmAdvisories),
    httpStatus: d.httpStatus ?? null,
    reviewStatus: d.reviewStatus ?? null,
    errorCode: d.errorCode ?? null,
    message: d.message ? String(d.message).slice(0, 240) : null,
    blockingCount: Number(d.blockingCount ?? 0) || 0,
    advisoryCount: Number(d.advisoryCount ?? 0) || 0
  };
}

/**
 * Run the deterministic approve click path.
 *
 * @param {{
 *   blockingCount: number,
 *   advisoryCount: number,
 *   takeoffResult: unknown,
 *   reviewState: unknown,
 *   confirmFn: (message: string) => boolean,
 *   approveFn: (body: ReturnType<typeof buildConfirmedApproveBody>) => Promise<object>
 * }} opts
 */
export async function runConsolidatedApproveClick(opts) {
  const blockingCount = Number(opts.blockingCount ?? 0) || 0;
  const advisoryCount = Number(opts.advisoryCount ?? 0) || 0;

  if (blockingCount > 0) {
    return {
      ok: false,
      cancelled: false,
      skipped: true,
      reason: "blocking",
      requestBody: null,
      response: null,
      diagnostic: formatApprovalDiagnostic({
        confirmAdvisories: false,
        httpStatus: null,
        errorCode: "blocked_locally",
        message: "Resolve blocking issues before approval.",
        blockingCount,
        advisoryCount
      })
    };
  }

  if (shouldConfirmAdvisoriesDialog({ blockingCount, advisoryCount })) {
    const confirmed = Boolean(opts.confirmFn(advisoryConfirmDialogMessage(advisoryCount)));
    if (!confirmed) {
      return {
        ok: false,
        cancelled: true,
        skipped: false,
        reason: "user_cancelled",
        requestBody: null,
        response: null,
        diagnostic: formatApprovalDiagnostic({
          confirmAdvisories: false,
          httpStatus: null,
          errorCode: "cancelled",
          message: "Approval cancelled.",
          blockingCount,
          advisoryCount
        })
      };
    }
  }

  const requestBody = buildConfirmedApproveBody({
    takeoffResult: opts.takeoffResult,
    reviewState: opts.reviewState
  });

  try {
    const response = await opts.approveFn(requestBody);
    return {
      ok: true,
      cancelled: false,
      skipped: false,
      reason: null,
      requestBody,
      response,
      diagnostic: formatApprovalDiagnostic({
        confirmAdvisories: true,
        httpStatus: 200,
        reviewStatus: response?.reviewStatus ?? "approved",
        errorCode: null,
        message: null,
        blockingCount: 0,
        advisoryCount:
          response?.advisoryCount ??
          (Array.isArray(response?.advisory) ? response.advisory.length : advisoryCount)
      })
    };
  } catch (err) {
    const status = Number(err?.status ?? err?.statusCode ?? 0) || null;
    const body = err?.body && typeof err.body === "object" ? err.body : {};
    const hard = Array.isArray(body.hardBlockers) ? body.hardBlockers : [];
    const adv = Array.isArray(body.advisory) ? body.advisory : [];
    return {
      ok: false,
      cancelled: false,
      skipped: false,
      reason: "api_error",
      requestBody,
      response: body,
      diagnostic: formatApprovalDiagnostic({
        confirmAdvisories: true,
        httpStatus: status,
        reviewStatus: body.reviewStatus ?? null,
        errorCode: body.code ?? err?.code ?? "error",
        message: body.error ?? err?.message ?? "Approval failed",
        blockingCount: hard.length,
        advisoryCount: adv.length || advisoryCount
      })
    };
  }
}
