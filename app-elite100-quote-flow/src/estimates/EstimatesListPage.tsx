import React, { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
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

const LATER_SECTIONS = [
  "Pricing Controls",
  "Calculation",
  "Approval",
  "Digital Estimate",
  "Customer Activity / Revisions",
  "Acceptance / Sold Handoff"
] as const;

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

function formatUpdated(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function EstimatesListPage(props: Props) {
  const { authToken, initialEstimateId = null } = props;
  const [items, setItems] = useState<QuoteFlowEstimateListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialEstimateId);
  const [detail, setDetail] = useState<QuoteFlowEstimateDetail | null>(null);
  const [rooms, setRooms] = useState<QuoteFlowScopeRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowEstimates(authToken);
      setItems(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      setError(errorMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function openEstimate(estimateId: string) {
    setSelectedId(estimateId);
    setDetailLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetchQuoteFlowEstimateDetail(authToken, estimateId);
      setDetail(res.estimate);
      setRooms(roomsFromOfficialScope(res.estimate?.scope?.rooms));
    } catch (e) {
      setDetail(null);
      setRooms([]);
      setError(errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  useEffect(() => {
    if (initialEstimateId) {
      void openEstimate(initialEstimateId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEstimateId, authToken]);

  async function saveScope() {
    if (!selectedId || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await patchQuoteFlowEstimateScope(authToken, selectedId, { rooms });
      setDetail(res.estimate);
      setRooms(roomsFromOfficialScope(res.estimate?.scope?.rooms));
      setNotice(res.message || "Official scope saved.");
      await loadList();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="qf-page" data-testid="qf-estimates-page">
      <header className="qf-page__header">
        <h1>Estimates</h1>
        <p className="qf-muted">
          Scoped estimates after Set Scope. Open an estimate to edit official scope. Manual edits do
          not rerun AI Takeoff. Pricing and later steps stay in later sections. Official scope edits
          are estimator-owned.
        </p>
      </header>

      {error ? (
        <div className="qf-error-box" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? <p className="qf-notice">{notice}</p> : null}

      <div className="qf-estimates" data-testid="qf-estimates-layout">
        <div className="qf-estimates__list" data-testid="qf-estimates-list">
          <div className="qf-inbox__list-head">
            <h2>Estimate library</h2>
            <button type="button" className="qf-btn-secondary" onClick={() => void loadList()}>
              Refresh
            </button>
          </div>
          {loading ? <p className="qf-muted">Loading estimates…</p> : null}
          {!loading && items.length === 0 ? (
            <p className="qf-muted" data-testid="qf-estimates-empty">
              No scoped estimates yet. Set Scope from Estimate Queue to add one here.
            </p>
          ) : null}
          <ul className="qf-inbox__rows">
            {items.map((item) => {
              const id = item.estimateId || "";
              const active = id && id === selectedId;
              return (
                <li key={id || `${item.intakeCaseId}-${item.updatedAt}`}>
                  <button
                    type="button"
                    className={active ? "qf-inbox__row is-active" : "qf-inbox__row"}
                    data-testid="qf-estimates-row"
                    onClick={() => id && void openEstimate(id)}
                  >
                    <span className="qf-inbox__row-title">
                      {item.customerName || item.accountName || "Customer"}
                      {item.projectName ? ` · ${item.projectName}` : ""}
                    </span>
                    <span className="qf-inbox__row-meta">
                      {item.scopeSummary?.label || "Scope set"} · {item.status?.label || "Scope set"}
                    </span>
                    <span className="qf-inbox__row-meta">
                      Updated {formatUpdated(item.updatedAt)} · {item.nextAction || "Open"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="qf-estimates__detail" data-testid="qf-estimates-detail">
          {!selectedId ? (
            <p className="qf-muted">Select an estimate to open the detail workspace.</p>
          ) : null}
          {detailLoading ? <p className="qf-muted">Loading estimate…</p> : null}
          {selectedId && !detailLoading && detail ? (
            <>
              <div className="qf-estimates__detail-head">
                <div>
                  <h2>
                    {detail.customerName || detail.accountName || "Estimate"}
                    {detail.projectName ? ` · ${detail.projectName}` : ""}
                  </h2>
                  <p className="qf-muted">
                    {detail.status?.label || "Scope set"} · Updated{" "}
                    {formatUpdated(detail.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className="qf-btn-primary"
                  data-testid="qf-estimates-save-scope"
                  disabled={saving}
                  onClick={() => void saveScope()}
                >
                  {saving ? "Saving…" : "Save Scope"}
                </button>
              </div>

              <section
                className="qf-estimates__section is-active"
                data-testid="qf-estimates-section-scope"
              >
                <OfficialScopeEditor rooms={rooms} onChange={setRooms} disabled={saving} />
              </section>

              {LATER_SECTIONS.map((title) => (
                <section
                  key={title}
                  className="qf-estimates__section is-later"
                  data-testid="qf-estimates-section-later"
                  aria-disabled="true"
                >
                  <h3>{title}</h3>
                  <p className="qf-muted">Coming later — not available in this slice.</p>
                </section>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
