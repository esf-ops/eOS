import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiGetJson, apiPostJson } from "@quote-lib/api";
import {
  jobInfoFieldsFromSnapshot,
  liveAccountDiffersFromSnapshot
} from "../../lib/accountDirectoryEstimate.mjs";

type LookupItem = {
  id: string;
  displayName?: string | null;
  legalName?: string | null;
  status?: string | null;
  primaryContact?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  city?: string | null;
  state?: string | null;
  quickbooksLinked?: boolean;
};

type ContactOpt = {
  id: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
};

type LocationOpt = {
  id: string;
  label?: string | null;
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  isPrimary?: boolean;
};

export type AccountDirectoryEstimateSelection = {
  accountId: string | null;
  contactId: string | null;
  locationId: string | null;
  snapshot: Record<string, unknown> | null;
  account: LookupItem | null;
  explicitRelink: boolean;
  refreshIdentity: boolean;
};

type Props = {
  sessionToken: string;
  selection: AccountDirectoryEstimateSelection;
  onSelectionChange: (next: AccountDirectoryEstimateSelection) => void;
  onApplyJobInfo: (fields: ReturnType<typeof jobInfoFieldsFromSnapshot>) => void;
  accountDirectoryUrl?: string;
};

const EMPTY: AccountDirectoryEstimateSelection = {
  accountId: null,
  contactId: null,
  locationId: null,
  snapshot: null,
  account: null,
  explicitRelink: false,
  refreshIdentity: false
};

