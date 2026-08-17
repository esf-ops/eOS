/**
 * Cadence-aware Finance domain freshness.
 * Intraday domains (revenue_ar, ap, cash) default to 4h.
 * Nightly domains (accounting, master) default to 26h.
 * Metrics must apply the freshness of their owning domain — never a global OR.
 */

import { QB_FINANCE_DOMAINS } from "../quickbooksFinanceFoundation/constants.js";
import { FINANCE_METRIC_STATES } from "./constants.js";

export const DEFAULT_FINANCE_INTRADAY_STALE_AFTER_SECONDS = 4 * 60 * 60;
export const DEFAULT_FINANCE_NIGHTLY_STALE_AFTER_SECONDS = 26 * 60 * 60;
/** @deprecated Prefer DEFAULT_FINANCE_INTRADAY_STALE_AFTER_SECONDS */
export const DEFAULT_FINANCE_STALE_AFTER_SECONDS = DEFAULT_FINANCE_INTRADAY_STALE_AFTER_SECONDS;

export const FINANCE_DOMAIN_CADENCE = Object.freeze({
  master: "nightly",
  accounting: "nightly",
  revenue_ar: "intraday",
  ap: "intraday",
  cash: "intraday"
});

export const FINANCE_DOMAIN_STALE_ENV_KEYS = Object.freeze({
  master: "QB_FINANCE_MASTER_STALE_AFTER_SECONDS",
  accounting: "QB_FINANCE_ACCOUNTING_STALE_AFTER_SECONDS",
  revenue_ar: "QB_FINANCE_REVENUE_AR_STALE_AFTER_SECONDS",
  ap: "QB_FINANCE_AP_STALE_AFTER_SECONDS",
  cash: "QB_FINANCE_CASH_STALE_AFTER_SECONDS"
});

/** Overview / tab metric → Finance sync domain (or sales for Open A/R). */
export const FINANCE_METRIC_FRESHNESS_OWNER = Object.freeze({
  revenue: "accounting",
  gross_profit: "accounting",
  gross_margin_pct: "accounting",
  operating_expenses: "accounting",
  net_income: "accounting",
  open_ap: "ap",
  overdue_ap: "ap",
  /** Bank-type balances live on master today, not cash. */
  cash: "master",
  /** Undeposited / cash events follow cash domain. */
  undeposited: "cash",
  cash_events: "cash",
  /** Finance Open A/R reuses Sales Financial Truth prepared facts. */
  open_ar: "sales",
  overdue_ar: "sales"
});

export function readIntradayStaleAfterSeconds(env = process.env) {
  const n = Number.parseInt(String(env.QB_FINANCE_STALE_AFTER_SECONDS ?? ""), 10);
  if (Number.isFinite(n) && n >= 60) return n;
  return DEFAULT_FINANCE_INTRADAY_STALE_AFTER_SECONDS;
}

/** Back-compat alias used by older imports. */
export function readStaleAfterSeconds(env = process.env) {
  return readIntradayStaleAfterSeconds(env);
}

export function readNightlyStaleAfterSeconds(env = process.env) {
  const n = Number.parseInt(String(env.QB_FINANCE_NIGHTLY_STALE_AFTER_SECONDS ?? ""), 10);
  if (Number.isFinite(n) && n >= 60) return n;
  return DEFAULT_FINANCE_NIGHTLY_STALE_AFTER_SECONDS;
}

