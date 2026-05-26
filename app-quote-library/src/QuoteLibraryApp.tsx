import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Returns the customer-facing Estimated project total for display in Quote Library list rows
 * and the detail drawer. Uses the persisted `customer_display_total` (sum of rounded visible
 * customer Estimate Summary rows, matching the customer PDF) when available on the saved quote.
 * Falls back to `grand_total` (exact backend calculation total) for older quotes saved before
 * this field was introduced — no crashes, no mass-mutation of old records.
 */
function pickDisplayTotal(r: Record<string, unknown>): number {
  const cdt = Number(r.customer_display_total);
  if (Number.isFinite(cdt) && cdt > 0) return cdt;
  return Number(r.grand_total) || 0;
}

/**
 * Brand architecture (see docs/eliteos/eliteos-ui-direction.md §2.1).
 *
 * The Quote Library is a single-tenant operational head right now — it does not
 * call `/api/me` and has no access to `organization_*` payload fields. We mirror
 * the Home Launcher's `DEFAULT_WORKSPACE_*` constants so that the workspace
 * identity panel in the hero matches the platform pattern, and so that future
 * iterations (which may receive `organization_logo_url` from the backend) can
 * extend `resolveWorkspaceLogoUrl` without churning the UI.
 *
 * Resolution order (per design doc):
 *   1. me.user.organization_logo_url       — not in scope here yet
 *   2. headsPayload.user.organization_logo_url — not in scope here yet
 *   3. Local Elite Stone Fabrication asset (EOS_LOGO_URL)
 *   4. Initials in a gradient text frame
 */
const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const DEFAULT_WORKSPACE_SHORT = "ESF";

function resolveWorkspaceName(): string {
  return DEFAULT_WORKSPACE_NAME;
}

function resolveWorkspaceShortId(): string {
  return DEFAULT_WORKSPACE_SHORT;
}

function resolveWorkspaceLogoUrl(): string | null {
  return EOS_LOGO_URL || null;
}

function workspaceInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "ES"
  );
}

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

function handoffPillClass(status: unknown): string {
  const s = str(status).toLowerCase();
  if (s === "generated" || s === "reviewed" || s === "completed") return "pill pill-status-won";
  if (s === "voided") return "pill pill-status-lost";
  if (s === "draft") return "pill pill-status-active";
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
  return (
    <div className="handoff-card">
      <div className="handoff-card-head">
        <h4>{title}</h4>
        <span className={handoffPillClass(doc.status)}>{labelHandoffDocStatus(doc.status)}</span>
      </div>
      <p className="handoff-card-meta">Generated {formatDateTime(doc.generated_at)}</p>
      {warnings.length ? (
        <div className="banner banner-warn" style={{ marginTop: 10 }}>
          {warnings.map((w, i) => (
            <div key={i}>{str(w)}</div>
          ))}
        </div>
      ) : null}
      <details>
        <summary className="handoff-card-summary">Review payload</summary>
        <div className="payload-preview">{JSON.stringify(payload, null, 2)}</div>
      </details>
    </div>
  );
}

function internalEstimateUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_INTERNAL_ESTIMATE ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://internal.eliteosfab.com";
}

/**
 * eliteOS Home / Launcher canonical URL. Used by the user menu's "Open Home"
 * action. Configurable via `VITE_HEAD_URL_HOME` for staging / local dev;
 * defaults to the production launcher domain documented in
 * `docs/eliteos/CURRENT_SYSTEM_MAP.md`.
 */
function homeLauncherUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_HOME ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}

/**
 * Derive a friendly display name from an email address (everything before `@`,
 * with separators turned into spaces and word casing applied). Falls back to
 * the email itself when no `@` is present.
 *
 * No backend call is required — this works off the client-side Supabase
 * session.user.email value.
 */
