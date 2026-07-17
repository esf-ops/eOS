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
  type CustomerMaterial,
  type CustomerReviewRequest,
  type PublicEstimate,
} from "./publicConfigApi";
import { ReadOnlyEstimateView } from "./ReadOnlyEstimateView";

type Props = {
  state: ConfigurationState;
  onState: (next: ConfigurationState) => void;
  onFatal: () => void;
};

type JourneyStep = "review" | "customize" | "request";

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

function materialsForRoom(materials: CustomerMaterial[] | undefined, roomKey: string): CustomerMaterial[] {
  return (materials || []).filter((m) => m.roomKey === roomKey);
}

export function ConfigurationView({ state, onState, onFatal }: Props) {
  const estimate = state.estimate as PublicEstimate | null | undefined;
  const config = state.configuration;
  const formId = useId();

  const [step, setStep] = useState<JourneyStep>("review");
  const [activeRoomKey, setActiveRoomKey] = useState<string | null>(null);
  const [colorQuery, setColorQuery] = useState("");
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

  useEffect(() => {
    const first = config?.rooms?.[0]?.roomKey || null;
    setActiveRoomKey((prev) => prev || first);
  }, [config?.rooms]);

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
    estimate?.totals?.estimatedProjectTotal ??
    null;
  const configured = totals.configured ?? baseline;
  const delta = totals.delta ?? (configured != null && baseline != null ? configured - baseline : null);
  const canRequestReview = reviewUiEnabled() && saveState === "saved" && latestCalc != null;
  const rooms = config.rooms || [];
  const activeRoom = rooms.find((r) => r.roomKey === activeRoomKey) || rooms[0];

  function selectMaterial(roomKey: string, optionKey: string) {
    const mats = materialOptions(config!.options || [], roomKey);
    setQty((prev) => {
      const next = { ...prev };
      for (const m of mats) next[m.optionKey] = 0;
      next[optionKey] = 1;
      return next;
    });
    setSaveState("idle");
  }

  function selectedMaterialOption(roomKey: string): ConfigOption | null {
    const mats = materialOptions(config!.options || [], roomKey);
    const selected = mats.find((m) => (qty[m.optionKey] ?? 0) > 0);
    if (selected) return selected;
    return mats.find((m) => m.includedInBaseline || m.defaultQty > 0) || mats[0] || null;
  }

  async function onSave() {
    setSaveState("saving");
    setSaveError(null);
    const seq = ++requestSeq.n;
    const items = Object.entries(qty)
      .filter(([, q]) => Number(q) > 0)
      .map(([optionKey, quantity]) => ({ optionKey, quantity: Number(quantity) }));
    for (const room of config!.rooms || []) {
      const selected = selectedMaterialOption(room.roomKey);
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

  const summaryAside = (
    <aside className="sticky-summary no-print" aria-live="polite">
      <p className="section-kicker">Your estimate</p>
      <h3>Selections summary</h3>
      <dl className="summary-dl summary-dl--totals">
        <div>
          <dt>Original estimate</dt>
          <dd>{formatCurrency(baseline)}</dd>
        </div>
        <div className="summary-dl__primary">
          <dt>Updated estimate</dt>
          <dd>{formatCurrency(configured)}</dd>
        </div>
        <div className="summary-dl__delta">
          <dt>Change from original</dt>
          <dd>{formatCurrency(delta)}</dd>
        </div>
      </dl>
      <p className="muted small">
        Pricing valid through {formatDate(config.pricingValidThrough || estimate.pricingValidThrough)}.
        Estimate configuration — not final acceptance.
      </p>
      {step === "customize" ? (
        <div className="actions">
          <button
            type="button"
            className="btn-primary btn-primary--wide"
            disabled={saveState === "saving"}
            onClick={() => void onSave()}
          >
            {saveState === "saving" ? "Saving…" : "Save selections"}
          </button>
          <span className="save-status" role="status">
            {saveState === "saved" ? "Selection saved" : null}
            {saveState === "error" ? saveError || "Unable to save" : null}
          </span>
        </div>
      ) : null}
    </aside>
  );

  return (
    <div className="page page--configuration">
      <header className="topbar no-print">
        <div className="topbar__inner">
          <div className="brand-lockup">
            <span className="brand-lockup__mark" aria-hidden="true">
              ESF
            </span>
            <span>
              <span className="brand-lockup__name">Elite Stone Fabrication</span>
              <span className="brand-lockup__product">Elite 100 Digital Estimate</span>
            </span>
          </div>
          <button type="button" className="btn-print" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </header>

      <main className="shell shell--configuration">
        <section className="hero">
          <nav className="journey-steps no-print" aria-label="Estimate configuration steps">
            {(
              [
                ["review", "Review"],
                ["customize", "Customize"],
                ["request", "Request review"],
              ] as const
            ).map(([key, label], i) => {
              const order = { review: 0, customize: 1, request: 2 } as const;
              const current = order[step];
              const idx = order[key];
              const cls =
                idx < current ? "journey-step is-complete" : idx === current ? "journey-step is-current" : "journey-step";
              return (
                <button
                  key={key}
                  type="button"
                  className={cls}
                  aria-current={idx === current ? "step" : undefined}
                  onClick={() => setStep(key)}
                >
                  <span aria-hidden="true">{i + 1}</span> {label}
                </button>
              );
            })}
          </nav>
          <p className="eyebrow">Prepared for you</p>
          <h2 className="hero__title">{estimate.documentTitle}</h2>
          <p className="lede">
            Review your original estimate, choose approved finishes room by room, then send your
            configuration for estimator review. This is not an order or acceptance.
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

        {step === "review" ? (
          <>
            <section className="card card--baseline">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Your starting point</p>
                  <h3 className="card__heading">Original estimate</h3>
                </div>
                <span className="locked-badge">Scope locked</span>
              </div>
              <p className="total-row__value">{formatCurrency(baseline)}</p>
              <p className="muted">{config.lockedScopeNotice}</p>
              <div className="change-rules">
                <p>
                  <strong>You can change:</strong> estimator-approved finishes and add-on quantities.
                </p>
                <p>
                  <strong>You cannot change:</strong> measurements, fabrication scope, pricing groups, or
                  totals directly.
                </p>
              </div>
            </section>

            <section className="card">
              <p className="section-kicker">Project</p>
              <h3 className="card__heading">Project information</h3>
              {estimate.project?.customerName ? (
                <p className="project-line">{estimate.project.customerName}</p>
              ) : null}
              {estimate.project?.projectName ? (
                <p className="project-line">{estimate.project.projectName}</p>
              ) : null}
              {estimate.project?.projectAddress ? (
                <p className="project-line project-line--muted">{estimate.project.projectAddress}</p>
              ) : null}
            </section>

            <section className="card">
              <p className="section-kicker">Rooms</p>
              <h3 className="card__heading">Locked professional scope</h3>
              <ul className="room-list">
                {rooms.map((r) => (
                  <li key={r.roomKey} className="room">
                    <h4 className="room__name">{r.displayName}</h4>
                    <p className="room__detail">
                      <span className="room__label">Baseline finish</span>{" "}
                      {r.baselineColorLabel || r.baselineMaterialLabel || "—"}
                    </p>
                    <p className="room__detail">
                      <span className="locked-badge">Measurements locked</span>
                    </p>
                  </li>
                ))}
              </ul>
              {(estimate.lineItems || []).length ? (
                <>
                  <h4 className="card__heading" style={{ marginTop: "1.25rem" }}>
                    Included items
                  </h4>
                  <ul className="addon-list">
                    {estimate.lineItems.map((li, i) => (
                      <li key={`${li.label || "line"}-${i}`}>
                        {li.label || "Included item"}
                        {li.amount != null ? ` — ${formatCurrency(li.amount)}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>

            <div className="actions no-print">
              <button type="button" className="btn-primary" onClick={() => setStep("customize")}>
                Continue to customize
              </button>
            </div>
          </>
        ) : null}

        {step === "customize" ? (
          <>
            <nav className="room-tabs no-print" aria-label="Rooms">
              {rooms.map((r) => (
                <button
                  key={r.roomKey}
                  type="button"
                  className={`room-tab${activeRoom?.roomKey === r.roomKey ? " is-selected" : ""}`}
                  onClick={() => {
                    setActiveRoomKey(r.roomKey);
                    setColorQuery("");
                  }}
                >
                  {r.displayName}
                </button>
              ))}
            </nav>

            {activeRoom ? (
              <section className="card card--room">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Choose a finish</p>
                    <h3 className="card__heading">{activeRoom.displayName}</h3>
                  </div>
                  <span className="locked-badge">Measurements locked</span>
                </div>
                <p className="muted">
                  Select one estimator-approved Elite 100 color. Pricing group details stay with your
                  estimator.
                </p>
                <label className="color-search" htmlFor={`${formId}-color-search`}>
                  <span className="sr-only">Search finishes</span>
                  <input
                    id={`${formId}-color-search`}
                    type="search"
                    placeholder="Search colors"
                    value={colorQuery}
                    onChange={(e) => setColorQuery(e.target.value)}
                  />
                </label>
                {(() => {
                  const mats = materialsForRoom(config.materials, activeRoom.roomKey);
                  const opts = materialOptions(config.options || [], activeRoom.roomKey);
                  const cards =
                    mats.length > 0
                      ? mats
                      : opts.map((o) => ({
                          materialId: o.materialId || o.optionKey,
                          displayName: o.displayLabel,
                          imageAssetPath: o.imageAssetRef || null,
                          imageFullPath: null,
                          collectionLabel: "Elite 100",
                          colorFamily: null,
                          patternType: null,
                          customerVisible: true,
                          roomKey: activeRoom.roomKey,
                          optionKey: o.optionKey,
                          includedInBaseline: Boolean(o.includedInBaseline),
                          isDefault: o.defaultQty > 0,
                          selectable: o.selectable,
                        }));
                  const q = colorQuery.trim().toLowerCase();
                  const filtered = q
                    ? cards.filter((c) => c.displayName.toLowerCase().includes(q))
                    : cards;
                  const selected = selectedMaterialOption(activeRoom.roomKey);
                  return (
                    <div className="material-grid" role="radiogroup" aria-label={`${activeRoom.displayName} finish`}>
                      {filtered.map((mat) => {
                        const optionKey = mat.optionKey || `material:${activeRoom.roomKey}:${mat.materialId}`;
                        const isSelected = selected?.optionKey === optionKey;
                        return (
                          <button
                            key={optionKey}
                            type="button"
                            className={`material-card${isSelected ? " is-selected" : ""}`}
                            disabled={mat.selectable === false}
                            aria-pressed={isSelected}
                            onClick={() => selectMaterial(activeRoom.roomKey, optionKey)}
                          >
                            <span className="material-card__swatch">
                              {mat.imageAssetPath ? (
                                <img src={mat.imageAssetPath} alt="" loading="lazy" />
                              ) : (
                                <span className="material-card__placeholder" aria-hidden="true" />
                              )}
                            </span>
                            <span className="material-card__body">
                              <strong>{mat.displayName}</strong>
                              <span className="muted">{mat.collectionLabel || "Elite 100"}</span>
                              {mat.includedInBaseline || mat.isDefault ? (
                                <span className="pill">Included</span>
                              ) : null}
                              {isSelected ? <span className="pill pill--selected">Selected</span> : null}
                            </span>
                          </button>
                        );
                      })}
                      {!filtered.length ? (
                        <p className="muted">No finishes match your search for this room.</p>
                      ) : null}
                    </div>
                  );
                })()}
              </section>
            ) : null}

            {addonOptions(config.options || []).length ? (
              <section className="card card--options">
                <p className="section-kicker">Personalize your project</p>
                <h3 className="card__heading">Available options</h3>
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

            {summaryAside}

            <div className="actions no-print journey-nav">
              <button type="button" className="btn-secondary" onClick={() => setStep("review")}>
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  void (async () => {
                    if (saveState !== "saved") await onSave();
                    setStep("request");
                  })();
                }}
              >
                Continue to request review
              </button>
            </div>
          </>
        ) : null}

        {step === "request" ? (
          <>
            <section className="card">
              <p className="section-kicker">Final check</p>
              <h3 className="card__heading">Configuration summary</h3>
              <dl className="summary-dl summary-dl--totals">
                <div>
                  <dt>Original estimate</dt>
                  <dd>{formatCurrency(baseline)}</dd>
                </div>
                <div className="summary-dl__primary">
                  <dt>Updated estimate</dt>
                  <dd>{formatCurrency(configured)}</dd>
                </div>
                <div className="summary-dl__delta">
                  <dt>Change from original</dt>
                  <dd>{formatCurrency(delta)}</dd>
                </div>
              </dl>
              <ul className="room-list">
                {rooms.map((room) => {
                  const selected = selectedMaterialOption(room.roomKey);
                  return (
                    <li key={room.roomKey} className="room">
                      <h4 className="room__name">{room.displayName}</h4>
                      <p className="room__detail">
                        <span className="room__label">Selected finish</span>{" "}
                        {selected?.displayLabel || "—"}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <p className="muted">
                Submitting sends your selections for estimator review. This is not an order or acceptance.
                Pricing and availability remain subject to review.
              </p>
            </section>

            {summaryAside}

            {reviewUiEnabled() ? (
              <section className="card review-panel no-print" aria-labelledby="review-heading">
                <h3 id="review-heading" className="card__heading">
                  Request an updated estimate
                </h3>
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
                        Current selections differ from the submitted request. Save again, then you may
                        request a new review under estimator policy. The prior request is unchanged.
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
                    className="btn-secondary"
                    onClick={() => setStep("customize")}
                  >
                    Back to customize
                  </button>
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
                  {saveState !== "saved" ? (
                    <button type="button" className="btn-secondary" onClick={() => void onSave()}>
                      Save selections first
                    </button>
                  ) : null}
                </div>
              </section>
            ) : (
              <p className="muted">Review requests are not enabled for this pilot session.</p>
            )}
          </>
        ) : null}

        <section className="print-only print-config" aria-hidden="true">
          <h2>Configured estimate</h2>
          <p>Original: {formatCurrency(baseline)}</p>
          <p>Updated: {formatCurrency(configured)}</p>
          <p>Difference: {formatCurrency(delta)}</p>
          <p>
            Pricing valid through:{" "}
            {formatDate(config.pricingValidThrough || estimate.pricingValidThrough)}
          </p>
          <p>This printout is estimate configuration — not final acceptance.</p>
        </section>
      </main>
    </div>
  );
}
