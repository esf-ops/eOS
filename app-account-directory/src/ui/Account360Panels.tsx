import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ApiError } from "../lib/api";
import {
  getAccountFinancialsTrend,
  getAccountHistoryTransactions,
  getAccountOpenInvoices,
  getAccountRelationship,
  getAccountTimeline
} from "../lib/accountDirectoryApi";
import type {
  AccountContact,
  AccountDetail,
  AccountFinancials,
  AccountHistoryTransactionPage,
  AccountInvoicePage,
  AccountLocation,
  AccountRelationship,
  AccountSourceFreshness,
  AccountTimelineResponse,
  AccountTrend,
  ExternalLink
} from "../lib/types";
import { isAbortError } from "../lib/account360RequestCoordinator.mjs";
import { customerFinancialsEmptyCopy } from "../lib/accountDirectoryFinancialCopy.mjs";
import { formatAccountDirectoryPhone } from "../lib/accountDirectoryPhoneFormat.mjs";
import {
  AD_360_HISTORY_PAGE_SIZE,
  AD_360_INVOICE_PAGE_SIZE,
  AD_360_TIMELINE_PAGE_SIZE,
  applyHistoryPage,
  canLoadMoreHistory,
  historyExhaustedCopy,
  historyItemId,
  invoiceItemId,
  shouldApplyHistoryPage,
  timelineItemId
} from "../lib/account360History.mjs";
import {
  buildRelationshipView,
  enrichRelationshipHealthWithFinancials,
  formatWhen
} from "../lib/accountDirectoryRelationshipUi";
import { CustomerTrendChart } from "./AccountCharts";
import { formatCount, formatJobsLabel, formatMoney, formatSqft } from "./accountFormat";
import { AccountReveal, AnimatedNumber } from "./accountMotion";

