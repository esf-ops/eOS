/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { ApiError, apiFetch } from "../lib/api";
import { config } from "../lib/config";
import {
  displayAccountName,
  displaySalesperson,
  fmtDate,
  fmtYmd,
  isUnassignedSalesperson,
  nf
} from "./exec/execFormat";
import type {
  AccountRow,
  ExecutiveSummary,
  FieldTrends,
  MeResponse,
  MonthlyTrendResponse,
  ProductionFlow,
  SalespersonRow,
  SyncHealth,
  TitanSignals
} from "../lib/types";
import MonthlyTrendPanel from "./MonthlyTrendPanel";

const LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

type FlowKey =
  | "template"
  | "order_stone"
  | "saw_program"
  | "titan_program"
  | "saw"
  | "fabrication"
  | "polish"
  | "install"
  | "customer_service"
  | "waterfalls"
  | "full_height_backsplash";

const FLOW_ORDER: FlowKey[] = [
  "template",
  "order_stone",
  "saw_program",
  "titan_program",
  "saw",
  "fabrication",
  "polish",
  "install",
  "customer_service",
  "waterfalls",
  "full_height_backsplash"
];

const FLOW_LABELS: Record<FlowKey, string> = {
  template: "Template",
  order_stone: "Order Stone",
  saw_program: "Saw Program",
  titan_program: "Titan Program",
  saw: "Saw",
  fabrication: "Fabrication",
  polish: "Polish",
  install: "Install",
  customer_service: "Customer Service",
  waterfalls: "Waterfalls",
  full_height_backsplash: "Full Height / Backsplash"
};

const TAB = {
  overview: "overview",
  sales: "sales",
  production: "production",
  exceptions: "exceptions",
  fields: "fields",
  brain: "brain"
} as const;
type TabId = (typeof TAB)[keyof typeof TAB];

const PRODUCTION_PHASES: Array<{
  title: string;
  keys: FlowKey[];
  note: string;
}> = [
  {
    title: "Feed",
    keys: ["template", "order_stone"],
    note: "Moraware operational activity labels in Brain — indicative of upstream work, not cash or inventory receipts."
  },
  {
    title: "Prepare",
    keys: ["saw_program", "titan_program"],
    note: "Programming and planning signals from synced activities — not direct machine PLC telemetry yet."
  },
  {
    title: "Run",
    keys: ["saw", "fabrication", "polish"],
    note: "Shop-floor activity footprints as represented in Brain activity rows."
  },
  {
    title: "Finish",
    keys: ["install"],
    note: "Field completion-oriented activities from Moraware."
  }
];

const OTHER_FLOW_KEYS: FlowKey[] = ["customer_service", "waterfalls", "full_height_backsplash"];

type SortDir = "asc" | "desc";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function execHealthVisual(h: SyncHealth | null): { label: string; color: string; caption: string } {
  if (!h || h.ok === false) {
    return { label: "unknown", color: "#dc2626", caption: "Unable to load sync status" };
  }
  const run = h.latestSyncRun as { status?: string; finished_at?: string } | undefined;
  const status = String(h.latestSyncStatus ?? run?.status ?? "").toLowerCase();
  const unresolved = Number(h.unresolvedFailedJobCount ?? 0) || 0;
  const lock = h.currentLock;
  const lockExpired = h.lockExpired === true;
  const hasActiveLock = Boolean(lock) && !lockExpired;

  if (status === "failed") return { label: "red", color: "#dc2626", caption: "Latest sync failed" };
  if (!status) return { label: "red", color: "#dc2626", caption: "Stale or unknown sync status" };
  if (status === "success" && unresolved === 0 && !hasActiveLock) {
    return { label: "green", color: "#059669", caption: "Healthy · sync succeeded" };
  }
  if (status === "partial_error" || unresolved > 0 || hasActiveLock) {
    return { label: "yellow", color: "#ca8a04", caption: "Watch · partial sync or open issues" };
  }
  return { label: "red", color: "#dc2626", caption: "Sync status unclear" };
}

async function fetchRequiredExecutive(
  path: string,
  token: string,
  record: (p: string, patch: Record<string, unknown>) => void
): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  record(path, { status: "starting" });
  try {
    const data = await apiFetch(path, { token });
    record(path, { status: 200, ok: true });
    return { ok: true, status: 200, data };
  } catch (e: unknown) {
    if (e instanceof ApiError) {
      record(path, { status: e.status, ok: false, message: e.message });
      return { ok: false, status: e.status, error: e.message };
    }
    const msg = String((e as Error)?.message ?? e);
    record(path, { status: 0, ok: false, message: msg });
    return { ok: false, status: 0, error: msg };
  }
}

function toggleSort<T extends string>(
  prev: { key: T; dir: SortDir },
  key: T
): { key: T; dir: SortDir } {
  if (prev.key !== key) return { key, dir: "desc" };
  return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
}

type AccountSortKey = keyof AccountRow | "salespeople";

function cmp(a: unknown, b: unknown, dir: SortDir): number {
  const mul = dir === "asc" ? 1 : -1;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb ? 0 : na < nb ? -mul : mul;
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { sensitivity: "base" }) * mul;
}

type Pill = "strong" | "watch" | "attention";

function tierPillClass(p: Pill) {
  return p === "strong" ? "strong" : p === "watch" ? "watch" : "attention";
}

