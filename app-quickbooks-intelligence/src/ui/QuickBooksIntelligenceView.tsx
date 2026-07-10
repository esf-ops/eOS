import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import {
  QB_INTEL_PREVIEW_NOTE,
  assertSafeIntelligenceSnapshot,
  buildIntelligenceViewModel,
  buildQuickBooksIntelligenceEndpoint,
  formatCount,
  formatMoney,
  resolveIntelligenceViewState,
} from "../lib/quickBooksIntelligenceViewModel.js";

type Snapshot = Record<string, unknown> & {
  ok?: boolean;
  organization_id?: string;
  generated_at?: string;
  as_of_date?: string;
  metadata?: Record<string, unknown>;
  ar_summary?: Record<string, unknown>;
  revenue_summary?: Record<string, unknown>;
  payment_summary?: Record<string, unknown>;
  estimate_sales_order_invoice_flow?: Record<string, unknown>;
  sales_rep_summary?: Record<string, unknown>;
  customer_activity_trend?: Record<string, unknown>;
  insights?: Record<string, unknown>;
  insight_list?: Record<string, unknown>[];
};

type ViewModel = ReturnType<typeof buildIntelligenceViewModel>;

function severityClass(severity: string) {
  if (severity === "high") return "pill-bad";
  if (severity === "medium") return "pill-warn";
  if (severity === "low") return "pill-muted";
  return "pill-good";
}

function cardToneClass(tone: string) {
  if (tone === "warn") return "stat-card stat-card-warn";
  return "stat-card";
}

function formatIntelligenceLoadError(e: unknown): string {
  if (!(e instanceof ApiError)) {
    return String((e as Error)?.message ?? e);
  }
  const body = e.body;
  if (body && typeof body === "object") {
    const rec = body as {
      code?: string;
      error?: string;
      recommended?: { max_rows?: number; page_size?: number };
    };
    if (rec.code === "57014") {
      const maxRows = rec.recommended?.max_rows ?? 50;
      const pageSize = rec.recommended?.page_size ?? 50;
      const base =
        rec.error ||
        "QuickBooks intelligence snapshot timed out while reading staging data.";
      return `${base} Recommended: max_rows=${maxRows}&page_size=${pageSize}.`;
    }
  }
  return e.message;
}

