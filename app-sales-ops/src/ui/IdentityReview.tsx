import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, ApiError } from "../lib/api";
import { salespersonDisplayName, UNKNOWN_SALESPERSON_LABEL } from "../lib/salespersonLabel";

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
  mondayAssignedUserId?: string | null;
  ownershipState?: string | null;
  ownershipLabel?: string | null;
  salespersonLabel?: string | null;
  salespersonDisplayName?: string | null;
  packKeys?: string[];
  bulkEligible?: boolean;
  reviewBucket?: string | null;
  matchQualityLabel?: string | null;
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
  morawareLinked?: boolean;
  quickbooksLinked: boolean;
  masterListLinked?: boolean;
  branch?: string | null;
  market?: string | null;
  ownershipLabel?: string | null;
  evidence?: string[];
  conflictWarning?: string | null;
  exclusionHint?: boolean;
};

type PreviewSummary = {
  selectedCount?: number;
  salespersonScope?: string;
  exactMatchQualifiedCount?: number;
  morawareLinkedCount?: number;
  quickbooksLinkedCount?: number;
  unassignedAccountCount?: number;
  exclusionCount?: number;
  skippedCount?: number;
};

const STARTER_PACK = "starter_handoff_v1";

const REVIEW_BUCKETS = [
  {
    id: "HIGH_CONFIDENCE",
    title: "High confidence",
    hint: "Unique 1:1 exact display-name match. Human approval is still required."
  },
  {
    id: "MANUAL_REVIEW",
    title: "Manual review",
    hint: "Alias, weak evidence, or unusual naming."
  },
  {
    id: "NO_CANDIDATE",
    title: "No candidate",
    hint: "No canonical Account Directory match."
  },
  {
    id: "CONFLICT",
    title: "Conflict",
    hint: "Multiple or contradictory candidates."
  }
] as const;

