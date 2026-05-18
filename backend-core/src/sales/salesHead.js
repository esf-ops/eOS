/**
 * Sales Head API — Brain-only aggregates (no Moraware in request path).
 * Mirrors Executive job/sqft patterns: `worksheet_sqft` Rollup currency fields are intentionally null until Quote Platform feeds revenue.
 */

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
      .limit(100);
    if (organizationId) groupQ = groupQ.eq("organization_id", organizationId);
    const group = await groupQ;
    if (group.error) throw group.error;
    groupRows = group.data || [];
  }
  const totalRowCounts = groupRows.reduce((acc, row) => {
    for (const [key, value] of Object.entries(row.row_counts || {})) acc[key] = (acc[key] || 0) + (Number(value) || 0);
    return acc;
  }, {});
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
          chunk_count: groupRows.length,
          expected_chunk_count: groupRows[0]?.metadata?.chunk_count ?? latestRun?.metadata?.chunk_count ?? null,
          successful_chunks: groupRows.filter((r) => r.status === "success").length,
          failed_chunks: groupRows.filter((r) => r.status === "failed").length,
          total_row_counts: totalRowCounts
        }
      : null,
    last_success_age_seconds: lastSuccessAgeSeconds
  };
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

export async function salesDashboardFoundationHandler(req, supabaseGetter) {
  const supabase = supabaseGetter();
  const organizationId = resolveSalesOrganizationId(req);
  if (!organizationId) {
    return { status: 400, body: { ok: false, error: "Sales dashboard requires organization_id context." } };
  }

  const [syncHealth, accountCount, activityCount, resourceCount, rawFormsCount, rawFilesCount, rawAssigneesCount, quotePipeline] =
    await Promise.all([
      loadLatestMorawareGroup(supabase, organizationId),
      safeCount(supabase, "brain_moraware_accounts", organizationId),
      safeCount(supabase, "brain_moraware_job_activities", organizationId),
      safeCount(supabase, "brain_moraware_resources", organizationId),
      safeCount(supabase, "moraware_raw_job_forms", organizationId),
      safeCount(supabase, "moraware_raw_job_files", organizationId),
      safeCount(supabase, "moraware_raw_assignees", organizationId),
      safeQuotePipelineSummary(supabase, organizationId)
    ]);

  let jobsQ = supabase
    .from("brain_moraware_jobs")
    .select("source_job_id,source_account_id,status_name,process_name,salesperson_name,created_at_source,modified_at_source")
    .eq("organization_id", organizationId)
    .limit(5000);
  const jobsRes = await jobsQ;
  if (jobsRes.error) return { status: 500, body: { ok: false, error: jobsRes.error.message } };

  const jobs = jobsRes.data || [];
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

  return {
    status: 200,
    body: {
      ok: true,
      organization_id: organizationId,
      blueprint_preserve: [
        "ESF Total and Individual Rep tabs",
        "date, branch, collection, Elite group, search, manufacturer, and color filters",
        "quick ranges: YTD, Q1, April, last 30, current week, full 2025, all loaded",
        "company and rep KPI cards",
        "monthly YoY trend",
        "Elite 100 mix and group breakdown",
        "manufacturer mix",
        "rep summary and coaching insights",
        "top accounts/producers and accounts needing attention",
        "top Elite 100 and out-of-collection colors",
        "rep-specific account detail"
      ],
      sync_health: syncHealth,
      actuals: {
        source: "brain_moraware_*",
        jobs_count: jobs.length,
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
      quote_pipeline: quotePipeline,
      data_contract: {
        actuals: "Moraware Brain tables provide job/account/activity/status/process actuals.",
        forward_pipeline: "Quote Library quote_headers and quote_forecast_events provide future quote/forecast signals when populated.",
        mappings: "Elite 100 color/group/manufacturer/account attribution should remain backend-owned/admin-configurable.",
        account_branch_attribution:
          "Trusted account -> branch/location/salesperson attribution must come from approved Sales Account Mapping Admin rows, not local fallback rules.",
        attribution_status: "preview_needs_approved_mapping",
        no_frontend_sources: "Frontend reads this backend aggregate only; it never calls Moraware or receives credentials."
      },
      gaps: [
        "sqft/revenue actuals are not yet normalized in brain_moraware_jobs",
        "Elite 100 color/group/manufacturer mapping is not yet connected to Moraware foundation rows",
        "account/branch attribution needs approved backend mapping between Moraware account/customer names and sales ownership/location",
        "job_files and assignees may be absent from current live capped imports",
        "machine/resource assignment and material inventory are intentionally out of scope for this pass"
      ]
    }
  };
}

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
  app.get(
    "/api/sales/dashboard-foundation",
    requireAuth(),
    requireRole(roleList),
    headAccessSales,
    execSales(salesDashboardFoundationHandler)
  );
  app.get(
    "/api/sales/performance-intelligence",
    requireAuth(),
    requireRole(roleList),
    headAccessSales,
    execSales(salesPerformanceIntelligenceHandler)
  );
  app.get("/api/sales/debug", requireAuth(), requireRole(roleList), headAccessSales, execSales(salesDebugHandler));
}
