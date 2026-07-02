/**
 * Sales Head API — Brain-only aggregates (no Moraware in request path).
 * Mirrors Executive job/sqft patterns: `worksheet_sqft` Rollup currency fields are intentionally null until Quote Platform feeds revenue.
 */

import express from "express";
import { isApplicationRole } from "../auth/eosGovernanceConstants.js";
import {
  ACTIVE_SALES_REPS,
  ACCOUNT_RULES_DOCUMENTATION,
  BRANCH_UNMAPPED,
  SALES_BRANCHES,
  classifySalesJob,
  loadApprovedSalesAttributionMappings,
  methodLabelForDisplay
} from "./salesAttribution.js";
import { loadLatestCompleteImportGroup } from "../moraware/morawareSyncHealth.js";
import { buildCompanyWideSqftActuals, buildProductionReportReconciliation, extractSqftFromMorawareJob } from "./morawareSqftActuals.js";
import { normalizeAccountNameWithoutLocationPrefix } from "./salesAccountNameNormalizer.js";
import {
  executeMorawareSalesQuery,
  extractNotesExcerptFromRawPayload,
  normalizeMorawareQueryFilters
} from "./morawareSalesQuery.js";
import { salesDashboardHandler } from "./salesDashboardApi.js";
import { salesDashboardDetailHandler } from "./salesDashboardDetailApi.js";

const salesJsonParser = express.json({ limit: "256kb" });

/** Roles that may call `/api/sales/*` when also granted head `sales` (admin bypass unchanged). */
export const SALES_API_ROLES = Object.freeze(["admin", "executive", "sales", "finance", "marketing"]);

function assertSalesRoleExports() {
  for (const r of SALES_API_ROLES) {
    if (!isApplicationRole(r)) {
      throw new Error(`salesHead: SALES_API_ROLES contains non-application role "${r}"`);
    }
  }
}
assertSalesRoleExports();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
}

function resolveSalesOrganizationId(req) {
  const queryOrg = String(req.query?.organization_id ?? "").trim();
  if (isUuid(queryOrg)) return queryOrg;
  const userOrg = String(req.user?.organization_id ?? "").trim();
  if (isUuid(userOrg)) return userOrg;
  const defaultOrg = String(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID ?? "").trim();
  if (isUuid(defaultOrg)) return defaultOrg;
  return "";
}

const RANGE_KEYS = new Set([
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "ytd",
  "last_ytd",
  "last_year",
  "rolling_7",
  "rolling_30",
  "rolling_60",
  "rolling_90",
  "custom"
]);

