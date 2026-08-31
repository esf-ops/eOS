/**
 * Deterministic Sales Ops account-book classification for plan authoring.
 * Role (strategic) and health (attention) are independent dimensions.
 * Does not mutate source accounts, attribution facts, or identity.
 * QuickBooks is not required. Missing identity is a data gap, never zero.
 */

import { addMonths, currentPeriod, enumerateMonths, periodFromDate } from "./salesOpsMonths.mjs";
import { netCreditedSf } from "./salesOpsAttribution.mjs";

export const ACCOUNT_INTELLIGENCE_VERSION = "sales_account_intelligence_v1";

export const ACCOUNT_ROLES = Object.freeze(["ANCHOR", "GROWTH_OPPORTUNITY", "REACTIVATION", "NEW_UNPROVEN"]);
export const ACCOUNT_HEALTHS = Object.freeze(["HEALTHY", "WATCH", "NEEDS_ATTENTION", "DATA_GAP"]);

export const PRODUCTION_UNAVAILABLE_IDENTITY = "IDENTITY_APPROVAL_REQUIRED";
export const PRODUCTION_NO_EVIDENCE = "NO_PRODUCTION_EVIDENCE";
export const PRODUCTION_AVAILABLE = "AVAILABLE";

/**
 * Governed v1 account-intelligence ruleset.
 * Not compensation policy. Thresholds live here — not in frontend code.
 */
export const ACCOUNT_INTELLIGENCE_RULESET = Object.freeze({
  version: ACCOUNT_INTELLIGENCE_VERSION,
  status: "governed_v1",
  lookbackMonths: 6,
  anchorProducingMonths: 5,
  comparisonWindowDays: 90,
  growthPct: 15,
  watchDeclinePct: 15,
  attentionDeclinePct: 25,
  reactivationDays: 120,
  growthMinPriorSf: 100
});

/** @deprecated Use ACCOUNT_INTELLIGENCE_RULESET */
export const ACCOUNT_INTELLIGENCE_THRESHOLDS = ACCOUNT_INTELLIGENCE_RULESET;

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

