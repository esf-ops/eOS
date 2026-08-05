import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  computeEstimateStats,
  filterEstimateItems,
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

type Props = {
  authToken: string;
  initialEstimateId?: string | null;
};

type FilterKey = "all" | "ai" | "manual" | "recent";
type WorkspaceSection =
  | "scope"
  | "pricing"
  | "review"
  | "digital"
  | "activity"
  | "handoff";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All scoped" },
  { key: "ai", label: "AI-sourced scope" },
  { key: "manual", label: "Manual scope" },
  { key: "recent", label: "Recently updated" }
];

const SECTIONS: {
  key: WorkspaceSection;
  label: string;
  placeholder: string;
}[] = [
  { key: "scope", label: "Scope", placeholder: "" },
  {
    key: "pricing",
    label: "Pricing",
    placeholder: "Pricing will be added after official scope editing is finalized."
  },
  {
    key: "review",
    label: "Review",
    placeholder: "Estimate review and approval will be added in a later slice."
  },
  {
    key: "digital",
    label: "Digital Estimate",
    placeholder: "Customer quote publishing will be added after pricing and approval."
  },
  {
    key: "activity",
    label: "Activity",
    placeholder: "Customer selections and revision activity will appear here later."
  },
  {
    key: "handoff",
    label: "Handoff",
    placeholder: "Sold job handoff will be added after the customer accepts the quote."
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
  if (k === "scope_edited") return "qf-pill qf-pill--go";
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
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [section, setSection] = useState<WorkspaceSection>("scope");
  const listInFlightRef = useRef(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const stats = useMemo(() => computeEstimateStats(items), [items]);
  const visibleRows = useMemo(
    () => filterEstimateItems(items, filter, search) as QuoteFlowEstimateListItem[],
    [items, filter, search]
  );
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
    // Keep selectedId so the library card stays highlighted after close.
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
      // Refresh library behind the open modal — keep modal open.
      void loadList("refresh");
    } catch (e) {
      setError(errorMessage(e) || "Unable to save scope.");
    } finally {
      setSaving(false);
    }
  }

  function renderRow(item: QuoteFlowEstimateListItem) {
    const id = item.estimateId || "";
    const active = Boolean(id && id === selectedId);
    const title = resolveEstimateDisplayName(item);
    const customer = resolveEstimateCustomer(item);
    const source = resolveEstimateSource(item);
    const when = formatEstimateTime(item.updatedAt) || formatEstimateTime(item.createdAt);
    const summary = item.scopeSummary?.label || "Scope set";
    const openEdge =
      item.scopeSummary?.openEdgeLf != null && Number(item.scopeSummary.openEdgeLf) > 0
        ? `${Number(item.scopeSummary.openEdgeLf).toFixed(1)} LF open edge`
        : null;

    return (
      <li key={id || `${item.intakeCaseId}-${item.updatedAt}`}>
        <article
          className={
            active
              ? "qf-estimates__card is-active"
              : "qf-estimates__card"
          }
          data-testid="qf-estimates-row"
          data-estimate-id={id}
          data-source={source.key}
        >
          <button
            type="button"
            className="qf-estimates__card-main"
            onClick={() => id && void openEstimate(id)}
          >
            <span className="qf-inbox__row-title">{title}</span>
            {customer && customer !== title ? (
              <span className="qf-inbox__row-meta">{customer}</span>
            ) : null}
            <span className="qf-inbox__row-meta" data-testid="qf-estimates-row-source">
              Source: {source.label}
            </span>
            {item.planFilename ? (
              <span className="qf-inbox__row-meta">Plan: {item.planFilename}</span>
            ) : null}
            {when ? <span className="qf-inbox__row-meta">Updated {when}</span> : null}
            <span className="qf-inbox__row-meta" data-testid="qf-estimates-row-summary">
              {summary}
              {openEdge && !String(summary).includes("open edge") ? ` · ${openEdge}` : ""}
            </span>
            <span className="qf-inbox__row-status-line">
              <span
                className={statusPillClass(item.status?.key)}
                data-testid="qf-estimates-row-status"
                data-status={item.status?.key || ""}
              >
                {item.status?.label || "Scope set"}
              </span>
              <span className="qf-inbox__next">Open estimate</span>
            </span>
          </button>
          <div className="qf-estimates__card-actions">
            <button
              type="button"
              className="qf-btn-primary"
              data-testid="qf-estimates-open"
              onClick={() => id && void openEstimate(id)}
            >
              Edit official scope
            </button>
          </div>
        </article>
      </li>
    );
  }

  const workspaceTitle = estimateName || resolveEstimateDisplayName(workspaceItem || {});
  const workspaceCustomer = resolveEstimateCustomer(workspaceItem || {});
  const workspaceSource = resolveEstimateSource(workspaceItem || {});

  return (
    <section
      className="qf-page qf-page--command qf-estimates--command qf-estimates--library"
      data-testid="qf-estimates-page"
    >
      <header className="qf-command-header" data-testid="qf-estimates-command-header">
        <div className="qf-command-header__titles">
          <h1>Estimates</h1>
          <p className="qf-muted">
            Manage official scoped estimates. Edit rooms, pieces, and dimensions before pricing and
            customer quote delivery.
          </p>
        </div>
        <div className="qf-command-header__actions">
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
      </header>

      <div className="qf-stats qf-stats--command" data-testid="qf-estimates-stats">
        <div className="qf-stat">
          <span className="qf-stat__value">{stats.total}</span>
          <span className="qf-stat__label">Scoped estimates</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{stats.recentlyUpdated}</span>
          <span className="qf-stat__label">Recently updated</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{stats.aiSourced}</span>
          <span className="qf-stat__label">AI-sourced scope</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{stats.manual}</span>
          <span className="qf-stat__label">Manual scope</span>
        </div>
      </div>

      <div className="qf-inbox-toolbar" data-testid="qf-estimates-toolbar">
        <div className="qf-filter-chips" role="tablist" aria-label="Estimate filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={filter === f.key ? "qf-chip is-active" : "qf-chip"}
              data-testid={`qf-estimates-filter-${f.key}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="qf-inbox-search">
          <span className="qf-sr-only">Search estimates</span>
          <input
            type="search"
            placeholder="Search name, customer, subject, plan…"
            value={search}
            data-testid="qf-estimates-search"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {error && !modalOpen ? (
        <div className="qf-error-box" role="alert">
          {error}
        </div>
      ) : null}

      <div className="qf-estimates-library" data-testid="qf-estimates-layout">
        <div className="qf-estimates__list qf-estimates__list--library" data-testid="qf-estimates-list">
          <div className="qf-inbox__list-head">
            <h2>Estimate library</h2>
            <span className="qf-muted">{visibleRows.length} shown</span>
          </div>
          {initialLoading ? <p className="qf-muted">Loading estimates…</p> : null}
          {!initialLoading && visibleRows.length === 0 ? (
            <div className="qf-placeholder" data-testid="qf-estimates-empty">
              <h3>No scoped estimates yet</h3>
              <p className="qf-muted">
                Create official scope in Estimate Queue to add estimates here. Unscoped queue work
                does not appear in this library.
              </p>
            </div>
          ) : null}
          <ul className="qf-estimates__cards">{visibleRows.map((item) => renderRow(item))}</ul>
        </div>
      </div>

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
                        : s.key === "scope"
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
          </div>
        </div>
      ) : null}
    </section>
  );
}
