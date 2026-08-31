/**
 * Deterministic Sales Ops account-book classification for plan authoring.
 * Does not mutate source accounts, attribution facts, or identity.
 * QuickBooks is not required. Missing identity is a data gap, never zero.
 */

import { addMonths, currentPeriod, enumerateMonths, periodFromDate } from "./salesOpsMonths.mjs";
import { netCreditedSf } from "./salesOpsAttribution.mjs";

export const ACCOUNT_INTELLIGENCE_CATEGORIES = Object.freeze([
  "ANCHOR",
  "GROWTH_OPPORTUNITY",
  "NEEDS_ATTENTION",
  "REACTIVATION",
  "NEW_UNPROVEN",
  "IDENTITY_DATA_GAP"
]);

export const PRODUCTION_UNAVAILABLE_IDENTITY = "IDENTITY_APPROVAL_REQUIRED";
export const PRODUCTION_NO_EVIDENCE = "NO_PRODUCTION_EVIDENCE";
export const PRODUCTION_AVAILABLE = "AVAILABLE";

/**
 * Proposed defaults for plan-authoring suggestions. Not compensation policy.
 * Not a locked business rule until an operator confirms them.
 */
export const ACCOUNT_INTELLIGENCE_THRESHOLDS = Object.freeze({
  status: "proposed_default",
  lookbackMonths: 6,
  anchorProducingMonths: 5,
  trailingWindowDays: 90,
  dormantDays: 120,
  declinePct: 25,
  growthPct: 15,
  note: "Suggested classification defaults for Plan Builder. Operators may change them; they do not rewrite source facts."
});

export const WORKING_TARGET_HORIZON_END = "2027-12-31";
export const WORKING_NORTH_STAR_SF = 2500;
export const WORKING_MILESTONE_ANCHORS = Object.freeze([
  { period: "2027-01", sf: 1000 },
  { period: "2027-03", sf: 1500 },
  { period: "2027-09", sf: 2000 },
  { period: "2027-12", sf: 2500 }
]);

export const PLAN_ACTIVITY_KPI_CATALOG = Object.freeze([
  {
    metricKey: "meaningful_touches",
    label: "Meaningful customer touches",
    cadence: "weekly",
    unit: "count_per_week",
    defaultValue: 15
  },
  {
    metricKey: "meetings",
    label: "Meetings that move an account forward",
    cadence: "monthly",
    unit: "count_per_month",
    defaultValue: 6
  },
  {
    metricKey: "new_account_meetings",
    label: "New account meetings",
    cadence: "monthly",
    unit: "count_per_month",
    defaultValue: null
  },
  {
    metricKey: "strategic_account_reviews",
    label: "Strategic account reviews",
    cadence: "monthly",
    unit: "count_per_month",
    defaultValue: null
  }
]);

export const DEFAULT_PLAN_RHYTHMS = Object.freeze({
  weekly: "Account and pipeline check-in. Confirm top priorities. Surface blocked opportunities.",
  monthly:
    "Review Goal vs Actual SF. Inspect account contribution. Act on accounts needing attention. Track new, growth, and reactivation progress.",
  quarterly: "Revisit territory strategy and account segmentation. Discuss whether a plan revision is appropriate."
});

function roundSf(n) {
  return Math.round(Number(n) * 100) / 100;
}

function parseDay(value) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

