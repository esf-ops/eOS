import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGetJson, apiPatchJson, apiPostJson, ApiError } from "@quote-lib/api";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

type Props = {
  sessionToken: string | null;
  onMessage: (msg: string | null) => void;
  onError: (err: string | null) => void;
};

export default function PartnerSetupTab({ sessionToken, onMessage, onError }: Props) {
  const [org, setOrg] = useState<Row | null>(null);
  const [partners, setPartners] = useState<Row[]>([]);
  const [structures, setStructures] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [setup, setSetup] = useState<Row | null>(null);
  const [branding, setBranding] = useState<Row | null>(null);
  const [userAccess, setUserAccess] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [contextCheck, setContextCheck] = useState<Row | null>(null);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("builder");
  const [newSlug, setNewSlug] = useState("");
  const [newDisplay, setNewDisplay] = useState("");

  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDisplay, setEditDisplay] = useState("");
  const [editStatus, setEditStatus] = useState("active");

  const [assignStructureId, setAssignStructureId] = useState("");
  const [brandDisplay, setBrandDisplay] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [brandPrimary, setBrandPrimary] = useState("");
  const [brandSecondary, setBrandSecondary] = useState("");
  const [brandFooter, setBrandFooter] = useState("");
  const [brandTerms, setBrandTerms] = useState("");

  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("partner_admin");

  const selected = useMemo(() => partners.find((p) => str(p.id) === selectedId) ?? null, [partners, selectedId]);

  const loadOrgAndLists = useCallback(async () => {
    if (!sessionToken) return;
    setBusy(true);
    onError(null);
    try {
      const [orgRes, partRes, structRes] = await Promise.all([
        apiGetJson("/api/pricing-admin/partner-setup/organization", sessionToken) as Promise<{ organization?: Row }>,
        apiGetJson("/api/pricing-admin/partner-setup/partners", sessionToken) as Promise<{ rows?: Row[] }>,
        apiGetJson("/api/pricing-admin/partner-setup/pricing-structures", sessionToken) as Promise<{ rows?: Row[] }>
      ]);
      setOrg(orgRes.organization ?? null);
      setPartners(Array.isArray(partRes.rows) ? partRes.rows : []);
      setStructures(Array.isArray(structRes.rows) ? structRes.rows : []);
    } catch (e: unknown) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [sessionToken, onError]);

  const loadPartnerDetail = useCallback(
    async (id: string) => {
      if (!sessionToken || !id) return;
      setBusy(true);
      onError(null);
      try {
        const [st, br, ua] = await Promise.all([
          apiGetJson(`/api/pricing-admin/partner-setup/partners/${id}/setup-status`, sessionToken) as Promise<{
            setup?: Row;
            partner?: Row;
          }>,
          apiGetJson(`/api/pricing-admin/partner-setup/partners/${id}/branding`, sessionToken) as Promise<{ row?: Row | null }>,
          apiGetJson(`/api/pricing-admin/partner-setup/partners/${id}/user-access`, sessionToken) as Promise<{ rows?: Row[] }>
        ]);
        setSetup(st.setup ?? null);
        const brow = br.row ?? null;
        setBranding(brow);
        setBrandDisplay(str(brow?.display_name_override));
        setBrandLogo(str(brow?.logo_url));
        setBrandPrimary(str(brow?.primary_color));
        setBrandSecondary(str(brow?.secondary_color));
        setBrandFooter(str(brow?.footer_text));
        setBrandTerms(str(brow?.terms_text));
        setUserAccess(Array.isArray(ua.rows) ? ua.rows : []);
        const p = st.partner ?? selected;
        if (p) {
          setEditName(str(p.account_name));
          setEditType(str(p.account_type) || "builder");
          setEditSlug(str(p.account_slug));
          setEditDisplay(str(p.display_name));
          setEditStatus(str(p.status) || (p.is_active === false ? "inactive" : "active"));
        }
        const asn = (p as Row)?.current_pricing_assignment as Row | undefined;
        const ps = asn?.pricing_structure as Row | undefined;
        if (ps?.id) setAssignStructureId(str(ps.id));
      } catch (e: unknown) {
        onError(e instanceof ApiError ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [sessionToken, onError, selected]
  );

  useEffect(() => {
    void loadOrgAndLists();
  }, [loadOrgAndLists]);

  useEffect(() => {
    if (selectedId) void loadPartnerDetail(selectedId);
    else {
      setSetup(null);
      setBranding(null);
      setUserAccess([]);
      setContextCheck(null);
    }
  }, [selectedId, loadPartnerDetail]);

  const createPartner = async () => {
    if (!sessionToken) return;
    if (!newName.trim()) {
      onError("Account name is required.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const res = (await apiPostJson("/api/pricing-admin/partner-setup/partners", sessionToken, {
        account_name: newName.trim(),
        account_type: newType,
        account_slug: newSlug.trim() || undefined,
        display_name: newDisplay.trim() || undefined,
        status: "active"
      })) as { row?: Row };
      onMessage(`Created partner ${str(res.row?.account_name || newName)}.`);
      setNewName("");
      setNewSlug("");
      setNewDisplay("");
      await loadOrgAndLists();
      if (res.row?.id) setSelectedId(str(res.row.id));
    } catch (e: unknown) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const savePartner = async () => {
    if (!sessionToken || !selectedId) return;
    setBusy(true);
    onError(null);
    try {
      await apiPatchJson(`/api/pricing-admin/partner-setup/partners/${selectedId}`, sessionToken, {
        account_name: editName.trim(),
        account_type: editType,
        account_slug: editSlug.trim() || null,
        display_name: editDisplay.trim() || null,
        status: editStatus
      });
      onMessage("Partner account saved.");
      await loadOrgAndLists();
      await loadPartnerDetail(selectedId);
    } catch (e: unknown) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const assignPricing = async () => {
    if (!sessionToken || !selectedId || !assignStructureId) return;
    if (!window.confirm("Replace the active pricing assignment for this partner?")) return;
    setBusy(true);
    onError(null);
    try {
      await apiPostJson(`/api/pricing-admin/partner-setup/partners/${selectedId}/pricing-assignment`, sessionToken, {
        pricing_structure_id: assignStructureId
      });
      onMessage("Pricing assignment updated.");
      await loadOrgAndLists();
      await loadPartnerDetail(selectedId);
    } catch (e: unknown) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveBranding = async () => {
    if (!sessionToken || !selectedId) return;
    setBusy(true);
    onError(null);
    try {
      await apiPostJson(`/api/pricing-admin/partner-setup/partners/${selectedId}/branding`, sessionToken, {
        display_name_override: brandDisplay.trim() || null,
        logo_url: brandLogo.trim() || null,
        primary_color: brandPrimary.trim() || null,
        secondary_color: brandSecondary.trim() || null,
        footer_text: brandFooter.trim() || null,
        terms_text: brandTerms.trim() || null
      });
      onMessage("Branding saved (optional).");
      await loadPartnerDetail(selectedId);
    } catch (e: unknown) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addUserAccess = async () => {
    if (!sessionToken || !selectedId || !userEmail.trim()) return;
    setBusy(true);
    onError(null);
    try {
      const res = (await apiPostJson(`/api/pricing-admin/partner-setup/partners/${selectedId}/user-access`, sessionToken, {
        email: userEmail.trim(),
        role: userRole,
        grant_partner_quote_head: true
      })) as { partner_quote_head?: Row };
      const granted = res.partner_quote_head as { granted?: boolean } | undefined;
      onMessage(
        granted?.granted
          ? `Assigned ${userEmail} and granted partner_quote head.`
          : `Assigned ${userEmail} (partner_quote head already present).`
      );
      setUserEmail("");
      await loadPartnerDetail(selectedId);
    } catch (e: unknown) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runContextCheck = async () => {
    if (!sessionToken || !selectedId) return;
    setBusy(true);
    onError(null);
    try {
      const res = (await apiPostJson(
        `/api/pricing-admin/partner-setup/partners/${selectedId}/check-context`,
        sessionToken,
        {}
      )) as { setup?: Row };
      setContextCheck(res.setup ?? null);
      setSetup(res.setup ?? setup);
      onMessage("Partner context readiness check completed (server-side).");
    } catch (e: unknown) {
      onError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const checks = (setup?.checks ?? contextCheck?.checks) as Record<string, Row> | undefined;
  const summary = (setup?.summary ?? contextCheck?.summary) as Row | undefined;

  return (
    <div>
      <div className="warn">
        <strong>Partner Setup Admin</strong> — configure partner accounts, pricing assignments, branding, and test-user
        access for the current organization. This is the control plane for Partner Quote; it is not the dealer-facing app.
        Do not use for production external partner invites until RLS and leakage tests pass.
      </div>

      <div className="card">
        <h2>Organization</h2>
        {org ? (
          <p>
            <strong>{str(org.display_name)}</strong>{" "}
            <span className="muted">
              (<code>{str(org.key)}</code>, id <code>{str(org.id)}</code>)
            </span>
          </p>
        ) : (
          <p className="muted">Organization context not loaded.</p>
        )}
        {busy ? <p className="muted">Working…</p> : null}
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Partner accounts</h2>
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Pricing</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => {
                const asn = p.current_pricing_assignment as Row | undefined;
                const ps = asn?.pricing_structure as Row | undefined;
                return (
                  <tr key={str(p.id)} className={str(p.id) === selectedId ? "row-selected" : ""}>
                    <td>{str(p.display_name) || str(p.account_name)}</td>
                    <td>
                      <code>{str(p.account_slug) || "—"}</code>
                    </td>
                    <td>{str(ps?.name) || str(ps?.code) || "—"}</td>
                    <td>
                      <button type="button" className="btn secondary" onClick={() => setSelectedId(str(p.id))}>
                        Setup
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!partners.length ? <p className="muted">No partner accounts for this organization yet.</p> : null}

          <h3 style={{ marginTop: 20 }}>Create partner</h3>
          <div className="grid2">
            <label>
              Account name *
              <input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </label>
            <label>
              Type
              <select value={newType} onChange={(e) => setNewType(e.target.value)}>
                <option value="builder">builder</option>
                <option value="dealer">dealer</option>
                <option value="designer">designer</option>
                <option value="contractor">contractor</option>
              </select>
            </label>
            <label>
              Slug
              <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="auto-from-name if empty" />
            </label>
            <label>
              Display name
              <input value={newDisplay} onChange={(e) => setNewDisplay(e.target.value)} />
            </label>
          </div>
          <button type="button" className="btn primary" style={{ marginTop: 10 }} onClick={() => void createPartner()}>
            Create partner account
          </button>
        </div>

        <div className="card">
          <h2>Selected partner setup</h2>
          {!selectedId ? (
            <p className="muted">Select a partner from the list to edit setup, assignments, and users.</p>
          ) : (
            <>
              <p>
                <strong>{editDisplay || editName}</strong>{" "}
                <span className="muted">
                  <code>{str(selected?.id)}</code>
                </span>
              </p>

              <h3>Account</h3>
              <div className="grid2">
                <label>
                  Account name
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </label>
                <label>
                  Type
                  <input value={editType} onChange={(e) => setEditType(e.target.value)} />
                </label>
                <label>
                  Slug
                  <input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} />
                </label>
                <label>
                  Display name
                  <input value={editDisplay} onChange={(e) => setEditDisplay(e.target.value)} />
                </label>
                <label>
                  Status
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </label>
              </div>
              <button type="button" className="btn secondary" style={{ marginTop: 8 }} onClick={() => void savePartner()}>
                Save account
              </button>

              <h3 style={{ marginTop: 20 }}>Pricing assignment</h3>
              <label>
                Structure
                <select value={assignStructureId} onChange={(e) => setAssignStructureId(e.target.value)}>
                  <option value="">— select —</option>
                  {structures.map((s) => (
                    <option key={str(s.id)} value={str(s.id)}>
                      {str(s.name)} ({str(s.code)})
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn secondary" style={{ marginTop: 8 }} onClick={() => void assignPricing()}>
                Assign / replace active pricing
              </button>

              <h3 style={{ marginTop: 20 }}>Branding (optional)</h3>
              <div className="grid2">
                <label>
                  Display override
                  <input value={brandDisplay} onChange={(e) => setBrandDisplay(e.target.value)} />
                </label>
                <label>
                  Logo URL
                  <input value={brandLogo} onChange={(e) => setBrandLogo(e.target.value)} />
                </label>
                <label>
                  Primary color
                  <input value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} placeholder="#0f766e" />
                </label>
                <label>
                  Secondary color
                  <input value={brandSecondary} onChange={(e) => setBrandSecondary(e.target.value)} />
                </label>
              </div>
              <label>
                Footer text
                <textarea value={brandFooter} onChange={(e) => setBrandFooter(e.target.value)} rows={2} />
              </label>
              <label>
                Terms text
                <textarea value={brandTerms} onChange={(e) => setBrandTerms(e.target.value)} rows={2} />
              </label>
              <button type="button" className="btn secondary" style={{ marginTop: 8 }} onClick={() => void saveBranding()}>
                Save branding
              </button>
              {branding ? <p className="muted">Branding row present.</p> : <p className="muted">No branding row yet — OK for pilot.</p>}

              <h3 style={{ marginTop: 20 }}>Partner user access</h3>
              <p className="muted">Assign an existing user by email (test/internal users). Grants partner_quote head if missing.</p>
              <div className="grid2">
                <label>
                  Email
                  <input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="user@example.com" />
                </label>
                <label>
                  Role
                  <select value={userRole} onChange={(e) => setUserRole(e.target.value)}>
                    <option value="partner_admin">partner_admin</option>
                    <option value="partner_user">partner_user</option>
                    <option value="viewer">viewer</option>
                  </select>
                </label>
              </div>
              <button type="button" className="btn secondary" style={{ marginTop: 8 }} onClick={() => void addUserAccess()}>
                Assign user
              </button>
              <table className="data" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>partner_quote head</th>
                  </tr>
                </thead>
                <tbody>
                  {userAccess.map((a) => {
                    const u = a.user as Row | undefined;
                    return (
                      <tr key={str(a.id)}>
                        <td>{str(u?.email)}</td>
                        <td>{str(a.role)}</td>
                        <td>{a.has_partner_quote_head ? "yes" : "no"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <h3 style={{ marginTop: 20 }}>Readiness checklist</h3>
              <button type="button" className="btn primary" onClick={() => void runContextCheck()}>
                Check partner context
              </button>
              {checks ? (
                <ul className="checklist" style={{ marginTop: 12 }}>
                  {Object.entries(checks).map(([key, c]) => (
                    <li key={key} className={c.ok ? "ok-item" : "bad-item"}>
                      {c.ok ? "✓" : "○"} {str(c.label)}
                      {c.optional ? " (optional)" : ""}
                      {c.note ? <span className="muted"> — {str(c.note)}</span> : null}
                      {c.blocked_reason ? <span className="muted"> — {str(c.blocked_reason)}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {summary ? (
                <p className="muted" style={{ marginTop: 8 }}>
                  Context API ready: <strong>{summary.ready_for_partner_context_api ? "yes" : "no"}</strong> · Scaffold
                  app-partner-quote: <strong>{summary.ready_for_app_partner_quote_scaffold ? "yes" : "no"}</strong> ·
                  External login: <strong>{summary.ready_for_external_partner_login ? "yes" : "no"}</strong>
                  {Array.isArray(summary.blockers) && summary.blockers.length ? (
                    <> · Blockers: {(summary.blockers as string[]).join(", ")}</>
                  ) : null}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
