/**
 * Studio V2 Slice D — estimator-owned estimate options panel.
 * Saves via PATCH /api/elite100-studio-v2/.../working-draft/options only.
 * Does not import V1 CommercialConfigurationSection or other V1 orchestration.
 */
import React from "react";

export type StudioV2CustomerLine = {
  id: string;
  label: string;
  amount: number;
  kind: "charge" | "credit";
};

export type StudioV2InternalLine = {
  id: string;
  label: string;
  amount: number;
  internalReason: string;
};

export type StudioV2HiddenLine = {
  id: string;
  amount: number;
  internalReason: string;
  customerSafeLabel: string;
};

export type StudioV2EditableOptions = {
  customerLines: StudioV2CustomerLine[];
  discounts: Array<{
    id: string;
    label: string;
    amount: number;
    kind: "credit" | "discount";
  }>;
  internalLines: StudioV2InternalLine[];
  hiddenCustomerImpactingLines: StudioV2HiddenLine[];
  accountAdjustment?: {
    active?: boolean;
    percentage?: number;
    reason?: string;
    source?: string;
    amountExact?: number | null;
    readOnly?: boolean;
    available?: boolean;
  };
  waterfalls?: { available?: boolean; message?: string };
  vanityProgram?: { available?: boolean; message?: string };
};

export function emptyEditableOptions(): StudioV2EditableOptions {
  return {
    customerLines: [],
    discounts: [],
    internalLines: [],
    hiddenCustomerImpactingLines: [],
    accountAdjustment: {
      active: false,
      percentage: 0,
      reason: "",
      readOnly: true,
      available: true,
      amountExact: null
    },
    waterfalls: { available: false, message: "Not yet available in V2" },
    vanityProgram: { available: false, message: "Not yet available in V2" }
  };
}

export function cloneEditableOptions(
  options: StudioV2EditableOptions | null | undefined
): StudioV2EditableOptions {
  if (!options) return emptyEditableOptions();
  const cloned = structuredClone(options);
  return {
    ...emptyEditableOptions(),
    ...cloned,
    customerLines: Array.isArray(cloned.customerLines)
      ? cloned.customerLines.map((l) => ({
          id: String(l.id || newId("cli")),
          label: String(l.label || ""),
          amount: Number(l.amount) || 0,
          kind: l.kind === "credit" ? "credit" : "charge"
        }))
      : [],
    discounts: Array.isArray(cloned.discounts)
      ? cloned.discounts.map((l) => ({
          id: String(l.id || newId("disc")),
          label: String(l.label || ""),
          amount: Math.abs(Number(l.amount) || 0),
          kind: l.kind === "credit" ? "credit" : "discount"
        }))
      : [],
    internalLines: Array.isArray(cloned.internalLines)
      ? cloned.internalLines.map((l) => ({
          id: String(l.id || newId("int")),
          label: String(l.label || l.internalReason || ""),
          amount: Number(l.amount) || 0,
          internalReason: String(l.internalReason || l.label || "")
        }))
      : [],
    hiddenCustomerImpactingLines: Array.isArray(cloned.hiddenCustomerImpactingLines)
      ? cloned.hiddenCustomerImpactingLines.map((l) => ({
          id: String(l.id || newId("hid")),
          amount: Number(l.amount) || 0,
          internalReason: String(l.internalReason || ""),
          customerSafeLabel: String(l.customerSafeLabel || "")
        }))
      : []
  };
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseAmount(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(n));
}

type Props = {
  value: StudioV2EditableOptions;
  readOnly: boolean;
  readOnlyMessage?: string | null;
  dirty: boolean;
  saveBusy: boolean;
  saveError?: string | null;
  saveNotice?: string | null;
  onChange: (next: StudioV2EditableOptions) => void;
  onSave: () => void;
};