/** @typedef {{ ok: boolean, error?: string, range?: string, startDate?: string, endDate?: string, endExclusive?: string, compare?: string }} RangeResult */

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** @param {string} ymd */
function parseLocalYmd(ymd) {
  const m = String(ymd ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

/** @param {Date} dt */
function fmtLocal(dt) {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** @param {Date} dt */
function addDaysLocal(dt, days) {
  const x = new Date(dt.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

/** Server “today” in local timezone */
function calendarTodayLocalYmd() {
  return fmtLocal(new Date());
}

/** Monday-start week anchor in server local TZ */
function startOfWeekMondayLocal(ymd) {
  const dt = parseLocalYmd(ymd);
  if (!dt) return null;
  const dow = dt.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const mon = addDaysLocal(dt, offset);
  return fmtLocal(mon);
}

function startOfMonthYmd(y, m1to12) {
  return `${y}-${pad2(m1to12)}-01`;
}

function quarterOfMonth(m0to11) {
  return Math.floor(m0to11 / 3);
}

/** @param {number} q 0–3 */
function startQuarterYmd(year, q) {
  const m = q * 3 + 1;
  return `${year}-${pad2(m)}-01`;
}

/** @returns {number} quarter index 0-3 */
function quarterIndexFromYmd(ymd) {
  const m = Number(ymd.slice(5, 7));
  return Math.floor((m - 1) / 3);
}

/** @returns {RangeResult & { compare: string }} */
export function resolveSalesDateRange(raw) {
  const range = String(raw.range ?? "rolling_30").trim().toLowerCase();
  if (!RANGE_KEYS.has(range)) {
    return { ok: false, error: `Invalid range "${raw.range}".` };
  }
  const compare = String(raw.compare ?? "none").trim().toLowerCase();
  if (!["none", "previous_period", "previous_year"].includes(compare)) {
    return { ok: false, error: `Invalid compare "${raw.compare}".` };
  }

  const today = calendarTodayLocalYmd();
  const tl = parseLocalYmd(today);
  if (!tl) return { ok: false, error: "Unable to derive calendar today." };

  let startInclusive;
  let endInclusive;

  switch (range) {
    case "today": {
      startInclusive = today;
      endInclusive = today;
      break;
    }
    case "yesterday": {
      startInclusive = fmtLocal(addDaysLocal(tl, -1));
      endInclusive = startInclusive;
      break;
    }
    case "this_week": {
      const sw = startOfWeekMondayLocal(today);
      if (!sw) return { ok: false, error: "Invalid week start." };
      startInclusive = sw;
      endInclusive = today;
      break;
    }
    case "last_week": {
      const sw = startOfWeekMondayLocal(today);
      if (!sw) return { ok: false, error: "Invalid week start." };
      const thisWeekStart = parseLocalYmd(sw);
      if (!thisWeekStart) return { ok: false, error: "Invalid week anchor." };
      const lastWeekStart = addDaysLocal(thisWeekStart, -7);
      startInclusive = fmtLocal(lastWeekStart);
      endInclusive = fmtLocal(addDaysLocal(lastWeekStart, 6));
      break;
    }
    case "this_month": {
      startInclusive = startOfMonthYmd(tl.getFullYear(), tl.getMonth() + 1);
      endInclusive = today;
      break;
    }
    case "last_month": {
      const first = new Date(tl.getFullYear(), tl.getMonth() - 1, 1);
      const last = new Date(tl.getFullYear(), tl.getMonth(), 0);
      startInclusive = fmtLocal(first);
      endInclusive = fmtLocal(last);
      break;
    }
    case "this_quarter": {
      const y = tl.getFullYear();
      const q = quarterOfMonth(tl.getMonth());
      startInclusive = startQuarterYmd(y, q);
      endInclusive = today;
      break;
    }
    case "last_quarter": {
      const y = tl.getFullYear();
      const q = quarterOfMonth(tl.getMonth());
      let ly = y;
      let lq = q - 1;
      if (lq < 0) {
        ly -= 1;
        lq = 3;
      }
      const sm = lq * 3;
      const qs = new Date(ly, sm, 1);
      const qe = new Date(ly, sm + 3, 0);
      startInclusive = fmtLocal(qs);
      endInclusive = fmtLocal(qe);
      break;
    }
    case "ytd": {
      startInclusive = `${tl.getFullYear()}-01-01`;
      endInclusive = today;
      break;
    }
    case "last_ytd": {
      const y = tl.getFullYear() - 1;
      startInclusive = `${y}-01-01`;
      const ey = `${y}-${pad2(tl.getMonth() + 1)}-${pad2(tl.getDate())}`;
      endInclusive = ey;
      break;
    }
    case "last_year": {
      const y = tl.getFullYear() - 1;
      startInclusive = `${y}-01-01`;
      endInclusive = `${y}-12-31`;
      break;
    }
    case "rolling_7": {
      startInclusive = fmtLocal(addDaysLocal(tl, -6));
      endInclusive = today;
      break;
    }
    case "rolling_30": {
      startInclusive = fmtLocal(addDaysLocal(tl, -29));
      endInclusive = today;
      break;
    }
    case "rolling_60": {
      startInclusive = fmtLocal(addDaysLocal(tl, -59));
      endInclusive = today;
      break;
    }
    case "rolling_90": {
      startInclusive = fmtLocal(addDaysLocal(tl, -89));
      endInclusive = today;
      break;
    }
    case "custom": {
      startInclusive = String(raw.start ?? "").trim();
      endInclusive = String(raw.end ?? "").trim();
      const a = parseLocalYmd(startInclusive);
      const b = parseLocalYmd(endInclusive);
      if (!a || !b) return { ok: false, error: "custom range requires valid start and end YYYY-MM-DD." };
      if (startInclusive > endInclusive) return { ok: false, error: "start must be on or before end." };
      break;
    }
    default:
      return { ok: false, error: `Unsupported range "${range}".` };
  }

  const endExclusive = fmtLocal(addDaysLocal(parseLocalYmd(endInclusive), 1));
  return { ok: true, range, startDate: startInclusive, endDate: endInclusive, endExclusive, compare };
}

/**
 * Previous period window (same inclusive length), immediately before primary.
 */
export function comparisonPreviousPeriod(startInclusive, endInclusive) {
  const s = parseLocalYmd(startInclusive);
  const e = parseLocalYmd(endInclusive);
  if (!s || !e) return null;
  const daysSpan = Math.round((e.getTime() - s.getTime()) / (24 * 3600 * 1000)) + 1;
  const prevEnd = addDaysLocal(s, -1);
  const prevStart = addDaysLocal(prevEnd, -(daysSpan - 1));
  return {
    startInclusive: fmtLocal(prevStart),
    endInclusive: fmtLocal(prevEnd),
    endExclusive: fmtLocal(addDaysLocal(prevEnd, 1))
  };
}

/** Same calendar window shifted −1 year (approximates YoY slice). */
export function comparisonPreviousYear(startInclusive, endInclusive) {
  const ys = `${Number(startInclusive.slice(0, 4)) - 1}${startInclusive.slice(4)}`;
  const ye = `${Number(endInclusive.slice(0, 4)) - 1}${endInclusive.slice(4)}`;
  const b = parseLocalYmd(ye);
  if (!b) return null;
  return {
    startInclusive: ys,
    endInclusive: ye,
    endExclusive: fmtLocal(addDaysLocal(b, 1))
  };
}

const PI_PERIOD_MODES = new Set([
  "month_vs_prior_year_month",
  "quarter_vs_prior_year_quarter",
  "ytd_vs_prior_ytd",
  "custom_vs_prior_year",
  "custom_vs_previous_period"
]);

function toIntParam(raw, fallback) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Last calendar day of month (1–12) in `year`. */
function endOfMonthYmd(year, month1to12) {
  const d = new Date(year, month1to12, 0);
  return fmtLocal(d);
}

/**
 * Performance intelligence windows (current vs prior) for YoY / prior-period dashboards.
 * @param {Record<string, unknown>} raw — periodMode, year, month, quarter, start, end
 */
export function resolvePerformancePeriod(raw) {
  const mode = String(raw.periodMode ?? "ytd_vs_prior_ytd").trim().toLowerCase();
  if (!PI_PERIOD_MODES.has(mode)) {
    return { ok: false, error: `Invalid periodMode "${raw.periodMode}".` };
  }
  const today = calendarTodayLocalYmd();
  const tl = parseLocalYmd(today);
  if (!tl) return { ok: false, error: "Unable to derive calendar today." };

  let currentStart;
  let currentEnd;
  let priorStart;
  let priorEnd;

  if (mode === "month_vs_prior_year_month") {
    const year = toIntParam(raw.year, tl.getFullYear());
    const month = toIntParam(raw.month, tl.getMonth() + 1);
    if (month < 1 || month > 12) return { ok: false, error: "month must be 1–12." };
    currentStart = startOfMonthYmd(year, month);
    currentEnd = endOfMonthYmd(year, month);
    priorStart = startOfMonthYmd(year - 1, month);
    priorEnd = endOfMonthYmd(year - 1, month);
  } else if (mode === "quarter_vs_prior_year_quarter") {
    const year = toIntParam(raw.year, tl.getFullYear());
    let q = toIntParam(raw.quarter, Math.floor(tl.getMonth() / 3) + 1);
    if (q < 1 || q > 4) return { ok: false, error: "quarter must be 1–4." };
    const m0 = (q - 1) * 3;
    currentStart = startOfMonthYmd(year, m0 + 1);
    currentEnd = endOfMonthYmd(year, m0 + 3);
    const py = year - 1;
    priorStart = startOfMonthYmd(py, m0 + 1);
    priorEnd = endOfMonthYmd(py, m0 + 3);
  } else if (mode === "ytd_vs_prior_ytd") {
    const year = toIntParam(raw.year, tl.getFullYear());
    currentStart = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;
    const endCap = year === tl.getFullYear() ? today : endOfYear;
    if (currentStart > endCap) return { ok: false, error: "YTD end before start." };
    currentEnd = endCap;
    const curEndDt = parseLocalYmd(currentEnd);
    if (!curEndDt) return { ok: false, error: "Invalid YTD end." };
    priorStart = `${year - 1}-01-01`;
    const priorEndDt = new Date(curEndDt.getTime());
    priorEndDt.setFullYear(priorEndDt.getFullYear() - 1);
    priorEnd = fmtLocal(priorEndDt);
  } else if (mode === "custom_vs_prior_year") {
    currentStart = String(raw.start ?? "").trim();
    currentEnd = String(raw.end ?? "").trim();
    const a = parseLocalYmd(currentStart);
    const b = parseLocalYmd(currentEnd);
    if (!a || !b) return { ok: false, error: "custom_vs_prior_year requires start and end YYYY-MM-DD." };
    if (currentStart > currentEnd) return { ok: false, error: "start must be on or before end." };
    const py = comparisonPreviousYear(currentStart, currentEnd);
    if (!py) return { ok: false, error: "Unable to compute prior-year window." };
    priorStart = py.startInclusive;
    priorEnd = py.endInclusive;
  } else if (mode === "custom_vs_previous_period") {
    currentStart = String(raw.start ?? "").trim();
    currentEnd = String(raw.end ?? "").trim();
    const a = parseLocalYmd(currentStart);
    const b = parseLocalYmd(currentEnd);
    if (!a || !b) return { ok: false, error: "custom_vs_previous_period requires start and end YYYY-MM-DD." };
    if (currentStart > currentEnd) return { ok: false, error: "start must be on or before end." };
    const pp = comparisonPreviousPeriod(currentStart, currentEnd);
    if (!pp) return { ok: false, error: "Unable to compute previous period window." };
    priorStart = pp.startInclusive;
    priorEnd = pp.endInclusive;
  } else {
    return { ok: false, error: `Unsupported periodMode "${mode}".` };
  }

  const curEnd = parseLocalYmd(currentEnd);
  const prEnd = parseLocalYmd(priorEnd);
  if (!curEnd || !prEnd) return { ok: false, error: "Invalid period bounds." };

  return {
    ok: true,
    periodMode: mode,
    currentStart,
    currentEnd,
    currentEndExclusive: fmtLocal(addDaysLocal(curEnd, 1)),
    priorStart,
    priorEnd,
    priorEndExclusive: fmtLocal(addDaysLocal(prEnd, 1))
  };
}

function accountKeyJob(j) {
  const k = String(j.account_id ?? "").trim() || String(j.account_name ?? "").trim();
  return k || "(unknown)";
}

function enrichJobWithAttribution(j, mappings) {
  const a = classifySalesJob(j, mappings);
  return {
    ...j,
    ...a
  };
}

/**
 * PI-specific filters (query): branch, piSalesperson (normalized label), salespersonClass, search (account/job/moraware)
 */
function parsePerformanceIntelligenceFilters(reqQuery) {
  return {
    branch: String(reqQuery.branch ?? "").trim(),
    piSalesperson: String(reqQuery.piSalesperson ?? "").trim(),
    salespersonClass: String(reqQuery.salespersonClass ?? "").trim().toLowerCase(),
    search: String(reqQuery.search ?? "").trim().toLowerCase()
  };
}

function applyPerformanceAttributionFilters(enriched, f) {
  return enriched.filter((j) => {
    if (f.branch && f.branch !== "All" && String(j.branch) !== f.branch) return false;
    if (f.piSalesperson && f.piSalesperson !== "All" && f.piSalesperson !== "__MORAWARE_FALLBACK__") {
      if (String(j.normalizedSalesperson) !== f.piSalesperson) return false;
    }
    if (f.salespersonClass && f.salespersonClass !== "all") {
      if (String(j.salespersonClass).toLowerCase() !== f.salespersonClass) return false;
    }
    if (f.search) {
      const blob = [
        String(j.account_name ?? ""),
        String(j.job_name ?? ""),
        String(j.morawareSalesperson ?? ""),
        String(j.account_id ?? "")
      ]
        .join(" ")
        .toLowerCase();
      if (!blob.includes(f.search)) return false;
    }
    return true;
  });
}

function pctYoY(cur, prev) {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function aggregateMethodQuality(jobs) {
  const byMethod = new Map();
  let totalSqft = 0;
  for (const j of jobs) {
    const sq = sqftForJob(j);
    totalSqft += sq;
    const m = String(j.classificationMethod ?? "unknown");
    const slot = byMethod.get(m) || { method: m, volume: 0, accounts: new Set(), jobs: 0 };
    slot.volume += sq;
    slot.jobs += 1;
    slot.accounts.add(accountKeyJob(j));
    byMethod.set(m, slot);
  }
  const rows = [...byMethod.values()].map((x) => ({
    classificationMethod: x.method,
    classificationMethodLabel: methodLabelForDisplay(x.method),
    volume: x.volume,
    share: totalSqft > 0 ? x.volume / totalSqft : 0,
    accountCount: x.accounts.size,
    jobCount: x.jobs
  }));
  rows.sort((a, b) => b.volume - a.volume);
  const mappedMethods = new Set(["user_override", "exact_master_match", "substring_rule", "prior_dashboard"]);
  let mappedVol = 0;
  for (const r of rows) {
    if (mappedMethods.has(r.classificationMethod)) mappedVol += r.volume;
  }
  const unknownSp = jobs.filter((j) => j.salespersonClass === "unknown").length;
  const unknownBranch = jobs.filter((j) => j.branch === BRANCH_UNMAPPED).length;
  return {
    methodRows: rows,
    totalSqft,
    mappedVolumePct: totalSqft > 0 ? (mappedVol / totalSqft) * 100 : null,
    unmappedVolumePct: totalSqft > 0 ? ((totalSqft - mappedVol) / totalSqft) * 100 : null,
    unknownSalespersonJobCount: unknownSp,
    unknownBranchJobCount: unknownBranch
  };
}

function buildMonthlyYoYFromYearJobs(jobsByYear, yearCurrent, yearPrior) {
  /** @type {Map<number, { cur: number, pri: number, jc: number, jp: number }>} */
  const months = new Map();
  for (let m = 1; m <= 12; m++) months.set(m, { cur: 0, pri: 0, jc: 0, jp: 0 });

  for (const j of jobsByYear) {
    const ymd = String(j.creation_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    const y = Number(ymd.slice(0, 4));
    const mo = Number(ymd.slice(5, 7));
    if (!months.has(mo)) continue;
    const slot = months.get(mo);
    const sq = sqftForJob(j);
    if (y === yearCurrent) {
      slot.cur += sq;
      slot.jc += 1;
    } else if (y === yearPrior) {
      slot.pri += sq;
      slot.jp += 1;
    }
  }

  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return [...months.entries()].map(([mo, v]) => {
    const yoySqft = v.cur - v.pri;
    return {
      month: mo,
      monthLabel: labels[mo - 1],
      currentYearSqft: v.cur,
      priorYearSqft: v.pri,
      yoySqft,
      yoyPct: pctYoY(v.cur, v.pri),
      jobCountCurrent: v.jc,
      jobCountPrior: v.jp
    };
  });
}

export async function salesPerformanceIntelligenceHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const period = resolvePerformancePeriod(req.query);
  if (!period.ok) return { status: 400, body: { ok: false, error: period.error } };

  const legacyFilters = parseSalesFiltersFromReq(req.query);
  const piFilters = parsePerformanceIntelligenceFilters(req.query);
  const debugMode = String(req.query.debug ?? "").trim() === "1";
  const mappings = await loadApprovedSalesAttributionMappings(supabase);

  const [curRaw, priRaw] = await Promise.all([
    fetchJobsInDateRange(supabase, period.currentStart, period.currentEndExclusive),
    fetchJobsInDateRange(supabase, period.priorStart, period.priorEndExclusive)
  ]);

  const { cityMap, colorMap } = await attachMapsForJobRows(supabase, [...curRaw, ...priRaw]);
  let cur = applySalesFilters(legacyFilters, curRaw, cityMap, colorMap);
  let pri = applySalesFilters(legacyFilters, priRaw, cityMap, colorMap);

  let curE = cur.map((j) => enrichJobWithAttribution(j, mappings));
  let priE = pri.map((j) => enrichJobWithAttribution(j, mappings));
  curE = applyPerformanceAttributionFilters(curE, piFilters);
  priE = applyPerformanceAttributionFilters(priE, piFilters);

  const currentSqft = curE.reduce((s, j) => s + sqftForJob(j), 0);
  const priorSqft = priE.reduce((s, j) => s + sqftForJob(j), 0);
  const netYoYChange = currentSqft - priorSqft;
  const yoyPct = pctYoY(currentSqft, priorSqft);
  const activeAccounts = new Set(curE.map(accountKeyJob)).size;
  const jobCount = curE.length;
  const avgSqftPerJob = jobCount ? currentSqft / jobCount : 0;

  let latestProductionDate = "";
  for (const j of curE) {
    const d = String(j.creation_date ?? "").slice(0, 10);
    if (d && d > latestProductionDate) latestProductionDate = d;
  }

  const dataNotes = [
    "Revenue, quote value, close rate, and pipeline will unlock with Quote Platform.",
    "Worksheet Sq.Ft. uses brain_jobs.worksheet_sqft (same as Executive Head).",
    "Only approved Sales Account Mapping Admin rows are trusted account/branch attribution.",
    "Legacy local account rules are attribution preview only and must not be used as production branch truth."
  ];

  const executiveSnapshot = {
    currentSqft,
    priorSqft,
    netYoYChange,
    yoyPct,
    activeAccounts,
    jobCount,
    avgSqftPerJob,
    currentStart: period.currentStart,
    currentEnd: period.currentEnd,
    priorStart: period.priorStart,
    priorEnd: period.priorEnd,
    latestProductionDate: latestProductionDate || null,
    dataNotes
  };

  // Company monthly YoY: trend years from query or infer from current window
  const yEnd = Number(period.currentEnd.slice(0, 4));
  const yStart = Number(period.currentStart.slice(0, 4));
  const trendYearCurrent = toIntParam(req.query.trendYearCurrent, Math.max(yEnd, yStart));
  const trendYearPrior = toIntParam(req.query.trendYearPrior, trendYearCurrent - 1);

  const trendStart = `${Math.min(trendYearPrior, trendYearCurrent)}-01-01`;
  const trendEndEx = `${Math.max(trendYearPrior, trendYearCurrent) + 1}-01-01`;
  const trendRaw = await fetchJobsInDateRange(supabase, trendStart, trendEndEx);
  const trendFiltered = applySalesFilters(legacyFilters, trendRaw, cityMap, colorMap).map((j) =>
    enrichJobWithAttribution(j, mappings)
  );
  const trendFilteredPi = applyPerformanceAttributionFilters(trendFiltered, { ...piFilters, search: "" });
  const monthlyYoY = buildMonthlyYoYFromYearJobs(trendFilteredPi, trendYearCurrent, trendYearPrior);

  // Volume by branch + normalized rep (union of current + prior keys)
  const volKey = (j) => `${j.branch}|||${j.normalizedSalesperson}|||${j.salespersonClass}`;
  const volKeys = new Set([...curE.map(volKey), ...priE.map(volKey)]);
  const volumeByLocationRep = [];
  for (const key of volKeys) {
    const [branch, salesperson, salespersonClass] = key.split("|||");
    const curSlice = curE.filter((j) => volKey(j) === key);
    const priSlice = priE.filter((j) => volKey(j) === key);
    const currentSqftV = curSlice.reduce((s, j) => s + sqftForJob(j), 0);
    const priorSqftV = priSlice.reduce((s, j) => s + sqftForJob(j), 0);
    const methodCounts = new Map();
    for (const j of curSlice) {
      const m = String(j.classificationMethod ?? "");
      methodCounts.set(m, (methodCounts.get(m) || 0) + sqftForJob(j));
    }
    const totalM = [...methodCounts.values()].reduce((a, b) => a + b, 0);
    const classificationMethodBreakdown = {};
    for (const [m, v] of methodCounts) {
      classificationMethodBreakdown[methodLabelForDisplay(m)] = totalM > 0 ? v / totalM : 0;
    }
    const accountKeys = new Set(curSlice.map(accountKeyJob));
    volumeByLocationRep.push({
      branch,
      salesperson,
      salespersonClass,
      currentSqft: currentSqftV,
      priorSqft: priorSqftV,
      yoySqft: currentSqftV - priorSqftV,
      yoyPct: pctYoY(currentSqftV, priorSqftV),
      accountCount: accountKeys.size,
      jobCount: curSlice.length,
      classificationMethodBreakdown
    });
  }
  volumeByLocationRep.sort((a, b) => b.currentSqft - a.currentSqft);
  const volumeByLocationRepOut = volumeByLocationRep.filter((r) => r.currentSqft > 0 || r.priorSqft > 0);

  // Rep summary
  const repMap = new Map();
  for (const j of curE) {
    const k = `${j.normalizedSalesperson}\t${j.salespersonClass}`;
    const slot = repMap.get(k) || {
      salesperson: j.normalizedSalesperson,
      salespersonClass: j.salespersonClass,
      curJobs: [],
      priJobs: []
    };
    slot.curJobs.push(j);
    repMap.set(k, slot);
  }
  for (const j of priE) {
    const k = `${j.normalizedSalesperson}\t${j.salespersonClass}`;
    if (!repMap.has(k)) repMap.set(k, { salesperson: j.normalizedSalesperson, salespersonClass: j.salespersonClass, curJobs: [], priJobs: [] });
    repMap.get(k).priJobs.push(j);
  }
  const repOrder = (a, b) => {
    const ar = ACTIVE_SALES_REPS.includes(a.salesperson) ? 0 : a.salespersonClass === "house_account" ? 1 : 2;
    const br = ACTIVE_SALES_REPS.includes(b.salesperson) ? 0 : b.salespersonClass === "house_account" ? 1 : 2;
    if (ar !== br) return ar - br;
    const ia = ACTIVE_SALES_REPS.indexOf(a.salesperson);
    const ib = ACTIVE_SALES_REPS.indexOf(b.salesperson);
    if (ia >= 0 && ib >= 0) return ia - ib;
    return b.currentSqft - a.currentSqft;
  };

  const repSummary = [...repMap.entries()]
    .map(([, slot]) => {
      const currentSqftR = slot.curJobs.reduce((s, j) => s + sqftForJob(j), 0);
      const priorSqftR = slot.priJobs.reduce((s, j) => s + sqftForJob(j), 0);
      const byAcct = new Map();
      for (const j of slot.curJobs) {
        const ak = accountKeyJob(j);
        const disp = String(j.account_name ?? "").trim() || ak;
        const x = byAcct.get(ak) || { account: disp, totalSqft: 0 };
        x.totalSqft += sqftForJob(j);
        byAcct.set(ak, x);
      }
      const topAccounts = [...byAcct.values()].sort((a, b) => b.totalSqft - a.totalSqft).slice(0, 5);
      const acc = new Set(slot.curJobs.map(accountKeyJob));
      return {
        salesperson: slot.salesperson,
        salespersonClass: slot.salespersonClass,
        currentSqft: currentSqftR,
        priorSqft: priorSqftR,
        yoySqft: currentSqftR - priorSqftR,
        yoyPct: pctYoY(currentSqftR, priorSqftR),
        accountCount: acc.size,
        jobCount: slot.curJobs.length,
        topAccounts
      };
    })
    .sort(repOrder);

  // Account YoY
  const curByAcct = new Map();
  for (const j of curE) {
    const k = accountKeyJob(j);
    const disp = String(j.account_name ?? "").trim() || k;
    const slot = curByAcct.get(k) || {
      account: disp,
      branchVotes: new Map(),
      morawareSps: new Set(),
      classes: new Set(),
      methods: new Set(),
      conf: [],
      curSq: 0,
      curJobs: 0,
      lastJob: ""
    };
    slot.curSq += sqftForJob(j);
    slot.curJobs += 1;
    slot.morawareSps.add(j.morawareSalesperson);
    slot.classes.add(j.salespersonClass);
    slot.methods.add(j.classificationMethod);
    slot.conf.push(j.classificationConfidence);
    slot.branchVotes.set(j.branch, (slot.branchVotes.get(j.branch) || 0) + sqftForJob(j));
    const d = String(j.creation_date ?? "").slice(0, 10);
    if (d && d > slot.lastJob) slot.lastJob = d;
    curByAcct.set(k, slot);
  }
  const priByAcct = new Map();
  for (const j of priE) {
    const k = accountKeyJob(j);
    const slot = priByAcct.get(k) || { priSq: 0, priJobs: 0 };
    slot.priSq += sqftForJob(j);
    slot.priJobs += 1;
    priByAcct.set(k, slot);
  }

  const accountYoy = [];
  for (const [k, c] of curByAcct) {
    const p = priByAcct.get(k) || { priSq: 0, priJobs: 0 };
    const yoySqft = c.curSq - p.priSq;
    const branch = [...c.branchVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? BRANCH_UNMAPPED;
    const normalizedSalesperson = [...new Set(curE.filter((x) => accountKeyJob(x) === k).map((x) => x.normalizedSalesperson))].join(
      ", "
    );
    const morawareSalesperson = [...c.morawareSps].filter(Boolean).join(", ");
    const salespersonClass = [...c.classes].join(", ");
    const classificationMethod = [...c.methods][0] || "unknown";
    const classificationConfidence = c.conf.includes("low") ? "low" : c.conf.includes("medium") ? "medium" : "high";
    const focusFlag = p.priSq >= 100 && yoySqft < 0;
    accountYoy.push({
      account: c.account,
      branch,
      normalizedSalesperson,
      morawareSalesperson,
      salespersonClass,
      currentSqft: c.curSq,
      priorSqft: p.priSq,
      yoySqft,
      yoyPct: pctYoY(c.curSq, p.priSq),
      currentJobCount: c.curJobs,
      priorJobCount: p.priJobs,
      lastJobDate: c.lastJob || null,
      classificationMethod,
      classificationConfidence,
      focusFlag
    });
  }
  for (const [k, p] of priByAcct) {
    if (curByAcct.has(k)) continue;
    const j = priE.find((x) => accountKeyJob(x) === k);
    const disp = j ? String(j.account_name ?? "").trim() || k : k;
    accountYoy.push({
      account: disp,
      branch: j?.branch ?? BRANCH_UNMAPPED,
      normalizedSalesperson: j?.normalizedSalesperson ?? "",
      morawareSalesperson: j?.morawareSalesperson ?? "",
      salespersonClass: j?.salespersonClass ?? "fallback_moraware",
      currentSqft: 0,
      priorSqft: p.priSq,
      yoySqft: -p.priSq,
      yoyPct: pctYoY(0, p.priSq),
      currentJobCount: 0,
      priorJobCount: p.priJobs,
      lastJobDate: null,
      classificationMethod: j?.classificationMethod ?? "unknown",
      classificationConfidence: j?.classificationConfidence ?? "low",
      focusFlag: p.priSq >= 100
    });
  }

  const topCustomers = [...accountYoy].filter((a) => a.currentSqft > 0).sort((a, b) => b.currentSqft - a.currentSqft).slice(0, 25);
  const growers = [...accountYoy].filter((a) => a.yoySqft > 0).sort((a, b) => b.yoySqft - a.yoySqft).slice(0, 25);
  const decliners = [...accountYoy].filter((a) => a.yoySqft < 0).sort((a, b) => a.yoySqft - b.yoySqft).slice(0, 25);
  const focusAccounts = [...accountYoy].filter((a) => a.focusFlag).sort((a, b) => a.yoySqft - b.yoySqft).slice(0, 40);

  const quality = aggregateMethodQuality(curE);
  const classificationPanel = {
    title: "Attribution Preview & Data Quality",
    appliedAccountRules: [...ACCOUNT_RULES_DOCUMENTATION],
    disclaimer:
      "Moraware remains the source of truth for production square footage. Only approved Sales Account Mapping Admin rows are trusted for account -> branch/location/salesperson attribution; local fallback rules are preview signals only.",
    methodTable: quality.methodRows,
    mappedVolumePct: quality.mappedVolumePct,
    unmappedVolumePct: quality.unmappedVolumePct,
    unknownSalespersonJobCount: quality.unknownSalespersonJobCount,
    unknownBranchJobCount: quality.unknownBranchJobCount
  };

  const selectedRep = piFilters.piSalesperson && piFilters.piSalesperson !== "All" ? piFilters.piSalesperson : "";
  const assignedAccounts = selectedRep
    ? accountYoy
        .filter((a) => {
          const n = String(a.normalizedSalesperson ?? "");
          return n === selectedRep || n.split(",").map((x) => x.trim()).includes(selectedRep);
        })
        .sort((a, b) => b.currentSqft - a.currentSqft)
    : [];

  const focusForRep = assignedAccounts.filter((a) => a.focusFlag).sort((a, b) => a.yoySqft - b.yoySqft).slice(0, 20);

  const responseBody = {
    ok: true,
    periodMode: period.periodMode,
    executiveSnapshot,
    monthlyYoY: {
      currentYear: trendYearCurrent,
      priorYear: trendYearPrior,
      months: monthlyYoY
    },
    volumeByLocationRep: volumeByLocationRepOut,
    repSummary,
    accountYoy,
    topCustomers,
    biggestYoYGrowers: growers,
    largestYoYDeclines: decliners,
    focusAccounts,
    assignedAccountsView: {
      selectedSalesperson: selectedRep || null,
      assignedAccounts,
      focusAccountsForSelection: focusForRep
    },
    classificationPanel,
    activeSalesReps: [...ACTIVE_SALES_REPS],
    branches: [...SALES_BRANCHES],
    legacyQueryForJobs: {
      range: "custom",
      start: period.currentStart,
      end: period.currentEnd,
      compare: "previous_year"
    },
    dataNotes
  };

  if (debugMode) {
    const unmappedAccounts = curE.filter((j) => String(j.classificationMethod ?? "") !== "approved_mapping");
    const unmappedAccountTotals = new Map();
    for (const j of unmappedAccounts) {
      const k = String(j.account_name ?? "").trim() || "(blank)";
      unmappedAccountTotals.set(k, (unmappedAccountTotals.get(k) || 0) + sqftForJob(j));
    }
    const topUnmappedAccounts = [...unmappedAccountTotals.entries()]
      .map(([account, sqft]) => ({ account, sqft: Math.round(sqft * 100) / 100 }))
      .sort((a, b) => b.sqft - a.sqft)
      .slice(0, 15);

    responseBody.debug = {
      attribution: {
        source: mappings?.source || "hardcoded_rules_only",
        approvedAliasCount: mappings?.aliasesByNormMoraware?.size ?? 0,
        approvedAssignmentCount: mappings?.assignmentsByMasterId?.size ?? 0
      },
      brainJobSample: curE.slice(0, 12).map((j) => ({
        job_id: j.job_id,
        morawareSalesperson: j.morawareSalesperson,
        normalizedSalesperson: j.normalizedSalesperson,
        branch: j.branch,
        classificationMethod: j.classificationMethod,
        classificationConfidence: j.classificationConfidence,
        classificationNote: j.classificationNote,
        account_name: j.account_name,
        worksheet_sqft: j.worksheet_sqft
      })),
      counts: { currentJobs: curE.length, priorJobs: priE.length },
      latestProductionDate: executiveSnapshot.latestProductionDate,
      topUnmappedAccounts,
      unmappedAccountExamples: [...new Set(curE.filter((j) => j.branch === BRANCH_UNMAPPED).map((x) => String(x.account_name ?? "")))]
        .filter(Boolean)
        .slice(0, 15)
    };
  }

  return { status: 200, body: responseBody };
}

/**
 * Paginated brain_jobs fetch for `[startInclusive, endExclusive)`.
 */
export async function fetchJobsInDateRange(supabase, startInclusive, endExclusive) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("brain_jobs")
      .select(
        "job_id,job_name,account_id,account_name,creation_date,job_status,salesperson_name,worksheet_sqft,notes"
      )
      .gte("creation_date", startInclusive)
      .lt("creation_date", endExclusive)
      .order("creation_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function chunk(ids, size) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

export async function batchCityByJobId(supabase, jobIds) {
  /** @type {Map<string, string>} */
  const map = new Map();
  const uniq = [...new Set(jobIds.map((x) => String(x)))].filter(Boolean);
  for (const part of chunk(uniq, 200)) {
    const { data, error } = await supabase.from("brain_job_addresses").select("job_id,city").in("job_id", part);
    if (error) {
      /* optional table */
      continue;
    }
    for (const r of data ?? []) {
      const c = String(r.city ?? "").trim();
      if (c) map.set(String(r.job_id), c);
    }
  }
  return map;
}

const COLOR_OR =
  "normalized_label.ilike.%color%,normalized_label.ilike.%material%,normalized_label.ilike.%granite%,normalized_label.ilike.%quartz%,normalized_label.ilike.%slab%";

export async function batchMaterialColorByJobId(supabase, jobIds) {
  /** @type {Map<string, string>} */
  const map = new Map();
  const uniq = [...new Set(jobIds.map((x) => String(x)))].filter(Boolean);
  for (const part of chunk(uniq, 150)) {
    const { data, error } = await supabase
      .from("brain_fields")
      .select("job_id,normalized_label,value")
      .in("job_id", part)
      .or(COLOR_OR);
    if (error) continue;
    for (const r of data ?? []) {
      const jid = String(r.job_id);
      if (map.has(jid)) continue;
      const v = String(r.value ?? "").trim();
      if (v) map.set(jid, v.slice(0, 200));
    }
  }
  return map;
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function sqftForJob(j) {
  return safeNum(j.worksheet_sqft);
}

/**
 * @param {object} q query object
 * @param {object[]} jobs
 * @param {Map<string,string>} cityMap
 * @param {Map<string,string>} colorMap
 */
export function applySalesFilters(q, jobs, cityMap, colorMap) {
  const sp = String(q.salesperson ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const acct = String(q.account ?? "").trim().toLowerCase();
  const st = String(q.jobStatus ?? "").trim().toLowerCase();
  const proc = String(q.process ?? "").trim().toLowerCase();
  const mat = String(q.materialColor ?? "").trim().toLowerCase();
  const city = String(q.city ?? "").trim().toLowerCase();
  const minSq = q.minSqft != null && String(q.minSqft).trim() !== "" ? safeNum(q.minSqft) : null;
  const maxSq = q.maxSqft != null && String(q.maxSqft).trim() !== "" ? safeNum(q.maxSqft) : null;
  const minRev = q.minRevenue != null && String(q.minRevenue).trim() !== "" ? safeNum(q.minRevenue) : null;
  const maxRev = q.maxRevenue != null && String(q.maxRevenue).trim() !== "" ? safeNum(q.maxRevenue) : null;

  return jobs.filter((j) => {
    const sname = String(j.salesperson_name ?? "").trim();
    if (sp.length && !sp.includes(sname)) return false;
    const an = String(j.account_name ?? "").trim();
    const aid = String(j.account_id ?? "").trim();
    if (acct && !an.toLowerCase().includes(acct) && !aid.toLowerCase().includes(acct)) return false;
    const js = String(j.job_status ?? "").trim().toLowerCase();
    if (st && !js.includes(st)) return false;
    if (proc && !js.includes(proc)) return false;
    const sf = sqftForJob(j);
    if (minSq != null && sf < minSq) return false;
    if (maxSq != null && sf > maxSq) return false;
    if (minRev != null || maxRev != null) {
      /* revenue unavailable — filter does not match */
      return false;
    }
    const jid = String(j.job_id);
    const c = String(cityMap.get(jid) ?? "").toLowerCase();
    if (city && !c.includes(city)) return false;
    const col = String(colorMap.get(jid) ?? "").toLowerCase();
    if (mat && !col.includes(mat)) return false;
    return true;
  });
}

function pctDelta(cur, prev) {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function aggregateCore(jobs) {
  const jobCount = jobs.length;
  const totalSqft = jobs.reduce((s, j) => s + sqftForJob(j), 0);
  const accountKeys = new Set();
  for (const j of jobs) {
    const k = String(j.account_id ?? "").trim() || String(j.account_name ?? "").trim();
    if (k) accountKeys.add(k);
  }
  const spSet = new Set();
  for (const j of jobs) {
    const sp = String(j.salesperson_name ?? "").trim();
    if (sp) spSet.add(sp);
  }
  return {
    totalSqft,
    totalJobs: jobCount,
    totalAccounts: accountKeys.size,
    totalSalespeople: spSet.size,
    avgSqftPerJob: jobCount ? totalSqft / jobCount : 0
  };
}

function trendBucketKey(ymd, interval) {
  const y = ymd.slice(0, 4);
  const m = ymd.slice(5, 7);
  const d = ymd.slice(8, 10);
  if (interval === "day") return ymd;
  if (interval === "week") {
    const dt = parseLocalYmd(ymd);
    if (!dt) return ymd;
    const thursday = addDaysLocal(dt, 4 - ((dt.getDay() + 6) % 7));
    const year = thursday.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const week = Math.ceil(((thursday - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, "0")}`;
  }
  if (interval === "month") return `${y}-${m}`;
  if (interval === "quarter") {
    const qi = quarterIndexFromYmd(ymd);
    return `${y}-Q${qi + 1}`;
  }
  return ymd;
}

function buildTrendSeries(jobs, interval) {
  /** @type {Map<string, { period: string, totalSqft: number, jobCount: number, accounts: Set<string> }>} */
  const map = new Map();
  for (const j of jobs) {
    const ymd = String(j.creation_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    const k = trendBucketKey(ymd, interval);
    const slot = map.get(k) || { period: k, totalSqft: 0, jobCount: 0, accounts: new Set() };
    slot.totalSqft += sqftForJob(j);
    slot.jobCount += 1;
    const ak = String(j.account_id ?? "").trim() || String(j.account_name ?? "").trim();
    if (ak) slot.accounts.add(ak);
    map.set(k, slot);
  }
  return [...map.values()]
    .map((x) => ({
      period: x.period,
      totalSqft: x.totalSqft,
      jobCount: x.jobCount,
      accountCount: x.accounts.size
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function deltaVsPriorJobs(currentJobs, prevJobs) {
  const cur = aggregateCore(currentJobs);
  const prev = aggregateCore(prevJobs);
  return {
    sqftDeltaPct: pctDelta(cur.totalSqft, prev.totalSqft),
    jobsDeltaPct: pctDelta(cur.totalJobs, prev.totalJobs),
    revenueDeltaPct: null
  };
}

function dormancyWithinWindow(lastJobDateYmd, endInclusiveYmd, trailDays = 45) {
  if (!lastJobDateYmd || !endInclusiveYmd) return false;
  const endL = parseLocalYmd(endInclusiveYmd);
  if (!endL) return false;
  const tail = fmtLocal(addDaysLocal(endL, -trailDays));
  return lastJobDateYmd < tail;
}

async function attachMapsForJobRows(supabase, jobRows) {
  const ids = jobRows.map((j) => String(j.job_id));
  const [cityMap, colorMap] = await Promise.all([
    batchCityByJobId(supabase, ids),
    batchMaterialColorByJobId(supabase, ids)
  ]);
  return { cityMap, colorMap };
}

async function aggregateForSummary(supabase, rangeParsed, filters, extraFilterContext) {
  const { startDate, endDate, endExclusive, compare } = rangeParsed;

  let jobs = await fetchJobsInDateRange(supabase, startDate, endExclusive);

  /** @type {object[]} */
  let prevJobsRaw = [];
  if (compare === "previous_period") {
    const prev = comparisonPreviousPeriod(startDate, endDate);
    if (prev) prevJobsRaw = await fetchJobsInDateRange(supabase, prev.startInclusive, prev.endExclusive);
  } else if (compare === "previous_year") {
    const prev = comparisonPreviousYear(startDate, endDate);
    if (prev) prevJobsRaw = await fetchJobsInDateRange(supabase, prev.startInclusive, prev.endExclusive);
  }

  let ctx = extraFilterContext || {};
  let cityMap = ctx.cityMap;
  let colorMap = ctx.colorMap;
  if (!cityMap || !colorMap) {
    ({ cityMap, colorMap } = await attachMapsForJobRows(supabase, [...jobs, ...prevJobsRaw]));
    ctx = { ...ctx, cityMap, colorMap };
  }

  jobs = applySalesFilters(filters, jobs, cityMap, colorMap);
  const prevJobsFiltered = applySalesFilters(filters, prevJobsRaw, cityMap, colorMap);

  const revenueUnavailable = true;
  const dataNotes = [];
  if (revenueUnavailable) {
    dataNotes.push("Revenue is not yet available from the current Brain coverage.");
  }

  const metricsBase = aggregateCore(jobs);
  const metrics = {
    ...metricsBase,
    totalRevenue: null,
    avgRevenuePerJob: null,
    avgRevenuePerSqft: null
  };

  let comparison = {
    previousTotalSqft: null,
    previousTotalJobs: null,
    previousRevenue: null,
    sqftDeltaPct: null,
    jobsDeltaPct: null,
    revenueDeltaPct: null
  };

  if (compare === "previous_period" || compare === "previous_year") {
    const p = aggregateCore(prevJobsFiltered);
    comparison = {
      previousTotalSqft: p.totalSqft,
      previousTotalJobs: p.totalJobs,
      previousRevenue: null,
      sqftDeltaPct: pctDelta(metricsBase.totalSqft, p.totalSqft),
      jobsDeltaPct: pctDelta(metricsBase.totalJobs, p.totalJobs),
      revenueDeltaPct: null
    };
  }

  return {
    ok: true,
    metrics,
    comparison,
    dataNotes,
    _ctx: ctx,
    jobs,
    prevJobsFiltered
  };
}

/**
 * Shared query parser from Express req.query
 */
export function parseSalesFiltersFromReq(reqQuery) {
  return {
    salesperson: reqQuery.salesperson,
    account: reqQuery.account,
    jobStatus: reqQuery.jobStatus,
    process: reqQuery.process,
    materialColor: reqQuery.materialColor,
    city: reqQuery.city,
    minSqft: reqQuery.minSqft,
    maxSqft: reqQuery.maxSqft,
    minRevenue: reqQuery.minRevenue,
    maxRevenue: reqQuery.maxRevenue
  };
}

export async function salesSummaryHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const rangeParsed = resolveSalesDateRange(req.query);
  if (!rangeParsed.ok) return { status: 400, body: { ok: false, error: rangeParsed.error } };

  const filters = parseSalesFiltersFromReq(req.query);
  const agg = await aggregateForSummary(supabase, rangeParsed, filters);

  return {
    status: 200,
    body: {
      ok: true,
      range: rangeParsed.range,
      startDate: rangeParsed.startDate,
      endDate: rangeParsed.endDate,
      compare: rangeParsed.compare,
      metrics: agg.metrics,
      comparison: agg.comparison,
      dataNotes: agg.dataNotes
    }
  };
}

export async function salesSalespersonPerformanceHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const rangeParsed = resolveSalesDateRange(req.query);
  if (!rangeParsed.ok) return { status: 400, body: { ok: false, error: rangeParsed.error } };
  const filters = parseSalesFiltersFromReq(req.query);

  const agg = await aggregateForSummary(supabase, rangeParsed, filters);
  const { jobs, prevJobsFiltered } = agg;
  const compareJobsPrev = prevJobsFiltered ?? [];

  const bySp = new Map();
  for (const j of jobs) {
    const sp = String(j.salesperson_name ?? "").trim() || "(unassigned)";
    const slot = bySp.get(sp) || {
      salesperson: sp,
      jobs: [],
      accountKeys: new Set()
    };
    slot.jobs.push(j);
    const ak = String(j.account_id ?? "").trim() || String(j.account_name ?? "").trim();
    if (ak) slot.accountKeys.add(ak);
    bySp.set(sp, slot);
  }

  const prevBySp = new Map();
  for (const j of compareJobsPrev) {
    const sp = String(j.salesperson_name ?? "").trim() || "(unassigned)";
    if (!prevBySp.has(sp)) prevBySp.set(sp, []);
    prevBySp.get(sp).push(j);
  }

  const rows = [...bySp.values()]
    .map((slot) => {
      const tSq = slot.jobs.reduce((s, j) => s + sqftForJob(j), 0);
      const jc = slot.jobs.length;
      const pj = prevBySp.get(slot.salesperson) || [];

      /** Top accounts */
      const byAcct = new Map();
      for (const j of slot.jobs) {
        const key = String(j.account_name ?? "").trim() || String(j.account_id ?? "").trim() || "(unknown)";
        const a = byAcct.get(key) || { account: key, totalSqft: 0 };
        a.totalSqft += sqftForJob(j);
        byAcct.set(key, a);
      }
      const topAccounts = [...byAcct.values()].sort((a, b) => b.totalSqft - a.totalSqft).slice(0, 5);

      const trendVsPrior =
        pj.length || slot.jobs.length ? deltaVsPriorJobs(slot.jobs, pj) : { sqftDeltaPct: null, jobsDeltaPct: null, revenueDeltaPct: null };

      return {
        salesperson: slot.salesperson,
        totalSqft: tSq,
        jobCount: jc,
        accountCount: slot.accountKeys.size,
        avgSqftPerJob: jc ? tSq / jc : 0,
        totalRevenue: null,
        avgRevenuePerJob: null,
        topAccounts,
        trendVsCompare: trendVsPrior
      };
    })
    .sort((a, b) => b.totalSqft - a.totalSqft);

  return {
    status: 200,
    body: {
      ok: true,
      range: rangeParsed.range,
      startDate: rangeParsed.startDate,
      endDate: rangeParsed.endDate,
      compare: rangeParsed.compare,
      rows,
      dataNotes: agg.dataNotes
    }
  };
}

export async function salesAccountPerformanceHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const rangeParsed = resolveSalesDateRange(req.query);
  if (!rangeParsed.ok) return { status: 400, body: { ok: false, error: rangeParsed.error } };
  const filters = parseSalesFiltersFromReq(req.query);

  const agg = await aggregateForSummary(supabase, rangeParsed, filters);
  const { jobs, prevJobsFiltered, _ctx } = agg;
  const compareJobsPrev = prevJobsFiltered ?? [];
  const { cityMap } = _ctx;

  const prevByAcct = new Map();
  for (const j of compareJobsPrev) {
    const key = String(j.account_id ?? "").trim() || String(j.account_name ?? "").trim();
    const k = key || "(unknown)";
    if (!prevByAcct.has(k)) prevByAcct.set(k, []);
    prevByAcct.get(k).push(j);
  }

  const byAcct = new Map();
  for (const j of jobs) {
    const key = String(j.account_id ?? "").trim() || String(j.account_name ?? "").trim();
    const k = key || "(unknown)";
    const disp = String(j.account_name ?? "").trim() || k;
    const slot =
      byAcct.get(k) ||
      ({
        accountKey: k,
        accountName: disp,
        jobs: [],
        salesperson_names: new Set(),
        cities: new Map()
      });
    slot.jobs.push(j);
    const sp = String(j.salesperson_name ?? "").trim();
    if (sp) slot.salesperson_names.add(sp);
    const cid = String(j.job_id);
    const city = cityMap.get(cid);
    if (city) slot.cities.set(city, (slot.cities.get(city) || 0) + 1);
    byAcct.set(k, slot);
  }

  const rows = [...byAcct.values()].map((slot) => {
    const jc = slot.jobs.length;
    const tSq = slot.jobs.reduce((s, j) => s + sqftForJob(j), 0);
    let first = "";
    let last = "";
    for (const j of slot.jobs) {
      const d = String(j.creation_date ?? "").slice(0, 10);
      if (!d) continue;
      if (!first || d < first) first = d;
      if (!last || d > last) last = d;
    }
    const pj = prevByAcct.get(slot.accountKey) || [];
    const tvc = deltaVsPriorJobs(slot.jobs, pj);
    const cityTop = [...slot.cities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      account: slot.accountName,
      salesperson: [...slot.salesperson_names].sort().join(", ") || "(unknown)",
      totalSqft: tSq,
      jobCount: jc,
      avgSqftPerJob: jc ? tSq / jc : 0,
      totalRevenue: null,
      firstJobDate: first || null,
      lastJobDate: last || null,
      cityPrimary: cityTop,
      cityCounts: Object.fromEntries([...slot.cities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)),
      trendVsCompare: tvc,
      dormancyFlag: dormancyWithinWindow(last, rangeParsed.endDate)
    };
  });

  rows.sort((a, b) => b.totalSqft - a.totalSqft);

  return {
    status: 200,
    body: {
      ok: true,
      range: rangeParsed.range,
      startDate: rangeParsed.startDate,
      endDate: rangeParsed.endDate,
      compare: rangeParsed.compare,
      rows,
      dataNotes: agg.dataNotes
    }
  };
}

export async function salesTrendHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const rangeParsed = resolveSalesDateRange(req.query);
  if (!rangeParsed.ok) return { status: 400, body: { ok: false, error: rangeParsed.error } };
  const interval = String(req.query.interval ?? "week").trim().toLowerCase();
  if (!["day", "week", "month", "quarter"].includes(interval)) {
    return { status: 400, body: { ok: false, error: 'Invalid interval (use day|week|month|quarter).' } };
  }
  const filters = parseSalesFiltersFromReq(req.query);

  let jobs = await fetchJobsInDateRange(supabase, rangeParsed.startDate, rangeParsed.endExclusive);
  let pj = [];
  if (rangeParsed.compare === "previous_year") {
    const py = comparisonPreviousYear(rangeParsed.startDate, rangeParsed.endDate);
    if (py) pj = await fetchJobsInDateRange(supabase, py.startInclusive, py.endExclusive);
  }
  const { cityMap, colorMap } = await attachMapsForJobRows(supabase, [...jobs, ...pj]);
  jobs = applySalesFilters(filters, jobs, cityMap, colorMap);
  const current = buildTrendSeries(jobs, interval);

  let comparisonSeries = null;
  if (rangeParsed.compare === "previous_year" && pj.length) {
    const pjF = applySalesFilters(filters, pj, cityMap, colorMap);
    comparisonSeries = buildTrendSeries(pjF, interval);
  }

  return {
    status: 200,
    body: {
      ok: true,
      range: rangeParsed.range,
      startDate: rangeParsed.startDate,
      endDate: rangeParsed.endDate,
      compare: rangeParsed.compare,
      interval,
      series: current,
      comparisonSeries,
      totalRevenueAvailable: false,
      dataNotes: ["Revenue is not yet available from the current Brain coverage."]
    }
  };
}

function sortJobs(rows, sortBy, sortDir) {
  const dir = sortDir === "asc" ? 1 : -1;
  const keyFn = {
    date: (j) => String(j.creation_date ?? ""),
    account: (j) => String(j.account_name ?? "").toLowerCase(),
    salesperson: (j) => String(j.salesperson_name ?? "").toLowerCase(),
    sqft: (j) => sqftForJob(j),
    revenue: () => 0,
    status: (j) => String(j.job_status ?? "").toLowerCase(),
    city: (j) => String(j.city ?? "").toLowerCase()
  }[sortBy];
  const kf = keyFn || ((j) => String(j.creation_date ?? ""));
  return [...rows].sort((a, b) => {
    const va = kf(a);
    const vb = kf(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

export async function salesJobsHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const rangeParsed = resolveSalesDateRange(req.query);
  if (!rangeParsed.ok) return { status: 400, body: { ok: false, error: rangeParsed.error } };
  const filters = parseSalesFiltersFromReq(req.query);
  const sortBy = String(req.query.sortBy ?? "date").trim().toLowerCase();
  const sortDir = String(req.query.sortDir ?? "desc").trim().toLowerCase();
  if (!["date", "account", "salesperson", "sqft", "revenue", "status", "city"].includes(sortBy)) {
    return { status: 400, body: { ok: false, error: "Invalid sortBy." } };
  }
  if (!["asc", "desc"].includes(sortDir)) {
    return { status: 400, body: { ok: false, error: "Invalid sortDir." } };
  }
  let limit = Number.parseInt(String(req.query.limit ?? "100"), 10);
  if (!Number.isFinite(limit)) limit = 100;
  limit = Math.min(500, Math.max(1, limit));
  let offset = Number.parseInt(String(req.query.offset ?? "0"), 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  let jobs = await fetchJobsInDateRange(supabase, rangeParsed.startDate, rangeParsed.endExclusive);
  const { cityMap, colorMap } = await attachMapsForJobRows(supabase, jobs);
  jobs = applySalesFilters(filters, jobs, cityMap, colorMap);

  /** attach city/color for sorting */
  for (const j of jobs) {
    j.city = cityMap.get(String(j.job_id)) ?? "";
    j.materialColor = colorMap.get(String(j.job_id)) ?? "";
  }

  jobs = sortJobs(jobs, sortBy, sortDir);
  const total = jobs.length;
  const slice = jobs.slice(offset, offset + limit);
  const withAttribution = String(req.query.attribution ?? "").trim() === "1";
  const mappings = withAttribution ? await loadApprovedSalesAttributionMappings(supabase) : null;

  const rows = slice.map((j) => {
    const base = {
      jobId: String(j.job_id),
      jobName: String(j.job_name ?? ""),
      account: String(j.account_name ?? ""),
      salesperson: String(j.salesperson_name ?? ""),
      creationDate: j.creation_date ? String(j.creation_date).slice(0, 10) : null,
      status: String(j.job_status ?? ""),
      process: String(j.job_status ?? ""),
      materialColor: j.materialColor || null,
      city: j.city || null,
      sqft: sqftForJob(j),
      revenue: null,
      phaseSummary: null,
      missingInfoFlags: sqftForJob(j) <= 0 ? ["missing_sqft"] : []
    };
    if (withAttribution) {
      const a = classifySalesJob(j, mappings);
      base.attribution = {
        morawareSalesperson: a.morawareSalesperson,
        normalizedSalesperson: a.normalizedSalesperson,
        branch: a.branch,
        salespersonClass: a.salespersonClass,
        classificationMethod: a.classificationMethod,
        classificationConfidence: a.classificationConfidence,
        classificationNote: a.classificationNote
      };
    }
    return base;
  });

  return {
    status: 200,
    body: {
      ok: true,
      range: rangeParsed.range,
      startDate: rangeParsed.startDate,
      endDate: rangeParsed.endDate,
      sortBy,
      sortDir,
      limit,
      offset,
      total,
      rows,
      dataNotes: ["Revenue is not yet available from the current Brain coverage."]
    }
  };
}

/** Filters metadata — bounded scan rolling_365 for distincts */
export async function salesFiltersHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const today = calendarTodayLocalYmd();
  const tday = parseLocalYmd(today);
  if (!tday) {
    return {
      status: 200,
      body: {
        ok: true,
        note: "Could not parse server local today; filter lists empty.",
        salespeople: [],
        accounts: [],
        statuses: [],
        processes: [],
        materialColors: [],
        cities: [],
        dateBounds: { minCreationDate: null, maxCreationDate: null },
        revenueBounds: { available: false }
      }
    };
  }
  const endEx = fmtLocal(addDaysLocal(tday, 1));
  const start = fmtLocal(addDaysLocal(tday, -364));

  const jobs = await fetchJobsInDateRange(supabase, start, endEx);
  const ids = jobs.map((j) => String(j.job_id));
  const [cityMap, colorMap] = await Promise.all([
    batchCityByJobId(supabase, ids),
    batchMaterialColorByJobId(supabase, ids)
  ]);

  const salespeople = [...new Set(jobs.map((j) => String(j.salesperson_name ?? "").trim()).filter(Boolean))].sort();
  const accounts = [...new Set(jobs.map((j) => String(j.account_name ?? "").trim()).filter(Boolean))].sort();
  const statuses = [...new Set(jobs.map((j) => String(j.job_status ?? "").trim()).filter(Boolean))].sort();
  const processes = statuses;
  const materialColors = [...new Set([...colorMap.values()].map(String))].sort();
  const cities = [...new Set([...cityMap.values()].map(String))].sort();

  const { data: minRow } = await supabase
    .from("brain_jobs")
    .select("creation_date")
    .order("creation_date", { ascending: true })
    .limit(1);
  const { data: maxRow } = await supabase
    .from("brain_jobs")
    .select("creation_date")
    .order("creation_date", { ascending: false })
    .limit(1);

  return {
    status: 200,
    body: {
      ok: true,
      note: "Distinct filter values sampled from Brain jobs created in the last ~365 days (plus global date bounds).",
      salespeople,
      accounts,
      statuses,
      processes,
      materialColors,
      cities,
      dateBounds: {
        minCreationDate: minRow?.[0]?.creation_date ? String(minRow[0].creation_date).slice(0, 10) : null,
        maxCreationDate: maxRow?.[0]?.creation_date ? String(maxRow[0].creation_date).slice(0, 10) : null
      },
      revenueBounds: { available: false },
      branches: [...SALES_BRANCHES],
      activeSalesReps: [...ACTIVE_SALES_REPS],
      attributionSalespersonOptions: [
        "All",
        ...ACTIVE_SALES_REPS,
        "House Account - Lisbon",
        "House Account - Dyersville",
        "__MORAWARE_FALLBACK__"
      ],
      salespersonClassOptions: [
        { value: "all", label: "All classes" },
        { value: "active_rep", label: "Active rep" },
        { value: "house_account", label: "House account" },
        { value: "fallback_moraware", label: "Moraware fallback" },
        { value: "unknown", label: "Unknown" }
      ],
      performancePeriodModes: [
        { value: "month_vs_prior_year_month", label: "Month vs same month prior year" },
        { value: "quarter_vs_prior_year_quarter", label: "Quarter vs same quarter prior year" },
        { value: "ytd_vs_prior_ytd", label: "YTD vs prior-year YTD (aligned dates)" },
        { value: "custom_vs_prior_year", label: "Custom vs prior year (same calendar window)" },
        { value: "custom_vs_previous_period", label: "Custom vs previous period (same length)" }
      ]
    }
  };
}

export async function salesDebugHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const { count: jobCount, error: e1 } = await supabase.from("brain_jobs").select("*", { count: "exact", head: true });
  if (e1) return { status: 500, body: { ok: false, error: e1.message } };

  return {
    status: 200,
    body: {
      ok: true,
      brain_jobs_count: jobCount ?? null,
      revenueSoldFieldsAvailable: false,
      worksheetSqftField: "brain_jobs.worksheet_sqft (same rollup as Executive Head)",
      notes: [
        "No authoritative sold-price / revenue column is wired for Sales dashboards yet.",
        "Use Quote Platform ingestion when available.",
        "Process filter aligns with Moraware job_status vocabulary in Brain (v1 proxy)."
      ]
    }
  };
}

async function safeCount(supabase, table, organizationId) {
  try {
    let q = supabase.from(table).select("id", { count: "exact", head: true });
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { count, error } = await q;
    if (error) return { count: null, error: error.message };
    return { count: count ?? 0, error: null };
  } catch (e) {
    return { count: null, error: String(e?.message ?? e) };
  }
}

function addMorawareRowCounts(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = {};
  for (const key of keys) out[key] = (Number(a?.[key]) || 0) + (Number(b?.[key]) || 0);
  return out;
}

function summarizeMorawareImportGroupRows(groupRows, latestRun) {
  const expectedChunkCount = Math.max(
    0,
    ...groupRows.map((r) => Number(r?.metadata?.chunk_count) || 0),
    Number(latestRun?.metadata?.chunk_count) || 0
  ) || null;
  const byChunkIndex = new Map();
  for (const row of groupRows) {
    const idx = Number(row?.metadata?.chunk_index) || null;
    if (!idx) continue;
    const prev = byChunkIndex.get(idx);
    if (!prev || String(row.started_at || "") >= String(prev.started_at || "")) byChunkIndex.set(idx, row);
  }
  const latestRows = [...byChunkIndex.entries()].sort((a, b) => a[0] - b[0]);
  const missingChunkIndices = [];
  if (expectedChunkCount) {
    for (let i = 1; i <= expectedChunkCount; i += 1) {
      if (!byChunkIndex.has(i)) missingChunkIndices.push(i);
    }
  }
  const successfulChunks = latestRows.filter(([, row]) => row.status === "success").length;
  const failedChunks = latestRows.filter(([, row]) => row.status === "failed").length;
  const complete = Boolean(expectedChunkCount) && successfulChunks === expectedChunkCount && failedChunks === 0 && missingChunkIndices.length === 0;
  const totalRowCounts = latestRows
    .filter(([, row]) => row.status === "success")
    .reduce((acc, [, row]) => addMorawareRowCounts(acc, row.row_counts || {}), {});
  const successfulSyncRunIds = latestRows
    .filter(([, row]) => row.status === "success")
    .map(([, row]) => String(row.id ?? "").trim())
    .filter(Boolean);
  return {
    expectedChunkCount,
    attemptedRuns: groupRows.length,
    observedChunkCount: latestRows.length,
    successfulChunks,
    failedChunks,
    missingChunkIndices,
    complete,
    totalRowCounts,
    successfulSyncRunIds
  };
}

function increment(map, key, by = 1) {
  const k = String(key ?? "").trim() || "Unassigned";
  map.set(k, (map.get(k) || 0) + by);
}

function mapToRows(map, keyName = "name") {
  return [...map.entries()]
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((a, b) => b.count - a.count || String(a[keyName]).localeCompare(String(b[keyName])));
}

async function loadLatestMorawareGroup(supabase, organizationId) {
  let latestQ = supabase.from("moraware_sync_runs").select("*").order("started_at", { ascending: false }).limit(1);
  let successQ = supabase.from("moraware_sync_runs").select("*").eq("status", "success").order("finished_at", { ascending: false }).limit(1);
  if (organizationId) {
    latestQ = latestQ.eq("organization_id", organizationId);
    successQ = successQ.eq("organization_id", organizationId);
  }
  const [latest, success] = await Promise.all([latestQ, successQ]);
  if (latest.error) throw latest.error;
  if (success.error) throw success.error;
  const latestRun = latest.data?.[0] ?? null;
  const lastSuccess = success.data?.[0] ?? null;
  const importGroupId = String(latestRun?.metadata?.import_group_id ?? lastSuccess?.metadata?.import_group_id ?? "").trim();
  let groupRows = [];
  if (importGroupId) {
    let groupQ = supabase
      .from("moraware_sync_runs")
      .select("id,status,started_at,finished_at,row_counts,metadata")
      .filter("metadata->>import_group_id", "eq", importGroupId)
      .order("started_at", { ascending: true })
      .limit(1000);
    if (organizationId) groupQ = groupQ.eq("organization_id", organizationId);
    const group = await groupQ;
    if (group.error) throw group.error;
    groupRows = group.data || [];
  }
  const groupSummary = summarizeMorawareImportGroupRows(groupRows, latestRun);

  // When the latest group is incomplete, find the most recent complete group so
  // the Sales Dashboard can fall back to it instead of returning NOT AVAILABLE.
  let latestCompleteGroupForFallback = null;
  if (importGroupId && !groupSummary.complete) {
    try {
      latestCompleteGroupForFallback = await loadLatestCompleteImportGroup(supabase, organizationId);
    } catch {
      // Non-fatal — dashboard will show NOT AVAILABLE if no fallback available
    }
  }

  const lastSuccessAgeSeconds = lastSuccess?.finished_at
    ? Math.max(0, Math.round((Date.now() - Date.parse(String(lastSuccess.finished_at))) / 1000))
    : null;
  return {
    latest_run: latestRun
      ? {
          id: latestRun.id,
          status: latestRun.status,
          started_at: latestRun.started_at,
          finished_at: latestRun.finished_at,
          row_counts: latestRun.row_counts || {},
          import_group_id: String(latestRun?.metadata?.import_group_id ?? "") || null
        }
      : null,
    last_successful_run: lastSuccess
      ? {
          id: lastSuccess.id,
          status: lastSuccess.status,
          started_at: lastSuccess.started_at,
          finished_at: lastSuccess.finished_at,
          row_counts: lastSuccess.row_counts || {},
          import_group_id: String(lastSuccess?.metadata?.import_group_id ?? "") || null
        }
      : null,
    latest_group: importGroupId
      ? {
          import_group_id: importGroupId,
          chunk_count: groupSummary.observedChunkCount,
          attempted_runs: groupSummary.attemptedRuns,
          expected_chunk_count: groupSummary.expectedChunkCount,
          successful_chunks: groupSummary.successfulChunks,
          failed_chunks: groupSummary.failedChunks,
          missing_chunk_indices: groupSummary.missingChunkIndices,
          complete: groupSummary.complete,
          successful_sync_run_ids: groupSummary.successfulSyncRunIds,
          total_row_counts: groupSummary.totalRowCounts
        }
      : null,
    // Populated only when latest_group is incomplete — used by fetchLatestPreparedSalesJobFacts
    // to serve yesterday's complete data instead of returning NOT AVAILABLE.
    latest_complete_group: latestCompleteGroupForFallback,
    last_success_age_seconds: lastSuccessAgeSeconds
  };
}

function chunkArray(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function elapsedMs(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

async function fetchLatestCompleteMorawareJobs(supabase, organizationId, syncHealth) {
  const pageSize = 1000;
  const selectCols =
    "sync_run_id,source_job_id,source_account_id,account_name,status_name,process_name,salesperson_name,created_at_source,modified_at_source,scheduled_at_source,completed_at_source,install_at_source,raw_payload";
  const group = syncHealth.latest_group;
  const runIds = Array.isArray(group?.successful_sync_run_ids) ? group.successful_sync_run_ids.map(String).filter(Boolean) : [];
  if (group?.import_group_id && group.complete === false) {
    return {
      rows: [],
      diagnostics: {
        rows_scanned: 0,
        query_page_count: 0,
        source_group_complete: false,
        source_import_group_id: group.import_group_id,
        source_sync_run_count: runIds.length,
        scoped_to_latest_complete_group: false
      }
    };
  }
  const shouldScopeToGroup = Boolean(group?.complete && runIds.length);
  const rows = [];
  let queryPageCount = 0;

  const runIdGroups = shouldScopeToGroup ? chunkArray(runIds, 40) : [null];
  for (const runIdGroup of runIdGroups) {
    let from = 0;
    while (true) {
      let q = supabase
        .from("brain_moraware_jobs")
        .select(selectCols)
        .eq("organization_id", organizationId)
        .order("created_at_source", { ascending: true, nullsFirst: false })
        .range(from, from + pageSize - 1);
      if (runIdGroup) q = q.in("sync_run_id", runIdGroup);
      const { data, error } = await q;
      queryPageCount += 1;
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }

  return {
    rows,
    diagnostics: {
      rows_scanned: rows.length,
      query_page_count: queryPageCount,
      source_group_complete: Boolean(group?.complete),
      source_import_group_id: group?.import_group_id || null,
      source_sync_run_count: runIds.length,
      scoped_to_latest_complete_group: shouldScopeToGroup
    }
  };
}

async function fetchLatestPreparedSalesJobFacts(supabase, organizationId, syncHealth) {
  const pageSize = 1000;
  const group = syncHealth.latest_group;
  const latestGroupId = String(group?.import_group_id ?? "").trim();

  // Resolve the effective group: fall back to the last complete group when the
  // latest group is still in-progress (incomplete). This ensures the Sales Dashboard
  // shows yesterday's data instead of NOT AVAILABLE during a daily re-import.
  let effectiveGroupId = latestGroupId;
  let fallbackUsed = false;
  let fallbackGroup = null;

  if (group?.import_group_id && group.complete === false) {
    fallbackGroup = syncHealth.latest_complete_group ?? null;
    const fallbackId = String(fallbackGroup?.import_group_id ?? "").trim();
    if (fallbackId) {
      effectiveGroupId = fallbackId;
      fallbackUsed = true;
    } else {
      // No complete fallback — return NOT AVAILABLE with clear diagnostic
      return {
        rows: [],
        available: false,
        fallback_used: false,
        latest_import_group_id: latestGroupId || null,
        latest_import_group_complete: false,
        used_import_group_id: null,
        warning:
          "Latest Moraware group is incomplete and no previous complete group is available; prepared Sales facts were not used.",
        diagnostics: {
          rows_scanned: 0,
          query_page_count: 0,
          source_group_complete: false,
          source_import_group_id: latestGroupId || null,
          source_sync_run_count: 0,
          scoped_to_latest_complete_group: false,
          used_precomputed_rollup: false
        }
      };
    }
  }

  if (!effectiveGroupId) {
    return {
      rows: [],
      available: false,
      fallback_used: false,
      latest_import_group_id: null,
      latest_import_group_complete: null,
      used_import_group_id: null,
      warning: "No latest complete import group is available for prepared Sales facts.",
      diagnostics: {
        rows_scanned: 0,
        query_page_count: 0,
        source_group_complete: null,
        source_import_group_id: null,
        source_sync_run_count: 0,
        scoped_to_latest_complete_group: false,
        used_precomputed_rollup: false
      }
    };
  }

  const rows = [];
  let queryPageCount = 0;
  try {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("sales_moraware_job_facts")
        .select(
          "sync_run_id,source_job_id,source_account_id,account_name,status_name,process_name,salesperson_name,created_at_source,modified_at_source,scheduled_at_source,completed_at_source,install_at_source,worksheet_sqft,sqft_found,report_month_created,report_month_completed,report_month_install"
        )
        .eq("organization_id", organizationId)
        .eq("import_group_id", effectiveGroupId)
        .order("created_at_source", { ascending: true, nullsFirst: false })
        .range(from, from + pageSize - 1);
      queryPageCount += 1;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
  } catch (e) {
    if (isMissingRelationError(e)) {
      return {
        rows: [],
        available: false,
        fallback_used: fallbackUsed,
        latest_import_group_id: latestGroupId || null,
        latest_import_group_complete: Boolean(group?.complete),
        used_import_group_id: effectiveGroupId,
        warning: "Prepared Sales Moraware facts table is not installed yet.",
        diagnostics: {
          rows_scanned: 0,
          query_page_count: queryPageCount,
          source_group_complete: Boolean(group?.complete),
          source_import_group_id: effectiveGroupId,
          source_sync_run_count: 0,
          scoped_to_latest_complete_group: false,
          used_precomputed_rollup: false
        }
      };
    }
    throw e;
  }

  const available = rows.length > 0;

  let warning = null;
  if (!available) {
    warning = "Prepared Sales Moraware facts have not been built for the latest complete import group.";
  } else if (fallbackUsed) {
    const fallbackDate = String(fallbackGroup?.finished_at ?? fallbackGroup?.started_at ?? "").slice(0, 10) || null;
    warning = fallbackDate
      ? `Latest Moraware import is incomplete; showing data from the last complete import (${fallbackDate}).`
      : "Latest Moraware import is incomplete; showing data from the last complete import.";
  }

  return {
    rows,
    available,
    fallback_used: fallbackUsed,
    latest_import_group_id: latestGroupId || null,
    latest_import_group_complete: group?.import_group_id ? Boolean(group.complete) : null,
    used_import_group_id: effectiveGroupId,
    warning,
    diagnostics: {
      rows_scanned: rows.length,
      query_page_count: queryPageCount,
      source_group_complete: fallbackUsed ? true : Boolean(group?.complete),
      source_import_group_id: effectiveGroupId,
      source_sync_run_count: Array.isArray(group?.successful_sync_run_ids) ? group.successful_sync_run_ids.length : 0,
      scoped_to_latest_complete_group: true,
      used_precomputed_rollup: available,
      fallback_used: fallbackUsed,
      latest_import_group_id: latestGroupId || null,
      latest_import_group_complete: group?.import_group_id ? Boolean(group.complete) : null
    }
  };
}

function latestAliasDecisionByNorm(aliases) {
  const byNorm = new Map();
  for (const alias of aliases) {
    const norm = String(alias.normalized_moraware_name ?? "").trim();
    if (!norm) continue;
    const prev = byNorm.get(norm);
    if (!prev) {
      byNorm.set(norm, alias);
      continue;
    }
    const prevApproved = prev.approved === true;
    const curApproved = alias.approved === true;
    if (curApproved && !prevApproved) {
      byNorm.set(norm, alias);
      continue;
    }
    const prevUpdated = String(prev.updated_at ?? prev.created_at ?? "");
    const curUpdated = String(alias.updated_at ?? alias.created_at ?? "");
    if (curUpdated > prevUpdated) byNorm.set(norm, alias);
  }
  return byNorm;
}

function statusForSalesAlias(alias) {
  if (!alias) return "needs_review_unmapped";
  const matchType = String(alias.match_type ?? "").toLowerCase();
  const assigned = String(alias.assigned_salesperson ?? "").toLowerCase();
  const branch = String(alias.branch ?? "").toLowerCase();
  if (matchType === "rejected") return "rejected_ignored";
  if (alias.approved === true && (matchType === "intentional_unmapped" || assigned === "unmapped" || branch === "unmapped")) {
    return "rejected_ignored";
  }
  if (alias.approved === true) return "approved_mapped";
  return "needs_review_unmapped";
}

async function fetchSalesAliasRows(supabase) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("sales_account_aliases")
      .select(
        "id,approved,moraware_account_name,normalized_moraware_name,monday_account_name,assigned_salesperson,branch,match_type,confidence,notes,created_at,updated_at"
      )
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      if (isMissingRelationError(error)) return { rows, warning: "sales_account_aliases table missing; attribution coverage is unavailable." };
      throw error;
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { rows, warning: null };
}

async function loadCompactSalesAttributionCoverage(supabase, { organizationId, syncHealth }) {
  const startedAt = Date.now();
  // Use the fallback complete group when the latest is incomplete
  const latestGroup = syncHealth?.latest_group;
  const effectiveCoverageGroup =
    latestGroup?.complete === false && syncHealth?.latest_complete_group?.import_group_id
      ? syncHealth.latest_complete_group
      : latestGroup;
  const importGroupId = String(effectiveCoverageGroup?.import_group_id ?? "").trim();
  const diagnostics = {
    attribution_used_account_rollups: false,
    attribution_account_rollups_count: 0,
    attribution_mapping_rows_count: 0,
    used_precomputed_summary: false,
    warning: null
  };
  if (!importGroupId || effectiveCoverageGroup?.complete === false) {
    diagnostics.warning = "Latest complete import group is unavailable; compact attribution coverage skipped.";
    return {
      source: "sales_moraware_account_rollups_plus_sales_account_aliases",
      latest_import_group_id: importGroupId || null,
      totalAccountsSeen: 0,
      approvedMappedAccounts: 0,
      needsReviewUnmappedAccounts: 0,
      rejectedIgnoredAccounts: 0,
      totalJobsSeen: 0,
      approvedMappedJobs: 0,
      needsReviewUnmappedJobs: 0,
      rejectedIgnoredJobs: 0,
      totalSqftSeen: 0,
      approvedMappedSqft: 0,
      needsReviewUnmappedSqft: 0,
      rejectedIgnoredSqft: 0,
      approvedAccountCoveragePct: null,
      approvedJobCoveragePct: null,
      approvedSqftCoveragePct: null,
      blackstoneUnapprovedAccounts: 0,
      warning:
        "Revenue/sqft by branch remains preview until approved Sales Account Mapping coverage is high; local fallback rules do not count as trusted coverage.",
      blackstone_guardrail:
        "Blackstone remains unmapped/Moraware fallback unless an approved Sales Account Mapping row explicitly maps it.",
      reviewRows: [],
      diagnostics: { ...diagnostics, compute_ms: elapsedMs(startedAt) },
      warnings: [diagnostics.warning]
    };
  }

  let rollups = [];
  try {
    const { data, error } = await supabase
      .from("sales_moraware_account_rollups")
      .select(
        "source_account_id,account_name,normalized_moraware_name,job_count,jobs_with_sqft,jobs_missing_sqft,total_sqft,first_report_date,last_report_date"
      )
      .eq("organization_id", organizationId)
      .eq("import_group_id", importGroupId)
      .order("total_sqft", { ascending: false });
    if (error) throw error;
    rollups = data ?? [];
  } catch (e) {
    if (!isMissingRelationError(e)) throw e;
    diagnostics.warning = "Prepared Sales account rollups table is not installed yet.";
  }

  const aliasResult = await fetchSalesAliasRows(supabase);
  const aliasesByNorm = latestAliasDecisionByNorm(aliasResult.rows);
  diagnostics.attribution_used_account_rollups = rollups.length > 0;
  diagnostics.attribution_account_rollups_count = rollups.length;
  diagnostics.attribution_mapping_rows_count = aliasResult.rows.length;
  diagnostics.used_precomputed_summary = rollups.length > 0;
  if (aliasResult.warning) diagnostics.warning = aliasResult.warning;

  const counts = {
    totalAccountsSeen: 0,
    approvedMappedAccounts: 0,
    needsReviewUnmappedAccounts: 0,
    rejectedIgnoredAccounts: 0,
    totalJobsSeen: 0,
    approvedMappedJobs: 0,
    needsReviewUnmappedJobs: 0,
    rejectedIgnoredJobs: 0,
    totalSqftSeen: 0,
    approvedMappedSqft: 0,
    needsReviewUnmappedSqft: 0,
    rejectedIgnoredSqft: 0,
    blackstoneUnapprovedAccounts: 0
  };
  const reviewRows = [];
  const examples = { needsReviewUnmapped: [], rejectedIgnored: [], approvedMapped: [], blackstoneUnapproved: [] };
  for (const row of rollups) {
    const norm = String(row.normalized_moraware_name ?? "").trim() || normalizeAccountNameWithoutLocationPrefix(row.account_name);
    const alias = aliasesByNorm.get(norm) || null;
    const status = statusForSalesAlias(alias);
    const jobCount = Number(row.job_count) || 0;
    const jobsWithSqft = Number(row.jobs_with_sqft) || 0;
    const totalSqft = Number(row.total_sqft) || 0;
    const example = {
      accountName: String(row.account_name ?? row.source_account_id ?? "(unknown)"),
      sourceAccountId: row.source_account_id ?? null,
      normalizedMorawareName: norm || null,
      jobCount,
      jobsWithSqft,
      jobsMissingSqft: Number(row.jobs_missing_sqft) || Math.max(0, jobCount - jobsWithSqft),
      totalSqft,
      status,
      mondayAccountName: alias?.monday_account_name ?? null,
      assignedSalesperson: alias?.assigned_salesperson ?? null,
      branch: alias?.branch ?? null,
      matchType: alias?.match_type ?? null,
      approved: alias?.approved ?? false,
      confidence: alias?.confidence ?? null,
      notes: alias?.notes ?? null,
      aliasId: alias?.id ?? null,
      reviewStatus: status
    };
    counts.totalAccountsSeen += 1;
    counts.totalJobsSeen += jobCount;
    counts.totalSqftSeen += totalSqft;
    if (status === "approved_mapped") {
      counts.approvedMappedAccounts += 1;
      counts.approvedMappedJobs += jobCount;
      counts.approvedMappedSqft += totalSqft;
      examples.approvedMapped.push(example);
    } else if (status === "rejected_ignored") {
      counts.rejectedIgnoredAccounts += 1;
      counts.rejectedIgnoredJobs += jobCount;
      counts.rejectedIgnoredSqft += totalSqft;
      examples.rejectedIgnored.push(example);
    } else {
      counts.needsReviewUnmappedAccounts += 1;
      counts.needsReviewUnmappedJobs += jobCount;
      counts.needsReviewUnmappedSqft += totalSqft;
      examples.needsReviewUnmapped.push(example);
    }
    if (norm.includes("blackstone") && status !== "approved_mapped") {
      counts.blackstoneUnapprovedAccounts += 1;
      examples.blackstoneUnapproved.push(example);
    }
    reviewRows.push(example);
  }

  const pct = (num, den) => (Number(den) > 0 ? (Number(num) / Number(den)) * 100 : null);
  return {
    source: "sales_moraware_account_rollups_plus_sales_account_aliases",
    latest_import_group_id: importGroupId,
    ...counts,
    approvedAccountCoveragePct: pct(counts.approvedMappedAccounts, counts.totalAccountsSeen),
    approvedJobCoveragePct: pct(counts.approvedMappedJobs, counts.totalJobsSeen),
    approvedSqftCoveragePct: pct(counts.approvedMappedSqft, counts.totalSqftSeen),
    sqft_source: "Prepared Sales Moraware account rollups",
    warning:
      "Revenue/sqft by branch remains preview until approved Sales Account Mapping coverage is high; local fallback rules do not count as trusted coverage.",
    blackstone_guardrail:
      "Blackstone remains unmapped/Moraware fallback unless an approved Sales Account Mapping row explicitly maps it.",
    examples: {
      needsReviewUnmapped: examples.needsReviewUnmapped.slice(0, 20),
      rejectedIgnored: examples.rejectedIgnored.slice(0, 10),
      approvedMapped: examples.approvedMapped.slice(0, 10),
      blackstoneUnapproved: examples.blackstoneUnapproved.slice(0, 10)
    },
    reviewRows,
    diagnostics: { ...diagnostics, compute_ms: elapsedMs(startedAt) },
    warnings: [diagnostics.warning, aliasResult.warning].filter(Boolean)
  };
}

async function fetchLatestCompleteMorawareActivities(supabase, organizationId, syncHealth) {
  const pageSize = 1000;
  const selectCols = "sync_run_id,source_activity_id,source_job_id,activity_type_name,activity_status_name,phase_name,scheduled_date,raw_payload";
  const group = syncHealth.latest_group;
  const runIds = Array.isArray(group?.successful_sync_run_ids) ? group.successful_sync_run_ids.map(String).filter(Boolean) : [];
  if (group?.import_group_id && group.complete === false) {
    return { rows: [], diagnostics: { rows_scanned: 0, query_page_count: 0, source_group_complete: false } };
  }
  const shouldScopeToGroup = Boolean(group?.complete && runIds.length);
  const rows = [];
  let queryPageCount = 0;
  const runIdGroups = shouldScopeToGroup ? chunkArray(runIds, 40) : [null];
  for (const runIdGroup of runIdGroups) {
    let from = 0;
    while (true) {
      let q = supabase
        .from("brain_moraware_job_activities")
        .select(selectCols)
        .eq("organization_id", organizationId)
        .order("scheduled_date", { ascending: true, nullsFirst: false })
        .range(from, from + pageSize - 1);
      if (runIdGroup) q = q.in("sync_run_id", runIdGroup);
      const { data, error } = await q;
      queryPageCount += 1;
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }
  return {
    rows,
    diagnostics: {
      rows_scanned: rows.length,
      query_page_count: queryPageCount,
      source_group_complete: Boolean(group?.complete),
      scoped_to_latest_complete_group: shouldScopeToGroup
    }
  };
}

function monthFromDate(value) {
  const s = String(value ?? "");
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null;
}

async function upsertRowsInChunks(supabase, table, rows, onConflict, size = 250) {
  for (const part of chunkArray(rows, size)) {
    const { error } = await supabase.from(table).upsert(part, { onConflict });
    if (error) throw error;
  }
}

async function buildSalesMorawareJobFactsForLatestGroup(supabase, organizationId, syncHealth) {
  const startedAt = Date.now();
  const group = syncHealth.latest_group;
  const importGroupId = String(group?.import_group_id ?? "").trim();
  const runIds = Array.isArray(group?.successful_sync_run_ids) ? group.successful_sync_run_ids.map(String).filter(Boolean) : [];
  if (!importGroupId || !group?.complete || !runIds.length) {
    return {
      ok: false,
      status: "latest_group_not_ready",
      import_group_id: importGroupId || null,
      jobs_scanned: 0,
      facts_upserted: 0,
      query_page_count: 0,
      compute_ms: elapsedMs(startedAt)
    };
  }

  const pageSize = 100;
  let jobsScanned = 0;
  let factsUpserted = 0;
  let queryPageCount = 0;
  const rollupsByAccount = new Map();

  const addRollupFact = (fact) => {
    const normalizedMorawareName = normalizeAccountNameWithoutLocationPrefix(fact.account_name);
    const key = normalizedMorawareName || String(fact.source_account_id ?? "").trim() || "(unknown)";
    const current =
      rollupsByAccount.get(key) ||
      {
        organization_id: organizationId,
        import_group_id: importGroupId,
        source_account_id: fact.source_account_id ?? null,
        account_name: fact.account_name ?? null,
        normalized_moraware_name: normalizedMorawareName || key,
        job_count: 0,
        jobs_with_sqft: 0,
        jobs_missing_sqft: 0,
        total_sqft: 0,
        first_report_date: null,
        last_report_date: null,
        updated_at: new Date().toISOString()
      };
    current.job_count += 1;
    if (fact.sqft_found) {
      current.jobs_with_sqft += 1;
      current.total_sqft += Number(fact.worksheet_sqft) || 0;
    } else {
      current.jobs_missing_sqft += 1;
    }
    const reportDate = String(fact.created_at_source ?? "").slice(0, 10);
    if (reportDate) {
      if (!current.first_report_date || reportDate < current.first_report_date) current.first_report_date = reportDate;
      if (!current.last_report_date || reportDate > current.last_report_date) current.last_report_date = reportDate;
    }
    rollupsByAccount.set(key, current);
  };

  // Dashboard requests must never do this raw-payload extraction. This builder
  // is the controlled path to refresh prepared facts after an import/sync.
  for (const runIdGroup of chunkArray(runIds, 1)) {
    let from = 0;
    while (true) {
      let q = supabase
        .from("brain_moraware_jobs")
        .select(
          "sync_run_id,source_job_id,source_account_id,account_name,status_name,process_name,salesperson_name,created_at_source,modified_at_source,scheduled_at_source,completed_at_source,install_at_source,raw_payload"
        )
        .eq("organization_id", organizationId)
        .in("sync_run_id", runIdGroup)
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      const { data, error } = await q;
      queryPageCount += 1;
      if (error) throw error;
      if (!data?.length) break;
      jobsScanned += data.length;
      const facts = data.map((job) => {
        const extracted = extractSqftFromMorawareJob(job);
        return {
          organization_id: organizationId,
          import_group_id: importGroupId,
          sync_run_id: job.sync_run_id,
          source_job_id: String(job.source_job_id ?? ""),
          source_account_id: job.source_account_id ?? null,
          account_name: job.account_name ?? null,
          status_name: job.status_name ?? null,
          process_name: job.process_name ?? null,
          salesperson_name: job.salesperson_name ?? null,
          created_at_source: job.created_at_source ?? null,
          modified_at_source: job.modified_at_source ?? null,
          scheduled_at_source: job.scheduled_at_source ?? null,
          completed_at_source: job.completed_at_source ?? null,
          install_at_source: job.install_at_source ?? null,
          worksheet_sqft: extracted.hasSqft ? extracted.totalSqft : null,
          sqft_found: Boolean(extracted.hasSqft),
          sqft_source: extracted.sources?.[0]?.source ?? null,
          report_month_created: monthFromDate(job.created_at_source),
          report_month_completed: monthFromDate(job.completed_at_source),
          report_month_install: monthFromDate(job.install_at_source),
          updated_at: new Date().toISOString()
        };
      });
      await upsertRowsInChunks(supabase, "sales_moraware_job_facts", facts, "organization_id,import_group_id,source_job_id", 100);
      factsUpserted += facts.length;
      for (const fact of facts) addRollupFact(fact);
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }
  const rollups = [...rollupsByAccount.values()].map((row) => ({ ...row, total_sqft: Math.round(row.total_sqft * 100) / 100 }));
  await upsertRowsInChunks(supabase, "sales_moraware_account_rollups", rollups, "organization_id,import_group_id,normalized_moraware_name", 100);

  return {
    ok: true,
    status: "built",
    import_group_id: importGroupId,
    jobs_scanned: jobsScanned,
    facts_upserted: factsUpserted,
    account_rollups_upserted: rollups.length,
    query_page_count: queryPageCount,
    compute_ms: elapsedMs(startedAt)
  };
}

export async function salesProductionReconciliationHandler(req, supabaseGetter) {
  const startedAt = Date.now();
  const supabase = supabaseGetter();
  const organizationId = resolveSalesOrganizationId(req);
  if (!organizationId) return { status: 400, body: { ok: false, error: "Sales reconciliation requires organization_id context." } };
  const syncHealth = await loadLatestMorawareGroup(supabase, organizationId);
  const facts = await fetchLatestPreparedSalesJobFacts(supabase, organizationId, syncHealth);
  if (!facts.available) {
    return {
      status: 200,
      body: {
        ok: true,
        reconciliation_status: "unavailable",
        warning: facts.warning,
        diagnostics: { ...facts.diagnostics, compute_ms: elapsedMs(startedAt) }
      }
    };
  }
  try {
    const activities = await fetchLatestCompleteMorawareActivities(supabase, organizationId, syncHealth);
    const reconciliation = buildProductionReportReconciliation(facts.rows, { activities: activities.rows });
    return {
      status: 200,
      body: {
        ok: true,
        reconciliation_status: "ok",
        reconciliation,
        diagnostics: {
          ...facts.diagnostics,
          activity_rows_scanned: activities.diagnostics.rows_scanned,
          activity_query_page_count: activities.diagnostics.query_page_count,
          compute_ms: elapsedMs(startedAt)
        }
      }
    };
  } catch (e) {
    return {
      status: 200,
      body: {
        ok: true,
        reconciliation_status: "error",
        error: String(e?.message ?? e),
        diagnostics: { ...facts.diagnostics, compute_ms: elapsedMs(startedAt) }
      }
    };
  }
}

function syncHealthFromCompleteImportGroup(completeGroup) {
  if (!completeGroup?.import_group_id) return { latest_group: null };
  return {
    latest_group: {
      import_group_id: completeGroup.import_group_id,
      chunk_count: completeGroup.observed_chunk_count ?? null,
      attempted_runs: completeGroup.attempted_runs ?? null,
      expected_chunk_count: completeGroup.expected_chunk_count ?? null,
      successful_chunks: completeGroup.successful_chunks ?? null,
      failed_chunks: completeGroup.failed_chunks ?? null,
      missing_chunk_indices: completeGroup.missing_chunk_indices ?? [],
      complete: Boolean(completeGroup.complete),
      successful_sync_run_ids: completeGroup.successful_sync_run_ids ?? [],
      total_row_counts: completeGroup.total_row_counts ?? {}
    }
  };
}

/** Rebuild prepared Sales facts from the latest **complete** Moraware import group. */
export async function rebuildSalesMorawarePreparedFacts(supabase, organizationId) {
  const completeGroup = await loadLatestCompleteImportGroup(supabase, organizationId);
  const syncHealth = syncHealthFromCompleteImportGroup(completeGroup);
  return buildSalesMorawareJobFactsForLatestGroup(supabase, organizationId, syncHealth);
}

export async function salesRebuildMorawareFactsHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const organizationId = resolveSalesOrganizationId(req);
  if (!organizationId) return { status: 400, body: { ok: false, error: "Sales facts rebuild requires organization_id context." } };
  try {
    const result = await rebuildSalesMorawarePreparedFacts(supabase, organizationId);
    return { status: result.ok ? 200 : 409, body: result };
  } catch (e) {
    return { status: 500, body: { ok: false, error: String(e?.message ?? e) } };
  }
}

function publicSyncHealth(syncHealth) {
  if (!syncHealth?.latest_group) return syncHealth;
  const { successful_sync_run_ids: _successfulSyncRunIds, ...latestGroup } = syncHealth.latest_group;
  return { ...syncHealth, latest_group: latestGroup };
}

async function safeQuotePipelineSummary(supabase, organizationId) {
  const quoteCount = await safeCount(supabase, "quote_headers", organizationId);
  const forecastCount = await safeCount(supabase, "quote_forecast_events", organizationId);
  let statusRows = [];
  try {
    let q = supabase.from("quote_headers").select("quote_status").limit(1000);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q;
    if (!error) statusRows = data || [];
  } catch {
    statusRows = [];
  }
  const byStatus = new Map();
  for (const row of statusRows) increment(byStatus, row.quote_status);
  return {
    quote_headers_count: quoteCount.count,
    quote_headers_error: quoteCount.error,
    quote_forecast_events_count: forecastCount.count,
    quote_forecast_events_error: forecastCount.error,
    status_breakdown: mapToRows(byStatus, "status")
  };
}

function morawareCountFromLatestGroup(syncHealth, key) {
  const rows = syncHealth?.latest_group?.total_row_counts || {};
  const n = Number(rows?.[key]);
  return { count: Number.isFinite(n) ? n : 0, error: null, source: "latest_import_group_row_counts" };
}

export async function salesDashboardFoundationHandler(req, supabaseGetter) {
  const requestStartedAt = Date.now();
  const authProfilePermissionMs = 0;
  const supabase = supabaseGetter();
  const organizationId = resolveSalesOrganizationId(req);
  if (!organizationId) {
    return { status: 400, body: { ok: false, error: "Sales dashboard requires organization_id context." } };
  }

  const syncStartedAt = Date.now();
  const syncHealth = await loadLatestMorawareGroup(supabase, organizationId);
  const syncHealthComputeMs = elapsedMs(syncStartedAt);

  const quotePipelinePromise = (async () => {
    const startedAt = Date.now();
    const value = await safeQuotePipelineSummary(supabase, organizationId);
    return { value, computeMs: elapsedMs(startedAt) };
  })();

  const attributionPromise = (async () => {
    const startedAt = Date.now();
    try {
      const value = await loadCompactSalesAttributionCoverage(supabase, { organizationId, syncHealth });
      return { ok: true, value, computeMs: elapsedMs(startedAt) };
    } catch (e) {
      return { ok: false, error: e, computeMs: elapsedMs(startedAt) };
    }
  })();

  const factsPromise = (async () => {
    const startedAt = Date.now();
    try {
      const value = await fetchLatestPreparedSalesJobFacts(supabase, organizationId, syncHealth);
      return { ok: true, value, computeMs: elapsedMs(startedAt) };
    } catch (e) {
      return { ok: false, error: e, computeMs: elapsedMs(startedAt) };
    }
  })();

  let jobs = [];
  let jobReadDiagnostics;
  let preparedFacts;
  let factsFetchComputeMs = null;
  let attributionComputeMs = null;
  let attributionCoverage;

  const [attributionResult, factsResult] = await Promise.all([attributionPromise, factsPromise]);
  attributionComputeMs = attributionResult.computeMs;
  factsFetchComputeMs = factsResult.computeMs;

  if (attributionResult.ok) {
    attributionCoverage = attributionResult.value;
  } else {
    const coverageError = attributionResult.error;
    attributionCoverage = {
      source: "sales_moraware_account_rollups_plus_sales_account_aliases",
      latest_import_group_id: syncHealth.latest_group?.import_group_id ?? null,
      totalAccountsSeen: 0,
      approvedMappedAccounts: 0,
      needsReviewUnmappedAccounts: 0,
      rejectedIgnoredAccounts: 0,
      totalJobsSeen: 0,
      approvedMappedJobs: 0,
      needsReviewUnmappedJobs: 0,
      rejectedIgnoredJobs: 0,
      approvedAccountCoveragePct: null,
      approvedJobCoveragePct: null,
      blackstoneUnapprovedAccounts: 0,
      warning: "Attribution coverage unavailable.",
      blackstone_guardrail:
        "Blackstone remains unmapped/Moraware fallback unless an approved Sales Account Mapping row explicitly maps it.",
      reviewRows: [],
      diagnostics: { warning: String(coverageError?.message ?? coverageError) },
      warnings: [String(coverageError?.message ?? coverageError)]
    };
  }

  if (factsResult.ok) {
    preparedFacts = factsResult.value;
    jobs = preparedFacts.rows;
    jobReadDiagnostics = preparedFacts.diagnostics;
  } else {
    preparedFacts = {
      rows: [],
      available: false,
      warning: String(factsResult.error?.message ?? factsResult.error),
      diagnostics: {
        rows_scanned: 0,
        query_page_count: 0,
        source_group_complete: syncHealth.latest_group?.complete ?? null,
        source_import_group_id: syncHealth.latest_group?.import_group_id ?? null,
        source_sync_run_count: 0,
        scoped_to_latest_complete_group: false,
        used_precomputed_rollup: false
      }
    };
    jobs = [];
    jobReadDiagnostics = preparedFacts.diagnostics;
  }

  const quotePipelineResult = await quotePipelinePromise;
  const quotePipeline = quotePipelineResult.value;
  const quotePipelineComputeMs = quotePipelineResult.computeMs;

  const latestGroupRows = syncHealth.latest_group?.total_row_counts || {};
  const accountCount = morawareCountFromLatestGroup(syncHealth, "accounts");
  const activityCount = morawareCountFromLatestGroup(syncHealth, "job_activities");
  const resourceCount = morawareCountFromLatestGroup(syncHealth, "resources");
  const rawFormsCount = morawareCountFromLatestGroup(syncHealth, "job_forms");
  const rawFilesCount = morawareCountFromLatestGroup(syncHealth, "job_files");
  const rawAssigneesCount = morawareCountFromLatestGroup(syncHealth, "assignees");

  const statusProcessStartedAt = Date.now();
  const byStatus = new Map();
  const byProcess = new Map();
  const bySalesperson = new Map();
  let newestJobDate = "";
  let oldestJobDate = "";
  const accountIds = new Set();
  for (const job of jobs) {
    increment(byStatus, job.status_name);
    increment(byProcess, job.process_name);
    increment(bySalesperson, job.salesperson_name);
    const accountId = String(job.source_account_id ?? "").trim();
    if (accountId) accountIds.add(accountId);
    const d = String(job.created_at_source ?? "").slice(0, 10);
    if (d) {
      if (!newestJobDate || d > newestJobDate) newestJobDate = d;
      if (!oldestJobDate || d < oldestJobDate) oldestJobDate = d;
    }
  }
  const statusProcessComputeMs = elapsedMs(statusProcessStartedAt);

  const actualsStartedAt = Date.now();
  const syncedSqftActualsBase = preparedFacts.available
    ? buildCompanyWideSqftActuals(jobs, { attributionCoverage, filters: req.query })
    : {
        source: "sales_moraware_job_facts",
        extraction_status: "prepared_rollup_missing",
        active_filters: {},
        total_synced_sqft: null,
        total_jobs_evaluated: 0,
        jobs_with_sqft: 0,
        jobs_missing_sqft: 0,
        sqft_coverage_pct: null,
        average_sqft_per_job: null,
        date_coverage: { oldest_job_created_at: null, newest_job_created_at: null },
        grouped_sqft_trend: [],
        monthly_sqft_trend: [],
        top_raw_accounts_by_sqft: [],
        filtered_attribution_coverage: null,
        notes: [
          "Prepared Sales Moraware facts are required for fast dashboard reads.",
          "Run the controlled facts/rollup builder after deploying the additive facts table migration."
        ]
      };
  const actualsComputeMs = elapsedMs(actualsStartedAt);
  const includeReconciliation = String(req.query?.includeReconciliation ?? "").trim() === "1";
  let productionReportReconciliation = null;
  let reconciliationStatus = includeReconciliation ? "not_requested" : "not_requested";
  let reconciliationComputeMs = null;
  if (includeReconciliation) {
    const reconciliationStartedAt = Date.now();
    try {
      const latestActivities = await fetchLatestCompleteMorawareActivities(supabase, organizationId, syncHealth);
      productionReportReconciliation = buildProductionReportReconciliation(jobs, { activities: latestActivities.rows });
      reconciliationStatus = "ok";
    } catch (e) {
      reconciliationStatus = "error";
      productionReportReconciliation = { status: "error", error: String(e?.message ?? e) };
    }
    reconciliationComputeMs = elapsedMs(reconciliationStartedAt);
  }
  const latestGroupComplete = syncHealth.latest_group?.complete !== false;
  const responseBuildStartedAt = Date.now();
  const syncedSqftActuals = {
    ...syncedSqftActualsBase,
    rows_scanned: jobReadDiagnostics.rows_scanned,
    query_page_count: jobReadDiagnostics.query_page_count,
    source_group_complete: jobReadDiagnostics.source_group_complete,
    source_import_group_id: jobReadDiagnostics.source_import_group_id,
    source_sync_run_count: jobReadDiagnostics.source_sync_run_count,
    scoped_to_latest_complete_group: jobReadDiagnostics.scoped_to_latest_complete_group,
    used_precomputed_rollup: jobReadDiagnostics.used_precomputed_rollup,
    used_facts_fallback: false,
    prepared_rollup_warning: preparedFacts.warning ?? null,
    actuals_compute_ms: actualsComputeMs,
    attribution_compute_ms: attributionComputeMs,
    attribution_used_account_rollups: Boolean(attributionCoverage?.diagnostics?.attribution_used_account_rollups),
    attribution_account_rollups_count: attributionCoverage?.diagnostics?.attribution_account_rollups_count ?? null,
    attribution_mapping_rows_count: attributionCoverage?.diagnostics?.attribution_mapping_rows_count ?? null,
    used_precomputed_summary: Boolean(attributionCoverage?.diagnostics?.used_precomputed_summary),
    reconciliation_compute_ms: reconciliationComputeMs,
    reconciliation_status: reconciliationStatus,
    production_report_reconciliation: productionReportReconciliation,
    import_group_trust_status: latestGroupComplete ? "latest_group_complete_or_single_run" : "latest_group_incomplete",
    import_group_warning: latestGroupComplete
      ? null
      : "Latest Moraware import group is incomplete or has a failed latest chunk attempt; treat 2026 baseline actuals as partial until the group is completed successfully."
  };
  const blueprintStaticPayloadComputeMs = 0;
  const responseBuildComputeMs = elapsedMs(responseBuildStartedAt);
  const totalHandlerComputeMs = elapsedMs(requestStartedAt);

  return {
    status: 200,
    body: {
      ok: true,
      organization_id: organizationId,
      blueprint_preserve: [],
      sync_health: publicSyncHealth(syncHealth),
      actuals: {
        source: "brain_moraware_*",
        jobs_count: jobs.length || Number(latestGroupRows.jobs ?? 0) || 0,
        accounts_count: accountCount.count,
        active_account_ids_in_jobs: accountIds.size,
        job_activities_count: activityCount.count,
        job_forms_count: rawFormsCount.count,
        job_files_count: rawFilesCount.count,
        assignees_count: rawAssigneesCount.count,
        resources_count: resourceCount.count,
        oldest_job_created_at: oldestJobDate || null,
        newest_job_created_at: newestJobDate || null,
        status_breakdown: mapToRows(byStatus, "status"),
        process_breakdown: mapToRows(byProcess, "process"),
        salesperson_breakdown: mapToRows(bySalesperson, "salesperson").slice(0, 12)
      },
      synced_sqft_actuals: syncedSqftActuals,
      attribution_coverage: attributionCoverage,
      quote_pipeline: quotePipeline,
      data_contract: {
        actuals: "Moraware Brain tables provide job/account/activity/status/process actuals.",
        company_sqft_actuals:
          "Company-wide synced sqft totals read prepared Sales Moraware facts for fast dashboard loads; raw Moraware payload extraction is a controlled build/import concern.",
        forward_pipeline: "Quote Library quote_headers and quote_forecast_events provide future quote/forecast signals when populated.",
        mappings: "Elite 100 color/group/manufacturer/account attribution should remain backend-owned/admin-configurable.",
        account_branch_attribution:
          "Trusted account -> branch/location/salesperson attribution must come from approved Sales Account Mapping Admin rows, not local fallback rules.",
        attribution_status: "preview_needs_approved_mapping",
        no_frontend_sources: "Frontend reads this backend aggregate only; it never calls Moraware or receives credentials."
      },
      gaps: [
        ...(latestGroupComplete
          ? []
          : ["latest Moraware import group is incomplete; 2026 baseline actuals are partial until resume completes all chunks"]),
        ...(preparedFacts.available ? [] : ["prepared Sales Moraware facts are missing for the latest complete import group; run controlled facts/rollup builder before treating dashboard Sq.Ft. as available"]),
        "revenue actuals are not yet normalized in brain_moraware_jobs",
        "branch/salesperson sqft totals remain gated until approved Sales Account Mapping coverage is high",
        "Elite 100 color/group/manufacturer mapping is not yet connected to Moraware foundation rows",
        "account/branch attribution needs approved backend mapping between Moraware account/customer names and sales ownership/location",
        "job_files and assignees may be absent from current live capped imports",
        "machine/resource assignment and material inventory are intentionally out of scope for this pass"
      ],
      performance_diagnostics: {
        auth_profile_permission_compute_ms: authProfilePermissionMs,
        sync_health_compute_ms: syncHealthComputeMs,
        facts_fetch_compute_ms: factsFetchComputeMs,
        actuals_compute_ms: actualsComputeMs,
        attribution_compute_ms: attributionComputeMs,
        quote_pipeline_compute_ms: quotePipelineComputeMs,
        status_process_compute_ms: statusProcessComputeMs,
        blueprint_static_payload_compute_ms: blueprintStaticPayloadComputeMs,
        response_build_compute_ms: responseBuildComputeMs,
        total_handler_compute_ms: totalHandlerComputeMs,
        request_compute_ms: totalHandlerComputeMs,
        attribution_used_account_rollups: Boolean(attributionCoverage?.diagnostics?.attribution_used_account_rollups),
        attribution_account_rollups_count: attributionCoverage?.diagnostics?.attribution_account_rollups_count ?? null,
        attribution_mapping_rows_count: attributionCoverage?.diagnostics?.attribution_mapping_rows_count ?? null,
        used_precomputed_summary: Boolean(attributionCoverage?.diagnostics?.used_precomputed_summary),
        reconciliation_compute_ms: reconciliationComputeMs,
        used_precomputed_rollup: Boolean(jobReadDiagnostics.used_precomputed_rollup),
        used_facts_fallback: false,
        reconciliation_status: reconciliationStatus
      }
    }
  };
}

// ── KPI v1 helpers ────────────────────────────────────────────────────────

function validateYmd(raw) {
  const s = String(raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Pick the customer-facing display value for a quote row.
 * Prefers `calculation_snapshot.internal_ui.customer_display_total` (customer-facing
 * estimated project total), falls back to `grand_total` for older quotes.
 */
function pickKpiCdtValue(row) {
  const snap = row.calculation_snapshot;
  if (snap && typeof snap === "object") {
    const iu = snap.internal_ui;
    if (iu && typeof iu === "object") {
      const cdt = Number(iu.customer_display_total);
      if (Number.isFinite(cdt) && cdt > 0) return { value: cdt, source: "customer_display_total" };
    }
  }
  const gt = Number(row.grand_total);
  if (Number.isFinite(gt) && gt > 0) return { value: gt, source: "grand_total_fallback" };
  return { value: 0, source: "zero" };
}

function periodBucketForKpi(dateYmd, grain) {
  if (!dateYmd || dateYmd.length < 10) return "undated";
  if (grain === "week") {
    const sw = startOfWeekMondayLocal(dateYmd);
    return sw || dateYmd.slice(0, 7);
  }
  return dateYmd.slice(0, 7);
}

function buildQuotePipelineResult(rows, startDate, endDate, grain, revisionFiltered) {
  const periods = new Map();
  const statusMap = new Map();
  let totalCount = 0;
  let totalValue = 0;
  let cdtCount = 0;
  let gtFallbackCount = 0;
  let mostRecentUpdatedAt = null;

  for (const row of rows) {
    const dateStr = row.created_at ? row.created_at.slice(0, 10) : null;
    if (!dateStr || dateStr < startDate || dateStr > endDate) continue;
    const bucket = periodBucketForKpi(dateStr, grain);
    const { value: quoteValue, source: valueSource } = pickKpiCdtValue(row);
    const status = String(row.quote_status ?? "").trim() || "unknown";

    if (!periods.has(bucket)) {
      periods.set(bucket, {
        period_label: bucket,
        period_start: bucket,
        quote_count: 0,
        customer_quote_value: 0,
        customer_display_total_used: 0,
        grand_total_fallback_used: 0,
        sent_count: 0,
        sold_count: 0,
        lost_count: 0,
        status_breakdown: {}
      });
    }
    const p = periods.get(bucket);
    p.quote_count += 1;
    p.customer_quote_value += quoteValue;
    if (valueSource === "customer_display_total") p.customer_display_total_used += 1;
    else p.grand_total_fallback_used += 1;
    p.status_breakdown[status] = (p.status_breakdown[status] || 0) + 1;
    if (/sent|pending/i.test(status)) p.sent_count += 1;
    if (/won|sold|accepted|approved/i.test(status)) p.sold_count += 1;
    if (/lost|rejected|declined|cancelled|canceled/i.test(status)) p.lost_count += 1;

    increment(statusMap, status);
    totalCount += 1;
    totalValue += quoteValue;
    if (valueSource === "customer_display_total") cdtCount += 1;
    else gtFallbackCount += 1;

    const updAt = row.updated_at || row.created_at;
    if (updAt && (!mostRecentUpdatedAt || updAt > mostRecentUpdatedAt)) mostRecentUpdatedAt = updAt;
  }

  const periodsArr = [...periods.values()]
    .sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)))
    .map((p) => ({
      ...p,
      average_quote_value: p.quote_count > 0 ? Math.round(p.customer_quote_value / p.quote_count) : 0,
      customer_quote_value: Math.round(p.customer_quote_value)
    }));

  return {
    ok: true,
    periods: periodsArr,
    totals: {
      quote_count: totalCount,
      customer_quote_value: Math.round(totalValue),
      average_quote_value: totalCount > 0 ? Math.round(totalValue / totalCount) : 0,
      customer_display_total_used: cdtCount,
      grand_total_fallback_used: gtFallbackCount
    },
    statusBreakdown: mapToRows(statusMap, "status"),
    mostRecentUpdatedAt,
    revision_filter_applied: revisionFiltered
  };
}

async function fetchKpiQuotePipeline(supabase, organizationId, startDate, endDate, grain) {
  const startTs = `${startDate}T00:00:00`;
  const endTs = `${endDate}T23:59:59.999`;

  const baseSelect = "id,grand_total,calculation_snapshot,quote_status,created_at,updated_at";

  let q = supabase
    .from("quote_headers")
    .select(baseSelect)
    .is("archived_at", null)
    .gte("created_at", startTs)
    .lte("created_at", endTs)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (organizationId) q = q.eq("organization_id", organizationId);

  let qCurrent = q.eq("is_current_revision", true);
  const { data, error } = await qCurrent;
  if (error) {
    if (String(error?.message ?? "").toLowerCase().includes("is_current_revision")) {
      let qFallback = supabase
        .from("quote_headers")
        .select(baseSelect)
        .is("archived_at", null)
        .gte("created_at", startTs)
        .lte("created_at", endTs)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (organizationId) qFallback = qFallback.eq("organization_id", organizationId);
      const res2 = await qFallback;
      if (res2.error) throw res2.error;
      return buildQuotePipelineResult(res2.data || [], startDate, endDate, grain, false);
    }
    throw error;
  }
  return buildQuotePipelineResult(data || [], startDate, endDate, grain, true);
}

async function fetchKpiMorawareActuals(supabase, organizationId, startDate, endDate, grain) {
  let syncHealth;
  try {
    syncHealth = await loadLatestMorawareGroup(supabase, organizationId);
  } catch (e) {
    return {
      ok: true,
      periods: [],
      totals: null,
      extractionStatus: "not_available",
      syncNote: `Moraware sync health unavailable: ${String(e?.message ?? e)}`,
      morawareLastSuccess: null,
      syncHealth: null
    };
  }

  let facts;
  try {
    facts = await fetchLatestPreparedSalesJobFacts(supabase, organizationId, syncHealth);
  } catch (e) {
    return {
      ok: true,
      periods: [],
      totals: null,
      extractionStatus: "not_available",
      syncNote: `Moraware prepared facts unavailable: ${String(e?.message ?? e)}`,
      morawareLastSuccess: null,
      syncHealth
    };
  }

  if (!facts.available) {
    return {
      ok: true,
      periods: [],
      totals: null,
      extractionStatus: "not_available",
      syncNote: facts.warning || "Moraware prepared facts are not available.",
      morawareLastSuccess: null,
      syncHealth
    };
  }

  const actuals = buildCompanyWideSqftActuals(facts.rows, {
    filters: { datePreset: "custom", startDate, endDate, timeGrain: grain }
  });

  const latestGroupId = syncHealth.latest_group?.import_group_id ?? null;
  const latestGroupComplete = syncHealth.latest_group?.complete ?? null;
  const usedGroupId = facts.used_import_group_id ?? latestGroupId;
  const fallbackUsed = Boolean(facts.fallback_used);

  let syncNote;
  if (fallbackUsed && facts.warning) {
    syncNote = facts.warning;
  } else {
    syncNote = latestGroupId
      ? `Import group ${latestGroupId} (${latestGroupComplete ? "complete" : "incomplete"})`
      : "No Moraware import group found.";
  }

  const morawareLastSuccess =
    syncHealth.latest_group?.completed_at ?? syncHealth.last_success?.finished_at ?? null;

  const periods = actuals.grouped_sqft_trend.map((row) => ({
    period_label: row.period,
    period_start: row.period,
    worksheet_sqft: row.total_sqft,
    job_count: row.job_count,
    jobs_with_sqft: row.jobs_with_sqft,
    template_count: null,
    installed_sqft: null,
    template_count_note: "not_available_in_current_data",
    installed_sqft_note: "not_available_in_current_data"
  }));

  return {
    ok: true,
    periods,
    totals: {
      worksheet_sqft: actuals.total_synced_sqft,
      job_count: actuals.total_jobs_evaluated,
      jobs_with_sqft: actuals.jobs_with_sqft,
      sqft_coverage_pct:
        actuals.sqft_coverage_pct != null ? Math.round(actuals.sqft_coverage_pct * 10) / 10 : null,
      average_sqft_per_job:
        actuals.average_sqft_per_job != null
          ? Math.round(actuals.average_sqft_per_job * 100) / 100
          : null,
      template_count: null,
      installed_sqft: null
    },
    extractionStatus: actuals.extraction_status,
    syncNote,
    fallbackUsed,
    latestImportGroupId: latestGroupId,
    latestImportGroupComplete: latestGroupComplete,
    usedImportGroupId: usedGroupId,
    morawareLastSuccess,
    syncHealth
  };
}

/**
 * GET /api/sales/kpi-v1 — read-only KPI rollup from existing quote_headers and
 * sales_moraware_job_facts. No new tables; source/freshness/trust-labeled response.
 *
 * Query params: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD), grain (week|month)
 */
export async function salesKpiV1Handler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const organizationId = resolveSalesOrganizationId(req);
  if (!organizationId) {
    return { status: 400, body: { ok: false, error: "Sales KPI v1 requires organization_id context." } };
  }

  const generatedAt = new Date().toISOString();
  const today = calendarTodayLocalYmd();
  const tl = parseLocalYmd(today);
  const startDate = validateYmd(req.query.start_date) || `${tl.getFullYear()}-01-01`;
  const endDate = validateYmd(req.query.end_date) || today;
  if (startDate > endDate) {
    return { status: 400, body: { ok: false, error: "start_date must be on or before end_date." } };
  }
  const grain = ["week", "month"].includes(String(req.query.grain ?? "").trim().toLowerCase())
    ? String(req.query.grain).trim().toLowerCase()
    : "month";

  const [quotePipelineResult, morawareResult] = await Promise.all([
    fetchKpiQuotePipeline(supabase, organizationId, startDate, endDate, grain).catch((e) => ({
      ok: false,
      error: String(e?.message ?? e)
    })),
    fetchKpiMorawareActuals(supabase, organizationId, startDate, endDate, grain).catch((e) => ({
      ok: false,
      error: String(e?.message ?? e)
    }))
  ]);

  return {
    status: 200,
    body: {
      ok: true,
      range: { start_date: startDate, end_date: endDate, grain },
      freshness: {
        moraware_last_success:
          morawareResult.ok && "morawareLastSuccess" in morawareResult
            ? morawareResult.morawareLastSuccess
            : null,
        quote_last_updated: quotePipelineResult.ok
          ? (quotePipelineResult.mostRecentUpdatedAt ?? null)
          : null,
        generated_at: generatedAt
      },
      trust: {
        attribution_status: "company_wide_available_branch_rep_gated",
        branch_rep_gated: true,
        protected_mapping_rules_enforced: true,
        note: "Branch/rep attribution is gated by approved Sales Account Mapping. Company-wide totals are available before mapping coverage is high. Account-specific mapping guardrails are enforced."
      },
      quote_pipeline: quotePipelineResult.ok
        ? {
            source: "quote_library",
            trust: "customer_display_total_preferred",
            customer_display_total_note:
              "Quote value uses customer_display_total (customer-facing estimate total) when available; falls back to grand_total for older quotes.",
            quote_date_basis:
              "created_at (internal estimate creation date; no sent_at or quote_date on current schema)",
            revision_filter: quotePipelineResult.revision_filter_applied
              ? "is_current_revision=true and archived_at IS NULL"
              : "archived_at IS NULL (is_current_revision not available)",
            periods: quotePipelineResult.periods,
            totals: quotePipelineResult.totals,
            status_breakdown: quotePipelineResult.statusBreakdown
          }
        : {
            source: "quote_library",
            status: "not_available",
            error: quotePipelineResult.error,
            periods: [],
            totals: null
          },
      moraware_actuals: morawareResult.ok
        ? {
            source: "moraware_prepared_facts",
            trust: "company_wide_actuals",
            extraction_status: morawareResult.extractionStatus,
            sync_note: morawareResult.syncNote,
            fallback_used: morawareResult.fallbackUsed ?? false,
            latest_import_group_id: morawareResult.latestImportGroupId ?? null,
            latest_import_group_complete: morawareResult.latestImportGroupComplete ?? null,
            used_import_group_id: morawareResult.usedImportGroupId ?? null,
            periods: morawareResult.periods,
            totals: morawareResult.totals
          }
        : {
            source: "moraware_prepared_facts",
            status: "not_available",
            error: morawareResult.error,
            periods: [],
            totals: null
          },
      partner_quote: {
        source: "partner_quote",
        status: "planned",
        note: "Partner Quote KPIs are planned for a future pass. No partner quote data is available yet."
      },
      notes: [
        "Branch, salesperson, and account attribution remains gated by approved Sales Account Mapping.",
        "Account-specific mapping guardrails are enforced by the Sales Account Mapping system.",
        "Company-wide totals are available before branch/rep rollups are trusted.",
        "Quote value uses the customer-facing estimated project total (customer_display_total) when available, grand_total for older quotes."
      ]
    }
  };
}

// ── End KPI v1 ────────────────────────────────────────────────────────────

// ── Sales Dashboard Summary (Phase 1 — quote_headers only) ────────────────
//
// GET /api/sales-dashboard/summary
//
// Pre-aggregated, chart-ready bento dashboard payload built ONLY from reliable
// Quote Library data (`quote_headers`). Phase 1 intentionally does NOT use
// Moraware prepared facts or branch/rep attribution — those remain gated.
// Frontend widgets receive prepared aggregates; no business aggregation happens
// in the browser.

const SUMMARY_RANGE_KEYS = new Set(["ytd", "rolling_30", "this_month", "this_week"]);

const SUMMARY_QUOTE_SELECT =
  "id,quote_number,customer_name,project_name,sales_rep,branch,grand_total,calculation_snapshot,quote_status,created_at,monday_item_id";

/** Outcome bucket for a quote status: "won" | "lost" | "open". Archived rows are excluded upstream by query. */
function classifyQuoteOutcome(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (/won|sold|accepted|approved/.test(s)) return "won";
  if (/lost|rejected|declined|cancel/.test(s)) return "lost";
  return "open";
}

/** Open quotes that warrant follow-up attention (aligned with quote pipeline summary). */
function isFollowUpStatus(status) {
  const s = String(status ?? "").trim().toLowerCase();
  return /follow.?up|lead_submitted|reviewing/.test(s);
}

/** "YYYY-MM" → "Mon YYYY" short label for trend buckets. */
function monthShortLabel(ym) {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = Number(String(ym).slice(5, 7));
  const name = names[m - 1] || String(ym);
  return `${name} ${String(ym).slice(0, 4)}`;
}

/**
 * Pure aggregation for the bento summary. Operates on already-fetched, org-scoped
 * quote_headers rows. Returns zeros and empty arrays for empty input (never throws).
 */
export function buildSalesDashboardSummary(rows, { startDate, endDate, todayYmd, weekStartYmd }) {
  let openValue = 0;
  let wonValue = 0;
  let lostValue = 0;
  let openCount = 0;
  let wonCount = 0;
  let lostCount = 0;
  let totalCount = 0;
  let totalValue = 0;
  let newToday = 0;
  let newThisWeek = 0;
  let followUp = 0;
  let mondayHandoff = 0;
  const trendMap = new Map();

  for (const row of rows || []) {
    const dateStr = row?.created_at ? String(row.created_at).slice(0, 10) : null;
    if (!dateStr || dateStr < startDate || dateStr > endDate) continue;
    const { value } = pickKpiCdtValue(row);
    const outcome = classifyQuoteOutcome(row?.quote_status);

    totalCount += 1;
    totalValue += value;

    if (outcome === "won") {
      wonValue += value;
      wonCount += 1;
    } else if (outcome === "lost") {
      lostValue += value;
      lostCount += 1;
    } else {
      openValue += value;
      openCount += 1;
    }

    if (dateStr === todayYmd) newToday += 1;
    if (weekStartYmd && dateStr >= weekStartYmd && dateStr <= todayYmd) newThisWeek += 1;

    if (outcome === "open" && isFollowUpStatus(row?.quote_status)) followUp += 1;
    if (outcome === "won" && !String(row?.monday_item_id ?? "").trim()) mondayHandoff += 1;

    const ym = dateStr.slice(0, 7);
    if (!trendMap.has(ym)) {
      trendMap.set(ym, { period_start: ym, quoted_value: 0, won_value: 0, quote_count: 0 });
    }
    const t = trendMap.get(ym);
    t.quoted_value += value;
    if (outcome === "won") t.won_value += value;
    t.quote_count += 1;
  }

  const closed = wonCount + lostCount;
  const winRatePct = closed > 0 ? Math.round((wonCount / closed) * 1000) / 10 : 0;
  const averageQuoteValue = totalCount > 0 ? Math.round(totalValue / totalCount) : 0;

  const trend = [...trendMap.values()]
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .map((t) => ({
      period: monthShortLabel(t.period_start),
      period_start: t.period_start,
      quoted_value: Math.round(t.quoted_value),
      won_value: Math.round(t.won_value),
      quote_count: t.quote_count
    }));

  return {
    summary: {
      open_pipeline_value: Math.round(openValue),
      won_value: Math.round(wonValue),
      active_quote_count: openCount,
      total_quote_count: totalCount,
      win_rate_pct: winRatePct,
      average_quote_value: averageQuoteValue,
      new_quotes_today: newToday,
      new_quotes_this_week: newThisWeek
    },
    estimate_outcomes: [
      { label: "Open", value: Math.round(openValue), count: openCount },
      { label: "Won", value: Math.round(wonValue), count: wonCount },
      { label: "Lost", value: Math.round(lostValue), count: lostCount }
    ],
    quote_activity: {
      new_today: newToday,
      new_this_week: newThisWeek,
      follow_up_queue: followUp,
      monday_handoff_needed: mondayHandoff,
      average_quote_value: averageQuoteValue
    },
    trend
  };
}

/** Map a quote_headers row to the public recent_quotes shape (null-safe). */
export function mapRecentQuoteForSummary(row) {
  const { value } = pickKpiCdtValue(row || {});
  return {
    id: row?.id ?? null,
    quote_number: String(row?.quote_number ?? "").trim() || null,
    customer: String(row?.customer_name ?? "").trim() || null,
    project: String(row?.project_name ?? "").trim() || null,
    salesperson: String(row?.sales_rep ?? "").trim() || null,
    branch: String(row?.branch ?? "").trim() || null,
    value: Math.round(value),
    status: String(row?.quote_status ?? "").trim() || null,
    created_at: row?.created_at ?? null
  };
}

function buildSummaryRangeQuery(supabase, organizationId, startTs, endTs, filters, withRevision) {
  let q = supabase
    .from("quote_headers")
    .select(SUMMARY_QUOTE_SELECT)
    .is("archived_at", null)
    .gte("created_at", startTs)
    .lte("created_at", endTs)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (organizationId) q = q.eq("organization_id", organizationId);
  if (filters.branch) q = q.ilike("branch", `%${filters.branch}%`);
  if (filters.salesperson) q = q.ilike("sales_rep", `%${filters.salesperson}%`);
  if (withRevision) q = q.eq("is_current_revision", true);
  return q;
}

async function fetchSummaryQuoteRows(supabase, organizationId, startTs, endTs, filters) {
  const res = await buildSummaryRangeQuery(supabase, organizationId, startTs, endTs, filters, true);
  if (res.error) {
    if (String(res.error?.message ?? "").toLowerCase().includes("is_current_revision")) {
      const res2 = await buildSummaryRangeQuery(supabase, organizationId, startTs, endTs, filters, false);
      if (res2.error) throw res2.error;
      return { rows: res2.data || [], revisionFiltered: false };
    }
    throw res.error;
  }
  return { rows: res.data || [], revisionFiltered: true };
}

function buildRecentQuotesQuery(supabase, organizationId, filters, withRevision) {
  let q = supabase
    .from("quote_headers")
    .select(SUMMARY_QUOTE_SELECT)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  if (organizationId) q = q.eq("organization_id", organizationId);
  if (filters.branch) q = q.ilike("branch", `%${filters.branch}%`);
  if (filters.salesperson) q = q.ilike("sales_rep", `%${filters.salesperson}%`);
  if (withRevision) q = q.eq("is_current_revision", true);
  return q;
}

async function fetchRecentQuoteRows(supabase, organizationId, filters) {
  const res = await buildRecentQuotesQuery(supabase, organizationId, filters, true);
  if (res.error) {
    if (String(res.error?.message ?? "").toLowerCase().includes("is_current_revision")) {
      const res2 = await buildRecentQuotesQuery(supabase, organizationId, filters, false);
      if (res2.error) throw res2.error;
      return res2.data || [];
    }
    throw res.error;
  }
  return res.data || [];
}

/**
 * GET /api/sales-dashboard/summary — Phase 1 bento command center payload.
 * Source: quote_headers only. No Moraware attribution. Org-scoped, aggregate-only.
 *
 * Query params: range (ytd|rolling_30|this_month|this_week; default ytd),
 *               branch (string), salesperson (string).
 */
export async function salesDashboardSummaryHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const organizationId = resolveSalesOrganizationId(req);
  if (!organizationId) {
    return { status: 400, body: { ok: false, error: "Sales dashboard summary requires organization_id context." } };
  }

  const generatedAt = new Date().toISOString();
  const rawRange = String(req.query.range ?? "ytd").trim().toLowerCase();
  const rangeKey = SUMMARY_RANGE_KEYS.has(rawRange) ? rawRange : "ytd";
  const resolved = resolveSalesDateRange({ range: rangeKey, compare: "none" });
  if (!resolved.ok) {
    return { status: 400, body: { ok: false, error: resolved.error } };
  }
  const startDate = resolved.startDate;
  const endDate = resolved.endDate;
  const startTs = `${startDate}T00:00:00`;
  const endTs = `${endDate}T23:59:59.999`;

  const branch = String(req.query.branch ?? "").trim();
  const salesperson = String(req.query.salesperson ?? "").trim();
  const filters = { branch: branch || null, salesperson: salesperson || null };

  const todayYmd = calendarTodayLocalYmd();
  const weekStartYmd = startOfWeekMondayLocal(todayYmd);

  const baseTrustNotes = [
    "Phase 1 uses quote_headers only. Moraware branch/rep attribution is intentionally gated.",
    "Quote value uses customer_display_total (customer-facing estimate total) when available; falls back to grand_total for older quotes.",
    "Win rate is won / (won + lost), excluding archived quotes.",
    "Branch and salesperson filters apply to Quote Library fields only and are not Moraware-attributed."
  ];

  let rangeRows = [];
  let revisionFiltered = true;
  let dataWarning = null;
  try {
    const fetched = await fetchSummaryQuoteRows(supabase, organizationId, startTs, endTs, filters);
    rangeRows = fetched.rows;
    revisionFiltered = fetched.revisionFiltered;
  } catch (e) {
    // Graceful degradation: missing relation or query error returns zeros, not a 500.
    dataWarning = `Quote data unavailable: ${String(e?.message ?? e)}`;
    rangeRows = [];
  }

  let recentRows = [];
  if (!dataWarning) {
    try {
      recentRows = await fetchRecentQuoteRows(supabase, organizationId, filters);
    } catch {
      recentRows = [];
    }
  }

  const agg = buildSalesDashboardSummary(rangeRows, { startDate, endDate, todayYmd, weekStartYmd });
  const recentQuotes = recentRows.map(mapRecentQuoteForSummary);

  const trustNotes = [...baseTrustNotes];
  trustNotes.push(
    revisionFiltered
      ? "Aggregates use current quote revisions only (is_current_revision = true)."
      : "is_current_revision unavailable; aggregates include all non-archived revisions."
  );
  if (dataWarning) trustNotes.push(dataWarning);

  return {
    status: 200,
    body: {
      ok: true,
      generated_at: generatedAt,
      range: { key: rangeKey, start_date: startDate, end_date: endDate },
      filters_applied: filters,
      summary: agg.summary,
      estimate_outcomes: agg.estimate_outcomes,
      quote_activity: agg.quote_activity,
      recent_quotes: recentQuotes,
      trend: agg.trend,
      trust_notes: trustNotes
    }
  };
}

// ── End Sales Dashboard Summary ───────────────────────────────────────────

async function fetchMorawareJobEnrichmentMap(supabase, organizationId, sourceJobIds) {
  /** @type {Map<string, { job_name: string|null, notes_excerpt: string|null }>} */
  const map = new Map();
  const ids = [...new Set(sourceJobIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (!ids.length) return map;

  for (const part of chunkArray(ids, 200)) {
    let q = supabase
      .from("brain_moraware_jobs")
      .select("source_job_id,job_name,raw_payload")
      .eq("organization_id", organizationId)
      .in("source_job_id", part);
    const { data, error } = await q;
    if (error) {
      if (isMissingRelationError(error)) return map;
      throw error;
    }
    for (const row of data ?? []) {
      const key = String(row.source_job_id ?? "").trim();
      if (!key) continue;
      map.set(key, {
        job_name: String(row.job_name ?? "").trim() || null,
        notes_excerpt: extractNotesExcerptFromRawPayload(row.raw_payload) || null
      });
    }
  }
  return map;
}

/**
 * POST /api/sales/query — read-only deterministic Moraware query explorer.
 * Loads prepared facts, enriches job names/notes from brain_moraware_jobs, filters in memory.
 */
export async function salesMorawareQueryHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const organizationId = resolveSalesOrganizationId(req);
  if (!organizationId) {
    return { status: 400, body: { ok: false, error: "Sales query requires organization_id context." } };
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const source = String(body.source ?? "moraware").trim().toLowerCase();
  if (source !== "moraware") {
    return { status: 400, body: { ok: false, error: `Unsupported query source "${source}". Only "moraware" is available in v1.` } };
  }

  const filters = normalizeMorawareQueryFilters(body.filters ?? {});

  let syncHealth;
  try {
    syncHealth = await loadLatestMorawareGroup(supabase, organizationId);
  } catch (e) {
    return {
      status: 200,
      body: {
        ok: false,
        source: "moraware",
        unavailable: true,
        message: `Moraware sync health unavailable: ${String(e?.message ?? e)}`
      }
    };
  }

  let factsResult;
  try {
    factsResult = await fetchLatestPreparedSalesJobFacts(supabase, organizationId, syncHealth);
  } catch (e) {
    return {
      status: 200,
      body: {
        ok: false,
        source: "moraware",
        unavailable: true,
        message: `Moraware prepared facts unavailable: ${String(e?.message ?? e)}`
      }
    };
  }

  if (!factsResult.available || !factsResult.rows?.length) {
    return {
      status: 200,
      body: {
        ok: false,
        source: "moraware",
        unavailable: true,
        message: factsResult.warning || "Moraware data is not available yet."
      }
    };
  }

  let enrichmentMap = new Map();
  try {
    enrichmentMap = await fetchMorawareJobEnrichmentMap(
      supabase,
      organizationId,
      factsResult.rows.map((r) => r.source_job_id)
    );
  } catch {
    enrichmentMap = new Map();
  }

  const queryResult = executeMorawareSalesQuery(factsResult.rows, filters, enrichmentMap);

  return {
    status: 200,
    body: {
      ok: true,
      source: "moraware",
      query: String(body.query ?? "").trim() || null,
      summary: queryResult.summary,
      filters_applied: queryResult.filters_applied,
      top_accounts: queryResult.top_accounts,
      top_salespeople: queryResult.top_salespeople,
      tag_breakdown: queryResult.tag_breakdown,
      total_count: queryResult.total_count,
      rows: queryResult.rows,
      meta: {
        extraction_status: "ok",
        sync_note: factsResult.warning ?? null,
        fallback_used: Boolean(factsResult.fallback_used),
        used_import_group_id: factsResult.used_import_group_id ?? factsResult.diagnostics?.source_import_group_id ?? null,
        latest_import_group_id: factsResult.latest_import_group_id ?? syncHealth?.latest_group?.import_group_id ?? null,
        latest_import_group_complete: factsResult.latest_import_group_complete ?? syncHealth?.latest_group?.complete ?? null,
        facts_rows_loaded: factsResult.rows.length
      }
    }
  };
}

// ── End Moraware Sales Query ──────────────────────────────────────────────

/**
 * Register Sales Head read routes. Matches Executive pattern: requireAuth → requireRole (admin bypass) → head access.
 * @param {import("express").Application} app
 * @param {{ requireAuth: () => import("express").RequestHandler, requireRole: (roles: string[]) => import("express").RequestHandler, requireHeadAccess: typeof import("../auth/headAccessMiddleware.js").requireHeadAccess, getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function attachSalesHeadRoutes(app, { requireAuth, requireRole, requireHeadAccess, getSupabase }) {
  const headAccessSales = requireHeadAccess("sales", { getSupabase });
  const roleList = [...SALES_API_ROLES];

  function execSales(handler) {
    return async (req, res) => {
      try {
        const out = await handler(req, getSupabase);
        res.status(out.status).json(out.body);
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e?.message ?? e) });
      }
    };
  }

  console.log(
    "[sales] mounted GET /api/sales/{summary,salesperson-performance,account-performance,trend,jobs,filters," +
    "dashboard,dashboard-foundation,production-reconciliation,performance-intelligence,debug,kpi-v1} " +
    "+ GET /api/sales-dashboard/summary + POST /api/sales/query (requireAuth + SALES_API_ROLES + sales head)"
  );

  app.get("/api/sales/summary", requireAuth(), requireRole(roleList), headAccessSales, execSales(salesSummaryHandler));
  app.get(
    "/api/sales/salesperson-performance",
    requireAuth(),
    requireRole(roleList),
    headAccessSales,
    execSales(salesSalespersonPerformanceHandler)
  );
  app.get(
    "/api/sales/account-performance",
    requireAuth(),
    requireRole(roleList),
    headAccessSales,
    execSales(salesAccountPerformanceHandler)
  );
  app.get("/api/sales/trend", requireAuth(), requireRole(roleList), headAccessSales, execSales(salesTrendHandler));
  app.get("/api/sales/jobs", requireAuth(), requireRole(roleList), headAccessSales, execSales(salesJobsHandler));
  app.get("/api/sales/filters", requireAuth(), requireRole(roleList), headAccessSales, execSales(salesFiltersHandler));
  app.get("/api/sales/dashboard", requireAuth(), requireRole(roleList), headAccessSales, execSales(salesDashboardHandler));
  app.get(
    "/api/sales/dashboard/detail",
    requireAuth(),
    requireRole(roleList),
    headAccessSales,
    execSales(salesDashboardDetailHandler)
  );
  app.get(
    "/api/sales/dashboard-foundation",
    requireAuth(),
    requireRole(roleList),
    headAccessSales,
    execSales(salesDashboardFoundationHandler)
  );
  app.get(
    "/api/sales/production-reconciliation",
    requireAuth(),
    requireRole(roleList),
    headAccessSales,
    execSales(salesProductionReconciliationHandler)
  );
  app.post(
    "/api/sales/admin/rebuild-moraware-facts",
    requireAuth(),
    requireRole(["admin"]),
    headAccessSales,
    execSales(salesRebuildMorawareFactsHandler)
  );
  app.get(
    "/api/sales/performance-intelligence",
    requireAuth(),
    requireRole(roleList),
    headAccessSales,
    execSales(salesPerformanceIntelligenceHandler)
  );
  app.get("/api/sales/debug", requireAuth(), requireRole(roleList), headAccessSales, execSales(salesDebugHandler));
  app.get("/api/sales/kpi-v1", requireAuth(), requireRole(roleList), headAccessSales, execSales(salesKpiV1Handler));
  app.get(
    "/api/sales-dashboard/summary",
    requireAuth(),
    requireRole(roleList),
    headAccessSales,
    execSales(salesDashboardSummaryHandler)
  );
  app.post(
    "/api/sales/query",
    requireAuth(),
    requireRole(roleList),
    headAccessSales,
    salesJsonParser,
    execSales(salesMorawareQueryHandler)
  );
}
