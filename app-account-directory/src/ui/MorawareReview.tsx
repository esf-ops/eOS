import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  createAccountFromQuickBooks,
  fetchMorawareReconciliation,
  linkMoraware,
  linkQuickBooks,
  listAccounts,
  searchQuickBooksCustomers,
  unlinkMoraware
} from "../lib/accountDirectoryApi";
import { buildPageNumbers, formatResultRange } from "../lib/accountDirectoryWorkspace";
import {
  WORK_QUEUE_FILTERS,
  applyNoNextMatch,
  applySkip,
  applySuccessfulYes,
  buildMorawareQueueQuery,
  buildUnifiedCustomerSearchResults,
  isUnresolvedWorkRow,
  operationalBreakdown,
  primaryReviewAction,
  remainingFromSummary,
  reviewBadgeForItem,
  weakSuggestionHint
} from "../lib/morawareReviewWorkflow.mjs";
import type {
  MorawareCandidate,
  MorawareReconciliationItem,
  MorawareReconciliationResponse
} from "../lib/types";

type ViewMode = "hub" | "review" | "browse" | "linked";

const PAGE_SIZE = 100;

function candidateSourceLines(
  morawareName: string,
  best: MorawareCandidate | null
): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = [
    { label: "Moraware", value: String(morawareName || "").trim() || "—" }
  ];
  if (!best) return lines;
  const adName = String(best.displayName || "").trim();
  const qbName = String(best.qbDisplayName || "").trim();
  if (best.accountId || best.identityKind?.startsWith("EXISTING_AD")) {
    lines.push({ label: "Account Directory", value: adName || "—" });
  }
  if (best.qbListId || qbName) {
    lines.push({
      label: "QuickBooks",
      value: qbName || (best.identityKind === "QB_ROOT_NOT_IN_DIRECTORY" ? adName : "") || "—"
    });
  } else if (best.identityKind === "QB_ROOT_NOT_IN_DIRECTORY") {
    lines.push({ label: "QuickBooks", value: adName || "—" });
  }
  // Deduplicate identical consecutive labels when AD and QB share the same string still show both when both exist.
  return lines.filter((l) => l.value && l.value !== "—");
}

function pickCandidate(item: MorawareReconciliationItem | null, index: number): MorawareCandidate | null {
  if (!item) return null;
  const list = item.candidates?.length
    ? item.candidates
    : item.proposedAccountId
      ? [
          {
            accountId: item.proposedAccountId,
            displayName: item.proposedAccountName || "Directory account",
            evidence: (item.evidence || []).map((type) => ({ type, label: type.replace(/_/g, " ") })),
            confirmAllowed: Boolean(item.confirmAllowed),
            confirmQbLinkAllowed: Boolean(item.confirmQbLinkAllowed),
            createFromQuickBooksAllowed: Boolean(item.createFromQuickBooksAllowed),
            qbListId: item.primaryQbListId || null
          } as MorawareCandidate
        ]
      : [];
  if (!list.length) return null;
  return list[Math.min(Math.max(index, 0), list.length - 1)] || list[0];
}