export default function StudioV2EstimateOptionsPanel(props: Props) {
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

  function update(next: StudioV2EditableOptions) {
    onChange(next);
  }

  function addCustomerLine(kind: "charge" | "credit") {
    update({
      ...value,
      customerLines: [
        ...value.customerLines,
        { id: newId("cli"), label: "", amount: 0, kind }
      ]
    });
  }

  function removeCustomerLine(id: string) {
    update({
      ...value,
      customerLines: value.customerLines.filter((l) => l.id !== id)
    });
  }

  function addInternalLine() {
    update({
      ...value,
      internalLines: [
        ...value.internalLines,
        { id: newId("int"), label: "", amount: 0, internalReason: "" }
      ]
    });
  }

  function removeInternalLine(id: string) {
    update({
      ...value,
      internalLines: value.internalLines.filter((l) => l.id !== id)
    });
  }

  function addHiddenLine() {
    update({
      ...value,
      hiddenCustomerImpactingLines: [
        ...value.hiddenCustomerImpactingLines,
        { id: newId("hid"), amount: 0, internalReason: "", customerSafeLabel: "" }
      ]
    });
  }

  function removeHiddenLine(id: string) {
    update({
      ...value,
      hiddenCustomerImpactingLines: value.hiddenCustomerImpactingLines.filter((l) => l.id !== id)
    });
  }

  const adj = value.accountAdjustment;

  return (
    <section className="studio-v2-panel" data-testid="studio-v2-estimate-options">
      <div className="studio-v2-panel__head">
        <h2>Estimate Options</h2>
        <button
          type="button"
          className="eq-btn-primary"
          disabled={readOnly || saveBusy || !dirty}
          onClick={onSave}
          data-testid="studio-v2-save-options"
        >
          {saveBusy ? "Saving…" : "Save Options"}
        </button>
      </div>

      {readOnly ? (
        <p className="studio-v2-notice" data-testid="studio-v2-options-readonly">
          {readOnlyMessage || "Estimate options are read-only on this estimate."}
        </p>
      ) : null}

      {dirty ? (
        <p className="studio-v2-dirty" data-testid="studio-v2-options-dirty">
          Unsaved estimate option changes
        </p>
      ) : null}
      {saveError ? (
        <p className="studio-v2-notice" data-testid="studio-v2-options-save-error" role="alert">
          {saveError}
        </p>
      ) : null}
      {saveNotice ? (
        <p className="studio-v2-stale" data-testid="studio-v2-options-save-notice">
          {saveNotice}
        </p>
      ) : null}

      <p className="studio-v2-scope-editor__hint">
        Estimator-owned commercial lines. Customer configuration stays in Digital Estimate.
        Backend calculator owns pricing math.
      </p>

      <div className="studio-v2-options-section">
        <div className="studio-v2-options-section__head">
          <h3>Customer-facing line items</h3>
          {!readOnly ? (
            <div className="studio-v2-options-actions">
              <button
                type="button"
                className="eq-btn-ghost"
                onClick={() => addCustomerLine("charge")}
                data-testid="studio-v2-add-customer-charge"
              >
                Add charge
              </button>
              <button
                type="button"
                className="eq-btn-ghost"
                onClick={() => addCustomerLine("credit")}
                data-testid="studio-v2-add-customer-credit"
              >
                Add credit
              </button>
            </div>
          ) : null}
        </div>
        {value.customerLines.length === 0 ? (
          <p className="eq-muted">No customer-facing charges or credits.</p>
        ) : (
          <div className="studio-v2-piece-table-wrap">
            <table className="studio-v2-piece-table" data-testid="studio-v2-customer-lines">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {value.customerLines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <input
                        type="text"
                        value={line.label}
                        disabled={readOnly}
                        onChange={(e) =>
                          update({
                            ...value,
                            customerLines: value.customerLines.map((l) =>
                              l.id === line.id ? { ...l, label: e.target.value } : l
                            )
                          })
                        }
                        aria-label="Customer line label"
                      />
                    </td>
                    <td>
                      <select
                        value={line.kind}
                        disabled={readOnly}
                        onChange={(e) =>
                          update({
                            ...value,
                            customerLines: value.customerLines.map((l) =>
                              l.id === line.id
                                ? {
                                    ...l,
                                    kind: e.target.value === "credit" ? "credit" : "charge"
                                  }
                                : l
                            )
                          })
                        }
                        aria-label="Customer line type"
                      >
                        <option value="charge">Charge</option>
                        <option value="credit">Credit</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={Number.isFinite(line.amount) ? line.amount : 0}
                        disabled={readOnly}
                        onChange={(e) =>
                          update({
                            ...value,
                            customerLines: value.customerLines.map((l) =>
                              l.id === line.id
                                ? { ...l, amount: parseAmount(e.target.value) }
                                : l
                            )
                          })
                        }
                        aria-label="Customer line amount"
                      />
                    </td>
                    <td>
                      {!readOnly ? (
                        <button
                          type="button"
                          className="eq-btn-ghost"
                          onClick={() => removeCustomerLine(line.id)}
                          data-testid="studio-v2-remove-customer-line"
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="studio-v2-options-section">
        <div className="studio-v2-options-section__head">
          <h3>Internal-only line items</h3>
          {!readOnly ? (
            <button
              type="button"
              className="eq-btn-ghost"
              onClick={addInternalLine}
              data-testid="studio-v2-add-internal-line"
            >
              Add internal line
            </button>
          ) : null}
        </div>
        {value.internalLines.length === 0 ? (
          <p className="eq-muted">No internal-only lines.</p>
        ) : (
          <div className="studio-v2-piece-table-wrap">
            <table className="studio-v2-piece-table" data-testid="studio-v2-internal-lines">
              <thead>
                <tr>
                  <th>Internal reason</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {value.internalLines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <input
                        type="text"
                        value={line.internalReason || line.label}
                        disabled={readOnly}
                        onChange={(e) =>
                          update({
                            ...value,
                            internalLines: value.internalLines.map((l) =>
                              l.id === line.id
                                ? {
                                    ...l,
                                    internalReason: e.target.value,
                                    label: e.target.value
                                  }
                                : l
                            )
                          })
                        }
                        aria-label="Internal reason"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={Number.isFinite(line.amount) ? line.amount : 0}
                        disabled={readOnly}
                        onChange={(e) =>
                          update({
                            ...value,
                            internalLines: value.internalLines.map((l) =>
                              l.id === line.id
                                ? { ...l, amount: parseAmount(e.target.value) }
                                : l
                            )
                          })
                        }
                        aria-label="Internal amount"
                      />
                    </td>
                    <td>
                      {!readOnly ? (
                        <button
                          type="button"
                          className="eq-btn-ghost"
                          onClick={() => removeInternalLine(line.id)}
                          data-testid="studio-v2-remove-internal-line"
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="studio-v2-options-section">
        <div className="studio-v2-options-section__head">
          <h3>Hidden customer-impacting line items</h3>
          {!readOnly ? (
            <button
              type="button"
              className="eq-btn-ghost"
              onClick={addHiddenLine}
              data-testid="studio-v2-add-hidden-line"
            >
              Add hidden line
            </button>
          ) : null}
        </div>
        {value.hiddenCustomerImpactingLines.length === 0 ? (
          <p className="eq-muted">No hidden customer-impacting lines.</p>
        ) : (
          <div className="studio-v2-piece-table-wrap">
            <table className="studio-v2-piece-table" data-testid="studio-v2-hidden-lines">
              <thead>
                <tr>
                  <th>Internal reason</th>
                  <th>Customer-safe label</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {value.hiddenCustomerImpactingLines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <input
                        type="text"
                        value={line.internalReason}
                        disabled={readOnly}
                        onChange={(e) =>
                          update({
                            ...value,
                            hiddenCustomerImpactingLines: value.hiddenCustomerImpactingLines.map(
                              (l) =>
                                l.id === line.id
                                  ? { ...l, internalReason: e.target.value }
                                  : l
                            )
                          })
                        }
                        aria-label="Hidden line internal reason"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={line.customerSafeLabel}
                        disabled={readOnly}
                        onChange={(e) =>
                          update({
                            ...value,
                            hiddenCustomerImpactingLines: value.hiddenCustomerImpactingLines.map(
                              (l) =>
                                l.id === line.id
                                  ? { ...l, customerSafeLabel: e.target.value }
                                  : l
                            )
                          })
                        }
                        aria-label="Customer-safe rollup label"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={Number.isFinite(line.amount) ? line.amount : 0}
                        disabled={readOnly}
                        onChange={(e) =>
                          update({
                            ...value,
                            hiddenCustomerImpactingLines: value.hiddenCustomerImpactingLines.map(
                              (l) =>
                                l.id === line.id
                                  ? { ...l, amount: parseAmount(e.target.value) }
                                  : l
                            )
                          })
                        }
                        aria-label="Hidden line amount"
                      />
                    </td>
                    <td>
                      {!readOnly ? (
                        <button
                          type="button"
                          className="eq-btn-ghost"
                          onClick={() => removeHiddenLine(line.id)}
                          data-testid="studio-v2-remove-hidden-line"
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="studio-v2-options-section" data-testid="studio-v2-account-adjustment">
        <h3>Account adjustment</h3>
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
              <dt>Amount</dt>
              <dd>{money(adj.amountExact)}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{adj.source || "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="eq-muted">No account adjustment applied on this estimate.</p>
        )}
        <p className="eq-muted">Read-only in Studio V2 (applied by backend account rules).</p>
      </div>

      <div className="studio-v2-options-section" data-testid="studio-v2-waterfall-placeholder">
        <h3>Island waterfalls</h3>
        <p className="eq-muted">{value.waterfalls?.message || "Not yet available in V2"}</p>
      </div>

      <div className="studio-v2-options-section" data-testid="studio-v2-vanity-placeholder">
        <h3>Vanity Program</h3>
        <p className="eq-muted">{value.vanityProgram?.message || "Not yet available in V2"}</p>
      </div>
    </section>
  );
}
