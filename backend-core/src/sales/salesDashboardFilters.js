/**
 * Sales Command Center — filter parsing and row-level filter application.
 * Pure helpers + query-param normalization for GET /api/sales/dashboard.
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

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

function fmtLocal(dt) {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function addDaysLocal(dt, days) {
  const x = new Date(dt.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function calendarTodayLocalYmd() {
  return fmtLocal(new Date());
}

function startOfWeekMondayLocal(ymd) {
  const dt = parseLocalYmd(ymd);
  if (!dt) return null;
  const dow = dt.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return fmtLocal(addDaysLocal(dt, offset));
}

function resolveQuickRange(rangeKey) {
  const today = calendarTodayLocalYmd();
  const tl = parseLocalYmd(today);
  if (!tl) return { ok: false, error: "Unable to derive calendar today." };

  let startInclusive;
  let endInclusive = today;

  switch (rangeKey) {
    case "today":
      startInclusive = today;
      break;
    case "yesterday":
      startInclusive = fmtLocal(addDaysLocal(tl, -1));
      endInclusive = startInclusive;
      break;
    case "this_week": {
      const sw = startOfWeekMondayLocal(today);
      if (!sw) return { ok: false, error: "Invalid week start." };
      startInclusive = sw;
      break;
    }
    case "last_week": {
      const sw = startOfWeekMondayLocal(today);
      const thisWeekStart = parseLocalYmd(sw);
      if (!thisWeekStart) return { ok: false, error: "Invalid week anchor." };
      const lastWeekStart = addDaysLocal(thisWeekStart, -7);
      startInclusive = fmtLocal(lastWeekStart);
      endInclusive = fmtLocal(addDaysLocal(lastWeekStart, 6));
      break;
    }
    case "this_month":
      startInclusive = `${tl.getFullYear()}-${pad2(tl.getMonth() + 1)}-01`;
      break;
    case "last_month": {
      const first = new Date(tl.getFullYear(), tl.getMonth() - 1, 1);
      const last = new Date(tl.getFullYear(), tl.getMonth(), 0);
      startInclusive = fmtLocal(first);
      endInclusive = fmtLocal(last);
      break;
    }
    case "this_quarter": {
      const q = Math.floor(tl.getMonth() / 3);
      startInclusive = `${tl.getFullYear()}-${pad2(q * 3 + 1)}-01`;
      break;
    }
    case "ytd":
      startInclusive = `${tl.getFullYear()}-01-01`;
      break;
    case "rolling_30":
      startInclusive = fmtLocal(addDaysLocal(tl, -29));
      break;
    case "rolling_60":
      startInclusive = fmtLocal(addDaysLocal(tl, -59));
      break;
    case "rolling_90":
      startInclusive = fmtLocal(addDaysLocal(tl, -89));
      break;
    case "custom":
      return { ok: false, error: "custom range requires start and end query params." };
    default:
      startInclusive = `${tl.getFullYear()}-01-01`;
  }

  return {
    ok: true,
    startDate: startInclusive,
    endDate: endInclusive,
    endExclusive: fmtLocal(addDaysLocal(parseLocalYmd(endInclusive), 1))
  };
}

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

const QUICK_RANGE_MAP = Object.freeze({
  today: "today",
  yesterday: "yesterday",
  this_week: "this_week",
  last_week: "last_week",
  this_month: "this_month",
  last_month: "last_month",
  this_quarter: "this_quarter",
  last_quarter: "last_quarter",
  ytd: "ytd",
  last_ytd: "last_ytd",
  last_year: "last_year",
  rolling_7: "rolling_7",
  rolling_30: "rolling_30",
  rolling_60: "rolling_60",
  rolling_90: "rolling_90",
  custom: "custom"
});

const SORT_FIELDS = new Set([
  "total_sqft",
  "current_sqft",
  "prior_sqft",
  "yoy_sqft",
  "yoy_pct",
  "elite_sqft",
  "elite_share",
  "out_sqft",
  "out_share",
  "quote_count",
  "quote_value",
  "forecast_value",
  "forecast_sqft",
  "produced_sqft",
  "job_count",
  "account_count",
  "color_count",
  "focus_score",
  "latest_job_date",
  "account_name",
  "rep_name",
  "branch",
  "manufacturer"
]);

function str(raw) {
  return String(raw ?? "").trim();
}

function num(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function bool(raw) {
  const s = str(raw).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * @param {Record<string, unknown>} query
 */
