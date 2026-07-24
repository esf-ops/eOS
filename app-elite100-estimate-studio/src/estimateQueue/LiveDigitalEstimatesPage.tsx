import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiPost, isAbortError } from "../lib/api";

const PREFS_KEY = "elite100_live_digital_estimates_view_v1";

export type LiveDigitalEstimatesPageProps = {
  authToken: string | null;
  onOpenEstimate: (caseId: string, options?: { openTarget?: string }) => void;
  onOpenReviewRequest?: (reviewRequestId: string) => void;
  onOpenLegacyPublishSearch?: () => void;
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
  activePublicationCount: number;
  totalActivePublishedValue: number;
  latestCustomerActivityAt: string | null;
  needingAttentionCount: number;
  quickbooksLinked: boolean | null;
  publications: PubRow[];
};

type Metrics = {
  activePublications: number;
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
  expiringWithinDays: string;
  groupByAccount: boolean;
  collapsedGroups: string[];
};

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
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function LiveDigitalEstimatesPage({
  authToken,
  onOpenEstimate,
  onOpenReviewRequest,
  onOpenLegacyPublishSearch
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
    if (prefs.expiringWithinDays) sp.set("expiringWithinDays", prefs.expiringWithinDays);
    sp.set("groupByAccount", prefs.groupByAccount ? "1" : "0");
    sp.set("limit", String(pagination.limit));
    sp.set("offset", String(pagination.offset));
    return sp.toString();
  }, [prefs, pagination.limit, pagination.offset]);

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

  async function openDetail(publicationId: string) {
    if (!authToken) return;
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

  async function copyCustomerLink(publicationId: string) {
    if (!authToken || busy) return;
    if (!window.confirm("Copy the customer Digital Estimate link to your clipboard?")) return;
    setBusy(true);
    setActionNotice(null);
    try {
      // Explicit staff link recovery via existing publication detail (authorized).
      const pub = (await apiGet(
        `/api/elite100-estimate-studio/publications/${encodeURIComponent(publicationId)}`,
        authToken
      )) as { customerUrl?: string | null; publication?: { id?: string } };
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
      await openDetail(publicationId);
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

  function runPrimaryAction(row: PubRow) {
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

  const selectedRow = useMemo(() => {
    for (const g of groups) {
      const hit = g.publications.find((p) => p.publicationId === selectedId);
      if (hit) return hit;
    }
    return null;
  }, [groups, selectedId]);

  return (
    <div className="live-de" data-testid="live-digital-estimates-page">
      <header className="live-de-header">
        <div>
          <h2 data-testid="live-de-title">Live Digital Estimates</h2>
          <p className="muted">
            Active Digital Estimates currently out with customers — what they have done, and what to do
            next.
          </p>
        </div>
        {onOpenLegacyPublishSearch ? (
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="live-de-open-publish-search"
            onClick={onOpenLegacyPublishSearch}
          >
            Find estimate to publish
          </button>
        ) : null}
      </header>

      <div className="live-de-tabs" role="tablist" aria-label="Portfolio mode">
        {(
          [
            ["", "Active"],
            ["published_not_viewed", "Not viewed"],
            ["viewed", "Viewed"],
            ["review_requested", "Review requested"],
            ["expiring", "Expiring"],
            ["history", "History"]
          ] as const
        ).map(([key, label]) => {
          const active =
            key === "history"
              ? prefs.history
              : key === "expiring"
                ? prefs.expiringWithinDays === "7"
                : !prefs.history && prefs.status === key;
          return (
            <button
              key={key || "active"}
              type="button"
              role="tab"
              aria-selected={active}
              className={active ? "active" : ""}
              data-testid={`live-de-tab-${key || "active"}`}
              onClick={() => {
                setPagination((p) => ({ ...p, offset: 0 }));
                if (key === "history") {
                  setPrefs((p) => ({ ...p, history: true, status: "", expiringWithinDays: "" }));
                } else if (key === "expiring") {
                  setPrefs((p) => ({
                    ...p,
                    history: false,
                    status: "",
                    expiringWithinDays: "7"
                  }));
                } else {
                  setPrefs((p) => ({
                    ...p,
                    history: false,
                    status: key,
                    expiringWithinDays: ""
                  }));
                }
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {metrics ? (
        <div className="live-de-metrics" data-testid="live-de-metrics">
          {(
            [
              ["Active publications", metrics.activePublications],
              ["Published — not viewed", metrics.publishedNotViewed],
              ["Viewed / active", metrics.viewedOrActive],
              ["Review requested", metrics.reviewRequested],
              ["Revision required", metrics.revisionRequired],
              ["Expiring within 7 days", metrics.expiringWithin7Days],
              ["Total active published value", money(metrics.totalActivePublishedValue)]
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="live-de-metric-card">
              <div className="live-de-metric-label">{label}</div>
              <div className="live-de-metric-value">{value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="live-de-filters" data-testid="live-de-filters">
        <input
          type="search"
          value={prefs.q}
          placeholder="Search account, customer, project, quote…"
          aria-label="Search Live Digital Estimates"
          data-testid="live-de-search"
          onChange={(e) => {
            setPagination((p) => ({ ...p, offset: 0 }));
            setPrefs((p) => ({ ...p, q: e.target.value }));
          }}
        />
        <select
          aria-label="Account link filter"
          data-testid="live-de-filter-account-linked"
          value={prefs.accountLinked}
          onChange={(e) => setPrefs((p) => ({ ...p, accountLinked: e.target.value }))}
        >
          <option value="">All accounts</option>
          <option value="linked">Account Directory linked</option>
          <option value="unlinked">Unlinked customers</option>
        </select>
        <label className="live-de-check">
          <input
            type="checkbox"
            checked={prefs.needsAttentionOnly}
            data-testid="live-de-filter-attention"
            onChange={(e) => setPrefs((p) => ({ ...p, needsAttentionOnly: e.target.checked }))}
          />
          Needs attention only
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
      </div>

      {loading ? (
        <p className="muted" data-testid="live-de-loading">
          Loading Live Digital Estimates…
        </p>
      ) : null}
      {error ? (
        <div className="error-box" role="alert" data-testid="live-de-error">
          {error}
        </div>
      ) : null}
      {!loading && !error && groups.length === 0 ? (
        <p className="muted" data-testid="live-de-empty">
          No Digital Estimates match these filters.
        </p>
      ) : null}

      <div className="live-de-layout">
        <div className="live-de-list" data-testid="live-de-list">
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
                    <span className="muted">
                      {g.activePublicationCount} active · {money(g.totalActivePublishedValue)}
                      {g.needingAttentionCount
                        ? ` · ${g.needingAttentionCount} need attention`
                        : ""}
                      {g.isUnlinkedGroup
                        ? ""
                        : g.quickbooksLinked
                          ? " · QuickBooks Linked"
                          : " · QuickBooks Not Linked"}
                    </span>
                  </button>
                </header>
                {!collapsed
                  ? g.publications.map((row) => (
                      <article
                        key={row.publicationId}
                        className={`live-de-row${selectedId === row.publicationId ? " selected" : ""}`}
                        data-testid="live-de-publication-row"
                      >
                        <button
                          type="button"
                          className="live-de-row-main"
                          onClick={() => void openDetail(row.publicationId)}
                        >
                          <div className="live-de-row-title">
                            <strong>
                              {row.customerDisplayName || "Customer"} · {row.projectName || "Project"}
                            </strong>
                            <span className="live-de-status" data-status={row.operationalStatus}>
                              {row.statusLabel}
                            </span>
                          </div>
                          <div className="muted live-de-row-meta">
                            {row.quoteNumber || "—"} {row.revisionLabel || ""} · Published{" "}
                            {formatWhen(row.publishedAt)}
                            {row.ageDays != null ? ` · ${row.ageDays}d old` : ""}
                            {row.pricingValidThrough
                              ? ` · Pricing through ${row.pricingValidThrough}`
                              : ""}
                            {" · "}
                            {money(row.publishedValue)}
                            {row.configuredDelta != null
                              ? ` · Δ ${money(row.configuredDelta)}`
                              : ""}
                            {row.lastCustomerActivityLabel
                              ? ` · ${row.lastCustomerActivityLabel}`
                              : " · No customer activity yet"}
                            {row.publishedAsNote ? ` · ${row.publishedAsNote}` : ""}
                          </div>
                          {row.attentionReasons?.length ? (
                            <ul className="live-de-badges">
                              {row.attentionReasons.map((r) => (
                                <li key={r}>{r.replace(/_/g, " ")}</li>
                              ))}
                            </ul>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="eq-btn-primary live-de-next"
                          data-testid="live-de-next-action"
                          onClick={() => runPrimaryAction(row)}
                        >
                          {row.nextAction?.label || "Open"}
                        </button>
                      </article>
                    ))
                  : null}
              </section>
            );
          })}
          <div className="live-de-pager">
            <button
              type="button"
              disabled={pagination.offset <= 0 || loading}
              data-testid="live-de-prev"
              onClick={() =>
                setPagination((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))
              }
            >
              Previous
            </button>
            <span className="muted" data-testid="live-de-page-meta">
              {pagination.offset + 1}–{Math.min(pagination.offset + pagination.limit, pagination.total)} of{" "}
              {pagination.total}
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

        <aside
          className="live-de-detail panel"
          data-testid="live-de-detail-drawer"
          aria-label="Publication detail"
        >
          {!selectedId ? (
            <p className="muted">Select a publication to manage its link, history, and next action.</p>
          ) : detailLoading ? (
            <p className="muted">Loading detail…</p>
          ) : detailError ? (
            <div className="error-box">{detailError}</div>
          ) : detail ? (
            <>
              <h3>Publication detail</h3>
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
                  className="eq-btn-primary"
                  data-testid="live-de-copy-link"
                  disabled={busy}
                  onClick={() => selectedId && void copyCustomerLink(selectedId)}
                >
                  Copy customer link
                </button>
                <button
                  type="button"
                  className="eq-btn-secondary"
                  data-testid="live-de-replace-link"
                  disabled={busy}
                  onClick={() => selectedId && void replaceLink(selectedId)}
                >
                  Replace link
                </button>
                <button
                  type="button"
                  className="eq-btn-secondary"
                  data-testid="live-de-revoke"
                  disabled={busy}
                  onClick={() => selectedId && void revokePublication(selectedId)}
                >
                  Revoke
                </button>
                {selectedRow?.intakeCaseId ? (
                  <button
                    type="button"
                    className="eq-btn-secondary"
                    data-testid="live-de-open-studio"
                    onClick={() =>
                      onOpenEstimate(selectedRow.intakeCaseId!, { openTarget: "digital" })
                    }
                  >
                    Open Studio Estimate
                  </button>
                ) : null}
                {selectedRow?.reviewRequestId && onOpenReviewRequest ? (
                  <button
                    type="button"
                    className="eq-btn-secondary"
                    data-testid="live-de-open-review"
                    onClick={() => onOpenReviewRequest(selectedRow.reviewRequestId!)}
                  >
                    Open review request
                  </button>
                ) : null}
              </div>
              <h4>Events</h4>
              <ul className="live-de-events" data-testid="live-de-events">
                {Array.isArray(detail.events) && (detail.events as object[]).length
                  ? (detail.events as Array<{ eventType?: string; createdAt?: string }>).map(
                      (e, i) => (
                        <li key={i}>
                          {e.eventType} · {formatWhen(e.createdAt)}
                        </li>
                      )
                    )
                  : (
                    <li className="muted">No events yet.</li>
                  )}
              </ul>
              <p className="muted">
                Opening this drawer does not copy a link or record customer activity.
              </p>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
