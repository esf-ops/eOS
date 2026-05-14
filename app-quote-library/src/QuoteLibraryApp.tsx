import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost, ApiError } from "./lib/api";
import { getSupabase } from "./lib/supabase";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const INTERNAL_ESTIMATE_ORIGIN = "https://internal.eliteosfab.com";

type TabId = "all" | "by_account" | "my" | "internal" | "public" | "sold" | "handoff";

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function money(n: unknown): string {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString(undefined, { style: "currency", currency: "USD" }) : "—";
}

function loc(row: Record<string, unknown>): string {
  const bits = [str(row.city), str(row.state), str(row.zip)].filter(Boolean);
  return bits.join(" ") || "—";
}

const STATUS_FILTER_OPTIONS = [
  "",
  "draft",
  "testing_review",
  "sent",
  "revised",
  "sold",
  "won",
  "lost",
  "archived",
  "lead_submitted",
  "reviewing",
  "contacted",
  "quoted",
  "submitted"
];

export default function QuoteLibraryApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [accountGroups, setAccountGroups] = useState<Record<string, unknown>[]>([]);

  const [search, setSearch] = useState("");
  const [accountQ, setAccountQ] = useState("");
  const [status, setStatus] = useState("");
  const [quoteSource, setQuoteSource] = useState("");
  const [branch, setBranch] = useState("");
  const [salesRep, setSalesRep] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [handoffStatus, setHandoffStatus] = useState("");
  const [sort, setSort] = useState("updated_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
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
    setRows([]);
    setDetail(null);
    setDetailId(null);
  }, [supabase]);

  const loadMetrics = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const m = (await apiGet("/api/quote-library/metrics", sessionToken)) as Record<string, unknown>;
      setMetrics((m.metrics as Record<string, unknown>) || {});
    } catch {
      setMetrics({});
    }
  }, [sessionToken]);

  const loadAccounts = useCallback(async () => {
    if (!sessionToken) return;
    const qs = new URLSearchParams();
    if (accountQ.trim()) qs.set("search", accountQ.trim());
    const path = `/api/quote-library/accounts${qs.toString() ? `?${qs}` : ""}`;
    const res = (await apiGet(path, sessionToken)) as { groups?: Record<string, unknown>[] };
    setAccountGroups(Array.isArray(res.groups) ? res.groups : []);
  }, [sessionToken, accountQ]);

  const loadRows = useCallback(async () => {
    if (!sessionToken || tab === "by_account") return;
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "120");
      params.set("offset", "0");
      params.set("sort", sort);
      params.set("direction", direction);
      if (search.trim()) params.set("search", search.trim());
      if (accountQ.trim()) params.set("account", accountQ.trim());
      if (status) params.set("status", status);
      if (quoteSource) params.set("quote_source", quoteSource);
      if (branch.trim()) params.set("branch", branch.trim());
      if (salesRep.trim()) params.set("sales_rep", salesRep.trim());
      if (createdFrom) params.set("created_from", createdFrom);
      if (createdTo) params.set("created_to", createdTo);
      if (handoffStatus) params.set("handoff_status", handoffStatus);
      if (tab === "my") params.set("my", "1");
      if (tab === "internal") params.set("view", "internal_estimates");
      if (tab === "public") params.set("view", "public_leads");
      if (tab === "sold") params.set("view", "sold_jobs");
      if (tab === "handoff") params.set("view", "needs_handoff");

      const res = (await apiGet(`/api/quote-library/quotes?${params}`, sessionToken)) as { rows?: unknown };
      setRows(Array.isArray(res.rows) ? (res.rows as Record<string, unknown>[]) : []);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) {
        setErr("Access denied. Ask an admin to grant the quote_library head, or use an admin profile.");
      } else {
        setErr(String((e as Error)?.message || e));
      }
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [
    sessionToken,
    tab,
    search,
    accountQ,
    status,
    quoteSource,
    branch,
    salesRep,
    createdFrom,
    createdTo,
    handoffStatus,
    sort,
    direction
  ]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    if (tab === "by_account") void loadAccounts();
    else void loadRows();
  }, [tab, loadRows, loadAccounts]);

  useEffect(() => {
    if (!sessionToken || !detailId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = (await apiGet(`/api/quote-library/quotes/${detailId}`, sessionToken)) as Record<string, unknown>;
        if (!cancelled) setDetail(d);
      } catch (e: unknown) {
        if (!cancelled) setErr(String((e as Error)?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken, detailId]);

  const metricCards = useMemo(() => {
    const m = metrics || {};
    return [
      { key: "open", label: "Total open quote value", val: money(m.total_open_quote_value) },
      { key: "oc", label: "Open quotes", val: str(m.open_quotes ?? "—") },
      { key: "nw", label: "New this week", val: str(m.new_this_week ?? "—") },
      { key: "pl", label: "Public leads", val: str(m.public_leads ?? "—") },
      { key: "ie", label: "Internal estimates", val: str(m.internal_estimates ?? "—") },
      { key: "sm", label: "Sold this month", val: str(m.sold_this_month ?? "—") },
      { key: "mw", label: "Needs Moraware Entry Doc", val: str(m.needs_moraware_entry_doc ?? "—") },
      { key: "qb", label: "Needs QuickBooks Entry Doc", val: str(m.needs_quickbooks_entry_doc ?? "—") }
    ];
  }, [metrics]);

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setMsg(null);
    setErr(null);
    try {
      await fn();
      setMsg(`${label} saved.`);
      void loadMetrics();
      void loadRows();
      if (detailId && sessionToken) {
        const d = (await apiGet(`/api/quote-library/quotes/${detailId}`, sessionToken)) as Record<string, unknown>;
        setDetail(d);
      }
    } catch (e: unknown) {
      setErr(String((e as Error)?.message || e));
    }
  };

  const header = (detail?.header as Record<string, unknown>) || {};
  const mondayBoard = str(header.monday_board_id);
  const mondayItem = str(header.monday_item_id);
  const mondayUrl =
    mondayBoard && mondayItem ? `https://monday.com/boards/${encodeURIComponent(mondayBoard)}/pulses/${encodeURIComponent(mondayItem)}` : "";

  return (
    <div className="page">
      <header className="hero">
        <div>
          <img src={EOS_LOGO_URL} alt="Elite Stone Fabrication" style={{ maxWidth: 220, height: "auto", marginBottom: 12 }} />
          <h1>eliteOS Quote Library Head</h1>
          <p className="sub">Account-centered search, status workflow, and sold-job handoff documents (Supabase + Brain).</p>
          <p className="muted" style={{ marginTop: 8 }}>
            Canonical domain: <strong>quotes.eliteosfab.com</strong> — distinct from the public quote tool at quote.eliteosfab.com.
          </p>
        </div>
        <div>
          {sessionToken ? (
            <button type="button" className="btn secondary" onClick={() => void signOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      {!supabase ? <div className="warn">Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to sign in.</div> : null}

      {!sessionToken ? (
        <section className="card">
          <h2>Sign in</h2>
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
          </div>
          {authError ? <p className="error">{authError}</p> : null}
          <button type="button" className="btn primary" style={{ marginTop: 12 }} disabled={authBusy} onClick={() => void signIn()}>
            {authBusy ? "Signing in…" : "Sign in"}
          </button>
        </section>
      ) : null}

      {sessionToken ? (
        <>
          {msg ? <p className="ok">{msg}</p> : null}
          {err ? <p className="error">{err}</p> : null}

          <div className="metrics">
            {metricCards.map((c) => (
              <div key={c.key} className="metric">
                <div className="val">{c.val}</div>
                <div className="lbl">{c.label}</div>
              </div>
            ))}
          </div>

          <div className="tabs" role="tablist" aria-label="Quote views">
            {(
              [
                ["all", "All Quotes"],
                ["by_account", "By Account"],
                ["my", "My Quotes"],
                ["internal", "Internal Estimates"],
                ["public", "Public Leads"],
                ["sold", "Sold Jobs"],
                ["handoff", "Needs Handoff"]
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          <section className="card">
            <h2>Filters</h2>
            <div className="filter-grid">
              <label>
                Global search
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer, project, #…" />
              </label>
              <label>
                Account
                <input value={accountQ} onChange={(e) => setAccountQ(e.target.value)} placeholder="Account / customer / project" />
              </label>
              <label>
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_FILTER_OPTIONS.map((s) => (
                    <option key={s || "any"} value={s}>
                      {s || "Any"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source
                <select value={quoteSource} onChange={(e) => setQuoteSource(e.target.value)}>
                  <option value="">Any</option>
                  <option value="internal_quote">internal_quote</option>
                  <option value="public_consumer">public_consumer</option>
                  <option value="partner_portal">partner_portal</option>
                </select>
              </label>
              <label>
                Branch
                <input value={branch} onChange={(e) => setBranch(e.target.value)} />
              </label>
              <label>
                Sales rep
                <input value={salesRep} onChange={(e) => setSalesRep(e.target.value)} />
              </label>
              <label>
                Created from
                <input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} />
              </label>
              <label>
                Created to
                <input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} />
              </label>
              <label>
                Handoff status
                <select value={handoffStatus} onChange={(e) => setHandoffStatus(e.target.value)}>
                  <option value="">Any</option>
                  <option value="none">none</option>
                  <option value="in_progress">in_progress</option>
                </select>
              </label>
              <label>
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="created_at">Created</option>
                  <option value="updated_at">Updated</option>
                  <option value="grand_total">Quote value</option>
                  <option value="account">Account</option>
                  <option value="quote_status">Status</option>
                  <option value="sales_rep">Sales rep</option>
                  <option value="branch">Branch</option>
                </select>
              </label>
              <label>
                Direction
                <select value={direction} onChange={(e) => setDirection(e.target.value as "asc" | "desc")}>
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </label>
            </div>
            <button type="button" className="btn primary" disabled={busy} onClick={() => (tab === "by_account" ? void loadAccounts() : void loadRows())}>
              Apply
            </button>
          </section>

          {tab === "by_account" ? (
            <section className="card">
              <h2>Accounts</h2>
              <p className="muted">Grouped from account_name when set, otherwise customer / project / snapshot hints.</p>
              <div className="account-grid">
                {accountGroups.map((g) => (
                  <div key={str(g.account_key)} className="metric">
                    <div className="val">{str(g.account_key)}</div>
                    <div className="lbl">
                      {str(g.quote_count)} quotes · Open value {money(g.open_value)} · Last {str(g.last_quote_at || "—")}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="card">
              <h2>Quotes {busy ? "(loading…)" : ""}</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Quote #</th>
                      <th>Account</th>
                      <th>Customer</th>
                      <th>Project</th>
                      <th>Location</th>
                      <th>Source</th>
                      <th>Status</th>
                      <th>Sales rep</th>
                      <th>Branch</th>
                      <th>Total</th>
                      <th>Sq ft</th>
                      <th>Created</th>
                      <th>Updated</th>
                      <th>Handoff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={str(r.id)} className="clickable" onClick={() => setDetailId(str(r.id))}>
                        <td>{str(r.quote_number)}</td>
                        <td>{str(r.account_name)}</td>
                        <td>{str(r.customer_name)}</td>
                        <td>{str(r.project_name)}</td>
                        <td>{loc(r)}</td>
                        <td>{str(r.quote_source)}</td>
                        <td>{str(r.quote_status)}</td>
                        <td>{str(r.sales_rep)}</td>
                        <td>{str(r.branch)}</td>
                        <td>{money(r.grand_total)}</td>
                        <td>{str(r.estimated_sqft ?? "—")}</td>
                        <td>{str(r.created_at).slice(0, 10)}</td>
                        <td>{str(r.updated_at).slice(0, 10)}</td>
                        <td>{str(r.handoff_status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : null}

      {detailId && detail ? (
        <>
          <div role="presentation" className="drawer-backdrop" onClick={() => setDetailId(null)} />
          <aside className="drawer">
            <button type="button" className="btn ghost" onClick={() => setDetailId(null)}>
              Close
            </button>
            <h2>Quote {str((detail.header as Record<string, unknown>)?.quote_number)}</h2>
            <p className="muted">ID: {detailId}</p>
            {(Array.isArray(detail.warnings) ? detail.warnings : []).length ? (
              <div className="warn">
                {(detail.warnings as string[]).map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            ) : null}

            <div className="drawer-actions">
              <a
                className="btn secondary"
                href={`${INTERNAL_ESTIMATE_ORIGIN}?quoteId=${encodeURIComponent(detailId)}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Internal Estimate
              </a>
              {mondayUrl ? (
                <a className="btn secondary" href={mondayUrl} target="_blank" rel="noreferrer">
                  Open Monday item
                </a>
              ) : null}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              Internal Estimate quoteId hydration is not complete yet; use this head for read-only detail and handoff docs.
            </p>

            <div className="drawer-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  void runAction("Duplicate", async () => {
                    await apiPost(`/api/quote-library/quotes/${detailId}/duplicate`, sessionToken!);
                  })
                }
              >
                Duplicate
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  void runAction("Mark sent", async () => {
                    await apiPatch(`/api/quote-library/quotes/${detailId}/status`, sessionToken!, { status: "sent" });
                  })
                }
              >
                Mark Sent
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  void runAction("Mark sold", async () => {
                    await apiPost(`/api/quote-library/quotes/${detailId}/mark-sold`, sessionToken!, {});
                  })
                }
              >
                Mark Sold
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  void runAction("Mark lost", async () => {
                    await apiPatch(`/api/quote-library/quotes/${detailId}/status`, sessionToken!, { status: "lost" });
                  })
                }
              >
                Mark Lost
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  void runAction("Archive", async () => {
                    await apiPatch(`/api/quote-library/quotes/${detailId}/status`, sessionToken!, { status: "archived" });
                  })
                }
              >
                Archive
              </button>
            </div>
            <div className="drawer-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  void runAction("Moraware doc", async () => {
                    await apiPost(`/api/quote-library/quotes/${detailId}/generate-moraware-entry-doc`, sessionToken!);
                  })
                }
              >
                Generate Moraware Entry Doc
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  void runAction("QuickBooks doc", async () => {
                    await apiPost(`/api/quote-library/quotes/${detailId}/generate-quickbooks-entry-doc`, sessionToken!);
                  })
                }
              >
                Generate QuickBooks Entry Doc
              </button>
            </div>

            <section style={{ marginTop: 16 }}>
              <h3>Summary</h3>
              <p className="muted">Account: {str(header.account_name)}</p>
              <p className="muted">Customer: {str(header.customer_name)}</p>
              <p className="muted">Project: {str(header.project_name)}</p>
              <p className="muted">Address: {str(header.project_address)}</p>
              <p className="muted">
                Location: {str(header.city)} {str(header.state)} {str(header.zip)}
              </p>
              <p className="muted">Branch / rep: {str(header.branch)} · {str(header.sales_rep)}</p>
              <p className="muted">Source / status: {str(header.quote_source)} · {str(header.quote_status)}</p>
              <p className="muted">
                Pricing mode:{" "}
                {str(
                  (header.calculation_snapshot as { internal_ui?: { internal_material_basis?: string } } | undefined)?.internal_ui
                    ?.internal_material_basis
                )}
              </p>
              <p className="muted">Grand total: {money(header.grand_total)}</p>
              <p className="muted">Sq ft: {str(header.estimated_sqft)}</p>
            </section>

            <section style={{ marginTop: 16 }}>
              <h3>Timeline</h3>
              <ul className="muted">
                {(Array.isArray(detail.status_timeline) ? detail.status_timeline : []).slice(0, 40).map((ev: unknown, i: number) => (
                  <li key={i}>{JSON.stringify(ev)}</li>
                ))}
              </ul>
            </section>

            <section style={{ marginTop: 16 }}>
              <h3>Handoff documents</h3>
              <ul className="muted">
                {(Array.isArray(detail.handoff_documents) ? detail.handoff_documents : []).map((h: unknown, i: number) => (
                  <li key={i}>{JSON.stringify(h)}</li>
                ))}
              </ul>
            </section>

            <section style={{ marginTop: 16 }}>
              <h3>Line items / rooms</h3>
              <p className="muted">Line items: {(detail.line_items as unknown[] | undefined)?.length ?? 0}</p>
              <p className="muted">Rooms: {(detail.rooms as unknown[] | undefined)?.length ?? 0}</p>
            </section>

            <section style={{ marginTop: 16 }}>
              <button type="button" className="btn ghost" onClick={() => setShowRaw((s) => !s)}>
                {showRaw ? "Hide" : "Show"} raw calculation snapshot (debug)
              </button>
              {showRaw ? (
                <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 280, background: "#0f172a", color: "#e2e8f0", padding: 12 }}>
                  {JSON.stringify(detail.calculation_snapshot ?? {}, null, 2)}
                </pre>
              ) : null}
            </section>
          </aside>
        </>
      ) : null}
    </div>
  );
}
