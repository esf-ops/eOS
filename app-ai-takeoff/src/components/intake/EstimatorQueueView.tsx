import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  classifyQuoteIntakeError,
  createQuoteIntakeApiClient
} from "../../lib/quoteIntakeApi.mjs";
import {
  caseReasonSnippets,
  computeQueueSummaryCounts,
  filterQuoteIntakeCases
} from "../../lib/quoteIntakeFilter.mjs";
import {
  caseCustomerProjectLabel,
  caseEligibilityLabel,
  caseEstimatorLabel,
  casePriorityLabel,
  caseReceivedAt,
  caseSenderLabel,
  caseStatusLabel,
  formatAge,
  formatReceivedAt
} from "../../lib/quoteIntakeFormat.mjs";
import {
  labelQuoteIntakeStatus,
  QUOTE_INTAKE_STATUS_OPTIONS
} from "../../lib/quoteIntakeStatusLabels.mjs";
import type {
  QuoteIntakeAuditEventDto,
  QuoteIntakeCaseDto,
  QuoteIntakeQueueFilter,
  QuoteIntakeSafeConfig,
  QuoteIntakeTakeoffLinkDto
} from "../../lib/quoteIntakeTypes";
import { EMPTY_QUEUE_FILTER } from "../../lib/quoteIntakeTypes";
import EstimatorQueueCaseDetail from "./EstimatorQueueCaseDetail";

type QuoteIntakeApiClient = ReturnType<typeof createQuoteIntakeApiClient>;

