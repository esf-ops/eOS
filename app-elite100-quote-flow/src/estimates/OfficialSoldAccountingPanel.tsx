/**
 * Staff sold review, Mark Sold, and QuickBooks sales order status.
 * Mark Sold, retry and customer:job selection are enforced by Brain (privileged role,
 * checklist, org scope); this panel only reflects what the server allows.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import {
  fetchQuoteFlowSoldWorkspace,
  markQuoteFlowEstimateSold,
  retryQuoteFlowSalesOrder,
  saveQuoteFlowSoldReview,
  selectQuoteFlowSalesOrderCustomerJob,
  type QuoteFlowSalesOrder,
  type QuoteFlowSoldWorkspace
} from "../lib/quoteFlowEstimatesApi";

type Props = {
  authToken: string;
  estimateId: string;
  disabled?: boolean;
};

const POLL_MS = 5000;
const SETTLED = new Set(["synced", "blocked", "needs_attention"]);

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

function money(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}$${abs}`;
}

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : String(iso);
}

/** TEST company only (Brain enforces): name the customer:job when the account has no QuickBooks match. */
function TypedCustomerJob(props: { disabled: boolean; onSubmit: (fullName: string) => void }) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  return (
    <div className="qf-sold__typed-job" data-testid="qf-sold-qb-typed-job">
      <input
        type="text"
        value={value}
        placeholder="Customer:Job, e.g. Synthetic Builders Inc:Lot 12 Kitchen"
        aria-label="QuickBooks customer:job"
        onChange={(e) => setValue(e.target.value)}
        disabled={props.disabled}
        data-testid="qf-sold-qb-typed-job-input"
      />
      <button
        type="button"
        className="qf-btn-secondary qf-btn-xs"
        disabled={props.disabled || !trimmed.includes(":")}
        onClick={() => props.onSubmit(trimmed)}
        data-testid="qf-sold-qb-typed-job-submit"
      >
        Use this customer:job
      </button>
    </div>
  );
}

