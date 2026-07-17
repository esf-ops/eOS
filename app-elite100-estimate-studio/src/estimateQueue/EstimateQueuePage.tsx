import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  classifyQuoteIntakeError,
  createQuoteIntakeApiClient
} from "../lib/quoteIntakeApi.mjs";
import {
  caseReasonSnippets,
  computeQueueSummaryCounts,
  filterQuoteIntakeCases
} from "../lib/quoteIntakeFilter.mjs";
import {
  caseAttachmentStatusLabel,
  caseCustomerProjectLabel,
  caseMissingInfoLabel,
  caseReceivedAt,
  caseSenderLabel,
  caseStatusLabel,
  caseSupportedPdfLabel,
  formatAge,
  formatReceivedAt
} from "../lib/quoteIntakeFormat.mjs";
import {
  labelQuoteIntakeStatus,
  QUOTE_INTAKE_STATUS_OPTIONS
} from "../lib/quoteIntakeStatusLabels.mjs";
import type {
  QuoteIntakeAuditEventDto,
  QuoteIntakeCaseDto,
  QuoteIntakeQueueFilter,
  QuoteIntakeSafeConfig
} from "../lib/quoteIntakeTypes";
import { EMPTY_QUEUE_FILTER } from "../lib/quoteIntakeTypes";
import EstimateQueueCaseDetail from "./EstimateQueueCaseDetail";
import MailboxSyncModal from "./MailboxSyncModal";

type QuoteIntakeApiClient = ReturnType<typeof createQuoteIntakeApiClient>;

export type EstimateQueuePageProps = {
  authToken: string | null;
  selectedCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
  onOpenEstimate: (caseId: string) => void;
  apiClient?: QuoteIntakeApiClient;
};

type LoadState =
  | { kind: "idle" | "loading" }
  | { kind: "ready"; cases: QuoteIntakeCaseDto[]; config: QuoteIntakeSafeConfig }
  | {
      kind: "unauthorized" | "forbidden" | "api_disabled" | "error";
      message: string;
      cases: [];
    };

const SUMMARY_TILES: Array<{
  key: keyof ReturnType<typeof computeQueueSummaryCounts>;
  label: string;
  bucket: string;
}> = [
  { key: "new", label: "New", bucket: "new" },
  { key: "processing", label: "Processing", bucket: "processing" },
  { key: "manual_review", label: "Manual review", bucket: "manual_review" },
  { key: "ready_for_takeoff", label: "Ready", bucket: "ready_for_takeoff" },
  { key: "takeoff", label: "In progress", bucket: "takeoff" },
  { key: "failed", label: "Failed", bucket: "failed" }
];

/**
 * Private Studio Estimate Queue — uses existing `/api/quote-intake/*` only.
 * Explicit Refresh / Sync inbox; no polling; no Takeoff automation.
 */