/**
 * @param {string} domain
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readDomainStaleAfterSeconds(domain, env = process.env) {
  const key = FINANCE_DOMAIN_STALE_ENV_KEYS[domain];
  if (key) {
    const n = Number.parseInt(String(env[key] ?? ""), 10);
    if (Number.isFinite(n) && n >= 60) return n;
  }
  const cadence = FINANCE_DOMAIN_CADENCE[domain] || "intraday";
  if (cadence === "nightly") return readNightlyStaleAfterSeconds(env);
  return readIntradayStaleAfterSeconds(env);
}

/**
 * Sales Financial Truth freshness for Finance Open A/R (does not change Account 360).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readSalesArStaleAfterSeconds(env = process.env) {
  const n = Number.parseInt(String(env.QB_FINANCIAL_TRUTH_STALE_AFTER_SECONDS ?? ""), 10);
  if (Number.isFinite(n) && n >= 60) return n;
  return readIntradayStaleAfterSeconds(env);
}

function presentationLabel(state, cadence) {
  if (state === FINANCE_METRIC_STATES.AVAILABLE && cadence === "nightly") return "fresh_nightly";
  if (state === FINANCE_METRIC_STATES.AVAILABLE) return "fresh";
  if (state === FINANCE_METRIC_STATES.STALE) return "stale";
  if (state === FINANCE_METRIC_STATES.WARNING) return "warning";
  return "unavailable";
}

/**
 * @param {object|null|undefined} run
 * @param {Date} now
 * @param {number} staleAfterSeconds
 * @param {{ domain?: string, cadence?: string }} [options]
 */
export function domainFreshness(run, now, staleAfterSeconds, options = {}) {
  const domain = options.domain || run?.domain || null;
  const cadence =
    options.cadence || (domain && FINANCE_DOMAIN_CADENCE[domain]) || "intraday";
  if (!run) {
    return {
      domain,
      status: "missing",
      state: FINANCE_METRIC_STATES.UNAVAILABLE,
      cadence,
      stale_after_seconds: staleAfterSeconds,
      last_success_at: null,
      last_completed_at: null,
      coverage_start: null,
      coverage_end: null,
      stale: false,
      warning_count: 0,
      error_summary: null,
      notes: "Awaiting first Finance sync for this domain.",
      presentation: "unavailable"
    };
  }
  const completed = run.completed_at || run.started_at;
  const ageMs = completed ? now.getTime() - new Date(completed).getTime() : null;
  const stale = run.status === "success" && ageMs != null && ageMs / 1000 > staleAfterSeconds;
  let state = FINANCE_METRIC_STATES.AVAILABLE;
  if (run.status === "failed") state = FINANCE_METRIC_STATES.UNAVAILABLE;
  else if (run.status === "running") state = FINANCE_METRIC_STATES.WARNING;
  else if (stale) state = FINANCE_METRIC_STATES.STALE;
  else if (run.status === "partial") state = FINANCE_METRIC_STATES.WARNING;
  const warnings = Array.isArray(run.warnings) ? run.warnings : [];
  return {
    domain: domain || run.domain || null,
    status: run.status,
    state,
    cadence,
    stale_after_seconds: staleAfterSeconds,
    last_success_at: run.status === "success" || run.status === "partial" ? run.completed_at : null,
    last_completed_at: run.completed_at || null,
    coverage_start: run.coverage_start_date || null,
    coverage_end: run.coverage_end_date || null,
    stale,
    warning_count: warnings.length,
    error_summary: run.status === "failed" ? safeErrorSummary(run.error_summary) : null,
    notes: run.status === "failed" ? "Latest Finance refresh failed." : null,
    presentation: presentationLabel(state, cadence)
  };
}

function safeErrorSummary(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (/token|secret|password|service.role/i.test(s)) return "Refresh failed. See operator logs.";
  return s.slice(0, 240);
}

/**
 * Overall summary from already cadence-aware domain states.
 * Does not re-apply a uniform threshold.
 */
export function overallFreshness(domains) {
  const values = Object.values(domains || {});
  if (!values.length) return FINANCE_METRIC_STATES.UNAVAILABLE;
  if (values.every((d) => d.state === FINANCE_METRIC_STATES.UNAVAILABLE)) {
    return FINANCE_METRIC_STATES.UNAVAILABLE;
  }
  if (values.some((d) => d.status === "failed")) return FINANCE_METRIC_STATES.WARNING;
  if (values.some((d) => d.stale === true || d.state === FINANCE_METRIC_STATES.STALE)) {
    return FINANCE_METRIC_STATES.STALE;
  }
  if (values.some((d) => d.state === FINANCE_METRIC_STATES.WARNING)) {
    return FINANCE_METRIC_STATES.WARNING;
  }
  return FINANCE_METRIC_STATES.AVAILABLE;
}

