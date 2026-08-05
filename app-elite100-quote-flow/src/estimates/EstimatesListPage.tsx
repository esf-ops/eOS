import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  computeEstimateStats,
  filterAndSortEstimateItems,
  formatEstimateTime,
  resolveEstimateCustomer,
  resolveEstimateDisplayName,
  resolveEstimateSource,
  summarizeRoomsLocal
} from "../lib/estimateGrouping.mjs";
import {
  fetchQuoteFlowEstimateDetail,
  fetchQuoteFlowEstimates,
  patchQuoteFlowEstimateScope,
  type QuoteFlowEstimateDetail,
  type QuoteFlowEstimateListItem,
  type QuoteFlowScopeRoom
} from "../lib/quoteFlowEstimatesApi";
import OfficialScopeEditor, { roomsFromOfficialScope } from "./OfficialScopeEditor";
import OfficialPricingPanel from "./OfficialPricingPanel";
import OfficialReviewPanel from "./OfficialReviewPanel";

type Props = {
  authToken: string;
  initialEstimateId?: string | null;
};

type ViewKey = "all" | "ai" | "manual" | "recent";
type SourceFilter = "any" | "ai" | "manual" | "unknown";
type StatusFilter = "any" | "scope_set" | "scope_edited" | "approved" | "priced";
type SortKey = "newest" | "oldest";
type WorkspaceSection =
  | "scope"
  | "pricing"
  | "review"
  | "digital"
  | "activity"
  | "handoff";

const VIEW_TABS: { key: ViewKey; label: string }[] = [
  { key: "all", label: "All scoped" },
  { key: "ai", label: "AI-sourced scope" },
  { key: "manual", label: "Manual scope" },
  { key: "recent", label: "Recently updated" }
];

const PAGE_SIZES = [25, 50, 100] as const;

const SECTIONS: {
  key: WorkspaceSection;
  label: string;
  placeholder: string;
  active: boolean;
}[] = [
  { key: "scope", label: "Scope", placeholder: "", active: true },
  {
    key: "pricing",
    label: "Pricing",
    placeholder: "",
    active: true
  },
  {
    key: "review",
    label: "Review",
    placeholder: "",
    active: true
  },
  {
    key: "digital",
    label: "Digital Estimate",
    placeholder: "Customer quote publishing will be added after pricing and approval.",
    active: false
  },
  {
    key: "activity",
    label: "Activity",
    placeholder: "Customer selections and revision activity will appear here later.",
    active: false
  },
  {
    key: "handoff",
    label: "Handoff",
    placeholder: "Sold job handoff will be added after the customer accepts the quote.",
    active: false
  }
];

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

function statusPillClass(statusKey: string | undefined): string {
  const k = String(statusKey || "");
  if (k === "scope_edited" || k === "needs_review") return "qf-pill qf-pill--go";
  if (k === "scope_set") return "qf-pill qf-pill--ready";
  if (k === "priced" || k === "approved") return "qf-pill qf-pill--done";
  return "qf-pill";
}

function roomsFingerprint(rooms: QuoteFlowScopeRoom[]): string {
  try {
    return JSON.stringify(rooms ?? []);
  } catch {
    return "";
  }
}

function formatScopeCell(item: QuoteFlowEstimateListItem): string {
  const s = item.scopeSummary;
  if (!s) return "—";
  const parts: string[] = [];
  if (s.roomCount != null) parts.push(`${s.roomCount} room${s.roomCount === 1 ? "" : "s"}`);
  if (s.pieceCount != null) parts.push(`${s.pieceCount} piece${s.pieceCount === 1 ? "" : "s"}`);
  if (s.countertopSf != null && Number(s.countertopSf) > 0) {
    parts.push(`${Number(s.countertopSf).toFixed(1)} SF`);
  }
  if (s.backsplashSf != null && Number(s.backsplashSf) > 0) {
    parts.push(`${Number(s.backsplashSf).toFixed(1)} splash SF`);
  }
  return parts.length ? parts.join(" · ") : s.label || "—";
}

function formatOpenEdgeCell(item: QuoteFlowEstimateListItem): string {
  const lf = item.scopeSummary?.openEdgeLf;
  if (lf == null || !Number.isFinite(Number(lf))) return "0.0";
  return Number(lf).toFixed(1);
}

