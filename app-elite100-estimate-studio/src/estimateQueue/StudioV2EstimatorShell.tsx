/**
 * Elite 100 Studio V2 — estimator command shell (Slices A–D).
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

type CalculationResult = {
  available?: boolean;
  total?: number | null;
  customerSafeLinePreview?: Array<{ key: string; label: string; amount: number }>;
  warnings?: Array<{ code?: string | null; message?: string }>;
  unresolvedItems?: Array<{ code?: string | null; message?: string }>;
  calculatedAt?: string | null;
  pricingVersion?: number | null;
};

type WorkingDraftResponse = {
  ok?: boolean;
  code?: string | null;
  message?: string | null;
  empty?: boolean;
  projectHeader?: ProjectHeader;
  scopeSummary?: ScopeSummary;
  editableScope?: StudioV2EditableScope;
  editableOptions?: StudioV2EditableOptions;
  scopeEditable?: boolean;
  optionsEditable?: boolean;
  scopeEditability?: { editable?: boolean; code?: string | null; message?: string | null };
  lastCalculation?: CalculationResult;
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
  takeoffImportNeeded?: boolean;
  takeoffJobId?: string | null;
};

type CustomerActivityResponse = {
  ok?: boolean;
  activity?: {
    viewed?: boolean;
    savedSelections?: boolean;
    reviewRequested?: boolean;
    accepted?: boolean;
  };
  activePublication?: { publicationId?: string | null; customerUrl?: string | null } | null;
  historicalPublications?: Array<{ publicationId?: string | null; status?: string }>;
  reviewRequests?: Array<{ id?: string | null; open?: boolean; status?: string | null }>;
  acceptance?: { acceptedAt?: string | null; customerDisplayTotal?: number | null } | null;
  publicationSummary?: { statusLabel?: string; customerUrl?: string | null };
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
  onOpenV1?: () => void;
}) {
  const { authToken, caseId, onBack, onOpenV1 } = props;
  const [draft, setDraft] = useState<WorkingDraftResponse | null>(null);
  const [activity, setActivity] = useState<CustomerActivityResponse | null>(null);
  const [calcResult, setCalcResult] = useState<CalculationResult | null>(null);
  const [scopeDraft, setScopeDraft] = useState<StudioV2EditableScope>(emptyEditableScope());
  const [scopeDirty, setScopeDirty] = useState(false);
  const [optionsDraft, setOptionsDraft] = useState<StudioV2EditableOptions>(emptyEditableOptions());
  const [optionsDirty, setOptionsDirty] = useState(false);
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
  const [busy, setBusy] = useState(false);
  const [calcBusy, setCalcBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [scopeSaveBusy, setScopeSaveBusy] = useState(false);
  const [optionsSaveBusy, setOptionsSaveBusy] = useState(false);

  const hydrateFromDraft = useCallback((draftBody: WorkingDraftResponse) => {
    setDraft(draftBody);
    setCalcResult(draftBody?.lastCalculation || null);
    // Never overwrite local editable fields from a calculate-only refresh while dirty.
    setScopeDraft(cloneEditableScope(draftBody?.editableScope));
    setScopeDirty(false);
    setOptionsDraft(cloneEditableOptions(draftBody?.editableOptions));
    setOptionsDirty(false);
    setCalcStale(false);
    setCalcStaleReason(null);
    setScopeSaveError(null);
    setOptionsSaveError(null);
  }, []);

  const load = useCallback(
    async (opts?: { preserveDirtyScope?: boolean; preserveDirtyOptions?: boolean }) => {
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
          (opts?.preserveDirtyScope && scopeDirty) || (opts?.preserveDirtyOptions && optionsDirty);
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
    [authToken, caseId, hydrateFromDraft, scopeDirty, optionsDirty]
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
            openings: scopeDraft.openings
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

  async function runCalculate() {
    if (scopeDirty) {
      setCalcError("Save Scope first before calculating.");
      return;
    }
    if (optionsDirty) {
      setCalcError("Save Options first before calculating.");
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
      setCalcResult(body.calculation || null);
      setCalcStale(false);
      setCalcStaleReason(null);
      // Reload draft metadata without clobbering unsaved local option/scope edits.
      const draftBody = (await apiGet(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft`,
        authToken
      )) as WorkingDraftResponse;
      setDraft(draftBody);
      setCalcResult(draftBody.lastCalculation || body.calculation || null);
      if (!scopeDirty) {
        setScopeDraft(cloneEditableScope(draftBody.editableScope));
      }
      if (!optionsDirty) {
        setOptionsDraft(cloneEditableOptions(draftBody.editableOptions));
      }
      // Keep local form fields — do not rehydrate from calculation response while dirty.
    } catch (e) {
      setCalcError(errorMessage(e));
    } finally {
      setCalcBusy(false);
    }
  }

  async function runPublish() {
    const estimateId = draft?.estimateId || draft?.projectHeader?.estimateId;
    if (!estimateId) {
      setPublishError("No approved estimate is available to publish.");
      return;
    }
    if (!draft?.approvedPublished?.approved) {
      setPublishError("Approve required before publish.");
      return;
    }
    setPublishBusy(true);
    setPublishError(null);
    setPublishNotice(null);
    try {
      const body = (await apiPost(
        `/api/elite100-studio-v2/approved/${encodeURIComponent(estimateId)}/publish`,
        authToken,
        { confirm: true }
      )) as { customerUrl?: string | null; staffNotice?: string | null };
      setPublishNotice(body.staffNotice || "Digital Estimate published.");
      await load();
    } catch (e) {
      setPublishError(errorMessage(e));
    } finally {
      setPublishBusy(false);
    }
  }

  const header = draft?.projectHeader;
  const scope = draft?.scopeSummary;
  const approved = Boolean(draft?.approvedPublished?.approved);
  const scopeReadOnly =
    !draft?.scopeEditable ||
    draft?.code === "unsupported_origin" ||
    draft?.code === "no_estimate";
  const customerUrl =
    draft?.approvedPublished?.customerUrl ||
    draft?.publicationSummary?.customerUrl ||
    activity?.activePublication?.customerUrl ||
    null;

  return (
    <div className="studio-v2-shell" data-testid="studio-v2-estimator-shell">
      <header className="studio-v2-shell__toolbar">
        <button type="button" className="eq-btn-secondary" onClick={onBack} data-testid="studio-v2-back">
          ← Back
        </button>
        <div className="studio-v2-shell__title-block">
          <p className="studio-v2-shell__eyebrow">Studio V2 · Slice C Takeoff Import</p>
          <h1>Estimator command shell</h1>
          <p className="muted">
            Edit physical scope and import approved AI Takeoff into the Working Draft. V1 remains
            the default workflow.
          </p>
        </div>
        {onOpenV1 ? (
          <button
            type="button"
            className="eq-btn-secondary"
            onClick={onOpenV1}
            data-testid="studio-v2-open-v1"
          >
            Open in V1
          </button>
        ) : null}
      </header>

      {busy && !draft ? <p className="muted">Loading working draft…</p> : null}
      {loadError ? (
        <div className="error-box" data-testid="studio-v2-load-error">
          {loadError}
        </div>
      ) : null}

      {draft?.code === "no_estimate" ? (
        <div className="studio-v2-empty" data-testid="studio-v2-no-estimate">
          <h2>No estimate yet</h2>
          <p>This case has no Studio estimate. Create or open it in V1 first.</p>
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

          <StudioV2TakeoffImportPanel
            authToken={authToken}
            caseId={caseId}
            takeoffJobId={draft.takeoffJobId}
            takeoffImportNeeded={Boolean(draft.takeoffImportNeeded)}
            scopeDirty={scopeDirty}
            currentScopeEmpty={Boolean(scope?.empty || !scopeDraft.rooms.length)}
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
                  scopeSaveBusy ||
                  optionsSaveBusy
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
            {calcStale && !scopeDirty && !optionsDirty ? (
              <p className="studio-v2-stale" data-testid="studio-v2-calc-stale">
                {calcStaleReason || "Scope changed — recalculate to update total."}
              </p>
            ) : null}
            {calcError ? (
              <div className="error-box" data-testid="studio-v2-calc-error">
                {calcError}
              </div>
            ) : null}
            <dl className="studio-v2-dl">
              <div>
                <dt>Server total</dt>
                <dd data-testid="studio-v2-calc-total">{money(calcResult?.total)}</dd>
              </div>
              <div>
                <dt>Pricing version</dt>
                <dd>{calcResult?.pricingVersion ?? "—"}</dd>
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

          <section className="studio-v2-panel" data-testid="studio-v2-digital-estimate">
            <div className="studio-v2-panel__head">
              <h2>Digital Estimate</h2>
              {approved ? (
                <button
                  type="button"
                  className="eq-btn-primary"
                  disabled={publishBusy}
                  onClick={() => void runPublish()}
                  data-testid="studio-v2-publish"
                >
                  {publishBusy ? "Publishing…" : "Publish"}
                </button>
              ) : (
                <p className="studio-v2-approve-required" data-testid="studio-v2-approve-required">
                  Approve required before publish
                </p>
              )}
            </div>
            {publishError ? (
              <div className="error-box" data-testid="studio-v2-publish-error">
                {publishError}
              </div>
            ) : null}
            {publishNotice ? (
              <p className="studio-v2-notice" data-testid="studio-v2-publish-notice">
                {publishNotice}
              </p>
            ) : null}
            <dl className="studio-v2-dl">
              <div>
                <dt>Publication status</dt>
                <dd>
                  {draft.approvedPublished?.statusLabel ||
                    draft.publicationSummary?.statusLabel ||
                    "Not published"}
                </dd>
              </div>
              <div>
                <dt>Active link</dt>
                <dd>
                  {customerUrl ? (
                    <a
                      href={customerUrl}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="studio-v2-customer-url"
                    >
                      Open customer link
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="studio-v2-panel" data-testid="studio-v2-customer-activity">
            <h2>Customer activity</h2>
            {!activity ? (
              <p className="muted">No customer activity available.</p>
            ) : (
              <dl className="studio-v2-dl">
                <div>
                  <dt>Viewed</dt>
                  <dd>{activity.activity?.viewed ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Saved selections</dt>
                  <dd>{activity.activity?.savedSelections ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Review requested</dt>
                  <dd>{activity.activity?.reviewRequested ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Accepted</dt>
                  <dd>
                    {activity.activity?.accepted
                      ? activity.acceptance?.acceptedAt
                        ? `Yes · ${activity.acceptance.acceptedAt}`
                        : "Yes"
                      : "No"}
                  </dd>
                </div>
                <div>
                  <dt>Active vs historical</dt>
                  <dd>
                    {activity.activePublication ? "Active publication present" : "No active publication"}
                    {" · "}
                    {activity.historicalPublications?.length || 0} historical
                  </dd>
                </div>
              </dl>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