/**
 * Apply one domain's freshness state to a metric. Never uses global OR.
 * @param {object|null|undefined} m
 * @param {string} freshnessState available|stale|warning|unavailable
 */
export function applyFreshness(m, freshnessState) {
  if (!m || m.value == null) return m;
  if (freshnessState === FINANCE_METRIC_STATES.STALE && m.state === FINANCE_METRIC_STATES.AVAILABLE) {
    return { ...m, state: FINANCE_METRIC_STATES.STALE };
  }
  if (freshnessState === FINANCE_METRIC_STATES.WARNING && m.state === FINANCE_METRIC_STATES.AVAILABLE) {
    return { ...m, state: FINANCE_METRIC_STATES.WARNING };
  }
  return m;
}

/**
 * @param {Record<string, object>} domains
 * @param {string} ownerDomain
 */
export function ownerFreshnessState(domains, ownerDomain) {
  if (ownerDomain === "sales") {
    return domains?.sales?.state || FINANCE_METRIC_STATES.AVAILABLE;
  }
  return domains?.[ownerDomain]?.state || FINANCE_METRIC_STATES.UNAVAILABLE;
}

/**
 * Escalate when the prepared fact timestamp is older than the owning domain's
 * stale window — even if the latest sync run itself looks fresh.
 * @param {string} domainState
 * @param {string|null|undefined} factSyncedAt
 * @param {Date} now
 * @param {number} staleAfterSeconds
 */
export function combineFactAndDomainFreshness(domainState, factSyncedAt, now, staleAfterSeconds) {
  if (!factSyncedAt || domainState === FINANCE_METRIC_STATES.UNAVAILABLE) {
    return domainState;
  }
  const ageMs = now.getTime() - new Date(factSyncedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return domainState;
  if (ageMs / 1000 > staleAfterSeconds) {
    if (
      domainState === FINANCE_METRIC_STATES.AVAILABLE ||
      domainState === FINANCE_METRIC_STATES.WARNING
    ) {
      return FINANCE_METRIC_STATES.STALE;
    }
  }
  return domainState;
}

/** Latest synced_at / as_of_captured_at across prepared fact rows. */
export function maxSyncedAt(rows) {
  let max = null;
  for (const row of rows || []) {
    const s = row?.synced_at || row?.as_of_captured_at || null;
    if (!s) continue;
    if (!max || String(s) > String(max)) max = s;
  }
  return max;
}

/**
 * Build cadence-aware domain health map from latest sync runs.
 * @param {Record<string, object|null>} latestByDomain
 * @param {Date} at
 * @param {NodeJS.ProcessEnv} [env]
 * @param {object|null} [salesRun]
 */
export function buildDomainHealthMap(latestByDomain, at, env = process.env, salesRun = null) {
  const domains = {};
  for (const domain of QB_FINANCE_DOMAINS) {
    const staleAfter = readDomainStaleAfterSeconds(domain, env);
    domains[domain] = {
      ...domainFreshness(latestByDomain?.[domain], at, staleAfter, { domain }),
      domain
    };
  }
  if (salesRun !== undefined) {
    const staleAfter = readSalesArStaleAfterSeconds(env);
    domains.sales = {
      ...domainFreshness(salesRun, at, staleAfter, { domain: "sales", cadence: "intraday" }),
      domain: "sales"
    };
    if (!salesRun) {
      domains.sales.notes = "Awaiting first Sales QuickBooks financial sync.";
    }
  }
  return {
    domains,
    freshness: overallFreshness(
      Object.fromEntries(Object.entries(domains).filter(([k]) => k !== "sales"))
    )
  };
}
