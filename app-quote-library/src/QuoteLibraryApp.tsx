import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, ApiError } from "./lib/api";
import { formatMoneyWhole, formatShortDate, formatSqft } from "./lib/format";
import {
  displayAccountColumn,
  labelHandoffRollup,
  labelQuoteSource,
  labelQuoteStatus,
  STATUS_FILTER_VALUES,
  statusFilterLabel
} from "./lib/labels";
import { getSupabase } from "./lib/supabase";
import { QuoteDetailModal } from "./QuoteDetailModal";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";

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

function canBatchArchiveRow(row: Record<string, unknown>): boolean {
  const status = str(row.quote_status).toLowerCase();
  return !row.archived_at && status !== "sold" && status !== "won" && Boolean(str(row.id));
}



function internalEstimateUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_INTERNAL_ESTIMATE ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://internal.eliteosfab.com";
}

function customQuoteUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_CUSTOM_QUOTE ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://custom.eliteosfab.com";
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

/**
 * Format a raw "entered by" / "prepared by" value for display in the quote table.
 *
 * Resolution order:
 *   1. Plain name already set (no "@") — returned as-is after trim.
 *   2. Email local part — "peg.reid@..." → "Peg Reid", "casey@..." → "Casey".
 *   3. Raw email — returned verbatim as a last resort.
 *   4. Empty / null / undefined — returns "—".
 */
