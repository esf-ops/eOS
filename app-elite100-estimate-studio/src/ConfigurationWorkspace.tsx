/**
 * DE.2D — Private Studio configuration envelope builder.
 * Pilot UI only. Never renders rates from browser authority.
 * Internal preview must never be copied into public Digital Estimate surfaces.
 */
import React, { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch, apiPut, ApiError } from "./lib/api";

export function configurationUiEnabled(): boolean {
  return (
    String(import.meta.env.VITE_ELITE100_ESTIMATE_STUDIO_CONFIGURATION_UI_ENABLED ?? "").trim() ===
    "true"
  );
}

type RoomCtx = {
  roomKey: string;
  displayName: string;
  chargeableCounterSf: number;
  baselineMaterialGroup: string | null;
  baselineMaterialLabel?: string;
};

type ConfigContext = {
  publication?: Record<string, unknown>;
  project?: Record<string, unknown>;
  baselineDisplayTotal?: number | null;
  pricingValidThrough?: string | null;
  rooms?: RoomCtx[];
  lockedScopeNotice?: string;
  accountMappingNotice?: string | null;
  partnerAccountId?: string | null;
  allowedMaterialGroups?: Array<{ groupCode: string; displayName: string }>;
  optionCatalog?: Array<{
    optionKey: string;
    displayLabel: string;
    availabilityState: string;
    unresolvedReason?: string | null;
    lockedQuantity?: boolean;
  }>;
  blockers?: Array<{ code: string; message: string }>;
  canConfigure?: boolean;
};

type EnvelopeRow = {
  id: string;
  status: string;
  envelopeVersion?: number;
  envelope_version?: number;
  rowVersion?: number;
  row_version?: number;
  activatedAt?: string | null;
  activated_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
};

type Props = {
  token: string;
  publicationId: string | null;
  onAuthFailure: () => void;
};

const MATERIAL_CODES = ["promo", "group_a", "group_b", "group_c", "group_d", "group_e", "group_f", "remnant"];

function clearSensitive() {
  return {
    context: null as ConfigContext | null,
    envelopes: [] as EnvelopeRow[],
    envelopeId: null as string | null,
    graph: null as { envelope?: EnvelopeRow; groups?: unknown[]; options?: unknown[] } | null,
    internalPreview: null as Record<string, unknown> | null,
    customerPreview: null as Record<string, unknown> | null,
    validation: null as { ok?: boolean; blockers?: Array<{ code: string; message: string }> } | null,
    error: null as string | null
  };
}

