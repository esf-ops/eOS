/**
 * Elite 100 Studio V2 Slice A — read-only estimator command shell.
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
import { apiGet, apiPost, ApiError } from "../lib/api";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [calcBusy, setCalcBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const [draftBody, activityBody] = await Promise.all([
        apiGet(`/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft`, authToken) as Promise<WorkingDraftResponse>,
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
      setDraft(draftBody);
      setCalcResult(draftBody?.lastCalculation || null);
      setActivity(activityBody);
    } catch (e) {
      setLoadError(errorMessage(e));
      setDraft(null);
      setActivity(null);
    } finally {
      setBusy(false);
    }
  }, [authToken, caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runCalculate() {
    setCalcBusy(true);
    setCalcError(null);
    try {
      const body = (await apiPost(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/working-draft/calculate`,
        authToken,
        {}
      )) as { calculation?: CalculationResult; ok?: boolean };
      setCalcResult(body.calculation || null);
      await load();
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
          <p className="studio-v2-shell__eyebrow">Studio V2 · Slice A preview</p>
          <h1>Estimator command shell</h1>
          <p className="muted">Read-only working draft. V1 remains the default workflow.</p>
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
        <div className="studio-v2-grid">
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
                  {header?.revision ?? "—"} · {header?.status || "—"}
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
            </dl>
          </section>

          <section className="studio-v2-panel" data-testid="studio-v2-scope-summary">
            <h2>Scope summary</h2>
            {scope?.empty ? (
              <p className="muted" data-testid="studio-v2-scope-empty">
                No scope exists on this estimate yet.
              </p>
            ) : (
              <>
                <dl className="studio-v2-dl">
                  <div>
                    <dt>Rooms</dt>
                    <dd>{scope?.roomCount ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Pieces</dt>
                    <dd>{scope?.pieceCount ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Measured SF</dt>
                    <dd>{scope?.measuredSf != null ? `${scope.measuredSf.toFixed(2)} SF` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Billed SF</dt>
                    <dd>{scope?.billedSf != null ? `${scope.billedSf.toFixed(2)} SF` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Openings / cutouts</dt>
                    <dd>{scope?.openings?.total ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Vanity / waterfall</dt>
                    <dd>
                      {scope?.indicators?.hasVanityProgram ? "Vanity program" : "No vanity program"}
                      {" · "}
                      {scope?.indicators?.hasWaterfall
                        ? `${scope.indicators.waterfallIndicators} waterfall`
                        : "No waterfall"}
                    </dd>
                  </div>
                </dl>
                {Array.isArray(scope?.rooms) && scope.rooms.length ? (
                  <ul className="studio-v2-room-list">
                    {scope.rooms.map((r) => (
                      <li key={r.id || r.name}>
                        <strong>{r.name || "Room"}</strong>
                        <span>
                          {(r.countertopSf ?? 0).toFixed(1)} CT · {(r.backsplashSf ?? 0).toFixed(1)}{" "}
                          splash · {r.pieceCount ?? 0} pieces
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>

          <section className="studio-v2-panel" data-testid="studio-v2-calculation">
            <div className="studio-v2-panel__head">
              <h2>Calculation result</h2>
              <button
                type="button"
                className="eq-btn-primary"
                disabled={calcBusy || draft.code === "unsupported_origin"}
                onClick={() => void runCalculate()}
                data-testid="studio-v2-calculate"
              >
                {calcBusy ? "Calculating…" : "Calculate"}
              </button>
            </div>
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
