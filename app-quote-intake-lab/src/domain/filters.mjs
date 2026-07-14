import { ageBucket } from "./age.mjs";
import { summaryBucketForStatus } from "./statuses.mjs";

/**
 * @typedef {object} QuoteIntakeFilter
 * @property {string} [search]
 * @property {string} [status]
 * @property {string} [priority]
 * @property {string} [salesperson]
 * @property {string} [estimator]
 * @property {string} [ageBucket]
 * @property {"any"|"has_missing"|"none_missing"} [missingInfo]
 * @property {string} [summaryBucket]
 */

/**
 * @param {import("./types.js").QuoteIntakeCase[]} cases
 * @param {QuoteIntakeFilter} filter
 * @param {string|Date} [asOf]
 */
export function filterQuoteIntakeCases(cases, filter = {}, asOf = new Date()) {
  const search = String(filter.search ?? "")
    .trim()
    .toLowerCase();
  const status = String(filter.status ?? "").trim();
  const priority = String(filter.priority ?? "").trim();
  const salesperson = String(filter.salesperson ?? "").trim();
  const estimator = String(filter.estimator ?? "").trim();
  const age = String(filter.ageBucket ?? "").trim();
  const missingInfo = String(filter.missingInfo ?? "any").trim() || "any";
  const summaryBucket = String(filter.summaryBucket ?? "").trim();

  return (cases ?? []).filter((c) => {
    if (status && c.status !== status) return false;
    if (summaryBucket && summaryBucketForStatus(c.status) !== summaryBucket) return false;
    if (priority && c.priority !== priority) return false;
    if (salesperson && c.assignedSalesperson !== salesperson) return false;
    if (estimator) {
      if (estimator === "__unassigned__") {
        if (c.assignedEstimator) return false;
      } else if (c.assignedEstimator !== estimator) {
        return false;
      }
    }
    if (age && ageBucket(c.receivedAt, asOf) !== age) return false;

    const missingCount = Array.isArray(c.missingInformation) ? c.missingInformation.length : 0;
    if (missingInfo === "has_missing" && missingCount === 0) return false;
    if (missingInfo === "none_missing" && missingCount > 0) return false;

    if (search) {
      const hay = [
        c.id,
        c.customerAccount,
        c.projectName,
        c.projectAddress,
        c.senderName,
        c.senderEmail,
        c.emailSubject,
        c.emailExcerpt,
        c.requestedColor,
        c.resolvedPriceGroup,
        c.assignedSalesperson,
        c.assignedEstimator,
        c.recipientMailbox
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

/**
 * @param {import("./types.js").QuoteIntakeCase[]} cases
 */
export function buildStatusCounts(cases) {
  const counts = {
    new: 0,
    processing: 0,
    ready_for_review: 0,
    missing_information: 0,
    manual_review: 0,
    approved_ready: 0,
    sent_simulated: 0,
    total: 0
  };
  for (const c of cases ?? []) {
    counts.total += 1;
    const bucket = summaryBucketForStatus(c.status);
    if (bucket && Object.prototype.hasOwnProperty.call(counts, bucket)) {
      counts[bucket] += 1;
    }
  }
  return counts;
}

/**
 * @param {import("./types.js").QuoteIntakeCase[]} cases
 */
export function uniqueSalespeople(cases) {
  return [...new Set((cases ?? []).map((c) => c.assignedSalesperson).filter(Boolean))].sort();
}

/**
 * @param {import("./types.js").QuoteIntakeCase[]} cases
 */
export function uniqueEstimators(cases) {
  return [...new Set((cases ?? []).map((c) => c.assignedEstimator).filter(Boolean))].sort();
}
