/**
 * Studio V2 Slice C — controlled AI Takeoff import panel.
 * Preview/apply only. No Takeoff iframe. No V1 orchestration imports.
 */
import React, { useState } from "react";
import { apiGet, apiPost, ApiError } from "../lib/api";
import type { StudioV2EditableScope } from "./StudioV2ScopeEditor";

export type TakeoffImportPreview = {
  ok?: boolean;
  takeoffJobId?: string | null;
  reviewStatus?: string | null;
  currentScopeEmpty?: boolean;
  replaceWarning?: string | null;
  allowedModes?: string[];
  scopeSummary?: {
    roomCount?: number;
    pieceCount?: number;
    measuredSf?: number | null;
    rooms?: Array<{ name?: string; pieceCount?: number; countertopSf?: number }>;
  };
  editableScope?: StudioV2EditableScope;
  diff?: {
    roomsToAdd?: string[];
    roomsToUpdate?: string[];
    piecesToAdd?: number;
    piecesToUpdate?: number;
  };
};

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
  onApplied: (result: {
    editableScope?: StudioV2EditableScope;
    scopeSummary?: unknown;
    revision?: number;
    status?: string;
    lastCalculation?: unknown;
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
    onApplied
  } = props;

  const [preview, setPreview] = useState<TakeoffImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [statusCode, setStatusCode] = useState<string | null>(null);

  async function runPreview() {
    if (scopeDirty) {
      setError("Save or discard unsaved scope changes before importing Takeoff.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setStatusCode(null);
    setReplaceConfirmed(false);
    try {
      const body = (await apiGet(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/takeoff-import-preview`,
        authToken
      )) as TakeoffImportPreview;
      setPreview(body);
    } catch (e) {
      setPreview(null);
      if (e instanceof ApiError) {
        const body = e.body && typeof e.body === "object" ? (e.body as { code?: string }) : null;
        setStatusCode(body?.code || null);
      }
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runApply() {
    if (scopeDirty) {
      setError("Save or discard unsaved scope changes before importing Takeoff.");
      return;
    }
    const empty = preview?.currentScopeEmpty ?? currentScopeEmpty;
    const mode = empty ? "replace_empty" : "replace_all";
    if (!empty && !replaceConfirmed) {
      setError("Confirm that you want to replace the current Working Draft scope.");
      return;
    }
    setApplyBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = (await apiPost(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/takeoff-import-apply`,
        authToken,
        {
          mode,
          confirmed: true,
          clientMutationId: `v2-takeoff-import-${Date.now()}`
        }
      )) as {
        editableScope?: StudioV2EditableScope;
        scopeSummary?: unknown;
        revision?: number;
        status?: string;
        lastCalculation?: unknown;
        warnings?: string[];
      };
      setNotice(body.warnings?.[0] || "Takeoff scope applied.");
      setPreview(null);
      setReplaceConfirmed(false);
      onApplied(body);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setApplyBusy(false);
    }
  }

  const noTakeoff = !takeoffJobId && statusCode !== "takeoff_not_ready";
  const previewEmpty = preview?.currentScopeEmpty ?? currentScopeEmpty;

  return (
    <section className="studio-v2-panel" data-testid="studio-v2-takeoff-import">
      <div className="studio-v2-panel__head">
        <div>
          <h2>AI Takeoff Import</h2>
          <p className="muted studio-v2-scope-editor__hint">
            Import approved Takeoff measurements into the Studio V2 Working Draft. Does not edit
            Takeoff geometry.
          </p>
        </div>
        <button
          type="button"
          className="eq-btn-secondary"
          disabled={busy || scopeDirty}
          onClick={() => void runPreview()}
          data-testid="studio-v2-takeoff-preview"
        >
          {busy ? "Loading…" : "Preview Takeoff Scope"}
        </button>
      </div>

      {takeoffImportNeeded ? (
        <p className="studio-v2-stale" data-testid="studio-v2-takeoff-needed">
          This Working Draft has no rooms yet. Preview and apply AI Takeoff to start scope.
        </p>
      ) : null}

      {scopeDirty ? (
        <p className="studio-v2-dirty" data-testid="studio-v2-takeoff-blocked-dirty">
          Save or discard unsaved scope changes before importing Takeoff.
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

      {!takeoffJobId && !preview && !error ? (
        <p className="muted" data-testid="studio-v2-takeoff-none">
          No AI Takeoff is linked to this case.
        </p>
      ) : null}

      {statusCode === "no_takeoff_available" || (noTakeoff && error) ? (
        <p className="muted" data-testid="studio-v2-takeoff-unavailable">
          No takeoff available for import.
        </p>
      ) : null}

      {statusCode === "takeoff_not_ready" ? (
        <p className="studio-v2-approve-required" data-testid="studio-v2-takeoff-not-ready">
          Takeoff must be reviewed and approved before importing.
        </p>
      ) : null}

      {preview ? (
        <div className="studio-v2-takeoff-preview" data-testid="studio-v2-takeoff-preview-result">
          <dl className="studio-v2-dl">
            <div>
              <dt>Mapped rooms</dt>
              <dd>{preview.scopeSummary?.roomCount ?? 0}</dd>
            </div>
            <div>
              <dt>Mapped pieces</dt>
              <dd>{preview.scopeSummary?.pieceCount ?? 0}</dd>
            </div>
            <div>
              <dt>Measured SF</dt>
              <dd>
                {preview.scopeSummary?.measuredSf != null
                  ? `${preview.scopeSummary.measuredSf.toFixed(2)} SF`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Review status</dt>
              <dd>{preview.reviewStatus || "—"}</dd>
            </div>
          </dl>

          {Array.isArray(preview.scopeSummary?.rooms) && preview.scopeSummary.rooms.length ? (
            <ul className="studio-v2-room-list">
              {preview.scopeSummary.rooms.map((r) => (
                <li key={r.name}>
                  <strong>{r.name || "Room"}</strong>
                  <span>
                    {r.pieceCount ?? 0} pieces
                    {r.countertopSf != null ? ` · ${r.countertopSf.toFixed(1)} CT SF` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {preview.replaceWarning ? (
            <p className="studio-v2-dirty" data-testid="studio-v2-takeoff-replace-warning">
              {preview.replaceWarning}
            </p>
          ) : null}

          {!previewEmpty ? (
            <label className="studio-v2-takeoff-confirm" data-testid="studio-v2-takeoff-replace-confirm">
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
            disabled={
              applyBusy || scopeDirty || (!previewEmpty && !replaceConfirmed)
            }
            onClick={() => void runApply()}
            data-testid="studio-v2-takeoff-apply"
          >
            {applyBusy
              ? "Applying…"
              : previewEmpty
                ? "Apply Takeoff to Scope"
                : "Replace Current Scope with Takeoff"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
