import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  createAccountFromQuickBooks,
  fetchMorawareReconciliation,
  linkMoraware,
  linkQuickBooks,
  listAccounts,
  unlinkMoraware
} from "../lib/accountDirectoryApi";
import { buildPageNumbers, formatResultRange } from "../lib/accountDirectoryWorkspace";
import type {
  AccountListItem,
  MorawareCandidate,
  MorawareReconciliationItem,
  MorawareReconciliationResponse
} from "../lib/types";

const FILTERS = [
  { id: "", label: "All" },
  { id: "review:EXISTING_AD_QB_BACKED", label: "QB-backed AD" },
  { id: "review:EXISTING_AD_QB_LINK_CANDIDATE", label: "Needs QB link" },
  { id: "review:QB_ROOT_NOT_IN_DIRECTORY", label: "QB not in AD" },
  { id: "review:EXISTING_AD_PROSPECT", label: "Prospect AD" },
  { id: "review:POSSIBLE_CANDIDATE", label: "Possible" },
  { id: "review:NO_CANDIDATE", label: "No candidate" },
  { id: "review:CONFLICT", label: "Conflicts" },
  { id: "review:INTERNAL", label: "Internal" },
  { id: "review:LINKED", label: "Linked" }
];

const PAGE_SIZE = 100;

function reviewBadge(item: MorawareReconciliationItem): { label: string; tone: string } {
  // Primary reviewState is mutually exclusive (linked wins over supporting conflict metadata).
  const state = String(item.reviewState || "");
  if (state === "LINKED" || item.currentLink?.linked) return { label: "Linked", tone: "linked" };
  if (state === "INTERNAL" || item.internalBucket) return { label: "Internal", tone: "none" };
  if (state === "CONFLICT") return { label: "Conflict", tone: "conflict" };
  if (state === "EXISTING_AD_QB_BACKED") return { label: "QB-backed AD", tone: "strong" };
  if (state === "EXISTING_AD_QB_LINK_CANDIDATE") return { label: "Needs QB link", tone: "possible" };
  if (state === "QB_ROOT_NOT_IN_DIRECTORY") return { label: "QB not in directory", tone: "possible" };
  if (state === "EXISTING_AD_PROSPECT") return { label: "Prospect AD", tone: "possible" };
  if (state === "POSSIBLE_CANDIDATE" || state === "STRONG_CANDIDATE") return { label: "Possible candidate", tone: "possible" };
  if (state === "NO_CANDIDATE" || state === "NO_DIRECTORY_CANDIDATE") return { label: "No candidate", tone: "none" };
  return { label: "Unmatched", tone: "none" };
}

function formatLocation(city?: string | null, state?: string | null): string {
  return [city, state].map((x) => String(x || "").trim()).filter(Boolean).join(", ");
}

function bestCandidate(item: MorawareReconciliationItem | null): MorawareCandidate | null {
  if (!item) return null;
  if (item.candidates?.length) return item.candidates[0];
  if (item.proposedAccountId) {
    return {
      accountId: item.proposedAccountId,
      displayName: item.proposedAccountName || "Directory account",
      confidence: undefined,
      evidence: (item.evidence || []).map((type) => ({ type, label: type.replace(/_/g, " ") })),
      confirmAllowed: Boolean(item.confirmAllowed)
    };
  }
  return null;
}

function otherCandidates(item: MorawareReconciliationItem | null, best: MorawareCandidate | null): MorawareCandidate[] {
  if (!item) return [];
  const bestId = best?.accountId;
  const fromCandidates = (item.candidates || []).filter((c) => c.accountId !== bestId);
  if (fromCandidates.length) return fromCandidates.slice(0, 2);
  return (item.alternatives || [])
    .filter((a) => a.accountId !== bestId)
    .slice(0, 2)
    .map((a) => ({
      accountId: a.accountId,
      displayName: a.accountName,
      evidence: (a.evidence || []).map((type) => ({ type, label: type.replace(/_/g, " ") })),
      confirmAllowed: false
    }));
}

