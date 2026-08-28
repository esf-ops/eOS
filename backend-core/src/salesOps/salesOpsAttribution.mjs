/**
 * Historical SF attribution is eliteOS-owned fact rows.
 * Current Monday assignment never rewrites credited history.
 */

import { planCoversPeriod } from "./salesOpsPlanLifecycle.mjs";

export const ATTRIBUTION_STATUSES = Object.freeze(["credited", "reversed"]);

export function netCreditedSf(facts) {
  let total = 0;
  let count = 0;
  for (const fact of facts || []) {
    if (String(fact.status || "credited") === "reversed" && fact.creditedSf == null) continue;
    const n = Number(fact.creditedSf);
    if (!Number.isFinite(n)) continue;
    total += n;
    count += 1;
  }
  if (!count) return null;
  return Math.round(total * 100) / 100;
}

export function factsForUserPeriod(facts, userId, period) {
  const uid = String(userId);
  const p = String(period);
  return (facts || []).filter(
    (f) => String(f.salespersonUserId) === uid && String(f.performanceMonth) === p
  );
}

export function contributeByAccount(facts, { inScopeSalesOpsAccountIds = null } = {}) {
  const grouped = new Map();
  for (const fact of facts || []) {
    const key = String(fact.accountDirectoryAccountId || "").trim();
    if (!key) continue;
    if (!grouped.has(key)) {
      grouped.set(key, {
        accountDirectoryAccountId: key,
        creditedSf: 0,
        salesOpsAccountId: null
      });
    }
    const row = grouped.get(key);
    const n = Number(fact.creditedSf);
    if (Number.isFinite(n)) row.creditedSf += n;
    const projectionId = String(fact.salesOpsAccountId || "").trim();
    if (projectionId && inScopeSalesOpsAccountIds instanceof Set && inScopeSalesOpsAccountIds.has(projectionId)) {
      row.salesOpsAccountId = projectionId;
    }
  }
  const monthly = netCreditedSf(facts);
  return [...grouped.values()]
    .map((row) => ({
      accountDirectoryAccountId: row.accountDirectoryAccountId,
      salesOpsAccountId: row.salesOpsAccountId,
      creditedSf: Math.round(row.creditedSf * 100) / 100,
      sharePct:
        monthly && monthly !== 0 ? Math.round((row.creditedSf / monthly) * 1000) / 10 : null,
      canOpenWorkspace: Boolean(row.salesOpsAccountId)
    }))
    .sort((a, b) => b.creditedSf - a.creditedSf || a.accountDirectoryAccountId.localeCompare(b.accountDirectoryAccountId));
}

/**
 * Plan version in force at period end: latest published-on-or-before period end.
 * Later revisions do not rewrite earlier months.
 */
export function selectPlanVersionForPeriod(plans, period) {
  const p = String(period || "");
  if (!/^\d{4}-\d{2}$/.test(p)) return null;
  const [y, m] = p.split("-").map(Number);
  const periodEnd = `${p}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const eligible = [];
  for (const plan of plans || []) {
    if (!["active", "approved", "superseded"].includes(plan.status)) continue;
    if (!planCoversPeriod(plan, p)) continue;
    const published = String(plan.publishedAt || "").slice(0, 10);
    if (published && published > periodEnd) continue;
    if (!published) continue;
    eligible.push(plan);
  }
  eligible.sort((a, b) => {
    const pa = String(a.publishedAt || "");
    const pb = String(b.publishedAt || "");
    if (pa !== pb) return pb.localeCompare(pa);
    return Number(b.versionNumber || 0) - Number(a.versionNumber || 0);
  });
  return eligible[0] || null;
}
