import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  apiGet,
  apiPatch,
  apiPost,
  ApiError,
  isTransientHttpError,
  transientFailureMessage,
  isEstimateRevisionSupersededError,
  estimateRevisionSupersededMessage,
  activeEstimateIdFromSupersededError
} from "../lib/api";

import EstimateDigitalEstimatePanel from "./EstimateDigitalEstimatePanel";
import StudioAccountDirectoryPanel from "./StudioAccountDirectoryPanel";
import { applyRoomBacksplashPatch } from "../../../backend-core/src/elite100EstimateStudio/studioRoomBacksplash.mjs";
import {
  buildStudioScopeBilling,
  resolveScopeEdgeLinearFeet
} from "../../../backend-core/src/elite100EstimateStudio/studioScopeBilling.mjs";
import { workflowAllowsAction } from "../../../backend-core/src/elite100EstimateStudio/studioWorkspaceWorkflow.mjs";
import ActiveReviewPublishPanel from "./ActiveReviewPublishPanel";
import type { WorkspaceWorkflow } from "./EstimateWorkflowHeader";
import {
  createStudioAutosaveController,
  STUDIO_AUTOSAVE_LABELS,
  shouldApplyStudioAutosaveResponse,
  type StudioAutosaveStatus
} from "../lib/studioAutosaveController";

/** Active-v4 Review & Publish display rollup — see elite100RoomPricingStudioAdapter.mjs buildActiveReviewSummary. */
type StudioActiveReviewSummary = {
  countertopMaterialGroups?: string[];
  countertopMaterialTotal?: number;
  materialTaxTotal?: number;
  backsplashPresent?: boolean;
  backsplashTotal?: number;
  fabricationTotal?: number;
};

type CustomLineItem = {
  id?: string;
  name: string;
  description?: string;
  customerDescription?: string;
  internalDescription?: string;
  category?: string;
  commercialRole?:
    | "customer_charge"
    | "customer_charge_hidden_detail"
    | "discount"
    | "credit"
    | "internal_only"
    | "absorbed"
    | "legacy_hidden_customer_charge";
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  pricingMode?: "unit" | "fixed";
  percentOfBase?: number | null;
  customerFacing?: boolean;
  internalNotes?: string;
  internalUnitCost?: number | null;
  roomId?: string | null;
  roomName?: string | null;
  sortOrder?: number;
};

type CountertopScopeAdjustment = {
  id: string;
  adjustmentScope: "room" | "project";
  roomId: string | null;
  adjustmentSf: number;
  adjustmentReason: string;
  adjustedBy?: string | null;
  adjustedAt?: string | null;
};

type EdgeScopeAdjustment = {
  adjustmentLf: number;
  adjustmentReason: string;
  adjustedBy?: string | null;
  adjustedAt?: string | null;
};

type FinishedEdgeOverride = {
  finalLf: number | null;
  reason: string;
  overriddenBy?: string | null;
  overriddenAt?: string | null;
};

/**
 * Canonical edge profiles — must mirror studioEdgeAuthority.mjs
 * (FREE_EDGE_PROFILES / PREMIUM_EDGE_PROFILES). Legacy W/D scope tokens are
 * never shown; saved legacy scopes map to their canonical equivalent.
 */
const CANONICAL_EDGE_PROFILES: Array<{ token: string; label: string; tier: "free" | "premium" }> = [
  { token: "edge_eased", label: "Eased", tier: "free" },
  { token: "edge_large_eased", label: "Large Eased", tier: "free" },
  { token: "edge_full_bullnose", label: "Full Bullnose", tier: "free" },
  { token: "edge_large_ogee", label: "Large Ogee", tier: "free" },
  { token: "edge_bevel", label: "Bevel", tier: "free" },
  { token: "edge_small_ogee", label: "Small Ogee", tier: "premium" },
  { token: "edge_crescent", label: "Crescent", tier: "premium" },
  { token: "edge_knife", label: "Knife", tier: "premium" }
];

const LEGACY_EDGE_MODE_TO_PROFILE: Record<string, string> = {
  included: "edge_eased",
  eased: "edge_eased",
  w_edge: "edge_small_ogee",
  d_edge: "edge_small_ogee"
};

type StudioEstimate = {
  id: string;
  status: string;
  revision?: number;
  takeoffJobId?: string | null;
  repositoryMode?: string | null;
  calculationFingerprint?: string | null;
  pricingEngine?: string | null;
  pricingVersion?: number | null;
  /** Server-computed (studioActiveReviewReadiness.mjs) — false only for frozen historical pricingVersion 2/3 rows. */
  isActiveSimplifiedEstimate?: boolean;
  /**
   * Server-computed active-v4 Review & Publish readiness (studioEstimateService.
   * safeEstimateView -> studioActiveReviewReadiness.deriveActiveReviewPublishReadiness).
   * The ONLY authority for Publish eligibility — display it, never recompute it.
   */
  activeReview?: { eligible: boolean; blockers: Array<{ code?: string; message?: string }> } | null;
  approvedAt?: string | null;
  approvedByUserId?: string | null;
  scope?: {
    customerName?: string;
    customerContactName?: string;
    customerEmail?: string;
    customerPhone?: string;
    projectName?: string;
    projectAddress?: string;
    partnerAccountId?: string | null;
    accountDirectoryAccountId?: string | null;
    accountDirectoryContactId?: string | null;
    accountDirectoryLocationId?: string | null;
    customerIdentitySnapshot?: Record<string, unknown> | null;
    pricingBasis?: string;
    materialGroup?: string;
    colorName?: string;
    colorTbd?: boolean;
    rooms?: Array<{
      id: string;
      name: string;
      included?: boolean;
      /** Explicit room material override; null/undefined = inherit estimate default. */
      materialGroupOverride?: string | null;
      countertopSqft?: number;
      backsplashSqft?: number;
      backsplashHeightIn?: number | null;
      includeBacksplash?: boolean;
      backsplashMeasuredLengthIn?: number | null;
      backsplashHeightMode?: string;
      backsplashSource?: string | null;
      eligibleRunCount?: number | null;
      excludedRunCount?: number | null;
      pieces?: Array<{
        id: string;
        name: string;
        included?: boolean;
        sqft?: number;
        /** When true, piece.materialGroup is an explicit override. */
        materialOverride?: boolean;
        materialGroup?: string | null;
        finishedEdge?: { totalFinishedEdgeLengthIn?: number };
      }>;
      approvedFinishedEdgeLf?: number;
      edgeEligibleLinearFeet?: number;
      notes?: string;
    }>;
    addOns?: Record<string, number>;
    customLineItems?: CustomLineItem[];
    customerCatalogPermissions?: Record<string, boolean>;
    edgeMode?: string | null;
    edgeProfileToken?: string | null;
    edgeLinearFeet?: number;
    edgeEligibleLinearFeet?: number;
    edgeScopeAdjustment?: EdgeScopeAdjustment | null;
    finishedEdgeOverride?: FinishedEdgeOverride | null;
    countertopScopeAdjustments?: CountertopScopeAdjustment[];
    miterHeightKey?: string | null;
    miterLinearFeet?: number;
    buildupSqft?: number;
    estimatorNotes?: string;
    internalMarkupPercent?: number;
    unresolvedManualReview?: boolean;
    physicalScopeSource?: string | null;
    estimateOrigin?: string | null;
    manualScopeConfirmed?: boolean;
    takeoffScopeSummary?: {
      pieceCount?: number;
      kitchenSinkCutouts?: number;
      vanityBarSinkCutouts?: number;
      cooktopCutouts?: number;
      electricalOutletCutouts?: number;
      popUpOutletCutouts?: number;
      otherCutouts?: number;
      backsplashEligibleRunCount?: number;
      eligibleBacksplashLengthIn?: number;
      totalRunLengthIn?: number;
      derivedOpenEdgeLengthIn?: number;
      derivedOpenEdgeLf?: number;
      approvedFinishedEdgeLf?: number;
      edgeEligibleLinearFeet?: number;
      edgeScopeSource?: string;
      edgeGeometryConfirmationRequired?: boolean;
      approvedFinishedEdgeLf?: number;
      suggestedFinishedEdgeLf?: number;
      finishedEdgeByPiece?: Array<object>;
      backsplashByPiece?: Array<object>;
      legacyDerivedOpenEdgeLf?: number | null;
      edgeScopeSource?: string;
      countertopSqft?: number;
      reviewCutouts?: Array<{
        roomName?: string;
        type?: string;
        quantity?: number;
        note?: string | null;
      }>;
    } | null;
  };
  calculation?: {
    totals?: Record<string, number>;
    material?: Record<string, unknown>;
    scopeBilling?: Record<string, unknown> | null;
    fabrication?: Record<string, unknown>;
    account?: Record<string, unknown>;
    internalMarkup?: Record<string, unknown>;
    warnings?: Array<{ code?: string; message?: string }>;
    unresolvedItems?: Array<{ code?: string; message?: string }>;
    calculatedAt?: string;
    pricingEngine?: string | null;
    pricingVersion?: number | null;
    reviewSummary?: StudioActiveReviewSummary | null;
  } | null;
  approval?: {
    approvedAt?: string;
    approvedByUserId?: string | null;
    exactInternalTotal?: number | null;
  } | null;
  staleReason?: string | null;
  persistenceWarning?: string | null;
  updatedAt?: string | null;
  workflow?: WorkspaceWorkflow | null;
  previousRevisionSummary?: {
    label?: string;
    exactInternalTotal?: number | null;
    revision?: number | null;
    approvedAt?: string | null;
  } | null;
};

