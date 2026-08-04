/**
 * Studio V2 — takeoff status / “Use these measurements” card.
 * Live review lives in StudioV2TakeoffReviewPanel (iframe). This panel
 * surfaces status copy and the finish CTA without V1 estimate workflow.
 */
import React, { useState } from "react";
import { apiPost, ApiError } from "../lib/api";
import type { StudioV2EditableScope } from "./StudioV2ScopeEditor";

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

type Props = {
  authToken: string;
  caseId: string;
  takeoffJobId?: string | null;
  takeoffImportNeeded?: boolean;
  scopeDirty: boolean;
  currentScopeEmpty: boolean;
  onOpenReview?: () => void;
  onApplied: (result: {
    editableScope?: StudioV2EditableScope;
    scopeSummary?: unknown;
    revision?: number;
    status?: string;
    lastCalculation?: unknown;
    message?: string;
  }) => void;
};

export default function StudioV2TakeoffImportPanel(props: Props) {
  const {
    authToken,
    caseId,
    takeoffJobId,
    takeoffImportNeeded,
    scopeDirty,
    currentScopeEmpty,
    onOpenReview,
    onApplied
  } = props;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);

  const scopeLoaded = Boolean(takeoffJobId) && !takeoffImportNeeded && !currentScopeEmpty;
  const needsReview = Boolean(takeoffJobId) && (takeoffImportNeeded || currentScopeEmpty);

  async function runUseMeasurements() {
    if (scopeDirty) {
      setError("Save or discard unsaved scope changes before loading Takeoff.");
      return;
    }
    if (!currentScopeEmpty && !replaceConfirmed) {
      setError("Confirm that you want to replace the current Working Draft scope.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = (await apiPost(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/takeoff-finish`,
        authToken,
        {
          confirmed: true,
          takeoffJobId: takeoffJobId || null,
          mode: currentScopeEmpty ? "replace_empty" : "replace_all",
          clientMutationId: `v2-use-measurements-${Date.now()}`
        }
      )) as {
        editableScope?: StudioV2EditableScope;
        scopeSummary?: unknown;
        revision?: number;
        status?: string;
        lastCalculation?: unknown;
        message?: string;
        alreadyLoaded?: boolean;
      };
      setNotice(body.message || "Takeoff scope is loaded into this draft.");
      setReplaceConfirmed(false);
      onApplied(body);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="studio-v2-panel" data-testid="studio-v2-takeoff-import">
      <div className="studio-v2-panel__head">
        <div>
          <h2>Takeoff → Scope</h2>
          <p className="muted studio-v2-scope-editor__hint">
            Load approved measurements from AI Takeoff Review into this Working Draft. Does not
            calculate, approve, or publish the estimate.
          </p>
        </div>
      </div>

      {!takeoffJobId ? (
        <p className="muted" data-testid="studio-v2-takeoff-none">
          No takeoff has been started for this case.
        </p>
      ) : null}

      {needsReview && !scopeLoaded ? (
        <p className="muted" data-testid="studio-v2-takeoff-needs-review">
          Review measurements before using them in Studio V2.
        </p>
      ) : null}

      {scopeLoaded ? (
        <p className="studio-v2-notice" data-testid="studio-v2-takeoff-loaded-status">
          Takeoff scope is loaded into this draft.
        </p>
      ) : null}

      {takeoffJobId && !scopeLoaded && !needsReview ? (
        <p className="studio-v2-stale" data-testid="studio-v2-takeoff-approved-ready">
          Approved takeoff ready to load into scope.
        </p>
      ) : null}

      {scopeDirty ? (
        <p className="studio-v2-dirty" data-testid="studio-v2-takeoff-blocked-dirty">
          Save or discard unsaved scope changes before loading Takeoff.
        </p>
      ) : null}

      {error ? (
        <div className="error-box" data-testid="studio-v2-takeoff-error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="studio-v2-notice" data-testid="studio-v2-takeoff-notice">
          {notice}
        </p>
      ) : null}

      <div className="eq-action-row studio-v2-empty__actions">
        {takeoffJobId && onOpenReview ? (
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="studio-v2-open-takeoff-review-panel"
            onClick={onOpenReview}
          >
            Open Takeoff Review
          </button>
        ) : null}

        {takeoffJobId && !scopeLoaded ? (
          <>
            {!currentScopeEmpty ? (
              <label
                className="studio-v2-takeoff-confirm"
                data-testid="studio-v2-takeoff-replace-confirm"
              >
                <input
                  type="checkbox"
                  checked={replaceConfirmed}
                  onChange={(e) => setReplaceConfirmed(e.target.checked)}
                />
                <span>I understand this will replace the current Working Draft scope.</span>
              </label>
            ) : null}
            <button
              type="button"
              className="eq-btn-primary"
              disabled={busy || scopeDirty || (!currentScopeEmpty && !replaceConfirmed)}
              onClick={() => void runUseMeasurements()}
              data-testid="studio-v2-takeoff-apply"
            >
              {busy ? "Loading…" : "Use these measurements"}
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
