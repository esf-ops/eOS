/**
 * Quote Flow review metadata helpers (no pricing/calculator imports).
 */

/**
 * Mark Quote Flow / Studio approval stale when scope or pricing mutates.
 * @param {object} scope
 * @param {string} reason
 */
export function markQuoteFlowReviewStaleOnScope(scope, reason) {
  const existing =
    scope?.quoteFlowReview && typeof scope.quoteFlowReview === "object"
      ? { ...scope.quoteFlowReview }
      : {};
  if (!existing.approvedAt && existing.status !== "approved") {
    return scope && typeof scope === "object" ? { ...scope } : {};
  }
  return {
    ...(scope && typeof scope === "object" ? scope : {}),
    quoteFlowReview: {
      ...existing,
      status: "stale",
      staleAt: new Date().toISOString(),
      staleReason: reason || "Scope or pricing changed after approval. Re-review required."
    }
  };
}
