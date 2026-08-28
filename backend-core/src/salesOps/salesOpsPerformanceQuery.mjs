/**
 * Assemble Sales Ops performance DTOs from published plan months + attribution facts.
 * Does not invent Moraware actuals. Missing facts stay null with an explicit status.
 */

import { ACTUAL_SF_DEFINITION_STATUS, monthRow, rollingActual, ytdFromMonths } from "./salesOpsPerformanceMath.mjs";
import { contributeByAccount, factsForUserPeriod, netCreditedSf, selectPlanVersionForPeriod } from "./salesOpsAttribution.mjs";
import { currentPeriod, enumerateMonths } from "./salesOpsMonths.mjs";
import { MORAWARE_EXTERNAL_SYSTEM, QUICKBOOKS_EXTERNAL_SYSTEM, summarizeExactIdentity } from "./salesOpsIdentityAudit.mjs";
import { SALES_OPS_MONDAY_EXTERNAL_SYSTEM } from "./salesOpsConstants.js";

export const ACTUAL_SF_DEFINITION = Object.freeze({
  status: ACTUAL_SF_DEFINITION_STATUS,
  source: "moraware",
  qualifyingEvent: null,
  qualifyingDate: null,
  sfField: null,
  exclusions: null,
  reversalSemantics: "explicit_reversal_row_on_sales_ops_sf_attribution_facts",
  confidence: "unproven",
  rejectedProxies: Object.freeze([
    "created_at_source",
    "modified_at_source",
    "install_at_source",
    "completed_at_source",
    "invoice_date",
    "sales_dashboard_report_date"
  ]),
  note: "Sales dashboard date basis is a documented proxy, not an approved Sales Ops earned-sale event."
});

function publishedPlans(plans) {
  return (plans || []).filter((p) => p.publishedAt && ["active", "approved", "superseded"].includes(p.status));
}

function goalFromTargets(targets, period) {
  const row = (targets || []).find((t) => t.period === period);
  if (!row) return null;
  const n = Number(row.installedTarget);
  return Number.isFinite(n) ? n : null;
}

function actualStatusForFacts(facts) {
  if (facts && facts.length) return "AVAILABLE";
  return ACTUAL_SF_DEFINITION_STATUS;
}

export async function loadIdentityAudit(store, organizationId) {
  const [salesOpsAccounts, mondayLinks, morawareLinks, quickbooksLinks] = await Promise.all([
    store.listAccountIdentityRows(organizationId),
    store.listActiveExternalLinks(organizationId, SALES_OPS_MONDAY_EXTERNAL_SYSTEM),
    store.listActiveExternalLinks(organizationId, MORAWARE_EXTERNAL_SYSTEM),
    store.listActiveExternalLinks(organizationId, QUICKBOOKS_EXTERNAL_SYSTEM)
  ]);
  return summarizeExactIdentity({
    salesOpsAccounts,
    mondayLinks,
    morawareLinks,
    quickbooksLinks
  });
}

export async function assembleUserPerformance(store, { organizationId, userId, now, period = null, includeAccounts = false }) {
  const asOf = now || new Date();
  const current = currentPeriod(asOf);
  const selectedPeriod = period || current;
  const plans = publishedPlans(await store.listPlansForUser(organizationId, userId));
  const facts = typeof store.listAttributionFacts === "function"
    ? await store.listAttributionFacts(organizationId, { userIds: [userId] })
    : [];
  const planIds = [...new Set(plans.map((p) => p.id))];
  const allTargets =
    planIds.length && typeof store.listPeriodTargetsForPlanIds === "function"
      ? await store.listPeriodTargetsForPlanIds(organizationId, planIds)
      : (
          await Promise.all(planIds.map((id) => store.listPeriodTargets(organizationId, id)))
        ).flat();
  const targetsByPlan = new Map();
  for (const row of allTargets) {
    if (!targetsByPlan.has(row.planId)) targetsByPlan.set(row.planId, []);
    targetsByPlan.get(row.planId).push(row);
  }

  const monthSet = new Set();
  for (const plan of plans) {
    for (const m of enumerateMonths(plan.effectiveStartDate || plan.startDate, plan.effectiveEndDate || plan.endDate)) {
      monthSet.add(m);
    }
  }
  if (!monthSet.size) monthSet.add(selectedPeriod);
  const months = [...monthSet].sort().map((m) => {
    const version = selectPlanVersionForPeriod(plans, m);
    const goalSf = version ? goalFromTargets(targetsByPlan.get(version.id) || [], m) : null;
    const monthFacts = factsForUserPeriod(facts, userId, m);
    const actualSf = netCreditedSf(monthFacts);
    return monthRow({
      period: m,
      goalSf,
      actualSf,
      actualStatus: actualStatusForFacts(monthFacts)
    });
  });

  const currentMonth = months.find((m) => m.period === selectedPeriod) || monthRow({
    period: selectedPeriod,
    goalSf: null,
    actualSf: null,
    actualStatus: plans.length ? ACTUAL_SF_DEFINITION_STATUS : "NOT_APPLICABLE"
  });
  const ytd = ytdFromMonths(months, selectedPeriod);
  const priorPeriod = months.filter((m) => m.period < selectedPeriod).sort((a, b) => a.period.localeCompare(b.period)).at(-1) || null;
  let accounts = [];
  if (includeAccounts) {
    const monthFacts = factsForUserPeriod(facts, userId, selectedPeriod);
    const scoped = typeof store.listAccountsForUser === "function"
      ? await store.listAccountsForUser(organizationId, userId)
      : [];
    const inScope = new Set(scoped.map((a) => a.id));
    const nameByAd = new Map();
    const nameByProjection = new Map();
    for (const a of scoped) {
      if (a.accountDirectoryAccountId) nameByAd.set(String(a.accountDirectoryAccountId), a.accountName);
      nameByProjection.set(String(a.id), a.accountName);
    }
    accounts = contributeByAccount(monthFacts, { inScopeSalesOpsAccountIds: inScope }).map((row) => ({
      accountDirectoryAccountId: row.accountDirectoryAccountId,
      salesOpsAccountId: row.canOpenWorkspace ? row.salesOpsAccountId : null,
      accountName: row.canOpenWorkspace
        ? nameByProjection.get(row.salesOpsAccountId) || nameByAd.get(row.accountDirectoryAccountId) || null
        : null,
      creditedSf: row.creditedSf,
      sharePct: row.sharePct,
      canOpenWorkspace: row.canOpenWorkspace
    }));
  }

  return {
    period: selectedPeriod,
    currentMonth,
    ytd,
    priorMonthActualSf: priorPeriod ? priorPeriod.actualSf : null,
    rollingThreeMonthActualSf: rollingActual(months, selectedPeriod, 3),
    months,
    accounts,
    actualSfDefinition: ACTUAL_SF_DEFINITION,
    planId: selectPlanVersionForPeriod(plans, selectedPeriod)?.id ?? null
  };
}

