/**
 * Live Digital Estimates — operational status + next-action derivation.
 * Authoritative records only; never invents customer activity.
 */

export const LIVE_DE_OPERATIONAL_STATUSES = Object.freeze({
  PUBLISHED_NOT_VIEWED: "published_not_viewed",
  VIEWED: "viewed",
  CUSTOMER_CONFIGURING: "customer_configuring",
  REVIEW_REQUESTED: "review_requested",
  ESTIMATOR_REVIEWING: "estimator_reviewing",
  REVISION_REQUIRED: "revision_required",
  REVISED_REPUBLISHED: "revised_republished",
  EXPIRING_SOON: "expiring_soon",
  EXPIRED: "expired",
  REVOKED: "revoked",
  SUPERSEDED: "superseded",
  CLOSED: "closed"
});

export const LIVE_DE_STATUS_LABELS = Object.freeze({
  [LIVE_DE_OPERATIONAL_STATUSES.PUBLISHED_NOT_VIEWED]: "Published — not viewed",
  [LIVE_DE_OPERATIONAL_STATUSES.VIEWED]: "Viewed",
  [LIVE_DE_OPERATIONAL_STATUSES.CUSTOMER_CONFIGURING]: "Customer configuring",
  [LIVE_DE_OPERATIONAL_STATUSES.REVIEW_REQUESTED]: "Review requested",
  [LIVE_DE_OPERATIONAL_STATUSES.ESTIMATOR_REVIEWING]: "Estimator reviewing",
  [LIVE_DE_OPERATIONAL_STATUSES.REVISION_REQUIRED]: "Revision required",
  [LIVE_DE_OPERATIONAL_STATUSES.REVISED_REPUBLISHED]: "Revised and republished",
  [LIVE_DE_OPERATIONAL_STATUSES.EXPIRING_SOON]: "Expiring soon",
  [LIVE_DE_OPERATIONAL_STATUSES.EXPIRED]: "Expired",
  [LIVE_DE_OPERATIONAL_STATUSES.REVOKED]: "Revoked",
  [LIVE_DE_OPERATIONAL_STATUSES.SUPERSEDED]: "Superseded",
  [LIVE_DE_OPERATIONAL_STATUSES.CLOSED]: "Closed"
});

export const LIVE_DE_NEXT_ACTIONS = Object.freeze({
  OPEN_CUSTOMER_VIEW: { code: "open_customer_view", label: "Open customer view" },
  COPY_CUSTOMER_LINK: { code: "copy_customer_link", label: "Copy customer link" },
  REVIEW_CUSTOMER_CHANGES: {
    code: "review_customer_changes",
    label: "Review customer changes"
  },
  PREPARE_REVISION: { code: "prepare_estimate_revision", label: "Prepare estimate revision" },
  RECALCULATE: { code: "recalculate_estimate", label: "Recalculate estimate" },
  APPROVE_REVISED: { code: "approve_revised_estimate", label: "Approve revised estimate" },
  REPUBLISH: { code: "republish_revised_estimate", label: "Republish revised estimate" },
  REPLACE_LINK: { code: "replace_unavailable_link", label: "Replace unavailable link" },
  LINK_ACCOUNT: { code: "link_customer_account", label: "Link customer account" },
  REVIEW_EXPIRATION: { code: "review_expiration", label: "Review expiration" },
  NO_ACTION: { code: "no_action_required", label: "No action required" }
});

export const LIVE_DE_ATTENTION = Object.freeze({
  LINK_UNAVAILABLE: "link_unavailable",
  PRICING_EXPIRES_SOON: "pricing_expires_soon",
  REVIEW_WAITING: "review_request_waiting",
  REVISION_REQUIRED: "revision_required",
  OUTDATED_REVISION: "outdated_estimate_revision",
  ACCOUNT_UNLINKED: "account_directory_unlinked",
  CONFIG_INCOMPLETE: "publication_configuration_incomplete"
});

const OPEN_REVIEW_STATUSES = new Set([
  "new",
  "open",
  "submitted",
  "in_review",
  "revision_required",
  "pending"
]);

/**
 * @param {string|null|undefined} iso
 * @param {Date} [now]
 */
export function daysUntil(iso, now = new Date()) {
  if (!iso) return null;
  const t = Date.parse(String(iso).slice(0, 10) + "T00:00:00.000Z");
  if (!Number.isFinite(t)) {
    const full = Date.parse(String(iso));
    if (!Number.isFinite(full)) return null;
    return Math.ceil((full - now.getTime()) / 86400000);
  }
  return Math.ceil((t - now.getTime()) / 86400000);
}

/**
 * @param {string|null|undefined} iso
 * @param {Date} [now]
 */
export function ageDays(iso, now = new Date()) {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86400000));
}

