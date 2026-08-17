import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  fetchMorawareReconciliation,
  linkMoraware,
  unlinkMoraware,
  unlinkQuickBooks
} from "../lib/accountDirectoryApi";
import {
  MULTIPLE_QB_NOTICE,
  MW_DISCONNECT_BODY,
  MW_DISCONNECT_TITLE,
  QB_DISCONNECT_BODY,
  QB_DISCONNECT_TITLE,
  filterMorawareCandidatesForAccount,
  isAbortError,
  partitionConnectionLinks,
  qbConnectionDisplayName,
  qbConnectionStatusLabel,
  safeIdentityErrorMessage
} from "../lib/accountDirectoryConnections.mjs";
import { activityLabel } from "../lib/accountDirectoryWorkspace";
import type { AccountDetail, ExternalLink, MorawareReconciliationItem } from "../lib/types";
import { QuickBooksCustomerPicker } from "./QuickBooksCustomerPicker";

type IdentityKind = "quickbooks" | "moraware";

export function ConnectionsWithIdentity({
  links,
  aliases,
  auditHistory,
  accountId,
  accountName,
  sessionToken,
  canLinkQuickBooks,
  canLinkMoraware,
  canViewAudit,
  onChanged
}: {
  links: AccountDetail["externalLinks"];
  aliases: AccountDetail["aliases"];
  auditHistory: AccountDetail["auditHistory"];
  accountId?: string;
  accountName?: string;
  sessionToken?: string | null;
  canLinkQuickBooks?: boolean;
  canLinkMoraware?: boolean;
  canViewAudit?: boolean;
  onChanged?: (detail: AccountDetail, opts?: { kind?: IdentityKind }) => void;
}) {
  const { qb, moraware, other } = useMemo(() => partitionConnectionLinks(links || []), [links]);
  const [qbPickerOpen, setQbPickerOpen] = useState(false);
  const [mwFindOpen, setMwFindOpen] = useState(false);
  const [mwBusy, setMwBusy] = useState(false);
  const [mwError, setMwError] = useState<string | null>(null);
  const [mwCandidates, setMwCandidates] = useState<MorawareReconciliationItem[] | null>(null);
  const [mwSelected, setMwSelected] = useState<MorawareReconciliationItem | null>(null);
  const [disconnect, setDisconnect] = useState<{ kind: IdentityKind; link: ExternalLink } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const mwAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mwAbortRef.current?.abort();
    setQbPickerOpen(false);
    setMwFindOpen(false);
    setMwBusy(false);
    setMwError(null);
    setMwCandidates(null);
    setMwSelected(null);
    setDisconnect(null);
    setActionError(null);
  }, [accountId]);

  useEffect(() => {
    return () => {
      mwAbortRef.current?.abort();
    };
  }, []);

  const directoryName = accountName || "This account";

  async function findMoraware() {
    if (!sessionToken || !accountId || !canLinkMoraware) return;
    mwAbortRef.current?.abort();
    const controller = new AbortController();
    mwAbortRef.current = controller;
    setMwFindOpen(true);
    setMwBusy(true);
    setMwError(null);
    setMwSelected(null);
    try {
      const data = await fetchMorawareReconciliation(
        sessionToken,
        { proposedAccountId: accountId, linked: "false", page: 1, pageSize: 20 },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setMwCandidates(filterMorawareCandidatesForAccount(data.items || [], accountId));
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return;
      setMwCandidates([]);
      setMwError(safeIdentityErrorMessage(err instanceof ApiError ? err : { message: String(err) }));
    } finally {
      if (!controller.signal.aborted) setMwBusy(false);
    }
  }

  async function confirmMoraware() {
    if (!sessionToken || !accountId || !mwSelected || !canLinkMoraware) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await linkMoraware(sessionToken, accountId, {
        externalId: mwSelected.morawareAccountId,
        externalDisplayName: mwSelected.morawareName
      });
      if (res.account) onChanged?.(res.account, { kind: "moraware" });
      setMwFindOpen(false);
      setMwSelected(null);
      setMwCandidates(null);
    } catch (err) {
      setActionError(safeIdentityErrorMessage(err instanceof ApiError ? err : { message: String(err) }));
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmDisconnect() {
    if (!sessionToken || !accountId || !disconnect) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const res =
        disconnect.kind === "quickbooks"
          ? await unlinkQuickBooks(sessionToken, accountId, disconnect.link.id)
          : await unlinkMoraware(sessionToken, accountId, disconnect.link.id);
      if (res.account) onChanged?.(res.account, { kind: disconnect.kind });
      setDisconnect(null);
    } catch (err) {
      setActionError(safeIdentityErrorMessage(err instanceof ApiError ? err : { message: String(err) }));
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="ad-connections">
      {accountId ? (
        <p className="muted ad-connections-id">
          Account Directory UUID <span className="ad-mono">{accountId}</span>
        </p>
      ) : null}
      <section className="ad-section">
        <header className="ad-section-head">
          <p className="ad-kicker">Connections</p>
          <h3>QuickBooks</h3>
          <p className="muted">Identity and source management. Financial detail stays in Financials.</p>
        </header>
        {qb.length > 1 ? (
          <p className="ad-connection-notice" role="status">
            {MULTIPLE_QB_NOTICE}
          </p>
        ) : null}
        {!qb.length && !qbPickerOpen ? (
          <div className="ad-empty-state">
            <p>Not connected to QuickBooks.</p>
            {canLinkQuickBooks && sessionToken && accountId ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setQbPickerOpen(true)}>
                Connect QuickBooks
              </button>
            ) : null}
          </div>
        ) : qb.length ? (
          <ul className="ad-card-list">
            {qb.map((link) => (
              <li key={link.id} className="ad-person-card">
                <div className="ad-connection-row">
                  <div>
                    <p className="ad-kicker">QuickBooks</p>
                    <strong>{qbConnectionDisplayName(link)}</strong>
                    <p className="muted">{qbConnectionStatusLabel(link)}</p>
                    {link.externalId ? <p className="muted ad-mono">Exact identity {link.externalId}</p> : null}
                  </div>
                  {canLinkQuickBooks ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDisconnect({ kind: "quickbooks", link })}
                    >
                      Disconnect
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {qb.length > 0 && canLinkQuickBooks && !qbPickerOpen ? (
          <div className="ad-connection-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQbPickerOpen(true)}>
              Connect another QuickBooks customer
            </button>
          </div>
        ) : null}
        {qbPickerOpen && sessionToken && accountId && canLinkQuickBooks ? (
          <QuickBooksCustomerPicker
            sessionToken={sessionToken}
            accountId={accountId}
            accountName={directoryName}
            onLinked={(detail) => {
              setQbPickerOpen(false);
              onChanged?.(detail, { kind: "quickbooks" });
            }}
            onCancel={() => setQbPickerOpen(false)}
          />
        ) : null}
      </section>

      <section className="ad-section">
        <header className="ad-section-head">
          <p className="ad-kicker">Connections</p>
          <h3>Moraware</h3>
          <p className="muted">
            Exact Moraware Account IDs only. One directory account may have several Moraware identities.
          </p>
        </header>
        {!moraware.length && !mwFindOpen ? (
          <div className="ad-empty-state">
            <p>Not connected to Moraware.</p>
            {canLinkMoraware && sessionToken && accountId ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void findMoraware()}>
                Find Moraware connection
              </button>
            ) : null}
          </div>
        ) : moraware.length ? (
          <ul className="ad-card-list">
            {moraware.map((link) => (
              <li key={link.id} className="ad-person-card">
                <div className="ad-connection-row">
                  <div>
                    <p className="ad-kicker">Moraware</p>
                    <strong>{link.externalDisplayName || "Moraware account"}</strong>
                    <p className="muted">Connected</p>
                    {link.externalId ? <p className="muted ad-mono">Account ID {link.externalId}</p> : null}
                  </div>
                  {canLinkMoraware ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDisconnect({ kind: "moraware", link })}
                    >
                      Disconnect
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {(moraware.length > 0 || mwFindOpen) && canLinkMoraware && !mwFindOpen ? (
          <div className="ad-connection-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void findMoraware()}>
              Find Moraware connection
            </button>
          </div>
        ) : null}
        {mwFindOpen ? (
          <div className="ad-mw-find" data-ad-mw-find="true">
            {mwBusy ? <p className="muted">Loading governed Moraware candidates…</p> : null}
            {mwError ? (
              <div className="banner banner-error" role="alert">
                {mwError}
              </div>
            ) : null}
            {!mwBusy && mwCandidates && mwCandidates.length === 0 ? (
              <p className="muted">
                No governed Moraware candidates for this account. Use Moraware Review for unmatched or conflicted
                identities.
              </p>
            ) : null}
            {!mwSelected && mwCandidates && mwCandidates.length > 0 ? (
              <ul className="ad-picker-results" role="listbox" aria-label="Moraware candidates">
                {mwCandidates.map((row) => (
                  <li key={row.morawareAccountId}>
                    <button type="button" className="ad-picker-hit" onClick={() => setMwSelected(row)}>
                      <strong>{row.morawareName}</strong>
                      <span className="muted">
                        {row.classification === "HIGH_CONFIDENCE_CANDIDATE" ? "High confidence" : "Needs review"} · ID{" "}
                        {row.morawareAccountId}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {mwSelected ? (
              <div className="ad-confirm-card" data-ad-mw-confirm="true">
                <p className="ad-kicker">Confirm connection</p>
                <dl className="ad-identity-meta">
                  <div>
                    <dt>Account Directory</dt>
                    <dd>{directoryName}</dd>
                  </div>
                  <div>
                    <dt>Moraware</dt>
                    <dd>
                      {mwSelected.morawareName}
                      <span className="muted"> · ID {mwSelected.morawareAccountId}</span>
                    </dd>
                  </div>
                </dl>
                <p className="muted">Fuzzy name matching is suggestion only. This stores the exact Moraware Account ID.</p>
                <div className="ad-connection-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={actionBusy}
                    onClick={() => setMwSelected(null)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={actionBusy}
                    onClick={() => void confirmMoraware()}
                  >
                    {actionBusy ? "Connecting…" : "Connect Moraware"}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="ad-connection-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  mwAbortRef.current?.abort();
                  setMwFindOpen(false);
                  setMwSelected(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {other.length ? (
        <section className="ad-section">
          <header className="ad-section-head">
            <p className="ad-kicker">Other systems</p>
            <h3>Additional exact links</h3>
          </header>
          <ul className="ad-card-list">
            {other.map((link) => (
              <li key={link.id} className="ad-person-card">
                <strong>{link.system || "External system"}</strong>
                <p className="muted">{link.externalDisplayName || "Connected"}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="ad-section">
        <header className="ad-section-head">
          <p className="ad-kicker">Identity</p>
          <h3>Aliases</h3>
        </header>
        {!aliases?.length ? (
          <div className="ad-empty-state">
            <p>No aliases on file.</p>
          </div>
        ) : (
          <ul className="ad-card-list">
            {(aliases || []).map((a) => (
              <li key={a.id} className="ad-person-card">
                <strong>{a.alias}</strong>
                {a.source ? <p className="muted">Source: {a.source}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      {canViewAudit ? (
      <section className="ad-section">
        <header className="ad-section-head">
          <p className="ad-kicker">Audit</p>
          <h3>Directory activity</h3>
        </header>
        {!auditHistory?.length ? (
          <div className="ad-empty-state">
            <p>No directory activity recorded yet.</p>
          </div>
        ) : (
          <ol className="activity-list" aria-label="Account activity">
            {(auditHistory || []).map((entry) => (
              <li key={entry.id} className="activity-item">
                <span className="activity-dot" aria-hidden="true" />
                <div>
                  <div className="activity-label">{activityLabel(entry.action)}</div>
                  <div className="activity-meta">{[entry.at, entry.actor, entry.detail].filter(Boolean).join(" · ")}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      ) : null}

      {actionError ? (
        <div className="banner banner-error" role="alert">
          {actionError}
        </div>
      ) : null}

      {disconnect ? (
        <div className="modal-backdrop" data-ad-modal="true" role="presentation" onClick={() => setDisconnect(null)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ad-disconnect-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <h2 id="ad-disconnect-title">
                {disconnect.kind === "quickbooks" ? QB_DISCONNECT_TITLE : MW_DISCONNECT_TITLE}
              </h2>
            </header>
            <p>{disconnect.kind === "quickbooks" ? QB_DISCONNECT_BODY : MW_DISCONNECT_BODY}</p>
            <footer className="modal-foot">
              <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={() => setDisconnect(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" disabled={actionBusy} onClick={() => void confirmDisconnect()}>
                {actionBusy ? "Disconnecting…" : "Disconnect"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
