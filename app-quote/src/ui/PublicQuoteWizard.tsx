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
import { buildPublicLegacyCalculateBody, publicLegacyCalculatePayloadIssues } from "../lib/publicLegacyCalculatePayload";
import type { GuidedPiece, QuoteWorkflowMethod } from "../lib/quoteTypes";
import { round2, STANDARD_BACKSPLASH_HEIGHT_IN, STANDARD_COUNTER_DEPTH_IN } from "../lib/measurementEngine";
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
type SizeMethod = "sqft" | "cabinet_length" | "layout" | "upload";
type TriYes = "yes" | "no" | "unsure";
type CookStyle = "cooktop" | "freestanding" | "unsure";
type BacksplashIncl = "yes" | "no" | "unsure";
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

function branchDisplayIsGeneric(branch: string | undefined): boolean {
  const t = String(branch ?? "").trim();
  if (!t) return true;
  if (/^elite[\s_-]*team$/i.test(t)) return true;
  if (/^unknown$/i.test(t)) return true;
  return false;
}

function DetailQuestionCard({
  category,
  question,
  children
}: {
  category: string;
  question?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="detail-question-card">
      <p className="detail-question-card__category">{category}</p>
      {question ? <h3 className="detail-question-card__question">{question}</h3> : null}
      {children}
    </div>
  );
}