/**
 * @param {{
 *   publicationStatus: string,
 *   accessExpiresAt?: string|null,
 *   pricingValidThrough?: string|null,
 *   hasFirstViewed?: boolean,
 *   hasViewed?: boolean,
 *   hasConfigActivity?: boolean,
 *   reviewRequest?: { status?: string|null, operatorStatus?: string|null }|null,
 *   linkStatus?: string|null,
 *   recentlyRepublished?: boolean,
 *   closed?: boolean
 * }} input
 * @param {Date} [now]
 */
export function deriveLiveDigitalEstimateStatus(input, now = new Date()) {
  const pubStatus = String(input.publicationStatus || "").toLowerCase();
  if (input.closed) {
    return LIVE_DE_OPERATIONAL_STATUSES.CLOSED;
  }
  if (pubStatus === "revoked") return LIVE_DE_OPERATIONAL_STATUSES.REVOKED;
  if (pubStatus === "superseded") return LIVE_DE_OPERATIONAL_STATUSES.SUPERSEDED;
  if (pubStatus === "expired") return LIVE_DE_OPERATIONAL_STATUSES.EXPIRED;

  const accessDays = daysUntil(input.accessExpiresAt, now);
  if (accessDays != null && accessDays < 0) {
    return LIVE_DE_OPERATIONAL_STATUSES.EXPIRED;
  }

  const review = input.reviewRequest;
  const reviewStatus = String(
    review?.operatorStatus || review?.status || ""
  ).toLowerCase();
  if (review && OPEN_REVIEW_STATUSES.has(reviewStatus)) {
    if (reviewStatus === "revision_required") {
      return LIVE_DE_OPERATIONAL_STATUSES.REVISION_REQUIRED;
    }
    if (reviewStatus === "in_review") {
      return LIVE_DE_OPERATIONAL_STATUSES.ESTIMATOR_REVIEWING;
    }
    return LIVE_DE_OPERATIONAL_STATUSES.REVIEW_REQUESTED;
  }

  if (input.recentlyRepublished && input.hasFirstViewed) {
    return LIVE_DE_OPERATIONAL_STATUSES.REVISED_REPUBLISHED;
  }

  const pricingDays = daysUntil(input.pricingValidThrough, now);
  if (pricingDays != null && pricingDays >= 0 && pricingDays <= 7) {
    // Prefer activity statuses when customer is mid-flow; otherwise surface expiring.
    if (!input.hasConfigActivity && !OPEN_REVIEW_STATUSES.has(reviewStatus)) {
      return LIVE_DE_OPERATIONAL_STATUSES.EXPIRING_SOON;
    }
  }

  if (input.hasConfigActivity) {
    return LIVE_DE_OPERATIONAL_STATUSES.CUSTOMER_CONFIGURING;
  }
  if (input.hasFirstViewed || input.hasViewed) {
    return LIVE_DE_OPERATIONAL_STATUSES.VIEWED;
  }
  if (pubStatus === "active" || !pubStatus) {
    return LIVE_DE_OPERATIONAL_STATUSES.PUBLISHED_NOT_VIEWED;
  }
  return LIVE_DE_OPERATIONAL_STATUSES.CLOSED;
}

/**
 * @param {{
 *   operationalStatus: string,
 *   accountDirectoryAccountId?: string|null,
 *   linkStatus?: string|null,
 *   pricingValidThrough?: string|null,
 *   studioEstimateOutdated?: boolean,
 *   configurationIncomplete?: boolean,
 *   reviewRequest?: object|null
 * }} input
 * @param {Date} [now]
 */
export function deriveAttentionReasons(input, now = new Date()) {
  /** @type {string[]} */
  const reasons = [];
  const link = String(input.linkStatus || "").toLowerCase();
  if (link === "needs_replace" || link === "revoked" || link === "recovery_error") {
    reasons.push(LIVE_DE_ATTENTION.LINK_UNAVAILABLE);
  }
  const pricingDays = daysUntil(input.pricingValidThrough, now);
  if (pricingDays != null && pricingDays >= 0 && pricingDays <= 7) {
    reasons.push(LIVE_DE_ATTENTION.PRICING_EXPIRES_SOON);
  }
  const reviewStatus = String(
    input.reviewRequest?.operatorStatus || input.reviewRequest?.status || ""
  ).toLowerCase();
  if (OPEN_REVIEW_STATUSES.has(reviewStatus)) {
    reasons.push(LIVE_DE_ATTENTION.REVIEW_WAITING);
  }
  if (
    input.operationalStatus === LIVE_DE_OPERATIONAL_STATUSES.REVISION_REQUIRED ||
    reviewStatus === "revision_required"
  ) {
    reasons.push(LIVE_DE_ATTENTION.REVISION_REQUIRED);
  }
  if (input.studioEstimateOutdated) {
    reasons.push(LIVE_DE_ATTENTION.OUTDATED_REVISION);
  }
  if (!input.accountDirectoryAccountId) {
    reasons.push(LIVE_DE_ATTENTION.ACCOUNT_UNLINKED);
  }
  if (input.configurationIncomplete) {
    reasons.push(LIVE_DE_ATTENTION.CONFIG_INCOMPLETE);
  }
  return reasons;
}

