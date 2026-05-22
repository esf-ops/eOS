import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost, ApiError } from "./lib/api";
import { formatDateTime, formatMoneyStandard, formatMoneyWhole, formatShortDate, formatSqft } from "./lib/format";
import {
  displayAccountColumn,
  labelHandoffDocStatus,
  labelHandoffRollup,
  labelQuoteSource,
  labelQuoteStatus,
  STATUS_FILTER_VALUES,
  statusFilterLabel
} from "./lib/labels";
import { getSupabase } from "./lib/supabase";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [50, 100, 250];

type TabId = "all" | "by_account" | "my" | "internal" | "public" | "sold" | "handoff";

type ListMeta = {
  limit: number;
  offset: number;
  page_size: number;
  total_count: number | null;
  has_more: boolean;
  showing_from: number;
  showing_to: number;
};

const EMPTY_LIST_META: ListMeta = {
  limit: DEFAULT_PAGE_SIZE,
  offset: 0,
  page_size: DEFAULT_PAGE_SIZE,
  total_count: null,
  has_more: false,
  showing_from: 0,
  showing_to: 0
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function loc(row: Record<string, unknown>): string {
  const bits = [str(row.city), str(row.state), str(row.zip)].filter(Boolean);
  return bits.join(", ") || "—";
}

function statusPillClass(raw: unknown): string {
  const s = str(raw).toLowerCase();
  if (s === "sold" || s === "won") return "pill pill-status-won";
  if (s === "lost") return "pill pill-status-lost";
  if (s === "lead_submitted" || s === "reviewing" || s === "contacted" || s === "quoted") return "pill pill-status-lead";
  if (s === "draft" || s === "sent" || s === "revised" || s === "follow_up" || s === "testing_review" || s === "submitted")
    return "pill pill-status-active";
  if (s === "archived") return "pill pill-status-neutral";
  return "pill pill-status-neutral";
}

function canBatchArchiveRow(row: Record<string, unknown>): boolean {
  const status = str(row.quote_status).toLowerCase();
  return !row.archived_at && status !== "sold" && status !== "won" && Boolean(str(row.id));
}

function formatTimelineEntry(ev: Record<string, unknown>): { time: string; body: string } {
  const t = str(ev.type);
  const at = formatDateTime(ev.at);
  if (t === "status") {
    const oldS = labelQuoteStatus(ev.old_status);
    const newS = labelQuoteStatus(ev.new_status);
    return { time: at, body: `Status changed: ${oldS} → ${newS}` };
  }
  if (t === "monday") {
    return { time: at, body: `Monday sync: ${str(ev.action)} (${str(ev.status)})` };
  }
  return { time: at, body: JSON.stringify(ev) };
}

function latestHandoffDoc(detail: Record<string, unknown>, docType: string): Record<string, unknown> | undefined {
  const rows = Array.isArray(detail.handoff_documents) ? (detail.handoff_documents as Record<string, unknown>[]) : [];
  const matches = rows.filter((r) => str(r.doc_type) === docType);
  if (!matches.length) return undefined;
  return [...matches].sort((a, b) => String(b.generated_at || "").localeCompare(String(a.generated_at || "")))[0];
}

function HandoffDocBlock({ doc }: { doc: Record<string, unknown> }) {
  const dtype = str(doc.doc_type);
  const title = dtype === "moraware_entry" ? "Moraware Entry Doc" : dtype === "quickbooks_entry" ? "QuickBooks Entry Doc" : dtype;
  const payload = doc.payload && typeof doc.payload === "object" ? (doc.payload as Record<string, unknown>) : {};
  const warnings = Array.isArray(payload.missing_field_warnings) ? (payload.missing_field_warnings as unknown[]) : [];
  const st = str(doc.status);
  const pillClass =
    st === "generated" || st === "reviewed" || st === "completed" ? "pill pill-status-won" : st === "voided" ? "pill pill-status-lost" : "pill pill-status-neutral";
  return (
    <div className="handoff-card">
      <h4>
        {title} <span className={pillClass} style={{ marginLeft: 8 }}>{labelHandoffDocStatus(doc.status)}</span>
      </h4>
      <p className="muted" style={{ margin: "4px 0", fontSize: "0.75rem" }}>
        Generated {formatDateTime(doc.generated_at)}
      </p>
      {warnings.length ? (
        <div className="warn" style={{ marginTop: 8 }}>
          {warnings.map((w, i) => (
            <div key={i}>{str(w)}</div>
          ))}
        </div>
      ) : null}
      <details>
        <summary style={{ cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600 }}>Review payload</summary>
        <div className="payload-preview">{JSON.stringify(payload, null, 2)}</div>
      </details>
    </div>
  );
}

function internalEstimateUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_INTERNAL_ESTIMATE ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://internal.eliteosfab.com";
}

