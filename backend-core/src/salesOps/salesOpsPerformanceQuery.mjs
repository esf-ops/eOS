/**
 * Assemble Sales Ops performance DTOs from attribution facts and optional published plan months.
 * Actual SF is independent of Goal. Missing Goal stays unavailable; measured empty months are zero
 * only after attribution is active for that salesperson.
 */

import { ACTUAL_SF_DEFINITION_STATUS, monthRow, rollingActual, ytdFromMonths } from "./salesOpsPerformanceMath.mjs";
import { contributeByAccount, factsForUserPeriod, netCreditedSf, selectPlanVersionForPeriod } from "./salesOpsAttribution.mjs";
import { currentPeriod, enumerateMonths } from "./salesOpsMonths.mjs";
import { MORAWARE_EXTERNAL_SYSTEM, QUICKBOOKS_EXTERNAL_SYSTEM, summarizeExactIdentity } from "./salesOpsIdentityAudit.mjs";
import { SALES_OPS_MONDAY_EXTERNAL_SYSTEM } from "./salesOpsConstants.js";
import {
  COMPLETED_INSTALLATION_SF,
  PRODUCTION_COMPLETED_INSTALLATION_SUPPORT,
  REJECTED_SF_PROXIES,
  REQUIRED_COMPLETED_INSTALLATION_EVIDENCE
} from "./salesOpsCompletedInstallationSf.mjs";
import { attributionIsActive, salesOpsOperatingReadiness } from "./salesOpsReadiness.mjs";

const ACTUAL_SF_DEFINITION_BASE = Object.freeze({
  candidateMetric: COMPLETED_INSTALLATION_SF,
  source: "moraware_view_219",
  qualifyingEvent: "First Install in Job",
  qualifyingDate: "earliest qualifying First Install in Job Date",
  sfField: "moraware_prepared_completed_install_form_facts.sqft",
  jobIdentity: "moraware_prepared_completed_install_form_facts.source_job_id",
  formIdentity: "moraware_prepared_completed_install_form_facts.source_form_id",
  requiredEvidence: REQUIRED_COMPLETED_INSTALLATION_EVIDENCE,
  missingEvidence: PRODUCTION_COMPLETED_INSTALLATION_SUPPORT.missing,
  exclusions: "FORM_IDENTITY_UNRESOLVED holdout; Scheduled/Confirmed/Estimate excluded",
  reversalSemantics: "explicit_reversal_row_on_sales_ops_sf_attribution_facts",
  confidence: "source_proven_identity_gated",
  rejectedProxies: REJECTED_SF_PROXIES
});

const NOTE_UNAVAILABLE =
  "View 219 typed completed-install form facts are the governed source. Attribution facts are not created until Account Directory identity and historical salesperson evidence exist. Unavailable stays unavailable, not zero.";
const NOTE_AVAILABLE =
  "View 219 typed completed-install form facts are the governed source. Actual SF is independent of a published Goal. Months with no credited events are measured zero after attribution is active. Unresolved sibling accounts do not hide credited production.";

export function actualSfDefinitionDto(attributionActive) {
  return {
    ...ACTUAL_SF_DEFINITION_BASE,
    status: attributionActive ? "AVAILABLE" : ACTUAL_SF_DEFINITION_STATUS,
    note: attributionActive ? NOTE_AVAILABLE : NOTE_UNAVAILABLE
  };
}

