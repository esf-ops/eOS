/**
 * Elite 100 Studio V2 — estimator command shell (Slices A–F).
 *
 * Intentionally does NOT import:
 * - AiEstimatorWorkspace
 * - EstimateTakeoffWorkspace
 * - EstimateDigitalEstimatePanel
 * - ActiveReviewPublishPanel
 * - CommercialConfigurationSection
 * - deriveAiEstimatorStage
 */
import React, { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, ApiError } from "../lib/api";
import StudioV2ScopeEditor, {
  cloneEditableScope,
  emptyEditableScope,
  type StudioV2EditableScope
} from "./StudioV2ScopeEditor";
import StudioV2TakeoffImportPanel from "./StudioV2TakeoffImportPanel";
import StudioV2EstimateOptionsPanel, {
  cloneEditableOptions,
  emptyEditableOptions,
  type StudioV2EditableOptions
} from "./StudioV2EstimateOptionsPanel";
import StudioV2PricingControlsPanel, {
  cloneEditablePricing,
  emptyEditablePricing,
  type StudioV2EditablePricing
} from "./StudioV2PricingControlsPanel";
import StudioV2ApprovalPanel, {
  type StudioV2ApprovalReadiness,
  type StudioV2ApprovedSummary,
  type StudioV2RevisionAffordance
} from "./StudioV2ApprovalPanel";
import StudioV2PublishPanel, {
  type StudioV2PublishReadiness,
  type StudioV2PublicationView
} from "./StudioV2PublishPanel";
import StudioV2CustomerSelectionReviewPanel, {
  type CustomerSelectionRevisionInfo,
  type StudioCustomerSelectionReview
} from "./StudioV2CustomerSelectionReviewPanel";

type ProjectHeader = {
  accountName?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  projectAddress?: string | null;
  pricingBasis?: string | null;
  materialGroup?: string | null;
  estimateId?: string | null;
  revision?: number | null;
  status?: string | null;
  originType?: string | null;
  currentTotal?: number | null;
};

type ScopeSummary = {
  empty?: boolean;
  roomCount?: number;
  pieceCount?: number;
  measuredSf?: number | null;
  billedSf?: number | null;
  openings?: {
    kitchenSink?: number;
    vanityBarSink?: number;
    cooktop?: number;
    outlet?: number;
    total?: number;
  };
  rooms?: Array<{
    id?: string | null;
    name?: string;
    countertopSf?: number;
    backsplashSf?: number;
    pieceCount?: number;
  }>;
  indicators?: {
    hasVanityProgram?: boolean;
    hasWaterfall?: boolean;
    vanityProgramRooms?: number;
    waterfallIndicators?: number;
  };
};

type PricingBreakdown = {
  pricingBasis?: string | null;
  priceGroup?: string | null;
  selectedPricingBasis?: string | null;
  selectedPriceGroup?: string | null;
  materialRatePerSf?: number | null;
  materialRatePerSfNote?: string | null;
  measuredSf?: number | null;
  billedSf?: number | null;
  materialSubtotal?: number | null;
  materialUseTax?: number | null;
  customerFacingAdjustments?: number | null;
  hiddenCustomerImpactingAdjustments?: number | null;
  estimateWideAdjustmentAmount?: number | null;
  estimateWideAdjustmentPercentage?: number | null;
  estimateWideAdjustmentReason?: string | null;
  estimateWideAdjustmentSource?: string | null;
  roomCount?: number | null;
  calculatedFieldsAvailable?: boolean;
};

type CalculationResult = {
  available?: boolean;
  total?: number | null;
  customerSafeLinePreview?: Array<{ key: string; label: string; amount: number }>;
  warnings?: Array<{ code?: string | null; message?: string }>;
  unresolvedItems?: Array<{ code?: string | null; message?: string }>;
  calculatedAt?: string | null;
  pricingVersion?: number | null;
  pricingBreakdown?: PricingBreakdown | null;
};

/** Prefer the calc result that retains measured/billed SF and material rate. */
function preferRicherCalculation(
  primary: CalculationResult | null | undefined,
  fallback: CalculationResult | null | undefined
): CalculationResult | null {
  const a = primary || null;
  const b = fallback || null;
  if (!a) return b;
  if (!b) return a;
  const score = (c: CalculationResult | null) => {
    if (!c?.available) return 0;
    const pb = c.pricingBreakdown;
    let s = 1;
    if (pb?.measuredSf != null) s += 4;
    if (pb?.billedSf != null) s += 4;
    if (pb?.materialRatePerSf != null) s += 3;
    if (pb?.materialSubtotal != null) s += 2;
    if (pb?.materialUseTax != null) s += 1;
    return s;
  };
  return score(a) >= score(b) ? a : b;
}

function displayPricingContext(
  pb: PricingBreakdown | null | undefined,
  pricingDraft: StudioV2EditablePricing | null | undefined,
  field: "basis" | "group"
): string {
  if (field === "basis") {
    return (
      pb?.selectedPricingBasis ||
      pb?.pricingBasis ||
      pricingDraft?.pricingBasis ||
      "not calculated yet"
    );
  }
  return (
    pb?.selectedPriceGroup ||
    pb?.priceGroup ||
    pricingDraft?.materialGroup ||
    "not calculated yet"
  );
}

function displayCalculatedMetric(
  value: number | null | undefined,
  format: (n: number) => string,
  emptyLabel = "not calculated yet"
): string {
  if (value == null || !Number.isFinite(Number(value))) return emptyLabel;
  return format(Number(value));
}

type WorkingDraftResponse = {
  ok?: boolean;
  code?: string | null;
  message?: string | null;
  empty?: boolean;
  projectHeader?: ProjectHeader;
  scopeSummary?: ScopeSummary;
  editableScope?: StudioV2EditableScope;
  editableOptions?: StudioV2EditableOptions;
  editablePricing?: StudioV2EditablePricing;
  scopeEditable?: boolean;
  optionsEditable?: boolean;
  pricingEditable?: boolean;
  scopeEditability?: { editable?: boolean; code?: string | null; message?: string | null };
  lastCalculation?: CalculationResult;
  approvalReadiness?: StudioV2ApprovalReadiness;
  approvedSummary?: StudioV2ApprovedSummary;
  revisionAffordance?: StudioV2RevisionAffordance;
  publishReadiness?: StudioV2PublishReadiness;
  approvedPublished?: {
    approved?: boolean;
    published?: boolean;
    publicationId?: string | null;
    customerUrl?: string | null;
    publicationState?: string | null;
    statusLabel?: string | null;
  };
  publicationSummary?: {
    state?: string;
    statusLabel?: string;
    customerUrl?: string | null;
    customerUrlAvailable?: boolean;
    active?: boolean;
    reviewRequestOpen?: boolean;
  };
  estimateId?: string | null;
  originType?: string | null;
  revision?: number | null;
  status?: string | null;
  takeoffImportNeeded?: boolean;
  takeoffJobId?: string | null;
  customerSelectionRevision?: CustomerSelectionRevisionInfo | null;
};

