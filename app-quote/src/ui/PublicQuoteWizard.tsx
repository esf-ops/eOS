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
import { PUBLIC_WIZARD } from "./publicQuoteCopy";

const MATERIAL_GROUP = "Group Promo";

const STEP_TRACK = [
  { n: 1, short: "Project" },
  { n: 2, short: "Measure" },
  { n: 3, short: "Size" },
  { n: 4, short: "Options" },
  { n: 5, short: "Compare" },
  { n: 6, short: "Send" }
] as const;

type MeasureCategory = "kitchen" | "bath" | "bar" | "unsure_scope";
type SizeMethod = "sqft" | "cabinet_length" | "layout" | "unsure_size";
type CalcReachability = "live" | "preview_server" | "preview_offline";

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

function formatMoney(n: number) {
  return `$${n.toFixed(2)}`;
}

function friendlySubmitError(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body as Record<string, unknown> | string | null;
    const installed = typeof body === "object" && body && body.installed === false;
    if (e.status === 503 || installed) {
      return PUBLIC_WIZARD.errorSubmitPreview;
    }
    return PUBLIC_WIZARD.errorSubmitUnreachable;
  }
  return PUBLIC_WIZARD.errorSubmitUnreachable;
}

/** Hide anything that could read as internal or technical on a public surface. */
function sanitizeHomeownerWarnings(warnings: string[]): string[] {
  return warnings.filter((w) => {
    const s = String(w).toLowerCase();
    return !/wholesale|internal|supabase|sql|stack|json|endpoint|service_role|debug/i.test(s);
  });
}

