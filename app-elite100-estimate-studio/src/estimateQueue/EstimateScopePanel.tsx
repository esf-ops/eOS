import React, { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, ApiError } from "../lib/api";

import EstimateDigitalEstimatePanel from "./EstimateDigitalEstimatePanel";

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
    projectName?: string;
    projectAddress?: string;
    partnerAccountId?: string | null;
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
      backsplashHeightIn?: number;
      pieces?: Array<{ id: string; name: string; included?: boolean; sqft?: number }>;
      notes?: string;
    }>;
    addOns?: Record<string, number>;
    edgeMode?: string;
    edgeLinearFeet?: number;
    miterHeightKey?: string | null;
    miterLinearFeet?: number;
    buildupSqft?: number;
    estimatorNotes?: string;
    internalMarkupPercent?: number;
    unresolvedManualReview?: boolean;
  };
  calculation?: {
    totals?: Record<string, number>;
    material?: Record<string, unknown>;
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
  takeoffJobId: string;
  takeoffDisplayStatus: string;
  refreshKey?: number;
  customerHint?: string;
  projectHint?: string;
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
  projectHint = ""
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

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const q = encodeURIComponent(takeoffJobId);
      const body = (await apiGet(
        `/api/elite100-estimate-studio/intake-cases/${encodeURIComponent(caseId)}/estimate?takeoffJobId=${q}`,
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
          rooms: prev.scope.rooms.map((r) => (r.id === roomId ? { ...r, ...partial } : r))
        }
      };
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

      <section className="eq-estimate-section" aria-label="Estimate scope">
        <h2>B. Estimate Scope</h2>
        <div className="eq-scope-grid">
          <label>
            Customer
            <input
              value={scope.customerName || ""}
              disabled={blocked}
              onChange={(e) => patchScope({ customerName: e.target.value })}
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
              placeholder="Search accounts by name"
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
                Clear account
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
              Browser submits only the selected account id. Watts/Spahn rules use trusted id membership
              only — never the display name.
            </p>
          </div>
          <label>
            Pricing basis
            <select
              value={scope.pricingBasis || "direct"}
              disabled={blocked}
              onChange={(e) => patchScope({ pricingBasis: e.target.value })}
            >
              <option value="direct">Direct / Retail</option>
              <option value="wholesale">Wholesale</option>
            </select>
          </label>
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

        <h3>Rooms / measured scope</h3>
        {(scope.rooms || []).length === 0 ? (
          <p className="eq-muted">No rooms seeded yet. Approve Takeoff to seed measured scope.</p>
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
                  <label>
                    Counter SF
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={room.countertopSqft ?? 0}
                      disabled={blocked || room.included === false}
                      onChange={(e) => patchRoom(room.id, { countertopSqft: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Backsplash SF
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={room.backsplashSqft ?? 0}
                      disabled={blocked || room.included === false}
                      onChange={(e) => patchRoom(room.id, { backsplashSqft: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Splash height (in)
                    <input
                      type="number"
                      min={0}
                      value={room.backsplashHeightIn ?? 4}
                      disabled={blocked || room.included === false}
                      onChange={(e) =>
                        patchRoom(room.id, { backsplashHeightIn: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
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

        <h3>Fabrication / add-ons</h3>
        <div className="eq-addon-grid">
          {(
            [
              ["qty-sink", "Kitchen sink cutout"],
              ["qty-bar", "Vanity/bar sink cutout"],
              ["qty-cook", "Cooktop cutout"],
              ["qty-outlet", "Electrical outlet cutout"],
              ["qty-ss", "ESF stainless kitchen sink"],
              ["qty-v-rect", "Rectangular vanity sink"],
              ["qty-v-oval", "Oval vanity sink"],
              ["tearout", "Tear-out"]
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

        <div className="eq-scope-grid">
          <label>
            Edge
            <select
              value={scope.edgeMode || "included"}
              disabled={blocked}
              onChange={(e) => patchScope({ edgeMode: e.target.value })}
            >
              <option value="included">Included edges</option>
              <option value="w_edge">W edge</option>
              <option value="d_edge">D edge</option>
            </select>
          </label>
          <label>
            Edge LF
            <input
              type="number"
              min={0}
              value={scope.edgeLinearFeet ?? 0}
              disabled={blocked || scope.edgeMode === "included"}
              onChange={(e) => patchScope({ edgeLinearFeet: Number(e.target.value) })}
            />
          </label>
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
