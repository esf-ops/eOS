/**
 * Quote Flow review / Digital Estimate metadata helpers (no pricing/calculator imports).
 */

/**
 * Mark Quote Flow Digital Estimate publish metadata stale after source changes.
 * @param {object} scope
 * @param {string} reason
 */
export function markQuoteFlowDigitalEstimateStaleOnScope(scope, reason) {
  const base = scope && typeof scope === "object" ? { ...scope } : {};
  const existing =
    base.quoteFlowDigitalEstimate && typeof base.quoteFlowDigitalEstimate === "object"
      ? { ...base.quoteFlowDigitalEstimate }
      : null;
  if (!existing) return base;
  if (!existing.publishedAt && existing.status !== "published" && existing.status !== "stale") {
    return base;
  }
  return {
    ...base,
    quoteFlowDigitalEstimate: {
      ...existing,
      status: "stale",
      staleAt: new Date().toISOString(),
      staleReason: reason || "Scope or pricing changed after publish. Needs republish."
    }
  };
}

/**
 * Mark Quote Flow / Studio approval stale when scope or pricing mutates.
 * Also marks Digital Estimate publish metadata stale when a prior publish exists.
 * @param {object} scope
 * @param {string} reason
 */
export function markQuoteFlowReviewStaleOnScope(scope, reason) {
  const existing =
    scope?.quoteFlowReview && typeof scope.quoteFlowReview === "object"
      ? { ...scope.quoteFlowReview }
      : {};
  let next = scope && typeof scope === "object" ? { ...scope } : {};
  if (existing.approvedAt || existing.status === "approved") {
    next = {
      ...next,
      quoteFlowReview: {
        ...existing,
        status: "stale",
        staleAt: new Date().toISOString(),
        staleReason: reason || "Scope or pricing changed after approval. Re-review required."
      }
    };
  }
  return markQuoteFlowDigitalEstimateStaleOnScope(
    next,
    reason || "Scope or pricing changed after publish. Needs republish."
  );
}
