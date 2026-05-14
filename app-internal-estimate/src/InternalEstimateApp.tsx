import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGetJson, apiPatchJson, apiPostJson, ApiError } from "@quote-lib/api";
import { config, EOS_LOGO_URL } from "@quote-lib/config";
import type { DemoCalculateResult } from "@quote-lib/demoFallback";
import { round2, STANDARD_BACKSPLASH_HEIGHT_IN } from "@quote-lib/measurementEngine";
import {
  CONFIDENCE_COPY,
  computeGuidedSimpleAreas,
  defaultGuidedSimpleForm,
  type GuidedLayoutPreset,
  type GuidedSimpleForm
} from "@quote-lib/guidedHomeowner";
import {
  aggregateComparisonScope,
  buildMaterialGroupComparison,
  calculateAllRoomDrafts,
  createDefaultRoom,
  createManualScopeRoom,
  roomsNeedLocalVanityMath,
  runLocalPrototypeQuote,
  serializeRoomsForApi,
  sumGlobalAddOns,
  syntheticRoomForWorkflow
} from "@quote-lib/prototypeQuoteMath";
import type { MaterialGroupComparisonRow } from "@quote-lib/prototypeQuoteMath";
import type { GuidedPiece, MathCheckSnapshot, QuoteWorkflowMethod, RoomDraft } from "@quote-lib/quoteTypes";
import { getSupabase } from "./lib/supabase";
import RoomScopeBuilder from "@quote-ui/RoomScopeBuilder";
import InternalGuidedShapePreview from "./InternalGuidedShapePreview";

const MATERIAL_GROUPS = [
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F"
];

const GUIDED_PRESET_CARDS: Array<{ id: GuidedLayoutPreset; title: string }> = [
  { id: "straight", title: "Straight run" },
  { id: "l_shape", title: "L-shape" },
  { id: "u_shape", title: "U-shape" },
  { id: "galley", title: "Galley" },
  { id: "island", title: "Island only" },
  { id: "not_sure", title: "I'm not sure" }
];

const INTERNAL_SALES_REPS = ["Casey", "Thera", "MJ", "House", "Direct"] as const;
const INTERNAL_BRANCHES = ["Dyersville", "Lisbon", "Iowa City"] as const;

type CustomPassRow = { id: string; description: string; price: string; qty: string };

type ApiPartnerResult = {
  ok?: boolean;
  totals?: { wholesale?: number; retail?: number; profit?: number; estimated_sqft?: number };
  snapshot?: {
    lineItems?: Array<Record<string, unknown>>;
    pricingStructure?: Record<string, unknown>;
  };
  warnings?: string[];
};

