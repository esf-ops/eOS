import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGetJson, apiPostJson, ApiError } from "@quote-lib/api";
import { roundCustomerDisplay } from "@quote-lib/customerDisplayRounding";
import { config, EOS_LOGO_URL } from "@quote-lib/config";
import type { DemoCalculateResult } from "@quote-lib/demoFallback";
import { qualifyingSfFromRoomDrafts, round2 } from "@quote-lib/measurementEngine";
import {
  aggregateComparisonScope,
  buildCustomerRoomAreaCostBreakdown,
  buildInternalEstimateGroupComparison,
  buildSelectedMaterialBreakdown,
  calculateAllRoomDrafts,
  computeLocalUpgradedEdgeTotal,
  createEstimatorRoom,
  hydrateRoomDraftsFromInternalUi,
  mergeRoomDraftsIntoGlobalAddOns,
  roomEditorDomId,
  roomsNeedLocalVanityMath,
  INTERNAL_ESTIMATE_MEASURE_OPTIONS,
  runLocalPrototypeQuote,
  serializeCustomerRoomAreaBreakdown,
  serializeRoomDraftsForInternalUi,
  serializeRoomsForApi,
  serializeVanitiesForApi,
  UPGRADED_EDGE_PROFILES,
  INTERNAL_ESTIMATE_ELITE_100_PROGRAM,
  normalizeInternalEstimateRoomDrafts
} from "@quote-lib/prototypeQuoteMath";
import { INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT } from "@quote-lib/internalEstimateMaterialTaxPolicy";
import type { EliteProgramColorRow, QuoteWorkflowMethod, RoomDraft } from "@quote-lib/quoteTypes";
import CustomerEstimatePrint, { type CustomerLineItem } from "./CustomerEstimatePrint";
import VisualLayoutCanvas, {
  type VisualLayoutEntry,
  visualCanvasSummaryStats,
  visualLayoutKeysForRooms
} from "./VisualLayoutCanvas";
import { resolveAccessToken } from "./lib/authSession";
import { QuoteFilesPanel } from "./QuoteFilesPanel";
import {
  buildCustomerEstimateDisplayModel
} from "./lib/customerEstimateDisplayModel";
import TakeoffImportReceiptPanel, {
  type TakeoffImportReceiptMeta,
} from "./components/internal-estimate/TakeoffImportReceiptPanel";
import TakeoffImportCompletionChecklist from "./components/internal-estimate/TakeoffImportCompletionChecklist";
import TakeoffMeasurementComparisonPanel from "./components/internal-estimate/TakeoffMeasurementComparisonPanel";
import TakeoffQuoteReadinessSummary from "./components/internal-estimate/TakeoffQuoteReadinessSummary";
import TakeoffSuggestedAddOnsReviewPanel from "./components/internal-estimate/TakeoffSuggestedAddOnsReviewPanel";
import TakeoffSourcePlanDrawer from "./components/internal-estimate/TakeoffSourcePlanDrawer";
import TakeoffFeedbackForm from "../../shared/eliteos-ui/TakeoffFeedbackForm";
import TakeoffIssueReportModal from "../../shared/eliteos-ui/TakeoffIssueReportModal";
import { submitTakeoffFeedback, submitTakeoffIssueReport } from "./lib/takeoffBetaApi";
import {
  computeTakeoffMeasurementDeltas,
} from "@quote-lib/takeoffImportMeasurements";
import {
  canMarkAllImportedRoomsVerified,
  evaluateTakeoffQuoteReadiness,
  initSuggestedAddOnReviews,
  markAllImportedRoomsVerified,
  markRoomFullyVerified,
  type TakeoffSuggestedAddOnReview,
} from "./lib/takeoffImportWorkflow";
import {
  evaluateTakeoffImportCompletionChecklist,
  isActiveTakeoffImport,
} from "./lib/takeoffImportChecklist";
import {
  buildCustomerEstimatePrintSnapshot,
  buildCustomerEstimatePrintSnapshotForSave,
  type CustomerEstimatePrintSnapshot
} from "./lib/customerEstimatePrintSnapshot";
import { splitInternalEstimateCustomLines } from "./lib/internalEstimateCustomLines";
import { friendlyApiErrorMessage } from "./lib/saveErrorMessage";
import { getSupabase } from "./lib/supabase";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import { useWorkflowRailScrollSpy } from "../../shared/eliteos-ui/useWorkflowRailScrollSpy";
import RoomScopeBuilder from "@quote-ui/RoomScopeBuilder";
import CompareGroupsAndNotesStep from "./components/internal-estimate/CompareGroupsAndNotesStep";
import EmailEstimateModal from "./components/email-estimate/EmailEstimateModal";
import { pickDefaultCcEmail, pickDefaultToEmail } from "@quote-lib/quoteDeliveryEmailDefaults";
import {
  canSaveBeforeCustomerOutput,
  getCustomerOutputBlockReason,
  UNSAVED_QUOTE_OUTPUT_MESSAGE
} from "./lib/quoteOutputGate";
import {
  resolveDefaultEnteredBy,
  shouldAutoApplyEnteredBy
} from "./lib/enteredByDefaults";

const MATERIAL_GROUPS = [
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F",
  "Remnant"
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
  { id: "sec-visual", label: "Visual layout" },
  { id: "sec-addons", label: "Add-ons & Custom Items" },
  { id: "sec-review", label: "Review" },
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
  /** Links fixture to a room draft for breakdown + print (preferred over roomName). */
  roomId: string;
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
  { key: "disc", name: "Discount / Credit", description: "", category: "Discount/Credit", unitPrice: "100", customerFacing: true },
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

type InternalSaveIntent = "create" | "update_existing" | "save_revision" | "save_as_new_quote";

type FamilyRevisionRow = {
  id: string;
  quote_number?: string | null;
  revision_number?: number | null;
  revision_label?: string | null;
  is_current_revision?: boolean | null;
};

function parseIsCurrentRevisionFlag(raw: unknown): boolean | null {
  if (raw === true) return true;
  if (raw === false) return false;
  return null;
}

function pickLatestFamilyRevision(revisions: FamilyRevisionRow[]): FamilyRevisionRow | null {
  if (!revisions.length) return null;
  const flagged = revisions.find((r) => r.is_current_revision === true);
  if (flagged) return flagged;
  return revisions.reduce<FamilyRevisionRow | null>((best, r) => {
    if (!best) return r;
    const bn = Number(best.revision_number) || 0;
    const rn = Number(r.revision_number) || 0;
    return rn >= bn ? r : best;
  }, null);
}

function isOpenedRevisionLatest(openedId: string, revisions: FamilyRevisionRow[], rowFlag: boolean | null): boolean {
  const latest = pickLatestFamilyRevision(revisions);
  if (latest?.id) return String(latest.id) === String(openedId);
  if (rowFlag === false) return false;
  if (rowFlag === true) return true;
  return true;
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

/**
 * Workspace identity constants — mirror the Home Launcher / Quote Library
 * pattern so the topbar + hero workspace panel render consistently across
 * heads without any new backend call. When `/api/me` becomes available to
 * Internal Estimate, `resolveWorkspaceLogoUrl` can be extended without
 * changing the UI.
 *
 * Resolution order (per docs/eliteos/eliteos-ui-direction.md §2.1):
 *   1. me.user.organization_logo_url       — not in scope here yet
 *   2. headsPayload.user.organization_logo_url — not in scope here yet
 *   3. Local Elite Stone Fabrication asset (EOS_LOGO_URL)
 *   4. Gradient initials text frame
 */
const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const DEFAULT_WORKSPACE_SHORT = "ESF";

function resolveWorkspaceName(): string {
  return DEFAULT_WORKSPACE_NAME;
}

function resolveWorkspaceShortId(): string {
  return DEFAULT_WORKSPACE_SHORT;
}

function resolveWorkspaceLogoUrl(): string | null {
  return EOS_LOGO_URL || null;
}

function workspaceInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "ES"
  );
}

/**
 * eliteOS Home / Launcher canonical URL used by the user menu's "Open Home"
 * action. Configurable via `VITE_HEAD_URL_HOME` for staging / local dev;
 * defaults to the production launcher domain documented in
 * `docs/eliteos/CURRENT_SYSTEM_MAP.md`.
 */
function homeLauncherUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_HOME ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}

/** UUID v1–v5 regex used to validate `?quoteId=` from the URL search string. */
const QUOTE_ID_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Synchronously read and validate `?quoteId=` from the current URL.
 * Returns the UUID string when present and valid, otherwise null.
 * Safe to call on the server (typeof window guard).
 */
function readQuoteIdFromSearch(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("quoteId");
  return q && QUOTE_ID_UUID_RE.test(q) ? q : null;
}

function readAiTakeoffHeadUrl(): string | null {
  const raw = String(
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_AI_TAKEOFF_HEAD_URL ?? ""
  ).trim();
  return raw || null;
}

function readFromTakeoffFromSearch(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("fromTakeoff");
  return q && QUOTE_ID_UUID_RE.test(q) ? q : null;
}


/**
 * Explicit quote-load lifecycle — avoids overloading `null` to mean both
 * "not requested" and "still loading".
 *
 *  not_requested — no ?quoteId= in the URL
 *  loading       — quoteId known, API call pending (auth may also be pending)
 *  loaded        — API returned the quote; form is hydrated
 *  failed        — API call errored or returned !ok
 */
type QuoteHydrationStatus = "not_requested" | "loading" | "loaded" | "failed";

/**
 * Derive a friendly display name from an email address (everything before
 * the `@`, with separators turned into spaces and word casing applied).
 * Falls back to the email itself when no `@` is present.
 *
 * No backend call required — works off `session.user.email` only.
 */
function userInitialsFor(name: string, email: string): string {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const e = String(email || "").trim();
  if (e) {
    const local = e.includes("@") ? e.split("@")[0] : e;
    const parts = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }
  return "ES";
}

