import React, { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";

type Territory = Record<string, unknown> & {
  id: string;
  territory_name?: string;
  match_type?: string;
  match_value?: string;
  branch?: string | null;
  assigned_sales_rep?: string | null;
  assigned_sales_rep_email?: string | null;
  priority?: number;
  is_active?: boolean;
  metadata?: Record<string, unknown> | null;
};

type SalesUser = {
  user_id: string;
  full_name: string;
  email: string;
  branch?: string | null;
};

const MATCH_TYPES = ["zip", "city", "county", "state", "branch", "manual"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string) {
  return UUID_RE.test(String(s || "").trim());
}

function deriveRepPick(r: Territory, users: SalesUser[]): string {
  const md = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
  const uid = String(md.assigned_sales_rep_user_id ?? "").trim();
  if (uid && isUuid(uid) && users.some((u) => u.user_id === uid)) return uid;
  const em = String(r.assigned_sales_rep_email ?? "").trim().toLowerCase();
  if (em) {
    const hit = users.find((u) => u.email.toLowerCase() === em);
    if (hit) return hit.user_id;
  }
  return "__manual__";
}

export default function QuoteTerritoriesAdmin({ token }: { token: string }) {
  const [rows, setRows] = useState<Territory[]>([]);
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<Territory | null>(null);

  const emptyForm = {
    territory_name: "",
    match_type: "zip",
    match_value: "",
    branch: "",
    assigned_sales_rep: "",
    assigned_sales_rep_email: "",
    repPick: "__manual__" as string,
    priority: "100",
    is_active: true
  };
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [terr, su] = await Promise.all([
        apiFetch("/api/admin/quote-sales-territories", { token }) as Promise<{ rows?: Territory[] }>,
        apiFetch("/api/admin/sales-users", { token }) as Promise<{ ok?: boolean; users?: SalesUser[] }>
      ]);
      setRows(terr.rows ?? []);
      setSalesUsers(su.users ?? []);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (r: Territory) => {
    setEditingId(r.id);
    setEditingRow(r);
    setForm({
      territory_name: String(r.territory_name || ""),
      match_type: String(r.match_type || "zip"),
      match_value: String(r.match_value || ""),
      branch: String(r.branch ?? ""),
      assigned_sales_rep: String(r.assigned_sales_rep ?? ""),
      assigned_sales_rep_email: String(r.assigned_sales_rep_email ?? ""),
      repPick: deriveRepPick(r, salesUsers),
      priority: String(r.priority ?? 100),
      is_active: r.is_active !== false
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingRow(null);
    setForm(emptyForm);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const prevMeta =
        editingRow?.metadata && typeof editingRow.metadata === "object" && !Array.isArray(editingRow.metadata)
          ? { ...editingRow.metadata }
          : {};
      const meta: Record<string, unknown> = { ...prevMeta };
      if (form.repPick !== "__manual__" && isUuid(form.repPick)) {
        meta.assigned_sales_rep_user_id = form.repPick;
      } else {
        delete meta.assigned_sales_rep_user_id;
      }

      const body = {
        territory_name: form.territory_name.trim(),
        match_type: form.match_type,
        match_value: form.match_value.trim(),
        branch: form.branch.trim() || null,
        assigned_sales_rep: form.assigned_sales_rep.trim() || null,
        assigned_sales_rep_email: form.assigned_sales_rep_email.trim() || null,
        priority: Number.parseInt(form.priority, 10) || 100,
        is_active: form.is_active,
        metadata: meta
      };
      if (editingId) {
        await apiFetch(`/api/admin/quote-sales-territories/${editingId}`, { token, method: "PATCH", body });
      } else {
        await apiFetch("/api/admin/quote-sales-territories", { token, method: "POST", body });
      }
      cancelEdit();
      await load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: Territory) => {
    try {
      await apiFetch(`/api/admin/quote-sales-territories/${r.id}`, {
        token,
        method: "PATCH",
        body: { is_active: r.is_active === false }
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div className="territories-admin">
      <p className="muted">Territories route public quote leads to the right salesperson or branch.</p>
      {error ? <p className="banner-error">{error}</p> : null}

      <div className="territory-form card-like">
        <h4 style={{ marginTop: 0 }}>{editingId ? "Edit territory" : "Add territory"}</h4>
        <div className="territory-grid">
          <label>
            Name
            <input value={form.territory_name} onChange={(e) => setForm((f) => ({ ...f, territory_name: e.target.value }))} />
          </label>
          <label>
            Match type
            <select value={form.match_type} onChange={(e) => setForm((f) => ({ ...f, match_type: e.target.value }))}>
              {MATCH_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Match value
            <input value={form.match_value} onChange={(e) => setForm((f) => ({ ...f, match_value: e.target.value }))} placeholder="ZIP, city name, etc." />
          </label>
          <label>
            Branch
            <input value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))} />
          </label>
          <label>
            Salesperson (directory)
            <select
              value={form.repPick}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => {
                  if (v === "__manual__") {
                    return { ...f, repPick: "__manual__" };
                  }
                  const u = salesUsers.find((x) => x.user_id === v);
                  if (!u) return { ...f, repPick: v };
                  return {
                    ...f,
                    repPick: v,
                    assigned_sales_rep: u.full_name,
                    assigned_sales_rep_email: u.email,
                    branch: u.branch ? String(u.branch) : f.branch
                  };
                });
              }}
            >
              <option value="__manual__">Unmatched / manual</option>
              {salesUsers.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.full_name} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <label>
            Salesperson name
            <input
              value={form.assigned_sales_rep}
              onChange={(e) => setForm((f) => ({ ...f, assigned_sales_rep: e.target.value, repPick: "__manual__" }))}
            />
          </label>
          <label>
            Salesperson email
            <input
              value={form.assigned_sales_rep_email}
              onChange={(e) => setForm((f) => ({ ...f, assigned_sales_rep_email: e.target.value, repPick: "__manual__" }))}
            />
          </label>
          <label>
            Priority (lower first)
            <input value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
          </label>
          <label className="check">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {editingId ? "Save changes" : "Create"}
          </button>
          {editingId ? (
            <button type="button" className="btn" onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <h4>All territories</h4>
      {busy && !rows.length ? <p className="muted">Loading…</p> : null}
      <div className="table-scroll">
        <table className="simple">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Value</th>
              <th>Branch</th>
              <th>Rep</th>
              <th>Email</th>
              <th>Pri</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{String(r.territory_name)}</td>
                <td>{String(r.match_type)}</td>
                <td>{String(r.match_value)}</td>
                <td>{String(r.branch ?? "—")}</td>
                <td>{String(r.assigned_sales_rep ?? "—")}</td>
                <td>{String(r.assigned_sales_rep_email ?? "—")}</td>
                <td>{String(r.priority ?? "")}</td>
                <td>{r.is_active === false ? "no" : "yes"}</td>
                <td>
                  <button type="button" className="btn" onClick={() => startEdit(r)}>
                    Edit
                  </button>{" "}
                  <button type="button" className="btn" onClick={() => void toggleActive(r)}>
                    {r.is_active === false ? "Activate" : "Deactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
