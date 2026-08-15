import { useMemo, useState } from "react";
import { ApiError } from "../lib/api";
import { updateContact, updateLocation } from "../lib/accountDirectoryApi";
import { activityLabel } from "../lib/accountDirectoryWorkspace";
import type { AccountContact, AccountDetail, AccountLocation } from "../lib/types";

const LOCATION_TYPES = ["account", "billing", "shipping", "other"] as const;

export function ContactsMaintain({
  sessionToken,
  accountId,
  contacts,
  canEdit,
  onChanged,
  onAdd
}: {
  sessionToken: string | null;
  accountId: string;
  contacts: AccountContact[];
  canEdit: boolean;
  onChanged: (detail: AccountDetail) => void;
  onAdd: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccountContact | null>(null);
  const active = useMemo(() => contacts.filter((c) => c.isActive !== false), [contacts]);
  const former = useMemo(() => contacts.filter((c) => c.isActive === false), [contacts]);

  async function patch(contact: AccountContact, payload: Record<string, unknown>) {
    if (!sessionToken) return;
    setBusyId(contact.id);
    setError(null);
    try {
      const res = await updateContact(sessionToken, accountId, contact.id, {
        ...payload,
        rowVersion: contact.rowVersion
      });
      if (res.account) onChanged(res.account);
      setEditing(null);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Could not update contact.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="ad-toolbar-row">
        <h3>Contacts</h3>
        {canEdit ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAdd}>
            Add contact
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      {!active.length ? (
        <div className="ad-empty-state">
          <h3>No active contacts</h3>
          <p>Add a contact to keep estimating and collections conversations attached to this account.</p>
        </div>
      ) : null}
      <ul className="ad-card-list">
        {active.map((c) => (
          <li key={c.id} className="ad-person-card">
            <div>
              <strong>{c.name}</strong>
              {c.isPrimary ? <span className="chip">Primary estimating</span> : null}
              {c.contactType ? <span className="chip chip-muted">{c.contactType}</span> : null}
              {c.role ? <p className="muted">{c.role}</p> : null}
            </div>
            <div className="ad-person-links">
              {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="muted">Email unavailable</span>}
              {c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : <span className="muted">Phone unavailable</span>}
            </div>
            {canEdit ? (
              <div className="ad-inline-actions">
                <button type="button" className="btn btn-ghost btn-sm" disabled={busyId === c.id} onClick={() => setEditing(c)}>
                  Edit
                </button>
                {!c.isPrimary ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === c.id}
                    onClick={() => void patch(c, { isPrimary: true })}
                  >
                    Make primary estimating
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyId === c.id}
                  onClick={() => void patch(c, { isActive: false })}
                >
                  Deactivate
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {former.length ? (
        <details className="ad-former">
          <summary>Former contacts ({former.length})</summary>
          <ul className="ad-card-list">
            {former.map((c) => (
              <li key={c.id} className="ad-person-card ad-person-inactive">
                <div>
                  <strong>{c.name}</strong>
                  <span className="chip chip-muted">Inactive</span>
                  {c.role ? <p className="muted">{c.role}</p> : null}
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === c.id}
                    onClick={() => void patch(c, { isActive: true })}
                  >
                    Reactivate
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {editing ? (
        <ContactEditDialog
          contact={editing}
          busy={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={(payload) => void patch(editing, payload)}
        />
      ) : null}
    </div>
  );
}

function ContactEditDialog({
  contact,
  busy,
  onClose,
  onSave
}: {
  contact: AccountContact;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(contact.name || "");
  const [role, setRole] = useState(contact.role || "");
  const [email, setEmail] = useState(contact.email || "");
  const [phone, setPhone] = useState(contact.phone || "");
  const [contactType, setContactType] = useState(contact.contactType || "");
  return (
    <div className="ad-evidence-backdrop" data-ad-child-modal="true" onClick={onClose}>
      <div className="ad-evidence-panel" role="dialog" aria-modal="true" aria-label="Edit contact" onClick={(e) => e.stopPropagation()}>
        <header className="ad-evidence-head">
          <h3>Edit contact</h3>
          <button type="button" className="profile-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <label className="field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Role / title
          <input value={role} onChange={(e) => setRole(e.target.value)} />
        </label>
        <label className="field">
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="field">
          Contact type
          <input value={contactType} onChange={(e) => setContactType(e.target.value)} placeholder="Optional" />
        </label>
        <footer className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !name.trim()}
            onClick={() => onSave({ name: name.trim(), role, email, phone, contactType })}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

export function LocationsMaintain({
  sessionToken,
  accountId,
  locations,
  canEdit,
  onChanged,
  onAdd
}: {
  sessionToken: string | null;
  accountId: string;
  locations: AccountLocation[];
  canEdit: boolean;
  onChanged: (detail: AccountDetail) => void;
  onAdd: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccountLocation | null>(null);
  const active = useMemo(() => locations.filter((l) => l.isActive !== false), [locations]);
  const former = useMemo(() => locations.filter((l) => l.isActive === false), [locations]);

  async function patch(location: AccountLocation, payload: Record<string, unknown>) {
    if (!sessionToken) return;
    setBusyId(location.id);
    setError(null);
    try {
      const res = await updateLocation(sessionToken, accountId, location.id, {
        ...payload,
        rowVersion: location.rowVersion
      });
      if (res.account) onChanged(res.account);
      setEditing(null);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Could not update location.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="ad-toolbar-row">
        <h3>Locations</h3>
        {canEdit ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAdd}>
            Add location
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      {!active.length ? (
        <div className="ad-empty-state">
          <h3>No active locations</h3>
          <p>Add a billing, shipping, or account location so this customer has a governed address on file.</p>
        </div>
      ) : null}
      <ul className="ad-card-list">
        {active.map((l) => (
          <li key={l.id} className="ad-person-card">
            <div>
              <strong>{l.label || l.line1 || "Location"}</strong>
              {l.isPrimary ? <span className="chip">Primary</span> : null}
              {l.locationType ? <span className="chip chip-muted">{l.locationType}</span> : null}
              <p className="muted">
                {[l.line1, l.line2, [l.city, l.state].filter(Boolean).join(", "), l.postalCode].filter(Boolean).join(" · ")}
              </p>
            </div>
            {canEdit ? (
              <div className="ad-inline-actions">
                <button type="button" className="btn btn-ghost btn-sm" disabled={busyId === l.id} onClick={() => setEditing(l)}>
                  Edit
                </button>
                {!l.isPrimary ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === l.id}
                    onClick={() => void patch(l, { isPrimary: true })}
                  >
                    Make primary
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyId === l.id}
                  onClick={() => void patch(l, { isActive: false })}
                >
                  Deactivate
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {former.length ? (
        <details className="ad-former">
          <summary>Former locations ({former.length})</summary>
          <ul className="ad-card-list">
            {former.map((l) => (
              <li key={l.id} className="ad-person-card ad-person-inactive">
                <strong>{l.label || l.line1 || "Location"}</strong>
                <span className="chip chip-muted">Inactive</span>
                {canEdit ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void patch(l, { isActive: true })}>
                    Reactivate
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {editing ? (
        <LocationEditDialog
          location={editing}
          busy={busyId === editing.id}
          onClose={() => setEditing(null)}
          onSave={(payload) => void patch(editing, payload)}
        />
      ) : null}
    </div>
  );
}

function LocationEditDialog({
  location,
  busy,
  onClose,
  onSave
}: {
  location: AccountLocation;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [label, setLabel] = useState(location.label || "");
  const [line1, setLine1] = useState(location.line1 || "");
  const [line2, setLine2] = useState(location.line2 || "");
  const [city, setCity] = useState(location.city || "");
  const [state, setState] = useState(location.state || "");
  const [postalCode, setPostalCode] = useState(location.postalCode || "");
  const [locationType, setLocationType] = useState(location.locationType || "account");
  return (
    <div className="ad-evidence-backdrop" data-ad-child-modal="true" onClick={onClose}>
      <div className="ad-evidence-panel" role="dialog" aria-modal="true" aria-label="Edit location" onClick={(e) => e.stopPropagation()}>
        <header className="ad-evidence-head">
          <h3>Edit location</h3>
          <button type="button" className="profile-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <label className="field">
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="field">
          Address
          <input value={line1} onChange={(e) => setLine1(e.target.value)} />
        </label>
        <label className="field">
          Address line 2
          <input value={line2} onChange={(e) => setLine2(e.target.value)} />
        </label>
        <label className="field">
          City
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="field">
          State
          <input value={state} onChange={(e) => setState(e.target.value)} />
        </label>
        <label className="field">
          Postal code
          <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </label>
        <label className="field">
          Type
          <select value={locationType} onChange={(e) => setLocationType(e.target.value)}>
            {LOCATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <footer className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onSave({ label, line1, line2, city, state, postalCode, locationType })}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

export function ConnectionsWithIdentity({
  links,
  aliases,
  auditHistory
}: {
  links: AccountDetail["externalLinks"];
  aliases: AccountDetail["aliases"];
  auditHistory: AccountDetail["auditHistory"];
}) {
  return (
    <div className="ad-connections">
      <section className="ad-section">
        <header className="ad-section-head">
          <p className="ad-kicker">QuickBooks</p>
          <h3>Linkage</h3>
        </header>
        {!links?.length ? (
          <div className="ad-empty-state">
            <p>No QuickBooks or external links on file for this account.</p>
          </div>
        ) : (
          <ul className="ad-card-list">
            {(links || []).map((link) => (
              <li key={link.id} className="ad-person-card">
                <strong>{link.system || "External system"}</strong>
                <p className="muted">
                  {[link.isActive === false ? "Inactive" : "Linked", link.externalDisplayName].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
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
    </div>
  );
}
