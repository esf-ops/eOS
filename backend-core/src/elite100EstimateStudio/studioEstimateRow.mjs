/**
 * Shared Studio estimate row mapping (memory + Supabase).
 */
import {
  STUDIO_ESTIMATE_STATUSES,
  emptyStudioEstimateScope,
  isStudioEstimateStatus
} from "./studioEstimateTypes.mjs";

export function nowIso() {
  return new Date().toISOString();
}

export function normOrg(organizationId) {
  return String(organizationId ?? "").trim();
}

/**
 * @param {object|null} calc
 */
export function extractCalculationMeta(calc) {
  if (!calc || typeof calc !== "object") {
    return { fingerprint: null, pricingEngine: null, pricingVersion: null };
  }
  return {
    fingerprint: calc.fingerprint ? String(calc.fingerprint) : null,
    pricingEngine: calc.pricingEngine ? String(calc.pricingEngine) : null,
    pricingVersion:
      calc.pricingVersion != null && Number.isFinite(Number(calc.pricingVersion))
        ? Number(calc.pricingVersion)
        : null
  };
}

/**
 * @param {object|null} approval
 */
export function extractApprovalMeta(approval) {
  if (!approval || typeof approval !== "object") {
    return { approvedByUserId: null, approvedAt: null };
  }
  return {
    approvedByUserId: approval.approvedByUserId ? String(approval.approvedByUserId) : null,
    approvedAt: approval.approvedAt ? String(approval.approvedAt) : null
  };
}

/**
 * Normalize an in-memory / service-layer estimate row.
 * @param {object} input
 */
export function buildStudioEstimateRow(input) {
  const ts = nowIso();
  const calc = input.calculationSnapshot ?? null;
  const approval = input.approval ?? null;
  const calcMeta = extractCalculationMeta(calc);
  const approvalMeta = extractApprovalMeta(approval);
  return {
    id: input.id,
    organizationId: normOrg(input.organizationId),
    intakeCaseId: String(input.intakeCaseId ?? "").trim(),
    takeoffJobId: input.takeoffJobId ? String(input.takeoffJobId).trim() : null,
    sourceTakeoffResultId: input.sourceTakeoffResultId
      ? String(input.sourceTakeoffResultId)
      : null,
    status: isStudioEstimateStatus(input.status)
      ? input.status
      : STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL,
    revision: Math.max(1, Number(input.revision) || 1),
    scope: { ...emptyStudioEstimateScope(), ...(input.scope || {}) },
    calculationSnapshot: calc,
    calculationFingerprint: calcMeta.fingerprint,
    pricingEngine: calcMeta.pricingEngine,
    pricingVersion: calcMeta.pricingVersion,
    approval,
    staleReason: input.staleReason ?? null,
    createdByUserId: input.createdByUserId ? String(input.createdByUserId) : null,
    updatedByUserId: input.updatedByUserId
      ? String(input.updatedByUserId)
      : input.createdByUserId
        ? String(input.createdByUserId)
        : null,
    approvedByUserId: approvalMeta.approvedByUserId,
    createdAt: input.createdAt || ts,
    updatedAt: input.updatedAt || ts,
    approvedAt: approvalMeta.approvedAt,
    supersededAt: input.supersededAt ?? null
  };
}

/**
 * Apply a service patch onto a row (shared semantics for memory + supabase).
 * @param {object} row
 * @param {Record<string, unknown>} patch
 * @param {string|null} actorUserId
 */
export function applyStudioEstimatePatch(row, patch, actorUserId = null) {
  const next = { ...row };
  if (patch.status && isStudioEstimateStatus(patch.status)) next.status = patch.status;
  if (patch.scope && typeof patch.scope === "object") {
    next.scope = { ...next.scope, ...patch.scope };
  }
  if ("calculationSnapshot" in patch) {
    next.calculationSnapshot = patch.calculationSnapshot;
    const meta = extractCalculationMeta(patch.calculationSnapshot);
    next.calculationFingerprint = meta.fingerprint;
    next.pricingEngine = meta.pricingEngine;
    next.pricingVersion = meta.pricingVersion;
  }
  if ("approval" in patch) {
    next.approval = patch.approval;
    const meta = extractApprovalMeta(patch.approval);
    next.approvedByUserId = meta.approvedByUserId;
    next.approvedAt = meta.approvedAt;
  }
  if ("staleReason" in patch) next.staleReason = patch.staleReason;
  if ("sourceTakeoffResultId" in patch) {
    next.sourceTakeoffResultId = patch.sourceTakeoffResultId
      ? String(patch.sourceTakeoffResultId)
      : null;
  }
  if ("takeoffJobId" in patch && patch.takeoffJobId) {
    next.takeoffJobId = String(patch.takeoffJobId);
  }
  if (typeof patch.revisionBump === "boolean" && patch.revisionBump) {
    next.revision = Number(next.revision || 1) + 1;
  }
  if (patch.revision != null && Number.isFinite(Number(patch.revision))) {
    next.revision = Math.max(1, Number(patch.revision));
  }
  if ("supersededAt" in patch) next.supersededAt = patch.supersededAt;
  if (patch.status === STUDIO_ESTIMATE_STATUSES.SUPERSEDED && !next.supersededAt) {
    next.supersededAt = nowIso();
  }
  next.updatedByUserId = actorUserId ? String(actorUserId) : next.updatedByUserId;
  next.updatedAt = nowIso();
  return next;
}

export function dbRowToStudioEstimate(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    intakeCaseId: row.intake_case_id,
    takeoffJobId: row.takeoff_job_id ?? null,
    sourceTakeoffResultId: row.source_takeoff_result_id ?? null,
    status: row.status,
    revision: Number(row.revision) || 1,
    scope: row.scope_json && typeof row.scope_json === "object" ? row.scope_json : emptyStudioEstimateScope(),
    calculationSnapshot: row.calculation_snapshot_json ?? null,
    calculationFingerprint: row.calculation_fingerprint ?? null,
    pricingEngine: row.pricing_engine ?? null,
    pricingVersion: row.pricing_version ?? null,
    approval: row.approval_json ?? null,
    staleReason: row.stale_reason ?? null,
    createdByUserId: row.created_by_user_id ?? null,
    updatedByUserId: row.updated_by_user_id ?? null,
    approvedByUserId: row.approved_by_user_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at ?? null,
    supersededAt: row.superseded_at ?? null
  };
}

export function studioEstimateToDbInsert(row) {
  return {
    id: row.id,
    organization_id: row.organizationId,
    intake_case_id: row.intakeCaseId,
    takeoff_job_id: row.takeoffJobId,
    source_takeoff_result_id: row.sourceTakeoffResultId,
    status: row.status,
    revision: row.revision,
    scope_json: row.scope,
    calculation_snapshot_json: row.calculationSnapshot,
    calculation_fingerprint: row.calculationFingerprint,
    pricing_engine: row.pricingEngine,
    pricing_version: row.pricingVersion,
    approval_json: row.approval,
    stale_reason: row.staleReason,
    created_by_user_id: row.createdByUserId,
    updated_by_user_id: row.updatedByUserId,
    approved_by_user_id: row.approvedByUserId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    approved_at: row.approvedAt,
    superseded_at: row.supersededAt
  };
}

export function studioEstimateToDbUpdate(row) {
  const insert = studioEstimateToDbInsert(row);
  delete insert.id;
  delete insert.organization_id;
  delete insert.intake_case_id;
  delete insert.created_at;
  delete insert.created_by_user_id;
  return insert;
}