export function parseDashboardFilters(query = {}) {
  const quickRange = str(query.quickRange || query.range || "ytd").toLowerCase();
  const mappedRange = QUICK_RANGE_MAP[quickRange] || "ytd";
  let rangeResult = resolveQuickRange(mappedRange);
  if (mappedRange === "custom") {
    const start = str(query.start);
    const end = str(query.end);
    const a = parseLocalYmd(start);
    const b = parseLocalYmd(end);
    if (!a || !b || start > end) {
      return { ok: false, error: "custom range requires valid start and end YYYY-MM-DD." };
    }
    rangeResult = {
      ok: true,
      startDate: start,
      endDate: end,
      endExclusive: fmtLocal(addDaysLocal(b, 1))
    };
  }
  if (!rangeResult.ok) {
    return { ok: false, error: rangeResult.error };
  }

  const prior = comparisonPreviousYear(rangeResult.startDate, rangeResult.endDate);
  if (!prior) {
    return { ok: false, error: "Unable to derive prior-year comparison window." };
  }

  const sortBy = SORT_FIELDS.has(str(query.sortBy)) ? str(query.sortBy) : "total_sqft";
  const sortDir = str(query.sortDir || query.sortDirection).toLowerCase() === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(500, Math.max(1, Number.parseInt(String(query.pageSize ?? "50"), 10) || 50));

  return {
    ok: true,
    tab: str(query.tab || query.view || "command_center") || "command_center",
    dateRange: {
      quickRange: mappedRange,
      start: rangeResult.startDate,
      end: rangeResult.endDate,
      endExclusive: rangeResult.endExclusive
    },
    priorRange: {
      start: prior.startInclusive,
      end: prior.endInclusive,
      endExclusive: prior.endExclusive
    },
    branch: str(query.branch),
    salesperson: str(query.salesperson),
    assignedRep: str(query.assignedRep),
    jobSalesperson: str(query.jobSalesperson),
    account: str(query.account),
    rawAccount: str(query.rawAccount),
    canonicalAccount: str(query.canonicalAccount),
    jobStatus: str(query.jobStatus || query.status),
    quoteStatus: str(query.quoteStatus),
    quoteSource: str(query.quoteSource),
    forecastStatus: str(query.forecastStatus),
    productionStatus: str(query.productionStatus),
    collectionStatus: str(query.collectionStatus),
    eliteGroup: str(query.eliteGroup),
    manufacturer: str(query.manufacturer),
    color: str(query.color),
    stone: str(query.stone),
    roomKeyword: str(query.roomKeyword),
    sqftMin: num(query.sqftMin),
    sqftMax: num(query.sqftMax),
    yoyMin: num(query.yoyMin),
    yoyMax: num(query.yoyMax),
    eliteShareMin: num(query.eliteShareMin),
    eliteShareMax: num(query.eliteShareMax),
    outShareMin: num(query.outShareMin),
    outShareMax: num(query.outShareMax),
    dormantOnly: bool(query.dormantOnly),
    behindPriorYearOnly: bool(query.behindPriorYearOnly),
    unmappedOnly: bool(query.unmappedOnly),
    unknownColorsOnly: bool(query.unknownColorsOnly),
    programSignalOnly: bool(query.programSignalOnly),
    quotedNotProducedOnly: bool(query.quotedNotProducedOnly),
    forecastWindow: str(query.forecastWindow),
    sortBy,
    sortDir,
    page,
    pageSize,
    ...parseDashboardRequestOptions(query)
  };
}

/**
 * Payload / cache request options (not row filters).
 * @param {Record<string, unknown>} query
 */
export function parseDashboardRequestOptions(query = {}) {
  const modeRaw = str(query.mode).toLowerCase();
  const mode = modeRaw === "tab" || modeRaw === "full" ? modeRaw : "overview";
  const includeDetails = bool(query.includeDetails);
  const loadProfileRaw = str(query.loadProfile).toLowerCase();
  const loadProfile = loadProfileRaw === "full" ? "full" : "overview";
  return { mode, includeDetails, loadProfile };
}

/**
 * @param {string} dateYmd
 * @param {{ start: string, end: string }} range
 */
export function dateInInclusiveRange(dateYmd, range) {
  const d = str(dateYmd).slice(0, 10);
  if (!d || !range?.start || !range?.end) return false;
  return d >= range.start && d <= range.end;
}

/**
 * @param {object} row — enriched job row
 * @param {ReturnType<parseDashboardFilters>} filters
 */