function formatPersonDisplayName(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  if (!s.includes("@")) return s;
  return deriveDisplayNameFromEmail(s) || s;
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
   * (already kept up to date by `onAuthStateChange`). The user's role / job
   * title / department come from the same auth-only `GET /api/me` endpoint the
   * Home Launcher already uses — it returns only the caller's own profile, so
   * there is no cross-tenant exposure. We use it purely to render the topbar
   * chip subtitle (role/title) the same way Home does; it is best-effort and
   * the chip falls back to email if the call fails.
   */
  const [userEmail, setUserEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [userMetaName, setUserMetaName] = useState<string>("");
  const [userProfile, setUserProfile] = useState<{ role: string; jobTitle: string; department: string }>({
    role: "",
    jobTitle: "",
    department: ""
  });
  const [refreshBusy, setRefreshBusy] = useState(false);
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
  const [metricsIsFiltered, setMetricsIsFiltered] = useState(false);
  const [accountGroups, setAccountGroups] = useState<Record<string, unknown>[]>([]);

  /** Monotonically-increasing counter used to discard stale metrics responses. */
  const metricsLoadSeqRef = useRef(0);

  /**
   * `searchInput` holds the live text-input value; `search` is the debounced
   * version that drives actual API queries.  Splitting prevents a fetch on
   * every keystroke while keeping the input responsive.
   */
  const [searchInput, setSearchInput] = useState("");
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
  const [showAllRevisions, setShowAllRevisions] = useState(false);

  // Debounce the raw search input → committed search (avoids a fetch on every keystroke).
  useEffect(() => {
    if (searchInput === search) return;
    const tid = setTimeout(() => setSearch(searchInput), 280);
    return () => clearTimeout(tid);
  }, [searchInput, search]);

  /**
   * Mirror all active filter state into a ref so that `loadMetrics` (which is
   * stable, only depending on `sessionToken`) can always read the latest values
   * without being recreated on every filter change.
   */
  type FilterSnapshot = {
    tab: TabId; search: string; accountQ: string; status: string;
    quoteSource: string; branch: string; salesRep: string;
    createdFrom: string; createdTo: string; handoffStatus: string;
    showArchived: boolean; showAllRevisions: boolean;
  };
  const filterStateRef = useRef<FilterSnapshot>({
    tab: "all", search: "", accountQ: "", status: "",
    quoteSource: "", branch: "", salesRep: "",
    createdFrom: "", createdTo: "", handoffStatus: "", showArchived: false, showAllRevisions: false
  });
  useEffect(() => {
    filterStateRef.current = {
      tab, search, accountQ, status, quoteSource, branch, salesRep,
      createdFrom, createdTo, handoffStatus, showArchived, showAllRevisions
    };
  }, [tab, search, accountQ, status, quoteSource, branch, salesRep, createdFrom, createdTo, handoffStatus, showArchived, showAllRevisions]);

  const internalBase = useMemo(() => internalEstimateUrl(), []);
  const customQuoteBase = useMemo(() => customQuoteUrl(), []);
  const homeBase = useMemo(() => homeLauncherUrl(), []);

  const workspaceName = useMemo(() => resolveWorkspaceName(), []);
  const workspaceShortId = useMemo(() => resolveWorkspaceShortId(), []);
  const workspaceLogoUrl = useMemo(() => resolveWorkspaceLogoUrl(), []);
  const workspaceInitialsValue = useMemo(() => workspaceInitials(workspaceName), [workspaceName]);

  /**
   * Display values for the topbar user chip. Name/email/initials are resolved
   * client-side from `session.user`; the role/title subtitle comes from the
   * auth-only `GET /api/me` profile fetch above.
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
    // Use searchInput so the badge reacts to what the user has typed, not just the committed debounce value.
    if (searchInput.trim()) n += 1;
    if (accountQ.trim()) n += 1;
    if (status) n += 1;
    if (quoteSource) n += 1;
    if (branch.trim()) n += 1;
    if (salesRep.trim()) n += 1;
    if (createdFrom) n += 1;
    if (createdTo) n += 1;
    if (handoffStatus) n += 1;
    if (showArchived) n += 1;
    if (showAllRevisions) n += 1;
    return n;
  }, [searchInput, accountQ, status, quoteSource, branch, salesRep, createdFrom, createdTo, handoffStatus, showArchived, showAllRevisions]);

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
        showAllRevisions,
        sort,
        direction,
        pageSize
      }),
    [tab, search, accountQ, status, quoteSource, branch, salesRep, createdFrom, createdTo, handoffStatus, showArchived, showAllRevisions, sort, direction, pageSize]
  );

  const clearFilters = useCallback(() => {
    setSearchInput("");
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
    setShowAllRevisions(false);
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

  /**
   * Best-effort fetch of the signed-in user's role / job title / department so
   * the topbar chip subtitle matches the Home Launcher. Reuses the existing
   * auth-only `GET /api/me` endpoint (own-profile only — no cross-tenant data,
   * no new backend). Failures are non-fatal: the chip falls back to email.
   */
  useEffect(() => {
    if (!sessionToken) {
      setUserProfile({ role: "", jobTitle: "", department: "" });
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = (await apiGet("/api/me", sessionToken)) as {
          user?: { role?: unknown; job_title?: unknown; department?: unknown };
        };
        if (!alive) return;
        const u = res?.user ?? {};
        setUserProfile({
          role: String(u.role ?? "").trim(),
          jobTitle: String(u.job_title ?? "").trim(),
          department: String(u.department ?? "").trim()
        });
      } catch {
        if (alive) setUserProfile({ role: "", jobTitle: "", department: "" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionToken]);

  const loadMetrics = useCallback(async () => {
    if (!sessionToken) return;
    // Increment the sequence so any in-flight response with an older seq is discarded.
    const seq = ++metricsLoadSeqRef.current;
    const fs = filterStateRef.current;

    // Build filter params (same dimensions as the list, minus sort/pagination).
    const params = new URLSearchParams();
    if (fs.search.trim()) params.set("search", fs.search.trim());
    if (fs.accountQ.trim()) params.set("account", fs.accountQ.trim());
    if (fs.status) params.set("status", fs.status);
    if (fs.quoteSource) params.set("quote_source", fs.quoteSource);
    if (fs.branch.trim()) params.set("branch", fs.branch.trim());
    if (fs.salesRep.trim()) params.set("sales_rep", fs.salesRep.trim());
    if (fs.createdFrom) params.set("created_from", fs.createdFrom);
    if (fs.createdTo) params.set("created_to", fs.createdTo);
    if (fs.showArchived) params.set("include_archived", "1");
    if (fs.showAllRevisions) params.set("latest_revision_only", "0");
    if (fs.tab === "my") params.set("my", "1");
    if (fs.tab === "internal") params.set("view", "internal_estimates");
    if (fs.tab === "public") params.set("view", "public_leads");
    if (fs.tab === "sold") params.set("view", "sold_jobs");
    if (fs.tab === "handoff") params.set("view", "needs_handoff");

    const qs = params.toString();
    try {
      const m = (await apiGet(`/api/quote-library/metrics${qs ? `?${qs}` : ""}`, sessionToken)) as Record<string, unknown>;
      if (seq !== metricsLoadSeqRef.current) return; // discard stale response
      setMetrics((m.metrics as Record<string, unknown>) || {});
      setMetricsIsFiltered(!!(m.is_filtered));
    } catch {
      // Keep the previous (stale) metrics visible on error — don't blank the cards.
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
      if (showAllRevisions) params.set("latest_revision_only", "0");
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
    showAllRevisions,
    pageSize,
    pageOffset
  ]);

  // Initial metrics load (fires when sessionToken becomes available).
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

  // Load rows and metrics whenever the tab or active list query changes.
  // loadMetrics reads filter state via filterStateRef so it stays stable and
  // does not need to be listed in the deps beyond its identity change (token).
  useEffect(() => {
    void loadMetrics();
    if (tab === "by_account") void loadAccounts();
    else void loadRows();
  }, [tab, loadRows, loadAccounts, loadMetrics]);

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

  const qlMenuItems: EliteosTopbarMenuItem[] = [
    {
      label: "Open Home",
      meta: "eliteOS Launcher",
      href: homeBase,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11.5L12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      )
    },
    {
      label: refreshBusy ? "Refreshing data…" : "Refresh data",
      meta: "Metrics, list, and open quote",
      onClick: () => void handleMenuRefresh(),
      disabled: refreshBusy || busy,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
      )
    },
    {
      label: "Profile & preferences",
      meta: "eliteOS Home",
      href: `${homeBase}?view=profile`,
      title: "Profile & preferences",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5" />
        </svg>
      )
    }
  ];

  // Chip subtitle: match the Home Launcher's fallback order
  // (job_title -> department -> role). Role/title is upper-cased here so it
  // reads as a polished label (e.g. "ARCHITECT") even though the shared chip
  // role style is not force-uppercased in this head — that keeps the email
  // fallback in its natural casing. Email is only used when no role/title.
  const qlRoleTitle = (userProfile.jobTitle || userProfile.department || userProfile.role || "").trim();
  const qlChipSubtitle = qlRoleTitle
    ? qlRoleTitle.toUpperCase()
    : userDisplayEmail && userDisplayEmail.toLowerCase() !== userDisplayName.toLowerCase()
      ? userDisplayEmail
      : "";

  return (
    <div className="shell">
      {sessionToken ? (
        <EliteosTopbar
          appName="Quote Library"
          organizationName={workspaceName}
          logoSrc={workspaceLogoUrl ?? EOS_LOGO_URL}
          homeHref="/"
          userName={userDisplayName}
          userEmail={userDisplayEmail}
          userSubtitle={qlChipSubtitle}
          initials={userDisplayInitials}
          menuItems={qlMenuItems}
          onSignOut={() => void signOut()}
        />
      ) : (
        <EliteosTopbar
          appName="Quote Library"
          organizationName={workspaceName}
          logoSrc={workspaceLogoUrl ?? EOS_LOGO_URL}
          homeHref="/"
        />
      )}
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
                      <span className="hero-workspace-platform">eliteOS</span>
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

          <div className="metrics-section">
            {metricsIsFiltered ? (
              <p className="metrics-filter-note" aria-live="polite">
                Metrics reflect current filters
              </p>
            ) : null}
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
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
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
                  <option value="custom_quote">Custom quote</option>
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
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22 }} title="Include older revisions in the list (default shows latest revision only)">
                <input type="checkbox" checked={showAllRevisions} onChange={(e) => setShowAllRevisions(e.target.checked)} />
                Include older revisions
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
                  // Commit the live search input immediately (without waiting for debounce).
                  setSearch(searchInput);
                  setPageOffset(0);
                  setSelectedIds(new Set());
                  void loadMetrics();
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
                        <th className="hide-md">Entered by</th>
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
                            <td className="hide-md">{formatPersonDisplayName(r.prepared_by)}</td>
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

      <QuoteDetailModal
        open={!!(detailId && detail)}
        detailId={detailId ?? ""}
        detail={detail ?? {}}
        revisions={revisions}
        sessionToken={sessionToken ?? ""}
        internalBase={internalBase}
        customQuoteBase={customQuoteBase}
        onClose={() => setDetailId(null)}
        runAction={runAction}
        onRevisionSelect={setDetailId}
      />

      <footer className="footer-bar" role="contentinfo">
        <div className="footer-line footer-brand">eliteOS · Quote Library</div>
        <div className="footer-line footer-tagline">Keep the Titans running well.</div>
      </footer>
    </div>
  );
}
