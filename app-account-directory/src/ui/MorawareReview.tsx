import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  fetchMorawareReconciliation,
  linkMoraware,
  listAccounts,
  unlinkMoraware
} from "../lib/accountDirectoryApi";
import { buildPageNumbers, formatResultRange } from "../lib/accountDirectoryWorkspace";
import type { MorawareReconciliationItem, MorawareReconciliationResponse } from "../lib/types";

const FILTERS = [
  { id: "", label: "All" },
  { id: "HIGH_CONFIDENCE_CANDIDATE", label: "High Confidence" },
  { id: "REVIEW_REQUIRED", label: "Review Required" },
  { id: "UNMATCHED", label: "Unmatched" },
  { id: "CONFLICT", label: "Conflict" },
  { id: "LINKED", label: "Linked" }
];

const PAGE_SIZE = 100;

function classLabel(value: string): string {
  if (value === "HIGH_CONFIDENCE_CANDIDATE") return "High confidence";
  if (value === "REVIEW_REQUIRED") return "Review required";
  if (value === "UNMATCHED") return "Unmatched";
  if (value === "CONFLICT") return "Conflict";
  return value;
}

export function MorawareReviewSurface({
  sessionToken,
  canLink,
  onOpenAccount,
  onMessage
}: {
  sessionToken: string | null;
  canLink?: boolean;
  onOpenAccount: (accountId: string) => void;
  onMessage: (message: string) => void;
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
  const [chooseHits, setChooseHits] = useState<Array<{ id: string; name?: string; displayName?: string }>>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    const generation = ++loadGeneration.current;
    setBusy(true);
    setError(null);
    try {
      const data = await fetchMorawareReconciliation(sessionToken, {
        classification: filter === "LINKED" ? "" : filter,
        linked: filter === "LINKED" ? "true" : "",
        search,
        page,
        pageSize: PAGE_SIZE
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

  const selected = useMemo(
    () => (queue?.items || []).find((row) => row.morawareAccountId === selectedId) || queue?.items?.[0] || null,
    [queue, selectedId]
  );

  const total = queue?.total || 0;
  const pageSize = queue?.pageSize || PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const rangeLabel =
    queue?.showingFrom != null
      ? `Showing ${queue.showingFrom.toLocaleString()}–${(queue.showingTo || 0).toLocaleString()} of ${total.toLocaleString()}`
      : formatResultRange(page, pageSize, total);

  async function confirmLink(row: MorawareReconciliationItem, accountId: string) {
    if (!sessionToken || !canLink) return;
    setActionBusy(true);
    setError(null);
    try {
      await linkMoraware(sessionToken, accountId, {
        externalId: row.morawareAccountId,
        externalDisplayName: row.morawareName
      });
      onMessage(`Linked Moraware ${row.morawareAccountId} to the selected account.`);
      setChooseFor(null);
      await load();
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

  return (
    <div className="status-review moraware-review">
      <header className="status-review-head">
        <div>
          <p className="hero-eyebrow">Identity</p>
          <h2>Moraware links</h2>
          <p className="muted">
            Confirm one Moraware Account ID at a time. One directory account may have several Moraware IDs.
            There is no bulk confirm.
          </p>
        </div>
      </header>

      {summary ? (
        <ul className="status-review-counts" aria-label="Moraware reconciliation summary">
          <li>
            <span>Moraware accounts</span>
            <strong>{summary.totalMorawareAccounts}</strong>
          </li>
          <li>
            <span>Already linked</span>
            <strong>{summary.alreadyLinked}</strong>
          </li>
          <li>
            <span>High-confidence unlinked</span>
            <strong>{summary.highConfidenceUnlinked}</strong>
          </li>
          <li>
            <span>Review required</span>
            <strong>{summary.reviewRequired}</strong>
          </li>
          <li>
            <span>Unmatched</span>
            <strong>{summary.unmatched}</strong>
          </li>
          <li>
            <span>Conflicts</span>
            <strong>{summary.conflicts}</strong>
          </li>
        </ul>
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
          {(queue?.items || []).map((row) => (
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
                <strong>
                  {row.morawareName}{" "}
                  <span className="muted">#{row.morawareAccountId}</span>
                </strong>
                <span className="muted">
                  {classLabel(row.classification)} · {row.jobs2026 ?? row.jobCount} jobs (2026)
                  {row.currentLink?.linked ? " · Linked" : ""}
                  {row.siblingMorawareIds?.length ? " · multiple Moraware IDs on AD" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {selected ? (
          <section className="status-review-detail" aria-label="Selected Moraware account">
            <h3>
              {selected.morawareName}{" "}
              <span className="muted">Account ID {selected.morawareAccountId}</span>
            </h3>
            <p>
              {selected.jobs2026 ?? selected.jobCount} jobs in 2026
              {selected.earliestJobDate ? ` · ${selected.earliestJobDate}` : ""}
              {selected.latestJobDate ? ` to ${selected.latestJobDate}` : ""}
            </p>
            <p>
              Proposed directory account:{" "}
              <strong>{selected.proposedAccountName || "None"}</strong>
            </p>
            <p>
              QuickBooks:{" "}
              {selected.qbLinked
                ? `Linked${selected.qbDisplayName ? ` · ${selected.qbDisplayName}` : ""}`
                : "Not linked"}
            </p>
            <p>Evidence: {(selected.evidence || []).join(", ") || "None"}</p>
            {selected.contradictions?.length ? (
              <p>Contradictions: {selected.contradictions.join(", ")}</p>
            ) : null}
            {selected.siblingMorawareIds?.length ? (
              <p>
                Other Moraware IDs already on this directory account:{" "}
                {selected.siblingMorawareIds.join(", ")}. Linking another ID to the same UUID is allowed.
              </p>
            ) : (
              <p className="muted">
                A second Moraware ID may be linked to the same directory account when it is the same customer
                (for example Dyersville- shop prefixes).
              </p>
            )}
            {selected.internalBucket ? (
              <p className="banner banner-warn">
                Internal/house identity. Confirm is disabled until an identity policy exists.
              </p>
            ) : null}
            {selected.alternatives?.length ? (
              <p className="muted">
                Alternatives: {selected.alternatives.map((a) => a.accountName).join(", ")}
              </p>
            ) : null}

            <div className="status-review-actions">
              {selected.confirmAllowed && selected.proposedAccountId && canLink ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={actionBusy}
                  onClick={() => void confirmLink(selected, selected.proposedAccountId as string)}
                >
                  Confirm Link
                </button>
              ) : null}
              {canLink && !selected.internalBucket && !selected.currentLink?.linked ? (
                <button type="button" className="btn btn-secondary" onClick={() => setChooseFor(selected)}>
                  Choose Different Account
                </button>
              ) : null}
              {selected.currentLink?.linked && canLink ? (
                <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={() => void unlink(selected)}>
                  Unlink
                </button>
              ) : null}
              {selected.proposedAccountId || selected.currentLink?.accountId ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    onOpenAccount(String(selected.currentLink?.accountId || selected.proposedAccountId))
                  }
                >
                  View Account
                </button>
              ) : null}
            </div>
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
              Link Moraware {chooseFor.morawareAccountId} to an existing Account Directory UUID. This does not
              create a new account.
            </p>
            <label className="field">
              Search accounts
              <input value={chooseSearch} onChange={(e) => setChooseSearch(e.target.value)} />
            </label>
            <button type="button" className="btn btn-secondary" onClick={() => void runChooseSearch()}>
              Search
            </button>
            <ul className="ad-card-list">
              {chooseHits.map((hit) => (
                <li key={hit.id} className="ad-person-card">
                  <strong>{hit.displayName || hit.name}</strong>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={actionBusy}
                    onClick={() => void confirmLink(chooseFor, hit.id)}
                  >
                    Link here
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