type PartnerAccountOption = {
  partnerAccountId: string;
  displayName: string;
  accountSlug?: string | null;
};

type Props = {
  authToken: string;
  caseId: string;
  takeoffJobId: string | null;
  takeoffDisplayStatus: string;
  refreshKey?: number;
  customerHint?: string;
  projectHint?: string;
  workflow?: WorkspaceWorkflow | null;
  collapseCompleted?: boolean;
  onExpandCompleted?: () => void;
  onEditManualScope?: () => void;
  onEditProjectDetails?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onCanonicalEstimate?: (estimate: StudioEstimate) => void;
  onActiveEstimateChange?: (
    estimateId: string,
    meta?: { revision?: number; previousRevisionSummary?: unknown }
  ) => void;
  onTransientFailure?: (err: unknown, retry?: (() => void) | null) => void;
  onPublicationSummary?: (publication: Record<string, unknown> | null) => void;
  onPublicationRefreshError?: (message: string | null) => void;
  /** Simplified workspace section. */
  activeSection?: "scope" | "customer_choices" | "review_publish";
  onRegisterFlush?: (flush: (() => Promise<{ ok: boolean; conflict?: boolean; failed?: boolean }>) | null) => void;
  onAutosaveStatus?: (status: string) => void;
  onCalcStatus?: (status: string) => void;
  /** Raw pricing-status enum for the top workspace Source/Scope/Pricing/Publication strip. */
  onCalcStatusRaw?: (status: "idle" | "updating" | "updated" | "needs_attention") => void;
  /** Flush pending autosaves before Publish Digital Estimate. */
  onBeforePublishFlush?: () => Promise<{ ok: boolean; conflict?: boolean; failed?: boolean }>;
};

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

/**
 * Estimate Scope + Summary + Approval — server-authoritative calculate/approve.
 */
