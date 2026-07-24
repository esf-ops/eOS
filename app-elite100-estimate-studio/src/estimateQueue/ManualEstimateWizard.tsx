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
  onCreated
}: ManualEstimateWizardProps) {
  const titleId = useId();
  const [mode, setMode] = useState<Mode>("chooser");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  // Fresh key each time the launcher opens so intentional New Estimate creates
  // are never collapsed by a prior session's Idempotency-Key. Retries within
  // one open session reuse the same key (busy guard + same key on submit).
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());

  useEffect(() => {
    if (!open) return;
    setIdemKey(newIdempotencyKey());
    setMode("chooser");
    setError(null);
    setBusy(false);
    setCustomerName("");
    setProjectName("");
    setProjectAddress("");
    setInternalNotes("");
  }, [open]);

  if (!open) return null;

  function resetAndClose() {
    setMode("chooser");
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
          projectName: projectName.trim() || undefined,
          projectAddress: projectAddress.trim() || undefined,
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
            Close
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
            className="manual-estimate-form"
            data-testid="new-estimate-manual-form"
            onSubmit={(e) => {
              e.preventDefault();
              void createManual();
            }}
          >
            <p className="muted">
              Step 1 — Customer and project. You can link Account Directory details after the draft
              opens. Creating this draft never publishes or notifies a customer.
            </p>
            <label>
              Customer name
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                data-testid="new-estimate-customer-name"
                autoComplete="organization"
              />
            </label>
            <label>
              Project name
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                data-testid="new-estimate-project-name"
              />
            </label>
            <label>
              Project / jobsite address
              <input
                value={projectAddress}
                onChange={(e) => setProjectAddress(e.target.value)}
                data-testid="new-estimate-project-address"
              />
            </label>
            <label>
              Internal notes
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={3}
                data-testid="new-estimate-notes"
              />
            </label>
            <div className="manual-estimate-form-actions">
              <button type="button" className="eq-btn-secondary" disabled={busy} onClick={() => setMode("chooser")}>
                Back
              </button>
              <button
                type="submit"
                className="eq-btn-primary"
                disabled={busy}
                data-testid="new-estimate-create"
              >
                {busy ? "Creating…" : "Create draft"}
              </button>
            </div>
          </form>
        ) : null}
      </aside>
    </div>
  );
}
