/**
 * Partner Quote v1 — internal pilot shell only.
 * All quote data via /api/partner-quote/* (no direct Supabase quote_headers access).
 * Not production-ready for external partners until RLS + leakage tests pass.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGetJson, apiPostJson, ApiError } from "@quote-lib/api";
import { config, EOS_LOGO_URL } from "@quote-lib/config";
import { getSupabase } from "./lib/supabase";
import {
  buildPartnerQuotePayload,
  defaultFormState,
  PARTNER_MATERIAL_GROUPS,
  partnerBodyExtras,
  partnerContextQuery,
  type PartnerFormState
} from "./partnerPayload";

type Tab = "estimate" | "my_quotes";

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function money(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

type PartnerAllowed = { id: string; account_slug: string | null };

type PartnerContextPayload = {
  ok?: boolean;
  organization?: { display_name?: string };
  partner_account?: { display_name?: string; account_name?: string; account_slug?: string };
  branding?: {
    logo_url?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    display_name_override?: string | null;
  } | null;
  pricing?: {
    structure_label?: string | null;
    structure_code?: string | null;
    assignment_active?: boolean;
  };
  capabilities?: {
    can_calculate?: boolean;
    can_submit?: boolean;
    can_view_quotes?: boolean;
  };
};

type SafeCalculate = {
  totals?: { estimate_total?: number | null; estimated_sqft?: number | null };
  lineItems?: Array<Record<string, unknown>>;
  warnings?: string[];
  pricing?: { structure_label?: string | null };
};

function friendlyError(e: unknown, body: unknown): { title: string; detail: string; code?: string; allowed?: PartnerAllowed[] } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = str(b.code);
  const msg = e instanceof ApiError ? e.message : String(e);
  if (code === "partner_account_selection_required") {
    const details = b.details as { allowedPartners?: PartnerAllowed[] } | undefined;
    return {
      title: "Choose a partner account",
      detail: msg,
      code,
      allowed: Array.isArray(details?.allowedPartners) ? details.allowedPartners : undefined
    };
  }
  if (code === "partner_access_denied" || msg.toLowerCase().includes("partner account access")) {
    return {
      title: "No partner access",
      detail: "This user has no active partner account assignment. Ask your fabricator admin to add you in Partner Setup Admin."
    };
  }
  if (code === "partner_foundation_missing") {
    return { title: "Partner setup incomplete", detail: "Partner foundation tables are not installed in this environment." };
  }
  if (e instanceof ApiError && e.status === 403) {
    return {
      title: "Not authorized",
      detail: msg.includes("head") ? msg : `${msg} You may need the partner_quote head and an active partner user access row.`
    };
  }
  return { title: "Something went wrong", detail: msg, code: code || undefined };
}

export default function PartnerQuoteApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("estimate");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [context, setContext] = useState<PartnerContextPayload | null>(null);
  const [contextError, setContextError] = useState<ReturnType<typeof friendlyError> | null>(null);
  const [contextBusy, setContextBusy] = useState(false);

  const [form, setForm] = useState<PartnerFormState>(defaultFormState);
  const [estimate, setEstimate] = useState<SafeCalculate | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitResult, setSubmitResult] = useState<Row | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [myQuotes, setMyQuotes] = useState<Row[]>([]);
  const [quotesBusy, setQuotesBusy] = useState(false);

  const branding = context?.branding;
  const partnerTitle =
    str(branding?.display_name_override) ||
    str(context?.partner_account?.display_name) ||
    str(context?.partner_account?.account_name) ||
    "Partner Quote";
  const orgTitle = str(context?.organization?.display_name) || "Fabricator";
  const primaryColor = str(branding?.primary_color) || "#0f766e";
  const secondaryColor = str(branding?.secondary_color) || "#115e59";

  const themeStyle = useMemo(
    () =>
      ({
        ["--pq-primary" as string]: primaryColor,
        ["--pq-secondary" as string]: secondaryColor
      }) as React.CSSProperties,
    [primaryColor, secondaryColor]
  );

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      const tok = data.session?.access_token;
      if (tok) setSessionToken(tok);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const loadContext = useCallback(async () => {
    if (!sessionToken) return;
    setContextBusy(true);
    setContextError(null);
    setContext(null);
    try {
      const raw = (await apiGetJson(
        `/api/partner-quote/context${partnerContextQuery(selectedPartnerId)}`,
        sessionToken
      )) as PartnerContextPayload;
      if (raw.ok === false) throw new ApiError(str((raw as Row).error) || "Context failed", 403, raw);
      setContext(raw);
      setContextError(null);
    } catch (e: unknown) {
      const body = e instanceof ApiError ? e.body : null;
      setContext(null);
      setContextError(friendlyError(e, body));
    } finally {
      setContextBusy(false);
    }
  }, [sessionToken, selectedPartnerId]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const loadMyQuotes = useCallback(async () => {
    if (!sessionToken || !context) return;
    setQuotesBusy(true);
    setActionError(null);
    try {
      const raw = (await apiGetJson(
        `/api/partner-quote/my-quotes${partnerContextQuery(selectedPartnerId)}`,
        sessionToken
      )) as { ok?: boolean; quotes?: Row[] };
      setMyQuotes(Array.isArray(raw.quotes) ? raw.quotes : []);
    } catch (e: unknown) {
      setMyQuotes([]);
      setActionError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setQuotesBusy(false);
    }
  }, [sessionToken, context, selectedPartnerId]);

  useEffect(() => {
    if (tab === "my_quotes" && context) void loadMyQuotes();
  }, [tab, context, loadMyQuotes]);

  const signIn = async () => {
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
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setSessionToken(null);
    setContext(null);
    setEstimate(null);
    setSubmitResult(null);
    setMyQuotes([]);
  };

  const runCalculate = async () => {
    if (!sessionToken || !context?.capabilities?.can_calculate) return;
    setCalcBusy(true);
    setActionError(null);
    setActionMsg(null);
    setEstimate(null);
    try {
      const payload = {
        ...buildPartnerQuotePayload(form),
        ...partnerBodyExtras(selectedPartnerId)
      };
      const raw = (await apiPostJson("/api/partner-quote/calculate", sessionToken, payload)) as SafeCalculate & {
        ok?: boolean;
        error?: string;
      };
      if (raw.ok === false) throw new ApiError(str(raw.error) || "Calculate failed", 400, raw);
      setEstimate({
        totals: raw.totals,
        lineItems: Array.isArray(raw.lineItems) ? raw.lineItems : [],
        warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
        pricing: raw.pricing
      });
      setActionMsg("Estimate updated from server.");
    } catch (e: unknown) {
      const body = e instanceof ApiError ? e.body : null;
      const fe = friendlyError(e, body);
      setActionError(`${fe.title}: ${fe.detail}`);
    } finally {
      setCalcBusy(false);
    }
  };

  const runSubmit = async () => {
    if (!sessionToken || !context?.capabilities?.can_submit) return;
    if (!estimate?.totals?.estimate_total) {
      setActionError("Run Create estimate first so the server has an authoritative total.");
      return;
    }
    if (!window.confirm("Submit this quote request to your fabricator?")) return;
    setSubmitBusy(true);
    setActionError(null);
    setActionMsg(null);
    try {
      const payload = {
        ...buildPartnerQuotePayload(form),
        ...partnerBodyExtras(selectedPartnerId)
      };
      const raw = (await apiPostJson("/api/partner-quote/submit", sessionToken, payload)) as Row;
      if (raw.ok === false) throw new ApiError(str(raw.error) || "Submit failed", 400, raw);
      setSubmitResult(raw);
      setActionMsg(`Quote submitted: ${str(raw.quote_number) || str(raw.quote_id)}`);
      setTab("my_quotes");
    } catch (e: unknown) {
      const body = e instanceof ApiError ? e.body : null;
      const fe = friendlyError(e, body);
      setActionError(`${fe.title}: ${fe.detail}`);
    } finally {
      setSubmitBusy(false);
    }
  };

  const pricingReady = context?.pricing?.assignment_active !== false && Boolean(context?.pricing?.structure_code);

  return (
    <div className="pq-page" style={themeStyle}>
      <header className="pq-hero">
        {branding?.logo_url ? (
          <img src={str(branding.logo_url)} alt="" className="pq-logo-partner" />
        ) : (
          <img src={EOS_LOGO_URL} alt="eliteOS" className="pq-logo-fallback" />
        )}
        <div>
          <h1>{partnerTitle}</h1>
          <p className="pq-sub">
            Partner quote · {orgTitle}
            {context?.partner_account?.account_slug ? (
              <>
                {" "}
                · <code>{str(context.partner_account.account_slug)}</code>
              </>
            ) : null}
          </p>
        </div>
      </header>

      <div className="pq-pilot-banner">
        <strong>Internal pilot only.</strong> For test users with partner access — not open to external partners until
        RLS and leakage testing are complete. Do not share login credentials outside your pilot group.
      </div>

      {!supabase ? (
        <div className="pq-card">
          <p className="pq-error">Supabase environment variables are missing for this head.</p>
        </div>
      ) : !sessionToken ? (
        <div className="pq-card">
          <h2>Sign in required</h2>
          <p className="pq-muted">Use your fabricator-issued test account with partner quote access.</p>
          <div className="pq-grid2">
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
          <button type="button" className="pq-btn primary" disabled={authBusy} onClick={() => void signIn()}>
            {authBusy ? "Signing in…" : "Sign in"}
          </button>
          {authError ? <p className="pq-error">{authError}</p> : null}
        </div>
      ) : (
        <>
          <div className="pq-toolbar">
            <button type="button" className="pq-btn ghost" onClick={() => void signOut()}>
              Sign out
            </button>
            <span className="pq-muted">API: {config.backendBaseUrl}</span>
          </div>

          {contextBusy ? <p className="pq-muted">Loading partner context…</p> : null}

          {contextError ? (
            <div className="pq-card pq-error-card">
              <h2>{contextError.title}</h2>
              <p>{contextError.detail}</p>
              {contextError.allowed?.length ? (
                <div>
                  <p className="pq-muted">Select which partner account to use:</p>
                  <ul className="pq-pick-list">
                    {contextError.allowed.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="pq-btn secondary"
                          onClick={() => {
                            setSelectedPartnerId(p.id);
                            setContextError(null);
                          }}
                        >
                          {p.account_slug || p.id}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <button type="button" className="pq-btn secondary" onClick={() => void loadContext()}>
                Retry
              </button>
            </div>
          ) : null}

          {context && !contextError ? (
            <>
              <div className="pq-card pq-context-card">
                <div className="pq-context-grid">
                  <div>
                    <span className="pq-label">Assigned pricing</span>
                    <strong>
                      {str(context.pricing?.structure_label) || str(context.pricing?.structure_code) || "—"}
                    </strong>
                    {!pricingReady ? (
                      <p className="pq-warn">No active pricing assignment — contact your fabricator admin.</p>
                    ) : null}
                  </div>
                  <div>
                    <span className="pq-label">Your role</span>
                    <strong>
                      {context.capabilities?.can_submit
                        ? "Can estimate and submit"
                        : context.capabilities?.can_calculate
                          ? "Can estimate"
                          : "View only"}
                    </strong>
                  </div>
                </div>
              </div>

              {actionMsg ? <p className="pq-ok">{actionMsg}</p> : null}
              {actionError ? <p className="pq-error">{actionError}</p> : null}

              <div className="pq-tabs">
                <button type="button" className={tab === "estimate" ? "on" : ""} onClick={() => setTab("estimate")}>
                  Create estimate
                </button>
                <button
                  type="button"
                  className={tab === "my_quotes" ? "on" : ""}
                  onClick={() => setTab("my_quotes")}
                  disabled={!context.capabilities?.can_view_quotes}
                >
                  My quotes
                </button>
              </div>

              {tab === "estimate" ? (
                <div className="pq-grid-main">
                  <div className="pq-card">
                    <h2>Project</h2>
                    <div className="pq-grid2">
                      <label>
                        Customer name
                        <input
                          value={form.customerName}
                          onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                        />
                      </label>
                      <label>
                        Project name
                        <input
                          value={form.projectName}
                          onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))}
                        />
                      </label>
                      <label className="pq-span2">
                        Address
                        <input
                          value={form.projectAddress}
                          onChange={(e) => setForm((f) => ({ ...f, projectAddress: e.target.value }))}
                        />
                      </label>
                      <label>
                        City
                        <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                      </label>
                      <label>
                        State
                        <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
                      </label>
                      <label>
                        ZIP
                        <input value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} />
                      </label>
                    </div>

                    <h2 style={{ marginTop: 20 }}>Area &amp; material</h2>
                    <div className="pq-grid2">
                      <label>
                        Room / area name
                        <input
                          value={form.roomName}
                          onChange={(e) => setForm((f) => ({ ...f, roomName: e.target.value }))}
                        />
                      </label>
                      <label>
                        Material group
                        <select
                          value={form.materialGroup}
                          onChange={(e) => setForm((f) => ({ ...f, materialGroup: e.target.value }))}
                        >
                          {PARTNER_MATERIAL_GROUPS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <fieldset className="pq-fieldset">
                      <legend>Measurement</legend>
                      <label className="pq-radio">
                        <input
                          type="radio"
                          checked={form.measurementMode === "manual"}
                          onChange={() => setForm((f) => ({ ...f, measurementMode: "manual" }))}
                        />
                        Manual square footage
                      </label>
                      <label className="pq-radio">
                        <input
                          type="radio"
                          checked={form.measurementMode === "simple_runs"}
                          onChange={() => setForm((f) => ({ ...f, measurementMode: "simple_runs" }))}
                        />
                        Simple run (length × depth)
                      </label>
                    </fieldset>

                    {form.measurementMode === "manual" ? (
                      <div className="pq-grid2">
                        <label>
                          Countertop SF
                          <input
                            inputMode="decimal"
                            value={form.countertopSf}
                            onChange={(e) => setForm((f) => ({ ...f, countertopSf: e.target.value }))}
                          />
                        </label>
                        <label>
                          Backsplash SF
                          <input
                            inputMode="decimal"
                            value={form.backsplashSf}
                            onChange={(e) => setForm((f) => ({ ...f, backsplashSf: e.target.value }))}
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="pq-grid2">
                        <label>
                          Run length (in)
                          <input
                            inputMode="decimal"
                            value={form.runLengthIn}
                            onChange={(e) => setForm((f) => ({ ...f, runLengthIn: e.target.value }))}
                          />
                        </label>
                        <label>
                          Depth (in)
                          <input
                            inputMode="decimal"
                            value={form.runDepthIn}
                            onChange={(e) => setForm((f) => ({ ...f, runDepthIn: e.target.value }))}
                          />
                        </label>
                      </div>
                    )}

                    <label className="pq-span2">
                      Notes
                      <textarea
                        rows={3}
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      />
                    </label>

                    <div className="pq-actions">
                      <button
                        type="button"
                        className="pq-btn primary"
                        disabled={calcBusy || !pricingReady || !context.capabilities?.can_calculate}
                        onClick={() => void runCalculate()}
                      >
                        {calcBusy ? "Calculating…" : "Create estimate"}
                      </button>
                      <button
                        type="button"
                        className="pq-btn secondary"
                        disabled={submitBusy || !pricingReady || !context.capabilities?.can_submit || !estimate}
                        onClick={() => void runSubmit()}
                      >
                        {submitBusy ? "Submitting…" : "Submit quote request"}
                      </button>
                    </div>
                  </div>

                  <div className="pq-card pq-estimate-card">
                    <h2>Your estimate</h2>
                    {!estimate ? (
                      <p className="pq-muted">Run Create estimate to see your total from the fabricator pricing program.</p>
                    ) : (
                      <>
                        <p className="pq-total">{money(estimate.totals?.estimate_total)}</p>
                        {estimate.totals?.estimated_sqft != null ? (
                          <p className="pq-muted">About {Number(estimate.totals.estimated_sqft).toFixed(1)} sq ft</p>
                        ) : null}
                        {estimate.pricing?.structure_label ? (
                          <p className="pq-muted">Pricing program: {str(estimate.pricing.structure_label)}</p>
                        ) : null}
                        {estimate.warnings?.length ? (
                          <ul className="pq-warn-list">
                            {estimate.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        ) : null}
                        {estimate.lineItems?.length ? (
                          <>
                            <h3>Summary</h3>
                            <table className="pq-table">
                              <thead>
                                <tr>
                                  <th>Item</th>
                                  <th>Qty</th>
                                  <th>Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {estimate.lineItems.map((ln, idx) => (
                                  <tr key={idx}>
                                    <td>{str(ln.item_name)}</td>
                                    <td>
                                      {str(ln.quantity)} {str(ln.unit_type)}
                                    </td>
                                    <td>{money(ln.line_subtotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        ) : null}
                      </>
                    )}
                    {submitResult ? (
                      <p className="pq-ok" style={{ marginTop: 12 }}>
                        Last submit: {str(submitResult.quote_number)} — {str(submitResult.quote_status)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {tab === "my_quotes" ? (
                <div className="pq-card">
                  <h2>My quotes</h2>
                  <p className="pq-muted">Quotes submitted under your partner account (server-filtered).</p>
                  <button type="button" className="pq-btn secondary" disabled={quotesBusy} onClick={() => void loadMyQuotes()}>
                    {quotesBusy ? "Loading…" : "Refresh"}
                  </button>
                  {quotesBusy ? null : myQuotes.length ? (
                    <table className="pq-table" style={{ marginTop: 12 }}>
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Date</th>
                          <th>Customer</th>
                          <th>Project</th>
                          <th>Status</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myQuotes.map((q) => (
                          <tr key={str(q.id)}>
                            <td>
                              <code>{str(q.quote_number)}</code>
                            </td>
                            <td>{str(q.created_at).slice(0, 10)}</td>
                            <td>{str(q.customer_name) || "—"}</td>
                            <td>{str(q.project_name) || "—"}</td>
                            <td>{str(q.quote_status)}</td>
                            <td>{money(q.grand_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="pq-muted">No quotes yet.</p>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
