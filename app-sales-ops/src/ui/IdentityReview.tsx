import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, ApiError } from "../lib/api";

type Access = { isOrgAdmin?: boolean };

type Candidate = {
  accountDirectoryAccountId: string;
  displayName?: string | null;
  evidence?: string[];
  morawareIds?: string[];
  quickbooksLinked?: boolean;
  masterListLinked?: boolean;
  hintStrength?: string | null;
};

type ReviewRow = {
  id: string;
  mondayAccountName: string;
  mondayBoardId: string;
  mondayItemId: string;
  mondayUrl?: string | null;
  branch?: string | null;
  market?: string | null;
  status: string;
  autoLinkable?: boolean;
  evidence?: string[];
  conflictReason?: string | null;
  exclusionHint?: boolean;
  linkedAccountDirectoryAccountId?: string | null;
  candidates?: Candidate[];
};

const STATUSES = ["REVIEW_REQUIRED", "CONFLICT", "NO_CANDIDATE", "EXACT_AUTO_LINKABLE"] as const;

export default function IdentityReview({ token, access }: { token: string; access: Access }) {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [status, setStatus] = useState<string>("REVIEW_REQUIRED");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const data = (await apiGet(
      `/api/sales-ops/admin/identity-reviews${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      token
    )) as { reviews?: ReviewRow[] };
    setReviews(data.reviews || []);
  }, [token, status]);

  useEffect(() => {
    if (!access.isOrgAdmin) return;
    void load().catch((e) => setError(e instanceof ApiError ? e.message : "Could not load identity reviews."));
  }, [access.isOrgAdmin, load]);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Identity review request failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    const c = { REVIEW_REQUIRED: 0, CONFLICT: 0, NO_CANDIDATE: 0, EXACT_AUTO_LINKABLE: 0 };
    for (const row of reviews) {
      if (row.status in c) c[row.status as keyof typeof c] += 1;
    }
    return c;
  }, [reviews]);

  if (!access.isOrgAdmin) return null;

  return (
    <div className="tab-page identity-review">
      <p className="kicker">Account identity review</p>
      <h2>Exact links only. Names stay candidates.</h2>
      <p className="workspace-muted">
        Permanent identity is the Account Directory UUID. Monday, Moraware, and QuickBooks IDs are external.
        Name, alias, and starter-pack hints never auto-link. Approving a candidate writes the governed
        Monday board:item external link. Unmatched Monday items do not create directory accounts.
      </p>
      {error && <div className="field-error">{error}</div>}
      <div className="plan-admin-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const data = (await apiPost("/api/sales-ops/admin/identity-reviews/rebuild", token, {})) as Record<string, unknown>;
              setSummary(data);
              await load();
            })
          }
        >
          Rebuild review queue
        </button>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Approval note
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required for approve/reject" />
        </label>
      </div>
      {summary && (
        <p className="workspace-muted">
          Auto-linked {String(summary.autoLinked ?? 0)} exact matches. Review {String(summary.reviewRequired ?? 0)}. No
          candidate {String(summary.noCandidate ?? 0)}. Conflict {String(summary.conflict ?? 0)}. Deterministic source
          bridge: {summary.deterministicBridge ? "yes" : "no"}.
        </p>
      )}
      <p className="workspace-muted">
        Showing {reviews.length} · exact {counts.EXACT_AUTO_LINKABLE} · review {counts.REVIEW_REQUIRED} · none{" "}
        {counts.NO_CANDIDATE} · conflict {counts.CONFLICT}
      </p>
      <div className="month-goal-table" role="table" aria-label="Account identity reviews">
        <div className="month-goal-head identity-review-head" role="row">
          <span>Monday account</span>
          <span>Candidate</span>
          <span>Evidence</span>
          <span>Status</span>
        </div>
        {reviews.map((row) => (
          <div key={row.id} className="month-goal-row identity-review-row" role="row">
            <div>
              <strong>{row.mondayAccountName}</strong>
              <small>
                {row.mondayBoardId}:{row.mondayItemId}
              </small>
              <small>
                {[row.branch, row.market].filter(Boolean).join(" · ") || "No branch/market"}
              </small>
              {row.exclusionHint && <small>Flagged non-commissionable in an evidence pack — identity is still separate.</small>}
            </div>
            <div>
              {(row.candidates || []).map((c) => (
                <div key={c.accountDirectoryAccountId} className="identity-candidate">
                  <strong>{c.displayName || c.accountDirectoryAccountId.slice(0, 8)}</strong>
                  <small>Moraware {c.morawareIds?.length ? c.morawareIds.join(", ") : "none"}</small>
                  <small>QuickBooks {c.quickbooksLinked ? "linked" : "not linked"}</small>
                  <small>Legacy master list {c.masterListLinked ? "linked" : "not linked"}</small>
                  {row.status !== "EXACT_AUTO_LINKABLE" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await apiPost(`/api/sales-ops/admin/identity-reviews/${row.id}/approve`, token, {
                            accountDirectoryAccountId: c.accountDirectoryAccountId,
                            reason: reason || "approved shown candidate"
                          });
                          await load();
                        })
                      }
                    >
                      Approve this account
                    </button>
                  )}
                </div>
              ))}
              {(row.candidates || []).length === 0 && <small>No Account Directory candidate.</small>}
            </div>
            <div>
              <small>{(row.evidence || []).join(", ") || "none"}</small>
              {row.conflictReason && <small>{row.conflictReason}</small>}
            </div>
            <div>
              <span className="status-chip">{row.status}</span>
              {row.status !== "EXACT_AUTO_LINKABLE" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await apiPost(`/api/sales-ops/admin/identity-reviews/${row.id}/reject`, token, {
                        reason: reason || "rejected"
                      });
                      await load();
                    })
                  }
                >
                  Log reject
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {reviews.length === 0 && <p>No reviews in this status. Rebuild the queue after Monday sync.</p>}
    </div>
  );
}