function deriveDisplayNameFromEmail(email: string): string {
  const e = String(email || "").trim();
  if (!e) return "";
  const local = e.includes("@") ? e.split("@")[0] : e;
  const words = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return e;
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function userInitialsFor(name: string, email: string): string {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const e = String(email || "").trim();
  if (e) {
    const local = e.includes("@") ? e.split("@")[0] : e;
    const parts = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }
  return "ES";
}

export default function QuoteLibraryApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  /**
   * Email + id come straight from the Supabase session.user object
   * (already kept up to date by `onAuthStateChange`). We never make a new
   * `/api/me` call from this head — the chip identity is purely client-side.
   * Role is intentionally NOT surfaced here because we have no role claim in
   * scope without a backend call; the user menu hides any role-gated link
   * (e.g. System Admin) for the same reason.
   */
  const [userEmail, setUserEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [userMetaName, setUserMetaName] = useState<string>("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
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
  const homeBase = useMemo(() => homeLauncherUrl(), []);

  const workspaceName = useMemo(() => resolveWorkspaceName(), []);
  const workspaceShortId = useMemo(() => resolveWorkspaceShortId(), []);
  const workspaceLogoUrl = useMemo(() => resolveWorkspaceLogoUrl(), []);
  const workspaceInitialsValue = useMemo(() => workspaceInitials(workspaceName), [workspaceName]);

  /**
   * Display values for the topbar user chip. Resolved entirely client-side
   * from `session.user` — no `/api/me` call is added in this pass.
   */
  const userDisplayName = useMemo(
    () => userMetaName || deriveDisplayNameFromEmail(userEmail) || "Signed in",
    [userMetaName, userEmail]
  );
  const userDisplayEmail = useMemo(() => userEmail, [userEmail]);
  const userDisplayInitials = useMemo(
    () => userInitialsFor(userMetaName, userEmail),
    [userMetaName, userEmail]
  );

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
    setUserEmail("");
    setUserId("");
    setUserMetaName("");
    setUserMenuOpen(false);
  }, [supabase]);

  /**
   * Restore JWT (and basic user identity) from shared cookie storage. Same
   * pattern as Internal Estimate / Home, but we also pluck `email` / `id` /
   * `user_metadata.full_name` from the local session object so the topbar
   * user chip can render without any new backend call.
   */
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const applySession = (sess: { access_token?: string; user?: { id?: string; email?: string | null; user_metadata?: Record<string, unknown> } | null } | null) => {
      if (!alive) return;
      const tok = sess?.access_token ?? "";
      setSessionToken(tok || null);
      const u = sess?.user || null;
      setUserEmail(String(u?.email ?? ""));
      setUserId(String(u?.id ?? ""));
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const metaName = [meta.full_name, meta.name, meta.display_name]
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .find((v) => Boolean(v)) || "";
      setUserMetaName(metaName);
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => applySession(sess));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  /** Close the user menu on outside click / Escape. */
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

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

  /**
   * `Refresh data` action surfaced from the user menu. Re-runs the existing
   * data fetches (metrics + active list + detail/revisions if open) — no new
   * API endpoints are added, only existing ones are re-invoked.
   */
  const handleMenuRefresh = useCallback(async () => {
    if (!sessionToken || refreshBusy) return;
    setRefreshBusy(true);
    setUserMenuOpen(false);
    try {
      await refreshListAndDetail();
    } finally {
      setRefreshBusy(false);
    }
  }, [refreshBusy, refreshListAndDetail, sessionToken]);

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

  const drawerAccount = displayAccountColumn(header);
  const drawerIsInternal = str(header.quote_source) === "internal_quote";
  const drawerWarnings = (Array.isArray(detail?.warnings) ? (detail!.warnings as unknown[]) : []).filter(
    (w): w is string => typeof w === "string"
  );
  const moraDoc = detail ? latestHandoffDoc(detail, "moraware_entry") : undefined;
  const qbDoc = detail ? latestHandoffDoc(detail, "quickbooks_entry") : undefined;
  const handoffDocs = (Array.isArray(detail?.handoff_documents)
    ? (detail!.handoff_documents as unknown[])
    : []) as Record<string, unknown>[];

  /**
   * Resolve the id of the latest revision in this quote family for "Open latest in
   * Internal Estimate". Existing semantics preserved: prefer the row flagged
   * `is_current_revision === true`, otherwise pick the highest revision_number,
   * otherwise fall back to header.id, otherwise detailId.
   */
  const latestRevId = (() => {
    const flagged = revisions.find((r) => r.is_current_revision === true);
    if (flagged?.id) return str(flagged.id);
    const byNumber = revisions.reduce<Record<string, unknown> | null>((best, r) => {
      if (!best) return r;
      const bn = Number(best.revision_number) || 0;
      const rn = Number(r.revision_number) || 0;
      return rn >= bn ? r : best;
    }, null);
    return str(byNumber?.id || header.id || detailId || "");
  })();

  return (
    <div className="shell">
      <header className="topbar" role="banner">
        <a
          href="/"
          className="brand-row brand-row-link"
          aria-label={`eliteOS Quote Library — ${workspaceName}`}
        >
          <span className="brand-mark" aria-hidden>
            <img src={workspaceLogoUrl ?? EOS_LOGO_URL} alt="" />
          </span>
          <span className="brand-text">
            <span className="brand-wordmark">eliteOS</span>
            <span className="brand-sub">Quote Library · {workspaceName}</span>
          </span>
        </a>
        <div className="topbar-actions">
          {sessionToken ? (
            <div
              className="topbar-account-wrap"
              ref={userMenuRef}
            >
              <button
                type="button"
                className={`topbar-account${userMenuOpen ? " is-open" : ""}`}
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                <span className="topbar-avatar" aria-hidden>
                  {userDisplayInitials}
                </span>
                <span className="topbar-account-text">
                  <span className="topbar-account-name">{userDisplayName}</span>
                  {userDisplayEmail && userDisplayEmail.toLowerCase() !== userDisplayName.toLowerCase() ? (
                    <span className="topbar-account-role">{userDisplayEmail}</span>
                  ) : null}
                </span>
                <span className="topbar-account-caret" aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
              {userMenuOpen ? (
                <div className="user-menu" role="menu" aria-label="Account menu">
                  <div className="user-menu-header">
                    <p className="user-menu-name">{userDisplayName}</p>
                    {userDisplayEmail ? <p className="user-menu-email">{userDisplayEmail}</p> : null}
                    <p className="user-menu-workspace">
                      <span>Workspace ·</span>{" "}
                      <strong>{workspaceName}</strong>
                      <span className="user-menu-sep" aria-hidden>·</span>
                      <span>on slabOS</span>
                    </p>
                  </div>
                  <div className="user-menu-list">
                    <a
                      href={homeBase}
                      className="user-menu-item"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <span className="user-menu-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 11.5L12 4l9 7.5" />
                          <path d="M5 10v10h14V10" />
                          <path d="M10 20v-6h4v6" />
                        </svg>
                      </span>
                      <span className="user-menu-label">
                        <span>Open Home</span>
                        <span className="user-menu-meta">eliteOS Launcher</span>
                      </span>
                      <span className="user-menu-shortcut" aria-hidden>↗</span>
                    </a>
                    <button
                      type="button"
                      className="user-menu-item"
                      role="menuitem"
                      onClick={() => void handleMenuRefresh()}
                      disabled={refreshBusy || busy}
                    >
                      <span className="user-menu-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 1 1-3-6.7" />
                          <path d="M21 4v5h-5" />
                        </svg>
                      </span>
                      <span className="user-menu-label">
                        <span>{refreshBusy ? "Refreshing data…" : "Refresh data"}</span>
                        <span className="user-menu-meta">Metrics, list, and open quote</span>
                      </span>
                    </button>
                    <a
                      href={`${homeBase}?view=profile`}
                      className="user-menu-item"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      title="Profile & preferences"
                    >
                      <span className="user-menu-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="8" r="3.5" />
                          <path d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5" />
                        </svg>
                      </span>
                      <span className="user-menu-label">
                        <span>Profile &amp; preferences</span>
                        <span className="user-menu-meta">eliteOS Home</span>
                      </span>
                    </a>
                  </div>
                  <div className="user-menu-footer">
                    <button
                      type="button"
                      className="user-menu-item user-menu-signout"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        void signOut();
                      }}
                    >
                      <span className="user-menu-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                      </span>
                      <span className="user-menu-label">Sign out</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <main className="main" role="main">
        {!supabase ? (
          <div className="banner banner-warn" role="alert">
            <strong>Supabase is not configured.</strong>{" "}
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to sign in.
          </div>
        ) : null}

        {!sessionToken ? (
          <section className="auth-panel auth-panel-standalone" aria-label="Sign in">
            <header className="auth-panel-header">
              <p className="auth-panel-eyebrow">Quote Library · Elite Stone Fabrication</p>
              <h2 className="auth-panel-title">Sign in to continue</h2>
              <p className="auth-panel-sub">
                Use your eliteOS staff account. The Home Launcher signs you in across every head — this page is for direct access.
              </p>
            </header>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="ql-email">Email</label>
                <input
                  id="ql-email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoComplete="username"
                  placeholder="you@example.com"
                />
              </div>
              <div className="field">
                <label htmlFor="ql-password">Password</label>
                <input
                  id="ql-password"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
            {authError ? (
              <div className="banner banner-error" role="alert" style={{ marginTop: 8 }}>
                {authError}
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              disabled={authBusy}
              onClick={() => void signIn()}
            >
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
            <p className="muted-note auth-trust">
              Authenticated through Supabase. No service-role keys are used in the browser.
            </p>
          </section>
        ) : null}

        {sessionToken ? (
          <>
          <section className="ql-hero" aria-labelledby="ql-hero-title">
            <div className="hero-aurora" aria-hidden />
            <div className="ql-hero-grid">
              <div className="ql-hero-main">
                <p className="hero-eyebrow">Internal tool · Quote Library</p>
                <h1 id="ql-hero-title" className="hero-title">Quote command center</h1>
                <p className="hero-sub">
                  Account-centered search, status workflow, revisions, and sold-job handoff for every quote in eliteOS.
                </p>
                <p className="hero-domain muted-note">
                  <span>Domain ·</span>{" "}
                  <code className="hero-domain-code">quotes.eliteosfab.com</code>
                  <span className="hero-domain-sep" aria-hidden>·</span>
                  <span>separate from the public tool at</span>{" "}
                  <code className="hero-domain-code">quote.eliteosfab.com</code>
                </p>
              </div>

              <aside
                className="hero-workspace"
                aria-label={`Workspace · ${workspaceName}`}
              >
                <p className="hero-workspace-eyebrow">Workspace</p>
                <div className="hero-workspace-card">
                  <div className="hero-workspace-mark">
                    {workspaceLogoUrl ? (
                      <img
                        src={workspaceLogoUrl}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                          const fallback = (e.currentTarget.parentElement as HTMLElement | null)?.querySelector(
                            ".hero-workspace-initials"
                          ) as HTMLElement | null;
                          if (fallback) fallback.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <span
                      className="hero-workspace-initials"
                      aria-hidden={workspaceLogoUrl ? "true" : "false"}
                      style={workspaceLogoUrl ? { display: "none" } : undefined}
                    >
                      {workspaceInitialsValue}
                    </span>
                  </div>
                  <div className="hero-workspace-text">
                    <p className="hero-workspace-name">{workspaceName}</p>
                    <p className="hero-workspace-meta">
                      <span>on </span>
                      <span className="hero-workspace-platform">slabOS</span>
                      <span className="hero-workspace-sep" aria-hidden>·</span>
                      <span>{workspaceShortId}</span>
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          {msg ? <div className="banner banner-info" role="status">{msg}</div> : null}
          {err ? <div className="banner banner-error" role="alert">{err}</div> : null}

          <div className="metrics" role="list" aria-label="Quote library metrics">
            {metricCards.map((c) => {
              const isEmpty = c.val === "—" || c.val === "$0" || c.val === "0";
              return (
                <div
                  key={c.key}
                  className={`metric${isEmpty ? " metric-zero" : ""}`}
                  role="listitem"
                >
                  <div className="val">{c.val}</div>
                  <div className="lbl">{c.label}</div>
                </div>
              );
            })}
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
              {busy && rows.length === 0 ? (
                <div className="ql-skeleton" aria-hidden>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="ql-skeleton-row">
                      <div className="skel skel-chip" />
                      <div className="skel skel-line skel-line-strong" />
                      <div className="skel skel-line" />
                      <div className="skel skel-pill" />
                      <div className="skel skel-pill" />
                      <div className="skel skel-line skel-line-short" />
                      <div className="skel skel-line skel-line-short" />
                    </div>
                  ))}
                </div>
              ) : !busy && rows.length === 0 && tab === "internal" ? (
                <div className="empty-state">
                  <div className="empty-glyph" aria-hidden>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 4h11a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2Z" />
                      <path d="M9 8h6" />
                      <path d="M9 12h4" />
                    </svg>
                  </div>
                  <h3>No internal estimates yet</h3>
                  <p>Create one from the eliteOS Internal Estimate Head.</p>
                  <a
                    className="btn btn-primary"
                    href={`${internalBase}/`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "none", marginTop: 12 }}
                  >
                    Open Internal Estimate Head
                  </a>
                </div>
              ) : !busy && rows.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-glyph" aria-hidden>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.3-4.3" />
                    </svg>
                  </div>
                  <h3>No quotes match these filters</h3>
                  <p>Clear filters or widen search to see more results.</p>
                  <button type="button" className="btn secondary" onClick={clearFilters} style={{ marginTop: 12 }}>
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
                            <td className="col-total">{formatMoneyWhole(pickDisplayTotal(r as Record<string, unknown>))}</td>
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
      </main>

      {detailId && detail ? (
        <>
          <div role="presentation" className="drawer-backdrop" onClick={() => setDetailId(null)} />
          <aside className="drawer" aria-label={`Quote ${str(header.quote_number) || ""} detail`}>
            <header className="drawer-header">
              <div className="drawer-header-top">
                <p className="drawer-eyebrow">Quote</p>
                <button
                  type="button"
                  className="drawer-close"
                  aria-label="Close drawer"
                  onClick={() => setDetailId(null)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="drawer-id-row">
                <span className="quote-num quote-num-lg">{str(header.quote_number) || "—"}</span>
                <span className={statusPillClass(header.quote_status)}>
                  {str(header.quote_status_display) || labelQuoteStatus(header.quote_status)}
                </span>
                <span className="pill pill-source">{labelQuoteSource(header.quote_source)}</span>
              </div>
              <h2 className="drawer-title">{drawerAccount.primary || "—"}</h2>
              {drawerAccount.subline || drawerAccount.projectCell ? (
                <p className="drawer-subtitle">
                  {[drawerAccount.subline, drawerAccount.projectCell].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </header>

            <div className="drawer-body">
              {drawerWarnings.length ? (
                <div className="banner banner-warn" role="alert">
                  {drawerWarnings.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>
              ) : null}

              <section className="drawer-block" aria-labelledby="dwr-overview">
                <h3 id="dwr-overview" className="sr-only">Overview</h3>
                <div className="stat-grid">
                  <div className="stat-card stat-card-prominent">
                    <p className="stat-label">
                      {header.customer_display_total != null ? "Customer estimate total" : "Total"}
                    </p>
                    <p className="stat-value stat-value-lg">{formatMoneyStandard(pickDisplayTotal(header))}</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Sq ft</p>
                    <p className="stat-value">{formatSqft(header.estimated_sqft)}</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Created</p>
                    <p className="stat-value-sm">{formatShortDate(header.created_at)}</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Updated</p>
                    <p className="stat-value-sm">{formatShortDate(header.updated_at)}</p>
                  </div>
                </div>

                <dl className="drawer-meta-dl">
                  <div className="dl-row">
                    <dt>Account</dt>
                    <dd>{str(header.account_name) || "—"}</dd>
                  </div>
                  <div className="dl-row">
                    <dt>Customer</dt>
                    <dd>{str(header.customer_name) || "—"}</dd>
                  </div>
                  <div className="dl-row">
                    <dt>Project</dt>
                    <dd>{str(header.project_name) || "—"}</dd>
                  </div>
                  <div className="dl-row">
                    <dt>Location</dt>
                    <dd>{[str(header.project_address), loc(header)].filter((x) => x && x !== "—").join(" · ") || "—"}</dd>
                  </div>
                  {str(header.sales_rep) ? (
                    <div className="dl-row">
                      <dt>Sales rep</dt>
                      <dd>{str(header.sales_rep)}</dd>
                    </div>
                  ) : null}
                  {str(header.branch) ? (
                    <div className="dl-row">
                      <dt>Branch</dt>
                      <dd>{str(header.branch)}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              <section className="drawer-block">
                <h3>Workflow</h3>
                <a
                  href={`${internalBase}?quoteId=${encodeURIComponent(latestRevId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-block btn-with-icon"
                >
                  <span>Open latest in Internal Estimate</span>
                  <span className="btn-arrow" aria-hidden>↗</span>
                </a>

                <div className="workflow-group">
                  <p className="workflow-group-label">Update status</p>
                  <div className="workflow-row">
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
                      className="btn btn-status btn-status-sold"
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
                  </div>
                </div>

                <div className="workflow-group">
                  <p className="workflow-group-label">Manage</p>
                  <div className="workflow-row">
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
                    {mondayUrl ? (
                      <a className="btn secondary btn-with-icon" href={mondayUrl} target="_blank" rel="noreferrer">
                        <span>Open Monday item</span>
                        <span className="btn-arrow" aria-hidden>↗</span>
                      </a>
                    ) : null}
                  </div>
                </div>

                <details className="quiet-detail">
                  <summary>Workflow guidance</summary>
                  <p>
                    <strong>Open latest in Internal Estimate</strong> loads the full saved snapshot for the latest revision. Use{" "}
                    <strong>Save revision</strong> there to freeze the current state and start R2/R3; <strong>Update quote</strong> edits the latest
                    revision in place; <strong>Restore</strong> copies an older revision forward as a new latest.
                  </p>
                  <p>
                    <strong>After Mark sold,</strong> use <em>Generate Moraware doc</em> and <em>Generate QuickBooks doc</em> below. Documents are stored
                    for staff review only — there is no automatic writeback to Moraware or QuickBooks.
                  </p>
                </details>
              </section>

              {drawerIsInternal ? (
                <section className="drawer-block">
                  <h3>Revisions</h3>
                  {revisions.length ? (
                    <ul className="revision-list">
                      {revisions.map((rev) => {
                        const revId = str(rev.id);
                        const isLatest = rev.is_current_revision === true;
                        const isViewing = revId === detailId;
                        return (
                          <li
                            key={revId}
                            className={`revision-row${isLatest ? " is-latest" : ""}${isViewing ? " is-viewing" : ""}`}
                          >
                            <div className="revision-id">
                              <span className="revision-chip">{str(rev.revision_label) || "R?"}</span>
                              <div className="revision-id-badges">
                                {isLatest ? <span className="pill pill-live">Latest</span> : null}
                                {isViewing ? <span className="pill pill-status-active">Viewing</span> : null}
                              </div>
                            </div>
                            <div className="revision-meta">
                              <p className="revision-total">{formatMoneyStandard(rev.grand_total)}</p>
                              <p className="revision-meta-sub muted-note">
                                Updated {formatShortDate(rev.updated_at)}
                                {str(rev.quote_number) ? (
                                  <>
                                    {" · "}
                                    <code className="revision-qnum">{str(rev.quote_number)}</code>
                                  </>
                                ) : null}
                              </p>
                            </div>
                            <div className="revision-actions">
                              {!isViewing ? (
                                <button type="button" className="btn ghost btn-xs" onClick={() => setDetailId(revId)}>
                                  View
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn ghost btn-xs btn-with-icon"
                                onClick={() =>
                                  window.open(
                                    `${internalBase}/?quoteId=${encodeURIComponent(revId)}`,
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                              >
                                <span>Open IE</span>
                                <span className="btn-arrow" aria-hidden>↗</span>
                              </button>
                              {!isLatest ? (
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
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="muted-note">No revision rows found for this quote family.</p>
                  )}
                </section>
              ) : null}

              <section className="drawer-block">
                <h3>Handoff documents</h3>
                <p className="muted-note section-lede">
                  Generate handoff documents after Mark sold. Stored for staff review only — no automatic writeback to Moraware or QuickBooks.
                </p>
                <div className="handoff-grid">
                  <div className={`handoff-status-card${moraDoc ? "" : " is-empty"}`}>
                    <div className="handoff-status-head">
                      <p className="handoff-status-title">Moraware Entry Doc</p>
                      <span className={handoffPillClass(moraDoc?.status)}>{labelHandoffDocStatus(moraDoc?.status)}</span>
                    </div>
                    <p className="handoff-status-meta">
                      {moraDoc ? `Generated ${formatDateTime(moraDoc.generated_at)}` : "Not generated yet."}
                    </p>
                    <button
                      type="button"
                      className="btn secondary btn-block"
                      onClick={() =>
                        void runAction("Moraware doc", async () => {
                          await apiPost(`/api/quote-library/quotes/${detailId}/generate-moraware-entry-doc`, sessionToken!);
                          return "Moraware Entry Doc generated — review payload in document history.";
                        })
                      }
                    >
                      {moraDoc ? "Regenerate Moraware doc" : "Generate Moraware doc"}
                    </button>
                  </div>
                  <div className={`handoff-status-card${qbDoc ? "" : " is-empty"}`}>
                    <div className="handoff-status-head">
                      <p className="handoff-status-title">QuickBooks Entry Doc</p>
                      <span className={handoffPillClass(qbDoc?.status)}>{labelHandoffDocStatus(qbDoc?.status)}</span>
                    </div>
                    <p className="handoff-status-meta">
                      {qbDoc ? `Generated ${formatDateTime(qbDoc.generated_at)}` : "Not generated yet."}
                    </p>
                    <button
                      type="button"
                      className="btn secondary btn-block"
                      onClick={() =>
                        void runAction("QuickBooks doc", async () => {
                          await apiPost(`/api/quote-library/quotes/${detailId}/generate-quickbooks-entry-doc`, sessionToken!);
                          return "QuickBooks Entry Doc generated — review payload in document history.";
                        })
                      }
                    >
                      {qbDoc ? "Regenerate QuickBooks doc" : "Generate QuickBooks doc"}
                    </button>
                  </div>
                </div>
                {handoffDocs.length ? (
                  <details className="quiet-detail">
                    <summary>
                      Document history ({handoffDocs.length} {handoffDocs.length === 1 ? "document" : "documents"})
                    </summary>
                    <div className="handoff-doc-list">
                      {handoffDocs.map((h, i) => (
                        <HandoffDocBlock key={i} doc={h} />
                      ))}
                    </div>
                  </details>
                ) : null}
              </section>

              <section className="drawer-block">
                <h3>Measurements &amp; estimate</h3>
                <p className="drawer-summary-text">{str(snap.inputSummary) || "No measurement summary on snapshot."}</p>
                <dl className="drawer-meta-dl drawer-meta-dl-compact">
                  <div className="dl-row">
                    <dt>Material / pricing</dt>
                    <dd>{str((iu as { internal_material_basis?: string }).internal_material_basis) || "—"}</dd>
                  </div>
                  {iu.sinks || iu.cooktops || iu.cutouts ? (
                    <div className="dl-row">
                      <dt>Sinks · cooktops · cutouts</dt>
                      <dd>{[str(iu.sinks), str(iu.cooktops), str(iu.cutouts)].filter(Boolean).join(" · ") || "—"}</dd>
                    </div>
                  ) : null}
                  <div className="dl-row">
                    <dt>Rooms</dt>
                    <dd>{(detail.rooms as unknown[] | undefined)?.length ?? 0}</dd>
                  </div>
                  <div className="dl-row">
                    <dt>Line items</dt>
                    <dd>{(detail.line_items as unknown[] | undefined)?.length ?? 0}</dd>
                  </div>
                  {Array.isArray(iu.custom_passthrough_items) && (iu.custom_passthrough_items as unknown[]).length ? (
                    <div className="dl-row">
                      <dt>Passthrough items</dt>
                      <dd>{(iu.custom_passthrough_items as unknown[]).length}</dd>
                    </div>
                  ) : null}
                  {Array.isArray(iu.custom_line_items) && (iu.custom_line_items as unknown[]).length ? (
                    <div className="dl-row">
                      <dt>Custom line items</dt>
                      <dd>{(iu.custom_line_items as unknown[]).length}</dd>
                    </div>
                  ) : null}
                </dl>
                {Array.isArray(detail.rooms) && (detail.rooms as Record<string, unknown>[]).length ? (
                  <details className="quiet-detail">
                    <summary>Rooms ({(detail.rooms as unknown[]).length})</summary>
                    <ul className="drawer-line-list">
                      {(detail.rooms as Record<string, unknown>[]).slice(0, 12).map((room, idx) => (
                        <li key={idx}>
                          {str(room.room_name) || "Room"} — countertop {formatSqft(room.countertop_sqft)}
                          {room.backsplash_sqft != null && Number(room.backsplash_sqft) > 0
                            ? ` · backsplash ${Number(room.backsplash_sqft).toLocaleString()} sf`
                            : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {Array.isArray(snap.material_breakdown) && (snap.material_breakdown as unknown[]).length ? (
                  <details className="quiet-detail">
                    <summary>Material / color breakdown ({(snap.material_breakdown as unknown[]).length})</summary>
                    <ul className="drawer-line-list">
                      {(snap.material_breakdown as Record<string, unknown>[]).slice(0, 24).map((ln, idx) => (
                        <li key={idx}>
                          {str(ln.room)} — {str(ln.piece)} · {str(ln.materialGroup)}
                          {ln.materialColor ? ` · ${str(ln.materialColor)}` : ""} — {Number(ln.sqft ?? 0).toLocaleString()} sf · $
                          {Number(ln.wholesaleSubtotal ?? 0).toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>

              <section className="drawer-block">
                <h3>Timeline</h3>
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
              </section>

              <section className="drawer-block debug-accordion">
                <button type="button" className="btn ghost btn-xs" onClick={() => setShowRaw((s) => !s)}>
                  {showRaw ? "Hide" : "Show"} admin / debug — raw calculation snapshot
                </button>
                {showRaw ? <pre>{JSON.stringify(detail.calculation_snapshot ?? {}, null, 2)}</pre> : null}
              </section>
            </div>
          </aside>
        </>
      ) : null}

      <footer className="footer-bar" role="contentinfo">
        <div className="footer-line footer-brand">eliteOS · Quote Library</div>
        <div className="footer-line footer-tagline">Keep the Titans running well.</div>
      </footer>
    </div>
  );
}
