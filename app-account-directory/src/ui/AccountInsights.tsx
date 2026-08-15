import { useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  getAccountInsightEvidence,
  getAccountInsights
} from "../lib/accountDirectoryApi";
import type { AccountInsightCard, AccountInsightEvidenceResponse, AccountInsightsResponse } from "../lib/types";

function formatValue(card: AccountInsightCard): string {
  if (card.value == null || card.value === "") return "Unavailable";
  if (card.valueType === "percent") return `${card.value}%`;
  return String(card.value);
}

export function InsightsPanel({
  sessionToken,
  accountId,
  pendingInsightId,
  onPendingConsumed
}: {
  sessionToken: string | null;
  accountId: string;
  pendingInsightId?: string | null;
  onPendingConsumed?: () => void;
}) {
  const [data, setData] = useState<AccountInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState<AccountInsightEvidenceResponse | null>(null);
  const gen = useRef(0);

  useEffect(() => {
    if (!sessionToken || !accountId) return;
    const current = ++gen.current;
    setBusy(true);
    setError(null);
    setEvidence(null);
    void getAccountInsights(sessionToken, accountId)
      .then((res) => {
        if (current !== gen.current) return;
        setData(res);
      })
      .catch((e: unknown) => {
        if (current !== gen.current) return;
        setError(e instanceof ApiError ? e.message : "Could not load insights.");
      })
      .finally(() => {
        if (current === gen.current) setBusy(false);
      });
  }, [sessionToken, accountId]);

  async function openEvidence(id: string) {
    if (!sessionToken) return;
    try {
      const res = await getAccountInsightEvidence(sessionToken, accountId, id);
      setEvidence(res);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Could not load evidence.");
    }
  }

  useEffect(() => {
    if (!pendingInsightId || !data) return;
    void openEvidence(pendingInsightId);
    onPendingConsumed?.();
  }, [pendingInsightId, data]);

  useEffect(() => {
    if (!evidence) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setEvidence(null);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [evidence]);

  return (
    <div className="ad-insights">
      <p className="muted">
        Deterministic customer signals for this account. Every card can show its work. These are not forecasts and not
        company-wide rankings.
      </p>
      {busy ? <p className="muted">Loading insights…</p> : null}
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="ad-insight-grid">
        {(data?.cards || []).map((card) => (
          <article key={card.id} className="ad-insight-card">
            <p className="ad-kicker">{card.title}</p>
            <p className="ad-insight-value">{formatValue(card)}</p>
            <p className="muted">{card.interpretation}</p>
            {card.evidenceAvailable ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openEvidence(card.id)}>
                View evidence
              </button>
            ) : null}
          </article>
        ))}
      </div>

      {evidence ? (
        <div className="ad-evidence-backdrop" data-ad-child-modal="true" role="presentation" onClick={() => setEvidence(null)}>
          <div
            className="ad-evidence-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`${evidence.card?.title || "Insight"} evidence`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="ad-evidence-head">
              <h3>{evidence.card?.title}</h3>
              <button type="button" className="profile-close" onClick={() => setEvidence(null)} aria-label="Close evidence">
                ✕
              </button>
            </header>
            <p className="ad-insight-value">{evidence.card ? formatValue(evidence.card) : ""}</p>
            <dl className="ad-evidence-dl">
              <div>
                <dt>Definition</dt>
                <dd>{String(evidence.evidence?.definition || "—")}</dd>
              </div>
              {evidence.evidence?.formula ? (
                <div>
                  <dt>Formula</dt>
                  <dd>{String(evidence.evidence.formula)}</dd>
                </div>
              ) : null}
            {evidence.evidence?.quoted ? (
              <div>
                <dt>Quoted</dt>
                <dd>
                  {String((evidence.evidence.quoted as { count?: number }).count ?? "")} · $
                  {String((evidence.evidence.quoted as { amount?: number }).amount ?? "")}
                </dd>
              </div>
            ) : null}
            {evidence.evidence?.salesOrders ? (
              <div>
                <dt>Sales Orders</dt>
                <dd>
                  {String((evidence.evidence.salesOrders as { count?: number }).count ?? "")} · $
                  {String((evidence.evidence.salesOrders as { amount?: number }).amount ?? "")}
                </dd>
              </div>
            ) : null}
            </dl>
            {(evidence.card?.limitations || []).length ? (
              <ul>
                {(evidence.card?.limitations || []).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {Array.isArray(evidence.evidence?.records) ? (
              <ul className="ad-plain-list">
                {(evidence.evidence?.records as Array<{ number?: string; status?: string; amount?: number }>).map(
                  (row, i) => (
                    <li key={i}>
                      {[row.number, row.status, row.amount != null ? `$${row.amount}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </li>
                  )
                )}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OverviewInsightStrip({
  sessionToken,
  accountId,
  onOpenInsights,
  onOpenEvidence
}: {
  sessionToken: string | null;
  accountId: string;
  onOpenInsights: () => void;
  onOpenEvidence: (id: string) => void;
}) {
  const [cards, setCards] = useState<AccountInsightCard[]>([]);
  const gen = useRef(0);
  useEffect(() => {
    if (!sessionToken) return;
    const current = ++gen.current;
    void getAccountInsights(sessionToken, accountId).then((res) => {
      if (current !== gen.current) return;
      setCards(res.overview || []);
    }).catch(() => undefined);
  }, [sessionToken, accountId]);
  if (!cards.length) return null;
  return (
    <section className="ad-insight-strip" aria-label="Account insights">
      <div className="ad-toolbar-row">
        <h3>Insights</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenInsights}>
          View all Insights →
        </button>
      </div>
      <div className="ad-insight-grid ad-insight-grid-mini">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="ad-insight-card ad-insight-mini"
            onClick={() => onOpenEvidence(card.id)}
          >
            <span className="ad-kicker">{card.title}</span>
            <strong>{formatValue(card)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