export default function EstimateQueuePage({
  authToken,
  selectedCaseId,
  onSelectCase,
  onOpenEstimate,
  apiClient: injectedClient
}: EstimateQueuePageProps) {
  const client = useMemo(
    () => injectedClient ?? createQuoteIntakeApiClient(),
    [injectedClient]
  );

  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });
  const [filter, setFilter] = useState<QuoteIntakeQueueFilter>(EMPTY_QUEUE_FILTER);
  const [refreshTick, setRefreshTick] = useState(0);
  const [mailboxSyncOpen, setMailboxSyncOpen] = useState(false);

  const [detailCase, setDetailCase] = useState<QuoteIntakeCaseDto | null>(null);
  const [auditEvents, setAuditEvents] = useState<QuoteIntakeAuditEventDto[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const clearAuthorizedCaseData = useCallback(() => {
    setDetailCase(null);
    setAuditEvents([]);
    setDetailError(null);
  }, []);

  const loadQueue = useCallback(async () => {
    if (!authToken) {
      clearAuthorizedCaseData();
      setLoadState({
        kind: "unauthorized",
        message: "Sign in to view the Estimate Queue.",
        cases: []
      });
      return;
    }
    clearAuthorizedCaseData();
    setLoadState({ kind: "loading" });
    try {
      const config = (await client.getConfig(authToken)) as QuoteIntakeSafeConfig;
      if (config.quoteIntakeApiEnabled === false) {
        clearAuthorizedCaseData();
        setLoadState({
          kind: "api_disabled",
          message: "Quote Intake API is not enabled on the server.",
          cases: []
        });
        return;
      }
      const cases = (await client.listCases(authToken)) as QuoteIntakeCaseDto[];
      setLoadState({ kind: "ready", cases, config });
    } catch (err) {
      const classified = classifyQuoteIntakeError(err);
      clearAuthorizedCaseData();
      if (classified.kind === "unauthorized") {
        setLoadState({ kind: "unauthorized", message: classified.message, cases: [] });
        return;
      }
      if (classified.kind === "forbidden") {
        setLoadState({ kind: "forbidden", message: classified.message, cases: [] });
        return;
      }
      if (classified.kind === "not_found") {
        setLoadState({
          kind: "api_disabled",
          message: "Quote Intake API is unavailable or disabled.",
          cases: []
        });
        return;
      }
      setLoadState({
        kind: "error",
        message: classified.message,
        cases: []
      });
    }
  }, [authToken, client, clearAuthorizedCaseData]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue, refreshTick]);

  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      if (!selectedCaseId || !authToken) {
        setDetailCase(null);
        setAuditEvents([]);
        setDetailError(null);
        setLoadingDetail(false);
        return;
      }
      setLoadingDetail(true);
      setDetailError(null);
      setDetailCase(null);
      setAuditEvents([]);
      try {
        const [row, events] = await Promise.all([
          client.getCase(authToken, selectedCaseId),
          client.listAuditEvents(authToken, selectedCaseId)
        ]);
        if (cancelled) return;
        setDetailCase(row as QuoteIntakeCaseDto);
        setAuditEvents(events as QuoteIntakeAuditEventDto[]);
      } catch (err) {
        if (cancelled) return;
        const classified = classifyQuoteIntakeError(err);
        setDetailCase(null);
        setAuditEvents([]);
        setDetailError(classified.message);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedCaseId, authToken, client, refreshTick]);

  const readyCases = loadState.kind === "ready" ? loadState.cases : [];
  const config = loadState.kind === "ready" ? loadState.config : null;
  const summary = useMemo(() => computeQueueSummaryCounts(readyCases), [readyCases]);
  const visible = useMemo(
    () => filterQuoteIntakeCases(readyCases, filter),
    [readyCases, filter]
  );

  const patchFilter = (partial: Partial<QuoteIntakeQueueFilter>) => {
    setFilter((prev) => ({ ...prev, ...partial }));
  };

  const repoMode = String(config?.repositoryMode ?? "").toLowerCase();
  const memoryFallback = repoMode === "memory";

  return (
    <div className="eq-root" data-testid="estimate-queue">
      <header className="eq-header">
        <div>
          <h1 className="eq-title">Estimate Queue</h1>
          <p className="eq-subtitle">
            Private Studio inbox for quote intake cases · uses eliteOS Brain Quote Intake APIs
          </p>
        </div>
        <div className="eq-header-actions">
          {config?.mailboxSyncEnabled ? (
            <button
              type="button"
              className="eq-btn-secondary"
              onClick={() => setMailboxSyncOpen(true)}
              disabled={!authToken}
            >
              Sync inbox
            </button>
          ) : null}
          <button
            type="button"
            className="eq-btn-primary"
            onClick={() => setRefreshTick((n) => n + 1)}
            disabled={loadState.kind === "loading"}
          >
            Refresh
          </button>
        </div>
      </header>

      {loadState.kind === "ready" && memoryFallback ? (
        <div className="eq-state eq-state--warn" role="status" data-testid="eq-memory-fallback">
          <strong>In-memory intake store.</strong> Cases are not persisted to Supabase on this Brain
          instance — the queue works against the repository fallback and will reset when the API
          process restarts.
        </div>
      ) : null}

      {mailboxSyncOpen && authToken ? (
        <MailboxSyncModal
          open={mailboxSyncOpen}
          authToken={authToken}
          apiClient={client}
          mailboxDisplay={config?.mailboxDisplay ?? null}
          onClose={() => setMailboxSyncOpen(false)}
          onImported={() => setRefreshTick((n) => n + 1)}
        />
      ) : null}

      {loadState.kind === "loading" || loadState.kind === "idle" ? (
        <div className="eq-state" role="status">
          Loading queue…
        </div>
      ) : null}

      {loadState.kind === "unauthorized" ? (
        <div className="eq-state eq-state--warn" role="alert">
          <strong>Sign in required.</strong> {loadState.message}
        </div>
      ) : null}

      {loadState.kind === "forbidden" ? (
        <div className="eq-state eq-state--warn" role="alert" data-testid="eq-permission-denied">
          <strong>Permission denied.</strong> {loadState.message}
          <p className="eq-muted">
            Quote Intake requires AI Takeoff head access on the Brain. No case data is shown.
          </p>
        </div>
      ) : null}

      {loadState.kind === "api_disabled" ? (
        <div className="eq-state eq-state--warn" role="status" data-testid="eq-api-disabled">
          <strong>Quote Intake API unavailable.</strong> {loadState.message}
        </div>
      ) : null}

      {loadState.kind === "error" ? (
        <div className="eq-state eq-state--error" role="alert">
          <strong>Could not load queue.</strong> {loadState.message}
          <div>
            <button type="button" className="eq-btn-secondary" onClick={() => setRefreshTick((n) => n + 1)}>
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {loadState.kind === "ready" ? (
        <>
          <section className="eq-summary" aria-label="Queue summary">
            <div className="eq-summary-meta">{summary.total} cases</div>
            <div className="eq-summary-grid">
              {SUMMARY_TILES.map((tile) => {
                const active = filter.summaryBucket === tile.bucket;
                return (
                  <button
                    key={tile.bucket}
                    type="button"
                    className={`eq-summary-tile${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => patchFilter({ summaryBucket: active ? "" : tile.bucket })}
                  >
                    <span className="eq-summary-value">{summary[tile.key]}</span>
                    <span className="eq-summary-label">{tile.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="eq-filters" aria-label="Queue filters">
            <label className="eq-field eq-field--grow">
              <span>Search</span>
              <input
                type="search"
                value={filter.search}
                placeholder="Customer, project, sender, status…"
                onChange={(e) => patchFilter({ search: e.target.value })}
              />
            </label>
            <label className="eq-field">
              <span>Status</span>
              <select value={filter.status} onChange={(e) => patchFilter({ status: e.target.value })}>
                <option value="">All statuses</option>
                {QUOTE_INTAKE_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {labelQuoteIntakeStatus(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="eq-field">
              <span>Priority</span>
              <select
                value={filter.priority}
                onChange={(e) => patchFilter({ priority: e.target.value })}
              >
                <option value="">All priorities</option>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </section>

          <div className="eq-layout">
            <div className="eq-table-wrap">
              {visible.length === 0 ? (
                <div className="eq-empty" data-testid="eq-empty">
                  <h2>No cases match</h2>
                  <p>
                    {readyCases.length === 0
                      ? "Sync the inbox or wait for new intake, then refresh."
                      : "Adjust filters or refresh after new intake arrives."}
                  </p>
                </div>
              ) : (
                <table className="eq-table">
                  <thead>
                    <tr>
                      <th scope="col">Customer / project</th>
                      <th scope="col">Sender</th>
                      <th scope="col">Received</th>
                      <th scope="col">Attachments</th>
                      <th scope="col">PDF</th>
                      <th scope="col">Status</th>
                      <th scope="col">Missing info</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((c) => {
                      const selected = c.id === selectedCaseId;
                      const received = caseReceivedAt(c);
                      const reasons = caseReasonSnippets(c);
                      return (
                        <tr
                          key={c.id}
                          className={selected ? "is-selected" : undefined}
                          tabIndex={0}
                          aria-selected={selected}
                          onClick={() => onSelectCase(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onSelectCase(c.id);
                            }
                          }}
                        >
                          <td>
                            <div className="eq-cell-primary">{caseCustomerProjectLabel(c)}</div>
                            <div className="eq-cell-meta">{c.id}</div>
                          </td>
                          <td>{caseSenderLabel(c)}</td>
                          <td>
                            <div className="eq-cell-primary">{formatReceivedAt(received)}</div>
                            <div className="eq-cell-meta">{formatAge(received)}</div>
                          </td>
                          <td>{caseAttachmentStatusLabel(c)}</td>
                          <td>{caseSupportedPdfLabel(c)}</td>
                          <td>
                            <span className="eq-pill">{caseStatusLabel(c)}</span>
                            <span className="eq-sr-only">{c.status}</span>
                          </td>
                          <td>
                            {reasons.length ? (
                              <span className="eq-cell-clip" title={caseMissingInfoLabel(c)}>
                                {caseMissingInfoLabel(c) === "—"
                                  ? reasons.join(", ")
                                  : caseMissingInfoLabel(c)}
                              </span>
                            ) : (
                              <span className="eq-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <EstimateQueueCaseDetail
              caseRow={detailCase}
              auditEvents={auditEvents}
              loadingDetail={loadingDetail}
              detailError={detailError}
              onClose={() => onSelectCase(null)}
              onOpenEstimate={onOpenEstimate}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
