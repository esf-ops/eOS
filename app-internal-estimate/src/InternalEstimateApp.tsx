import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGetJson, apiPostJson, ApiError } from "@quote-lib/api";
import { config, EOS_LOGO_URL } from "@quote-lib/config";
import type { DemoCalculateResult } from "@quote-lib/demoFallback";
import { round2 } from "@quote-lib/measurementEngine";
import {
  aggregateComparisonScope,
  buildInternalEstimateGroupComparison,
  buildSelectedMaterialBreakdown,
  calculateAllRoomDrafts,
  createEstimatorRoom,
  hydrateRoomDraftsFromEstimateRooms,
  mergeRoomDraftsIntoGlobalAddOns,
  roomsNeedLocalVanityMath,
  runLocalPrototypeQuote,
  serializeRoomsForApi
} from "@quote-lib/prototypeQuoteMath";
import type { EliteProgramColorRow, QuoteWorkflowMethod, RoomDraft } from "@quote-lib/quoteTypes";
import CustomerEstimatePrint, { type CustomerLineItem } from "./CustomerEstimatePrint";
import { resolveAccessToken } from "./lib/authSession";
import { friendlyApiErrorMessage } from "./lib/saveErrorMessage";
import { getSupabase } from "./lib/supabase";
import RoomScopeBuilder from "@quote-ui/RoomScopeBuilder";

const MATERIAL_GROUPS = [
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F"
];

const INTERNAL_ESTIMATE_WORKFLOW: QuoteWorkflowMethod = "room_by_room";
const EMPTY_GLOBAL_ADDONS = {
  "qty-sink": 0,
  "qty-bar": 0,
  "qty-cook": 0,
  "qty-outlet": 0,
  "qty-ss": 0,
  "qty-blanco": 0,
  tearout: 0
};

const INTERNAL_SALES_REPS = ["Casey", "Thera", "MJ", "House", "Direct"] as const;
const INTERNAL_BRANCHES = ["Dyersville", "Iowa City", "Lisbon"] as const;

const WORKFLOW_SECTIONS = [
  { id: "sec-job", label: "Job Info" },
  { id: "sec-rooms", label: "Rooms / Areas" },
  { id: "sec-addons", label: "Add-ons & Custom Items" },
  { id: "sec-review", label: "Review" },
  { id: "sec-output", label: "Output" },
  { id: "sec-save", label: "Save" }
] as const;

const CUSTOM_LINE_CATEGORIES = [
  "Sink",
  "Faucet",
  "Plumbing fixture",
  "Accessory",
  "Labor",
  "Fee",
  "Discount/Credit",
  "Other"
] as const;

type CustomLineRow = {
  id: string;
  name: string;
  description: string;
  category: (typeof CUSTOM_LINE_CATEGORIES)[number];
  qty: string;
  unitPrice: string;
  customerFacing: boolean;
  internalNote: string;
  roomName: string;
};

const CUSTOM_LINE_PRESETS: Array<{
  key: string;
  name: string;
  description: string;
  category: CustomLineRow["category"];
  unitPrice: string;
  customerFacing: boolean;
}> = [
  { key: "tear", name: "Tear Out", description: "Removal / tear-out labor line.", category: "Labor", unitPrice: "750", customerFacing: true },
  { key: "trip", name: "Trip Charge", description: "Travel / trip", category: "Fee", unitPrice: "75", customerFacing: true },
  { key: "mat", name: "Additional Material Cost", description: "Extra material allowance", category: "Other", unitPrice: "0", customerFacing: true },
  { key: "sink", name: "Custom Sink / Faucet / Fixture", description: "Fixture package", category: "Plumbing fixture", unitPrice: "0", customerFacing: true },
  { key: "labor", name: "Labor / Install Fee", description: "Install or labor line", category: "Labor", unitPrice: "0", customerFacing: true },
  { key: "disc", name: "Discount / Credit", description: "Uses negative unit price (required for this category).", category: "Discount/Credit", unitPrice: "-100", customerFacing: true },
  { key: "other", name: "Other", description: "Miscellaneous", category: "Other", unitPrice: "0", customerFacing: true },
  { key: "internal_fee", name: "Internal-only fee", description: "Uncheck customer-facing so this stays internal in snapshots.", category: "Fee", unitPrice: "0", customerFacing: false }
];

