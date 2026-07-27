/**
 * Studio estimate lifecycle closeout — status vocabulary and pure helpers.
 * Estimate commercial status (draft/priced/approved) stays on studio_estimates.status.
 * Publication status stays on quote_publications.
 * This module is the operational lifecycle overlay.
 */

export const STUDIO_LIFECYCLE_VERSION = "studio_lifecycle_closeout_v1";

/** Canonical operational lifecycle statuses (FEATURE_DECISIONS §186). */
export const STUDIO_LIFECYCLE_STATUSES = Object.freeze({
  DRAFT: "draft",
  SCOPE_CONFIRMED: "scope_confirmed",
  CALCULATED: "calculated",
  COMMERCIALLY_APPROVED: "commercially_approved",
  PUBLISHED: "published",
  CHANGES_REQUESTED: "changes_requested",
  ACCEPTED_AWAITING_SOLD_REVIEW: "accepted_awaiting_sold_review",
  SOLD: "sold",
  ARCHIVED: "archived"
});

export const STUDIO_LIFECYCLE_STATUS_LABELS = Object.freeze({
  draft: "Draft",
  scope_confirmed: "Scope Confirmed",
  calculated: "Calculated",
  commercially_approved: "Commercially Approved",
  published: "Published",
  changes_requested: "Changes Requested",
  accepted_awaiting_sold_review: "Accepted — Awaiting Sold Review",
  sold: "Sold",
  archived: "Archived"
});

export const STUDIO_LIFECYCLE_EVENT_TYPES = Object.freeze({
  ESTIMATE_CREATED: "estimate_created",
  SCOPE_CONFIRMED: "scope_confirmed",
  CALCULATED: "calculated",
  COMMERCIALLY_APPROVED: "commercially_approved",
  PUBLICATION_CREATED: "publication_created",
  PUBLICATION_REPLACED: "publication_replaced",
  PUBLICATION_REVOKED: "publication_revoked",
  REVIEW_REQUEST_SUBMITTED: "review_request_submitted",
  REVISION_CREATED: "revision_created",
  CUSTOMER_ACCEPTED: "customer_accepted",
  SOLD_REVIEW_UPDATED: "sold_review_updated",
  SOLD_REVIEW_COMPLETED: "sold_review_completed",
  MARKED_SOLD: "marked_sold",
  ARCHIVED: "archived",
  RESTORED: "restored"
});

/** Required sold-review checklist keys (boolean). */
export const SOLD_REVIEW_CHECKLIST_KEYS = Object.freeze([
  "customerAccountCorrect",
  "projectLocationCorrect",
  "acceptedScopeCorrect",
  "materialOptionsCorrect",
  "customerTotalCorrect",
  "termsCorrect",
  "internalNotesReviewed",
  "noUnresolvedReviewRequest",
  "readyForOperationalHandoff"
]);

export const SOLD_REVIEW_CHECKLIST_LABELS = Object.freeze({
  customerAccountCorrect: "Customer / account is correct",
  projectLocationCorrect: "Project / location is correct",
  acceptedScopeCorrect: "Accepted scope is correct",
  materialOptionsCorrect: "Material and options are correct",
  customerTotalCorrect: "Customer total is correct",
  termsCorrect: "Terms are correct",
  internalNotesReviewed: "Required internal notes have been reviewed",
  noUnresolvedReviewRequest: "No unresolved Review Request remains",
  readyForOperationalHandoff: "Estimate is ready for operational handoff"
});

/**
 * @param {object|null|undefined} checklist
 */
export function emptySoldReviewChecklist() {
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const k of SOLD_REVIEW_CHECKLIST_KEYS) out[k] = false;
  return out;
}

/**
 * @param {object|null|undefined} checklist
 */
export function normalizeSoldReviewChecklist(checklist) {
  const base = emptySoldReviewChecklist();
  if (!checklist || typeof checklist !== "object") return base;
  for (const k of SOLD_REVIEW_CHECKLIST_KEYS) {
    base[k] = checklist[k] === true;
  }
  return base;
}

/**
 * @param {object|null|undefined} checklist
 */
export function isSoldReviewChecklistComplete(checklist) {
  const n = normalizeSoldReviewChecklist(checklist);
  return SOLD_REVIEW_CHECKLIST_KEYS.every((k) => n[k] === true);
}

/**
 * Derive lifecycle status from commercial + publication + acceptance + sold facts.
 * Pure — does not mutate.
 *
 * @param {{
 *   estimateStatus?: string|null,
 *   manualScopeConfirmed?: boolean,
 *   hasActivePublication?: boolean,
 *   hasOpenReviewRequest?: boolean,
 *   hasAcceptance?: boolean,
 *   hasSoldSnapshot?: boolean,
 *   archived?: boolean
 * }} input
 */