type CustomerActivityResponse = {
  ok?: boolean;
  activity?: {
    viewed?: boolean;
    savedSelections?: boolean;
    reviewRequested?: boolean;
    accepted?: boolean;
    lastSavedAt?: string | null;
  };
  activePublication?: { publicationId?: string | null; customerUrl?: string | null } | null;
  historicalPublications?: Array<{ publicationId?: string | null; status?: string }>;
  reviewRequests?: Array<{ id?: string | null; open?: boolean; status?: string | null }>;
  acceptance?: {
    acceptedAt?: string | null;
    customerDisplayTotal?: number | null;
    publicationId?: string | null;
  } | null;
  publicationSummary?: { statusLabel?: string; customerUrl?: string | null };
  selectionReview?: StudioCustomerSelectionReview | null;
  customerSelectionRevision?: CustomerSelectionRevisionInfo | null;
};

function money(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function originLabel(origin: string | null | undefined): string {
  const o = String(origin || "").toLowerCase();
  if (o === "ai_takeoff") return "AI takeoff";
  if (o === "manual") return "Manual";
  return "Unknown";
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    const code = body?.code != null ? String(body.code) : "";
    if (
      code === "configuration_envelope_required" ||
      code === "DE-CONFIGURATION-UNAVAILABLE" ||
      code === "DE-ENVELOPE-ACTIVATION-FAILED"
    ) {
      return (
        "Digital Estimate configuration could not be activated. The configuration stack may be " +
        "unavailable — contact support or retry after Brain recovers. The customer was not emailed."
      );
    }
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

export function studioV2UiEnabled(): boolean {
  return String(import.meta.env.VITE_ELITE100_STUDIO_V2_ENABLED ?? "").trim() === "true";
}

export default function StudioV2EstimatorShell(props: {
  authToken: string;
  caseId: string;
  onBack: () => void;
  /** Opens plan-visible AI Takeoff Review (supporting tool — not estimate authority). */
  onOpenTakeoffReview?: () => void;
  /** @deprecated Prefer onOpenTakeoffReview */
  onOpenV1?: () => void;
}) {
  const { authToken, caseId, onBack } = props;
  const onOpenTakeoffReview = props.onOpenTakeoffReview || props.onOpenV1;
  const [draft, setDraft] = useState<WorkingDraftResponse | null>(null);
  const [activity, setActivity] = useState<CustomerActivityResponse | null>(null);
  const [calcResult, setCalcResult] = useState<CalculationResult | null>(null);
  const [scopeDraft, setScopeDraft] = useState<StudioV2EditableScope>(emptyEditableScope());
  const [scopeDirty, setScopeDirty] = useState(false);
  const [optionsDraft, setOptionsDraft] = useState<StudioV2EditableOptions>(emptyEditableOptions());
  const [optionsDirty, setOptionsDirty] = useState(false);
  const [pricingDraft, setPricingDraft] = useState<StudioV2EditablePricing>(emptyEditablePricing());
  const [pricingDirty, setPricingDirty] = useState(false);
  const [calcStale, setCalcStale] = useState(false);
  const [calcStaleReason, setCalcStaleReason] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [scopeSaveError, setScopeSaveError] = useState<string | null>(null);
  const [scopeSaveNotice, setScopeSaveNotice] = useState<string | null>(null);
  const [optionsSaveError, setOptionsSaveError] = useState<string | null>(null);
  const [optionsSaveNotice, setOptionsSaveNotice] = useState<string | null>(null);
  const [pricingSaveError, setPricingSaveError] = useState<string | null>(null);
  const [pricingSaveNotice, setPricingSaveNotice] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveNotice, setApproveNotice] = useState<string | null>(null);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [revisionNotice, setRevisionNotice] = useState<string | null>(null);
  const [customerRevisionError, setCustomerRevisionError] = useState<string | null>(null);
  const [customerRevisionNotice, setCustomerRevisionNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [calcBusy, setCalcBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [scopeSaveBusy, setScopeSaveBusy] = useState(false);
  const [optionsSaveBusy, setOptionsSaveBusy] = useState(false);
  const [pricingSaveBusy, setPricingSaveBusy] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [customerRevisionBusy, setCustomerRevisionBusy] = useState(false);

  const hydrateFromDraft = useCallback((draftBody: WorkingDraftResponse) => {
    setDraft(draftBody);
    setCalcResult(draftBody?.lastCalculation || null);
    // Never overwrite local editable fields from a calculate-only refresh while dirty.
    setScopeDraft(cloneEditableScope(draftBody?.editableScope));
    setScopeDirty(false);
    setOptionsDraft(cloneEditableOptions(draftBody?.editableOptions));
    setOptionsDirty(false);
    setPricingDraft(cloneEditablePricing(draftBody?.editablePricing));
    setPricingDirty(false);
    setCalcStale(false);
    setCalcStaleReason(null);
    setScopeSaveError(null);
    setOptionsSaveError(null);
    setPricingSaveError(null);
  }, []);

  const load = useCallback(
    async (opts?: {
      preserveDirtyScope?: boolean;
      preserveDirtyOptions?: boolean;
      preserveDirtyPricing?: boolean;
    }) => {
      setBusy(true);
      setLoadError(null);
      try {
        const [draftBody, activityBody] = await Promise.all([
          apiGet(
            `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft`,
            authToken
          ) as Promise<WorkingDraftResponse>,
          apiGet(
            `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/customer-activity`,
            authToken
          ).catch((e) => {
            if (e instanceof ApiError) {
              const code =
                e.body && typeof e.body === "object"
                  ? String((e.body as { code?: unknown }).code || "")
                  : "";
              if (code === "no_estimate") return null;
            }
            throw e;
          }) as Promise<CustomerActivityResponse | null>
        ]);
        const preserveDirty =
          (opts?.preserveDirtyScope && scopeDirty) ||
          (opts?.preserveDirtyOptions && optionsDirty) ||
          (opts?.preserveDirtyPricing && pricingDirty);
        if (preserveDirty) {
          setDraft(draftBody);
          setCalcResult(draftBody?.lastCalculation || null);
          if (!(opts?.preserveDirtyScope && scopeDirty)) {
            setScopeDraft(cloneEditableScope(draftBody?.editableScope));
            setScopeDirty(false);
          }
          if (!(opts?.preserveDirtyOptions && optionsDirty)) {
            setOptionsDraft(cloneEditableOptions(draftBody?.editableOptions));
            setOptionsDirty(false);
          }
          if (!(opts?.preserveDirtyPricing && pricingDirty)) {
            setPricingDraft(cloneEditablePricing(draftBody?.editablePricing));
            setPricingDirty(false);
          }
        } else {
          hydrateFromDraft(draftBody);
        }
        setActivity(activityBody);
      } catch (e) {
        setLoadError(errorMessage(e));
        setDraft(null);
        setActivity(null);
      } finally {
        setBusy(false);
      }
    },
    [authToken, caseId, hydrateFromDraft, scopeDirty, optionsDirty, pricingDirty]
  );

  useEffect(() => {
    void load();
    // Initial load only — subsequent reloads are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, caseId]);

  function onScopeChange(next: StudioV2EditableScope) {
    setScopeDraft(next);
    setScopeDirty(true);
    setCalcStale(true);
    setCalcStaleReason("Scope changed — recalculate to update total.");
    setScopeSaveNotice(null);
    setScopeSaveError(null);
  }

  function onOptionsChange(next: StudioV2EditableOptions) {
    setOptionsDraft(next);
    setOptionsDirty(true);
    setCalcStale(true);
    setCalcStaleReason("Estimate options changed — recalculate to update total.");
    setOptionsSaveNotice(null);
    setOptionsSaveError(null);
  }

  function onPricingChange(next: StudioV2EditablePricing) {
    setPricingDraft(next);
    setPricingDirty(true);
    setCalcStale(true);
    setCalcStaleReason("Pricing settings changed — recalculate to update total.");
    setPricingSaveNotice(null);
    setPricingSaveError(null);
  }

  async function runSaveScope() {
    if (!draft?.scopeEditable) {
      setScopeSaveError(draft?.scopeEditability?.message || "Scope is read-only.");
      return;
    }
    setScopeSaveBusy(true);
    setScopeSaveError(null);
    setScopeSaveNotice(null);
    try {
      const body = (await apiPatch(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft/scope`,
        authToken,
        {
          scope: {
            rooms: scopeDraft.rooms,
            openings: scopeDraft.openings,
            // Preserve estimate-wide default so "Estimate default" pieces keep
            // the Working Draft's inherited profile (e.g. Knife from R1) unless
            // the estimator changes a piece explicitly.
            edgeProfileToken: scopeDraft.edgeProfileToken ?? undefined
          },
          clientMutationId: `v2-scope-${Date.now()}`,
          expectedRevision: draft.revision ?? draft.projectHeader?.revision ?? undefined
        }
      )) as {
        ok?: boolean;
        scopeSummary?: ScopeSummary;
        editableScope?: StudioV2EditableScope;
        lastCalculation?: CalculationResult;
        revision?: number;
        status?: string;
        warnings?: string[];
      };
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              scopeSummary: body.scopeSummary || prev.scopeSummary,
              editableScope: body.editableScope || prev.editableScope,
              lastCalculation: body.lastCalculation || prev.lastCalculation,
              revision: body.revision ?? prev.revision,
              status: body.status || prev.status,
              projectHeader: prev.projectHeader
                ? {
                    ...prev.projectHeader,
                    revision: body.revision ?? prev.projectHeader.revision,
                    status: body.status || prev.projectHeader.status,
                    currentTotal: null
                  }
                : prev.projectHeader
            }
          : prev
      );
      setScopeDraft(cloneEditableScope(body.editableScope || scopeDraft));
      setScopeDirty(false);
      setCalcStale(true);
      setCalcStaleReason("Scope changed — recalculate to update total.");
      setCalcResult(body.lastCalculation || { available: false, total: null });
      setScopeSaveNotice("Scope saved. Recalculate to update total.");
    } catch (e) {
      setScopeSaveError(errorMessage(e));
    } finally {
      setScopeSaveBusy(false);
    }
  }

  async function runSaveOptions() {
    if (!(draft?.optionsEditable ?? draft?.scopeEditable)) {
      setOptionsSaveError(draft?.scopeEditability?.message || "Estimate options are read-only.");
      return;
    }
    setOptionsSaveBusy(true);
    setOptionsSaveError(null);
    setOptionsSaveNotice(null);
    try {
      const body = (await apiPatch(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft/options`,
        authToken,
        {
          options: {
            customerLines: optionsDraft.customerLines,
            discounts: [],
            internalLines: optionsDraft.internalLines,
            hiddenCustomerImpactingLines: optionsDraft.hiddenCustomerImpactingLines
          },
          clientMutationId: `v2-options-${Date.now()}`,
          expectedRevision: draft.revision ?? draft.projectHeader?.revision ?? undefined
        }
      )) as {
        ok?: boolean;
        editableOptions?: StudioV2EditableOptions;
        lastCalculation?: CalculationResult;
        revision?: number;
        status?: string;
      };
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              editableOptions: body.editableOptions || prev.editableOptions,
              lastCalculation: body.lastCalculation || prev.lastCalculation,
              revision: body.revision ?? prev.revision,
              status: body.status || prev.status,
              projectHeader: prev.projectHeader
                ? {
                    ...prev.projectHeader,
                    revision: body.revision ?? prev.projectHeader.revision,
                    status: body.status || prev.projectHeader.status,
                    currentTotal: null
                  }
                : prev.projectHeader
            }
          : prev
      );
      setOptionsDraft(cloneEditableOptions(body.editableOptions || optionsDraft));
      setOptionsDirty(false);
      setCalcStale(true);
      setCalcStaleReason("Estimate options changed — recalculate to update total.");
      setCalcResult(body.lastCalculation || { available: false, total: null });
      setOptionsSaveNotice("Estimate options changed — recalculate to update total.");
      // Refresh working-draft metadata without clearing calc-stale / options notice.
      const draftBody = (await apiGet(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft`,
        authToken
      )) as WorkingDraftResponse;
      setDraft(draftBody);
      if (!scopeDirty) {
        setScopeDraft(cloneEditableScope(draftBody.editableScope));
      }
      setOptionsDraft(cloneEditableOptions(draftBody.editableOptions || body.editableOptions));
      setOptionsDirty(false);
      setCalcStale(true);
      setCalcStaleReason("Estimate options changed — recalculate to update total.");
    } catch (e) {
      setOptionsSaveError(errorMessage(e));
    } finally {
      setOptionsSaveBusy(false);
    }
  }

  async function runSavePricing() {
    if (!(draft?.pricingEditable ?? draft?.scopeEditable)) {
      setPricingSaveError(draft?.scopeEditability?.message || "Pricing controls are read-only.");
      return;
    }
    setPricingSaveBusy(true);
    setPricingSaveError(null);
    setPricingSaveNotice(null);
    try {
      const body = (await apiPatch(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft/pricing`,
        authToken,
        {
          pricing: {
            pricingBasis: pricingDraft.pricingBasis,
            materialGroup: pricingDraft.materialGroup,
            estimateWideAdjustment: pricingDraft.estimateWideAdjustment
              ? {
                  active: Boolean(pricingDraft.estimateWideAdjustment.active),
                  percentage: Number(pricingDraft.estimateWideAdjustment.percentage) || 0,
                  reason: pricingDraft.estimateWideAdjustment.reason || "",
                  source: "manual"
                }
              : undefined,
            ...(pricingDraft.internalMarkupEditable
              ? { internalMarkupPercent: Number(pricingDraft.internalMarkupPercent) || 0 }
              : {})
          },
          clientMutationId: `v2-pricing-${Date.now()}`,
          expectedRevision: draft.revision ?? draft.projectHeader?.revision ?? undefined
        }
      )) as {
        ok?: boolean;
        editablePricing?: StudioV2EditablePricing;
        projectHeader?: ProjectHeader;
        lastCalculation?: CalculationResult;
        revision?: number;
        status?: string;
      };
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              editablePricing: body.editablePricing || prev.editablePricing,
              lastCalculation: body.lastCalculation || prev.lastCalculation,
              revision: body.revision ?? prev.revision,
              status: body.status || prev.status,
              projectHeader: body.projectHeader
                ? { ...prev.projectHeader, ...body.projectHeader, currentTotal: null }
                : prev.projectHeader
                  ? {
                      ...prev.projectHeader,
                      revision: body.revision ?? prev.projectHeader.revision,
                      status: body.status || prev.projectHeader.status,
                      pricingBasis: pricingDraft.pricingBasis || prev.projectHeader.pricingBasis,
                      materialGroup: pricingDraft.materialGroup || prev.projectHeader.materialGroup,
                      currentTotal: null
                    }
                  : prev.projectHeader
            }
          : prev
      );
      setPricingDraft(cloneEditablePricing(body.editablePricing || pricingDraft));
      setPricingDirty(false);
      setCalcStale(true);
      setCalcStaleReason("Pricing settings changed — recalculate to update total.");
      setCalcResult(body.lastCalculation || { available: false, total: null });
      setPricingSaveNotice("Pricing settings saved. Recalculate to update total.");
      const draftBody = (await apiGet(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft`,
        authToken
      )) as WorkingDraftResponse;
      setDraft(draftBody);
      if (!scopeDirty) setScopeDraft(cloneEditableScope(draftBody.editableScope));
      if (!optionsDirty) setOptionsDraft(cloneEditableOptions(draftBody.editableOptions));
      setPricingDraft(cloneEditablePricing(draftBody.editablePricing || body.editablePricing));
      setPricingDirty(false);
      setCalcStale(true);
      setCalcStaleReason("Pricing settings changed — recalculate to update total.");
      // After save, calculation remains stale even if a prior snapshot still exists.
      setCalcResult(draftBody.lastCalculation || body.lastCalculation || {
        available: false,
        total: null
      });
    } catch (e) {
      setPricingSaveError(errorMessage(e));
    } finally {
      setPricingSaveBusy(false);
    }
  }

  async function runCalculate() {
    if (scopeDirty) {
      setCalcBusy(false);
      setCalcError("Save Scope first before calculating.");
      return;
    }
    if (optionsDirty) {
      setCalcBusy(false);
      setCalcError("Save Options first before calculating.");
      return;
    }
    if (pricingDirty) {
      setCalcBusy(false);
      setCalcError("Save Pricing first before calculating.");
      return;
    }
    setCalcBusy(true);
    setCalcError(null);
    try {
      const body = (await apiPost(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft/calculate`,
        authToken,
        {}
      )) as { calculation?: CalculationResult; ok?: boolean };
      const calcFromPost = body.calculation || null;
      setCalcResult(calcFromPost);
      setCalcStale(false);
      setCalcStaleReason(null);
      // Reload draft metadata without clobbering unsaved local option/scope edits.
      const draftBody = (await apiGet(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft`,
        authToken
      )) as WorkingDraftResponse;
      setDraft(draftBody);
      // Prefer the richer of POST calculate vs GET working-draft so refresh cannot
      // wipe measured/billed SF or material rate when the read model is briefly weak.
      setCalcResult(
        preferRicherCalculation(draftBody.lastCalculation, calcFromPost) || calcFromPost
      );
      setCalcStale(false);
      setCalcStaleReason(null);
      if (!scopeDirty) {
        setScopeDraft(cloneEditableScope(draftBody.editableScope));
      }
      if (!optionsDirty) {
        setOptionsDraft(cloneEditableOptions(draftBody.editableOptions));
      }
      if (!pricingDirty) {
        setPricingDraft(cloneEditablePricing(draftBody.editablePricing));
      }
    } catch (e) {
      setCalcError(errorMessage(e));
      setCalcBusy(false);
    } finally {
      setCalcBusy(false);
    }
  }

  async function runApprove(args: { confirmed: true; approvalNote?: string }) {
    if (scopeDirty || optionsDirty || pricingDirty) {
      setApproveError("Save scope, options, and pricing before approving.");
      return;
    }
    if (calcStale || !calcResult?.available) {
      setApproveError("Calculate a current estimate before approving.");
      return;
    }
    setApproveBusy(true);
    setApproveError(null);
    setApproveNotice(null);
    try {
      const body = (await apiPost(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft/approve`,
        authToken,
        {
          confirmed: true,
          approvalNote: args.approvalNote,
          clientMutationId: `v2-approve-${Date.now()}`,
          expectedRevision: draft?.revision ?? draft?.projectHeader?.revision ?? undefined
        }
      )) as {
        ok?: boolean;
        status?: string;
        approvedAt?: string;
        approvedSummary?: StudioV2ApprovedSummary;
        approvalReadiness?: StudioV2ApprovalReadiness;
      };
      setApproveNotice(
        body.approvedAt
          ? `Estimate approved at ${body.approvedAt}.`
          : "Estimate approved."
      );
      setCalcStale(false);
      setCalcStaleReason(null);
      await load();
    } catch (e) {
      setApproveError(errorMessage(e));
    } finally {
      setApproveBusy(false);
    }
  }

  async function runCreateRevision(args: { confirmed: true; reason?: string }) {
    const estimateId =
      draft?.estimateId ||
      draft?.approvedSummary?.estimateId ||
      draft?.projectHeader?.estimateId;
    if (!estimateId) {
      setRevisionError("No approved estimate is available to revise.");
      return;
    }
    if (!args?.confirmed) {
      setRevisionError("Confirm before creating a revision.");
      return;
    }
    setRevisionBusy(true);
    setRevisionError(null);
    setRevisionNotice(null);
    try {
      const body = (await apiPost(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/approved/${encodeURIComponent(estimateId)}/create-revision`,
        authToken,
        {
          confirmed: true,
          reason: args.reason,
          clientMutationId: `v2-revision-${Date.now()}`
        }
      )) as {
        ok?: boolean;
        revision?: number | null;
        revisionSummary?: {
          message?: string | null;
          newRevision?: number | null;
          customerLinkNote?: string | null;
        };
      };
      const rev = body.revisionSummary?.newRevision ?? body.revision;
      const baseMsg =
        body.revisionSummary?.message ||
        (rev != null
          ? `Revision R${rev} created. Make changes, recalculate, approve, then republish.`
          : "Editable revision created. Make changes, recalculate, approve, then republish.");
      const linkNote = body.revisionSummary?.customerLinkNote
        ? ` ${body.revisionSummary.customerLinkNote}`
        : "";
      setRevisionNotice(`${baseMsg}${linkNote}`);
      setApproveNotice(null);
      setApproveError(null);
      setCalcStale(true);
      setCalcStaleReason("Editable revision opened — recalculate before approving.");
      await load();
    } catch (e) {
      setRevisionError(errorMessage(e));
    } finally {
      setRevisionBusy(false);
    }
  }

  async function runCreateRevisionFromCustomerSelections() {
    const publicationId =
      activity?.activePublication?.publicationId ||
      activity?.selectionReview?.publicationId ||
      null;
    const reviewRequestId =
      (activity?.reviewRequests || []).find((request) => request.open)?.id || null;
    if (!publicationId || !reviewRequestId) {
      setCustomerRevisionError("Customer selections have not been sent for Elite review.");
      return;
    }
    setCustomerRevisionBusy(true);
    setCustomerRevisionError(null);
    setCustomerRevisionNotice(null);
    try {
      const body = (await apiPost(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/customer-selections/create-revision`,
        authToken,
        {
          confirmed: true,
          publicationId,
          reviewRequestId,
          clientMutationId: `v2-customer-selection-revision-${Date.now()}`
        }
      )) as {
        ok?: boolean;
        created?: boolean;
        reused?: boolean;
        alreadyCreated?: boolean;
        estimateId?: string | null;
        revision?: number | null;
        notice?: string | null;
        notAppliedScopeRequests?: Array<unknown>;
        customerSelectionRevision?: CustomerSelectionRevisionInfo | null;
      };
      const baseNotice =
        body.notice ||
        "Revision created from customer selections. Review scope, recalculate, approve, then republish.";
      const notAppliedCount =
        body.notAppliedScopeRequests?.length ||
        body.customerSelectionRevision?.notAppliedScopeRequests?.length ||
        0;
      setCustomerRevisionNotice(
        `${baseNotice}${
          notAppliedCount > 0
            ? " Some customer requests were added as review notes and were not automatically applied."
            : ""
        }`
      );
      setApproveNotice(null);
      setApproveError(null);
      await load();
      setCalcStale(true);
      setCalcStaleReason(
        "Revision created from customer selections — recalculate before approving."
      );
    } catch (e) {
      setCustomerRevisionError(errorMessage(e));
    } finally {
      setCustomerRevisionBusy(false);
    }
  }

  async function runPublish(args?: { confirmed?: true }) {
    const estimateId = draft?.estimateId || draft?.projectHeader?.estimateId;
    if (!estimateId) {
      setPublishError("No approved estimate is available to publish.");
      return;
    }
    const isApproved = Boolean(
      draft?.approvedPublished?.approved ||
        draft?.approvedSummary?.approved ||
        String(draft?.status || draft?.projectHeader?.status || "").toLowerCase() === "approved"
    );
    if (!isApproved) {
      setPublishError("Approve required before publish.");
      return;
    }
    if (!args?.confirmed) {
      setPublishError("Confirm publish before continuing.");
      return;
    }
    const hadActivePublication = Boolean(
      draft?.approvedPublished?.customerUrl ||
        draft?.publicationSummary?.customerUrl ||
        activity?.activePublication?.customerUrl ||
        draft?.approvedPublished?.published
    );
    setPublishBusy(true);
    setPublishError(null);
    setPublishNotice(null);
    try {
      const body = (await apiPost(
        `/api/elite100-studio-v2/approved/${encodeURIComponent(estimateId)}/publish`,
        authToken,
        {
          confirmed: true,
          deliveryMode: "link_only",
          clientMutationId: `v2-publish-${Date.now()}`
        }
      )) as {
        customerUrl?: string | null;
        staffNotice?: string | null;
        publication?: StudioV2PublicationView | null;
        envelope?: { configured?: boolean; repaired?: boolean; updated?: boolean } | null;
        configurationUpdated?: boolean;
        reused?: boolean;
        ok?: boolean;
      };
      const repaired =
        Boolean(body.envelope?.repaired) ||
        Boolean(body.envelope?.updated) ||
        Boolean(body.configurationUpdated) ||
        hadActivePublication;
      setPublishNotice(
        body.staffNotice ||
          (repaired
            ? "Customer Digital Estimate configuration refreshed (link-only). The customer was not emailed."
            : body.publication?.customerUrl || body.customerUrl
              ? "Digital Estimate published (link-only)."
              : "Digital Estimate published.")
      );
      await load();
    } catch (e) {
      setPublishError(errorMessage(e));
    } finally {
      setPublishBusy(false);
    }
  }

  const header = draft?.projectHeader;
  const scope = draft?.scopeSummary;
  const approved = Boolean(
    draft?.approvedPublished?.approved ||
      draft?.approvedSummary?.approved ||
      String(draft?.status || header?.status || "").toLowerCase() === "approved"
  );
  const scopeReadOnly =
    !draft?.scopeEditable ||
    draft?.code === "unsupported_origin" ||
    draft?.code === "no_estimate" ||
    approved;
  const customerUrl =
    draft?.approvedPublished?.customerUrl ||
    draft?.publicationSummary?.customerUrl ||
    activity?.activePublication?.customerUrl ||
    null;
  const published =
    Boolean(customerUrl) ||
    Boolean(draft?.approvedPublished?.published) ||
    Boolean(draft?.publicationSummary?.active) ||
    String(draft?.publicationSummary?.state || "").toLowerCase().includes("published");
  const calcStatusLabel = calcStale
    ? "stale"
    : !calcResult?.available
      ? "not priced"
      : "current";
  const pb = calcResult?.pricingBreakdown;
  const displayBasis = displayPricingContext(pb, pricingDraft, "basis");
  const displayGroup = displayPricingContext(pb, pricingDraft, "group");
  const rateDisplay =
    pb?.materialRatePerSf != null
      ? `${money(pb.materialRatePerSf)} / SF`
      : pb?.materialRatePerSfNote || "not calculated yet";

  return (
    <div className="studio-v2-shell" data-testid="studio-v2-estimator-shell">
      <header className="studio-v2-shell__toolbar">
        <button type="button" className="eq-btn-secondary" onClick={onBack} data-testid="studio-v2-back">
          ← Back
        </button>
        <div className="studio-v2-shell__title-block">
          <p className="studio-v2-shell__eyebrow" data-testid="studio-v2-eyebrow">
            Studio V2 · Test Mode
          </p>
          <h1>Studio V2 Workspace</h1>
          <p className="muted">
            Estimate authority for scope, pricing, approval, and Digital Estimate. Use AI Takeoff
            Review to verify plan dimensions — then import approved measurements here.
          </p>
        </div>
        {onOpenTakeoffReview ? (
          <button
            type="button"
            className="eq-btn-secondary"
            onClick={onOpenTakeoffReview}
            data-testid="studio-v2-open-takeoff-review"
            title="Open plan-visible measurement review"
          >
            Open Takeoff Review
          </button>
        ) : null}
      </header>

      {busy && !draft ? <p className="muted">Loading working draft…</p> : null}
      {loadError ? (
        <div className="error-box" data-testid="studio-v2-load-error">
          <p>{loadError}</p>
          <p className="muted">
            This Studio V2 workspace could not be opened. It may be missing, unauthorized, or
            unavailable.
          </p>
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="studio-v2-load-error-back"
            onClick={onBack}
          >
            Back to Inbox
          </button>
        </div>
      ) : null}

      {draft?.code === "no_estimate" ? (
        <div className="studio-v2-empty" data-testid="studio-v2-no-estimate">
          <h2>No estimate yet</h2>
          <p>This case has no Studio estimate. Create or open it in V1 first.</p>
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="studio-v2-no-estimate-back"
            onClick={onBack}
          >
            Back to Inbox
          </button>
        </div>
      ) : null}

      {draft?.code === "unsupported_origin" ? (
        <div className="studio-v2-empty" data-testid="studio-v2-unsupported-origin">
          <h2>Origin not supported in V2</h2>
          <p>{draft.message || "This estimate origin is not supported in Studio V2 yet."}</p>
        </div>
      ) : null}

      {draft && draft.code !== "no_estimate" ? (
        <div className="studio-v2-layout">
          <section
            className="studio-v2-panel studio-v2-workflow-status"
            data-testid="studio-v2-workflow-status"
          >
            <h2>Workflow status</h2>
            <ul className="studio-v2-workflow-status__list">
              <li data-testid="studio-v2-status-scope">
                <span>Scope</span>
                <strong>{scopeDirty ? "unsaved" : "clean"}</strong>
              </li>
              <li data-testid="studio-v2-status-options">
                <span>Options</span>
                <strong>{optionsDirty ? "unsaved" : "clean"}</strong>
              </li>
              <li data-testid="studio-v2-status-pricing">
                <span>Pricing</span>
                <strong>{pricingDirty ? "unsaved" : "clean"}</strong>
              </li>
              <li data-testid="studio-v2-status-calculation">
                <span>Calculation</span>
                <strong>{calcStatusLabel}</strong>
              </li>
              <li data-testid="studio-v2-status-approval">
                <span>Approval</span>
                <strong>{approved ? "approved" : "draft"}</strong>
              </li>
              <li data-testid="studio-v2-status-publish">
                <span>Publish</span>
                <strong>{published ? "published" : "not published"}</strong>
              </li>
            </ul>
          </section>

          <section
            className="studio-v2-panel studio-v2-takeoff-status-card"
            data-testid="studio-v2-takeoff-status-card"
          >
            <div className="studio-v2-panel__head">
              <div>
                <h2>AI Takeoff</h2>
                <p className="muted studio-v2-scope-editor__hint">
                  Verify dimensions on the plan in Takeoff Review. Studio V2 remains where the
                  estimate is finalized — Takeoff Review does not price, publish, or mark sold.
                </p>
              </div>
              {onOpenTakeoffReview ? (
                <button
                  type="button"
                  className="eq-btn-primary"
                  onClick={onOpenTakeoffReview}
                  data-testid="studio-v2-open-takeoff-review-card"
                  disabled={!draft.takeoffJobId}
                  title={
                    draft.takeoffJobId
                      ? "Open plan-visible measurement review"
                      : "No AI Takeoff job is linked yet"
                  }
                >
                  Open Takeoff Review
                </button>
              ) : null}
            </div>
            <dl className="studio-v2-dl" data-testid="studio-v2-takeoff-status-dl">
              <div>
                <dt>Status</dt>
                <dd>
                  {draft.takeoffJobId
                    ? draft.takeoffImportNeeded
                      ? "Linked — review measurements, then import into scope"
                      : "Linked"
                    : "Not started"}
                </dd>
              </div>
              <div>
                <dt>Job</dt>
                <dd>{draft.takeoffJobId ? "Present" : "None"}</dd>
              </div>
            </dl>
          </section>

          <section className="studio-v2-panel" data-testid="studio-v2-project-header">
            <h2>Project header</h2>
            <dl className="studio-v2-dl">
              <div>
                <dt>Account</dt>
                <dd>{header?.accountName || "—"}</dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>{header?.customerName || "—"}</dd>
              </div>
              <div>
                <dt>Project</dt>
                <dd>{header?.projectName || "—"}</dd>
              </div>
              <div>
                <dt>Pricing basis</dt>
                <dd>
                  {[header?.pricingBasis, header?.materialGroup].filter(Boolean).join(" · ") || "—"}
                </dd>
              </div>
              <div>
                <dt>Estimate</dt>
                <dd>
                  {header?.estimateId ? `${header.estimateId.slice(0, 8)}…` : "—"} · r
                  {header?.revision ?? draft.revision ?? "—"} · {header?.status || "—"}
                </dd>
              </div>
              <div>
                <dt>Origin</dt>
                <dd>{originLabel(header?.originType || draft.originType)}</dd>
              </div>
              <div>
                <dt>Current total</dt>
                <dd data-testid="studio-v2-current-total">{money(header?.currentTotal)}</dd>
              </div>
              <div>
                <dt>Scope summary</dt>
                <dd>
                  {scope?.roomCount ?? 0} rooms · {scope?.pieceCount ?? 0} pieces ·{" "}
                  {scope?.measuredSf != null ? `${scope.measuredSf.toFixed(1)} SF` : "—"}
                </dd>
              </div>
            </dl>
          </section>

          <StudioV2PricingControlsPanel
            value={pricingDraft}
            readOnly={!(draft.pricingEditable ?? draft.scopeEditable) || draft.code === "unsupported_origin" || approved}
            readOnlyMessage={
              approved
                ? "Pricing controls are read-only on approved estimates."
                : draft.scopeEditability?.message ||
                  (draft.code === "unsupported_origin"
                    ? draft.message
                    : "Pricing controls cannot be edited on this estimate.")
            }
            dirty={pricingDirty}
            saveBusy={pricingSaveBusy}
            saveError={pricingSaveError}
            saveNotice={pricingSaveNotice}
            onChange={onPricingChange}
            onSave={() => void runSavePricing()}
          />

          <StudioV2TakeoffImportPanel
            authToken={authToken}
            caseId={caseId}
            takeoffJobId={draft.takeoffJobId}
            takeoffImportNeeded={Boolean(draft.takeoffImportNeeded)}
            scopeDirty={scopeDirty}
            currentScopeEmpty={Boolean(scope?.empty || !scopeDraft.rooms.length)}
            onOpenTakeoffReview={onOpenTakeoffReview}
            onApplied={(result) => {
              setScopeDraft(cloneEditableScope(result.editableScope));
              setScopeDirty(false);
              setCalcStale(true);
              setCalcStaleReason("Scope changed — recalculate to update total.");
              setCalcResult(
                (result.lastCalculation as CalculationResult) || {
                  available: false,
                  total: null
                }
              );
              setDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      scopeSummary: (result.scopeSummary as ScopeSummary) || prev.scopeSummary,
                      editableScope: result.editableScope || prev.editableScope,
                      lastCalculation:
                        (result.lastCalculation as CalculationResult) || prev.lastCalculation,
                      revision: result.revision ?? prev.revision,
                      status: result.status || prev.status,
                      takeoffImportNeeded: false,
                      projectHeader: prev.projectHeader
                        ? {
                            ...prev.projectHeader,
                            revision: result.revision ?? prev.projectHeader.revision,
                            status: result.status || prev.projectHeader.status,
                            currentTotal: null
                          }
                        : prev.projectHeader
                    }
                  : prev
              );
              setScopeSaveNotice("Takeoff scope applied. Recalculate to update total.");
            }}
          />

          <StudioV2ScopeEditor
            value={scopeDraft}
            readOnly={scopeReadOnly}
            readOnlyMessage={
              draft.scopeEditability?.message ||
              (draft.code === "unsupported_origin"
                ? draft.message
                : "Scope cannot be edited on this estimate.")
            }
            dirty={scopeDirty}
            saveBusy={scopeSaveBusy}
            saveError={scopeSaveError}
            saveNotice={scopeSaveNotice}
            onChange={onScopeChange}
            onSave={() => void runSaveScope()}
          />

          <StudioV2EstimateOptionsPanel
            value={optionsDraft}
            readOnly={!(draft.optionsEditable ?? draft.scopeEditable) || draft.code === "unsupported_origin"}
            readOnlyMessage={
              draft.scopeEditability?.message ||
              (draft.code === "unsupported_origin"
                ? draft.message
                : "Estimate options cannot be edited on this estimate.")
            }
            dirty={optionsDirty}
            saveBusy={optionsSaveBusy}
            saveError={optionsSaveError}
            saveNotice={optionsSaveNotice}
            onChange={onOptionsChange}
            onSave={() => void runSaveOptions()}
          />

          <section className="studio-v2-panel" data-testid="studio-v2-calculation">
            <div className="studio-v2-panel__head">
              <h2>Calculation result</h2>
              <button
                type="button"
                className="eq-btn-primary"
                disabled={
                  calcBusy ||
                  draft.code === "unsupported_origin" ||
                  scopeDirty ||
                  optionsDirty ||
                  pricingDirty ||
                  scopeSaveBusy ||
                  optionsSaveBusy ||
                  pricingSaveBusy
                }
                onClick={() => void runCalculate()}
                data-testid="studio-v2-calculate"
              >
                {calcBusy ? "Calculating…" : "Calculate"}
              </button>
            </div>
            {scopeDirty ? (
              <p className="studio-v2-dirty" data-testid="studio-v2-calc-requires-save">
                Save Scope first before calculating.
              </p>
            ) : null}
            {optionsDirty ? (
              <p className="studio-v2-dirty" data-testid="studio-v2-calc-requires-options-save">
                Save Options first before calculating.
              </p>
            ) : null}
            {pricingDirty ? (
              <p className="studio-v2-dirty" data-testid="studio-v2-calc-requires-pricing-save">
                Save Pricing first before calculating.
              </p>
            ) : null}
            {calcStale && !scopeDirty && !optionsDirty && !pricingDirty ? (
              <p className="studio-v2-stale" data-testid="studio-v2-calc-stale">
                {calcStaleReason || "Scope changed — recalculate to update total."}
              </p>
            ) : null}
            {calcError ? (
              <div className="error-box" data-testid="studio-v2-calc-error">
                {calcError}
              </div>
            ) : null}
            <dl className="studio-v2-dl" data-testid="studio-v2-calc-summary">
              <div>
                <dt>Server total</dt>
                <dd data-testid="studio-v2-calc-total">{money(calcResult?.total)}</dd>
              </div>
              <div>
                <dt>Pricing version</dt>
                <dd>{calcResult?.pricingVersion ?? "—"}</dd>
              </div>
              <div>
                <dt>Pricing basis</dt>
                <dd data-testid="studio-v2-calc-pricing-basis">{displayBasis}</dd>
              </div>
              <div>
                <dt>Price group</dt>
                <dd data-testid="studio-v2-calc-price-group">{displayGroup}</dd>
              </div>
              <div>
                <dt>Material rate</dt>
                <dd data-testid="studio-v2-calc-material-rate">{rateDisplay}</dd>
              </div>
              <div>
                <dt>Measured SF</dt>
                <dd data-testid="studio-v2-calc-measured-sf">
                  {displayCalculatedMetric(pb?.measuredSf, (n) => n.toFixed(1))}
                </dd>
              </div>
              <div>
                <dt>Billed SF</dt>
                <dd data-testid="studio-v2-calc-billed-sf">
                  {displayCalculatedMetric(pb?.billedSf, (n) => n.toFixed(1))}
                </dd>
              </div>
              <div>
                <dt>Material subtotal</dt>
                <dd data-testid="studio-v2-calc-material-subtotal">
                  {displayCalculatedMetric(pb?.materialSubtotal, (n) => money(n))}
                </dd>
              </div>
              <div>
                <dt>Material use tax</dt>
                <dd data-testid="studio-v2-calc-material-use-tax">
                  {displayCalculatedMetric(pb?.materialUseTax, (n) => money(n))}
                </dd>
              </div>
              <div>
                <dt>Estimate-wide adjustment</dt>
                <dd data-testid="studio-v2-calc-ewa">
                  {pb?.estimateWideAdjustmentAmount != null &&
                  Number.isFinite(Number(pb.estimateWideAdjustmentAmount)) &&
                  !(
                    Number(pb.estimateWideAdjustmentAmount) === 0 &&
                    Number(pb.estimateWideAdjustmentPercentage) > 0
                  )
                    ? `${money(pb.estimateWideAdjustmentAmount)}${
                        pb.estimateWideAdjustmentPercentage != null
                          ? ` (${pb.estimateWideAdjustmentPercentage}%)`
                          : ""
                      }${
                        pb.estimateWideAdjustmentReason
                          ? ` · ${pb.estimateWideAdjustmentReason}`
                          : ""
                      }`
                    : pb?.estimateWideAdjustmentPercentage != null &&
                        Number(pb.estimateWideAdjustmentPercentage) > 0
                      ? `applied in calculation (${pb.estimateWideAdjustmentPercentage}%)`
                      : "none"}
                </dd>
              </div>
              <div>
                <dt>Customer-facing adjustments</dt>
                <dd data-testid="studio-v2-calc-customer-adj">
                  {displayCalculatedMetric(pb?.customerFacingAdjustments, (n) => money(n))}
                </dd>
              </div>
              <div>
                <dt>Hidden customer-impacting adjustments</dt>
                <dd data-testid="studio-v2-calc-hidden-adj">
                  {displayCalculatedMetric(pb?.hiddenCustomerImpactingAdjustments, (n) => money(n))}
                </dd>
              </div>
            </dl>
            {Array.isArray(calcResult?.customerSafeLinePreview) &&
            calcResult.customerSafeLinePreview.length ? (
              <ul className="studio-v2-line-preview" data-testid="studio-v2-line-preview">
                {calcResult.customerSafeLinePreview.map((line) => (
                  <li key={line.key}>
                    <span>{line.label}</span>
                    <span>{money(line.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No customer-safe line preview yet.</p>
            )}
            {Array.isArray(calcResult?.warnings) && calcResult.warnings.length ? (
              <ul className="studio-v2-warnings" data-testid="studio-v2-warnings">
                {calcResult.warnings.map((w, i) => (
                  <li key={`${w.code || "w"}-${i}`}>{w.message}</li>
                ))}
              </ul>
            ) : null}
            {Array.isArray(calcResult?.unresolvedItems) && calcResult.unresolvedItems.length ? (
              <ul className="studio-v2-warnings" data-testid="studio-v2-unresolved">
                {calcResult.unresolvedItems.map((u, i) => (
                  <li key={`${u.code || "u"}-${i}`}>{u.message}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <StudioV2ApprovalPanel
            readiness={draft.approvalReadiness}
            approvedSummary={draft.approvedSummary}
            revisionAffordance={draft.revisionAffordance || draft.approvedSummary?.revisionAffordance}
            status={draft.status || header?.status}
            revision={draft.revision ?? header?.revision}
            calcTotal={calcResult?.total ?? draft.approvedSummary?.customerDisplayTotal}
            calcAvailable={Boolean(calcResult?.available)}
            calcStale={calcStale}
            scopeDirty={scopeDirty}
            optionsDirty={optionsDirty}
            pricingDirty={pricingDirty}
            busy={approveBusy}
            revisionBusy={revisionBusy}
            error={approveError}
            notice={approveNotice}
            revisionError={revisionError}
            revisionNotice={revisionNotice}
            onApprove={(args) => void runApprove(args)}
            onCreateRevision={(args) => void runCreateRevision(args)}
          />

          <StudioV2PublishPanel
            estimateId={draft.estimateId || header?.estimateId}
            approved={approved}
            readiness={draft.publishReadiness}
            publicationSummary={draft.publicationSummary}
            activePublication={
              (activity?.activePublication as StudioV2PublicationView | null) ||
              (draft.approvedPublished?.customerUrl
                ? {
                    customerUrl: draft.approvedPublished.customerUrl,
                    publicationId: draft.approvedPublished.publicationId,
                    active: true,
                    status: draft.approvedPublished.publicationState
                  }
                : null)
            }
            historicalPublications={
              (activity?.historicalPublications as StudioV2PublicationView[]) || []
            }
            customerUrl={customerUrl}
            busy={publishBusy}
            error={publishError}
            notice={publishNotice}
            onPublish={(args) => void runPublish(args)}
          />

          <StudioV2CustomerSelectionReviewPanel
            activity={activity?.activity || null}
            selectionReview={activity?.selectionReview || null}
            acceptance={activity?.acceptance || null}
            activePublication={activity?.activePublication || null}
            historicalCount={activity?.historicalPublications?.length || 0}
            revisionAffordance={
              draft?.revisionAffordance || draft?.approvedSummary?.revisionAffordance || null
            }
            customerSelectionRevision={
              draft?.customerSelectionRevision ||
              activity?.customerSelectionRevision ||
              null
            }
            activeReviewRequestId={
              (activity?.reviewRequests || []).find((request) => request.open)?.id || null
            }
            revisionBusy={customerRevisionBusy}
            revisionError={customerRevisionError}
            revisionNotice={customerRevisionNotice}
            onCreateRevision={() => void runCreateRevisionFromCustomerSelections()}
          />
        </div>
      ) : null}
    </div>
  );
}
