import { useEffect, useId, useMemo, useState } from "react";
import {
  calcTotals,
  formatCurrency,
  formatDate,
  fetchCurrentReviewRequest,
  reviewUiEnabled,
  saveConfigurationSelections,
  submitReviewRequest,
  type ConfigurationState,
  type ConfigOption,
  type CustomerReviewRequest,
  type PublicEstimate,
} from "./publicConfigApi";
import { ReadOnlyEstimateView } from "./ReadOnlyEstimateView";

type Props = {
  state: ConfigurationState;
  onState: (next: ConfigurationState) => void;
  onFatal: () => void;
};

function materialOptions(options: ConfigOption[], roomKey: string): ConfigOption[] {
  return options.filter(
    (o) =>
      o.optionKey.startsWith(`material:${roomKey}:`) ||
      (o.optionKey.startsWith("material:") && o.optionKey.includes(`:${roomKey}:`)),
  );
}

function addonOptions(options: ConfigOption[]): ConfigOption[] {
  return options.filter((o) => !o.optionKey.startsWith("material:"));
}

export function ConfigurationView({ state, onState, onFatal }: Props) {
  const estimate = state.estimate as PublicEstimate | null | undefined;
  const config = state.configuration;
  const formId = useId();

  const [qty, setQty] = useState<Record<string, number>>(() => ({
    ...(config?.currentSelections || {}),
  }));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rowVersion, setRowVersion] = useState(state.session?.rowVersion ?? 1);
  const [latestCalc, setLatestCalc] = useState(config?.latestCalculation ?? null);
  const [customerNote, setCustomerNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewRequest, setReviewRequest] = useState<CustomerReviewRequest | null>(null);
  const [reviewDisclaimer, setReviewDisclaimer] = useState<string | null>(null);
  const requestSeq = useMemo(() => ({ n: 0 }), []);

  useEffect(() => {
    if (!reviewUiEnabled()) return;
    let alive = true;
    void fetchCurrentReviewRequest()
      .then((r) => {
        if (alive && r.reviewRequest) setReviewRequest(r.reviewRequest);
      })
      .catch(() => {
        /* ignore — optional panel */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state.lifecycle !== "active" || !config || !estimate) {
    return (
      <div className="page">
        <main className="shell shell--narrow">
          <p className="unavailable" role="alert">
            {state.message || "Configuration unavailable"}
          </p>
          {estimate ? <ReadOnlyEstimateView estimate={estimate} compact /> : null}
        </main>
      </div>
    );
  }

  const totals = calcTotals(latestCalc);
  const baseline =
    totals.baseline ??
    config.baselineDisplayTotal ??
    estimate.totals.estimatedProjectTotal ??
    null;
  const configured = totals.configured ?? baseline;
  const delta = totals.delta ?? (configured != null && baseline != null ? configured - baseline : null);
  const canRequestReview = reviewUiEnabled() && saveState === "saved" && latestCalc != null;

  async function onSave() {
    setSaveState("saving");
    setSaveError(null);
    const seq = ++requestSeq.n;
    const items = Object.entries(qty)
      .filter(([, q]) => Number(q) > 0)
      .map(([optionKey, quantity]) => ({ optionKey, quantity: Number(quantity) }));
    for (const room of config!.rooms || []) {
      const mats = materialOptions(config!.options || [], room.roomKey);
      const selected = mats.find((m) => (qty[m.optionKey] ?? m.defaultQty) > 0) || mats[0];
      if (selected && !items.some((i) => i.optionKey === selected.optionKey)) {
        items.push({ optionKey: selected.optionKey, quantity: 1 });
      }
    }
    try {
      const result = await saveConfigurationSelections({
        items,
        expectedRowVersion: rowVersion,
        idempotencyKey: `sel-${formId}-${Date.now()}-${seq}`,
      });
      if (seq !== requestSeq.n) return;
      if (result.session?.rowVersion != null) setRowVersion(result.session.rowVersion);
      if (result.calculation) setLatestCalc(result.calculation as typeof latestCalc);
      setSaveState("saved");
      onState({
        ...state,
        session: state.session
          ? { ...state.session, rowVersion: result.session?.rowVersion ?? rowVersion }
          : state.session,
        configuration: state.configuration
          ? {
              ...state.configuration,
              latestCalculation: (result.calculation as typeof latestCalc) || latestCalc,
              currentSelections: qty,
            }
          : state.configuration,
      });
    } catch (e) {
      if (seq !== requestSeq.n) return;
      const status = (e as Error & { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) {
        onFatal();
        return;
      }
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "Unable to save");
    }
  }

  async function onSendForReview() {
    if (!canRequestReview || reviewBusy) return;
    setReviewBusy(true);
    setReviewError(null);
    try {
      const result = await submitReviewRequest({
        expectedRowVersion: rowVersion,
        idempotencyKey: `review-${formId}-${reviewRequest?.requestReference || "new"}`,
        customerNote: customerNote.trim() || undefined,
      });
      setReviewRequest(result.reviewRequest);
      setReviewDisclaimer(result.disclaimer || result.reviewRequest.nonAcceptanceNotice || null);
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) {
        onFatal();
        return;
      }
      setReviewError(e instanceof Error ? e.message : "Unable to send for review");
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar no-print">
        <div className="topbar__inner">
          <h1 className="topbar__title">Elite 100 Digital Estimate</h1>
          <button type="button" className="btn-print" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </header>

      <main className="shell">
        <section className="hero">
          <p className="eyebrow">Elite Stone Fabrication</p>
          <h2 className="hero__title">{estimate.documentTitle}</h2>
          <p className="lede">
            Professional measurements and fabrication scope are locked. Your finish and option choices may
            update the estimate total. This is estimate configuration — not final acceptance.
          </p>
          <dl className="meta-grid">
            {estimate.quoteNumber ? (
              <div>
                <dt>Estimate #</dt>
                <dd>{estimate.quoteNumber}</dd>
              </div>
            ) : null}
            {config.pricingValidThrough || estimate.pricingValidThrough ? (
              <div>
                <dt>Pricing valid through</dt>
                <dd>{formatDate(config.pricingValidThrough || estimate.pricingValidThrough)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="card">
          <h3 className="card__heading">Original estimate</h3>
          <p className="total-row__value">{formatCurrency(baseline)}</p>
          <p className="muted">{config.lockedScopeNotice}</p>
          <ul className="room-list">
            {(config.rooms || []).map((r) => (
              <li key={r.roomKey} className="room">
                <h4 className="room__name">{r.displayName}</h4>
                <p className="room__detail">
                  <span className="room__label">Your selected finish</span>{" "}
                  {r.baselineMaterialLabel || "—"}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {(config.rooms || []).map((room) => {
          const mats = materialOptions(config.options || [], room.roomKey);
          if (!mats.length) return null;
          return (
            <section key={room.roomKey} className="card">
              <h3 className="card__heading">{room.displayName} finish</h3>
              <p className="muted">Measurements are locked and cannot be edited.</p>
              <div className="option-grid" role="radiogroup" aria-label={`${room.displayName} finish`}>
                {mats.map((opt) => {
                  const selected =
                    (qty[opt.optionKey] ?? 0) > 0 ||
                    (!Object.keys(qty).some((k) => k.startsWith(`material:${room.roomKey}:`) && qty[k] > 0) &&
                      opt.includedInBaseline);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`option-card${selected ? " is-selected" : ""}`}
                      disabled={!opt.selectable}
                      aria-pressed={selected}
                      onClick={() => {
                        setQty((prev) => {
                          const next = { ...prev };
                          for (const m of mats) next[m.optionKey] = 0;
                          next[opt.optionKey] = 1;
                          return next;
                        });
                        setSaveState("idle");
                      }}
                    >
                      <strong>{opt.displayLabel}</strong>
                      {opt.includedInBaseline ? <span className="pill">Included</span> : null}
                      {opt.description ? <span className="muted">{opt.description}</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {addonOptions(config.options || []).length ? (
          <section className="card">
            <h3 className="card__heading">Options</h3>
            <ul className="addon-list">
              {addonOptions(config.options || []).map((opt) => {
                const unresolved =
                  !opt.selectable ||
                  opt.availabilityState === "unavailable" ||
                  opt.availabilityState === "review_required";
                return (
                  <li key={opt.id} className="addon-row">
                    <div>
                      <strong>{opt.displayLabel}</strong>
                      {unresolved ? (
                        <span className="pill pill--warn">Requires estimator review</span>
                      ) : opt.includedInBaseline ? (
                        <span className="pill">Included</span>
                      ) : null}
                      {opt.description ? <p className="muted">{opt.description}</p> : null}
                    </div>
                    {unresolved ? (
                      <span className="muted">Unavailable</span>
                    ) : (
                      <label className="qty-label">
                        <span className="sr-only">Quantity for {opt.displayLabel}</span>
                        <input
                          type="number"
                          min={opt.minQty}
                          max={opt.maxQty ?? 99}
                          value={qty[opt.optionKey] ?? opt.defaultQty ?? 0}
                          onChange={(e) => {
                            const n = Number(e.target.value) || 0;
                            setQty((q) => ({ ...q, [opt.optionKey]: n }));
                            setSaveState("idle");
                          }}
                        />
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <aside className="sticky-summary no-print" aria-live="polite">
          <h3>Updated estimate</h3>
          <dl className="summary-dl">
            <div>
              <dt>Original estimate</dt>
              <dd>{formatCurrency(baseline)}</dd>
            </div>
            <div>
              <dt>Updated estimate</dt>
              <dd>{formatCurrency(configured)}</dd>
            </div>
            <div>
              <dt>Selected changes</dt>
              <dd>{formatCurrency(delta)}</dd>
            </div>
          </dl>
          <p className="muted small">
            Pricing valid through {formatDate(config.pricingValidThrough || estimate.pricingValidThrough)}.
            Estimate configuration — not final acceptance.
          </p>
          <div className="actions">
            <button type="button" className="btn-primary" disabled={saveState === "saving"} onClick={() => void onSave()}>
              {saveState === "saving" ? "Saving…" : "Save selections"}
            </button>
            <span className="save-status" role="status">
              {saveState === "saved" ? "Selection saved" : null}
              {saveState === "error" ? saveError || "Unable to save" : null}
            </span>
          </div>
        </aside>

        {reviewUiEnabled() ? (
          <section className="card review-panel no-print" aria-labelledby="review-heading">
            <h3 id="review-heading" className="card__heading">
              Request an updated estimate
            </h3>
            <p className="muted">
              Send selections for review. This is not an order or acceptance. Pricing and availability remain
              subject to estimator review. No email is sent automatically.
            </p>
            {reviewRequest ? (
              <div className="review-confirmation" role="status">
                <p>
                  <strong>{reviewRequest.statusLabel}</strong>
                </p>
                <p>
                  Selections sent · Reference {reviewRequest.requestReference} ·{" "}
                  {formatDate(reviewRequest.requestedAt)}
                </p>
                <p className="muted">{reviewDisclaimer || reviewRequest.nonAcceptanceNotice}</p>
                <dl className="summary-dl">
                  <div>
                    <dt>Submitted original</dt>
                    <dd>{formatCurrency(reviewRequest.baselineDisplayTotal ?? null)}</dd>
                  </div>
                  <div>
                    <dt>Submitted updated</dt>
                    <dd>{formatCurrency(reviewRequest.configuredDisplayTotal ?? null)}</dd>
                  </div>
                  <div>
                    <dt>Submitted difference</dt>
                    <dd>{formatCurrency(reviewRequest.displayDelta ?? null)}</dd>
                  </div>
                </dl>
                {reviewRequest.currentSelectionsDifferFromSubmitted ? (
                  <p className="pill pill--warn" role="status">
                    Current selections differ from the submitted request. Save again, then you may request a
                    new review under estimator policy. The prior request is unchanged.
                  </p>
                ) : null}
                <ul className="addon-list">
                  {(reviewRequest.selectedOptions || []).map((o, i) => (
                    <li key={`${o.optionKey || "opt"}-${i}`}>
                      {o.displayLabel || o.optionKey} × {o.quantity ?? 1}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label className="qty-label" htmlFor={`${formId}-note`}>
              Optional note to your estimator
              <textarea
                id={`${formId}-note`}
                maxLength={1000}
                rows={3}
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                disabled={Boolean(reviewRequest) && !reviewRequest?.currentSelectionsDifferFromSubmitted}
              />
            </label>
            <div className="actions">
              <button
                type="button"
                className="btn-primary"
                disabled={
                  !canRequestReview ||
                  reviewBusy ||
                  (Boolean(reviewRequest) && !reviewRequest?.currentSelectionsDifferFromSubmitted)
                }
                onClick={() => void onSendForReview()}
              >
                {reviewBusy ? "Sending…" : "Send selections for review"}
              </button>
              {reviewError ? <span className="save-status">{reviewError}</span> : null}
            </div>
          </section>
        ) : null}

        <section className="print-only print-config" aria-hidden="true">
          <h2>Configured estimate</h2>
          <p>Original: {formatCurrency(baseline)}</p>
          <p>Updated: {formatCurrency(configured)}</p>
          <p>Difference: {formatCurrency(delta)}</p>
          <p>Pricing valid through: {formatDate(config.pricingValidThrough || estimate.pricingValidThrough)}</p>
          <p>This printout is estimate configuration — not final acceptance.</p>
        </section>
      </main>
    </div>
  );
}
