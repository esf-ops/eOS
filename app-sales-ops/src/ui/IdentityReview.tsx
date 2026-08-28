import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, ApiError } from "../lib/api";

type Access = { isOrgAdmin?: boolean };

type Person = { userId: string; salespersonLabel?: string | null };

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
  assignedUserId?: string | null;
  salespersonLabel?: string | null;
  packKeys?: string[];
  bulkEligible?: boolean;
  status: string;
  autoLinkable?: boolean;
  evidence?: string[];
  conflictReason?: string | null;
  exclusionHint?: boolean;
  linkedAccountDirectoryAccountId?: string | null;
  candidates?: Candidate[];
};

type PreviewItem = {
  reviewId: string;
  mondayAccountName: string;
  proposedDisplayName?: string | null;
  proposedAccountDirectoryAccountId: string;
  morawareIdCount: number;
  morawareIds?: string[];
  quickbooksLinked: boolean;
  branch?: string | null;
  market?: string | null;
  evidence?: string[];
  conflictWarning?: string | null;
  exclusionHint?: boolean;
};

const STATUSES = ["REVIEW_REQUIRED", "CONFLICT", "NO_CANDIDATE", "EXACT_SOURCE_ID", "EXACT_AUTO_LINKABLE"] as const;
const STARTER_PACK = "starter_handoff_v1";

