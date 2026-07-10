import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import {
  QB_INTEL_DEFAULT_PRESET,
  QB_INTEL_DEFAULT_SORT,
  QB_INTEL_PRESET_OPTIONS,
  QB_INTEL_SORT_OPTIONS,
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
  period?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
      mode?: string;
      aggregate_attempted?: boolean;
      fallback_used?: boolean;
      recommended?: { max_rows?: number; page_size?: number };
    };
    if (rec.code === "57014") {
      const isAggregateTimeout =
        rec.mode === "full_aggregate" ||
        (rec.aggregate_attempted === true && rec.fallback_used === false);
      if (isAggregateTimeout) {
        return "Full-period aggregate timed out. The SQL aggregate exists but needs optimization/indexing.";
      }
      const maxRows = rec.recommended?.max_rows ?? 50;
      const pageSize = rec.recommended?.page_size ?? 50;
      const base =
        rec.error ||
        "QuickBooks sample_preview timed out while reading staging data.";
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
  preset,
  sort,
  onPresetChange,
  onSortChange,
  onRetry,
}: {
  loading: boolean;
  error: string;
  statusCode: number | null;
  data: Snapshot | null;
  preset: string;
  sort: string;
  onPresetChange?: (preset: string) => void;
  onSortChange?: (sort: string) => void;
  onRetry?: () => void;
}) {
  const state = resolveIntelligenceViewState({
    loading,
    error,
    statusCode,
    data: data as never,
  });

  const controls = (
    <div className="qb-intel-controls" data-testid="qb-intel-controls">
      <label className="qb-intel-control">
        <span>Period</span>
        <select
          value={preset}
          onChange={(e) => onPresetChange?.(e.target.value)}
          disabled={loading}
        >
          {QB_INTEL_PRESET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="qb-intel-control">
        <span>Sort</span>
        <select value={sort} onChange={(e) => onSortChange?.(e.target.value)} disabled={loading}>
          {QB_INTEL_SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry} disabled={loading}>
          Refresh
        </button>
      ) : null}
    </div>
  );

  if (state.kind === "loading") {
    return (
      <div className="qb-intel qb-intel-loading" data-testid="qb-intel-loading">
        <div className="qb-intel-hero">
          <h2 style={{ marginTop: 0 }}>QuickBooks Intelligence</h2>
          <p className="muted">{state.message}</p>
        </div>
        {controls}
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
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="qb-intel qb-intel-error" data-testid="qb-intel-error">
        {controls}
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
        {controls}
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
              Date-scoped leadership view — opaque IDs only, no raw QuickBooks payloads.
            </p>
          </div>
        </div>
      </div>

      {controls}

      <div className="qb-intel-period-meta" data-testid="qb-intel-period">
        <strong>{model.periodLabel}</strong>
        <span className="muted">As of {model.asOfDate}</span>
      </div>

      {model.isSampleLimited ? (
        <div className="qb-intel-banner qb-intel-banner-warn" data-testid="qb-intel-partial">
          Sample-limited preview
          {model.maxRows !== "full org" ? `: capped at ${model.maxRows} rows per staging entity` : ""}.
          Totals are directional until the aggregate RPC is applied.
        </div>
      ) : null}

      <div
        className={`qb-intel-banner ${model.isSampleLimited ? "qb-intel-banner-info" : "qb-intel-banner-good"}`}
        data-testid="qb-intel-mode-note"
        data-mode={model.mode}
      >
        {model.modeNote}
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
        <section className="admin-card qb-intel-section" data-section="cash">
          <h3>Cash collected</h3>
          <p className="muted qb-intel-section-lead">Payments in the selected period (opaque IDs).</p>
          {model.topPayments.length === 0 ? (
            <p className="muted">No payments in this period.</p>
          ) : (
            <ul className="qb-intel-rank-list">
              {model.topPayments.map((row) => (
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

        <section className="admin-card qb-intel-section" data-section="revenue">
          <h3>Invoiced revenue</h3>
          <p className="muted qb-intel-section-lead">Top customers by period billed total.</p>
          {model.topRevenue.length === 0 ? (
            <p className="muted">No invoice revenue in this period.</p>
          ) : (
            <ul className="qb-intel-rank-list">
              {model.topRevenue.map((row) => (
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

        <section className="admin-card qb-intel-section" data-section="ar-risk">
          <h3>Open AR</h3>
          <p className="muted qb-intel-section-lead">
            Aging as of {model.asOfDate}. Top open balances below.
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
          {model.topOpenAr.length > 0 ? (
            <ul className="qb-intel-rank-list" style={{ marginTop: 12 }}>
              {model.topOpenAr.map((row) => (
                <li key={row.label}>
                  <span className="qb-intel-rank">#{row.rank}</span>
                  <div>
                    <div className="qb-intel-entity">{row.label}</div>
                    <div className="muted">{row.invoices} open invoices</div>
                  </div>
                  <strong>{row.open}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="admin-card qb-intel-section" data-section="flow">
          <h3>Estimate conversion</h3>
          <p className="muted qb-intel-section-lead">Period estimates / sales orders / invoices.</p>
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
          {model.topLeakage.length > 0 ? (
            <>
              <p className="muted qb-intel-section-lead" style={{ marginTop: 12 }}>
                Top estimate leakage (capped)
              </p>
              <ul className="qb-intel-rank-list" data-testid="qb-intel-leakage-list">
                {model.topLeakage.map((row) => (
                  <li key={`${row.label}-${row.rank}`}>
                    <span className="qb-intel-rank">#{row.rank}</span>
                    <div>
                      <div className="qb-intel-entity">{row.label}</div>
                      <div className="muted">{row.date}</div>
                    </div>
                    <strong>{row.amount}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section className="admin-card qb-intel-section" data-section="activity">
          <h3>Month-by-month trend</h3>
          <p className="muted qb-intel-section-lead">Activity inside the selected period.</p>
          {model.activityMonths.length === 0 ? (
            <p className="muted">No monthly activity in this period.</p>
          ) : (
            <ul className="qb-intel-trend">
              {model.activityMonths.map((m) => (
                <li key={m.month}>
                  <div className="qb-intel-trend-label">{m.month}</div>
                  <div className="qb-intel-trend-bar-track" aria-hidden="true">
                    <div className="qb-intel-trend-bar" style={{ width: `${m.barPct}%` }} />
                  </div>
                  <div className="qb-intel-trend-meta muted">
                    {m.invoice_count} inv · {m.payment_count} pay · {m.estimate_count ?? 0} est
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="admin-card qb-intel-section" data-section="insights">
        <h3>Priority insights</h3>
        <p className="muted qb-intel-section-lead">
          Top signals only, grouped by type — no giant repeated lists.
        </p>
        <div className="qb-intel-insight-keys">
          {model.insightKeyCounts.map((k) => (
            <span key={k.key} className="qb-intel-insight-key">
              {k.label} <strong>{formatCount(k.count)}</strong>
            </span>
          ))}
        </div>
        {model.insightGroupRows.length > 0 ? (
          <div className="qb-intel-insight-groups" data-testid="qb-intel-insight-groups">
            {model.insightGroupRows.map((g) => (
              <div key={g.key} className="qb-intel-insight-group" data-insight-group={g.key}>
                <div className="qb-intel-entity">
                  {g.label} <span className="muted">({formatCount(g.count)})</span>
                </div>
                <ul className="qb-intel-insight-list">
                  {g.items.map((row) => (
                    <li key={row.key}>
                      <span className={`pill ${severityClass(row.severity)}`}>{row.severity}</span>
                      <div>
                        <div className="qb-intel-entity">{row.entity}</div>
                        <div className="muted">{row.summary}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : model.insightRows.length === 0 ? (
          <p className="muted">No insight items in this period.</p>
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

      <section className="admin-card qb-intel-section" data-section="metadata">
        <h3>Snapshot metadata</h3>
        <div className="qb-intel-meta-grid">
          <div>
            <div className="muted">Period</div>
            <div>{model.periodLabel}</div>
          </div>
          <div>
            <div className="muted">Organization</div>
            <div className="mono">{model.organizationId}</div>
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
  const [preset, setPreset] = useState(QB_INTEL_DEFAULT_PRESET);
  const [sort, setSort] = useState(QB_INTEL_DEFAULT_SORT);

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
      const path = buildQuickBooksIntelligenceEndpoint({ preset, sort });
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
  }, [token, preset, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <QuickBooksIntelligenceView
      loading={loading}
      error={error}
      statusCode={statusCode}
      data={data}
      preset={preset}
      sort={sort}
      onPresetChange={setPreset}
      onSortChange={setSort}
      onRetry={() => void load()}
    />
  );
}
