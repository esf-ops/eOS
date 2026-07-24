import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost, ApiError } from "../lib/api";

type LookupItem = {
  id: string;
  displayName?: string | null;
  legalName?: string | null;
  status?: string | null;
  primaryContact?: string | null;
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

export type StudioCustomerIdentitySnapshot = {
  accountId?: string;
  accountDisplayName?: string | null;
  accountStatus?: string | null;
  contactId?: string | null;
  contactDisplayName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  locationId?: string | null;
  locationLabel?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  quickbooksLinked?: boolean;
  snapshotAt?: string | null;
};

type ScopePatch = {
  customerName?: string;
  customerContactName?: string;
  customerEmail?: string;
  customerPhone?: string;
  projectAddress?: string;
  accountDirectoryAccountId?: string | null;
  accountDirectoryContactId?: string | null;
  accountDirectoryLocationId?: string | null;
  customerIdentitySnapshot?: StudioCustomerIdentitySnapshot | null;
  explicitAccountRelink?: boolean;
  refreshCustomerIdentity?: boolean;
  partnerAccountId?: string | null;
};

type Props = {
  sessionToken: string;
  blocked: boolean;
  scope: {
    customerName?: string;
    customerContactName?: string;
    customerEmail?: string;
    customerPhone?: string;
    projectAddress?: string;
    accountDirectoryAccountId?: string | null;
    accountDirectoryContactId?: string | null;
    accountDirectoryLocationId?: string | null;
    customerIdentitySnapshot?: StudioCustomerIdentitySnapshot | null;
  };
  patchScope: (patch: ScopePatch) => void;
};

function liveDiffers(
  snap: StudioCustomerIdentitySnapshot | null | undefined,
  account: LookupItem | null
): boolean {
  if (!snap || !account) return false;
  const a = String(snap.accountDisplayName || "")
    .trim()
    .toLowerCase();
  const b = String(account.displayName || "")
    .trim()
    .toLowerCase();
  if (a && b && a !== b) return true;
  const sa = String(snap.accountStatus || "")
    .trim()
    .toLowerCase();
  const sb = String(account.status || "")
    .trim()
    .toLowerCase();
  return Boolean(sa && sb && sa !== sb);
}

/**
 * Account Directory selector for Elite 100 Estimate Studio Pricing Setup.
 * Trusted partner pricing remains a separate control.
 */
export default function StudioAccountDirectoryPanel({
  sessionToken,
  blocked,
  scope,
  patchScope
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LookupItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [liveAccount, setLiveAccount] = useState<LookupItem | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortGen = useRef(0);

  const accountId = scope.accountDirectoryAccountId || null;
  const snapshot = scope.customerIdentitySnapshot || null;
  const linked = Boolean(accountId);

  const applyDetail = useCallback(
    (
      detail: {
        account: LookupItem;
        contacts: ContactOpt[];
        locations: LocationOpt[];
        primaryContact?: ContactOpt | null;
        primaryLocation?: LocationOpt | null;
        draftSnapshot?: StudioCustomerIdentitySnapshot | null;
      },
      opts?: { refresh?: boolean }
    ) => {
      const contact = detail.primaryContact || detail.contacts[0] || null;
      const location = detail.primaryLocation || detail.locations[0] || null;
      const snap = detail.draftSnapshot || null;
      setContacts(detail.contacts || []);
      setLocations(detail.locations || []);
      setLiveAccount(detail.account);
      patchScope({
        accountDirectoryAccountId: detail.account.id,
        accountDirectoryContactId: contact?.id || null,
        accountDirectoryLocationId: location?.id || null,
        customerIdentitySnapshot: snap,
        customerName: String(snap?.accountDisplayName || detail.account.displayName || ""),
        customerContactName: String(snap?.contactDisplayName || ""),
        customerEmail: String(snap?.contactEmail || ""),
        customerPhone: String(snap?.contactPhone || ""),
        projectAddress: [
          snap?.addressLine1,
          [snap?.city, snap?.state].filter(Boolean).join(", "),
          snap?.postalCode
        ]
          .filter(Boolean)
          .join(", ") || undefined,
        explicitAccountRelink: true,
        refreshCustomerIdentity: Boolean(opts?.refresh)
      });
      setQuery("");
      setResults([]);
    },
    [patchScope]
  );

  const loadAccount = useCallback(
    async (id: string, opts?: { refresh?: boolean }) => {
      setBusy(true);
      setError(null);
      try {
        const res = (await apiGet(
          `/api/elite100-estimate-studio/account-directory/${encodeURIComponent(id)}`,
          sessionToken
        )) as {
          account: LookupItem;
          contacts: ContactOpt[];
          locations: LocationOpt[];
          primaryContact?: ContactOpt | null;
          primaryLocation?: LocationOpt | null;
          draftSnapshot?: StudioCustomerIdentitySnapshot | null;
        };
        applyDetail(res, opts);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load account.");
      } finally {
        setBusy(false);
      }
    },
    [applyDetail, sessionToken]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2 || linked) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const gen = ++abortGen.current;
      setBusy(true);
      setError(null);
      try {
        const res = (await apiGet(
          `/api/elite100-estimate-studio/account-directory?q=${encodeURIComponent(q)}&limit=20`,
          sessionToken
        )) as { items?: LookupItem[] };
        if (gen !== abortGen.current) return;
        setResults(Array.isArray(res.items) ? res.items : []);
      } catch (e) {
        if (gen !== abortGen.current) return;
        setError(e instanceof ApiError ? e.message : "Account search failed.");
        setResults([]);
      } finally {
        if (gen === abortGen.current) setBusy(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, sessionToken, linked]);

  useEffect(() => {
    if (!accountId || !snapshot) {
      setLiveAccount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = (await apiGet(
          `/api/elite100-estimate-studio/account-directory/${encodeURIComponent(accountId)}`,
          sessionToken
        )) as { account: LookupItem; contacts: ContactOpt[]; locations: LocationOpt[] };
        if (cancelled) return;
        setLiveAccount(res.account);
        setContacts(res.contacts || []);
        setLocations(res.locations || []);
      } catch {
        /* best-effort live compare */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, snapshot, sessionToken]);

  const rebuildSnapshot = useCallback(
    async (contactId: string | null, locationId: string | null) => {
      if (!accountId) return;
      setBusy(true);
      setError(null);
      try {
        const res = (await apiPost(
          `/api/elite100-estimate-studio/account-directory/${encodeURIComponent(accountId)}/snapshot`,
          sessionToken,
          { contactId, locationId }
        )) as {
          draftSnapshot?: StudioCustomerIdentitySnapshot;
          account?: LookupItem;
        };
        const snap = res.draftSnapshot || null;
        patchScope({
          accountDirectoryAccountId: accountId,
          accountDirectoryContactId: contactId,
          accountDirectoryLocationId: locationId,
          customerIdentitySnapshot: snap,
          customerName: String(snap?.accountDisplayName || scope.customerName || ""),
          customerContactName: String(snap?.contactDisplayName || ""),
          customerEmail: String(snap?.contactEmail || ""),
          customerPhone: String(snap?.contactPhone || ""),
          refreshCustomerIdentity: true,
          explicitAccountRelink: false
        });
        if (res.account) setLiveAccount(res.account);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not refresh snapshot.");
      } finally {
        setBusy(false);
      }
    },
    [accountId, patchScope, scope.customerName, sessionToken]
  );

  const unlink = useCallback(() => {
    patchScope({
      accountDirectoryAccountId: null,
      accountDirectoryContactId: null,
      accountDirectoryLocationId: null,
      customerIdentitySnapshot: null,
      explicitAccountRelink: true,
      refreshCustomerIdentity: false
    });
    setContacts([]);
    setLocations([]);
    setLiveAccount(null);
    setQuery("");
    setResults([]);
  }, [patchScope]);

  const qbLinked = Boolean(snapshot?.quickbooksLinked ?? liveAccount?.quickbooksLinked);
  const status = String(snapshot?.accountStatus || liveAccount?.status || "");
  const differs = liveDiffers(snapshot, liveAccount);

  return (
    <div className="eq-account-directory" data-testid="eq-account-directory">
      <h4 className="eq-subsection-title">Account Directory</h4>
      <p className="eq-muted">
        Canonical customer/company identity. Trusted partner pricing below is separate and never
        granted by display-name match.
      </p>

      {!linked ? (
        <div>
          <span className="eq-pill eq-pill-muted" data-testid="eq-ad-unlinked">
            Customer not linked to Account Directory
          </span>
          <label>
            Search Account Directory
            <input
              type="search"
              value={query}
              disabled={blocked}
              placeholder="Company, contact, email, phone, city…"
              data-testid="eq-ad-search"
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </label>
          {busy ? <p className="eq-muted">Searching…</p> : null}
          {error ? (
            <p className="eq-error" role="alert">
              {error}
            </p>
          ) : null}
          {query.trim().length >= 2 && !busy && results.length === 0 ? (
            <p className="eq-muted">No matching accounts.</p>
          ) : null}
          {results.length > 0 ? (
            <div className="eq-account-options" role="listbox" aria-label="Account Directory results">
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="eq-btn-ghost"
                  disabled={blocked}
                  data-testid={`eq-ad-result-${item.id}`}
                  onClick={() => void loadAccount(item.id, { refresh: true })}
                >
                  <strong>{item.displayName}</strong>
                  <span className="eq-muted">
                    {" "}
                    · {[item.status, item.primaryContact, [item.city, item.state].filter(Boolean).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="eq-pill">
                    {item.quickbooksLinked ? "QuickBooks Linked" : "QuickBooks Not Linked"}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="eq-ad-selected-head">
            <strong data-testid="eq-ad-selected-name">
              {String(snapshot?.accountDisplayName || scope.customerName || "Account")}
            </strong>
            <span className="eq-pill" data-testid="eq-ad-linked">
              Account Directory linked
            </span>
            <span className="eq-pill">{status === "prospect" ? "Prospect" : "Account"}</span>
            <span className={`eq-pill ${qbLinked ? "eq-pill-ok" : "eq-pill-muted"}`}>
              {qbLinked ? "QuickBooks Linked" : "QuickBooks Not Linked"}
            </span>
          </div>
          {differs ? (
            <p className="eq-notice" role="status" data-testid="eq-ad-changed-notice">
              Account Directory information has changed. Refresh only updates this draft before save —
              it does not rewrite already-published Digital Estimates.
            </p>
          ) : null}
          <div className="eq-scope-grid">
            <label>
              Estimating contact
              <select
                value={scope.accountDirectoryContactId || ""}
                disabled={blocked}
                data-testid="eq-ad-contact"
                onChange={(e) =>
                  void rebuildSnapshot(e.target.value || null, scope.accountDirectoryLocationId || null)
                }
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
                value={scope.accountDirectoryLocationId || ""}
                disabled={blocked}
                data-testid="eq-ad-location"
                onChange={(e) =>
                  void rebuildSnapshot(scope.accountDirectoryContactId || null, e.target.value || null)
                }
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
          <p className="eq-footnote">
            Account location is the organization address. Project Name stays separate; jobsites may
            differ.
          </p>
          <div className="eq-action-row">
            <button
              type="button"
              className="eq-btn-secondary"
              disabled={blocked || busy}
              data-testid="eq-ad-refresh"
              onClick={() => void loadAccount(accountId!, { refresh: true })}
            >
              Refresh Customer Information
            </button>
            <button
              type="button"
              className="eq-btn-ghost"
              disabled={blocked}
              data-testid="eq-ad-unlink"
              onClick={unlink}
            >
              Change / unlink account
            </button>
          </div>
          {error ? (
            <p className="eq-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