export function MorawareReviewSurface({
  sessionToken,
  canLink,
  onOpenAccount,
  onEditAccount,
  onMessage,
  onCreateDirectoryAccount
}: {
  sessionToken: string | null;
  canLink?: boolean;
  onOpenAccount: (accountId: string) => void;
  onEditAccount?: (accountId: string) => void;
  onMessage: (message: string) => void;
  onCreateDirectoryAccount?: (prefill: { displayName: string; morawareAccountId: string }) => void;
}) {
  const [mode, setMode] = useState<ViewMode>("hub");
  const [queue, setQueue] = useState<MorawareReconciliationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [chooseSearch, setChooseSearch] = useState("");
  const [chooseDirectory, setChooseDirectory] = useState<
    Array<{ kind: string; id: string; displayName: string; subtitle: string; accountId: string | null; qbListId: string | null; active?: boolean }>
  >([]);
  const [chooseQb, setChooseQb] = useState<
    Array<{ kind: string; id: string; displayName: string; subtitle: string; accountId: string | null; qbListId: string | null; active?: boolean }>
  >([]);
  const [actionBusy, setActionBusy] = useState(false);
  const loadGeneration = useRef(0);
  const reviewPosition = useRef(0);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    const generation = ++loadGeneration.current;
    setBusy(true);
    setError(null);
    try {
      const query = buildMorawareQueueQuery({
        mode: mode === "linked" ? "linked" : "work",
        filter: mode === "browse" || mode === "review" ? filter : "",
        search: mode === "linked" || mode === "browse" ? search : "",
        page: mode === "hub" ? 1 : page,
        pageSize: mode === "hub" ? 10 : mode === "review" ? PAGE_SIZE : PAGE_SIZE
      });
      const data = await fetchMorawareReconciliation(sessionToken, query);
      if (generation !== loadGeneration.current) return;
      // Hard client guard: work modes never keep LINKED rows.
      if (mode !== "linked") {
        data.items = (data.items || []).filter(isUnresolvedWorkRow);
      }
      setQueue(data);
      if (data.page && data.page !== page && mode !== "hub") setPage(data.page);
    } catch (e: unknown) {
      if (generation !== loadGeneration.current) return;
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      if (generation === loadGeneration.current) setBusy(false);
    }
  }, [sessionToken, mode, filter, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => {
    const raw = queue?.items || [];
    return mode === "linked" ? raw : raw.filter(isUnresolvedWorkRow);
  }, [queue?.items, mode]);

  const selected = useMemo(() => {
    if (!items.length) return null;
    return items.find((row) => row.morawareAccountId === selectedId) || items[0] || null;
  }, [items, selectedId]);

  useEffect(() => {
    if (!selected) return;
    if (selectedId !== selected.morawareAccountId) setSelectedId(selected.morawareAccountId);
  }, [selected, selectedId]);

  useEffect(() => {
    setCandidateIndex(0);
  }, [selected?.morawareAccountId]);

  const summary = queue?.summary;
  const remaining = remainingFromSummary(summary);
  const connected = summary?.alreadyLinked ?? 0;
  const totalMoraware = summary?.totalMorawareAccounts ?? 0;
  const breakdown = operationalBreakdown(summary);
  const best = pickCandidate(selected, candidateIndex);
  const candidateCount = selected?.candidates?.length || (selected?.proposedAccountId ? 1 : 0);
  const action = selected ? primaryReviewAction(selected, best) : { kind: "search", label: "Search customers" };
  const badge = selected ? reviewBadgeForItem(selected, best) : null;
  const suggestionHint = weakSuggestionHint(best);

  const browseTotal = mode === "linked" ? queue?.total || 0 : remaining;
  const pageSize = queue?.pageSize || PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil((queue?.total || 0) / pageSize) || 1);
  const rangeLabel =
    mode === "browse"
      ? `Showing ${queue?.showingFrom?.toLocaleString() ?? "—"}–${(queue?.showingTo || 0).toLocaleString()} of ${(queue?.total || 0).toLocaleString()} unresolved`
      : mode === "linked"
        ? `Showing ${queue?.showingFrom?.toLocaleString() ?? "—"}–${(queue?.showingTo || 0).toLocaleString()} of ${(queue?.total || 0).toLocaleString()} linked`
        : formatResultRange(page, pageSize, queue?.total || 0);

  function enterReview() {
    setMode("review");
    setPage(1);
    setFilter("");
    setSearch("");
    setSelectedId(null);
    reviewPosition.current = 0;
  }

  function enterBrowse() {
    setMode("browse");
    setPage(1);
    setFilter("");
  }

  function enterLinked() {
    setMode("linked");
    setPage(1);
    setFilter("");
    setSearch("");
  }

  function applyLocalYes(row: MorawareReconciliationItem) {
    const result = applySuccessfulYes(items, row.morawareAccountId, summary || {});
    setQueue((prev) => {
      if (!prev) return prev;
      const nextSummary = { ...(prev.summary || {}), ...result.summaryPatch };
      const state = String(row.reviewState || "");
      if (state === "EXISTING_AD_QB_BACKED" || state === "STRONG_CANDIDATE") {
        nextSummary.existingAdQbBacked = Math.max(0, (nextSummary.existingAdQbBacked || 0) - 1);
      }
      if (state === "EXISTING_AD_QB_LINK_CANDIDATE") {
        nextSummary.existingAdQbLinkCandidate = Math.max(0, (nextSummary.existingAdQbLinkCandidate || 0) - 1);
      }
      if (state === "QB_ROOT_NOT_IN_DIRECTORY") {
        nextSummary.qbRootNotInDirectory = Math.max(0, (nextSummary.qbRootNotInDirectory || 0) - 1);
      }
      if (state === "EXISTING_AD_PROSPECT") {
        nextSummary.existingAdProspect = Math.max(0, (nextSummary.existingAdProspect || 0) - 1);
      }
      if (state === "POSSIBLE_CANDIDATE") {
        nextSummary.possibleCandidates = Math.max(0, (nextSummary.possibleCandidates || 0) - 1);
      }
      if (state === "NO_CANDIDATE" || state === "NO_DIRECTORY_CANDIDATE") {
        nextSummary.noCandidate = Math.max(0, (nextSummary.noCandidate || 0) - 1);
      }
      if (state === "CONFLICT") nextSummary.conflicts = Math.max(0, (nextSummary.conflicts || 0) - 1);
      if (state === "INTERNAL") nextSummary.internalBuckets = Math.max(0, (nextSummary.internalBuckets || 0) - 1);
      return {
        ...prev,
        summary: nextSummary,
        total: Math.max(0, (prev.total || result.remainingItems.length) - 1),
        items: result.remainingItems
      };
    });
    setSelectedId(result.nextId);
    reviewPosition.current += 1;
    setChooseOpen(false);
  }

  async function onYes(row: MorawareReconciliationItem, cand: MorawareCandidate | null) {
    if (!sessionToken || !canLink || !cand) return;
    setActionBusy(true);
    setError(null);
    try {
      if (cand.createFromQuickBooksAllowed && cand.qbListId && !cand.accountId) {
        const res = await createAccountFromQuickBooks(sessionToken, {
          qbListId: cand.qbListId,
          displayName: cand.qbDisplayName || cand.displayName
        });
        if (res.incomplete) {
          setError(
            `Account created but QuickBooks link failed: ${res.linkError || "unknown error"}. Fix the QB link, then confirm Moraware.`
          );
          await load();
          setSelectedId(row.morawareAccountId);
          return;
        }
        onMessage(
          `QuickBooks-backed Account Directory customer created. Confirm Moraware ${row.morawareAccountId} next — Moraware was not auto-linked.`
        );
        await load();
        setSelectedId(row.morawareAccountId);
        return;
      }
      if (cand.confirmQbLinkAllowed && cand.accountId && cand.qbListId) {
        await linkQuickBooks(sessionToken, cand.accountId, {
          externalId: cand.qbListId,
          externalDisplayName: cand.qbDisplayName || cand.displayName
        });
        onMessage(
          `QuickBooks linked to ${cand.displayName}. Confirm Moraware connection next — nothing auto-linked.`
        );
        await load();
        setSelectedId(row.morawareAccountId);
        return;
      }
      if (cand.accountId) {
        await linkMoraware(sessionToken, cand.accountId, {
          externalId: row.morawareAccountId,
          externalDisplayName: row.morawareName
        });
        onMessage(`Connected Moraware ${row.morawareAccountId}. Confirm was required — nothing auto-linked.`);
        applyLocalYes(row);
        void load();
        return;
      }
      setChooseOpen(true);
      setChooseSearch(row.morawareName || "");
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  function onNo() {
    const next = applyNoNextMatch(candidateIndex, candidateCount);
    setCandidateIndex(next.nextIndex);
    if (!next.cycled) setChooseOpen(true);
  }

  function onSkip(row: MorawareReconciliationItem) {
    const result = applySkip(items, row.morawareAccountId);
    if (result.nextId) {
      setSelectedId(result.nextId);
      setCandidateIndex(0);
      setChooseOpen(false);
      return;
    }
    if (result.needsNextPage && page < totalPages) {
      setPage((p) => p + 1);
      setSelectedId(null);
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

  async function runUnifiedSearch() {
    if (!sessionToken) return;
    const q = chooseSearch.trim();
    const [ad, qb] = await Promise.all([
      listAccounts(sessionToken, { tab: "accounts", search: q, page: 1, pageSize: 25 }),
      searchQuickBooksCustomers(sessionToken, q).catch(() => ({ items: [] as Array<{ listId: string; displayName: string; active?: boolean }> }))
    ]);
    const merged = buildUnifiedCustomerSearchResults({
      adItems: ad.items || [],
      qbItems: qb.items || []
    });
    setChooseDirectory(merged.directory);
    setChooseQb(merged.quickbooks);
  }

  async function selectSearchHit(
    row: MorawareReconciliationItem,
    hit: { accountId: string | null; qbListId: string | null; displayName: string; kind: string }
  ) {
    if (!sessionToken || !canLink) return;
    // Never auto-link — staged governed next step only.
    if (hit.kind === "quickbooks_root" && hit.qbListId) {
      setActionBusy(true);
      setError(null);
      try {
        const res = await createAccountFromQuickBooks(sessionToken, {
          qbListId: hit.qbListId,
          displayName: hit.displayName
        });
        if (res.incomplete) {
          setError(`Account created but QuickBooks link failed: ${res.linkError || "unknown"}.`);
        } else {
          onMessage(
            `QuickBooks-backed account created for ${hit.displayName}. Confirm Moraware ${row.morawareAccountId} explicitly.`
          );
        }
        setChooseOpen(false);
        await load();
        setSelectedId(row.morawareAccountId);
      } catch (e: unknown) {
        setError(e instanceof ApiError ? e.message : String(e));
      } finally {
        setActionBusy(false);
      }
      return;
    }
    if (hit.accountId) {
      setActionBusy(true);
      setError(null);
      try {
        await linkMoraware(sessionToken, hit.accountId, {
          externalId: row.morawareAccountId,
          externalDisplayName: row.morawareName
        });
        onMessage(`Connected Moraware ${row.morawareAccountId}. Confirm was required — nothing auto-linked.`);
        applyLocalYes(row);
        setChooseOpen(false);
        void load();
      } catch (e: unknown) {
        setError(e instanceof ApiError ? e.message : String(e));
      } finally {
        setActionBusy(false);
      }
    }
  }

  const yesLabel = action.label || "Search customers";

  const reviewOrdinal = Math.min(reviewPosition.current + 1, Math.max(remaining, 1));

  return (
    <div className="status-review moraware-review">
      <header className="status-review-head">
        <div>
          <p className="hero-eyebrow">Identity</p>
          <h2>Moraware reconciliation</h2>
          <p className="muted">
            One account at a time. Confirm exact Moraware Account IDs against Account Directory or trusted QuickBooks
            roots. No bulk confirm. No auto-link.
          </p>
        </div>
      </header>

      {summary ? (
        <div className="moraware-summary moraware-summary-ops" aria-label="Reconciliation progress">
          <div className="moraware-hero-counts">
            <div className="moraware-hero-count">
              <span className="moraware-hero-label">Connected</span>
              <strong>{connected.toLocaleString()}</strong>
            </div>
            <div className="moraware-hero-count moraware-hero-count-primary">
              <span className="moraware-hero-label">Remaining</span>
              <strong>{remaining.toLocaleString()}</strong>
            </div>
          </div>
          <p className="muted moraware-summary-meta">
            {totalMoraware.toLocaleString()} Moraware accounts · {connected.toLocaleString()} connected ·{" "}
            {remaining.toLocaleString()} remaining
          </p>
          <ul className="moraware-ops-breakdown">
            {breakdown.map((b) => (
              <li key={b.key} title={b.hint}>
                <span>{b.label}</span>
                <strong>{b.count}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mode === "hub" ? (
        <div className="moraware-hub">
          <p className="moraware-hub-remaining">
            <strong>{remaining.toLocaleString()}</strong> accounts remaining
          </p>
          <div className="status-review-actions moraware-hub-actions">
            <button type="button" className="btn btn-primary" disabled={busy || remaining === 0} onClick={enterReview}>
              Review one by one
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={enterBrowse}>
              Browse unresolved
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={enterLinked}>
              View linked accounts ({connected.toLocaleString()})
            </button>
          </div>
          {remaining === 0 && !busy ? <p className="muted">All Moraware accounts in the work queue are connected.</p> : null}
        </div>
      ) : null}

      {mode !== "hub" ? (
        <div className="moraware-mode-bar">
          <button type="button" className="btn btn-secondary" onClick={() => setMode("hub")}>
            ← Overview
          </button>
          {mode !== "review" ? (
            <button type="button" className="btn btn-primary" disabled={remaining === 0} onClick={enterReview}>
              Review one by one
            </button>
          ) : null}
          {mode !== "browse" ? (
            <button type="button" className="btn btn-secondary" onClick={enterBrowse}>
              Browse unresolved
            </button>
          ) : null}
          {mode !== "linked" ? (
            <button type="button" className="btn btn-secondary" onClick={enterLinked}>
              Linked history ({connected.toLocaleString()})
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      {busy && !queue ? <p className="muted">Loading…</p> : null}

      {mode === "review" && selected && isUnresolvedWorkRow(selected) ? (
        <section className="moraware-focus" aria-label="Review one Moraware account">
          <p className="moraware-focus-progress">
            {reviewOrdinal} of {remaining.toLocaleString()} remaining
          </p>
          <div className="moraware-focus-card">
            <p className="moraware-focus-eyebrow">Moraware</p>
            <h3>{selected.morawareName}</h3>
            <p className="muted">
              Account ID {selected.morawareAccountId} · {selected.jobs2026 ?? selected.jobCount ?? 0} jobs in 2026
            </p>
            {badge ? <span className={`moraware-badge moraware-badge-${badge.tone}`}>{badge.label}</span> : null}

            {best ? (
              <div className="moraware-best-candidate">
                <div className="moraware-source-stack" aria-label="Source names">
                  {candidateSourceLines(selected.morawareName, best).map((line) => (
                    <div key={line.label} className="moraware-source-line">
                      <span className="moraware-focus-eyebrow">{line.label}</span>
                      <strong>{line.value}</strong>
                    </div>
                  ))}
                </div>
                <h4>Do you mean this customer?</h4>
                <p className="moraware-focus-match-label">Best match</p>
                <p className="moraware-best-name">
                  {best.displayName}
                  {best.qbDisplayName &&
                  best.displayName &&
                  best.qbDisplayName.trim() !== best.displayName.trim()
                    ? ` · QB: ${best.qbDisplayName}`
                    : ""}
                </p>
                <p className="muted">
                  {best.identityKind === "EXISTING_AD_QB_BACKED"
                    ? "Account Directory customer · QuickBooks connected"
                    : best.identityKind === "EXISTING_AD_QB_LINK_CANDIDATE"
                      ? "Existing Account Directory account · QuickBooks connection requires confirmation"
                      : best.identityKind === "QB_ROOT_NOT_IN_DIRECTORY"
                        ? "QuickBooks customer · Not yet in Account Directory"
                        : best.identityKind === "EXISTING_AD_PROSPECT"
                          ? "Existing Prospect (not QB-backed)"
                          : badge?.label || "Candidate"}
                  {best.qbActive === false ? " · Inactive QuickBooks root" : ""}
                  {candidateCount > 1 ? ` · match ${candidateIndex + 1} of ${candidateCount}` : ""}
                </p>
                {suggestionHint ? <p className="muted">{suggestionHint}</p> : null}
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
              </div>
            ) : (
              <div className="moraware-best-candidate">
                <h4>No credible Account Directory or QuickBooks customer found</h4>
                <p className="muted">
                  {selected.unmatchedReason || selected.reason
                    ? `Reason: ${String(selected.unmatchedReason || selected.reason).replace(/_/g, " ")}`
                    : "Search customers (Account Directory + QuickBooks) or create a new account."}
                </p>
              </div>
            )}

            <div className="status-review-actions moraware-focus-actions">
              {canLink && !selected.internalBucket ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={actionBusy}
                  onClick={() => {
                    if (!best || action.kind === "search" || action.kind === "review" || action.kind === "none") {
                      setChooseOpen(true);
                      setChooseSearch(selected.morawareName || "");
                      return;
                    }
                    void onYes(selected, best);
                  }}
                >
                  {yesLabel}
                </button>
              ) : null}
              {best && candidateCount > 0 ? (
                <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={onNo}>
                  NO — Show next match
                </button>
              ) : null}
              <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={() => onSkip(selected)}>
                SKIP
              </button>
            </div>
            <div className="status-review-actions">
              {canLink && !selected.internalBucket ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setChooseOpen(true);
                    setChooseSearch(selected.morawareName || "");
                  }}
                >
                  Search customers
                </button>
              ) : null}
              {onCreateDirectoryAccount && canLink && !selected.internalBucket ? (
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
                  Create new account
                </button>
              ) : null}
              {best?.accountId ? (
                <button type="button" className="btn btn-secondary" onClick={() => onOpenAccount(best.accountId as string)}>
                  View account
                </button>
              ) : null}
              {best?.accountId && onEditAccount ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    onEditAccount(best.accountId as string);
                    onMessage(
                      "Opened Account Directory edit. Rename does not connect Moraware — return and click YES — Connect."
                    );
                  }}
                >
                  Edit account
                </button>
              ) : null}
            </div>
            <p className="muted moraware-kbd-hint">Moraware never auto-links. Create-from-QuickBooks does not write to QuickBooks.</p>
          </div>
        </section>
      ) : null}

      {mode === "review" && !busy && remaining === 0 ? (
        <p className="muted">No unresolved Moraware accounts left in this queue.</p>
      ) : null}

      {mode === "browse" || mode === "linked" ? (
        <>
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
            {mode === "browse" ? (
              <div className="filter-chips" role="group" aria-label="Unresolved filters">
                {WORK_QUEUE_FILTERS.map((item) => (
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
            ) : (
              <p className="muted">Linked history — audit, view account, or governed unlink. Not part of the work queue.</p>
            )}
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
          <p className="muted" aria-live="polite">
            {rangeLabel}
            {mode === "browse" ? ` · ${browseTotal.toLocaleString()} remaining overall` : ""}
          </p>
          <div className="status-review-split">
            <ul className="status-review-list" aria-label={mode === "linked" ? "Linked Moraware accounts" : "Unresolved Moraware accounts"}>
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
                <p className="muted">{selected.jobs2026 ?? selected.jobCount ?? 0} jobs in 2026</p>
                {selected.currentLink?.linked ? (
                  <div className="moraware-best-candidate">
                    <h4>Already linked</h4>
                    <p>
                      Connected to{" "}
                      <button type="button" className="linkish" onClick={() => onOpenAccount(selected.currentLink!.accountId!)}>
                        {selected.currentLink.accountName || selected.currentLink.accountId}
                      </button>
                    </p>
                    {canLink ? (
                      <button type="button" className="btn btn-danger" disabled={actionBusy} onClick={() => void unlink(selected)}>
                        Unlink
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="status-review-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        setMode("review");
                        setSelectedId(selected.morawareAccountId);
                      }}
                    >
                      Review this account
                    </button>
                    {canLink ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setChooseOpen(true);
                          setChooseSearch(selected.morawareName || "");
                        }}
                      >
                        Search customers
                      </button>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}
          </div>
          {totalPages > 1 ? (
            <nav className="pager" aria-label="Pagination">
              <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              {buildPageNumbers(page, totalPages).map((n, i) =>
                n === "…" ? (
                  <span key={`e-${i}`} className="muted">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    className={n === page ? "btn btn-secondary chip-active" : "btn btn-secondary"}
                    onClick={() => setPage(Number(n))}
                  >
                    {n}
                  </button>
                )
              )}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </nav>
          ) : null}
        </>
      ) : null}

      {chooseOpen && selected && !selected.currentLink?.linked ? (
        <div className="moraware-choose-panel" role="dialog" aria-label="Search customers">
          <h4>Search customers</h4>
          <p className="muted">Account Directory and trusted QuickBooks roots. Selecting a result still requires confirmation — nothing auto-links.</p>
          <div className="status-review-actions">
            <input
              value={chooseSearch}
              onChange={(e) => setChooseSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runUnifiedSearch();
              }}
              placeholder="Search by name"
              aria-label="Customer search"
            />
            <button type="button" className="btn btn-secondary" onClick={() => void runUnifiedSearch()}>
              Search
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setChooseOpen(false)}>
              Close
            </button>
          </div>
          <div className="moraware-unified-search">
            <h5>Account Directory</h5>
            <ul className="moraware-choose-list">
              {chooseDirectory.map((hit) => (
                <li key={hit.id} className="ad-person-card">
                  <div>
                    <strong>{hit.displayName}</strong>
                    <span className="muted">{hit.subtitle}</span>
                  </div>
                  {canLink ? (
                    <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={() => void selectSearchHit(selected, hit)}>
                      Use account
                    </button>
                  ) : null}
                </li>
              ))}
              {!chooseDirectory.length ? <li className="muted">No directory hits yet.</li> : null}
            </ul>
            <h5>QuickBooks</h5>
            <ul className="moraware-choose-list">
              {chooseQb.map((hit) => (
                <li key={hit.id} className="ad-person-card">
                  <div>
                    <strong>{hit.displayName}</strong>
                    <span className="muted">{hit.subtitle}</span>
                  </div>
                  {canLink ? (
                    <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={() => void selectSearchHit(selected, hit)}>
                      Create from QuickBooks
                    </button>
                  ) : null}
                </li>
              ))}
              {!chooseQb.length ? <li className="muted">No QuickBooks root hits yet.</li> : null}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