export default function App() {
  const [sessionToken, setSessionToken] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [year, setYear] = useState(2026);
  /** Committed API limit — updated on blur/commit to avoid reload on every keystroke. */
  const [accountLimitCommitted, setAccountLimitCommitted] = useState(50);
  const [accountLimitInput, setAccountLimitInput] = useState("50");
  const [accountQuery, setAccountQuery] = useState("");
  const [minSqft, setMinSqft] = useState("");
  const [selectedSalespeople, setSelectedSalespeople] = useState<string[]>([]);
  const [globalSearchRaw, setGlobalSearchRaw] = useState("");
  const globalSearch = useDebounced(globalSearchRaw.trim(), 250);
  const [viewTab, setViewTab] = useState<TabId>(TAB.overview);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [spPopoverOpen, setSpPopoverOpen] = useState(false);
  const spPopoverRef = useRef<HTMLDivElement>(null);

  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [syncHealth, setSyncHealth] = useState<SyncHealth | null>(null);
  const [salespeople, setSalespeople] = useState<SalespersonRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [production, setProduction] = useState<ProductionFlow | null>(null);
  const [signals, setSignals] = useState<TitanSignals | null>(null);
  const [trends, setTrends] = useState<FieldTrends | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrendResponse | null>(null);
  const [syncRuns, setSyncRuns] = useState<any[]>([]);
  const [failedJobs, setFailedJobs] = useState<any[]>([]);

  const [spSort, setSpSort] = useState<{ key: keyof SalespersonRow; dir: SortDir }>({
    key: "worksheet_sqft",
    dir: "desc"
  });
  const [acSort, setAcSort] = useState<{ key: AccountSortKey; dir: SortDir }>({
    key: "worksheet_sqft",
    dir: "desc"
  });

  const [dataError, setDataError] = useState("");
  const [apiDebug, setApiDebug] = useState<Record<string, unknown>>({});
  const [showDebug, setShowDebug] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState("");
  const [toastMsg, setToastMsg] = useState<string>("");
  const [exceptionSignalPick, setExceptionSignalPick] = useState<Set<string>>(new Set());
  const [jobDetail, setJobDetail] = useState<any>(null);
  const [syncRunsLoadError, setSyncRunsLoadError] = useState("");
  const [failedJobsLoadError, setFailedJobsLoadError] = useState("");
  const [devExecTrace, setDevExecTrace] = useState<{ n: number; reason: string }>({ n: 0, reason: "—" });

  const tokenRef = useRef("");
  const allowedRef = useRef(false);
  const lastFetchedYearLimitRef = useRef<string>("");
  const loadAllCountRef = useRef(0);
  const lastLoadReasonRef = useRef<string>("—");
  const authInitialHandledRef = useRef(false);

  const role = me?.user?.role || "";
  const allowed = role === "admin" || role === "executive";

  const recordApi = useCallback((path: string, patch: Record<string, unknown>) => {
    setApiDebug((d) => ({
      ...d,
      [path]: {
        ...(d[path] && typeof d[path] === "object" ? (d[path] as Record<string, unknown>) : {}),
        ...patch
      }
    }));
  }, []);

  function clearExecutiveData() {
    setSummary(null);
    setSyncHealth(null);
    setSalespeople([]);
    setAccounts([]);
    setProduction(null);
    setSignals(null);
    setTrends(null);
    setMonthlyTrend(null);
    setSyncRuns([]);
    setFailedJobs([]);
    setDataError("");
    setApiDebug({});
    setSyncRunsLoadError("");
    setFailedJobsLoadError("");
    lastFetchedYearLimitRef.current = "";
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(""), 3400);
  }

  useEffect(() => {
    if (!spPopoverOpen) return;
    function onDoc(e: MouseEvent) {
      if (spPopoverRef.current && !spPopoverRef.current.contains(e.target as Node)) setSpPopoverOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [spPopoverOpen]);

  const loadAll = useCallback(
    async (token: string, opts?: { reason?: string; manual?: boolean }) => {
      setLoadingUser(true);
      setDataError("");
      loadAllCountRef.current += 1;
      const reason = opts?.reason ?? "load";
      if (import.meta.env.DEV) {
        lastLoadReasonRef.current = reason;
        setDevExecTrace({ n: loadAllCountRef.current, reason });
      }

      recordApi("/api/me", { status: "starting" });

      try {
        const m = (await apiFetch("/api/me", { token })) as MeResponse;
        setMe(m);
        recordApi("/api/me", { status: 200, ok: true });

        if (!(m.user.role === "admin" || m.user.role === "executive")) {
          [
            "/api/executive/summary",
            `/api/brain/sync-runs?limit=15`,
            `/api/brain/failed-jobs?limit=40`
          ].forEach((p) => recordApi(p, { status: "skipped", reason: "role_not_allowed" }));
          return;
        }

        const y = year;
        const lim = accountLimitCommitted;
        const paths = {
          summary: `/api/executive/summary?year=${y}`,
          sp: `/api/executive/salesperson-performance?year=${y}`,
          ac: `/api/executive/account-performance?year=${y}&limit=${lim}`,
          prod: `/api/executive/production-flow?year=${y}`,
          sig: `/api/executive/titan-signals?year=${y}`,
          trends: `/api/executive/field-trends?year=${y}`,
          health: "/api/brain/sync-health",
          moon: `/api/executive/monthly-trend?year=${y}`,
          runs: "/api/brain/sync-runs?limit=15",
          fj: "/api/brain/failed-jobs?limit=40"
        } as const;

        const [
          summR,
          sprR,
          acrR,
          proR,
          sigR,
          treR,
          healR,
          moonR,
          syncRunsR,
          fjR
        ] = await Promise.all([
          fetchRequiredExecutive(paths.summary, token, recordApi),
          fetchRequiredExecutive(paths.sp, token, recordApi),
          fetchRequiredExecutive(paths.ac, token, recordApi),
          fetchRequiredExecutive(paths.prod, token, recordApi),
          fetchRequiredExecutive(paths.sig, token, recordApi),
          fetchRequiredExecutive(paths.trends, token, recordApi),
          fetchRequiredExecutive(paths.health, token, recordApi),
          fetchRequiredExecutive(paths.moon, token, recordApi),
          fetchRequiredExecutive(paths.runs, token, recordApi),
          fetchRequiredExecutive(paths.fj, token, recordApi)
        ]);

        const criticalPairs: [string, (typeof summR)][] = [
          [paths.summary, summR],
          [paths.sp, sprR],
          [paths.ac, acrR],
          [paths.prod, proR],
          [paths.sig, sigR],
          [paths.trends, treR],
          [paths.health, healR],
          [paths.moon, moonR]
        ];

        if (criticalPairs.some(([, r]) => r.status === 401)) {
          setDataError("Session expired. Please sign in again.");
          try {
            await supabase.auth.signOut();
          } catch {
            /* ignore */
          }
          setLastRefreshedAt(new Date().toISOString());
          return;
        }

        setSummary(summR.ok ? (summR.data as ExecutiveSummary) : null);
        const sprPayload = sprR.ok ? (sprR.data as { rows?: SalespersonRow[] }) : null;
        setSalespeople(Array.isArray(sprPayload?.rows) ? sprPayload.rows : []);
        const acrPayload = acrR.ok ? (acrR.data as { rows?: AccountRow[] }) : null;
        setAccounts(Array.isArray(acrPayload?.rows) ? acrPayload.rows : []);
        setProduction(proR.ok ? (proR.data as ProductionFlow) : null);
        setSignals(sigR.ok ? (sigR.data as TitanSignals) : null);
        setTrends(treR.ok ? (treR.data as FieldTrends) : null);
        setSyncHealth(healR.ok ? (healR.data as SyncHealth) : null);
        const moonPayload = moonR.ok ? (moonR.data as MonthlyTrendResponse) : null;
        setMonthlyTrend(
          moonPayload && Array.isArray(moonPayload.months) && moonPayload.months.length ? moonPayload : null
        );

        const runsPayload = syncRunsR.ok ? (syncRunsR.data as { syncRuns?: any[] }) : null;
        setSyncRuns(Array.isArray(runsPayload?.syncRuns) ? runsPayload.syncRuns : []);
        const fjPayload = fjR.ok ? (fjR.data as { failedJobs?: any[] }) : null;
        setFailedJobs(Array.isArray(fjPayload?.failedJobs) ? fjPayload.failedJobs : []);
        setSyncRunsLoadError(
          syncRunsR.ok
            ? ""
            : `Could not load latest sync runs (HTTP ${syncRunsR.status}${syncRunsR.error ? `: ${syncRunsR.error}` : ""}).`
        );
        setFailedJobsLoadError(
          fjR.ok
            ? ""
            : `Could not load sampled failed jobs (HTTP ${fjR.status}${fjR.error ? `: ${fjR.error}` : ""}).`
        );

        const failedCritical = criticalPairs.filter(([, r]) => !r.ok);
        if (failedCritical.length) {
          const msg = failedCritical
            .map(([p, r]) => `${p} → HTTP ${r.status}${r.error ? ` (${r.error})` : ""}`)
            .join("\n");
          setDataError(
            failedCritical.every(([, x]) => x.status === 404)
              ? `Executive endpoints returned 404. Restart backend and confirm startup lists executive routes:\n${msg}`
              : `One or more required endpoints failed:\n${msg}`
          );
        }

        const refreshed = new Date().toISOString();
        setLastRefreshedAt(refreshed);
        if (!failedCritical.length) {
          lastFetchedYearLimitRef.current = `${y}|${lim}`;
          if (opts?.manual) showToast(`Refreshed · ${fmtDate(refreshed)}`);
        }
      } catch (e: unknown) {
        if (e instanceof ApiError) {
          setDataError(e.message);
          recordApi("error", { status: e.status, message: e.message });
          if (e.status === 401) {
            try {
              await supabase.auth.signOut();
            } catch {
              /* ignore */
            }
          }
          return;
        }
        const msg = String((e as Error)?.message || e);
        setDataError(
          `Unexpected error loading executive data (${config.backendBaseUrl}). Check CORS and that the Brain API is running.\n\n${msg}`
        );
        recordApi("error", { message: msg });
      } finally {
        setLoadingUser(false);
      }
    },
    [year, accountLimitCommitted, recordApi]
  );

  tokenRef.current = session?.access_token || sessionToken;
  allowedRef.current = role === "admin" || role === "executive";

  const loadAllRef = useRef(loadAll);
  loadAllRef.current = loadAll;

  /** Keep account-limit text field aligned when filters reset programmatically. */
  useEffect(() => {
    setAccountLimitInput(String(accountLimitCommitted));
  }, [accountLimitCommitted]);

  useEffect(() => {
    let alive = true;

    const bootstrapLoad = async (sess: Session | null, authReason: string) => {
      if (!alive) return;
      setSession(sess);
      const t = sess?.access_token || "";
      setSessionToken(t);
      clearExecutiveData();
      lastFetchedYearLimitRef.current = "";
      if (!t) {
        setLoadingUser(false);
        return;
      }
      await loadAllRef.current(t, { reason: authReason }).catch(() => {});
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        if (authInitialHandledRef.current) return;
        authInitialHandledRef.current = true;
        void bootstrapLoad(data.session ?? null, "bootstrap_getSession");
      })
      .catch(() => {
        if (!alive) return;
        setLoadingUser(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      if (!alive) return;

      if (evt === "INITIAL_SESSION") {
        const t = s?.access_token || "";
        setSession(s);
        setSessionToken(t);
        if (!t) {
          clearExecutiveData();
          lastFetchedYearLimitRef.current = "";
          setLoadingUser(false);
          return;
        }
        if (!authInitialHandledRef.current) {
          authInitialHandledRef.current = true;
          clearExecutiveData();
          lastFetchedYearLimitRef.current = "";
          loadAllRef.current(t, { reason: "bootstrap_INITIAL_SESSION" }).catch(() => {});
        }
        return;
      }

      if (evt === "SIGNED_OUT") {
        clearExecutiveData();
        setSession(null);
        setSessionToken("");
        setMe(null);
        setLoadingUser(false);
        authInitialHandledRef.current = false;
        lastFetchedYearLimitRef.current = "";
        return;
      }

      /** Keep token in sync — do not refetch the dashboard on every refresh token rotation (avoids churn / chart flashes). */
      if (evt === "TOKEN_REFRESHED" && s?.access_token) {
        setSession(s);
        setSessionToken(s.access_token);
        return;
      }

      if (evt === "SIGNED_IN" || evt === "USER_UPDATED") {
        authInitialHandledRef.current = true;
        void bootstrapLoad(s, `auth_${evt}`);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /** Reload when year or committed account limit changes — never tied to `me` / chart re-renders. */
  useEffect(() => {
    const token = tokenRef.current;
    if (!token || !allowedRef.current) return;
    if (lastFetchedYearLimitRef.current === "") return;
    const key = `${year}|${accountLimitCommitted}`;
    if (key === lastFetchedYearLimitRef.current) return;
    loadAllRef.current(token, { reason: `year_or_account_limit:${key}` }).catch(() => {});
  }, [year, accountLimitCommitted]);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: unknown) {
      setAuthError(String((err as Error)?.message || err));
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  function commitAccountLimitFromInput() {
    const parsed = Number.parseInt(accountLimitInput.trim(), 10);
    const clamped = Number.isFinite(parsed) ? Math.min(200, Math.max(1, parsed)) : 50;
    setAccountLimitCommitted(clamped);
    setAccountLimitInput(String(clamped));
  }

  function resetFilters() {
    setYear(2026);
    setAccountLimitCommitted(50);
    setAccountLimitInput("50");
    setAccountQuery("");
    setMinSqft("");
    setSelectedSalespeople([]);
    setGlobalSearchRaw("");
    setViewTab(TAB.overview);
    setExceptionSignalPick(new Set());
  }

  const healthUi = execHealthVisual(syncHealth);
  const salespersonNames = useMemo(
    () => [...new Set(salespeople.map((r) => r.salesperson_name))].sort(),
    [salespeople]
  );
  const minSqftN = Number(minSqft) || 0;

  const passesGlobal = useCallback(
    (haystackParts: Array<string | number | undefined | null>) => {
      if (!globalSearch) return true;
      const q = globalSearch.toLowerCase();
      const blob = haystackParts.map((x) => String(x ?? "").toLowerCase()).join(" | ");
      return blob.includes(q);
    },
    [globalSearch]
  );

  const filteredSalespeople = useMemo(() => {
    let rows = [...salespeople];
    if (selectedSalespeople.length) {
      const set = new Set(selectedSalespeople);
      rows = rows.filter((r) => set.has(r.salesperson_name));
    }
    if (minSqftN > 0) rows = rows.filter((r) => r.worksheet_sqft >= minSqftN);
    if (accountQuery.trim()) {
      const aq = accountQuery.trim().toLowerCase();
      rows = rows.filter((r) => {
        const acctsForSp = accounts
          .filter((a) => a.salesperson_names.includes(r.salesperson_name))
          .map((a) => `${a.account_name} ${a.account_id}`)
          .join(" ");
        return acctsForSp.toLowerCase().includes(aq);
      });
    }
    rows = rows.filter((r) =>
      passesGlobal([r.salesperson_name, r.jobs, r.worksheet_sqft, fmtYmd(r.first_job_date)])
    );
    rows.sort((a, b) => cmp(a[spSort.key], b[spSort.key], spSort.dir));
    return rows;
  }, [salespeople, accounts, selectedSalespeople, minSqftN, accountQuery, passesGlobal, spSort]);

  const filteredAccounts = useMemo(() => {
    let rows = [...accounts];
    if (accountQuery.trim()) {
      const aq = accountQuery.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.account_name.toLowerCase().includes(aq) || String(r.account_id).toLowerCase().includes(aq)
      );
    }
    if (selectedSalespeople.length) {
      const set = new Set(selectedSalespeople);
      rows = rows.filter((r) => r.salesperson_names.some((s) => set.has(s)));
    }
    if (minSqftN > 0) rows = rows.filter((r) => r.worksheet_sqft >= minSqftN);
    rows = rows.filter((r) =>
      passesGlobal([r.account_name, r.account_id, r.jobs, r.worksheet_sqft, r.salesperson_names.join(", ")])
    );
    rows.sort((a, b) => {
      if (acSort.key === "salespeople") {
        return cmp(a.salesperson_names.join(", "), b.salesperson_names.join(","), acSort.dir);
      }
      return cmp(a[acSort.key as keyof AccountRow], b[acSort.key as keyof AccountRow], acSort.dir);
    });
    return rows;
  }, [accounts, accountQuery, selectedSalespeople, minSqftN, passesGlobal, acSort]);

  const maxSpSqft = useMemo(
    () => filteredSalespeople.reduce((m, r) => Math.max(m, r.worksheet_sqft), 0) || 1,
    [filteredSalespeople]
  );

  const orderedFlow = useMemo(() => {
    const cats = production?.categories ?? [];
    const map = new Map(cats.map((c) => [c.category, c.count]));
    return FLOW_ORDER.map((key) => ({ key, label: FLOW_LABELS[key], count: map.get(key) ?? 0 }));
  }, [production]);

  const flowMap = useMemo(() => new Map(orderedFlow.map((x) => [x.key, x.count])), [orderedFlow]);

  const FLOW_EXEC_KEYS: FlowKey[] = ["template", "order_stone", "titan_program", "saw", "fabrication", "install"];

  const topRiskFiltered = useMemo(() => {
    let rows = signals?.topRiskJobs ?? [];
    const pick = exceptionSignalPick;
    const onlyRepair = pick.has("repair") && [...pick].length === 1;
    if (onlyRepair) return [];

    if (pick.size > 0) {
      rows = rows.filter((r) => {
        let ok = false;
        if (pick.has("slab") && r.has_slab_signal) ok = true;
        if (pick.has("change") && r.has_change_signal) ok = true;
        if (pick.has("remake") && r.has_remake_signal) ok = true;
        if (pick.has("cust") && r.has_customer_service_signal) ok = true;
        return ok;
      });
    }

    return rows.filter((r) =>
      passesGlobal([
        r.job_id,
        r.job_name,
        r.account_name,
        r.salesperson_name,
        r.worksheet_sqft,
        r.has_slab_signal ? "slab" : "",
        r.has_change_signal ? "change" : "",
        r.has_remake_signal ? "remake" : "",
        r.has_customer_service_signal ? "customer service" : ""
      ])
    );
  }, [signals, passesGlobal, exceptionSignalPick]);

  const unresolved = Number(syncHealth?.unresolvedFailedJobCount ?? 0) || 0;
  const operationalRows = production?.activityRowCount ?? 0;
  const hasOps = !(production?.message?.trim()) && operationalRows > 0;

  const feedTier: Pill = useMemo(() => {
    if (!summary) return "watch";
    const missPct = summary.totalJobs ? (summary.jobsMissingSqft / summary.totalJobs) * 100 : 0;
    if (healthUi.label === "red" || unresolved > 0) return "attention";
    if (healthUi.label === "yellow" || missPct > 4 || summary.jobsMissingSqft >= 75) return "watch";
    return "strong";
  }, [summary, healthUi.label, unresolved]);

  const flowTier: Pill = useMemo(() => {
    if (!summary || !production) return "watch";
    if (!hasOps && (summary.totalJobs ?? 0) > 0) return "watch";
    if (production.message?.trim()) return "attention";
    return "strong";
  }, [summary, production, hasOps]);

  const protectTier: Pill = useMemo(() => {
    if (!summary || !signals) return "watch";
    const c = signals.counts || {};
    const watchSignals =
      (c.jobs_with_change_signal ?? 0) +
      (c.jobs_with_remake_signal ?? 0) +
      (c.jobs_with_customer_service_signal ?? 0);
    if (unresolved > 0 || healthUi.label === "red") return "attention";
    if (summary.jobsMissingSqft > 0 || watchSignals > 100) return "watch";
    return "strong";
  }, [summary, signals, unresolved, healthUi.label]);

  const trustTier: Pill = useMemo(() => {
    if (healthUi.label === "red") return "attention";
    if (healthUi.label === "yellow" || unresolved > 0) return "watch";
    return healthUi.label === "green" ? "strong" : "watch";
  }, [healthUi.label, unresolved]);

  const topSp = salespeople[0];
  const topAc = accounts[0];

  const concentration = useMemo(() => {
    const totalSq = salespeople.reduce((s, r) => s + r.worksheet_sqft, 0) || 1;
    const top3 = salespeople.slice(0, 3).reduce((s, r) => s + r.worksheet_sqft, 0);
    return { totalSq, top3pct: (100 * top3) / totalSq };
  }, [salespeople]);

  const counts = signals?.counts ?? {};
  const nChange = counts.jobs_with_change_signal ?? 0;
  const nRemake = counts.jobs_with_remake_signal ?? 0;
  const nCust = counts.jobs_with_customer_service_signal ?? 0;
  const nSlab = counts.jobs_with_slab_signal ?? 0;
  const nRepair = counts.jobs_with_repair_signal ?? 0;

  const executiveInsights = useMemo(() => {
    const lines: string[] = [];
    if (topSp?.salesperson_name) {
      lines.push(
        `${displaySalesperson(topSp.salesperson_name)} leads ${year} worksheet volume at ${nf(topSp.worksheet_sqft, { maximumFractionDigits: 0 })} Sq.Ft.`
      );
    }
    if (topAc && displayAccountName(topAc.account_name) !== "Unknown account") {
      lines.push(
        `${displayAccountName(topAc.account_name)} is the top account in this cohort by worksheet Sq.Ft. (${nf(topAc.worksheet_sqft, { maximumFractionDigits: 0 })}).`
      );
    }
    if (summary && summary.jobsMissingSqft > 0) {
      lines.push(`${nf(summary.jobsMissingSqft)} jobs are missing worksheet Sq.Ft. and should be reviewed.`);
    }
    const st = syncHealth?.latestSyncStatus;
    if (st === "success" && unresolved === 0)
      lines.push(`The latest Brain sync succeeded with ${nf(unresolved)} unresolved failed jobs in queue.`);
    else if (st) lines.push(`Latest Brain sync shows "${String(st)}" with ${nf(unresolved)} unresolved failed jobs.`);

    if (signals?.message?.trim()) {
      lines.push("Operational summaries are sparse — rerun operational sync when you want watch-signal fidelity.");
    }
    if (summary && lines.length < 4) {
      lines.push(`${nf(summary.totalSqft, { maximumFractionDigits: 0 })} Sq.Ft. on ${nf(summary.totalJobs)} jobs synced for Brain view year ${year}.`);
    }
    return lines.slice(0, 5);
  }, [topSp, topAc, summary, signals, year, syncHealth, unresolved]);

  const latestSyncDt =
    syncHealth?.latestSyncRun != null
      ? (syncHealth.latestSyncRun as { finished_at?: string }).finished_at ?? null
      : null;

  const vis = (t: TabId) => viewTab === t;

  const FIELD_TREND_ORDER: Array<{ key: string; title: string }> = [
    { key: "color", title: "Color" },
    { key: "edge", title: "Edge" },
    { key: "thickness", title: "Thickness" },
    { key: "sink_type", title: "Sink type" },
    { key: "faucet", title: "Faucet" },
    { key: "backsplash_full_height", title: "Backsplash / full height" }
  ];

  const trendsAllEmpty = useMemo(() => {
    const buckets = trends?.trends ?? {};
    if (!Object.keys(buckets).length) return true;
    return Object.values(buckets).every((arr) => !Array.isArray(arr) || arr.length === 0);
  }, [trends]);

  function toggleSig(k: string) {
    setExceptionSignalPick((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  function refreshNow() {
    const t = session?.access_token || sessionToken;
    if (t) loadAllRef.current(t, { manual: true, reason: "manual_refresh" }).catch(() => {});
  }

  if (!sessionToken && !loadingUser) {
    return (
      <div className="login-shell">
        <div className="login-panel">
          <img src={LOGO_URL} alt="Elite Stone Fabrication" style={{ height: 44, marginBottom: 14 }} />
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Executive Head
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 16 }}>
            Sign in with your eOS credentials.
          </p>
          {authError ? <div className="banner-alert">{authError}</div> : null}
          <form onSubmit={doLogin} style={{ display: "grid", gap: 10 }}>
            <div>
              <label className="field-label">Email</label>
              <input className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Password</label>
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-accent" disabled={!email || !password}>
              Sign in
            </button>
          </form>
          <p style={{ marginTop: 18, fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            Moraware records the work. eOS explains the work. The heads move the work.
          </p>
        </div>
      </div>
    );
  }

  if (me && !allowed) {
    return (
      <div className="shell">
        <div className="card-surface blocked-panel-text">
          <img src={LOGO_URL} alt="Elite Stone Fabrication" style={{ height: 48, marginBottom: 12 }} />
          <h2 className="section-title">Restricted</h2>
          <p>You do not have access to this head.</p>
          <p style={{ fontSize: "0.875rem" }}>
            Signed in as <strong>{me.user.email}</strong> ({me.user.role})
          </p>
          <button type="button" className="btn btn-accent" style={{ marginTop: 20 }} onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  function renderOperatingSummarySkeleton() {
    return (
      <div className="operating-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="op-card">
            <div className="skeleton-block" style={{ height: 20, width: "45%", marginBottom: 12 }} />
            <div className="skeleton-block" style={{ height: 36, width: "70%", marginBottom: 16 }} />
            <div className="skeleton-block" style={{ height: 14, width: "100%" }} />
          </div>
        ))}
      </div>
    );
  }

  function opCard(kind: Pill) {
    return <span className={`pill-tier ${tierPillClass(kind)}`}>{kind}</span>;
  }

  function operatingSummaryCards() {
    if (loadingUser && !summary) return renderOperatingSummarySkeleton();
    const feedInterpret = summary
      ? healthUi.label === "red"
        ? "Workload is moving, but Brain health warrants immediate attention alongside worksheet hygiene."
        : summary.jobsMissingSqft >= 75
          ? "Worksheet completeness is thinning — verify templates before capacity decisions."
          : "Volume and load signals look aligned for executive steering this period."
      : "Executive summary loads after Brain data is available.";
    const flowInterpret = hasOps
      ? "Moraware-linked activity footprints show shop programs advancing through Titans."
      : "Operational ingestion is light — staged activities may not reflect full shop tempo yet.";
    const protectInterpret =
      unresolved > 0
        ? "Unresolved sync jobs elevate execution risk until the Brain queue clears."
        : nChange + nRemake + nCust > 80
          ? "Customer-change and CS signals are clustering — prioritize PM review queues."
          : "Watch-set looks contained relative to synced jobs.";
    const trustInterpret =
      healthUi.label === "green"
        ? "Confidence in synced Brain payloads is elevated for directional decisions."
        : "Treat downstream analytics as directional until sync health steadies.";

    return (
      <div className="operating-grid">
        <div className="op-card">
          <div className="op-card-head">
            <h3>Feed the Titans</h3>
            {opCard(feedTier)}
          </div>
          <div className="op-metric">{summary ? nf(summary.totalSqft, { maximumFractionDigits: 0 }) : "—"}</div>
          <div className="op-meta">Worksheet Sq.Ft. · {summary ? nf(summary.totalJobs) : "—"} jobs</div>
          <p className="field-micro" style={{ marginTop: 10, marginBottom: 0 }}>
            Worksheet Sq.Ft. comes from Moraware worksheet fields synced into the eOS Brain.
          </p>
          <dl className="mini-stat-grid" style={{ marginTop: 12 }}>
            <dt>Top salesperson</dt>
            <dd>{topSp ? displaySalesperson(topSp.salesperson_name) : "—"}</dd>
            <dt>Top account</dt>
            <dd className="cell-ellipsis" title={topAc ? displayAccountName(topAc.account_name) : undefined}>
              {topAc ? displayAccountName(topAc.account_name) : "—"}
            </dd>
          </dl>
          <p className="op-interpret">{feedInterpret}</p>
        </div>

        <div className="op-card">
          <div className="op-card-head">
            <h3>Flow Through the Titans</h3>
            {opCard(flowTier)}
          </div>
          {hasOps ? (
            <dl className="mini-stat-grid">
              {FLOW_EXEC_KEYS.map((k) => (
                <React.Fragment key={k}>
                  <dt>{FLOW_LABELS[k]}</dt>
                  <dd>{nf(flowMap.get(k) ?? 0)}</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            <div className="empty-state" style={{ marginTop: 8, padding: "1.25rem" }}>
              Run operational sync to strengthen Titans activity signals. Moraware activity rows are needed before this
              view reflects shop rhythm.
            </div>
          )}
          <p className="op-interpret">{flowInterpret}</p>
        </div>

        <div className="op-card">
          <div className="op-card-head">
            <h3>Protect the Titans</h3>
            {opCard(protectTier)}
          </div>
          <dl className="mini-stat-grid">
            <dt>Unresolved failed jobs</dt>
            <dd>{nf(unresolved)}</dd>
            <dt>Jobs missing Sq.Ft.</dt>
            <dd>{summary ? nf(summary.jobsMissingSqft) : "—"}</dd>
            <dt>Customer service signals</dt>
            <dd>{nf(nCust)}</dd>
            <dt>Remake signals</dt>
            <dd>{nf(nRemake)}</dd>
            <dt>Change signals</dt>
            <dd>{nf(nChange)}</dd>
          </dl>
          <p className="op-interpret">{protectInterpret}</p>
        </div>

        <div className="op-card">
          <div className="op-card-head">
            <h3>Trust the Brain</h3>
            {opCard(trustTier)}
          </div>
          <dl className="mini-stat-grid">
            <dt>Latest sync</dt>
            <dd>{syncHealth?.latestSyncStatus ? String(syncHealth.latestSyncStatus) : "—"}</dd>
            <dt>Last finished</dt>
            <dd>{fmtDate(latestSyncDt)}</dd>
            <dt>Forms extracted</dt>
            <dd>{summary ? nf(summary.totalForms) : "—"}</dd>
            <dt>Fields extracted</dt>
            <dd>{summary ? nf(summary.totalFields) : "—"}</dd>
            <dt>Health</dt>
            <dd style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: healthUi.color,
                  display: "inline-block"
                }}
              />
              {healthUi.caption}
            </dd>
          </dl>
          <p className="op-interpret">{trustInterpret}</p>
        </div>
      </div>
    );
  }

  function condensedSales() {
    const slice = filteredSalespeople.slice(0, 5);
    return (
      <div className="condensed-block">
        <h4>Sales snapshot</h4>
        {slice.length ? (
          <div className="table-scroll" style={{ maxHeight: 220 }}>
            <table className="table-exec">
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th>Sq.Ft.</th>
                  <th>Jobs</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr key={r.salesperson_name}>
                    <td>{displaySalesperson(r.salesperson_name)}</td>
                    <td>{nf(r.worksheet_sqft, { maximumFractionDigits: 0 })}</td>
                    <td>{nf(r.jobs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: "1rem" }}>
            No salesperson rows match the current filters.
          </div>
        )}
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setViewTab(TAB.sales)}>
          Open Sales tab →
        </button>
      </div>
    );
  }

  function condensedProduction() {
    return (
      <div className="condensed-block">
        <h4>Production snapshot</h4>
        {hasOps ? (
          <div className="proc-chips">
            {FLOW_EXEC_KEYS.map((k) => (
              <div key={k} className="proc-chip">
                <div className="l">{FLOW_LABELS[k]}</div>
                <div className="v">{nf(flowMap.get(k) ?? 0)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: "1rem" }}>
            Run operational sync to strengthen Titans activity signals for this cohort.
          </div>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => setViewTab(TAB.production)}
        >
          Open Production tab →
        </button>
      </div>
    );
  }

  function condensedExceptions() {
    const top = signals?.topRiskJobs?.slice(0, 4) ?? [];
    return (
      <div className="condensed-block">
        <h4>Exceptions snapshot</h4>
        {top.length ? (
          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            {top.map((j) => (
              <li key={j.job_id} style={{ marginBottom: 6 }}>
                <strong>{j.job_name || j.job_id}</strong> · {nf(j.worksheet_sqft, { maximumFractionDigits: 0 })} Sq.Ft.
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                  {[
                    j.has_change_signal ? "Change" : null,
                    j.has_remake_signal ? "Remake" : null,
                    j.has_customer_service_signal ? "CS" : null,
                    j.has_slab_signal ? "Slab" : null
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state" style={{ padding: "1rem" }}>
            No prioritized Titan watch signals for this cohort.
          </div>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => setViewTab(TAB.exceptions)}
        >
          Open Exceptions tab →
        </button>
      </div>
    );
  }

  function condensedBrainTrust() {
    return (
      <div className="condensed-block">
        <h4>Brain Trust summary</h4>
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
          Latest sync finished {fmtDate(latestSyncDt)} · {nf(failedJobs.length)} sampled failed jobs surfaced from Brain.
          Data completeness hinges on nightly sync fidelity and worksheets discipline.
        </p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewTab(TAB.brain)}>
          Open Brain Trust →
        </button>
      </div>
    );
  }

  function tabButton(id: TabId, label: string) {
    return (
      <button
        type="button"
        className="tab-exec"
        aria-selected={vis(id)}
        onClick={() => setViewTab(id)}
      >
        {label}
      </button>
    );
  }

  const tokenForLoad = session?.access_token || sessionToken;

  return (
    <div className="shell exec-app-root">
      {toastMsg ? <div className="toast">{toastMsg}</div> : null}

      <header className="exec-header">
        <div className="exec-brand-row">
          <img className="exec-logo" src={LOGO_URL} alt="Elite Stone Fabrication" />
          <div className="exec-headlines">
            <h1>Executive “Keep the Titans Running” Head</h1>
            <p className="exec-sub">
              Every department’s work either feeds, protects, accelerates, or blocks the Titans.
            </p>
            <p className="exec-tagline">
              Moraware records the work. eOS explains the work. The heads move the work.
            </p>
          </div>
        </div>
        <div className="exec-header-actions">
          <div className="user-chip">
            <div className="name">{me?.user?.fullName || me?.user?.email || "Executive"}</div>
            <div className="mail">{me?.user?.email}</div>
          </div>
          <span className="badge-role">{role || "session"}</span>
          <button type="button" className="btn btn-sm" onClick={refreshNow} disabled={!tokenForLoad}>
            Refresh
          </button>
          <button type="button" className="btn btn-sm btn-accent" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <div className="status-strip" aria-label="Executive status strip">
        <span>
          Latest sync: <span className="status-strip-val">{syncHealth?.latestSyncStatus ? String(syncHealth.latestSyncStatus) : "—"}</span>
        </span>
        <span>
          Last refreshed: <span className="status-strip-val">{fmtDate(lastRefreshedAt)}</span>
        </span>
        <span>
          Unresolved failures:{" "}
          <span className="status-strip-val">{nf(syncHealth?.unresolvedFailedJobCount ?? unresolved)}</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          Health
          <span
            aria-hidden
            style={{ width: 10, height: 10, borderRadius: "50%", background: healthUi.color, display: "inline-block" }}
          />
          <kbd style={{ border: "none", background: "transparent", padding: 0 }}>{healthUi.caption}</kbd>
        </span>
      </div>

      <div className="toolbar">
        <div>
          <label className="field-label">Year</label>
          <select className="input-field" style={{ width: 120 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[2026, 2025, 2024].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-grow">
          <label className="field-label">Global search</label>
          <input
            className="input-field"
            placeholder="Search across tiles, reps, accounts, jobs..."
            value={globalSearchRaw}
            onChange={(e) => setGlobalSearchRaw(e.target.value)}
          />
        </div>
        <div className="popover-shell" ref={spPopoverRef}>
          <button type="button" className="btn btn-sm" onClick={() => setSpPopoverOpen((o) => !o)}>
            {selectedSalespeople.length === 0
              ? "All salespeople"
              : `${selectedSalespeople.length} selected`}
          </button>
          {spPopoverOpen ? (
            <div className="popover-panel" role="dialog" aria-label="Salespeople filter">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedSalespeople([])}>
                  Clear
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedSalespeople([...salespersonNames])}>
                  Select all
                </button>
              </div>
              {salespersonNames.map((nm) => (
                <label key={nm} className="popover-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedSalespeople.includes(nm)}
                    onChange={() => {
                      setSelectedSalespeople((prev) =>
                        prev.includes(nm) ? prev.filter((x) => x !== nm) : [...prev, nm]
                      );
                    }}
                  />
                  {displaySalesperson(nm)}
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <button type="button" className="btn btn-sm" onClick={() => setFiltersOpen((o) => !o)}>
            {filtersOpen ? "Hide filters" : "Filters"}
          </button>
        </div>
      </div>

      <section className="filter-drawer" hidden={!filtersOpen}>
        <div className="filter-grid">
          <div>
            <label className="field-label">Account search</label>
            <input
              className="input-field"
              placeholder="Account name or ID"
              value={accountQuery}
              onChange={(e) => setAccountQuery(e.target.value)}
            />
            <p className="field-micro">Narrows salesperson context and account tables.</p>
          </div>
          <div>
            <label className="field-label">Min worksheet Sq.Ft.</label>
            <input className="input-field" placeholder="e.g. 500" value={minSqft} onChange={(e) => setMinSqft(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Account table limit</label>
            <input
              type="number"
              min={1}
              max={200}
              className="input-field"
              value={accountLimitInput}
              onChange={(e) => setAccountLimitInput(e.target.value)}
              onBlur={() => commitAccountLimitFromInput()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitAccountLimitFromInput();
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <p className="field-micro">
              Top accounts fetched from Brain (press Enter or leave the field to apply). Does not reload on every keystroke.
            </p>
          </div>
          <div style={{ alignSelf: "end" }}>
            <button type="button" className="btn btn-sm" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
        </div>
      </section>

      {dataError ? <div className="banner-alert">{dataError}</div> : null}
      {loadingUser && summary ? (
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: 12 }}>
          Updating executive metrics…
        </p>
      ) : null}

      <nav className="tabs-exec" aria-label="Executive sections">
        {tabButton(TAB.overview, "Overview")}
        {tabButton(TAB.sales, "Sales")}
        {tabButton(TAB.production, "Production")}
        {tabButton(TAB.exceptions, "Exceptions")}
        {tabButton(TAB.fields, "Field Trends")}
        {tabButton(TAB.brain, "Brain Trust")}
      </nav>

      {vis(TAB.overview) ? (
        <>
          <section className="section-exec">
            <h2 className="section-title">Operating Summary</h2>
            <p className="section-desc">Four lenses on whether Titans are fed, flowing, guarded, and explained by Brain.</p>
            {operatingSummaryCards()}
          </section>

          <section className="section-exec">
            <div className="card-surface" style={{ marginBottom: "1.25rem" }}>
              <h2 className="section-title">Monthly trend</h2>
              <p className="section-desc">
                Board-ready worksheet pacing by month · updates when Brain reloads after year or Refresh.
              </p>
              <MonthlyTrendPanel data={monthlyTrend} loading={loadingUser && !monthlyTrend} />
            </div>
          </section>

          <section className="section-exec">
            <h2 className="section-title">Executive insights</h2>
            <p className="section-desc">Factual cues derived from loaded Brain slices — directional, data-backed statements.</p>
            {executiveInsights.length ? (
              <ul className="insights-list">
                {executiveInsights.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">Insights populate once salesperson and Brain summary rows load.</div>
            )}
          </section>

          <section className="section-exec">
            <h2 className="section-title">Operational snapshots</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.85rem" }}>
              {condensedSales()}
              {condensedProduction()}
              {condensedExceptions()}
              {condensedBrainTrust()}
            </div>
          </section>
        </>
      ) : null}

      {vis(TAB.sales) ? (
        <section className="section-exec">
          <h2 className="section-title">Sales performance</h2>
          <p className="section-desc">Sort columns; filters above stay live for this cohort.</p>
          <p className="field-micro" style={{ marginBottom: "0.85rem" }}>
            Worksheet Sq.Ft. comes from Moraware worksheet fields synced into the eOS Brain.
          </p>
          <div className="conc-hint">
            Top three reps comprise {nf(concentration.top3pct, { maximumFractionDigits: 1 })}% of total worksheet Sq.Ft.
          </div>
          <h3 style={{ fontSize: "0.9375rem", margin: "1.25rem 0 0.5rem" }}>Salespeople</h3>
          <div className="table-scroll">
            <table className="table-exec">
              <thead>
                <tr>
                  {(
                    [
                      ["salesperson_name", "Salesperson"],
                      ["worksheet_sqft", "Sq.Ft."],
                      ["jobs", "Jobs"],
                      ["avg_sqft_per_job", "Avg / job"],
                      ["first_job_date", "First job"]
                    ] as const
                  ).map(([k, lbl]) => (
                    <th key={k} onClick={() => setSpSort(toggleSort(spSort, k))}>
                      {lbl}
                      {spSort.key === k ? (spSort.dir === "desc" ? " ▼" : " ▲") : ""}
                    </th>
                  ))}
                  <th>Share visual</th>
                </tr>
              </thead>
              <tbody>
                {filteredSalespeople.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "1.25rem", color: "var(--text-muted)" }}>
                      No rows match filters.
                    </td>
                  </tr>
                ) : (
                  filteredSalespeople.map((r) => {
                    const w = Math.round((100 * r.worksheet_sqft) / maxSpSqft);
                    return (
                      <tr key={r.salesperson_name}>
                        <td>
                          <span className="cell-ellipsis" title={displaySalesperson(r.salesperson_name)}>
                            {displaySalesperson(r.salesperson_name)}
                          </span>
                          {isUnassignedSalesperson(r.salesperson_name) ? (
                            <span className="badge-warn-micro" title="Moraware worksheet salesperson missing">
                              Incomplete
                            </span>
                          ) : null}
                        </td>
                        <td>{nf(r.worksheet_sqft, { maximumFractionDigits: 0 })}</td>
                        <td>{nf(r.jobs)}</td>
                        <td>{nf(r.avg_sqft_per_job, { maximumFractionDigits: 1 })}</td>
                        <td>{fmtYmd(r.first_job_date)}</td>
                        <td style={{ width: 140 }}>
                          <div className="bar-track-light">
                            <div className="bar-fill-light" style={{ width: `${w}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: "0.9375rem", margin: "1.5rem 0 0.5rem" }}>Accounts</h3>
          <div className="table-scroll">
            <table className="table-exec">
              <thead>
                <tr>
                  {(
                    [
                      ["account_name", "Account"],
                      ["account_id", "ID"],
                      ["worksheet_sqft", "Sq.Ft."],
                      ["jobs", "Jobs"],
                      ["avg_sqft_per_job", "Avg / job"],
                      ["salespeople", "Salespeople"]
                    ] as const
                  ).map(([k, lbl]) => (
                    <th key={k} onClick={() => setAcSort(toggleSort(acSort, k as AccountSortKey))}>
                      {lbl}
                      {acSort.key === k ? (acSort.dir === "desc" ? " ▼" : " ▲") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "1.25rem", color: "var(--text-muted)" }}>
                      No rows match filters.
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((r) => (
                    <tr key={`${r.account_id}-${r.account_name}`}>
                      <td className="cell-ellipsis" title={displayAccountName(r.account_name)}>
                        {displayAccountName(r.account_name)}
                      </td>
                      <td className="cell-ellipsis" title={String(r.account_id ?? "")}>
                        {r.account_id || "—"}
                      </td>
                      <td>{nf(r.worksheet_sqft, { maximumFractionDigits: 0 })}</td>
                      <td>{nf(r.jobs)}</td>
                      <td>{nf(r.avg_sqft_per_job, { maximumFractionDigits: 1 })}</td>
                      <td>
                        {r.salesperson_names.length
                          ? r.salesperson_names.map((sn) => (
                              <span key={sn} className="badge-soft">
                                {displaySalesperson(sn)}
                              </span>
                            ))
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {vis(TAB.production) ? (
        <section className="section-exec">
          <h2 className="section-title">Production · Moraware operational signals</h2>
          <p className="section-desc">
            These are Moraware operational activity signals, not machine telemetry yet. They describe Brain-ingested
            activity labels — useful directionally, not as live equipment readouts.
          </p>
          <div className="production-groups">
            {PRODUCTION_PHASES.map((ph) => (
              <div key={ph.title} className="proc-band">
                <h4>{ph.title}</h4>
                <p className="proc-note">{ph.note}</p>
                <div className="proc-chips">
                  {ph.keys.map((k) => (
                    <div key={k} className="proc-chip">
                      <div className="l">{FLOW_LABELS[k]}</div>
                      <div className="v">{nf(flowMap.get(k) ?? 0)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="card-surface" style={{ marginTop: "1.25rem" }}>
            <h3 className="section-title" style={{ fontSize: "0.9375rem" }}>
              Supporting customer &amp; slab-adjacent activity
            </h3>
            <p className="section-desc" style={{ marginBottom: "0.75rem" }}>
              These buckets often overlap customer communication and layout nuance fields.
            </p>
            <div className="proc-chips">
              {OTHER_FLOW_KEYS.map((k) => (
                <div key={k} className="proc-chip">
                  <div className="l">{FLOW_LABELS[k]}</div>
                  <div className="v">{nf(flowMap.get(k) ?? 0)}</div>
                </div>
              ))}
            </div>
            {production?.message?.trim() ? (
              <p style={{ marginTop: 12, fontSize: "0.8125rem", color: "var(--warning)" }}>{production.message}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {vis(TAB.exceptions) ? (
        <section className="section-exec">
          <h2 className="section-title">Titan Exceptions &amp; Watch Signals</h2>
          <p className="section-desc">
            These indicators identify jobs worth reviewing; they are not final problem classifications. Watch signals are
            heuristics surfaced from Brain summaries — pair with Moraware PM review before treating them as definitive
            issues.
          </p>
          <div className="signal-chips-toolbar">
            <button type="button" className="filter-chip" data-on={exceptionSignalPick.has("change")} onClick={() => toggleSig("change")}>
              Change · {nf(nChange)}
            </button>
            <button type="button" className="filter-chip" data-on={exceptionSignalPick.has("remake")} onClick={() => toggleSig("remake")}>
              Remake · {nf(nRemake)}
            </button>
            <button type="button" className="filter-chip" data-on={exceptionSignalPick.has("cust")} onClick={() => toggleSig("cust")}>
              Customer service · {nf(nCust)}
            </button>
            <button type="button" className="filter-chip" data-on={exceptionSignalPick.has("repair")} onClick={() => toggleSig("repair")}>
              Repair · {nf(nRepair)}
            </button>
            <button type="button" className="filter-chip" data-on={exceptionSignalPick.has("slab")} onClick={() => toggleSig("slab")}>
              Slab · {nf(nSlab)}
            </button>
          </div>
          {exceptionSignalPick.has("repair") && exceptionSignalPick.size === 1 ? (
            <div className="banner-alert">
              Repair signals are summarized in counts; job-level repair rows are not surfaced in this watch-list yet —
              prioritize via operational drill-down in Brain tooling.
            </div>
          ) : null}

          <h3 style={{ fontSize: "0.9375rem", margin: "0.85rem 0 0.5rem" }}>Top jobs worth reviewing</h3>
          <div className="table-scroll">
            <table className="table-exec">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Account</th>
                  <th>Salesperson</th>
                  <th>Sq.Ft.</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {topRiskFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "1.25rem", color: "var(--text-muted)" }}>
                      No prioritized jobs match the selected signal filters + search.
                    </td>
                  </tr>
                ) : (
                  topRiskFiltered.map((r) => (
                    <tr key={r.job_id} style={{ cursor: "pointer" }} onClick={() => setJobDetail(r)}>
                      <td className="cell-ellipsis" title={String(r.job_name || r.job_id)}>
                        {r.job_name || r.job_id}
                      </td>
                      <td className="cell-ellipsis" title={displayAccountName(r.account_name)}>
                        {r.account_name ? displayAccountName(r.account_name) : "—"}
                      </td>
                      <td>{displaySalesperson(r.salesperson_name)}</td>
                      <td>{nf(r.worksheet_sqft, { maximumFractionDigits: 0 })}</td>
                      <td>
                        {r.has_change_signal ? <span className="badge-soft">Change</span> : null}
                        {r.has_remake_signal ? <span className="badge-soft badge-gold">Remake</span> : null}
                        {r.has_customer_service_signal ? <span className="badge-soft">CS</span> : null}
                        {r.has_slab_signal ? <span className="badge-soft">Slab</span> : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {vis(TAB.fields) ? (
        <section className="section-exec">
          <h2 className="section-title">Field trends</h2>
          <p className="section-desc">
            Product mix and worksheet-derived field consistency trends — readability depends on how completely designers
            capture attributes in Brain-indexed worksheets.
          </p>
          {trends && trendsAllEmpty ? (
            <div className="empty-state" style={{ marginBottom: "1rem" }}>
              No field-mix rows for this cohort yet. When worksheet fields are consistently captured, these cards will
              populate automatically.
            </div>
          ) : null}
          <div className="trends-grid-light">
            {FIELD_TREND_ORDER.map(({ key, title }) => {
              const rows = trends?.trends?.[key] ?? [];
              return (
                <div key={key} className="trend-card">
                  <h5>{title}</h5>
                  {rows.length ? (
                    rows.slice(0, 8).map((row) => (
                      <div key={row.value} className="row-line">
                        <span>{row.value}</span>
                        <span>{nf(row.count)}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", paddingTop: 4 }}>No rows for cohort.</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {vis(TAB.brain) ? (
        <section className="section-exec">
          <h2 className="section-title">Brain Trust</h2>
          <p className="section-desc">
            Moraware is the source of truth. eOS explains the work and shows where the Titans may be helped or blocked.
            Monitor Brain sync fidelity below for executive confidence in these indicators.
          </p>
          <div className="card-surface" style={{ marginBottom: "1rem" }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Sync health</h3>
            <dl className="mini-stat-grid">
              <dt>Caption</dt>
              <dd>{healthUi.caption}</dd>
              <dt>Unresolved failed jobs</dt>
              <dd>{nf(unresolved)}</dd>
              <dt>Jobs missing Sq.Ft.</dt>
              <dd>{summary ? nf(summary.jobsMissingSqft) : "—"}</dd>
              <dt>Forms / fields indexed</dt>
              <dd>
                {summary ? nf(summary.totalForms) : "—"} / {summary ? nf(summary.totalFields) : "—"}
              </dd>
            </dl>
          </div>
          {syncRunsLoadError ? <div className="banner-alert" style={{ marginBottom: "0.85rem", fontSize: "0.875rem" }}>{syncRunsLoadError}</div> : null}
          {failedJobsLoadError ? (
            <div className="banner-alert" style={{ marginBottom: "0.85rem", fontSize: "0.875rem" }}>
              {failedJobsLoadError}
            </div>
          ) : null}

          <h3 style={{ fontSize: "0.9375rem" }}>Latest sync runs</h3>
          <div className="table-scroll" style={{ marginBottom: "1.25rem" }}>
            <table className="table-exec">
              <thead>
                <tr>
                  <th>Finished</th>
                  <th>Status</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {syncRuns.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", padding: "1rem" }}>
                      No sync run records returned.
                    </td>
                  </tr>
                ) : (
                  syncRuns.slice(0, 12).map((run: any, i: number) => (
                    <tr key={`${run.finished_at || i}-${run.id || i}`}>
                      <td>{fmtDate(run.finished_at || run.created_at)}</td>
                      <td>{String(run.status ?? "—")}</td>
                      <td style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>{String(run.summary ?? run.message ?? "—")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: "0.9375rem" }}>Failed jobs (sample)</h3>
          <div className="table-scroll">
            <table className="table-exec">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Error</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {failedJobs.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", padding: "1rem" }}>
                      Brain returned no sampled failed-job rows for this administrator view.
                    </td>
                  </tr>
                ) : (
                  failedJobs.map((j: any, i: number) => (
                    <tr key={`${j.job_id || i}-${i}`}>
                      <td>{String(j.job_id ?? j.id ?? "—")}</td>
                      <td style={{ maxWidth: 260, whiteSpace: "pre-wrap" }}>{String(j.error ?? j.reason ?? j.message ?? "—")}</td>
                      <td>{fmtDate(j.updated_at ?? j.failed_at ?? j.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

          <footer className="debug-panel">
        <p className="footer-motto">Keep the Titans running well.</p>
        {import.meta.env.DEV ? (
          <>
            <p className="dev-exec-trace">
              Backend load batches: <strong>{devExecTrace.n}</strong> · last trigger:{" "}
              <code>{devExecTrace.reason}</code>
            </p>
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setShowDebug((x) => !x)}>
              {showDebug ? "Hide" : "Show"} developer API trace
            </button>
            {showDebug ? (
              <pre className="debug-panel-inner">{JSON.stringify(apiDebug, null, 2)}</pre>
            ) : null}
          </>
        ) : null}
      </footer>

      {jobDetail ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setJobDetail(null);
          }}
        >
          <div className="modal-sheet" role="dialog" aria-labelledby="jd-title">
            <h3 id="jd-title" style={{ marginTop: 0 }}>
              Job watch snapshot
            </h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Watch indicators are directional — investigate in Moraware + Brain before reallocating Titans.
            </p>
            <dl className="mini-stat-grid" style={{ marginTop: "0.85rem" }}>
              <dt>Job</dt>
              <dd>{jobDetail.job_name}</dd>
              <dt>Job ID</dt>
              <dd>{jobDetail.job_id}</dd>
              <dt>Sq.Ft.</dt>
              <dd>{nf(jobDetail.worksheet_sqft ?? 0, { maximumFractionDigits: 0 })}</dd>
              <dt>Signals</dt>
              <dd>
                {[
                  jobDetail.has_change_signal ? "Change" : null,
                  jobDetail.has_remake_signal ? "Remake" : null,
                  jobDetail.has_customer_service_signal ? "Customer service" : null,
                  jobDetail.has_slab_signal ? "Slab-adjacent" : null
                ]
                  .filter(Boolean)
                  .join(" · ") || "None flagged"}
              </dd>
            </dl>
            <button type="button" className="btn btn-accent" style={{ marginTop: 16 }} onClick={() => setJobDetail(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