export function rowMatchesDashboardFilters(row, filters) {
  if (!row || !filters?.ok) return false;

  if (filters.branch && filters.branch !== "All" && str(row.branch) !== filters.branch) return false;
  if (filters.salesperson && filters.salesperson !== "All") {
    if (str(row.normalizedSalesperson) !== filters.salesperson) return false;
  }
  if (filters.assignedRep && str(row.assignedSalesperson) !== filters.assignedRep) return false;
  if (filters.jobSalesperson && str(row.morawareSalesperson) !== filters.jobSalesperson) return false;

  const acct = str(row.account_name).toLowerCase();
  if (filters.account && !acct.includes(filters.account.toLowerCase())) return false;
  if (filters.rawAccount && !acct.includes(filters.rawAccount.toLowerCase())) return false;
  if (filters.canonicalAccount) {
    const canon = str(row.canonicalAccountName || row.mondayAccountName).toLowerCase();
    if (!canon.includes(filters.canonicalAccount.toLowerCase())) return false;
  }

  if (filters.jobStatus && str(row.job_status || row.status_name) !== filters.jobStatus) return false;
  if (filters.productionStatus && str(row.productionStatus) !== filters.productionStatus) return false;

  if (filters.collectionStatus) {
    const cs = str(row.colorCollectionStatus);
    if (filters.collectionStatus === "elite100" && cs !== "elite100") return false;
    if (filters.collectionStatus === "out_of_collection" && cs !== "out_of_collection") return false;
    if (filters.collectionStatus === "unknown" && cs !== "unknown") return false;
  }

  if (filters.eliteGroup && str(row.eliteGroup) !== filters.eliteGroup) return false;
  if (filters.manufacturer && !str(row.manufacturer).toLowerCase().includes(filters.manufacturer.toLowerCase())) return false;
  if (filters.color && !str(row.color).toLowerCase().includes(filters.color.toLowerCase())) return false;
  if (filters.stone && !str(row.stone || row.material).toLowerCase().includes(filters.stone.toLowerCase())) return false;
  if (filters.roomKeyword && !str(row.room).toLowerCase().includes(filters.roomKeyword.toLowerCase())) return false;

  const sqft = Number(row.worksheet_sqft ?? row.sqft ?? 0) || 0;
  if (filters.sqftMin != null && sqft < filters.sqftMin) return false;
  if (filters.sqftMax != null && sqft > filters.sqftMax) return false;

  if (filters.unmappedOnly && row.attributionStatus === "approved_mapped") return false;
  if (filters.unknownColorsOnly && row.colorCollectionStatus !== "unknown") return false;
  if (filters.dormantOnly && !row.isDormant) return false;
  if (filters.behindPriorYearOnly && !row.isBehindPriorYear) return false;
  if (filters.quotedNotProducedOnly && !row.quotedNotProduced) return false;
  if (filters.programSignalOnly && !row.programSignal) return false;

  return true;
}

/**
 * @template T
 * @param {T[]} rows
 * @param {string} sortBy
 * @param {"asc"|"desc"} sortDir
 */
export function sortRows(rows, sortBy, sortDir) {
  const dir = sortDir === "asc" ? 1 : -1;
  const keyMap = {
    total_sqft: (r) => Number(r.total_sqft ?? r.currentSqft ?? r.sqft ?? 0),
    current_sqft: (r) => Number(r.currentSqft ?? r.current_sqft ?? r.sqft ?? 0),
    prior_sqft: (r) => Number(r.priorSqft ?? r.prior_sqft ?? 0),
    yoy_sqft: (r) => Number(r.yoySqft ?? r.yoy_sqft ?? 0),
    yoy_pct: (r) => Number(r.yoyPct ?? r.yoy_pct ?? 0),
    elite_sqft: (r) => Number(r.eliteSqft ?? r.elite_sqft ?? 0),
    elite_share: (r) => Number(r.eliteShare ?? r.elite_share ?? 0),
    out_sqft: (r) => Number(r.outSqft ?? r.out_sqft ?? 0),
    out_share: (r) => Number(r.outShare ?? r.out_share ?? 0),
    quote_count: (r) => Number(r.quoteCount ?? r.quote_count ?? 0),
    quote_value: (r) => Number(r.quoteValue ?? r.quote_value ?? 0),
    forecast_value: (r) => Number(r.forecastValue ?? r.forecast_value ?? 0),
    forecast_sqft: (r) => Number(r.forecastSqft ?? r.forecast_sqft ?? 0),
    produced_sqft: (r) => Number(r.producedSqft ?? r.produced_sqft ?? r.sqft ?? 0),
    job_count: (r) => Number(r.jobCount ?? r.job_count ?? 0),
    account_count: (r) => Number(r.accountCount ?? r.account_count ?? 0),
    color_count: (r) => Number(r.colorCount ?? r.color_count ?? 0),
    focus_score: (r) => Number(r.focusScore ?? r.focus_score ?? 0),
    latest_job_date: (r) => str(r.latestJobDate ?? r.latest_job_date),
    account_name: (r) => str(r.account ?? r.account_name),
    rep_name: (r) => str(r.salesperson ?? r.rep_name ?? r.normalizedSalesperson),
    branch: (r) => str(r.branch),
    manufacturer: (r) => str(r.manufacturer)
  };
  const getter = keyMap[sortBy] || keyMap.total_sqft;
  return [...rows].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    if (typeof av === "string" && typeof bv === "string") return dir * av.localeCompare(bv);
    return dir * ((Number(av) || 0) - (Number(bv) || 0));
  });
}

/**
 * @template T
 * @param {T[]} rows
 * @param {number} page
 * @param {number} pageSize
 */
export function paginateRows(rows, page, pageSize) {
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return {
    total,
    page,
    pageSize,
    rows: rows.slice(start, start + pageSize)
  };
}
