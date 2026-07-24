import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, apiPost, isAbortError } from "../lib/api";

const PREFS_KEY = "elite100_live_digital_estimates_view_v1";

export type LiveDigitalEstimatesPageProps = {
  authToken: string | null;
  onOpenEstimate: (caseId: string, options?: { openTarget?: string }) => void;
  onOpenReviewRequest?: (reviewRequestId: string) => void;
  onOpenLegacyPublishSearch?: () => void;
  onOpenAccountDirectory?: (accountId: string) => void;
};

type NextAction = {
  code: string;
  label: string;
  target?: string | null;
  reviewRequestId?: string | null;
};

type PubRow = {
  publicationId: string;
  operationalStatus: string;
  statusLabel: string;
  attentionReasons: string[];
  needsAttention: boolean;
  nextAction: NextAction;
  customerDisplayName: string | null;
  projectName: string | null;
  publishedAsNote?: string | null;
  accountDirectoryAccountId: string | null;
  accountDisplayName?: string | null;
  quickbooksLinked?: boolean | null;
  quoteNumber: string | null;
  revisionLabel: string | null;
  publishedAt: string | null;
  ageDays: number | null;
  pricingValidThrough: string | null;
  publishedValue: number | null;
  configuredValue: number | null;
  configuredDelta: number | null;
  lastCustomerActivityAt: string | null;
  lastCustomerActivityLabel: string | null;
  estimatorUserId: string | null;
  reviewRequestId: string | null;
  intakeCaseId: string | null;
  studioEstimateId: string | null;
  isActive: boolean;
  linkStatus: string | null;
};

type AccountGroup = {
  groupKey: string;
  accountDisplayName: string;
  accountDirectoryAccountId: string | null;
  isUnlinkedGroup: boolean;
  accountLinkageLabel?: string | null;
  activePublicationCount: number;
  totalActivePublishedValue: number;
  latestCustomerActivityAt: string | null;
  needingAttentionCount: number;
  quickbooksLinked: boolean | null;
  publications: PubRow[];
};

type Metrics = {
  activePublications: number;
  needsAttention?: number;
  publishedNotViewed: number;
  viewedOrActive: number;
  reviewRequested: number;
  revisionRequired: number;
  expiringWithin7Days: number;
  totalActivePublishedValue: number;
};

type Prefs = {
  q: string;
  status: string;
  history: boolean;
  needsAttentionOnly: boolean;
  accountLinked: string;
  quickbooksLinked: string;
  estimatorUserId: string;
  expiringWithinDays: string;
  groupByAccount: boolean;
  collapsedGroups: string[];
};

type ActionTone = "neutral" | "secondary" | "warning" | "destructive";

function loadPrefs(): Prefs {
  try {
    const raw = sessionStorage.getItem(PREFS_KEY);
    if (!raw) throw new Error("none");
    const p = JSON.parse(raw);
    return {
      q: String(p.q || ""),
      status: String(p.status || ""),
      history: Boolean(p.history),
      needsAttentionOnly: Boolean(p.needsAttentionOnly),
      accountLinked: String(p.accountLinked || ""),
      quickbooksLinked: String(p.quickbooksLinked || ""),
      estimatorUserId: String(p.estimatorUserId || ""),
      expiringWithinDays: String(p.expiringWithinDays || ""),
      groupByAccount: p.groupByAccount !== false,
      collapsedGroups: Array.isArray(p.collapsedGroups) ? p.collapsedGroups.map(String) : []
    };
  } catch {
    return {
      q: "",
      status: "",
      history: false,
      needsAttentionOnly: false,
      accountLinked: "",
      quickbooksLinked: "",
      estimatorUserId: "",
      expiringWithinDays: "",
      groupByAccount: true,
      collapsedGroups: []
    };
  }
}

function savePrefs(p: Prefs) {
  try {
    sessionStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return String(iso);
  }
}

function formatActivity(iso: string | null | undefined, label: string | null | undefined) {
  if (iso) {
    try {
      const d = new Date(iso);
      const today = new Date();
      const sameDay =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
      const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      if (sameDay) return `Today, ${time}`;
      return formatWhen(iso);
    } catch {
      /* fall through */
    }
  }
  if (label && !/^viewed$/i.test(label.trim())) return label;
  return "No customer activity yet";
}