export function deriveStudioLifecycleStatus(input = {}) {
  if (input.archived) return STUDIO_LIFECYCLE_STATUSES.ARCHIVED;
  if (input.hasSoldSnapshot) return STUDIO_LIFECYCLE_STATUSES.SOLD;
  if (input.hasAcceptance) {
    return STUDIO_LIFECYCLE_STATUSES.ACCEPTED_AWAITING_SOLD_REVIEW;
  }
  if (input.hasOpenReviewRequest) return STUDIO_LIFECYCLE_STATUSES.CHANGES_REQUESTED;
  if (input.hasActivePublication) return STUDIO_LIFECYCLE_STATUSES.PUBLISHED;

  const st = String(input.estimateStatus || "").toLowerCase();
  if (st === "approved") return STUDIO_LIFECYCLE_STATUSES.COMMERCIALLY_APPROVED;
  if (st === "priced") return STUDIO_LIFECYCLE_STATUSES.CALCULATED;
  if (st === "ready_to_price" || input.manualScopeConfirmed) {
    return STUDIO_LIFECYCLE_STATUSES.SCOPE_CONFIRMED;
  }
  return STUDIO_LIFECYCLE_STATUSES.DRAFT;
}

/**
 * @param {string} status
 */
export function studioLifecycleStatusLabel(status) {
  return STUDIO_LIFECYCLE_STATUS_LABELS[String(status || "")] || String(status || "Unknown");
}

/**
 * Strip internal economics from a customer-safe acceptance snapshot.
 * @param {object} calc
 * @param {object} scope
 * @param {object} [configuration]
 */
export function buildCustomerSafeAcceptanceSnapshot({
  calc = null,
  scope = {},
  configuration = null,
  publication = null,
  estimate = null
} = {}) {
  const customLines = Array.isArray(calc?.fabrication?.customLineItems)
    ? calc.fabrication.customLineItems
    : Array.isArray(scope?.customLineItems)
      ? scope.customLineItems
      : [];
  const publicLines = customLines
    .filter((l) => {
      const role = String(l?.commercialRole || "");
      if (role === "internal_only" || role === "absorbed") return false;
      if (role === "legacy_hidden_customer_charge") return false;
      if (l?.customerFacing === false && !role) return false;
      return true;
    })
    .map((l) => ({
      lineKey: l.lineKey || l.id || null,
      name: l.customerDescription || l.name || null,
      category: l.category || null,
      quantity: l.quantity ?? null,
      unit: l.unit || null,
      unitPrice: l.unitPrice ?? null,
      lineTotal: l.lineTotal ?? null,
      commercialRole: l.commercialRole || "customer_charge"
    }));

  return {
    lifecycleVersion: STUDIO_LIFECYCLE_VERSION,
    estimateId: estimate?.id || null,
    estimateRevision: Number(estimate?.revision) || null,
    intakeCaseId: estimate?.intakeCaseId || null,
    publicationId: publication?.id || null,
    customerName: scope?.customerName || null,
    projectName: scope?.projectName || null,
    materialGroup: scope?.materialGroup || null,
    materialSummary: Array.isArray(calc?.material?.roomSummaries)
      ? calc.material.roomSummaries.map((r) => ({
          roomId: r.roomId,
          roomName: r.roomName,
          materialGroup: r.materialGroup
        }))
      : [],
    customerVisibleLines: publicLines,
    totals: {
      customerDisplayTotal: calc?.totals?.customerDisplayTotal ?? null,
      materialSubtotal: calc?.totals?.materialSubtotal ?? null,
      materialUseTax: calc?.totals?.materialUseTax ?? null,
      fabricationSubtotal: calc?.totals?.fabricationSubtotal ?? null
    },
    configuration: configuration && typeof configuration === "object"
      ? structuredClone(configuration)
      : null,
    // Explicitly omit: exactInternalTotal, internalMarkup, absorbed, internal notes
    termsVersion: publication?.terms_version || publication?.termsVersion || null
  };
}

/**
 * Assert customer-safe blob has no internal leakage (test helper + runtime guard).
 * @param {unknown} value
 */
export function assertNoInternalEconomicsLeak(value, path = "$") {
  const json = JSON.stringify(value);
  const forbidden = [
    "exactInternalTotal",
    "internalMarkup",
    "internalOnly",
    "internal_only",
    "absorbedCosts",
    "internalNotes",
    "internalUnitCost",
    "internalUnitCost",
    "margin",
    "wholesale",
    "ratePerSf",
    "soldReview",
    "checklist"
  ];
  for (const f of forbidden) {
    if (json.includes(`"${f}"`) || json.includes(`:${f}`)) {
      // Allow commercialRole values that contain internal_only as role enum on filtered-out paths
      if (f === "internal_only" && !json.includes(`"commercialRole":"internal_only"`)) continue;
      const err = new Error(`Internal economics leak at ${path}: ${f}`);
      err.code = "internal_data_leak";
      err.statusCode = 500;
      throw err;
    }
  }
  // Soft name scan for common secret labels
  if (/SECRET internal|true cost/i.test(json)) {
    const err = new Error(`Internal economics leak at ${path}: sensitive label`);
    err.code = "internal_data_leak";
    err.statusCode = 500;
    throw err;
  }
}
