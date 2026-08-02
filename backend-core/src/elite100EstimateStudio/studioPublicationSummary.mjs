/**
 * Safe Studio publication summary — staff display only.
 * Never includes raw tokens, token hashes, wrap keys, or storage secrets.
 * Read-model only: never publishes, replaces, revokes, or notifies.
 */

import { isOpenDigitalEstimateReviewRequestStatus } from "../digitalEstimate/configuration/amendmentConfig.mjs";

/**
 * @typedef {'not_published'|'ready_to_publish'|'published_active'|'published_waiting_for_customer'|'customer_viewed'|'customer_review_requested'|'publication_expired'|'publication_revoked'|'publication_replaced'|'publication_superseded'|'publication_link_unavailable'} StudioPublicationState
 */

/**
 * @typedef {{
 *   state: StudioPublicationState,
 *   active: boolean,
 *   historical: boolean,
 *   publicationId: string|null,
 *   estimateId: string|null,
 *   revision: number|null,
 *   publishedAt: string|null,
 *   expiresAt: string|null,
 *   customerActivityState: string,
 *   customerActivityLabel: string,
 *   customerUrlAvailable: boolean,
 *   customerUrl: string|null,
 *   reviewRequestOpen: boolean,
 *   reviewRequestId: string|null,
 *   statusLabel: string,
 *   linkStatus: string|null
 * }} StudioPublicationSummary
 */

/**
 * @param {object|null|undefined} pub
 */
export function normalizePublicationStatus(pub) {
  if (!pub || typeof pub !== "object") return "none";
  const status = String(pub.status || "").toLowerCase();
  if (pub.revokedAt || pub.revoked_at) return "revoked";
  if (pub.supersededAt || pub.superseded_at) return "superseded";
  if (status === "revoked") return "revoked";
  if (status === "superseded") return "superseded";
  if (status === "expired") return "expired";
  if (status === "replaced") return "replaced";
  const expiresAt = pub.pricingValidThrough || pub.pricing_valid_through || pub.accessExpiresAt || pub.access_expires_at;
  if (expiresAt) {
    const t = Date.parse(String(expiresAt));
    if (Number.isFinite(t) && t < Date.now()) return "expired";
  }
  if (status === "active") return "active";
  return status || "none";
}

/**
 * True when the publication belongs to the current estimate revision family
 * and is still the live customer link for that revision.
 * @param {object|null|undefined} estimate
 * @param {object|null|undefined} pub
 */
export function isCurrentActivePublicationForEstimate(estimate, pub) {
  if (!estimate || !pub) return false;
  const norm = normalizePublicationStatus(pub);
  if (norm !== "active") return false;
  const pubRev = Number(pub.revisionNumber ?? pub.revision_number ?? pub.revision);
  const estRev = Number(estimate.revision) || 1;
  // Active family publication matching current revision is current.
  if (Number.isFinite(pubRev) && pubRev > 0 && pubRev !== estRev) return false;
  return true;
}

/**
 * True when a publication exists but belongs to a prior revision (or is inactive).
 * @param {object|null|undefined} estimate
 * @param {object|null|undefined} pub
 */
export function isHistoricalPublicationForEstimate(estimate, pub) {
  if (!estimate || !pub) return false;
  const pubRev = Number(pub.revisionNumber ?? pub.revision_number ?? pub.revision);
  const estRev = Number(estimate.revision) || 1;
  if (Number.isFinite(pubRev) && pubRev > 0 && pubRev !== estRev) return true;
  const norm = normalizePublicationStatus(pub);
  return norm !== "active";
}

/**
 * @param {{
 *   estimate?: object|null,
 *   activePublication?: object|null,
 *   publications?: object[],
 *   reviewRequests?: object[],
 *   customerViewed?: boolean
 * }} input
 * @returns {StudioPublicationSummary}
 */
