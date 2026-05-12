import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiFetch } from "../lib/api";
import { config } from "../lib/config";
import { supabase } from "../lib/supabase";
import type { FiltersResponse, MeResp } from "../lib/types";
import SalesIntelligenceView from "./SalesIntelligenceView";
import QuotePipelinePanel from "./QuotePipelinePanel";
import "./sales-intelligence.css";

type FilterState = {
  salespeopleCsv: string;
  account: string;
  jobStatus: string;
  process: string;
  materialColor: string;
  city: string;
  minSqft: string;
  maxSqft: string;
};

const EMPTY_FILTERS: FilterState = {
  salespeopleCsv: "",
  account: "",
  jobStatus: "",
  process: "",
  materialColor: "",
  city: "",
  minSqft: "",
  maxSqft: ""
};

function buildLegacyFilterQuery(f: FilterState): string {
  const p = new URLSearchParams();
  if (f.salespeopleCsv.trim()) p.set("salesperson", f.salespeopleCsv.trim());
  if (f.account.trim()) p.set("account", f.account.trim());
  if (f.jobStatus.trim()) p.set("jobStatus", f.jobStatus.trim());
  if (f.process.trim()) p.set("process", f.process.trim());
  if (f.materialColor.trim()) p.set("materialColor", f.materialColor.trim());
  if (f.city.trim()) p.set("city", f.city.trim());
  if (f.minSqft.trim()) p.set("minSqft", f.minSqft.trim());
  if (f.maxSqft.trim()) p.set("maxSqft", f.maxSqft.trim());
  return p.toString();
}