function shiftDays(day, delta) {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function pctChange(current, prior) {
  if (current == null || prior == null) return null;
  if (prior === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
  return Math.round(((current - prior) / Math.abs(prior)) * 1000) / 10;
}

function monthsEndingAt(endPeriod, count) {
  const end = periodFromDate(endPeriod);
  if (!end || count < 1) return [];
  const start = addMonths(end, -(count - 1));
  return enumerateMonths(start, end);
}

function sfByMonth(facts) {
  const map = new Map();
  for (const fact of facts || []) {
    const period = String(fact.performanceMonth || "");
    if (!period) continue;
    const n = Number(fact.creditedSf);
    if (!Number.isFinite(n)) continue;
    if (String(fact.status || "credited") === "reversed" && fact.creditedSf == null) continue;
    map.set(period, roundSf((map.get(period) || 0) + n));
  }
  return map;
}

function windowSf(byMonth, periods) {
  let total = 0;
  let known = 0;
  for (const period of periods) {
    if (!byMonth.has(period)) continue;
    total += byMonth.get(period);
    known += 1;
  }
  if (!known) return null;
  return roundSf(total);
}

function producingMonthCount(byMonth, periods) {
  return periods.filter((p) => (byMonth.get(p) || 0) > 0).length;
}

export function categoryLabel(category) {
  const map = {
    ANCHOR: "Anchor",
    GROWTH_OPPORTUNITY: "Growth opportunity",
    NEEDS_ATTENTION: "Needs attention",
    REACTIVATION: "Reactivation",
    NEW_UNPROVEN: "New / unproven",
    IDENTITY_DATA_GAP: "Identity / data gap"
  };
  return map[category] || category;
}

export function classifyAccountEvidence(account, facts, { asOf = new Date(), thresholds = ACCOUNT_INTELLIGENCE_THRESHOLDS } = {}) {
  const cfg = { ...ACCOUNT_INTELLIGENCE_THRESHOLDS, ...(thresholds || {}) };
  const asOfDay = typeof asOf === "string" ? parseDay(asOf) || String(asOf).slice(0, 10) : asOf.toISOString().slice(0, 10);
  const asOfPeriod = currentPeriod(asOfDay);
  const lookback = monthsEndingAt(asOfPeriod, cfg.lookbackMonths);
  const trailingStart = periodFromDate(shiftDays(asOfDay, -cfg.trailingWindowDays));
  const priorStart = periodFromDate(shiftDays(asOfDay, -cfg.trailingWindowDays * 2));
  const trailingMonths = enumerateMonths(trailingStart, asOfPeriod);
  const priorMonths = enumerateMonths(priorStart, addMonths(trailingStart, -1));
  const byMonth = sfByMonth(facts);
  const hasIdentity = Boolean(String(account?.accountDirectoryAccountId || "").trim());
  const trailingSf = hasIdentity ? windowSf(byMonth, trailingMonths) : null;
  const priorSf = hasIdentity ? windowSf(byMonth, priorMonths) : null;
  const historicalSf = hasIdentity ? netCreditedSf(facts) : null;
  const recentDormantMonths = monthsEndingAt(asOfPeriod, Math.max(1, Math.ceil(cfg.dormantDays / 30)));
  const recentSf = hasIdentity ? windowSf(byMonth, recentDormantMonths) : null;
  const producing = producingMonthCount(byMonth, lookback);
  const change = pctChange(trailingSf, priorSf);
  const nextContact = parseDay(account?.nextContact);
  const lastContact = parseDay(account?.lastContact);
  const overdue = Boolean(nextContact && nextContact < asOfDay);
  const trend = change == null ? "unknown" : change <= -cfg.declinePct ? "down" : change >= cfg.growthPct ? "up" : "stable";

  if (!hasIdentity) {
    return {
      suggestedCategory: "IDENTITY_DATA_GAP",
      reasonCode: "identity_review_required",
      reasonCopy: "Production unavailable — identity review required",
      productionStatus: PRODUCTION_UNAVAILABLE_IDENTITY,
      trailingCompletedSf: null,
      historicalCompletedSf: null,
      trend: "unknown",
      producingMonths: 0,
      lookbackMonths: lookback.length,
      changePct: null,
      overdueContact: overdue,
      lastContact: lastContact || account?.lastContact || null,
      nextContact: nextContact || account?.nextContact || null
    };
  }

  const base = {
    productionStatus: historicalSf == null && trailingSf == null ? PRODUCTION_NO_EVIDENCE : PRODUCTION_AVAILABLE,
    trailingCompletedSf: trailingSf,
    historicalCompletedSf: historicalSf,
    trend,
    producingMonths: producing,
    lookbackMonths: lookback.length,
    changePct: change,
    overdueContact: overdue,
    lastContact: lastContact || account?.lastContact || null,
    nextContact: nextContact || account?.nextContact || null
  };

  if (historicalSf != null && historicalSf > 0 && (recentSf == null || recentSf <= 0)) {
    return {
      ...base,
      suggestedCategory: "REACTIVATION",
      reasonCode: "dormant_historical_producer",
      reasonCopy: `No completed-install SF in ${cfg.dormantDays} days · historical producing account`
    };
  }

  if (overdue || (change != null && change <= -cfg.declinePct)) {
    const parts = [];
    if (change != null && change <= -cfg.declinePct) parts.push(`Trailing ${cfg.trailingWindowDays}-day SF down ${Math.abs(change)}%`);
    if (overdue) parts.push("next contact overdue");
    return {
      ...base,
      suggestedCategory: "NEEDS_ATTENTION",
      reasonCode: overdue && change != null && change <= -cfg.declinePct ? "decline_and_overdue" : overdue ? "contact_overdue" : "trailing_decline",
      reasonCopy: parts.join(" · ")
    };
  }

  if (producing >= cfg.anchorProducingMonths && (change == null || change > -cfg.declinePct)) {
    return {
      ...base,
      suggestedCategory: "ANCHOR",
      reasonCode: "stable_producing_base",
      reasonCopy: `Produced in ${producing} of last ${lookback.length} months · stable trailing SF`
    };
  }

  if (trailingSf != null && trailingSf > 0 && change != null && change >= cfg.growthPct) {
    return {
      ...base,
      suggestedCategory: "GROWTH_OPPORTUNITY",
      reasonCode: "trailing_upside",
      reasonCopy: `Trailing ${cfg.trailingWindowDays}-day SF up ${change}% · producing account with upside`
    };
  }

  return {
    ...base,
    suggestedCategory: "NEW_UNPROVEN",
    reasonCode: historicalSf == null ? "insufficient_production_history" : "limited_recent_production",
    reasonCopy:
      historicalSf == null
        ? "Recently assigned or not enough completed-install history"
        : "Some production history, but not yet a stable or declining pattern"
  };
}

export function dtoBookAccount(account, classified, { overrideCategory = null, selected = false } = {}) {
  const applied = ACCOUNT_INTELLIGENCE_CATEGORIES.includes(overrideCategory)
    ? overrideCategory
    : classified.suggestedCategory;
  return {
    salesOpsAccountId: account.id,
    accountName: account.accountName,
    market: account.market || null,
    branch: account.branch || null,
    suggestedCategory: classified.suggestedCategory,
    appliedCategory: applied,
    overrideCategory: ACCOUNT_INTELLIGENCE_CATEGORIES.includes(overrideCategory) ? overrideCategory : null,
    categoryLabel: categoryLabel(applied),
    reasonCode: classified.reasonCode,
    reasonCopy: classified.reasonCopy,
    trailingCompletedSf: classified.trailingCompletedSf,
    productionStatus: classified.productionStatus,
    trend: classified.trend,
    lastContact: classified.lastContact,
    nextContact: classified.nextContact,
    nextStrategicMilestone: account.nextStrategicMilestone || null,
    selected: Boolean(selected),
    financialEnrichment: {
      status: "UNAVAILABLE",
      note: "QuickBooks financial enrichment is not required for this classification."
    }
  };
}

export function assembleBookIntelligence(accounts, facts, { asOf, thresholds, planBook = {}, salespersonUserId = null } = {}) {
  const overrides = planBook.categoryOverrides && typeof planBook.categoryOverrides === "object" ? planBook.categoryOverrides : {};
  const selectedIds = new Set((planBook.selectedAccountIds || []).map(String));
  const rows = [];
  for (const account of accounts || []) {
    const ad = String(account.accountDirectoryAccountId || "").trim();
    const scopedFacts = (facts || []).filter((f) => {
      if (salespersonUserId && String(f.salespersonUserId) !== String(salespersonUserId)) return false;
      if (!ad) return false;
      return String(f.accountDirectoryAccountId) === ad;
    });
    const classified = classifyAccountEvidence(account, scopedFacts, { asOf, thresholds });
    rows.push(
      dtoBookAccount(account, classified, {
        overrideCategory: overrides[String(account.id)] || null,
        selected: selectedIds.has(String(account.id))
      })
    );
  }
  rows.sort((a, b) => String(a.accountName).localeCompare(String(b.accountName)));
  const counts = Object.fromEntries(ACCOUNT_INTELLIGENCE_CATEGORIES.map((c) => [c, 0]));
  for (const row of rows) counts[row.appliedCategory] = (counts[row.appliedCategory] || 0) + 1;
  return {
    thresholds: { ...ACCOUNT_INTELLIGENCE_THRESHOLDS, ...(thresholds || {}) },
    accounts: rows,
    counts,
    identityGapCount: rows.filter((r) => r.suggestedCategory === "IDENTITY_DATA_GAP").length,
    financialEnrichmentStatus: "UNAVAILABLE"
  };
}

export function defaultActivityMetricTargets() {
  return PLAN_ACTIVITY_KPI_CATALOG.filter((row) => row.defaultValue != null).map((row, i) => ({
    metricKey: row.metricKey,
    label: row.label,
    unit: row.unit,
    cadence: row.cadence,
    targetValue: row.defaultValue,
    warningThreshold: Math.max(0, Number(row.defaultValue) - 3),
    sourceAuthority: "plan",
    displayOrder: (i + 1) * 10,
    active: true
  }));
}

export function generatePlanCopy({ salespersonName, territoryName, northStarTarget, northStarTargetDate } = {}) {
  const name = String(salespersonName || "This salesperson").trim() || "This salesperson";
  const territory = String(territoryName || "the assigned territory").trim();
  const sf = Number(northStarTarget);
  const sfText = Number.isFinite(sf) && sf > 0 ? `${sf.toLocaleString("en-US")} installed SF / month` : "the published monthly installed-SF goal";
  const by = String(northStarTargetDate || "").slice(0, 7);
  const byText = by ? `by ${by}` : "by the plan end date";
  return {
    introduction: `${name}'s operating plan for ${territory}. North star: ${sfText} ${byText}.`,
    expectations: "Protect the producing base, grow credible upside, and act on accounts that need attention or reactivation.",
    successDefinition: "Success is credited Completed Installation SF from governed Moraware evidence after Account Directory identity is approved. Unavailable production is not treated as zero.",
    coaching: "Use weekly check-ins for priorities and blockers, monthly Goal vs Actual, and quarterly territory strategy."
  };
}

export function readPlanBook(accountExpectations) {
  const raw = accountExpectations && typeof accountExpectations === "object" ? accountExpectations : {};
  const planBook = raw.planBook && typeof raw.planBook === "object" ? raw.planBook : raw;
  return {
    selectedAccountIds: Array.isArray(planBook.selectedAccountIds) ? planBook.selectedAccountIds.map(String) : [],
    categoryOverrides: planBook.categoryOverrides && typeof planBook.categoryOverrides === "object" ? planBook.categoryOverrides : {}
  };
}
