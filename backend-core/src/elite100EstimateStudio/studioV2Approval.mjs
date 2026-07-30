/**
 * Studio V2 Slice E — Working Draft → Approved Snapshot readiness + summaries.
 *
 * Intentionally does NOT call V1 studioEstimateService.approve — that path runs
 * refreshTakeoffGate / autoConfirmManualScopeIfValid with mutation side effects.
 * Persistence uses repository.update with the same approval payload shape.
 */

import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import {
  collectUnresolvedItems,
  scopeFingerprint
} from "./studioEstimatePricing.mjs";
import { assessStudioV2ScopeEditability } from "./studioV2ScopeEditor.mjs";
import { buildStudioV2CalculationResult } from "./studioV2WorkingDraft.mjs";

function str(v, max = 240) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lightweight scope gaps that make approval unsafe (no pricing math).
 * @param {object|null|undefined} scope
 */
export function describeStudioV2ApprovalScopeGaps(scope) {
  /** @type {Array<{ code: string, message: string }>} */
  const gaps = [];
  const rooms = Array.isArray(scope?.rooms)
    ? scope.rooms.filter((r) => r && r.included !== false)
    : [];
  if (!rooms.length) {
    gaps.push({ code: "no_included_rooms", message: "Add at least one included room." });
    return gaps;
  }
  let hasPiece = false;
  for (const room of rooms) {
    const pieces = Array.isArray(room.pieces)
      ? room.pieces.filter((p) => p && p.included !== false)
      : [];
    if (pieces.length) hasPiece = true;
  }
  if (!hasPiece) {
    gaps.push({
      code: "no_included_pieces",
      message: "Add at least one included piece before approving."
    });
  }
  return gaps;
}

/**
 * Assess whether the Working Draft can be approved into an immutable snapshot.
 * @param {object|null|undefined} row
 * @returns {{
 *   allowed: boolean,
 *   code: string|null,
 *   message: string|null,
 *   blockers: Array<{ code: string, message: string }>,
 *   status: string|null,
 *   revision: number|null,
 *   calculationCurrent: boolean,
 *   priced: boolean
 * }}
 */
export function assessStudioV2ApprovalReadiness(row) {
  if (!row) {
    return {
      allowed: false,
      code: "no_estimate",
      message: "No estimate exists for this case yet.",
      blockers: [{ code: "no_estimate", message: "No estimate exists for this case yet." }],
      status: null,
      revision: null,
      calculationCurrent: false,
      priced: false
    };
  }

  const editability = assessStudioV2ScopeEditability(row);
  const status = String(row.status || "").toLowerCase();
  const revision = row.revision != null ? Number(row.revision) : null;
  const calc = row.calculationSnapshot || row.calculation || null;
  const fingerprint = calc?.fingerprint ? String(calc.fingerprint) : "";
  const priced = Boolean(fingerprint);
  const staleReason = str(row.staleReason, 400);
  const calculationCurrent =
    priced &&
    !staleReason &&
    status === STUDIO_ESTIMATE_STATUSES.PRICED;

  /** @type {Array<{ code: string, message: string }>} */
  const blockers = [];

  if (!editability.editable) {
    const code = editability.code || "draft_required";
    const message =
      editability.message ||
      (code === "approved_snapshot_readonly"
        ? "This approved or published estimate is read-only."
        : "An editable working draft is required before approval.");
    blockers.push({ code, message });
    return {
      allowed: false,
      code,
      message,
      blockers,
      status,
      revision,
      calculationCurrent: false,
      priced
    };
  }

  if (!priced) {
    blockers.push({
      code: "not_priced",
      message: "Calculate the estimate before approving."
    });
    return {
      allowed: false,
      code: "not_priced",
      message: "Calculate the estimate before approving.",
      blockers,
      status,
      revision,
      calculationCurrent: false,
      priced: false
    };
  }

  if (!calculationCurrent) {
    blockers.push({
      code: "calculation_stale",
      message: staleReason || "Calculation is stale. Recalculate before approving."
    });
    return {
      allowed: false,
      code: "calculation_stale",
      message: staleReason || "Calculation is stale. Recalculate before approving.",
      blockers,
      status,
      revision,
      calculationCurrent: false,
      priced: true
    };
  }

  const scope = row.scope && typeof row.scope === "object" ? row.scope : {};
  const scopeGaps = describeStudioV2ApprovalScopeGaps(scope);
  for (const g of scopeGaps) blockers.push(g);

  const unresolved = collectUnresolvedItems(scope);
  if (unresolved.length && !scope.unresolvedManualReview) {
    for (const u of unresolved) {
      blockers.push({
        code: String(u.code || "unresolved_items"),
        message: String(u.message || "Unresolved commercial items block approval")
      });
    }
  }

  const calcUnresolved = Array.isArray(calc?.unresolvedItems) ? calc.unresolvedItems : [];
  for (const u of calcUnresolved) {
    blockers.push({
      code: String(u?.code || "unresolved_items"),
      message: String(u?.message || "Unresolved item blocks approval")
    });
  }

  if (blockers.length) {
    return {
      allowed: false,
      code: "approval_blocked",
      message: blockers[0].message || "Approval is blocked.",
      blockers,
      status,
      revision,
      calculationCurrent: true,
      priced: true
    };
  }

  return {
    allowed: true,
    code: null,
    message: null,
    blockers: [],
    status,
    revision,
    calculationCurrent: true,
    priced: true
  };
}

/**
 * Build approval payload matching V1 approve shape (no pricing math).
 * @param {object} row
 * @param {{ actorUserId?: string|null, approvalNote?: string|null }} opts
 */
export function buildStudioV2ApprovalPayload(row, opts = {}) {
  const calc = row.calculationSnapshot || {};
  const note = str(opts.approvalNote, 500);
  return {
    approvedAt: new Date().toISOString(),
    approvedByUserId: opts.actorUserId || null,
    calculationFingerprint: calc.fingerprint || null,
    sourceTakeoffResultId: row.sourceTakeoffResultId || null,
    scopeFingerprint: scopeFingerprint(row.scope),
    exactInternalTotal: calc.totals?.exactInternalTotal ?? null,
    customerDisplayTotal: calc.totals?.customerDisplayTotal ?? null,
    ...(note ? { approvalNote: note } : {})
  };
}

/**
 * @param {object|null|undefined} estimate
 */
export function buildStudioV2ApprovedSummary(estimate) {
  const approval = estimate?.approval && typeof estimate.approval === "object" ? estimate.approval : {};
  const calc = buildStudioV2CalculationResult(estimate);
  const status = String(estimate?.status || "").toLowerCase();
  const approved = status === STUDIO_ESTIMATE_STATUSES.APPROVED || Boolean(approval.approvedAt);
  return {
    approved,
    estimateId: estimate?.id || null,
    revision: estimate?.revision != null ? Number(estimate.revision) : null,
    status: status || null,
    approvedAt: approval.approvedAt || estimate?.approvedAt || null,
    approvedBy: approval.approvedByUserId || null,
    approvalNote: approval.approvalNote || null,
    calculationFingerprint: approval.calculationFingerprint || null,
    customerDisplayTotal:
      num(approval.customerDisplayTotal) ??
      calc.total ??
      null,
    calculation: calc,
    revisionEditPlaceholder:
      "Create revision/edit flow will be added in a later slice."
  };
}