function newInternalRowId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2, 11)}`;
}

type ApiPartnerResult = {
  ok?: boolean;
  totals?: { wholesale?: number; retail?: number; profit?: number; estimated_sqft?: number };
  snapshot?: {
    lineItems?: Array<Record<string, unknown>>;
    pricingStructure?: Record<string, unknown>;
    material_breakdown?: Array<Record<string, unknown>>;
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
    profit: r.profit ?? 0,
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

  const [roomDrafts, setRoomDrafts] = useState<RoomDraft[]>(() => [createEstimatorRoom("Group Promo")]);

  const [accountName, setAccountName] = useState("Direct");
  const [accountPhone, setAccountPhone] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [projectType, setProjectType] = useState("Kitchen");
  const [branch, setBranch] = useState("Dyersville");
  const [salesRep, setSalesRep] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("IA");
  const [enteredBy, setEnteredBy] = useState("");
  const [colorTbd, setColorTbd] = useState(false);
  const [internalPricingMode, setInternalPricingMode] = useState<"direct" | "wholesale">("wholesale");
  const [customerDisplayGroups, setCustomerDisplayGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MATERIAL_GROUPS.map((g) => [g, false]))
  );
  const [customLineRows, setCustomLineRows] = useState<CustomLineRow[]>([]);
  const [eliteColors, setEliteColors] = useState<EliteProgramColorRow[]>([]);
  const [colorCatalogWarnings, setColorCatalogWarnings] = useState<string[]>([]);
  const [quoteDefaultCatalogId, setQuoteDefaultCatalogId] = useState("");
  const [cabinetPlansNote, setCabinetPlansNote] = useState("");
  const [sitePhotosNote, setSitePhotosNote] = useState("");
  const [fixtureSpecsNote, setFixtureSpecsNote] = useState("");
  const [loadedFromLibrary, setLoadedFromLibrary] = useState(false);
  const [hydrationGaps, setHydrationGaps] = useState<string[]>([]);
  const [lastSavedQuoteNumber, setLastSavedQuoteNumber] = useState<string | null>(null);
  const [lastSavedQuoteId, setLastSavedQuoteId] = useState<string | null>(null);

  const [calcBusy, setCalcBusy] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [vanityLocalNote, setVanityLocalNote] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [demoResult, setDemoResult] = useState<DemoCalculateResult | null>(null);
  const [apiPartner, setApiPartner] = useState<ApiPartnerResult | null>(null);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitDiagnostic, setSubmitDiagnostic] = useState<string | null>(null);
  const [backendCalcOk, setBackendCalcOk] = useState<boolean | null>(null);

  const lastCalcLive = !usedFallback && apiPartner != null;

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Sign-in is not configured in this build.");
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
      setBackendCalcOk(null);
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
    setBackendCalcOk(null);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const tok = data.session?.access_token ?? "";
      setSessionToken(tok || null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (!alive) return;
      const tok = sess?.access_token ?? "";
      setSessionToken(tok || null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const ensureAccessToken = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null;
    return resolveAccessToken(supabase);
  }, [supabase]);

  const printCustomerEstimate = useCallback(() => {
    window.print();
  }, []);

  const topMaterialGroup = useMemo(() => roomDrafts[0]?.materialGroup ?? "Group Promo", [roomDrafts]);

  const buildRoomDraftsForCalculate = useCallback((): RoomDraft[] => roomDrafts, [roomDrafts]);

  const buildCalcPayload = useCallback(() => {
    const drafts = buildRoomDraftsForCalculate();
    const apiRooms = serializeRoomsForApi(drafts);
    const addOns: Record<string, number | string> = mergeRoomDraftsIntoGlobalAddOns(drafts);
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
    const customPassthroughItems: Array<{ description: string; price: number; qty: number }> = [];
    const customLineItems = customLineRows
      .map((row) => ({
        name: row.name.trim(),
        description: row.description.trim(),
        category: row.category,
        quantity: num(row.qty) || 1,
        unitPrice: num(row.unitPrice),
        customerFacing: row.customerFacing,
        internalNote: row.internalNote.trim(),
        roomName: row.roomName.trim()
      }))
      .filter((row) => {
        if (!row.name || row.quantity <= 0) return false;
        if (row.category === "Discount/Credit") return row.unitPrice < 0;
        return row.unitPrice !== 0;
      });
    let quoteDefaultMaterial: Record<string, unknown> | null = null;
    if (quoteDefaultCatalogId) {
      const c = eliteColors.find((x) => x.id === quoteDefaultCatalogId);
      if (c) {
        quoteDefaultMaterial = {
          materialGroup: c.priceGroupLabel,
          materialColor: c.colorName,
          materialSupplier: c.supplier ?? undefined,
          materialType: c.materialType ?? undefined,
          catalogColorId: c.id
        };
      }
    }
    const draftsForReady = buildRoomDraftsForCalculate();
    let totalSfReady = 0;
    if (draftsForReady.length) {
      const { totals } = calculateAllRoomDrafts(draftsForReady, projectType);
      totalSfReady = round2(totals.counter + totals.splash + totals.fhb);
    }
    const missing: string[] = [];
    if (!accountName.trim()) missing.push("Account (enter a name or keep Direct)");
    if (!salesRep.trim()) missing.push("Salesperson");
    if (!customerName.trim()) missing.push("Customer name");
    if (!projectName.trim()) missing.push("Elite job name");
    if (!city.trim() && !state.trim() && !projectAddress.trim()) missing.push("Project address or city/state");
    if (totalSfReady <= 0) missing.push("Room / area measurements (square footage)");
    const readinessWarnings: string[] = [];
    if (colorTbd) {
      readinessWarnings.push("Color marked TBD — confirm before Sent/Sold when you have a selection.");
    }
    const readiness = {
      missing,
      warnings: readinessWarnings,
      score: Math.max(0, Math.min(100, 100 - missing.length * 14)),
      readyForReview: missing.length === 0
    };
    const fileChecklist = {
      cabinet_plans: cabinetPlansNote.trim() || null,
      site_photos: sitePhotosNote.trim() || null,
      fixture_specs: fixtureSpecsNote.trim() || null,
      note: "File upload/storage will be added later — list required files here for ESF review."
    };
    return {
      quoteSource: "internal_quote",
      materialGroup: topMaterialGroup,
      internalMaterialBasis: internalPricingMode,
      customPassthroughItems,
      customLineItems,
      quoteDefaultMaterial,
      readiness,
      fileChecklist,
      quote_workflow: INTERNAL_ESTIMATE_WORKFLOW,
      areas: { countertopSqft, backsplashSqft },
      addOns,
      engine,
      rooms: apiRooms,
      customerEstimateDisplayGroups: MATERIAL_GROUPS.filter((g) => customerDisplayGroups[g]),
      customer_name: customerName.trim() || undefined,
      customer_email: email.trim() || undefined,
      customer_phone: phone.trim() || undefined,
      project_type: projectType.trim() || undefined,
      project_name: projectName.trim() || undefined,
      project_address: projectAddress.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      branch: branch.trim() || undefined,
      sales_rep: salesRep.trim() || undefined,
      entered_by: enteredBy.trim() || undefined,
      job_info: {
        account: accountName.trim() || null,
        account_contact_phone: accountPhone.trim() || null,
        account_contact_email: accountEmail.trim() || null
      }
    };
  }, [
    buildRoomDraftsForCalculate,
    topMaterialGroup,
    customerName,
    email,
    phone,
    projectType,
    branch,
    salesRep,
    customLineRows,
    eliteColors,
    quoteDefaultCatalogId,
    cabinetPlansNote,
    sitePhotosNote,
    fixtureSpecsNote,
    internalPricingMode,
    projectName,
    projectAddress,
    city,
    state,
    enteredBy,
    accountName,
    accountPhone,
    accountEmail,
    colorTbd,
    customerDisplayGroups
  ]);

  const runLocalFromDrafts = useCallback(() => {
    const drafts = buildRoomDraftsForCalculate();
    const wf = workflowLabel(INTERNAL_ESTIMATE_WORKFLOW);
    let customLineSum = 0;
    for (const r of customLineRows) {
      const q = num(r.qty) || 1;
      const p = num(r.unitPrice);
      if (!r.name.trim() || q <= 0) continue;
      if (r.category === "Discount/Credit") {
        if (p < 0) customLineSum += q * p;
        continue;
      }
      if (p === 0) continue;
      customLineSum += q * p;
    }
    const lr = runLocalPrototypeQuote({
      quoteMode: "internal",
      internalMaterialBasis: internalPricingMode,
      materialGroupTop: topMaterialGroup,
      roomDrafts: drafts,
      globalAddOns: EMPTY_GLOBAL_ADDONS,
      applyGlobalAddOns: false,
      workflowLabel: wf,
      projectType,
      customLineItemsTotal: round2(customLineSum)
    });
    setUsedFallback(true);
    setApiPartner(null);
    setDemoResult(localRunToDemo(lr));
  }, [
    buildRoomDraftsForCalculate,
    topMaterialGroup,
    projectType,
    internalPricingMode,
    customLineRows
  ]);

  const handleCalculate = useCallback(async () => {
    setCalcBusy(true);
    setCalcError(null);
    setDemoResult(null);
    setApiPartner(null);
    setUsedFallback(false);
    setVanityLocalNote(null);

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
      setBackendCalcOk(false);
      setCalcBusy(false);
      return;
    }

    const token = await ensureAccessToken();
    if (!token) {
      setCalcError("Your session expired. Please sign out and sign back in, then try Calculate again.");
      runLocalFromDrafts();
      setBackendCalcOk(false);
      setCalcBusy(false);
      return;
    }
    if (token !== sessionToken) setSessionToken(token);

    const payload = buildCalcPayload();

    try {
      const raw = (await apiPostJson("/api/internal-quotes/calculate", token, payload)) as Record<string, unknown>;
      if (raw.ok === true) {
        setApiPartner(raw as ApiPartnerResult);
        setUsedFallback(false);
        setBackendCalcOk(true);
        setCalcError(null);
        setCalcBusy(false);
        return;
      }
      runLocalFromDrafts();
      setBackendCalcOk(false);
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown> | null;
        const installed = body && body.installed === false;
        if (e.status === 503 || installed || e.status === 0 || e.status >= 500) {
          runLocalFromDrafts();
          setBackendCalcOk(false);
          setCalcBusy(false);
          return;
        }
        if (e.status === 401) {
          const info = friendlyApiErrorMessage(e, "POST /api/internal-quotes/calculate", "calculate");
          setCalcError(info.userMessage);
          runLocalFromDrafts();
          setBackendCalcOk(false);
          setCalcBusy(false);
          return;
        }
        setCalcError(friendlyApiErrorMessage(e, "POST /api/internal-quotes/calculate", "calculate").userMessage);
        setCalcBusy(false);
        return;
      }
      runLocalFromDrafts();
      setBackendCalcOk(false);
    }
    setCalcBusy(false);
  }, [sessionToken, buildCalcPayload, buildRoomDraftsForCalculate, runLocalFromDrafts, ensureAccessToken]);

  const buildSubmitPayload = useCallback(() => {
    return {
      ...buildCalcPayload(),
      customer_name: customerName.trim() || null,
      customer_email: email.trim() || null,
      customer_phone: phone.trim() || null,
      project_type: projectType.trim() || null,
      project_name: projectName.trim() || null,
      project_address: projectAddress.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      branch: branch.trim() || null,
      sales_rep: salesRep.trim() || null,
      entered_by: enteredBy.trim() || null,
      quote_status: "testing_review"
    };
  }, [buildCalcPayload, customerName, email, phone, projectType, projectName, projectAddress, city, state, branch, salesRep, enteredBy]);

  const handleSubmit = useCallback(async () => {
    setSubmitBusy(true);
    setSubmitMsg(null);
    setSubmitDiagnostic(null);
    const payload = buildSubmitPayload();

    try {
      if (!sessionToken) {
        setSubmitMsg("Sign in to save an internal quote to eliteOS. Nothing is stored until you are signed in.");
        return;
      }

      const token = await ensureAccessToken();
      if (!token) {
        setSubmitMsg(
          "Your session expired. Please sign in again before saving. If you still see this after signing in, sign out and sign back in."
        );
        return;
      }
      if (token !== sessionToken) setSessionToken(token);

      const raw = (await apiPostJson("/api/internal-quotes/save", token, payload)) as Record<string, unknown>;
      if (raw.ok === true) {
        const qn = String(raw.quote_number ?? raw.quoteNumber ?? "");
        const qid = String(raw.quoteId ?? raw.quote_id ?? "");
        setLastSavedQuoteNumber(qn || null);
        setLastSavedQuoteId(qid && qid !== "undefined" ? qid : null);
        setSubmitMsg(
          qn
            ? `Saved to eliteOS Quote Library. Reference: ${qn}.`
            : "Saved to eliteOS Quote Library."
        );
        setSubmitDiagnostic(null);
        setBackendCalcOk(true);
        if (Array.isArray(raw.warnings) && raw.warnings.length) {
          setSubmitMsg((prev) => `${prev} ${(raw.warnings as string[]).join(" ")}`);
        }
      } else {
        setSubmitMsg(String(raw.error || "Something went wrong while saving."));
        setSubmitDiagnostic(JSON.stringify({ route: "POST /api/internal-quotes/save", response: raw }, null, 2));
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown> | string | null;
        let parsed: Record<string, unknown> | null = null;
        if (body && typeof body === "object") parsed = body as Record<string, unknown>;
        const installed = parsed?.installed === false;
        const info = friendlyApiErrorMessage(e, "POST /api/internal-quotes/save", "save");
        if (e.status === 503 || installed) {
          setSubmitMsg("Quote storage isn’t set up in this environment yet. Contact support if this persists.");
          setSubmitDiagnostic(JSON.stringify({ route: info.diagnostic, error: body }, null, 2));
          return;
        }
        setSubmitMsg(info.userMessage);
        setSubmitDiagnostic(
          JSON.stringify({ route: info.diagnostic ?? "POST /api/internal-quotes/save", error: body ?? e.message }, null, 2)
        );
        return;
      }
      setSubmitMsg("Save failed unexpectedly. Please try again.");
      setSubmitDiagnostic(String(e));
    } finally {
      setSubmitBusy(false);
    }
  }, [sessionToken, buildSubmitPayload, ensureAccessToken]);

  const scopePreview = useMemo(() => {
    const drafts = buildRoomDraftsForCalculate();
    if (!drafts.length) {
      return {
        empty: true as const,
        method: workflowLabel(INTERNAL_ESTIMATE_WORKFLOW),
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
      method: workflowLabel(INTERNAL_ESTIMATE_WORKFLOW),
      totalSf,
      counterSf: totals.counter,
      splashSf: totals.splash,
      fhbSf: totals.fhb
    };
  }, [buildRoomDraftsForCalculate, projectType]);

  const readinessSnapshot = useMemo(() => {
    const missing: string[] = [];
    if (!accountName.trim()) missing.push("Account (enter a name or keep Direct)");
    if (!salesRep.trim()) missing.push("Salesperson");
    if (!customerName.trim()) missing.push("Customer name");
    if (!projectName.trim()) missing.push("Elite job name");
    if (!city.trim() && !state.trim() && !projectAddress.trim()) missing.push("Project address or city/state");
    if (scopePreview.empty || scopePreview.totalSf <= 0) missing.push("Room / area measurements (square footage)");
    const warnings: string[] = [];
    if (colorTbd) {
      warnings.push("Color marked TBD — confirm before Sent/Sold when you have a selection.");
    }
    const score = Math.max(0, Math.min(100, 100 - missing.length * 14));
    return { missing, warnings, score, readyForReview: missing.length === 0 };
  }, [accountName, salesRep, customerName, projectName, projectAddress, city, state, scopePreview, colorTbd]);

  const customLinePreviewTotals = useMemo(() => {
    let sum = 0;
    for (const r of customLineRows) {
      const q = num(r.qty) || 1;
      const p = num(r.unitPrice);
      if (!r.name.trim() || q <= 0) continue;
      if (r.category === "Discount/Credit") {
        if (p < 0) sum += q * p;
        continue;
      }
      if (p === 0) continue;
      sum += q * p;
    }
    return round2(sum);
  }, [customLineRows]);

  const liveEstimate = useMemo(() => {
    const drafts = buildRoomDraftsForCalculate();
    const wf = workflowLabel(INTERNAL_ESTIMATE_WORKFLOW);
    return runLocalPrototypeQuote({
      quoteMode: "internal",
      internalMaterialBasis: internalPricingMode,
      materialGroupTop: topMaterialGroup,
      roomDrafts: drafts,
      globalAddOns: EMPTY_GLOBAL_ADDONS,
      applyGlobalAddOns: false,
      workflowLabel: wf,
      projectType,
      customLineItemsTotal: customLinePreviewTotals
    });
  }, [
    buildRoomDraftsForCalculate,
    internalPricingMode,
    topMaterialGroup,
    projectType,
    customLinePreviewTotals
  ]);

  const comparisonScopeMeta = useMemo(() => aggregateComparisonScope(roomDrafts, projectType), [roomDrafts, projectType]);

  const internalGroupComparison = useMemo(() => {
    return buildInternalEstimateGroupComparison({
      countertopSqft: comparisonScopeMeta.countertopSqft,
      backsplashSqft: comparisonScopeMeta.backsplashSqft,
      roomFixedDollars: comparisonScopeMeta.addonDollars,
      customLineDollars: customLinePreviewTotals,
      basis: internalPricingMode
    });
  }, [comparisonScopeMeta, customLinePreviewTotals, internalPricingMode]);

  const backendHint = config.backendBaseUrl;
  const partRetail = liveEstimate.retail;
  const partSqft = liveEstimate.estimated_sqft;
  const serverRetailVerified = !usedFallback && apiPartner?.totals?.retail != null ? Number(apiPartner.totals.retail) : null;

  const customerEstimateComparisonRows = useMemo(
    () => internalGroupComparison.filter((row) => customerDisplayGroups[row.group]),
    [internalGroupComparison, customerDisplayGroups]
  );

  const visibleCustomerLines = useMemo((): CustomerLineItem[] => {
    const out: CustomerLineItem[] = [];
    for (const r of customLineRows) {
      if (!r.customerFacing || !r.name.trim()) continue;
      const q = num(r.qty) || 1;
      const p = num(r.unitPrice);
      if (q <= 0) continue;
      if (r.category === "Discount/Credit") {
        if (p >= 0) continue;
        out.push({
          name: r.name.trim(),
          description: r.description.trim(),
          qty: q,
          unitPrice: p,
          lineTotal: round2(q * p),
          roomName: r.roomName.trim()
        });
        continue;
      }
      if (p === 0) continue;
      out.push({
        name: r.name.trim(),
        description: r.description.trim(),
        qty: q,
        unitPrice: p,
        lineTotal: round2(q * p),
        roomName: r.roomName.trim()
      });
    }
    return out;
  }, [customLineRows]);

  const primaryColorLabel = useMemo(() => {
    if (colorTbd) return "";
    if (quoteDefaultCatalogId) {
      return eliteColors.find((c) => c.id === quoteDefaultCatalogId)?.colorName ?? "";
    }
    return "";
  }, [colorTbd, quoteDefaultCatalogId, eliteColors]);

  const estimateTotalExact = partRetail ?? 0;

  const selectedMaterialBreakdown = useMemo(
    () => buildSelectedMaterialBreakdown(roomDrafts, internalPricingMode),
    [roomDrafts, internalPricingMode]
  );

  const visibleRoomAddons = useMemo(
    () =>
      liveEstimate.measuredRooms.flatMap((r) =>
        r.addons.map((a) => ({
          label: a.label,
          total: a.total,
          roomName: r.name
        }))
      ),
    [liveEstimate.measuredRooms]
  );

  const internalOnlyAdjustDollars = useMemo(() => {
    let visibleCustom = 0;
    for (const r of customLineRows) {
      if (!r.customerFacing || !r.name.trim()) continue;
      const q = num(r.qty) || 1;
      const p = num(r.unitPrice);
      if (q <= 0) continue;
      if (r.category === "Discount/Credit") {
        if (p < 0) visibleCustom += q * p;
        continue;
      }
      if (p === 0) continue;
      visibleCustom += q * p;
    }
    return round2(customLinePreviewTotals - visibleCustom);
  }, [customLineRows, customLinePreviewTotals]);

  /** Matches customer print Quoted Material Breakdown + vanity + room extras + custom lines — same basis as live total. */
  const stickyLiveRollup = useMemo(() => {
    const bd = selectedMaterialBreakdown;
    let vanityFlat = 0;
    let roomExtras = 0;
    for (const r of liveEstimate.measuredRooms) {
      if (r.type === "Vanity") vanityFlat += Number(r.selected) || 0;
      roomExtras += Number(r.extras) || 0;
    }
    const countertopMaterial = round2(bd.totals.countertopMaterial + vanityFlat);
    const backsplashMaterial = bd.totals.backsplashMaterial;
    const roomAddOnsFixtures = round2(roomExtras);
    const recomputed = round2(bd.totals.materialSubtotal + vanityFlat + roomExtras + customLinePreviewTotals);
    return {
      countertopMaterial,
      backsplashMaterial,
      roomAddOnsFixtures,
      structuredCustomLines: customLinePreviewTotals,
      recomputed,
      rollupMismatch: Math.abs(recomputed - (Number(partRetail) || 0)) > 0.03
    };
  }, [selectedMaterialBreakdown, liveEstimate.measuredRooms, customLinePreviewTotals, partRetail]);

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

  const hydrationRanRef = useRef(false);
  useEffect(() => {
    if (!supabase || !sessionToken) return;
    void supabase.auth.getSession().then(({ data }) => {
      const em = data.session?.user?.email;
      if (em) setEnteredBy((prev) => (prev.trim() ? prev : em));
    });
  }, [sessionToken, supabase]);
  useEffect(() => {
    hydrationRanRef.current = false;
  }, [urlQuoteId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sessionToken) {
        setEliteColors([]);
        setColorCatalogWarnings([]);
        return;
      }
      try {
        const raw = (await apiGetJson("/api/internal-quotes/material-colors", sessionToken)) as {
          ok?: boolean;
          colors?: EliteProgramColorRow[];
          warnings?: string[];
        };
        if (cancelled) return;
        setEliteColors(Array.isArray(raw.colors) ? raw.colors : []);
        setColorCatalogWarnings(Array.isArray(raw.warnings) ? raw.warnings : []);
      } catch {
        if (!cancelled) {
          setEliteColors([]);
          setColorCatalogWarnings(["Could not load Elite Program colors — pick material group manually."]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken || !urlQuoteId || hydrationRanRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = (await apiGetJson(`/api/internal-quotes/${urlQuoteId}`, sessionToken)) as Record<string, unknown>;
        if (cancelled || raw.ok !== true) return;
        const q = raw.quote as Record<string, unknown> | undefined;
        if (!q) return;
        hydrationRanRef.current = true;
        const gaps: string[] = [];
        setCustomerName(String(q.customer_name ?? ""));
        setEmail(String(q.customer_email ?? ""));
        setPhone(String(q.customer_phone ?? ""));
        setProjectName(String(q.project_name ?? ""));
        setProjectAddress(String(q.project_address ?? ""));
        setCity(String(q.city ?? ""));
        setState(String(q.state ?? ""));
        if (q.branch) setBranch(String(q.branch));
        if (q.sales_rep) setSalesRep(String(q.sales_rep));
        if (q.entered_by) setEnteredBy(String(q.entered_by));
        if (q.project_type) setProjectType(String(q.project_type));
        const snap = (q.calculation_snapshot as Record<string, unknown>) || {};
        const iu = (snap.internal_ui as Record<string, unknown>) || {};
        const ji = iu.job_info;
        if (ji && typeof ji === "object") {
          const j = ji as Record<string, unknown>;
          if (j.account != null && String(j.account).trim()) setAccountName(String(j.account));
          if (j.account_contact_phone != null) setAccountPhone(String(j.account_contact_phone));
          if (j.account_contact_email != null) setAccountEmail(String(j.account_contact_email));
        }
        const imb = String(iu.internal_material_basis || "");
        if (imb === "direct" || imb === "wholesale") setInternalPricingMode(imb);
        const roomsPayload = iu.estimate_rooms;
        if (Array.isArray(roomsPayload) && roomsPayload.length) {
          setRoomDrafts(hydrateRoomDraftsFromEstimateRooms(roomsPayload));
        } else {
          gaps.push("Room model (estimate_rooms missing on older saves — re-enter rooms if needed)");
        }
        const qdm = iu.quote_default_material;
        if (qdm && typeof qdm === "object") {
          const cid = (qdm as { catalogColorId?: string }).catalogColorId;
          if (cid) setQuoteDefaultCatalogId(String(cid));
        }
        const cls = iu.custom_line_items;
        if (Array.isArray(cls) && cls.length) {
          setCustomLineRows(
            cls.map((r) => {
              const row = r as Record<string, unknown>;
              const c = String(row.category || "Other");
              const cat = (CUSTOM_LINE_CATEGORIES as readonly string[]).includes(c)
                ? (c as (typeof CUSTOM_LINE_CATEGORIES)[number])
                : "Other";
              return {
                id: newInternalRowId(),
                name: String(row.name ?? ""),
                description: String(row.description ?? ""),
                category: cat,
                qty: String(row.quantity ?? 1),
                unitPrice: String(row.unitPrice ?? row.unit_price ?? 0),
                customerFacing: Boolean(row.customerFacing ?? true),
                internalNote: String(row.internalNote ?? ""),
                roomName: String(row.roomName ?? "")
              };
            })
          );
        }
        const cedg = iu.customer_estimate_display_groups ?? iu.customerEstimateDisplayGroups;
        if (Array.isArray(cedg) && cedg.length) {
          setCustomerDisplayGroups(() => {
            const next: Record<string, boolean> = {};
            for (const g of MATERIAL_GROUPS) next[g] = cedg.includes(g);
            return next;
          });
        }
        const isp = snap.inputSummary as Record<string, unknown> | undefined;
        if (isp?.materialGroup) {
          const g = String(isp.materialGroup);
          setRoomDrafts((prev) => {
            if (!prev.length) return [createEstimatorRoom(g)];
            return prev.map((r, i) => (i === 0 ? { ...r, materialGroup: g } : r));
          });
        }
        setLoadedFromLibrary(true);
        setHydrationGaps(gaps);
      } catch (e) {
        if (!cancelled) setHydrationGaps([`Could not load quote: ${e instanceof ApiError ? e.message : String(e)}`]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken, urlQuoteId]);

  return (
    <div className="page page-internal-estimate">
      <div className="ie-no-print">
      <header className="ie-header-compact">
        <div className="ie-header-row">
          <div className="ie-header-brand">
            <img className="ie-logo-sm" src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
            <div>
              <h1 className="ie-header-title">eliteOS Internal Estimate Head</h1>
              <p className="ie-header-sub">Staff estimating workspace</p>
            </div>
          </div>
          <div className="ie-header-actions">
            <a className="btn secondary btn-sm" href={`${quoteLibraryUrl}/`} target="_blank" rel="noreferrer">
              Open Quote Library
            </a>
            {supabase ? (
              sessionToken ? (
                <>
                  <span className="pill pill-live">Signed in</span>
                  <button type="button" className="btn secondary btn-sm" onClick={() => void signOut()}>
                    Sign out
                  </button>
                </>
              ) : (
                <span className="muted small">Sign in to save to Quote Library</span>
              )
            ) : null}
          </div>
        </div>
      </header>

      {urlQuoteId ? (
        <div className="card ie-card-tight ie-url-banner">
          {loadedFromLibrary ? (
            <p className="ok" style={{ margin: 0 }}>
              Loaded from Quote Library. Review fields — saving creates a <strong>new</strong> estimate reference.
            </p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Loading quote…
            </p>
          )}
          {hydrationGaps.length ? (
            <ul className="muted small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {hydrationGaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="ie-app-shell">
        <nav className="ie-rail" aria-label="Estimate workflow">
          {WORKFLOW_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="ie-rail-link"
              onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <main className="ie-main">
          {supabase && !sessionToken ? (
            <div className="card ie-card-tight ie-signin-row">
              <div className="ie-signin-fields">
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
              {authError ? <p className="error" style={{ margin: "8px 0 0" }}>{authError}</p> : null}
            </div>
          ) : null}

          <div className="card ie-card-tight ie-live-strip">
            {!sessionToken ? (
              <p className="ie-connection-preview" style={{ margin: 0 }}>
                <span className="pill pill-demo">Preview</span> Sign in to save to Quote Library. Totals update live while you
                type; Calculate validates with eliteOS when signed in.
              </p>
            ) : backendCalcOk === true ? (
              <p className="ie-connection-ok" style={{ margin: 0 }}>
                Live backend calculation connected.
              </p>
            ) : backendCalcOk === false && usedFallback ? (
              <p className="ie-connection-warn" style={{ margin: 0 }}>
                Live preview for totals — backend calculate did not connect. Tap Calculate to retry, or sign out and back in if
                save fails.
              </p>
            ) : (
              <p className="ie-connection-preview" style={{ margin: 0 }}>
                Signed in — live preview while typing; tap Calculate to validate with eliteOS before save.
              </p>
            )}
          </div>

          <div className="card ie-card-tight ie-pricing-bar">
            <span className="ie-pricing-label">Pricing mode</span>
            <div className="ie-pricing-toggle" role="group" aria-label="Pricing mode">
              <button
                type="button"
                className={internalPricingMode === "wholesale" ? "on" : ""}
                onClick={() => setInternalPricingMode("wholesale")}
              >
                Wholesale
              </button>
              <button
                type="button"
                className={internalPricingMode === "direct" ? "on" : ""}
                onClick={() => setInternalPricingMode("direct")}
              >
                Direct / Retail
              </button>
            </div>
          </div>

          <section id="sec-job" className="card">
            <h2 className="ie-section-title">Job Info</h2>
            <div className="grid3 ie-job-grid">
              <label>
                Account
                <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Direct" />
              </label>
              <label>
                Account contact phone
                <input value={accountPhone} onChange={(e) => setAccountPhone(e.target.value)} placeholder="Phone" />
              </label>
              <label>
                Account contact email
                <input value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} placeholder="Email" />
              </label>
              <label>
                Customer
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer or site" />
              </label>
              <label>
                Customer phone
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
              </label>
              <label>
                Customer email
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
              </label>
              <label>
                Elite job name
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Job name" />
              </label>
              <label>
                Project address
                <input value={projectAddress} onChange={(e) => setProjectAddress(e.target.value)} placeholder="Street address" />
              </label>
              <label>
                City
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
              </label>
              <label>
                State
                <input value={state} onChange={(e) => setState(e.target.value)} placeholder="IA" />
              </label>
              <label>
                Project type
                <input value={projectType} onChange={(e) => setProjectType(e.target.value)} />
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
                Salesperson <span className="muted">(required)</span>
                <select value={salesRep} onChange={(e) => setSalesRep(e.target.value)} required>
                  <option value="">— Select —</option>
                  {INTERNAL_SALES_REPS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Entered by
                <input value={enteredBy} onChange={(e) => setEnteredBy(e.target.value)} placeholder="Defaults from sign-in" />
              </label>
            </div>
          </section>

          <section id="sec-rooms" className="card">
            <h2 className="ie-section-title">Rooms / Areas</h2>
            <p className="muted small">
              Build each room: guided dimensions or manual sq ft, price group, optional catalog color or Color TBD in the picker.
            </p>
            <details className="ie-future-tools">
              <summary>Future tools</summary>
              <p className="muted small" style={{ margin: "8px 0 0" }}>
                Upload plans / AI takeoff and Visualize are on the roadmap — not in this workspace yet.
              </p>
            </details>
            <RoomScopeBuilder
              rooms={roomDrafts}
              onRoomsChange={setRoomDrafts}
              materialGroups={MATERIAL_GROUPS}
              eliteProgramColors={eliteColors}
              hideRapidLinear
            />
          </section>

          <section id="sec-addons" className="card">
            <h2 className="ie-section-title">Add-ons &amp; Custom Items</h2>
            <p className="muted small">
              Use presets or add custom lines. <strong>Customer-facing</strong> items appear on the estimate; <strong>internal-only</strong>{" "}
              lines count toward the total but stay out of customer-facing output.
            </p>
            <p className="muted small">Sink and fixture cutouts are set per room in the room builder.</p>

            <h3 className="h3">Show price group options on customer estimate</h3>
            <p className="muted small" style={{ marginTop: 4 }}>
              Choose only the alternate groups you want shown to the customer. Internal worksheet below can list every tier; customer
              print includes comparisons only for checked groups (default: none).
            </p>
            <div className="mode-row" style={{ flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              {MATERIAL_GROUPS.map((g) => (
                <label key={g} className="check" style={{ minWidth: 120 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(customerDisplayGroups[g])}
                    onChange={(e) => setCustomerDisplayGroups((prev) => ({ ...prev, [g]: e.target.checked }))}
                  />
                  {g}
                </label>
              ))}
            </div>
            {comparisonScopeMeta.mixedGroupNote ? (
              <p className="muted small" style={{ marginTop: -10, marginBottom: 16 }}>
                {comparisonScopeMeta.mixedGroupNote}
              </p>
            ) : null}

            <h3 className="h3">Structured custom line items</h3>
            <div className="mode-row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {CUSTOM_LINE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    setCustomLineRows((prev) => [
                      ...prev,
                      {
                        id: newInternalRowId(),
                        name: p.name,
                        description: p.description,
                        category: p.category,
                        qty: "1",
                        unitPrice: p.unitPrice,
                        customerFacing: p.customerFacing,
                        internalNote: "",
                        roomName: ""
                      }
                    ])
                  }
                >
                  + {p.name}
                </button>
              ))}
            </div>
            <p className="muted small">Discount lines need a negative unit price.</p>
              {customLineRows.map((row) => (
                <div key={row.id} className="grid3" style={{ marginBottom: 10, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
                  {!row.customerFacing ? (
                    <p className="muted small" style={{ gridColumn: "1 / -1", margin: 0 }}>
                      <span className="pill pill-demo">Internal-only</span> Not marked customer-facing for snapshots.
                    </p>
                  ) : null}
                  <label>
                    Item name
                    <input
                      value={row.name}
                      onChange={(e) =>
                        setCustomLineRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, name: e.target.value } : x)))
                      }
                    />
                  </label>
                  <label>
                    Category
                    <select
                      value={row.category}
                      onChange={(e) =>
                        setCustomLineRows((prev) =>
                          prev.map((x) => (x.id === row.id ? { ...x, category: e.target.value as CustomLineRow["category"] } : x))
                        )
                      }
                    >
                      {CUSTOM_LINE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Qty
                    <input
                      value={row.qty}
                      onChange={(e) => setCustomLineRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, qty: e.target.value } : x)))}
                      inputMode="decimal"
                    />
                  </label>
                  <label>
                    Unit price ($)
                    <input
                      value={row.unitPrice}
                      onChange={(e) =>
                        setCustomLineRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, unitPrice: e.target.value } : x)))
                      }
                      inputMode="decimal"
                    />
                  </label>
                  <label>
                    Room (optional)
                    <input
                      value={row.roomName}
                      onChange={(e) =>
                        setCustomLineRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, roomName: e.target.value } : x)))
                      }
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={row.customerFacing}
                      onChange={(e) =>
                        setCustomLineRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, customerFacing: e.target.checked } : x)))
                      }
                    />
                    Customer-facing
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Description / note
                    <input
                      value={row.description}
                      onChange={(e) =>
                        setCustomLineRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, description: e.target.value } : x)))
                      }
                    />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Internal note
                    <input
                      value={row.internalNote}
                      onChange={(e) =>
                        setCustomLineRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, internalNote: e.target.value } : x)))
                      }
                    />
                  </label>
                  <button type="button" className="btn secondary" onClick={() => setCustomLineRows((prev) => prev.filter((x) => x.id !== row.id))}>
                    Remove line
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  setCustomLineRows((prev) => [
                    ...prev,
                    {
                      id: newInternalRowId(),
                      name: "",
                      description: "",
                      category: "Other",
                      qty: "1",
                      unitPrice: "0",
                      customerFacing: true,
                      internalNote: "",
                      roomName: ""
                    }
                  ])
                }
              >
                + Add custom line item
              </button>
            </section>

            <section className="card">
              <h2>Drawing / file checklist</h2>
              <p className="muted small">
                File upload/storage will be added later — list filenames or links your team should expect for ESF review.
              </p>
              <div className="grid3">
                <label>
                  Cabinet plans / drawings
                  <input value={cabinetPlansNote} onChange={(e) => setCabinetPlansNote(e.target.value)} placeholder="e.g. Smith-kitchen.pdf" />
                </label>
                <label>
                  Site photos
                  <input value={sitePhotosNote} onChange={(e) => setSitePhotosNote(e.target.value)} placeholder="List or describe" />
                </label>
                <label>
                  Sink / faucet / appliance specs
                  <input value={fixtureSpecsNote} onChange={(e) => setFixtureSpecsNote(e.target.value)} placeholder="Model numbers, etc." />
                </label>
              </div>
            </section>

            <section id="sec-review" className="card">
              <h2 className="ie-section-title">Review</h2>
              <p className="muted small">
                Readiness feeds snapshots — it does not block Calculate or Save in this build.
              </p>
              <p>
                <strong>Score:</strong> {readinessSnapshot.score}% ·{" "}
                <strong>{readinessSnapshot.readyForReview ? "Ready for ESF review" : "Needs info"}</strong>
              </p>
              {readinessSnapshot.warnings.length ? (
                <div className="warn-box" style={{ marginTop: 10 }}>
                  <strong>Notes</strong>
                  <ul>
                    {readinessSnapshot.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {readinessSnapshot.missing.length ? (
                <ul className="muted small">
                  {readinessSnapshot.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : (
                <p className="ok small">Core fields look complete — still verify sinks, edges, and site readiness before sold handoff.</p>
              )}
            </section>

            <div id="sec-output" className="internal-print-sheet card">
              <h2>Internal worksheet (staff)</h2>
              <p className="muted small">
                On-screen staff reference only. Use <strong>Print customer estimate</strong> for homeowner PDF — it excludes
                internal tiers, math check, and diagnostics.
              </p>
              <p>
                <strong>Account:</strong> {accountName || "—"} · <strong>Project address:</strong> {projectAddress || "—"}
              </p>
              <p>
                <strong>Customer:</strong> {customerName || "—"} · <strong>Elite job:</strong> {projectName || "—"} · {city}, {state}
              </p>
              <p>
                <strong>Branch:</strong> {branch} · <strong>Rep:</strong> {salesRep || "—"} · <strong>Entered by:</strong> {enteredBy || "—"}
              </p>
              <p>
                <strong>Pricing mode:</strong> {internalPricingMode === "wholesale" ? "Wholesale" : "Direct / Retail"} ·{" "}
                <strong>Workflow:</strong> {workflowLabel(INTERNAL_ESTIMATE_WORKFLOW)}
              </p>
              {apiPartner?.snapshot?.material_breakdown?.length ? (
                <>
                  <h3 className="h3">Material / color breakdown</h3>
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th>Room</th>
                        <th>Piece</th>
                        <th>Group</th>
                        <th>Color</th>
                        <th>Sf</th>
                        <th>Wholesale $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(apiPartner.snapshot.material_breakdown as Record<string, unknown>[]).map((ln, i) => (
                        <tr key={i}>
                          <td>{String(ln.room ?? "")}</td>
                          <td>{String(ln.piece ?? "")}</td>
                          <td>{String(ln.materialGroup ?? "")}</td>
                          <td>{String(ln.materialColor ?? "")}</td>
                          <td>{Number(ln.sqft ?? 0).toFixed(2)}</td>
                          <td>${Number(ln.wholesaleSubtotal ?? 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
              <h3 className="h3" style={{ marginTop: 20 }}>
                Internal — all price groups ({internalPricingMode === "wholesale" ? "wholesale $/sf" : "ESF Direct $/sf"}, no markup %)
              </h3>
              <p className="muted small">
                Estimator comparison only — material columns use countertop sf and backsplash + FHB sf at each tier rate. Full total adds
                room fixed add-ons and structured custom lines (same for every group row). Your selected mixed-material quote follows
                Quoted Material Breakdown / backend calculate.
              </p>
              <table className="print-table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Rate $/sf</th>
                    <th>Countertop material $</th>
                    <th>Backsplash + FHB material $</th>
                    <th>Material total $</th>
                    <th>Full estimate $</th>
                  </tr>
                </thead>
                <tbody>
                  {internalGroupComparison.map((row) => (
                    <tr key={row.group}>
                      <td>{row.group}</td>
                      <td>{row.ratePerSqft.toFixed(2)}</td>
                      <td>${row.materialCounter.toFixed(2)}</td>
                      <td>${row.materialSplashFhb.toFixed(2)}</td>
                      <td>${row.materialTotal.toFixed(2)}</td>
                      <td>${row.fullTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="ie-customer-estimate-print" style={{ marginTop: 24 }}>
                <h3 className="h3">Customer estimate — selected price group comparisons</h3>
                <p className="muted small">
                  Estimator comparison only — each row applies one tier to all countertop sf and backsplash + FHB sf; it is not a second
                  mixed-material quote. Groups checked under &quot;Show price group options on customer estimate&quot; appear here. Quote
                  Library PDF handoff will reuse this list when that path ships.
                </p>
                {customerEstimateComparisonRows.length ? (
                  <table className="print-table">
                    <thead>
                      <tr>
                        <th>Group</th>
                        <th>Rate $/sf</th>
                        <th>Countertop material $</th>
                        <th>Backsplash + FHB material $</th>
                        <th>Material total $</th>
                        <th>Full estimate $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerEstimateComparisonRows.map((row) => (
                        <tr key={row.group}>
                          <td>{row.group}</td>
                          <td>{row.ratePerSqft.toFixed(2)}</td>
                          <td>${row.materialCounter.toFixed(2)}</td>
                          <td>${row.materialSplashFhb.toFixed(2)}</td>
                          <td>${row.materialTotal.toFixed(2)}</td>
                          <td>${row.fullTotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted small">No groups selected for customer-facing comparison (internal worksheet still shows all tiers above).</p>
                )}
              </div>

              <p style={{ marginTop: 16 }}>
                <strong>Estimate total (live preview, {internalPricingMode === "wholesale" ? "wholesale" : "ESF Direct"} book):</strong>{" "}
                {partRetail != null ? `$${Number(partRetail).toFixed(2)}` : "—"}
                {lastCalcLive && apiPartner?.totals?.retail != null ? (
                  <>
                    {" "}
                    · <strong>Last Calculate (backend):</strong> ${Number(apiPartner.totals.retail).toFixed(2)}
                  </>
                ) : null}
              </p>
              <p className="muted small">Elite Stone Fabrication — internal estimate. Not a homeowner contract.</p>
            </div>

          <div className="actions">
            <button type="button" className="btn secondary big" onClick={printCustomerEstimate}>
              Print customer estimate
            </button>
            <p className="ie-print-hint">
              For the cleanest PDF, turn off browser &ldquo;Headers and footers&rdquo; in the print dialog.
            </p>
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

          {usedFallback && sessionToken && backendCalcOk === false ? (
            <p className="muted small" style={{ margin: "0 0 12px" }}>
              Calculate used local preview math — save still requires a verified session and backend when available.
            </p>
          ) : null}

          {calcError ? <p className="error">{calcError}</p> : null}

          <section className="card math-check">
            <h2>Math check (live preview)</h2>
            <p className="muted small">
              Updates as you edit rooms, add-ons, custom lines, and pricing mode. Uses prototype rate books (wholesale or ESF Direct
              $/sf) with no markup percent — same model as the Calculate fallback. Backend response refines line items when connected.
            </p>
            <ul className="kv">
              <li>
                <span>Workflow</span>
                <strong>{liveEstimate.mathCheck.workflowLabel}</strong>
              </li>
              <li>
                <span>Qualifying countertop sf (vanity tier)</span>
                <strong>{liveEstimate.mathCheck.qualifyingSf.toFixed(2)}</strong>
              </li>
              <li>
                <span>Vanity tier</span>
                <strong>{liveEstimate.mathCheck.vanityTierLabel}</strong>
              </li>
              <li>
                <span>Countertop sf (totals)</span>
                <strong>{liveEstimate.mathCheck.countertopSf.toFixed(2)}</strong>
              </li>
              <li>
                <span>Backsplash sf</span>
                <strong>{liveEstimate.mathCheck.backsplashSf.toFixed(2)}</strong>
              </li>
              <li>
                <span>Full-height sf</span>
                <strong>{liveEstimate.mathCheck.fullHeightSf.toFixed(2)}</strong>
              </li>
              <li>
                <span>Total scope sf</span>
                <strong>{liveEstimate.mathCheck.totalScopeSf.toFixed(2)}</strong>
              </li>
              <li>
                <span>Primary group rate ({internalPricingMode === "wholesale" ? "wholesale book" : "ESF Direct"})</span>
                <strong>
                  {liveEstimate.mathCheck.primaryGroup} @ ${liveEstimate.mathCheck.groupRatePerSf}/sf
                </strong>
              </li>
              <li>
                <span>Estimate total (selected basis + extras)</span>
                <strong>${liveEstimate.mathCheck.wholesale.toFixed(2)}</strong>
              </li>
              <li>
                <span>No partner / public markup</span>
                <strong>Same total (${liveEstimate.mathCheck.retailOrPublic.toFixed(2)})</strong>
              </li>
            </ul>
            {liveEstimate.mathCheck.measurementLines.length ? (
              <div style={{ marginTop: 12 }}>
                <p className="section-lead">Measurement lines</p>
                <ul className="mini-lines">
                  {liveEstimate.mathCheck.measurementLines.map((ln, i) => (
                    <li key={i}>{ln}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {liveEstimate.allGroupMatrix?.length ? (
              <div style={{ marginTop: 14 }} className="lines">
                <strong>All-group totals at current scope ({internalPricingMode === "wholesale" ? "wholesale $/sf" : "ESF Direct $/sf"})</strong>
                <table>
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Counter $</th>
                      <th>Backsplash / FHB $</th>
                      <th>Room fixed add-ons $</th>
                      <th>Tier total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveEstimate.allGroupMatrix.map((row) => (
                      <tr key={row.group}>
                        <td>{row.group}</td>
                        <td>${row.counter.toFixed(2)}</td>
                        <td>${row.backsplash.toFixed(2)}</td>
                        <td>${row.fixed.toFixed(2)}</td>
                        <td>${row.wholesale.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {liveEstimate.mathCheck.warnings.length ? (
              <div className="warn-box" style={{ marginTop: 12 }}>
                <strong>Warnings</strong>
                <ul>
                  {liveEstimate.mathCheck.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="card">
            <p className="section-lead">Full breakdown</p>
            <h2>Internal detail</h2>
            <div className="internal-banner">
              <strong>Internal only — not public-facing.</strong> Totals use wholesale or ESF Direct rate books only (no partner or
              public markup percent).
            </div>
            <>
              {apiPartner?.totals ? (
                <ul className="kv">
                  <li>
                    <span>Quote path</span>
                    <strong>{workflowLabel(INTERNAL_ESTIMATE_WORKFLOW)}</strong>
                  </li>
                  <li>
                    <span>Estimate total (internal rate book)</span>
                    <strong>${Number(apiPartner.totals.retail ?? apiPartner.totals.wholesale ?? 0).toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Wholesale subtotal (same basis for internal_quote)</span>
                    <strong>${Number(apiPartner.totals.wholesale ?? 0).toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Estimated sq ft</span>
                    <strong>{Number(apiPartner.totals.estimated_sqft ?? 0).toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Material group</span>
                    <strong>{topMaterialGroup}</strong>
                  </li>
                </ul>
              ) : demoResult ? (
                <ul className="kv">
                  <li>
                    <span>Quote path</span>
                    <strong>{workflowLabel(INTERNAL_ESTIMATE_WORKFLOW)}</strong>
                  </li>
                  <li>
                    <span>Estimate total (local preview)</span>
                    <strong>${demoResult.retail.toFixed(2)}</strong>
                  </li>
                  <li>
                    <span>Wholesale field (demo payload)</span>
                    <strong>${(demoResult.wholesale ?? 0).toFixed(2)}</strong>
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
                <p className="muted">
                  Live preview totals appear in the sticky summary and math check. Tap <strong>Calculate</strong> for backend line
                  items when signed in.
                </p>
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
              <p className="muted small">Totals reflect your pricing mode and room scope.</p>
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

          <section id="sec-save" className="card">
            <h2 className="ie-section-title">Save</h2>
            {submitMsg ? <p>{submitMsg}</p> : <p className="muted">Submit saves to eliteOS when you’re signed in and quote tables are installed.</p>}
            {lastSavedQuoteNumber ? (
              <p style={{ marginTop: 8 }}>
                <a
                  className="btn secondary"
                  href={lastSavedQuoteId ? `${quoteLibraryUrl}/?quoteId=${encodeURIComponent(lastSavedQuoteId)}` : `${quoteLibraryUrl}/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View in Quote Library
                </a>
                <span className="muted small" style={{ marginLeft: 12 }}>
                  Saved as <strong>{lastSavedQuoteNumber}</strong> — search by quote # or customer in the library.
                </span>
              </p>
            ) : null}
          </section>

          <details className="card ie-diagnostics">
            <summary>Diagnostics</summary>
            <p className="muted small" style={{ marginTop: 6 }}>
              Backend base URL for this session (troubleshooting).
            </p>
            <p className="muted small mono" style={{ wordBreak: "break-all", marginTop: 6 }}>
              {backendHint}
            </p>
            {submitDiagnostic ? (
              <pre className="preview" style={{ marginTop: 10 }}>
                {submitDiagnostic}
              </pre>
            ) : null}
          </details>

        </main>

        <aside className="ie-aside side-col">
          <div className="summary-card">
            <h2>Estimator summary</h2>
            <div className="summary-rows" style={{ marginBottom: 8 }}>
              <div className="summary-row">
                <span>Pricing mode</span>
                <strong>{internalPricingMode === "wholesale" ? "Wholesale" : "Direct / Retail"}</strong>
              </div>
              <div className="summary-row">
                <span>Countertop material</span>
                <strong>${stickyLiveRollup.countertopMaterial.toFixed(2)}</strong>
              </div>
              <div className="summary-row">
                <span>Backsplash material</span>
                <strong>${stickyLiveRollup.backsplashMaterial.toFixed(2)}</strong>
              </div>
              <div className="summary-row">
                <span>Room add-ons / fixtures</span>
                <strong>${stickyLiveRollup.roomAddOnsFixtures.toFixed(2)}</strong>
              </div>
              <div className="summary-row">
                <span>Structured custom lines</span>
                <strong>${stickyLiveRollup.structuredCustomLines.toFixed(2)}</strong>
              </div>
              {internalOnlyAdjustDollars !== 0 ? (
                <div className="summary-row">
                  <span>Internal-only adjustments</span>
                  <strong>${internalOnlyAdjustDollars.toFixed(2)}</strong>
                </div>
              ) : null}
            </div>
            <p className="muted small" style={{ margin: "0 0 8px" }}>
              Live totals use the same mixed piece/room groups as <strong>Quoted Material Breakdown</strong> / customer print.
              {stickyLiveRollup.rollupMismatch ? (
                <>
                  {" "}
                  <span style={{ color: "#b45309" }}>Roll-up sanity check differs from engine total — report this quote.</span>
                </>
              ) : null}
            </p>
            <p className="summary-kicker">Estimate total (rate book, no markup %)</p>
            <p className="summary-hero-value">{partRetail != null ? `$${Number(partRetail).toFixed(2)}` : "—"}</p>
            {lastCalcLive && serverRetailVerified != null ? (
              <p className="summary-secondary muted small">
                Last Calculate (backend): <strong>${serverRetailVerified.toFixed(2)}</strong>
              </p>
            ) : (
              <p className="summary-secondary muted small">Live preview — tap Calculate to refresh from eliteOS when signed in.</p>
            )}
            <div className="summary-rows">
              <div className="summary-row">
                <span>Estimated sq ft (engine)</span>
                <strong>{Number(partSqft ?? 0).toFixed(2)}</strong>
              </div>
              <div className="summary-row">
                <span>Countertop sf (scope)</span>
                <strong>{scopePreview.counterSf.toFixed(2)}</strong>
              </div>
              <div className="summary-row">
                <span>Backsplash + FHB sf (scope)</span>
                <strong>{(scopePreview.splashSf + scopePreview.fhbSf).toFixed(2)}</strong>
              </div>
              <div className="summary-row">
                <span>Total sf (scope)</span>
                <strong>{scopePreview.totalSf.toFixed(2)}</strong>
              </div>
              <div className="summary-row">
                <span>Primary price group</span>
                <strong>
                  {topMaterialGroup}
                  {quoteDefaultCatalogId && eliteColors.find((c) => c.id === quoteDefaultCatalogId)
                    ? ` · ${eliteColors.find((c) => c.id === quoteDefaultCatalogId)?.colorName ?? ""}`
                    : colorTbd
                      ? " · Color TBD"
                      : " · per room"}
                </strong>
              </div>
              <div className="summary-row">
                <span>Customer comparison groups</span>
                <strong>
                  {customerEstimateComparisonRows.length
                    ? customerEstimateComparisonRows.map((r) => r.group).join(", ")
                    : "None selected"}
                </strong>
              </div>
              <div className="summary-row">
                <span>Readiness</span>
                <strong>
                  {readinessSnapshot.score}% — {readinessSnapshot.readyForReview ? "complete" : "missing items"}
                </strong>
              </div>
              {apiPartner?.snapshot?.material_breakdown?.length ? (
                <div className="summary-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                  <span>Material / color mix (last Calculate)</span>
                  <ul className="muted small" style={{ margin: 0, paddingLeft: 16 }}>
                    {(apiPartner.snapshot.material_breakdown as Record<string, unknown>[]).slice(0, 8).map((ln, i) => (
                      <li key={i}>
                        {String(ln.room ?? "")} · {String(ln.materialGroup ?? "")}
                        {ln.materialColor ? ` · ${String(ln.materialColor)}` : ""} — {Number(ln.sqft ?? 0).toFixed(1)} sf
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="internal-badge">Internal — not customer-facing</div>
            <p className="summary-foot">Sticky total follows your edits; Calculate confirms backend line items.</p>
            <p className="summary-foot muted small">Use the math check panel for tier and measurement detail.</p>
            {lastCalcLive ? <p className="summary-foot">Live API response</p> : null}
            <div className="summary-actions" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" className="btn primary" disabled={calcBusy} onClick={() => void handleCalculate()}>
                {calcBusy ? "Calculating…" : "Calculate"}
              </button>
              <button type="button" className="btn secondary" disabled={submitBusy} onClick={() => void handleSubmit()}>
                {submitBusy ? "Saving…" : "Save to Quote Library"}
              </button>
              <button type="button" className="btn secondary" onClick={printCustomerEstimate}>
                Print customer estimate
              </button>
              <p className="ie-print-hint">
                For the cleanest PDF, turn off browser &ldquo;Headers and footers&rdquo; in the print dialog.
              </p>
              <a className="btn secondary" href={`${quoteLibraryUrl}/`} target="_blank" rel="noreferrer">
                Open Quote Library
              </a>
            </div>
          </div>
        </aside>
      </div>

      <footer className="footer">eliteOS Internal Estimate Head · Elite Stone Fabrication · {new Date().getFullYear()}</footer>
      </div>

      <CustomerEstimatePrint
        accountName={accountName}
        customerName={customerName}
        projectName={projectName}
        projectAddress={projectAddress}
        city={city}
        state={state}
        branch={branch}
        salesRep={salesRep}
        preparedBy={enteredBy}
        quoteNumber={lastSavedQuoteNumber}
        primaryGroup={topMaterialGroup}
        primaryColorLabel={primaryColorLabel}
        colorTbd={colorTbd}
        measuredRooms={liveEstimate.measuredRooms}
        selectedBreakdown={selectedMaterialBreakdown}
        visibleLineItems={visibleCustomerLines}
        visibleRoomAddons={visibleRoomAddons}
        internalOnlyAdjustDollars={internalOnlyAdjustDollars}
        estimateTotalExact={estimateTotalExact}
        comparisonRows={customerEstimateComparisonRows}
        estimateDate={new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
      />
    </div>
  );
}
