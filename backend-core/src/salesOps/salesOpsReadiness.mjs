/**
 * One Sales Ops operating-readiness authority.
 * Pages must not independently invent IDENTITY_APPROVAL_REQUIRED vs ATTRIBUTION_ACTIVE.
 * Actual SF is independent of a published Goal and of unresolved sibling accounts.
 */

export function attributionIsActive(facts) {
  return (facts || []).some((fact) => {
    const status = String(fact.status || "credited");
    if (status !== "credited" && status !== "reversed") return false;
    return Number.isFinite(Number(fact.creditedSf));
  });
}

export function salesOpsOperatingReadiness({
  facts = [],
  publishedPlan = null,
  commissionEnabled = false,
  accounts = []
} = {}) {
  const assigned = Array.isArray(accounts) ? accounts : [];
  const linkedCount = assigned.filter((row) => String(row?.accountDirectoryAccountId || "").trim()).length;
  const assignedCount = assigned.length;
  const unresolvedCount = Math.max(0, assignedCount - linkedCount);
  const attributionActive = attributionIsActive(facts);
  return {
    identityCoverage: {
      assignedCount,
      linkedCount,
      unresolvedCount
    },
    attributionActive,
    actualSfAvailable: attributionActive,
    publishedPlanAvailable: Boolean(publishedPlan),
    commissionEnabled: Boolean(commissionEnabled)
  };
}
