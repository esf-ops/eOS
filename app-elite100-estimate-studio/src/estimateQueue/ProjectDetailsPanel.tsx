/**
 * Project Details — editable project name/address on an existing Studio estimate.
 * Metadata only: never publishes, calculates, or clears pricing geometry.
 */
import React, { useEffect, useState } from "react";
import { ApiError, apiGet, apiPatch } from "../lib/api";

type Props = {
  authToken: string;
  caseId: string;
  estimateId: string | null;
  refreshKey?: number;
  /** When true, open the editor (e.g. from Digital Estimate blocker action). */
  forceEdit?: boolean;
  onForceEditConsumed?: () => void;
  onSaved?: () => void;
};

type SaveState = "idle" | "unsaved" | "saving" | "saved" | "failed";

export default function ProjectDetailsPanel({
  authToken,
  caseId,
  estimateId,
  refreshKey = 0,
  forceEdit = false,
  onForceEditConsumed,
  onSaved
}: Props) {
  const [editing, setEditing] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [estimatorNotes, setEstimatorNotes] = useState("");
  const [baseline, setBaseline] = useState({
    projectName: "",
    projectAddress: "",
    estimatorNotes: ""
  });
  const [resolvedEstimateId, setResolvedEstimateId] = useState<string | null>(estimateId);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const body = (await apiGet(
          `/api/elite100-estimate-studio/intake-cases/${encodeURIComponent(caseId)}/estimate`,
          authToken
        )) as {
          estimate?: {
            id?: string;
            scope?: {
              projectName?: string;
              projectAddress?: string;
              estimatorNotes?: string;
            };
          };
        };
        if (cancelled) return;
        const scope = body.estimate?.scope || {};
        const next = {
          projectName: String(scope.projectName || ""),
          projectAddress: String(scope.projectAddress || ""),
          estimatorNotes: String(scope.estimatorNotes || "")
        };
        setBaseline(next);
        setProjectName(next.projectName);
        setProjectAddress(next.projectAddress);
        setEstimatorNotes(next.estimatorNotes);
        setResolvedEstimateId(body.estimate?.id || estimateId);
        setSaveState("idle");
        setEditing(false);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof ApiError ? e.message : "Unable to load project details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authToken, caseId, estimateId, refreshKey]);

  useEffect(() => {
    if (forceEdit) {
      setEditing(true);
      onForceEditConsumed?.();
      window.setTimeout(() => {
        document
          .querySelector('[data-testid="project-details-panel"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        const input = document.querySelector(
          '[data-testid="project-details-name"]'
        ) as HTMLInputElement | null;
        input?.focus();
      }, 40);
    }
  }, [forceEdit, onForceEditConsumed]);

  const displayName = projectName.trim() || "Project not named";
  const dirty =
    projectName !== baseline.projectName ||
    projectAddress !== baseline.projectAddress ||
    estimatorNotes !== baseline.estimatorNotes;

  async function save() {
    const id = resolvedEstimateId;
    if (!id) {
      setMessage("Estimate is not ready yet.");
      setSaveState("failed");
      return;
    }
    setSaveState("saving");
    setMessage(null);
    try {
      const body = (await apiPatch(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(id)}/project-details`,
        authToken,
        {
          projectName,
          projectAddress,
          estimatorNotes
        }
      )) as {
        estimate?: { scope?: { projectName?: string; projectAddress?: string; estimatorNotes?: string } };
        published?: boolean;
        notified?: boolean;
      };
      if (body.published || body.notified) {
        setMessage("Unexpected delivery action — contact support.");
        setSaveState("failed");
        return;
      }
      const scope = body.estimate?.scope || {};
      const next = {
        projectName: String(scope.projectName ?? projectName),
        projectAddress: String(scope.projectAddress ?? projectAddress),
        estimatorNotes: String(scope.estimatorNotes ?? estimatorNotes)
      };
      setBaseline(next);
      setProjectName(next.projectName);
      setProjectAddress(next.projectAddress);
      setEstimatorNotes(next.estimatorNotes);
      setEditing(false);
      setSaveState("saved");
      setMessage("Project details saved.");
      onSaved?.();
    } catch (e) {
      setSaveState("failed");
      setMessage(e instanceof ApiError ? e.message : "Save failed");
    }
  }

  function cancelEdit() {
    setProjectName(baseline.projectName);
    setProjectAddress(baseline.projectAddress);
    setEstimatorNotes(baseline.estimatorNotes);
    setEditing(false);
    setSaveState("idle");
    setMessage(null);
  }

  if (loading) {
    return (
      <section className="project-details-panel" data-testid="project-details-panel">
        <p className="eq-muted">Loading project details…</p>
      </section>
    );
  }

  return (
    <section className="project-details-panel" data-testid="project-details-panel">
      <header className="project-details-header">
        <div>
          <h3>Project details</h3>
          <p className="eq-muted">
            Project name and jobsite address for this estimate. Required before publishing a Digital
            Estimate. Changing these fields does not change measured scope or pricing.
          </p>
        </div>
        <p className="project-details-save-state" data-testid="project-details-save-state">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved"
              : saveState === "failed"
                ? "Save failed"
                : editing && dirty
                  ? "Unsaved changes"
                  : "Ready"}
        </p>
      </header>

      {loadError ? (
        <p className="eq-state eq-state--error" role="alert">
          {loadError}
        </p>
      ) : null}
      {message ? (
        <p className="eq-state" role="status" data-testid="project-details-message">
          {message}
        </p>
      ) : null}

      {!editing ? (
        <div className="project-details-summary" data-testid="project-details-summary">
          <dl>
            <div>
              <dt>Project name</dt>
              <dd data-testid="project-details-display-name">{displayName}</dd>
            </div>
            <div>
              <dt>Project / jobsite address</dt>
              <dd data-testid="project-details-display-address">
                {projectAddress.trim() || "—"}
              </dd>
            </div>
            {estimatorNotes.trim() ? (
              <div>
                <dt>Internal project note</dt>
                <dd>{estimatorNotes}</dd>
              </div>
            ) : null}
          </dl>
          <button
            type="button"
            className="eq-btn-secondary"
            data-testid="project-details-edit"
            onClick={() => {
              setEditing(true);
              setMessage(null);
              setSaveState(dirty ? "unsaved" : "idle");
            }}
          >
            Edit project details
          </button>
        </div>
      ) : (
        <div className="project-details-form" data-testid="project-details-form">
          <label>
            Project name
            <input
              value={projectName}
              data-testid="project-details-name"
              placeholder="e.g. Nietert Kitchen"
              maxLength={200}
              onChange={(e) => {
                setProjectName(e.target.value);
                setSaveState("unsaved");
              }}
            />
          </label>
          <p className="eq-footnote">
            Optional while drafting. Required before publishing. Leave blank to show “Project not
            named” internally — never use Unknown or Untitled.
          </p>
          <label>
            Project / jobsite address
            <input
              value={projectAddress}
              data-testid="project-details-address"
              placeholder="Jobsite address"
              maxLength={400}
              onChange={(e) => {
                setProjectAddress(e.target.value);
                setSaveState("unsaved");
              }}
            />
          </label>
          <p className="eq-footnote">
            Separate from Account Directory account location. Linking AD does not overwrite a
            nonblank address.
          </p>
          <label>
            Internal project note
            <textarea
              value={estimatorNotes}
              data-testid="project-details-notes"
              rows={3}
              maxLength={4000}
              onChange={(e) => {
                setEstimatorNotes(e.target.value);
                setSaveState("unsaved");
              }}
            />
          </label>
          <div className="project-details-actions">
            <button
              type="button"
              className="eq-btn-primary"
              data-testid="project-details-save"
              disabled={saveState === "saving"}
              onClick={() => void save()}
            >
              Save project details
            </button>
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="project-details-cancel"
              disabled={saveState === "saving"}
              onClick={cancelEdit}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
