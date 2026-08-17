import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  decideAccountStatusReview,
  fetchAccountStatusReview
} from "../lib/accountDirectoryApi";
import type { StatusReviewItem, StatusReviewQueueResponse } from "../lib/types";

const KEEP_REASONS = [
  { id: "known_customer_awaiting_qb", label: "Known customer awaiting QB setup" },
  { id: "strategic_manual", label: "Strategic / manual account" },
  { id: "historical_customer", label: "Historical customer identity" },
  { id: "other", label: "Other" }
];

function statusLabel(status: string): string {
  if (status === "needs_review") return "Needs Review";
  if (status === "active") return "Active";
  if (status === "prospect") return "Prospect";
  if (status === "inactive") return "Inactive";
  return status;
}

function categoryLabel(category: string): string {
  if (category === "possible_qb_match") return "Possible QB match";
  if (category === "ambiguous_qb_match") return "Ambiguous QB match";
  if (category === "established_without_qb") return "Established-customer evidence without QB identity";
  if (category === "imported_unconfirmed") return "Imported identity lacking confirmation";
  if (category === "structural_conflict") return "Structural conflict";
  if (category === "unlinked_directory_identity") return "Directory identity without accounting proof";
  return category;
}

export function StatusReviewSurface({
  sessionToken,
  canLinkQuickBooks,
  onReviewQuickBooks,
  onMessage
}: {
  sessionToken: string | null;
  canLinkQuickBooks?: boolean;
  onReviewQuickBooks: (accountId: string, displayName: string) => void;
  onMessage: (message: string) => void;
}) {
  const [queue, setQueue] = useState<StatusReviewQueueResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [proposedStatus, setProposedStatus] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [category, setCategory] = useState("");
  const [qbState, setQbState] = useState("");
  const [reviewed, setReviewed] = useState("unresolved");
  const [keepReason, setKeepReason] = useState("known_customer_awaiting_qb");
  const [note, setNote] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [page, setPage] = useState(1);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    const generation = ++loadGeneration.current;
    setBusy(true);
    setError(null);
    try {
      const data = await fetchAccountStatusReview(sessionToken, {
        search,
        proposedStatus,
        currentStatus,
        category,
        qbState,
        reviewed,
        page,
        pageSize: 50
      });
      if (generation !== loadGeneration.current) return;
      setQueue(data);
    } catch (e: unknown) {
      if (generation !== loadGeneration.current) return;
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      if (generation === loadGeneration.current) setBusy(false);
    }
  }, [sessionToken, search, proposedStatus, currentStatus, category, qbState, reviewed, page]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, proposedStatus, currentStatus, category, qbState, reviewed]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => queue?.items.find((row) => row.accountId === selectedId) || queue?.items[0] || null,
    [queue, selectedId]
  );

  async function decide(decision: "accept_recommendation" | "keep_current" | "mark_needs_review") {
    if (!sessionToken || !selected) return;
    setActionBusy(true);
    setError(null);
    try {
      await decideAccountStatusReview(sessionToken, selected.accountId, {
        decision,
        rowVersion: selected.rowVersion,
        evidenceFingerprint: selected.evidenceFingerprint,
        keepReason: decision === "keep_current" ? keepReason : undefined,
        note: note.trim() || undefined
      });
      onMessage("Review saved.");
      setNote("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  const counts = queue?.counts;
  const isProspectRec = selected?.currentStatus === "active" && selected?.recommendedStatus === "prospect";

  return (
    <section className="status-review" aria-label="Status review queue">
      <header className="status-review-head">
        <div>
          <h2>Status Review</h2>
          <p className="muted">
            Admin governance queue for lifecycle reconciliation. This is separate from the{" "}
            <strong>Needs review status</strong> tab, which lists accounts whose lifecycle status is already{" "}
            <code>needs_review</code>.
          </p>
        </div>
        <div className="status-review-counts" aria-label="Status review counts">
          <span title="Unresolved governance or reconciliation decisions">
            Governance decisions <strong>{counts?.needsDecision ?? "—"}</strong>
          </span>
          <span title="Queue items recommending needs_review lifecycle status">
            Recommend needs review <strong>{counts?.needsReview ?? "—"}</strong>
          </span>
          <span>
            Prospect recommendations <strong>{counts?.prospectRecommendations ?? "—"}</strong>
          </span>
          <span>
            Reviewed <strong>{counts?.reviewed ?? "—"}</strong>
          </span>
        </div>
      </header>

      <div className="status-review-filters">
        <label>
          Search
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Account name" />
        </label>
        <label>
          Recommended
          <select value={proposedStatus} onChange={(e) => setProposedStatus(e.target.value)}>
            <option value="">All</option>
            <option value="prospect">Prospect</option>
            <option value="needs_review">Needs Review</option>
          </select>
        </label>
        <label>
          Current
          <select value={currentStatus} onChange={(e) => setCurrentStatus(e.target.value)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="prospect">Prospect</option>
          </select>
        </label>
        <label>
          Reason
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            <option value="possible_qb_match">Possible QB match</option>
            <option value="ambiguous_qb_match">Ambiguous QB match</option>
            <option value="unlinked_directory_identity">No confirmed accounting identity</option>
            <option value="established_without_qb">Sold/accepted without QB</option>
            <option value="imported_unconfirmed">Imported / workbook</option>
            <option value="structural_conflict">Structural conflict</option>
          </select>
        </label>
        <label>
          QB review state
          <select value={qbState} onChange={(e) => setQbState(e.target.value)}>
            <option value="">All</option>
            <option value="not_linked">Not linked</option>
            <option value="suggested_match">Suggested match</option>
            <option value="needs_review">Needs review</option>
            <option value="conflict">Conflict</option>
          </select>
        </label>
        <label>
          Queue
          <select value={reviewed} onChange={(e) => setReviewed(e.target.value)}>
            <option value="unresolved">Unresolved</option>
            <option value="reviewed">Reviewed</option>
            <option value="">All exceptions</option>
          </select>
        </label>
      </div>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      {busy && !queue ? <p className="muted">Loading review queue…</p> : null}

      {queue && (queue.totalPages || 0) > 1 ? (
        <div className="ad-toolbar-row" aria-label="Status review pagination">
          <p className="muted">
            Page {queue.page ?? page} of {queue.totalPages} · {queue.total ?? queue.items.length} matching
          </p>
          <div className="ad-toolbar-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!queue.hasPreviousPage || busy}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!queue.hasNextPage || busy}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <div className="status-review-split">
        <div className="table-wrap">
          <table className="ad-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Current</th>
                <th>Recommended</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {(queue?.items || []).map((row) => (
                <tr
                  key={row.accountId}
                  className={selected?.accountId === row.accountId ? "is-selected" : ""}
                  onClick={() => setSelectedId(row.accountId)}
                >
                  <td>{row.displayName}</td>
                  <td>{statusLabel(row.currentStatus)}</td>
                  <td>{statusLabel(row.recommendedStatus)}</td>
                  <td>{categoryLabel(row.category)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!busy && queue && !queue.items.length ? (
            <p className="muted">No accounts in this filter.</p>
          ) : null}
        </div>

        {selected ? (
          <ReviewCard
            item={selected}
            isProspectRec={Boolean(isProspectRec)}
            keepReason={keepReason}
            note={note}
            actionBusy={actionBusy}
            canLinkQuickBooks={Boolean(canLinkQuickBooks)}
            onKeepReason={setKeepReason}
            onNote={setNote}
            onAccept={() => void decide("accept_recommendation")}
            onKeep={() => void decide("keep_current")}
            onNeedsReview={() => void decide("mark_needs_review")}
            onReviewQb={() => onReviewQuickBooks(selected.accountId, selected.displayName)}
          />
        ) : null}
      </div>
    </section>
  );
}

function ReviewCard({
  item,
  isProspectRec,
  keepReason,
  note,
  actionBusy,
  canLinkQuickBooks,
  onKeepReason,
  onNote,
  onAccept,
  onKeep,
  onNeedsReview,
  onReviewQb
}: {
  item: StatusReviewItem;
  isProspectRec: boolean;
  keepReason: string;
  note: string;
  actionBusy: boolean;
  canLinkQuickBooks: boolean;
  onKeepReason: (value: string) => void;
  onNote: (value: string) => void;
  onAccept: () => void;
  onKeep: () => void;
  onNeedsReview: () => void;
  onReviewQb: () => void;
}) {
  const acceptLabel =
    item.recommendedStatus === "prospect"
      ? "Mark Prospect"
      : item.recommendedStatus === "needs_review"
        ? "Accept Needs Review"
        : "Accept recommendation";
  const hasQbMatch = Boolean(item.qb.matchDisplayName) || item.qb.enrichmentState !== "not_linked";

  return (
    <aside className="status-review-card" aria-label={`Review ${item.displayName}`}>
      <h3>{item.displayName}</h3>
      <dl className="status-review-meta">
        <div>
          <dt>Current status</dt>
          <dd>{statusLabel(item.currentStatus)}</dd>
        </div>
        <div>
          <dt>Recommended</dt>
          <dd>{statusLabel(item.recommendedStatus)}</dd>
        </div>
      </dl>
      {isProspectRec ? (
        <p className="status-review-caution">
          No confirmed accounting/customer evidence was found. This is a recommendation, not a statement that they are
          not a customer.
        </p>
      ) : null}
      <p>
        <strong>Why</strong>
        <br />
        {item.why}
      </p>
      <p>
        <strong>Category</strong>
        <br />
        {categoryLabel(item.category)}
      </p>
      <ul>
        {(item.evidenceBullets || []).map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      {item.qb.matchDisplayName ? (
        <p>
          <strong>Possible QuickBooks match</strong>
          <br />
          {item.qb.matchDisplayName}
          {item.qb.matchExplanation ? ` — ${item.qb.matchExplanation}` : ""}
        </p>
      ) : null}
      {item.review ? (
        <p className="muted">
          Last review: {item.review.decision}
          {item.review.keepReason ? ` (${item.review.keepReason})` : ""}
          {item.review.actorUserId ? ` by ${item.review.actorUserId}` : ""}
          {item.review.at ? ` on ${item.review.at.slice(0, 10)}` : ""}
          {item.evidenceChanged ? ". New evidence requires another review." : ""}
        </p>
      ) : null}

      {isProspectRec ? (
        <label>
          Keep Active reason
          <select value={keepReason} onChange={(e) => onKeepReason(e.target.value)}>
            {KEEP_REASONS.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Note (optional)
        <textarea value={note} onChange={(e) => onNote(e.target.value)} rows={2} />
      </label>

      <div className="status-review-actions">
        {item.recommendedStatus !== "active" ? (
          <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={onAccept}>
            {acceptLabel}
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={onKeep}>
          Keep {statusLabel(item.currentStatus)}
        </button>
        {item.currentStatus !== "needs_review" ? (
          <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={onNeedsReview}>
            Mark Needs Review
          </button>
        ) : null}
        {hasQbMatch && canLinkQuickBooks ? (
          <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={onReviewQb}>
            Review QuickBooks match
          </button>
        ) : null}
      </div>
    </aside>
  );
}
