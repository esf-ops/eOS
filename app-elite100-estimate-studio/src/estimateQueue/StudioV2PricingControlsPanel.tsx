/**
 * Studio V2 Slice H — pricing basis / price group / markup controls panel.
 * Saves via PATCH /api/elite100-studio-v2/.../working-draft/pricing only.
 * Does not import V1 EstimateScopePanel or CommercialConfigurationSection.
 */
import React from "react";

export type StudioV2EditablePricing = {
  pricingBasis?: string;
  materialGroup?: string;
  materialGroupLabel?: string;
  accountAdjustment?: {
    active?: boolean;
    percentage?: number;
    reason?: string;
    source?: string;
    readOnly?: boolean;
    available?: boolean;
    spahnTrusted?: boolean;
  };
  estimateWideAdjustment?: {
    active?: boolean;
    percentage?: number;
    reason?: string;
    source?: string;
    editable?: boolean;
  };
  internalMarkupPercent?: number;
  internalMarkupEditable?: boolean;
  internalMarkupPlaceholder?: string | null;
  allowedPricingBases?: string[];
  allowedMaterialGroups?: string[];
  allowedInternalMarkupPercents?: number[];
};

const BASIS_OPTIONS = [
  { value: "wholesale", label: "Wholesale" },
  { value: "direct", label: "Direct" },
  { value: "retail", label: "Retail" }
] as const;

const GROUP_OPTIONS = [
  { value: "Group Promo", label: "Promo" },
  { value: "Group A", label: "A" },
  { value: "Group B", label: "B" },
  { value: "Group C", label: "C" },
  { value: "Group D", label: "D" },
  { value: "Group E", label: "E" },
  { value: "Group F", label: "F" },
  { value: "Remnant", label: "Remnant" }
] as const;

export function emptyEditablePricing(): StudioV2EditablePricing {
  return {
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    materialGroupLabel: "Promo",
    accountAdjustment: {
      active: false,
      percentage: 0,
      reason: "",
      source: "manual",
      readOnly: true,
      available: true
    },
    estimateWideAdjustment: {
      active: false,
      percentage: 0,
      reason: "",
      source: "manual",
      editable: true
    },
    internalMarkupPercent: 0,
    internalMarkupEditable: false,
    internalMarkupPlaceholder:
      "Internal material markup editing requires authorized estimator access.",
    allowedPricingBases: ["wholesale", "direct", "retail"],
    allowedMaterialGroups: GROUP_OPTIONS.map((g) => g.value),
    allowedInternalMarkupPercents: [0, 5, 8, 10, 12, 15, 20]
  };
}

export function cloneEditablePricing(
  pricing: StudioV2EditablePricing | null | undefined
): StudioV2EditablePricing {
  if (!pricing) return emptyEditablePricing();
  const cloned = structuredClone(pricing);
  return {
    ...emptyEditablePricing(),
    ...cloned,
    accountAdjustment: {
      ...emptyEditablePricing().accountAdjustment,
      ...(cloned.accountAdjustment || {})
    },
    estimateWideAdjustment: {
      ...emptyEditablePricing().estimateWideAdjustment,
      ...(cloned.estimateWideAdjustment || {})
    }
  };
}

type Props = {
  value: StudioV2EditablePricing;
  readOnly: boolean;
  readOnlyMessage?: string | null;
  dirty: boolean;
  saveBusy: boolean;
  saveError?: string | null;
  saveNotice?: string | null;
  onChange: (next: StudioV2EditablePricing) => void;
  onSave: () => void;
};