export default function QuoteLibraryApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [listMeta, setListMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [accountGroups, setAccountGroups] = useState<Record<string, unknown>[]>([]);

  const [search, setSearch] = useState("");
  const [accountQ, setAccountQ] = useState("");
  const [status, setStatus] = useState("");
  const [quoteSource, setQuoteSource] = useState("");
  const [branch, setBranch] = useState("");
  const [salesRep, setSalesRep] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [handoffStatus, setHandoffStatus] = useState("");
  const [sort, setSort] = useState("updated_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [pageOffset, setPageOffset] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [revisions, setRevisions] = useState<Record<string, unknown>[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const internalBase = useMemo(() => internalEstimateUrl(), []);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n += 1;
    if (accountQ.trim()) n += 1;
    if (status) n += 1;
    if (quoteSource) n += 1;
    if (branch.trim()) n += 1;
    if (salesRep.trim()) n += 1;
    if (createdFrom) n += 1;
    if (createdTo) n += 1;
    if (handoffStatus) n += 1;
    if (showArchived) n += 1;
    return n;
  }, [search, accountQ, status, quoteSource, branch, salesRep, createdFrom, createdTo, handoffStatus, showArchived]);

  const listContextKey = useMemo(
    () =>
      JSON.stringify({
        tab,
        search,
        accountQ,
        status,
        quoteSource,
        branch,
        salesRep,
        createdFrom,
        createdTo,
        handoffStatus,
        showArchived,
        sort,
        direction,
        pageSize
      }),
    [tab, search, accountQ, status, quoteSource, branch, salesRep, createdFrom, createdTo, handoffStatus, showArchived, sort, direction, pageSize]
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    setAccountQ("");
    setStatus("");
    setQuoteSource("");
    setBranch("");
    setSalesRep("");
    setCreatedFrom("");
    setCreatedTo("");
    setHandoffStatus("");
    setShowArchived(false);
    setPageOffset(0);
    setSelectedIds(new Set());
  }, []);

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword
      });
      if (error) throw error;
      const tok = data.session?.access_token;
      if (!tok) throw new Error("No access token");
      setSessionToken(tok);
      setAuthPassword("");
    } catch (e: unknown) {
      setAuthError(String((e as Error)?.message || e));
    } finally {
      setAuthBusy(false);
    }
  }, [authEmail, authPassword, supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSessionToken(null);
    setRows([]);
    setListMeta(EMPTY_LIST_META);
    setSelectedIds(new Set());
    setDetail(null);
    setDetailId(null);
  }, [supabase]);

  /** Restore JWT from shared cookie storage (same pattern as Internal Estimate / Home). */
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const tok = data.session?.access_token ?? "";
      setSessionToken(tok || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (!alive) return;
      const tok = sess?.access_token ?? "";
      setSessionToken(tok || null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const loadMetrics = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const m = (await apiGet("/api/quote-library/metrics", sessionToken)) as Record<string, unknown>;
      setMetrics((m.metrics as Record<string, unknown>) || {});
    } catch {
      setMetrics({});
    }
  }, [sessionToken]);

  const loadAccounts = useCallback(async () => {
    if (!sessionToken) return;
    const qs = new URLSearchParams();
    if (accountQ.trim()) qs.set("search", accountQ.trim());
    const path = `/api/quote-library/accounts${qs.toString() ? `?${qs}` : ""}`;
    const res = (await apiGet(path, sessionToken)) as { groups?: Record<string, unknown>[] };
    setAccountGroups(Array.isArray(res.groups) ? res.groups : []);
  }, [sessionToken, accountQ]);

  const loadRows = useCallback(async () => {
    if (!sessionToken || tab === "by_account") return;
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String(pageOffset));
      params.set("sort", sort);
      params.set("direction", direction);
      if (search.trim()) params.set("search", search.trim());
      if (accountQ.trim()) params.set("account", accountQ.trim());
      if (status) params.set("status", status);
      if (quoteSource) params.set("quote_source", quoteSource);
      if (branch.trim()) params.set("branch", branch.trim());
      if (salesRep.trim()) params.set("sales_rep", salesRep.trim());
      if (createdFrom) params.set("created_from", createdFrom);
      if (createdTo) params.set("created_to", createdTo);
      if (handoffStatus) params.set("handoff_status", handoffStatus);
      if (showArchived) params.set("include_archived", "1");
      if (tab === "my") params.set("my", "1");
      if (tab === "internal") params.set("view", "internal_estimates");
      if (tab === "public") params.set("view", "public_leads");
      if (tab === "sold") params.set("view", "sold_jobs");
      if (tab === "handoff") params.set("view", "needs_handoff");

      const res = (await apiGet(`/api/quote-library/quotes?${params}`, sessionToken)) as {
        rows?: unknown;
        limit?: unknown;
        offset?: unknown;
        page_size?: unknown;
        total_count?: unknown;
        has_more?: unknown;
        showing_from?: unknown;
        showing_to?: unknown;
      };
      const nextRows = Array.isArray(res.rows) ? (res.rows as Record<string, unknown>[]) : [];
      setRows(nextRows);
      setListMeta({
        limit: Number(res.limit ?? pageSize) || pageSize,
        offset: Number(res.offset ?? pageOffset) || 0,
        page_size: Number(res.page_size ?? res.limit ?? pageSize) || pageSize,
        total_count: Number.isFinite(Number(res.total_count)) ? Number(res.total_count) : null,
        has_more: res.has_more === true,
        showing_from: Number(res.showing_from ?? (nextRows.length ? pageOffset + 1 : 0)) || 0,
        showing_to: Number(res.showing_to ?? (nextRows.length ? pageOffset + nextRows.length : 0)) || 0
      });
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) {
        setErr("Access denied. Ask an admin to grant the quote_library head, or use an admin profile.");
      } else {
        setErr(String((e as Error)?.message || e));
      }
      setRows([]);
      setListMeta({ ...EMPTY_LIST_META, limit: pageSize, page_size: pageSize, offset: pageOffset });
    } finally {
      setBusy(false);
    }
  }, [
    sessionToken,
    tab,
    search,
    accountQ,
    status,
    quoteSource,
    branch,
    salesRep,
    createdFrom,
    createdTo,
    handoffStatus,
    sort,
    direction,
    showArchived,
    pageSize,
    pageOffset
  ]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    setPageOffset(0);
    setSelectedIds(new Set());
  }, [listContextKey]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [pageOffset]);

  useEffect(() => {
    if (tab === "by_account") void loadAccounts();
    else void loadRows();
  }, [tab, loadRows, loadAccounts]);

  useEffect(() => {
    if (!sessionToken || !detailId) {
      setDetail(null);
      setRevisions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = (await apiGet(`/api/quote-library/quotes/${detailId}`, sessionToken)) as Record<string, unknown>;
        if (!cancelled) setDetail(d);
        try {
          const rev = (await apiGet(`/api/quote-library/quotes/${detailId}/revisions`, sessionToken)) as Record<
            string,
            unknown
          >;
          if (!cancelled && rev.ok === true && Array.isArray(rev.revisions)) {
            setRevisions(rev.revisions as Record<string, unknown>[]);
          } else if (!cancelled) setRevisions([]);
        } catch {
          if (!cancelled) setRevisions([]);
        }
      } catch (e: unknown) {
        if (!cancelled) setErr(String((e as Error)?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken, detailId]);

  const metricCards = useMemo(() => {
    const m = metrics || {};
    const iq = (m.internal_quote_periods || {}) as Record<string, { total_quote_value?: number; quote_count?: number }>;
    const periods = (m.periods || {}) as Record<string, { total_quote_value?: number; quote_count?: number }>;
    const yoy = (m.yoy_compare_ytd || {}) as Record<string, number>;
    return [
      { key: "open", label: "Open pipeline value (latest rev)", val: formatMoneyWhole(m.total_open_quote_value) },
      { key: "oc", label: "Open quotes", val: str(m.open_quotes ?? "—") },
      { key: "nw", label: "New rows this week", val: str(m.new_this_week ?? "—") },
      { key: "iytd", label: "Internal · YTD value", val: formatMoneyWhole(iq.ytd?.total_quote_value) },
      { key: "iytdc", label: "Internal · YTD count", val: str(iq.ytd?.quote_count ?? "—") },
      { key: "iwk", label: "Internal · week value", val: formatMoneyWhole(iq.week?.total_quote_value) },
      { key: "allwk", label: "All sources · week value", val: formatMoneyWhole(periods.week?.total_quote_value) },
      { key: "yoy", label: "YoY · Δ YTD value", val: formatMoneyWhole(yoy.delta_value) },
      { key: "sm", label: "Sold this month", val: str(m.sold_this_month ?? "—") },
      { key: "mw", label: "Needs Moraware entry doc", val: str(m.needs_moraware_entry_doc ?? "—") },
      { key: "qb", label: "Needs QuickBooks entry doc", val: str(m.needs_quickbooks_entry_doc ?? "—") }
    ];
  }, [metrics]);

  const loadRevisionsForDetail = useCallback(
    async (quoteId: string) => {
      if (!sessionToken || !quoteId) {
        setRevisions([]);
        return;
      }
      try {
        const rev = (await apiGet(`/api/quote-library/quotes/${quoteId}/revisions`, sessionToken)) as Record<
          string,
          unknown
        >;
        if (rev.ok === true && Array.isArray(rev.revisions)) {
          setRevisions(rev.revisions as Record<string, unknown>[]);
        } else {
          setRevisions([]);
        }
      } catch {
        setRevisions([]);
      }
    },
    [sessionToken]
  );

  const refreshListAndDetail = useCallback(async () => {
    void loadMetrics();
    void loadRows();
    if (detailId && sessionToken) {
      try {
        const d = (await apiGet(`/api/quote-library/quotes/${detailId}`, sessionToken)) as Record<string, unknown>;
        setDetail(d);
        await loadRevisionsForDetail(detailId);
      } catch {
        /* ignore */
      }
    }
  }, [detailId, sessionToken, loadMetrics, loadRows, loadRevisionsForDetail]);

  const runAction = async (label: string, fn: () => Promise<string | void>) => {
    setMsg(null);
    setErr(null);
    try {
      const extra = await fn();
      setMsg(extra || `${label} complete.`);
      await refreshListAndDetail();
    } catch (e: unknown) {
      setErr(String((e as Error)?.message || e));
    }
  };

  const selectableRows = useMemo(() => rows.filter(canBatchArchiveRow), [rows]);
  const selectableIds = useMemo(() => selectableRows.map((r) => str(r.id)).filter(Boolean), [selectableRows]);
  const selectedCount = selectedIds.size;
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const visibleSelectionIsPartial = selectableIds.some((id) => selectedIds.has(id)) && !allVisibleSelected;
  const listCountLabel = useMemo(() => {
    if (busy) return "Loading…";
    if (listMeta.total_count != null) {
      if (listMeta.total_count === 0) return "Showing 0 quotes";
      return `Showing ${listMeta.showing_from}–${listMeta.showing_to} of ${listMeta.total_count} matching quotes`;
    }
    return rows.length === 1 ? "Showing 1 quote" : `Showing ${rows.length} quotes`;
  }, [busy, listMeta.showing_from, listMeta.showing_to, listMeta.total_count, rows.length]);

  const toggleSelectedId = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectVisible = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of selectableIds) {
          if (checked) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [selectableIds]
  );

  const archiveSelected = useCallback(async () => {
    if (!sessionToken || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const ok = window.confirm(
      `Archive ${ids.length} selected quote${ids.length === 1 ? "" : "s"}? They will be hidden from the default library but can be shown with Show archived.`
    );
    if (!ok) return;
    setBatchBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = (await apiPost("/api/quote-library/quotes/batch/archive", sessionToken, {
        quote_ids: ids,
        confirm: true
      })) as Record<string, unknown>;
      const archived = Number(res.archived_count ?? 0);
      const skipped = Number(res.skipped_count ?? 0);
      const failed = Number(res.failed_count ?? 0);
      setSelectedIds(new Set());
      setMsg(`Batch archive complete: ${archived} archived, ${skipped} skipped, ${failed} failed.`);
      await refreshListAndDetail();
    } catch (e: unknown) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setBatchBusy(false);
    }
  }, [refreshListAndDetail, selectedIds, sessionToken]);

  const header = (detail?.header as Record<string, unknown>) || {};
  const mondayBoard = str(header.monday_board_id);
  const mondayItem = str(header.monday_item_id);
  const mondayUrl =
    mondayBoard && mondayItem ? `https://monday.com/boards/${encodeURIComponent(mondayBoard)}/pulses/${encodeURIComponent(mondayItem)}` : "";

  const snap = (detail?.calculation_snapshot as Record<string, unknown>) || {};
  const iu = (snap.internal_ui as Record<string, unknown>) || {};

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-brand">
          <img className="hero-logo" src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
          <div className="hero-copy">
            <h1>eliteOS Quote Library Head</h1>
            <p className="sub">Account-centered search, status workflow, and sold-job handoff documents — your command center over quotes in Supabase.</p>
            <p className="domain-line">
              Canonical domain: <strong>quotes.eliteosfab.com</strong> — separate from the public tool at <strong>quote.eliteosfab.com</strong>.
            </p>
          </div>
        </div>
        <div>
          {sessionToken ? (
            <button type="button" className="btn secondary" onClick={() => void signOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      {!supabase ? <div className="warn">Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to sign in.</div> : null}

      {!sessionToken ? (
        <section className="card">
          <h2>Sign in</h2>
          <div className="grid2">
            <label>
              Email
              <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoComplete="username" />
            </label>
            <label>
              Password
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          </div>
          {authError ? <p className="error">{authError}</p> : null}
          <button type="button" className="btn primary" style={{ marginTop: 12 }} disabled={authBusy} onClick={() => void signIn()}>
            {authBusy ? "Signing in…" : "Sign in"}
          </button>
        </section>
      ) : null}

      {sessionToken ? (
        <>
          {msg ? <p className="ok">{msg}</p> : null}
          {err ? <p className="error">{err}</p> : null}

          <div className="metrics">
            {metricCards.map((c) => (
              <div key={c.key} className="metric">
                <div className="val">{c.val}</div>
                <div className="lbl">{c.label}</div>
              </div>
            ))}
          </div>

          <div className="tabs" role="tablist" aria-label="Quote views">
            {(
              [
                ["all", "All Quotes"],
                ["by_account", "By Account"],
                ["my", "My Quotes"],
                ["internal", "Internal Estimates"],
                ["public", "Public Leads"],
                ["sold", "Sold Jobs"],
                ["handoff", "Needs Handoff"]
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "public" ? (
            <div className="info-banner">
              <p>
                <strong>Public Leads</strong> — homeowner and public requests submitted through{" "}
                <strong>quote.eliteosfab.com</strong> (eliteOS Public Quote Head).
              </p>
            </div>
          ) : null}
          {tab === "internal" ? (
            <div className="info-banner">
              <p>
                <strong>Internal Estimates</strong> — quotes created by signed-in Elite staff in the Internal Estimate Head.
              </p>
              <p className="muted">
                <a href={`${internalBase}/`} target="_blank" rel="noreferrer">
                  Open Internal Estimate Head
                </a>
              </p>
            </div>
          ) : null}

          <section className="card">
            <div className="card-head">
              <h2>Search &amp; filters</h2>
              <span className="card-meta">
                {activeFilterCount ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}` : "No filters applied"}
              </span>
            </div>
            <div className="filter-grid">
              <label className="search-span search-prominent">
                Global search
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Customer, project, quote #, city, rep…"
                />
              </label>
              <label>
                Account
                <input value={accountQ} onChange={(e) => setAccountQ(e.target.value)} placeholder="Account / name" />
              </label>
              <label>
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_FILTER_VALUES.map((s) => (
                    <option key={s || "any"} value={s}>
                      {statusFilterLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source
                <select value={quoteSource} onChange={(e) => setQuoteSource(e.target.value)}>
                  <option value="">Any source</option>
                  <option value="internal_quote">Internal estimate</option>
                  <option value="public_consumer">Public lead</option>
                  <option value="partner_portal">Partner quote</option>
                  <option value="partner_quote">Partner quote</option>
                </select>
              </label>
              <label>
                Branch
                <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Branch" />
              </label>
              <label>
                Sales rep
                <input value={salesRep} onChange={(e) => setSalesRep(e.target.value)} placeholder="Rep" />
              </label>
              <label>
                Created from
                <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} />
              </label>
              <label>
                Created to
                <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} />
              </label>
              <label>
                Handoff
                <select value={handoffStatus} onChange={(e) => setHandoffStatus(e.target.value)}>
                  <option value="">Any</option>
                  <option value="none">Not started</option>
                  <option value="in_progress">In progress</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Show archived
              </label>
              <label>
                Sort by
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="updated_at">Updated</option>
                  <option value="created_at">Created</option>
                  <option value="grand_total">Quote value</option>
                  <option value="account">Account</option>
                  <option value="quote_status">Status</option>
                  <option value="sales_rep">Sales rep</option>
                  <option value="branch">Branch</option>
                </select>
              </label>
              <label>
                Direction
                <select value={direction} onChange={(e) => setDirection(e.target.value as "asc" | "desc")}>
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>
              </label>
            </div>
            <div className="filter-toolbar">
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => {
                  setPageOffset(0);
                  setSelectedIds(new Set());
                  return tab === "by_account" ? void loadAccounts() : void loadRows();
                }}
              >
                Apply filters
              </button>
              <button type="button" className="btn ghost" disabled={activeFilterCount === 0} onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          </section>

          {tab === "by_account" ? (
            <section className="card">
              <div className="card-head">
                <h2>By account</h2>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>
                Account grouping uses quote header fields (account name when set, otherwise customer / project). Future identity resolution and
                sales account mapping will refine this.
              </p>
              <div className="account-grid">
                {accountGroups.map((g) => (
                  <div key={str(g.account_key)} className="account-card">
                    <h3>{str(g.account_key)}</h3>
                    <div className="stats">
                      <div>{str(g.quote_count)} quotes</div>
                      <div>Open value {formatMoneyWhole(g.open_value)}</div>
                      <div>Newest quote {formatShortDate(g.last_quote_at)}</div>
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn secondary btn-xs"
                        onClick={() => {
                          setAccountQ(str(g.account_key));
                          setTab("all");
                        }}
                      >
                        Show quotes for this account
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="card">
              <div className="card-head">
                <h2>Quotes</h2>
                <span className="card-meta">{listCountLabel}</span>
              </div>
              <div className="list-toolbar">
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="btn ghost btn-xs"
                    disabled={busy || pageOffset <= 0}
                    onClick={() => setPageOffset(Math.max(0, pageOffset - pageSize))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn ghost btn-xs"
                    disabled={busy || !listMeta.has_more}
                    onClick={() => setPageOffset(pageOffset + pageSize)}
                  >
                    Next
                  </button>
                  <label className="page-size-control">
                    Page size
                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) || DEFAULT_PAGE_SIZE)}>
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {selectedCount ? (
                  <div className="batch-bar">
                    <strong>
                      {selectedCount} selected
                    </strong>
                    <button type="button" className="btn danger btn-xs" disabled={batchBusy} onClick={() => void archiveSelected()}>
                      Archive selected
                    </button>
                    <button type="button" className="btn ghost btn-xs" disabled={batchBusy} onClick={() => setSelectedIds(new Set())}>
                      Clear
                    </button>
                  </div>
                ) : (
                  <span className="muted">Select visible active quotes to archive them in bulk.</span>
                )}
              </div>
              {!busy && rows.length === 0 && tab === "internal" ? (
                <div className="empty-state">
                  <h3>No internal estimates yet</h3>
                  <p>Create one from the eliteOS Internal Estimate Head.</p>
                  <a className="btn primary" href={`${internalBase}/`} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "inline-block", marginTop: 8 }}>
                    Open Internal Estimate Head
                  </a>
                </div>
              ) : !busy && rows.length === 0 ? (
                <div className="empty-state">
                  <h3>No quotes match these filters</h3>
                  <p>Clear filters or widen search to see more results.</p>
                  <button type="button" className="btn secondary" onClick={clearFilters}>
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="ql-table data">
                    <thead>
                      <tr>
                        <th className="col-select">
                          <input
                            type="checkbox"
                            aria-label="Select all visible quotes"
                            checked={allVisibleSelected}
                            data-partial={visibleSelectionIsPartial ? "true" : "false"}
                            disabled={!selectableIds.length}
                            onChange={(e) => toggleSelectVisible(e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </th>
                        <th className="col-num">Quote #</th>
                        <th>Account</th>
                        <th className="hide-sm">Project</th>
                        <th className="hide-sm">Location</th>
                        <th>Source</th>
                        <th>Status</th>
                        <th className="hide-md">Sales rep</th>
                        <th className="hide-md">Branch</th>
                        <th className="col-total">Total</th>
                        <th className="hide-sm">Sq ft</th>
                        <th>Updated</th>
                        <th className="hide-md">Handoff</th>
                        <th className="col-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const ac = displayAccountColumn(r);
                        const handoffLabel = labelHandoffRollup(r.handoff_status, r.moraware_doc_status, r.quickbooks_doc_status);
                        const rowId = str(r.id);
                        const selectable = canBatchArchiveRow(r);
                        return (
                          <tr key={rowId} className="clickable" onClick={() => setDetailId(rowId)}>
                            <td className="col-select">
                              <input
                                type="checkbox"
                                aria-label={`Select quote ${str(r.quote_number_revision_summary || r.quote_number) || rowId}`}
                                checked={selectedIds.has(rowId)}
                                disabled={!selectable}
                                title={selectable ? "Select for batch archive" : "Archived or sold quotes are not available for batch archive"}
                                onChange={(e) => toggleSelectedId(rowId, e.target.checked)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td className="col-num">
                              <span className="quote-num">{str(r.quote_number_revision_summary || r.quote_number)}</span>
                            </td>
                            <td className="account-cell">
                              <div className="primary">{ac.primary}</div>
                              {ac.subline ? <div className="sub">Customer: {ac.subline}</div> : null}
                            </td>
                            <td className="hide-sm">{ac.projectCell || "—"}</td>
                            <td className="hide-sm muted">{loc(r)}</td>
                            <td>
                              <span className="pill pill-source">{labelQuoteSource(r.quote_source)}</span>
                            </td>
                            <td>
                              <span className={statusPillClass(r.quote_status)}>{labelQuoteStatus(r.quote_status)}</span>
                            </td>
                            <td className="hide-md">{str(r.sales_rep) || "—"}</td>
                            <td className="hide-md">{str(r.branch) || "—"}</td>
                            <td className="col-total">{formatMoneyWhole(r.grand_total)}</td>
                            <td className="hide-sm">{formatSqft(r.estimated_sqft)}</td>
                            <td>{formatShortDate(r.updated_at)}</td>
                            <td className="hide-md muted" style={{ maxWidth: 140 }}>
                              {handoffLabel}
                            </td>
                            <td className="col-actions">
                              <button
                                type="button"
                                className="btn secondary btn-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailId(str(r.id));
                                }}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      ) : null}

      {detailId && detail ? (
        <>
          <div role="presentation" className="drawer-backdrop" onClick={() => setDetailId(null)} />
          <aside className="drawer">
            <div className="drawer-inner">
              <div className="drawer-top">
                <div>
                  <h2>Quote {str(header.quote_number)}</h2>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    {str(header.quote_status_display || labelQuoteStatus(header.quote_status))} · {labelQuoteSource(header.quote_source)}
                  </p>
                </div>
                <button type="button" className="btn ghost btn-xs" onClick={() => setDetailId(null)}>
                  Close
                </button>
              </div>
              {(Array.isArray(detail.warnings) ? detail.warnings : []).length ? (
                <div className="warn">
                  {(detail.warnings as string[]).map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>
              ) : null}

              <div className="drawer-section">
                <h3>Quote summary</h3>
                <dl className="summary-dl">
                  <dt>Quote #</dt>
                  <dd>
                    <span className="quote-num">{str(header.quote_number)}</span>
                  </dd>
                  <dt>Account</dt>
                  <dd>{str(header.account_name) || "—"}</dd>
                  <dt>Customer</dt>
                  <dd>{str(header.customer_name) || "—"}</dd>
                  <dt>Project</dt>
                  <dd>{str(header.project_name) || "—"}</dd>
                  <dt>Location</dt>
                  <dd>{[str(header.project_address), loc(header)].filter((x) => x && x !== "—").join(" · ") || "—"}</dd>
                  <dt>Total</dt>
                  <dd>{formatMoneyStandard(header.grand_total)}</dd>
                  <dt>Sq ft</dt>
                  <dd>{formatSqft(header.estimated_sqft)}</dd>
                  <dt>Created</dt>
                  <dd>{formatShortDate(header.created_at)}</dd>
                  <dt>Updated</dt>
                  <dd>{formatShortDate(header.updated_at)}</dd>
                </dl>
              </div>

              {str(header.quote_source) === "internal_quote" ? (
                <div className="drawer-section">
                  <h3>Revision history</h3>
                  {revisions.length ? (
                    <table className="print-table" style={{ marginTop: 8 }}>
                      <thead>
                        <tr>
                          <th>Revision</th>
                          <th>Total</th>
                          <th>Updated</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {revisions.map((rev) => {
                          const revId = str(rev.id);
                          const isLatest = rev.is_current_revision === true;
                          const isViewing = revId === detailId;
                          return (
                            <tr key={revId}>
                              <td>
                                <strong>{str(rev.revision_label) || "R?"}</strong>
                                {isLatest ? (
                                  <span className="pill pill-live" style={{ marginLeft: 6 }}>
                                    latest
                                  </span>
                                ) : null}
                                {isViewing ? (
                                  <span className="muted small" style={{ display: "block" }}>
                                    viewing
                                  </span>
                                ) : null}
                                <span className="muted small" style={{ display: "block" }}>
                                  {str(rev.quote_number)}
                                </span>
                              </td>
                              <td>{formatMoneyStandard(rev.grand_total)}</td>
                              <td>{formatShortDate(rev.updated_at)}</td>
                              <td style={{ whiteSpace: "nowrap" }}>
                                {!isViewing ? (
                                  <button type="button" className="btn ghost btn-xs" onClick={() => setDetailId(revId)}>
                                    View
                                  </button>
                                ) : null}{" "}
                                <button
                                  type="button"
                                  className="btn ghost btn-xs"
                                  onClick={() =>
                                    window.open(
                                      `${internalBase}/?quoteId=${encodeURIComponent(revId)}`,
                                      "_blank",
                                      "noopener,noreferrer"
                                    )
                                  }
                                >
                                  Open IE
                                </button>
                                {!isLatest ? (
                                  <>
                                    {" "}
                                    <button
                                      type="button"
                                      className="btn ghost btn-xs"
                                      onClick={() => {
                                        if (
                                          !window.confirm(
                                            `Restore ${str(rev.revision_label) || "this revision"} as a new latest revision? Prior revisions stay in history.`
                                          )
                                        ) {
                                          return;
                                        }
                                        void runAction("Restore revision", async () => {
                                          const res = (await apiPost(
                                            `/api/quote-library/quotes/${revId}/restore-as-revision`,
                                            sessionToken!,
                                            {}
                                          )) as Record<string, unknown>;
                                          const newId = str(res.quoteId ?? res.quote_id);
                                          const qn = str(res.quote_number);
                                          if (newId) setDetailId(newId);
                                          return qn
                                            ? `New latest revision ${qn} created from ${str(rev.revision_label) || "snapshot"}.`
                                            : "New latest revision created.";
                                        });
                                      }}
                                    >
                                      Restore
                                    </button>
                                  </>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="muted small">No revision rows found for this quote family.</p>
                  )}
                  <p className="muted small" style={{ marginTop: 8 }}>
                    Use <strong>Save revision</strong> in Internal Estimate to freeze the current snapshot and start a new revision (R2, R3…).
                    <strong> Update quote</strong> edits the latest revision in place.
                  </p>
                </div>
              ) : null}

              <div className="drawer-section">
                <h3>Workflow</h3>
                <div className="workflow-grid">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() =>
                      void runAction("Sent", async () => {
                        await apiPatch(`/api/quote-library/quotes/${detailId}/status`, sessionToken!, { status: "sent" });
                      })
                    }
                  >
                    Mark sent
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Mark this quote as sold? After selling, generate Moraware and QuickBooks entry docs from this panel (no automatic writeback to Moraware or QuickBooks)."
                        )
                      ) {
                        return;
                      }
                      void runAction("Sold", async () => {
                        await apiPost(`/api/quote-library/quotes/${detailId}/mark-sold`, sessionToken!, {});
                        return "Marked sold. Next: generate Moraware Entry Doc, then QuickBooks Entry Doc, when ready.";
                      });
                    }}
                  >
                    Mark sold
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      if (!window.confirm("Mark this quote as lost?")) return;
                      void runAction("Lost", async () => {
                        await apiPatch(`/api/quote-library/quotes/${detailId}/status`, sessionToken!, { status: "lost" });
                      });
                    }}
                  >
                    Mark lost
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      if (!window.confirm("Soft-archive this quote? It will be hidden from default totals until Show archived is enabled.")) {
                        return;
                      }
                      void runAction("Archived", async () => {
                        await apiPost(`/api/quote-library/quotes/${detailId}/archive`, sessionToken!, {
                          confirm: true
                        });
                      });
                    }}
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      if (!window.confirm("Create a duplicate quote from this record?")) return;
                      void runAction("Duplicate", async () => {
                        const res = (await apiPost(`/api/quote-library/quotes/${detailId}/duplicate`, sessionToken!)) as Record<string, unknown>;
                        const qn = str(res.quote_number);
                        const qid = str(res.quoteId);
                        return qn ? `Duplicate created: ${qn}${qid ? ` (ID ${qid})` : ""}` : "Duplicate created.";
                      });
                    }}
                  >
                    Duplicate quote
                  </button>
                  <a
                    className="btn secondary"
                    href={`${internalBase}?quoteId=${encodeURIComponent(
                      (() => {
                        const flagged = revisions.find((r) => r.is_current_revision === true);
                        if (flagged?.id) return str(flagged.id);
                        const byNumber = revisions.reduce<Record<string, unknown> | null>((best, r) => {
                          if (!best) return r;
                          const bn = Number(best.revision_number) || 0;
                          const rn = Number(r.revision_number) || 0;
                          return rn >= bn ? r : best;
                        }, null);
                        return str(byNumber?.id || header.id || detailId);
                      })()
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open latest in Internal Estimate
                  </a>
                  {mondayUrl ? (
                    <a className="btn secondary" href={mondayUrl} target="_blank" rel="noreferrer">
                      Open Monday item
                    </a>
                  ) : null}
                </div>
                <p className="muted" style={{ marginTop: 12, fontSize: "0.8125rem" }}>
                  Open in Internal Estimate loads the full saved snapshot for the selected revision. Use <strong>Save revision</strong> to
                  add R2/R3 without losing prior snapshots; <strong>Restore</strong> copies an older revision forward as a new latest revision.
                </p>
                <div className="workflow-hint">
                  <strong>After Mark sold:</strong> use <em>Generate Moraware Entry Doc</em> and <em>Generate QuickBooks Entry Doc</em> below.
                  Documents are stored for staff review only.
                </div>
              </div>

              <div className="drawer-section">
                <h3>Handoff documents</h3>
                <p className="muted" style={{ marginTop: 0 }}>
                  Moraware: {labelHandoffDocStatus(latestHandoffDoc(detail, "moraware_entry")?.status)} · QuickBooks:{" "}
                  {labelHandoffDocStatus(latestHandoffDoc(detail, "quickbooks_entry")?.status)}
                </p>
                <div className="workflow-grid">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() =>
                      void runAction("Moraware doc", async () => {
                        await apiPost(`/api/quote-library/quotes/${detailId}/generate-moraware-entry-doc`, sessionToken!);
                        return "Moraware Entry Doc generated — review payload below.";
                      })
                    }
                  >
                    Generate Moraware entry doc
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() =>
                      void runAction("QuickBooks doc", async () => {
                        await apiPost(`/api/quote-library/quotes/${detailId}/generate-quickbooks-entry-doc`, sessionToken!);
                        return "QuickBooks Entry Doc generated — review payload below.";
                      })
                    }
                  >
                    Generate QuickBooks entry doc
                  </button>
                </div>
                {(Array.isArray(detail.handoff_documents) ? detail.handoff_documents : []).map((h: unknown, i: number) => (
                  <HandoffDocBlock key={i} doc={h as Record<string, unknown>} />
                ))}
              </div>

              <div className="drawer-section">
                <h3>Measurements &amp; estimate</h3>
                <p className="muted">{str(snap.inputSummary) || "No measurement summary on snapshot."}</p>
                <p className="muted">
                  Material / pricing: {str((iu as { internal_material_basis?: string }).internal_material_basis) || "—"}
                  {iu.sinks || iu.cooktops || iu.cutouts ? (
                    <>
                      {" "}
                      · Sinks/cooktops/cutouts: {[str(iu.sinks), str(iu.cooktops), str(iu.cutouts)].filter(Boolean).join(" · ") || "—"}
                    </>
                  ) : null}
                </p>
                <p className="muted">
                  Add-ons / custom:{" "}
                  {Array.isArray(iu.custom_passthrough_items) && (iu.custom_passthrough_items as unknown[]).length
                    ? `${(iu.custom_passthrough_items as unknown[]).length} passthrough item(s)`
                    : "—"}
                  {Array.isArray(iu.custom_line_items) && (iu.custom_line_items as unknown[]).length ? (
                    <>
                      {" "}
                      · Structured custom lines: {(iu.custom_line_items as unknown[]).length}
                    </>
                  ) : null}
                </p>
                {Array.isArray(snap.material_breakdown) && (snap.material_breakdown as unknown[]).length ? (
                  <div style={{ marginTop: 10 }}>
                    <h4 className="h3" style={{ margin: "0 0 6px" }}>
                      Material / color breakdown
                    </h4>
                    <ul className="muted" style={{ fontSize: "0.8125rem", paddingLeft: 18, margin: 0 }}>
                      {(snap.material_breakdown as Record<string, unknown>[]).slice(0, 24).map((ln, idx) => (
                        <li key={idx}>
                          {str(ln.room)} — {str(ln.piece)} · {str(ln.materialGroup)}
                          {ln.materialColor ? ` · ${str(ln.materialColor)}` : ""} — {Number(ln.sqft ?? 0).toLocaleString()} sf · $
                          {Number(ln.wholesaleSubtotal ?? 0).toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="muted">
                  Rooms: {(detail.rooms as unknown[] | undefined)?.length ?? 0} · Line items: {(detail.line_items as unknown[] | undefined)?.length ?? 0}
                </p>
                {Array.isArray(detail.rooms) && (detail.rooms as Record<string, unknown>[]).length ? (
                  <ul className="muted" style={{ fontSize: "0.8125rem", paddingLeft: 18 }}>
                    {(detail.rooms as Record<string, unknown>[]).slice(0, 12).map((room, idx) => (
                      <li key={idx}>
                        {str(room.room_name) || "Room"} — countertop {formatSqft(room.countertop_sqft)}
                        {room.backsplash_sqft != null && Number(room.backsplash_sqft) > 0 ? ` · backsplash ${Number(room.backsplash_sqft).toLocaleString()} sf` : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="drawer-section">
                <h3>Timeline &amp; activity</h3>
                <ul className="timeline">
                  <li>
                    <div className="tl-time">{formatDateTime(header.created_at)}</div>
                    Quote created
                  </li>
                  {(Array.isArray(detail.status_timeline) ? detail.status_timeline : []).slice(0, 50).map((ev: unknown, i: number) => {
                    const e = ev as Record<string, unknown>;
                    const { time, body } = formatTimelineEntry(e);
                    return (
                      <li key={i}>
                        <div className="tl-time">{time}</div>
                        {body}
                      </li>
                    );
                  })}
                  {(Array.isArray(detail.forecast_events) ? detail.forecast_events : []).slice(0, 15).map((ev: unknown, i: number) => {
                    const e = ev as Record<string, unknown>;
                    return (
                      <li key={`f-${i}`}>
                        <div className="tl-time">{formatDateTime(e.event_at)}</div>
                        Forecast: {str(e.event_type)}
                        {e.quote_value != null ? ` · Value ${formatMoneyWhole(e.quote_value)}` : null}
                      </li>
                    );
                  })}
                  {detail.lead_assignment && typeof detail.lead_assignment === "object" ? (
                    <li>
                      <div className="tl-time">{formatDateTime((detail.lead_assignment as Record<string, unknown>).created_at)}</div>
                      Lead routing: {str((detail.lead_assignment as Record<string, unknown>).assignment_source)} →{" "}
                      {str((detail.lead_assignment as Record<string, unknown>).assigned_sales_rep) || "—"}
                    </li>
                  ) : null}
                  {(Array.isArray(detail.monday_sync_log) ? detail.monday_sync_log : []).slice(0, 12).map((ev: unknown, i: number) => {
                    const e = ev as Record<string, unknown>;
                    return (
                      <li key={`m-${i}`}>
                        <div className="tl-time">{formatDateTime(e.created_at)}</div>
                        Monday: {str(e.action)} — {str(e.status)}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="drawer-section debug-accordion">
                <button type="button" className="btn ghost btn-xs" onClick={() => setShowRaw((s) => !s)}>
                  {showRaw ? "Hide" : "Show"} admin / debug — raw calculation snapshot
                </button>
                {showRaw ? <pre>{JSON.stringify(detail.calculation_snapshot ?? {}, null, 2)}</pre> : null}
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
