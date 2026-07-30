/**
 * Studio V2 — approved-estimate → editable Working Draft revision helpers.
 *
 * Uses repository.createSiblingRevisionFrom (R1 stays approved/non-superseded).
 * Does NOT call V1 draft-acquisition / measurement-revision / Takeoff refresh /
 * Takeoff reopen / publish helpers.
 */

import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

/**
 * @param {unknown} value
 */
export function deepCloneStudioV2Json(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {object|null|undefined} row
 */
export function isStudioV2ApprovedSnapshot(row) {
  if (!row) return false;
  const status = String(row.status || "").toLowerCase();
  if (status === STUDIO_ESTIMATE_STATUSES.SUPERSEDED) return false;
  if (status === STUDIO_ESTIMATE_STATUSES.APPROVED) return true;
  return Boolean(row.approval?.approvedAt || row.approvedAt);
}

/**
 * @param {object|null|undefined} row
 */
export function isStudioV2EditableWorkingDraft(row) {
  if (!row || row.approval?.approvedAt || row.approvedAt) return false;
  const st = String(row.status || "").toLowerCase();
  return (
    st === STUDIO_ESTIMATE_STATUSES.DRAFT ||
    st === STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE ||
    st === STUDIO_ESTIMATE_STATUSES.PRICED ||
    st === STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL
  );
}

/**
 * @param {object|null|undefined} source
 * @param {object|null|undefined} next
 * @param {{ priorPublished?: boolean, reason?: string|null }} [opts]
 */
export function buildStudioV2RevisionSummary(source, next, opts = {}) {
  const sourceRev = source?.revision != null ? Number(source.revision) : null;
  const nextRev = next?.revision != null ? Number(next.revision) : null;
  const priorPublished = Boolean(opts.priorPublished);
  return {
    basedOnEstimateId: source?.id || null,
    basedOnRevision: sourceRev,
    newEstimateId: next?.id || null,
    newRevision: nextRev,
    reason: opts.reason ? String(opts.reason).trim().slice(0, 500) : null,
    priorPublished,
    customerLinkNote: priorPublished
      ? "Customer link remains on the last published revision until this revision is approved and republished."
      : null,
    message:
      nextRev != null
        ? `Revision R${nextRev} created. Make changes, recalculate, approve, then republish.`
        : "Editable revision created. Make changes, recalculate, approve, then republish."
  };
}

/**
 * Read-model flags for approved / post-revision UI.
 * @param {object|null|undefined} estimate
 * @param {{ priorPublished?: boolean, basedOn?: { estimateId?: string|null, revision?: number|null }|null }} [opts]
 */
export function buildStudioV2RevisionAffordance(estimate, opts = {}) {
  const approved = isStudioV2ApprovedSnapshot(estimate);
  const editable = isStudioV2EditableWorkingDraft(estimate);
  const priorPublished = Boolean(opts.priorPublished);
  const basedOn = opts.basedOn || null;
  return {
    canCreateRevision: approved && !editable,
    createRevisionLabel: "Create editable revision",
    createRevisionHint:
      "This approved estimate is frozen for history. Create a new revision to make changes.",
    confirmationLabel:
      "I understand this will create a new editable revision and keep the approved version unchanged.",
    currentRevision: estimate?.revision != null ? Number(estimate.revision) : null,
    basedOnEstimateId: basedOn?.estimateId || null,
    basedOnRevision: basedOn?.revision != null ? Number(basedOn.revision) : null,
    priorPublished,
    customerLinkNote: priorPublished
      ? "Customer link remains on the last published revision until this revision is approved and republished."
      : null
  };
}