function num(v: string): number {
  const n = Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function workflowLabel(wf: QuoteWorkflowMethod): string {
  const labels: Record<QuoteWorkflowMethod, string> = {
    manual_sqft: "Manual Sq Ft",
    rapid_linear: "Rapid Linear Foot",
    guided_shape: "Guided Shape",
    room_by_room: "Room-by-room / advanced",
    upload_plans: "Upload plans / AI takeoff",
    visualize: "Visualize"
  };
  return labels[wf];
}

function localRunToDemo(r: ReturnType<typeof runLocalPrototypeQuote>): DemoCalculateResult {
  return {
    usedFallback: true,
    fallbackLabel: r.fallbackLabel,
    materialGroup: r.materialGroup,
    estimated_sqft: r.estimated_sqft,
    retail: r.retail,
    wholesale: r.wholesale,
    profit: r.profit,
    lineItems: r.lineItems,
    addOnsSummary: r.addOnsSummary,
    warnings: r.warnings,
    confidence: r.confidence,
    reviewNeeded: r.reviewNeeded
  };
}

export default function InternalEstimateApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [quoteWorkflow, setQuoteWorkflow] = useState<QuoteWorkflowMethod>("manual_sqft");
  const [materialGroup, setMaterialGroup] = useState("Group Promo");
  const [roomDrafts, setRoomDrafts] = useState<RoomDraft[]>(() => [createDefaultRoom("Group Promo")]);

  const [manualCt, setManualCt] = useState("45");
  const [manualBs, setManualBs] = useState("12");
  const [linearWall, setLinearWall] = useState("20");
  const [linearSplashIn, setLinearSplashIn] = useState(String(STANDARD_BACKSPLASH_HEIGHT_IN));
  const [linearIslandL, setLinearIslandL] = useState("0");
  const [linearIslandW, setLinearIslandW] = useState("0");
  const [guidedProjectPieces, setGuidedProjectPieces] = useState<GuidedPiece[]>(() => createDefaultRoom("Group Promo").guidedPieces);
  const [guidedPreset, setGuidedPreset] = useState<GuidedLayoutPreset | null>(null);
  const [guidedSimpleForm, setGuidedSimpleForm] = useState<GuidedSimpleForm>(() => defaultGuidedSimpleForm());
  const [guidedUseAdvanced, setGuidedUseAdvanced] = useState(false);
  const [guidedAdvancedOpen, setGuidedAdvancedOpen] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [projectType, setProjectType] = useState("Kitchen");
  const [branch, setBranch] = useState("Dyersville");
  const [salesRep, setSalesRep] = useState("");
  const [projectName, setProjectName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [enteredBy, setEnteredBy] = useState("");
  const [internalPricingMode, setInternalPricingMode] = useState<"direct" | "wholesale">("wholesale");
  const [customItems, setCustomItems] = useState<CustomPassRow[]>([]);
  const [quoteLibrary, setQuoteLibrary] = useState<Array<Record<string, unknown>>>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [sink, setSink] = useState("1");
  const [bar, setBar] = useState("0");
  const [cook, setCook] = useState("1");
  const [outlet, setOutlet] = useState("0");
  const [ss, setSs] = useState("0");
  const [blanco, setBlanco] = useState("0");
  const [tearYes, setTearYes] = useState(false);
  const [partnerRetailPct, setPartnerRetailPct] = useState("20");
  const [partnerRetailMethod, setPartnerRetailMethod] = useState("Markup Percent");

  const [calcBusy, setCalcBusy] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [vanityLocalNote, setVanityLocalNote] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [demoResult, setDemoResult] = useState<DemoCalculateResult | null>(null);
  const [apiPartner, setApiPartner] = useState<ApiPartnerResult | null>(null);
  const [localMathCheck, setLocalMathCheck] = useState<MathCheckSnapshot | null>(null);
  const [localMatrix, setLocalMatrix] = useState<ReturnType<typeof runLocalPrototypeQuote>["allGroupMatrix"] | null>(null);
  const [comparisonRows, setComparisonRows] = useState<MaterialGroupComparisonRow[] | null>(null);
  const [comparisonMixedNote, setComparisonMixedNote] = useState<string | null>(null);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitPreview, setSubmitPreview] = useState<string | null>(null);

  const liveApi = Boolean(sessionToken);
  const lastCalcLive = !usedFallback && apiPartner != null;

  useEffect(() => {
    setQuoteWorkflow("manual_sqft");
    setRoomDrafts((prev) => (prev.length ? prev : [createDefaultRoom("Group Promo")]));
  }, []);

  useEffect(() => {
    setGuidedAdvancedOpen(true);
  }, []);

  useEffect(() => {
    if (quoteWorkflow === "rapid_linear") {
      setQuoteWorkflow("manual_sqft");
    }
  }, [quoteWorkflow]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Demo only — add Supabase URL and anon key to your environment to enable sign-in.");
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword
      });
      if (error) throw error;
      const tok = data.session?.access_token;
      if (!tok) throw new Error("No access token returned");
      setSessionToken(tok);
      setAuthPassword("");
    } catch (e: unknown) {
      setAuthError(String((e as Error)?.message || e));
    } finally {
      setAuthBusy(false);
    }
  }, [authEmail, authPassword, supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSessionToken(null);
  }, [supabase]);

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

  const buildRoomDraftsForCalculate = useCallback((): RoomDraft[] => {
    if (quoteWorkflow === "room_by_room") return roomDrafts;
    if (quoteWorkflow === "upload_plans" || quoteWorkflow === "visualize") return [];
    if (quoteWorkflow === "guided_shape" && !guidedUseAdvanced) {
      const areas = computeGuidedSimpleAreas(guidedPreset, guidedSimpleForm);
      return [createManualScopeRoom(materialGroup, areas.counter, areas.splash)];
    }
    return [
      syntheticRoomForWorkflow(
        quoteWorkflow,
        materialGroup,
        { counter: num(manualCt), splash: num(manualBs) },
        {
          wallFt: num(linearWall),
          splashIn: num(linearSplashIn),
          islandL: num(linearIslandL),
          islandW: num(linearIslandW)
        },
        guidedProjectPieces
      )
    ];
  }, [
    quoteWorkflow,
    roomDrafts,
    materialGroup,
    manualCt,
    manualBs,
    linearWall,
    linearSplashIn,
    linearIslandL,
    linearIslandW,
    guidedProjectPieces,
    guidedUseAdvanced,
    guidedPreset,
    guidedSimpleForm
  ]);

  const commitComparisonFromDrafts = useCallback(
    (drafts: RoomDraft[]) => {
      if (!drafts.length || quoteWorkflow === "upload_plans" || quoteWorkflow === "visualize") {
        setComparisonRows(null);
        setComparisonMixedNote(null);
        return;
      }
      const ag = aggregateComparisonScope(drafts, projectType);
      const globalAddon = quoteWorkflow === "room_by_room" ? 0 : sumGlobalAddOns(buildGlobalAddOns()).total;
      const addonForTable = round2(ag.addonDollars + globalAddon);
      setComparisonRows(
        buildMaterialGroupComparison({
          countertopSqft: ag.countertopSqft,
          backsplashSqft: ag.backsplashSqft,
          addonDollars: addonForTable,
          partnerRetailPercent: num(partnerRetailPct),
          partnerRetailMethod
        })
      );
      setComparisonMixedNote(ag.mixedGroupNote);
    },
    [quoteWorkflow, projectType, buildGlobalAddOns, partnerRetailPct, partnerRetailMethod]
  );

  const buildCalcPayload = useCallback(() => {
    const drafts = buildRoomDraftsForCalculate();
    const apiRooms = serializeRoomsForApi(drafts);
    const addOns = quoteWorkflow === "room_by_room" ? {} : buildGlobalAddOns();
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
    const customPassthroughItems = customItems
      .map((row) => ({
        description: row.description.trim(),
        price: num(row.price),
        qty: num(row.qty) || 1
      }))
      .filter((row) => row.description.length > 0 && row.price > 0);
    return {
      quoteSource: "internal_quote",
      materialGroup,
      internalMaterialBasis: internalPricingMode,
      customPassthroughItems,
      quote_workflow: quoteWorkflow,
      areas: { countertopSqft, backsplashSqft },
      addOns,
      engine,
      rooms: apiRooms,
      retailMarkupPercent: num(partnerRetailPct),
      retailMethod: partnerRetailMethod,
      customer_name: customerName.trim() || undefined,
      customer_email: email.trim() || undefined,
      customer_phone: phone.trim() || undefined,
      project_type: projectType.trim() || undefined,
      project_name: projectName.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      branch: branch.trim() || undefined,
      sales_rep: salesRep.trim() || undefined,
      entered_by: enteredBy.trim() || undefined
    };
  }, [
    buildRoomDraftsForCalculate,
    quoteWorkflow,
    buildGlobalAddOns,
    materialGroup,
    partnerRetailPct,
    partnerRetailMethod,
    customerName,
    email,
    phone,
    projectType,
    branch,
    salesRep,
    customItems,
    internalPricingMode,
    projectName,
    city,
    state,
    enteredBy
  ]);

  const runLocalFromDrafts = useCallback(() => {
    const drafts = buildRoomDraftsForCalculate();
    const wf = workflowLabel(quoteWorkflow);
    const lr = runLocalPrototypeQuote({
      quoteMode: "partner",
      partnerRetailPercent: num(partnerRetailPct),
      partnerRetailMethod,
      materialGroupTop: materialGroup,
      roomDrafts: drafts,
      globalAddOns: buildGlobalAddOns(),
      applyGlobalAddOns: quoteWorkflow !== "room_by_room",
      workflowLabel: wf,
      projectType
    });
    setUsedFallback(true);
    setApiPartner(null);
    setDemoResult(localRunToDemo(lr));
    setLocalMathCheck(lr.mathCheck);
    setLocalMatrix(lr.allGroupMatrix);
    commitComparisonFromDrafts(drafts);
  }, [
    buildRoomDraftsForCalculate,
    quoteWorkflow,
    partnerRetailPct,
    partnerRetailMethod,
    materialGroup,
    buildGlobalAddOns,
    projectType,
    commitComparisonFromDrafts
  ]);

  const handleCalculate = useCallback(async () => {
    setCalcBusy(true);
    setCalcError(null);
    setDemoResult(null);
    setApiPartner(null);
    setUsedFallback(false);
    setLocalMathCheck(null);
    setLocalMatrix(null);
    setComparisonRows(null);
    setComparisonMixedNote(null);
    setVanityLocalNote(null);

    if (quoteWorkflow === "upload_plans" || quoteWorkflow === "visualize") {
      setCalcError("This measurement path is coming soon — pick another option to calculate.");
      setCalcBusy(false);
      return;
    }

    const drafts = buildRoomDraftsForCalculate();
    const needsVanityLocal = roomsNeedLocalVanityMath(drafts);

    if (needsVanityLocal) {
      setVanityLocalNote("Vanity program pricing uses local prototype math until the live API mirrors the full room engine.");
      runLocalFromDrafts();
      setCalcBusy(false);
      return;
    }

    if (!sessionToken) {
      runLocalFromDrafts();
      setCalcBusy(false);
      return;
    }

    const payload = buildCalcPayload();

    try {
      const raw = (await apiPostJson("/api/internal-quotes/calculate", sessionToken, payload)) as Record<string, unknown>;
      if (raw.ok === true) {
        setApiPartner(raw as ApiPartnerResult);
        setUsedFallback(false);
        commitComparisonFromDrafts(drafts);
        setCalcBusy(false);
        return;
      }
      runLocalFromDrafts();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown> | null;
        const installed = body && body.installed === false;
        if (e.status === 503 || installed || e.status === 0 || e.status >= 500) {
          runLocalFromDrafts();
          setCalcBusy(false);
          return;
        }
        if (e.status === 401) {
          runLocalFromDrafts();
          setCalcBusy(false);
          return;
        }
        setCalcError(e.message);
        setCalcBusy(false);
        return;
      }
      runLocalFromDrafts();
    }
    setCalcBusy(false);
  }, [sessionToken, buildCalcPayload, buildRoomDraftsForCalculate, runLocalFromDrafts, quoteWorkflow, commitComparisonFromDrafts]);

  const buildSubmitPayload = useCallback(() => {
    return {
      ...buildCalcPayload(),
      customer_name: customerName.trim() || null,
      customer_email: email.trim() || null,
      customer_phone: phone.trim() || null,
      project_type: projectType.trim() || null,
      project_name: projectName.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      branch: branch.trim() || null,
      sales_rep: salesRep.trim() || null,
      entered_by: enteredBy.trim() || null,
      quote_status: "testing_review"
    };
  }, [buildCalcPayload, customerName, email, phone, projectType, projectName, city, state, branch, salesRep, enteredBy]);

  const refreshLibrary = useCallback(async () => {
    if (!sessionToken) {
      setQuoteLibrary([]);
      return;
    }
    setLibraryBusy(true);
    setLibraryError(null);
    try {
      const raw = (await apiGetJson("/api/internal-quotes", sessionToken)) as { quotes?: unknown[] };
      setQuoteLibrary(Array.isArray(raw.quotes) ? (raw.quotes as Array<Record<string, unknown>>) : []);
    } catch (e: unknown) {
      setLibraryError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLibraryBusy(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const handleSubmit = useCallback(async () => {
    setSubmitBusy(true);
    setSubmitMsg(null);
    setSubmitPreview(null);
    const payload = buildSubmitPayload();

    try {
      if (!sessionToken) {
        setSubmitMsg("Sign in to save an internal quote to eliteOS. Below is a preview of the data we would send — nothing is stored yet.");
        setSubmitPreview(JSON.stringify({ ...payload, _demo: true }, null, 2));
        return;
      }

      const raw = (await apiPostJson("/api/internal-quotes/save", sessionToken, payload)) as Record<string, unknown>;
      if (raw.ok === true) {
        const qn = String(raw.quote_number ?? raw.quoteNumber ?? "");
        setSubmitMsg(qn ? `Saved to quote library. Reference: ${qn}` : "Saved to quote library.");
        setSubmitPreview(JSON.stringify(raw, null, 2));
        if (Array.isArray(raw.warnings) && raw.warnings.length) {
          setSubmitMsg((prev) => `${prev} ${(raw.warnings as string[]).join(" ")}`);
        }
        void refreshLibrary();
      } else {
        setSubmitMsg(String(raw.error || "Something went wrong"));
        setSubmitPreview(JSON.stringify(raw, null, 2));
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown> | string | null;
        let parsed: Record<string, unknown> | null = null;
        if (body && typeof body === "object") parsed = body as Record<string, unknown>;
        const installed = parsed?.installed === false;
        if (e.status === 503 || installed) {
          setSubmitMsg("Quote storage isn’t set up in this environment yet. Here’s a preview of what we would save.");
          setSubmitPreview(JSON.stringify({ request: payload, error: body }, null, 2));
          return;
        }
        setSubmitMsg(e.message);
        setSubmitPreview(JSON.stringify({ request: payload, error: body ?? e.message }, null, 2));
        return;
      }
      setSubmitMsg(String(e));
    } finally {
      setSubmitBusy(false);
    }
  }, [sessionToken, buildSubmitPayload, refreshLibrary]);

  const backendHint = config.backendBaseUrl;
  const hasInternalSummary = apiPartner?.totals != null || demoResult != null;

  const partWholesale = apiPartner?.totals?.wholesale ?? demoResult?.wholesale;
  const partRetail = apiPartner?.totals?.retail ?? demoResult?.retail;
  const partSqft = apiPartner?.totals?.estimated_sqft ?? demoResult?.estimated_sqft;
  const partProfit =
    partRetail != null && partWholesale != null ? round2(Number(partRetail) - Number(partWholesale)) : null;

  const hasCalcResult = hasInternalSummary;

  const scopePreview = useMemo(() => {
    const drafts = buildRoomDraftsForCalculate();
    if (!drafts.length) {
      return {
        empty: true as const,
        method: workflowLabel(quoteWorkflow),
        totalSf: 0,
        counterSf: 0,
        splashSf: 0,
        fhbSf: 0
      };
    }
    const { totals } = calculateAllRoomDrafts(drafts, projectType);
    const totalSf = round2(totals.counter + totals.splash + totals.fhb);
    return {
      empty: false as const,
      method: workflowLabel(quoteWorkflow),
      totalSf,
      counterSf: totals.counter,
      splashSf: totals.splash,
      fhbSf: totals.fhb
    };
  }, [buildRoomDraftsForCalculate, quoteWorkflow, projectType]);

  const guidedPreview = useMemo(() => {
    if (quoteWorkflow !== "guided_shape") return null;
    if (guidedUseAdvanced) {
      const d: RoomDraft[] = [
        syntheticRoomForWorkflow(
          "guided_shape",
          materialGroup,
          { counter: 0, splash: 0 },
          { wallFt: 0, splashIn: STANDARD_BACKSPLASH_HEIGHT_IN, islandL: 0, islandW: 0 },
          guidedProjectPieces
        )
      ];
      const { rooms } = calculateAllRoomDrafts(d, projectType);
      const m = rooms[0];
      return {
        counter: m.counter,
        splash: m.splash,
        total: m.totalSf,
        lines: m.details,
        confidence: CONFIDENCE_COPY
      };
    }
    const a = computeGuidedSimpleAreas(guidedPreset, guidedSimpleForm);
    return {
      counter: a.counter,
      splash: a.splash,
      total: round2(a.counter + a.splash + a.fhb),
      lines: a.lines,
      confidence: CONFIDENCE_COPY
    };
  }, [
    quoteWorkflow,
    guidedUseAdvanced,
    guidedPreset,
    guidedSimpleForm,
    materialGroup,
    guidedProjectPieces,
    projectType
  ]);

  const methodCards = useMemo(() => {
    const all = [
      { id: "guided_shape" as const, title: "Help me lay it out", sub: "Guided shapes & presets — great when you have rough dimensions." },
      { id: "manual_sqft" as const, title: "I know my square footage", sub: "Fastest if you already have countertop and backsplash sf." },
      { id: "rapid_linear" as const, title: "I know my cabinet runs", sub: "Wall cabinets in linear feet + optional island." },
      { id: "room_by_room" as const, title: "Room-by-room / advanced", sub: "Multiple rooms, materials, and add-ons like the ESF prototype." },
      { id: "upload_plans" as const, title: "Upload plans / AI takeoff", sub: "Coming soon — upload drawings and let eliteOS prepare measurements for review." },
      { id: "visualize" as const, title: "Visualize", sub: "Coming soon — build a simple kitchen layout tied directly to your quote." }
    ] as const;
    const filtered = all.filter((c) => c.id !== "rapid_linear");
    return filtered.map((c) => ({ ...c, disabled: c.id === "upload_plans" || c.id === "visualize" }));
  }, []);

  const quoteLibraryUrl = useMemo(() => {
    const raw = String(import.meta.env.VITE_HEAD_URL_QUOTE_LIBRARY ?? "").trim();
    return raw.replace(/\/+$/, "") || "https://quotes.eliteosfab.com";
  }, []);

  const [urlQuoteId, setUrlQuoteId] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("quoteId");
    if (q && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q)) {
      setUrlQuoteId(q);
    }
  }, []);

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-brand">
          <img className="logo" src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
          <div className="hero-titles">
            <h1 className="title">Internal estimate</h1>
            <p className="subtitle">Staff-only measurement and pricing</p>
            <p className="hero-tagline">
              eliteOS Internal Estimate Head — Direct / Wholesale economics, not for homeowner-facing use.
            </p>
          </div>
        </div>
        <div className="hero-badges">
          <span className="badge badge-demo">Staff tool</span>
          <span className="badge badge-preview">Preview · Not production</span>
        </div>
      </header>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <a className="btn secondary" href={`${quoteLibraryUrl}/`} target="_blank" rel="noreferrer">
              Open Quote Library
            </a>
            <span className="muted" style={{ marginLeft: 12 }}>
              Search quotes by account, status, and handoff (new tab).
            </span>
          </div>
        </div>
        {urlQuoteId ? (
          <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
            <strong>quoteId in URL:</strong> {urlQuoteId}. Internal Estimate quoteId hydration is not complete yet — use Quote Library for
            read-only detail or continue in this workspace manually.
          </p>
        ) : null}
      </div>

      <div className="status-strip">
        <p className="status-strip-main">
          {liveApi ? (
            <>
              <span className="pill pill-live">Live API</span> Signed in — calculations use eliteOS when available.
            </>
          ) : (
            <>
              <span className="pill pill-demo">Demo mode active</span> Sample quotes run in your browser until you sign in.
            </>
          )}
        </p>
        <p className="status-strip-sub">
          {liveApi
            ? "Live quote saving and tracking use your configured eliteOS Brain / Supabase project."
            : "This preview can calculate sample quotes locally. Live quote saving and tracking will connect to eliteOS Brain / Supabase when production is configured."}
        </p>
        <p className="status-strip-meta" aria-label="Backend base URL">
          {backendHint}
        </p>
      </div>

      <div className="layout">
        <div className="main-col">
          <section className="card prototype-scope-banner">
            <h2>eliteOS Internal Estimate Head</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              This app is separate from the <strong>public quote</strong> at <code>quote.eliteosfab.com</code>. It uses{" "}
              <code>/api/internal-quotes/*</code> with Supabase auth and quote-head access on the backend. See{" "}
              <code>docs/quote-platform/quote-heads-split-plan.md</code>.
            </p>
          </section>
          {supabase ? (
            <section className="card">
              <h2>Account</h2>
              <p className="muted">Sign in to run live internal calculations and save quotes to the internal library.</p>
              {sessionToken ? (
                <div className="row">
                  <span className="pill pill-live">Signed in</span>
                  <button type="button" className="btn secondary" onClick={() => void signOut()}>
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="grid2">
                  <label>
                    Email
                    <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoComplete="username" />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </label>
                  <button type="button" className="btn primary" disabled={authBusy} onClick={() => void signIn()}>
                    {authBusy ? "Signing in…" : "Sign in"}
                  </button>
                </div>
              )}
              {authError ? <p className="error">{authError}</p> : null}
            </section>
          ) : (
            <section className="card">
              <h2>Demo mode active</h2>
              <p className="muted">
                This preview can calculate sample quotes locally. Live quote saving and tracking will connect to eliteOS
                Brain / Supabase when production is configured.
              </p>
            </section>
          )}

          {sessionToken ? (
            <section className="card">
              <h2>Internal quote library</h2>
              <p className="muted small">
                eliteOS Brain — <code>quote_source: internal_quote</code>. Reps/branches are short-term hardcoded; later
                admin-configurable.
              </p>
              {libraryError ? <p className="error">{libraryError}</p> : null}
              {libraryBusy ? <p className="muted">Loading…</p> : null}
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>Quote #</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>Customer</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>Project</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>Branch</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>Rep</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>Status</th>
                      <th style={{ textAlign: "right", padding: "6px 8px" }}>Total</th>
                      <th style={{ padding: "6px 8px" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {quoteLibrary.map((q) => (
                      <tr key={String(q.id)}>
                        <td style={{ padding: "6px 8px" }}>{String(q.quote_number ?? "")}</td>
                        <td style={{ padding: "6px 8px" }}>{String(q.customer_name ?? "")}</td>
                        <td style={{ padding: "6px 8px" }}>{String(q.project_name ?? "")}</td>
                        <td style={{ padding: "6px 8px" }}>{String(q.branch ?? "")}</td>
                        <td style={{ padding: "6px 8px" }}>{String(q.sales_rep ?? "")}</td>
                        <td style={{ padding: "6px 8px" }}>{String(q.quote_status ?? "")}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>
                          {q.grand_total != null ? `$${Number(q.grand_total).toFixed(2)}` : ""}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => {
                              void (async () => {
                                try {
                                  const raw = (await apiGetJson(`/api/internal-quotes/${String(q.id)}`, sessionToken)) as Record<
                                    string,
                                    unknown
                                  >;
                                  setSubmitMsg(`Opened quote ${String(q.quote_number ?? "")} — snapshot in preview.`);
                                  setSubmitPreview(JSON.stringify(raw, null, 2));
                                } catch (e: unknown) {
                                  setSubmitMsg(e instanceof ApiError ? e.message : String(e));
                                }
                              })();
                            }}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!libraryBusy && quoteLibrary.length === 0 ? (
                <p className="muted small" style={{ marginTop: 8 }}>
                  No saved internal quotes yet.
                </p>
              ) : null}
              <button type="button" className="btn secondary" style={{ marginTop: 10 }} onClick={() => void refreshLibrary()}>
                Refresh list
              </button>
            </section>
          ) : null}

          <section className="card">
            <p className="callout internal">
              <strong>Internal only</strong> — Direct / Wholesale material pricing for ESF staff. Monday sync uses{" "}
              <code>MONDAY_INTERNAL_*</code> configuration only; do not use public board settings here.
            </p>
          </section>

          <section className="card">
            <h2>How would you like to measure your project?</h2>
            <p className="muted">
              Default is manual square footage for preliminary estimates. Guided shape is available as a secondary path; rapid
              linear foot is not offered in this head.
            </p>
            <div className="quote-method-grid">
              {methodCards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={c.disabled}
                  className={`quote-method-card ${quoteWorkflow === c.id ? "on" : ""} ${c.disabled ? "disabled" : ""}`}
                  onClick={() => !c.disabled && setQuoteWorkflow(c.id)}
                >
                  <span className="qmc-title">{c.title}</span>
                  <span className="qmc-sub">{c.sub}</span>
                  {c.disabled ? <span className="qmc-badge">Soon</span> : null}
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Customer &amp; project</h2>
            <div className="grid3">
              <label>
                Customer name
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Jane Homeowner" />
              </label>
              <label>
                Project name
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Smith kitchen" />
              </label>
              <label>
                Project type
                <input value={projectType} onChange={(e) => setProjectType(e.target.value)} />
              </label>
              <label>
                City
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dyersville" />
              </label>
              <label>
                State
                <input value={state} onChange={(e) => setState(e.target.value)} placeholder="IA" />
              </label>
              <label>
                Phone
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="563-555-0100" />
              </label>
              <label>
                Email
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
              </label>
              <label>
                Entered by
                <input value={enteredBy} onChange={(e) => setEnteredBy(e.target.value)} placeholder="Staff name" />
              </label>
              <label>
                Branch
                <select value={branch} onChange={(e) => setBranch(e.target.value)}>
                  {INTERNAL_BRANCHES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sales rep
                <select value={salesRep} onChange={(e) => setSalesRep(e.target.value)}>
                  <option value="">—</option>
                  {INTERNAL_SALES_REPS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Scope and materials</h2>
            <div className="grid3" style={{ marginBottom: 14 }}>
              <label>
                Internal material pricing
                <select
                  value={internalPricingMode}
                  onChange={(e) => setInternalPricingMode(e.target.value === "direct" ? "direct" : "wholesale")}
                >
                  <option value="wholesale">Wholesale (prototype tiers)</option>
                  <option value="direct">Direct (ESF Direct $/sf)</option>
                </select>
              </label>
              <label>
                Primary material group (single-flow and defaults)
                <select value={materialGroup} onChange={(e) => setMaterialGroup(e.target.value)}>
                  {MATERIAL_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {quoteWorkflow === "room_by_room" ? (
              <RoomScopeBuilder rooms={roomDrafts} onRoomsChange={setRoomDrafts} materialGroups={MATERIAL_GROUPS} />
            ) : null}

            {quoteWorkflow === "manual_sqft" ? (
              <div className="grid3">
                <label>
                  Countertop sq ft
                  <input value={manualCt} onChange={(e) => setManualCt(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Backsplash sq ft
                  <input value={manualBs} onChange={(e) => setManualBs(e.target.value)} inputMode="decimal" />
                </label>
              </div>
            ) : null}

            {quoteWorkflow === "rapid_linear" ? (
              <div className="grid3">
                <p className="muted small" style={{ gridColumn: "1 / -1" }}>
                  Wall cabinets in linear feet; depth fixed at 25.5″ (2.125 ft). Backsplash height in inches. Island in feet.
                </p>
                <label>
                  Wall cabinets LF
                  <input value={linearWall} onChange={(e) => setLinearWall(e.target.value)} />
                </label>
                <label>
                  Backsplash height (in)
                  <input value={linearSplashIn} onChange={(e) => setLinearSplashIn(e.target.value)} />
                </label>
                <label>
                  Island length (in)
                  <input value={linearIslandL} onChange={(e) => setLinearIslandL(e.target.value)} />
                </label>
                <label>
                  Island width (in)
                  <input value={linearIslandW} onChange={(e) => setLinearIslandW(e.target.value)} />
                </label>
              </div>
            ) : null}

            {quoteWorkflow === "guided_shape" ? (
              <div className="guided-layout">
                <p className="muted small">
                  Start with a simple layout. Use the advanced section only if you want to model each piece like the full ESF
                  prototype.
                </p>

                <h3 className="h3 guided-preset-heading">Pick the shape that looks closest to your project</h3>
                <div className="preset-card-grid">
                  {GUIDED_PRESET_CARDS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`preset-shape-card ${guidedPreset === c.id ? "on" : ""}`}
                      onClick={() => setGuidedPreset(c.id)}
                    >
                      {c.title}
                    </button>
                  ))}
                </div>

                {guidedPreset === "not_sure" ? (
                  <p className="callout guided-not-sure">
                    No problem. Enter your best guess or use the square-foot option. Elite can help verify it later.
                  </p>
                ) : null}

                {guidedPreset && guidedPreset !== "not_sure" ? (
                  <div className="guided-simple-fields">
                    {guidedPreset === "straight" ? (
                      <div className="grid3">
                        <label>
                          Main counter length (in)
                          <input
                            value={guidedSimpleForm.mainRunIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, mainRunIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Backsplash height (in)
                          <input
                            value={guidedSimpleForm.splashHeightIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, splashHeightIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Counter depth (in)
                          <input
                            value={guidedSimpleForm.counterDepthIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, counterDepthIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                      </div>
                    ) : null}

                    {guidedPreset === "l_shape" ? (
                      <div className="grid3">
                        <label>
                          Long wall length (in)
                          <input
                            value={guidedSimpleForm.longWallIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, longWallIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Short wall length (in)
                          <input
                            value={guidedSimpleForm.shortWallIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, shortWallIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Backsplash height (in)
                          <input
                            value={guidedSimpleForm.splashHeightIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, splashHeightIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Counter depth (in)
                          <input
                            value={guidedSimpleForm.counterDepthIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, counterDepthIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                      </div>
                    ) : null}

                    {guidedPreset === "u_shape" ? (
                      <div className="grid3">
                        <label>
                          Back wall length (in)
                          <input
                            value={guidedSimpleForm.backWallIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, backWallIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Left side length (in)
                          <input
                            value={guidedSimpleForm.leftWallIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, leftWallIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Right side length (in)
                          <input
                            value={guidedSimpleForm.rightWallIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, rightWallIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Backsplash height (in)
                          <input
                            value={guidedSimpleForm.splashHeightIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, splashHeightIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Counter depth (in)
                          <input
                            value={guidedSimpleForm.counterDepthIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, counterDepthIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                      </div>
                    ) : null}

                    {guidedPreset === "galley" ? (
                      <div className="grid3">
                        <label>
                          Side 1 length (in)
                          <input
                            value={guidedSimpleForm.side1In}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, side1In: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Side 2 length (in)
                          <input
                            value={guidedSimpleForm.side2In}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, side2In: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Backsplash height (in)
                          <input
                            value={guidedSimpleForm.splashHeightIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, splashHeightIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Counter depth (in)
                          <input
                            value={guidedSimpleForm.counterDepthIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, counterDepthIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                      </div>
                    ) : null}

                    {guidedPreset === "island" ? (
                      <div className="grid3">
                        <label>
                          Island length (in)
                          <input
                            value={guidedSimpleForm.islandLengthIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, islandLengthIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                        <label>
                          Island width (in)
                          <input
                            value={guidedSimpleForm.islandWidthIn}
                            onChange={(e) => setGuidedSimpleForm((f) => ({ ...f, islandWidthIn: e.target.value }))}
                            inputMode="decimal"
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {guidedPreview ? (
                  <div className="measure-preview-card">
                    <h4 className="measure-preview-title">Measurement preview</h4>
                    <div className="measure-preview-metrics">
                      <div>
                        <span className="muted small">Estimated countertop sq ft</span>
                        <strong>{guidedPreview.counter.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span className="muted small">Estimated backsplash sq ft</span>
                        <strong>{guidedPreview.splash.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span className="muted small">Estimated total sq ft</span>
                        <strong>{guidedPreview.total.toFixed(2)}</strong>
                      </div>
                    </div>
                    {guidedPreview.lines.length ? (
                      <ul className="measure-preview-lines">
                        {guidedPreview.lines.map((ln, i) => (
                          <li key={i}>{ln}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted small">Enter dimensions to see a plain-language summary of how we estimated area.</p>
                    )}
                    <p className="confidence-label">{guidedPreview.confidence}</p>
                  </div>
                ) : null}

                {guidedPreview && quoteWorkflow === "guided_shape" && guidedUseAdvanced ? (
                  <InternalGuidedShapePreview
                    pieces={guidedProjectPieces}
                    pieceCount={guidedProjectPieces.filter((x) => x.lengthIn > 0 && x.depthIn > 0).length}
                    counterSqft={guidedPreview.counter}
                    splashSqft={guidedPreview.splash}
                  />
                ) : null}

                <label className="check guided-advanced-toggle">
                  <input
                    type="checkbox"
                    checked={guidedUseAdvanced}
                    onChange={(e) => setGuidedUseAdvanced(e.target.checked)}
                  />
                  Use piece-by-piece measurements for this quote instead of the simple layout above
                </label>

                <details
                  className="advanced-pieces-details"
                  open={guidedAdvancedOpen}
                  onToggle={(e) => setGuidedAdvancedOpen((e.target as HTMLDetailsElement).open)}
                >
                  <summary>Advanced: edit individual pieces</summary>
                  <p className="muted small">
                    Add counter, backsplash, or full-height pieces. Rectangle and triangle shapes are supported.
                  </p>
                  {guidedProjectPieces.map((p) => (
                    <div key={p.id} className="piece-row grid3">
                      <label>
                        Label
                        <input
                          value={p.name}
                          onChange={(e) =>
                            setGuidedProjectPieces((prev) => prev.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))
                          }
                        />
                      </label>
                      <label>
                        Type
                        <select
                          value={p.pieceType}
                          onChange={(e) =>
                            setGuidedProjectPieces((prev) =>
                              prev.map((x) =>
                                x.id === p.id ? { ...x, pieceType: e.target.value as GuidedPiece["pieceType"] } : x
                              )
                            )
                          }
                        >
                          <option value="counter">Counter</option>
                          <option value="splash">Backsplash</option>
                          <option value="fhb">Full height</option>
                        </select>
                      </label>
                      <label>
                        Shape
                        <select
                          value={p.shape}
                          onChange={(e) =>
                            setGuidedProjectPieces((prev) =>
                              prev.map((x) => (x.id === p.id ? { ...x, shape: e.target.value as GuidedPiece["shape"] } : x))
                            )
                          }
                        >
                          <option value="rect">Rectangle</option>
                          <option value="tri">Triangle</option>
                        </select>
                      </label>
                      <label>
                        Length (in)
                        <input
                          type="number"
                          value={p.lengthIn || ""}
                          onChange={(e) =>
                            setGuidedProjectPieces((prev) =>
                              prev.map((x) => (x.id === p.id ? { ...x, lengthIn: Number(e.target.value) || 0 } : x))
                            )
                          }
                        />
                      </label>
                      <label>
                        Depth / height (in)
                        <input
                          type="number"
                          value={p.depthIn || ""}
                          onChange={(e) =>
                            setGuidedProjectPieces((prev) =>
                              prev.map((x) => (x.id === p.id ? { ...x, depthIn: Number(e.target.value) || 0 } : x))
                            )
                          }
                        />
                      </label>
                      {p.pieceType === "counter" ? (
                        <label className="check" style={{ alignSelf: "end" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(p.addSplash)}
                            onChange={(e) =>
                              setGuidedProjectPieces((prev) =>
                                prev.map((x) => (x.id === p.id ? { ...x, addSplash: e.target.checked } : x))
                              )
                            }
                          />
                          Add 4″ splash for this piece
                        </label>
                      ) : (
                        <span />
                      )}
                      <div className="piece-row-actions">
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => setGuidedProjectPieces((prev) => prev.filter((x) => x.id !== p.id))}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="mode-row piece-add-row">
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        setGuidedProjectPieces((prev) => [
                          ...prev,
                          {
                            id: `gp-${Math.random().toString(36).slice(2, 9)}`,
                            pieceType: "counter",
                            name: "Counter section",
                            lengthIn: 0,
                            depthIn: 25.5,
                            shape: "rect",
                            addSplash: false
                          }
                        ])
                      }
                    >
                      + Add counter piece
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        setGuidedProjectPieces((prev) => [
                          ...prev,
                          {
                            id: `gp-${Math.random().toString(36).slice(2, 9)}`,
                            pieceType: "splash",
                            name: "Backsplash section",
                            lengthIn: 0,
                            depthIn: STANDARD_BACKSPLASH_HEIGHT_IN,
                            shape: "rect"
                          }
                        ])
                      }
                    >
                      + Add splash piece
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() =>
                        setGuidedProjectPieces((prev) => [
                          ...prev,
                          {
                            id: `gp-${Math.random().toString(36).slice(2, 9)}`,
                            pieceType: "fhb",
                            name: "Full-height section",
                            lengthIn: 0,
                            depthIn: 96,
                            shape: "rect"
                          }
                        ])
                      }
                    >
                      + Add full-height backsplash piece
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setGuidedProjectPieces(createDefaultRoom(materialGroup).guidedPieces)}
                    >
                      L-shape preset (pieces)
                    </button>
                  </div>
                </details>
              </div>
            ) : null}

            {quoteWorkflow !== "room_by_room" ? (
              <>
                <h3 className="h3">Global add-ons (non — room-by-room)</h3>
                <div className="grid3">
                  <label>
                    Kitchen sink cutouts
                    <input value={sink} onChange={(e) => setSink(e.target.value)} />
                  </label>
                  <label>
                    Vanity / bar sink cutouts
                    <input value={bar} onChange={(e) => setBar(e.target.value)} />
                  </label>
                  <label>
                    Cooktop cutouts
                    <input value={cook} onChange={(e) => setCook(e.target.value)} />
                  </label>
                  <label>
                    Electrical outlet cutouts
                    <input value={outlet} onChange={(e) => setOutlet(e.target.value)} />
                  </label>
                  <label>
                    ESF stainless sink
                    <input value={ss} onChange={(e) => setSs(e.target.value)} />
                  </label>
                  <label>
                    Stock Blanco sink
                    <input value={blanco} onChange={(e) => setBlanco(e.target.value)} />
                  </label>
                </div>
                <label className="check">
                  <input type="checkbox" checked={tearYes} onChange={(e) => setTearYes(e.target.checked)} />
                  Tear-out needed
                </label>
                <div style={{ marginTop: 16 }}>
                  <h3 className="h3">Custom add-ons</h3>
                  <p className="muted small">
                    Non-standard sinks, fixtures, or misc. — price is the final internal line amount for the selected
                    Direct/Wholesale mode (no public 25% homeowner markup).
                  </p>
                  {customItems.map((row) => (
                    <div key={row.id} className="grid3" style={{ marginBottom: 8 }}>
                      <label>
                        Description
                        <input
                          value={row.description}
                          onChange={(e) =>
                            setCustomItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, description: e.target.value } : x)))
                          }
                          placeholder="Custom Blanco sink"
                        />
                      </label>
                      <label>
                        Price ($)
                        <input value={row.price} onChange={(e) => setCustomItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, price: e.target.value } : x)))} inputMode="decimal" />
                      </label>
                      <label>
                        Qty
                        <input value={row.qty} onChange={(e) => setCustomItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, qty: e.target.value } : x)))} inputMode="numeric" />
                      </label>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <button type="button" className="btn secondary" onClick={() => setCustomItems((prev) => prev.filter((x) => x.id !== row.id))}>
                          Remove custom item
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() =>
                      setCustomItems((prev) => [
                        ...prev,
                        { id: `ci-${Math.random().toString(36).slice(2, 9)}`, description: "", price: "", qty: "1" }
                      ])
                    }
                  >
                    + Add custom item
                  </button>
                </div>
              </>
            ) : (
              <p className="muted small">Add-ons are per room in the room builder above.</p>
            )}

            <div className="grid3" style={{ marginTop: 12 }}>
              <label>
                Partner retail method
                <select value={partnerRetailMethod} onChange={(e) => setPartnerRetailMethod(e.target.value)}>
                  <option>Markup Percent</option>
                  <option>Margin Percent</option>
                  <option>Flat Dollar Add</option>
                  <option>Pass Through</option>
                </select>
              </label>
              <label>
                Display markup % (partner retail view)
                <input value={partnerRetailPct} onChange={(e) => setPartnerRetailPct(e.target.value)} style={{ maxWidth: 140 }} />
              </label>
            </div>
          </section>

          <div className="actions">
            <button type="button" className="btn primary big" disabled={calcBusy} onClick={() => void handleCalculate()}>
              {calcBusy ? "Calculating…" : "Calculate"}
            </button>
            <button type="button" className="btn secondary big" disabled={submitBusy} onClick={() => void handleSubmit()}>
              {submitBusy ? "Working…" : "Save quote"}
            </button>
          </div>
          {!sessionToken ? (
            <p className="muted small" style={{ marginTop: 0 }}>
              <strong>Save quote</strong> requires sign-in and backend quote storage. Use <strong>Calculate</strong> for local
              demo pricing when offline.
            </p>
          ) : null}

          {vanityLocalNote ? <div className="fallback-banner">{vanityLocalNote}</div> : null}

          {usedFallback ? (
            <div className="fallback-banner" role="status">
              {demoResult?.fallbackLabel ?? "Demo calculation fallback — backend not connected."}
            </div>
          ) : null}

          {calcError ? <p className="error">{calcError}</p> : null}

          {hasCalcResult && comparisonRows?.length ? (
            <section className="card group-compare-card">
              <h2>Compare material groups</h2>
              <p className="muted group-compare-lead">
                Use this to compare how material group selection changes the project estimate.
              </p>
              {comparisonMixedNote ? <div className="fallback-banner">{comparisonMixedNote}</div> : null}
              <div className="internal-banner">
                <strong>Internal detail — not public-facing.</strong> Rates and wholesale-style economics below are for staff
                discussion only.
              </div>
              <div className="table-scroll">
                <table className="group-compare-table group-compare-table-partner">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Rate ($/sf)</th>
                      <th>Ct sf</th>
                      <th>Ct cost</th>
                      <th>Bs sf</th>
                      <th>Bs cost</th>
                      <th>Add-ons</th>
                      <th>Wholesale total</th>
                      <th>Retail / protected</th>
                      <th>Display profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => {
                      const profit = round2(row.partnerRetailTotal - row.wholesaleTotal);
                      return (
                        <tr key={row.group} className={row.group === materialGroup ? "row-active" : undefined}>
                          <td>{row.group}</td>
                          <td>${row.rate.toFixed(2)}</td>
                          <td>{row.countertopSqft.toFixed(2)}</td>
                          <td>${row.countertopWholesale.toFixed(2)}</td>
                          <td>{row.backsplashSqft.toFixed(2)}</td>
                          <td>${row.backsplashWholesale.toFixed(2)}</td>
                          <td>${row.addonCost.toFixed(2)}</td>
                          <td>${row.wholesaleTotal.toFixed(2)}</td>
                          <td>${row.partnerRetailTotal.toFixed(2)}</td>
                          <td>${profit.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {localMathCheck ? (
            <section className="card math-check">
              <h2>Math check (internal demo)</h2>
              <p className="muted small">Partner / internal only — mirrors prototype measurement + tier logic for review.</p>
              <ul className="kv">
                <li>
                  <span>Workflow</span>
                  <strong>{localMathCheck.workflowLabel}</strong>
                </li>
                <li>
                  <span>Qualifying countertop sf (vanity tier)</span>
                  <strong>{localMathCheck.qualifyingSf.toFixed(2)}</strong>
                </li>
                <li>
                  <span>Vanity tier</span>
                  <strong>{localMathCheck.vanityTierLabel}</strong>
                </li>
                <li>
                  <span>Countertop sf (totals)</span>
                  <strong>{localMathCheck.countertopSf.toFixed(2)}</strong>
                </li>
                <li>
                  <span>Backsplash sf</span>
                  <strong>{localMathCheck.backsplashSf.toFixed(2)}</strong>
                </li>
                <li>
                  <span>Full-height sf</span>
                  <strong>{localMathCheck.fullHeightSf.toFixed(2)}</strong>
                </li>
                <li>
                  <span>Total scope sf</span>
                  <strong>{localMathCheck.totalScopeSf.toFixed(2)}</strong>
                </li>
                <li>
                  <span>Reference group rate</span>
                  <strong>
                    {localMathCheck.primaryGroup} @ ${localMathCheck.groupRatePerSf}/sf
                  </strong>
                </li>
                <li>
                  <span>Wholesale (demo)</span>
                  <strong>${localMathCheck.wholesale.toFixed(2)}</strong>
                </li>
                <li>
                  <span>Retail / public display</span>
                  <strong>${localMathCheck.retailOrPublic.toFixed(2)}</strong>
                </li>
                {localMathCheck.partnerProfit != null ? (
                  <li>
                    <span>Partner profit (display)</span>
                    <strong>${localMathCheck.partnerProfit.toFixed(2)}</strong>
                  </li>
                ) : null}
              </ul>
              {localMathCheck.measurementLines.length ? (
                <div style={{ marginTop: 12 }}>
                  <p className="section-lead">Measurement lines</p>
                  <ul className="mini-lines">
                    {localMathCheck.measurementLines.map((ln, i) => (
                      <li key={i}>{ln}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {localMatrix?.length ? (
                <div style={{ marginTop: 14 }} className="lines">
                  <strong>All-group matrix (wholesale → retail @ 20% for demo)</strong>
                  <table>
                    <thead>
                      <tr>
                        <th>Group</th>
                        <th>Wholesale</th>
                        <th>Retail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {localMatrix.map((row) => (
                        <tr key={row.group}>
                          <td>{row.group}</td>
                          <td>${row.wholesale.toFixed(2)}</td>
                          <td>${row.retail.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {localMathCheck.warnings.length ? (
                <div className="warn-box" style={{ marginTop: 12 }}>
                  <strong>Warnings</strong>
                  <ul>
                    {localMathCheck.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="card">
            <p className="section-lead">Full breakdown</p>
            <h2>Internal detail</h2>
            <div className="internal-banner">
              <strong>Internal only — not public-facing.</strong> Wholesale and line economics below are for staff discussion
              only.
            </div>
            <>
              {apiPartner?.totals ? (
                <ul className="kv">
                  <li>
                    <span>Quote path</span>
                    <strong>{workflowLabel(quoteWorkflow)}</strong>
                  </li>
                  <li>
                    <span>Wholesale estimate</span>
                    <strong>${Number(apiPartner.totals.wholesale ?? 0).toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Retail (display)</span>
                    <strong>${Number(apiPartner.totals.retail ?? 0).toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Display profit</span>
                    <strong>${Number(apiPartner.totals.profit ?? 0).toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Estimated sq ft</span>
                    <strong>{Number(apiPartner.totals.estimated_sqft ?? 0).toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Material group</span>
                    <strong>{materialGroup}</strong>
                  </li>
                </ul>
              ) : demoResult ? (
                <ul className="kv">
                  <li>
                    <span>Quote path</span>
                    <strong>{workflowLabel(quoteWorkflow)}</strong>
                  </li>
                  <li>
                    <span>Wholesale estimate</span>
                    <strong>${(demoResult.wholesale ?? 0).toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Retail (display)</span>
                    <strong>${demoResult.retail.toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Display profit</span>
                    <strong>${(demoResult.profit ?? 0).toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Estimated sq ft</span>
                    <strong>{demoResult.estimated_sqft.toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Material group</span>
                    <strong>{demoResult.materialGroup}</strong>
                  </li>
                </ul>
              ) : (
                <p className="muted">Tap <strong>Calculate</strong> to see your estimate.</p>
              )}
              {(apiPartner?.warnings?.length ?? 0) + (demoResult?.warnings?.length ?? 0) > 0 ? (
                <div className="warn-box">
                  <strong>Heads up</strong>
                  <ul>
                    {(apiPartner?.warnings ?? demoResult?.warnings ?? []).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {apiPartner?.snapshot?.lineItems && Array.isArray(apiPartner.snapshot.lineItems) ? (
                <div className="lines">
                  <strong>Line items</strong>
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>$/unit</th>
                        <th>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiPartner.snapshot.lineItems.map((ln, i) => (
                        <tr key={i}>
                          <td>{String(ln.item_name ?? "")}</td>
                          <td>{String(ln.quantity ?? "")}</td>
                          <td>${Number(ln.unit_price ?? 0).toFixed(2)}</td>
                          <td>${Number(ln.line_subtotal ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : demoResult?.lineItems.length ? (
                <div className="lines">
                  <strong>Line items (demo)</strong>
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>$/unit</th>
                        <th>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demoResult.lineItems.map((ln, i) => (
                        <tr key={i}>
                          <td>{ln.item_name}</td>
                          <td>{ln.quantity}</td>
                          <td>${ln.unit_price.toFixed(2)}</td>
                          <td>${ln.line_subtotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p className="muted small">
                Internal calculate uses <code>/api/internal-quotes/calculate</code>; display markup settings are for illustration
                only.
              </p>
            </>
            <p style={{ marginTop: 14 }}>
              <strong>Confidence:</strong>{" "}
              {apiPartner ? "Live calculation — review notes above." : demoResult?.confidence ?? "—"}
            </p>
            <p>
              <strong>Review suggested:</strong>{" "}
              {demoResult?.reviewNeeded === false ? "No" : demoResult ? "Yes" : "—"}
            </p>
          </section>

          <section className="card">
            <h2>Save quote</h2>
            {submitMsg ? <p>{submitMsg}</p> : <p className="muted">Submit saves to eliteOS when you’re signed in and quote tables are installed.</p>}
            {submitPreview ? <pre className="preview">{submitPreview}</pre> : null}
          </section>

          <section className="card notes">
            <h2>What this head proves</h2>
            <ul>
              <li>
                Internal preliminary quotes can use the same measurement modules as the public tool while keeping **Direct /
                Wholesale** economics and the **quote library** on a **separate authenticated head**.
              </li>
              <li>
                Saves and Monday for <code>quote_source: internal_quote</code> use <strong>internal</strong> API routes and{" "}
                <code>MONDAY_INTERNAL_*</code> only — not the public consumer board configuration.
              </li>
              <li>
                The **public** quote site (<code>app-quote</code>) stays homeowner-safe: no internal mode, no wholesale matrix
                in that bundle.
              </li>
              <li>
                Future <strong>AI Takeoff</strong> and <strong>Visualize</strong> remain planned in the shared data model (see{" "}
                <code>docs/quote-platform/ai-takeoff-and-visualize-plan.md</code>).
              </li>
            </ul>
          </section>
        </div>

        <aside className="side-col">
          {hasCalcResult ? (
            <div className="summary-card">
              {partRetail != null ? (
                <>
                  <h2>Your estimate</h2>
                  <p className="summary-kicker">Retail / protected (display)</p>
                  <p className="summary-hero-value">${Number(partRetail).toFixed(2)}</p>
                  {partWholesale != null ? (
                    <p className="summary-secondary muted small">
                      Wholesale estimate: <strong>${Number(partWholesale).toFixed(2)}</strong>
                    </p>
                  ) : null}
                  <div className="summary-rows">
                    <div className="summary-row">
                      <span>Quote path</span>
                      <strong>{workflowLabel(quoteWorkflow)}</strong>
                    </div>
                    {partWholesale != null ? (
                      <div className="summary-row">
                        <span>Wholesale estimate</span>
                        <strong>${Number(partWholesale).toFixed(2)}</strong>
                      </div>
                    ) : null}
                    <div className="summary-row">
                      <span>Retail / protected (display)</span>
                      <strong>${Number(partRetail).toFixed(2)}</strong>
                    </div>
                    {partProfit != null ? (
                      <div className="summary-row">
                        <span>Profit / protection (display)</span>
                        <strong>${partProfit.toFixed(2)}</strong>
                      </div>
                    ) : null}
                    <div className="summary-row">
                      <span>Estimated sq ft</span>
                      <strong>{Number(partSqft ?? 0).toFixed(2)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Material group</span>
                      <strong>{materialGroup}</strong>
                    </div>
                  </div>
                  <div className="internal-badge">Internal / demo — not public-facing</div>
                  <p className="summary-foot">Shown for staff discussion; not homeowner-facing.</p>
                  <p className="summary-foot muted small">Use the math check panel for line-level verification.</p>
                  {lastCalcLive ? <p className="summary-foot">Live API response</p> : null}
                </>
              ) : null}
            </div>
          ) : (
            <div className="summary-card summary-card-precalc">
              <h2>Estimate preview</h2>
              <div className="summary-rows">
                <div className="summary-row">
                  <span>Quote path</span>
                  <strong>{scopePreview.method}</strong>
                </div>
                <div className="summary-row">
                  <span>Measured sq ft (estimate)</span>
                  <strong>{scopePreview.totalSf.toFixed(2)}</strong>
                </div>
                <div className="summary-row">
                  <span>Material group</span>
                  <strong>{materialGroup}</strong>
                </div>
              </div>
              <p className="summary-cta muted">
                Tap <strong>Calculate</strong> to price this scope.
              </p>
            </div>
          )}
        </aside>
      </div>

      <footer className="footer">eliteOS Internal Estimate Head · Elite Stone Fabrication · {new Date().getFullYear()}</footer>
    </div>
  );
}