export default function ConfigurationWorkspace({ token, publicationId, onAuthFailure }: Props) {
  const [state, setState] = useState(clearSensitive);
  const [roomGroups, setRoomGroups] = useState<Record<string, string>>({});
  const [optionQty, setOptionQty] = useState<Record<string, number>>({});
  const [markupPct, setMarkupPct] = useState("0");
  const [markupReason, setMarkupReason] = useState("");
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [ackFreeze, setAckFreeze] = useState(false);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef(0);

  function handleApiError(e: unknown) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      setState(clearSensitive());
      onAuthFailure();
      return;
    }
    setState((s) => ({
      ...s,
      error: e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Request failed"
    }));
  }

  useEffect(() => {
    setState(clearSensitive());
    setRoomGroups({});
    setOptionQty({});
    setMarkupPct("0");
    setMarkupReason("");
    setConfirmActivate(false);
    setAckFreeze(false);
    setBusy(false);

    if (!publicationId || !token || !configurationUiEnabled()) return;

    const seq = ++abortRef.current;
    let alive = true;
    (async () => {
      try {
        const body = (await apiGet(
          `/api/digital-estimate/configuration/publications/${publicationId}/context`,
          token
        )) as {
          context?: ConfigContext;
          envelopes?: EnvelopeRow[];
          activeEnvelopeId?: string | null;
        };
        if (!alive || seq !== abortRef.current) return;
        const ctx = body.context || null;
        const rooms = ctx?.rooms || [];
        const initial: Record<string, string> = {};
        for (const r of rooms) {
          initial[r.roomKey] = r.baselineMaterialGroup || "group_b";
        }
        setRoomGroups(initial);
        const activeId =
          body.activeEnvelopeId ||
          body.envelopes?.find((e) => e.status === "draft" || e.status === "ready")?.id ||
          null;
        setState({
          context: ctx,
          envelopes: body.envelopes || [],
          envelopeId: activeId,
          graph: null,
          internalPreview: null,
          customerPreview: null,
          validation: null,
          error: null
        });
        if (activeId) {
          const graph = (await apiGet(
            `/api/digital-estimate/configuration/envelopes/${activeId}`,
            token
          )) as { envelope?: EnvelopeRow; groups?: unknown[]; options?: unknown[] };
          if (!alive || seq !== abortRef.current) return;
          setState((s) => ({ ...s, graph, envelopeId: activeId }));
        }
      } catch (e) {
        if (!alive || seq !== abortRef.current) return;
        handleApiError(e);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on publication switch only
  }, [publicationId, token]);

  if (!configurationUiEnabled()) {
    return null;
  }

  if (!publicationId) {
    return (
      <section className="panel config-panel">
        <h2>Configuration envelope</h2>
        <p className="muted">Select an active publication to configure customer options (pilot).</p>
      </section>
    );
  }

  const ctx = state.context;
  const env = state.graph?.envelope;
  const isActive = env?.status === "active";
  const isDraft = env?.status === "draft" || env?.status === "ready";

  async function createDraft() {
    if (!publicationId) return;
    setBusy(true);
    setState((s) => ({ ...s, error: null }));
    try {
      const body = (await apiPost("/api/digital-estimate/configuration/envelopes", token, {
        publicationId
      })) as { envelope?: EnvelopeRow; groups?: unknown[]; options?: unknown[] };
      setState((s) => ({
        ...s,
        envelopeId: body.envelope?.id || null,
        graph: body,
        internalPreview: null,
        customerPreview: null,
        validation: null
      }));
      const refreshed = (await apiGet(
        `/api/digital-estimate/configuration/publications/${publicationId}/context`,
        token
      )) as { envelopes?: EnvelopeRow[] };
      setState((s) => ({ ...s, envelopes: refreshed.envelopes || s.envelopes }));
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function saveRoomMaterials() {
    if (!state.envelopeId || !ctx?.rooms || !isDraft) return;
    setBusy(true);
    try {
      const graph = state.graph;
      const matGroup = (graph?.groups as Array<{ id: string; group_key?: string }> | undefined)?.find(
        (g) => g.group_key === "material_by_room"
      );
      if (!matGroup) throw new Error("Material group missing — recreate draft");
      const options = ctx.rooms.map((r) => ({
        groupId: matGroup.id,
        optionKey: `material:${r.roomKey}:${roomGroups[r.roomKey] || r.baselineMaterialGroup}`,
        displayLabel: `${r.displayName} — ${roomGroups[r.roomKey]}`,
        description: `Allowed material for ${r.displayName}`,
        includedInBaseline: roomGroups[r.roomKey] === r.baselineMaterialGroup,
        defaultQty: 1,
        minQty: 0,
        maxQty: 1,
        requiredSelection: true,
        compatibilityJson: {
          roomKey: r.roomKey,
          materialGroup: roomGroups[r.roomKey],
          role: "material_selection"
        }
      }));
      await apiPut(`/api/digital-estimate/configuration/envelopes/${state.envelopeId}/options`, token, {
        options
      });
      const refreshed = (await apiGet(
        `/api/digital-estimate/configuration/envelopes/${state.envelopeId}`,
        token
      )) as typeof state.graph;
      setState((s) => ({ ...s, graph: refreshed }));
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function saveCatalogOptions() {
    if (!state.envelopeId || !isDraft) return;
    setBusy(true);
    try {
      let addOnsGroup = (state.graph?.groups as Array<{ id: string; group_key?: string }> | undefined)?.find(
        (g) => g.group_key === "known_addons"
      );
      if (!addOnsGroup) {
        const gRes = (await apiPut(
          `/api/digital-estimate/configuration/envelopes/${state.envelopeId}/groups`,
          token,
          {
            groups: [
              {
                groupKey: "known_addons",
                displayLabel: "Known-price add-ons",
                required: false,
                selectionMode: "multi",
                mutuallyExclusive: false
              }
            ]
          }
        )) as { groups?: Array<{ id: string; group_key?: string }> };
        addOnsGroup = gRes.groups?.[0];
      }
      if (!addOnsGroup) throw new Error("Unable to create add-on group");
      const options = (ctx?.optionCatalog || [])
        .filter((o) => o.availabilityState === "active" && !o.lockedQuantity)
        .map((o) => ({
          groupId: addOnsGroup!.id,
          optionKey: o.optionKey,
          displayLabel: o.displayLabel,
          defaultQty: optionQty[o.optionKey] || 0,
          minQty: 0,
          maxQty: 10,
          requiredSelection: false,
          availabilityState: o.availabilityState
        }));
      // Also register unresolved as unavailable for visibility
      for (const o of ctx?.optionCatalog || []) {
        if (o.availabilityState === "unavailable" || o.availabilityState === "review_required") {
          options.push({
            groupId: addOnsGroup.id,
            optionKey: o.optionKey,
            displayLabel: o.displayLabel,
            defaultQty: 0,
            minQty: 0,
            maxQty: 0,
            requiredSelection: false,
            availabilityState: o.availabilityState
          });
        }
      }
      await apiPut(`/api/digital-estimate/configuration/envelopes/${state.envelopeId}/options`, token, {
        options
      });
      const refreshed = (await apiGet(
        `/api/digital-estimate/configuration/envelopes/${state.envelopeId}`,
        token
      )) as typeof state.graph;
      setState((s) => ({ ...s, graph: refreshed }));
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function runValidate() {
    if (!state.envelopeId) return;
    setBusy(true);
    try {
      const body = (await apiPost(
        `/api/digital-estimate/configuration/envelopes/${state.envelopeId}/validate`,
        token,
        {}
      )) as { ok?: boolean; blockers?: Array<{ code: string; message: string }> };
      setState((s) => ({ ...s, validation: body }));
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (!state.envelopeId) return;
    setBusy(true);
    try {
      const body = (await apiPost(
        `/api/digital-estimate/configuration/envelopes/${state.envelopeId}/preview`,
        token,
        {
          roomSelections: roomGroups,
          optionQuantities: Object.fromEntries(
            Object.entries(optionQty).filter(([, q]) => Number(q) > 0)
          ),
          requestedMarkupPercent: Number(markupPct) || 0,
          markupReason: markupReason.trim() || undefined
        }
      )) as {
        customerSafePreview?: Record<string, unknown>;
        internalPreview?: Record<string, unknown>;
      };
      setState((s) => ({
        ...s,
        customerPreview: body.customerSafePreview || null,
        internalPreview: body.internalPreview || null
      }));
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!state.envelopeId || !confirmActivate || !ackFreeze) return;
    setBusy(true);
    try {
      const body = (await apiPost(
        `/api/digital-estimate/configuration/envelopes/${state.envelopeId}/activate`,
        token,
        {
          confirm: true,
          acknowledgeFreeze: true,
          expectedRowVersion: env?.row_version ?? env?.rowVersion
        }
      )) as { envelope?: EnvelopeRow };
      setState((s) => ({
        ...s,
        graph: { ...s.graph, envelope: body.envelope || s.graph?.envelope },
        internalPreview: null
      }));
      setConfirmActivate(false);
      setAckFreeze(false);
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  }

  async function cloneActive() {
    if (!state.envelopeId) return;
    setBusy(true);
    try {
      const body = (await apiPost(
        `/api/digital-estimate/configuration/envelopes/${state.envelopeId}/clone`,
        token,
        {}
      )) as { envelope?: EnvelopeRow };
      const newId = body.envelope?.id;
      if (!newId) throw new Error("Clone failed");
      const graph = (await apiGet(
        `/api/digital-estimate/configuration/envelopes/${newId}`,
        token
      )) as typeof state.graph;
      setState((s) => ({
        ...s,
        envelopeId: newId,
        graph,
        internalPreview: null,
        customerPreview: null,
        validation: null
      }));
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel config-panel">
      <h2>Configuration envelope (pilot)</h2>
      <p className="muted">
        Private Studio only — does not expose customer configuration. Prices and rates are resolved by the
        Brain.
      </p>
      {state.error ? <div className="error-box">{state.error}</div> : null}

      {/* A. Baseline */}
      <div className="preview-block">
        <h3>Baseline summary</h3>
        {!ctx ? (
          <p className="muted">Loading trusted context…</p>
        ) : (
          <>
            <p>
              {(ctx.project as { customerName?: string })?.customerName ||
                (ctx.project as { name?: string })?.name ||
                "Project"}{" "}
              · pub {String(ctx.publication?.id || "").slice(0, 8)}…
            </p>
            <p className="muted">
              Status: {String(ctx.publication?.status || "—")} · Valid through:{" "}
              {ctx.pricingValidThrough || "—"} · Baseline display:{" "}
              {ctx.baselineDisplayTotal != null ? `$${ctx.baselineDisplayTotal}` : "—"}
            </p>
            <p className="muted">{ctx.lockedScopeNotice}</p>
            {ctx.accountMappingNotice ? (
              <p className="warn-box">{ctx.accountMappingNotice}</p>
            ) : null}
            <ul className="event-list">
              {(ctx.rooms || []).map((r) => (
                <li key={r.roomKey}>
                  {r.displayName}: {r.chargeableCounterSf} SF · baseline{" "}
                  {r.baselineMaterialLabel || r.baselineMaterialGroup || "—"}
                </li>
              ))}
            </ul>
            {ctx.blockers?.length ? (
              <div className="error-box">
                <strong>Structural blockers</strong>
                <ul>
                  {ctx.blockers.map((b, i) => (
                    <li key={`${b.code}-${i}`}>
                      {b.code}: {b.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* B. Envelope status */}
      <div className="preview-block">
        <h3>Envelope status</h3>
        {!state.envelopeId ? (
          <p className="muted">No envelope for this publication.</p>
        ) : (
          <p>
            <strong>{env?.status || "—"}</strong> · v
            {env?.envelope_version ?? env?.envelopeVersion ?? "—"} · row{" "}
            {env?.row_version ?? env?.rowVersion ?? "—"} · updated{" "}
            {env?.updated_at || env?.updatedAt || "—"}
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            disabled={busy || !ctx?.canConfigure}
            onClick={() => void createDraft()}
          >
            Create draft envelope
          </button>
          {isActive ? (
            <button type="button" className="secondary" disabled={busy} onClick={() => void cloneActive()}>
              Clone to new draft
            </button>
          ) : null}
        </div>
        {state.envelopes.length > 1 ? (
          <ul className="event-list">
            {state.envelopes.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="linkish"
                  disabled={busy}
                  onClick={() => {
                    setState((s) => ({
                      ...s,
                      envelopeId: e.id,
                      graph: null,
                      internalPreview: null,
                      customerPreview: null
                    }));
                    void apiGet(`/api/digital-estimate/configuration/envelopes/${e.id}`, token)
                      .then((g) =>
                        setState((s) => ({
                          ...s,
                          graph: g as typeof state.graph,
                          envelopeId: e.id
                        }))
                      )
                      .catch(handleApiError);
                  }}
                >
                  {e.status} v{e.envelopeVersion ?? e.envelope_version} ({e.id.slice(0, 8)}…)
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* C. Room materials */}
      {state.envelopeId && ctx?.rooms?.length ? (
        <div className="preview-block">
          <h3>Room / material configuration</h3>
          <p className="muted">Chargeable SF is locked. Select allowed material groups only.</p>
          {ctx.rooms.map((r) => (
            <div key={r.roomKey} className="config-row">
              <label htmlFor={`mat-${r.roomKey}`}>
                {r.displayName} ({r.chargeableCounterSf} SF)
              </label>
              <select
                id={`mat-${r.roomKey}`}
                disabled={busy || !isDraft}
                value={roomGroups[r.roomKey] || r.baselineMaterialGroup || "group_b"}
                onChange={(e) => setRoomGroups((m) => ({ ...m, [r.roomKey]: e.target.value }))}
              >
                {MATERIAL_CODES.map((code) => (
                  <option key={code} value={code}>
                    {(ctx.allowedMaterialGroups || []).find((g) => g.groupCode === code)?.displayName ||
                      code}
                  </option>
                ))}
              </select>
              <input type="number" disabled readOnly value={r.chargeableCounterSf} aria-label="Locked SF" />
            </div>
          ))}
          {isDraft ? (
            <div className="actions">
              <button type="button" disabled={busy} onClick={() => void saveRoomMaterials()}>
                Save material defaults
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* D. Options */}
      {state.envelopeId && ctx?.optionCatalog ? (
        <div className="preview-block">
          <h3>Option groups</h3>
          <p className="muted">Only server-approved catalog options. No arbitrary price inputs.</p>
          <ul className="event-list">
            {ctx.optionCatalog.map((o) => {
              const unresolved =
                o.availabilityState === "unavailable" || o.availabilityState === "review_required";
              return (
                <li key={o.optionKey}>
                  {o.displayLabel}{" "}
                  <span className="muted">({o.availabilityState})</span>
                  {unresolved ? (
                    <span className="muted"> — {o.unresolvedReason || "unavailable"}</span>
                  ) : o.lockedQuantity ? (
                    <span className="muted"> — locked professional quantity</span>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={10}
                      disabled={busy || !isDraft}
                      value={optionQty[o.optionKey] ?? 0}
                      onChange={(e) =>
                        setOptionQty((q) => ({ ...q, [o.optionKey]: Number(e.target.value) || 0 }))
                      }
                      aria-label={`Qty ${o.displayLabel}`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {isDraft ? (
            <div className="actions">
              <button type="button" disabled={busy} onClick={() => void saveCatalogOptions()}>
                Save option configuration
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* E. Markup */}
      {state.envelopeId && isDraft ? (
        <div className="preview-block">
          <h3>Material markup (pilot / internal only)</h3>
          <p className="warn-box">
            Pilot-authorized only. Not generally approved production behavior. Never shown in customer
            preview.
          </p>
          <label htmlFor="markup-pct">Markup %</label>
          <input
            id="markup-pct"
            type="number"
            min={0}
            max={100}
            step={0.01}
            disabled={busy}
            value={markupPct}
            onChange={(e) => setMarkupPct(e.target.value)}
          />
          <label htmlFor="markup-reason">Reason (required when nonzero)</label>
          <input
            id="markup-reason"
            type="text"
            disabled={busy}
            value={markupReason}
            onChange={(e) => setMarkupReason(e.target.value)}
            placeholder="Internal reason"
          />
        </div>
      ) : null}

      {/* F. Previews */}
      {state.envelopeId ? (
        <div className="preview-block">
          <h3>Staff pricing preview</h3>
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => void runPreview()}>
              Run DE.2C preview
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void runValidate()}>
              Validate envelope
            </button>
          </div>
          {state.validation ? (
            <div className={state.validation.ok ? "preview-block" : "error-box"}>
              Validation: {state.validation.ok ? "ready" : "blocked"}
              <ul>
                {(state.validation.blockers || []).map((b, i) => (
                  <li key={`${b.code}-${i}`}>
                    {b.code}: {b.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="preview-split">
            <div className="internal-preview">
              <h4>Internal preview</h4>
              {!state.internalPreview ? (
                <p className="muted">Not loaded</p>
              ) : (
                <ul className="event-list">
                  <li>Baseline exact: {String(state.internalPreview.baselineExactTotal)}</li>
                  <li>Configured exact: {String(state.internalPreview.configuredExactTotal)}</li>
                  <li>Exact delta: {String(state.internalPreview.exactDelta)}</li>
                  <li>Material use tax: {String(state.internalPreview.materialUseTax)}</li>
                  <li>Spahn adj: {String(state.internalPreview.spahnAdjustment)}</li>
                  <li>Markup bps: {String(state.internalPreview.markupBps)}</li>
                  <li>Engine: {String(state.internalPreview.engineVersion)}</li>
                  <li>
                    Account mapped: {String(state.internalPreview.partnerAccountMapped)} ·{" "}
                    {String(state.internalPreview.accountMappingNotice || "")}
                  </li>
                </ul>
              )}
            </div>
            <div className="customer-preview">
              <h4>Customer-safe preview</h4>
              {!state.customerPreview ? (
                <p className="muted">Not loaded</p>
              ) : (
                <ul className="event-list">
                  <li>
                    Baseline display: $
                    {String(
                      (state.customerPreview.totals as { baselineDisplayTotal?: number })
                        ?.baselineDisplayTotal ??
                        (state.customerPreview as { baselineDisplayTotal?: number }).baselineDisplayTotal ??
                        "—"
                    )}
                  </li>
                  <li>
                    Configured display: $
                    {String(
                      (state.customerPreview.totals as { configuredDisplayTotal?: number })
                        ?.configuredDisplayTotal ??
                        (state.customerPreview as { configuredDisplayTotal?: number })
                          .configuredDisplayTotal ??
                        "—"
                    )}
                  </li>
                  <li>
                    Display delta: $
                    {String(
                      (state.customerPreview.totals as { displayDelta?: number })?.displayDelta ??
                        (state.customerPreview as { displayDelta?: number }).displayDelta ??
                        "—"
                    )}
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* H. Activation */}
      {state.envelopeId && isDraft ? (
        <div className="preview-block">
          <h3>Activation</h3>
          <p className="muted">
            Activation freezes groups, options, and policy fingerprints. Future edits require cloning. Does
            not enable public customer configuration.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmActivate}
              disabled={busy}
              onChange={(e) => setConfirmActivate(e.target.checked)}
            />{" "}
            I confirm activation of this envelope
          </label>
          <label>
            <input
              type="checkbox"
              checked={ackFreeze}
              disabled={busy}
              onChange={(e) => setAckFreeze(e.target.checked)}
            />{" "}
            I acknowledge freeze — further edits require Clone
          </label>
          <div className="actions">
            <button
              type="button"
              disabled={busy || !confirmActivate || !ackFreeze}
              onClick={() => void activate()}
            >
              Activate envelope
            </button>
          </div>
        </div>
      ) : null}

      {isActive ? (
        <div className="preview-block">
          <h3>Active envelope (locked)</h3>
          <p className="muted">
            Activated {env?.activated_at || env?.activatedAt || "—"}. Controls locked — use Clone to edit.
          </p>
        </div>
      ) : null}
    </section>
  );
}