export default function EstimatesListPage(props: Props) {
  const { authToken, initialEstimateId = null } = props;
  const [items, setItems] = useState<QuoteFlowEstimateListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<QuoteFlowEstimateDetail | null>(null);
  const [rooms, setRooms] = useState<QuoteFlowScopeRoom[]>([]);
  const [estimateName, setEstimateName] = useState("");
  const [savedRoomsFp, setSavedRoomsFp] = useState("");
  const [savedName, setSavedName] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("any");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("any");
  const [sort, setSort] = useState<SortKey>("newest");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(50);
  const [pageOffset, setPageOffset] = useState(0);
  const [section, setSection] = useState<WorkspaceSection>("scope");
  const listInFlightRef = useRef(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const stats = useMemo(() => computeEstimateStats(items), [items]);
  const filteredRows = useMemo(
    () =>
      filterAndSortEstimateItems(items, {
        view,
        source: sourceFilter,
        status: statusFilter,
        search,
        sort
      }) as QuoteFlowEstimateListItem[],
    [items, view, sourceFilter, statusFilter, search, sort]
  );
  const pageRows = useMemo(
    () => filteredRows.slice(pageOffset, pageOffset + pageSize),
    [filteredRows, pageOffset, pageSize]
  );
  const showingFrom = filteredRows.length === 0 ? 0 : pageOffset + 1;
  const showingTo = Math.min(pageOffset + pageSize, filteredRows.length);
  const hasMore = pageOffset + pageSize < filteredRows.length;
  const activeFilterCount =
    (search ? 1 : 0) +
    (sourceFilter !== "any" ? 1 : 0) +
    (statusFilter !== "any" ? 1 : 0) +
    (sort !== "newest" ? 1 : 0);

  const selectedListRow = useMemo(
    () => items.find((r) => r.estimateId === selectedId) || null,
    [items, selectedId]
  );
  const workspaceItem = detail || selectedListRow;
  const localSummary = useMemo(() => summarizeRoomsLocal(rooms), [rooms]);
  const dirty =
    Boolean(selectedId) &&
    modalOpen &&
    (roomsFingerprint(rooms) !== savedRoomsFp ||
      String(estimateName || "").trim() !== String(savedName || "").trim());
  const showSyncing = isRefreshing || saving;

  function applyLoadedEstimate(est: QuoteFlowEstimateDetail) {
    setDetail(est);
    const nextRooms = roomsFromOfficialScope(est.scope?.rooms);
    setRooms(nextRooms);
    const name = resolveEstimateDisplayName(est);
    setEstimateName(name);
    setSavedName(name);
    setSavedRoomsFp(roomsFingerprint(nextRooms));
  }

  async function loadList(mode: "initial" | "refresh" = "refresh") {
    if (listInFlightRef.current) return;
    listInFlightRef.current = true;
    if (mode === "initial") setInitialLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowEstimates(authToken);
      setItems(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      if (items.length === 0) {
        setError(errorMessage(e));
        setItems([]);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      listInFlightRef.current = false;
      setInitialLoading(false);
      setIsRefreshing(false);
    }
  }

  async function openEstimate(estimateId: string) {
    setSelectedId(estimateId);
    setModalOpen(true);
    setSection("scope");
    setDetailLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetchQuoteFlowEstimateDetail(authToken, estimateId);
      applyLoadedEstimate(res.estimate);
    } catch (e) {
      setDetail(null);
      setRooms([]);
      setEstimateName("");
      setError(errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setNotice(null);
    setSection("scope");
    // Keep selectedId so the library row stays highlighted after close.
  }

  function applyFilters() {
    setSearch(searchDraft.trim());
    setPageOffset(0);
  }

  function clearFilters() {
    setSearchDraft("");
    setSearch("");
    setSourceFilter("any");
    setStatusFilter("any");
    setSort("newest");
    setPageOffset(0);
  }

  useEffect(() => {
    void loadList("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  useEffect(() => {
    if (initialEstimateId) {
      void openEstimate(initialEstimateId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEstimateId, authToken]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  useEffect(() => {
    setPageOffset(0);
  }, [view, pageSize]);

  async function saveScope() {
    if (!selectedId || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const name = String(estimateName || "").trim() || resolveEstimateDisplayName(workspaceItem || {});
    try {
      const res = await patchQuoteFlowEstimateScope(authToken, selectedId, {
        rooms,
        projectName: name,
        estimateName: name,
        quoteFlowEstimateName: name
      });
      applyLoadedEstimate(res.estimate);
      setNotice(res.message || "Scope saved.");
      // Refresh library table behind the open modal — keep modal open.
      void loadList("refresh");
    } catch (e) {
      setError(errorMessage(e) || "Unable to save scope.");
    } finally {
      setSaving(false);
    }
  }

  const workspaceTitle = estimateName || resolveEstimateDisplayName(workspaceItem || {});
  const workspaceCustomer = resolveEstimateCustomer(workspaceItem || {});
  const workspaceSource = resolveEstimateSource(workspaceItem || {});

  return (
    <section
      className="qf-page qf-page--command qf-estimates--command qf-estimates--library qf-estimates--ql"
      data-testid="qf-estimates-page"
    >
      <header className="qf-el-hero" data-testid="qf-estimates-command-header">
        <div className="qf-el-hero__aurora" aria-hidden />
        <div className="qf-el-hero__grid">
          <div className="qf-el-hero__main">
            <p className="qf-el-hero__eyebrow">Internal tool · Quote Flow</p>
            <h1 className="qf-el-hero__title">Estimate command center</h1>
            <p className="qf-el-hero__sub">
              Manage scoped estimates before pricing and customer quote delivery.
            </p>
          </div>
          <div className="qf-el-hero__aside">
            <button
              type="button"
              className="qf-btn-secondary"
              data-testid="qf-estimates-refresh"
              disabled={showSyncing}
              onClick={() => void loadList("refresh")}
            >
              {showSyncing ? "Syncing…" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <div className="qf-el-metrics" data-testid="qf-estimates-stats">
        <div className={stats.total === 0 ? "qf-el-metric is-zero" : "qf-el-metric"}>
          <span className="qf-el-metric__val">{stats.total}</span>
          <span className="qf-el-metric__lbl">Scoped estimates</span>
        </div>
        <div className={stats.recentlyUpdated === 0 ? "qf-el-metric is-zero" : "qf-el-metric"}>
          <span className="qf-el-metric__val">{stats.recentlyUpdated}</span>
          <span className="qf-el-metric__lbl">Recently updated</span>
        </div>
        <div className={stats.aiSourced === 0 ? "qf-el-metric is-zero" : "qf-el-metric"}>
          <span className="qf-el-metric__val">{stats.aiSourced}</span>
          <span className="qf-el-metric__lbl">AI-sourced scope</span>
        </div>
        <div className={stats.manual === 0 ? "qf-el-metric is-zero" : "qf-el-metric"}>
          <span className="qf-el-metric__val">{stats.manual}</span>
          <span className="qf-el-metric__lbl">Manual scope</span>
        </div>
        <div
          className={stats.totalCountertopSf === 0 ? "qf-el-metric is-zero" : "qf-el-metric"}
          data-testid="qf-estimates-metric-sf"
        >
          <span className="qf-el-metric__val">
            {stats.totalCountertopSf > 0 ? stats.totalCountertopSf.toFixed(0) : "0"}
          </span>
          <span className="qf-el-metric__lbl">Total countertop SF</span>
        </div>
        <div
          className={stats.totalOpenEdgeLf === 0 ? "qf-el-metric is-zero" : "qf-el-metric"}
          data-testid="qf-estimates-metric-open-edge"
        >
          <span className="qf-el-metric__val">
            {stats.totalOpenEdgeLf > 0 ? stats.totalOpenEdgeLf.toFixed(0) : "0"}
          </span>
          <span className="qf-el-metric__lbl">Total open edge LF</span>
        </div>
      </div>

      <div
        className="qf-el-tabs"
        role="tablist"
        aria-label="Estimate views"
        data-testid="qf-estimates-view-tabs"
      >
        {VIEW_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={view === t.key}
            className={view === t.key ? "is-on" : undefined}
            data-testid={`qf-estimates-filter-${t.key}`}
            onClick={() => setView(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="qf-el-card" data-testid="qf-estimates-filters">
        <div className="qf-el-card__head">
          <h2>Search &amp; filters</h2>
          <span className="qf-el-card__meta">
            {activeFilterCount
              ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`
              : "No filters applied"}
          </span>
        </div>
        <div className="qf-el-filter-grid">
          <label className="qf-el-search-span">
            Global search
            <input
              type="search"
              placeholder="Search name, customer, subject, plan…"
              value={searchDraft}
              data-testid="qf-estimates-search"
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
          </label>
          <label>
            Source
            <select
              value={sourceFilter}
              data-testid="qf-estimates-source-filter"
              onChange={(e) => {
                setSourceFilter(e.target.value as SourceFilter);
                setPageOffset(0);
              }}
            >
              <option value="any">Any source</option>
              <option value="ai">AI-sourced</option>
              <option value="manual">Manual</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label>
            Status
            <select
              value={statusFilter}
              data-testid="qf-estimates-status-filter"
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
                setPageOffset(0);
              }}
            >
              <option value="any">Any status</option>
              <option value="scope_set">Scope set</option>
              <option value="scope_edited">Scope edited</option>
              <option value="approved">Approved</option>
              <option value="priced">Priced</option>
            </select>
          </label>
          <label>
            Updated
            <select
              value={sort}
              data-testid="qf-estimates-sort"
              onChange={(e) => {
                setSort(e.target.value as SortKey);
                setPageOffset(0);
              }}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
        <div className="qf-el-filter-toolbar">
          <button
            type="button"
            className="qf-btn-primary"
            data-testid="qf-estimates-apply-filters"
            onClick={applyFilters}
          >
            Apply
          </button>
          <button
            type="button"
            className="qf-btn-secondary"
            data-testid="qf-estimates-clear-filters"
            onClick={clearFilters}
          >
            Clear
          </button>
        </div>
      </section>

      {error && !modalOpen ? (
        <div className="qf-error-box" role="alert">
          {error}
        </div>
      ) : null}

      <section className="qf-el-card" data-testid="qf-estimates-layout">
        <div className="qf-el-card__head">
          <h2>Estimates</h2>
          <span className="qf-el-card__meta" data-testid="qf-estimates-list-meta">
            {filteredRows.length === 0
              ? "0 shown"
              : `Showing ${showingFrom}–${showingTo} of ${filteredRows.length}`}
          </span>
        </div>

        <div className="qf-el-list-toolbar">
          <div className="qf-el-pagination" data-testid="qf-estimates-pagination">
            <button
              type="button"
              className="qf-btn-secondary qf-btn-xs"
              disabled={pageOffset <= 0}
              onClick={() => setPageOffset(Math.max(0, pageOffset - pageSize))}
            >
              Previous
            </button>
            <button
              type="button"
              className="qf-btn-secondary qf-btn-xs"
              disabled={!hasMore}
              onClick={() => setPageOffset(pageOffset + pageSize)}
            >
              Next
            </button>
            <label className="qf-el-page-size">
              Page size
              <select
                value={pageSize}
                data-testid="qf-estimates-page-size"
                onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="qf-estimates-library" data-testid="qf-estimates-list">
          {initialLoading ? <p className="qf-muted">Loading estimates…</p> : null}
          {!initialLoading && filteredRows.length === 0 ? (
            <div className="qf-el-empty" data-testid="qf-estimates-empty">
              <h3>No scoped estimates yet</h3>
              <p className="qf-muted">
                Create official scope in Estimate Queue to add estimates here. Unscoped queue work
                does not appear in this library.
              </p>
            </div>
          ) : null}
          {!initialLoading && pageRows.length > 0 ? (
            <div className="qf-el-table-wrap">
              <table className="qf-el-table" data-testid="qf-estimates-table">
                <thead>
                  <tr>
                    <th>Estimate</th>
                    <th className="qf-el-hide-sm">Customer / request</th>
                    <th className="qf-el-hide-md">Plan / project</th>
                    <th>Scope</th>
                    <th className="qf-el-hide-sm">Open edge LF</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th className="qf-el-hide-md">Updated</th>
                    <th className="qf-el-col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((item) => {
                    const id = item.estimateId || "";
                    const active = Boolean(id && id === selectedId);
                    const title = resolveEstimateDisplayName(item);
                    const customer = resolveEstimateCustomer(item);
                    const source = resolveEstimateSource(item);
                    const when =
                      formatEstimateTime(item.updatedAt) || formatEstimateTime(item.createdAt);
                    const planOrProject =
                      item.planFilename || item.projectName || item.subject || "—";

                    return (
                      <tr
                        key={id || `${item.intakeCaseId}-${item.updatedAt}`}
                        className={active ? "is-active" : undefined}
                        data-testid="qf-estimates-row"
                        data-estimate-id={id}
                        data-source={source.key}
                        onClick={() => id && void openEstimate(id)}
                      >
                        <td>
                          <div className="qf-el-cell-primary">{title}</div>
                          <div className="qf-el-cell-sub qf-el-show-sm-only">{source.label}</div>
                        </td>
                        <td className="qf-el-hide-sm">
                          <span data-testid="qf-estimates-row-customer">{customer || "—"}</span>
                        </td>
                        <td className="qf-el-hide-md">
                          <span className="qf-el-cell-sub">{planOrProject}</span>
                        </td>
                        <td>
                          <span data-testid="qf-estimates-row-summary">{formatScopeCell(item)}</span>
                        </td>
                        <td className="qf-el-hide-sm" data-testid="qf-estimates-row-open-edge">
                          {formatOpenEdgeCell(item)}
                        </td>
                        <td>
                          <span
                            className="qf-pill qf-pill--source"
                            data-testid="qf-estimates-row-source"
                          >
                            {source.label}
                          </span>
                        </td>
                        <td>
                          <span
                            className={statusPillClass(item.status?.key)}
                            data-testid="qf-estimates-row-status"
                            data-status={item.status?.key || ""}
                          >
                            {item.status?.label || "Scope set"}
                          </span>
                        </td>
                        <td className="qf-el-hide-md">
                          <span data-testid="qf-estimates-row-updated">{when || "—"}</span>
                        </td>
                        <td className="qf-el-col-actions">
                          <button
                            type="button"
                            className="qf-btn-primary qf-btn-xs"
                            data-testid="qf-estimates-open"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (id) void openEstimate(id);
                            }}
                          >
                            Edit official scope
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>

      {modalOpen ? (
        <div
          className="qf-estimates-modal-backdrop"
          data-testid="qf-estimates-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="qf-estimates-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qf-estimates-modal-title"
            data-testid="qf-estimates-detail"
          >
            <div className="qf-estimates-modal__header" data-testid="qf-estimates-workspace">
              <div className="qf-estimates-modal__header-top">
                <div>
                  <p className="qf-estimates-modal__eyebrow">Official estimate</p>
                  <h2 id="qf-estimates-modal-title">{workspaceTitle || "Estimate"}</h2>
                </div>
                <div className="qf-estimates-modal__header-actions">
                  {section === "scope" ? (
                    <button
                      type="button"
                      className="qf-btn-primary"
                      data-testid="qf-estimates-save-scope"
                      disabled={saving || !dirty || detailLoading}
                      onClick={() => void saveScope()}
                    >
                      {saving ? "Saving…" : "Save Scope"}
                    </button>
                  ) : null}
                  <button
                    ref={closeBtnRef}
                    type="button"
                    className="qf-btn-secondary"
                    data-testid="qf-estimates-modal-close"
                    onClick={closeModal}
                  >
                    Back to library
                  </button>
                </div>
              </div>

              {error ? (
                <div className="qf-error-box" role="alert">
                  {error}
                </div>
              ) : null}
              {notice ? (
                <p className="qf-notice" data-testid="qf-estimates-notice">
                  {notice}
                </p>
              ) : null}

              <label className="qf-estimates__name-field" data-testid="qf-estimates-name">
                Estimate name
                <input
                  type="text"
                  value={estimateName}
                  data-testid="qf-estimates-name-input"
                  disabled={saving || detailLoading}
                  onChange={(e) => {
                    setEstimateName(e.target.value);
                    setNotice(null);
                  }}
                />
              </label>
              {workspaceCustomer && workspaceCustomer !== workspaceTitle ? (
                <p className="qf-muted" data-testid="qf-estimates-customer">
                  {workspaceCustomer}
                </p>
              ) : null}
              <p className="qf-muted" data-testid="qf-estimates-provenance">
                Source: {workspaceSource.label}
                {workspaceItem?.planFilename ? ` · Plan: ${workspaceItem.planFilename}` : ""}
                {workspaceItem?.updatedAt
                  ? ` · Updated ${formatEstimateTime(workspaceItem.updatedAt)}`
                  : ""}
              </p>
              <span
                className={statusPillClass(workspaceItem?.status?.key)}
                data-testid="qf-estimates-detail-status"
              >
                {dirty ? "Unsaved changes" : workspaceItem?.status?.label || "Scope set"}
              </span>

              <div className="qf-estimates__summary-cards" data-testid="qf-estimates-summary">
                <div className="qf-estimates__summary-card">
                  <span className="qf-stat__value">{localSummary.roomCount}</span>
                  <span className="qf-stat__label">Rooms</span>
                </div>
                <div className="qf-estimates__summary-card">
                  <span className="qf-stat__value">{localSummary.pieceCount}</span>
                  <span className="qf-stat__label">Pieces</span>
                </div>
                <div className="qf-estimates__summary-card">
                  <span className="qf-stat__value">
                    {localSummary.countertopSf > 0 ? localSummary.countertopSf.toFixed(1) : "—"}
                  </span>
                  <span className="qf-stat__label">Countertop SF</span>
                </div>
                <div className="qf-estimates__summary-card">
                  <span className="qf-stat__value">
                    {localSummary.backsplashSf > 0 ? localSummary.backsplashSf.toFixed(1) : "—"}
                  </span>
                  <span className="qf-stat__label">Backsplash SF</span>
                </div>
                <div className="qf-estimates__summary-card" data-testid="qf-estimates-summary-open-edge">
                  <span className="qf-stat__value">
                    {(localSummary.openEdgeLf || 0).toFixed(1)}
                  </span>
                  <span className="qf-stat__label">Open edge LF</span>
                </div>
              </div>

              <div
                className="qf-estimates__section-tabs"
                role="tablist"
                aria-label="Estimate sections"
                data-testid="qf-estimates-sections"
              >
                {SECTIONS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    role="tab"
                    aria-selected={section === s.key}
                    className={
                      section === s.key
                        ? "qf-estimates__section-tab is-active"
                        : s.active
                          ? "qf-estimates__section-tab"
                          : "qf-estimates__section-tab is-later"
                    }
                    data-testid={`qf-estimates-tab-${s.key}`}
                    onClick={() => setSection(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="qf-estimates-modal__body">
              {detailLoading && !workspaceItem ? (
                <p className="qf-muted">Loading estimate…</p>
              ) : null}
              {section === "scope" ? (
                <section
                  className="qf-estimates__section is-active"
                  data-testid="qf-estimates-section-scope"
                >
                  <OfficialScopeEditor
                    rooms={rooms}
                    onChange={(next) => {
                      setRooms(next);
                      setNotice(null);
                    }}
                    disabled={saving || detailLoading}
                  />
                </section>
              ) : section === "pricing" && selectedId ? (
                <section
                  className="qf-estimates__section is-active"
                  data-testid="qf-estimates-section-pricing"
                >
                  <OfficialPricingPanel
                    authToken={authToken}
                    estimateId={selectedId}
                    estimateName={estimateName || resolveEstimateDisplayName(workspaceItem)}
                    customerLabel={resolveEstimateCustomer(workspaceItem)}
                    disabled={saving || detailLoading || dirty}
                  />
                  {dirty ? (
                    <p className="qf-muted" data-testid="qf-pricing-scope-dirty-hint">
                      Save Scope before calculating pricing so quantities stay in sync.
                    </p>
                  ) : null}
                </section>
              ) : section === "review" && selectedId ? (
                <section
                  className="qf-estimates__section is-active"
                  data-testid="qf-estimates-section-review"
                >
                  <OfficialReviewPanel
                    authToken={authToken}
                    estimateId={selectedId}
                    disabled={saving || detailLoading || dirty}
                    onApproved={() => {
                      void loadList("refresh");
                      if (selectedId) void openEstimate(selectedId);
                    }}
                    onReopened={() => {
                      void loadList("refresh");
                      if (selectedId) void openEstimate(selectedId);
                    }}
                  />
                  {dirty ? (
                    <p className="qf-muted" data-testid="qf-review-scope-dirty-hint">
                      Save Scope before approving so quantities stay in sync.
                    </p>
                  ) : null}
                </section>
              ) : (
                <section
                  className="qf-estimates__section is-later"
                  data-testid={`qf-estimates-section-${section}`}
                  aria-disabled="true"
                >
                  <div
                    className="qf-estimates__placeholder-card"
                    data-testid="qf-estimates-section-later"
                  >
                    <h3>{SECTIONS.find((s) => s.key === section)?.label}</h3>
                    <p className="qf-muted">
                      {SECTIONS.find((s) => s.key === section)?.placeholder || "Coming later."}
                    </p>
                    <p className="qf-muted">Coming later — not available in this slice.</p>
                  </div>
                </section>
              )}
            </div>

            {section === "scope" && dirty ? (
              <div
                className="qf-estimates-modal__sticky-save"
                data-testid="qf-estimates-sticky-save"
              >
                <span className="qf-estimates-modal__sticky-label">Unsaved scope changes</span>
                <button
                  type="button"
                  className="qf-btn-primary"
                  data-testid="qf-estimates-save-scope-sticky"
                  disabled={saving || detailLoading}
                  onClick={() => void saveScope()}
                >
                  {saving ? "Saving…" : "Save Scope"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