/** @deprecated Use actualSfDefinitionDto(attributionActive). Constant kept for callers that inspect the candidate metric. */
export const ACTUAL_SF_DEFINITION = Object.freeze({
  ...ACTUAL_SF_DEFINITION_BASE,
  status: ACTUAL_SF_DEFINITION_STATUS,
  note: NOTE_UNAVAILABLE
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

export function measuredActualForMonth(monthFacts, { attributionActive, period, current }) {
  const actualSf = netCreditedSf(monthFacts);
  if (actualSf != null) return { actualSf, actualStatus: "AVAILABLE" };
  if (String(period) > String(current)) return { actualSf: null, actualStatus: "NOT_APPLICABLE" };
  if (attributionActive) return { actualSf: 0, actualStatus: "AVAILABLE" };
  return { actualSf: null, actualStatus: ACTUAL_SF_DEFINITION_STATUS };
}

function performanceMonthSet({ plans, facts, current, selectedPeriod }) {
  const monthSet = new Set();
  const yearStart = `${String(current).slice(0, 4)}-01`;
  for (const m of enumerateMonths(yearStart, current)) monthSet.add(m);
  for (const plan of plans || []) {
    const start = plan.effectiveStartDate || plan.startDate;
    const end = plan.effectiveEndDate || plan.endDate;
    if (!start || !end) continue;
    for (const m of enumerateMonths(start, end)) monthSet.add(m);
  }
  for (const fact of facts || []) {
    const period = String(fact.performanceMonth || "").trim();
    if (/^\d{4}-\d{2}$/.test(period)) monthSet.add(period);
  }
  if (selectedPeriod) monthSet.add(String(selectedPeriod));
  return [...monthSet].sort();
}

function nameMaps(scoped) {
  const nameByAd = new Map();
  const nameByProjection = new Map();
  for (const a of scoped || []) {
    if (a.accountDirectoryAccountId) nameByAd.set(String(a.accountDirectoryAccountId), a.accountName);
    nameByProjection.set(String(a.id), a.accountName);
  }
  return { nameByAd, nameByProjection, inScope: new Set((scoped || []).map((a) => a.id)) };
}

function contributionRows(facts, scoped) {
  const { nameByAd, nameByProjection, inScope } = nameMaps(scoped);
  return contributeByAccount(facts, { inScopeSalesOpsAccountIds: inScope }).map((row) => ({
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
  const attributionActive = attributionIsActive(facts);
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

  const months = performanceMonthSet({ plans, facts, current, selectedPeriod }).map((m) => {
    const version = selectPlanVersionForPeriod(plans, m);
    const goalSf = version ? goalFromTargets(targetsByPlan.get(version.id) || [], m) : null;
    const monthFacts = factsForUserPeriod(facts, userId, m);
    const measured = measuredActualForMonth(monthFacts, { attributionActive, period: m, current });
    return monthRow({
      period: m,
      goalSf,
      actualSf: measured.actualSf,
      actualStatus: measured.actualStatus
    });
  });

  const currentMonth = months.find((m) => m.period === selectedPeriod) || monthRow({
    period: selectedPeriod,
    goalSf: null,
    actualSf: measuredActualForMonth([], { attributionActive, period: selectedPeriod, current }).actualSf,
    actualStatus: measuredActualForMonth([], { attributionActive, period: selectedPeriod, current }).actualStatus
  });
  const ytd = ytdFromMonths(months, selectedPeriod);
  const priorPeriod = months.filter((m) => m.period < selectedPeriod).sort((a, b) => a.period.localeCompare(b.period)).at(-1) || null;
  let accounts = [];
  let ytdAccounts = [];
  if (includeAccounts) {
    const monthFacts = factsForUserPeriod(facts, userId, selectedPeriod);
    const year = String(selectedPeriod).slice(0, 4);
    const ytdFacts = (facts || []).filter((f) => {
      const p = String(f.performanceMonth || "");
      return String(f.salespersonUserId) === String(userId) && p.startsWith(year) && p <= selectedPeriod;
    });
    const scoped = typeof store.listAccountsForUser === "function"
      ? await store.listAccountsForUser(organizationId, userId)
      : [];
    accounts = contributionRows(monthFacts, scoped);
    ytdAccounts = contributionRows(ytdFacts, scoped);
  }

  const publishedPlan = selectPlanVersionForPeriod(plans, selectedPeriod) || plans[0] || null;
  const readiness = salesOpsOperatingReadiness({
    facts,
    publishedPlan,
    commissionEnabled: Boolean(publishedPlan?.commissionEnabled),
    accounts: []
  });

  return {
    period: selectedPeriod,
    currentMonth,
    ytd,
    priorMonthActualSf: priorPeriod ? priorPeriod.actualSf : null,
    rollingThreeMonthActualSf: rollingActual(months, selectedPeriod, 3),
    months,
    accounts,
    ytdAccounts,
    actualSfDefinition: actualSfDefinitionDto(attributionActive),
    planId: publishedPlan?.id ?? null,
    readiness
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
    const userFacts = (facts || []).filter((f) => String(f.salespersonUserId) === String(userId));
    const attributionActive = attributionIsActive(userFacts);
    const version = selectPlanVersionForPeriod(plans, current);
    const goalSf = version ? goalFromTargets(targetsByPlan.get(version.id) || [], current) : null;
    const monthFacts = factsForUserPeriod(facts, userId, current);
    const measured = measuredActualForMonth(monthFacts, { attributionActive, period: current, current });
    const month = monthRow({
      period: current,
      goalSf,
      actualSf: measured.actualSf,
      actualStatus: measured.actualStatus
    });
    const yearStart = `${current.slice(0, 4)}-01`;
    const ytdMonths = enumerateMonths(yearStart, current).map((m) => {
      const v = selectPlanVersionForPeriod(plans, m);
      const monthMeasured = measuredActualForMonth(factsForUserPeriod(facts, userId, m), {
        attributionActive,
        period: m,
        current
      });
      return monthRow({
        period: m,
        goalSf: v ? goalFromTargets(targetsByPlan.get(v.id) || [], m) : null,
        actualSf: monthMeasured.actualSf,
        actualStatus: monthMeasured.actualStatus
      });
    });
    const ytd = ytdFromMonths(ytdMonths, current);
    const readiness = salesOpsOperatingReadiness({
      facts: userFacts,
      publishedPlan: version,
      commissionEnabled: Boolean(version?.commissionEnabled)
    });
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
      planId: version?.id ?? null,
      readiness
    };
  });
  const anyActive = rows.some((r) => r.readiness?.attributionActive);
  return { period: current, rows, actualSfDefinition: actualSfDefinitionDto(anyActive) };
}
