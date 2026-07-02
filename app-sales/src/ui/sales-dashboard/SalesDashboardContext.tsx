import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiFetch } from "../../lib/api";
import {
  clearFilterParam,
  filtersToQueryString,
  parseFiltersFromSearchParams,
  syncFiltersToBrowserUrl
} from "../../lib/salesDashboardApi";
import {
  collectExportRows,
  downloadCsv,
  exportFilename,
  type ExportKind
} from "../../lib/salesDashboardExport";
import { ALL_BUILTIN_VIEWS, type DashboardViewDefinition } from "../../lib/salesDashboardPresets";
import {
  deleteUserView,
  filtersMatchView,
  loadUserSavedViews,
  renameUserView,
  saveUserView,
  snapshotFiltersForView,
  viewDefinitionFromUser,
  type UserSavedView
} from "../../lib/salesDashboardSavedViews";
import {
  DEFAULT_DASHBOARD_FILTERS,
  type AccountDetail,
  type ColorDetail,
  type DashboardFilters,
  type DataQualityIssue,
  type DetailSelection,
  type SalesDashboardResponse,
  type SalesDashboardTab
} from "../../lib/salesDashboardTypes";

type Ctx = {
  filters: DashboardFilters;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilters>>;
  patchFilters: (patch: Partial<DashboardFilters>) => void;
  clearFilter: (param: string) => void;
  resetFilters: () => void;
  setTab: (tab: SalesDashboardTab) => void;
  data: SalesDashboardResponse | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
  detail: DetailSelection;
  openAccountDetail: (account: string) => void;
  openColorDetail: (key: string, label: string) => void;
  closeDetail: () => void;
  copyMsg: string;
  copyInsights: () => void;
  copyExecutiveSummary: () => void;
  copyAccountSummary: (detail: AccountDetail) => void;
  copyColorSummary: (detail: ColorDetail) => void;
  exportCsv: (filename?: string) => void;
  exportDashboardCsv: (kind: ExportKind) => boolean;
  activeViewId: string | null;
  activeViewDirty: boolean;
  builtinViews: DashboardViewDefinition[];
  userSavedViews: UserSavedView[];
  applyView: (view: DashboardViewDefinition) => void;
  saveCurrentView: (label: string) => UserSavedView;
  renameSavedView: (id: string, label: string) => void;
  deleteSavedView: (id: string) => void;
  resetToDefaultView: () => void;
  navigateDataQualityIssue: (issue: DataQualityIssue) => void;
  copyIssueSamples: (issue: DataQualityIssue) => void;
  executiveSummaryOpen: boolean;
  setExecutiveSummaryOpen: (open: boolean) => void;
};

const SalesDashboardContext = createContext<Ctx | null>(null);

function fmtSqft(n: number | null | undefined) {
  return `${Math.round(Number(n) || 0).toLocaleString()} sqft`;
}

function buildAccountSummaryText(d: AccountDetail): string {
  const lines = [
    `Account: ${d.account}`,
    `Current: ${fmtSqft(d.currentSqft)} · Prior year: ${fmtSqft(d.priorSqft)} · YoY: ${d.yoyPct != null ? `${d.yoyPct.toFixed(1)}%` : "—"}`,
    `Rep: ${d.assignedRep || "—"} · Branch: ${d.branch || "—"}`,
    `Elite 100: ${d.eliteShare != null ? `${d.eliteShare.toFixed(1)}%` : "—"} · Out-of-collection: ${d.outShare != null ? `${d.outShare.toFixed(1)}%` : "—"}`
  ];
  if (d.focusReasons?.length) lines.push(`Attention: ${d.focusReasons.map((r) => r.replace(/_/g, " ")).join(", ")}`);
  if (d.topColors?.length) lines.push(`Top colors: ${d.topColors.slice(0, 5).map((c) => `${c.color} (${fmtSqft(c.sqft)})`).join(", ")}`);
  if (d.relatedQuotes?.length) lines.push(`Quotes: ${d.relatedQuotes.length} related (${d.relatedQuotes.slice(0, 3).map((q) => q.quoteNumber).join(", ")})`);
  if (d.mappingNotes?.length) lines.push(`Data notes: ${d.mappingNotes.join("; ")}`);
  return lines.join("\n");
}