/**
 * @param {{
 *   operationalStatus: string,
 *   attentionReasons?: string[],
 *   accountDirectoryAccountId?: string|null,
 *   linkStatus?: string|null,
 *   reviewRequest?: { id?: string|null }|null,
 *   intakeCaseId?: string|null,
 *   studioEstimateId?: string|null,
 *   studioEstimateStatus?: string|null
 * }} input
 */
export function deriveNextAction(input) {
  const reasons = input.attentionReasons || [];
  if (reasons.includes(LIVE_DE_ATTENTION.LINK_UNAVAILABLE)) {
    return { ...LIVE_DE_NEXT_ACTIONS.REPLACE_LINK, target: "publication" };
  }
  const st = input.operationalStatus;
  if (
    st === LIVE_DE_OPERATIONAL_STATUSES.REVIEW_REQUESTED ||
    st === LIVE_DE_OPERATIONAL_STATUSES.ESTIMATOR_REVIEWING
  ) {
    return {
      ...LIVE_DE_NEXT_ACTIONS.REVIEW_CUSTOMER_CHANGES,
      target: "review_requests",
      reviewRequestId: input.reviewRequest?.id || null
    };
  }
  if (st === LIVE_DE_OPERATIONAL_STATUSES.REVISION_REQUIRED) {
    const estStatus = String(input.studioEstimateStatus || "").toLowerCase();
    if (estStatus === "ready_to_price" || estStatus === "draft") {
      return { ...LIVE_DE_NEXT_ACTIONS.RECALCULATE, target: "studio_estimate" };
    }
    if (estStatus === "priced") {
      return { ...LIVE_DE_NEXT_ACTIONS.APPROVE_REVISED, target: "studio_estimate" };
    }
    if (estStatus === "approved") {
      return { ...LIVE_DE_NEXT_ACTIONS.REPUBLISH, target: "studio_estimate" };
    }
    return { ...LIVE_DE_NEXT_ACTIONS.PREPARE_REVISION, target: "studio_estimate" };
  }
  if (!input.accountDirectoryAccountId) {
    return { ...LIVE_DE_NEXT_ACTIONS.LINK_ACCOUNT, target: "studio_estimate" };
  }
  if (
    st === LIVE_DE_OPERATIONAL_STATUSES.EXPIRING_SOON ||
    reasons.includes(LIVE_DE_ATTENTION.PRICING_EXPIRES_SOON)
  ) {
    return { ...LIVE_DE_NEXT_ACTIONS.REVIEW_EXPIRATION, target: "publication" };
  }
  if (
    st === LIVE_DE_OPERATIONAL_STATUSES.REVOKED ||
    st === LIVE_DE_OPERATIONAL_STATUSES.SUPERSEDED ||
    st === LIVE_DE_OPERATIONAL_STATUSES.EXPIRED ||
    st === LIVE_DE_OPERATIONAL_STATUSES.CLOSED
  ) {
    return { ...LIVE_DE_NEXT_ACTIONS.NO_ACTION, target: null };
  }
  if (st === LIVE_DE_OPERATIONAL_STATUSES.PUBLISHED_NOT_VIEWED) {
    return { ...LIVE_DE_NEXT_ACTIONS.COPY_CUSTOMER_LINK, target: "publication" };
  }
  return { ...LIVE_DE_NEXT_ACTIONS.OPEN_CUSTOMER_VIEW, target: "publication" };
}

/**
 * Stable grouping key — never fuzzy name match.
 * @param {{
 *   accountDirectoryAccountId?: string|null,
 *   publicationId: string,
 *   sourceQuoteId?: string|null,
 *   quoteFamilyRootId?: string|null
 * }} row
 */
export function accountGroupKeyForPublication(row) {
  const ad = row.accountDirectoryAccountId ? String(row.accountDirectoryAccountId).trim() : "";
  if (ad) return `ad:${ad}`;
  const family = row.quoteFamilyRootId ? String(row.quoteFamilyRootId).trim() : "";
  if (family) return `unlinked:family:${family}`;
  const quote = row.sourceQuoteId ? String(row.sourceQuoteId).trim() : "";
  if (quote) return `unlinked:quote:${quote}`;
  return `unlinked:pub:${row.publicationId}`;
}

export function isActivePortfolioPublication(publicationStatus, accessExpiresAt, now = new Date()) {
  const st = String(publicationStatus || "").toLowerCase();
  if (st !== "active") return false;
  const days = daysUntil(accessExpiresAt, now);
  if (days != null && days < 0) return false;
  return true;
}