function SalesOrderStatus(props: {
  salesOrder: QuoteFlowSalesOrder | null;
  salesOrderError: string | null;
  canAct: boolean;
  busy: boolean;
  onRetry: () => void;
  onSelectCustomerJob: (listId: string | null, fullName: string | null) => void;
}) {
  const { salesOrder, salesOrderError, canAct, busy } = props;
  if (!salesOrder) {
    return (
      <p className="qf-muted" data-testid="qf-sold-qb-none">
        {salesOrderError
          ? "The QuickBooks sales order could not be queued yet. It will be retried automatically."
          : "No QuickBooks sales order yet."}
      </p>
    );
  }
  if (salesOrder.status === "not_configured") {
    return (
      <p className="qf-muted" data-testid="qf-sold-qb-not-configured">
        QuickBooks sales orders are not configured for this organization.
      </p>
    );
  }
  const blockers = salesOrder.blockers || [];
  return (
    <div className="qf-sold__qb" data-testid="qf-sold-qb">
      <div className="qf-accepted__header-grid">
        <div>
          <span className="qf-activity__status-label">QuickBooks sales order</span>
          <span
            className={`qf-activity__status-value qf-sold__status is-${salesOrder.status}`}
            data-testid="qf-sold-qb-status"
          >
            {salesOrder.statusLabel || salesOrder.status}
          </span>
        </div>
        <div>
          <span className="qf-activity__status-label">Sales order number</span>
          <span className="qf-activity__status-value" data-testid="qf-sold-qb-ref">
            {salesOrder.qbRefNumber || "—"}
          </span>
        </div>
        <div>
          <span className="qf-activity__status-label">QuickBooks transaction ID</span>
          <span className="qf-activity__status-value" data-testid="qf-sold-qb-txn">
            {salesOrder.qbTxnId || "—"}
          </span>
        </div>
        <div>
          <span className="qf-activity__status-label">Customer:job</span>
          <span className="qf-activity__status-value">{salesOrder.customer?.fullName || "—"}</span>
        </div>
        <div>
          <span className="qf-activity__status-label">Company</span>
          <span className="qf-activity__status-value">{salesOrder.companyIdentity || "—"}</span>
        </div>
        <div>
          <span className="qf-activity__status-label">Order total</span>
          <span className="qf-activity__status-value">
            {salesOrder.totalCents != null ? money(salesOrder.totalCents / 100) : "—"}
          </span>
        </div>
      </div>

      {salesOrder.lastError?.message ? (
        <p className="qf-error" data-testid="qf-sold-qb-error">
          {salesOrder.lastError.message}
        </p>
      ) : null}

      {blockers.length > 0 ? (
        <ul className="qf-sold__blockers" data-testid="qf-sold-qb-blockers">
          {blockers.map((b, i) => (
            <li key={`${b.code}-${i}`}>
              <span>{b.message || b.code}</span>
              {b.code === "qb_customer_job_unresolved" && (b.candidates || []).length > 0 ? (
                <div className="qf-sold__candidates" data-testid="qf-sold-qb-candidates">
                  {(b.candidates || []).map((c) => (
                    <button
                      key={c.listId || c.fullName || "candidate"}
                      type="button"
                      className="qf-btn-secondary qf-btn-xs"
                      disabled={!canAct || busy}
                      onClick={() => props.onSelectCustomerJob(c.listId, c.fullName)}
                    >
                      {c.fullName || c.listId}
                    </button>
                  ))}
                </div>
              ) : null}
              {b.code === "qb_customer_job_unresolved" &&
              (b.candidates || []).length === 0 &&
              salesOrder.typedCustomerJobAllowed ? (
                <TypedCustomerJob
                  disabled={!canAct || busy}
                  onSubmit={(fullName) => props.onSelectCustomerJob(null, fullName)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {salesOrder.canRetry ? (
        <button
          type="button"
          className="qf-btn-secondary"
          data-testid="qf-sold-qb-retry"
          disabled={!canAct || busy}
          onClick={props.onRetry}
        >
          Retry sales order
        </button>
      ) : null}
    </div>
  );
}

export default function OfficialSoldAccountingPanel(props: Props) {
  const { authToken, estimateId, disabled = false } = props;
  const [workspace, setWorkspace] = useState<QuoteFlowSoldWorkspace | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchQuoteFlowSoldWorkspace(authToken, estimateId);
      setWorkspace(res);
      setChecklist(res.soldReview?.checklist || {});
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [authToken, estimateId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const salesOrder = workspace?.salesOrder || null;
  const soldSnapshot = workspace?.soldSnapshot || null;
  const pollStatus = soldSnapshot && salesOrder && !SETTLED.has(salesOrder.status) && salesOrder.status !== "not_configured";

  useEffect(() => {
    if (!pollStatus) return;
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [pollStatus, load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const labels = workspace?.checklistLabels || {};
  const keys = Object.keys(labels);
  const canAct = Boolean(workspace?.canMarkSold) && !disabled;
  const checklistComplete = keys.length > 0 && keys.every((k) => checklist[k]);
  const acceptance = workspace?.acceptance || null;

  return (
    <section className="qf-accepted qf-sold" data-testid="qf-sold-panel">
      <div className="qf-accepted__head">
        <h3>Sold review and QuickBooks</h3>
        <p className="qf-muted">
          Staff confirm the accepted estimate, mark it sold, and a QuickBooks sales order is created
          from the accepted amounts. No invoice is created.
        </p>
      </div>

      {loading ? <p className="qf-muted">Loading…</p> : null}
      {error ? (
        <p className="qf-error" data-testid="qf-sold-error">
          {error}
        </p>
      ) : null}

      {!loading && workspace && !acceptance ? (
        <p className="qf-muted" data-testid="qf-sold-not-accepted">
          The customer has not accepted this estimate yet.
        </p>
      ) : null}

      {!loading && workspace && acceptance && !soldSnapshot ? (
        <div data-testid="qf-sold-review">
          <p>
            Accepted {when(acceptance.acceptedAt)} · {money(acceptance.customerDisplayTotal)}
          </p>
          {(workspace.openReviewRequestCount || 0) > 0 ? (
            <p className="qf-error">The customer has an open review request. Resolve it before marking sold.</p>
          ) : null}
          <ul className="qf-sold__checklist" data-testid="qf-sold-checklist">
            {keys.map((k) => (
              <li key={k}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(checklist[k])}
                    disabled={!canAct || busy}
                    onChange={(e) => setChecklist({ ...checklist, [k]: e.target.checked })}
                  />{" "}
                  {labels[k]}
                </label>
              </li>
            ))}
          </ul>
          {!workspace.canMarkSold ? (
            <p className="qf-muted" data-testid="qf-sold-not-privileged">
              Only an administrator can mark an estimate sold.
            </p>
          ) : null}
          <div className="qf-accepted__actions">
            <button
              type="button"
              className="qf-btn-secondary"
              data-testid="qf-sold-save-checklist"
              disabled={!canAct || busy}
              onClick={() =>
                void run(() =>
                  saveQuoteFlowSoldReview(authToken, estimateId, checklist, workspace.soldReview?.notes ?? null)
                )
              }
            >
              Save checklist
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  className="qf-btn-primary"
                  data-testid="qf-sold-confirm"
                  disabled={!canAct || busy}
                  onClick={() =>
                    void run(async () => {
                      await saveQuoteFlowSoldReview(authToken, estimateId, checklist, workspace.soldReview?.notes ?? null);
                      await markQuoteFlowEstimateSold(authToken, estimateId);
                      setConfirming(false);
                    })
                  }
                >
                  Confirm Mark Sold · {money(acceptance.customerDisplayTotal)}
                </button>
                <button type="button" className="qf-btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="qf-btn-primary"
                data-testid="qf-sold-mark"
                disabled={!canAct || busy || !checklistComplete}
                onClick={() => setConfirming(true)}
              >
                Mark Sold
              </button>
            )}
          </div>
          {confirming ? (
            <p className="qf-muted" data-testid="qf-sold-confirm-copy">
              This records the sale at the accepted total and queues a QuickBooks sales order. It
              cannot be undone from Quote Flow.
            </p>
          ) : null}
        </div>
      ) : null}

      {!loading && soldSnapshot ? (
        <div data-testid="qf-sold-done">
          <p data-testid="qf-sold-summary">
            Sold {when(soldSnapshot.soldAt)} · {money(soldSnapshot.customerDisplayTotal)}
          </p>
          <SalesOrderStatus
            salesOrder={salesOrder}
            salesOrderError={workspace?.salesOrderError || null}
            canAct={canAct}
            busy={busy}
            onRetry={() => void run(() => retryQuoteFlowSalesOrder(authToken, estimateId))}
            onSelectCustomerJob={(listId, fullName) =>
              void run(() => selectQuoteFlowSalesOrderCustomerJob(authToken, estimateId, { listId, fullName }))
            }
          />
        </div>
      ) : null}
    </section>
  );
}