function buildColorSummaryText(d: ColorDetail): string {
  const lines = [
    `Color: ${d.color}${d.material ? ` · ${d.material}` : ""}`,
    `Status: ${d.collectionStatus} · Group: ${d.eliteGroup || "—"} · Manufacturer: ${d.manufacturer || "—"}`,
    `Catalog match: ${d.catalogDisplayName || "—"}`,
    `Sqft: ${fmtSqft(d.sqft)}${d.priorSqft != null ? ` · Prior year: ${fmtSqft(d.priorSqft)}` : ""}`
  ];
  if (d.topAccounts?.length) lines.push(`Top accounts: ${d.topAccounts.slice(0, 5).map((a) => `${a.account} (${fmtSqft(a.sqft)})`).join(", ")}`);
  return lines.join("\n");
}

export function SalesDashboardProvider({
  token,
  tab,
  onTabChange,
  onLoadError,
  children
}: {
  token: string;
  tab: SalesDashboardTab;
  onTabChange?: (tab: SalesDashboardTab) => void;
  onLoadError: (msg: string) => void;
  children: React.ReactNode;
}) {
  const urlInitRef = useRef(false);
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    if (typeof window !== "undefined") {
      return parseFiltersFromSearchParams(window.location.search, tab);
    }
    return { ...DEFAULT_DASHBOARD_FILTERS, tab };
  });
  const dataRef = useRef<SalesDashboardResponse | null>(null);
  const [data, setData] = useState<SalesDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<DetailSelection>(null);
  const [copyMsg, setCopyMsg] = useState("");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [userSavedViews, setUserSavedViews] = useState<UserSavedView[]>(() => loadUserSavedViews());
  const [executiveSummaryOpen, setExecutiveSummaryOpen] = useState(true);

  useEffect(() => {
    setFilters((f) => ({ ...f, tab }));
  }, [tab]);

  useEffect(() => {
    if (urlInitRef.current) return;
    urlInitRef.current = true;
    const fromUrl = parseFiltersFromSearchParams(window.location.search, tab);
    if (fromUrl.tab !== tab) onTabChange?.(fromUrl.tab);
    for (const view of ALL_BUILTIN_VIEWS) {
      if (filtersMatchView(fromUrl, view.filters)) {
        setActiveViewId(view.id);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncFiltersToBrowserUrl(filters);
    if (filters.tab !== tab) onTabChange?.(filters.tab);
  }, [filters, tab, onTabChange]);

  const queryString = useMemo(() => filtersToQueryString(filters), [filters]);

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    if (!dataRef.current) setLoading(true);
    try {
      const json = (await apiFetch(`/api/sales/dashboard?${queryString}`, { token })) as SalesDashboardResponse;
      if (!json.ok) throw new Error("Dashboard request failed");
      setData(json);
      dataRef.current = json;
      onLoadError("");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String((e as Error)?.message ?? e);
      onLoadError(msg);
      setData(null);
      dataRef.current = null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, queryString, onLoadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchFilters = useCallback((patch: Partial<DashboardFilters>) => {
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
    setActiveViewId(null);
  }, []);

  const clearFilter = useCallback((param: string) => {
    setFilters((f) => clearFilterParam(f, param));
    setActiveViewId(null);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_DASHBOARD_FILTERS, tab: filters.tab });
    setActiveViewId(null);
  }, [filters.tab]);

  const resetToDefaultView = useCallback(() => {
    setFilters({ ...DEFAULT_DASHBOARD_FILTERS, tab: "command_center" });
    setActiveViewId("preset_today_command");
    onTabChange?.("command_center");
  }, [onTabChange]);

  const setTab = useCallback(
    (t: SalesDashboardTab) => {
      setFilters((f) => ({ ...f, tab: t }));
      onTabChange?.(t);
    },
    [onTabChange]
  );

  const applyView = useCallback(
    (view: DashboardViewDefinition) => {
      const merged = { ...DEFAULT_DASHBOARD_FILTERS, ...view.filters, page: 1 };
      setFilters(merged);
      setActiveViewId(view.id);
      if (merged.tab) onTabChange?.(merged.tab);
    },
    [onTabChange]
  );

  const saveCurrentView = useCallback(
    (label: string) => {
      const saved = saveUserView(label, snapshotFiltersForView(filters));
      setUserSavedViews(loadUserSavedViews());
      setActiveViewId(saved.id);
      return saved;
    },
    [filters]
  );

  const renameSavedViewFn = useCallback((id: string, label: string) => {
    renameUserView(id, label);
    setUserSavedViews(loadUserSavedViews());
  }, []);

  const deleteSavedViewFn = useCallback((id: string) => {
    deleteUserView(id);
    setUserSavedViews(loadUserSavedViews());
    if (activeViewId === id) setActiveViewId(null);
  }, [activeViewId]);

  const activeView = useMemo(() => {
    if (!activeViewId) return null;
    const user = userSavedViews.find((v) => v.id === activeViewId);
    if (user) return viewDefinitionFromUser(user);
    return ALL_BUILTIN_VIEWS.find((v) => v.id === activeViewId) ?? null;
  }, [activeViewId, userSavedViews]);

  const activeViewDirty = useMemo(() => {
    if (!activeView) return false;
    return !filtersMatchView(filters, activeView.filters);
  }, [activeView, filters]);

  const copyText = useCallback(async (text: string, okMsg = "Copied") => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg(okMsg);
      setTimeout(() => setCopyMsg(""), 2000);
    } catch {
      setCopyMsg("Copy failed");
    }
  }, []);

  const copyInsights = useCallback(async () => {
    const text = data?.insightSummaryText || data?.commandCenter?.insights?.map((i) => i.text).join("\n") || "";
    await copyText(text);
  }, [data, copyText]);

  const copyExecutiveSummary = useCallback(async () => {
    const text = data?.executiveSummary?.copyText || data?.insightSummaryText || "";
    await copyText(text, "Executive summary copied");
  }, [data, copyText]);

  const copyAccountSummary = useCallback(
    (d: AccountDetail) => void copyText(buildAccountSummaryText(d), "Account summary copied"),
    [copyText]
  );

  const copyColorSummary = useCallback(
    (d: ColorDetail) => void copyText(buildColorSummaryText(d), "Color summary copied"),
    [copyText]
  );

  const exportDashboardCsv = useCallback(
    (kind: ExportKind, filenameOverride?: string): boolean => {
      if (!data) return false;
      const rows = collectExportRows(data, filters.tab, kind);
      const name = filenameOverride ?? exportFilename(filters.tab, kind);
      return downloadCsv(name, rows);
    },
    [data, filters.tab]
  );

  const exportCsv = useCallback(
    (filename?: string) => {
      const override = filename ? (filename.endsWith(".csv") ? filename : `${filename}.csv`) : undefined;
      return exportDashboardCsv("visible_table", override);
    },
    [exportDashboardCsv]
  );

  const navigateDataQualityIssue = useCallback(
    (issue: DataQualityIssue) => {
      const patch = { ...issue.filterPatch, page: 1 } as Partial<DashboardFilters>;
      if (issue.navigateTab) patch.tab = issue.navigateTab;
      setFilters((f) => ({ ...f, ...patch, tab: patch.tab ?? f.tab }));
      setActiveViewId(null);
      if (patch.tab) onTabChange?.(patch.tab);
      const sampleAccount = issue.samples?.find((s) => s && typeof s === "object" && "account" in s) as
        | { account?: string }
        | undefined;
      if (sampleAccount?.account && issue.navigateTab === "accounts") {
        setDetail({ type: "account", key: sampleAccount.account.trim().toLowerCase(), label: sampleAccount.account });
      }
    },
    [onTabChange]
  );

  const copyIssueSamples = useCallback(
    async (issue: DataQualityIssue) => {
      const lines = (issue.samples ?? []).slice(0, 10).map((s) => {
        if (typeof s === "string") return s;
        return JSON.stringify(s);
      });
      await copyText([issue.title, ...lines].join("\n"), "Samples copied");
    },
    [copyText]
  );

  const openAccountDetail = useCallback((account: string) => {
    setDetail({ type: "account", key: account.trim().toLowerCase(), label: account });
  }, []);

  const openColorDetail = useCallback((key: string, label: string) => {
    setDetail({ type: "color", key, label });
  }, []);

  const closeDetail = useCallback(() => setDetail(null), []);

  const value: Ctx = {
    filters,
    setFilters,
    patchFilters,
    clearFilter,
    resetFilters,
    setTab,
    data,
    loading,
    refreshing,
    reload: load,
    detail,
    openAccountDetail,
    openColorDetail,
    closeDetail,
    copyMsg,
    copyInsights,
    copyExecutiveSummary,
    copyAccountSummary,
    copyColorSummary,
    exportCsv,
    exportDashboardCsv,
    activeViewId,
    activeViewDirty,
    builtinViews: ALL_BUILTIN_VIEWS,
    userSavedViews,
    applyView,
    saveCurrentView,
    renameSavedView: renameSavedViewFn,
    deleteSavedView: deleteSavedViewFn,
    resetToDefaultView,
    navigateDataQualityIssue,
    copyIssueSamples,
    executiveSummaryOpen,
    setExecutiveSummaryOpen
  };

  return <SalesDashboardContext.Provider value={value}>{children}</SalesDashboardContext.Provider>;
}

export function useSalesDashboard(): Ctx {
  const ctx = useContext(SalesDashboardContext);
  if (!ctx) throw new Error("useSalesDashboard must be used within SalesDashboardProvider");
  return ctx;
}