function TriYesSegments({ name, value, onChange }: { name: string; value: TriYes; onChange: (v: TriYes) => void }) {
  const opts: { id: TriYes; label: string }[] = [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
    { id: "unsure", label: "Not sure" }
  ];
  return (
    <div className="detail-segment-group">
      {opts.map((o) => (
        <label key={o.id} className={`detail-segment ${value === o.id ? "detail-segment--selected" : ""}`}>
          <input
            type="radio"
            name={name}
            value={o.id}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
            className="detail-segment-input"
          />
          <span className="detail-segment-label">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

function BacksplashSegments({
  name,
  value,
  onChange
}: {
  name: string;
  value: BacksplashIncl;
  onChange: (v: BacksplashIncl) => void;
}) {
  const opts: { id: BacksplashIncl; label: string }[] = [
    { id: "yes", label: "Yes, include it" },
    { id: "no", label: "No backsplash" },
    { id: "unsure", label: "Not sure" }
  ];
  return (
    <div className="detail-segment-group detail-segment-group--backsplash">
      {opts.map((o) => (
        <label key={o.id} className={`detail-segment ${value === o.id ? "detail-segment--selected" : ""}`}>
          <input
            type="radio"
            name={name}
            value={o.id}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
            className="detail-segment-input"
          />
          <span className="detail-segment-label">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

function CookAreaOptionCards({ name, value, onChange }: { name: string; value: CookStyle; onChange: (v: CookStyle) => void }) {
  const opts: { id: CookStyle; label: string }[] = [
    { id: "cooktop", label: "Cooktop in the countertop" },
    { id: "freestanding", label: "Freestanding stove/oven" },
    { id: "unsure", label: "Not sure" }
  ];
  return (
    <div className="detail-option-stack">
      {opts.map((o) => (
        <label key={o.id} className={`detail-option-card ${value === o.id ? "detail-option-card--selected" : ""}`}>
          <input
            type="radio"
            name={name}
            value={o.id}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
            className="detail-segment-input"
          />
          <span className="detail-option-card-label">{o.label}</span>
        </label>
      ))}
    </div>
  );
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
                <dt>{PUBLIC_WIZARD.tierCountertops}</dt>
                <dd>{formatMoney(row.countertop)}</dd>
              </div>
              <div className="estimate-tier-line">
                <dt>{PUBLIC_WIZARD.tierBacksplash}</dt>
                <dd>{formatMoney(row.backsplash)}</dd>
              </div>
              <div className="estimate-tier-line">
                <dt>{PUBLIC_WIZARD.tierExtras}</dt>
                <dd>{formatMoney(row.addons)}</dd>
              </div>
              <div className="estimate-tier-line estimate-tier-total">
                <dt>{PUBLIC_WIZARD.tierTotal}</dt>
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
  const [linearWallIn, setLinearWallIn] = useState("240");
  const [linearIslandLIn, setLinearIslandLIn] = useState("0");
  const [linearIslandWIn, setLinearIslandWIn] = useState("0");
  const [linearCounterDepthIn, setLinearCounterDepthIn] = useState(String(STANDARD_COUNTER_DEPTH_IN));

  const [guidedProjectPieces, setGuidedProjectPieces] = useState<GuidedPiece[]>(() => createDefaultRoom(MATERIAL_GROUP).guidedPieces);
  const [guidedPreset, setGuidedPreset] = useState<GuidedLayoutPreset | null>("straight");
  const [guidedSimpleForm, setGuidedSimpleForm] = useState<GuidedSimpleForm>(() => defaultGuidedSimpleForm());
  const [guidedUseAdvanced, setGuidedUseAdvanced] = useState(false);
  const [guidedAdvancedOpen, setGuidedAdvancedOpen] = useState(false);

  const [sinkAnswer, setSinkAnswer] = useState<TriYes>("yes");
  const [cookAnswer, setCookAnswer] = useState<CookStyle>("cooktop");
  const [backsplashChoice, setBacksplashChoice] = useState<BacksplashIncl>("yes");
  const [tearAnswer, setTearAnswer] = useState<TriYes>("no");
  const [specialtyTags, setSpecialtyTags] = useState<string[]>([]);

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
    const sh =
      backsplashChoice === "no"
        ? "0"
        : backsplashChoice === "yes"
          ? String(STANDARD_BACKSPLASH_HEIGHT_IN)
          : guidedSimpleForm.splashHeightIn || String(STANDARD_BACKSPLASH_HEIGHT_IN);
    return { ...guidedSimpleForm, splashHeightIn: sh };
  }, [guidedSimpleForm, backsplashChoice]);

  const buildGlobalAddOns = useCallback(() => {
    return {
      "qty-sink": sinkAnswer === "yes" ? 1 : 0,
      "qty-bar": 0,
      "qty-cook": cookAnswer === "cooktop" ? 1 : 0,
      "qty-outlet": 0,
      "qty-ss": 0,
      "qty-blanco": 0,
      tearout: tearAnswer === "yes" ? 1 : 0
    };
  }, [sinkAnswer, cookAnswer, tearAnswer]);

  const buildRoomDraftsForCalculate = useCallback(() => {
    if (quoteWorkflow === "guided_shape" && !guidedUseAdvanced) {
      const areas = computeGuidedSimpleAreas(guidedPreset, guidedFormEffective);
      const counter = areas.counter;
      const splash = areas.splash;
      return [createManualScopeRoom(MATERIAL_GROUP, counter, splash)];
    }
    const manualSplash =
      backsplashChoice === "no" ? 0 : quoteWorkflow === "manual_sqft" ? num(manualBs) : 0;
    return [
      syntheticRoomForWorkflow(
        quoteWorkflow,
        MATERIAL_GROUP,
        {
          counter: num(manualCt),
          splash: manualSplash
        },
        {
          wallFt: num(linearWallIn) / 12,
          splashIn: backsplashChoice === "no" ? 0 : STANDARD_BACKSPLASH_HEIGHT_IN,
          islandL: num(linearIslandLIn) / 12,
          islandW: num(linearIslandWIn) / 12,
          counterDepthIn: num(linearCounterDepthIn) || STANDARD_COUNTER_DEPTH_IN
        },
        guidedProjectPieces
      )
    ];
  }, [
    quoteWorkflow,
    manualCt,
    manualBs,
    linearWallIn,
    linearIslandLIn,
    linearIslandWIn,
    linearCounterDepthIn,
    guidedProjectPieces,
    guidedUseAdvanced,
    guidedPreset,
    guidedFormEffective,
    backsplashChoice
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

    const body = buildPublicLegacyCalculateBody({
      materialGroup: MATERIAL_GROUP,
      countertopSqft,
      backsplashSqft,
      addOns,
      retailMarkupPercent: 25,
      retailMethod: "Markup Percent",
      tearOut: tearAnswer === "yes",
      customer_name: customerName.trim() || undefined,
      customer_email: email.trim() || undefined,
      customer_phone: phone.trim() || undefined,
      project_type: projectType.trim() || undefined,
      project_address: projectAddress.trim() || undefined,
      city: city.trim() || undefined,
      state: stateUs.trim() || undefined,
      zip: zip.trim() || undefined
    });

    if (import.meta.env.DEV) {
      const issues = publicLegacyCalculatePayloadIssues(body as Record<string, unknown>);
      if (issues.length) {
        console.warn("[PublicQuoteWizard] calculate/submit payload:", issues);
      }
    }

    return body;
  }, [
    buildRoomDraftsForCalculate,
    buildGlobalAddOns,
    customerName,
    email,
    phone,
    projectType,
    projectAddress,
    city,
    stateUs,
    zip,
    tearAnswer
  ]);

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
  const canNextFrom3 = sizeMethod != null && sizeMethod !== "upload" && (sizeMethod !== "layout" || guidedPreset != null);
  const canNextFrom4 = true;

  const calcStatusNote = useMemo(() => {
    if (!groupEstimates?.length) return null;
    if (!usedFallback && calcReachability === "live") {
      return <p className="live-estimate-note">{PUBLIC_WIZARD.liveEstimate}</p>;
    }
    const browserOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (calcReachability === "preview_offline") {
      const msg = browserOffline ? PUBLIC_WIZARD.previewOfflineBrowser : PUBLIC_WIZARD.previewLiveUnavailable;
      return (
        <p className={`preview-estimate-note ${browserOffline ? "preview-estimate-note--offline" : ""}`}>{msg}</p>
      );
    }
    return <p className="preview-estimate-note">{PUBLIC_WIZARD.previewLiveUnavailable}</p>;
  }, [groupEstimates?.length, usedFallback, calcReachability]);

  const safeCalcWarnings = useMemo(() => sanitizeHomeownerWarnings(calcWarnings), [calcWarnings]);

  const plannerReviewNotes = useMemo(() => {
    const out: string[] = [];
    if (sinkAnswer === "unsure") {
      out.push("You were not sure about a kitchen sink opening — Elite will confirm what is needed.");
    }
    if (cookAnswer === "unsure") {
      out.push("You were not sure about a cooktop vs a freestanding stove — Elite will confirm what is needed.");
    }
    if (backsplashChoice === "unsure") {
      out.push("You were not sure about backsplash coverage — Elite will confirm your planning amount with you.");
    }
    if (tearAnswer === "unsure") {
      out.push("You were not sure whether existing countertops need removal — Elite will confirm on site.");
    }
    const specMap: Record<string, string> = {
      full_height: "You mentioned interest in a full-height backsplash.",
      waterfall: "You mentioned a waterfall edge.",
      extra_sink: "You mentioned an extra sink or a second sink area.",
      bar: "You mentioned a bar or beverage area.",
      other: "You noted other details for Elite to review."
    };
    for (const id of specialtyTags) {
      const line = specMap[id];
      if (line) out.push(line);
    }
    return out;
  }, [sinkAnswer, cookAnswer, backsplashChoice, tearAnswer, specialtyTags]);

  const displayWarnings = useMemo(
    () => [...plannerReviewNotes.map((w) => `${PUBLIC_WIZARD.plannerReviewPrefix} ${w}`), ...safeCalcWarnings],
    [plannerReviewNotes, safeCalcWarnings]
  );

  const toggleSpecialtyTag = useCallback((id: string) => {
    setSpecialtyTags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

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
            <div className="big-choice-grid big-choice-grid--size-methods">
              <button
                type="button"
                className={`big-choice-card big-choice-card--stack ${sizeMethod === "sqft" ? "on" : ""}`}
                onClick={() => setSizeMethod("sqft")}
              >
                <span className="bcc-title">{PUBLIC_WIZARD.sizeMethodSqftTitle}</span>
                <span className="bcc-desc">{PUBLIC_WIZARD.sizeMethodSqftDesc}</span>
              </button>
              <button
                type="button"
                className={`big-choice-card big-choice-card--stack ${sizeMethod === "cabinet_length" ? "on" : ""}`}
                onClick={() => setSizeMethod("cabinet_length")}
              >
                <span className="bcc-title">{PUBLIC_WIZARD.sizeMethodCabinetTitle}</span>
                <span className="bcc-desc">{PUBLIC_WIZARD.sizeMethodCabinetDesc}</span>
              </button>
              <button
                type="button"
                className={`big-choice-card big-choice-card--stack ${sizeMethod === "layout" ? "on" : ""}`}
                onClick={() => setSizeMethod("layout")}
              >
                <span className="bcc-title">{PUBLIC_WIZARD.sizeMethodLayoutTitle}</span>
                <span className="bcc-desc">{PUBLIC_WIZARD.sizeMethodLayoutDesc}</span>
              </button>
              <button
                type="button"
                className={`big-choice-card big-choice-card--stack big-choice-card--beta ${sizeMethod === "upload" ? "on" : ""}`}
                onClick={() => setSizeMethod("upload")}
              >
                <span className="bcc-badge">Coming soon</span>
                <span className="bcc-title">{PUBLIC_WIZARD.sizeMethodUploadTitle}</span>
                <span className="bcc-desc">{PUBLIC_WIZARD.sizeMethodUploadDesc}</span>
              </button>
            </div>

            {sizeMethod === "upload" ? (
              <div className="upload-coming-panel block-top" role="status">
                <h3 className="upload-coming-panel__title">{PUBLIC_WIZARD.uploadComingTitle}</h3>
                <p className="upload-coming-panel__body">{PUBLIC_WIZARD.uploadComingBody}</p>
              </div>
            ) : null}

            {sizeMethod === "sqft" ? (
              <div className="grid2 block-top">
                <label>
                  Countertop square footage (sq ft)
                  <input value={manualCt} onChange={(e) => setManualCt(e.target.value)} inputMode="decimal" placeholder="e.g. 45" />
                </label>
                <label>
                  Backsplash square footage (sq ft)
                  <input
                    value={manualBs}
                    onChange={(e) => setManualBs(e.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 12"
                    disabled={backsplashChoice === "no"}
                  />
                </label>
                <p className="muted small full-row">
                  You will confirm backsplash and other details on the next step. If you are not sure yet, your best guess is fine.
                </p>
              </div>
            ) : null}

            {sizeMethod === "cabinet_length" ? (
              <div className="grid2 block-top">
                <label>
                  Main run length (inches)
                  <input value={linearWallIn} onChange={(e) => setLinearWallIn(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Island length (inches, optional)
                  <input value={linearIslandLIn} onChange={(e) => setLinearIslandLIn(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Island depth (inches, optional)
                  <input value={linearIslandWIn} onChange={(e) => setLinearIslandWIn(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Countertop depth (inches)
                  <input value={linearCounterDepthIn} onChange={(e) => setLinearCounterDepthIn(e.target.value)} inputMode="decimal" />
                </label>
                <p className="muted small full-row">{PUBLIC_WIZARD.inchTipCabinet}</p>
                <p className="muted small full-row">
                  Backsplash height for estimating uses your answer on the next step (often 4 inches when you want a short backsplash).
                </p>
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
                  formForPreview={guidedFormEffective}
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

            <div className="step4-details">
              <DetailQuestionCard category="Kitchen sink" question="Will your countertop need a sink opening?">
                <TriYesSegments name="sinkAnswer" value={sinkAnswer} onChange={setSinkAnswer} />
              </DetailQuestionCard>

              <DetailQuestionCard category="Cooking area" question="Which one do you have?">
                <CookAreaOptionCards name="cookAnswer" value={cookAnswer} onChange={setCookAnswer} />
              </DetailQuestionCard>

              <DetailQuestionCard category="Backsplash" question="Should we include standard 4 inch backsplash?">
                <BacksplashSegments name="backsplashChoice" value={backsplashChoice} onChange={setBacksplashChoice} />
              </DetailQuestionCard>

              <DetailQuestionCard category="Removal" question="Do you need us to remove old countertops?">
                <TriYesSegments name="tearAnswer" value={tearAnswer} onChange={setTearAnswer} />
              </DetailQuestionCard>

              <DetailQuestionCard category="Anything else we should know?">
                <p className="detail-question-card__hint muted small">Tap any that apply. You can skip this.</p>
                <div className="specialty-chip-row">
                  {(
                    [
                      { id: "full_height", label: "Full-height backsplash" },
                      { id: "waterfall", label: "Waterfall side" },
                      { id: "extra_sink", label: "Extra sink" },
                      { id: "bar", label: "Bar / beverage area" },
                      { id: "other", label: "Other / not sure" }
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`specialty-chip ${specialtyTags.includes(opt.id) ? "on" : ""}`}
                      onClick={() => toggleSpecialtyTag(opt.id)}
                      aria-pressed={specialtyTags.includes(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </DetailQuestionCard>
            </div>

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
                {displayWarnings.length ? (
                  <ul className="wizard-warn-list">
                    {displayWarnings.map((w, i) => (
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
                {(() => {
                  const branchRaw = submitSuccess.branch_display?.trim() ?? "";
                  const repRaw = submitSuccess.sales_rep?.trim() ?? "";
                  const branchOk = branchRaw.length > 0 && !branchDisplayIsGeneric(branchRaw);
                  if (!branchOk && !repRaw) {
                    return <p className="success-team-fallback">{PUBLIC_WIZARD.successTeamGeneric}</p>;
                  }
                  return (
                    <div className="success-team">
                      <h4 className="success-team-heading">{PUBLIC_WIZARD.eliteContactHeading}</h4>
                      {branchOk ? <p className="success-team-line">{PUBLIC_WIZARD.eliteTeamLine(branchRaw)}</p> : null}
                      {repRaw ? <p className="success-team-line">{PUBLIC_WIZARD.eliteMemberLine(repRaw)}</p> : null}
                    </div>
                  );
                })()}
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
