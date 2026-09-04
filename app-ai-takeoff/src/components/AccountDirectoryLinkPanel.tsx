/**
 * Compact Account Directory soft-link panel for Quote Flow Review Takeoff.
 */
import React, { useMemo, useState } from "react";

export type AccountDirectoryLinkState = {
  status?: string;
  accountId?: string | null;
  contactId?: string | null;
  matchConfidence?: string | null;
  matchReason?: string | null;
  lookupUnavailable?: boolean;
  suggestions?: Array<{
    accountId: string;
    contactId?: string | null;
    displayName?: string | null;
    contactDisplayName?: string | null;
    contactEmail?: string | null;
    matchConfidence?: string | null;
    matchReason?: string | null;
  }>;
  quoteSnapshot?: {
    accountName?: string;
    contactName?: string;
    contactEmail?: string;
    salesperson?: string;
    branch?: string;
    projectAddress?: string;
  };
  conflicts?: Array<{ field: string; current: string; accountDefault: string }>;
};

type Props = {
  link: AccountDirectoryLinkState | null;
  readonly?: boolean;
  busy?: boolean;
  lookupUnavailable?: boolean;
  onConfirmSuggestion?: (accountId: string, contactId?: string | null) => void;
  onRejectSuggestion?: () => void;
  onSearch?: (query: string) => Promise<
    Array<{ id: string; displayName?: string | null; primaryContact?: string | null }>
  >;
  onLinkAccount?: (accountId: string) => void;
  onUnlink?: () => void;
  onPatchSnapshot?: (patch: Record<string, string>) => void;
};

export default function AccountDirectoryLinkPanel(props: Props) {
  const {
    link,
    readonly = false,
    busy = false,
    lookupUnavailable = false,
    onConfirmSuggestion,
    onRejectSuggestion,
    onSearch,
    onLinkAccount,
    onUnlink,
    onPatchSnapshot
  } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ id: string; displayName?: string | null; primaryContact?: string | null }>
  >([]);
  const [searchBusy, setSearchBusy] = useState(false);

  const status = link?.status || "unlinked";
  const qs = link?.quoteSnapshot || {};
  const suggestion = link?.suggestions?.[0] || null;

  const summary = useMemo(() => {
    if (status === "confirmed") {
      return `${qs.accountName || "Account"} · linked to Account Directory`;
    }
    if (status === "suggested" && suggestion) {
      return `Suggested · ${suggestion.displayName || "account"}`;
    }
    return "Account · Not linked";
  }, [status, qs.accountName, suggestion]);

  async function runSearch() {
    if (!onSearch || !query.trim()) return;
    setSearchBusy(true);
    try {
      const items = await onSearch(query.trim());
      setResults(Array.isArray(items) ? items : []);
    } catch {
      setResults([]);
    } finally {
      setSearchBusy(false);
    }
  }

  return (
    <section className="ctr-ad-link" data-testid="ctr-ad-link">
      <button
        type="button"
        className="ctr-ad-link__toggle"
        data-testid="ctr-ad-link-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{summary}</span>
        <span>{open ? "Hide" : status === "confirmed" ? "Change" : "Find account"}</span>
      </button>
      {open ? (
        <div className="ctr-ad-link__body">
          {lookupUnavailable || link?.lookupUnavailable ? (
            <p className="ctr-muted" data-testid="ctr-ad-link-unavailable">
              Account Directory lookup unavailable — estimating can continue unlinked.
            </p>
          ) : null}

          {status === "confirmed" ? (
            <div className="ctr-ad-link__confirmed" data-testid="ctr-ad-link-confirmed">
              <div>
                <strong>Account</strong> {qs.accountName || "—"}
              </div>
              <div>
                <strong>Contact</strong> {qs.contactName || "—"}
                {qs.contactEmail ? ` · ${qs.contactEmail}` : ""}
              </div>
              {qs.salesperson ? (
                <div>
                  <strong>Salesperson</strong> {qs.salesperson}
                </div>
              ) : null}
              {qs.branch ? (
                <div>
                  <strong>Branch</strong> {qs.branch}
                </div>
              ) : null}
              {Array.isArray(link?.conflicts) && link!.conflicts!.length > 0 ? (
                <ul className="ctr-ad-link__conflicts">
                  {link!.conflicts!.map((c) => (
                    <li key={c.field}>
                      Account default {c.field}: {c.accountDefault} (quote keeps {c.current})
                    </li>
                  ))}
                </ul>
              ) : null}
              {!readonly ? (
                <div className="ctr-ad-link__actions">
                  <button type="button" className="ctr-btn-secondary" disabled={busy} onClick={() => onUnlink?.()}>
                    Unlink
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {status === "suggested" && suggestion ? (
            <div className="ctr-ad-link__suggested" data-testid="ctr-ad-link-suggested">
              <p>
                Suggested account <strong>{suggestion.displayName}</strong>
                {suggestion.matchReason ? ` · ${suggestion.matchReason}` : ""}
              </p>
              {!readonly ? (
                <div className="ctr-ad-link__actions">
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="ctr-ad-link-confirm"
                    onClick={() =>
                      onConfirmSuggestion?.(suggestion.accountId, suggestion.contactId || null)
                    }
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="ctr-btn-secondary"
                    disabled={busy}
                    onClick={() => onRejectSuggestion?.()}
                  >
                    Leave unlinked
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {!readonly ? (
            <div className="ctr-ad-link__search">
              <label>
                Find account
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, email, contact…"
                  data-testid="ctr-ad-link-search"
                />
              </label>
              <button type="button" disabled={busy || searchBusy} onClick={() => void runSearch()}>
                {searchBusy ? "Searching…" : "Search"}
              </button>
              {results.length > 0 ? (
                <ul className="ctr-ad-link__results">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onLinkAccount?.(r.id)}
                      >
                        {r.displayName || r.id}
                        {r.primaryContact ? ` · ${r.primaryContact}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {!readonly && status === "confirmed" ? (
            <div className="ctr-ad-link__snapshot-edit">
              <p className="ctr-muted">Quote-specific values stay editable.</p>
              <button
                type="button"
                className="ctr-btn-secondary"
                disabled={busy}
                onClick={() => {
                  const next = window.prompt("Salesperson for this quote:", qs.salesperson || "");
                  if (next == null) return;
                  onPatchSnapshot?.({ salesperson: next });
                }}
              >
                Override salesperson
              </button>
              <button
                type="button"
                className="ctr-btn-secondary"
                disabled={busy}
                onClick={() => {
                  const next = window.prompt("Branch for this quote:", qs.branch || "");
                  if (next == null) return;
                  onPatchSnapshot?.({ branch: next });
                }}
              >
                Override branch
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