export default function EstimateScopePanel({
  authToken,
  caseId,
  takeoffJobId,
  takeoffDisplayStatus,
  refreshKey = 0,
  customerHint = "",
  projectHint = "",
  workflow: workflowProp = null,
  collapseCompleted = false,
  onExpandCompleted,
  onEditManualScope,
  onEditProjectDetails,
  onDirtyChange,
  onBusyChange,
  onCanonicalEstimate,
  onActiveEstimateChange,
  onTransientFailure,
  onPublicationSummary,
  onPublicationRefreshError,
  activeSection = "customer_choices",
  onRegisterFlush,
  onAutosaveStatus,
  onCalcStatus,
  onCalcStatusRaw,
  onBeforePublishFlush
}: Props) {
  const [estimate, setEstimate] = useState<StudioEstimate | null>(null);
  const [partnerAccount, setPartnerAccount] = useState<PartnerAccountOption | null>(null);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountOptions, setAccountOptions] = useState<PartnerAccountOption[]>([]);
  const [accountSearchBusy, setAccountSearchBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<StudioAutosaveStatus>("idle");
  const [calcStatus, setCalcStatus] = useState<"idle" | "updating" | "updated" | "needs_attention">(
    "idle"
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  // Under Takeoff authority miter/build-up start as "Not identified in
  // approved scope" — this opens the explicit specialty-fabrication fields.
  const [specialtyFabricationOpen, setSpecialtyFabricationOpen] = useState(false);
  const loadGenRef = useRef(0);
  const estimateRevisionRef = useRef(0);
  const estimateRef = useRef<StudioEstimate | null>(null);
  const autosaveRef = useRef<ReturnType<typeof createStudioAutosaveController> | null>(null);
  const calcTokenRef = useRef(0);
  const latestEditAtRef = useRef(0);
  const showScope = activeSection === "scope";
  const showChoices = activeSection === "customer_choices";
  const showReview = activeSection === "review_publish";

  function markDirty(next = true) {
    setDirty(next);
    onDirtyChange?.(next);
    if (next) {
      latestEditAtRef.current = Date.now();
      autosaveRef.current?.markDirty();
    }
  }

  function setBusyTracked(next: boolean) {
    setBusy(next);
    onBusyChange?.(next);
  }

  function setAutosaveStatusTracked(next: StudioAutosaveStatus) {
    setAutosaveStatus(next);
    onAutosaveStatus?.(STUDIO_AUTOSAVE_LABELS[next] || next);
  }

  function setCalcStatusTracked(next: typeof calcStatus) {
    setCalcStatus(next);
    onCalcStatusRaw?.(next);
    onCalcStatus?.(
      next === "updating"
        ? "Updating price…"
        : next === "updated"
          ? "Price updated"
          : next === "needs_attention"
            ? "Pricing needs attention"
            : ""
    );
  }

  function applyEstimate(est: StudioEstimate | null) {
    if (!est) return;
    const rev = Number(est.revision) || 0;
    if (estimateRevisionRef.current > rev && estimate?.id && est.id !== estimate.id) {
      return;
    }
    estimateRevisionRef.current = Math.max(estimateRevisionRef.current, rev);
    setEstimate(est);
    estimateRef.current = est;
    onCanonicalEstimate?.(est);
    if (est.id) {
      onActiveEstimateChange?.(est.id, {
        revision: est.revision,
        previousRevisionSummary: est.previousRevisionSummary
      });
    }
  }

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    setLoadError(null);
    try {
      const q = takeoffJobId
        ? `?takeoffJobId=${encodeURIComponent(takeoffJobId)}`
        : "";
      const body = (await apiGet(
        `/api/elite100-estimate-studio/intake-cases/${encodeURIComponent(caseId)}/estimate${q}`,
        authToken
      )) as { estimate?: StudioEstimate; partnerAccount?: PartnerAccountOption | null };
      if (gen !== loadGenRef.current) return;
      const est = body.estimate || null;
      if (est?.scope) {
        if (!est.scope.customerName && customerHint) est.scope.customerName = customerHint;
        if (!est.scope.projectName && projectHint) est.scope.projectName = projectHint;
      }
      if (est) applyEstimate(est);
      else setEstimate(null);
      setPartnerAccount(body.partnerAccount || null);
      markDirty(false);
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      const msg = e instanceof ApiError ? e.message : "Unable to load estimate";
      const code =
        e instanceof ApiError && e.body && typeof e.body === "object" && e.body !== null && "code" in e.body
          ? String((e.body as { code?: unknown }).code ?? "")
          : "";
      if (code === "studio_estimate_persistence_unavailable" || code === "studio_estimate_persistence_misconfigured") {
        setLoadError(`${msg} (Supabase persistence unavailable — apply eliteos_studio_estimates_v1.sql or use memory only for tests.)`);
      } else {
        setLoadError(msg);
      }
    }
  }, [authToken, caseId, takeoffJobId, customerHint, projectHint]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // After Takeoff approval handoff, ensure scope leaves needs_takeoff_approval
  // without requiring a manual Refresh click / confirm dialog.
  useEffect(() => {
    if (!estimate?.id) return;
    const takeoffStatus = String(takeoffDisplayStatus || "").toLowerCase();
    // Queue vocabulary uses "Needs estimator review" after takeoff approval.
    if (takeoffStatus !== "approved" && takeoffStatus !== "needs estimator review") return;
    if (estimate.status !== "needs_takeoff_approval") return;
    let cancelled = false;
    void (async () => {
      try {
        const body = (await apiPost(
          `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimate.id)}/refresh-from-takeoff`,
          authToken,
          { force: true, confirm: true }
        )) as { estimate?: StudioEstimate };
        if (cancelled) return;
        if (body.estimate) {
          applyEstimate(body.estimate);
          setActionNotice("Estimate Scope seeded from approved Takeoff.");
        }
      } catch {
        // Non-fatal — getOrCreate reload via refreshKey usually seeds empty rooms.
        void load();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, estimate?.id, estimate?.status, takeoffDisplayStatus, load]);

  useEffect(() => {
    if (!authToken) return;
    if (estimate?.status === "needs_takeoff_approval") return;
    const handle = window.setTimeout(() => {
      void (async () => {
        setAccountSearchBusy(true);
        try {
          const q = encodeURIComponent(accountQuery.trim());
          const body = (await apiGet(
            `/api/elite100-estimate-studio/partner-accounts?q=${q}&limit=20`,
            authToken
          )) as { accounts?: PartnerAccountOption[] };
          setAccountOptions(Array.isArray(body.accounts) ? body.accounts : []);
        } catch {
          setAccountOptions([]);
        } finally {
          setAccountSearchBusy(false);
        }
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [accountQuery, authToken, estimate?.status]);

  function patchScope(partial: Record<string, unknown>) {
    setEstimate((prev) =>
      prev
        ? {
            ...prev,
            scope: { ...(prev.scope || {}), ...partial }
          }
        : prev
    );
    markDirty(true);
    setActionNotice(null);
  }

  function selectPartnerAccount(account: PartnerAccountOption | null) {
    setPartnerAccount(account);
    patchScope({ partnerAccountId: account?.partnerAccountId || null });
  }

  function patchRoom(roomId: string, partial: Record<string, unknown>) {
    setEstimate((prev) => {
      if (!prev?.scope?.rooms) return prev;
      return {
        ...prev,
        scope: {
          ...prev.scope,
          rooms: prev.scope.rooms.map((r) => {
            if (r.id !== roomId) return r;
            const touchesBacksplash = Object.keys(partial).some((k) =>
              k === "includeBacksplash" ||
              k.startsWith("backsplash")
            );
            return touchesBacksplash
              ? applyRoomBacksplashPatch(r, partial)
              : { ...r, ...partial };
          })
        }
      };
    });
    markDirty(true);
  }

  function patchPiece(roomId: string, pieceId: string, partial: Record<string, unknown>) {
    setEstimate((prev) => {
      if (!prev?.scope?.rooms) return prev;
      return {
        ...prev,
        scope: {
          ...prev.scope,
          rooms: prev.scope.rooms.map((r) => {
            if (r.id !== roomId) return r;
            const pieces = Array.isArray(r.pieces) ? r.pieces : [];
            return {
              ...r,
              pieces: pieces.map((p) => (p.id === pieceId ? { ...p, ...partial } : p))
            };
          })
        }
      };
    });
    markDirty(true);
  }

  function patchCustomLine(index: number, partial: Partial<CustomLineItem>) {
    setEstimate((prev) => {
      if (!prev) return prev;
      const lines = [...(prev.scope?.customLineItems || [])];
      lines[index] = { ...lines[index], ...partial };
      return { ...prev, scope: { ...(prev.scope || {}), customLineItems: lines } };
    });
    markDirty(true);
  }

  function addCustomLine(role: CustomLineItem["commercialRole"] = "customer_charge") {
    setEstimate((prev) => {
      if (!prev) return prev;
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `cli-${Date.now()}`;
      const lines = [
        ...(prev.scope?.customLineItems || []),
        {
          id,
          lineKey: id,
          name: "",
          customerDescription: "",
          category:
            role === "discount" || role === "credit" ? "Discount/Credit" : "Other",
          commercialRole: role,
          quantity: 1,
          unit: "ea",
          unitPrice: 0,
          pricingMode: "unit" as const,
          customerFacing:
            role === "internal_only" || role === "absorbed" ? false : true,
          sortOrder: (prev.scope?.customLineItems || []).length
        }
      ];
      return { ...prev, scope: { ...(prev.scope || {}), customLineItems: lines } };
    });
    markDirty(true);
  }

  function duplicateCustomLine(index: number) {
    setEstimate((prev) => {
      if (!prev) return prev;
      const lines = [...(prev.scope?.customLineItems || [])];
      const src = lines[index];
      if (!src) return prev;
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `cli-${Date.now()}`;
      lines.splice(index + 1, 0, {
        ...src,
        id,
        lineKey: id,
        name: src.name ? `${src.name} (copy)` : "",
        customerDescription: src.customerDescription
          ? `${src.customerDescription} (copy)`
          : src.name
            ? `${src.name} (copy)`
            : ""
      });
      return { ...prev, scope: { ...(prev.scope || {}), customLineItems: lines } };
    });
    markDirty(true);
  }

  function removeCustomLine(index: number) {
    setEstimate((prev) => {
      if (!prev) return prev;
      const lines = [...(prev.scope?.customLineItems || [])];
      lines.splice(index, 1);
      return { ...prev, scope: { ...(prev.scope || {}), customLineItems: lines } };
    });
    markDirty(true);
  }

  function patchAddon(key: string, qty: number) {
    setEstimate((prev) => {
      if (!prev) return prev;
      const addOns = { ...(prev.scope?.addOns || {}), [key]: qty };
      return { ...prev, scope: { ...(prev.scope || {}), addOns } };
    });
    markDirty(true);
  }

  /**
   * Upsert the governed estimator SF adjustment for a room (roomId) or the
   * project (roomId null). Zero adjustments with no reason are dropped.
   */
  function patchCountertopAdjustment(
    roomId: string | null,
    partial: Partial<Pick<CountertopScopeAdjustment, "adjustmentSf" | "adjustmentReason">>
  ) {
    setEstimate((prev) => {
      if (!prev) return prev;
      const id = roomId ? `ctsa-room-${roomId}` : "ctsa-project";
      const existing = (prev.scope?.countertopScopeAdjustments || []).filter((a) => a.id !== id);
      const current = (prev.scope?.countertopScopeAdjustments || []).find((a) => a.id === id);
      const next: CountertopScopeAdjustment = {
        id,
        adjustmentScope: roomId ? "room" : "project",
        roomId,
        adjustmentSf: current?.adjustmentSf ?? 0,
        adjustmentReason: current?.adjustmentReason ?? "",
        ...partial,
        adjustedAt: new Date().toISOString()
      };
      const keep = next.adjustmentSf !== 0 || next.adjustmentReason.trim() !== "";
      return {
        ...prev,
        scope: {
          ...(prev.scope || {}),
          countertopScopeAdjustments: keep ? [...existing, next] : existing
        }
      };
    });
    markDirty(true);
  }

  function patchEdgeAdjustment(partial: Partial<EdgeScopeAdjustment>) {
    setEstimate((prev) => {
      if (!prev) return prev;
      const current = prev.scope?.edgeScopeAdjustment || { adjustmentLf: 0, adjustmentReason: "" };
      const next = { ...current, ...partial, adjustedAt: new Date().toISOString() };
      const keep = Number(next.adjustmentLf) !== 0 || String(next.adjustmentReason || "").trim() !== "";
      return {
        ...prev,
        scope: { ...(prev.scope || {}), edgeScopeAdjustment: keep ? next : null }
      };
    });
    markDirty(true);
  }

  function patchFinishedEdgeOverride(partial: Partial<FinishedEdgeOverride>) {
    setEstimate((prev) => {
      if (!prev) return prev;
      const current = prev.scope?.finishedEdgeOverride || { finalLf: null, reason: "" };
      const next = { ...current, ...partial, overriddenAt: new Date().toISOString() };
      const blank =
        next.finalLf == null ||
        next.finalLf === ("" as unknown as number) ||
        (typeof next.finalLf === "number" && !Number.isFinite(next.finalLf) && Number.isNaN(next.finalLf));
      // Empty string from clearing the input → deactivate override.
      const cleared =
        partial.finalLf === null ||
        (typeof partial.finalLf === "number" && Number.isNaN(partial.finalLf));
      if (cleared || (blank && !String(next.reason || "").trim())) {
        return {
          ...prev,
          scope: { ...(prev.scope || {}), finishedEdgeOverride: null }
        };
      }
      return {
        ...prev,
        scope: {
          ...(prev.scope || {}),
          finishedEdgeOverride: {
            finalLf: next.finalLf == null || Number.isNaN(Number(next.finalLf)) ? null : Number(next.finalLf),
            reason: String(next.reason || ""),
            overriddenAt: next.overriddenAt
          }
        }
      };
    });
    markDirty(true);
  }

  async function saveDraft(): Promise<{ ok: true } | { ok: false; conflict?: boolean }> {
    const current = estimateRef.current;
    if (!current?.id || !current.scope) return { ok: true };
    const requestStartedAt = latestEditAtRef.current;
    const localRevision = Number(current.revision ?? 0) || 0;
    setActionError(null);
    try {
      const body = (await apiPatch(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(current.id)}`,
        authToken,
        { scope: current.scope }
      )) as { estimate?: StudioEstimate };
      const applyGate = shouldApplyStudioAutosaveResponse({
        requestStartedAt,
        latestEditAt: latestEditAtRef.current,
        localRevision,
        responseRevision: body.estimate?.revision ?? null
      });
      if (!applyGate.apply) {
        // Keep newer local edits; do not replay stale server draft over them.
        return { ok: true };
      }
      if (body.estimate) applyEstimate(body.estimate);
      markDirty(false);
      return { ok: true };
    } catch (e) {
      if (isEstimateRevisionSupersededError(e)) {
        setActionError(estimateRevisionSupersededMessage());
        setAutosaveStatusTracked("conflict");
        const next = activeEstimateIdFromSupersededError(e);
        if (next) onActiveEstimateChange?.(next);
        return { ok: false, conflict: true };
      }
      if (isTransientHttpError(e)) {
        setActionError(transientFailureMessage(e));
        onTransientFailure?.(e, () => void autosaveRef.current?.retry());
      } else {
        setActionError(e instanceof ApiError ? e.message : "Save failed");
      }
      throw e;
    }
  }

  async function runAutoCalculate() {
    const current = estimateRef.current;
    if (!current?.id || dirty) return;
    const token = ++calcTokenRef.current;
    setCalcStatusTracked("updating");
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(current.id)}/calculate`,
        authToken,
        {}
      )) as { estimate?: StudioEstimate };
      if (token !== calcTokenRef.current) return; // stale
      if (body.estimate) applyEstimate(body.estimate);
      setCalcStatusTracked("updated");
    } catch (e) {
      if (token !== calcTokenRef.current) return;
      setCalcStatusTracked("needs_attention");
      if (!(e instanceof ApiError && (e.status === 409 || e.status === 422))) {
        /* keep last good price; surface soft status */
      }
    }
  }

  useEffect(() => {
    const controller = createStudioAutosaveController({
      debounceMs: 800,
      save: () => saveDraft(),
      onStatus: setAutosaveStatusTracked,
      onSavedClean: () => {
        void runAutoCalculate();
      }
    });
    autosaveRef.current = controller;
    onRegisterFlush?.(() => controller.flush());
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (controller.isDirty() || controller.isInFlight()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      controller.dispose();
      autosaveRef.current = null;
      onRegisterFlush?.(null);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, caseId]);

  async function refreshFromTakeoff() {
    if (!estimate?.id) return;
    setBusyTracked(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const previewBody = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimate.id)}/refresh-from-takeoff`,
        authToken,
        {}
      )) as { preview?: { previousRoomCount?: number; nextRoomCount?: number; previousCountertopSf?: number; nextCountertopSf?: number } };
      const p = previewBody.preview;
      const ok = window.confirm(
        p
          ? `Refresh Estimate Scope from approved Takeoff?\n\nRooms: ${p.previousRoomCount} → ${p.nextRoomCount}\nCountertop SF: ${Number(p.previousCountertopSf ?? 0).toFixed(2)} → ${Number(p.nextCountertopSf ?? 0).toFixed(2)}\n\nCommercial fields (account, material, markup) are preserved where possible.`
          : "Refresh Estimate Scope from approved Takeoff? Measured rooms/pieces will be replaced."
      );
      if (!ok) {
        setBusyTracked(false);
        return;
      }
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimate.id)}/refresh-from-takeoff`,
        authToken,
        { force: true, confirm: true }
      )) as { estimate?: StudioEstimate };
      if (body.estimate) applyEstimate(body.estimate);
      markDirty(false);
      setActionNotice("Estimate Scope refreshed from Takeoff.");
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Refresh from Takeoff failed");
    } finally {
      setBusyTracked(false);
    }
  }

  async function calculate() {
    if (!estimate?.id) return;
    // Do not silently save unrelated form changes — require explicit Save Pricing Setup.
    if (dirty) {
      setActionError("Save Pricing Setup before calculating.");
      return;
    }
    const wf = workflowProp || estimate.workflow || null;
    if (wf && !workflowAllowsAction(wf, "calculate")) {
      setActionError(
        wf.nextRequiredActionDetail ||
          wf.nextRequiredActionLabel ||
          "Calculate is not available yet."
      );
      return;
    }
    setBusyTracked(true);
    setActionError(null);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimate.id)}/calculate`,
        authToken,
        {}
      )) as { estimate?: StudioEstimate };
      if (body.estimate) applyEstimate(body.estimate);
      markDirty(false);
      setActionNotice("Estimate calculated.");
    } catch (e) {
      // Preserve form + server state; never claim calculated on failure.
      if (isEstimateRevisionSupersededError(e)) {
        setActionError(estimateRevisionSupersededMessage());
        const next = activeEstimateIdFromSupersededError(e);
        if (next) onActiveEstimateChange?.(next);
      } else if (isTransientHttpError(e)) {
        const msg = transientFailureMessage(e);
        setActionError(msg);
        onTransientFailure?.(e, () => void calculate());
      } else {
        setActionError(e instanceof ApiError ? e.message : "Calculate failed");
      }
    } finally {
      setBusyTracked(false);
    }
  }

  async function approve() {
    if (!estimate?.id) return;
    const wf = workflowProp || estimate.workflow || null;
    if (dirty) {
      setActionError("Save Pricing Setup before approving.");
      return;
    }
    if (estimate.status !== "priced" || (wf && !workflowAllowsAction(wf, "approve"))) {
      setActionError("Calculate the estimate before approving.");
      return;
    }
    if (!window.confirm("Approve this estimate? Scope and Takeoff changes will invalidate approval.")) return;
    setBusyTracked(true);
    setActionError(null);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimate.id)}/approve`,
        authToken,
        { confirm: true }
      )) as { estimate?: StudioEstimate };
      if (body.estimate) applyEstimate(body.estimate);
      setActionNotice("Estimate approved. Ready for a later Digital Estimate publication step.");
    } catch (e) {
      if (isEstimateRevisionSupersededError(e)) {
        setActionError(estimateRevisionSupersededMessage());
        const next = activeEstimateIdFromSupersededError(e);
        if (next) onActiveEstimateChange?.(next);
      } else if (isTransientHttpError(e)) {
        setActionError(transientFailureMessage(e));
        onTransientFailure?.(e, () => void approve());
      } else {
        setActionError(e instanceof ApiError ? e.message : "Approve failed");
      }
    } finally {
      setBusyTracked(false);
    }
  }

  if (loadError) {
    return (
      <div className="eq-state eq-state--error" role="alert">
        <strong>Estimate unavailable.</strong> {loadError}
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="eq-state" role="status">
        Loading estimate…
      </div>
    );
  }

  const blocked = estimate.status === "needs_takeoff_approval";
  // Compatibility-only label (rendered inside the collapsed legacy details
  // block above) — the normal active-v4 status is the four-status bar
  // (Source/Scope/Pricing/Publication) in the workspace header, not this text.
  const estimateStatusLabel =
    estimate.status === "needs_takeoff_approval"
      ? "Awaiting Takeoff data"
      : estimate.status === "priced"
        ? "Priced — legacy approval pending"
        : estimate.status === "approved"
          ? "Legacy approval recorded"
          : estimate.status === "draft" || estimate.status === "ready_to_calculate"
            ? "Not yet calculated"
            : String(estimate.status || "Unknown").replace(/_/g, " ");
  const scope = estimate.scope || {};
  const workflow = workflowProp || estimate.workflow || null;
  const pricingDirty = dirty;
  const canCalculate =
    !busy &&
    !blocked &&
    !pricingDirty &&
    (!workflow || workflowAllowsAction(workflow, "calculate"));
  const canApprove =
    !busy &&
    !blocked &&
    !pricingDirty &&
    estimate.status === "priced" &&
    (!workflow || workflowAllowsAction(workflow, "approve"));
  const approvalCurrent = workflow?.approvalCurrent === true;
  const calculationCurrent = workflow?.calculationCurrent === true;
  const totals = estimate.calculation?.totals;
  const reviewSummary = (
    estimate.calculation as { reviewSummary?: StudioActiveReviewSummary } | undefined
  )?.reviewSummary;
  // Active-vs-historical and Publish-eligibility are both server-computed
  // (studioEstimateService.safeEstimateView -> studioActiveReviewReadiness.mjs).
  // The frontend only displays estimate.activeReview — it must never derive
  // its own eligible/blockers, since that would let stale/tampered browser
  // state declare an estimate publishable. Absent the field (e.g. an older
  // cached read), default to the active-v4 experience — historical status
  // requires an explicit false, never inferred from missing data.
  const isActiveSimplified = estimate.isActiveSimplifiedEstimate !== false;
  const activeReadiness = estimate.activeReview || null;
  // Approved Takeoff = physical-scope authority. Manual quantity entry only
  // exists as a clearly-labeled fallback when no approved Takeoff seeded scope.
  // Authority follows physicalScopeSource alone — the summary is display data
  // (older estimates heal it server-side on next load) and must not flip the
  // estimate back into manual mode when momentarily absent.
  const takeoffAuthority = scope.physicalScopeSource === "takeoff";
  const manualStaffAuthority =
    scope.physicalScopeSource === "manual_staff" || scope.estimateOrigin === "manual_staff";
  const manualScopeConfirmed = manualStaffAuthority && scope.manualScopeConfirmed === true;
  const scopeSummary = scope.takeoffScopeSummary || null;
  // Display-only mirror of the backend-authoritative scope billing (same pure
  // module the pricing engine uses). Internal estimator data — never public.
  const scopeBilling = buildStudioScopeBilling(scope) as {
    measuredCountertopSf: number;
    adjustedMeasuredCountertopSf: number;
    billedBeforeAdjustmentsSf: number;
    billedCountertopSf: number;
    independentSectionCount: number;
    rooms: Array<{
      roomId: string;
      measuredSf: number;
      billedSf: number;
      billedWithAdjustmentsSf: number;
    }>;
  };
  const edgeScope = resolveScopeEdgeLinearFeet(scope) as {
    derivedLf: number;
    takeoffApprovedLf?: number;
    adjustmentLf: number;
    overrideLf?: number | null;
    overrideActive?: boolean;
    finalLf: number;
    source: string;
    confirmationRequired?: boolean;
  };
  const activeEdgeProfileToken =
    scope.edgeProfileToken ||
    LEGACY_EDGE_MODE_TO_PROFILE[String(scope.edgeMode || "included")] ||
    "edge_eased";
  const activeEdgeProfile = CANONICAL_EDGE_PROFILES.find(
    (p) => p.token === activeEdgeProfileToken
  );
  const roomAdjustmentFor = (roomId: string) =>
    (scope.countertopScopeAdjustments || []).find(
      (a) => a.adjustmentScope === "room" && a.roomId === roomId
    ) || null;
  const projectAdjustment =
    (scope.countertopScopeAdjustments || []).find((a) => a.adjustmentScope === "project") || null;
  const legacyGenericProductQty =
    ["qty-ss", "qty-v-rect", "qty-v-oval"].reduce(
      (s, k) => s + (Number(scope.addOns?.[k]) || 0),
      0
    );

  return (
    <div className="eq-estimate-panel" data-testid="estimate-scope-panel">
      <div className="eq-workspace-status-bar" data-testid="eq-workspace-status-bar">
        <span data-testid="eq-autosave-status">
          {STUDIO_AUTOSAVE_LABELS[autosaveStatus] || (dirty ? "Saving…" : "Saved")}
        </span>
        <span data-testid="eq-calc-status">
          {calcStatus === "updating"
            ? "Updating price…"
            : calcStatus === "updated"
              ? "Price updated"
              : calcStatus === "needs_attention"
                ? "Pricing needs attention"
                : ""}
        </span>
      </div>
      {estimate.persistenceWarning ? (
        <div className="eq-state eq-state--warn" role="status">
          {estimate.persistenceWarning}
        </div>
      ) : null}
      {estimate.staleReason ? (
        <div className="eq-state eq-state--warn" role="status" data-testid="eq-estimate-stale">
          {estimate.staleReason}
        </div>
      ) : null}

      {collapseCompleted && !actionError && !dirty ? (
        <section className="eq-estimate-section" data-testid="eq-scope-collapsed" aria-label="Completed pricing">
          <h2>Pricing &amp; approval — complete</h2>
          <p className="eq-muted">
            Calculation and approval are current for revision {estimate.revision ?? 1}. Open details only
            if you need to change scope or pricing.
          </p>
          <button
            type="button"
            className="eq-btn-ghost"
            data-testid="eq-expand-pricing-sections"
            onClick={() => onExpandCompleted?.()}
          >
            View pricing and approval details
          </button>
        </section>
      ) : null}

      {!(collapseCompleted && !actionError && !dirty) ? (
      <>
      <section
        className="eq-estimate-section"
        aria-label="Takeoff gate"
        hidden={!showScope}
        data-testid="eq-section-scope-takeoff"
      >
        {blocked ? (
          <div className="eq-state eq-state--warn" data-testid="eq-estimate-blocked">
            AI Takeoff is still preparing the Scope draft. You can wait for the worksheet, or continue
            editing Scope once rooms and pieces are available.
          </div>
        ) : (
          <p className="eq-muted">Scope draft ready — define Customer Choices below.</p>
        )}
        {/* Active-v4: the four-status bar (Source/Scope/Pricing/Publication) in the
            workspace header above is the one status display for the normal active
            flow. This legacy per-field status/calculation/approval/persistence
            readout is a historical/legacy-only compatibility control — it must
            not mount at all (even collapsed) for an active simplified estimate. */}
        {!isActiveSimplified ? (
        <details className="eq-compat-advanced" data-testid="eq-compat-estimate-status-meta">
          <summary>Advanced — legacy estimate status (compatibility)</summary>
          <dl className="eq-status-dl" data-testid="eq-estimate-status-meta">
            <div>
              <dt>Takeoff</dt>
              <dd>{takeoffDisplayStatus}</dd>
            </div>
            <div>
              <dt>Estimate status</dt>
              <dd data-testid="eq-estimate-status">{estimateStatusLabel}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd data-testid="eq-estimate-revision">{estimate.revision ?? 1}</dd>
            </div>
            <div>
              <dt>Calculation</dt>
              <dd data-testid="eq-calculation-label">
                {workflow?.display?.calculationLabel ||
                  (calculationCurrent
                    ? `Calculated ${estimate.calculation?.calculatedAt || ""}`.trim()
                    : "Not calculated")}
              </dd>
            </div>
            <div>
              <dt>Approval</dt>
              <dd data-testid="eq-approval-label">
                {workflow?.display?.approvalLabel ||
                  (approvalCurrent
                    ? `Approved ${estimate.approval?.approvedAt || estimate.approvedAt || ""}`.trim()
                    : "Not approved")}
              </dd>
            </div>
            <div>
              <dt>Persistence</dt>
              <dd data-testid="eq-estimate-repo-mode">
                {estimate.repositoryMode || "unknown"}
                {estimate.updatedAt ? ` · saved ${estimate.updatedAt}` : dirty ? " · unsaved draft" : ""}
              </dd>
            </div>
          </dl>
        </details>
        ) : null}
        {estimate.staleReason ? (
          <div className="eq-action-row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="eq-refresh-from-takeoff"
              disabled={busy}
              onClick={() => void refreshFromTakeoff()}
            >
              Refresh from Takeoff
            </button>
          </div>
        ) : null}
      </section>

      <section
        className="eq-estimate-section"
        aria-label="Pricing setup"
        hidden={showReview}
        data-testid="eq-section-pricing-setup"
      >
        <h2>{showChoices ? "Customer Choices" : showScope ? "Scope details" : "Pricing Setup"}</h2>
        <p className="eq-muted">
          {showScope
            ? manualStaffAuthority
              ? "Define rooms, pieces, dimensions, openings, and edges. Changes autosave."
              : "Review and edit physical Scope from Takeoff. Changes autosave."
            : "Choose materials, edges, catalogs, and Advanced Pricing. Changes autosave and price updates automatically."}
        </p>
        <div hidden={!showScope} data-testid="eq-section-scope-body">
        {manualStaffAuthority ? (
          // Active-v4: the canonical ManualPhysicalScopeEditor (mounted above,
          // in EstimateTakeoffWorkspace) is the single Scope editor + summary.
          // Do not render a second, independently-loaded scope read model here
          // — it can go stale relative to the editor's live autosaved values.
          <p className="eq-muted" data-testid="eq-scope-canonical-hint">
            Scope is defined above in the physical Scope editor. Changes there autosave and are
            used for this Scope summary, Customer Choices, and Review &amp; Publish.
          </p>
        ) : null}
        </div>
        <div hidden={!showChoices} data-testid="eq-section-choices-body">
        <h3>Customer and project</h3>
        <p className="eq-muted">
          Prefer the <strong>Project details</strong> section above for project name and jobsite
          address. Fields here stay in sync and do not change measured scope or pricing when only
          metadata changes.
        </p>
        <div className="eq-scope-grid">
          <label>
            Customer / company
            <input
              value={scope.customerName || ""}
              disabled={blocked}
              data-testid="eq-customer-name"
              onChange={(e) => patchScope({ customerName: e.target.value })}
            />
          </label>
          <label>
            Contact
            <input
              value={scope.customerContactName || ""}
              disabled={blocked}
              onChange={(e) => patchScope({ customerContactName: e.target.value })}
            />
          </label>
          <label>
            Email
            <input
              value={scope.customerEmail || ""}
              disabled={blocked}
              onChange={(e) => patchScope({ customerEmail: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              value={scope.customerPhone || ""}
              disabled={blocked}
              onChange={(e) => patchScope({ customerPhone: e.target.value })}
            />
          </label>
          <label>
            Project
            <input
              value={scope.projectName || ""}
              disabled={blocked}
              onChange={(e) => patchScope({ projectName: e.target.value })}
            />
          </label>
          <label>
            Address
            <input
              value={scope.projectAddress || ""}
              disabled={blocked}
              onChange={(e) => patchScope({ projectAddress: e.target.value })}
            />
          </label>
        </div>
        <h3>Pricing basis</h3>
        <div className="eq-scope-grid">
          <label>
            Pricing basis
            <select
              value={scope.pricingBasis || "wholesale"}
              disabled={blocked}
              onChange={(e) => patchScope({ pricingBasis: e.target.value })}
              data-testid="eq-pricing-basis"
            >
              <option value="wholesale">Wholesale</option>
              <option value="direct">Direct / Retail</option>
            </select>
          </label>
        </div>
        <h3>Material</h3>
        <div className="eq-scope-grid">
          <label>
            Estimate default material group
            <select
              value={scope.materialGroup || "Group Promo"}
              disabled={blocked}
              data-testid="eq-material-group-default"
              onChange={(e) => patchScope({ materialGroup: e.target.value })}
            >
              {MATERIAL_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label>
            Exact color
            <input
              value={scope.colorName || ""}
              disabled={blocked || Boolean(scope.colorTbd)}
              onChange={(e) => patchScope({ colorName: e.target.value })}
            />
          </label>
          <label className="eq-check">
            <input
              type="checkbox"
              checked={Boolean(scope.colorTbd)}
              disabled={blocked}
              onChange={(e) => patchScope({ colorTbd: e.target.checked })}
            />
            Color TBD (warning)
          </label>
        </div>
        <p className="eq-muted">
          Inheritance: piece override → room override → estimate default. Clearing an override
          restores inheritance; matching the parent group still counts as an override when set.
        </p>
        {(scope.rooms || []).filter((r) => r && r.included !== false).length > 0 ? (
          <div className="eq-material-inheritance" data-testid="eq-material-inheritance">
            {(scope.rooms || [])
              .filter((r) => r && r.included !== false)
              .map((room) => (
                <div key={room.id} className="eq-material-room" data-testid="eq-material-room-row">
                  <strong>{room.name || room.id}</strong>
                  <label>
                    Room material
                    <select
                      value={
                        room.materialGroupOverride != null && room.materialGroupOverride !== ""
                          ? room.materialGroupOverride
                          : ""
                      }
                      disabled={blocked}
                      data-testid="eq-room-material-override"
                      onChange={(e) => {
                        const v = e.target.value;
                        patchRoom(room.id, {
                          materialGroupOverride: v ? v : null
                        });
                      }}
                    >
                      <option value="">Inherit estimate default ({scope.materialGroup || "Group Promo"})</option>
                      {MATERIAL_GROUPS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ul className="eq-material-piece-list">
                    {(room.pieces || [])
                      .filter((p) => p && p.included !== false)
                      .map((piece) => (
                        <li key={piece.id} data-testid="eq-material-piece-row">
                          <span>{piece.name || piece.id}</span>
                          <label className="eq-check">
                            <input
                              type="checkbox"
                              checked={Boolean(piece.materialOverride)}
                              disabled={blocked}
                              data-testid="eq-piece-material-override"
                              onChange={(e) => {
                                const on = e.target.checked;
                                patchPiece(room.id, piece.id, {
                                  materialOverride: on,
                                  materialGroup: on
                                    ? piece.materialGroup ||
                                      room.materialGroupOverride ||
                                      scope.materialGroup ||
                                      "Group Promo"
                                    : null
                                });
                              }}
                            />
                            Piece override
                          </label>
                          {piece.materialOverride ? (
                            <select
                              value={piece.materialGroup || "Group Promo"}
                              disabled={blocked}
                              data-testid="eq-piece-material-group"
                              onChange={(e) =>
                                patchPiece(room.id, piece.id, {
                                  materialOverride: true,
                                  materialGroup: e.target.value
                                })
                              }
                            >
                              {MATERIAL_GROUPS.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="eq-muted">
                              Inherits{" "}
                              {room.materialGroupOverride || scope.materialGroup || "Group Promo"}
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
          </div>
        ) : null}

        </div>
        <div hidden={!showScope} data-testid="eq-section-scope-physical">
        {/*
         * Active-v4: the canonical Scope editor (ManualPhysicalScopeEditor,
         * mounted above for both manual and AI-assisted estimates) is the
         * single place rooms, pieces, dimensions, edges, backsplash, and
         * openings are entered and summarized. This panel must not render a
         * second, independently-loaded read model of the same facts — that
         * was the source of the "editor shows 46.25 SF, summary shows 0"
         * regression (this view loaded scope on its own schedule and could
         * be stale relative to the editor's live autosaved values).
         */}
        </div>
        <div hidden={!showChoices} data-testid="eq-section-choices-commercial">
        <h3>Customer selections</h3>
        <p className="eq-muted" data-testid="eq-customer-selections-summary">
          The customer can choose active Elite 100 materials and currently supported catalog
          options. Pricing is calculated from the approved Scope.
        </p>
        <details className="eq-compat-advanced" data-testid="eq-compat-catalog-permissions">
          <summary>Advanced — per-category customer catalog permissions (compatibility)</summary>
          <p className="eq-muted">
            Exact products (model, finish, SKU, governed price) resolve through the Digital
            Estimate catalogs — never generic quantity fields here. Physical openings come from
            the approved Takeoff.
          </p>
          <div className="eq-addon-grid" data-testid="eq-catalog-permissions">
            {(
              [
                ["material", "Customer may select material / color"],
                ["sink", "Customer may select sink"],
                ["faucet", "Customer may select faucet"],
                ["accessories", "Customer may select accessories"],
                ["specialty", "Customer may select specialty items"],
                ["edge", "Customer may select edge profile"],
                ["backsplash", "Customer may select backsplash style"],
                ["side_splash", "Customer may select side splash"]
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="eq-check">
                <input
                  type="checkbox"
                  checked={scope.customerCatalogPermissions?.[key] !== false}
                  disabled={blocked}
                  data-testid={`eq-catalog-permission-${key}`}
                  onChange={(e) =>
                    patchScope({
                      customerCatalogPermissions: {
                        ...(scope.customerCatalogPermissions || {}),
                        [key]: e.target.checked
                      }
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </details>
        {legacyGenericProductQty > 0 ? (
          <div className="eq-state eq-state--warn" data-testid="eq-legacy-product-qty-warning">
            This estimate carries legacy generic sink quantities (
            {legacyGenericProductQty} total) saved before catalog governance. They still price
            for backward compatibility — clear them and use the sink catalog instead.
            <button
              type="button"
              className="eq-btn-ghost"
              disabled={blocked}
              data-testid="eq-clear-legacy-product-qty"
              onClick={() => {
                patchAddon("qty-ss", 0);
                patchAddon("qty-v-rect", 0);
                patchAddon("qty-v-oval", 0);
              }}
            >
              Clear legacy quantities
            </button>
          </div>
        ) : null}

        <h3>Edge</h3>
        <div className="eq-scope-grid">
          <label>
            Edge profile (canonical)
            <select
              value={activeEdgeProfileToken}
              disabled={blocked}
              data-testid="eq-edge-profile"
              onChange={(e) =>
                // Canonical token is the authority; legacy edgeMode is cleared
                // so old W/D tokens can never resurface on this estimate.
                patchScope({ edgeProfileToken: e.target.value, edgeMode: null })
              }
            >
              <optgroup label="Included">
                {CANONICAL_EDGE_PROFILES.filter((p) => p.tier === "free").map((p) => (
                  <option key={p.token} value={p.token}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Premium">
                {CANONICAL_EDGE_PROFILES.filter((p) => p.tier === "premium").map((p) => (
                  <option key={p.token} value={p.token}>
                    {p.label} (premium)
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {takeoffAuthority ? (
            <>
              <label>
                Approved finished edge from Takeoff (LF)
                <input
                  type="number"
                  value={
                    Number(
                      scope.takeoffScopeSummary?.approvedFinishedEdgeLf ??
                        edgeScope.takeoffApprovedLf ??
                        edgeScope.derivedLf ??
                        0
                    )
                  }
                  readOnly
                  disabled
                  data-testid="eq-edge-derived-lf"
                />
              </label>
              <label>
                Estimator finished-edge override (LF)
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  value={
                    scope.finishedEdgeOverride?.finalLf == null
                      ? ""
                      : scope.finishedEdgeOverride.finalLf
                  }
                  disabled={blocked}
                  placeholder="Blank = use Takeoff total"
                  data-testid="eq-finished-edge-override"
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      patchFinishedEdgeOverride({ finalLf: null });
                      return;
                    }
                    patchFinishedEdgeOverride({ finalLf: Number(raw) });
                  }}
                />
              </label>
              <label>
                Override reason{" "}
                {scope.finishedEdgeOverride?.finalLf != null ? "(required)" : ""}
                <input
                  value={scope.finishedEdgeOverride?.reason ?? ""}
                  disabled={blocked}
                  data-testid="eq-finished-edge-override-reason"
                  placeholder="Required when override LF is set"
                  onChange={(e) => patchFinishedEdgeOverride({ reason: e.target.value })}
                />
              </label>
              <label>
                Estimator edge adjustment (± LF)
                <input
                  type="number"
                  step={0.01}
                  value={scope.edgeScopeAdjustment?.adjustmentLf ?? 0}
                  disabled={blocked || Boolean(scope.finishedEdgeOverride?.finalLf != null)}
                  data-testid="eq-edge-adjustment"
                  onChange={(e) =>
                    patchEdgeAdjustment({ adjustmentLf: Number(e.target.value) || 0 })
                  }
                />
              </label>
              <label>
                Edge adjustment reason{" "}
                {(scope.edgeScopeAdjustment?.adjustmentLf ?? 0) !== 0 ? "(required)" : ""}
                <input
                  value={scope.edgeScopeAdjustment?.adjustmentReason ?? ""}
                  disabled={blocked || Boolean(scope.finishedEdgeOverride?.finalLf != null)}
                  data-testid="eq-edge-adjustment-reason"
                  placeholder="Legacy ± LF when no absolute override"
                  onChange={(e) => patchEdgeAdjustment({ adjustmentReason: e.target.value })}
                />
              </label>
              <label>
                Final priced finished edge (LF)
                <input
                  type="number"
                  value={edgeScope.finalLf}
                  readOnly
                  disabled
                  data-testid="eq-edge-final-lf"
                />
              </label>
            </>
          ) : manualStaffAuthority ? (
            // Active-v4: per-room open-edge LF is already shown in the canonical
            // Scope editor's room summary above — only the project-level derived
            // total (used for pricing) belongs here, not a second per-room list.
            <div data-testid="eq-confirmed-finished-edge">
              <p className="eq-footnote">
                Physical open-edge LF comes from Scope and is independent of the base edge profile
                (Eased, etc.). Customer premium-edge options use these LF values.
              </p>
              <p className="eq-muted" data-testid="eq-edge-final-lf-display">
                Project open edge (from Scope): {edgeScope.finalLf.toFixed(2)} LF
              </p>
            </div>
          ) : (
            <label>
              Edge LF (manual)
              <input
                type="number"
                min={0}
                value={scope.edgeLinearFeet ?? 0}
                disabled={blocked || (activeEdgeProfile ? activeEdgeProfile.tier === "free" : false)}
                onChange={(e) => patchScope({ edgeLinearFeet: Number(e.target.value) })}
              />
            </label>
          )}
        </div>
        {takeoffAuthority ? (
          <p className="eq-footnote" data-testid="eq-edge-source-note">
            Source:{" "}
            {edgeScope.overrideActive
              ? "estimator finished-edge override"
              : "sum of estimator-approved per-piece finished edges"}{" "}
            ({edgeScope.source}). Finished-edge LF is independent of backsplash mode.
            {edgeScope.overrideActive
              ? " Absolute override replaces the Takeoff total for pricing."
              : " Use an absolute override or ± LF adjustment with a reason when field geometry differs."}
            {edgeScope.confirmationRequired
              ? " Confirmation required in Takeoff (or set an override) before Digital Estimate publication."
              : ""}
          </p>
        ) : null}

        <details className="eq-compat-advanced" data-testid="eq-advanced-estimator-pricing">
          <summary>Advanced estimator pricing</summary>
          <p className="eq-muted">
            Account linking, trusted partner pricing, services, custom charges/discounts/credits,
            internal-only and absorbed costs, specialty fabrication, internal markup, estimator
            notes, and troubleshooting save controls. Collapsed by default — backend behavior is
            unchanged.
          </p>
          {authToken ? (
            <StudioAccountDirectoryPanel
              sessionToken={authToken}
              blocked={blocked}
              scope={{
                customerName: scope.customerName,
                customerContactName: scope.customerContactName,
                customerEmail: scope.customerEmail,
                customerPhone: scope.customerPhone,
                projectAddress: scope.projectAddress,
                accountDirectoryAccountId: scope.accountDirectoryAccountId,
                accountDirectoryContactId: scope.accountDirectoryContactId,
                accountDirectoryLocationId: scope.accountDirectoryLocationId,
                customerIdentitySnapshot: scope.customerIdentitySnapshot as
                  | import("./StudioAccountDirectoryPanel").StudioCustomerIdentitySnapshot
                  | null
                  | undefined
              }}
              patchScope={(patch) => patchScope(patch)}
            />
          ) : null}
          <div className="eq-scope-grid">
            <label>
              Trusted partner account
              <input
                type="search"
                value={accountQuery}
                disabled={blocked}
                placeholder="Search trusted partner accounts by name"
                data-testid="eq-partner-account-search"
                onChange={(e) => setAccountQuery(e.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="eq-account-picker" data-testid="eq-partner-account-picker">
              <p className="eq-muted">
                Selected:{" "}
                <strong data-testid="eq-partner-account-selected">
                  {partnerAccount?.displayName ||
                    (scope.partnerAccountId ? "Account selected" : "None")}
                </strong>
                {accountSearchBusy ? " · searching…" : ""}
              </p>
              <div className="eq-account-options">
                <button
                  type="button"
                  className="eq-btn-ghost"
                  disabled={blocked || !scope.partnerAccountId}
                  onClick={() => selectPartnerAccount(null)}
                >
                  Clear trusted partner
                </button>
                {accountOptions.map((opt) => (
                  <button
                    key={opt.partnerAccountId}
                    type="button"
                    className={
                      scope.partnerAccountId === opt.partnerAccountId
                        ? "eq-btn-secondary"
                        : "eq-btn-ghost"
                    }
                    disabled={blocked}
                    onClick={() => selectPartnerAccount(opt)}
                  >
                    {opt.displayName}
                  </button>
                ))}
              </div>
              <p className="eq-footnote">
                Trusted partner pricing uses partnerAccountId membership only (Watts/Spahn).
                Selecting an Account Directory account never grants trusted partner pricing by
                name.
              </p>
            </div>
          </div>

        <h3>Services</h3>
        <p className="eq-muted">
          Estimator-controlled services. Tear-out is a service preset; extra trips and other
          services are customer-facing custom lines below.
        </p>
        <div className="eq-addon-grid" data-testid="eq-service-grid">
          <label>
            Tear-out
            <input
              type="number"
              min={0}
              step={1}
              value={scope.addOns?.["tearout"] ?? 0}
              disabled={blocked}
              onChange={(e) => patchAddon("tearout", Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
        </div>

        <h3>Advanced Pricing</h3>
        <details className="eq-advanced-pricing" data-testid="eq-advanced-pricing" open={false}>
          <summary>Advanced Pricing — charges, discounts, credits, internal &amp; absorbed costs</summary>
        <p className="eq-muted">
          Customer charges, discounts/credits, internal-only costs, and absorbed costs. Server
          calculation is authoritative. Internal-only and absorbed amounts never appear on the
          customer Digital Estimate or customer print.
        </p>
        <div className="eq-custom-lines" data-testid="eq-custom-lines">
          {(scope.customLineItems || []).length === 0 ? (
            <p className="eq-muted">No commercial adjustment lines yet.</p>
          ) : (
            <ul className="eq-custom-line-list">
              {(scope.customLineItems || []).map((line, index) => {
                const role = line.commercialRole || "customer_charge";
                return (
                <li key={line.id || `cli-${index}`} data-testid="eq-custom-line-row">
                  <label>
                    Line purpose
                    <select
                      value={role}
                      disabled={blocked}
                      data-testid="eq-custom-line-role"
                      onChange={(e) => {
                        const next = e.target.value as CustomLineItem["commercialRole"];
                        patchCustomLine(index, {
                          commercialRole: next,
                          category:
                            next === "discount" || next === "credit"
                              ? "Discount/Credit"
                              : line.category || "Other",
                          customerFacing:
                            next === "internal_only" || next === "absorbed" ? false : true
                        });
                      }}
                    >
                      <option value="customer_charge">Customer charge</option>
                      <option value="customer_charge_hidden_detail">
                        Customer charge (hide internal detail)
                      </option>
                      <option value="discount">Discount</option>
                      <option value="credit">Credit</option>
                      <option value="internal_only">Internal-only cost</option>
                      <option value="absorbed">Absorbed cost</option>
                    </select>
                  </label>
                  <label>
                    Customer description
                    <input
                      value={line.customerDescription || line.name || ""}
                      disabled={blocked}
                      onChange={(e) =>
                        patchCustomLine(index, {
                          customerDescription: e.target.value,
                          name: e.target.value
                        })
                      }
                      data-testid="eq-custom-line-name"
                    />
                  </label>
                  {role === "customer_charge_hidden_detail" ||
                  role === "internal_only" ||
                  role === "absorbed" ? (
                    <label>
                      Internal notes
                      <input
                        value={line.internalNotes || ""}
                        disabled={blocked}
                        onChange={(e) =>
                          patchCustomLine(index, { internalNotes: e.target.value })
                        }
                        data-testid="eq-custom-line-internal-notes"
                      />
                    </label>
                  ) : null}
                  <label>
                    Category
                    <select
                      value={line.category || "Other"}
                      disabled={blocked || role === "discount" || role === "credit"}
                      onChange={(e) => patchCustomLine(index, { category: e.target.value })}
                      data-testid="eq-custom-line-category"
                    >
                      {[
                        "Countertop",
                        "Backsplash",
                        "Sink",
                        "Faucet",
                        "Plumbing fixture",
                        "Accessory",
                        "Labor",
                        "Service",
                        "Fee",
                        "Discount/Credit",
                        "Other"
                      ].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ownership
                    <select
                      value={line.roomId || ""}
                      disabled={blocked}
                      data-testid="eq-custom-line-room"
                      onChange={(e) => {
                        const roomId = e.target.value || null;
                        const room = (scope.rooms || []).find((r) => String(r.id) === roomId);
                        patchCustomLine(index, {
                          roomId,
                          roomName: room ? room.name || null : null
                        });
                      }}
                    >
                      <option value="">Project</option>
                      {(scope.rooms || []).map((r) => (
                        <option key={r.id} value={String(r.id)}>
                          {r.name || r.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Qty
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.quantity ?? 1}
                      disabled={blocked || line.pricingMode === "fixed"}
                      onChange={(e) =>
                        patchCustomLine(index, { quantity: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label>
                    Unit
                    <input
                      value={line.unit || "ea"}
                      disabled={blocked}
                      onChange={(e) => patchCustomLine(index, { unit: e.target.value })}
                    />
                  </label>
                  <label>
                    {role === "discount" || role === "credit" ? "Amount (positive)" : "Unit price"}
                    <input
                      type="number"
                      step={0.01}
                      value={Math.abs(Number(line.unitPrice) || 0)}
                      disabled={blocked}
                      onChange={(e) =>
                        patchCustomLine(index, {
                          unitPrice: Number(e.target.value) || 0,
                          pricingMode: "unit"
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="eq-btn-ghost"
                    disabled={blocked}
                    onClick={() => duplicateCustomLine(index)}
                    data-testid="eq-custom-line-duplicate"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="eq-btn-ghost"
                    disabled={blocked}
                    onClick={() => {
                      if (window.confirm("Remove this commercial line?")) {
                        removeCustomLine(index);
                      }
                    }}
                    data-testid="eq-custom-line-remove"
                  >
                    Remove
                  </button>
                </li>
              );
              })}
            </ul>
          )}
          <div className="eq-action-row">
            <button
              type="button"
              className="eq-btn-secondary"
              disabled={blocked}
              onClick={() => addCustomLine("customer_charge")}
              data-testid="eq-custom-line-add"
            >
              Add customer charge
            </button>
            <button
              type="button"
              className="eq-btn-ghost"
              disabled={blocked}
              onClick={() => addCustomLine("discount")}
              data-testid="eq-discount-add"
            >
              Add discount
            </button>
            <button
              type="button"
              className="eq-btn-ghost"
              disabled={blocked}
              onClick={() => addCustomLine("credit")}
              data-testid="eq-credit-add"
            >
              Add credit
            </button>
            <button
              type="button"
              className="eq-btn-ghost"
              disabled={blocked}
              onClick={() => addCustomLine("internal_only")}
              data-testid="eq-internal-only-add"
            >
              Add internal-only cost
            </button>
            <button
              type="button"
              className="eq-btn-ghost"
              disabled={blocked}
              onClick={() => addCustomLine("absorbed")}
              data-testid="eq-absorbed-add"
            >
              Add absorbed cost
            </button>
          </div>
        </div>
        </details>

        <h3>Specialty fabrication (miter / build-up)</h3>
        {takeoffAuthority && !specialtyFabricationOpen && !scope.miterHeightKey && !(Number(scope.buildupSqft) > 0) ? (
          <div data-testid="eq-specialty-not-identified">
            <p className="eq-muted">
              Not identified in approved scope. The approved Takeoff does not carry miter or
              build-up authority yet.
            </p>
            <button
              type="button"
              className="eq-btn-secondary"
              disabled={blocked}
              data-testid="eq-add-specialty-fabrication"
              onClick={() => setSpecialtyFabricationOpen(true)}
            >
              Add specialty fabrication
            </button>
          </div>
        ) : (
          <div className="eq-scope-grid" data-testid="eq-specialty-fabrication-fields">
            <label>
              Miter height
              <select
                value={scope.miterHeightKey || ""}
                disabled={blocked}
                onChange={(e) => patchScope({ miterHeightKey: e.target.value || null })}
              >
                <option value="">None</option>
                <option value="2-3in">2–3 in ($65/LF)</option>
                <option value="4in">4 in ($70/LF)</option>
                <option value="5in">5 in ($75/LF)</option>
                <option value="6in">6 in ($80/LF)</option>
              </select>
            </label>
            <label>
              Miter LF
              <input
                type="number"
                min={0}
                value={scope.miterLinearFeet ?? 0}
                disabled={blocked || !scope.miterHeightKey}
                onChange={(e) => patchScope({ miterLinearFeet: Number(e.target.value) })}
              />
            </label>
            <label>
              Build-up SF
              <input
                type="number"
                min={0}
                value={scope.buildupSqft ?? 0}
                disabled={blocked}
                onChange={(e) => patchScope({ buildupSqft: Number(e.target.value) })}
              />
            </label>
          </div>
        )}

        <h3>Internal markup</h3>
        <div className="eq-scope-grid">
          <label>
            Internal markup % (authorized only)
            <select
              value={String(scope.internalMarkupPercent ?? 0)}
              disabled={blocked}
              onChange={(e) => patchScope({ internalMarkupPercent: Number(e.target.value) })}
            >
              {[0, 5, 8, 10, 12, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Estimator notes
          <textarea
            rows={2}
            value={scope.estimatorNotes || ""}
            disabled={blocked}
            onChange={(e) => patchScope({ estimatorNotes: e.target.value })}
          />
        </label>
        <div className="eq-action-row" data-testid="eq-compat-save-draft">
          <button
            type="button"
            className="eq-btn-ghost"
            disabled={busy || blocked || !dirty}
            data-testid="eq-save-pricing-draft"
            onClick={() => void autosaveRef.current?.flush()}
          >
            Save now (troubleshooting)
          </button>
          <button type="button" className="eq-btn-ghost" disabled={busy || blocked || !dirty} onClick={() => void saveDraft()}>
            Save Draft (troubleshooting)
          </button>
        </div>
        </details>

        <div className="eq-action-row">
          <span className="eq-muted" data-testid="eq-autosave-status">
            {STUDIO_AUTOSAVE_LABELS[autosaveStatus] || (dirty ? "Saving…" : "Saved")}
          </span>
          <span className="eq-muted" data-testid="eq-calc-status-chip">
            {calcStatus === "updating"
              ? "Updating price…"
              : calcStatus === "updated"
                ? "Price updated"
                : calcStatus === "needs_attention"
                  ? "Pricing needs attention"
                  : ""}
          </span>
          {autosaveStatus === "failed" ? (
            <button
              type="button"
              className="eq-btn-ghost"
              data-testid="eq-autosave-retry"
              onClick={() => void autosaveRef.current?.retry()}
            >
              Retry
            </button>
          ) : null}
        </div>
        </div>
      </section>

      <section
        className="eq-estimate-section"
        aria-label="Estimate summary"
        hidden={!showReview}
        data-testid="eq-section-review-summary"
      >
        <h2>Review &amp; Publish</h2>
        <p className="eq-muted">
          Price updates automatically after Scope and Customer Choices are saved — no separate Calculate or Approve clicks are required.
        </p>
        <p className="eq-muted" data-testid="eq-calc-status">
          {calcStatus === "updating"
            ? "Updating price…"
            : calcStatus === "updated"
              ? "Price updated"
              : calcStatus === "needs_attention"
                ? "Pricing needs attention"
                : "Price will appear here after Scope and Customer Choices are saved."}
        </p>
        {!totals ? null : (
          <dl className="eq-summary-dl" data-testid="eq-estimate-summary">
            <div>
              <dt>Countertop material</dt>
              <dd data-testid="eq-material-countertop-subtotal">
                {reviewSummary?.countertopMaterialGroups?.length
                  ? reviewSummary.countertopMaterialGroups.join(", ")
                  : scope.materialGroup || "—"}{" "}
                · $
                {Number(reviewSummary?.countertopMaterialTotal ?? 0).toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>Backsplash material</dt>
              <dd data-testid="eq-material-backsplash-subtotal">
                {reviewSummary?.backsplashPresent
                  ? `${
                      reviewSummary?.countertopMaterialGroups?.length
                        ? reviewSummary.countertopMaterialGroups.join(", ")
                        : scope.materialGroup || "—"
                    } · $${Number(reviewSummary?.backsplashTotal ?? 0).toFixed(2)}`
                  : "None"}
              </dd>
            </div>
            <div>
              <dt>Material use tax</dt>
              <dd>${Number(reviewSummary?.materialTaxTotal ?? 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Fabrication / add-ons</dt>
              <dd>${Number(reviewSummary?.fabricationTotal ?? 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Account adjustment</dt>
              <dd>${Number(totals.accountAdjustment ?? 0).toFixed(2)}</dd>
            </div>
            {Number((totals as Record<string, unknown>).internalOnlyCosts ?? 0) !== 0 ||
            Number((totals as Record<string, unknown>).absorbedCosts ?? 0) !== 0 ? (
              <>
                <div>
                  <dt>Internal-only costs</dt>
                  <dd data-testid="eq-internal-only-total">
                    $
                    {Number((totals as Record<string, unknown>).internalOnlyCosts ?? 0).toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt>Absorbed costs</dt>
                  <dd data-testid="eq-absorbed-total">
                    $
                    {Number((totals as Record<string, unknown>).absorbedCosts ?? 0).toFixed(2)}
                  </dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>Internal markup</dt>
              <dd>${Number(totals.internalMarkupAmount ?? 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Exact internal total</dt>
              <dd>
                <strong>${Number(totals.exactInternalTotal ?? 0).toFixed(2)}</strong>
              </dd>
            </div>
            <div>
              <dt>Customer total</dt>
              <dd data-testid="eq-customer-display-total">
                ${Number(totals.customerDisplayTotal ?? 0).toFixed(2)}
              </dd>
            </div>
          </dl>
        )}
        {(estimate.calculation?.warnings || []).length ? (
          <ul className="eq-list" data-testid="eq-calculation-warnings">
            {(estimate.calculation?.warnings || []).map((w, i) => (
              <li key={`${w.code}-${i}`}>{w.message || w.code}</li>
            ))}
          </ul>
        ) : null}
        {(estimate.calculation?.unresolvedItems || []).length ? (
          <ul className="eq-list eq-list--attention" data-testid="eq-unresolved-items">
            {(estimate.calculation?.unresolvedItems || []).map((u, i) => (
              <li key={`${u.code}-${i}`}>{u.message || u.code}</li>
            ))}
          </ul>
        ) : null}
        {estimate.pricingEngine ? (
          <details className="eq-compat-advanced" data-testid="eq-pricing-engine-diagnostic">
            <summary>Advanced — pricing engine diagnostics</summary>
            <p className="eq-footnote">
              Engine: {estimate.pricingEngine}
              {estimate.pricingVersion != null ? ` · pricing version ${estimate.pricingVersion}` : ""}
              {estimate.calculationFingerprint
                ? ` · fingerprint ${estimate.calculationFingerprint.slice(0, 12)}…`
                : ""}
            </p>
          </details>
        ) : null}
        {(workflow?.historicalApproval?.label || estimate.previousRevisionSummary?.label) &&
        !approvalCurrent ? (
          <p className="eq-footnote" data-testid="eq-historical-approval">
            Historical:{" "}
            {workflow?.historicalApproval?.label || estimate.previousRevisionSummary?.label}
          </p>
        ) : null}
        {!canCalculate && pricingDirty ? (
          <p className="eq-muted" data-testid="eq-calculate-blocked-dirty">
            Finish saving Customer Choices before publishing.
          </p>
        ) : null}
        {actionError ? (
          <div className="eq-state eq-state--error" role="alert">
            {actionError}
          </div>
        ) : null}
        {actionNotice ? (
          <div className="eq-state" role="status">
            {actionNotice}
          </div>
        ) : null}
        {/* Legacy approval eligibility logic (manual Calculate / Approve) is a
            historical/legacy-only compatibility control — Publish orchestrates
            calculate/approve internally for an active simplified estimate, so
            this must not mount at all (even collapsed) when active. */}
        {!isActiveSimplified ? (
        <details className="eq-compat-advanced" data-testid="eq-compat-calc-approve">
          <summary>Advanced — manual calculate / approve (compatibility)</summary>
          <div className="eq-action-row">
            <button
              type="button"
              className="eq-btn-primary"
              disabled={!canCalculate}
              data-testid="eq-calculate-estimate"
              onClick={() => void calculate()}
            >
              Calculate Estimate
            </button>
            <button
              type="button"
              className="eq-btn-secondary"
              disabled={!canApprove || estimate.status !== "priced"}
              data-testid="eq-approve-estimate"
              onClick={() => void approve()}
            >
              Approve Estimate
            </button>
            <button type="button" className="eq-btn-ghost" disabled={busy} onClick={() => void load()}>
              Refresh
            </button>
          </div>
        </details>
        ) : null}
      </section>

      </>
      ) : null}

      {!showReview ? null : isActiveSimplified ? (
        // Active-v4: a distinct, minimal panel — never the legacy historical
        // Digital Estimate workflow and its compatibility-only controls.
        // See ActiveReviewPublishPanel for exactly what it does and does not render.
        <ActiveReviewPublishPanel
          authToken={authToken}
          estimateId={estimate.id}
          estimateRevision={estimate.revision ?? null}
          activeReview={activeReadiness}
          onBeforePublishFlush={onBeforePublishFlush}
          onEditProjectDetails={onEditProjectDetails}
          onPublicationSummary={onPublicationSummary}
          onPublicationRefreshError={onPublicationRefreshError}
        />
      ) : (
        // Historical pricingVersion 2/3 — frozen record, legacy read-only /
        // compatibility publish workflow only.
        <EstimateDigitalEstimatePanel
          authToken={authToken}
          estimateId={estimate.id}
          estimateRevision={estimate.revision ?? null}
          estimateApproved={true}
          useSimplifiedPublish
          onBeforePublishFlush={onBeforePublishFlush}
          onEditProjectDetails={onEditProjectDetails}
          onPublicationSummary={onPublicationSummary}
          onPublicationRefreshError={onPublicationRefreshError}
        />
      )}
    </div>
  );
}
