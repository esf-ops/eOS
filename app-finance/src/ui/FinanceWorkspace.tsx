import { useEffect, useState, type ReactNode } from "react";
import { ApiError, apiFetch } from "../lib/api";
import {
  FINANCE_TABS,
  formatMoney,
  isFinanceTab,
  type FinanceTab,
} from "../lib/financeViewModel";
import {
  BalanceSheetWorkspace,
  CashWorkspace,
  EmptyState,
  OverviewCommandCenter,
  PayablesWorkspace,
  PnlWorkspace,
  ReceivablesWorkspace,
  ReconciliationWorkspace,
} from "./FinanceCommandCenter";
import FinanceDrilldown from "./FinanceDrilldown";
import FinanceDrilldownContent, {
  type DrilldownData,
  type FinanceDrilldownKind,
} from "./FinanceDrilldownContent";

type Props = { token: string };
type ApiRecord = Record<string, unknown>;
type Counterparty = {
  type: "customer" | "vendor";
  name: string;
  openAmount: number | null;
  overdueAmount: number | null;
  count: number | null;
  oldestDueDate: string | null;
};

function tabFromHash(): FinanceTab {
  const raw = String(window.location.hash || "").replace(/^#/, "");
  return isFinanceTab(raw) ? raw : "overview";
}

function apiPathForTab(tab: FinanceTab): string {
  if (tab === "overview") return "/api/finance/overview";
  if (tab === "pnl") return "/api/finance/pnl?preset=ytd";
  if (tab === "balance-sheet") return "/api/finance/balance-sheet";
  if (tab === "ar") return "/api/finance/ar";
  if (tab === "ap") return "/api/finance/ap";
  if (tab === "cash") return "/api/finance/cash";
  return "/api/finance/reconciliation";
}

export default function FinanceWorkspace({ token }: Props) {
  const [tab, setTab] = useState<FinanceTab>(tabFromHash);
  const [overview, setOverview] = useState<ApiRecord | null>(null);
  const [pnl, setPnl] = useState<ApiRecord | null>(null);
  const [bs, setBs] = useState<ApiRecord | null>(null);
  const [ar, setAr] = useState<ApiRecord | null>(null);
  const [ap, setAp] = useState<ApiRecord | null>(null);
  const [cash, setCash] = useState<ApiRecord | null>(null);
  const [recon, setRecon] = useState<ApiRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drilldown, setDrilldown] = useState<FinanceDrilldownKind | null>(null);
  const [drilldownData, setDrilldownData] = useState<DrilldownData | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState("");
  const [drilldownCache, setDrilldownCache] = useState<
    Partial<Record<FinanceDrilldownKind, DrilldownData>>
  >({});
  const [counterparty, setCounterparty] = useState<Counterparty | null>(null);

  useEffect(() => {
    window.location.hash = tab;
  }, [tab]);

  useEffect(() => {
    if (overview) return;
    let cancelled = false;
    void apiFetch("/api/finance/overview", { token })
      .then((result) => {
        if (!cancelled) setOverview(result as ApiRecord);
      })
      .catch(() => {
        // The active-tab request renders the visible error. This background context request stays quiet.
      });
    return () => {
      cancelled = true;
    };
  }, [overview, token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void apiFetch(apiPathForTab(tab), { token })
      .then((result) => {
        if (cancelled) return;
        const data = result as ApiRecord;
        if (tab === "overview") setOverview(data);
        else if (tab === "pnl") setPnl(data);
        else if (tab === "balance-sheet") setBs(data);
        else if (tab === "ar") setAr(data);
        else if (tab === "ap") setAp(data);
        else if (tab === "cash") setCash(data);
        else setRecon(data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof ApiError ? reason.message : String((reason as Error)?.message ?? reason));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, token]);

  async function loadPnlDrilldown(): Promise<DrilldownData> {
    const ytd = (pnl || (await apiFetch("/api/finance/pnl?preset=ytd", { token }))) as ApiRecord;
    const windows = (ytd.contributing_windows || []) as Array<{
      period_start?: string;
      period_end?: string;
    }>;
    const monthly = await Promise.all(
      windows
        .filter((window) => window.period_start && window.period_end)
        .map(
          (window) =>
            apiFetch(
              `/api/finance/pnl?period_start=${encodeURIComponent(String(window.period_start))}&period_end=${encodeURIComponent(String(window.period_end))}`,
              { token },
            ) as Promise<ApiRecord>,
        ),
    );
    return {
      ytd,
      monthly,
      current: monthly.at(-1),
      previous: monthly.at(-2),
    };
  }

  async function openDrilldown(kind: FinanceDrilldownKind) {
    setDrilldown(kind);
    setDrilldownError("");
    const cached = drilldownCache[kind];
    if (cached) {
      setDrilldownData(cached);
      setDrilldownLoading(false);
      return;
    }
    setDrilldownData(null);
    setDrilldownLoading(true);
    try {
      let data: DrilldownData;
      if (["revenue", "gross_profit", "gross_margin", "net_income"].includes(kind)) {
        data = await loadPnlDrilldown();
      } else if (kind === "ar") {
        data = { ar: (ar || (await apiFetch("/api/finance/ar", { token }))) as ApiRecord };
      } else if (kind === "ap") {
        data = { ap: (ap || (await apiFetch("/api/finance/ap", { token }))) as ApiRecord };
      } else if (kind === "cash") {
        data = { cash: (cash || (await apiFetch("/api/finance/cash", { token }))) as ApiRecord };
      } else {
        data = {
          bs: (bs || (await apiFetch("/api/finance/balance-sheet", { token }))) as ApiRecord,
        };
      }
      setDrilldownCache((current) =>
        ["revenue", "gross_profit", "gross_margin", "net_income"].includes(kind)
          ? {
              ...current,
              revenue: data,
              gross_profit: data,
              gross_margin: data,
              net_income: data,
            }
          : { ...current, [kind]: data },
      );
      setDrilldownData(data);
    } catch (reason: unknown) {
      setDrilldownError(
        reason instanceof ApiError ? reason.message : String((reason as Error)?.message ?? reason),
      );
    } finally {
      setDrilldownLoading(false);
    }
  }

  function navigate(nextTab: FinanceTab) {
    setDrilldown(null);
    setCounterparty(null);
    setTab(nextTab);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  function selectCounterparty(type: "customer" | "vendor", row: Record<string, unknown>) {
    setCounterparty({
      type,
      name: String(row[type === "customer" ? "customer_name" : "vendor_name"] || `Unnamed ${type}`),
      openAmount: row.open_amount == null ? null : Number(row.open_amount),
      overdueAmount: row.overdue_amount == null ? null : Number(row.overdue_amount),
      count:
        row[type === "customer" ? "invoice_count" : "bill_count"] == null
          ? null
          : Number(row[type === "customer" ? "invoice_count" : "bill_count"]),
      oldestDueDate: row.oldest_due_date ? String(row.oldest_due_date) : null,
    });
  }

  let content: ReactNode = null;
  if (!loading || (tab === "overview" && overview)) {
    if (tab === "overview" && overview) {
      content = (
        <OverviewCommandCenter
          overview={overview}
          onOpen={(kind) => void openDrilldown(kind)}
          onNavigate={navigate}
        />
      );
    } else if (tab === "pnl" && pnl) {
      content =
        pnl.state === "unavailable" ? (
          <EmptyState title="P&L unavailable" body={String(pnl.notes || "No governed P&L facts are stored.")} />
        ) : (
          <PnlWorkspace pnl={pnl} token={token} />
        );
    } else if (tab === "balance-sheet" && bs) {
      content =
        bs.state === "unavailable" ? (
          <EmptyState title="Balance Sheet unavailable" body={String(bs.notes || "No current statement is stored.")} />
        ) : (
          <BalanceSheetWorkspace data={bs} />
        );
    } else if (tab === "ar" && ar) {
      content = (
        <ReceivablesWorkspace
          data={ar}
          token={token}
          onCustomer={(row) => selectCounterparty("customer", row as Record<string, unknown>)}
        />
      );
    } else if (tab === "ap" && ap) {
      content = (
        <PayablesWorkspace
          data={ap}
          token={token}
          onVendor={(row) => selectCounterparty("vendor", row as Record<string, unknown>)}
        />
      );
    } else if (tab === "cash" && cash) {
      content = <CashWorkspace data={cash} />;
    } else if (tab === "reconciliation" && recon) {
      content = <ReconciliationWorkspace data={recon} token={token} />;
    }
  }

  return (
    <>
      <section className="fin-hero">
        <div className="fin-hero-aurora" aria-hidden="true" />
        <div className="fin-hero-grid">
          <div>
            <p className="fin-kicker">Finance · Elite Stone Fabrication</p>
            <h1>Financial command center</h1>
            <p>
              Understand performance, investigate working capital, and trace every displayed total to
              governed QuickBooks facts.
            </p>
            <div className="fin-hero-chips">
              <span>Accrual basis</span>
              <span>Read-only QuickBooks</span>
              <span>Organization scoped</span>
            </div>
          </div>
          <aside className="fin-hero-status">
            <span>Latest accounting period</span>
            <strong>
              {String((overview?.ytd_period as ApiRecord | undefined)?.period_end || "Loading…")}
            </strong>
            <small>Governed Finance facts · no forecast</small>
          </aside>
        </div>
      </section>

      <nav className="fin-tabbar" aria-label="Finance sections">
        <div>
          {FINANCE_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "is-active" : ""}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="fin-page">
        {error ? (
          <div className="fin-banner fail" role="alert">
            <strong>Finance data could not load.</strong>
            <p>{error}</p>
          </div>
        ) : null}
        {loading && !content ? (
          <div className="fin-loading" role="status">
            Loading governed Finance facts…
          </div>
        ) : null}
        <div className="fin-tab-content" key={tab}>
          {content}
        </div>
      </div>

      {drilldown && overview ? (
        <FinanceDrilldownContent
          kind={drilldown}
          overview={overview}
          data={drilldownData}
          loading={drilldownLoading}
          error={drilldownError}
          onClose={() => setDrilldown(null)}
          onNavigate={navigate}
        />
      ) : null}

      {counterparty ? (
        <FinanceDrilldown
          index={counterparty.type === "customer" ? "A/R" : "A/P"}
          kicker={counterparty.type === "customer" ? "Customer exposure" : "Vendor exposure"}
          title={counterparty.name}
          value={formatMoney(counterparty.openAmount)}
          valueLabel={`Open ${counterparty.type === "customer" ? "receivable" : "payable"}`}
          lead={`Focused governed ${counterparty.type} exposure. Use the full workspace for the bounded invoice or bill explorer.`}
          onClose={() => setCounterparty(null)}
        >
          <div className="fin-drilldown-metric-grid">
            <div className="fin-drilldown-metric">
              <span>Past due</span>
              <strong>{formatMoney(counterparty.overdueAmount)}</strong>
            </div>
            <div className="fin-drilldown-metric">
              <span>{counterparty.type === "customer" ? "Open invoices" : "Open bills"}</span>
              <strong>{counterparty.count ?? "Unavailable"}</strong>
            </div>
            <div className="fin-drilldown-metric">
              <span>Oldest due date</span>
              <strong>{counterparty.oldestDueDate || "Unavailable"}</strong>
            </div>
          </div>
          <button
            type="button"
            className="fin-drilldown-next"
            onClick={() => navigate(counterparty.type === "customer" ? "ar" : "ap")}
          >
            <span>Continue exploring</span>
            <strong>Open full {counterparty.type === "customer" ? "A/R" : "A/P"} workspace</strong>
            <i aria-hidden="true">→</i>
          </button>
        </FinanceDrilldown>
      ) : null}
    </>
  );
}
