import React, { useCallback, useMemo, useState } from "react";
import { apiPostJsonPublic, ApiError } from "../lib/api";
import { EOS_LOGO_URL } from "../lib/config";
import { computeGuidedSimpleAreas, defaultGuidedSimpleForm, type GuidedLayoutPreset, type GuidedSimpleForm } from "../lib/guidedHomeowner";
import {
  calculateAllRoomDrafts,
  createDefaultRoom,
  createManualScopeRoom,
  roomsNeedLocalVanityMath,
  serializeRoomsForApi,
  syntheticRoomForWorkflow
} from "../lib/prototypeQuoteMath";
import { computePublicConsumerEstimatesLocal, type PublicEstimateRow } from "../lib/publicConsumerParity";
import type { GuidedPiece, QuoteWorkflowMethod } from "../lib/quoteTypes";
import { round2, STANDARD_BACKSPLASH_HEIGHT_IN } from "../lib/measurementEngine";
import GuidedLayoutPublic from "./GuidedLayoutPublic";

const MATERIAL_GROUP = "Group Promo";

type MeasureCategory = "kitchen" | "bath" | "bar" | "unsure_scope";
type SizeMethod = "sqft" | "cabinet_length" | "layout" | "unsure_size";

function num(v: string): number {
  const n = Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function projectTypeFromCategory(c: MeasureCategory): string {
  if (c === "kitchen") return "Kitchen";
  if (c === "bath") return "Bathroom";
  if (c === "bar") return "Bar / laundry / other";
  return "Other";
}

export default function PublicQuoteWizard() {
  const [step, setStep] = useState(1);

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateUs, setStateUs] = useState("");
  const [zip, setZip] = useState("");

  const [measureCategory, setMeasureCategory] = useState<MeasureCategory | null>(null);
  const [sizeMethod, setSizeMethod] = useState<SizeMethod | null>(null);

  const [manualCt, setManualCt] = useState("45");
  const [manualBs, setManualBs] = useState("12");
  const [linearWall, setLinearWall] = useState("20");
  const [linearSplashIn, setLinearSplashIn] = useState(String(STANDARD_BACKSPLASH_HEIGHT_IN));
  const [linearIslandL, setLinearIslandL] = useState("0");
  const [linearIslandW, setLinearIslandW] = useState("0");

  const [guidedProjectPieces, setGuidedProjectPieces] = useState<GuidedPiece[]>(() => createDefaultRoom(MATERIAL_GROUP).guidedPieces);
  const [guidedPreset, setGuidedPreset] = useState<GuidedLayoutPreset | null>("straight");
  const [guidedSimpleForm, setGuidedSimpleForm] = useState<GuidedSimpleForm>(() => defaultGuidedSimpleForm());
  const [guidedUseAdvanced, setGuidedUseAdvanced] = useState(false);
  const [guidedAdvancedOpen, setGuidedAdvancedOpen] = useState(false);

  const [sink, setSink] = useState("1");
  const [bar, setBar] = useState("0");
  const [cook, setCook] = useState("1");
  const [outlet, setOutlet] = useState("0");
  const [ss, setSs] = useState("0");
  const [blanco, setBlanco] = useState("0");
  const [tearYes, setTearYes] = useState(false);
  const [includeBacksplash, setIncludeBacksplash] = useState(true);

  const [calcBusy, setCalcBusy] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calcWarnings, setCalcWarnings] = useState<string[]>([]);
  const [usedFallback, setUsedFallback] = useState(false);
  const [groupEstimates, setGroupEstimates] = useState<PublicEstimateRow[] | null>(null);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{
    quote_number?: string;
    branch_display?: string;
    sales_rep?: string | null;
    estimates_by_group?: PublicEstimateRow[];
  } | null>(null);

  const projectType = measureCategory ? projectTypeFromCategory(measureCategory) : "Kitchen";

  const quoteWorkflow: QuoteWorkflowMethod = useMemo(() => {
    if (sizeMethod === "cabinet_length") return "rapid_linear";
    if (sizeMethod === "layout") return "guided_shape";
    return "manual_sqft";
  }, [sizeMethod]);

  const guidedFormEffective = useMemo(() => {
    if (includeBacksplash) return guidedSimpleForm;
    return { ...guidedSimpleForm, splashHeightIn: "0" };
  }, [guidedSimpleForm, includeBacksplash]);

  const buildGlobalAddOns = useCallback(() => {
    return {
      "qty-sink": num(sink),
      "qty-bar": num(bar),
      "qty-cook": num(cook),
      "qty-outlet": num(outlet),
      "qty-ss": num(ss),
      "qty-blanco": num(blanco),
      tearout: tearYes ? 1 : 0
    };
  }, [sink, bar, cook, outlet, ss, blanco, tearYes]);

  const buildRoomDraftsForCalculate = useCallback(() => {
    if (quoteWorkflow === "guided_shape" && !guidedUseAdvanced) {
      const areas = computeGuidedSimpleAreas(guidedPreset, guidedFormEffective);
      const counter = areas.counter;
      const splash = includeBacksplash ? areas.splash : 0;
      return [createManualScopeRoom(MATERIAL_GROUP, counter, splash)];
    }
    return [
      syntheticRoomForWorkflow(
        quoteWorkflow,
        MATERIAL_GROUP,
        {
          counter: num(manualCt),
          splash: includeBacksplash ? num(manualBs) : 0
        },
        {
          wallFt: num(linearWall),
          splashIn: includeBacksplash ? num(linearSplashIn) : 0,
          islandL: num(linearIslandL),
          islandW: num(linearIslandW)
        },
        guidedProjectPieces
      )
    ];
  }, [
    quoteWorkflow,
    manualCt,
    manualBs,
    linearWall,
    linearSplashIn,
    linearIslandL,
    linearIslandW,
    guidedProjectPieces,
    guidedUseAdvanced,
    guidedPreset,
    guidedFormEffective,
    includeBacksplash
  ]);

  const buildCalcPayload = useCallback(() => {
    const drafts = buildRoomDraftsForCalculate();
    const apiRooms = serializeRoomsForApi(drafts);
    const addOns = buildGlobalAddOns();
    let countertopSqft = 0;
    let backsplashSqft = 0;
    for (const row of apiRooms) {
      countertopSqft += Number(row.countertopSqft) || 0;
      backsplashSqft += Number(row.backsplashSqft) || 0;
    }
    if (!apiRooms.length) {
      const { totals } = calculateAllRoomDrafts(drafts, projectType);
      countertopSqft = totals.counter;
      backsplashSqft = round2(totals.splash + totals.fhb);
    }
    const engine = apiRooms.length >= 1 ? "rooms" : "legacy";
    return {
      quoteSource: "public_retail",
      materialGroup: MATERIAL_GROUP,
      areas: { countertopSqft, backsplashSqft },
      addOns,
      engine,
      rooms: apiRooms,
      retailMarkupPercent: 25,
      retailMethod: "Markup Percent",
      customer_name: customerName.trim() || undefined,
      customer_email: email.trim() || undefined,
      customer_phone: phone.trim() || undefined,
      project_type: projectType.trim() || undefined,
      project_address: projectAddress.trim() || undefined,
      city: city.trim() || undefined,
      state: stateUs.trim() || undefined,
      zip: zip.trim() || undefined
    };
  }, [buildRoomDraftsForCalculate, buildGlobalAddOns, customerName, email, phone, projectType, projectAddress, city, stateUs, zip]);

  const applyLocalFallbackEstimates = useCallback(() => {
    const drafts = buildRoomDraftsForCalculate();
    const apiRooms = serializeRoomsForApi(drafts);
    const addOns = buildGlobalAddOns();
    let countertopSqft = 0;
    let backsplashSqft = 0;
    for (const row of apiRooms) {
      countertopSqft += Number(row.countertopSqft) || 0;
      backsplashSqft += Number(row.backsplashSqft) || 0;
    }
    if (!apiRooms.length) {
      const { totals } = calculateAllRoomDrafts(drafts, projectType);
      countertopSqft = totals.counter;
      backsplashSqft = round2(totals.splash + totals.fhb);
    }
    const rows = computePublicConsumerEstimatesLocal({ countertopSqft, backsplashSqft, addOns });
    setGroupEstimates(rows);
    setUsedFallback(true);
    setCalcWarnings([]);
  }, [buildRoomDraftsForCalculate, buildGlobalAddOns, projectType]);

  const handleCalculate = useCallback(async () => {
    setCalcBusy(true);
    setCalcError(null);
    setCalcWarnings([]);
    setUsedFallback(false);
    setGroupEstimates(null);

    const drafts = buildRoomDraftsForCalculate();
    if (roomsNeedLocalVanityMath(drafts)) {
      setCalcError("This quick form is tuned for kitchen-style counters. Please call Elite for vanity-specific help, or continue using square feet as a rough guide.");
      setCalcBusy(false);
      return;
    }

    try {
      const raw = (await apiPostJsonPublic("/api/public-quote/calculate", buildCalcPayload())) as Record<string, unknown>;
      const rows = raw?.estimates_by_group;
      if (raw?.ok === true && Array.isArray(rows) && rows.length) {
        setGroupEstimates(rows as PublicEstimateRow[]);
        setUsedFallback(false);
        setCalcWarnings((raw.warnings as string[]) || []);
        setCalcBusy(false);
        return;
      }
    } catch {
      /* use local parity */
    }
    applyLocalFallbackEstimates();
    setCalcBusy(false);
  }, [buildCalcPayload, buildRoomDraftsForCalculate, applyLocalFallbackEstimates]);

  const handleSubmit = useCallback(async () => {
    setSubmitBusy(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    const payload = { ...buildCalcPayload(), customer_name: customerName.trim() || null, customer_email: email.trim() || null, customer_phone: phone.trim() || null, project_type: projectType.trim() || null, project_address: projectAddress.trim() || null, city: city.trim() || null, state: stateUs.trim() || null, zip: zip.trim() || null };
    try {
      const raw = (await apiPostJsonPublic("/api/public-quote/submit-measurements", payload)) as Record<string, unknown>;
      if (raw?.ok === true) {
        setSubmitSuccess({
          quote_number: raw.quote_number != null ? String(raw.quote_number) : undefined,
          branch_display: raw.branch_display != null ? String(raw.branch_display) : undefined,
          sales_rep: raw.sales_rep != null ? String(raw.sales_rep) : null,
          estimates_by_group: Array.isArray(raw.estimates_by_group) ? (raw.estimates_by_group as PublicEstimateRow[]) : undefined
        });
      } else {
        setSubmitError("We could not save your measurements. Please try again or call Elite.");
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown> | null;
        const installed = body && body.installed === false;
        if (e.status === 503 || installed) {
          setSubmitError("Saving is not available in this preview environment. Your estimate is still shown above.");
        } else {
          setSubmitError(e.message);
        }
      } else {
        setSubmitError(String(e));
      }
    } finally {
      setSubmitBusy(false);
    }
  }, [buildCalcPayload, customerName, email, phone, projectType, projectAddress, city, stateUs, zip]);

  const canNextFrom1 = customerName.trim() && phone.trim() && email.trim() && projectAddress.trim() && city.trim() && stateUs.trim() && zip.trim();
  const canNextFrom2 = measureCategory != null;
  const canNextFrom3 = sizeMethod != null && (sizeMethod !== "layout" || guidedPreset != null);
  const canNextFrom4 = true;

  return (
    <div className="page public-wizard">
      <header className="hero public-hero">
        <div className="hero-brand">
          <img className="logo" src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
          <div className="hero-titles">
            <h1 className="title">Get a countertop estimate</h1>
            <p className="subtitle">No exact measurements? No problem.</p>
            <p className="hero-tagline public-hero-tagline">
              Start with your best estimate. Elite will verify before final pricing.
            </p>
          </div>
        </div>
        <div className="wizard-progress" aria-label="Steps">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <span key={s} className={`wizard-dot ${step >= s ? "on" : ""}`}>
              {s}
            </span>
          ))}
        </div>
      </header>

      <main className="public-wizard-main">
        {step === 1 ? (
          <section className="card wizard-card">
            <h2 className="wizard-step-title">Step 1 — Your project</h2>
            <p className="wizard-lead">Tell us where the project is so we can route your quote to the right Elite team member.</p>
            <div className="grid2">
              <label>
                Name
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="name" />
              </label>
              <label>
                Phone
                <input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </label>
              <label className="full-row">
                Email
                <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              <label className="full-row">
                Project address
                <input value={projectAddress} onChange={(e) => setProjectAddress(e.target.value)} autoComplete="street-address" />
              </label>
              <label>
                City
                <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
              </label>
              <label>
                State
                <input value={stateUs} onChange={(e) => setStateUs(e.target.value)} autoComplete="address-level1" />
              </label>
              <label>
                ZIP
                <input value={zip} onChange={(e) => setZip(e.target.value)} autoComplete="postal-code" />
              </label>
            </div>
            <div className="wizard-nav">
              <span />
              <button type="button" className="btn primary big" disabled={!canNextFrom1} onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="card wizard-card">
            <h2 className="wizard-step-title">Step 2 — What are you measuring?</h2>
            <p className="wizard-lead">Choose the closest match.</p>
            <div className="big-choice-grid">
              {(
                [
                  { id: "kitchen" as const, title: "Kitchen countertops", sub: "Most common" },
                  { id: "bath" as const, title: "Bathroom vanity", sub: "Vanity tops" },
                  { id: "bar" as const, title: "Bar, laundry, or other", sub: "Smaller surfaces" },
                  { id: "unsure_scope" as const, title: "I'm not sure", sub: "We will help sort it out" }
                ] as const
              ).map((c) => (
                <button key={c.id} type="button" className={`big-choice-card ${measureCategory === c.id ? "on" : ""}`} onClick={() => setMeasureCategory(c.id)}>
                  <span className="bcc-title">{c.title}</span>
                  <span className="bcc-sub">{c.sub}</span>
                </button>
              ))}
            </div>
            <div className="wizard-nav">
              <button type="button" className="btn secondary big" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="btn primary big" disabled={!canNextFrom2} onClick={() => setStep(3)}>
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="card wizard-card">
            <h2 className="wizard-step-title">Step 3 — Help us estimate the size</h2>
            <p className="wizard-lead">Pick the option that feels easiest. You can change it anytime.</p>
            <div className="big-choice-grid">
              {(
                [
                  { id: "sqft" as const, title: "I know my square footage", sub: "Countertop and backsplash square feet" },
                  { id: "cabinet_length" as const, title: "I know my cabinet lengths", sub: "Wall run in feet, optional island" },
                  { id: "layout" as const, title: "Help me with a simple layout", sub: "Straight, L, U, galley, or island" },
                  { id: "unsure_size" as const, title: "I'm not sure", sub: "Enter your best guess in square feet" }
                ] as const
              ).map((c) => (
                <button key={c.id} type="button" className={`big-choice-card ${sizeMethod === c.id ? "on" : ""}`} onClick={() => setSizeMethod(c.id)}>
                  <span className="bcc-title">{c.title}</span>
                  <span className="bcc-sub">{c.sub}</span>
                </button>
              ))}
            </div>

            {sizeMethod === "sqft" || sizeMethod === "unsure_size" ? (
              <div className="grid2 block-top">
                <label>
                  Countertop square feet
                  <input value={manualCt} onChange={(e) => setManualCt(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Backsplash square feet
                  <input value={manualBs} onChange={(e) => setManualBs(e.target.value)} inputMode="decimal" />
                </label>
                <p className="muted small full-row">Counter depth is assumed at 25.5 inches unless you use the layout helper below.</p>
              </div>
            ) : null}

            {sizeMethod === "cabinet_length" ? (
              <div className="grid2 block-top">
                <label>
                  Total cabinet length (feet)
                  <input value={linearWall} onChange={(e) => setLinearWall(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Backsplash height (inches)
                  <input value={linearSplashIn} onChange={(e) => setLinearSplashIn(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Island length (feet, optional)
                  <input value={linearIslandL} onChange={(e) => setLinearIslandL(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Island width (feet, optional)
                  <input value={linearIslandW} onChange={(e) => setLinearIslandW(e.target.value)} inputMode="decimal" />
                </label>
                <p className="muted small full-row">Wall cabinets use 25.5 inch counter depth unless you tell us otherwise in a follow-up.</p>
              </div>
            ) : null}

            {sizeMethod === "layout" ? (
              <div className="block-top">
                <GuidedLayoutPublic
                  materialGroup={MATERIAL_GROUP}
                  guidedPreset={guidedPreset}
                  setGuidedPreset={setGuidedPreset}
                  guidedSimpleForm={guidedSimpleForm}
                  setGuidedSimpleForm={setGuidedSimpleForm}
                  guidedUseAdvanced={guidedUseAdvanced}
                  setGuidedUseAdvanced={setGuidedUseAdvanced}
                  guidedAdvancedOpen={guidedAdvancedOpen}
                  setGuidedAdvancedOpen={setGuidedAdvancedOpen}
                  guidedProjectPieces={guidedProjectPieces}
                  setGuidedProjectPieces={setGuidedProjectPieces}
                />
              </div>
            ) : null}

            <div className="wizard-nav">
              <button type="button" className="btn secondary big" onClick={() => setStep(2)}>
                Back
              </button>
              <button type="button" className="btn primary big" disabled={!canNextFrom3} onClick={() => setStep(4)}>
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="card wizard-card">
            <h2 className="wizard-step-title">Step 4 — Common options</h2>
            <p className="wizard-lead">Not sure? Leave it blank. Elite can verify later.</p>
            <div className="grid2">
              <label>
                Kitchen sink cutouts (quantity)
                <input value={sink} onChange={(e) => setSink(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                Cooktop cutouts (quantity)
                <input value={cook} onChange={(e) => setCook(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                Vanity or bar sink cutouts (quantity)
                <input value={bar} onChange={(e) => setBar(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                Outlet cutouts (quantity)
                <input value={outlet} onChange={(e) => setOutlet(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                ESF stainless kitchen sink (quantity)
                <input value={ss} onChange={(e) => setSs(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                Stock Blanco sink (quantity)
                <input value={blanco} onChange={(e) => setBlanco(e.target.value)} inputMode="numeric" />
              </label>
            </div>
            <label className="check block-top">
              <input type="checkbox" checked={includeBacksplash} onChange={(e) => setIncludeBacksplash(e.target.checked)} />
              Include backsplash in the estimate
            </label>
            <label className="check">
              <input type="checkbox" checked={tearYes} onChange={(e) => setTearYes(e.target.checked)} />
              Tear-out of existing tops may be needed
            </label>
            <div className="wizard-nav">
              <button type="button" className="btn secondary big" onClick={() => setStep(3)}>
                Back
              </button>
              <button type="button" className="btn primary big" disabled={!canNextFrom4} onClick={() => setStep(5)}>
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 5 ? (
          <section className="card wizard-card">
            <h2 className="wizard-step-title">Step 5 — Your estimate</h2>
            <p className="wizard-lead">Compare material levels. Planning numbers include standard homeowner protection on every tier.</p>
            {groupEstimates?.length ? (
              <>
                {!usedFallback ? (
                  <p className="live-estimate-note" role="status">
                    Live estimate calculated.
                  </p>
                ) : (
                  <p className="preview-estimate-note" role="status">
                    Preview estimate shown. Live saving may not be connected in this environment.
                  </p>
                )}
                {calcWarnings.length ? (
                  <ul className="muted small">
                    {calcWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
            <div className="actions">
              <button type="button" className="btn primary big" disabled={calcBusy} onClick={() => void handleCalculate()}>
                {calcBusy ? "Calculating…" : "Calculate estimate"}
              </button>
            </div>
            {calcError ? <p className="error">{calcError}</p> : null}
            {groupEstimates?.length ? (
              <>
                <h3 className="wizard-step-sub block-top">Estimated project range by material level</h3>
                <div className="table-scroll">
                  <table className="group-compare-table">
                    <thead>
                      <tr>
                        <th>Level</th>
                        <th>Countertops</th>
                        <th>Backsplash</th>
                        <th>Add-ons</th>
                        <th>Estimated total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupEstimates.map((row) => (
                        <tr key={row.group}>
                          <td>{row.group}</td>
                          <td>${row.countertop.toFixed(2)}</td>
                          <td>${row.backsplash.toFixed(2)}</td>
                          <td>${row.addons.toFixed(2)}</td>
                          <td>
                            <strong>${row.total.toFixed(2)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted small block-top">
                  Final pricing may change after material selection, field template, and site review.
                </p>
              </>
            ) : null}
            <div className="wizard-nav">
              <button type="button" className="btn secondary big" onClick={() => setStep(4)}>
                Back
              </button>
              <button type="button" className="btn primary big" onClick={() => setStep(6)} disabled={!groupEstimates?.length}>
                Continue to submit
              </button>
            </div>
          </section>
        ) : null}

        {step === 6 ? (
          <section className="card wizard-card">
            <h2 className="wizard-step-title">Step 6 — Submit measurements</h2>
            <p className="wizard-lead">Send what you have so far. There is no sign-in required.</p>
            <div className="actions">
              <button type="button" className="btn primary big" disabled={submitBusy || !groupEstimates?.length} onClick={() => void handleSubmit()}>
                {submitBusy ? "Sending…" : "Submit measurements"}
              </button>
            </div>
            {submitError ? <p className="error">{submitError}</p> : null}
            {submitSuccess ? (
              <div className="success-panel block-top">
                <h3>Thanks — we received your measurements.</h3>
                {submitSuccess.quote_number ? (
                  <p>
                    <strong>Reference:</strong> {submitSuccess.quote_number}
                  </p>
                ) : null}
                {submitSuccess.branch_display ? (
                  <p>
                    <strong>Team:</strong> {submitSuccess.branch_display}
                    {submitSuccess.sales_rep ? ` — ${submitSuccess.sales_rep}` : ""}
                  </p>
                ) : null}
                {submitSuccess.estimates_by_group?.length ? (
                  <div className="table-scroll">
                    <p className="section-lead">Estimates by material level (same as your preview)</p>
                    <table className="group-compare-table">
                      <thead>
                        <tr>
                          <th>Level</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submitSuccess.estimates_by_group.map((row) => (
                          <tr key={row.group}>
                            <td>{row.group}</td>
                            <td>${row.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <p className="muted">Elite will review and follow up.</p>
              </div>
            ) : null}
            <div className="wizard-nav">
              <button type="button" className="btn secondary big" onClick={() => setStep(5)}>
                Back
              </button>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="public-wizard-foot muted small">
        <p>Elite Stone Fabrication — planning estimate tool.</p>
      </footer>
    </div>
  );
}