export function MorawareReviewSurface({
  sessionToken,
  canLink,
  onOpenAccount,
  onMessage,
  onCreateDirectoryAccount
}: {
  sessionToken: string | null;
  canLink?: boolean;
  onOpenAccount: (accountId: string) => void;
  onMessage: (message: string) => void;
  onCreateDirectoryAccount?: (prefill: { displayName: string; morawareAccountId: string }) => void;
}) {
  const [queue, setQueue] = useState<MorawareReconciliationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [chooseFor, setChooseFor] = useState<MorawareReconciliationItem | null>(null);
  const [chooseSearch, setChooseSearch] = useState("");
  const [chooseHits, setChooseHits] = useState<AccountListItem[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    const generation = ++loadGeneration.current;
    setBusy(true);
    setError(null);
    try {
      const isReview = filter.startsWith("review:");
      const data = await fetchMorawareReconciliation(sessionToken, {
        classification: filter === "LINKED" || isReview ? "" : filter,
        linked: filter === "LINKED" ? "true" : "",
        search,
        page,
        pageSize: PAGE_SIZE,
        ...(isReview ? { reviewState: filter.slice("review:".length) } : {})
      });
      if (generation !== loadGeneration.current) return;
      setQueue(data);
      if (data.page && data.page !== page) setPage(data.page);
    } catch (e: unknown) {
      if (generation !== loadGeneration.current) return;
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      if (generation === loadGeneration.current) setBusy(false);
    }
  }, [sessionToken, filter, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = queue?.items || [];
  const selected = useMemo(() => {
    if (!items.length) return null;
    return items.find((row) => row.morawareAccountId === selectedId) || items[0] || null;
  }, [items, selectedId]);

  useEffect(() => {
    if (!selected) return;
    if (selectedId !== selected.morawareAccountId) setSelectedId(selected.morawareAccountId);
  }, [selected, selectedId]);

  const total = queue?.total || 0;
  const pageSize = queue?.pageSize || PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const rangeLabel =
    queue?.showingFrom != null
      ? `Showing ${queue.showingFrom.toLocaleString()}–${(queue.showingTo || 0).toLocaleString()} of ${total.toLocaleString()}`
      : formatResultRange(page, pageSize, total);

  function selectNextAfter(morawareAccountId: string, remaining: MorawareReconciliationItem[]) {
    const idx = items.findIndex((r) => r.morawareAccountId === morawareAccountId);
    const nextFromPage = remaining[Math.min(Math.max(idx, 0), Math.max(remaining.length - 1, 0))];
    if (nextFromPage) {
      setSelectedId(nextFromPage.morawareAccountId);
      return;
    }
    setSelectedId(null);
  }

  function applyLocalConfirm(row: MorawareReconciliationItem) {
    const remaining = items.filter((r) => r.morawareAccountId !== row.morawareAccountId);
    setQueue((prev) => {
      if (!prev) return prev;
      const summary = { ...(prev.summary || { totalMorawareAccounts: 0, alreadyLinked: 0, highConfidenceUnlinked: 0, reviewRequired: 0, unmatched: 0, conflicts: 0 }) };
      summary.alreadyLinked = (summary.alreadyLinked || 0) + 1;
      summary.unresolved = Math.max(0, (summary.unresolved ?? Math.max(0, (summary.totalMorawareAccounts || 0) - (summary.alreadyLinked || 0) + 1)) - 1);
      const state = String(row.reviewState || "");
      if (state === "EXISTING_AD_QB_BACKED" || state === "STRONG_CANDIDATE") {
        summary.existingAdQbBacked = Math.max(0, (summary.existingAdQbBacked || 0) - 1);
        summary.strongCandidates = Math.max(0, (summary.strongCandidates || 0) - 1);
      }
      if (state === "EXISTING_AD_QB_LINK_CANDIDATE") {
        summary.existingAdQbLinkCandidate = Math.max(0, (summary.existingAdQbLinkCandidate || 0) - 1);
      }
      if (state === "QB_ROOT_NOT_IN_DIRECTORY") {
        summary.qbRootNotInDirectory = Math.max(0, (summary.qbRootNotInDirectory || 0) - 1);
      }
      if (state === "EXISTING_AD_PROSPECT") {
        summary.existingAdProspect = Math.max(0, (summary.existingAdProspect || 0) - 1);
        summary.strongCandidates = Math.max(0, (summary.strongCandidates || 0) - 1);
      }
      if (state === "POSSIBLE_CANDIDATE") {
        summary.possibleCandidates = Math.max(0, (summary.possibleCandidates || 0) - 1);
      }
      if (state === "NO_CANDIDATE" || state === "NO_DIRECTORY_CANDIDATE") {
        summary.noCandidate = Math.max(0, (summary.noCandidate || 0) - 1);
        summary.noDirectoryCandidate = Math.max(0, (summary.noDirectoryCandidate || 0) - 1);
      }
      if (state === "CONFLICT") summary.conflicts = Math.max(0, (summary.conflicts || 0) - 1);
      if (state === "INTERNAL") summary.internalBuckets = Math.max(0, (summary.internalBuckets || 0) - 1);
      if (row.classification === "UNMATCHED") summary.unmatched = Math.max(0, (summary.unmatched || 0) - 1);
      if (row.classification === "REVIEW_REQUIRED") summary.reviewRequired = Math.max(0, (summary.reviewRequired || 0) - 1);
      if (row.classification === "HIGH_CONFIDENCE_CANDIDATE") {
        summary.highConfidenceUnlinked = Math.max(0, (summary.highConfidenceUnlinked || 0) - 1);
      }
      summary.unresolvedBucketSum =
        (summary.existingAdQbBacked || 0) +
        (summary.existingAdQbLinkCandidate || 0) +
        (summary.qbRootNotInDirectory || 0) +
        (summary.existingAdProspect || 0) +
        (summary.possibleCandidates || 0) +
        (summary.conflicts || 0) +
        (summary.noCandidate || 0) +
        (summary.internalBuckets || 0);
      return {
        ...prev,
        summary,
        total: Math.max(0, (prev.total || remaining.length) - 1),
        items: remaining
      };
    });
    selectNextAfter(row.morawareAccountId, remaining);
  }

  async function confirmLink(row: MorawareReconciliationItem, accountId: string) {
    if (!sessionToken || !canLink) return;
    setActionBusy(true);
    setError(null);
    try {
      await linkMoraware(sessionToken, accountId, {
        externalId: row.morawareAccountId,
        externalDisplayName: row.morawareName
      });
      onMessage(
        `Linked Moraware ${row.morawareAccountId} to the selected account. Confirm was required — nothing auto-linked.`
      );
      setChooseFor(null);
      applyLocalConfirm(row);
      void load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmQbThenStay(row: MorawareReconciliationItem, best: MorawareCandidate) {
    if (!sessionToken || !canLink || !best.accountId || !best.qbListId) return;
    setActionBusy(true);
    setError(null);
    try {
      await linkQuickBooks(sessionToken, best.accountId, {
        externalId: best.qbListId,
        externalDisplayName: best.qbDisplayName || best.displayName
      });
      onMessage(
        `QuickBooks linked to ${best.displayName}. Now confirm the Moraware connection explicitly — nothing auto-linked.`
      );
      await load();
      setSelectedId(row.morawareAccountId);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function createFromQuickBooks(row: MorawareReconciliationItem, best: MorawareCandidate) {
    if (!sessionToken || !canLink || !best.qbListId) return;
    setActionBusy(true);
    setError(null);
    try {
      const res = await createAccountFromQuickBooks(sessionToken, {
        qbListId: best.qbListId,
        displayName: best.qbDisplayName || best.displayName
      });
      if (res.incomplete) {
        setError(
          `Account created but QuickBooks link failed: ${res.linkError || "unknown error"}. Fix the QB link, then confirm Moraware.`
        );
      } else {
        onMessage(
          `QuickBooks-backed Account Directory customer created. Confirm Moraware ${row.morawareAccountId} connection next — Moraware was not auto-linked.`
        );
      }
      await load();
      setSelectedId(row.morawareAccountId);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function unlink(row: MorawareReconciliationItem) {
    if (!sessionToken || !canLink || !row.currentLink?.accountId || !row.currentLink.linkId) return;
    setActionBusy(true);
    setError(null);
    try {
      await unlinkMoraware(sessionToken, row.currentLink.accountId, row.currentLink.linkId);
      onMessage(`Unlinked Moraware ${row.morawareAccountId}.`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function runChooseSearch() {
    if (!sessionToken) return;
    const listed = await listAccounts(sessionToken, { tab: "accounts", search: chooseSearch, page: 1, pageSize: 25 });
    setChooseHits(listed.items || []);
  }

  const summary = queue?.summary;
  const best = bestCandidate(selected);
  const alts = otherCandidates(selected, best);
  const badge = selected ? reviewBadge(selected) : null;

  return (
    <div className="status-review moraware-review">
      <header className="status-review-head">
        <div>
          <p className="hero-eyebrow">Identity</p>
          <h2>Moraware links</h2>
          <p className="muted">
            Confirm one Moraware Account ID at a time. Hierarchy: existing QB-backed AD → existing AD needing QB link →
            trusted QB root (create AD just-in-time) → Prospect AD → no candidate. Exact{" "}
            <code>source_account_id</code> remains Moraware identity. No bulk confirm and no auto-link.
          </p>
        </div>
      </header>

      {summary ? (
        <div className="moraware-summary">
          <p className="muted moraware-summary-note">
            Just-in-time spine: we do not mass-import QuickBooks customers. Review counts show how unlinked Moraware
            rows map to existing AD vs QB roots not yet in Account Directory.
          </p>
          <div className="moraware-summary-groups">
            <div className="moraware-summary-group" role="group" aria-label="Moraware link status">
              <span className="moraware-summary-group-label">Link status</span>
              <ul className="status-review-counts moraware-summary-counts">
                <li>
                  <span>Moraware accounts</span>
                  <strong>{summary.totalMorawareAccounts}</strong>
                </li>
                <li>
                  <span>Already linked</span>
                  <strong>{summary.alreadyLinked}</strong>
                </li>
                <li>
                  <span>Unresolved</span>
                  <strong>{summary.unresolved ?? Math.max(0, (summary.totalMorawareAccounts || 0) - (summary.alreadyLinked || 0))}</strong>
                </li>
              </ul>
            </div>
            <div className="moraware-summary-group" role="group" aria-label="QB-first review accelerator">
              <span className="moraware-summary-group-label">Unlinked review states (exclusive)</span>
              <ul className="status-review-counts moraware-summary-counts">
                <li>
                  <span>QB-backed AD</span>
                  <strong>{summary.existingAdQbBacked ?? summary.strongCandidates ?? "—"}</strong>
                </li>
                <li>
                  <span>Needs QB link</span>
                  <strong>{summary.existingAdQbLinkCandidate ?? "—"}</strong>
                </li>
                <li>
                  <span>QB not in AD</span>
                  <strong>{summary.qbRootNotInDirectory ?? "—"}</strong>
                </li>
                <li>
                  <span>Prospect AD</span>
                  <strong>{summary.existingAdProspect ?? "—"}</strong>
                </li>
                <li>
                  <span>Possible</span>
                  <strong>{summary.possibleCandidates ?? "—"}</strong>
                </li>
                <li>
                  <span>Conflicts</span>
                  <strong>{summary.conflicts}</strong>
                </li>
                <li>
                  <span>No candidate</span>
                  <strong>{summary.noCandidate ?? summary.noDirectoryCandidate ?? "—"}</strong>
                </li>
                <li>
                  <span>Internal</span>
                  <strong>{summary.internalBuckets ?? "—"}</strong>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div className="status-review-toolbar">
        <label className="field">
          Search
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                setSearch(searchInput.trim());
              }
            }}
          />
        </label>
        <div className="filter-chips" role="group" aria-label="Queue filter">
          {FILTERS.map((item) => (
            <button
              key={item.id || "all"}
              type="button"
              className={filter === item.id ? "chip chip-active" : "chip"}
              onClick={() => {
                setPage(1);
                setFilter(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setPage(1);
            setSearch(searchInput.trim());
          }}
        >
          Apply
        </button>
      </div>

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      {busy && !queue ? <p className="muted">Loading Moraware review queue…</p> : null}

      <p className="muted" aria-live="polite">
        {rangeLabel}
      </p>

      <div className="status-review-split">
        <ul className="status-review-list" aria-label="Moraware accounts">
          {items.map((row) => {
            const rowBadge = reviewBadge(row);
            return (
              <li key={row.morawareAccountId}>
                <button
                  type="button"
                  className={
                    selected?.morawareAccountId === row.morawareAccountId
                      ? "status-review-row status-review-row-active"
                      : "status-review-row"
                  }
                  onClick={() => setSelectedId(row.morawareAccountId)}
                >
                  <strong>{row.morawareName}</strong>
                  <span className="muted">
                    Account ID {row.morawareAccountId} · {row.jobs2026 ?? row.jobCount ?? 0} jobs (2026)
                  </span>
                  <span className={`moraware-badge moraware-badge-${rowBadge.tone}`}>{rowBadge.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {selected ? (
          <section className="status-review-card moraware-review-detail" aria-label="Selected Moraware account">
            <h3>
              {selected.morawareName}{" "}
              <span className="muted">Account ID {selected.morawareAccountId}</span>
            </h3>
            <p className="muted">
              {selected.jobs2026 ?? selected.jobCount ?? 0} jobs in 2026
              {selected.earliestJobDate ? ` · ${selected.earliestJobDate}` : ""}
              {selected.latestJobDate ? ` to ${selected.latestJobDate}` : ""}
            </p>
            {badge ? <span className={`moraware-badge moraware-badge-${badge.tone}`}>{badge.label}</span> : null}

            {best && !selected.currentLink?.linked ? (
              <div className="moraware-best-candidate">
                <h4>Suggested customer</h4>
                <p className="moraware-best-name">{best.displayName}</p>
                <p className="muted">
                  {best.identityKind === "EXISTING_AD_QB_BACKED"
                    ? "Already in Account Directory · QuickBooks connected"
                    : best.identityKind === "EXISTING_AD_QB_LINK_CANDIDATE"
                      ? "Existing Account Directory account · QuickBooks connection requires confirmation"
                      : best.identityKind === "QB_ROOT_NOT_IN_DIRECTORY"
                        ? "QuickBooks customer · Not yet in Account Directory"
                        : best.identityKind === "EXISTING_AD_PROSPECT"
                          ? "Existing Prospect (not QB-backed)"
                          : badge?.label || "Candidate"}
                  {best.qbActive === false ? " · Inactive QuickBooks root" : ""}
                  {best.confidence != null ? ` · confidence ${best.confidence}` : ""}
                </p>
                {best.qbActive === false ? (
                  <p className="banner banner-warn" role="status">
                    This QuickBooks root is inactive. Linking does not reactivate QuickBooks.
                  </p>
                ) : null}
                <div className="moraware-evidence" aria-label="Match evidence">
                  <span className="moraware-evidence-label">Evidence</span>
                  <ul>
                    {(best.evidence || []).map((ev, idx) => (
                      <li key={`${ev.type}-${idx}`}>✓ {ev.label}</li>
                    ))}
                    {!best.evidence?.length ? <li className="muted">No structured evidence labels</li> : null}
                  </ul>
                </div>
                <div className="status-review-actions">
                  {(selected.confirmQbLinkAllowed || best.confirmQbLinkAllowed) &&
                  best.accountId &&
                  best.qbListId &&
                  canLink ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={actionBusy}
                      onClick={() => void confirmQbThenStay(selected, best)}
                    >
                      Confirm QuickBooks connection
                    </button>
                  ) : null}
                  {(selected.createFromQuickBooksAllowed || best.createFromQuickBooksAllowed) &&
                  best.qbListId &&
                  canLink ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={actionBusy}
                      onClick={() => void createFromQuickBooks(selected, best)}
                    >
                      Create Account from QuickBooks
                    </button>
                  ) : null}
                  {(selected.confirmAllowed || best.confirmAllowed) && best.accountId && canLink ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={actionBusy}
                      onClick={() => void confirmLink(selected, best.accountId as string)}
                    >
                      Confirm Moraware connection
                    </button>
                  ) : null}
                  {canLink && !selected.internalBucket ? (
                    <button type="button" className="btn btn-secondary" onClick={() => setChooseFor(selected)}>
                      Choose different account
                    </button>
                  ) : null}
                  {best.accountId ? (
                    <button type="button" className="btn btn-secondary" onClick={() => onOpenAccount(best.accountId as string)}>
                      View account
                    </button>
                  ) : null}
                </div>
                <p className="muted">Moraware never auto-links. Create-from-QuickBooks does not write to QuickBooks.</p>
              </div>
            ) : null}

            {!best && !selected.currentLink?.linked ? (
              <div className="moraware-best-candidate">
                <h4>No credible Account Directory or QuickBooks customer found</h4>
                <p className="muted">
                  {selected.unmatchedReason || selected.reason
                    ? `Reason: ${String(selected.unmatchedReason || selected.reason).replace(/_/g, " ")}`
                    : "No AD or trusted QB root had compelling evidence for this Moraware ID."}
                </p>
                <div className="status-review-actions">
                  {canLink ? (
                    <button type="button" className="btn btn-secondary" onClick={() => setChooseFor(selected)}>
                      Search directory manually
                    </button>
                  ) : null}
                  {onCreateDirectoryAccount && canLink ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        onCreateDirectoryAccount({
                          displayName: selected.morawareName,
                          morawareAccountId: selected.morawareAccountId
                        })
                      }
                    >
                      Create new Account
                    </button>
                  ) : null}
                </div>
                <p className="muted">
                  Creating an account does not link Moraware. After create, return here and confirm the connection
                  explicitly.
                </p>
              </div>
            ) : null}

            {alts.length ? (
              <div className="moraware-other-candidates">
                <h4>Other candidates</h4>
                <ul>
                  {alts.map((alt) => (
                    <li key={alt.accountId || alt.qbListId || alt.displayName}>
                      <div>
                        <strong>{alt.displayName}</strong>
                        <span className="muted">
                          {" "}
                          {alt.identityKind ? `${alt.identityKind.replace(/_/g, " ")} · ` : ""}
                          {(alt.evidence || []).map((e) => e.label).join(" · ") || "Alternate"}
                        </span>
                      </div>
                      {canLink && !selected.currentLink?.linked && alt.accountId && alt.confirmAllowed ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={actionBusy}
                          onClick={() => void confirmLink(selected, alt.accountId as string)}
                        >
                          Confirm Moraware
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selected.currentLink?.linked ? (
              <div className="moraware-best-candidate">
                <h4>Already linked</h4>
                <p>
                  Directory account: <strong>{selected.currentLink.accountName || selected.currentLink.accountId}</strong>
                </p>
                <div className="status-review-actions">
                  {selected.currentLink.accountId ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onOpenAccount(String(selected.currentLink?.accountId))}
                    >
                      View account
                    </button>
                  ) : null}
                  {canLink ? (
                    <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={() => void unlink(selected)}>
                      Unlink
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {selected.siblingMorawareIds?.length ? (
              <p className="muted">
                Other Moraware IDs on this directory account: {selected.siblingMorawareIds.join(", ")}. Multiple IDs on
                one AD UUID are allowed.
              </p>
            ) : null}
            {selected.internalBucket ? (
              <p className="banner banner-warn">Internal/house identity. Confirm is disabled.</p>
            ) : null}
          </section>
        ) : (
          <p className="muted">Select a Moraware account to review.</p>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="pagination moraware-review-pagination" role="navigation" aria-label="Moraware queue pages">
          <span className="pagination-info">{rangeLabel}</span>
          <div className="pagination-controls">
            {(buildPageNumbers(page, totalPages) as (number | string)[]).map((item, idx) =>
              item === "..." ? (
                <span key={`e-${idx}`} className="page-ellipsis">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={item === page ? "page-btn page-btn-active" : "page-btn"}
                  onClick={() => setPage(Number(item))}
                >
                  {item}
                </button>
              )
            )}
          </div>
        </div>
      ) : null}

      {chooseFor ? (
        <div className="modal-backdrop" role="dialog" aria-label="Choose Account Directory account">
          <div className="modal">
            <h3>Choose directory account</h3>
            <p className="muted">
              Link Moraware {chooseFor.morawareAccountId} to an existing Account Directory UUID. Search covers display
              name, aliases, and contacts. Selecting a result still requires explicit confirmation — nothing auto-links.
            </p>
            <label className="field">
              Search accounts
              <input
                value={chooseSearch}
                onChange={(e) => setChooseSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runChooseSearch();
                }}
              />
            </label>
            <button type="button" className="btn btn-secondary" onClick={() => void runChooseSearch()}>
              Search
            </button>
            <ul className="ad-card-list moraware-choose-list">
              {chooseHits.map((hit) => (
                <li key={hit.id} className="ad-person-card">
                  <div>
                    <strong>{hit.displayName || hit.name}</strong>
                    <span className="muted">
                      {[formatLocation(hit.city, hit.state), hit.primaryContact, hit.quickbooksLinked ? "QB linked" : ""]
                        .filter(Boolean)
                        .join(" · ") || "No location/contact on file"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={actionBusy}
                    onClick={() => void confirmLink(chooseFor, hit.id)}
                  >
                    Confirm link here
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-secondary" onClick={() => setChooseFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