export default function InternalEstimateApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  /**
   * Email + id come straight from the Supabase session.user object
   * (already kept up to date by `onAuthStateChange`). Role/title for the
   * topbar chip subtitle is fetched best-effort from `/api/me` (see
   * `userProfile`) — display-only, and never gates estimate data flow.
   */
  const [userEmail, setUserEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [userMetaName, setUserMetaName] = useState<string>("");
  /** Best-effort display-only role/title from `/api/me`. */
  const [userProfile, setUserProfile] = useState<{ role: string; jobTitle: string; department: string }>({
    role: "",
    jobTitle: "",
    department: ""
  });
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  /**
   * Flips to true once the first `supabase.auth.getSession()` promise resolves.
   * Starts true when supabase is not configured (no auth possible — treat as resolved).
   * This gates the initial render so we never paint the wrong workspace shell.
   */
  const [sessionResolved, setSessionResolved] = useState<boolean>(() => !getSupabase());
  /**
   * Flips to true once auth is resolved AND any pending initial quote hydration
   * has completed (or is not needed). After it flips it never goes back to false,
   * so mid-session re-hydrations (e.g. after Save Revision) do not hide the workspace.
   */
  const [initialBootDone, setInitialBootDone] = useState(false);

  const [roomDrafts, setRoomDrafts] = useState<RoomDraft[]>(() => [createEstimatorRoom("Group Promo")]);
  /** Drag/rotate positions only — never sent to calculator or pricing (see Visual Layout Canvas banner). */
  const [visualLayoutByPieceKey, setVisualLayoutByPieceKey] = useState<Record<string, VisualLayoutEntry>>({});
  /** Visual canvas expanded UI — default collapsed so quick quotes stay simple. */
  const [visualCanvasExpanded, setVisualCanvasExpanded] = useState(false);
  const [roomsSubnavOpen, setRoomsSubnavOpen] = useState(true);
  const [activeRoomNavId, setActiveRoomNavId] = useState<string | null>(null);
  /** Scroll-derived active workflow section (purely visual — no fake state). */

  const [accountName, setAccountName] = useState("");
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
  const internalMeasureOptions = useMemo(
    () => ({
      ...INTERNAL_ESTIMATE_MEASURE_OPTIONS,
      materialProgramDefault: INTERNAL_ESTIMATE_ELITE_100_PROGRAM
    }),
    []
  );
  const [customerDisplayGroups, setCustomerDisplayGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MATERIAL_GROUPS.map((g) => [g, false]))
  );
  const [comparisonGroupColorLabels, setComparisonGroupColorLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries(MATERIAL_GROUPS.map((g) => [g, ""]))
  );
  const [customerFacingNotes, setCustomerFacingNotes] = useState("");
  const [customLineRows, setCustomLineRows] = useState<CustomLineRow[]>([]);
  const [customLineUndo, setCustomLineUndo] = useState<CustomLineRow[] | null>(null);
  const [eliteColors, setEliteColors] = useState<EliteProgramColorRow[]>([]);
  const [colorCatalogWarnings, setColorCatalogWarnings] = useState<string[]>([]);
  const [quoteDefaultCatalogId, setQuoteDefaultCatalogId] = useState("");
  /**
   * Explicit quote-load lifecycle replaces the old boolean `loadedFromLibrary`.
   * Initialized synchronously from the URL so the first render knows whether
   * we will need to load a quote before showing the workspace.
   */
  const [quoteHydrationStatus, setQuoteHydrationStatus] = useState<QuoteHydrationStatus>(
    () => (readQuoteIdFromSearch() !== null ? "loading" : "not_requested")
  );
  const [hydrationGaps, setHydrationGaps] = useState<string[]>([]);
  const [lastSavedQuoteNumber, setLastSavedQuoteNumber] = useState<string | null>(null);
  const [lastSavedQuoteId, setLastSavedQuoteId] = useState<string | null>(null);

  const [quoteWorkflowStatus, setQuoteWorkflowStatus] = useState("draft");
  const [revisionNoteDraft, setRevisionNoteDraft] = useState("");
  const [saveIntent, setSaveIntent] = useState<InternalSaveIntent>("create");
  const [pendingSubmitIntent, setPendingSubmitIntent] = useState<InternalSaveIntent | null>(null);
  const [revisionBaselineSig, setRevisionBaselineSig] = useState<string | null>(null);
  const [hydratedIsCurrentRevision, setHydratedIsCurrentRevision] = useState<boolean | null>(null);
  const [hydratedDisplayRevision, setHydratedDisplayRevision] = useState<string | null>(null);
  const [quoteFamilyRootId, setQuoteFamilyRootId] = useState<string | null>(null);
  const [familyLatestQuoteId, setFamilyLatestQuoteId] = useState<string | null>(null);
  const [familyLatestQuoteNumber, setFamilyLatestQuoteNumber] = useState<string | null>(null);
  const [startNewQuoteModalOpen, setStartNewQuoteModalOpen] = useState(false);
  const [emailEstimateModalOpen, setEmailEstimateModalOpen] = useState(false);
  const [emailEstimateAutoPreview, setEmailEstimateAutoPreview] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);

  /** `?quoteId=` hydration — parsed synchronously so the first render already knows
   *  whether a quote needs to be loaded. `setUrlQuoteId` is still used post-save to
   *  update the URL-reflected ID without a page reload. Must be declared before
   *  `buildSubmitPayload` / save hooks (TDZ if referenced earlier). */
  const [urlQuoteId, setUrlQuoteId] = useState<string | null>(() => readQuoteIdFromSearch());
  const [urlFromTakeoffId, setUrlFromTakeoffId] = useState<string | null>(() => readFromTakeoffFromSearch());
  const [takeoffImportMeta, setTakeoffImportMeta] = useState<TakeoffImportReceiptMeta | null>(null);
  const [takeoffAddonsReviewed, setTakeoffAddonsReviewed] = useState(false);
  const [takeoffNotesReviewed, setTakeoffNotesReviewed] = useState(false);
  const [takeoffDetachBusy, setTakeoffDetachBusy] = useState(false);
  const [takeoffDetachError, setTakeoffDetachError] = useState<string | null>(null);
  const [takeoffFeedbackSubmitted, setTakeoffFeedbackSubmitted] = useState(false);
  const [takeoffFeedbackBusy, setTakeoffFeedbackBusy] = useState(false);
  const [takeoffIssueReportOpen, setTakeoffIssueReportOpen] = useState(false);
  const [takeoffShowFeedbackAfterSave, setTakeoffShowFeedbackAfterSave] = useState(false);
  const [takeoffSuggestedAddOnReviews, setTakeoffSuggestedAddOnReviews] = useState<TakeoffSuggestedAddOnReview[]>([]);
  const [takeoffCompactTable, setTakeoffCompactTable] = useState(true);
  const [takeoffSourceDrawerOpen, setTakeoffSourceDrawerOpen] = useState(false);

  useEffect(() => {
    if (!urlQuoteId) {
      setQuoteHydrationStatus("not_requested");
      setHydratedIsCurrentRevision(null);
      setHydratedDisplayRevision(null);
      setQuoteFamilyRootId(null);
      setFamilyLatestQuoteId(null);
      setFamilyLatestQuoteNumber(null);
      setRevisionBaselineSig(null);
      setSaveIntent("create");
      setQuoteWorkflowStatus("draft");
      setRevisionNoteDraft("");
      return;
    }
    setQuoteHydrationStatus("loading");
    setHydratedIsCurrentRevision(null);
    setSaveIntent((prev) => (prev === "create" ? "save_revision" : prev));
  }, [urlQuoteId]);

  /** Must sit before save/hydration callbacks that clear it after Save Revision / new quote id. */
  const hydrationRanRef = useRef(false);
  const revisionBaselineCapturedForQuoteRef = useRef<string | null>(null);
  const startNewAfterSaveRef = useRef<
    null | "save_revision" | "update_existing" | "restore" | "save_as_new_quote"
  >(null);
  const customerOutputAfterSaveRef = useRef<null | "print" | "email">(null);
  // Holds the latest customer-facing display total so buildSubmitPayload can read
  // it at call time without declaring it in its deps array. Writing to a ref in the
  // render body is a standard React escape-hatch for "always up-to-date" values.
  // (Declaring it in the deps array caused a TDZ crash in the production bundle
  //  because customerDisplayTotal is const-declared 558 lines below the useCallback.)
  const customerDisplayTotalRef = useRef(0);
  const customerPrintSnapshotRef = useRef<CustomerEstimatePrintSnapshot | null>(null);
  const customerEstimateDisplayRef = useRef(
    null as ReturnType<typeof buildCustomerEstimateDisplayModel> | null
  );
  // primaryColorLabel is const-declared below save hooks; read via ref to avoid TDZ in deps.
  const primaryColorLabelRef = useRef("");
  const pendingEmailModalAfterSaveRef = useRef(false);
  /** When false, fresh quotes auto-sync Entered by from the signed-in user. */
  const enteredByUserEditedRef = useRef(false);
  const defaultEnteredByRef = useRef("");

  const [calcBusy, setCalcBusy] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [vanityLocalNote, setVanityLocalNote] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [demoResult, setDemoResult] = useState<DemoCalculateResult | null>(null);
  const [apiPartner, setApiPartner] = useState<ApiPartnerResult | null>(null);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitDiagnostic, setSubmitDiagnostic] = useState<string | null>(null);
  const [customerOutputBlockMsg, setCustomerOutputBlockMsg] = useState<string | null>(null);
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
    setUserEmail("");
    setUserId("");
    setUserMetaName("");
    setUserProfile({ role: "", jobTitle: "", department: "" });
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    const applySession = (
      sess: {
        access_token?: string;
        user?: { id?: string; email?: string | null; user_metadata?: Record<string, unknown> } | null;
      } | null
    ) => {
      if (!alive) return;
      const tok = sess?.access_token ?? "";
      setSessionToken(tok || null);
      const u = sess?.user || null;
      setUserEmail(String(u?.email ?? ""));
      setUserId(String(u?.id ?? ""));
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const metaName =
        [meta.full_name, meta.name, meta.display_name]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .find((v) => Boolean(v)) || "";
      setUserMetaName(metaName);
    };

    void supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
      // Mark session as resolved so the boot gate knows we have our auth answer.
      if (alive) setSessionResolved(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => applySession(sess));

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  /**
   * Best-effort role/title fetch for the topbar chip subtitle. Non-fatal:
   * any failure leaves the subtitle on its email fallback. Does not touch
   * estimate data state. Mirrors the Quote Library / Pricing Admin pattern.
   */
  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    (async () => {
      try {
        const me = (await apiGetJson("/api/me", sessionToken)) as {
          user?: { role?: string; job_title?: string | null; department?: string | null };
        };
        if (cancelled) return;
        setUserProfile({
          role: String(me?.user?.role ?? "").trim(),
          jobTitle: String(me?.user?.job_title ?? "").trim(),
          department: String(me?.user?.department ?? "").trim()
        });
      } catch {
        /* non-fatal — chip subtitle falls back to email */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  /**
   * Derived flag — backwards-compat alias used widely in JSX below.
   * Do not re-add a `useState` for this; it is fully derived from `quoteHydrationStatus`.
   */
  const loadedFromLibrary = quoteHydrationStatus === "loaded";

  /**
   * Initial-boot gate: flips to `true` once we have an auth answer AND any
   * pending initial quote hydration is either done or unreachable (no session).
   * After it flips it never resets, so mid-session re-hydrations stay invisible.
   */
  useEffect(() => {
    if (initialBootDone) return;
    if (!sessionResolved) return;
    // If there is a quoteId and we have a session token, wait for hydration to finish.
    const hydrationPending =
      urlQuoteId !== null && sessionToken !== null && quoteHydrationStatus === "loading";
    if (!hydrationPending) setInitialBootDone(true);
  }, [initialBootDone, sessionResolved, sessionToken, urlQuoteId, quoteHydrationStatus]);

  const workflowSectionIds = useMemo(() => WORKFLOW_SECTIONS.map((s) => s.id), []);
  const setRailActiveSection = useWorkflowRailScrollSpy(workflowSectionIds, [roomDrafts.length]);

  const ensureAccessToken = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null;
    return resolveAccessToken(supabase);
  }, [supabase]);

  const printCustomerEstimate = useCallback(() => {
    window.print();
  }, []);

  const scrollToWorkflowSection = useCallback(
    (id: string) => {
      setRailActiveSection(id);
      if (id === "sec-visual") setVisualCanvasExpanded(true);
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [setRailActiveSection]
  );

  const scrollToRoomCard = useCallback(
    (roomId: string) => {
      setActiveRoomNavId(roomId);
      scrollToWorkflowSection("sec-rooms");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById(roomEditorDomId(roomId))?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    },
    [scrollToWorkflowSection]
  );

  const roomNavLabels = useMemo(
    () =>
      roomDrafts.map((r, i) => ({
        id: r.id,
        label: String(r.name || "").trim() || `Room ${i + 1}`
      })),
    [roomDrafts]
  );

  const topMaterialGroup = useMemo(() => roomDrafts[0]?.materialGroup ?? "Group Promo", [roomDrafts]);

  const buildRoomDraftsForCalculate = useCallback(
    (): RoomDraft[] => normalizeInternalEstimateRoomDrafts(roomDrafts),
    [roomDrafts]
  );

  useEffect(() => {
    const valid = visualLayoutKeysForRooms(roomDrafts);
    setVisualLayoutByPieceKey((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!valid.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [roomDrafts]);

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
      const { totals } = calculateAllRoomDrafts(
        drafts,
        projectType,
        internalPricingMode,
        0,
        internalMeasureOptions
      );
      countertopSqft = totals.priceableCounter;
      backsplashSqft = round2(totals.splash + totals.fhb);
    }
    const engine = apiRooms.length >= 1 ? "rooms" : "legacy";
    const customPassthroughItems: Array<{ description: string; price: number; qty: number }> = [];
    const customLineItems = customLineRows
      .map((row) => {
        const rawPrice = num(row.unitPrice);
        // Discount/Credit is always stored as a negative amount in the snapshot so the backend
        // and display model see a consistent canonical value, regardless of how the user typed it.
        const unitPrice = row.category === "Discount/Credit" && rawPrice !== 0 ? -Math.abs(rawPrice) : rawPrice;
        return {
          lineKey: row.id,
          name: row.name.trim(),
          description: row.description.trim(),
          category: row.category,
          quantity: num(row.qty) || 1,
          unitPrice,
          customerFacing: row.customerFacing,
          internalNote: row.internalNote.trim(),
          roomName: row.roomName.trim(),
          roomId: row.roomId.trim() || undefined
        };
      })
      .filter((row) => {
        if (!row.name || row.quantity <= 0) return false;
        // Discount/Credit is auto-negated above; exclude only when amount is zero.
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
      const { totals } = calculateAllRoomDrafts(
        draftsForReady,
        projectType,
        internalPricingMode,
        0,
        internalMeasureOptions
      );
      totalSfReady = round2(totals.counter + totals.splash + totals.fhb);
    }
    const missing: string[] = [];
    if (!accountName.trim()) missing.push("Account name");
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
    return {
      quoteSource: "internal_quote",
      materialGroup: topMaterialGroup,
      internalMaterialBasis: internalPricingMode,
      materialProgramDefault: INTERNAL_ESTIMATE_ELITE_100_PROGRAM,
      material_program_default: INTERNAL_ESTIMATE_ELITE_100_PROGRAM,
      customPassthroughItems,
      customLineItems,
      quoteDefaultMaterial,
      readiness,
      quote_workflow: INTERNAL_ESTIMATE_WORKFLOW,
      areas: { countertopSqft, backsplashSqft },
      addOns,
      engine,
      rooms: apiRooms,
      vanities: serializeVanitiesForApi(drafts, qualifyingSfFromRoomDrafts(drafts)),
      qualifyingKitchenCounterSf: qualifyingSfFromRoomDrafts(drafts),
      customerEstimateDisplayGroups: MATERIAL_GROUPS.filter((g) => customerDisplayGroups[g]),
      customerEstimateComparisonColorLabels: Object.fromEntries(
        MATERIAL_GROUPS.filter((g) => customerDisplayGroups[g] && comparisonGroupColorLabels[g]?.trim()).map((g) => [
          g,
          comparisonGroupColorLabels[g].trim()
        ])
      ),
      customerFacingNotes: customerFacingNotes.trim() || undefined,
      estimateRoomDrafts: serializeRoomDraftsForInternalUi(drafts),
      customerRoomAreaBreakdown: serializeCustomerRoomAreaBreakdown(
        buildCustomerRoomAreaCostBreakdown({
          roomDrafts: drafts,
          measuredRooms: calculateAllRoomDrafts(
            drafts,
            projectType,
            internalPricingMode,
            0,
            internalMeasureOptions
          ).rooms,
          materialBasis: internalPricingMode,
          measureOptions: internalMeasureOptions,
          customLines: customLineRows
            .filter((r) => r.name.trim())
            .map((r) => ({
              lineKey: r.id,
              name: r.name.trim(),
              quantity: num(r.qty) || 1,
              unitPrice: num(r.unitPrice),
              customerFacing: r.customerFacing,
              roomName: r.roomName.trim(),
              roomId: r.roomId.trim() || undefined,
              category: r.category
            })),
          projectColorTbd: colorTbd
        })
      ),
      colorTbd,
      useTaxPercent: INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT,
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
      },
      ...(takeoffImportMeta && isActiveTakeoffImport(takeoffImportMeta)
        ? {
            takeoff_import: takeoffImportMeta,
            takeoff_import_checklist: {
              addonsReviewed: takeoffAddonsReviewed,
              notesReviewed: takeoffNotesReviewed,
              suggestedAddOnReviews: takeoffSuggestedAddOnReviews,
              compactTakeoffTable: takeoffCompactTable,
            },
          }
        : {}),
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
    customerDisplayGroups,
    comparisonGroupColorLabels,
    customerFacingNotes,
    INTERNAL_ESTIMATE_ELITE_100_PROGRAM,
    takeoffImportMeta,
    takeoffAddonsReviewed,
    takeoffNotesReviewed,
    takeoffSuggestedAddOnReviews,
    takeoffCompactTable,
  ]);

  const takeoffImportChecklist = useMemo(() => {
    if (!takeoffImportMeta || !isActiveTakeoffImport(takeoffImportMeta)) return null;
    const drafts = roomDrafts;
    let totalSf = 0;
    if (drafts.length) {
      const { totals } = calculateAllRoomDrafts(
        drafts,
        projectType,
        internalPricingMode,
        0,
        internalMeasureOptions
      );
      totalSf = round2(totals.counter + totals.splash + totals.fhb);
    }
    return evaluateTakeoffImportCompletionChecklist({
      accountName,
      accountPhone,
      accountEmail,
      customerName,
      projectName,
      projectAddress,
      city,
      state,
      branch,
      salesRep,
      internalPricingMode,
      roomDrafts: drafts,
      colorTbd,
      quoteDefaultCatalogId,
      suggestedAddOnCount: takeoffImportMeta.suggestedAddOns?.length ?? 0,
      addonsReviewed: takeoffAddonsReviewed,
      suggestedAddOnReviews: takeoffSuggestedAddOnReviews,
      customerFacingNotes,
      notesReviewed: takeoffNotesReviewed,
      totalSf,
    });
  }, [
    takeoffImportMeta,
    roomDrafts,
    projectType,
    internalPricingMode,
    internalMeasureOptions,
    accountName,
    accountPhone,
    accountEmail,
    customerName,
    projectName,
    projectAddress,
    city,
    state,
    branch,
    salesRep,
    colorTbd,
    quoteDefaultCatalogId,
    takeoffAddonsReviewed,
    takeoffNotesReviewed,
    takeoffSuggestedAddOnReviews,
    customerFacingNotes,
  ]);

  const takeoffMeasurementDeltas = useMemo(() => {
    if (!takeoffImportMeta || !isActiveTakeoffImport(takeoffImportMeta)) return null;
    return computeTakeoffMeasurementDeltas(roomDrafts);
  }, [takeoffImportMeta, roomDrafts]);

  const takeoffQuoteReadiness = useMemo(() => {
    if (!takeoffImportMeta || !isActiveTakeoffImport(takeoffImportMeta) || !takeoffImportChecklist) return null;
    const accountComplete = takeoffImportChecklist.items.find((i) => i.key === "account")?.complete ?? false;
    const projectComplete = takeoffImportChecklist.items.find((i) => i.key === "project")?.complete ?? false;
    const materialComplete = takeoffImportChecklist.items.find((i) => i.key === "material")?.complete ?? false;
    return evaluateTakeoffQuoteReadiness({
      hasActiveImport: true,
      roomDrafts,
      measurementDeltas: takeoffMeasurementDeltas,
      colorTbd,
      quoteDefaultCatalogId,
      accountComplete,
      projectComplete,
      materialComplete,
      addonsReviewed: takeoffAddonsReviewed,
      notesReviewed: takeoffNotesReviewed,
      readyToCalculate: takeoffImportChecklist.readyToCalculate,
      suggestedAddOnReviews: takeoffSuggestedAddOnReviews,
    });
  }, [
    takeoffImportMeta,
    takeoffImportChecklist,
    roomDrafts,
    takeoffMeasurementDeltas,
    colorTbd,
    quoteDefaultCatalogId,
    takeoffAddonsReviewed,
    takeoffNotesReviewed,
    takeoffSuggestedAddOnReviews,
  ]);

  const handleMarkRoomVerified = useCallback((roomId: string) => {
    setRoomDrafts((prev) => prev.map((r) => (r.id === roomId ? markRoomFullyVerified(r) : r)));
  }, []);

  const handleMarkAllImportedRoomsVerified = useCallback(() => {
    if (!takeoffMeasurementDeltas || !canMarkAllImportedRoomsVerified(roomDrafts, takeoffMeasurementDeltas.exceedsThreshold)) {
      return;
    }
    setRoomDrafts((prev) => markAllImportedRoomsVerified(prev));
  }, [roomDrafts, takeoffMeasurementDeltas]);

  useEffect(() => {
    if (!takeoffImportMeta?.suggestedAddOns?.length) {
      setTakeoffSuggestedAddOnReviews([]);
      return;
    }
    setTakeoffSuggestedAddOnReviews((prev) => initSuggestedAddOnReviews(takeoffImportMeta.suggestedAddOns, prev));
  }, [takeoffImportMeta?.takeoffJobId, takeoffImportMeta?.suggestedAddOns?.length]);

  const handleDetachTakeoffImport = useCallback(async () => {
    if (!urlQuoteId || !sessionToken) return;
    if (!window.confirm("Remove imported takeoff rooms from this draft? Manual rooms are kept. The source takeoff job is not deleted.")) {
      return;
    }
    setTakeoffDetachBusy(true);
    setTakeoffDetachError(null);
    try {
      const token = await ensureAccessToken();
      if (!token) throw new Error("Session expired — sign in again.");
      const raw = (await apiPostJson(
        `/api/internal-quotes/${urlQuoteId}/detach-takeoff-import`,
        token,
        {}
      )) as Record<string, unknown>;
      if (raw.ok !== true) throw new Error(String(raw.error || "Detach failed"));
      hydrationRanRef.current = false;
      setQuoteHydrationStatus("loading");
      const reload = (await apiGetJson(`/api/internal-quotes/${urlQuoteId}`, token)) as Record<string, unknown>;
      if (reload.ok === true && reload.quote) {
        hydrationRanRef.current = true;
        const q = reload.quote as Record<string, unknown>;
        const snap = (q.calculation_snapshot as Record<string, unknown>) || {};
        const iu = (snap.internal_ui as Record<string, unknown>) || {};
        const ti = iu.takeoff_import as Record<string, unknown> | undefined;
        if (ti) {
          setTakeoffImportMeta((prev) =>
            prev
              ? {
                  ...prev,
                  status: ti.status != null ? String(ti.status) : "detached",
                  auditEvents: Array.isArray(ti.auditEvents)
                    ? (ti.auditEvents as TakeoffImportReceiptMeta["auditEvents"])
                    : prev.auditEvents,
                }
              : null
          );
        }
        const roomDraftsPayload = iu.estimate_room_drafts;
        const roomsPayload = iu.estimate_rooms;
        if (Array.isArray(roomDraftsPayload) && roomDraftsPayload.length) {
          setRoomDrafts(hydrateRoomDraftsFromInternalUi(roomDraftsPayload, roomsPayload));
        } else {
          setRoomDrafts([createEstimatorRoom("Group Promo")]);
        }
        setQuoteHydrationStatus("loaded");
        setSubmitMsg("Imported takeoff removed from this draft.");
      }
    } catch (e) {
      setTakeoffDetachError(friendlyApiErrorMessage(e, "detach-takeoff-import", "remove imported takeoff").userMessage);
    } finally {
      setTakeoffDetachBusy(false);
    }
  }, [urlQuoteId, sessionToken, ensureAccessToken]);

  const handleSubmitTakeoffFeedback = useCallback(
    async (payload: Parameters<typeof submitTakeoffFeedback>[2]) => {
      const jobId = takeoffImportMeta?.takeoffJobId;
      if (!jobId) return;
      const token = await ensureAccessToken();
      if (!token) return;
      setTakeoffFeedbackBusy(true);
      try {
        await submitTakeoffFeedback(token, jobId, {
          ...payload,
          quoteId: payload.quoteId ?? urlQuoteId,
        });
        setTakeoffFeedbackSubmitted(true);
        setTakeoffShowFeedbackAfterSave(false);
      } finally {
        setTakeoffFeedbackBusy(false);
      }
    },
    [takeoffImportMeta?.takeoffJobId, ensureAccessToken, urlQuoteId]
  );

  const handleSubmitTakeoffIssue = useCallback(
    async (payload: Parameters<typeof submitTakeoffIssueReport>[2]) => {
      const jobId = takeoffImportMeta?.takeoffJobId;
      if (!jobId) return;
      const token = await ensureAccessToken();
      if (!token) return;
      await submitTakeoffIssueReport(token, jobId, payload);
    },
    [takeoffImportMeta?.takeoffJobId, ensureAccessToken]
  );

  const computeRevisionBaselineSig = useCallback((): string => {
    const p = buildCalcPayload();
    return JSON.stringify({
      rooms: p.rooms,
      estimateRoomDrafts: p.estimateRoomDrafts,
      vanities: p.vanities,
      customLineItems: p.customLineItems,
      areas: p.areas,
      internalMaterialBasis: p.internalMaterialBasis,
      materialGroup: p.materialGroup,
      customerEstimateDisplayGroups: p.customerEstimateDisplayGroups,
      customerEstimateComparisonColorLabels: p.customerEstimateComparisonColorLabels,
      customerFacingNotes: p.customerFacingNotes ?? "",
      quoteDefaultMaterial: p.quoteDefaultMaterial,
      customerName: customerName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      projectName: projectName.trim(),
      projectAddress: projectAddress.trim(),
      city: city.trim(),
      state: state.trim(),
      branch: branch.trim(),
      salesRep: salesRep.trim(),
      accountName: accountName.trim(),
      quoteWorkflowStatus: quoteWorkflowStatus.trim(),
      colorTbd,
      useTaxPercent: INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT
    });
  }, [
    buildCalcPayload,
    customerName,
    email,
    phone,
    projectName,
    projectAddress,
    city,
    state,
    branch,
    salesRep,
    accountName,
    quoteWorkflowStatus,
    colorTbd
  ]);

  const revisionDirty = useMemo(() => {
    if (!revisionBaselineSig) return true;
    return computeRevisionBaselineSig() !== revisionBaselineSig;
  }, [revisionBaselineSig, computeRevisionBaselineSig]);

  const effectiveQuoteHeaderId = lastSavedQuoteId ?? urlQuoteId;
  const effectiveQuoteNumber =
    lastSavedQuoteNumber?.trim() || familyLatestQuoteNumber?.trim() || null;

  const customerOutputGateInput = useMemo(
    () => ({
      sessionToken,
      quoteHeaderId: effectiveQuoteHeaderId,
      quoteNumber: effectiveQuoteNumber,
      hydratedIsCurrentRevision,
      revisionDirty,
      revisionNoteDraft,
      submitBusy,
      restoreBusy
    }),
    [
      sessionToken,
      effectiveQuoteHeaderId,
      effectiveQuoteNumber,
      hydratedIsCurrentRevision,
      revisionDirty,
      revisionNoteDraft,
      submitBusy,
      restoreBusy
    ]
  );

  const customerOutputBlockReason = useMemo(
    () => getCustomerOutputBlockReason(customerOutputGateInput),
    [customerOutputGateInput]
  );

  const saveRevisionBlockReason = useMemo(() => {
    if (!urlQuoteId) return null;
    if (!sessionToken) return "Sign in to save revisions to Quote Library.";
    if (hydratedIsCurrentRevision === null) return "Loading quote metadata…";
    if (hydratedIsCurrentRevision === false) {
      return "Older revision open — use Restore as new revision (same ESF family) or open the latest revision.";
    }
    if (submitBusy) return "Save in progress…";
    if (!revisionDirty && !revisionNoteDraft.trim()) return "No changes to save as revision.";
    return null;
  }, [urlQuoteId, sessionToken, hydratedIsCurrentRevision, submitBusy, revisionDirty, revisionNoteDraft]);

  const updateQuoteBlockReason = useMemo(() => {
    if (!urlQuoteId) return null;
    if (!sessionToken) return "Sign in to update this quote.";
    if (hydratedIsCurrentRevision === null) return "Loading quote metadata…";
    if (hydratedIsCurrentRevision === false) {
      return "This revision is read-only. Open the latest revision from Quote Library.";
    }
    if (submitBusy) return "Save in progress…";
    return null;
  }, [urlQuoteId, sessionToken, hydratedIsCurrentRevision, submitBusy]);

  const savePanelPrimaryBlockReason = useMemo(() => {
    if (!urlQuoteId) {
      if (!sessionToken) return "Sign in to save a new estimate.";
      if (submitBusy || restoreBusy) return "Save in progress…";
      return null;
    }
    if (hydratedIsCurrentRevision === false) return null;
    if (saveIntent === "save_revision") return saveRevisionBlockReason;
    if (saveIntent === "update_existing") return updateQuoteBlockReason;
    if (saveIntent === "save_as_new_quote") {
      if (!sessionToken) return "Sign in to save.";
      if (submitBusy || restoreBusy) return "Save in progress…";
      return null;
    }
    return updateQuoteBlockReason;
  }, [
    urlQuoteId,
    sessionToken,
    submitBusy,
    restoreBusy,
    saveIntent,
    saveRevisionBlockReason,
    updateQuoteBlockReason,
    hydratedIsCurrentRevision
  ]);

  const restoreRevisionBlockReason = useMemo(() => {
    if (!urlQuoteId) return null;
    if (!sessionToken) return "Sign in to restore a revision.";
    if (hydratedIsCurrentRevision === null) return "Loading quote metadata…";
    if (hydratedIsCurrentRevision !== false) return "This revision is already the latest.";
    if (submitBusy || restoreBusy) return "Save in progress…";
    return null;
  }, [urlQuoteId, sessionToken, hydratedIsCurrentRevision, submitBusy, restoreBusy]);

  const emailEstimateQuoteId = effectiveQuoteHeaderId;

  const emailEstimateBlockReason = customerOutputBlockReason;

  const emailEstimateDefaultSubject = useMemo(() => {
    const qn = lastSavedQuoteNumber?.trim();
    const proj = projectName.trim();
    const cust = customerName.trim();
    let subject = "Elite Stone Fabrication Estimate";
    if (qn) subject += ` ${qn}`;
    if (cust) subject += ` for ${cust}`;
    else if (proj) subject += ` — ${proj}`;
    return subject;
  }, [lastSavedQuoteNumber, projectName, customerName]);

  const emailEstimateDefaultTo = useMemo(
    () =>
      pickDefaultToEmail({
        customerEmail: email,
        accountContactEmail: accountEmail
      }),
    [email, accountEmail]
  );

  const emailEstimateDefaultCc = useMemo(
    () =>
      pickDefaultCcEmail({
        salesRep,
        enteredBy,
        sessionUserEmail: userEmail,
        toEmail: emailEstimateDefaultTo
      }),
    [salesRep, enteredBy, userEmail, emailEstimateDefaultTo]
  );

  const hasUnsavedWork = useMemo(() => {
    if (urlQuoteId) return revisionDirty || Boolean(revisionNoteDraft.trim());
    const hasCustomer = Boolean(
      customerName.trim() ||
        projectName.trim() ||
        projectAddress.trim() ||
        Boolean(accountName.trim()) ||
        salesRep.trim()
    );
    const hasRooms =
      roomDrafts.length > 1 ||
      roomDrafts.some((r) => r.name !== "Kitchen" || r.calcMode !== "Guided Shape" || (r.guidedPieces?.length ?? 0) > 0);
    return hasCustomer || hasRooms || customLineRows.length > 0;
  }, [
    urlQuoteId,
    revisionDirty,
    revisionNoteDraft,
    customerName,
    projectName,
    projectAddress,
    accountName,
    salesRep,
    roomDrafts,
    customLineRows.length
  ]);

  const applyPostSaveQuoteIdentity = useCallback(
    (qid: string, qn: string, revLab: string, isCurrent: boolean, saveMode: string) => {
      setLastSavedQuoteNumber(qn || null);
      setLastSavedQuoteId(qid && qid !== "undefined" ? qid : null);
      if (saveMode === "save_revision" || saveMode === "restore") {
        setSaveIntent("save_revision");
      } else if (saveMode === "save_as_new_quote" || saveMode === "create") {
        setSaveIntent("update_existing");
      } else if (saveMode === "update_existing") {
        setSaveIntent("save_revision");
      }
      if (qid && saveMode !== "update_existing") {
        hydrationRanRef.current = false;
        revisionBaselineCapturedForQuoteRef.current = null;
        setUrlQuoteId(qid);
        const u = new URL(window.location.href);
        u.searchParams.set("quoteId", qid);
        window.history.replaceState({}, "", `${u.pathname}?${u.searchParams.toString()}${u.hash}`);
        setHydratedIsCurrentRevision(true);
        setQuoteHydrationStatus("loaded");
        setFamilyLatestQuoteId(qid);
        if (qn) setFamilyLatestQuoteNumber(qn);
      } else if (saveMode === "update_existing") {
        setHydratedIsCurrentRevision(isCurrent);
      }
      if (qn) {
        const hist = !isCurrent ? " · historical revision" : "";
        setHydratedDisplayRevision(`${qn}${revLab && !qn.includes(revLab) ? ` · ${revLab}` : ""}${hist}`);
      }
      setRevisionBaselineSig(computeRevisionBaselineSig());
    },
    [computeRevisionBaselineSig]
  );

  const runLocalFromDrafts = useCallback(() => {
    const drafts = buildRoomDraftsForCalculate();
    const wf = workflowLabel(INTERNAL_ESTIMATE_WORKFLOW);
    let customLineSum = 0;
    for (const r of customLineRows) {
      const q = num(r.qty) || 1;
      const p = num(r.unitPrice);
      if (!r.name.trim() || q <= 0) continue;
      if (r.category === "Discount/Credit") {
        if (p !== 0) customLineSum += q * -Math.abs(p); // auto-negate: positive entry = credit
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
      customLineItemsTotal: round2(customLineSum),
      materialProgramDefault: INTERNAL_ESTIMATE_ELITE_100_PROGRAM
    });
    setUsedFallback(true);
    setApiPartner(null);
    setDemoResult(localRunToDemo(lr));
  }, [
    buildRoomDraftsForCalculate,
    topMaterialGroup,
    projectType,
    internalPricingMode,
    customLineRows,
    INTERNAL_ESTIMATE_ELITE_100_PROGRAM
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

  const buildSubmitPayload = useCallback((saveModeOverride?: InternalSaveIntent) => {
    const base = {
      ...buildCalcPayload(),
      customerDisplayTotal: customerDisplayTotalRef.current,
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
      quote_status: quoteWorkflowStatus.trim() || "draft"
    };
    if (urlQuoteId) {
      const mode = saveModeOverride ?? saveIntent;
      return {
        ...base,
        quote_id: urlQuoteId,
        save_mode: mode,
        revision_note: revisionNoteDraft.trim() || null
      };
    }
    return { ...base, save_mode: "create" as const };
  }, [
    buildCalcPayload,
    customerName,
    email,
    phone,
    projectType,
    projectName,
    projectAddress,
    city,
    state,
    branch,
    salesRep,
    enteredBy,
    quoteWorkflowStatus,
    urlQuoteId,
    saveIntent,
    revisionNoteDraft
  ]);

  const savePrimaryLabel = useMemo(() => {
    if (!urlQuoteId) return "Save quote";
    if (hydratedIsCurrentRevision === false) return "Restore as new revision";
    if (saveIntent === "update_existing") return "Update current revision";
    if (saveIntent === "save_revision") return "Save revision";
    if (saveIntent === "save_as_new_quote") return "Save as separate new quote";
    return "Save quote";
  }, [urlQuoteId, saveIntent, hydratedIsCurrentRevision]);

  const openLatestRevisionInPlace = useCallback(() => {
    if (!familyLatestQuoteId || familyLatestQuoteId === urlQuoteId) return;
    hydrationRanRef.current = false;
    revisionBaselineCapturedForQuoteRef.current = null;
    setUrlQuoteId(familyLatestQuoteId);
    const u = new URL(window.location.href);
    u.searchParams.set("quoteId", familyLatestQuoteId);
    window.history.replaceState({}, "", `${u.pathname}?${u.searchParams.toString()}${u.hash}`);
    setSubmitMsg(null);
  }, [familyLatestQuoteId, urlQuoteId]);

  const beginNewQuote = useCallback(() => {
    hydrationRanRef.current = false;
    revisionBaselineCapturedForQuoteRef.current = null;
    setUrlQuoteId(null);
    setHydratedIsCurrentRevision(null);
    setHydratedDisplayRevision(null);
    setQuoteFamilyRootId(null);
    setFamilyLatestQuoteId(null);
    setFamilyLatestQuoteNumber(null);
    setRevisionBaselineSig(null);
    setQuoteHydrationStatus("not_requested");
    setLastSavedQuoteId(null);
    setLastSavedQuoteNumber(null);
    setSaveIntent("create");
    setRevisionNoteDraft("");
    setQuoteWorkflowStatus("draft");
    setSubmitMsg(null);
    setSubmitDiagnostic(null);
    setHydrationGaps([]);
    setRoomDrafts([createEstimatorRoom("Group Promo")]);
    setVisualLayoutByPieceKey({});
    setAccountName("");
    setAccountPhone("");
    setAccountEmail("");
    setCustomerName("");
    setPhone("");
    setEmail("");
    setProjectType("Kitchen");
    setBranch("Dyersville");
    setSalesRep("");
    setProjectName("");
    setProjectAddress("");
    setCity("");
    setState("IA");
    setColorTbd(false);
    setUseTaxPercent(0);
    setUseTaxPreset("0");
    setInternalPricingMode("wholesale");
    setCustomLineRows([]);
    setQuoteDefaultCatalogId("");
    setCustomerDisplayGroups(Object.fromEntries(MATERIAL_GROUPS.map((g) => [g, false])));
    setComparisonGroupColorLabels(Object.fromEntries(MATERIAL_GROUPS.map((g) => [g, ""])));
    setCustomerFacingNotes("");
    enteredByUserEditedRef.current = false;
    setEnteredBy(defaultEnteredByRef.current);
    const u = new URL(window.location.href);
    u.searchParams.delete("quoteId");
    window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
  }, []);

  const handleStartNewQuoteClick = useCallback(() => {
    if (!hasUnsavedWork) {
      beginNewQuote();
      return;
    }
    setStartNewQuoteModalOpen(true);
  }, [hasUnsavedWork, beginNewQuote]);

  const handleRestoreAsRevision = useCallback(async () => {
    if (restoreRevisionBlockReason || !urlQuoteId) {
      if (restoreRevisionBlockReason) setSubmitMsg(restoreRevisionBlockReason);
      return;
    }
    setRestoreBusy(true);
    setPendingSubmitIntent("save_revision");
    setSubmitMsg(null);
    setSubmitDiagnostic(null);
    try {
      if (!sessionToken) {
        setSubmitMsg("Sign in to restore a revision.");
        return;
      }
      const token = await ensureAccessToken();
      if (!token) {
        setSubmitMsg("Your session expired. Please sign in again.");
        return;
      }
      if (token !== sessionToken) setSessionToken(token);
      const raw = (await apiPostJson(`/api/internal-quotes/${urlQuoteId}/restore-as-revision`, token, {
        revision_note: revisionNoteDraft.trim() || null
      })) as Record<string, unknown>;
      if (raw.ok === true) {
        const qn = String(raw.quote_number ?? raw.quoteNumber ?? "");
        const qid = String(raw.quoteId ?? raw.quote_id ?? "");
        const revLab = String(raw.revision_label ?? raw.revisionLabel ?? "").trim();
        applyPostSaveQuoteIdentity(qid, qn, revLab, true, "restore");
        const savedLabel = qn || (revLab ? `revision ${revLab}` : "quote");
        setSubmitMsg(`Restored as ${savedLabel}. This is now the latest revision.`);
        setBackendCalcOk(true);
        if (startNewAfterSaveRef.current === "restore") {
          startNewAfterSaveRef.current = null;
          beginNewQuote();
        }
      } else {
        setSubmitMsg(String(raw.error || "Restore failed."));
        setSubmitDiagnostic(JSON.stringify({ route: "POST restore-as-revision", response: raw }, null, 2));
      }
    } catch (e: unknown) {
      startNewAfterSaveRef.current = null;
      setSubmitMsg(e instanceof ApiError ? e.message : "Restore failed unexpectedly.");
      setSubmitDiagnostic(String(e));
    } finally {
      setRestoreBusy(false);
      setPendingSubmitIntent(null);
    }
  }, [
    restoreRevisionBlockReason,
    urlQuoteId,
    sessionToken,
    ensureAccessToken,
    revisionNoteDraft,
    applyPostSaveQuoteIdentity,
    beginNewQuote
  ]);

  const handleSubmit = useCallback(async (forcedIntent?: InternalSaveIntent) => {
    const intent: InternalSaveIntent = forcedIntent ?? (urlQuoteId ? saveIntent : "create");
    if (intent === "save_revision" && saveRevisionBlockReason) {
      setSubmitMsg(saveRevisionBlockReason);
      return;
    }
    if (intent === "update_existing" && updateQuoteBlockReason) {
      setSubmitMsg(updateQuoteBlockReason);
      return;
    }
    if (intent === "save_as_new_quote" && urlQuoteId) {
      if (!sessionToken) {
        setSubmitMsg("Sign in to save as a new quote family.");
        return;
      }
      if (submitBusy) return;
    }
    if (!urlQuoteId && !sessionToken) {
      setSubmitMsg("Sign in to save an internal quote to eliteOS. Nothing is stored until you are signed in.");
      return;
    }

    setSubmitBusy(true);
    setPendingSubmitIntent(intent);
    setSubmitMsg(null);
    setSubmitDiagnostic(null);
    const payload = buildSubmitPayload(urlQuoteId ? intent : undefined) as Record<string, unknown>;
    const displayForSave = customerEstimateDisplayRef.current;
    if (displayForSave) {
      try {
        payload.customerEstimatePrintSnapshot = buildCustomerEstimatePrintSnapshotForSave({
          display: displayForSave,
          header: {
            estimateDate: new Date().toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric"
            }),
            quoteNumber: effectiveQuoteNumber || lastSavedQuoteNumber || undefined,
            accountName: accountName.trim() || null,
            customerName: customerName.trim() || null,
            projectName: projectName.trim() || null,
            projectAddress: projectAddress.trim() || null,
            city: city.trim() || null,
            state: state.trim() || null,
            branch: branch.trim() || null,
            salesRep: salesRep.trim() || null,
            primaryGroup: topMaterialGroup || null,
            primaryColorLabel: primaryColorLabelRef.current || null,
            colorTbd: colorTbd
          }
        });
      } catch (e) {
        console.warn("[internal-estimate] customer print snapshot for save failed", e);
      }
    }

    try {
      if (!sessionToken) {
        setSubmitMsg("Sign in to save an internal quote to eliteOS. Nothing is stored until you are signed in.");
        return;
      }

      if (
        urlQuoteId &&
        hydratedIsCurrentRevision === false &&
        (intent === "update_existing" || intent === "save_revision")
      ) {
        setSubmitMsg(
          "Older revision open — use Restore as new revision to continue this ESF family, or open the latest revision."
        );
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
        const sm = String(raw.save_mode ?? raw.saveMode ?? "");
        const revLab = String(raw.revision_label ?? raw.revisionLabel ?? "").trim();
        const isCurrent =
          raw.is_current_revision === false
            ? false
            : raw.is_current_revision === true
              ? true
              : true;
        applyPostSaveQuoteIdentity(qid, qn, revLab, isCurrent, sm);
        const savedLabel = qn || (revLab ? `revision ${revLab}` : "quote");
        if (takeoffImportMeta && isActiveTakeoffImport(takeoffImportMeta)) {
          setTakeoffShowFeedbackAfterSave(true);
        }
        if (sm === "save_revision") {
          setSubmitMsg(`Saved as ${savedLabel}. This is now the latest revision.`);
        } else if (sm === "update_existing") {
          setSubmitMsg(`Updated ${savedLabel} in place (same revision row).`);
        } else if (sm === "save_as_new_quote") {
          setSubmitMsg(`Saved as separate new quote family: ${savedLabel}.`);
        } else {
          setSubmitMsg(qn ? `Saved as ${savedLabel}.` : "Saved to eliteOS Quote Library.");
        }
        setSubmitDiagnostic(null);
        setBackendCalcOk(true);
        if (Array.isArray(raw.warnings) && raw.warnings.length) {
          setSubmitMsg((prev) => `${prev} ${(raw.warnings as string[]).join(" ")}`);
        }
        const pendingOutput = customerOutputAfterSaveRef.current;
        customerOutputAfterSaveRef.current = null;
        if (pendingOutput) {
          if (!qn.trim()) {
            setSubmitMsg(
              "Save succeeded but no quote number was assigned. Contact support before printing or emailing."
            );
            console.error("[internal-estimate] save missing quote_number before customer output", {
              quoteId: qid || null,
              pendingOutput
            });
          } else {
            if (pendingOutput === "print") {
              window.setTimeout(() => window.print(), 0);
            } else {
              pendingEmailModalAfterSaveRef.current = true;
            }
          }
        }
        const after = startNewAfterSaveRef.current;
        if (after === "save_revision" || after === "update_existing" || after === "save_as_new_quote") {
          startNewAfterSaveRef.current = null;
          beginNewQuote();
        }
      } else {
      startNewAfterSaveRef.current = null;
      customerOutputAfterSaveRef.current = null;
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
      startNewAfterSaveRef.current = null;
      customerOutputAfterSaveRef.current = null;
      setSubmitMsg("Save failed unexpectedly. Please try again.");
      setSubmitDiagnostic(String(e));
    } finally {
      setSubmitBusy(false);
      setPendingSubmitIntent(null);
    }
  }, [
    sessionToken,
    buildSubmitPayload,
    ensureAccessToken,
    urlQuoteId,
    hydratedIsCurrentRevision,
    saveIntent,
    saveRevisionBlockReason,
    updateQuoteBlockReason,
    submitBusy,
    applyPostSaveQuoteIdentity,
    beginNewQuote,
    effectiveQuoteNumber,
    lastSavedQuoteNumber,
    accountName,
    customerName,
    projectName,
    projectAddress,
    city,
    state,
    branch,
    salesRep,
    topMaterialGroup,
    colorTbd
  ]);

  useEffect(() => {
    if (!pendingEmailModalAfterSaveRef.current) return;
    if (customerOutputBlockReason) return;
    pendingEmailModalAfterSaveRef.current = false;
    setEmailEstimateAutoPreview(true);
    setEmailEstimateModalOpen(true);
  }, [
    customerOutputBlockReason,
    effectiveQuoteHeaderId,
    effectiveQuoteNumber,
    hydratedIsCurrentRevision
  ]);

  const requestCustomerOutput = useCallback(
    (action: "print" | "email") => {
      setCustomerOutputBlockMsg(null);
      const block = getCustomerOutputBlockReason(customerOutputGateInput);
      if (block) {
        if (canSaveBeforeCustomerOutput(block)) {
          customerOutputAfterSaveRef.current = action;
          void handleSubmit(urlQuoteId ? saveIntent : "create");
          setSubmitMsg(
            action === "print"
              ? "Saving this quote before printing…"
              : "Saving this quote before emailing…"
          );
          return;
        }
        setCustomerOutputBlockMsg(block);
        console.warn("[internal-estimate] customer output blocked", {
          action,
          quoteHeaderId: effectiveQuoteHeaderId ?? null,
          quoteNumberPresent: Boolean(effectiveQuoteNumber),
          reason: block
        });
        return;
      }
      if (action === "print") {
        printCustomerEstimate();
      } else {
        setEmailEstimateAutoPreview(false);
        setEmailEstimateModalOpen(true);
      }
    },
    [
      customerOutputGateInput,
      handleSubmit,
      urlQuoteId,
      saveIntent,
      printCustomerEstimate,
      effectiveQuoteHeaderId,
      effectiveQuoteNumber
    ]
  );

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
    const { totals } = calculateAllRoomDrafts(
      drafts,
      projectType,
      internalPricingMode,
      0,
      internalMeasureOptions
    );
    const totalSf = round2(totals.priceableCounter + totals.splash + totals.fhb);
    return {
      empty: false as const,
      method: workflowLabel(INTERNAL_ESTIMATE_WORKFLOW),
      totalSf,
      counterSf: totals.priceableCounter,
      exactCounterSf: totals.counter,
      splashSf: totals.splash,
      fhbSf: totals.fhb
    };
  }, [buildRoomDraftsForCalculate, projectType, internalPricingMode]);

  const readinessSnapshot = useMemo(() => {
    const missing: string[] = [];
    if (!accountName.trim()) missing.push("Account name");
    if (!salesRep.trim()) missing.push("Salesperson");
    if (!customerName.trim()) missing.push("Customer name");
    if (!projectName.trim()) missing.push("Elite job name");
    if (!city.trim() && !state.trim() && !projectAddress.trim()) missing.push("Project address or city/state");
    if (scopePreview.empty || scopePreview.totalSf <= 0) missing.push("Room / area measurements (square footage)");
    const warnings: string[] = [];
    if (colorTbd) {
      warnings.push("Color marked TBD — confirm before Sent/Sold when you have a selection.");
    }
    const edgeMissingLf = roomDrafts.filter(
      (r) =>
        UPGRADED_EDGE_PROFILES.includes(r.edgeProfile as (typeof UPGRADED_EDGE_PROFILES)[number]) &&
        !(r.upgradedEdgeLf && r.upgradedEdgeLf > 0)
    );
    if (edgeMissingLf.length > 0) {
      warnings.push(
        `${edgeMissingLf.length} room${edgeMissingLf.length > 1 ? "s" : ""} have an upgraded edge selected but no linear feet entered — edge charge will not be calculated.`
      );
    }
    const score = Math.max(0, Math.min(100, 100 - missing.length * 14));
    return { missing, warnings, score, readyForReview: missing.length === 0 };
  }, [accountName, salesRep, customerName, projectName, projectAddress, city, state, scopePreview, colorTbd, roomDrafts]);

  const customLinePreviewTotals = useMemo(() => {
    let sum = 0;
    for (const r of customLineRows) {
      const q = num(r.qty) || 1;
      const p = num(r.unitPrice);
      if (!r.name.trim() || q <= 0) continue;
      if (r.category === "Discount/Credit") {
        if (p !== 0) sum += q * -Math.abs(p); // auto-negate: positive entry = credit
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
      customLineItemsTotal: customLinePreviewTotals,
      materialProgramDefault: INTERNAL_ESTIMATE_ELITE_100_PROGRAM
    });
  }, [
    buildRoomDraftsForCalculate,
    internalPricingMode,
    topMaterialGroup,
    projectType,
    customLinePreviewTotals
  ]);

  const comparisonScopeMeta = useMemo(
    () =>
      aggregateComparisonScope(roomDrafts, projectType, {
        materialBasis: internalPricingMode,
        measureOptions: internalMeasureOptions
      }),
    [roomDrafts, projectType, internalPricingMode]
  );

  const visualCanvasSummary = useMemo(() => visualCanvasSummaryStats(roomDrafts), [roomDrafts]);

  const internalGroupComparison = useMemo(() => {
    return buildInternalEstimateGroupComparison({
      countertopSqft: comparisonScopeMeta.countertopSqft,
      backsplashSqft: comparisonScopeMeta.backsplashSqft,
      roomFixedDollars: comparisonScopeMeta.addonDollars,
      customLineDollars: customLinePreviewTotals,
      internalMaterialUseTax: true,
      basis: internalPricingMode
    });
  }, [comparisonScopeMeta, customLinePreviewTotals, internalPricingMode]);

  const backendHint = config.backendBaseUrl;

  /** Local preview of upgraded edge charge — added to partRetail so sticky total matches backend. */
  const liveUpgradedEdgeTotal = useMemo(
    () => computeLocalUpgradedEdgeTotal(roomDrafts).total,
    [roomDrafts]
  );

  const partRetail = round2((liveEstimate.retail ?? 0) + liveUpgradedEdgeTotal);
  const partSqft = liveEstimate.estimated_sqft;
  const serverRetailVerified = !usedFallback && apiPartner?.totals?.retail != null ? Number(apiPartner.totals.retail) : null;

  const customerEstimateComparisonRows = useMemo(
    () =>
      internalGroupComparison
        .filter((row) => customerDisplayGroups[row.group])
        .map((row) => ({
          ...row,
          comparisonColorLabel: comparisonGroupColorLabels[row.group]?.trim() || undefined
        })),
    [internalGroupComparison, customerDisplayGroups, comparisonGroupColorLabels]
  );

  const customLineSplit = useMemo(
    () => splitInternalEstimateCustomLines({ customLineRows, roomDrafts }),
    [customLineRows, roomDrafts]
  );
  const visibleCustomerLines = customLineSplit.visibleCustomerLines;

  const primaryColorLabel = useMemo(() => {
    if (colorTbd) return "";
    if (quoteDefaultCatalogId) {
      return eliteColors.find((c) => c.id === quoteDefaultCatalogId)?.colorName ?? "";
    }
    const roomColors = [
      ...new Set(roomDrafts.map((r) => r.materialColor?.trim()).filter(Boolean) as string[])
    ];
    return roomColors.length === 1 ? roomColors[0] : roomColors.length > 1 ? "Multiple room colors" : "";
  }, [colorTbd, quoteDefaultCatalogId, eliteColors, roomDrafts]);
  primaryColorLabelRef.current = primaryColorLabel;

  const estimateTotalExact = partRetail ?? 0;

  const selectedMaterialBreakdown = useMemo(
    () =>
      buildSelectedMaterialBreakdown(roomDrafts, internalPricingMode, {
        internalMaterialUseTax: true,
        chargeableCounterCeil: internalMeasureOptions.chargeableCounterCeil,
        materialProgramDefault: INTERNAL_ESTIMATE_ELITE_100_PROGRAM
      }),
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

  const customLinesForRoomBreakdown = useMemo(
    () =>
      customLineRows
        .filter((r) => r.name.trim())
        .map((r) => {
          const linkedRoom = r.roomId ? roomDrafts.find((rd) => rd.id === r.roomId) : null;
          return {
            lineKey: r.id,
            name: r.name.trim(),
            quantity: num(r.qty) || 1,
            unitPrice: num(r.unitPrice),
            customerFacing: r.customerFacing,
            roomName: (linkedRoom?.name || r.roomName).trim(),
            roomId: r.roomId.trim() || undefined,
            category: r.category
          };
        }),
    [customLineRows, roomDrafts]
  );

  const liveRoomAreaBreakdown = useMemo(
    () =>
      buildCustomerRoomAreaCostBreakdown({
        roomDrafts,
        measuredRooms: liveEstimate.measuredRooms,
        materialBasis: internalPricingMode,
        measureOptions: internalMeasureOptions,
        customLines: customLinesForRoomBreakdown,
        projectColorTbd: colorTbd
      }),
    [roomDrafts, liveEstimate.measuredRooms, internalPricingMode, customLinesForRoomBreakdown, colorTbd]
  );

  const internalOnlyAdjustDollars = customLineSplit.internalOnlyAdjustDollars;

  /** Customer-facing structured custom lines only (included in estimate total; listed by name on PDF). */
  const customerFacingCustomLinesDollars = useMemo(
    () => round2(customLinePreviewTotals - internalOnlyAdjustDollars),
    [customLinePreviewTotals, internalOnlyAdjustDollars]
  );

  /**
   * Customer-facing display model — shared by Live Quote Panel, customerDisplayTotal, and print.
   * Add-ons use measuredRooms[].extras (matches stickyLiveRollup), not addons[] alone.
   */
  const customerEstimateDisplay = useMemo(
    () => {
      const display = buildCustomerEstimateDisplayModel({
        selectedBreakdown: selectedMaterialBreakdown,
        measuredRooms: liveEstimate.measuredRooms,
        visibleCustomerLines: visibleCustomerLines.map((ln) => ({
          lineKey: ln.lineKey,
          name: ln.name,
          description: ln.description,
          qty: ln.qty,
          roomName: ln.roomName,
          lineTotal: ln.lineTotal
        })),
        internalMaterialFoldDollars: internalOnlyAdjustDollars,
        roomAreaBreakdown: liveRoomAreaBreakdown,
        customerFacingNotes,
        upgradedEdgeTotalExact: liveUpgradedEdgeTotal,
        preparedBy: enteredBy,
        comparisonRows: customerEstimateComparisonRows,
        allGroupComparisonRates: internalGroupComparison,
        internalMaterialUseTax: true
      });
      customerEstimateDisplayRef.current = display;
      return display;
    },
    [
      selectedMaterialBreakdown,
      liveEstimate.measuredRooms,
      visibleCustomerLines,
      internalOnlyAdjustDollars,
      liveRoomAreaBreakdown,
      customerFacingNotes,
      liveUpgradedEdgeTotal,
      enteredBy,
      customerEstimateComparisonRows,
      internalGroupComparison
    ]
  );

  const customerDisplayTotal = customerEstimateDisplay.finalRounded;
  // Keep ref in sync so buildSubmitPayload reads the fresh value at save time.
  customerDisplayTotalRef.current = customerDisplayTotal;

  useEffect(() => {
    if (!effectiveQuoteNumber?.trim()) {
      customerPrintSnapshotRef.current = null;
      return;
    }
    try {
      customerPrintSnapshotRef.current = buildCustomerEstimatePrintSnapshot({
        display: customerEstimateDisplay,
        header: {
          estimateDate: new Date().toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric"
          }),
          quoteNumber: effectiveQuoteNumber.trim(),
          accountName: accountName.trim() || null,
          customerName: customerName.trim() || null,
          projectName: projectName.trim() || null,
          projectAddress: projectAddress.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          branch: branch.trim() || null,
          salesRep: salesRep.trim() || null,
          primaryGroup: topMaterialGroup || null,
          primaryColorLabel: primaryColorLabel || null,
          colorTbd: colorTbd
        }
      });
    } catch (e) {
      console.warn("[internal-estimate] customer print snapshot build failed", e);
      customerPrintSnapshotRef.current = null;
    }
  }, [
    customerEstimateDisplay,
    effectiveQuoteNumber,
    accountName,
    customerName,
    projectName,
    projectAddress,
    city,
    state,
    branch,
    salesRep,
    topMaterialGroup,
    primaryColorLabel,
    colorTbd
  ]);

  /** Matches customer print Quoted Material Breakdown + vanity + room extras + custom lines + edge — same basis as live total. */
  const stickyLiveRollup = useMemo(() => {
    const bd = selectedMaterialBreakdown;
    let vanityFlat = 0;
    let roomExtras = 0;
    for (const r of liveEstimate.measuredRooms) {
      // Only vanity-program rooms are excluded from selectedBreakdown; standard-mode vanity rooms
      // (isVanityProgram === false/undefined) are already in materialSubtotal — do not double-count.
      if (r.isVanityProgram === true) vanityFlat += Number(r.selected) || 0;
      roomExtras += Number(r.extras) || 0;
    }
    const countertopMaterial = round2(bd.totals.countertopMaterial + vanityFlat);
    const backsplashMaterial = bd.totals.backsplashMaterial;
    const roomAddOnsFixtures = round2(roomExtras);
    const recomputed = round2(bd.totals.materialSubtotal + vanityFlat + roomExtras + customLinePreviewTotals + liveUpgradedEdgeTotal);
    return {
      countertopMaterial,
      backsplashMaterial,
      roomAddOnsFixtures,
      upgradedEdge: liveUpgradedEdgeTotal,
      structuredCustomLines: customLinePreviewTotals,
      recomputed,
      rollupMismatch: Math.abs(recomputed - (Number(partRetail) || 0)) > 0.03
    };
  }, [selectedMaterialBreakdown, liveEstimate.measuredRooms, customLinePreviewTotals, liveUpgradedEdgeTotal, partRetail]);

  const estimatorSidebarNote = useMemo(() => {
    const parts: string[] = [];
    if (stickyLiveRollup.rollupMismatch) parts.push("Roll-up differs from engine total — report this quote.");
    if (comparisonScopeMeta.mixedGroupNote) parts.push("Tier comparisons are estimator-only on mixed-material scope.");
    if (internalOnlyAdjustDollars !== 0) {
      parts.push(
        "Internal-only custom lines are included in the estimate total and folded into customer countertop material on the PDF (not listed by internal name)."
      );
    }
    if (selectedMaterialBreakdown.totals.useTax?.applied) {
      const ut = selectedMaterialBreakdown.totals.useTax;
      const ctTax = ut.countertopMaterialUseTaxAmount ?? ut.taxAmount;
      const bsTax = ut.backsplashMaterialUseTaxAmount ?? 0;
      parts.push(
        `Material use tax ${ut.percent}% on countertop and backsplash material (+$${ctTax.toFixed(2)} counter` +
          (bsTax > 0 ? `, +$${bsTax.toFixed(2)} backsplash` : "") +
          ") — folded into customer material amounts, not a separate PDF line. Add-ons excluded."
      );
    }
    return parts.length ? parts.join(" ") : null;
  }, [stickyLiveRollup.rollupMismatch, comparisonScopeMeta.mixedGroupNote, internalOnlyAdjustDollars, selectedMaterialBreakdown]);

  const quoteLibraryUrl = useMemo(() => {
    const raw = String(import.meta.env.VITE_HEAD_URL_QUOTE_LIBRARY ?? "").trim();
    return raw.replace(/\/+$/, "") || "https://quotes.eliteosfab.com";
  }, []);

  const homeBase = useMemo(() => homeLauncherUrl(), []);

  const workspaceName = useMemo(() => resolveWorkspaceName(), []);
  const workspaceShortId = useMemo(() => resolveWorkspaceShortId(), []);
  const workspaceLogoUrl = useMemo(() => resolveWorkspaceLogoUrl(), []);
  const workspaceInitialsValue = useMemo(() => workspaceInitials(workspaceName), [workspaceName]);

  /**
   * Display values for the topbar user chip. Name/email/initials resolve
   * client-side from `session.user`; the subtitle prefers role/title from the
   * best-effort `/api/me` fetch above. The userId state is kept in scope so a
   * future System Admin link / preferences page can read it.
   */
  void userId;
  const defaultEnteredBy = useMemo(
    () => resolveDefaultEnteredBy(userMetaName, userEmail),
    [userMetaName, userEmail]
  );
  defaultEnteredByRef.current = defaultEnteredBy;
  const userDisplayName = useMemo(
    () => defaultEnteredBy || "Signed in",
    [defaultEnteredBy]
  );
  const userDisplayEmail = userEmail;
  const userChipSubtitle = useMemo(() => {
    const roleTitle = (userProfile.jobTitle || userProfile.department || userProfile.role || "").trim();
    if (roleTitle) return roleTitle.toUpperCase();
    return userDisplayEmail && userDisplayEmail.toLowerCase() !== userDisplayName.toLowerCase()
      ? userDisplayEmail
      : "";
  }, [userProfile, userDisplayEmail, userDisplayName]);
  const userDisplayInitials = useMemo(
    () => userInitialsFor(userMetaName, userEmail),
    [userMetaName, userEmail]
  );

  useEffect(() => {
    if (!sessionToken || !defaultEnteredBy) return;
    if (!shouldAutoApplyEnteredBy(urlQuoteId, enteredByUserEditedRef.current)) return;
    setEnteredBy(defaultEnteredBy);
  }, [sessionToken, urlQuoteId, defaultEnteredBy]);

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
        if (q.entered_by) {
          enteredByUserEditedRef.current = true;
          setEnteredBy(String(q.entered_by));
        }
        if (q.project_type) setProjectType(String(q.project_type));
        const snap = (q.calculation_snapshot as Record<string, unknown>) || {};
        const iu = (snap.internal_ui as Record<string, unknown>) || {};
        const takeoffImport = iu.takeoff_import;
        if (takeoffImport && typeof takeoffImport === "object") {
          const ti = takeoffImport as Record<string, unknown>;
          const totalsRaw = ti.totals && typeof ti.totals === "object" ? (ti.totals as Record<string, unknown>) : {};
          setTakeoffImportMeta({
            status: ti.status != null ? String(ti.status) : "active",
            schemaVersion: ti.schemaVersion != null ? String(ti.schemaVersion) : null,
            takeoffJobId: ti.takeoffJobId != null ? String(ti.takeoffJobId) : urlFromTakeoffId,
            takeoffSnapshotId: ti.takeoffSnapshotId != null ? String(ti.takeoffSnapshotId) : null,
            sourceFileName: ti.sourceFileName != null ? String(ti.sourceFileName) : null,
            approvedBy: ti.approvedBy != null ? String(ti.approvedBy) : null,
            approvedAt: ti.approvedAt != null ? String(ti.approvedAt) : null,
            importedAt: ti.importedAt != null ? String(ti.importedAt) : null,
            importedBy: ti.importedBy != null ? String(ti.importedBy) : null,
            importedRoomIds: Array.isArray(ti.importedRoomIds)
              ? ti.importedRoomIds.map((id) => String(id))
              : undefined,
            totals: {
              countertopSqft: Number(totalsRaw.countertopSqft) || undefined,
              standardBacksplashSqft: Number(totalsRaw.standardBacksplashSqft) || undefined,
              highBacksplashSqft: Number(totalsRaw.highBacksplashSqft) || undefined,
              fullHeightBacksplashSqft: Number(totalsRaw.fullHeightBacksplashSqft) || undefined,
              combinedSqft: Number(totalsRaw.combinedSqft) || undefined,
            },
            suggestedAddOns: Array.isArray(ti.suggestedAddOns)
              ? (ti.suggestedAddOns as TakeoffImportReceiptMeta["suggestedAddOns"])
              : undefined,
            importWarnings: Array.isArray(ti.importWarnings)
              ? (ti.importWarnings as TakeoffImportReceiptMeta["importWarnings"])
              : undefined,
            snapshot: ti.snapshot ?? null,
            auditEvents: Array.isArray(ti.auditEvents)
              ? (ti.auditEvents as TakeoffImportReceiptMeta["auditEvents"])
              : undefined,
          });
          const tic = iu.takeoff_import_checklist;
          if (tic && typeof tic === "object") {
            const checklist = tic as Record<string, unknown>;
            if (checklist.addonsReviewed != null) setTakeoffAddonsReviewed(Boolean(checklist.addonsReviewed));
            if (checklist.notesReviewed != null) setTakeoffNotesReviewed(Boolean(checklist.notesReviewed));
            if (Array.isArray(checklist.suggestedAddOnReviews)) {
              setTakeoffSuggestedAddOnReviews(checklist.suggestedAddOnReviews as TakeoffSuggestedAddOnReview[]);
            }
            if (checklist.compactTakeoffTable != null) setTakeoffCompactTable(Boolean(checklist.compactTakeoffTable));
          }
        } else if (urlFromTakeoffId) {
          setTakeoffImportMeta({ takeoffJobId: urlFromTakeoffId, status: "active" });
        } else {
          setTakeoffImportMeta(null);
          setTakeoffAddonsReviewed(false);
          setTakeoffNotesReviewed(false);
        }
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
        const roomDraftsPayload = iu.estimate_room_drafts;
        if (Array.isArray(roomDraftsPayload) && roomDraftsPayload.length) {
          setRoomDrafts(hydrateRoomDraftsFromInternalUi(roomDraftsPayload, roomsPayload));
        } else if (Array.isArray(roomsPayload) && roomsPayload.length) {
          setRoomDrafts(hydrateRoomDraftsFromInternalUi(null, roomsPayload));
        } else {
          gaps.push("Room model (estimate_rooms missing on older saves — re-enter rooms if needed)");
        }
        if (iu.color_tbd != null) setColorTbd(Boolean(iu.color_tbd));
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
                id: String(row.lineKey ?? row.line_key ?? newInternalRowId()),
                name: String(row.name ?? ""),
                description: String(row.description ?? ""),
                category: cat,
                qty: String(row.quantity ?? 1),
                unitPrice: String(row.unitPrice ?? row.unit_price ?? 0),
                customerFacing: Boolean(row.customerFacing ?? true),
                internalNote: String(row.internalNote ?? ""),
                roomName: String(row.roomName ?? row.room_name ?? ""),
                roomId: String(row.roomId ?? row.room_id ?? "")
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
        const cccl =
          (iu.customer_estimate_comparison_color_labels as Record<string, unknown> | undefined) ??
          (iu.customerEstimateComparisonColorLabels as Record<string, unknown> | undefined);
        if (cccl && typeof cccl === "object") {
          setComparisonGroupColorLabels((prev) => {
            const next = { ...prev };
            for (const g of MATERIAL_GROUPS) {
              const v = cccl[g];
              if (v != null && String(v).trim()) next[g] = String(v).trim();
            }
            return next;
          });
        }
        const storedNotes =
          iu.customer_estimate_customer_facing_notes ?? iu.customerFacingNotes ?? iu.customer_facing_notes;
        if (storedNotes != null && String(storedNotes).trim()) {
          setCustomerFacingNotes(String(storedNotes));
        }
        const isp = snap.inputSummary as Record<string, unknown> | undefined;
        if (isp?.materialGroup) {
          const g = String(isp.materialGroup);
          setRoomDrafts((prev) => {
            if (!prev.length) return [createEstimatorRoom(g)];
            return prev.map((r, i) => (i === 0 ? { ...r, materialGroup: g } : r));
          });
        }
        const qs = String(q.quote_status || "draft");
        setQuoteWorkflowStatus(qs);
        const rlab = q.revision_label != null ? String(q.revision_label) : "";
        const qnDisp = String(q.quote_number || "");
        const famRoot = q.quote_family_root_id != null ? String(q.quote_family_root_id) : "";
        setQuoteFamilyRootId(famRoot || urlQuoteId);

        let familyRevisions: FamilyRevisionRow[] = [];
        try {
          const revRaw = (await apiGetJson(`/api/internal-quotes/${urlQuoteId}/revisions`, sessionToken)) as Record<
            string,
            unknown
          >;
          if (!cancelled && revRaw.ok === true && Array.isArray(revRaw.revisions)) {
            familyRevisions = (revRaw.revisions as Record<string, unknown>[]).map((r) => ({
              id: String(r.id ?? ""),
              quote_number: r.quote_number != null ? String(r.quote_number) : null,
              revision_number: r.revision_number != null ? Number(r.revision_number) : null,
              revision_label: r.revision_label != null ? String(r.revision_label) : null,
              is_current_revision: parseIsCurrentRevisionFlag(r.is_current_revision)
            }));
          }
        } catch {
          /* optional — fall back to row flag */
        }

        const latestRev = pickLatestFamilyRevision(familyRevisions);
        if (latestRev?.id) {
          setFamilyLatestQuoteId(latestRev.id);
          setFamilyLatestQuoteNumber(latestRev.quote_number ? String(latestRev.quote_number) : null);
        } else {
          setFamilyLatestQuoteId(urlQuoteId);
          setFamilyLatestQuoteNumber(qnDisp || null);
        }

        const rowFlag = parseIsCurrentRevisionFlag(q.is_current_revision);
        const ic = isOpenedRevisionLatest(urlQuoteId, familyRevisions, rowFlag);
        setHydratedIsCurrentRevision(ic);
        setHydratedDisplayRevision(
          qnDisp ? `${qnDisp}${rlab && !qnDisp.includes(rlab) ? ` · ${rlab}` : ""}${ic ? "" : " · older revision"}` : null
        );
        setRevisionNoteDraft(String(q.revision_note ?? ""));
        setSaveIntent(ic ? "save_revision" : "save_as_new_quote");
        setLastSavedQuoteId(ic ? urlQuoteId : latestRev?.id ?? urlQuoteId);
        setLastSavedQuoteNumber(ic ? qnDisp || null : latestRev?.quote_number ? String(latestRev.quote_number) : qnDisp || null);
        setQuoteHydrationStatus("loaded");
        setHydrationGaps(gaps);
      } catch (e) {
        if (!cancelled) {
          setHydrationGaps([`Could not load quote: ${e instanceof ApiError ? e.message : String(e)}`]);
          setQuoteHydrationStatus("failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken, urlQuoteId]);

  useEffect(() => {
    revisionBaselineCapturedForQuoteRef.current = null;
    setRevisionBaselineSig(null);
  }, [urlQuoteId]);

  useEffect(() => {
    if (!urlQuoteId || !loadedFromLibrary || hydratedIsCurrentRevision === null) return;
    if (revisionBaselineCapturedForQuoteRef.current === urlQuoteId) return;
    revisionBaselineCapturedForQuoteRef.current = urlQuoteId;
    setRevisionBaselineSig(computeRevisionBaselineSig());
  }, [
    urlQuoteId,
    loadedFromLibrary,
    hydratedIsCurrentRevision,
    roomDrafts,
    customLineRows,
    computeRevisionBaselineSig
  ]);

  const ieHomeIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5L12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
  const ieLibraryIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9h18" />
      <path d="M8 13h6" />
      <path d="M8 16h8" />
    </svg>
  );
  const iePlusIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
  const ieProfileIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5" />
    </svg>
  );

  /**
   * "Start new quote" stays a visible topbar action (exact existing handler),
   * and the "Preview mode" pill keeps its existing signed-out-only condition.
   * Both render in the shared topbar's primary-action area.
   */
  const iePrimaryActions = (
    <>
      <button
        type="button"
        className="topbar-action-btn"
        onClick={handleStartNewQuoteClick}
        title="Start a new quote (saves or updates current first)"
      >
        <span className="topbar-action-btn-icon" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </span>
        <span className="topbar-action-btn-label">Start new quote</span>
      </button>
      {!sessionToken ? (
        <span className="topbar-preview-pill" title="Sign in below to save, calculate, or print">
          <span className="topbar-preview-pill-dot" aria-hidden />
          <span>Preview mode</span>
        </span>
      ) : null}
    </>
  );

  const ieMenuItems: EliteosTopbarMenuItem[] = [
    { label: "Open Home", meta: "eliteOS Launcher", href: homeBase, icon: ieHomeIcon },
    {
      label: "Open Quote Library",
      meta: "Search, statuses, revisions",
      onClick: () => window.open(`${quoteLibraryUrl}/`, "_blank", "noopener,noreferrer"),
      icon: ieLibraryIcon
    },
    {
      label: "Start new quote",
      meta: "Saves or updates current first",
      onClick: () => handleStartNewQuoteClick(),
      icon: iePlusIcon
    },
    {
      label: "Profile & preferences",
      meta: "eliteOS Home",
      href: `${homeLauncherUrl()}?view=profile`,
      title: "Profile & preferences",
      icon: ieProfileIcon
    }
  ];

  // ── Boot / hydration gate ──────────────────────────────────────────────────
  // Block the full workspace from painting until we have an auth answer AND any
  // initial quote hydration is either complete or unreachable (not signed in).
  // `initialBootDone` is a one-way latch so mid-session re-hydrations stay hidden.
  if (!initialBootDone) {
    return (
      <div className="shell page-internal-estimate ie-shell-preview">
        <div className="ie-no-print">
          <EliteosTopbar
            appName="Internal Estimate"
            organizationName={workspaceName}
            logoSrc={workspaceLogoUrl ?? EOS_LOGO_URL}
            homeHref="/"
            primaryActionSlot={iePrimaryActions}
          />
          <div className="ie-shell-body">
            <div className="ie-boot-loading" role="status" aria-live="polite">
              <span className="ie-boot-loading-dot" aria-hidden />
              <span>{urlQuoteId !== null ? "Preparing quote workspace\u2026" : "Loading estimate\u2026"}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  // ── End boot gate ──────────────────────────────────────────────────────────

  return (
    <div className={`shell page-internal-estimate${urlQuoteId && loadedFromLibrary ? " ie-shell-loaded" : ""}${sessionToken ? " ie-shell-signed-in" : " ie-shell-preview"}`}>
      <div className="ie-no-print">
      {sessionToken ? (
        <EliteosTopbar
          appName="Internal Estimate"
          organizationName={workspaceName}
          logoSrc={workspaceLogoUrl ?? EOS_LOGO_URL}
          homeHref="/"
          primaryActionSlot={iePrimaryActions}
          userName={userDisplayName}
          userEmail={userDisplayEmail}
          userSubtitle={userChipSubtitle}
          initials={userDisplayInitials}
          menuItems={ieMenuItems}
          onSignOut={() => void signOut()}
        />
      ) : (
        <EliteosTopbar
          appName="Internal Estimate"
          organizationName={workspaceName}
          logoSrc={workspaceLogoUrl ?? EOS_LOGO_URL}
          homeHref="/"
          primaryActionSlot={iePrimaryActions}
        />
      )}

      <div className="ie-shell-body">
        <section className="ie-hero" aria-labelledby="ie-hero-title">
          <div className="ie-hero-aurora" aria-hidden />
          <div className="ie-hero-grid">
            <div className="ie-hero-main">
              <div className="ie-hero-eyebrow-row">
                <p className="ie-hero-eyebrow">Internal tool · Internal Estimate</p>
                {sessionToken ? (
                  <span
                    className={`ie-hero-live${calcBusy ? " is-busy" : lastCalcLive ? " is-confirmed" : " is-preview"}`}
                    aria-live="polite"
                  >
                    <span className="ie-hero-live-dot" aria-hidden />
                    <span>
                      {calcBusy
                        ? "Calculating…"
                        : lastCalcLive && serverRetailVerified != null
                          ? "Backend confirmed"
                          : "Live preview"}
                    </span>
                  </span>
                ) : null}
                {/*
                  When signed-out the topbar already shows the primary
                  "Preview mode" pill — duplicating it here in the hero is
                  the exact repetition the corrective pass is removing. The
                  signed-in branch above is retained because it carries live
                  status ("Calculating…" / "Backend confirmed").
                */}
              </div>
              <h1 id="ie-hero-title" className="ie-hero-title">
                Estimate <span className="ie-hero-title-accent">workspace</span>
              </h1>
              <p className="ie-hero-sub">
                Build, calculate, and revise stone estimates with the same pricing engine and revision history used in the Quote Library. Saved revisions hand off cleanly to Moraware and QuickBooks once sold.
              </p>
              <dl className="ie-hero-stats" aria-label="Live estimate context">
                <div className="ie-hero-stat">
                  <dt>Rooms</dt>
                  <dd>{roomDrafts.length}</dd>
                </div>
                <div className="ie-hero-stat">
                  <dt>Sq ft</dt>
                  <dd>
                    {Number(partSqft ?? 0) > 0 ? Number(partSqft ?? 0).toFixed(1) : "—"}
                  </dd>
                </div>
                <div className="ie-hero-stat">
                  <dt>Basis</dt>
                  <dd>{internalPricingMode === "wholesale" ? "Wholesale" : "Direct"}</dd>
                </div>
                <div className="ie-hero-stat">
                  <dt>Branch</dt>
                  <dd>{branch}</dd>
                </div>
                <div className="ie-hero-stat ie-hero-stat-mode">
                  <dt>{urlQuoteId ? "Editing" : "Mode"}</dt>
                  <dd>
                    {urlQuoteId
                      ? hydratedDisplayRevision || (loadedFromLibrary ? "Saved quote" : "Loading…")
                      : "New estimate"}
                  </dd>
                </div>
              </dl>
            </div>

            <aside
              className="hero-workspace"
              aria-label={`Workspace · ${workspaceName}`}
            >
              <p className="hero-workspace-eyebrow">Workspace</p>
              <div className="hero-workspace-card">
                <div className="hero-workspace-mark">
                  {workspaceLogoUrl ? (
                    <img
                      src={workspaceLogoUrl}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                        const fallback = (
                          e.currentTarget.parentElement as HTMLElement | null
                        )?.querySelector(".hero-workspace-initials") as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <span
                    className="hero-workspace-initials"
                    aria-hidden={workspaceLogoUrl ? "true" : "false"}
                    style={workspaceLogoUrl ? { display: "none" } : undefined}
                  >
                    {workspaceInitialsValue}
                  </span>
                </div>
                <div className="hero-workspace-text">
                  <p className="hero-workspace-name">{workspaceName}</p>
                  <p className="hero-workspace-meta">
                    <span>on </span>
                    <span className="hero-workspace-platform">slabOS</span>
                    <span className="hero-workspace-sep" aria-hidden>·</span>
                    <span>{workspaceShortId}</span>
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </section>

      {takeoffImportMeta && isActiveTakeoffImport(takeoffImportMeta) ? (
        <>
          <TakeoffImportReceiptPanel
            meta={takeoffImportMeta}
            takeoffLabUrl={readAiTakeoffHeadUrl() ?? undefined}
            quoteStatus={quoteWorkflowStatus}
            onDetach={urlQuoteId ? handleDetachTakeoffImport : undefined}
            detachBusy={takeoffDetachBusy}
            detachError={takeoffDetachError}
            onOpenSourceDrawer={() => setTakeoffSourceDrawerOpen(true)}
            onReportIssue={() => setTakeoffIssueReportOpen(true)}
          />
          {takeoffQuoteReadiness ? (
            <TakeoffQuoteReadinessSummary
              items={takeoffQuoteReadiness.items}
              readyToCalculate={takeoffQuoteReadiness.readyToCalculate}
            />
          ) : null}
          {takeoffMeasurementDeltas ? (
            <TakeoffMeasurementComparisonPanel deltas={takeoffMeasurementDeltas} />
          ) : null}
          <TakeoffSuggestedAddOnsReviewPanel
            reviews={takeoffSuggestedAddOnReviews}
            onChange={(next) => {
              setTakeoffSuggestedAddOnReviews(next);
              setTakeoffAddonsReviewed(true);
            }}
            onAllReviewed={() => {
              setTakeoffSuggestedAddOnReviews((prev) =>
                prev.map((r) => (r.status === "pending" ? { ...r, status: "ignored" } : r))
              );
              setTakeoffAddonsReviewed(true);
            }}
          />
          {takeoffImportChecklist ? (
            <TakeoffImportCompletionChecklist
              items={takeoffImportChecklist.items}
              score={takeoffImportChecklist.score}
              readyToCalculate={takeoffImportChecklist.readyToCalculate}
              addonsReviewed={takeoffAddonsReviewed}
              onMarkAddonsReviewed={setTakeoffAddonsReviewed}
              onMarkNotesReviewed={setTakeoffNotesReviewed}
              notesReviewed={takeoffNotesReviewed}
              suggestedAddOnCount={takeoffImportMeta.suggestedAddOns?.length ?? 0}
            />
          ) : null}
          {(takeoffShowFeedbackAfterSave || urlFromTakeoffId) && !takeoffFeedbackSubmitted ? (
            <TakeoffFeedbackForm
              quoteId={urlQuoteId}
              onSubmit={handleSubmitTakeoffFeedback}
              busy={takeoffFeedbackBusy}
              submitted={takeoffFeedbackSubmitted}
            />
          ) : null}
        </>
      ) : (takeoffImportMeta?.status === "detached" || takeoffImportMeta?.status === "imported") ? (
        // "imported"  — normal import path; show receipt only, no checklist/workbench.
        // "detached"  — user removed the live link; show receipt in read-only state.
        <TakeoffImportReceiptPanel meta={takeoffImportMeta} />
      ) : null}

      {takeoffImportMeta && isActiveTakeoffImport(takeoffImportMeta) ? (
        <TakeoffSourcePlanDrawer
          open={takeoffSourceDrawerOpen}
          onClose={() => setTakeoffSourceDrawerOpen(false)}
          meta={takeoffImportMeta}
          takeoffLabUrl={readAiTakeoffHeadUrl() ?? undefined}
        />
      ) : null}

      {takeoffImportMeta?.takeoffJobId ? (
        <TakeoffIssueReportModal
          open={takeoffIssueReportOpen}
          onClose={() => setTakeoffIssueReportOpen(false)}
          onSubmit={handleSubmitTakeoffIssue}
          quoteId={urlQuoteId}
        />
      ) : null}

      {urlQuoteId ? (
        <div
          className={`ie-url-banner${hydratedIsCurrentRevision === false ? " is-older-rev" : loadedFromLibrary ? " is-loaded" : " is-loading"}`}
          role={loadedFromLibrary ? "status" : undefined}
        >
          {loadedFromLibrary ? (
            <>
              <p className="ie-url-banner-title">
                Loaded from Quote Library
                {hydratedDisplayRevision ? (
                  <span className="ie-url-banner-rev"> · {hydratedDisplayRevision}</span>
                ) : null}
              </p>
              <p className="ie-url-banner-copy">
                Use pinned <strong>Save revision</strong> after scope changes, or <strong>Update current revision</strong> to edit in place.
                {hydratedIsCurrentRevision === false ? (
                  <>
                    {" "}
                    You opened an <strong>older revision</strong> — restore it to continue the same ESF family, or open the latest.
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <p className="ie-url-banner-title ie-url-banner-loading">
              <span className="ie-url-banner-loading-dot" aria-hidden />
              Loading quote…
            </p>
          )}
          {hydrationGaps.length ? (
            <ul className="ie-url-banner-gaps">
              {hydrationGaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="ie-app-shell">
        <nav className="ie-rail" aria-label="Estimate workflow">
          <p className="ie-rail-title" aria-hidden>
            Workflow
          </p>
          {WORKFLOW_SECTIONS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button
                type="button"
                className="ie-rail-link"
                data-ie-rail-section={s.id}
                onClick={() => scrollToWorkflowSection(s.id)}
              >
                <span className="ie-rail-link-num" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="ie-rail-link-label">{s.label}</span>
              </button>
              {s.id === "sec-rooms" && roomNavLabels.length > 0 ? (
                <div className="ie-rail-room-block">
                  <button
                    type="button"
                    className="ie-rail-room-toggle"
                    aria-expanded={roomsSubnavOpen}
                    onClick={() => setRoomsSubnavOpen((v) => !v)}
                  >
                    {roomsSubnavOpen ? "▾" : "▸"} Areas ({roomNavLabels.length})
                  </button>
                  {roomsSubnavOpen ? (
                    <ul className="ie-rail-room-list" role="list">
                      {roomNavLabels.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            className={`ie-rail-room-link${activeRoomNavId === r.id ? " ie-rail-room-link-active" : ""}`}
                            onClick={() => scrollToRoomCard(r.id)}
                          >
                            {r.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </React.Fragment>
          ))}
        </nav>

        <main className="ie-main">
          {supabase && !sessionToken ? (
            <div className="card ie-signin-row" role="region" aria-labelledby="ie-signin-title">
              <p className="ie-signin-eyebrow">Preview · Sign in to save, calculate, or print</p>
              <h2 id="ie-signin-title" className="ie-signin-title">
                Sign in with your <span className="ie-signin-title-accent">eliteOS</span> account
              </h2>
              <p className="ie-signin-sub">
                Totals update live while you type, but Calculate, Save, and Print need an authenticated session.
              </p>
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
                <button
                  type="button"
                  className="btn primary ie-signin-submit"
                  disabled={authBusy}
                  onClick={() => void signIn()}
                >
                  {authBusy ? "Signing in…" : "Sign in"}
                </button>
              </div>
              {authError ? (
                <p className="ie-note-quiet ie-note-error" role="alert">
                  <span className="ie-note-quiet-dot" aria-hidden />
                  {authError}
                </p>
              ) : null}
            </div>
          ) : null}

          {sessionToken ? (
            <div
              className={`ie-live-strip${
                backendCalcOk === true
                  ? " is-confirmed"
                  : backendCalcOk === false && usedFallback
                    ? " is-warn"
                    : " is-preview"
              }`}
              role="status"
              aria-live="polite"
            >
              <span className="ie-live-strip-dot" aria-hidden />
              <span className="ie-live-strip-label">
                {backendCalcOk === true
                  ? "Backend connected"
                  : backendCalcOk === false && usedFallback
                    ? "Backend retry needed"
                    : "Live preview"}
              </span>
              <span className="ie-live-strip-copy">
                {backendCalcOk === true
                  ? "Live backend calculation connected. Tap Calculate any time to verify line items."
                  : backendCalcOk === false && usedFallback
                    ? "Live preview for totals — backend Calculate did not connect. Tap Calculate to retry, or sign out and back in if save fails."
                    : "Live preview while you type. Tap Calculate to validate with eliteOS before save."}
              </span>
            </div>
          ) : null}

          <div className="card ie-card-tight ie-pricing-bar">
            <div className="ie-pricing-bar-row">
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
          </div>

          <section id="sec-job" className="card">
            <div className="ie-section-head">
              <h2 className="ie-section-title">Job Info</h2>
              <p className="ie-section-meta">
                Account &amp; customer contact · Project location · Sales team · Quote settings
              </p>
            </div>
            <div className="ie-job-groups">
              <div className="ie-job-group">
                <p className="ie-job-group-head">Account</p>
                <div className="grid3 ie-job-grid">
                  <label>
                    Account
                    <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Account Name" />
                  </label>
                  <label>
                    Account contact phone
                    <input value={accountPhone} onChange={(e) => setAccountPhone(e.target.value)} placeholder="Phone" />
                  </label>
                  <label>
                    Account contact email
                    <input value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} placeholder="Email" />
                  </label>
                </div>
              </div>

              <div className="ie-job-group">
                <p className="ie-job-group-head">Customer</p>
                <div className="grid3 ie-job-grid">
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
                </div>
              </div>

              <div className="ie-job-group">
                <p className="ie-job-group-head">Project</p>
                <div className="grid3 ie-job-grid">
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
                </div>
              </div>

              <div className="ie-job-group">
                <p className="ie-job-group-head">Sales &amp; quote settings</p>
                <div className="grid3 ie-job-grid">
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
                    <span className="ie-label-text">Salesperson <span className="req-star" aria-label="required">*</span></span>
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
                    <input
                      value={enteredBy}
                      onChange={(e) => {
                        enteredByUserEditedRef.current = true;
                        setEnteredBy(e.target.value);
                      }}
                      placeholder="Defaults from sign-in"
                    />
                  </label>
                  {/* Color TBD is captured per-room in the Room builder — no project-wide toggle needed */}
                  <p className="muted small" style={{ margin: 0 }}>
                    Material use tax: <strong>{INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT}%</strong> on countertop and
                    backsplash material (add-ons, labor, fees, and credits excluded).
                  </p>
                </div>
              </div>

            </div>
            {selectedMaterialBreakdown.totals.useTax?.applied ? (
              <p className="ie-note-quiet ie-note-useTax" role="status">
                <span className="ie-note-quiet-dot" aria-hidden />
                Material use tax: <strong>{selectedMaterialBreakdown.totals.useTax.percent}%</strong> on countertop and
                backsplash material
                {" "}(counter base <strong>${selectedMaterialBreakdown.totals.useTax.baseCountertopMaterial.toFixed(2)}</strong>
                {selectedMaterialBreakdown.totals.useTax.baseBacksplashMaterial != null &&
                selectedMaterialBreakdown.totals.useTax.baseBacksplashMaterial > 0 ? (
                  <>
                    , backsplash base{" "}
                    <strong>${selectedMaterialBreakdown.totals.useTax.baseBacksplashMaterial.toFixed(2)}</strong>
                  </>
                ) : null}
                {" "}; total tax <strong>${selectedMaterialBreakdown.totals.useTax.taxAmount.toFixed(2)}</strong>)
                {" "}— included in customer material amounts, not a separate PDF line.
              </p>
            ) : null}
          </section>

          <section id="sec-rooms" className="card">
            <div className="ie-section-head">
              <h2 className="ie-section-title">Rooms / Areas</h2>
              <p className="ie-section-meta">
                Guided shapes or manual sq ft · Price group + color · Standard vanity or 2026 Vanity Program opt-in
              </p>
            </div>
            <details className="ie-future-tools">
              <summary>Future tools</summary>
              <p className="muted small" style={{ margin: "8px 0 0" }}>
                Plan upload / AI takeoff and heavier visualize tooling remain roadmap items (spec Phase B+: snapping, scale, annotations).
                Use the <strong>Visual Layout Canvas</strong> section below for quick drag-and-rotate verification — it does not change pricing math.
              </p>
            </details>
            {colorCatalogWarnings.length > 0 ? (
              <div className="ie-note-quiet ie-note-error ie-color-catalog-warn" role="alert">
                <span className="ie-note-quiet-dot" aria-hidden />
                {colorCatalogWarnings.join(" ")} Select a material group manually below.
              </div>
            ) : null}
            {takeoffImportMeta && isActiveTakeoffImport(takeoffImportMeta) ? (
              <label className="ie-takeoff-compact-toggle check">
                <input
                  type="checkbox"
                  checked={takeoffCompactTable}
                  onChange={(e) => setTakeoffCompactTable(e.target.checked)}
                />
                Compact imported measurement table
              </label>
            ) : null}
            <RoomScopeBuilder
              rooms={roomDrafts}
              onRoomsChange={setRoomDrafts}
              materialGroups={MATERIAL_GROUPS}
              eliteProgramColors={eliteColors}
              hideRapidLinear
              enableDestructiveGuards
              showTakeoffImportBadges={Boolean(takeoffImportMeta && isActiveTakeoffImport(takeoffImportMeta))}
              enableTakeoffImportEditor={Boolean(takeoffImportMeta && isActiveTakeoffImport(takeoffImportMeta))}
              takeoffTraceabilityContext={
                takeoffImportMeta && isActiveTakeoffImport(takeoffImportMeta)
                  ? {
                      sourcePlanName: takeoffImportMeta.sourceFileName,
                      approvedBy: takeoffImportMeta.approvedBy,
                      approvedAt: takeoffImportMeta.approvedAt,
                      suggestedAddOns: takeoffImportMeta.suggestedAddOns,
                    }
                  : undefined
              }
              compactTakeoffTable={takeoffCompactTable}
              colorTbd={colorTbd}
              quoteDefaultCatalogId={quoteDefaultCatalogId}
              onMarkRoomVerified={handleMarkRoomVerified}
              onMarkAllImportedRoomsVerified={handleMarkAllImportedRoomsVerified}
              canMarkAllImportedRoomsVerified={Boolean(
                takeoffMeasurementDeltas &&
                  canMarkAllImportedRoomsVerified(roomDrafts, takeoffMeasurementDeltas.exceedsThreshold)
              )}
            />
          </section>

          <section id="sec-visual" className="card ie-visual-section">
            <div className="ie-visual-summary-row">
              <div className="ie-visual-summary-text">
                <div className="ie-section-head ie-section-head-tight">
                  <h2 className="ie-section-title ie-visual-heading">Visual layout verification</h2>
                  <p className="ie-section-meta">
                    Drag-and-rotate verification board · does not change Calculate, Save, or customer print totals
                  </p>
                </div>
                <p className="ie-visual-meta">
                  <span className="ie-visual-meta-chip">
                    <strong>{visualCanvasSummary.roomCount}</strong> room{visualCanvasSummary.roomCount === 1 ? "" : "s"}
                  </span>
                  <span className="ie-visual-meta-chip">
                    <strong>{visualCanvasSummary.pieceCount}</strong> piece{visualCanvasSummary.pieceCount === 1 ? "" : "s"}
                  </span>
                  <span className="ie-visual-meta-chip">
                    Mix <strong>{visualCanvasSummary.tierSummary}</strong>
                  </span>
                </p>
              </div>
              <div className="ie-visual-summary-actions">
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  onClick={() => setVisualCanvasExpanded((v) => !v)}
                  aria-expanded={visualCanvasExpanded}
                >
                  {visualCanvasExpanded ? "Collapse canvas" : "Open layout canvas"}
                </button>
              </div>
            </div>
            {visualCanvasExpanded ? (
              <>
                <p className="muted small ie-visual-expand-note">
                  Optional verification board — drag, rotate, and auto-arrange do not change Calculate, Save, or customer print totals.
                </p>
                <VisualLayoutCanvas
                  rooms={roomDrafts}
                  layoutByPieceKey={visualLayoutByPieceKey}
                  setLayoutByPieceKey={setVisualLayoutByPieceKey}
                  estimateColorTbd={colorTbd}
                />
                <div className="ie-visual-collapse-footer">
                  <button type="button" className="btn secondary btn-sm" onClick={() => setVisualCanvasExpanded(false)}>
                    Collapse canvas
                  </button>
                </div>
              </>
            ) : null}
          </section>

          <section id="sec-addons" className="card">
            <div className="ie-section-head">
              <h2 className="ie-section-title">Add-ons &amp; Custom Items</h2>
              <p className="ie-section-meta">
                Presets and custom lines · <strong>Customer-facing</strong> show on the estimate · <strong>Internal-only</strong> roll into
                countertop material on the PDF (not listed by internal name)
              </p>
            </div>
            <p className="muted small ie-addons-cutout-hint">Sink and fixture cutouts are set per room in the room builder.</p>
            {customLineUndo ? (
              <div className="ie-undo-toast" role="status">
                <span>Custom line removed. </span>
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  onClick={() => {
                    setCustomLineRows(customLineUndo);
                    setCustomLineUndo(null);
                  }}
                >
                  Undo
                </button>
              </div>
            ) : null}

            <h3 className="h3">Structured custom line items</h3>
            <div className="ie-custom-line-presets" role="group" aria-label="Add a structured custom line item">
              {CUSTOM_LINE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className="btn secondary ie-custom-line-preset-btn"
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
                        roomName: "",
                        roomId: ""
                      }
                    ])
                  }
                >
                  + {p.name}
                </button>
              ))}
            </div>
            <p className="muted small ie-custom-line-presets-hint">Discount / Credit amounts are always applied as reductions — enter the amount (positive or negative).</p>
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
                    {row.category === "Discount/Credit" ? "Credit amount ($, applied as reduction)" : "Unit price ($)"}
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
                    <select
                      value={row.roomId}
                      onChange={(e) => {
                        const roomId = e.target.value;
                        const linked = roomDrafts.find((rd) => rd.id === roomId);
                        setCustomLineRows((prev) =>
                          prev.map((x) =>
                            x.id === row.id
                              ? { ...x, roomId, roomName: linked?.name?.trim() || x.roomName }
                              : x
                          )
                        );
                      }}
                    >
                      <option value="">Unassigned / other</option>
                      {roomDrafts.map((rd) => (
                        <option key={rd.id} value={rd.id}>
                          {rd.name?.trim() || "Room"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Room label override
                    <input
                      value={row.roomName}
                      onChange={(e) =>
                        setCustomLineRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, roomName: e.target.value } : x)))
                      }
                      placeholder="Optional if not using room list"
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
                  <button
                    type="button"
                    className="btn secondary btn-danger-quiet"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Remove "${row.name.trim() || "this line"}"?\n\nThis can change the estimate total.`
                        )
                      ) {
                        return;
                      }
                      setCustomLineUndo(customLineRows);
                      setCustomLineRows((prev) => prev.filter((x) => x.id !== row.id));
                    }}
                  >
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
                      roomName: "",
                      roomId: ""
                    }
                  ])
                }
              >
                + Add custom line item
              </button>
            </section>

          <CompareGroupsAndNotesStep
            roomDrafts={roomDrafts}
            setRoomDrafts={setRoomDrafts}
            customerDisplayGroups={customerDisplayGroups}
            setCustomerDisplayGroups={setCustomerDisplayGroups}
            comparisonGroupColorLabels={comparisonGroupColorLabels}
            setComparisonGroupColorLabels={setComparisonGroupColorLabels}
            comparisonScopeMeta={comparisonScopeMeta}
            customerFacingNotes={customerFacingNotes}
            setCustomerFacingNotes={setCustomerFacingNotes}
          />


            <div className="ie-workflow-tail">
            <section id="sec-review" className="card">
              <div className="ie-section-head">
                <h2 className="ie-section-title">Review</h2>
                <p className="ie-section-meta">
                  Readiness feeds snapshots — it does not block Calculate or Save in this build
                </p>
              </div>
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

            <details id="sec-output" className="internal-print-sheet card ie-details-worksheet">
              <summary className="ie-details-summary-worksheet">
                <span>Internal worksheet (staff)</span>
                <span className="ie-details-summary-meta muted small">
                  {partRetail != null
                    ? `Live total ~ $${Number(partRetail).toFixed(2)} (${internalPricingMode === "wholesale" ? "wholesale" : "Direct / Retail"} book)`
                    : "Expand for tier tables & snapshots"}
                  {lastCalcLive && apiPartner?.totals?.retail != null
                    ? ` · Backend $${Number(apiPartner.totals.retail).toFixed(2)}`
                    : ""}
                </span>
              </summary>
              <p className="muted small" style={{ marginTop: 12 }}>
                On-screen staff reference only. Use <strong>Print customer estimate</strong> (pinned below) for homeowner PDF — it excludes
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
                Estimator comparison only — countertop material uses <strong>chargeable</strong> counter SF (whole-foot round-up);
                backsplash + FHB use exact SF. Full total adds room fixed add-ons, structured custom lines, and use tax on countertop
                material when set. Aligned with live preview and backend calculate.
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
                          <td>
                            {row.group}
                            {row.comparisonColorLabel ? ` · ${row.comparisonColorLabel}` : ""}
                          </td>
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
            </details>

          <p className="ie-print-hint muted small">
            For the cleanest PDF, turn off browser &ldquo;Headers and footers&rdquo; in the print dialog.
          </p>
          {!sessionToken ? (
            <p className="muted small" style={{ marginTop: 0 }}>
              <strong>Save quote</strong> requires sign-in and backend quote storage. Use <strong>Calculate</strong> for local
              demo pricing when offline.
            </p>
          ) : null}

          {vanityLocalNote ? (
            <div className="ie-status-banner is-info" role="status">
              <span className="ie-status-banner-dot" aria-hidden />
              <p className="ie-status-banner-copy">{vanityLocalNote}</p>
            </div>
          ) : null}

          {usedFallback && sessionToken && backendCalcOk === false ? (
            <div className="ie-status-banner is-warn" role="status">
              <span className="ie-status-banner-dot" aria-hidden />
              <p className="ie-status-banner-copy">
                Calculate used local preview math — save still requires a verified session and backend when available.
              </p>
            </div>
          ) : null}

          {calcError ? (
            <div className="ie-status-banner is-error" role="alert">
              <span className="ie-status-banner-dot" aria-hidden />
              <p className="ie-status-banner-copy">{calcError}</p>
            </div>
          ) : null}

          <details className="card math-check">
            <summary>Math check &amp; tier diagnostics (live preview)</summary>
            <p className="muted small" style={{ marginTop: 12 }}>
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
                <span>Countertop sf (chargeable / priced)</span>
                <strong>{liveEstimate.mathCheck.countertopSf.toFixed(2)}</strong>
                {liveEstimate.mathCheck.exactCountertopSf != null &&
                Math.abs(liveEstimate.mathCheck.exactCountertopSf - liveEstimate.mathCheck.countertopSf) > 0.01 ? (
                  <span className="muted small" style={{ display: "block", fontWeight: "normal" }}>
                    Exact measured: {liveEstimate.mathCheck.exactCountertopSf.toFixed(2)} sf (Elite rounds counter up to whole SF for pricing)
                  </span>
                ) : null}
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
                <span>
                  {comparisonScopeMeta.mixedGroupNote
                    ? `Starting primary tier (${internalPricingMode === "wholesale" ? "wholesale book" : "ESF Direct"}, not blended)`
                    : `Primary group rate (${internalPricingMode === "wholesale" ? "wholesale book" : "ESF Direct"})`}
                </span>
                <strong>
                  {liveEstimate.mathCheck.primaryGroup} @ ${liveEstimate.mathCheck.groupRatePerSf}/sf
                  {comparisonScopeMeta.mixedGroupNote ? (
                    <span className="muted small" style={{ display: "block", fontWeight: "normal", marginTop: 6 }}>
                      Mixed-material jobs price stone by piece in Quoted Material Breakdown; this row is the sheet default tier only.
                    </span>
                  ) : null}
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
          </details>

          <section className="card ie-internal-detail">
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

            </div>

          <section id="sec-save" className="card">
            <div className="ie-section-head">
              <h2 className="ie-section-title">Save</h2>
              <p className="ie-section-meta">
                Save to Quote Library · Update current revision · Save Revision after scope changes
              </p>
            </div>
            {submitMsg ? (
              <p className="ie-note-quiet ie-note-info" role="status">
                <span className="ie-note-quiet-dot" aria-hidden />
                {submitMsg}
              </p>
            ) : (
              <p className="muted">Submit saves to eliteOS when you’re signed in and quote tables are installed.</p>
            )}
            {urlQuoteId ? (
              <div style={{ marginTop: 12 }}>
                {hydratedIsCurrentRevision === false ? (
                  <div className="warn-box" style={{ marginBottom: 12 }}>
                    <strong>Older revision open.</strong> You can view it, restore it as a new latest revision (same ESF
                    family), or save it as a separate new quote.
                    {familyLatestQuoteNumber && familyLatestQuoteId && familyLatestQuoteId !== urlQuoteId ? (
                      <p className="muted small" style={{ margin: "8px 0 0" }}>
                        Latest in this family: <strong>{familyLatestQuoteNumber}</strong>
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid2" style={{ gap: 12 }}>
                  {hydratedIsCurrentRevision !== false ? (
                    <label>
                      Save action
                      <select
                        value={
                          saveIntent === "create"
                            ? "save_revision"
                            : saveIntent === "update_existing" ||
                                saveIntent === "save_revision" ||
                                saveIntent === "save_as_new_quote"
                              ? saveIntent
                              : "save_revision"
                        }
                        onChange={(e) => setSaveIntent(e.target.value as InternalSaveIntent)}
                      >
                        <option value="update_existing">Update current revision</option>
                        <option value="save_revision">Save revision (R2, R3…)</option>
                      </select>
                      {saveIntent === "save_revision" ? (
                        <span className="muted small" style={{ display: "block", marginTop: 4 }}>
                          Default for scope changes. Creates the next revision and keeps prior rows frozen.
                        </span>
                      ) : (
                        <span className="muted small" style={{ display: "block", marginTop: 4 }}>
                          Overwrites this revision row without incrementing R#.
                        </span>
                      )}
                      {saveRevisionBlockReason && saveIntent === "save_revision" ? (
                        <span className="muted small" style={{ display: "block", marginTop: 4, color: "#b45309" }}>
                          {saveRevisionBlockReason}
                        </span>
                      ) : null}
                      {updateQuoteBlockReason && saveIntent === "update_existing" ? (
                        <span className="muted small" style={{ display: "block", marginTop: 4, color: "#b45309" }}>
                          {updateQuoteBlockReason}
                        </span>
                      ) : null}
                    </label>
                  ) : (
                    <div>
                      <p className="muted small" style={{ margin: 0 }}>
                        Restore copies this snapshot forward as the next revision in the same ESF family.
                      </p>
                      {restoreRevisionBlockReason ? (
                        <p className="muted small" style={{ margin: "8px 0 0", color: "#b45309" }}>
                          {restoreRevisionBlockReason}
                        </p>
                      ) : null}
                    </div>
                  )}
                  <label>
                    Quote status (persisted)
                    <input
                      value={quoteWorkflowStatus}
                      onChange={(e) => setQuoteWorkflowStatus(e.target.value)}
                      placeholder="draft, sent, follow_up…"
                      disabled={hydratedIsCurrentRevision === false}
                    />
                  </label>
                  <label style={{ gridColumn: hydratedIsCurrentRevision !== false ? "1 / -1" : undefined }}>
                    Revision note (optional)
                    <input value={revisionNoteDraft} onChange={(e) => setRevisionNoteDraft(e.target.value)} placeholder="Visible on quote row metadata" />
                  </label>
                  <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={
                        hydratedIsCurrentRevision === false
                          ? Boolean(restoreRevisionBlockReason)
                          : Boolean(savePanelPrimaryBlockReason)
                      }
                      title={
                        hydratedIsCurrentRevision === false
                          ? restoreRevisionBlockReason ?? undefined
                          : savePanelPrimaryBlockReason ?? undefined
                      }
                      onClick={() =>
                        hydratedIsCurrentRevision === false
                          ? void handleRestoreAsRevision()
                          : void handleSubmit(
                              saveIntent === "create" ? "save_revision" : saveIntent
                            )
                      }
                    >
                      {restoreBusy || (submitBusy && pendingSubmitIntent)
                        ? "Working…"
                        : savePrimaryLabel}
                    </button>
                    {hydratedIsCurrentRevision === false && familyLatestQuoteId && familyLatestQuoteId !== urlQuoteId ? (
                      <button type="button" className="btn secondary" onClick={openLatestRevisionInPlace}>
                        Open latest revision
                      </button>
                    ) : null}
                  </div>
                  <details style={{ gridColumn: "1 / -1" }}>
                    <summary className="muted small">More save options</summary>
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        disabled={Boolean(savePanelPrimaryBlockReason) && hydratedIsCurrentRevision !== false}
                        onClick={() => void handleSubmit("save_as_new_quote")}
                      >
                        Save as separate new quote
                      </button>
                      <p className="muted small" style={{ marginTop: 8 }}>
                        Starts a new ESF number family — only when you intentionally want a separate quote record.
                      </p>
                    </div>
                  </details>
                </div>
              </div>
            ) : null}
            {!urlQuoteId ? (
              <p className="muted small" style={{ marginTop: 10 }}>
                New estimate — Save quote allocates an ESF quote number when migrations are applied (fallback legacy number otherwise).
              </p>
            ) : null}
            {lastSavedQuoteNumber ? (
              <p style={{ marginTop: 8 }}>
                <a
                  className="btn secondary"
                  href={
                    lastSavedQuoteId
                      ? `${quoteLibraryUrl}/?quoteId=${encodeURIComponent(lastSavedQuoteId)}`
                      : quoteFamilyRootId
                        ? `${quoteLibraryUrl}/?quoteId=${encodeURIComponent(quoteFamilyRootId)}`
                        : `${quoteLibraryUrl}/`
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  View in Quote Library
                </a>
                <span className="muted small" style={{ marginLeft: 12 }}>
                  {hydratedIsCurrentRevision === false ? (
                    <>
                      Opened: <strong>{hydratedDisplayRevision ?? lastSavedQuoteNumber}</strong>
                      {familyLatestQuoteNumber ? (
                        <>
                          {" "}
                          · Latest in family: <strong>{familyLatestQuoteNumber}</strong>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      Editing: <strong>{hydratedDisplayRevision ?? lastSavedQuoteNumber}</strong>
                    </>
                  )}
                </span>
              </p>
            ) : null}
          </section>

          <QuoteFilesPanel
            quoteId={lastSavedQuoteId ?? urlQuoteId}
            getToken={ensureAccessToken}
          />

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

        <aside className="ie-aside side-col" aria-label="Estimator summary">
          <div className="ie-aside-panel summary-card ie-summary-card-compact">
            <div className="ie-aside-scroll">
              <div className="ie-summary-head">
                <p className="ie-summary-eyebrow">Live quote panel</p>
                <h2 className="ie-summary-title">Estimator summary</h2>
                <p className="ie-summary-mode-pill" data-mode={internalPricingMode}>
                  <span className="ie-summary-mode-dot" aria-hidden />
                  {internalPricingMode === "wholesale" ? "Wholesale" : "Direct / Retail"}
                </p>
              </div>

              <div className="ie-summary-section ie-summary-hero">
                <p className="ie-summary-kicker">Estimate total · rate book, no markup %</p>
                <p className="ie-summary-compact-hero">{partRetail != null ? `$${Number(partRetail).toFixed(2)}` : "—"}</p>
                {lastCalcLive && serverRetailVerified != null ? (
                  <p className="ie-summary-hero-sub is-confirmed">
                    <span className="ie-summary-hero-sub-dot" aria-hidden />
                    Last Calculate (backend): <strong>${serverRetailVerified.toFixed(2)}</strong>
                  </p>
                ) : (
                  <p className="ie-summary-hero-sub is-preview">
                    <span className="ie-summary-hero-sub-dot" aria-hidden />
                    Live preview — tap Calculate (signed in) to verify line items.
                  </p>
                )}
              </div>

              <div className="ie-summary-section">
                <p className="ie-summary-section-head">Breakdown</p>
                <div className="summary-rows ie-summary-rows-compact">
                  <div className="summary-row ie-summary-row-compact">
                    <span>Countertop material</span>
                    <strong>${stickyLiveRollup.countertopMaterial.toFixed(2)}</strong>
                  </div>
                  <div className="summary-row ie-summary-row-compact">
                    <span>Backsplash material</span>
                    <strong>${stickyLiveRollup.backsplashMaterial.toFixed(2)}</strong>
                  </div>
                  <div className="summary-row ie-summary-row-compact">
                    <span>Add-ons / fixtures</span>
                    <strong>${stickyLiveRollup.roomAddOnsFixtures.toFixed(2)}</strong>
                  </div>
                  {stickyLiveRollup.upgradedEdge > 0 ? (
                    <div className="summary-row ie-summary-row-compact">
                      <span>Edge upgrades</span>
                      <strong>${stickyLiveRollup.upgradedEdge.toFixed(2)}</strong>
                    </div>
                  ) : null}
                  {customerFacingCustomLinesDollars !== 0 ? (
                    <div className="summary-row ie-summary-row-compact">
                      <span>Customer-facing custom lines</span>
                      <strong>${customerFacingCustomLinesDollars.toFixed(2)}</strong>
                    </div>
                  ) : null}
                  {internalOnlyAdjustDollars !== 0 ? (
                    <div className="summary-row ie-summary-row-compact ie-summary-row-internal">
                      <span>Internal-only adjustments</span>
                      <strong>${internalOnlyAdjustDollars.toFixed(2)}</strong>
                    </div>
                  ) : null}
                </div>
                {internalOnlyAdjustDollars !== 0 ? (
                  <p className="ie-summary-explainer">
                    Included in estimate total and customer PDF total; PDF shows as generic{" "}
                    <strong>Additional adjustments</strong> only (no internal line names).
                  </p>
                ) : (
                  <p className="ie-summary-explainer">
                    No internal-only custom lines — customer PDF total matches named lines plus stone/add-ons only.
                  </p>
                )}
                <p className="ie-summary-explainer ie-summary-explainer-quiet">
                  <strong>Add-ons / fixtures</strong> are room catalog extras (cutouts, tear-out, etc.). Customer-facing custom lines
                  are the structured items marked customer-facing below.
                </p>
              </div>

              <div className="ie-summary-section ie-summary-readiness">
                <p className="ie-summary-section-head">Readiness</p>
                <div className="ie-summary-readiness-row">
                  <span
                    className={`ie-summary-readiness-pill${
                      readinessSnapshot.readyForReview ? " is-ok" : " is-missing"
                    }`}
                  >
                    <span className="ie-summary-readiness-dot" aria-hidden />
                    {readinessSnapshot.readyForReview ? "Core fields OK" : "Missing items"}
                  </span>
                  <span className="ie-summary-readiness-score">
                    Score <strong>{readinessSnapshot.score}%</strong>
                  </span>
                </div>
                <p className="ie-summary-explainer ie-summary-explainer-quiet">
                  Same mixed piece/room groups as Quoted Material Breakdown / customer print.
                </p>
                {estimatorSidebarNote ? (
                  <p className="ie-summary-note-warn" role="status">
                    <span className="ie-summary-note-warn-dot" aria-hidden />
                    {estimatorSidebarNote}
                  </p>
                ) : null}
              </div>

              <div className="internal-badge">Internal — not customer-facing</div>

              <details className="ie-summary-audit" style={{ marginTop: 14 }}>
                <summary>Full breakdown &amp; audit fields</summary>
                <div style={{ marginTop: 12 }}>
                  <div className="summary-rows" style={{ marginBottom: 8 }}>
                    <div className="summary-row">
                      <span>Structured custom lines (customer + internal)</span>
                      <strong>${stickyLiveRollup.structuredCustomLines.toFixed(2)}</strong>
                    </div>
                    {customerFacingCustomLinesDollars !== 0 ? (
                      <div className="summary-row">
                        <span>Customer-facing portion</span>
                        <strong>${customerFacingCustomLinesDollars.toFixed(2)}</strong>
                      </div>
                    ) : null}
                    {internalOnlyAdjustDollars !== 0 ? (
                      <div className="summary-row">
                        <span>Internal-only portion</span>
                        <strong>${internalOnlyAdjustDollars.toFixed(2)}</strong>
                      </div>
                    ) : null}
                  </div>
                  <div className="summary-rows" style={{ marginBottom: 12 }}>
                    <div className="summary-row">
                      <span>Estimated sq ft (engine)</span>
                      <strong>{Number(partSqft ?? 0).toFixed(2)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Countertop sf (chargeable)</span>
                      <strong>{scopePreview.counterSf.toFixed(2)}</strong>
                      {"exactCounterSf" in scopePreview &&
                      scopePreview.exactCounterSf != null &&
                      Math.abs(scopePreview.exactCounterSf - scopePreview.counterSf) > 0.01 ? (
                        <span className="muted small" style={{ display: "block", fontWeight: "normal" }}>
                          Exact: {scopePreview.exactCounterSf.toFixed(2)} sf
                        </span>
                      ) : null}
                    </div>
                    <div className="summary-row">
                      <span>Backsplash + FHB sf</span>
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
                        {(() => {
                          const perRoomTable = customerEstimateDisplay.roomComparisonTable;
                          if (perRoomTable?.isPerRoomMode) {
                            return `Per room (${perRoomTable.roomRows.length} room${perRoomTable.roomRows.length !== 1 ? "s" : ""})`;
                          }
                          return customerEstimateComparisonRows.length
                            ? customerEstimateComparisonRows.map((r) => r.group).join(", ")
                            : "None selected";
                        })()}
                      </strong>
                    </div>
                  </div>
                  {stickyLiveRollup.rollupMismatch ? (
                    <p className="muted small" style={{ color: "#b45309", marginBottom: 10 }}>
                      Roll-up sanity check differs from engine total — report this quote.
                    </p>
                  ) : null}
                  <p className="summary-foot" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
                    Sticky total follows your edits; Calculate confirms backend line items.
                  </p>
                  <p className="summary-foot muted small">Expand Main column math check for tier tables.</p>
                  {lastCalcLive ? <p className="summary-foot muted small">Live API response</p> : null}
                  {apiPartner?.snapshot?.material_breakdown?.length ? (
                    <div style={{ marginTop: 12 }}>
                      <p className="section-lead" style={{ marginBottom: 6 }}>
                        Material / color mix (last Calculate)
                      </p>
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
                  <div style={{ marginTop: 12 }}>
                    <a className="btn secondary btn-sm" href={`${quoteLibraryUrl}/`} target="_blank" rel="noreferrer">
                      Open Quote Library
                    </a>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </aside>
      </div>
      </div>

      <nav className="ie-sticky-actions" aria-label="Pinned estimate actions">
        <div className="ie-sticky-actions-inner">
          <div className="ie-sticky-status" aria-live="polite">
            <span
              className={`ie-sticky-status-pill${
                calcBusy
                  ? " is-busy"
                  : lastCalcLive && serverRetailVerified != null
                    ? " is-confirmed"
                    : sessionToken
                      ? " is-preview"
                      : " is-signed-out"
              }`}
            >
              <span className="ie-sticky-status-dot" aria-hidden />
              <span className="ie-sticky-status-label">
                {calcBusy
                  ? "Calculating…"
                  : lastCalcLive && serverRetailVerified != null
                    ? "Backend confirmed"
                    : "Live preview"}
              </span>
            </span>
            <span className="ie-sticky-status-total" aria-label="Current live estimate total">
              {partRetail != null ? `$${Number(partRetail).toFixed(2)}` : "—"}
            </span>
          </div>
          <div className="ie-sticky-actions-cluster">
            <button
              type="button"
              className="btn primary btn-sm"
              disabled={calcBusy}
              onClick={() => void handleCalculate()}
            >
              {calcBusy ? "Calculating…" : "Calculate"}
            </button>
            <button
              type="button"
              className="btn secondary btn-sm"
              disabled={calcBusy || Boolean(customerOutputBlockReason)}
              title={customerOutputBlockReason ?? "Print customer estimate PDF"}
              onClick={() => requestCustomerOutput("print")}
            >
              Print estimate
            </button>
            <button
              type="button"
              className="btn secondary btn-sm"
              disabled={calcBusy || Boolean(customerOutputBlockReason)}
              title={
                customerOutputBlockReason ??
                (emailEstimateQuoteId ? "Email customer estimate" : UNSAVED_QUOTE_OUTPUT_MESSAGE)
              }
              onClick={() => requestCustomerOutput("email")}
            >
              Email estimate
            </button>
            {customerOutputBlockMsg ? (
              <p className="ie-output-block-msg" role="alert">
                {customerOutputBlockMsg}
              </p>
            ) : null}
            {urlQuoteId ? (
              hydratedIsCurrentRevision === false ? (
                <button
                  type="button"
                  className="btn primary btn-sm"
                  disabled={Boolean(restoreRevisionBlockReason)}
                  title={restoreRevisionBlockReason ?? undefined}
                  onClick={() => void handleRestoreAsRevision()}
                >
                  {restoreBusy ? "Restoring…" : "Restore as new revision"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    disabled={Boolean(updateQuoteBlockReason)}
                    title={updateQuoteBlockReason ?? undefined}
                    onClick={() => void handleSubmit("update_existing")}
                  >
                    {submitBusy && pendingSubmitIntent === "update_existing" ? "Updating…" : "Update"}
                  </button>
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    disabled={Boolean(saveRevisionBlockReason)}
                    title={saveRevisionBlockReason ?? undefined}
                    onClick={() => void handleSubmit("save_revision")}
                  >
                    {submitBusy && pendingSubmitIntent === "save_revision" ? "Saving…" : "Save revision"}
                  </button>
                </>
              )
            ) : (
              <button
                type="button"
                className="btn primary btn-sm"
                disabled={submitBusy}
                onClick={() => void handleSubmit()}
              >
                {submitBusy ? "Saving…" : "Save quote"}
              </button>
            )}
          </div>
        </div>
        {submitMsg ? (
          <p className={`ie-sticky-save-msg${submitDiagnostic ? " is-error" : " is-ok"}`} role="status">
            {submitMsg}
          </p>
        ) : null}
      </nav>

      {startNewQuoteModalOpen ? (
        <div className="ie-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ie-start-new-title">
          <div className="ie-modal-card">
            <h3 id="ie-start-new-title" style={{ marginTop: 0 }}>
              Start a new quote?
            </h3>
            <p className="muted small">
              You have unsaved changes on the current estimate. What would you like to do before starting a new quote?
            </p>
            <div className="ie-modal-actions">
              {hydratedIsCurrentRevision === false ? (
                <>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={Boolean(restoreRevisionBlockReason)}
                    onClick={() => {
                      setStartNewQuoteModalOpen(false);
                      startNewAfterSaveRef.current = "restore";
                      void handleRestoreAsRevision();
                    }}
                  >
                    Restore as new revision, then start new
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setStartNewQuoteModalOpen(false);
                      startNewAfterSaveRef.current = "save_as_new_quote";
                      void handleSubmit("save_as_new_quote");
                    }}
                  >
                    Save as separate new quote, then start new
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={Boolean(saveRevisionBlockReason)}
                    onClick={() => {
                      setStartNewQuoteModalOpen(false);
                      startNewAfterSaveRef.current = "save_revision";
                      void handleSubmit("save_revision");
                    }}
                  >
                    Save revision, then start new
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={Boolean(updateQuoteBlockReason)}
                    onClick={() => {
                      setStartNewQuoteModalOpen(false);
                      startNewAfterSaveRef.current = "update_existing";
                      void handleSubmit("update_existing");
                    }}
                  >
                    Update current quote, then start new
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn secondary btn-danger-quiet"
                onClick={() => {
                  setStartNewQuoteModalOpen(false);
                  beginNewQuote();
                }}
              >
                Discard changes and start new
              </button>
              <button type="button" className="btn ghost" onClick={() => setStartNewQuoteModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <EmailEstimateModal
        open={emailEstimateModalOpen}
        onClose={() => {
          setEmailEstimateModalOpen(false);
          setEmailEstimateAutoPreview(false);
        }}
        quoteId={emailEstimateQuoteId}
        sessionToken={sessionToken}
        blockReason={emailEstimateBlockReason}
        defaultToEmail={emailEstimateDefaultTo}
        defaultCcEmail={emailEstimateDefaultCc}
        defaultSubject={emailEstimateDefaultSubject}
        quoteNumber={effectiveQuoteNumber}
        revisionLabel={hydratedDisplayRevision}
        autoPreviewOnOpen={emailEstimateAutoPreview}
      />

      <footer className="footer-bar" role="contentinfo">
        <strong>eliteOS</strong> · Internal Estimate · {workspaceName} · {new Date().getFullYear()}
      </footer>
      </div>

      {effectiveQuoteNumber ? (
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
          quoteNumber={effectiveQuoteNumber}
          primaryGroup={topMaterialGroup}
          primaryColorLabel={primaryColorLabel}
          colorTbd={colorTbd}
          estimateTotalExact={estimateTotalExact}
          customerDisplay={customerEstimateDisplay}
          estimateDate={new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
        />
      ) : null}
    </div>
  );
}
