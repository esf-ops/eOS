import { useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import { linkQuickBooks, searchQuickBooksCustomers } from "../lib/accountDirectoryApi";
import {
  QB_CUSTOMER_SEARCH_DEBOUNCE_MS,
  QB_CUSTOMER_SEARCH_MIN_QUERY,
  isAbortError,
  nextQbPickerLinkState,
  safeIdentityErrorMessage,
  shouldPostQbLinkOnSelect
} from "../lib/accountDirectoryConnections.mjs";
import type { AccountDetail, QuickBooksCustomerSearchItem } from "../lib/types";

export function QuickBooksCustomerPicker({
  sessionToken,
  accountId,
  accountName,
  onLinked,
  onCancel
}: {
  sessionToken: string;
  accountId: string;
  accountName: string;
  onLinked: (detail: AccountDetail) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<QuickBooksCustomerSearchItem[]>([]);
  const [status, setStatus] = useState<"idle" | "searching" | "empty" | "results" | "selected" | "confirming" | "error">(
    "idle"
  );
  const [selected, setSelected] = useState<QuickBooksCustomerSearchItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    abortRef.current?.abort();
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (q.length < QB_CUSTOMER_SEARCH_MIN_QUERY) {
      setItems([]);
      if (!selected) setStatus("idle");
      return;
    }
    setStatus("searching");
    setError(null);
    debounceRef.current = window.setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      void searchQuickBooksCustomers(sessionToken, q, { signal: controller.signal })
        .then((res) => {
          if (controller.signal.aborted) return;
          const next = Array.isArray(res.items) ? res.items : [];
          setItems(next);
          setStatus(next.length ? "results" : "empty");
        })
        .catch((err) => {
          if (controller.signal.aborted || isAbortError(err)) return;
          setItems([]);
          setStatus("error");
          setError(safeIdentityErrorMessage(err instanceof ApiError ? err : { message: String(err) }));
        });
    }, QB_CUSTOMER_SEARCH_DEBOUNCE_MS);
  }, [query, sessionToken, selected]);

  function selectCandidate(item: QuickBooksCustomerSearchItem) {
    if (shouldPostQbLinkOnSelect()) return;
    setSelected(item);
    setStatus(nextQbPickerLinkState(status, "select"));
    setError(null);
  }

  async function confirmLink() {
    if (!selected || busy) return;
    setBusy(true);
    setStatus("confirming");
    setError(null);
    try {
      const res = await linkQuickBooks(sessionToken, accountId, {
        externalId: selected.listId,
        externalDisplayName: selected.displayName
      });
      if (res.account) onLinked(res.account);
    } catch (err) {
      setStatus("error");
      setError(safeIdentityErrorMessage(err instanceof ApiError ? err : { message: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ad-qb-picker" data-ad-qb-picker="true">
      <p className="muted">Search trusted QuickBooks customers by name, then confirm the connection.</p>
      <label className="field">
        Customer name
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selected) {
              setSelected(null);
              setStatus("idle");
            }
          }}
          placeholder="Start typing a customer name"
          autoFocus
        />
      </label>
      {status === "idle" && !selected ? (
        <p className="muted">Type at least {QB_CUSTOMER_SEARCH_MIN_QUERY} characters to search.</p>
      ) : null}
      {status === "searching" ? <p className="muted">Searching…</p> : null}
      {status === "empty" ? <p className="muted">No trusted QuickBooks customers match that name.</p> : null}
      {items.length > 0 && !selected ? (
        <ul className="ad-picker-results" role="listbox" aria-label="QuickBooks customers">
          {items.map((item) => (
            <li key={item.listId}>
              <button type="button" className="ad-picker-hit" onClick={() => selectCandidate(item)}>
                <strong>{item.displayName}</strong>
                <span className="muted">{item.active === false ? "Inactive in QuickBooks" : "Active"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <div className="ad-confirm-card" data-ad-qb-confirm="true">
          <p className="ad-kicker">Confirm connection</p>
          <dl className="ad-identity-meta">
            <div>
              <dt>Account Directory</dt>
              <dd>{accountName}</dd>
            </div>
            <div>
              <dt>QuickBooks</dt>
              <dd>{selected.displayName}</dd>
            </div>
          </dl>
          <p className="muted">This stores the exact QuickBooks identity. It does not write to QuickBooks.</p>
          <div className="ad-connection-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setStatus(items.length ? "results" : "idle");
              }}
            >
              Back
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void confirmLink()}>
              {busy ? "Connecting…" : "Connect QuickBooks"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      {onCancel && !selected ? (
        <div className="ad-connection-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