function qs(params: Record<string, string>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export default function IdentityReview({ token, access }: { token: string; access: Access }) {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [status, setStatus] = useState<string>("REVIEW_REQUIRED");
  const [assignedUserId, setAssignedUserId] = useState<string>("");
  const [packKey, setPackKey] = useState<string>("");
  const [bulkEligibleOnly, setBulkEligibleOnly] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ items: PreviewItem[]; skipped: { reviewId: string; reason: string }[] } | null>(
    null
  );

  const load = useCallback(async () => {
    const data = (await apiGet(
      `/api/sales-ops/admin/identity-reviews${qs({
        status,
        assignedUserId,
        packKey,
        bulkEligible: bulkEligibleOnly ? "1" : ""
      })}`,
      token
    )) as { reviews?: ReviewRow[] };
    setReviews(data.reviews || []);
    setSelected({});
    setPreview(null);
  }, [token, status, assignedUserId, packKey, bulkEligibleOnly]);

  useEffect(() => {
    if (!access.isOrgAdmin) return;
    void apiGet("/api/sales-ops/admin/people", token)
      .then((data) => setPeople(((data as { people?: Person[] }).people || []).filter((p) => p.userId)))
      .catch(() => setPeople([]));
  }, [access.isOrgAdmin, token]);

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

  const eligibleIds = useMemo(() => reviews.filter((r) => r.bulkEligible).map((r) => r.id), [reviews]);
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);
  const allEligibleChecked = eligibleIds.length > 0 && eligibleIds.every((id) => selected[id]);

  if (!access.isOrgAdmin) return null;

  return (
    <div className="tab-page identity-review">
      <p className="kicker">Account identity review</p>
      <h2>Exact links only. Names stay candidates until a human approves.</h2>
      <p className="workspace-muted">
        Permanent identity is the Account Directory UUID. Monday, Moraware, and QuickBooks IDs are external. Filter by
        salesperson, then optionally the approved starter book. Unique 1:1 exact-name rows can be bulk-approved after a
        preview. Weak aliases and unmatched Monday items stay unresolved. Approving writes the governed Monday
        board:item external link. Unmatched items do not create directory accounts. Commission exclusions stay
        non-commissionable even after identity is linked.
      </p>
      {error && <div className="field-error">{error}</div>}
      <div className="plan-admin-actions identity-review-filters">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const data = (await apiPost("/api/sales-ops/admin/identity-reviews/rebuild", token, {})) as Record<
                string,
                unknown
              >;
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
          Salesperson
          <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}>
            <option value="">All salespeople</option>
            <option value="unmapped">Unmapped owner</option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.salespersonLabel || p.userId.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Book
          <select value={packKey} onChange={(e) => setPackKey(e.target.value)}>
            <option value="">All Monday accounts</option>
            <option value={STARTER_PACK}>Approved starter book</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={bulkEligibleOnly} onChange={(e) => setBulkEligibleOnly(e.target.checked)} />
          Exact-name 1:1 only
        </label>
        <label>
          Approval note
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required for approve/reject" />
        </label>
      </div>
      {summary && (
        <p className="workspace-muted">
          Exact source ID {String(summary.exactSourceId ?? summary.exactAutoLinkable ?? 0)}. Auto-projected{" "}
          {String(summary.autoLinked ?? 0)}. Review {String(summary.reviewRequired ?? 0)}. No candidate{" "}
          {String(summary.noCandidate ?? 0)}. Conflict {String(summary.conflict ?? 0)}. Rebuild does not create name
          links.
        </p>
      )}
      <div className="plan-admin-actions">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={allEligibleChecked}
            disabled={!eligibleIds.length}
            onChange={(e) => {
              const next: Record<string, boolean> = {};
              if (e.target.checked) for (const id of eligibleIds) next[id] = true;
              setSelected(next);
            }}
          />
          Select all exact-name 1:1 on this list ({eligibleIds.length})
        </label>
        <button
          type="button"
          disabled={busy || selectedIds.length === 0}
          onClick={() =>
            void run(async () => {
              const data = (await apiPost("/api/sales-ops/admin/identity-reviews/bulk-preview", token, {
                reviewIds: selectedIds
              })) as { items?: PreviewItem[]; skipped?: { reviewId: string; reason: string }[] };
              setPreview({ items: data.items || [], skipped: data.skipped || [] });
            })
          }
        >
          Preview selected ({selectedIds.length})
        </button>
      </div>
      {preview && (
        <div className="identity-bulk-preview" role="region" aria-label="Bulk identity preview">
          <p className="workspace-muted">
            {preview.items.length} exact 1:1 name matches ready to approve. {preview.skipped.length} skipped (weak
            alias, alias-only, conflict, or unmatched). Confirm evidence, then approve or leave unresolved. This is
            human-approved identity, not automatic linking.
          </p>
          <div className="month-goal-table">
            <div className="month-goal-head identity-preview-head" role="row">
              <span>Monday account</span>
              <span>Account Directory</span>
              <span>Moraware / QuickBooks</span>
              <span>Warning</span>
            </div>
            {preview.items.map((item) => (
              <div key={item.reviewId} className="month-goal-row identity-preview-row" role="row">
                <div>
                  <strong>{item.mondayAccountName}</strong>
                  <small>{[item.branch, item.market].filter(Boolean).join(" · ") || "No branch/market"}</small>
                </div>
                <div>
                  <strong>{item.proposedDisplayName || item.proposedAccountDirectoryAccountId.slice(0, 8)}</strong>
                </div>
                <div>
                  <small>Moraware IDs {item.morawareIdCount}</small>
                  <small>QuickBooks {item.quickbooksLinked ? "linked" : "not linked"}</small>
                </div>
                <div>
                  {item.conflictWarning && <small>{item.conflictWarning}</small>}
                  {item.exclusionHint && <small>Non-commissionable flag — identity is still separate.</small>}
                </div>
              </div>
            ))}
          </div>
          <div className="plan-admin-actions">
            <button
              type="button"
              disabled={busy || preview.items.length === 0}
              onClick={() =>
                void run(async () => {
                  await apiPost("/api/sales-ops/admin/identity-reviews/bulk", token, {
                    action: "approve",
                    reviewIds: preview.items.map((i) => i.reviewId),
                    reason: reason || "bulk_human_approved_exact_name"
                  });
                  setPreview(null);
                  await load();
                })
              }
            >
              Approve {preview.items.length} exact matches
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={() =>
                void run(async () => {
                  await apiPost("/api/sales-ops/admin/identity-reviews/bulk", token, {
                    action: "reject",
                    reviewIds: selectedIds,
                    reason: reason || "bulk_rejected"
                  });
                  setPreview(null);
                  await load();
                })
              }
            >
              Log reject selected
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={() =>
                void run(async () => {
                  await apiPost("/api/sales-ops/admin/identity-reviews/bulk", token, {
                    action: "skip",
                    reviewIds: selectedIds,
                    reason: reason || "left_unresolved"
                  });
                  setPreview(null);
                  setSelected({});
                })
              }
            >
              Leave selected unresolved
            </button>
            <button type="button" disabled={busy} onClick={() => setPreview(null)}>
              Close preview
            </button>
          </div>
        </div>
      )}
      <p className="workspace-muted">
        Showing {reviews.length} · exact-name eligible {eligibleIds.length}
      </p>
      <div className="month-goal-table" role="table" aria-label="Account identity reviews">
        <div className="month-goal-head identity-review-head" role="row">
          <span>Select</span>
          <span>Monday account</span>
          <span>Candidate</span>
          <span>Evidence</span>
          <span>Status</span>
        </div>
        {reviews.map((row) => (
          <div key={row.id} className="month-goal-row identity-review-row" role="row">
            <div>
              <input
                type="checkbox"
                checked={Boolean(selected[row.id])}
                disabled={!row.bulkEligible}
                aria-label={`Select ${row.mondayAccountName}`}
                onChange={(e) => setSelected((prev) => ({ ...prev, [row.id]: e.target.checked }))}
              />
            </div>
            <div>
              <strong>{row.mondayAccountName}</strong>
              <small>
                {row.mondayBoardId}:{row.mondayItemId}
              </small>
              <small>{row.salespersonLabel || "No salesperson mapping"}</small>
              <small>{[row.branch, row.market].filter(Boolean).join(" · ") || "No branch/market"}</small>
              {row.packKeys?.includes(STARTER_PACK) && <small>Approved starter book</small>}
              {row.exclusionHint && <small>Flagged non-commissionable in an evidence pack — identity is still separate.</small>}
            </div>
            <div>
              {(row.candidates || []).map((c) => (
                <div key={c.accountDirectoryAccountId} className="identity-candidate">
                  <strong>{c.displayName || c.accountDirectoryAccountId.slice(0, 8)}</strong>
                  <small>Moraware {c.morawareIds?.length ? c.morawareIds.join(", ") : "none"}</small>
                  <small>QuickBooks {c.quickbooksLinked ? "linked" : "not linked"}</small>
                  <small>Legacy master list {c.masterListLinked ? "linked" : "not linked"}</small>
                  {row.status !== "EXACT_SOURCE_ID" && row.status !== "EXACT_AUTO_LINKABLE" && (
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
              {row.bulkEligible && <small>Bulk-eligible exact name</small>}
            </div>
            <div>
              <span className="status-chip">{row.status}</span>
              {row.status !== "EXACT_SOURCE_ID" && row.status !== "EXACT_AUTO_LINKABLE" && (
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
      {reviews.length === 0 && <p>No reviews in this filter. Rebuild the queue after Monday sync, or clear filters.</p>}
    </div>
  );
}
