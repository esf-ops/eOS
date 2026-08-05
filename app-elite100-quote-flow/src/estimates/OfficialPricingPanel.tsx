/**
 * Estimates modal — Pricing tab (internal only).
 * Uses Quote Flow pricing API + official scope summary. No approval, DE publish, or sold.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ApiError } from "../lib/api";
import {
  calculateQuoteFlowEstimatePricing,
  fetchQuoteFlowEstimatePricing,
  patchQuoteFlowEstimatePricing,
  type QuoteFlowEditablePricing,
  type QuoteFlowPricingPayload,
  type QuoteFlowPricingResult,
  type QuoteFlowScopeSummary
} from "../lib/quoteFlowEstimatesApi";

const BASIS_OPTIONS = [
  { value: "wholesale", label: "Wholesale" },
  { value: "direct", label: "Direct" },
  { value: "retail", label: "Retail" }
] as const;

const GROUP_OPTIONS = [
  { value: "Group Promo", label: "Promo" },
  { value: "Group A", label: "A" },
  { value: "Group B", label: "B" },
  { value: "Group C", label: "C" },
  { value: "Group D", label: "D" },
  { value: "Group E", label: "E" },
  { value: "Group F", label: "F" },
  { value: "Remnant", label: "Remnant" }
] as const;

type Props = {
  authToken: string;
  estimateId: string;
  estimateName?: string | null;
  customerLabel?: string | null;
  disabled?: boolean;
};

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

function emptyPricing(): QuoteFlowEditablePricing {
  return {
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    materialGroupLabel: "Promo",
    estimateWideAdjustment: {
      active: false,
      percentage: 0,
      reason: "",
      source: "manual",
      editable: true
    },
    internalMarkupPercent: 0,
    internalMarkupEditable: false
  };
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function pricingFingerprint(p: QuoteFlowEditablePricing): string {
  try {
    return JSON.stringify({
      pricingBasis: p.pricingBasis,
      materialGroup: p.materialGroup,
      estimateWideAdjustment: p.estimateWideAdjustment,
      internalMarkupPercent: p.internalMarkupPercent
    });
  } catch {
    return "";
  }
}

export default function OfficialPricingPanel(props: Props) {
  const { authToken, estimateId, estimateName, customerLabel, disabled = false } = props;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pricing, setPricing] = useState<QuoteFlowEditablePricing>(emptyPricing());
  const [savedFp, setSavedFp] = useState("");
  const [scopeSummary, setScopeSummary] = useState<QuoteFlowScopeSummary | null>(null);
  const [lastCalculation, setLastCalculation] = useState<QuoteFlowPricingResult | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [calculationNotes, setCalculationNotes] = useState<string[]>([]);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [pricingStale, setPricingStale] = useState(false);
  const [scopeChangedSinceCalculation, setScopeChangedSinceCalculation] = useState(false);

  const dirty = pricingFingerprint(pricing) !== savedFp;

  function applyPayload(payload: QuoteFlowPricingPayload) {
    const next = {
      ...emptyPricing(),
      ...(payload.editablePricing || {})
    };
    setPricing(next);
    setSavedFp(pricingFingerprint(next));
    setScopeSummary(payload.scopeSummary || null);
    setLastCalculation(payload.lastCalculation || null);
    setBlockers(Array.isArray(payload.blockers) ? payload.blockers : []);
    setCalculationNotes(Array.isArray(payload.calculationNotes) ? payload.calculationNotes : []);
    setStaleReason(payload.staleReason || null);
    setPricingStale(payload.pricingStale === true);
    setScopeChangedSinceCalculation(payload.scopeChangedSinceCalculation === true);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetchQuoteFlowEstimatePricing(authToken, estimateId);
        if (cancelled) return;
        applyPayload(res);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authToken, estimateId]);

  const summaryCards = useMemo(() => {
    const s = scopeSummary;
    return [
      {
        label: "Countertop SF",
        value: s?.countertopSf != null && Number(s.countertopSf) > 0 ? Number(s.countertopSf).toFixed(1) : "—"
      },
      {
        label: "Backsplash SF",
        value: s?.backsplashSf != null && Number(s.backsplashSf) > 0 ? Number(s.backsplashSf).toFixed(1) : "—"
      },
      {
        label: "Open edge LF",
        value: s?.openEdgeLf != null ? Number(s.openEdgeLf).toFixed(1) : "0.0"
      },
      {
        label: "Rooms",
        value: s?.roomCount != null ? String(s.roomCount) : "—"
      },
      {
        label: "Pieces",
        value: s?.pieceCount != null ? String(s.pieceCount) : "—"
      }
    ];
  }, [scopeSummary]);

  async function saveDraft() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await patchQuoteFlowEstimatePricing(authToken, estimateId, {
        pricingBasis: pricing.pricingBasis,
        materialGroup: pricing.materialGroup,
        estimateWideAdjustment: pricing.estimateWideAdjustment,
        ...(pricing.internalMarkupEditable
          ? { internalMarkupPercent: pricing.internalMarkupPercent }
          : {})
      });
      applyPayload(res);
      setNotice("Pricing draft saved.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function calculate() {
    setCalculating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await calculateQuoteFlowEstimatePricing(authToken, estimateId, {
        pricingBasis: pricing.pricingBasis,
        materialGroup: pricing.materialGroup,
        estimateWideAdjustment: pricing.estimateWideAdjustment,
        ...(pricing.internalMarkupEditable
          ? { internalMarkupPercent: pricing.internalMarkupPercent }
          : {})
      });
      applyPayload(res);
      setNotice("Pricing calculated.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCalculating(false);
    }
  }

  const ewa = pricing.estimateWideAdjustment;
  const busy = disabled || loading || saving || calculating;
  const missingGroup = !String(pricing.materialGroup || "").trim();
  const missingBasis = !String(pricing.pricingBasis || "").trim();
  const localBlockers = [
    ...blockers,
    ...(missingGroup ? ["Select a pricing group before calculating."] : []),
    ...(missingBasis ? ["Select a pricing basis before calculating."] : [])
  ];

  return (
    <section className="qf-pricing" data-testid="qf-official-pricing-panel">
      <header className="qf-pricing__header">
        <h2 data-testid="qf-pricing-title">Pricing</h2>
        <p className="qf-muted" data-testid="qf-pricing-helper">
          Configure pricing for the official scope. Pricing uses the saved estimate scope and does not rerun AI Takeoff.
        </p>
        <p className="qf-pricing__internal" data-testid="qf-pricing-internal-only">
          Internal pricing only
        </p>
      </header>

      <div className="qf-pricing__meta" data-testid="qf-pricing-estimate-meta">
        {estimateName ? <p className="qf-pricing__job">{estimateName}</p> : null}
        {customerLabel ? <p className="qf-muted">{customerLabel}</p> : null}
      </div>

      <div className="qf-pricing__summary" data-testid="qf-pricing-scope-summary">
        {summaryCards.map((c) => (
          <div key={c.label} className="qf-pricing__summary-card">
            <span className="qf-stat__value">{c.value}</span>
            <span className="qf-stat__label">{c.label}</span>
          </div>
        ))}
      </div>

      {loading ? <p className="qf-muted">Loading pricing…</p> : null}

      {error ? (
        <div className="qf-error-box" role="alert" data-testid="qf-pricing-error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="qf-notice" data-testid="qf-pricing-notice">
          {notice}
        </p>
      ) : null}

      {scopeChangedSinceCalculation ? (
        <div className="qf-pricing__stale" data-testid="qf-pricing-scope-changed" role="status">
          Scope changed since last calculation
        </div>
      ) : null}
      {pricingStale && !scopeChangedSinceCalculation && staleReason ? (
        <div className="qf-pricing__stale" data-testid="qf-pricing-stale" role="status">
          {staleReason}
        </div>
      ) : null}

      {localBlockers.length > 0 ? (
        <ul className="qf-pricing__blockers" data-testid="qf-pricing-blockers">
          {localBlockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}

      <div className="qf-pricing__controls" data-testid="qf-pricing-controls">
        <h3>Pricing draft</h3>
        <label className="qf-pricing__field">
          Pricing basis
          <select
            value={pricing.pricingBasis || "wholesale"}
            disabled={busy}
            aria-label="Pricing basis"
            data-testid="qf-pricing-basis"
            onChange={(e) => {
              setPricing({ ...pricing, pricingBasis: e.target.value });
              setNotice(null);
            }}
          >
            {BASIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="qf-pricing__field">
          Price group
          <select
            value={pricing.materialGroup || "Group Promo"}
            disabled={busy}
            aria-label="Price group"
            data-testid="qf-pricing-price-group"
            onChange={(e) => {
              setPricing({ ...pricing, materialGroup: e.target.value });
              setNotice(null);
            }}
          >
            {GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="qf-pricing__ewa" data-testid="qf-pricing-ewa">
          <label className="qf-pricing__check">
            <input
              type="checkbox"
              checked={Boolean(ewa?.active)}
              disabled={busy || ewa?.editable === false}
              onChange={(e) =>
                setPricing({
                  ...pricing,
                  estimateWideAdjustment: {
                    ...(ewa || {}),
                    active: e.target.checked,
                    source: "manual"
                  }
                })
              }
            />
            Estimate-wide adjustment
          </label>
          {ewa?.active ? (
            <>
              <label className="qf-pricing__field">
                Percentage
                <input
                  type="number"
                  step="0.1"
                  value={ewa?.percentage ?? 0}
                  disabled={busy || ewa?.editable === false}
                  data-testid="qf-pricing-ewa-pct"
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      estimateWideAdjustment: {
                        ...(ewa || {}),
                        percentage: Number(e.target.value) || 0,
                        active: true,
                        source: "manual"
                      }
                    })
                  }
                />
              </label>
              <label className="qf-pricing__field">
                Reason
                <input
                  type="text"
                  value={ewa?.reason || ""}
                  disabled={busy || ewa?.editable === false}
                  data-testid="qf-pricing-ewa-reason"
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      estimateWideAdjustment: {
                        ...(ewa || {}),
                        reason: e.target.value,
                        active: true,
                        source: "manual"
                      }
                    })
                  }
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="qf-pricing__actions">
          <button
            type="button"
            className="qf-btn-secondary"
            data-testid="qf-pricing-save-draft"
            disabled={busy || !dirty}
            onClick={() => void saveDraft()}
          >
            {saving ? "Saving…" : "Save pricing draft"}
          </button>
          <button
            type="button"
            className="qf-btn-primary"
            data-testid="qf-pricing-calculate"
            disabled={busy || missingGroup || missingBasis}
            onClick={() => void calculate()}
          >
            {calculating ? "Calculating…" : "Calculate pricing"}
          </button>
        </div>
      </div>

      <div className="qf-pricing__result" data-testid="qf-pricing-result">
        <h3>Latest calculation</h3>
        {lastCalculation?.available ? (
          <>
            <div className="qf-pricing__result-cards">
              <div className="qf-pricing__result-card" data-testid="qf-pricing-total">
                <span className="qf-stat__value">
                  {money(lastCalculation.estimatedTotal ?? lastCalculation.exactInternalTotal)}
                </span>
                <span className="qf-stat__label">Estimated total</span>
              </div>
              {lastCalculation.openEdgeAmount != null ? (
                <div className="qf-pricing__result-card" data-testid="qf-pricing-edge-amount">
                  <span className="qf-stat__value">{money(lastCalculation.openEdgeAmount)}</span>
                  <span className="qf-stat__label">Open edge / edge</span>
                </div>
              ) : null}
              {lastCalculation.breakdown?.billedStoneSf != null ? (
                <div className="qf-pricing__result-card">
                  <span className="qf-stat__value">
                    {Number(lastCalculation.breakdown.billedStoneSf).toFixed(1)}
                  </span>
                  <span className="qf-stat__label">Billed stone SF</span>
                </div>
              ) : null}
              {lastCalculation.breakdown?.edgeLf != null ? (
                <div className="qf-pricing__result-card" data-testid="qf-pricing-edge-lf">
                  <span className="qf-stat__value">
                    {Number(lastCalculation.breakdown.edgeLf).toFixed(1)}
                  </span>
                  <span className="qf-stat__label">Edge LF priced</span>
                </div>
              ) : null}
            </div>
            {lastCalculation.linePreview?.length ? (
              <ul className="qf-pricing__lines" data-testid="qf-pricing-line-preview">
                {lastCalculation.linePreview.map((line, idx) => (
                  <li key={`${line.label}-${idx}`}>
                    <span>{line.label}</span>
                    <span>{money(line.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {lastCalculation.calculatedAt ? (
              <p className="qf-muted">
                Calculated {new Date(lastCalculation.calculatedAt).toLocaleString()}
              </p>
            ) : null}
          </>
        ) : (
          <p className="qf-muted" data-testid="qf-pricing-no-result">
            No calculation yet. Save a pricing draft, then Calculate pricing.
          </p>
        )}
        {calculationNotes.length > 0 ? (
          <ul className="qf-pricing__notes" data-testid="qf-pricing-notes">
            {calculationNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