function formatHumanDate(ymd?: string | null): string | null {
  if (!ymd) return null;
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(ymd).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function freshnessLine(source?: AccountSourceFreshness | null) {
  if (!source) return null;
  const hours = source.hoursAgo;
  if (source.isStale) {
    return hours != null ? `Last refreshed ${hours}h ago · Update delayed` : "Update delayed";
  }
  if (hours == null) return "Refresh time unavailable";
  if (hours < 2) return "Refreshed recently";
  return `Refreshed ${hours}h ago`;
}

type Account360SessionStore = {
  getSignal: () => AbortSignal | null;
  getGeneration: () => number;
  isCurrent: (generation: number, accountId: string) => boolean;
  getPanel: (accountId: string, key: string) => unknown;
  hasPanel: (accountId: string, key: string) => boolean;
  setPanel: (accountId: string, key: string, value: unknown) => void;
  clearPanel: (accountId: string, key: string) => void;
  loadResource: (accountId: string, key: string, loader: () => Promise<unknown>) => Promise<unknown>;
};

function financialsDeepReady(financials: AccountFinancials | null) {
  return financials?.status === "ok" || financials?.status === "stale";
}

function Metric({
  label,
  value,
  animationKey,
  count = false
}: {
  label: string;
  value: number | null | undefined;
  animationKey: string;
  count?: boolean;
}) {
  const available = value != null && Number.isFinite(Number(value));
  return (
    <article className="ad-metric-card ad-metric-compact">
      <p className="ad-kicker">{label}</p>
      {available ? (
        <AnimatedNumber
          value={Number(value)}
          format={count ? formatCount : formatMoney}
          animationKey={animationKey}
          className="ad-kpi"
        />
      ) : (
        <p className="ad-unavailable">Unavailable</p>
      )}
    </article>
  );
}

/** Trusted KPI with available / unavailable / genuine-zero (never paints unavailable as 0). */
function TrustedKpi({
  label,
  state,
  display,
  loading
}: {
  label: string;
  state: "available" | "unavailable" | "loading";
  display: string | null;
  loading?: boolean;
}) {
  return (
    <article className="ad-metric-card ad-metric-compact ad-trusted-kpi" aria-busy={loading || state === "loading"}>
      <p className="ad-kicker">{label}</p>
      {state === "loading" || loading ? (
        <p className="ad-skeleton-line" aria-hidden="true">
          Loading…
        </p>
      ) : state === "available" && display != null ? (
        <p className="ad-kpi">{display}</p>
      ) : (
        <p className="ad-unavailable">Unavailable</p>
      )}
    </article>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="ad-section ad-section-loading" aria-busy="true">
      <p className="muted">{label}</p>
      <div className="ad-skeleton-block" />
    </div>
  );
}

function completenessLine(detail: AccountDetail): string {
  return (
    [
      detail.status === "needs_review" ? "Needs review" : null,
      detail.hasPrimaryContact === false ? "Missing primary contact" : null,
      detail.hasPrimaryLocation === false ? "Missing primary location" : null
    ]
      .filter(Boolean)
      .join(" · ") || "Ready"
  );
}

export function Overview360({
  detail,
  financials,
  busy,
  relationshipBusy,
  onOpenTab,
  insightStrip,
  relationship
}: {
  detail: AccountDetail;
  financials: AccountFinancials | null;
  busy: boolean;
  relationshipBusy?: boolean;
  onOpenTab: (tab: string) => void;
  insightStrip?: ReactNode;
  relationship?: AccountRelationship | null;
}) {
  const s = financials?.summary;
  const showMoney = financials?.status === "ok" || financials?.status === "stale";
  const history = financials?.customerHistory;
  const moraware = relationship?.moraware;
  const jobsState =
    relationshipBusy && !relationship
      ? "loading"
      : moraware?.jobs_state === "available"
        ? "available"
        : "unavailable";
  const sqftState =
    relationshipBusy && !relationship
      ? "loading"
      : moraware?.sqft_state === "available"
        ? "available"
        : "unavailable";
  const quoteState = relationshipBusy && !relationship ? "loading" : relationship ? "available" : "unavailable";
  const quoteDisplay = (() => {
    if (quoteState !== "available") return null;
    const item = relationship?.estimates?.internal?.items?.[0];
    if (item?.quote_number) return String(item.quote_number);
    if (relationship?.estimates?.internal?.state === "available") return "No linked quotes";
    return "Unavailable";
  })();
  const openArState = busy && !financials ? "loading" : showMoney ? "available" : "unavailable";

  return (
    <div className="ad-360 ad-snapshot">
      <AccountReveal motionKey="ad-trusted-kpis" className="ad-section">
        <header className="ad-section-head">
          <p className="ad-kicker">Customer summary</p>
          <h3>Trusted operating facts</h3>
          <p className="muted">Governed Account Directory, Moraware, and QuickBooks facts only — unavailable is never shown as zero.</p>
        </header>
        <div className="ad-metric-grid ad-metric-grid-dense ad-trusted-kpi-row">
          <TrustedKpi
            label="2026 Jobs"
            state={jobsState}
            display={jobsState === "available" ? formatJobsLabel(moraware?.job_count_2026 ?? 0) : null}
            loading={relationshipBusy && !relationship}
          />
          <TrustedKpi
            label="2026 SqFt"
            state={sqftState}
            display={sqftState === "available" ? formatSqft(moraware?.sqft_2026 ?? 0) : null}
            loading={relationshipBusy && !relationship}
          />
          <TrustedKpi
            label="Recent quote"
            state={quoteState === "loading" ? "loading" : quoteDisplay && quoteDisplay !== "Unavailable" ? "available" : "unavailable"}
            display={quoteDisplay && quoteDisplay !== "Unavailable" ? quoteDisplay : null}
            loading={relationshipBusy && !relationship}
          />
          <TrustedKpi
            label="Open A/R"
            state={openArState}
            display={openArState === "available" ? formatMoney(s?.openAr) : null}
            loading={busy && !financials}
          />
        </div>
      </AccountReveal>

      <AccountReveal motionKey="ad-health-row" className="ad-health-inline">
        <p className="ad-kicker">Account health</p>
        <ul>
          <li>
            <span>Primary contact</span>
            <strong>{detail.primaryContact || "Not on file"}</strong>
          </li>
          <li>
            <span>Primary location</span>
            <strong>{[detail.city, detail.state].filter(Boolean).join(", ") || "Not on file"}</strong>
          </li>
          <li>
            <span>QuickBooks</span>
            <strong>{detail.qbEnrichment?.label || (detail.quickbooksLinked ? "Linked" : "Not linked")}</strong>
          </li>
          <li>
            <span>Moraware</span>
            <strong>
              {relationshipBusy && !relationship
                ? "Loading…"
                : moraware?.linked
                  ? `${moraware.accounts?.length || 0} linked ID${(moraware.accounts?.length || 0) === 1 ? "" : "s"}`
                  : "Not linked"}
            </strong>
          </li>
          <li>
            <span>Completeness</span>
            <strong>{completenessLine(detail)}</strong>
          </li>
        </ul>
      </AccountReveal>

      <AccountReveal motionKey="ad-snapshot" className="ad-section">
        <header className="ad-section-head">
          <p className="ad-kicker">Customer snapshot</p>
          <h3>Who they are to us this year</h3>
        </header>
        {busy && !financials ? <SectionSkeleton label="Loading customer financials…" /> : null}
        <div className="ad-metric-grid ad-metric-grid-dense">
          <Metric label="YTD invoiced" value={showMoney ? s?.invoicedYtd : null} animationKey="ytd-inv" />
          <Metric label="YTD collected" value={showMoney ? s?.collectedYtd : null} animationKey="ytd-col" />
          <Metric label="YTD quoted" value={showMoney ? s?.quotedYtd : null} animationKey="ytd-q" />
          <Metric label="YTD sales orders" value={showMoney ? s?.salesOrdersYtd : null} animationKey="ytd-so" />
          <Metric label="Open A/R" value={showMoney ? s?.openAr : null} animationKey="open-ar" />
          <Metric label="Overdue A/R" value={showMoney ? financials?.overdueBalance : null} animationKey="od-ar" />
          <Metric label="Open invoices" value={showMoney ? s?.openInvoiceCount : null} animationKey="inv-n" count />
          <Metric
            label="Days since payment"
            value={showMoney ? financials?.daysSinceLastPayment : null}
            animationKey="dsp"
            count
          />
        </div>
        <p className="ad-footnote">
          {[
            financials?.lastInvoice?.date ? `Last invoice ${financials.lastInvoice.date}` : null,
            financials?.lastPayment?.date ? `Last payment ${financials.lastPayment.date}` : null,
            financials?.paymentTerms ? `Terms ${financials.paymentTerms}` : null,
            financials?.collectionAttention?.label
              ? `Collection ${financials.collectionAttention.label}`
              : null
          ]
            .filter(Boolean)
            .join(" · ") ||
            customerFinancialsEmptyCopy({
              linked: financials?.linked === true || detail.quickbooksLinked === true,
              status: financials?.status
            })}
        </p>
        {financials?.coverage?.historyLabel ? (
          <p className="ad-footnote">
            {financials.coverage.historyLabel} Available history, not a proven lifetime. Collected is cash
            timing. Sales Orders are not Sold.
          </p>
        ) : null}
      </AccountReveal>

      <div className="ad-overview-split">
        <div className="ad-overview-main">
          {showMoney && history ? (
            <CustomerPerformance history={history} financials={financials} />
          ) : (
            <section className="ad-section">
              <header className="ad-section-head">
                <p className="ad-kicker">Commercial activity</p>
                <h3>Available history for this relationship</h3>
              </header>
              <p className="muted">
                {busy && !financials
                  ? "Loading commercial history…"
                  : financials?.status === "unlinked" ||
                      financials?.linked === false ||
                      (!financials?.linked && detail.quickbooksLinked !== true)
                    ? "Connect QuickBooks to view financial history."
                    : "QuickBooks is connected, but financial data is currently unavailable."}
              </p>
            </section>
          )}
        </div>
        <aside className="ad-overview-side">
          {relationshipBusy && !relationship ? (
            <SectionSkeleton label="Loading relationship status…" />
          ) : (
            <RelationshipHealthPanel
              relationship={relationship ?? null}
              financials={financials}
              onOpenTab={onOpenTab}
            />
          )}
          {insightStrip}
        </aside>
      </div>
    </div>
  );
}

function ChangeCell({ change }: { change?: { status?: string; text?: string } | null }) {
  if (!change || change.status === "unavailable") {
    return <span className="muted">Unavailable</span>;
  }
  return <span>{change.text || "—"}</span>;
}

function CustomerPerformance({
  history,
  financials
}: {
  history: NonNullable<AccountFinancials["customerHistory"]>;
  financials: AccountFinancials;
}) {
  const comparable = history.comparable?.available === true;
  const current = history.comparable?.currentTotals || history.ytd;
  const prior = history.comparable?.priorTotals;
  const currentLabel = history.ytd?.end ? `${String(history.ytd.end).slice(0, 4)} YTD` : "Current YTD";
  const priorLabel = comparable && history.comparable?.prior?.end
    ? `Comparable ${String(history.comparable.prior.start).slice(0, 4)}`
    : "Prior period";
  const activity = history.commercialActivity;
  return (
    <AccountReveal motionKey="ad-performance" className="ad-section">
      <header className="ad-section-head">
        <p className="ad-kicker">Customer performance</p>
        <h3>Available history for this relationship</h3>
        <p className="muted">
          {[
            financials.coverage?.historyLabel,
            "Open A/R is current, not historical.",
            comparable ? null : history.comparable?.reason || "Comparable prior-year change is unavailable."
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
      </header>
      <div className="ad-metric-grid">
        <Metric label="Quoted YTD" value={history.ytd?.estimates?.amount} animationKey="perf-q" />
        <Metric label="Sales Orders YTD" value={history.ytd?.salesOrders?.amount} animationKey="perf-so" />
        <Metric label="Invoiced YTD" value={history.ytd?.invoices?.amount} animationKey="perf-inv" />
        <Metric label="Collected YTD" value={history.ytd?.payments?.amount} animationKey="perf-col" />
        <Metric label="Open A/R" value={financials.summary?.openAr} animationKey="perf-ar" />
        <Metric label="Overdue" value={financials.overdueBalance} animationKey="perf-od" />
      </div>
      <div className="table-wrap ad-performance-table">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Activity</th>
              <th>{priorLabel}</th>
              <th>{currentLabel}</th>
              <th>Comparable change</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Quotes", prior?.estimates?.amount, current?.estimates?.amount, history.comparable?.change?.quotes],
                ["Sales Orders", prior?.salesOrders?.amount, current?.salesOrders?.amount, history.comparable?.change?.salesOrders],
                ["Invoiced", prior?.invoices?.amount, current?.invoices?.amount, history.comparable?.change?.invoiced],
                ["Collected", prior?.payments?.amount, current?.payments?.amount, history.comparable?.change?.collected]
              ] as const
            ).map(([label, priorAmt, currentAmt, change]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{comparable ? formatMoney(priorAmt) : "Unavailable"}</td>
                <td>{formatMoney(currentAmt)}</td>
                <td>
                  <ChangeCell change={change} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ad-footnote">Collected is cash timing, not a sales-performance score. Sales Orders are not labeled Sold. This is not a job-level conversion funnel.</p>
      {activity ? (
        <section className="ad-commercial">
          <h4 className="financials-subtitle">{activity.label || "Commercial activity"}</h4>
          <p className="muted">{activity.notes}</p>
          <ol className="ad-commercial-flow">
            <li>
              <strong>Quotes / Estimates</strong>
              <span>
                {formatCount(activity.estimates?.count)} · {formatMoney(activity.estimates?.amount)}
              </span>
            </li>
            <li>
              <strong>Sales Orders</strong>
              <span>
                {formatCount(activity.salesOrders?.count)} · {formatMoney(activity.salesOrders?.amount)}
              </span>
            </li>
            <li>
              <strong>Invoices</strong>
              <span>
                {formatCount(activity.invoices?.count)} · {formatMoney(activity.invoices?.amount)}
              </span>
            </li>
            <li>
              <strong>Payments</strong>
              <span>
                {formatCount(activity.payments?.count)} · {formatMoney(activity.payments?.amount)}
              </span>
            </li>
          </ol>
        </section>
      ) : null}
    </AccountReveal>
  );
}

export function RelationshipHealthPanel({
  relationship,
  financials = null,
  onOpenTab
}: {
  relationship: AccountRelationship | null;
  financials?: AccountFinancials | null;
  onOpenTab: (tab: string) => void;
}) {
  const health = enrichRelationshipHealthWithFinancials(relationship?.health || null, financials);
  if (!relationship?.health && !(health.signals || []).length) {
    return (
      <AccountReveal motionKey="ad-health" className="ad-health">
        <header className="ad-section-head">
          <p className="ad-kicker">Relationship health</p>
          <h3>No relationship status yet</h3>
          <p className="muted">Relationship health appears when governed collection or completeness signals exist.</p>
        </header>
      </AccountReveal>
    );
  }
  const signals = Array.isArray(health.signals) ? health.signals : [];
  return (
    <AccountReveal motionKey="ad-health" className="ad-health">
      <header className="ad-section-head">
        <p className="ad-kicker">Relationship health</p>
        <h3>{health.label}</h3>
        <p className="muted">{health.reason || "No collection or completeness issues on this account."}</p>
      </header>
      <ul className="ad-signal-list">
        {signals.length ? (
          signals.map((signal) => (
            <li key={signal.code || signal.label}>
              <button type="button" className={`ad-signal ad-signal-${signal.severity || "watch"}`} onClick={() => onOpenTab(signal.target || "Overview")}>
                <strong>{signal.label}</strong>
                <span>{signal.detail}</span>
              </button>
            </li>
          ))
        ) : (
          <li className="muted">No relationship signals on file for this account.</li>
        )}
      </ul>
    </AccountReveal>
  );
}

export function FinancialsPanel({
  financials,
  busy,
  error,
  onRetry,
  sessionToken,
  accountId,
  session360,
  onSelectMonth
}: {
  financials: AccountFinancials | null;
  busy: boolean;
  error: string | null;
  onRetry: () => void;
  sessionToken: string | null;
  accountId: string;
  session360?: Account360SessionStore | null;
  onSelectMonth?: (month: string) => void;
}) {
  const [period, setPeriod] = useState("trailing_12");
  const [trend, setTrend] = useState<AccountTrend | null>(financials?.monthlyTrend || null);
  const [trendBusy, setTrendBusy] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<AccountInvoicePage | null>(financials?.openInvoices || null);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceMoreBusy, setInvoiceMoreBusy] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceRetry, setInvoiceRetry] = useState(0);
  const [historyType, setHistoryType] = useState("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<AccountHistoryTransactionPage | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyMoreBusy, setHistoryMoreBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [trendRetry, setTrendRetry] = useState(0);
  const pageGuardRef = useRef(0);

  useEffect(() => {
    pageGuardRef.current += 1;
    setPeriod("trailing_12");
    setHistoryType("all");
    setHistoryPage(1);
    setInvoicePage(1);
    setHistory(null);
    setHistoryError(null);
    setInvoiceError(null);
    setTrendError(null);
    setTrendBusy(false);
    setHistoryBusy(false);
    setInvoiceMoreBusy(false);
    setHistoryMoreBusy(false);
  }, [accountId]);

  useEffect(() => {
    pageGuardRef.current += 1;
    setTrend((prev) => financials?.monthlyTrend || prev);
    setInvoices(financials?.openInvoices || null);
    setInvoicePage(1);
    setHistoryPage(1);
    if (session360 && financials?.monthlyTrend && !session360.hasPanel(accountId, "trend:trailing_12")) {
      session360.setPanel(accountId, "trend:trailing_12", financials.monthlyTrend);
    }
  }, [accountId, financials, session360]);

  useEffect(() => {
    if (!session360 || !financialsDeepReady(financials)) return;
    const key = `trend:${period}`;
    if (period === "trailing_12" && financials?.monthlyTrend) {
      if (!session360.hasPanel(accountId, key)) session360.setPanel(accountId, key, financials.monthlyTrend);
      setTrend(financials.monthlyTrend);
      setTrendBusy(false);
      setTrendError(null);
      return;
    }
    if (session360.hasPanel(accountId, key)) {
      setTrend((session360.getPanel(accountId, key) as AccountTrend | null) ?? null);
      setTrendBusy(false);
      setTrendError(null);
      return;
    }
    if (!sessionToken) return;
    const generation = session360.getGeneration();
    const signal = session360.getSignal() || undefined;
    setTrendBusy(true);
    setTrendError(null);
    void session360
      .loadResource(accountId, key, () =>
        getAccountFinancialsTrend(sessionToken, accountId, period, { signal }).then((res) => res.trend || null)
      )
      .then((next) => {
        if (!shouldApplyHistoryPage(session360, generation, accountId, accountId)) return;
        setTrend((next as AccountTrend | null) ?? null);
      })
      .catch((err) => {
        if (!shouldApplyHistoryPage(session360, generation, accountId, accountId) || isAbortError(err)) return;
        setTrendError(err instanceof ApiError ? err.message : "Could not load trend.");
      })
      .finally(() => {
        if (shouldApplyHistoryPage(session360, generation, accountId, accountId)) setTrendBusy(false);
      });
  }, [accountId, financials, period, session360, sessionToken, trendRetry]);

  useEffect(() => {
    if (!session360 || !sessionToken || !financialsDeepReady(financials) || invoicePage <= 1) return;
    const generation = session360.getGeneration();
    const signal = session360.getSignal() || undefined;
    const expectedAccountId = accountId;
    const guard = pageGuardRef.current;
    setInvoiceMoreBusy(true);
    setInvoiceError(null);
    void getAccountOpenInvoices(sessionToken, accountId, { page: invoicePage, limit: AD_360_INVOICE_PAGE_SIZE }, { signal })
      .then((res) => {
        if (guard !== pageGuardRef.current) return;
        if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) return;
        setInvoices((prev) => applyHistoryPage(prev, res, invoicePage, invoiceItemId) as AccountInvoicePage);
      })
      .catch((err) => {
        if (guard !== pageGuardRef.current) return;
        if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId) || isAbortError(err)) return;
        setInvoiceError(err instanceof ApiError ? err.message : "Could not load more invoices.");
      })
      .finally(() => {
        if (guard !== pageGuardRef.current) return;
        if (shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) setInvoiceMoreBusy(false);
      });
  }, [accountId, financials, invoicePage, session360, sessionToken, invoiceRetry]);

  useEffect(() => {
    if (!session360 || !sessionToken || !financialsDeepReady(financials)) return;
    const key = `history:${historyType}`;
    const generation = session360.getGeneration();
    const signal = session360.getSignal() || undefined;
    const expectedAccountId = accountId;
    const guard = pageGuardRef.current;

    if (historyPage <= 1) {
      if (session360.hasPanel(accountId, key)) {
        setHistory(session360.getPanel(accountId, key) as AccountHistoryTransactionPage);
        setHistoryBusy(false);
        setHistoryError(null);
        return;
      }
      setHistoryBusy(true);
      setHistoryError(null);
      void session360
        .loadResource(accountId, key, () =>
          getAccountHistoryTransactions(
            sessionToken,
            accountId,
            { page: 1, limit: AD_360_HISTORY_PAGE_SIZE, type: historyType },
            { signal }
          ).then((res) => applyHistoryPage(null, res, 1, historyItemId) as AccountHistoryTransactionPage)
        )
        .then((res) => {
          if (guard !== pageGuardRef.current) return;
          if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) return;
          setHistory(res as AccountHistoryTransactionPage);
        })
        .catch((err) => {
          if (guard !== pageGuardRef.current) return;
          if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId) || isAbortError(err)) return;
          setHistory(null);
          setHistoryError(err instanceof ApiError ? err.message : "Could not load history.");
        })
        .finally(() => {
          if (guard !== pageGuardRef.current) return;
          if (shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) setHistoryBusy(false);
        });
      return;
    }

    setHistoryMoreBusy(true);
    setHistoryError(null);
    void getAccountHistoryTransactions(
      sessionToken,
      accountId,
      { page: historyPage, limit: AD_360_HISTORY_PAGE_SIZE, type: historyType },
      { signal }
    )
      .then((res) => {
        if (guard !== pageGuardRef.current) return;
        if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) return;
        setHistory((prev) => applyHistoryPage(prev, res, historyPage, historyItemId) as AccountHistoryTransactionPage);
      })
      .catch((err) => {
        if (guard !== pageGuardRef.current) return;
        if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId) || isAbortError(err)) return;
        setHistoryError(err instanceof ApiError ? err.message : "Could not load more history.");
      })
      .finally(() => {
        if (guard !== pageGuardRef.current) return;
        if (shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) setHistoryMoreBusy(false);
      });
  }, [accountId, financials, historyPage, historyType, session360, sessionToken, historyRetry]);

  if (busy && !financials) {
    return <p className="muted">Loading customer financials…</p>;
  }
  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        {error}
        <button type="button" className="btn btn-secondary btn-sm banner-dismiss" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (!financials) return <p className="muted">Financials are not available.</p>;
  if (financials.status === "unlinked" || financials.linked === false) {
    return (
      <div className="financials-panel">
        <h3 className="financials-title">Customer financials</h3>
        <p className="financials-empty ad-empty-state">
          Connect QuickBooks to view financial history.
          Unavailable is not the same as zero.
        </p>
      </div>
    );
  }
  if (financials.status === "unavailable") {
    return (
      <div className="financials-panel">
        <h3 className="financials-title">Customer financials</h3>
        <p className="financials-empty ad-empty-state">
          QuickBooks is connected, but financial data is currently unavailable.
          Unavailable is not the same as zero.
        </p>
      </div>
    );
  }

  const s = financials.summary ?? {};
  const showAmounts = financials.status === "ok" || financials.status === "stale";
  const recv = financials.freshness?.receivables;
  const hist = financials.freshness?.commercialHistory;
  const activityThrough = formatHumanDate(financials.coverage?.historyAsOf || financials.asOfDate);
  const agingMax = Math.max(
    0,
    ...["current", "days1to30", "days31to60", "days61to90", "days90Plus"].map(
      (k) => Number((financials.aging as Record<string, { balance?: number }> | null)?.[k]?.balance || 0)
    )
  );

  return (
    <div className="financials-panel ad-financials">
      <div className="financials-head">
        <h3 className="financials-title">Customer financials</h3>
        <p className="financials-meta muted">
          {[
            activityThrough ? `Customer activity through ${activityThrough}` : null,
            financials.coverage?.historyLabel ||
              (financials.coverage?.workerCoverageStartDate
                ? `History available from ${formatHumanDate(financials.coverage.workerCoverageStartDate)}`
                : null)
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {recv || hist ? (
        <div className="ad-freshness-strip" aria-label="Financial freshness">
          {recv ? (
            <div className={`ad-freshness-item${recv.isStale ? " is-stale" : ""}`}>
              <p className="ad-kicker">Open receivables</p>
              <strong>
                {recv.asOfDate ? `Snapshot ${formatHumanDate(recv.asOfDate)}` : "Snapshot date unavailable"}
              </strong>
              <span>{freshnessLine(recv)}</span>
            </div>
          ) : null}
          {hist ? (
            <div className={`ad-freshness-item${hist.isStale ? " is-stale" : ""}`}>
              <p className="ad-kicker">Commercial history</p>
              <strong>
                {hist.asOfDate ? `Through ${formatHumanDate(hist.asOfDate)}` : "Through date unavailable"}
              </strong>
              <span>{freshnessLine(hist)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {(financials.warnings ?? []).map((w) => (
        <div key={w} className="banner banner-warn" role="status">
          {w}
        </div>
      ))}
      {showAmounts ? (
        <>
          <div className="ad-metric-grid ad-metric-grid-dense" aria-label="Financial summary">
            <Metric label="Open A/R" value={s.openAr} animationKey="fin-ar" />
            <Metric label="Overdue" value={financials.overdueBalance} animationKey="fin-od" />
            <Metric label="Open invoices" value={s.openInvoiceCount} animationKey="fin-n" count />
            <Metric label="Invoiced YTD" value={s.invoicedYtd} animationKey="fin-inv" />
            <Metric label="Collected YTD" value={s.collectedYtd} animationKey="fin-col" />
            <Metric label="Quoted YTD" value={s.quotedYtd} animationKey="fin-q" />
            <Metric label="Sales Orders $ YTD" value={s.salesOrdersYtd} animationKey="fin-so" />
            <Metric label="Days since payment" value={financials.daysSinceLastPayment} animationKey="fin-dsp" count />
          </div>
          <p className="muted">
            {[
              financials.paymentTerms ? `Payment terms ${financials.paymentTerms}` : null,
              financials.lastInvoice?.date ? `Last invoice ${financials.lastInvoice.date}` : null,
              financials.lastPayment?.date ? `Last payment ${financials.lastPayment.date}` : null,
              financials.oldestOpenInvoice?.date ? `Oldest open ${financials.oldestOpenInvoice.date}` : null,
              financials.oldestOverdueInvoice?.date
                ? `Oldest overdue ${financials.oldestOverdueInvoice.date}`
                : null
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {financials.aging ? (
            <section className="ad-section financials-aging" aria-label="A/R Aging">
              <div className="financials-aging-head">
                <h4 className="financials-subtitle">A/R Aging</h4>
                <p className="financials-meta muted">Based on QuickBooks invoice due dates</p>
              </div>
              <div className="ad-aging-bars">
                {(
                  [
                    ["Current", financials.aging.current],
                    ["1–30", financials.aging.days1to30],
                    ["31–60", financials.aging.days31to60],
                    ["61–90", financials.aging.days61to90],
                    ["90+", financials.aging.days90Plus]
                  ] as const
                ).map(([label, bucket]) => (
                  <div key={label} className="ad-aging-row">
                    <span>{label}</span>
                    <span className="ad-meter">
                      <i
                        style={{ "--meter-width": `${agingMax ? Math.round(((bucket?.balance || 0) / agingMax) * 100) : 0}%` } as CSSProperties}
                      />
                    </span>
                    <strong>{formatMoney(bucket?.balance)}</strong>
                    <small>{bucket?.count || 0}</small>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <section className="ad-section">
            <div className="financials-aging-head">
              <h4 className="financials-subtitle">Collection status</h4>
              <p
                className="financials-meta muted"
                title="Collection status is based only on current QuickBooks invoice due dates and unpaid balances."
              >
                {financials.collectionAttention?.label}: {financials.collectionAttention?.reason}
              </p>
            </div>
          </section>
          <section className="ad-section">
            <div className="ad-toolbar-row">
              <h4 className="financials-subtitle">Customer trend</h4>
              <div className="ad-period-tabs">
                {[
                  ["trailing_12", "12M"],
                  ["ytd", "YTD"],
                  ["prior_year", "Prior year"],
                  ["current_year", "Current year"],
                  ["available", "Available history"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={period === value ? "is-on" : ""}
                    onClick={() => setPeriod(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {trendBusy && !trend ? <p className="muted">Loading customer trend…</p> : null}
            {trendError ? (
              <div className="banner banner-error" role="alert">
                {trendError}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm banner-dismiss"
                  onClick={() => {
                    session360?.clearPanel(accountId, `trend:${period}`);
                    setTrendRetry((n) => n + 1);
                  }}
                >
                  Retry
                </button>
              </div>
            ) : null}
            {trend?.status === "ok" || trend?.status === "stale" ? (
              <CustomerTrendChart
                points={trend.points || []}
                motionKey={`trend-${period}`}
                onSelectMonth={onSelectMonth}
              />
            ) : (
              <p className="muted">{trend?.notes || "Monthly customer trend is unavailable for this window."}</p>
            )}
            {trend?.notes && (trend?.status === "ok" || trend?.status === "stale") ? (
              <p className="muted">{trend.notes}</p>
            ) : null}
            <p className="muted">Current open A/R is a snapshot. It is not drawn as historical balance.</p>
          </section>
          <section className="ad-section">
            <h4 className="financials-subtitle">Open invoices</h4>
            {(invoices?.items || []).length ? (
              <div className="table-wrap">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Due</th>
                      <th>Reference</th>
                      <th>Original</th>
                      <th>Balance</th>
                      <th>Days overdue</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoices?.items || []).map((row, i) => (
                      <tr key={invoiceItemId(row, i)}>
                        <td>{row.invoice_date || "—"}</td>
                        <td>{row.due_date || "—"}</td>
                        <td>{row.reference_number || "—"}</td>
                        <td className="ad-num">{formatMoney(row.original_amount)}</td>
                        <td className="ad-num">{formatMoney(row.open_amount)}</td>
                        <td className="ad-num">{row.days_overdue ?? "—"}</td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No open invoices.</p>
            )}
            {invoiceError ? (
              <div className="banner banner-error" role="alert">
                {invoiceError}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm banner-dismiss"
                  onClick={() => setInvoiceRetry((n) => n + 1)}
                >
                  Retry
                </button>
              </div>
            ) : null}
            {canLoadMoreHistory(invoices?.pagination, invoices?.items?.length || 0) ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={invoiceMoreBusy}
                onClick={() => setInvoicePage((p) => p + 1)}
              >
                {invoiceMoreBusy ? "Loading…" : "Load more invoices"}
              </button>
            ) : historyExhaustedCopy(invoices?.pagination, invoices?.items?.length || 0) ? (
              <p className="muted">{historyExhaustedCopy(invoices?.pagination, invoices?.items?.length || 0)}</p>
            ) : null}
          </section>
          <section className="ad-section">
            <div className="ad-toolbar-row">
              <h4 className="financials-subtitle">Transaction history</h4>
              <div className="ad-period-tabs">
                {[
                  ["all", "All"],
                  ["estimate", "Quotes"],
                  ["sales_order", "Sales Orders"],
                  ["invoice", "Invoices"],
                  ["payment", "Payments"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={historyType === value ? "is-on" : ""}
                    onClick={() => {
                      pageGuardRef.current += 1;
                      setHistoryType(value);
                      setHistoryPage(1);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {historyBusy && !history ? <p className="muted">Loading transaction history…</p> : null}
            {historyError ? (
              <div className="banner banner-error" role="alert">
                {historyError}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm banner-dismiss"
                  onClick={() => {
                    session360?.clearPanel(accountId, `history:${historyType}`);
                    setHistoryPage(1);
                    setHistoryRetry((n) => n + 1);
                  }}
                >
                  Retry
                </button>
              </div>
            ) : null}
            {(history?.items || []).length ? (
              <div className="table-wrap">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(history?.items || []).map((row, i) => (
                      <tr key={historyItemId(row, i)}>
                        <td>{row.date || "—"}</td>
                        <td>
                          {row.type === "sales_order"
                            ? "Sales order"
                            : row.type === "estimate"
                              ? "Quote"
                              : row.type === "payment"
                                ? "Payment"
                                : "Invoice"}
                        </td>
                        <td>{row.referenceNumber || "—"}</td>
                        <td>{formatMoney(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : historyBusy ? null : (
              <p className="muted">No transactions in available history for this filter.</p>
            )}
            {canLoadMoreHistory(history?.pagination, history?.items?.length || 0) ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={historyMoreBusy}
                onClick={() => setHistoryPage((p) => p + 1)}
              >
                {historyMoreBusy ? "Loading…" : "Load more history"}
              </button>
            ) : historyExhaustedCopy(history?.pagination, history?.items?.length || 0) ? (
              <p className="muted">{historyExhaustedCopy(history?.pagination, history?.items?.length || 0)}</p>
            ) : null}
          </section>
        </>
      ) : (
        <p className="financials-empty">Financial data is unavailable. Account identity is unaffected.</p>
      )}
    </div>
  );
}

export function RelationshipWorkspace({
  sessionToken,
  accountId,
  relationship,
  relationshipBusy = false,
  session360,
  onOpenTab,
  context
}: {
  sessionToken: string | null;
  accountId: string;
  relationship: AccountRelationship | null;
  relationshipBusy?: boolean;
  session360?: Account360SessionStore | null;
  onOpenTab: (tab: string) => void;
  context?: {
    primaryContact?: string | null;
    primaryLocation?: string | null;
    qbState?: string | null;
    lastInvoice?: string | null;
    lastInvoiceDate?: string | null;
    lastPayment?: string | null;
    lastPaymentDate?: string | null;
    openOpportunity?: string | null;
    financials?: AccountFinancials | null;
    financialsLoading?: boolean;
  };
}) {
  const [family, setFamily] = useState("all");
  const [timeline, setTimeline] = useState<AccountTimelineResponse | null>(null);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineMoreBusy, setTimelineMoreBusy] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [timelineRetry, setTimelineRetry] = useState(0);
  const timelineGuardRef = useRef(0);

  useEffect(() => {
    timelineGuardRef.current += 1;
    setTimeline(null);
    setPage(1);
    setFamily("all");
    setTimelineError(null);
    setTimelineMoreBusy(false);
  }, [accountId]);

  useEffect(() => {
    if (!session360 || !sessionToken) return;
    const key = `timeline:${family}`;
    const generation = session360.getGeneration();
    const signal = session360.getSignal() || undefined;
    const expectedAccountId = accountId;
    const guard = timelineGuardRef.current;

    if (page <= 1) {
      if (session360.hasPanel(accountId, key)) {
        setTimeline(session360.getPanel(accountId, key) as AccountTimelineResponse);
        setTimelineBusy(false);
        setTimelineError(null);
        return;
      }
      setTimelineBusy(true);
      setTimelineError(null);
      setTimeline(null);
      void session360
        .loadResource(accountId, key, () =>
          getAccountTimeline(sessionToken, accountId, { family, page: 1, limit: AD_360_TIMELINE_PAGE_SIZE }, { signal }).then(
            (res) => applyHistoryPage(null, res, 1, timelineItemId) as AccountTimelineResponse
          )
        )
        .then((res) => {
          if (guard !== timelineGuardRef.current) return;
          if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) return;
          setTimeline(res as AccountTimelineResponse);
        })
        .catch((err) => {
          if (guard !== timelineGuardRef.current) return;
          if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId) || isAbortError(err)) return;
          setTimeline({ items: [] });
          setTimelineError(err instanceof ApiError ? err.message : "Could not load timeline.");
        })
        .finally(() => {
          if (guard !== timelineGuardRef.current) return;
          if (shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) setTimelineBusy(false);
        });
      return;
    }

    setTimelineMoreBusy(true);
    setTimelineError(null);
    void getAccountTimeline(sessionToken, accountId, { family, page, limit: AD_360_TIMELINE_PAGE_SIZE }, { signal })
      .then((res) => {
        if (guard !== timelineGuardRef.current) return;
        if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) return;
        setTimeline((prev) => applyHistoryPage(prev, res, page, timelineItemId) as AccountTimelineResponse);
      })
      .catch((err) => {
        if (guard !== timelineGuardRef.current) return;
        if (!shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId) || isAbortError(err)) return;
        setTimelineError(err instanceof ApiError ? err.message : "Could not load more timeline.");
      })
      .finally(() => {
        if (guard !== timelineGuardRef.current) return;
        if (shouldApplyHistoryPage(session360, generation, expectedAccountId, accountId)) setTimelineMoreBusy(false);
      });
  }, [accountId, family, page, session360, sessionToken, timelineRetry]);

  const view = buildRelationshipView(relationship, timeline, {
    ...context,
    relationshipLoading: relationshipBusy,
    financialsLoading: context?.financialsLoading,
    financials: context?.financials || null
  });

  return (
    <div className="ad-360 ad-relationship">
      <section className="ad-section">
        <header className="ad-section-head">
          <p className="ad-kicker">Customer context</p>
          <h3>{view.healthLabel}</h3>
          <p className="muted">
            {view.healthReason || "How active is our relationship with this customer — from governed records only."}
          </p>
        </header>
        {relationshipBusy && !relationship ? (
          <SectionSkeleton label="Loading relationship context…" />
        ) : (
          <ul className="ad-health-inline ad-health-inline-block">
            <li>
              <span>Relationship timeline</span>
              <strong>{view.timelineRecencyLabel}</strong>
            </li>
            <li>
              <span>Recent commercial activity</span>
              <strong>{view.commercialRecencyLabel}</strong>
            </li>
            <li>
              <span>Primary contact</span>
              <strong>{view.primaryContact || "Not on file"}</strong>
            </li>
            <li>
              <span>Primary location</span>
              <strong>{view.primaryLocation || "Not on file"}</strong>
            </li>
            <li>
              <span>QuickBooks</span>
              <strong>{view.qbState || "Unknown"}</strong>
            </li>
            {view.morawareLinked ? (
              <li>
                <span>Moraware</span>
                <strong>
                  {view.morawareAccounts.length} linked ID
                  {view.morawareAccounts.length === 1 ? "" : "s"}
                </strong>
              </li>
            ) : null}
          </ul>
        )}
        {view.signals.length ? (
          <ul className="ad-signal-list">
            {view.signals.map((signal) => (
              <li key={signal.code || signal.label}>
                <button
                  type="button"
                  className={`ad-signal ad-signal-${signal.severity || "watch"}`}
                  onClick={() => onOpenTab(signal.target || "Overview")}
                >
                  <strong>{signal.label}</strong>
                  <span>{signal.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="ad-section" aria-label="Moraware Operations">
        <header className="ad-section-head">
          <p className="ad-kicker">Moraware Operations</p>
          <h3>2026 production activity</h3>
          <p className="muted">
            Exact linked Moraware Account IDs on the current Moraware population. Job salesperson is a job fact, not
            account ownership.
          </p>
        </header>
        {relationshipBusy && !relationship ? (
          <SectionSkeleton label="Loading Moraware operations…" />
        ) : !view.morawareLinked ? (
          <p className="muted">No Moraware identity is linked.</p>
        ) : view.morawareJobsState !== "available" ? (
          <p className="muted">
            Moraware identity is linked, but job history is temporarily unavailable. This is not a zero-job count.
          </p>
        ) : (
          <>
            <div className="ad-metric-grid ad-metric-grid-dense">
              <TrustedKpi label="2026 Jobs" state="available" display={formatJobsLabel(view.jobCount2026)} />
              <TrustedKpi
                label="2026 SqFt"
                state={view.morawareSqftState === "available" ? "available" : "unavailable"}
                display={view.morawareSqftState === "available" ? formatSqft(view.sqft2026) : null}
              />
              <TrustedKpi
                label="Most recent job"
                state="available"
                display={view.latestJobDate ? formatWhen(view.latestJobDate) : "No 2026 Moraware jobs"}
              />
            </div>
            <ul className="ad-context-list">
              <li>
                <span>Linked Moraware Account IDs</span>
                <strong>
                  {view.morawareAccounts.map((a) => a.source_account_id).filter(Boolean).join(", ") || "Linked"}
                </strong>
              </li>
            </ul>
            <h4 className="financials-subtitle">Recent Jobs</h4>
            {view.recentMorawareJobs.length ? (
              <ul className="ad-plain-list ad-recent-jobs">
                {view.recentMorawareJobs.map((job) => (
                  <li key={job.source_job_id}>
                    <strong>{job.job_name || `Job ${job.source_job_id}`}</strong>
                    <span>
                      {[
                        formatWhen(job.job_date),
                        job.status_name,
                        job.salesperson_name ? `Job salesperson: ${job.salesperson_name}` : null
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No 2026 Moraware jobs on linked accounts.</p>
            )}
          </>
        )}
      </section>

      <section className="ad-section">
        <header className="ad-section-head">
          <p className="ad-kicker">Recent commercial activity</p>
          <h3>Quotes and money signals</h3>
          <p className="ad-footnote">Concise context only — full amounts live on Financials.</p>
        </header>
        <ul className="ad-context-list">
          <li>
            <span>Recent quote activity</span>
            <strong>
              {view.internal.hasItems
                ? `${view.internal.items[0]?.quote_number || "Internal estimate"} · ${view.internal.items[0]?.status || ""}`
                : view.internal.notes || "No UUID-linked quotes on file"}
            </strong>
          </li>
          <li>
            <span>Recent invoice</span>
            <strong>{view.lastInvoice || "Not in this workspace load"}</strong>
          </li>
          <li>
            <span>Recent payment</span>
            <strong>{view.lastPayment || "Not in this workspace load"}</strong>
          </li>
          <li>
            <span>Open opportunity</span>
            <strong>{view.openOpportunity || "See Insights for open opportunity status"}</strong>
          </li>
        </ul>
        <div className="ad-split">
          <article>
            <h4>Internal estimates</h4>
            {view.internal.hasItems ? (
              <ul className="ad-plain-list">
                {view.internal.items.map((item, i) => (
                  <li key={`${item.quote_number}-${i}`}>
                    <strong>{item.quote_number || "Estimate"}</strong>
                    <span>
                      {[item.status, item.amount != null ? formatMoney(item.amount) : null, formatWhen(item.updated_at)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{view.internal.notes || "No internal estimates linked to this account."}</p>
            )}
          </article>
          <article>
            <h4>Studio estimates</h4>
            {view.studio.hasItems ? (
              <ul className="ad-plain-list">
                {view.studio.items.map((item, i) => (
                  <li key={`${item.name}-${i}`}>
                    <strong>{item.name || "Studio estimate"}</strong>
                    <span>{[item.status, formatWhen(item.updated_at)].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{view.studio.notes || "No studio estimates linked to this account."}</p>
            )}
          </article>
        </div>
      </section>

      <section className="ad-section">
        <div className="ad-toolbar-row">
          <header className="ad-section-head">
            <p className="ad-kicker">Recent relationship / system events</p>
            <h3>Relationship timeline</h3>
          </header>
          <select
            value={family}
            onChange={(e) => {
              timelineGuardRef.current += 1;
              setFamily(e.target.value);
              setPage(1);
            }}
            aria-label="Filter timeline"
          >
            <option value="all">All events</option>
            <option value="directory">Directory</option>
            <option value="quickbooks">QuickBooks</option>
            <option value="estimate">Estimates</option>
          </select>
        </div>
        {timelineError ? (
          <div className="banner banner-error" role="alert">
            {timelineError}
            <button
              type="button"
              className="btn btn-secondary btn-sm banner-dismiss"
              onClick={() => {
                session360?.clearPanel(accountId, `timeline:${family}`);
                setPage(1);
                setTimelineRetry((n) => n + 1);
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
        {timelineBusy && !timeline ? (
          <SectionSkeleton label="Loading timeline…" />
        ) : view.emptyTimeline ? (
          <div className="ad-empty-state">
            <p>{view.emptyCopy}</p>
            <p className="muted">
              Human calls, emails, and meetings will appear here when a durable touchpoint source is connected — they
              are not invented here.
            </p>
          </div>
        ) : (
          <ol className="activity-list" aria-label="Account relationship timeline">
            {view.timelineItems.map((entry, i) => (
              <li
                key={timelineItemId(entry, i)}
                className={`activity-item activity-family-${entry.familyClass || "system"}`}
              >
                <span className="activity-dot" aria-hidden="true" />
                <div>
                  <div className="activity-label">
                    <span className={`ad-event-chip ad-event-${entry.familyClass || "system"}`}>
                      {entry.familyClass === "estimate"
                        ? "Quote"
                        : entry.familyClass === "financial"
                          ? "Financial"
                          : entry.familyClass === "moraware"
                            ? "Moraware"
                            : entry.familyClass === "directory"
                              ? "Directory"
                              : "System"}
                    </span>
                    {entry.title || entry.type || "Activity"}
                  </div>
                  <div className="activity-meta">
                    {[
                      formatWhen(entry.at),
                      entry.source,
                      entry.detail,
                      entry.amount != null ? formatMoney(entry.amount) : null
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        {canLoadMoreHistory(timeline?.pagination, timeline?.items?.length || view.timelineItems.length || 0) ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={timelineMoreBusy}
            onClick={() => setPage((p) => p + 1)}
          >
            {timelineMoreBusy ? "Loading…" : "Load more"}
          </button>
        ) : historyExhaustedCopy(timeline?.pagination, timeline?.items?.length || 0) ? (
          <p className="muted">{historyExhaustedCopy(timeline?.pagination, timeline?.items?.length || 0)}</p>
        ) : null}
        <p className="ad-footnote">{view.jobsNotes}</p>
        <p className="ad-footnote">{view.quoteFlowNotes}</p>
      </section>
    </div>
  );
}

export function ContactsSurface({ contacts }: { contacts: AccountContact[] }) {
  if (!contacts.length) return <p className="muted">No contacts on file.</p>;
  return (
    <ul className="ad-card-list">
      {contacts.map((c) => (
        <li key={c.id} className="ad-person-card">
          <div>
            <strong>{c.name}</strong>
            {c.isPrimary ? <span className="chip">Primary</span> : null}
            {c.role ? <p className="muted">{c.role}</p> : null}
          </div>
          <div className="ad-person-links">
            {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="muted">Email unavailable</span>}
            {c.phone ? <a href={`tel:${c.phone}`}>{formatAccountDirectoryPhone(c.phone)}</a> : <span className="muted">Phone unavailable</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LocationsSurface({ locations }: { locations: AccountLocation[] }) {
  if (!locations.length) return <p className="muted">No locations on file.</p>;
  return (
    <ul className="ad-card-list">
      {locations.map((l) => (
        <li key={l.id} className="ad-person-card">
          <div>
            <strong>{l.label || l.line1 || "Location"}</strong>
            {l.isPrimary ? <span className="chip">Primary</span> : null}
            <p className="muted">
              {[l.line1, l.line2, [l.city, l.state].filter(Boolean).join(", "), l.postalCode].filter(Boolean).join(" · ")}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ConnectionsSurface({ links }: { links: ExternalLink[] }) {
  if (!links.length) return <p className="muted">No external links on file.</p>;
  return (
    <ul className="ad-card-list">
      {links.map((link) => (
        <li key={link.id} className="ad-person-card">
          <div>
            <strong>{link.system || "External system"}</strong>
            <p className="muted">
              {[
                link.isActive === false ? "Inactive" : "Linked",
                link.externalDisplayName,
                link.linkedAt ? `Linked ${formatWhen(link.linkedAt)}` : null
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function loadRelationship(
  token: string,
  accountId: string,
  init: RequestInit = {}
): Promise<AccountRelationship | null> {
  return getAccountRelationship(token, accountId, init).then((res) => res.relationship ?? null);
}

export { ApiError };