export async function assembleTeamPerformance(store, { organizationId, userIds, now, plans: providedPlans = null }) {
  const asOf = now || new Date();
  const current = currentPeriod(asOf);
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { period: current, rows: [] };
  const allPlans = (providedPlans || (await store.listPlansForOrg(organizationId))).filter(
    (p) => ids.includes(String(p.userId)) && p.publishedAt && ["active", "approved", "superseded"].includes(p.status)
  );
  const facts = typeof store.listAttributionFacts === "function"
    ? await store.listAttributionFacts(organizationId, { userIds: ids })
    : [];
  const planIds = [...new Set(allPlans.map((p) => p.id))];
  const allTargets =
    typeof store.listPeriodTargetsForPlanIds === "function"
      ? await store.listPeriodTargetsForPlanIds(organizationId, planIds)
      : [];
  const targetsByPlan = new Map();
  for (const row of allTargets) {
    if (!targetsByPlan.has(row.planId)) targetsByPlan.set(row.planId, []);
    targetsByPlan.get(row.planId).push(row);
  }
  const plansByUser = new Map();
  for (const plan of allPlans) {
    if (!plansByUser.has(plan.userId)) plansByUser.set(plan.userId, []);
    plansByUser.get(plan.userId).push(plan);
  }

  const rows = ids.map((userId) => {
    const plans = plansByUser.get(userId) || [];
    const version = selectPlanVersionForPeriod(plans, current);
    const goalSf = version ? goalFromTargets(targetsByPlan.get(version.id) || [], current) : null;
    const monthFacts = factsForUserPeriod(facts, userId, current);
    const actualSf = netCreditedSf(monthFacts);
    const month = monthRow({
      period: current,
      goalSf,
      actualSf,
      actualStatus: actualStatusForFacts(monthFacts)
    });
    const yearStart = `${current.slice(0, 4)}-01`;
    const ytdMonths = enumerateMonths(yearStart, current).map((m) => {
      const v = selectPlanVersionForPeriod(plans, m);
      return monthRow({
        period: m,
        goalSf: v ? goalFromTargets(targetsByPlan.get(v.id) || [], m) : null,
        actualSf: netCreditedSf(factsForUserPeriod(facts, userId, m)),
        actualStatus: actualStatusForFacts(factsForUserPeriod(facts, userId, m))
      });
    });
    const ytd = ytdFromMonths(ytdMonths, current);
    return {
      userId,
      period: current,
      goalSf: month.goalSf,
      actualSf: month.actualSf,
      varianceSf: month.varianceSf,
      attainmentPct: month.attainmentPct,
      actualStatus: month.actualStatus,
      ytdGoalSf: ytd.goalSf,
      ytdActualSf: ytd.actualSf,
      ytdVarianceSf: ytd.varianceSf,
      ytdAttainmentPct: ytd.attainmentPct,
      planId: version?.id ?? null
    };
  });
  return { period: current, rows, actualSfDefinition: ACTUAL_SF_DEFINITION };
}