export default function AccountDirectoryEstimatePanel({
  sessionToken,
  selection,
  onSelectionChange,
  onApplyJobInfo,
  accountDirectoryUrl
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LookupItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canCreateProspect, setCanCreateProspect] = useState(false);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [liveDiffers, setLiveDiffers] = useState(false);
  const [prospectOpen, setProspectOpen] = useState(false);
  const [prospectName, setProspectName] = useState("");
  const [prospectBusy, setProspectBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortGen = useRef(0);

  const clearSelection = useCallback(() => {
    // explicitRelink so Update Existing can persist an intentional unlink
    onSelectionChange({ ...EMPTY, explicitRelink: true });
    setContacts([]);
    setLocations([]);
    setLiveDiffers(false);
    setQuery("");
    setResults([]);
  }, [onSelectionChange]);

  const applyDetail = useCallback(
    (detail: {
      account: LookupItem;
      contacts: ContactOpt[];
      locations: LocationOpt[];
      primaryContact?: ContactOpt | null;
      primaryLocation?: LocationOpt | null;
      draftSnapshot?: Record<string, unknown> | null;
    }, opts?: { explicitRelink?: boolean; refreshIdentity?: boolean }) => {
      const contact = detail.primaryContact || detail.contacts[0] || null;
      const location = detail.primaryLocation || detail.locations[0] || null;
      const snapshot = detail.draftSnapshot || null;
      setContacts(detail.contacts || []);
      setLocations(detail.locations || []);
      const next: AccountDirectoryEstimateSelection = {
        accountId: detail.account.id,
        contactId: contact?.id || null,
        locationId: location?.id || null,
        snapshot,
        account: detail.account,
        explicitRelink: Boolean(opts?.explicitRelink),
        refreshIdentity: Boolean(opts?.refreshIdentity)
      };
      onSelectionChange(next);
      onApplyJobInfo(jobInfoFieldsFromSnapshot(snapshot));
      setLiveDiffers(false);
    },
    [onApplyJobInfo, onSelectionChange]
  );

  const loadAccount = useCallback(
    async (accountId: string, opts?: { explicitRelink?: boolean; refreshIdentity?: boolean }) => {
      setBusy(true);
      setError(null);
      try {
        const res = (await apiGetJson(
          `/api/internal-quotes/account-lookup/${encodeURIComponent(accountId)}`,
          sessionToken
        )) as {
          account: LookupItem;
          contacts: ContactOpt[];
          locations: LocationOpt[];
          primaryContact?: ContactOpt | null;
          primaryLocation?: LocationOpt | null;
          draftSnapshot?: Record<string, unknown> | null;
        };
        applyDetail(res, opts);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load account.");
      } finally {
        setBusy(false);
      }
    },
    [applyDetail, sessionToken]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const gen = ++abortGen.current;
      setBusy(true);
      setError(null);
      try {
        const res = (await apiGetJson(
          `/api/internal-quotes/account-lookup?q=${encodeURIComponent(q)}&limit=20`,
          sessionToken
        )) as {
          items?: LookupItem[];
          permissions?: { canCreateProspect?: boolean };
        };
        if (gen !== abortGen.current) return;
        setResults(Array.isArray(res.items) ? res.items : []);
        setCanCreateProspect(Boolean(res.permissions?.canCreateProspect));
      } catch (e) {
        if (gen !== abortGen.current) return;
        setError(e instanceof Error ? e.message : "Account search failed.");
        setResults([]);
      } finally {
        if (gen === abortGen.current) setBusy(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, sessionToken]);

  useEffect(() => {
    if (!selection.accountId || !selection.snapshot) {
      setLiveDiffers(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = (await apiGetJson(
          `/api/internal-quotes/account-lookup/${encodeURIComponent(selection.accountId!)}`,
          sessionToken
        )) as { account: LookupItem; contacts: ContactOpt[]; locations: LocationOpt[] };
        if (cancelled) return;
        setContacts(res.contacts || []);
        setLocations(res.locations || []);
        setLiveDiffers(liveAccountDiffersFromSnapshot(selection.snapshot, res.account));
      } catch {
        /* live compare is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection.accountId, selection.snapshot, sessionToken]);

  const rebuildSnapshot = useCallback(
    async (contactId: string | null, locationId: string | null, refresh: boolean) => {
      if (!selection.accountId) return;
      setBusy(true);
      setError(null);
      try {
        const res = (await apiPostJson(
          `/api/internal-quotes/account-lookup/${encodeURIComponent(selection.accountId)}/snapshot`,
          sessionToken,
          { contactId, locationId }
        )) as { draftSnapshot?: Record<string, unknown>; account?: LookupItem };
        const snapshot = res.draftSnapshot || null;
        onSelectionChange({
          ...selection,
          contactId,
          locationId,
          snapshot,
          account: res.account || selection.account,
          refreshIdentity: refresh,
          explicitRelink: selection.explicitRelink
        });
        onApplyJobInfo(jobInfoFieldsFromSnapshot(snapshot));
        setLiveDiffers(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not refresh customer snapshot.");
      } finally {
        setBusy(false);
      }
    },
    [onApplyJobInfo, onSelectionChange, selection, sessionToken]
  );

  const createProspect = useCallback(async () => {
    const name = prospectName.trim();
    if (!name) return;
    setProspectBusy(true);
    setError(null);
    try {
      const res = (await apiPostJson(`/api/internal-quotes/account-lookup/prospects`, sessionToken, {
        displayName: name
      })) as {
        account: LookupItem;
        contacts: ContactOpt[];
        locations: LocationOpt[];
        primaryContact?: ContactOpt | null;
        primaryLocation?: LocationOpt | null;
        draftSnapshot?: Record<string, unknown> | null;
      };
      applyDetail(res, { explicitRelink: true, refreshIdentity: true });
      setProspectOpen(false);
      setProspectName("");
      setQuery("");
      setResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create prospect.");
    } finally {
      setProspectBusy(false);
    }
  }, [applyDetail, prospectName, sessionToken]);

  const status = String(selection.account?.status || selection.snapshot?.accountStatus || "");
  const qbLinked = Boolean(
    selection.account?.quickbooksLinked ?? selection.snapshot?.quickbooksLinked
  );

  return (
    <div className="ie-job-group ie-account-directory-panel">
      <p className="ie-job-group-head">Account Directory</p>
      <p className="ie-section-meta" style={{ marginTop: 0 }}>
        Link a canonical organization. The estimate freezes customer identity at save time.
      </p>

      {!selection.accountId ? (
        <div className="ie-ad-unlinked">
          <span className="ie-ad-badge ie-ad-badge-muted">Unlinked customer</span>
          <label>
            Search Account Directory
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search account, contact, email, phone, city…"
              aria-label="Search Account Directory"
              autoComplete="off"
            />
          </label>
          {busy ? <p className="muted" aria-live="polite">Searching…</p> : null}
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          {query.trim().length >= 2 && !busy && results.length === 0 ? (
            <p className="muted">No matching accounts.</p>
          ) : null}
          {results.length > 0 ? (
            <ul className="ie-ad-results" role="listbox" aria-label="Account search results">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="ie-ad-result"
                    onClick={() => loadAccount(item.id, { explicitRelink: true, refreshIdentity: true })}
                  >
                    <strong>{item.displayName}</strong>
                    <span className="muted">
                      {[item.status, item.primaryContact, [item.city, item.state].filter(Boolean).join(", ")]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className={`ie-ad-badge ${item.quickbooksLinked ? "ie-ad-badge-ok" : "ie-ad-badge-muted"}`}>
                      {item.quickbooksLinked ? "QuickBooks Linked" : "QuickBooks Not Linked"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {canCreateProspect ? (
            <div className="ie-ad-prospect">
              {!prospectOpen ? (
                <button type="button" className="btn ghost" onClick={() => setProspectOpen(true)}>
                  Create prospect
                </button>
              ) : (
                <div className="ie-ad-prospect-form">
                  <label>
                    Prospect name
                    <input
                      value={prospectName}
                      onChange={(e) => setProspectName(e.target.value)}
                      placeholder="New prospect organization"
                    />
                  </label>
                  <button type="button" className="btn" disabled={prospectBusy || !prospectName.trim()} onClick={createProspect}>
                    {prospectBusy ? "Creating…" : "Save prospect"}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setProspectOpen(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="muted">
              To create a new prospect, open Account Directory with edit permission
              {accountDirectoryUrl ? (
                <>
                  {" "}
                  (
                  <a href={accountDirectoryUrl} target="_blank" rel="noreferrer">
                    Account Directory
                  </a>
                  )
                </>
              ) : null}
              .
            </p>
          )}
        </div>
      ) : (
        <div className="ie-ad-selected">
          <div className="ie-ad-selected-head">
            <div>
              <strong>{String(selection.snapshot?.accountDisplayName || selection.account?.displayName || "Account")}</strong>
              {selection.snapshot?.legalName &&
              selection.snapshot.legalName !== selection.snapshot.accountDisplayName ? (
                <div className="muted">{String(selection.snapshot.legalName)}</div>
              ) : null}
            </div>
            <div className="ie-ad-badges">
              <span className="ie-ad-badge">{status === "prospect" ? "Prospect" : "Account"}</span>
              <span className={`ie-ad-badge ${qbLinked ? "ie-ad-badge-ok" : "ie-ad-badge-muted"}`}>
                {qbLinked ? "QuickBooks Linked" : "QuickBooks Not Linked"}
              </span>
            </div>
          </div>

          {liveDiffers ? (
            <p className="ie-ad-notice" role="status">
              Live Account Directory data differs from this estimate&apos;s frozen snapshot. Use refresh
              before save if you want the draft updated.
            </p>
          ) : null}

          <div className="grid2 ie-job-grid">
            <label>
              Estimating contact
              <select
                value={selection.contactId || ""}
                aria-label="Estimating contact"
                onChange={(e) => rebuildSnapshot(e.target.value || null, selection.locationId, true)}
              >
                <option value="">No contact</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                    {c.isPrimary ? " (primary)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Account location
              <select
                value={selection.locationId || ""}
                aria-label="Account location"
                onChange={(e) => rebuildSnapshot(selection.contactId, e.target.value || null, true)}
              >
                <option value="">No location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {[l.label, l.line1, [l.city, l.state].filter(Boolean).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                    {l.isPrimary ? " (primary)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted ie-ad-location-note">
            Account location is the organization address — not the project/jobsite address below.
          </p>

          {selection.snapshot ? (
            <div className="ie-ad-snapshot-preview" aria-label="Customer information on estimate">
              <p className="ie-job-group-head">On this estimate</p>
              <dl className="ie-ad-snapshot-dl">
                <div>
                  <dt>Organization</dt>
                  <dd>{String(selection.snapshot.accountDisplayName || "—")}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{String(selection.snapshot.contactDisplayName || "—")}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{String(selection.snapshot.contactEmail || "—")}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{String(selection.snapshot.contactPhone || "—")}</dd>
                </div>
                <div>
                  <dt>Account address</dt>
                  <dd>
                    {[
                      selection.snapshot.addressLine1,
                      [selection.snapshot.city, selection.snapshot.state].filter(Boolean).join(", "),
                      selection.snapshot.postalCode
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          <div className="ie-ad-actions">
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => rebuildSnapshot(selection.contactId, selection.locationId, true)}
            >
              Refresh customer information from Account Directory
            </button>
            <button type="button" className="btn ghost" onClick={clearSelection}>
              Change account
            </button>
            {accountDirectoryUrl && selection.accountId ? (
              <a
                className="btn ghost"
                href={`${accountDirectoryUrl.replace(/\/$/, "")}/?account=${encodeURIComponent(selection.accountId)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open Account Directory
              </a>
            ) : null}
          </div>
          {error ? <p className="error-text" role="alert">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
