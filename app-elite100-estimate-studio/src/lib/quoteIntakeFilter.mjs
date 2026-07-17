import {
  caseCustomerProjectLabel,
  caseSenderLabel,
  caseEstimatorLabel
} from "./quoteIntakeFormat.mjs";
import { statusMatchesSummaryBucket } from "./quoteIntakeStatusLabels.mjs";

export function computeQueueSummaryCounts(cases) {
  const counts = {
    total: cases.length,
    new: 0,
    processing: 0,
    manual_review: 0,
    ready_for_takeoff: 0,
    takeoff: 0,
    failed: 0
  };
  for (const c of cases) {
    const s = String(c.status ?? "");
    if (statusMatchesSummaryBucket(s, "new")) counts.new += 1;
    if (statusMatchesSummaryBucket(s, "processing")) counts.processing += 1;
    if (statusMatchesSummaryBucket(s, "manual_review")) counts.manual_review += 1;
    if (statusMatchesSummaryBucket(s, "ready_for_takeoff")) counts.ready_for_takeoff += 1;
    if (statusMatchesSummaryBucket(s, "takeoff")) counts.takeoff += 1;
    if (statusMatchesSummaryBucket(s, "failed")) counts.failed += 1;
  }
  return counts;
}

function haystack(c) {
  return [
    c.id,
    caseCustomerProjectLabel(c),
    caseSenderLabel(c),
    caseEstimatorLabel(c),
    c.status,
    c.priority,
    c.sourceMessage?.internetMessageId,
    c.sourceMessage?.contentHash,
    ...(c.attachments ?? []).map((a) => a.safeFilename ?? "")
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
}

export function filterQuoteIntakeCases(cases, filter) {
  const search = String(filter.search ?? "")
    .trim()
    .toLowerCase();
  const status = String(filter.status ?? "").trim();
  const priority = String(filter.priority ?? "")
    .trim()
    .toLowerCase();
  const bucket = String(filter.summaryBucket ?? "").trim();

  return cases.filter((c) => {
    if (status && c.status !== status) return false;
    if (priority && String(c.priority ?? "").toLowerCase() !== priority) return false;
    if (bucket && !statusMatchesSummaryBucket(c.status, bucket)) return false;
    if (search && !haystack(c).includes(search)) return false;
    return true;
  });
}

export function caseReasonSnippets(c) {
  const missing = Array.isArray(c.missingInformation)
    ? c.missingInformation.map(String).filter(Boolean)
    : [];
  const manual = Array.isArray(c.manualReviewReasons)
    ? c.manualReviewReasons.map(String).filter(Boolean)
    : [];
  return [...manual, ...missing].slice(0, 4);
}