function attentionItemsPhrase(count: number) {
  if (count === 1) return "1 item needs attention";
  return `${count} items need attention`;
}

function nextActionTone(code: string | null | undefined): ActionTone {
  switch (code) {
    case "link_customer_account":
    case "review_expiration":
    case "replace_unavailable_link":
      return "warning";
    case "open_customer_view":
    case "copy_customer_link":
      return "secondary";
    default:
      return "neutral";
  }
}

function actionClass(tone: ActionTone) {
  return `live-de-action live-de-action--${tone}`;
}

function activeFilterCount(prefs: Prefs) {
  let n = 0;
  if (prefs.q.trim()) n += 1;
  if (prefs.status) n += 1;
  if (prefs.accountLinked) n += 1;
  if (prefs.quickbooksLinked) n += 1;
  if (prefs.estimatorUserId.trim()) n += 1;
  if (prefs.expiringWithinDays) n += 1;
  if (prefs.needsAttentionOnly) n += 1;
  if (prefs.history) n += 1;
  if (!prefs.groupByAccount) n += 1;
  return n;
}

export default function LiveDigitalEstimatesPage({
  authToken,
  onOpenEstimate,
  onOpenReviewRequest,
  onOpenLegacyPublishSearch,
  onOpenAccountDirectory
}: LiveDigitalEstimatesPageProps) {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [pagination, setPagination] = useState({ limit: 25, offset: 0, total: 0, hasMore: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customerUrl, setCustomerUrl] = useState<string | null>(null);
  const [publishPanelOpen, setPublishPanelOpen] = useState(false);
  const drawerTitleId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (prefs.q.trim()) sp.set("q", prefs.q.trim());
    if (prefs.status) sp.set("status", prefs.status);
    if (prefs.history) sp.set("history", "1");
    if (prefs.needsAttentionOnly) sp.set("needsAttentionOnly", "1");
    if (prefs.accountLinked) sp.set("accountLinked", prefs.accountLinked);
    if (prefs.quickbooksLinked) sp.set("quickbooksLinked", prefs.quickbooksLinked);
    if (prefs.estimatorUserId.trim()) sp.set("estimatorUserId", prefs.estimatorUserId.trim());
    if (prefs.expiringWithinDays) sp.set("expiringWithinDays", prefs.expiringWithinDays);
    sp.set("groupByAccount", prefs.groupByAccount ? "1" : "0");
    sp.set("limit", String(pagination.limit));
    sp.set("offset", String(pagination.offset));
    return sp.toString();
  }, [prefs, pagination.limit, pagination.offset]);

  const filterCount = activeFilterCount(prefs);

  const loadList = useCallback(
    async (signal?: AbortSignal) => {
      if (!authToken) return;
      setLoading(true);
      setError(null);
      try {
        const body = (await apiGet(
          `/api/elite100-estimate-studio/live-digital-estimates?${queryString}`,
          authToken,
          { signal }
        )) as {
          metrics: Metrics;
          groups: AccountGroup[];
          pagination: { limit: number; offset: number; total: number; hasMore: boolean };
        };
        setMetrics(body.metrics);
        setGroups(Array.isArray(body.groups) ? body.groups : []);
        setPagination((p) => ({ ...p, ...(body.pagination || {}) }));
      } catch (e) {
        if (isAbortError(e)) return;
        setError(e instanceof ApiError ? e.message : "Unable to load Live Digital Estimates");
      } finally {
        setLoading(false);
      }
    },
    [authToken, queryString]
  );

  useEffect(() => {
    const ac = new AbortController();
    void loadList(ac.signal);
    return () => ac.abort();
  }, [loadList]);

  function closeDrawer() {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setCustomerUrl(null);
    setActionNotice(null);
    const el = triggerRef.current;
    triggerRef.current = null;
    if (el && typeof el.focus === "function") {
      requestAnimationFrame(() => el.focus());
    }
  }

  async function openDetail(publicationId: string, trigger?: HTMLElement | null) {
    if (!authToken) return;
    if (trigger) triggerRef.current = trigger;
    setSelectedId(publicationId);
    setDetail(null);
    setCustomerUrl(null);
    setDetailError(null);
    setDetailLoading(true);
    setActionNotice(null);
    try {
      const body = (await apiGet(
        `/api/elite100-estimate-studio/live-digital-estimates/${encodeURIComponent(publicationId)}`,
        authToken
      )) as Record<string, unknown>;
      setDetail(body);
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Unable to load publication detail");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !drawerRef.current) return;
    const root = drawerRef.current;
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onTab);
    return () => root.removeEventListener("keydown", onTab);
  }, [selectedId, detailLoading, detail]);

  async function openCustomerView(publicationId: string) {
    if (!authToken || busy) return;
    if (!window.confirm("Open the customer Digital Estimate view in a new tab?")) return;
    setBusy(true);
    setActionNotice(null);
    try {
      const pub = (await apiGet(
        `/api/elite100-estimate-studio/publications/${encodeURIComponent(publicationId)}`,
        authToken
      )) as { customerUrl?: string | null };
      const url = pub.customerUrl || null;
      if (!url) {
        setActionNotice("Customer link is unavailable. Use Replace link if needed.");
        return;
      }
      setCustomerUrl(url);
      window.open(url, "_blank", "noopener,noreferrer");
      setActionNotice("Customer view opened in a new tab.");
    } catch (e) {
      setActionNotice(e instanceof ApiError ? e.message : "Unable to open customer view");
    } finally {
      setBusy(false);
    }
  }

  async function copyCustomerLink(publicationId: string) {
    if (!authToken || busy) return;
    if (!window.confirm("Copy the customer Digital Estimate link to your clipboard?")) return;
    setBusy(true);
    setActionNotice(null);
    try {
      const pub = (await apiGet(
        `/api/elite100-estimate-studio/publications/${encodeURIComponent(publicationId)}`,
        authToken
      )) as { customerUrl?: string | null };
      const url = pub.customerUrl || null;
      if (!url) {
        setActionNotice("Customer link is unavailable. Use Replace link if needed.");
        return;
      }
      setCustomerUrl(url);
      await navigator.clipboard.writeText(url);
      await apiPost(
        `/api/elite100-estimate-studio/publications/${encodeURIComponent(publicationId)}/events/link-copied`,
        authToken,
        {}
      );
      setActionNotice("Customer link copied.");
    } catch (e) {
      setActionNotice(e instanceof ApiError ? e.message : "Unable to copy customer link");
    } finally {
      setBusy(false);
    }
  }

  async function revokePublication(publicationId: string) {
    if (!authToken || busy) return;
    if (!window.confirm("Revoke this Digital Estimate link? Customers will no longer be able to open it.")) {
      return;
    }
    setBusy(true);
    try {
      await apiPost(
        `/api/elite100-estimate-studio/publications/${encodeURIComponent(publicationId)}/revoke`,
        authToken,
        { confirm: true }
      );
      setActionNotice("Publication revoked.");
      await loadList();
      await openDetail(publicationId, triggerRef.current);
    } catch (e) {
      setActionNotice(e instanceof ApiError ? e.message : "Unable to revoke");
    } finally {
      setBusy(false);
    }
  }

  async function replaceLink(publicationId: string) {
    if (!authToken || busy) return;
    if (!window.confirm("Replace the customer link? The previous link will stop working.")) {
      return;
    }
    setBusy(true);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/publications/${encodeURIComponent(publicationId)}/replace-token`,
        authToken,
        { confirm: true }
      )) as { customerUrl?: string | null };
      setCustomerUrl(body.customerUrl || null);
      setActionNotice("Customer link replaced.");
      await loadList();
    } catch (e) {
      setActionNotice(e instanceof ApiError ? e.message : "Unable to replace link");
    } finally {
      setBusy(false);
    }
  }

  function runNextAction(row: PubRow) {
    const code = row.nextAction?.code;
    if (code === "review_customer_changes" && row.reviewRequestId && onOpenReviewRequest) {
      onOpenReviewRequest(row.reviewRequestId);
      return;
    }
    if (
      (code === "link_customer_account" ||
        code === "prepare_estimate_revision" ||
        code === "recalculate_estimate" ||
        code === "approve_revised_estimate" ||
        code === "republish_revised_estimate") &&
      row.intakeCaseId
    ) {
      onOpenEstimate(row.intakeCaseId, { openTarget: "digital" });
      return;
    }
    if (code === "copy_customer_link") {
      void copyCustomerLink(row.publicationId);
      return;
    }
    if (code === "open_customer_view") {
      void openCustomerView(row.publicationId);
      return;
    }
    if (code === "replace_unavailable_link") {
      void replaceLink(row.publicationId);
      return;
    }
    void openDetail(row.publicationId);
  }

  function toggleGroup(key: string) {
    setPrefs((p) => {
      const set = new Set(p.collapsedGroups);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...p, collapsedGroups: [...set] };
    });
  }

  function clearFilters() {
    setPagination((p) => ({ ...p, offset: 0 }));
    setPrefs((p) => ({
      ...p,
      q: "",
      status: "",
      history: false,
      needsAttentionOnly: false,
      accountLinked: "",
      quickbooksLinked: "",
      estimatorUserId: "",
      expiringWithinDays: "",
      groupByAccount: true
    }));
  }

  function applyMetricFilter(kind: string) {
    setPagination((p) => ({ ...p, offset: 0 }));
    setPrefs((p) => {
      const base = {
        ...p,
        history: false,
        status: "",
        needsAttentionOnly: false,
        expiringWithinDays: ""
      };
      switch (kind) {
        case "active":
          return base;
        case "attention":
          return { ...base, needsAttentionOnly: true };
        case "review":
          return { ...base, status: "review_requested" };
        case "not_viewed":
          return { ...base, status: "published_not_viewed" };
        case "viewed":
          return { ...base, status: "viewed" };
        case "revision":
          return { ...base, status: "revision_required" };
        case "expiring":
          return { ...base, expiringWithinDays: "7" };
        default:
          return base;
      }
    });
  }

  const selectedRow = useMemo(() => {
    for (const g of groups) {
      const hit = g.publications.find((p) => p.publicationId === selectedId);
      if (hit) return hit;
    }
    return null;
  }, [groups, selectedId]);

  const emptyMessage = prefs.history
    ? "No publications in history for these filters."
    : filterCount > 0
      ? "No Digital Estimates match these filters."
      : "No active Digital Estimates yet.";

  return (
    <div className="live-de" data-testid="live-digital-estimates-page">
      <header className="live-de-header">
        <div>
          <h2 data-testid="live-de-title">Live Digital Estimates</h2>
          <p className="muted">
            Active estimates currently with customers — status, activity, and next action.
          </p>
        </div>
        <div className="live-de-header-actions">
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="live-de-refresh"
            disabled={loading}
            onClick={() => void loadList()}
          >
            Refresh
          </button>
          {onOpenLegacyPublishSearch ? (
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="live-de-open-publish-search"
              aria-expanded={publishPanelOpen}
              onClick={() => setPublishPanelOpen((v) => !v)}
            >
              Publish an estimate
            </button>
          ) : null}
        </div>
      </header>

      {publishPanelOpen && onOpenLegacyPublishSearch ? (
        <div className="live-de-publish-panel" data-testid="live-de-publish-panel">
          <p>
            Search for an approved Studio estimate, review eligibility, then explicitly click{" "}
            <strong>Publish Digital Estimate</strong>. Opening this panel does not publish.
          </p>
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="live-de-start-publish-search"
            onClick={() => {
              setPublishPanelOpen(false);
              onOpenLegacyPublishSearch();
            }}
          >
            Search estimates to publish
          </button>
        </div>
      ) : null}

      {metrics ? (
        <div className="live-de-metrics" data-testid="live-de-metrics">
          <div className="live-de-metrics-primary">
            {(
              [
                ["Active publications", metrics.activePublications, "active"],
                ["Needs attention", metrics.needsAttention ?? 0, "attention"],
                ["Review requested", metrics.reviewRequested, "review"],
                ["Total active published value", money(metrics.totalActivePublishedValue), "active"]
              ] as const
            ).map(([label, value, filter]) => (
              <button
                key={label}
                type="button"
                className="live-de-metric-card live-de-metric-card--primary"
                data-testid={`live-de-metric-${filter}`}
                onClick={() => applyMetricFilter(filter)}
              >
                <div className="live-de-metric-label">{label}</div>
                <div className="live-de-metric-value">{value}</div>
              </button>
            ))}
          </div>
          <div className="live-de-metrics-secondary" data-testid="live-de-metrics-secondary">
            {(
              [
                ["Published — not viewed", metrics.publishedNotViewed, "not_viewed"],
                ["Viewed / active", metrics.viewedOrActive, "viewed"],
                ["Revision required", metrics.revisionRequired, "revision"],
                ["Expiring within 7 days", metrics.expiringWithin7Days, "expiring"]
              ] as const
            ).map(([label, value, filter]) => (
              <button
                key={label}
                type="button"
                className="live-de-metric-card live-de-metric-card--secondary"
                onClick={() => applyMetricFilter(filter)}
              >
                <div className="live-de-metric-label">{label}</div>
                <div className="live-de-metric-value">{value}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="live-de-filters" data-testid="live-de-filters" role="toolbar" aria-label="Portfolio filters">
        <label className="live-de-filter-field">
          <span>Search</span>
          <input
            type="search"
            value={prefs.q}
            placeholder="Account, customer, project, quote…"
            aria-label="Search Live Digital Estimates"
            data-testid="live-de-search"
            onChange={(e) => {
              setPagination((p) => ({ ...p, offset: 0 }));
              setPrefs((p) => ({ ...p, q: e.target.value }));
            }}
          />
        </label>
        <label className="live-de-filter-field">
          <span>Status</span>
          <select
            aria-label="Status filter"
            data-testid="live-de-filter-status"
            value={prefs.status}
            onChange={(e) => {
              setPagination((p) => ({ ...p, offset: 0 }));
              setPrefs((p) => ({ ...p, status: e.target.value, history: false }));
            }}
          >
            <option value="">All statuses</option>
            <option value="published_not_viewed">Published — not viewed</option>
            <option value="viewed">Viewed</option>
            <option value="customer_configuring">Customer configuring</option>
            <option value="review_requested">Review requested</option>
            <option value="revision_required">Revision required</option>
            <option value="expiring_soon">Expiring soon</option>
          </select>
        </label>
        <label className="live-de-filter-field">
          <span>Account linkage</span>
          <select
            aria-label="Account link filter"
            data-testid="live-de-filter-account-linked"
            value={prefs.accountLinked}
            onChange={(e) => {
              setPagination((p) => ({ ...p, offset: 0 }));
              setPrefs((p) => ({ ...p, accountLinked: e.target.value }));
            }}
          >
            <option value="">All</option>
            <option value="linked">Linked</option>
            <option value="unlinked">Unlinked</option>
          </select>
        </label>
        <label className="live-de-filter-field">
          <span>QuickBooks</span>
          <select
            aria-label="QuickBooks linkage filter"
            data-testid="live-de-filter-qb"
            value={prefs.quickbooksLinked}
            onChange={(e) => {
              setPagination((p) => ({ ...p, offset: 0 }));
              setPrefs((p) => ({ ...p, quickbooksLinked: e.target.value }));
            }}
          >
            <option value="">All</option>
            <option value="linked">QuickBooks Linked</option>
            <option value="unlinked">QuickBooks Not Linked</option>
          </select>
        </label>
        <label className="live-de-filter-field">
          <span>Estimator</span>
          <input
            type="text"
            value={prefs.estimatorUserId}
            placeholder="User id"
            aria-label="Estimator filter"
            data-testid="live-de-filter-estimator"
            onChange={(e) => {
              setPagination((p) => ({ ...p, offset: 0 }));
              setPrefs((p) => ({ ...p, estimatorUserId: e.target.value }));
            }}
          />
        </label>
        <label className="live-de-filter-field">
          <span>Expiration</span>
          <select
            aria-label="Expiration filter"
            data-testid="live-de-filter-expiration"
            value={prefs.expiringWithinDays}
            onChange={(e) => {
              setPagination((p) => ({ ...p, offset: 0 }));
              setPrefs((p) => ({ ...p, expiringWithinDays: e.target.value, history: false }));
            }}
          >
            <option value="">Any</option>
            <option value="7">Within 7 days</option>
          </select>
        </label>
        <label className="live-de-check">
          <input
            type="checkbox"
            checked={prefs.needsAttentionOnly}
            data-testid="live-de-filter-attention"
            onChange={(e) => {
              setPagination((p) => ({ ...p, offset: 0 }));
              setPrefs((p) => ({ ...p, needsAttentionOnly: e.target.checked }));
            }}
          />
          Needs attention
        </label>
        <label className="live-de-check">
          <input
            type="checkbox"
            checked={prefs.groupByAccount}
            data-testid="live-de-filter-group"
            onChange={(e) => setPrefs((p) => ({ ...p, groupByAccount: e.target.checked }))}
          />
          Group by account
        </label>
        <label className="live-de-check">
          <input
            type="checkbox"
            checked={prefs.history}
            data-testid="live-de-filter-history"
            onChange={(e) => {
              setPagination((p) => ({ ...p, offset: 0 }));
              setPrefs((p) => ({
                ...p,
                history: e.target.checked,
                status: e.target.checked ? "" : p.status,
                expiringWithinDays: e.target.checked ? "" : p.expiringWithinDays
              }));
            }}
          />
          History
        </label>
        {filterCount > 0 ? (
          <button
            type="button"
            className="eq-btn-ghost"
            data-testid="live-de-clear-filters"
            onClick={clearFilters}
          >
            Clear filters ({filterCount})
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="muted" data-testid="live-de-loading">
          Loading Live Digital Estimates…
        </p>
      ) : null}
      {error ? (
        <div className="error-box" role="alert" data-testid="live-de-error">
          {error}
          <button type="button" className="eq-btn-secondary" onClick={() => void loadList()}>
            Retry
          </button>
        </div>
      ) : null}
      {!loading && !error && groups.length === 0 ? (
        <p className="muted" data-testid="live-de-empty">
          {emptyMessage}
        </p>
      ) : null}

      <div className="live-de-list" data-testid="live-de-list">
        <div className="live-de-grid-head" aria-hidden="true">
          <span>Customer / project</span>
          <span>Status</span>
          <span>Published</span>
          <span>Age</span>
          <span>Valid through</span>
          <span>Value</span>
          <span>Last activity</span>
          <span>Estimator</span>
          <span>Next action</span>
        </div>
        {groups.map((g) => {
          const collapsed = prefs.collapsedGroups.includes(g.groupKey);
          return (
            <section
              key={g.groupKey}
              className="live-de-group"
              data-testid="live-de-account-group"
              data-unlinked={g.isUnlinkedGroup ? "true" : "false"}
            >
              <header className="live-de-group-header">
                <button
                  type="button"
                  className="live-de-group-toggle"
                  aria-expanded={!collapsed}
                  data-testid="live-de-group-toggle"
                  onClick={() => toggleGroup(g.groupKey)}
                >
                  <strong>{g.accountDisplayName}</strong>
                  {g.isUnlinkedGroup ? (
                    <span className="live-de-group-linkage muted">
                      {g.accountLinkageLabel || "Account Directory not linked"}
                    </span>
                  ) : null}
                  <span className="muted live-de-group-meta">
                    {g.activePublicationCount} active · {money(g.totalActivePublishedValue)}
                    {g.needingAttentionCount > 0
                      ? ` · ${attentionItemsPhrase(g.needingAttentionCount)}`
                      : ""}
                    {!g.isUnlinkedGroup
                      ? g.quickbooksLinked
                        ? " · QuickBooks Linked"
                        : " · QuickBooks Not Linked"
                      : ""}
                    {g.latestCustomerActivityAt
                      ? ` · Last activity ${formatWhen(g.latestCustomerActivityAt)}`
                      : ""}
                  </span>
                </button>
                {g.accountDirectoryAccountId && onOpenAccountDirectory ? (
                  <button
                    type="button"
                    className="eq-btn-ghost live-de-open-ad"
                    data-testid="live-de-open-account-directory"
                    onClick={() => onOpenAccountDirectory(g.accountDirectoryAccountId!)}
                  >
                    Open Account Directory
                  </button>
                ) : null}
              </header>
              {!collapsed
                ? g.publications.map((row) => {
                    const tone = nextActionTone(row.nextAction?.code);
                    const activity = formatActivity(
                      row.lastCustomerActivityAt,
                      row.lastCustomerActivityLabel
                    );
                    return (
                      <article
                        key={row.publicationId}
                        className={`live-de-row${selectedId === row.publicationId ? " selected" : ""}`}
                        data-testid="live-de-publication-row"
                      >
                        <button
                          type="button"
                          className="live-de-row-main"
                          data-testid="live-de-open-details"
                          aria-label={`Open details for ${row.quoteNumber || "publication"}`}
                          onClick={(e) => void openDetail(row.publicationId, e.currentTarget)}
                        >
                          <div className="live-de-cell live-de-cell--customer">
                            <strong>
                              {row.customerDisplayName || "Customer"}
                              {row.projectName ? ` · ${row.projectName}` : ""}
                            </strong>
                            <span className="muted">
                              {[row.quoteNumber, row.revisionLabel].filter(Boolean).join(" ") || "—"}
                              {row.publishedAsNote ? ` · ${row.publishedAsNote}` : ""}
                            </span>
                          </div>
                          <div className="live-de-cell">
                            <span className="live-de-status" data-status={row.operationalStatus}>
                              {row.statusLabel}
                            </span>
                          </div>
                          <div className="live-de-cell" data-label="Published">
                            {formatWhen(row.publishedAt)}
                          </div>
                          <div className="live-de-cell" data-label="Age">
                            {row.ageDays != null ? `${row.ageDays}d` : "—"}
                          </div>
                          <div className="live-de-cell" data-label="Valid through">
                            {row.pricingValidThrough || "—"}
                          </div>
                          <div className="live-de-cell" data-label="Published value">
                            {money(row.publishedValue)}
                            {row.configuredDelta != null ? (
                              <span className="muted"> · Δ {money(row.configuredDelta)}</span>
                            ) : null}
                          </div>
                          <div className="live-de-cell" data-label="Last activity">
                            {activity}
                          </div>
                          <div className="live-de-cell" data-label="Estimator">
                            {row.estimatorUserId || "—"}
                          </div>
                        </button>
                        <div className="live-de-row-actions">
                          <button
                            type="button"
                            className={actionClass("neutral")}
                            data-testid="live-de-row-open-details"
                            onClick={(e) => void openDetail(row.publicationId, e.currentTarget)}
                          >
                            Open details
                          </button>
                          <button
                            type="button"
                            className={actionClass(tone)}
                            data-testid="live-de-next-action"
                            onClick={() => runNextAction(row)}
                          >
                            {row.nextAction?.label || "Open"}
                          </button>
                        </div>
                        {row.attentionReasons?.length ? (
                          <ul className="live-de-badges" aria-label="Attention reasons">
                            {row.attentionReasons.map((r) => (
                              <li key={r}>{r.replace(/_/g, " ")}</li>
                            ))}
                          </ul>
                        ) : null}
                      </article>
                    );
                  })
                : null}
            </section>
          );
        })}
        <div className="live-de-pager">
          <button
            type="button"
            disabled={pagination.offset <= 0 || loading}
            data-testid="live-de-prev"
            onClick={() => setPagination((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
          >
            Previous
          </button>
          <span className="muted" data-testid="live-de-page-meta">
            {pagination.total === 0
              ? "0 of 0"
              : `${pagination.offset + 1}–${Math.min(
                  pagination.offset + pagination.limit,
                  pagination.total
                )} of ${pagination.total}`}
          </span>
          <button
            type="button"
            disabled={!pagination.hasMore || loading}
            data-testid="live-de-next-page"
            onClick={() => setPagination((p) => ({ ...p, offset: p.offset + p.limit }))}
          >
            Next
          </button>
        </div>
      </div>

      {selectedId ? (
        <>
          <div
            className="live-de-drawer-backdrop"
            data-testid="live-de-drawer-backdrop"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            className="live-de-drawer"
            data-testid="live-de-detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerTitleId}
          >
            <header className="live-de-drawer-header">
              <h3 id={drawerTitleId}>Publication detail</h3>
              <button
                ref={closeBtnRef}
                type="button"
                className="eq-btn-ghost"
                data-testid="live-de-drawer-close"
                aria-label="Close publication detail"
                onClick={closeDrawer}
              >
                Close
              </button>
            </header>
            {detailLoading ? (
              <p className="muted" data-testid="live-de-detail-loading">
                Loading detail…
              </p>
            ) : detailError ? (
              <div className="error-box" data-testid="live-de-detail-error">
                {detailError}
              </div>
            ) : detail ? (
              <>
                {selectedRow ? (
                  <>
                    <p>
                      <strong>{selectedRow.statusLabel}</strong>
                    </p>
                    <p className="muted">
                      {selectedRow.customerDisplayName} · {selectedRow.projectName}
                    </p>
                    <p>
                      Next action: <strong>{selectedRow.nextAction?.label}</strong>
                    </p>
                    {selectedRow.publishedAsNote ? (
                      <p className="muted">{selectedRow.publishedAsNote}</p>
                    ) : null}
                    <p className="muted">
                      Account Directory:{" "}
                      {selectedRow.accountDirectoryAccountId
                        ? selectedRow.accountDisplayName || "Linked"
                        : "Unlinked"}
                      {selectedRow.quickbooksLinked == null
                        ? ""
                        : selectedRow.quickbooksLinked
                          ? " · QuickBooks Linked"
                          : " · QuickBooks Not Linked"}
                    </p>
                    <p className="muted">
                      Pricing valid through: {selectedRow.pricingValidThrough || "—"}
                    </p>
                    <p className="muted">
                      Last activity:{" "}
                      {formatActivity(
                        selectedRow.lastCustomerActivityAt,
                        selectedRow.lastCustomerActivityLabel
                      )}
                    </p>
                  </>
                ) : null}
                {actionNotice ? (
                  <p className="eq-state" role="status">
                    {actionNotice}
                  </p>
                ) : null}
                {customerUrl ? (
                  <p className="muted" data-testid="live-de-customer-url">
                    Link ready (not opened automatically).
                  </p>
                ) : null}
                <div className="live-de-detail-actions">
                  <button
                    type="button"
                    className={actionClass("secondary")}
                    data-testid="live-de-copy-link"
                    disabled={busy}
                    onClick={() => selectedId && void copyCustomerLink(selectedId)}
                  >
                    Copy customer link
                  </button>
                  <button
                    type="button"
                    className={actionClass("secondary")}
                    data-testid="live-de-open-customer-view"
                    disabled={busy}
                    onClick={() => selectedId && void openCustomerView(selectedId)}
                  >
                    Open customer view
                  </button>
                  <button
                    type="button"
                    className={actionClass("warning")}
                    data-testid="live-de-replace-link"
                    disabled={busy}
                    onClick={() => selectedId && void replaceLink(selectedId)}
                  >
                    Replace link
                  </button>
                  <button
                    type="button"
                    className={actionClass("destructive")}
                    data-testid="live-de-revoke"
                    disabled={busy}
                    onClick={() => selectedId && void revokePublication(selectedId)}
                  >
                    Revoke publication
                  </button>
                  {selectedRow?.intakeCaseId ? (
                    <button
                      type="button"
                      className={actionClass("secondary")}
                      data-testid="live-de-open-studio"
                      onClick={() =>
                        onOpenEstimate(selectedRow.intakeCaseId!, { openTarget: "digital" })
                      }
                    >
                      Open Studio estimate
                    </button>
                  ) : null}
                  {selectedRow?.reviewRequestId && onOpenReviewRequest ? (
                    <button
                      type="button"
                      className={actionClass("secondary")}
                      data-testid="live-de-open-review"
                      onClick={() => onOpenReviewRequest(selectedRow.reviewRequestId!)}
                    >
                      Open review request
                    </button>
                  ) : null}
                  {selectedRow?.accountDirectoryAccountId && onOpenAccountDirectory ? (
                    <button
                      type="button"
                      className={actionClass("secondary")}
                      data-testid="live-de-open-ad-detail"
                      onClick={() =>
                        onOpenAccountDirectory(selectedRow.accountDirectoryAccountId!)
                      }
                    >
                      Open Account Directory
                    </button>
                  ) : null}
                </div>
                <h4>Events</h4>
                <ul className="live-de-events" data-testid="live-de-events">
                  {Array.isArray(detail.events) && (detail.events as object[]).length ? (
                    (detail.events as Array<{ eventType?: string; createdAt?: string }>).map(
                      (e, i) => (
                        <li key={i}>
                          {e.eventType} · {formatWhen(e.createdAt)}
                        </li>
                      )
                    )
                  ) : (
                    <li className="muted">No events yet.</li>
                  )}
                </ul>
                <p className="muted">
                  Opening this drawer does not copy a link or record customer activity.
                </p>
              </>
            ) : null}
          </aside>
        </>
      ) : null}
    </div>
  );
}
