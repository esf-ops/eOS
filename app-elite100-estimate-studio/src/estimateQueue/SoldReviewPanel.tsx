/**
 * Staff sold-review panel for Accepted — Awaiting Sold Review estimates.
 */
import React, { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiPut } from "../lib/api";

export type SoldReviewPanelProps = {
  authToken: string | null;
  estimateId: string | null;
};

type Checklist = Record<string, boolean>;

const DEFAULT_LABELS: Record<string, string> = {
  customerAccountCorrect: "Customer / account is correct",
  projectLocationCorrect: "Project / location is correct",
  acceptedScopeCorrect: "Accepted scope is correct",
  materialOptionsCorrect: "Material and options are correct",
  customerTotalCorrect: "Customer total is correct",
  termsCorrect: "Terms are correct",
  internalNotesReviewed: "Required internal notes have been reviewed",
  noUnresolvedReviewRequest: "No unresolved Review Request remains",
  readyForOperationalHandoff: "Estimate is ready for operational handoff"
};

export default function SoldReviewPanel({ authToken, estimateId }: SoldReviewPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<any>(null);
  const [checklist, setChecklist] = useState<Checklist>({});
  const [canMarkSold, setCanMarkSold] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!authToken || !estimateId) return;
    setLoading(true);
    setError(null);
    try {
      const body = await apiGet<any>(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/sold-review`,
        authToken
      );
      setWorkspace(body);
      setChecklist(body?.soldReview?.checklist || {});
      setCanMarkSold(Boolean(body?.canMarkSold));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load sold review");
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, [authToken, estimateId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!estimateId) return null;

  async function saveChecklist() {
    if (!authToken || !estimateId) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiPut(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/sold-review`,
        authToken,
        { checklist }
      );
      setMessage("Sold review checklist saved");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save checklist");
    } finally {
      setBusy(false);
    }
  }

  async function markSold() {
    if (!authToken || !estimateId || !canMarkSold) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const body = await apiPost<any>(
        `/api/elite100-estimate-studio/estimates/${encodeURIComponent(estimateId)}/mark-sold`,
        authToken,
        { acceptanceId: workspace?.acceptance?.acceptanceId }
      );
      setMessage(body?.reused ? "Already marked sold" : "Marked sold");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to mark sold");
    } finally {
      setBusy(false);
    }
  }

  const labels = workspace?.checklistLabels || DEFAULT_LABELS;
  const lifecycle = workspace?.estimate?.lifecycleStatus;

  return (
    <section
      className="mt-4 rounded-lg border border-border bg-background p-4"
      data-testid="studio-sold-review-panel"
    >
      <h2 className="text-sm font-semibold tracking-tight">Sold review</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Accepted estimates require checklist completion before Mark Sold. Mark Sold does not email
        or write QuickBooks / Moraware.
      </p>

      {loading ? <p className="mt-2 text-xs text-muted-foreground">Loading…</p> : null}
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="mt-2 text-xs text-foreground">{message}</p> : null}

      {workspace?.acceptance ? (
        <div className="mt-3 text-xs text-muted-foreground">
          Accepted {workspace.acceptance.acceptedAt || "—"} · Total{" "}
          {workspace.acceptance.customerDisplayTotal ?? "—"} · Lifecycle {lifecycle || "—"}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No customer acceptance yet.</p>
      )}

      {workspace?.soldSnapshot ? (
        <p className="mt-3 text-sm font-medium" data-testid="studio-sold-snapshot">
          Sold {workspace.soldSnapshot.soldAt}
        </p>
      ) : null}

      {workspace?.acceptance && !workspace?.soldSnapshot ? (
        <ul className="mt-3 space-y-2">
          {Object.keys(labels).map((key) => (
            <li key={key}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checklist[key] === true}
                  onChange={(e) =>
                    setChecklist((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  data-testid={`sold-review-check-${key}`}
                />
                <span>{labels[key] || key}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {workspace?.acceptance && !workspace?.soldSnapshot ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveChecklist()}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
            data-testid="sold-review-save"
          >
            Save checklist
          </button>
        ) : null}
        {workspace?.acceptance && !workspace?.soldSnapshot ? (
          <button
            type="button"
            disabled={busy || !canMarkSold}
            onClick={() => void markSold()}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-50"
            data-testid="sold-review-mark-sold"
            title={canMarkSold ? "Mark sold" : "Privileged role required"}
          >
            Mark Sold
          </button>
        ) : null}
      </div>
    </section>
  );
}