export type EstimatorQueueViewProps = {
  authToken: string | null;
  selectedCaseId: string | null;
  onSelectCase: (caseId: string | null) => void;
  onOpenLinkedTakeoff?: (takeoffJobId: string) => void;
  /** Injected client for tests; defaults to live narrow API client. */
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

const SUMMARY_TILES: Array<{ key: keyof ReturnType<typeof computeQueueSummaryCounts>; label: string; bucket: string }> = [
  { key: "new", label: "New", bucket: "new" },
  { key: "processing", label: "Processing", bucket: "processing" },
  { key: "manual_review", label: "Manual review", bucket: "manual_review" },
  { key: "ready_for_takeoff", label: "Ready for Takeoff", bucket: "ready_for_takeoff" },
  { key: "takeoff", label: "In Takeoff", bucket: "takeoff" },
  { key: "failed", label: "Failed", bucket: "failed" }
];

/**
 * Pilot Estimator Queue — additive sibling view. Explicit Refresh only; no polling.
 * Never invokes Takeoff / IE / Graph.
 */
export default function EstimatorQueueView({
  authToken,
  selectedCaseId,
  onSelectCase,
  onOpenLinkedTakeoff,
  apiClient: injectedClient
}: EstimatorQueueViewProps) {
  const client = useMemo(
    () => injectedClient ?? createQuoteIntakeApiClient(),
    [injectedClient]
  );

  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });
  const [filter, setFilter] = useState<QuoteIntakeQueueFilter>(EMPTY_QUEUE_FILTER);
  const [refreshTick, setRefreshTick] = useState(0);

  const [detailCase, setDetailCase] = useState<QuoteIntakeCaseDto | null>(null);
  const [auditEvents, setAuditEvents] = useState<QuoteIntakeAuditEventDto[]>([]);
  const [takeoffLinks, setTakeoffLinks] = useState<QuoteIntakeTakeoffLinkDto[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  /** Fail closed: wipe list/detail payloads so 401/403 cannot leave prior cases on screen or in state. */
  const clearAuthorizedCaseData = useCallback(() => {
    setDetailCase(null);
    setAuditEvents([]);
    setTakeoffLinks([]);
    setDetailError(null);
  }, []);

  const loadQueue = useCallback(async () => {
    if (!authToken) {
      clearAuthorizedCaseData();
      setLoadState({
        kind: "unauthorized",
        message: "Sign in to view the Estimator Queue.",
        cases: []
      });
      return;
    }
    // Hide any previous payload while revalidating.
    clearAuthorizedCaseData();
    setLoadState({ kind: "loading" });
    try {
      const config = await client.getConfig(authToken);
      if (config.quoteIntakeApiEnabled === false) {
        clearAuthorizedCaseData();
        setLoadState({
          kind: "api_disabled",
          message: "Quote Intake API is not enabled on the server.",
          cases: []
        });
        return;
      }
      const cases = await client.listCases(authToken);
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
        setTakeoffLinks([]);
        setDetailError(null);
        setLoadingDetail(false);
        return;
      }
      // Fail closed: never show list-row data alone as "authorized detail" on 403.
      setLoadingDetail(true);
      setDetailError(null);
      setDetailCase(null);
      setAuditEvents([]);
      setTakeoffLinks([]);
      try {
        const [row, events, links] = await Promise.all([
          client.getCase(authToken, selectedCaseId),
          client.listAuditEvents(authToken, selectedCaseId),
          client.listTakeoffLinks(authToken, selectedCaseId)
        ]);
        if (cancelled) return;
        setDetailCase(row);
        setAuditEvents(events);
        setTakeoffLinks(links);
      } catch (err) {
        if (cancelled) return;
        const classified = classifyQuoteIntakeError(err);
        setDetailCase(null);
        setAuditEvents([]);
        setTakeoffLinks([]);
        if (classified.kind === "unauthorized" || classified.kind === "forbidden") {
          setDetailError(classified.message);
        } else {
          setDetailError(classified.message);
        }
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
  const summary = useMemo(() => computeQueueSummaryCounts(readyCases), [readyCases]);
  const visible = useMemo(
    () => filterQuoteIntakeCases(readyCases, filter),
    [readyCases, filter]
  );

  const patchFilter = (partial: Partial<QuoteIntakeQueueFilter>) => {
    setFilter((prev) => ({ ...prev, ...partial }));
  };

  return (
    <div className="eq-root" data-testid="estimator-queue">
      <header className="eq-header">
        <div>
          <h1 className="eq-title">Estimator Queue</h1>
          <p className="eq-subtitle">
            Quote Intake pilot queue · preparation only · Takeoff approval stays manual
          </p>
        </div>
        <div className="eq-header-actions">
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
          <p className="eq-muted">No case data is available for this account.</p>
        </div>
      ) : null}

      {loadState.kind === "api_disabled" ? (
        <div className="eq-state eq-state--warn" role="status" data-testid="eq-api-disabled">
          <strong>Quote Intake API disabled.</strong> {loadState.message}
          <p className="eq-muted">
            The AI Takeoff workbench remains available. Enable the server flag and UI flag for pilot use.
          </p>
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
                    onClick={() =>
                      patchFilter({ summaryBucket: active ? "" : tile.bucket })
                    }
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
              <select
                value={filter.status}
                onChange={(e) => patchFilter({ status: e.target.value })}
              >
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
                  <p>Adjust filters or refresh after new intake arrives.</p>
                </div>
              ) : (
                <table className="eq-table">
                  <thead>
                    <tr>
                      <th scope="col">Customer / project</th>
                      <th scope="col">Sender</th>
                      <th scope="col">Received / age</th>
                      <th scope="col">Status</th>
                      <th scope="col">Priority</th>
                      <th scope="col">Elite 100</th>
                      <th scope="col">Reasons</th>
                      <th scope="col">Takeoff link</th>
                      <th scope="col">Estimator</th>
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
                          <td>
                            <span className="eq-pill">{caseStatusLabel(c)}</span>
                            <span className="eq-sr-only">{c.status}</span>
                          </td>
                          <td>{casePriorityLabel(c)}</td>
                          <td>{caseEligibilityLabel(c)}</td>
                          <td>
                            {reasons.length ? (
                              <span className="eq-cell-clip" title={reasons.join(", ")}>
                                {reasons.join(", ")}
                              </span>
                            ) : (
                              <span className="eq-muted">—</span>
                            )}
                          </td>
                          <td>
                            <span className="eq-muted">—</span>
                          </td>
                          <td>{caseEstimatorLabel(c)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <EstimatorQueueCaseDetail
              caseRow={detailCase}
              auditEvents={auditEvents}
              takeoffLinks={takeoffLinks}
              loadingDetail={loadingDetail}
              detailError={detailError}
              onClose={() => onSelectCase(null)}
              onOpenLinkedTakeoff={onOpenLinkedTakeoff}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