function EstimateTierCards({ rows, variant = "full" }: { rows: PublicEstimateRow[]; variant?: "full" | "compact" }) {
  return (
    <div className="estimate-display">
      {variant === "full" ? <p className="estimate-display-intro">{PUBLIC_WIZARD.estimateIntro}</p> : null}
      <div className="estimate-tier-grid">
        {rows.map((row) => (
          <article key={row.group} className="estimate-tier-card">
            <h4 className="estimate-tier-name">{row.group}</h4>
            <dl className="estimate-tier-lines">
              <div className="estimate-tier-line">
                <dt>Countertops</dt>
                <dd>{formatMoney(row.countertop)}</dd>
              </div>
              <div className="estimate-tier-line">
                <dt>Backsplash</dt>
                <dd>{formatMoney(row.backsplash)}</dd>
              </div>
              <div className="estimate-tier-line">
                <dt>Add-ons</dt>
                <dd>{formatMoney(row.addons)}</dd>
              </div>
              <div className="estimate-tier-line estimate-tier-total">
                <dt>Estimated total</dt>
                <dd>{formatMoney(row.total)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
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
  const [calcReachability, setCalcReachability] = useState<CalcReachability>("live");
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
    setCalcReachability("live");
    setGroupEstimates(null);

    const drafts = buildRoomDraftsForCalculate();
    if (roomsNeedLocalVanityMath(drafts)) {
      setCalcError(
        "This quick form works best for kitchen-style counters. For vanity-specific help, please call Elite — or enter rough square feet to get a ballpark."
      );
      setCalcBusy(false);
      return;
    }

    let threw = false;
    try {
      const raw = (await apiPostJsonPublic("/api/public-quote/calculate", buildCalcPayload())) as Record<string, unknown>;
      const rows = raw?.estimates_by_group;
      if (raw?.ok === true && Array.isArray(rows) && rows.length) {
        setGroupEstimates(rows as PublicEstimateRow[]);
        setUsedFallback(false);
        setCalcReachability("live");
        setCalcWarnings((raw.warnings as string[]) || []);
        setCalcBusy(false);
        return;
      }
    } catch {
      threw = true;
    }
    applyLocalFallbackEstimates();
    setCalcReachability(threw ? "preview_offline" : "preview_server");
    setCalcBusy(false);
  }, [buildCalcPayload, buildRoomDraftsForCalculate, applyLocalFallbackEstimates]);

  const handleSubmit = useCallback(async () => {
    setSubmitBusy(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    const payload = {
      ...buildCalcPayload(),
      customer_name: customerName.trim() || null,
      customer_email: email.trim() || null,
      customer_phone: phone.trim() || null,
      project_type: projectType.trim() || null,
      project_address: projectAddress.trim() || null,
      city: city.trim() || null,
      state: stateUs.trim() || null,
      zip: zip.trim() || null
    };
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
        setSubmitError(PUBLIC_WIZARD.errorSubmitGeneric);
      }
    } catch (e: unknown) {
      setSubmitError(friendlySubmitError(e));
    } finally {
      setSubmitBusy(false);
    }
  }, [buildCalcPayload, customerName, email, phone, projectType, projectAddress, city, stateUs, zip]);

  const canNextFrom1 = customerName.trim() && phone.trim() && email.trim() && projectAddress.trim() && city.trim() && stateUs.trim() && zip.trim();
  const canNextFrom2 = measureCategory != null;
  const canNextFrom3 = sizeMethod != null && (sizeMethod !== "layout" || guidedPreset != null);
  const canNextFrom4 = true;

  const calcStatusNote = useMemo(() => {
    if (!groupEstimates?.length) return null;
    if (!usedFallback && calcReachability === "live") {
      return <p className="live-estimate-note">{PUBLIC_WIZARD.liveEstimate}</p>;
    }
    if (calcReachability === "preview_offline") {
      return <p className="preview-estimate-note preview-estimate-note--offline">{PUBLIC_WIZARD.previewOffline}</p>;
    }
    return <p className="preview-estimate-note">{PUBLIC_WIZARD.previewEstimate}</p>;
  }, [groupEstimates?.length, usedFallback, calcReachability]);

  const safeCalcWarnings = useMemo(() => sanitizeHomeownerWarnings(calcWarnings), [calcWarnings]);

  return (
    <div className="page public-wizard">
      <header className="hero public-hero">
        <div className="hero-brand">
          <img className="logo" src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
          <div className="hero-titles">
            <h1 className="title">{PUBLIC_WIZARD.heroTitle}</h1>
            <p className="subtitle">{PUBLIC_WIZARD.heroSubtitle}</p>
            <p className="hero-tagline public-hero-tagline">{PUBLIC_WIZARD.heroTagline}</p>
          </div>
        </div>
        <nav className="wizard-track" aria-label="Progress">
          {STEP_TRACK.map((s) => (
            <div
              key={s.n}
              className={`wizard-track-item ${step === s.n ? "current" : ""} ${step > s.n ? "done" : ""}`}
              aria-current={step === s.n ? "step" : undefined}
            >
              <span className="wizard-track-dot">{s.n}</span>
              <span className="wizard-track-label">{s.short}</span>
            </div>
          ))}
        </nav>
      </header>

      <main className="public-wizard-main">
        {step === 1 ? (
          <section className="card wizard-card">
            <p className="wizard-kicker">{PUBLIC_WIZARD.stepOf(1)}</p>
            <h2 className="wizard-step-title">{PUBLIC_WIZARD.step1Title}</h2>
            <p className="wizard-lead">{PUBLIC_WIZARD.step1Lead}</p>
            <div className="grid2">
              <label>
                Your name
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="name" placeholder="First and last" />
              </label>
              <label>
                Mobile phone
                <input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="Best number to reach you" />
              </label>
              <label className="full-row">
                Email
                <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@email.com" />
              </label>
              <label className="full-row">
                Street address
                <input value={projectAddress} onChange={(e) => setProjectAddress(e.target.value)} autoComplete="street-address" placeholder="Project location" />
              </label>
              <label>
                City
                <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
              </label>
              <label>
                State
                <input value={stateUs} onChange={(e) => setStateUs(e.target.value)} autoComplete="address-level1" placeholder="e.g. TX" />
              </label>
              <label>
                ZIP code
                <input value={zip} onChange={(e) => setZip(e.target.value)} autoComplete="postal-code" />
              </label>
            </div>
            <div className="wizard-nav">
              <span className="wizard-nav-spacer" aria-hidden />
              <button type="button" className="btn primary big" disabled={!canNextFrom1} onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="card wizard-card">
            <p className="wizard-kicker">{PUBLIC_WIZARD.stepOf(2)}</p>
            <h2 className="wizard-step-title">{PUBLIC_WIZARD.step2Title}</h2>
            <p className="wizard-lead">{PUBLIC_WIZARD.step2Lead}</p>
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
            <p className="wizard-kicker">{PUBLIC_WIZARD.stepOf(3)}</p>
            <h2 className="wizard-step-title">{PUBLIC_WIZARD.step3Title}</h2>
            <p className="wizard-lead">{PUBLIC_WIZARD.step3Lead}</p>
            <div className="big-choice-grid">
              {(
                [
                  { id: "sqft" as const, title: "I know my square footage", sub: "Rough countertop and backsplash size" },
                  { id: "cabinet_length" as const, title: "I know cabinet wall lengths", sub: "Wall run in feet, optional island" },
                  { id: "layout" as const, title: "Help me with a simple layout", sub: "Straight, L, U, galley, or island" },
                  { id: "unsure_size" as const, title: "I'm not sure", sub: "Your best guess in square feet is fine" }
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
                  Countertops (sq ft)
                  <input value={manualCt} onChange={(e) => setManualCt(e.target.value)} inputMode="decimal" placeholder="e.g. 45" />
                </label>
                <label>
                  Backsplash (sq ft)
                  <input value={manualBs} onChange={(e) => setManualBs(e.target.value)} inputMode="decimal" placeholder="e.g. 12" />
                </label>
                <p className="muted small full-row">Standard counter depth is assumed unless you use the layout helper.</p>
              </div>
            ) : null}

            {sizeMethod === "cabinet_length" ? (
              <div className="grid2 block-top">
                <label>
                  Cabinet wall length (feet)
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
                <p className="muted small full-row">Wall runs use a standard counter depth unless Elite notes otherwise later.</p>
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
            <p className="wizard-kicker">{PUBLIC_WIZARD.stepOf(4)}</p>
            <h2 className="wizard-step-title">{PUBLIC_WIZARD.step4Title}</h2>
            <p className="wizard-lead">{PUBLIC_WIZARD.step4Lead}</p>
            <div className="grid2">
              <label>
                Kitchen sink openings
                <input value={sink} onChange={(e) => setSink(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                Cooktop openings
                <input value={cook} onChange={(e) => setCook(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                Vanity or bar sink openings
                <input value={bar} onChange={(e) => setBar(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                Outlet openings
                <input value={outlet} onChange={(e) => setOutlet(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                ESF stainless kitchen sink (qty)
                <input value={ss} onChange={(e) => setSs(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                Stock Blanco sink (qty)
                <input value={blanco} onChange={(e) => setBlanco(e.target.value)} inputMode="numeric" />
              </label>
            </div>
            <label className="check block-top">
              <input type="checkbox" checked={includeBacksplash} onChange={(e) => setIncludeBacksplash(e.target.checked)} />
              Include backsplash in this estimate
            </label>
            <label className="check">
              <input type="checkbox" checked={tearYes} onChange={(e) => setTearYes(e.target.checked)} />
              Existing tops may need tear-out
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
            <p className="wizard-kicker">{PUBLIC_WIZARD.stepOf(5)}</p>
            <h2 className="wizard-step-title">{PUBLIC_WIZARD.step5Title}</h2>
            <p className="wizard-lead">{PUBLIC_WIZARD.step5Lead}</p>
            {groupEstimates?.length ? (
              <>
                {calcStatusNote}
                {safeCalcWarnings.length ? (
                  <ul className="wizard-warn-list">
                    {safeCalcWarnings.map((w, i) => (
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
            {calcError ? (
              <p className="error error-panel" role="alert">
                {calcError}
              </p>
            ) : null}
            {groupEstimates?.length ? <EstimateTierCards rows={groupEstimates} /> : null}
            {groupEstimates?.length ? (
              <p className="muted small block-top estimate-footnote">Final numbers may change after material selection and an in-person review.</p>
            ) : null}
            <div className="wizard-nav">
              <button type="button" className="btn secondary big" onClick={() => setStep(4)}>
                Back
              </button>
              <button type="button" className="btn primary big" onClick={() => setStep(6)} disabled={!groupEstimates?.length}>
                Next: Submit measurements
              </button>
            </div>
          </section>
        ) : null}

        {step === 6 ? (
          <section className="card wizard-card">
            <p className="wizard-kicker">{PUBLIC_WIZARD.stepOf(6)}</p>
            <h2 className="wizard-step-title">{PUBLIC_WIZARD.step6Title}</h2>
            <p className="wizard-lead">{PUBLIC_WIZARD.step6Lead}</p>
            <div className="actions">
              <button type="button" className="btn primary big" disabled={submitBusy || !groupEstimates?.length} onClick={() => void handleSubmit()}>
                {submitBusy ? "Sending…" : "Submit measurements"}
              </button>
            </div>
            {submitError ? (
              <p className="error error-panel" role="alert">
                {submitError}
              </p>
            ) : null}
            {submitSuccess ? (
              <div className="success-panel block-top" role="status">
                <div className="success-panel-icon" aria-hidden />
                <h3 className="success-panel-title">{PUBLIC_WIZARD.submitThanks}</h3>
                {submitSuccess.quote_number ? (
                  <p className="success-ref">
                    <span className="success-ref-label">{PUBLIC_WIZARD.referenceLabel}</span>
                    <span className="success-ref-value">{submitSuccess.quote_number}</span>
                  </p>
                ) : null}
                {(submitSuccess.branch_display || submitSuccess.sales_rep) && (
                  <div className="success-team">
                    <h4 className="success-team-heading">{PUBLIC_WIZARD.eliteContactHeading}</h4>
                    {submitSuccess.branch_display ? <p className="success-team-line">{PUBLIC_WIZARD.eliteBranch(submitSuccess.branch_display)}</p> : null}
                    {submitSuccess.sales_rep ? <p className="success-team-line">{PUBLIC_WIZARD.eliteMember(submitSuccess.sales_rep)}</p> : null}
                  </div>
                )}
                {submitSuccess.estimates_by_group?.length ? (
                  <div className="success-estimates block-top">
                    <p className="success-estimates-lead">Your planning totals (same as above)</p>
                    <EstimateTierCards rows={submitSuccess.estimates_by_group} variant="compact" />
                  </div>
                ) : null}
                <p className="success-outro">{PUBLIC_WIZARD.submitFollowUp}</p>
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