export default function StudioV2PricingControlsPanel(props: Props) {
  const {
    value,
    readOnly,
    readOnlyMessage,
    dirty,
    saveBusy,
    saveError,
    saveNotice,
    onChange,
    onSave
  } = props;

  const adj = value.accountAdjustment;
  const ewa = value.estimateWideAdjustment;
  const ewaEditable = !readOnly && ewa?.editable !== false;

  return (
    <section className="studio-v2-panel" data-testid="studio-v2-pricing-controls">
      <div className="studio-v2-panel__head">
        <h2>Pricing controls</h2>
        {!readOnly ? (
          <button
            type="button"
            className="eq-btn-primary"
            disabled={!dirty || saveBusy}
            onClick={onSave}
            data-testid="studio-v2-save-pricing"
          >
            {saveBusy ? "Saving…" : "Save Pricing"}
          </button>
        ) : null}
      </div>

      {readOnly ? (
        <p className="eq-muted" data-testid="studio-v2-pricing-readonly">
          {readOnlyMessage || "Pricing controls are read-only on this estimate."}
        </p>
      ) : null}

      {dirty ? (
        <p className="studio-v2-dirty" data-testid="studio-v2-pricing-dirty">
          Unsaved pricing changes — save before calculating or approving.
        </p>
      ) : null}
      {saveError ? (
        <div className="error-box" data-testid="studio-v2-pricing-save-error" role="alert">
          {saveError}
        </div>
      ) : null}
      {saveNotice ? (
        <p className="studio-v2-notice" data-testid="studio-v2-pricing-save-notice">
          {saveNotice}
        </p>
      ) : null}

      <p className="studio-v2-scope-editor__hint">
        Pricing context for the Working Draft. Backend calculator owns rates and totals — this panel
        only sets basis and price group.
      </p>

      <dl className="studio-v2-dl">
        <div>
          <dt>Pricing basis</dt>
          <dd>
            <select
              value={value.pricingBasis || "wholesale"}
              disabled={readOnly}
              onChange={(e) => onChange({ ...value, pricingBasis: e.target.value })}
              aria-label="Pricing basis"
              data-testid="studio-v2-pricing-basis"
            >
              {BASIS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </dd>
        </div>
        <div>
          <dt>Price group</dt>
          <dd>
            <select
              value={value.materialGroup || "Group Promo"}
              disabled={readOnly}
              onChange={(e) => onChange({ ...value, materialGroup: e.target.value })}
              aria-label="Price group"
              data-testid="studio-v2-price-group"
            >
              {GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </dd>
        </div>
      </dl>

      <div className="studio-v2-options-section" data-testid="studio-v2-account-pricing-note">
        <h3>Account pricing rule</h3>
        {adj?.active ? (
          <dl className="studio-v2-dl">
            <div>
              <dt>Percentage</dt>
              <dd>{adj.percentage ?? 0}%</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{adj.reason || "—"}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {adj.source === "trusted_account_rule"
                  ? "Account-derived (read-only)"
                  : adj.source || "manual"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="eq-muted">No active account pricing rule on this estimate.</p>
        )}
      </div>

      <div className="studio-v2-options-section" data-testid="studio-v2-estimate-wide-adjustment">
        <h3>Estimate-wide adjustment</h3>
        {!ewaEditable && adj?.source === "trusted_account_rule" ? (
          <p className="eq-muted">
            Account-derived adjustment is active. Manual estimate-wide override is locked.
          </p>
        ) : (
          <>
            <label className="studio-v2-approval-confirm">
              <input
                type="checkbox"
                checked={Boolean(ewa?.active)}
                disabled={!ewaEditable}
                onChange={(e) =>
                  onChange({
                    ...value,
                    estimateWideAdjustment: {
                      ...(ewa || {}),
                      active: e.target.checked,
                      source: "manual",
                      editable: true
                    }
                  })
                }
                data-testid="studio-v2-ewa-active"
              />
              <span>Apply estimate-wide percentage adjustment</span>
            </label>
            <dl className="studio-v2-dl">
              <div>
                <dt>Percentage</dt>
                <dd>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={Number(ewa?.percentage) || 0}
                    disabled={!ewaEditable || !ewa?.active}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        estimateWideAdjustment: {
                          ...(ewa || {}),
                          percentage: Number(e.target.value) || 0,
                          active: Boolean(ewa?.active),
                          source: "manual",
                          editable: true
                        }
                      })
                    }
                    aria-label="Estimate-wide adjustment percentage"
                    data-testid="studio-v2-ewa-percentage"
                  />
                </dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>
                  <input
                    type="text"
                    value={ewa?.reason || ""}
                    disabled={!ewaEditable || !ewa?.active}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        estimateWideAdjustment: {
                          ...(ewa || {}),
                          reason: e.target.value,
                          active: Boolean(ewa?.active),
                          source: "manual",
                          editable: true
                        }
                      })
                    }
                    aria-label="Estimate-wide adjustment reason"
                    data-testid="studio-v2-ewa-reason"
                  />
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>

      <div className="studio-v2-options-section" data-testid="studio-v2-internal-markup">
        <h3>Internal material markup</h3>
        {value.internalMarkupEditable ? (
          <label>
            <span className="eq-muted">Markup %</span>
            <select
              value={Number(value.internalMarkupPercent) || 0}
              disabled={readOnly}
              onChange={(e) =>
                onChange({ ...value, internalMarkupPercent: Number(e.target.value) || 0 })
              }
              aria-label="Internal material markup percent"
              data-testid="studio-v2-internal-markup-select"
            >
              {(value.allowedInternalMarkupPercents || [0, 5, 8, 10, 12, 15, 20]).map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="studio-v2-placeholder" data-testid="studio-v2-internal-markup-placeholder">
            {value.internalMarkupPlaceholder ||
              "Internal material markup editing requires authorized estimator access."}
          </p>
        )}
      </div>
    </section>
  );
}