export default function App() {
  const [advFiltersOpen, setAdvFiltersOpen] = useState(false);
  const [salesTab, setSalesTab] = useState<"intelligence" | "quote_pipeline">("intelligence");

  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBootstrapError, setAuthBootstrapError] = useState("");
  const [me, setMe] = useState<MeResp | null>(null);
  const [loadError, setLoadError] = useState("");

  const [draftFilters, setDraftFilters] = useState<FilterState>({ ...EMPTY_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({ ...EMPTY_FILTERS });
  const [filtersMeta, setFiltersMeta] = useState<FiltersResponse | null>(null);

  const legacyFilterQuery = useMemo(() => buildLegacyFilterQuery(appliedFilters), [appliedFilters]);

  const onPiLoadError = useCallback((msg: string) => {
    setLoadError(msg);
  }, []);

  useEffect(() => {
    let alive = true;
    setAuthBootstrapError("");

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        setAuthBootstrapError("");
        setSession(data.session ?? null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setAuthBootstrapError(
          String((e as Error)?.message ?? e) || "Could not read session from Supabase. Check app env and network."
        );
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((evt, sess) => {
      if (!alive) return;
      const tok = sess?.access_token ?? "";
      if (tok) setAuthBootstrapError("");
      setSession(sess);

      if (evt === "SIGNED_OUT" || !tok) {
        setMe(null);
        setFiltersMeta(null);
        setLoadError("");
        return;
      }
      if (evt === "TOKEN_REFRESHED") return;
      if (evt === "INITIAL_SESSION") return;
    });

    const subscription = authListener?.subscription;
    return () => {
      alive = false;
      subscription?.unsubscribe?.();
    };
  }, []);

  const token = session?.access_token?.trim() ?? "";

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const fm = (await apiFetch("/api/sales/filters", { token })) as FiltersResponse;
        if (!cancelled) setFiltersMeta(fm);
      } catch {
        if (!cancelled) setFiltersMeta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, session?.user?.id]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const meJson = (await apiFetch("/api/me", { token })) as MeResp;
        if (!cancelled) setMe(meJson);
      } catch {
        if (!cancelled) setMe(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, session?.user?.id]);

  async function submitLogin(ev: React.FormEvent) {
    ev.preventDefault();
    setAuthError("");
    setLoginBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e: unknown) {
      setAuthError(String((e as Error)?.message ?? e));
    } finally {
      setLoginBusy(false);
    }
  }

  function signOut() {
    void supabase.auth.signOut();
  }

  function applyFiltersClick() {
    setAppliedFilters({ ...draftFilters });
  }

  function clearFilters() {
    setDraftFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
  }

  if (authBootstrapError.trim() && !session?.access_token) {
    return (
      <div className="sales-shell">
        <div className="login-panel">
          <h1 style={{ marginTop: 0 }}>Sales Head · Sign-in unavailable</h1>
          <p className="muted">Supabase session bootstrap failed. Fix configuration or try again.</p>
          <p className="banner-error">{authBootstrapError}</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    );
  }

  if (!session?.access_token) {
    return (
      <div className="sales-shell">
        <div className="login-panel">
          <h1 style={{ marginTop: 0 }}>Sales Head · Sign in</h1>
          <p className="muted">Brain-backed sales performance intelligence.</p>
          <form onSubmit={submitLogin}>
            <label>
              Email
              <input autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {authError ? <p className="banner-error">{authError}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={loginBusy}>
              {loginBusy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const accessForbidden = Boolean(loadError && loadError.includes("do not have access"));

  return (
    <div className="sales-shell">
      <header className="sales-header">
        <div className="sales-brand">
          <h1>eliteOS Sales Head</h1>
          <p className="sales-motto">Performance intelligence · worksheet Sq.Ft. · Moraware records the work</p>
          <p className="sales-meta">
            {me?.user?.email ?? session.user.email} · role {me?.user?.role ?? "—"}
          </p>
        </div>
        <div className="sales-header-actions">
          <div className="sales-tabbar" style={{ marginRight: 8 }}>
            <button
              type="button"
              className={`btn ${salesTab === "intelligence" ? "tab-on" : ""}`}
              onClick={() => setSalesTab("intelligence")}
            >
              Performance intelligence
            </button>
            <button type="button" className={`btn ${salesTab === "quote_pipeline" ? "tab-on" : ""}`} onClick={() => setSalesTab("quote_pipeline")}>
              Quote pipeline
            </button>
          </div>
          <a className="btn" href={config.homeUrl}>
            Back to Home
          </a>
          <button type="button" className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {accessForbidden ? (
        <main className="sales-main">
          <div className="banner-error">
            {loadError} Ask an admin to assign the <strong>sales</strong> head if you should have access.
          </div>
          <p>
            <a href={config.homeUrl}>Return to Home</a>
          </p>
        </main>
      ) : (
        <>
          {loadError && !accessForbidden ? (
            <main className="sales-main" style={{ paddingBottom: 0 }}>
              <div className="banner-error" style={{ whiteSpace: "pre-wrap" }}>
                {loadError}
              </div>
            </main>
          ) : null}

          <div className="sales-main" style={{ paddingTop: loadError && !accessForbidden ? "0.5rem" : undefined }}>
            {salesTab === "quote_pipeline" ? (
              <QuotePipelinePanel token={token} />
            ) : (
              <>
            <button
              type="button"
              className="btn"
              style={{ marginBottom: "0.75rem" }}
              onClick={() => setAdvFiltersOpen((o) => !o)}
            >
              {advFiltersOpen ? "Hide advanced Brain filters" : "Show advanced Brain filters"}
            </button>
            {advFiltersOpen ? (
              <div
                className="sales-controls"
                style={{ marginBottom: "1rem", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1rem", background: "#fff" }}
              >
                <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
                  Optional Moraware/Brain row filters (status, city, etc.). Apply to Performance Intelligence and Jobs tab.
                </p>
                <label>
                  <span>Moraware salesperson (csv)</span>
                  <input
                    list="salesperson-list"
                    value={draftFilters.salespeopleCsv}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, salespeopleCsv: e.target.value }))}
                    placeholder="Exact Moraware names"
                  />
                  <datalist id="salesperson-list">
                    {(filtersMeta?.salespeople ?? []).map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </label>
                <label>
                  <span>Account contains</span>
                  <input
                    list="account-list"
                    value={draftFilters.account}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, account: e.target.value }))}
                  />
                  <datalist id="account-list">
                    {(filtersMeta?.accounts ?? []).slice(0, 200).map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </label>
                <label>
                  <span>Status</span>
                  <select value={draftFilters.jobStatus} onChange={(e) => setDraftFilters((f) => ({ ...f, jobStatus: e.target.value }))}>
                    <option value="">Any</option>
                    {(filtersMeta?.statuses ?? []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Process</span>
                  <input
                    value={draftFilters.process}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, process: e.target.value }))}
                    placeholder="job_status substring"
                  />
                </label>
                <label>
                  <span>Material / color</span>
                  <input
                    value={draftFilters.materialColor}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, materialColor: e.target.value }))}
                  />
                </label>
                <label>
                  <span>City</span>
                  <input value={draftFilters.city} onChange={(e) => setDraftFilters((f) => ({ ...f, city: e.target.value }))} />
                </label>
                <label>
                  <span>Min Sq.Ft.</span>
                  <input value={draftFilters.minSqft} onChange={(e) => setDraftFilters((f) => ({ ...f, minSqft: e.target.value }))} />
                </label>
                <label>
                  <span>Max Sq.Ft.</span>
                  <input value={draftFilters.maxSqft} onChange={(e) => setDraftFilters((f) => ({ ...f, maxSqft: e.target.value }))} />
                </label>
                <div className="sales-controls-filter-actions">
                  <button type="button" className="btn btn-primary" onClick={applyFiltersClick}>
                    Apply Brain filters
                  </button>
                  <button type="button" className="btn" onClick={clearFilters}>
                    Clear Brain filters
                  </button>
                </div>
              </div>
            ) : null}
            <SalesIntelligenceView token={token} me={me} legacyFilterQuery={legacyFilterQuery} onLoadError={onPiLoadError} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
