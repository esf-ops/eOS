import React, { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, ApiError } from "../lib/api";

import EstimateDigitalEstimatePanel from "./EstimateDigitalEstimatePanel";
import StudioAccountDirectoryPanel from "./StudioAccountDirectoryPanel";
import { applyRoomBacksplashPatch } from "../../../backend-core/src/elite100EstimateStudio/studioRoomBacksplash.mjs";
import {
  buildStudioScopeBilling,
  resolveScopeEdgeLinearFeet
} from "../../../backend-core/src/elite100EstimateStudio/studioScopeBilling.mjs";

type CustomLineItem = {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  customerFacing?: boolean;
  roomId?: string | null;
  roomName?: string | null;
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
  } | null;
  approval?: {
    approvedAt?: string;
    approvedByUserId?: string | null;
    exactInternalTotal?: number | null;
  } | null;
  staleReason?: string | null;
  persistenceWarning?: string | null;
  updatedAt?: string | null;
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
  onEditManualScope?: () => void;
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
  onEditManualScope
}: Props) {
  const [estimate, setEstimate] = useState<StudioEstimate | null>(null);
  const [partnerAccount, setPartnerAccount] = useState<PartnerAccountOption | null>(null);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountOptions, setAccountOptions] = useState<PartnerAccountOption[]>([]);
  const [accountSearchBusy, setAccountSearchBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  // Under Takeoff authority miter/build-up start as "Not identified in
  // approved scope" — this opens the explicit specialty-fabrication fields.
  const [specialtyFabricationOpen, setSpecialtyFabricationOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const q = takeoffJobId
        ? `?takeoffJobId=${encodeURIComponent(takeoffJobId)}`
        : "";
      const body = (await apiGet(
        `/api/elite100-estimate-studio/intake-cases/${encodeURIComponent(caseId)}/estimate${q}`,
        authToken
      )) as { estimate?: StudioEstimate; partnerAccount?: PartnerAccountOption | null };
      const est = body.estimate || null;
      if (est?.scope) {
        if (!est.scope.customerName && customerHint) est.scope.customerName = customerHint;
        if (!est.scope.projectName && projectHint) est.scope.projectName = projectHint;
      }
      setEstimate(est);
      setPartnerAccount(body.partnerAccount || null);
      setDirty(false);
    } catch (e) {
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
          setEstimate(body.estimate);
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
    setDirty(true);
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
    setDirty(true);
  }

  function patchCustomLine(index: number, partial: Partial<CustomLineItem>) {
    setEstimate((prev) => {
      if (!prev) return prev;
      const lines = [...(prev.scope?.customLineItems || [])];
      lines[index] = { ...lines[index], ...partial };
      return { ...prev, scope: { ...(prev.scope || {}), customLineItems: lines } };
    });
    setDirty(true);
  }

  function addCustomLine() {
    setEstimate((prev) => {
      if (!prev) return prev;
      const lines = [
        ...(prev.scope?.customLineItems || []),
        {
          id: `cli-${Date.now()}`,
          name: "",
          description: "",
          category: "Other",
          quantity: 1,
          unit: "ea",
          unitPrice: 0,
          customerFacing: true
        }
      ];
      return { ...prev, scope: { ...(prev.scope || {}), customLineItems: lines } };
    });
    setDirty(true);
  }

  function removeCustomLine(index: number) {
    setEstimate((prev) => {
      if (!prev) return prev;
      const lines = [...(prev.scope?.customLineItems || [])];
      lines.splice(index, 1);
      return { ...prev, scope: { ...(prev.scope || {}), customLineItems: lines } };
    });
    setDirty(true);
  }

  function patchAddon(key: string, qty: number) {
    setEstimate((prev) => {
      if (!prev) return prev;
      const addOns = { ...(prev.scope?.addOns || {}), [key]: qty };
      return { ...prev, scope: { ...(prev.scope || {}), addOns } };
    });
    setDirty(true);
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
    setDirty(true);
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
    setDirty(true);
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
    setDirty(true);
  }

  async function saveDraft() {
    if (!estimate?.id || !estimate.scope) return;
    setBusy(true);
    setActionError(null);
    try {
      const body = (await apiPatch(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimate.id)}`,
        authToken,
        { scope: estimate.scope }
      )) as { estimate?: StudioEstimate };
      setEstimate(body.estimate || estimate);
      setDirty(false);
      setActionNotice("Draft scope saved.");
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function refreshFromTakeoff() {
    if (!estimate?.id) return;
    setBusy(true);
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
        setBusy(false);
        return;
      }
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimate.id)}/refresh-from-takeoff`,
        authToken,
        { force: true, confirm: true }
      )) as { estimate?: StudioEstimate };
      if (body.estimate) setEstimate(body.estimate);
      setDirty(false);
      setActionNotice("Estimate Scope refreshed from Takeoff.");
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Refresh from Takeoff failed");
    } finally {
      setBusy(false);
    }
  }

  async function calculate() {
    if (!estimate?.id) return;
    setBusy(true);
    setActionError(null);
    try {
      if (dirty) {
        await apiPatch(`/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimate.id)}`, authToken, {
          scope: estimate.scope
        });
      }
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimate.id)}/calculate`,
        authToken,
        {}
      )) as { estimate?: StudioEstimate };
      setEstimate(body.estimate || estimate);
      setDirty(false);
      setActionNotice("Estimate calculated.");
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Calculate failed");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!estimate?.id) return;
    if (!window.confirm("Approve this estimate? Scope and Takeoff changes will invalidate approval.")) return;
    setBusy(true);
    setActionError(null);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimate.id)}/approve`,
        authToken,
        { confirm: true }
      )) as { estimate?: StudioEstimate };
      setEstimate(body.estimate || estimate);
      setActionNotice("Estimate approved. Ready for a later Digital Estimate publication step.");
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Approve failed");
    } finally {
      setBusy(false);
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
  const scope = estimate.scope || {};
  const totals = estimate.calculation?.totals;
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

      <section className="eq-estimate-section" aria-label="Takeoff gate">
        <h2>A. Takeoff</h2>
        <dl className="eq-status-dl" data-testid="eq-estimate-status-meta">
          <div>
            <dt>Takeoff</dt>
            <dd>{takeoffDisplayStatus}</dd>
          </div>
          <div>
            <dt>Estimate status</dt>
            <dd data-testid="eq-estimate-status">{estimate.status}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd data-testid="eq-estimate-revision">{estimate.revision ?? 1}</dd>
          </div>
          <div>
            <dt>Calculation</dt>
            <dd>
              {estimate.calculation?.calculatedAt
                ? `Calculated ${estimate.calculation.calculatedAt}`
                : estimate.status === "priced" || estimate.status === "approved"
                  ? "Priced"
                  : "Not calculated"}
            </dd>
          </div>
          <div>
            <dt>Approval</dt>
            <dd>
              {estimate.approval?.approvedAt || estimate.approvedAt
                ? `Approved ${estimate.approval?.approvedAt || estimate.approvedAt}`
                : "Not approved"}
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
        {blocked ? (
          <div className="eq-state eq-state--warn" data-testid="eq-estimate-blocked">
            Finish the Takeoff worksheet above, then click Approve Takeoff &amp; Build Estimate.
            Scope unlocks automatically after approval.
          </div>
        ) : (
          <p className="eq-muted">Takeoff approved — add commercial scope and calculate below.</p>
        )}
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

      <section className="eq-estimate-section" aria-label="Pricing setup">
        <h2>B. Pricing Setup</h2>
        <p className="eq-muted">
          {manualStaffAuthority
            ? "Manual Scope confirms what physically exists. Pricing Setup chooses how Elite prices and sells it — customer, pricing basis, material, products, and adjustments."
            : "Takeoff confirms what physically exists. Pricing Setup chooses how Elite prices and sells it — customer, pricing basis, material, products, and adjustments."}
        </p>
        {manualStaffAuthority ? (
          <div className="eq-state" data-testid="eq-confirmed-physical-scope">
            <h3>Confirmed physical scope</h3>
            {!manualScopeConfirmed ? (
              <p className="eq-muted" data-testid="eq-manual-scope-unconfirmed">
                Manual Scope is not confirmed yet. Confirm rooms, open edge LF, backsplash, and
                openings above before calculating.
              </p>
            ) : null}
            <ul>
              {(scope.rooms || [])
                .filter((r) => r.included !== false)
                .map((r) => {
                  const edgeLf =
                    Number((r as any).confirmedOpenEdgeLf) ||
                    Number(r.approvedFinishedEdgeLf) ||
                    Number(r.edgeEligibleLinearFeet) ||
                    (r.pieces || []).reduce((s, p) => {
                      const totalIn = Number(p.finishedEdge?.totalFinishedEdgeLengthIn) || 0;
                      return s + (totalIn > 0 ? totalIn / 12 : 0);
                    }, 0);
                  return (
                    <li key={r.id}>
                      <strong>{r.name}</strong>
                      <ul>
                        <li>Countertop: {Number(r.countertopSqft ?? 0).toFixed(2)} SF</li>
                        <li>Total open edge: {edgeLf.toFixed(2)} LF</li>
                        <li>
                          Backsplash:{" "}
                          {r.includeBacksplash
                            ? `${Number(r.backsplashMeasuredLengthIn ?? 0)} in × ${Number(r.backsplashHeightIn ?? 0)} in = ${Number(r.backsplashSqft ?? 0).toFixed(2)} SF`
                            : "none"}
                        </li>
                      </ul>
                    </li>
                  );
                })}
              <li>
                Openings — sink: {Number(scope.addOns?.["qty-sink"] ?? 0)}; vanity/bar:{" "}
                {Number(scope.addOns?.["qty-bar"] ?? 0)}; cooktop:{" "}
                {Number(scope.addOns?.["qty-cook"] ?? 0)}; outlet:{" "}
                {Number(scope.addOns?.["qty-outlet"] ?? 0)}
              </li>
            </ul>
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="eq-edit-manual-scope"
              onClick={() => {
                onEditManualScope?.();
                window.setTimeout(() => {
                  document
                    .querySelector('[data-testid="manual-physical-scope-editor"]')
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 40);
              }}
            >
              Edit Manual Scope
            </button>
          </div>
        ) : null}
        <h3>Customer and project</h3>
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
              Trusted partner pricing uses partnerAccountId membership only (Watts/Spahn). Selecting
              an Account Directory account never grants trusted partner pricing by name.
            </p>
          </div>
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
            Material group
            <select
              value={scope.materialGroup || "Group Promo"}
              disabled={blocked}
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

        <h3>Approved physical scope</h3>
        {takeoffAuthority ? (
          <div className="eq-approved-scope" data-testid="eq-approved-scope-summary">
            <p className="eq-muted" data-testid="eq-approved-scope-label">
              <strong>Approved physical scope.</strong> Read-only summary from the approved
              Takeoff. To change physical scope, review the Takeoff above and re-approve —
              quantities below are derived, never retyped.
            </p>
            <dl className="eq-status-dl" data-testid="eq-measured-billed-scope">
              <div>
                <dt>Measured countertop scope</dt>
                <dd data-testid="eq-measured-countertop-sf">
                  {scopeBilling.measuredCountertopSf.toFixed(2)} SF
                </dd>
              </div>
              <div>
                <dt>Billed countertop scope</dt>
                <dd data-testid="eq-billed-countertop-sf">
                  {scopeBilling.billedCountertopSf} SF
                </dd>
              </div>
              <div>
                <dt>Independent pricing sections</dt>
                <dd data-testid="eq-independent-section-count">
                  {scopeBilling.independentSectionCount}
                </dd>
              </div>
            </dl>
            <p className="eq-footnote">
              Each independently priced section rounds its raw SF up on its own, then billed
              sections are summed — the measured total is never rounded as one number. Estimator
              SF adjustments (below, per room) are governed sections that round independently.
            </p>
            <div className="eq-scope-grid">
              <label>
                Project-level SF adjustment (±, explicit)
                <input
                  type="number"
                  step={0.01}
                  value={projectAdjustment?.adjustmentSf ?? 0}
                  disabled={blocked}
                  data-testid="eq-project-sf-adjustment"
                  onChange={(e) =>
                    patchCountertopAdjustment(null, {
                      adjustmentSf: Number(e.target.value) || 0
                    })
                  }
                />
              </label>
              <label>
                Project adjustment reason{" "}
                {(projectAdjustment?.adjustmentSf ?? 0) !== 0 ? "(required)" : ""}
                <input
                  value={projectAdjustment?.adjustmentReason ?? ""}
                  disabled={blocked}
                  data-testid="eq-project-sf-adjustment-reason"
                  placeholder="Use room adjustments where applicable"
                  onChange={(e) =>
                    patchCountertopAdjustment(null, { adjustmentReason: e.target.value })
                  }
                />
              </label>
            </div>
            {scopeSummary ? (
            <ul className="eq-approved-scope-list">
              <li>{Number(scopeSummary.pieceCount ?? 0)} countertop pieces</li>
              <li>
                {Number(scopeSummary.kitchenSinkCutouts ?? 0)} kitchen sink opening
                {Number(scopeSummary.kitchenSinkCutouts ?? 0) === 1 ? "" : "s"}
              </li>
              <li>
                {Number(scopeSummary.vanityBarSinkCutouts ?? 0)} vanity/bar sink opening
                {Number(scopeSummary.vanityBarSinkCutouts ?? 0) === 1 ? "" : "s"}
              </li>
              <li>
                {Number(scopeSummary.cooktopCutouts ?? 0)} cooktop opening
                {Number(scopeSummary.cooktopCutouts ?? 0) === 1 ? "" : "s"}
              </li>
              <li>
                {Number(scopeSummary.electricalOutletCutouts ?? 0)} electrical outlet opening
                {Number(scopeSummary.electricalOutletCutouts ?? 0) === 1 ? "" : "s"}
              </li>
              <li>
                {Number(scopeSummary.popUpOutletCutouts ?? 0)} pop-up outlet opening
                {Number(scopeSummary.popUpOutletCutouts ?? 0) === 1 ? "" : "s"}
              </li>
              <li data-testid="eq-backsplash-scope-summary">
                Backsplash-approved runs:{" "}
                {Number(scopeSummary.backsplashEligibleRunCount ?? 0)} · Approved eligible
                length:{" "}
                {(Number(scopeSummary.eligibleBacksplashLengthIn ?? 0) / 12).toFixed(2)} LF (
                {Number(scopeSummary.eligibleBacksplashLengthIn ?? 0).toFixed(2)} in) ·{" "}
                Source: Approved Takeoff
              </li>
              <li data-testid="eq-finished-edge-scope-summary">
                {scopeSummary.edgeGeometryConfirmationRequired
                  ? `Finished edge suggestions: ${Number(scopeSummary.suggestedFinishedEdgeLf ?? 0).toFixed(2)} LF — confirm per-piece edges in Takeoff before publish`
                  : `Approved finished edge total: ${Number(scopeSummary.approvedFinishedEdgeLf ?? edgeScope.derivedLf ?? 0).toFixed(2)} LF`}
                {scopeSummary.edgeScopeSource
                  ? ` · Source: ${scopeSummary.edgeScopeSource}`
                  : ""}
              </li>
              {Array.isArray(scopeSummary.finishedEdgeByPiece) &&
              scopeSummary.finishedEdgeByPiece.length > 0 ? (
                <li data-testid="eq-finished-edge-by-piece">
                  Finished edge by piece:
                  <ul className="eq-scope-piece-list">
                    {(scopeSummary.finishedEdgeByPiece as Array<Record<string, unknown>>).map(
                      (p, i) => {
                        const parts: string[] = [];
                        const front = Number(p.frontEdgeLengthIn) || 0;
                        const left = Number(p.leftExposedEdgeLengthIn) || 0;
                        const right = Number(p.rightExposedEdgeLengthIn) || 0;
                        const other = Number(p.otherExposedEdgeLengthIn) || 0;
                        if (front > 0) parts.push(`front ${(front / 12).toFixed(2)} LF`);
                        if (left > 0) parts.push(`left ${(left / 12).toFixed(2)} LF`);
                        if (right > 0) parts.push(`right ${(right / 12).toFixed(2)} LF`);
                        if (other > 0) parts.push(`other ${(other / 12).toFixed(2)} LF`);
                        const name = String(p.pieceName || p.pieceId || `Piece ${i + 1}`);
                        const status = p.approved === true ? "" : " (suggested)";
                        return (
                          <li key={String(p.pieceId || i)}>
                            {name}: {parts.length ? parts.join("; ") : "no exposed edge"}
                            {status}
                          </li>
                        );
                      }
                    )}
                  </ul>
                </li>
              ) : null}
            </ul>
            ) : null}
            {Number(scopeSummary?.popUpOutletCutouts ?? 0) > 0 ||
            Number(scopeSummary?.otherCutouts ?? 0) > 0 ? (
              <div className="eq-state eq-state--warn" data-testid="eq-scope-review-cutouts">
                Needs estimator review (not auto-priced):{" "}
                {[
                  Number(scopeSummary?.popUpOutletCutouts ?? 0) > 0
                    ? `${scopeSummary?.popUpOutletCutouts} pop-up outlet`
                    : null,
                  Number(scopeSummary?.otherCutouts ?? 0) > 0
                    ? `${scopeSummary?.otherCutouts} other cutout${Number(scopeSummary?.otherCutouts ?? 0) === 1 ? "" : "s"}`
                    : null
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {(scopeSummary?.reviewCutouts || [])
                  .filter((c) => c.note)
                  .map((c, i) => (
                    <span key={i}> · {c.roomName ? `${c.roomName}: ` : ""}{c.note}</span>
                  ))}
                {" "}Add a custom line or price manually below.
              </div>
            ) : null}
            <div className="eq-action-row">
              <button
                type="button"
                className="eq-btn-secondary"
                data-testid="eq-review-takeoff"
                disabled={busy}
                onClick={() => void refreshFromTakeoff()}
              >
                Review Takeoff / re-sync scope
              </button>
            </div>
          </div>
        ) : (
          <p className="eq-muted" data-testid="eq-manual-scope-label">
            <strong>Manual physical scope.</strong> No approved Takeoff scope on this estimate —
            enter measured rooms and fabrication quantities manually below.
          </p>
        )}

        <h3>Rooms / measured scope</h3>
        {(scope.rooms || []).length === 0 ? (
          <p className="eq-muted">
            No approved measured scope yet. Build or review the Takeoff above, then approve it to
            seed pricing scope.
          </p>
        ) : (
          <ul className="eq-room-list">
            {(scope.rooms || []).map((room) => (
              <li key={room.id}>
                <label className="eq-check">
                  <input
                    type="checkbox"
                    checked={room.included !== false}
                    disabled={blocked}
                    onChange={(e) => patchRoom(room.id, { included: e.target.checked })}
                  />
                  <strong>{room.name}</strong>
                </label>
                <div className="eq-room-fields">
                  {takeoffAuthority ? (
                    <p className="eq-muted" data-testid="eq-room-countertop-readonly">
                      Countertop measured: {Number(room.countertopSqft ?? 0).toFixed(2)} SF ·
                      billed:{" "}
                      {scopeBilling.rooms.find((r) => r.roomId === String(room.id))
                        ?.billedWithAdjustmentsSf ?? 0}{" "}
                      SF (from approved Takeoff)
                    </p>
                  ) : (
                    <label>
                      Countertop square feet
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={room.countertopSqft ?? 0}
                        disabled={blocked || room.included === false}
                        onChange={(e) => patchRoom(room.id, { countertopSqft: Number(e.target.value) })}
                      />
                    </label>
                  )}
                  {takeoffAuthority && room.included !== false ? (
                    <>
                      <label>
                        Estimator SF adjustment (±)
                        <input
                          type="number"
                          step={0.01}
                          value={roomAdjustmentFor(String(room.id))?.adjustmentSf ?? 0}
                          disabled={blocked}
                          data-testid="eq-room-sf-adjustment"
                          data-room-id={room.id}
                          onChange={(e) =>
                            patchCountertopAdjustment(String(room.id), {
                              adjustmentSf: Number(e.target.value) || 0
                            })
                          }
                        />
                      </label>
                      <label>
                        Adjustment reason{" "}
                        {(roomAdjustmentFor(String(room.id))?.adjustmentSf ?? 0) !== 0
                          ? "(required)"
                          : ""}
                        <input
                          value={roomAdjustmentFor(String(room.id))?.adjustmentReason ?? ""}
                          disabled={blocked}
                          data-testid="eq-room-sf-adjustment-reason"
                          data-room-id={room.id}
                          placeholder="e.g. field-verified overhang not in Takeoff"
                          onChange={(e) =>
                            patchCountertopAdjustment(String(room.id), {
                              adjustmentReason: e.target.value
                            })
                          }
                        />
                      </label>
                    </>
                  ) : null}
                </div>
                {takeoffAuthority ? (
                  <p
                    className="eq-muted"
                    data-testid="eq-room-backsplash-readonly"
                    data-room-id={room.id}
                  >
                    Backsplash:{" "}
                    {room.includeBacksplash
                      ? `${room.eligibleRunCount != null ? `${room.eligibleRunCount} eligible run${Number(room.eligibleRunCount) === 1 ? "" : "s"} · ` : ""}${Number(room.backsplashMeasuredLengthIn ?? 0).toFixed(1)} in eligible length — customer chooses No / 4-inch / custom / full height later`
                      : "no eligible runs (from approved Takeoff)"}
                  </p>
                ) : manualStaffAuthority ? (
                  <p
                    className="eq-muted"
                    data-testid="eq-room-backsplash-readonly"
                    data-room-id={room.id}
                  >
                    Backsplash (confirmed Manual Scope):{" "}
                    {room.includeBacksplash
                      ? `${Number(room.backsplashMeasuredLengthIn ?? 0).toFixed(1)} in × ${Number(room.backsplashHeightIn ?? 0).toFixed(1)} in = ${Number(room.backsplashSqft ?? 0).toFixed(2)} SF (${room.backsplashHeightMode || "standard"})`
                      : "none"}
                  </p>
                ) : (
                <div
                  className="eq-room-backsplash"
                  data-testid="eq-room-backsplash"
                  data-room-id={room.id}
                >
                  <label className="eq-check">
                    <input
                      type="checkbox"
                      checked={Boolean(room.includeBacksplash)}
                      disabled={blocked || room.included === false}
                      onChange={(e) =>
                        patchRoom(room.id, { includeBacksplash: e.target.checked })
                      }
                      data-testid="eq-include-backsplash"
                    />
                    Include backsplash
                  </label>
                  <div className="eq-room-fields">
                    <label>
                      Backsplash height mode
                      <select
                        value={room.backsplashHeightMode || (room.includeBacksplash ? "standard" : "none")}
                        disabled={blocked || room.included === false || !room.includeBacksplash}
                        onChange={(e) => {
                          const mode = e.target.value;
                          patchRoom(room.id, {
                            backsplashHeightMode: mode,
                            ...(mode === "standard" && !room.backsplashHeightIn
                              ? { backsplashHeightIn: 4 }
                              : {})
                          });
                        }}
                        data-testid="eq-backsplash-height-mode"
                      >
                        <option value="none">None</option>
                        <option value="standard">Standard (4 in)</option>
                        <option value="custom">Custom height</option>
                        <option value="full_height">Full-height / tall</option>
                      </select>
                    </label>
                    <label>
                      Backsplash height (in)
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={room.backsplashHeightIn ?? ""}
                        disabled={blocked || room.included === false || !room.includeBacksplash}
                        onChange={(e) =>
                          patchRoom(room.id, {
                            backsplashHeightIn: Number(e.target.value) || 0,
                            backsplashHeightMode:
                              Number(e.target.value) >= 48
                                ? "full_height"
                                : Number(e.target.value) > 4.5
                                  ? "custom"
                                  : "standard"
                          })
                        }
                        data-testid="eq-backsplash-height"
                      />
                    </label>
                    <label>
                      Measured backsplash length (in)
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={room.backsplashMeasuredLengthIn ?? ""}
                        disabled={blocked || room.included === false || !room.includeBacksplash}
                        onChange={(e) =>
                          patchRoom(room.id, {
                            backsplashMeasuredLengthIn: Number(e.target.value) || 0
                          })
                        }
                        data-testid="eq-backsplash-length"
                      />
                    </label>
                    <label>
                      Backsplash square feet
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={room.backsplashSqft ?? 0}
                        disabled={blocked || room.included === false || !room.includeBacksplash}
                        onChange={(e) =>
                          patchRoom(room.id, { backsplashSqft: Number(e.target.value) })
                        }
                        data-testid="eq-backsplash-sqft"
                      />
                    </label>
                  </div>
                  <p className="eq-footnote">
                    Countertop SF: {Number(room.countertopSqft ?? 0).toFixed(2)} · Backsplash SF:{" "}
                    {room.includeBacksplash ? Number(room.backsplashSqft ?? 0).toFixed(2) : "0.00"} ·
                    Height:{" "}
                    {room.includeBacksplash
                      ? `${room.backsplashHeightIn ?? "—"} in (${room.backsplashHeightMode || "standard"})`
                      : "not included"}
                    {room.backsplashSource ? ` · Source: ${room.backsplashSource}` : ""}
                  </p>
                </div>
                )}
                {(room.pieces || []).length ? (
                  <div className="eq-piece-list">
                    {(room.pieces || []).map((p) => (
                      <label key={p.id} className="eq-check">
                        <input
                          type="checkbox"
                          checked={p.included !== false}
                          disabled={blocked || room.included === false}
                          onChange={(e) => {
                            const pieces = (room.pieces || []).map((x) =>
                              x.id === p.id ? { ...x, included: e.target.checked } : x
                            );
                            patchRoom(room.id, { pieces });
                          }}
                        />
                        {p.name} ({p.sqft ?? 0} SF)
                      </label>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {takeoffAuthority ? (
          <p className="eq-muted" data-testid="eq-derived-cutouts-note">
            Cutout quantities (kitchen sink, vanity/bar sink, cooktop, electrical outlet) are
            derived from the approved Takeoff scope above — no manual re-entry.
          </p>
        ) : manualStaffAuthority ? (
          <div data-testid="eq-confirmed-cutouts-readonly">
            <h3>Confirmed openings (Manual Scope)</h3>
            <ul className="eq-muted">
              <li>Kitchen sink openings: {Number(scope.addOns?.["qty-sink"] ?? 0)}</li>
              <li>Vanity / bar sink openings: {Number(scope.addOns?.["qty-bar"] ?? 0)}</li>
              <li>Cooktop openings: {Number(scope.addOns?.["qty-cook"] ?? 0)}</li>
              <li>Electrical outlet openings: {Number(scope.addOns?.["qty-outlet"] ?? 0)}</li>
            </ul>
            <p className="eq-footnote">
              Edit openings in Manual Scope. Product model selection remains below.
            </p>
          </div>
        ) : (
          <>
            <h3>Manual physical scope — cutout quantities</h3>
            <div className="eq-addon-grid" data-testid="eq-manual-cutout-grid">
              {(
                [
                  ["qty-sink", "Kitchen sink openings"],
                  ["qty-bar", "Vanity / bar sink openings"],
                  ["qty-cook", "Cooktop openings"],
                  ["qty-outlet", "Electrical outlet openings"]
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={scope.addOns?.[key] ?? 0}
                    disabled={blocked}
                    onChange={(e) => patchAddon(key, Math.max(0, Number(e.target.value) || 0))}
                  />
                </label>
              ))}
            </div>
          </>
        )}

        <h3>Customer-selectable catalogs</h3>
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

        <h3>Custom line items</h3>
        <p className="eq-muted">
          Server-calculated extras. Internal-only lines never appear on the customer Digital Estimate.
        </p>
        <div className="eq-custom-lines" data-testid="eq-custom-lines">
          {(scope.customLineItems || []).length === 0 ? (
            <p className="eq-muted">No custom lines yet.</p>
          ) : (
            <ul className="eq-custom-line-list">
              {(scope.customLineItems || []).map((line, index) => (
                <li key={line.id || `cli-${index}`} data-testid="eq-custom-line-row">
                  <label>
                    Description
                    <input
                      value={line.name || ""}
                      disabled={blocked}
                      onChange={(e) => patchCustomLine(index, { name: e.target.value })}
                      data-testid="eq-custom-line-name"
                    />
                  </label>
                  <label>
                    Category
                    <select
                      value={line.category || "Other"}
                      disabled={blocked}
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
                      disabled={blocked}
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
                    Unit price
                    <input
                      type="number"
                      step={0.01}
                      value={line.unitPrice ?? 0}
                      disabled={blocked}
                      onChange={(e) =>
                        patchCustomLine(index, { unitPrice: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className="eq-check">
                    <input
                      type="checkbox"
                      checked={line.customerFacing !== false}
                      disabled={blocked}
                      onChange={(e) =>
                        patchCustomLine(index, { customerFacing: e.target.checked })
                      }
                      data-testid="eq-custom-line-customer-visible"
                    />
                    Customer-visible
                  </label>
                  <button
                    type="button"
                    className="eq-btn-ghost"
                    disabled={blocked}
                    onClick={() => removeCustomLine(index)}
                    data-testid="eq-custom-line-remove"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="eq-btn-secondary"
            disabled={blocked}
            onClick={() => addCustomLine()}
            data-testid="eq-custom-line-add"
          >
            Add custom line
          </button>
        </div>

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
            <div data-testid="eq-confirmed-finished-edge">
              <h4>Confirmed open edge</h4>
              <ul>
                {(scope.rooms || [])
                  .filter((r) => r.included !== false)
                  .map((r) => {
                    const lf =
                      Number((r as any).confirmedOpenEdgeLf) ||
                      Number((r as any).approvedFinishedEdgeLf) ||
                      Number((r as any).edgeEligibleLinearFeet) ||
                      (r.pieces || [])
                        .filter((p) => p.included !== false)
                        .reduce((s, p: any) => {
                          const totalIn = Number(p?.finishedEdge?.totalFinishedEdgeLengthIn) || 0;
                          return s + (totalIn > 0 ? totalIn / 12 : 0);
                        }, 0);
                    return (
                      <li key={r.id} data-testid="eq-confirmed-room-open-edge">
                        {r.name}: {lf.toFixed(2)} LF
                      </li>
                    );
                  })}
              </ul>
              <p className="eq-footnote">
                Physical open-edge LF comes from Manual Scope and is independent of the base edge
                profile (Eased, etc.). Customer premium-edge options use these room LF values.
              </p>
              <p className="eq-muted" data-testid="eq-edge-final-lf-display">
                Project open edge (derived): {edgeScope.finalLf.toFixed(2)} LF
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

        <h3>Commercial adjustments</h3>
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
        <div className="eq-action-row">
          <button type="button" className="eq-btn-secondary" disabled={busy || blocked || !dirty} onClick={() => void saveDraft()}>
            Save Draft
          </button>
          {dirty ? <span className="eq-muted">Unsaved scope changes</span> : null}
        </div>
      </section>

      <section className="eq-estimate-section" aria-label="Estimate summary">
        <h2>C. Estimate Summary</h2>
        {!totals ? (
          <p className="eq-muted">Calculate to see the internal estimate summary.</p>
        ) : (
          <dl className="eq-summary-dl" data-testid="eq-estimate-summary">
            <div>
              <dt>Countertop material</dt>
              <dd data-testid="eq-material-countertop-subtotal">
                ${Number(
                  (totals as Record<string, unknown>).materialCountertopSubtotal ??
                    totals.materialSubtotal ??
                    0,
                ).toFixed(2)}
              </dd>
            </div>
            {Number((totals as Record<string, unknown>).materialBacksplashSubtotal ?? 0) > 0 ? (
              <div>
                <dt>Backsplash material</dt>
                <dd data-testid="eq-material-backsplash-subtotal">
                  ${Number(
                    (totals as Record<string, unknown>).materialBacksplashSubtotal ?? 0,
                  ).toFixed(2)}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Material subtotal</dt>
              <dd>${Number(totals.materialSubtotal ?? 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Material use tax (2%)</dt>
              <dd>${Number(totals.materialUseTax ?? 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Fabrication / add-ons</dt>
              <dd>${Number(totals.fabricationSubtotal ?? 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Account adjustment</dt>
              <dd>${Number(totals.accountAdjustment ?? 0).toFixed(2)}</dd>
            </div>
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
              <dt>Future customer display total</dt>
              <dd>${Number(totals.customerDisplayTotal ?? 0).toFixed(2)}</dd>
            </div>
          </dl>
        )}
        {(estimate.calculation?.warnings || []).length ? (
          <ul className="eq-list">
            {(estimate.calculation?.warnings || []).map((w, i) => (
              <li key={`${w.code}-${i}`}>{w.message || w.code}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="eq-estimate-section" aria-label="Estimate approval">
        <h2>D. Approval</h2>
        {estimate.approval?.approvedAt ? (
          <p className="eq-muted" data-testid="eq-estimate-approved">
            Approved {estimate.approval.approvedAt}
            {estimate.approval.exactInternalTotal != null
              ? ` · $${Number(estimate.approval.exactInternalTotal).toFixed(2)}`
              : ""}
          </p>
        ) : (
          <p className="eq-muted">Not approved yet.</p>
        )}
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
        <div className="eq-action-row">
          <button
            type="button"
            className="eq-btn-primary"
            disabled={busy || blocked}
            data-testid="eq-calculate-estimate"
            onClick={() => void calculate()}
          >
            Calculate Estimate
          </button>
          <button
            type="button"
            className="eq-btn-secondary"
            disabled={busy || blocked || estimate.status !== "priced"}
            data-testid="eq-approve-estimate"
            onClick={() => void approve()}
          >
            Approve Estimate
          </button>
          <button type="button" className="eq-btn-ghost" disabled={busy} onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </section>

      {estimate.approval?.approvedAt || estimate.status === "approved" ? (
        <EstimateDigitalEstimatePanel
          authToken={authToken}
          estimateId={estimate.id}
          estimateRevision={estimate.revision ?? null}
          estimateApproved
        />
      ) : null}
    </div>
  );
}
