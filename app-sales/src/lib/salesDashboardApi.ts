import {
  DEFAULT_DASHBOARD_FILTERS,
  type DashboardFilters,
  type QuickRange,
  type SalesDashboardTab
} from "./salesDashboardTypes";

const VALID_TABS = new Set<SalesDashboardTab>([
  "command_center",
  "sales_performance",
  "forecasting",
  "quote_pipeline",
  "production_flow",
  "accounts",
  "colors_materials",
  "data_explorer",
  "data_quality"
]);

const VALID_QUICK_RANGES = new Set<QuickRange>([
  "ytd",
  "this_month",
  "this_quarter",
  "rolling_30",
  "rolling_60",
  "rolling_90",
  "custom"
]);

function setIf(p: URLSearchParams, key: string, value: string | number | boolean | undefined | null) {
  if (value == null || value === "" || value === false) return;
  if (typeof value === "boolean") p.set(key, value ? "1" : "0");
  else p.set(key, String(value));
}

export function filtersToQueryString(filters: DashboardFilters): string {
  const p = new URLSearchParams();
  p.set("tab", filters.tab);
  p.set("quickRange", filters.quickRange);
  setIf(p, "start", filters.start);
  setIf(p, "end", filters.end);
  setIf(p, "branch", filters.branch);
  setIf(p, "salesperson", filters.salesperson);
  setIf(p, "assignedRep", filters.assignedRep);
  setIf(p, "jobSalesperson", filters.jobSalesperson);
  setIf(p, "account", filters.account);
  setIf(p, "rawAccount", filters.rawAccount);
  setIf(p, "canonicalAccount", filters.canonicalAccount);
  setIf(p, "jobStatus", filters.jobStatus);
  setIf(p, "quoteStatus", filters.quoteStatus);
  setIf(p, "quoteSource", filters.quoteSource);
  setIf(p, "forecastStatus", filters.forecastStatus);
  setIf(p, "productionStatus", filters.productionStatus);
  setIf(p, "collectionStatus", filters.collectionStatus);
  setIf(p, "eliteGroup", filters.eliteGroup);
  setIf(p, "manufacturer", filters.manufacturer);
  setIf(p, "color", filters.color);
  setIf(p, "stone", filters.stone);
  setIf(p, "roomKeyword", filters.roomKeyword);
  setIf(p, "sqftMin", filters.sqftMin);
  setIf(p, "sqftMax", filters.sqftMax);
  setIf(p, "yoyMin", filters.yoyMin);
  setIf(p, "yoyMax", filters.yoyMax);
  setIf(p, "eliteShareMin", filters.eliteShareMin);
  setIf(p, "eliteShareMax", filters.eliteShareMax);
  setIf(p, "outShareMin", filters.outShareMin);
  setIf(p, "outShareMax", filters.outShareMax);
  setIf(p, "dormantOnly", filters.dormantOnly);
  setIf(p, "behindPriorYearOnly", filters.behindPriorYearOnly);
  setIf(p, "unmappedOnly", filters.unmappedOnly);
  setIf(p, "unknownColorsOnly", filters.unknownColorsOnly);
  setIf(p, "programSignalOnly", filters.programSignalOnly);
  setIf(p, "quotedNotProducedOnly", filters.quotedNotProducedOnly);
  setIf(p, "forecastWindow", filters.forecastWindow);
  setIf(p, "sortBy", filters.sortBy);
  setIf(p, "sortDir", filters.sortDir);
  setIf(p, "page", filters.page);
  setIf(p, "pageSize", filters.pageSize);
  return p.toString();
}

function parseBool(v: string | null): boolean {
  return v === "1" || v === "true" || v === "yes";
}

function strParam(p: URLSearchParams, key: string): string {
  return String(p.get(key) ?? "").trim();
}

