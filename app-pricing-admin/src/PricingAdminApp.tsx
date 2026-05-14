import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGetJson, apiPatchJson, ApiError } from "@quote-lib/api";
import { config, EOS_LOGO_URL } from "@quote-lib/config";
import { getSupabase } from "./lib/supabase";

type Tab = "dashboard" | "groups" | "addons" | "rules" | "audit" | "planned";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function PricingAdminApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [groups, setGroups] = useState<Row[]>([]);
  const [rates, setRates] = useState<Row[]>([]);
  const [addons, setAddons] = useState<Row[]>([]);
  const [rules, setRules] = useState<Row[]>([]);
  const [audit, setAudit] = useState<Row[]>([]);
  const [previewNotes, setPreviewNotes] = useState<string[]>([]);

  const [editRate, setEditRate] = useState<Row | null>(null);
  const [rateVal, setRateVal] = useState("");
  const [editAddon, setEditAddon] = useState<Row | null>(null);
  const [addonPrice, setAddonPrice] = useState("");
  const [markupPct, setMarkupPct] = useState("25");

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword
      });
      if (error) throw error;
      const tok = data.session?.access_token;
      if (!tok) throw new Error("No access token");
      setSessionToken(tok);
      setAuthPassword("");
    } catch (e: unknown) {
      setAuthError(String((e as Error)?.message || e));
    } finally {
      setAuthBusy(false);
    }
  }, [authEmail, authPassword, supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSessionToken(null);
  }, [supabase]);

  const loadCore = useCallback(async () => {
    if (!sessionToken) return;
    setBusy(true);
    setErr(null);
    try {
      const st = (await apiGetJson("/api/pricing-admin/status", sessionToken)) as { installed?: boolean };
      setInstalled(Boolean(st.installed));
      const [g, r, a, ru, pr] = await Promise.all([
        apiGetJson("/api/pricing-admin/price-groups", sessionToken) as Promise<{ rows?: Row[]; installed?: boolean }>,
        apiGetJson("/api/pricing-admin/rates", sessionToken) as Promise<{ rows?: Row[] }>,
        apiGetJson("/api/pricing-admin/addons", sessionToken) as Promise<{ rows?: Row[] }>,
        apiGetJson("/api/pricing-admin/rules", sessionToken) as Promise<{ rows?: Row[] }>,
        apiGetJson("/api/pricing-admin/config-preview", sessionToken) as Promise<{ notes?: string[] }>
      ]);
      setGroups(Array.isArray(g.rows) ? g.rows : []);
      setRates(Array.isArray(r.rows) ? r.rows : []);
      setAddons(Array.isArray(a.rows) ? a.rows : []);
      setRules(Array.isArray(ru.rows) ? ru.rows : []);
      setPreviewNotes(Array.isArray(pr.notes) ? pr.notes : []);
      const pub = (Array.isArray(ru.rows) ? ru.rows : []).find((x) => str(x.rule_key) === "public_consumer_markup_percent");
      const pct = pub?.rule_value as { percent?: number } | undefined;
      if (pct && pct.percent != null) setMarkupPct(String(pct.percent));
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) {
        setErr("Forbidden — need admin, finance, or executive role and Pricing Admin head access.");
      } else {
        setErr(e instanceof ApiError ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }, [sessionToken]);

  const loadAudit = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const raw = (await apiGetJson("/api/pricing-admin/audit-log", sessionToken)) as { rows?: Row[] };
      setAudit(Array.isArray(raw.rows) ? raw.rows : []);
    } catch {
      setAudit([]);
    }
  }, [sessionToken]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (tab === "audit" && sessionToken) void loadAudit();
  }, [tab, sessionToken, loadAudit]);

  const groupById = useMemo(() => {
    const m = new Map<string, Row>();
    for (const g of groups) m.set(str(g.id), g);
    return m;
  }, [groups]);

  const lastUpdated = useMemo(() => {
    let max = "";
    for (const t of [...groups, ...rates, ...addons, ...rules]) {
      const u = str(t.updated_at);
      if (u > max) max = u;
    }
    return max || "—";
  }, [groups, rates, addons, rules]);

  const saveRate = async () => {
    if (!sessionToken || !editRate?.id) return;
    if (!window.confirm("Update this rate?")) return;
    setMsg(null);
    setErr(null);
    try {
      await apiPatchJson(`/api/pricing-admin/rates/${str(editRate.id)}`, sessionToken, {
        rate_per_sqft: Number(rateVal)
      });
      setMsg("Rate saved.");
      setEditRate(null);
      await loadCore();
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  };

  const saveAddon = async () => {
    if (!sessionToken || !editAddon?.id) return;
    if (!window.confirm("Update this add-on price?")) return;
    setMsg(null);
    setErr(null);
    try {
      await apiPatchJson(`/api/pricing-admin/addons/${str(editAddon.id)}`, sessionToken, {
        base_price: Number(addonPrice)
      });
      setMsg("Add-on saved.");
      setEditAddon(null);
      await loadCore();
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  };

  const saveMarkup = async () => {
    if (!sessionToken) return;
    const p = Number(markupPct);
    if (!Number.isFinite(p) || p < 25) {
      setErr("Public markup must be at least 25%.");
      return;
    }
    if (!window.confirm(`Set public consumer markup to ${p}%?`)) return;
    setMsg(null);
    setErr(null);
    try {
      await apiPatchJson(
        `/api/pricing-admin/rules/${encodeURIComponent("public_consumer_markup_percent")}`,
        sessionToken,
        { rule_value: { percent: p } }
      );
      setMsg("Public markup rule saved (applies after calculator cutover to resolver).");
      await loadCore();
    } catch (e: unknown) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <img src={EOS_LOGO_URL} alt="Elite Stone Fabrication" style={{ maxWidth: 220, marginBottom: 12 }} />
        <h1>Pricing Admin</h1>
        <p className="sub">
          Authorized staff only — material tiers, add-ons, and policy rules. Backend: <code>/api/pricing-admin/*</code>
        </p>
      </header>

      <div className="warn">
        <strong>Important:</strong> Changes here affect <strong>future</strong> quotes only after the calculator is wired to
        the pricing resolver. Existing quotes keep their saved calculation snapshots. Public consumer math today still uses{" "}
        <code>quoteCalculator.js</code> constants.
      </div>

      {supabase ? (
        <div className="card">
          <h2>Sign in</h2>
          {sessionToken ? (
            <p>
              <button type="button" className="btn secondary" onClick={() => void signOut()}>
                Sign out
              </button>
            </p>
          ) : (
            <div className="grid2">
              <label>
                Email
                <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoComplete="username" />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <button type="button" className="btn primary" disabled={authBusy} onClick={() => void signIn()}>
                {authBusy ? "Signing in…" : "Sign in"}
              </button>
            </div>
          )}
          {authError ? <p className="error">{authError}</p> : null}
        </div>
      ) : (
        <div className="card">
          <p className="error">Supabase env missing — cannot authenticate.</p>
        </div>
      )}

      {sessionToken ? (
        <>
          <p className="muted">API: {config.backendBaseUrl}</p>
          {msg ? <p className="ok">{msg}</p> : null}
          {err ? <p className="error">{err}</p> : null}
          {busy ? <p className="muted">Loading…</p> : null}

          <div className="tabs">
            {(
              [
                ["dashboard", "Dashboard"],
                ["groups", "Material groups"],
                ["addons", "Add-ons"],
                ["rules", "Public rules"],
                ["audit", "Audit log"],
                ["planned", "Planned"]
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "dashboard" ? (
            <div className="card">
              <h2>Status</h2>
              <p>
                Foundation tables:{" "}
                <strong>{installed === null ? "…" : installed ? "installed" : "not applied"}</strong>
              </p>
              <p className="muted">Last row update (loaded scope): {lastUpdated}</p>
              {!installed ? (
                <p className="muted">
                  Apply <code>backend-core/supabase/eliteos_pricing_admin_foundation.sql</code> manually in Supabase SQL
                  editor (additive only). Requires <code>organizations</code> for FKs.
                </p>
              ) : null}
              {previewNotes.length ? (
                <div>
                  <p className="muted">Resolver preview notes:</p>
                  <ul>
                    {previewNotes.map((n, i) => (
                      <li key={i} className="muted">
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="muted">
                <strong>Stock Blanco seed (495)</strong> vs calculator prototype (<strong>450</strong>) — documented in{" "}
                <code>docs/quote-platform/pricing-seed-map.md</code>; reconcile before DB cutover.
              </p>
            </div>
          ) : null}

          {tab === "groups" ? (
            <div className="card">
              <h2>Material groups &amp; rates</h2>
              <p className="muted">Direct / wholesale $/sq ft. Edit opens a single-rate update (PATCH).</p>
              <table className="data">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>$/sq ft</th>
                    <th>Active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => {
                    const gid = str(r.price_group_id);
                    const g = groupById.get(gid);
                    return (
                      <tr key={str(r.id)}>
                        <td>{str(g?.display_name) || gid}</td>
                        <td>{str(g?.group_code)}</td>
                        <td>{str(r.rate_type)}</td>
                        <td>{num(r.rate_per_sqft).toFixed(2)}</td>
                        <td>{r.is_active ? "yes" : "no"}</td>
                        <td>
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => {
                              setEditRate(r);
                              setRateVal(String(num(r.rate_per_sqft)));
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!rates.length ? <p className="muted">No rates (apply SQL seed or create rows).</p> : null}
            </div>
          ) : null}

          {tab === "addons" ? (
            <div className="card">
              <h2>Add-ons / services</h2>
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {addons.map((a) => (
                    <tr key={str(a.id)}>
                      <td>
                        <code>{str(a.addon_code)}</code>
                      </td>
                      <td>{str(a.display_name)}</td>
                      <td>{str(a.category)}</td>
                      <td>${num(a.base_price).toFixed(2)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => {
                            setEditAddon(a);
                            setAddonPrice(String(num(a.base_price)));
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!addons.length ? <p className="muted">No add-ons loaded.</p> : null}
            </div>
          ) : null}

          {tab === "rules" ? (
            <div className="card">
              <h2>Public rules</h2>
              <label>
                Public consumer markup (%)
                <input value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} inputMode="decimal" />
              </label>
              <p className="muted" style={{ marginTop: 8 }}>
                Minimum <strong>25%</strong> enforced by API. Calculator still uses structures until resolver cutover.
              </p>
              <button type="button" className="btn primary" style={{ marginTop: 12 }} onClick={() => void saveMarkup()}>
                Save markup rule
              </button>
              <h3 style={{ marginTop: 24 }}>Other policy keys (read-only)</h3>
              <ul className="muted">
                {rules
                  .filter((x) => str(x.rule_key) !== "public_consumer_markup_percent")
                  .map((x) => (
                    <li key={str(x.id)}>
                      <code>{str(x.rule_key)}</code> — {JSON.stringify(x.rule_value)}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          {tab === "audit" ? (
            <div className="card">
              <h2>Pricing audit log</h2>
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((x) => (
                    <tr key={str(x.id)}>
                      <td>{str(x.created_at)}</td>
                      <td>{str(x.action)}</td>
                      <td>
                        {str(x.entity_type)} {str(x.entity_id)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!audit.length ? <p className="muted">No audit rows yet.</p> : null}
            </div>
          ) : null}

          {tab === "planned" ? (
            <div className="grid2">
              {[
                "Partner pricing tiers",
                "Color/material mappings",
                "Faucets & fixtures catalog",
                "Vanity program pricing",
                "Branch/account-specific pricing"
              ].map((title) => (
                <div key={title} className="card planned">
                  <h2>{title}</h2>
                  <p className="muted">Planned — not editable in this foundation pass.</p>
                </div>
              ))}
            </div>
          ) : null}

          {editRate ? (
            <div className="card" style={{ position: "sticky", bottom: 0 }}>
              <h2>Edit rate</h2>
              <label>
                $/sq ft
                <input value={rateVal} onChange={(e) => setRateVal(e.target.value)} />
              </label>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button type="button" className="btn primary" onClick={() => void saveRate()}>
                  Save
                </button>
                <button type="button" className="btn secondary" onClick={() => setEditRate(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {editAddon ? (
            <div className="card" style={{ position: "sticky", bottom: 0 }}>
              <h2>Edit add-on</h2>
              <p className="muted">{str(editAddon.display_name)}</p>
              <label>
                Base price
                <input value={addonPrice} onChange={(e) => setAddonPrice(e.target.value)} inputMode="decimal" />
              </label>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button type="button" className="btn primary" onClick={() => void saveAddon()}>
                  Save
                </button>
                <button type="button" className="btn secondary" onClick={() => setEditAddon(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