function qs(params: Record<string, string>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function evidenceLabel(code: string) {
  const map: Record<string, string> = {
    exact_display_name: "Exact unique name",
    exact_alias: "Alias",
    starter_package_weak_alias: "Weak alias",
    existing_monday_external_link: "Existing Monday link",
    exact_source_id: "Exact source ID",
    duplicate_monday_external_id: "Duplicate Monday link"
  };
  return map[code] || code.replace(/_/g, " ");
}

function linkedLabel(linked: boolean) {
  return linked ? "linked" : "not linked";
}

function proposedName(name: string | null | undefined) {
  const text = String(name || "").trim();
  return text || "Unnamed Account Directory account";
}

function ownershipText(row: ReviewRow) {
  if (row.ownershipLabel) return row.ownershipLabel;
  if (row.ownershipState === "unassigned") return "Unassigned in Monday";
  if (row.ownershipState === "unmapped") return "Monday owner not mapped to eliteOS";
  return `Owner: ${salespersonDisplayName(row.salespersonLabel, row.salespersonDisplayName) || UNKNOWN_SALESPERSON_LABEL}`;
}

function bucketFor(row: ReviewRow) {
  return row.reviewBucket || "MANUAL_REVIEW";
}

export default function IdentityReview({ token, access }: { token: string; access: Access }) {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [bucket, setBucket] = useState<string>("open");
  const [assignedUserId, setAssignedUserId] = useState<string>("");
  const [packKey, setPackKey] = useState<string>("");
  const [bulkEligibleOnly, setBulkEligibleOnly] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{
    items: PreviewItem[];
    skipped: { reviewId: string; reason: string; mondayAccountName?: string | null }[];
    summary?: PreviewSummary;
  } | null>(null);

  const load = useCallback(async () => {
    const data = (await apiGet(
      `/api/sales-ops/admin/identity-reviews${qs({
        bucket: bucket === "open" ? "" : bucket,
        assignedUserId,
        packKey,
        bulkEligible: bulkEligibleOnly ? "1" : ""
      })}`,
      token
    )) as { reviews?: ReviewRow[] };
    const rows = data.reviews || [];
    setReviews(bucket === "open" ? rows.filter((row) => bucketFor(row) !== "LINKED") : rows);
    setSelected({});
    setPreview(null);
  }, [token, bucket, assignedUserId, packKey, bulkEligibleOnly]);

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
  const grouped = useMemo(() => {
    const byBucket = new Map<string, ReviewRow[]>();
    for (const spec of REVIEW_BUCKETS) byBucket.set(spec.id, []);
    byBucket.set("LINKED", []);
    for (const row of reviews) {
      const id = bucketFor(row);
      if (!byBucket.has(id)) byBucket.set(id, []);
      byBucket.get(id)!.push(row);
    }
    return byBucket;
  }, [reviews]);

  if (!access.isOrgAdmin) return null;

  return (
    <div className="tab-page identity-review">
      <p className="kicker">Account identity review</p>
      <h2>Match Monday accounts to Account Directory names. Permanent links still need a person.</h2>
      <p className="workspace-muted">
        High-confidence exact names are still a preview-and-approve step — they are not automatic. Weak aliases never
        enter bulk approval. Unmatched Monday items do not create directory accounts. Commission exclusions stay
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
          Review bucket
          <select value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="open">Needs review (all open buckets)</option>
            {REVIEW_BUCKETS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
            <option value="LINKED">Already linked</option>
          </select>
        </label>
        <label>
          Salesperson
          <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}>
            <option value="">All salespeople</option>
            <option value="unassigned">Unassigned in Monday</option>
            <option value="unmapped">Monday owner not mapped to eliteOS</option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {salespersonDisplayName(p.salespersonLabel)}
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
              })) as {
                items?: PreviewItem[];
                skipped?: { reviewId: string; reason: string; mondayAccountName?: string | null }[];
                summary?: PreviewSummary;
              };
              setPreview({ items: data.items || [], skipped: data.skipped || [], summary: data.summary });
            })
          }
        >
          Preview selected ({selectedIds.length})
        </button>
      </div>
      {preview && (
        <div className="identity-bulk-preview" role="region" aria-label="Bulk identity preview">
          <p className="kicker">Bulk approval preview</p>
          <ul className="identity-preview-summary">
            <li>
              <strong>{preview.summary?.selectedCount ?? selectedIds.length}</strong>
              <span>selected</span>
            </li>
            <li>
              <strong>{preview.summary?.exactMatchQualifiedCount ?? preview.items.length}</strong>
              <span>exact-match qualified</span>
            </li>
            <li>
              <strong>{preview.summary?.morawareLinkedCount ?? 0}</strong>
              <span>Moraware linked</span>
            </li>
            <li>
              <strong>{preview.summary?.quickbooksLinkedCount ?? 0}</strong>
              <span>QuickBooks linked</span>
            </li>
            <li>
              <strong>{preview.summary?.unassignedAccountCount ?? 0}</strong>
              <span>unassigned in Monday</span>
            </li>
            <li>
              <strong>{preview.summary?.exclusionCount ?? preview.skipped.length}</strong>
              <span>exclusions / skipped</span>
            </li>
          </ul>
          <p className="workspace-muted">
            Salesperson scope: {preview.summary?.salespersonScope || "This selection"}. Weak aliases never enter bulk
            approval. Confirm the preview, then approve. This is human-approved identity, not automatic linking.
          </p>
          {preview.skipped.length > 0 && (
            <p className="workspace-muted">
              Exclusions:{" "}
              {preview.skipped
                .map((row) => `${row.mondayAccountName || "Item"} (${row.reason.replace(/_/g, " ")})`)
                .join("; ")}
            </p>
          )}
          <div className="month-goal-table">
            <div className="month-goal-head identity-preview-head" role="row">
              <span>Monday account</span>
              <span>Account Directory</span>
              <span>Existing evidence</span>
              <span>Warning</span>
            </div>
            {preview.items.map((item) => (
              <div key={item.reviewId} className="month-goal-row identity-preview-row" role="row">
                <div>
                  <strong>{item.mondayAccountName}</strong>
                  <small>{item.ownershipLabel || "Owner not shown"}</small>
                  <small>{[item.branch, item.market].filter(Boolean).join(" · ") || "No market/location"}</small>
                </div>
                <div>
                  <strong>{proposedName(item.proposedDisplayName)}</strong>
                </div>
                <div>
                  <small>Exact unique name</small>
                  <small>Moraware {linkedLabel(Boolean(item.morawareLinked || item.morawareIdCount))}</small>
                  <small>QuickBooks {linkedLabel(item.quickbooksLinked)}</small>
                  <small>Legacy account {linkedLabel(Boolean(item.masterListLinked))}</small>
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
      {REVIEW_BUCKETS.map((spec) => {
        if (bucket !== "open" && bucket !== spec.id) return null;
        const rows = grouped.get(spec.id) || [];
        return (
          <section key={spec.id} className="identity-review-group">
            <div className="identity-review-group-head">
              <h3>{spec.title}</h3>
              <p>{spec.hint}</p>
            </div>
            {rows.length === 0 ? (
              <p className="workspace-muted">None in this bucket.</p>
            ) : (
              <div className="month-goal-table" role="table" aria-label={`${spec.title} identity reviews`}>
                <IdentityReviewHead />
                {rows.map((row) => (
                  <IdentityReviewRow
                    key={row.id}
                    row={row}
                    selected={Boolean(selected[row.id])}
                    busy={busy}
                    onToggle={(checked) => setSelected((prev) => ({ ...prev, [row.id]: checked }))}
                    onApprove={(accountDirectoryAccountId) =>
                      void run(async () => {
                        await apiPost(`/api/sales-ops/admin/identity-reviews/${row.id}/approve`, token, {
                          accountDirectoryAccountId,
                          reason: reason || "approved shown candidate"
                        });
                        await load();
                      })
                    }
                    onReject={() =>
                      void run(async () => {
                        await apiPost(`/api/sales-ops/admin/identity-reviews/${row.id}/reject`, token, {
                          reason: reason || "rejected"
                        });
                        await load();
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
      {bucket === "LINKED" && (
        <section className="identity-review-group">
          <div className="identity-review-group-head">
            <h3>Already linked</h3>
            <p>Exact Monday board/item source IDs already associated with an Account Directory account.</p>
          </div>
          <div className="month-goal-table" role="table" aria-label="Already linked identity reviews">
            <IdentityReviewHead />
            {(grouped.get("LINKED") || []).map((row) => (
              <IdentityReviewRow
                key={row.id}
                row={row}
                selected={false}
                busy={busy}
                onToggle={() => undefined}
                onApprove={() => undefined}
                onReject={() => undefined}
              />
            ))}
          </div>
        </section>
      )}
      {reviews.length === 0 && <p>No reviews in this filter. Rebuild the queue after Monday sync, or clear filters.</p>}
    </div>
  );
}

function IdentityReviewHead() {
  return (
    <div className="month-goal-head identity-review-head" role="row">
      <span>Select</span>
      <span>Monday account</span>
      <span>Proposed Account Directory account</span>
      <span>Existing evidence</span>
      <span>Match quality</span>
    </div>
  );
}

function IdentityReviewRow({
  row,
  selected,
  busy,
  onToggle,
  onApprove,
  onReject
}: {
  row: ReviewRow;
  selected: boolean;
  busy: boolean;
  onToggle: (checked: boolean) => void;
  onApprove: (accountDirectoryAccountId: string) => void;
  onReject: () => void;
}) {
  const owner = ownershipText(row);
  const unmapped = row.ownershipState === "unmapped";
  const candidates = row.candidates || [];
  const linked = row.status === "EXACT_SOURCE_ID" || row.status === "EXACT_AUTO_LINKABLE";
  return (
    <div className="month-goal-row identity-review-row" role="row">
      <div>
        <input
          type="checkbox"
          checked={selected}
          disabled={!row.bulkEligible}
          aria-label={`Select ${row.mondayAccountName}`}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </div>
      <div className="identity-block">
        <span className="identity-block-label">Monday account</span>
        <strong>{row.mondayAccountName}</strong>
        <small className={unmapped ? "identity-unmapped-warning" : undefined}>{owner}</small>
        {unmapped && (
          <small className="identity-unmapped-warning">
            Action needed: map this Monday owner to an eliteOS salesperson before the book is visible to reps.
          </small>
        )}
        <small>{[row.branch, row.market].filter(Boolean).join(" · ") || "No market/location"}</small>
        {row.packKeys?.includes(STARTER_PACK) && <small>Approved starter book</small>}
        {row.exclusionHint && (
          <small>Flagged non-commissionable in an evidence pack — identity is still separate.</small>
        )}
      </div>
      <div className="identity-block">
        <span className="identity-block-label">Proposed Account Directory account</span>
        {candidates.map((c) => (
          <div key={c.accountDirectoryAccountId} className="identity-candidate">
            <strong>{proposedName(c.displayName)}</strong>
            {!linked && (
              <button type="button" disabled={busy} onClick={() => onApprove(c.accountDirectoryAccountId)}>
                Approve this account
              </button>
            )}
          </div>
        ))}
        {candidates.length === 0 && <small>No Account Directory candidate.</small>}
      </div>
      <div className="identity-block">
        <span className="identity-block-label">Existing evidence</span>
        <small>
          Exact unique name {(row.evidence || []).includes("exact_display_name") || row.bulkEligible ? "yes" : "no"}
        </small>
        <small>Moraware {linkedLabel(candidates.some((c) => Boolean(c.morawareIds?.length)))}</small>
        <small>QuickBooks {linkedLabel(candidates.some((c) => c.quickbooksLinked))}</small>
        <small>Legacy account {linkedLabel(candidates.some((c) => c.masterListLinked))}</small>
        {candidates.some((c) => (c.evidence || []).length) && (
          <small>
            Source identifiers:{" "}
            {[...new Set(candidates.flatMap((c) => c.evidence || []).map(evidenceLabel))].join(", ") || "none"}
          </small>
        )}
      </div>
      <div className="identity-block">
        <span className="identity-block-label">Match quality</span>
        <span className="status-chip">{row.matchQualityLabel || evidenceLabel(row.status)}</span>
        {!linked && (
          <button type="button" disabled={busy} onClick={onReject}>
            Log reject
          </button>
        )}
        <details className="identity-tech-details">
          <summary>Technical details</summary>
          <small>
            Monday {row.mondayBoardId}:{row.mondayItemId}
          </small>
          {row.mondayAssignedUserId && <small>Monday person {row.mondayAssignedUserId}</small>}
          {row.assignedUserId && <small>eliteOS user {row.assignedUserId}</small>}
          {row.linkedAccountDirectoryAccountId && (
            <small>Account Directory {row.linkedAccountDirectoryAccountId}</small>
          )}
          {candidates.map((c) => (
            <small key={c.accountDirectoryAccountId}>
              Candidate {c.accountDirectoryAccountId}
              {c.morawareIds?.length ? ` · Moraware ${c.morawareIds.join(", ")}` : ""}
            </small>
          ))}
        </details>
      </div>
    </div>
  );
}
