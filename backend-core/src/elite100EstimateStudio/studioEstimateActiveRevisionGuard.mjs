/**
 * Active-revision mutation guard (AUDIT-002).
 * Rejects writes targeting a superseded studio_estimates row.
 * Does not auto-replay onto the active revision.
 */

import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

/**
 * @param {object|null|undefined} row
 */
export function isSupersededEstimateRow(row) {
  if (!row || typeof row !== "object") return false;
  if (String(row.status || "").toLowerCase() === STUDIO_ESTIMATE_STATUSES.SUPERSEDED) return true;
  if (row.supersededAt || row.superseded_at) return true;
  return false;
}

/**
 * Build a structured 409 error for stale revision mutations.
 * Only includes org-authorized estimate ids already loaded for this request.
 *
 * @param {{ requestedEstimateId: string, activeEstimateId?: string|null }} ids
 */
export function createEstimateRevisionSupersededError(ids) {
  const requestedEstimateId = String(ids.requestedEstimateId || "").trim() || null;
  const activeEstimateId = ids.activeEstimateId ? String(ids.activeEstimateId).trim() : null;
  const err = new Error("This estimate revision is no longer active.");
  err.statusCode = 409;
  err.code = "estimate_revision_superseded";
  err.activeEstimateId = activeEstimateId;
  err.requestedEstimateId = requestedEstimateId;
  err.details = {
    code: "estimate_revision_superseded",
    message: "This estimate revision is no longer active.",
    activeEstimateId,
    requestedEstimateId
  };
  return err;
}

/**
 * After getById: ensure the row is the current active revision for its intake case.
 * Organization scoping is enforced by the repository getById / getActiveByIntakeCase.
 *
 * @param {{
 *   repository: { getActiveByIntakeCase: Function },
 *   organizationId: string,
 *   row: object
 * }} args
 * @returns {Promise<object>} the same row when active
 */
export async function assertActiveEstimateRevision({ repository, organizationId, row }) {
  if (!row) {
    const err = new Error("Estimate not found");
    err.statusCode = 404;
    err.code = "estimate_not_found";
    throw err;
  }
  let active = null;
  try {
    active = await repository.getActiveByIntakeCase(organizationId, row.intakeCaseId);
  } catch {
    active = null;
  }
  const activeEstimateId =
    active && String(active.organizationId) === String(row.organizationId) ? active.id : null;

  // Prior published/approved rows may remain non-superseded while a newer
  // measurement revision is open — they must not accept estimator mutations.
  const newerSiblingActive =
    active &&
    active.id !== row.id &&
    Number(active.revision || 1) > Number(row.revision || 1);

  if (!isSupersededEstimateRow(row) && !newerSiblingActive) {
    return row;
  }
  throw createEstimateRevisionSupersededError({
    requestedEstimateId: row.id,
    activeEstimateId
  });
}

/**
 * Convenience: load by id then assert active.
 * @returns {Promise<object>}
 */
export async function loadActiveEstimateForMutation({ repository, organizationId, estimateId }) {
  const row = await repository.getById(organizationId, estimateId);
  if (!row) {
    const err = new Error("Estimate not found");
    err.statusCode = 404;
    err.code = "estimate_not_found";
    throw err;
  }
  return assertActiveEstimateRevision({ repository, organizationId, row });
}
