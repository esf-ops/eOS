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
  type QuoteFlowCustomLineItem,
  type QuoteFlowCustomLineSummary,
  type QuoteFlowEditablePricing,
  type QuoteFlowEdgeStatus,
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

const CATEGORY_OPTIONS = [
  { value: "material", label: "Material" },
  { value: "labor", label: "Labor" },
  { value: "install", label: "Install" },
  { value: "sink/cutout", label: "Sink / cutout" },
  { value: "edge", label: "Edge" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Other" }
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

function newLineId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `qf-cli-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `qf-cli-${Date.now().toString(36)}`;
}

function createLine(visibility: "customer" | "internal"): QuoteFlowCustomLineItem {
  return {
    id: newLineId(),
    label: "",
    type: "charge",
    visibility,
    quantity: 1,
    unitAmount: 0,
    amount: 0,
    category: "other",
    note: "",
    sortOrder: Date.now()
  };
}

function lineAmount(line: QuoteFlowCustomLineItem): number {
  if (line.type === "note") return 0;
  const qty = Number(line.quantity) > 0 ? Number(line.quantity) : 1;
  const unit = Math.abs(Number(line.unitAmount) || 0);
  return Math.round(unit * qty * 100) / 100;
}

function summarizeLocal(lines: QuoteFlowCustomLineItem[]): QuoteFlowCustomLineSummary {
  let customerFacingChargesTotal = 0;
  let customerFacingCreditsTotal = 0;
  let internalOnlyChargesTotal = 0;
  let internalOnlyCreditsTotal = 0;
  let noteOnlyCount = 0;
  let netCustomAdjustment = 0;
  for (const line of lines) {
    if (line.type === "note") {
      noteOnlyCount += 1;
      continue;
    }
    const amt = lineAmount(line);
    if (line.visibility === "customer") {
      if (line.type === "credit") {
        customerFacingCreditsTotal += amt;
        netCustomAdjustment -= amt;
      } else {
        customerFacingChargesTotal += amt;
        netCustomAdjustment += amt;
      }
    } else if (line.type === "credit") {
      internalOnlyCreditsTotal += amt;
      netCustomAdjustment -= amt;
    } else {
      internalOnlyChargesTotal += amt;
      netCustomAdjustment += amt;
    }
  }
  return {
    customerFacingChargesTotal: Math.round(customerFacingChargesTotal * 100) / 100,
    customerFacingCreditsTotal: Math.round(customerFacingCreditsTotal * 100) / 100,
    internalOnlyChargesTotal: Math.round(internalOnlyChargesTotal * 100) / 100,
    internalOnlyCreditsTotal: Math.round(internalOnlyCreditsTotal * 100) / 100,
    noteOnlyCount,
    netCustomAdjustment: Math.round(netCustomAdjustment * 100) / 100
  };
}

function pricingFingerprint(
  p: QuoteFlowEditablePricing,
  lines: QuoteFlowCustomLineItem[]
): string {
  try {
    return JSON.stringify({
      pricingBasis: p.pricingBasis,
      materialGroup: p.materialGroup,
      estimateWideAdjustment: p.estimateWideAdjustment,
      internalMarkupPercent: p.internalMarkupPercent,
      customLineItems: lines.map((l) => ({
        id: l.id,
        label: l.label,
        type: l.type,
        visibility: l.visibility,
        quantity: l.quantity,
        unitAmount: l.unitAmount,
        category: l.category,
        note: l.note,
        sortOrder: l.sortOrder
      }))
    });
  } catch {
    return "";
  }
}

function LineItemsGroup(props: {
  title: string;
  helper: string;
  visibility: "customer" | "internal";
  lines: QuoteFlowCustomLineItem[];
  busy: boolean;
  onChange: (id: string, patch: Partial<QuoteFlowCustomLineItem>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const { title, helper, visibility, lines, busy, onChange, onRemove, onAdd } = props;
  const group = lines.filter((l) => l.visibility === visibility);
  return (
    <div
      className="qf-pricing__line-group"
      data-testid={`qf-pricing-lines-${visibility}`}
    >
      <div className="qf-pricing__line-group-head">
        <div>
          <h4>{title}</h4>
          <p className="qf-muted">{helper}</p>
        </div>
        <button
          type="button"
          className="qf-btn-secondary"
          disabled={busy}
          data-testid={`qf-pricing-add-${visibility}-line`}
          onClick={onAdd}
        >
          {visibility === "customer" ? "Add customer-facing line item" : "Add internal-only line item"}
        </button>
      </div>
      {group.length === 0 ? (
        <p className="qf-muted">No {visibility === "customer" ? "customer-facing" : "internal-only"} line items yet.</p>
      ) : (
        <ul className="qf-pricing__line-list">
          {group.map((line) => (
            <li key={line.id} className="qf-pricing__line-row" data-testid="qf-pricing-line-row">
              <span
                className={
                  visibility === "customer"
                    ? "qf-pricing__visibility-badge is-customer"
                    : "qf-pricing__visibility-badge is-internal"
                }
              >
                {visibility === "customer" ? "Customer" : "Internal"}
              </span>
              <label className="qf-pricing__field">
                Description
                <input
                  type="text"
                  value={line.label}
                  disabled={busy}
                  data-testid="qf-pricing-line-label"
                  onChange={(e) => onChange(line.id || "", { label: e.target.value })}
                />
              </label>
              <label className="qf-pricing__field">
                Type
                <select
                  value={line.type}
                  disabled={busy}
                  data-testid="qf-pricing-line-type"
                  onChange={(e) =>
                    onChange(line.id || "", {
                      type: e.target.value as QuoteFlowCustomLineItem["type"]
                    })
                  }
                >
                  <option value="charge">Charge</option>
                  <option value="credit">Credit</option>
                  <option value="note">Note</option>
                </select>
              </label>
              {line.type !== "note" ? (
                <>
                  <label className="qf-pricing__field">
                    Qty
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={line.quantity ?? 1}
                      disabled={busy}
                      data-testid="qf-pricing-line-qty"
                      onChange={(e) =>
                        onChange(line.id || "", { quantity: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className="qf-pricing__field">
                    Unit amount
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitAmount ?? 0}
                      disabled={busy}
                      data-testid="qf-pricing-line-unit"
                      onChange={(e) =>
                        onChange(line.id || "", { unitAmount: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <div className="qf-pricing__line-amount" data-testid="qf-pricing-line-amount">
                    <span className="qf-stat__label">Amount</span>
                    <span className="qf-stat__value">{money(lineAmount(line))}</span>
                  </div>
                </>
              ) : (
                <p className="qf-muted">Note does not change total</p>
              )}
              <label className="qf-pricing__field">
                Category
                <select
                  value={line.category || "other"}
                  disabled={busy}
                  data-testid="qf-pricing-line-category"
                  onChange={(e) => onChange(line.id || "", { category: e.target.value })}
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="qf-pricing__field">
                Note
                <input
                  type="text"
                  value={line.note || ""}
                  disabled={busy}
                  data-testid="qf-pricing-line-note"
                  onChange={(e) => onChange(line.id || "", { note: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="qf-btn-secondary"
                disabled={busy}
                data-testid="qf-pricing-line-remove"
                onClick={() => onRemove(line.id || "")}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OfficialPricingPanel(props: Props) {
  const { authToken, estimateId, estimateName, customerLabel, disabled = false } = props;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pricing, setPricing] = useState<QuoteFlowEditablePricing>(emptyPricing());
  const [customLines, setCustomLines] = useState<QuoteFlowCustomLineItem[]>([]);
  const [savedFp, setSavedFp] = useState("");
  const [scopeSummary, setScopeSummary] = useState<QuoteFlowScopeSummary | null>(null);
  const [lastCalculation, setLastCalculation] = useState<QuoteFlowPricingResult | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [calculationNotes, setCalculationNotes] = useState<string[]>([]);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [pricingStale, setPricingStale] = useState(false);
  const [scopeChangedSinceCalculation, setScopeChangedSinceCalculation] = useState(false);
  const [edgeStatus, setEdgeStatus] = useState<QuoteFlowEdgeStatus | null>(null);
  const [serverSummary, setServerSummary] = useState<QuoteFlowCustomLineSummary | null>(null);

  const dirty = pricingFingerprint(pricing, customLines) !== savedFp;
  const localSummary = useMemo(() => summarizeLocal(customLines), [customLines]);

  function applyPayload(payload: QuoteFlowPricingPayload) {
    const next = {
      ...emptyPricing(),
      ...(payload.editablePricing || {})
    };
    const lines = Array.isArray(payload.customLineItems) ? payload.customLineItems : [];
    setPricing(next);
    setCustomLines(lines);
    setSavedFp(pricingFingerprint(next, lines));
    setScopeSummary(payload.scopeSummary || null);
    setLastCalculation(payload.lastCalculation || null);
    setBlockers(Array.isArray(payload.blockers) ? payload.blockers : []);
    setCalculationNotes(Array.isArray(payload.calculationNotes) ? payload.calculationNotes : []);
    setStaleReason(payload.staleReason || null);
    setPricingStale(payload.pricingStale === true);
    setScopeChangedSinceCalculation(payload.scopeChangedSinceCalculation === true);
    setEdgeStatus(payload.edgeStatus || payload.lastCalculation?.edgeStatus || null);
    setServerSummary(payload.customLineSummary || payload.lastCalculation?.customLineItems?.summary || null);
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

  function draftBody() {
    return {
      pricingBasis: pricing.pricingBasis,
      materialGroup: pricing.materialGroup,
      estimateWideAdjustment: pricing.estimateWideAdjustment,
      ...(pricing.internalMarkupEditable
        ? { internalMarkupPercent: pricing.internalMarkupPercent }
        : {}),
      customLineItems: customLines.map((l, i) => ({
        ...l,
        amount: lineAmount(l),
        sortOrder: l.sortOrder ?? i
      }))
    };
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await patchQuoteFlowEstimatePricing(authToken, estimateId, draftBody());
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
      const res = await calculateQuoteFlowEstimatePricing(authToken, estimateId, draftBody());
      applyPayload(res);
      setNotice("Pricing calculated.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCalculating(false);
    }
  }

  function updateLine(id: string, patch: Partial<QuoteFlowCustomLineItem>) {
    setCustomLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        if (next.type === "note") {
          next.unitAmount = 0;
          next.amount = 0;
          next.quantity = 1;
        } else {
          next.amount = lineAmount(next);
        }
        return next;
      })
    );
    setNotice(null);
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
  const displaySummary = serverSummary && !dirty ? serverSummary : localSummary;
  const edge = edgeStatus || lastCalculation?.edgeStatus || null;

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
        <p className="qf-muted" data-testid="qf-pricing-review-not-active">
          After pricing, use Review then Digital Estimate to publish a customer link. Acceptance and sold stay later.
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

      {edge ? (
        <div className="qf-pricing__edge" data-testid="qf-pricing-edge-status">
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{Number(edge.openEdgeLf || 0).toFixed(1)}</span>
            <span className="qf-stat__label">Open edge LF</span>
          </div>
          <div className="qf-pricing__summary-card" data-testid="qf-pricing-edge-profile">
            <span className="qf-stat__value">{edge.profileDisplay || "Not selected"}</span>
            <span className="qf-stat__label">Edge profile</span>
          </div>
          <div className="qf-pricing__summary-card" data-testid="qf-pricing-edge-charge">
            <span className="qf-stat__value">
              {edge.chargeStatus === "pending"
                ? "Pending"
                : edge.chargeStatus === "included"
                  ? "Included / no charge"
                  : edge.chargeStatus === "charged"
                    ? money(edge.edgeAmount)
                    : "—"}
            </span>
            <span className="qf-stat__label">Edge charge</span>
          </div>
          {edge.profileSelected && edge.edgeLfPriced != null ? (
            <div className="qf-pricing__summary-card" data-testid="qf-pricing-edge-lf">
              <span className="qf-stat__value">{Number(edge.edgeLfPriced).toFixed(1)}</span>
              <span className="qf-stat__label">Edge LF priced</span>
            </div>
          ) : null}
        </div>
      ) : null}

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
      </div>

      <div className="qf-pricing__custom-lines" data-testid="qf-pricing-custom-lines">
        <h3>Custom line items</h3>
        <LineItemsGroup
          title="Customer-facing line items"
          helper="Customer-facing items may appear on the customer quote later."
          visibility="customer"
          lines={customLines}
          busy={busy}
          onChange={updateLine}
          onRemove={(id) => {
            setCustomLines((prev) => prev.filter((l) => l.id !== id));
            setNotice(null);
          }}
          onAdd={() => {
            setCustomLines((prev) => [...prev, createLine("customer")]);
            setNotice(null);
          }}
        />
        <LineItemsGroup
          title="Internal-only line items"
          helper="Internal-only items stay inside eliteOS."
          visibility="internal"
          lines={customLines}
          busy={busy}
          onChange={updateLine}
          onRemove={(id) => {
            setCustomLines((prev) => prev.filter((l) => l.id !== id));
            setNotice(null);
          }}
          onAdd={() => {
            setCustomLines((prev) => [...prev, createLine("internal")]);
            setNotice(null);
          }}
        />

        <div className="qf-pricing__line-summary" data-testid="qf-pricing-line-summary">
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{money(displaySummary.customerFacingChargesTotal)}</span>
            <span className="qf-stat__label">Customer-facing charges</span>
          </div>
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{money(displaySummary.customerFacingCreditsTotal)}</span>
            <span className="qf-stat__label">Customer-facing credits</span>
          </div>
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{money(displaySummary.internalOnlyChargesTotal)}</span>
            <span className="qf-stat__label">Internal-only charges</span>
          </div>
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{money(displaySummary.internalOnlyCreditsTotal)}</span>
            <span className="qf-stat__label">Internal-only credits</span>
          </div>
          <div className="qf-pricing__summary-card">
            <span className="qf-stat__value">{displaySummary.noteOnlyCount ?? 0}</span>
            <span className="qf-stat__label">Notes</span>
          </div>
          <div className="qf-pricing__summary-card" data-testid="qf-pricing-net-custom">
            <span className="qf-stat__value">{money(displaySummary.netCustomAdjustment)}</span>
            <span className="qf-stat__label">Net custom adjustment</span>
          </div>
        </div>
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
              {lastCalculation.customLineItems?.summary?.netCustomAdjustment != null ? (
                <div className="qf-pricing__result-card" data-testid="qf-pricing-result-custom-net">
                  <span className="qf-stat__value">
                    {money(lastCalculation.customLineItems.summary.netCustomAdjustment)}
                  </span>
                  <span className="qf-stat__label">Custom adjustment in calc</span>
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