export function QuickBooksIntelligenceView({
  loading,
  error,
  statusCode,
  data,
  onRetry,
}: {
  loading: boolean;
  error: string;
  statusCode: number | null;
  data: Snapshot | null;
  onRetry?: () => void;
}) {
  const state = resolveIntelligenceViewState({
    loading,
    error,
    statusCode,
    data: data as never,
  });

  if (state.kind === "loading") {
    return (
      <div className="qb-intel qb-intel-loading" data-testid="qb-intel-loading">
        <div className="qb-intel-hero">
          <h2 style={{ marginTop: 0 }}>QuickBooks Intelligence</h2>
          <p className="muted">{state.message}</p>
        </div>
        <div className="stat-grid qb-intel-skeleton">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="stat-card stat-card-muted">
              <div className="stat-value">…</div>
              <div className="stat-label">Loading</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === "unauthorized") {
    return (
      <div className="qb-intel qb-intel-unauthorized" data-testid="qb-intel-unauthorized">
        <div className="error-card">
          <strong>Access denied</strong>
          <p>{state.message}</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            This view requires an authenticated user with quickbooks_intelligence head access
            (admin, executive, finance, or accounting).
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="qb-intel qb-intel-error" data-testid="qb-intel-error">
        <div className="error-card">
          <strong>Unable to load QuickBooks intelligence</strong>
          <p>{state.message}</p>
          {onRetry ? (
            <button type="button" className="btn" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="qb-intel qb-intel-empty" data-testid="qb-intel-empty">
        <div className="qb-intel-hero">
          <h2 style={{ marginTop: 0 }}>QuickBooks Intelligence</h2>
          <p className="muted">{state.message}</p>
        </div>
        {onRetry ? (
          <button type="button" className="btn" onClick={onRetry}>
            Refresh
          </button>
        ) : null}
      </div>
    );
  }

  const model = state.model as ViewModel;
  return (
    <div
      className={`qb-intel ${state.kind === "partial" ? "qb-intel-partial" : ""}`}
      data-testid="qb-intel-ready"
      data-state={state.kind}
    >
      <div className="qb-intel-hero">
        <div className="qb-intel-hero-row">
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 6 }}>QuickBooks Intelligence</h2>
            <p className="muted" style={{ margin: 0 }}>
              Leadership read of AR risk, revenue concentration, payment behavior, and estimate
              conversion — opaque IDs only, no raw QuickBooks payloads.
            </p>
          </div>
          {onRetry ? (
            <button type="button" className="btn" onClick={onRetry}>
              Refresh
            </button>
          ) : null}
        </div>
      </div>

      {state.kind === "partial" ? (
        <div className="qb-intel-banner qb-intel-banner-warn" data-testid="qb-intel-partial">
          Sample-limited snapshot: results are capped at {model.maxRows} rows per staging entity
          (page size {model.pageSize}). Treat totals as directional until full-scale aggregates
          ship.
        </div>
      ) : null}

      <div className="qb-intel-banner qb-intel-banner-info" data-testid="qb-intel-preview-note">
        {QB_INTEL_PREVIEW_NOTE}
      </div>

      <section className="qb-intel-section" data-section="executive">
        <h3>Executive summary</h3>
        <div className="stat-grid">
          {model.executiveCards.map((card) => (
            <div key={card.id} className={cardToneClass(card.tone)}>
              <div className="stat-value">{card.value}</div>
              <div className="stat-label">{card.label}</div>
              <div className="qb-intel-card-hint">{card.hint}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="qb-intel-grid">
        <section className="admin-card qb-intel-section" data-section="ar-risk">
          <h3>AR risk</h3>
          <p className="muted qb-intel-section-lead">
            Open and overdue receivables by aging bucket. Customer identities stay opaque.
          </p>
          <div className="qb-intel-aging">
            {model.agingBuckets.map((b) => (
              <div key={b.key} className="qb-intel-aging-row">
                <div className="qb-intel-aging-label">{b.label}</div>
                <div className="qb-intel-aging-meta">
                  <span>{formatCount(b.invoice_count)} invoices</span>
                  <strong>{formatMoney(b.balance_total)}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-card qb-intel-section" data-section="revenue">
          <h3>Revenue concentration</h3>
          <p className="muted qb-intel-section-lead">Top customers by billed total (opaque IDs).</p>
          {model.topRevenue.length === 0 ? (
            <p className="muted">No invoice revenue in this snapshot.</p>
          ) : (
            <ul className="qb-intel-rank-list">
              {model.topRevenue.map((row: ViewModel["topRevenue"][number]) => (
                <li key={row.label}>
                  <span className="qb-intel-rank">#{row.rank}</span>
                  <div>
                    <div className="qb-intel-entity">{row.label}</div>
                    <div className="muted">
                      {row.invoices} invoices · open {row.open}
                    </div>
                  </div>
                  <strong>{row.billed}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-card qb-intel-section" data-section="payments">
          <h3>Payment behavior</h3>
          <p className="muted qb-intel-section-lead">
            Recent payers with average days-to-pay when invoice links exist.
          </p>
          {model.topPayments.length === 0 ? (
            <p className="muted">No payments in this snapshot.</p>
          ) : (
            <ul className="qb-intel-rank-list">
              {model.topPayments.map((row: ViewModel["topPayments"][number]) => (
                <li key={row.label}>
                  <div>
                    <div className="qb-intel-entity">{row.label}</div>
                    <div className="muted">
                      {row.payments} payments · avg {row.avgDays} days · last {row.lastPayment}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-card qb-intel-section" data-section="flow">
          <h3>Estimate → sales order → invoice</h3>
          <p className="muted qb-intel-section-lead">Conversion coverage and unlinked leakage.</p>
          <div className="qb-intel-flow">
            {model.flowCards.map((card) => (
              <div key={card.id} className="qb-intel-flow-card">
                <div className="qb-intel-flow-title">{card.title}</div>
                <div className="qb-intel-flow-count">{card.count}</div>
                <div className="muted">Linked {card.linked}</div>
                <div className="muted">Unlinked {card.unlinked}</div>
                <div className="qb-intel-card-hint">{card.amountHint}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-card qb-intel-section" data-section="sales-reps">
          <h3>Sales rep summary</h3>
          <p className="muted qb-intel-section-lead">
            Where SalesRepRef is present on invoices. Unassigned invoices:{" "}
            {model.unassignedRepInvoices}.
          </p>
          {model.salesRepRows.length === 0 ? (
            <p className="muted">No sales-rep attribution in this snapshot.</p>
          ) : (
            <ul className="qb-intel-rank-list">
              {model.salesRepRows.map((row: ViewModel["salesRepRows"][number]) => (
                <li key={row.label}>
                  <div>
                    <div className="qb-intel-entity">
                      {row.label}
                      {row.known ? (
                        <span className="pill pill-good qb-intel-inline-pill">known</span>
                      ) : (
                        <span className="pill pill-warn qb-intel-inline-pill">unlisted</span>
                      )}
                    </div>
                    <div className="muted">
                      {row.invoices} invoices · {row.customers} customers · open {row.open}
                    </div>
                  </div>
                  <strong>{row.billed}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-card qb-intel-section" data-section="activity">
          <h3>Customer activity trend</h3>
          <p className="muted qb-intel-section-lead">
            Monthly invoice activity (last 12 months in snapshot).
          </p>
          {model.activityMonths.length === 0 ? (
            <p className="muted">No monthly activity in this snapshot.</p>
          ) : (
            <ul className="qb-intel-trend">
              {model.activityMonths.map((m: ViewModel["activityMonths"][number]) => (
                <li key={m.month}>
                  <div className="qb-intel-trend-label">{m.month}</div>
                  <div className="qb-intel-trend-bar-track" aria-hidden="true">
                    <div className="qb-intel-trend-bar" style={{ width: `${m.barPct}%` }} />
                  </div>
                  <div className="qb-intel-trend-meta muted">
                    {m.invoice_count} inv · {m.payment_count} pay · {m.active_customers} customers
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="admin-card qb-intel-section" data-section="insights">
        <h3>Deterministic insights</h3>
        <p className="muted qb-intel-section-lead">
          Rule-based signals only — no AI. Entities are opaque QuickBooks IDs.
        </p>
        <div className="qb-intel-insight-keys">
          {model.insightKeyCounts.map((k) => (
            <span key={k.key} className="qb-intel-insight-key">
              {k.label} <strong>{formatCount(k.count)}</strong>
            </span>
          ))}
        </div>
        {model.insightRows.length === 0 ? (
          <p className="muted">No insight items in this snapshot.</p>
        ) : (
          <ul className="qb-intel-insight-list" data-testid="qb-intel-insight-list">
            {model.insightRows.map((row) => (
              <li key={row.key}>
                <span className={`pill ${severityClass(row.severity)}`}>{row.severity}</span>
                <div>
                  <div className="qb-intel-entity">
                    {row.insightLabel} · {row.entity}
                  </div>
                  <div className="muted">{row.summary}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="qb-intel-meta" data-section="metadata" data-testid="qb-intel-metadata">
        <h3>Snapshot status</h3>
        <div className="qb-intel-meta-grid">
          <div>
            <div className="muted">Organization</div>
            <div>{model.organizationId}</div>
          </div>
          <div>
            <div className="muted">Generated</div>
            <div>{model.generatedAt}</div>
          </div>
          <div>
            <div className="muted">As of</div>
            <div>{model.asOfDate}</div>
          </div>
          <div>
            <div className="muted">Page size</div>
            <div>{model.pageSize}</div>
          </div>
          <div>
            <div className="muted">Max rows</div>
            <div>{model.maxRows}</div>
          </div>
        </div>
        {model.stagingCounts.length > 0 ? (
          <div className="qb-intel-staging">
            {model.stagingCounts.map((row) => (
              <span key={row.key} className="qb-intel-staging-chip">
                {row.label} <strong>{row.value}</strong>
              </span>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function QuickBooksIntelligencePage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [data, setData] = useState<Snapshot | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setStatusCode(401);
      setError("Missing session access token");
      setData(null);
      return;
    }
    setLoading(true);
    setError("");
    setStatusCode(null);
    try {
      const path = buildQuickBooksIntelligenceEndpoint();
      const json = (await apiFetch(path, { token })) as Snapshot;
      assertSafeIntelligenceSnapshot(json);
      setData(json);
      setLoading(false);
    } catch (e: unknown) {
      const status = e instanceof ApiError ? e.status : null;
      setStatusCode(status);
      setData(null);
      setLoading(false);
      setError(formatIntelligenceLoadError(e));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <QuickBooksIntelligenceView
      loading={loading}
      error={error}
      statusCode={statusCode}
      data={data}
      onRetry={() => void load()}
    />
  );
}
