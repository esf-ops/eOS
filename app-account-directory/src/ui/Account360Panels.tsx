import { useEffect, useState, type CSSProperties } from "react";
import { ApiError } from "../lib/api";
import {
  getAccountFinancialsTrend,
  getAccountOpenInvoices,
  getAccountRelationship,
  getAccountTimeline
} from "../lib/accountDirectoryApi";
import type {
  AccountContact,
  AccountDetail,
  AccountFinancials,
  AccountLocation,
  AccountRelationship,
  AccountTimelineResponse,
  ExternalLink
} from "../lib/types";
import { CustomerTrendChart } from "./AccountCharts";
import { formatCount, formatMoney } from "./accountFormat";
import { AccountReveal, AnimatedNumber } from "./accountMotion";

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleString(undefined, { dateStyle: "medium" });
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
    <article className="ad-metric-card">
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

export function Overview360({
  detail,
  financials,
  busy,
  onOpenTab
}: {
  detail: AccountDetail;
  financials: AccountFinancials | null;
  busy: boolean;
  onOpenTab: (tab: string) => void;
}) {
  const s = financials?.summary;
  const showMoney = financials?.status === "ok" || financials?.status === "stale";
  return (
    <div className="ad-360">
      <AccountReveal motionKey="ad-identity" className="ad-identity">
        <div>
          <p className="ad-kicker">Account</p>
          <h2>{detail.displayName ?? detail.name}</h2>
          <p className="muted">
            {[detail.city, detail.state].filter(Boolean).join(", ") || "Location not on file"}
          </p>
        </div>
        <dl className="ad-identity-meta">
          <div>
            <dt>Status</dt>
            <dd>
              {detail.status === "needs_review"
                ? "Needs review"
                : String(detail.status || "—")
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
            </dd>
          </div>
          <div>
            <dt>Primary contact</dt>
            <dd>{detail.primaryContact || "—"}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>
              {detail.primaryPhone ? <a href={`tel:${detail.primaryPhone}`}>{detail.primaryPhone}</a> : "—"}
            </dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              {detail.primaryEmail ? <a href={`mailto:${detail.primaryEmail}`}>{detail.primaryEmail}</a> : "—"}
            </dd>
          </div>
          <div>
            <dt>QuickBooks</dt>
            <dd>{detail.qbEnrichment?.label || (detail.quickbooksLinked ? "Linked" : "Not linked")}</dd>
          </div>
          <div>
            <dt>Completeness</dt>
            <dd>
              {[
                detail.status === "needs_review" ? "Needs review" : null,
                detail.hasPrimaryContact === false ? "Missing primary contact" : null,
                detail.hasPrimaryLocation === false ? "Missing primary location" : null
              ]
                .filter(Boolean)
                .join(" · ") || "Ready"}
            </dd>
          </div>
        </dl>
      </AccountReveal>

      <AccountReveal motionKey="ad-snapshot">
        <header className="ad-section-head">
          <p className="ad-kicker">Account snapshot</p>
          <h3>Who they are to us this year</h3>
        </header>
        {busy && !financials ? <p className="muted">Loading customer financials…</p> : null}
        <div className="ad-metric-grid">
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
        <p className="muted">
          {[
            financials?.lastInvoice?.date ? `Last invoice ${financials.lastInvoice.date}` : null,
            financials?.lastPayment?.date ? `Last payment ${financials.lastPayment.date}` : null,
            financials?.paymentTerms ? `Terms ${financials.paymentTerms}` : null,
            financials?.collectionAttention?.label
              ? `Collection ${financials.collectionAttention.label}`
              : null
          ]
            .filter(Boolean)
            .join(" · ") || "Customer financials appear after this account is linked to QuickBooks."}
        </p>
      </AccountReveal>
    </div>
  );
}

export function RelationshipHealthPanel({
  relationship,
  onOpenTab
}: {
  relationship: AccountRelationship | null;
  onOpenTab: (tab: string) => void;
}) {
  if (!relationship?.health) return null;
  const health = relationship.health;
  return (
    <AccountReveal motionKey="ad-health" className="ad-health">
      <header className="ad-section-head">
        <p className="ad-kicker">Relationship health</p>
        <h3>{health.label}</h3>
        <p className="muted">{health.reason || "No collection or completeness issues on this account."}</p>
      </header>
      <ul className="ad-signal-list">
        {health.signals.map((signal) => (
          <li key={signal.code}>
            <button type="button" className={`ad-signal ad-signal-${signal.severity}`} onClick={() => onOpenTab(signal.target)}>
              <strong>{signal.label}</strong>
              <span>{signal.detail}</span>
            </button>
          </li>
        ))}
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
  onSelectMonth
}: {
  financials: AccountFinancials | null;
  busy: boolean;
  error: string | null;
  onRetry: () => void;
  sessionToken: string | null;
  accountId: string;
  onSelectMonth?: (month: string) => void;
}) {
  const [period, setPeriod] = useState("trailing_12");
  const [trend, setTrend] = useState(financials?.monthlyTrend || null);
  const [invoices, setInvoices] = useState(financials?.openInvoices || null);
  const [invoicePage, setInvoicePage] = useState(1);

  useEffect(() => {
    setTrend(financials?.monthlyTrend || null);
    setInvoices(financials?.openInvoices || null);
    setInvoicePage(1);
  }, [financials]);

  useEffect(() => {
    if (!sessionToken) return;
    if (period === "trailing_12") {
      setTrend(financials?.monthlyTrend || null);
      return;
    }
    void getAccountFinancialsTrend(sessionToken, accountId, period)
      .then((res) => setTrend(res.trend || null))
      .catch(() => undefined);
  }, [accountId, financials?.monthlyTrend, period, sessionToken]);

  useEffect(() => {
    if (!sessionToken || invoicePage <= 1) return;
    void getAccountOpenInvoices(sessionToken, accountId, { page: invoicePage, limit: 50 })
      .then((res) =>
        setInvoices((prev) => ({
          ...res,
          items: [...(prev?.items || []), ...(res.items || [])]
        }))
      )
      .catch(() => undefined);
  }, [accountId, invoicePage, sessionToken]);

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
        <p className="financials-empty">
          This account is not linked to QuickBooks yet, so invoices, payments, and A/R are not connected.
        </p>
      </div>
    );
  }

  const s = financials.summary ?? {};
  const showAmounts = financials.status === "ok" || financials.status === "stale";
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
            financials.asOfDate ? `As of ${financials.asOfDate}` : null,
            financials.status === "stale" ? "Figures may be stale" : null,
            "This customer only — not company profit and loss"
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {(financials.warnings ?? []).map((w) => (
        <div key={w} className="banner banner-warn" role="status">
          {w}
        </div>
      ))}
      {showAmounts ? (
        <>
          <div className="ad-metric-grid" aria-label="Financial summary">
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
            <section className="financials-aging" aria-label="A/R Aging">
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
          <section>
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
          <section>
            <div className="ad-toolbar-row">
              <h4 className="financials-subtitle">Customer trend</h4>
              <div className="ad-period-tabs">
                {[
                  ["trailing_12", "12M"],
                  ["ytd", "YTD"],
                  ["2025", "2025"],
                  ["2026", "2026"]
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
          <section>
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
                    {invoices?.items.map((row, i) => (
                      <tr key={`${row.reference_number || "inv"}-${i}`}>
                        <td>{row.invoice_date || "—"}</td>
                        <td>{row.due_date || "—"}</td>
                        <td>{row.reference_number || "—"}</td>
                        <td>{formatMoney(row.original_amount)}</td>
                        <td>{formatMoney(row.open_amount)}</td>
                        <td>{row.days_overdue ?? "—"}</td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No open invoices.</p>
            )}
            {invoices?.pagination?.has_more ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setInvoicePage((p) => p + 1)}>
                Load more invoices
              </button>
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
  onOpenTab
}: {
  sessionToken: string | null;
  accountId: string;
  relationship: AccountRelationship | null;
  onOpenTab: (tab: string) => void;
}) {
  const [family, setFamily] = useState("all");
  const [timeline, setTimeline] = useState<AccountTimelineResponse | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!sessionToken) return;
    void getAccountTimeline(sessionToken, accountId, { family, page, limit: 25 })
      .then((res) => {
        setTimeline((prev) =>
          page === 1 ? res : { ...res, items: [...(prev?.items || []), ...(res.items || [])] }
        );
      })
      .catch(() => undefined);
  }, [accountId, family, page, sessionToken]);

  return (
    <div className="ad-360">
      <RelationshipHealthPanel relationship={relationship} onOpenTab={onOpenTab} />
      <section>
        <header className="ad-section-head">
          <p className="ad-kicker">Estimates</p>
          <h3>Estimates linked to this account</h3>
        </header>
        <div className="ad-split">
          <article>
            <h4>Internal estimates</h4>
            {relationship?.estimates.internal.state === "available" && relationship.estimates.internal.items.length ? (
              <ul className="ad-plain-list">
                {relationship.estimates.internal.items.map((item, i) => (
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
              <p className="muted">
                {relationship?.estimates.internal.notes || "No internal estimates linked to this account."}
              </p>
            )}
          </article>
          <article>
            <h4>Studio estimates</h4>
            {relationship?.estimates.studio.state === "available" && relationship.estimates.studio.items.length ? (
              <ul className="ad-plain-list">
                {relationship.estimates.studio.items.map((item, i) => (
                  <li key={`${item.name}-${i}`}>
                    <strong>{item.name || "Studio estimate"}</strong>
                    <span>{[item.status, formatWhen(item.updated_at)].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{relationship?.estimates.studio.notes || "No studio estimates linked to this account."}</p>
            )}
          </article>
        </div>
        <p className="muted">
          {relationship?.jobs.notes || "Moraware job history is not connected to Account Directory yet."}
        </p>
        <p className="muted">
          {relationship?.quoteFlow?.notes || "Quote Flow history is not connected to Account Directory yet."}
        </p>
      </section>
      <section>
        <div className="ad-toolbar-row">
          <h3>Relationship timeline</h3>
          <select value={family} onChange={(e) => { setFamily(e.target.value); setPage(1); }} aria-label="Filter timeline">
            <option value="all">All events</option>
            <option value="directory">Directory</option>
            <option value="quickbooks">QuickBooks</option>
            <option value="estimate">Estimates</option>
          </select>
        </div>
        <ol className="activity-list" aria-label="Account relationship timeline">
          {(timeline?.items || []).map((entry) => (
            <li key={entry.id} className="activity-item">
              <span className="activity-dot" aria-hidden="true" />
              <div>
                <div className="activity-label">{entry.title}</div>
                <div className="activity-meta">
                  {[formatWhen(entry.at), entry.source, entry.detail, entry.amount != null ? formatMoney(entry.amount) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {!timeline?.items?.length ? <p className="muted">No linked relationship events yet.</p> : null}
        {timeline?.pagination?.has_more ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPage((p) => p + 1)}>
            Load more
          </button>
        ) : null}
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
            {c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : <span className="muted">Phone unavailable</span>}
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
  accountId: string
): Promise<AccountRelationship | null> {
  return getAccountRelationship(token, accountId).then((res) => res.relationship ?? null);
}

export { ApiError };