export function buildSafeStudioPublicationSummary(input = {}) {
  const estimate = input.estimate || null;
  const estimateId = estimate?.id ? String(estimate.id) : null;
  const estimateRevision = Number(estimate?.revision) || 1;
  const pubs = Array.isArray(input.publications) ? input.publications : [];
  const activePublication = input.activePublication || null;
  const reviewRequests = Array.isArray(input.reviewRequests) ? input.reviewRequests : [];

  // Same open statuses as public "Send selections" / DE.2F amendment rows
  // (`review_requested`, …) plus legacy Studio aliases (`open`, …).
  const openReview =
    reviewRequests.find((r) => isOpenDigitalEstimateReviewRequestStatus(r?.status)) || null;

  const candidate =
    activePublication ||
    pubs.find((p) => normalizePublicationStatus(p) === "active") ||
    pubs[0] ||
    null;

  if (!candidate) {
    return {
      state: "not_published",
      active: false,
      historical: false,
      publicationId: null,
      estimateId,
      revision: estimateRevision,
      publishedAt: null,
      expiresAt: null,
      customerActivityState: "none",
      customerActivityLabel: "Not published",
      customerUrlAvailable: false,
      customerUrl: null,
      reviewRequestOpen: Boolean(openReview),
      reviewRequestId: openReview?.id ? String(openReview.id) : null,
      statusLabel: "Not published",
      linkStatus: null
    };
  }

  const norm = normalizePublicationStatus(candidate);
  const pubId = candidate.id || candidate.publicationId || null;
  const pubRev = Number(candidate.revisionNumber ?? candidate.revision_number ?? candidate.revision) || null;
  const publishedAt = candidate.publishedAt || candidate.published_at || null;
  const expiresAt =
    candidate.pricingValidThrough ||
    candidate.pricing_valid_through ||
    candidate.accessExpiresAt ||
    candidate.access_expires_at ||
    null;
  const linkStatus = candidate.linkStatus != null ? String(candidate.linkStatus) : null;
  const customerUrl =
    typeof candidate.customerUrl === "string" && candidate.customerUrl.trim()
      ? candidate.customerUrl.trim()
      : null;
  const urlAvailable = Boolean(customerUrl) && (linkStatus === "active" || linkStatus == null || norm === "active");

  const historical =
    (Number.isFinite(pubRev) && pubRev > 0 && pubRev !== estimateRevision) ||
    norm !== "active";
  const currentActive = isCurrentActivePublicationForEstimate(estimate, candidate) && !historical;

  /** @type {StudioPublicationState} */
  let state = "not_published";
  let statusLabel = "Not published";
  let customerActivityState = "none";
  let customerActivityLabel = "Not published";

  if (norm === "revoked") {
    state = "publication_revoked";
    statusLabel = "Publication revoked";
    customerActivityState = "revoked";
    customerActivityLabel = "Revoked";
  } else if (norm === "superseded") {
    state = "publication_superseded";
    statusLabel = "Publication superseded";
    customerActivityState = "superseded";
    customerActivityLabel = "Superseded";
  } else if (norm === "replaced") {
    state = "publication_replaced";
    statusLabel = "Publication replaced";
    customerActivityState = "replaced";
    customerActivityLabel = "Replaced";
  } else if (norm === "expired") {
    state = "publication_expired";
    statusLabel = "Publication expired";
    customerActivityState = "expired";
    customerActivityLabel = "Expired";
  } else if (historical && norm === "active") {
    // Active link for a prior revision — historical relative to current estimate revision.
    state = "publication_superseded";
    statusLabel = "Previous publication";
    customerActivityState = "historical";
    customerActivityLabel = "Previous publication";
  } else if (currentActive) {
    if (openReview) {
      state = "customer_review_requested";
      statusLabel = "Published — customer requested changes";
      customerActivityState = "review_requested";
      customerActivityLabel = "Review requested";
    } else if (!urlAvailable) {
      state = "publication_link_unavailable";
      statusLabel = "Published — customer link unavailable";
      customerActivityState = "link_unavailable";
      customerActivityLabel = "Customer link unavailable";
    } else if (input.customerViewed === true) {
      state = "customer_viewed";
      statusLabel = "Published — customer viewed";
      customerActivityState = "viewed";
      customerActivityLabel = "Viewed";
    } else {
      state = "published_waiting_for_customer";
      statusLabel = "Published — waiting on customer";
      customerActivityState = "waiting";
      customerActivityLabel = "Not viewed";
    }
  } else if (norm === "active" && !urlAvailable) {
    state = "publication_link_unavailable";
    statusLabel = "Published — customer link unavailable";
    customerActivityState = "link_unavailable";
    customerActivityLabel = "Customer link unavailable";
  }

  return {
    state,
    active: currentActive,
    historical: Boolean(historical && !currentActive),
    publicationId: pubId ? String(pubId) : null,
    estimateId,
    revision: pubRev || estimateRevision,
    publishedAt: publishedAt ? String(publishedAt) : null,
    expiresAt: expiresAt ? String(expiresAt) : null,
    customerActivityState,
    customerActivityLabel,
    customerUrlAvailable: Boolean(currentActive && urlAvailable),
    // Only expose recovered staff URL when the publication is current+active.
    customerUrl: currentActive && urlAvailable ? customerUrl : null,
    reviewRequestOpen: Boolean(openReview),
    reviewRequestId: openReview?.id ? String(openReview.id) : null,
    statusLabel,
    linkStatus
  };
}