/** Parse browser URL search params into dashboard filter state. */
export function parseFiltersFromSearchParams(search: string, tabFallback: SalesDashboardTab = "command_center"): DashboardFilters {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tabRaw = strParam(p, "tab") as SalesDashboardTab;
  const tab = VALID_TABS.has(tabRaw) ? tabRaw : tabFallback;
  const qrRaw = strParam(p, "quickRange") as QuickRange;
  const quickRange = VALID_QUICK_RANGES.has(qrRaw) ? qrRaw : DEFAULT_DASHBOARD_FILTERS.quickRange;
  const sortDirRaw = strParam(p, "sortDir");
  const sortDir = sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : DEFAULT_DASHBOARD_FILTERS.sortDir;

  return {
    ...DEFAULT_DASHBOARD_FILTERS,
    tab,
    quickRange,
    start: strParam(p, "start") || undefined,
    end: strParam(p, "end") || undefined,
    branch: strParam(p, "branch"),
    salesperson: strParam(p, "salesperson"),
    assignedRep: strParam(p, "assignedRep"),
    jobSalesperson: strParam(p, "jobSalesperson"),
    account: strParam(p, "account"),
    rawAccount: strParam(p, "rawAccount"),
    canonicalAccount: strParam(p, "canonicalAccount"),
    jobStatus: strParam(p, "jobStatus"),
    quoteStatus: strParam(p, "quoteStatus"),
    quoteSource: strParam(p, "quoteSource"),
    forecastStatus: strParam(p, "forecastStatus"),
    productionStatus: strParam(p, "productionStatus"),
    collectionStatus: strParam(p, "collectionStatus"),
    eliteGroup: strParam(p, "eliteGroup"),
    manufacturer: strParam(p, "manufacturer"),
    color: strParam(p, "color"),
    stone: strParam(p, "stone"),
    roomKeyword: strParam(p, "roomKeyword"),
    sqftMin: strParam(p, "sqftMin"),
    sqftMax: strParam(p, "sqftMax"),
    yoyMin: strParam(p, "yoyMin"),
    yoyMax: strParam(p, "yoyMax"),
    eliteShareMin: strParam(p, "eliteShareMin"),
    eliteShareMax: strParam(p, "eliteShareMax"),
    outShareMin: strParam(p, "outShareMin"),
    outShareMax: strParam(p, "outShareMax"),
    dormantOnly: parseBool(p.get("dormantOnly")),
    behindPriorYearOnly: parseBool(p.get("behindPriorYearOnly")),
    unmappedOnly: parseBool(p.get("unmappedOnly")),
    unknownColorsOnly: parseBool(p.get("unknownColorsOnly")),
    programSignalOnly: parseBool(p.get("programSignalOnly")),
    quotedNotProducedOnly: parseBool(p.get("quotedNotProducedOnly")),
    forecastWindow: strParam(p, "forecastWindow"),
    sortBy: strParam(p, "sortBy") || DEFAULT_DASHBOARD_FILTERS.sortBy,
    sortDir,
    page: Math.max(1, Number(p.get("page")) || 1),
    pageSize: Math.min(200, Math.max(10, Number(p.get("pageSize")) || DEFAULT_DASHBOARD_FILTERS.pageSize))
  };
}

/** Sync shareable filter state to the browser URL without reload. */
export function syncFiltersToBrowserUrl(filters: DashboardFilters): void {
  if (typeof window === "undefined") return;
  const qs = filtersToQueryString(filters);
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    window.history.replaceState(null, "", next);
  }
}

export function readInitialTabFromUrl(fallback: SalesDashboardTab = "command_center"): SalesDashboardTab {
  if (typeof window === "undefined") return fallback;
  const tab = strParam(new URLSearchParams(window.location.search), "tab") as SalesDashboardTab;
  return VALID_TABS.has(tab) ? tab : fallback;
}

export function clearFilterParam(filters: DashboardFilters, param: string): DashboardFilters {
  const next = { ...filters };
  const boolKeys = new Set([
    "dormantOnly",
    "behindPriorYearOnly",
    "unmappedOnly",
    "unknownColorsOnly",
    "programSignalOnly",
    "quotedNotProducedOnly"
  ]);
  if (boolKeys.has(param)) {
    (next as Record<string, unknown>)[param] = false;
  } else {
    (next as Record<string, unknown>)[param] = "";
  }
  return next;
}