function daysBetween(fromDay, toDay) {
  const a = Date.parse(`${fromDay}T00:00:00.000Z`);
  const b = Date.parse(`${toDay}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
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

function periodEndDate(period) {
  const p = String(period || "").trim();
  if (!/^\d{4}-\d{2}$/.test(p)) return "";
  const [y, m] = p.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${p}-${String(last).padStart(2, "0")}`;
}

function lastPositiveFactDay(facts) {
  let last = "";
  for (const fact of facts || []) {
    const n = Number(fact.creditedSf);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (String(fact.status || "credited") === "reversed") continue;
    const day = parseDay(fact.qualifyingDate) || periodEndDate(fact.performanceMonth);
    if (day && day > last) last = day;
  }
  return last || null;
}

export function roleLabel(role) {
  const map = {
    ANCHOR: "Anchor",
    GROWTH_OPPORTUNITY: "Growth opportunity",
    REACTIVATION: "Reactivation",
    NEW_UNPROVEN: "New / unproven"
  };
  return map[role] || null;
}

export function healthLabel(health) {
  const map = {
    HEALTHY: "Healthy",
    WATCH: "Watch",
    NEEDS_ATTENTION: "Needs attention",
    DATA_GAP: "Data gap"
  };
  return map[health] || health;
}

function resolveRuleset(thresholds) {
  return { ...ACCOUNT_INTELLIGENCE_RULESET, ...(thresholds || {}) };
}

function dayWord(n) {
  return Math.abs(n) === 1 ? "day" : "days";
}

export function classifyAccountEvidence(account, facts, { asOf = new Date(), thresholds = ACCOUNT_INTELLIGENCE_RULESET } = {}) {
  const cfg = resolveRuleset(thresholds);
  const asOfDay = typeof asOf === "string" ? parseDay(asOf) || String(asOf).slice(0, 10) : asOf.toISOString().slice(0, 10);
  const asOfPeriod = currentPeriod(asOfDay);
  const lookback = monthsEndingAt(asOfPeriod, cfg.lookbackMonths);
  const trailingStart = periodFromDate(shiftDays(asOfDay, -cfg.comparisonWindowDays));
  const priorStart = periodFromDate(shiftDays(asOfDay, -(cfg.comparisonWindowDays * 2)));
  const trailingMonths = enumerateMonths(trailingStart, asOfPeriod);
  const priorMonths = enumerateMonths(priorStart, addMonths(trailingStart, -1));
  const byMonth = sfByMonth(facts);
  const hasIdentity = Boolean(String(account?.accountDirectoryAccountId || "").trim());
  const trailingSf = hasIdentity ? windowSf(byMonth, trailingMonths) : null;
  const priorSf = hasIdentity ? windowSf(byMonth, priorMonths) : null;
  const historicalSf = hasIdentity ? netCreditedSf(facts) : null;
  const lastProductionDay = hasIdentity ? lastPositiveFactDay(facts) : null;
  const daysSinceProduction = lastProductionDay ? daysBetween(lastProductionDay, asOfDay) : null;
  const producing = producingMonthCount(byMonth, lookback);
  const change = pctChange(trailingSf, priorSf);
  const nextContact = parseDay(account?.nextContact);
  const lastContact = parseDay(account?.lastContact);
  const milestone = String(account?.nextStrategicMilestone || "").trim();
  const overdueDays = nextContact && nextContact < asOfDay ? daysBetween(nextContact, asOfDay) : null;
  const staleDays = lastContact ? daysBetween(lastContact, asOfDay) : null;
  const staleContact = staleDays != null && staleDays >= cfg.comparisonWindowDays;
  const trend =
    change == null ? "unknown" : change <= -cfg.watchDeclinePct ? "down" : change >= cfg.growthPct ? "up" : "stable";

  const reasons = [];
  const roleReasonCodes = [];
  const healthReasonCodes = [];

  if (!hasIdentity) {
    reasons.push("Production unavailable — identity review required");
    return {
      suggestedRole: null,
      suggestedHealth: "DATA_GAP",
      reasonCodes: ["identity_review_required"],
      roleReasonCodes: [],
      healthReasonCodes: ["identity_review_required"],
      reasons,
      reasonCopy: reasons.join(" · "),
      productionStatus: PRODUCTION_UNAVAILABLE_IDENTITY,
      trailingCompletedSf: null,
      historicalCompletedSf: null,
      trend: "unknown",
      producingMonths: 0,
      lookbackMonths: lookback.length,
      changePct: null,
      overdueContact: Boolean(overdueDays),
      overdueDays,
      lastContact: lastContact || account?.lastContact || null,
      nextContact: nextContact || account?.nextContact || null
    };
  }

  const dormant =
    historicalSf != null && historicalSf > 0 && daysSinceProduction != null && daysSinceProduction >= cfg.reactivationDays;
  let suggestedRole = "NEW_UNPROVEN";
  if (dormant) {
    suggestedRole = "REACTIVATION";
    roleReasonCodes.push("dormant_historical_producer");
    reasons.push(`No completed-install production in ${cfg.reactivationDays} days`);
  } else if (producing >= cfg.anchorProducingMonths) {
    suggestedRole = "ANCHOR";
    roleReasonCodes.push("anchor_producing_base");
    reasons.push(`Produced in ${producing} of last ${lookback.length} months`);
  } else if (
    trailingSf != null &&
    priorSf != null &&
    priorSf >= cfg.growthMinPriorSf &&
    change != null &&
    change >= cfg.growthPct
  ) {
    suggestedRole = "GROWTH_OPPORTUNITY";
    roleReasonCodes.push("trailing_upside");
    reasons.push(`Trailing ${cfg.comparisonWindowDays}-day SF up ${change}%`);
  } else {
    roleReasonCodes.push(historicalSf == null ? "insufficient_production_history" : "limited_recent_production");
    reasons.push(
      historicalSf == null
        ? "Not enough completed-install history to determine a strategic role"
        : "Some production history, but not yet an Anchor, Growth, or Reactivation pattern"
    );
  }

  if (change != null && change <= -cfg.attentionDeclinePct) {
    reasons.push(`Trailing ${cfg.comparisonWindowDays}-day SF down ${Math.abs(change)}%`);
  } else if (change != null && change <= -cfg.watchDeclinePct) {
    reasons.push(`Trailing ${cfg.comparisonWindowDays}-day SF down ${Math.abs(change)}%`);
  }
  if (overdueDays != null) reasons.push(`Next contact overdue ${overdueDays} ${dayWord(overdueDays)}`);
  if (staleContact) reasons.push(`Last contact ${staleDays} ${dayWord(staleDays)} ago`);
  if (!milestone) reasons.push("No next strategic milestone");

  let suggestedHealth = "HEALTHY";
  if (change != null && change <= -cfg.attentionDeclinePct) {
    suggestedHealth = "NEEDS_ATTENTION";
    healthReasonCodes.push("trailing_decline");
  } else if (dormant) {
    suggestedHealth = "NEEDS_ATTENTION";
    healthReasonCodes.push("dormant_historical_producer");
  } else {
    const watch = [];
    if (change != null && change <= -cfg.watchDeclinePct) watch.push("watch_decline");
    if (overdueDays != null) watch.push("contact_overdue");
    if (staleContact) watch.push("stale_contact");
    if (watch.length) {
      suggestedHealth = "WATCH";
      healthReasonCodes.push(...watch);
    } else {
      healthReasonCodes.push("no_attention_signal");
    }
  }

  return {
    suggestedRole,
    suggestedHealth,
    reasonCodes: [...roleReasonCodes, ...healthReasonCodes],
    roleReasonCodes,
    healthReasonCodes,
    reasons,
    reasonCopy: reasons.join(" · "),
    productionStatus: historicalSf == null && trailingSf == null ? PRODUCTION_NO_EVIDENCE : PRODUCTION_AVAILABLE,
    trailingCompletedSf: trailingSf,
    historicalCompletedSf: historicalSf,
    trend,
    producingMonths: producing,
    lookbackMonths: lookback.length,
    changePct: change,
    overdueContact: overdueDays != null,
    overdueDays,
    lastContact: lastContact || account?.lastContact || null,
    nextContact: nextContact || account?.nextContact || null
  };
}

export function migrateLegacyCategory(category) {
  const value = String(category || "").trim();
  if (ACCOUNT_ROLES.includes(value)) return { role: value, health: null };
  if (value === "NEEDS_ATTENTION" || value === "WATCH" || value === "HEALTHY" || value === "DATA_GAP") {
    return { role: null, health: value };
  }
  if (value === "IDENTITY_DATA_GAP") return { role: null, health: "DATA_GAP" };
  return { role: null, health: null };
}

export function accountPriorityRank(row) {
  const role = row?.appliedRole || null;
  const health = row?.appliedHealth || null;
  if (health === "DATA_GAP" || !role) return 70;
  if (role === "ANCHOR" && health === "NEEDS_ATTENTION") return 10;
  if (role === "ANCHOR" && health === "WATCH") return 15;
  if (role === "GROWTH_OPPORTUNITY" && health === "NEEDS_ATTENTION") return 20;
  if (role === "REACTIVATION") return 30;
  if (role === "GROWTH_OPPORTUNITY") return 40;
  if (role === "ANCHOR") return 50;
  if (role === "NEW_UNPROVEN") return 60;
  return 80;
}

export function sortBookAccounts(rows) {
  return [...(rows || [])].sort((a, b) => {
    const rank = accountPriorityRank(a) - accountPriorityRank(b);
    if (rank !== 0) return rank;
    return String(a.accountName || "").localeCompare(String(b.accountName || ""));
  });
}

export function filterBookAccounts(rows, { role = "", health = "" } = {}) {
  return (rows || []).filter((row) => {
    if (role && row.appliedRole !== role) return false;
    if (health && row.appliedHealth !== health) return false;
    return true;
  });
}

export function dtoBookAccount(account, classified, { overrideRole = null, overrideHealth = null, selected = false } = {}) {
  const roleOk = ACCOUNT_ROLES.includes(overrideRole);
  const healthOk = ACCOUNT_HEALTHS.includes(overrideHealth);
  const appliedRole = roleOk ? overrideRole : classified.suggestedRole;
  const appliedHealth = healthOk ? overrideHealth : classified.suggestedHealth;
  return {
    salesOpsAccountId: account.id,
    accountName: account.accountName,
    market: account.market || null,
    branch: account.branch || null,
    suggestedRole: classified.suggestedRole,
    suggestedHealth: classified.suggestedHealth,
    appliedRole,
    appliedHealth,
    overrideRole: roleOk ? overrideRole : null,
    overrideHealth: healthOk ? overrideHealth : null,
    roleLabel: roleLabel(appliedRole) || "Role unavailable",
    healthLabel: healthLabel(appliedHealth),
    priorityRank: 0,
    reasonCodes: classified.reasonCodes || [],
    reasons: classified.reasons || [],
    reasonCopy: classified.reasonCopy,
    trailingCompletedSf: classified.trailingCompletedSf,
    productionStatus: classified.productionStatus,
    trend: classified.trend,
    producingMonths: classified.producingMonths,
    lookbackMonths: classified.lookbackMonths,
    changePct: classified.changePct,
    overdueDays: classified.overdueDays ?? null,
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
  const parsed = readPlanBook({ planBook });
  const selectedIds = new Set(parsed.selectedAccountIds);
  const rows = [];
  for (const account of accounts || []) {
    const ad = String(account.accountDirectoryAccountId || "").trim();
    const scopedFacts = (facts || []).filter((f) => {
      if (salespersonUserId && String(f.salespersonUserId) !== String(salespersonUserId)) return false;
      if (!ad) return false;
      return String(f.accountDirectoryAccountId) === ad;
    });
    const classified = classifyAccountEvidence(account, scopedFacts, { asOf, thresholds });
    const dto = dtoBookAccount(account, classified, {
      overrideRole: parsed.roleOverrides[String(account.id)] || null,
      overrideHealth: parsed.healthOverrides[String(account.id)] || null,
      selected: selectedIds.has(String(account.id))
    });
    dto.priorityRank = accountPriorityRank(dto);
    rows.push(dto);
  }
  const sorted = sortBookAccounts(rows);
  const roleCounts = Object.fromEntries(ACCOUNT_ROLES.map((c) => [c, 0]));
  roleCounts.UNCLASSIFIED = 0;
  const healthCounts = Object.fromEntries(ACCOUNT_HEALTHS.map((c) => [c, 0]));
  for (const row of sorted) {
    if (row.appliedRole) roleCounts[row.appliedRole] = (roleCounts[row.appliedRole] || 0) + 1;
    else roleCounts.UNCLASSIFIED += 1;
    healthCounts[row.appliedHealth] = (healthCounts[row.appliedHealth] || 0) + 1;
  }
  const ruleset = resolveRuleset(thresholds);
  return {
    ruleset,
    thresholds: ruleset,
    accounts: sorted,
    roleCounts,
    healthCounts,
    counts: { ...roleCounts, ...healthCounts },
    identityGapCount: sorted.filter((r) => r.suggestedHealth === "DATA_GAP").length,
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
  const roleOverrides = planBook.roleOverrides && typeof planBook.roleOverrides === "object" ? { ...planBook.roleOverrides } : {};
  const healthOverrides = planBook.healthOverrides && typeof planBook.healthOverrides === "object" ? { ...planBook.healthOverrides } : {};
  const legacy = planBook.categoryOverrides && typeof planBook.categoryOverrides === "object" ? planBook.categoryOverrides : {};
  for (const [id, category] of Object.entries(legacy)) {
    const mapped = migrateLegacyCategory(category);
    if (mapped.role && roleOverrides[id] == null) roleOverrides[id] = mapped.role;
    if (mapped.health && healthOverrides[id] == null) healthOverrides[id] = mapped.health;
  }
  return {
    selectedAccountIds: Array.isArray(planBook.selectedAccountIds) ? planBook.selectedAccountIds.map(String) : [],
    roleOverrides,
    healthOverrides,
    categoryOverrides: legacy
  };
}
