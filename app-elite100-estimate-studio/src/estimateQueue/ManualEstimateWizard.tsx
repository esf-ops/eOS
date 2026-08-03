/**
 * New Estimate launcher + Start without plans wizard.
 * Creates a manual intake case + Studio estimate via authorized API only.
 */
import React, { useEffect, useId, useState } from "react";
import { ApiError, apiPost } from "../lib/api";

export type ManualEstimateWizardProps = {
  authToken: string;
  open: boolean;
  onClose: () => void;
  onCreated: (result: { intakeCaseId: string; estimateId: string; openTarget?: string }) => void;
  /**
   * Skip the "Start without plans / Start from plans" chooser and open
   * straight into the manual-create form. Used by the primary header
   * "+ New Estimate" action, which must be a single focused form (Customer
   * name, Email, Phone, Project name, Jobsite address, Pricing basis) with
   * only Cancel / Create Estimate — never a multi-step wizard. The Command
   * Center's legacy "New Estimate" launcher keeps the chooser by omitting
   * this prop.
   */
  skipChooser?: boolean;
};

type Mode = "chooser" | "manual" | "plans";

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ManualEstimateWizard({
  authToken,
  open,
  onClose,
  onCreated,
  skipChooser = false
}: ManualEstimateWizardProps) {
  const titleId = useId();
  const [mode, setMode] = useState<Mode>(skipChooser ? "manual" : "chooser");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [pricingBasis, setPricingBasis] = useState<"wholesale" | "direct">("wholesale");
  const [internalNotes, setInternalNotes] = useState("");
  // Fresh key each time the launcher opens so intentional New Estimate creates
  // are never collapsed by a prior session's Idempotency-Key. Retries within
  // one open session reuse the same key (busy guard + same key on submit).
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());

  useEffect(() => {
    if (!open) return;
    setIdemKey(newIdempotencyKey());
    setMode(skipChooser ? "manual" : "chooser");
    setError(null);
    setBusy(false);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setProjectName("");
    setProjectAddress("");
    setPricingBasis("wholesale");
    setInternalNotes("");
    // skipChooser is fixed per mount site (StudioApp vs. Command Center) —
    // intentionally excluded so this only re-runs on open/close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function resetAndClose() {
    setMode(skipChooser ? "manual" : "chooser");
    setError(null);
    setBusy(false);
    onClose();
  }

  async function createManual() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = (await apiPost(
        "/api/elite100-estimate-studio/manual-estimates",
        authToken,
        {
          idempotencyKey: idemKey,
          customerName: customerName.trim() || undefined,
          customerEmail: customerEmail.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          projectName: projectName.trim() || undefined,
          projectAddress: projectAddress.trim() || undefined,
          pricingBasis,
          internalNotes: internalNotes.trim() || undefined
        },
        { headers: { "Idempotency-Key": idemKey } }
      )) as {
        intakeCaseId?: string;
        estimateId?: string;
        openTarget?: string;
      };
      if (!body.intakeCaseId || !body.estimateId) {
        throw new Error("Manual estimate create did not return ids");
      }
      onCreated({
        intakeCaseId: body.intakeCaseId,
        estimateId: body.estimateId,
        openTarget: body.openTarget || "manual-scope"
      });
      resetAndClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="eq-drawer-backdrop"
      role="presentation"
      data-testid="new-estimate-launcher"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) resetAndClose();
      }}
    >
      <aside
        className="eq-drawer ecc-drawer manual-estimate-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="eq-drawer-header">
          <h2 id={titleId}>New Estimate</h2>
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="new-estimate-close"
            disabled={busy}
            onClick={resetAndClose}
          >
            Cancel
          </button>
        </header>

        {error ? (
          <p className="error-box" role="alert" data-testid="new-estimate-error">
            {error}
          </p>
        ) : null}

        {mode === "chooser" ? (
          <div className="manual-estimate-chooser" data-testid="new-estimate-chooser">
            <p className="muted">
              Create a draft estimate. Nothing is published or emailed until you take an explicit
              later action.
            </p>
            <button
              type="button"
              className="eq-btn-primary"
              data-testid="new-estimate-start-without-plans"
              onClick={() => setMode("manual")}
            >
              Start without plans
            </button>
            <p className="muted">Build rooms and pieces manually — no email or AI Takeoff required.</p>
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="new-estimate-start-from-plans"
              onClick={() => setMode("plans")}
            >
              Start from plans
            </button>
            <p className="muted">
              Use the existing quotes@ mailbox Sync inbox path. This does not upload plans from this
              dialog.
            </p>
          </div>
        ) : null}

        {mode === "plans" ? (
          <div data-testid="new-estimate-plans-help">
            <p>
              Plan-based estimates still start from an inbound email with a PDF plan via{" "}
              <strong>Sync inbox</strong> on the Command Center. There is no separate staff plan
              upload in this release.
            </p>
            <button type="button" className="eq-btn-secondary" onClick={() => setMode("chooser")}>
              Back
            </button>
          </div>
        ) : null}

        {mode === "manual" ? (
          <form
            className="manual-estimate-form e100-new-estimate-form"
            data-testid="new-estimate-manual-form"
            onSubmit={(e) => {
              e.preventDefault();
              void createManual();
            }}
          >
            <p className="muted e100-new-estimate-lead">
              Customer name and project name are enough to start — everything below stays editable
              after the estimate opens. Creating this estimate never publishes or notifies a customer.
            </p>
            <fieldset className="e100-form-group">
              <legend>Customer</legend>
              <p className="e100-form-help muted">Who this estimate is for. Optional fields can be filled later.</p>
              <label>
                Customer name
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  data-testid="new-estimate-customer-name"
                  autoComplete="organization"
                  placeholder="Account or homeowner"
                />
              </label>
              <div className="e100-form-row">
                <label>
                  Email
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    data-testid="new-estimate-customer-email"
                    autoComplete="email"
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    data-testid="new-estimate-customer-phone"
                    autoComplete="tel"
                  />
                </label>
              </div>
            </fieldset>
            <fieldset className="e100-form-group">
              <legend>Project</legend>
              <p className="e100-form-help muted">Used on the estimate and Digital Estimate title.</p>
              <label>
                Project name
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  data-testid="new-estimate-project-name"
                  placeholder="Kitchen remodel, bath, etc."
                />
              </label>
              <label>
                Jobsite address
                <input
                  value={projectAddress}
                  onChange={(e) => setProjectAddress(e.target.value)}
                  data-testid="new-estimate-project-address"
                />
              </label>
            </fieldset>
            <fieldset className="e100-form-group">
              <legend>Pricing & notes</legend>
              <label>
                Pricing basis
                <select
                  value={pricingBasis}
                  onChange={(e) => setPricingBasis(e.target.value === "direct" ? "direct" : "wholesale")}
                  data-testid="new-estimate-pricing-basis"
                >
                  <option value="wholesale">Wholesale</option>
                  <option value="direct">Direct / Retail</option>
                </select>
              </label>
              <label>
                Internal notes
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={3}
                  data-testid="new-estimate-notes"
                  placeholder="Staff-only notes — never shown to the customer"
                />
              </label>
            </fieldset>
            <div className="manual-estimate-form-actions">
              {!skipChooser ? (
                <button type="button" className="eq-btn-secondary" disabled={busy} onClick={() => setMode("chooser")}>
                  Back
                </button>
              ) : (
                <button type="button" className="eq-btn-secondary" disabled={busy} onClick={resetAndClose}>
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="eq-btn-primary"
                disabled={busy}
                data-testid="new-estimate-create"
              >
                {busy ? "Creating…" : "Create Estimate"}
              </button>
            </div>
          </form>
        ) : null}
      </aside>
    </div>
  );
}
