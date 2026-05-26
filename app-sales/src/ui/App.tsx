import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiFetch } from "../lib/api";
import { config } from "../lib/config";
import { supabase } from "../lib/supabase";
import type { FiltersResponse, MeResp } from "../lib/types";
import SalesCommandCenterView from "./SalesCommandCenterView";
import SalesIntelligenceView from "./SalesIntelligenceView";
import QuotePipelinePanel from "./QuotePipelinePanel";
import KpiV1Panel from "./KpiV1Panel";
import "./sales-intelligence.css";

/**
 * eliteOS Sales Head — protected-head shell.
 *
 * Visual / app-shell aligned with Home Launcher / Quote Library /
 * Internal Estimate / Pricing Admin / System Admin (see
 * `docs/eliteos/eliteos-ui-direction.md`).
 *
 * Backend behavior preserved exactly:
 *   - `/api/me`, `/api/sales/filters`, `/api/sales/dashboard-foundation`
 *     all called exactly as before.
 *   - All filter state lives on the same shape; no payload changes.
 *   - SalesCommandCenterView, SalesIntelligenceView, QuotePipelinePanel
 *     are mounted unchanged.
 *   - Auth fallback uses Supabase password sign-in — no new identity
 *     providers, no new backend endpoints.
 *
 * New in this pass:
 *   - Protected-head topbar with workspace identity, eliteOS wordmark,
 *     "Sales Dashboard · Elite Stone Fabrication" subtitle, and a user
 *     chip + dropdown menu (Open Home / Profile coming soon / Sign out).
 *   - Premium hero ("Internal tool · Sales Dashboard") with workspace
 *     identity panel and freshness chips derived from already-loaded data.
 *   - Read-only KPI History scaffold tab (planning, no fake metrics).
 *
 * Out of scope (intentionally not built):
 *   - KPI snapshot engine, Moraware sync rewrite, Sales attribution
 *     rewrite, Quote Library rewrite, partner pipeline data fetch.
 *   - No new backend endpoints; no backend behavior changes.
 */

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const DEFAULT_WORKSPACE_SHORT = "ESF";
const ELITE_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

function workspaceInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "ES"
  );
}

function deriveDisplayNameFromEmail(email: string): string {
  const e = String(email || "").trim();
  if (!e) return "";
  const local = e.includes("@") ? e.split("@")[0] : e;
  const words = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return e;
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function userInitialsFor(name: string, email: string): string {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const e = String(email || "").trim();
  if (e) {
    const local = e.includes("@") ? e.split("@")[0] : e;
    const parts = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }
  return "ES";
}

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

type SalesTab = "command_center" | "quote_pipeline" | "kpi_history" | "intelligence";

const TABS: ReadonlyArray<{ id: SalesTab; label: string; planning?: boolean }> = [
  { id: "command_center", label: "Command center" },
  { id: "quote_pipeline", label: "Quote pipeline" },
  { id: "kpi_history", label: "KPI history" },
  { id: "intelligence", label: "Legacy intelligence" }
];

export default function App() {
  const [advFiltersOpen, setAdvFiltersOpen] = useState(false);
  const [salesTab, setSalesTab] = useState<SalesTab>("command_center");

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

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

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

  /** Close user menu on outside click / Escape. */
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

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
    setUserMenuOpen(false);
    void supabase.auth.signOut();
  }

  function applyFiltersClick() {
    setAppliedFilters({ ...draftFilters });
  }

  function clearFilters() {
    setDraftFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
  }

  const sessionEmail = session?.user?.email ?? "";
  const userMetaName = useMemo(() => {
    const meta = (session?.user?.user_metadata ?? {}) as Record<string, unknown>;
    return (
      [meta.full_name, meta.name, meta.display_name]
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .find((v) => Boolean(v)) || ""
    );
  }, [session?.user?.user_metadata]);

  const userEmail = String(me?.user?.email ?? sessionEmail ?? "");
  const userMeName = String(me?.user?.full_name ?? userMetaName ?? "");
  const userDisplayName = useMemo(
    () => userMeName.trim() || deriveDisplayNameFromEmail(userEmail) || "Signed in",
    [userMeName, userEmail]
  );
  const userDisplayInitials = useMemo(
    () => userInitialsFor(userMeName, userEmail),
    [userMeName, userEmail]
  );
  const userRole = String(me?.user?.role ?? "").trim();

  const workspaceName = DEFAULT_WORKSPACE_NAME;
  const workspaceShortId = DEFAULT_WORKSPACE_SHORT;
  const workspaceLogoUrl = ELITE_LOGO_URL;
  const workspaceInitialsValue = useMemo(() => workspaceInitials(workspaceName), [workspaceName]);

  const accessForbidden = Boolean(loadError && loadError.includes("do not have access"));

  if (authBootstrapError.trim() && !session?.access_token) {
    return (
      <div className="sales-shell">
        <header className="eos-topbar" role="banner">
          <span className="eos-brand-row" aria-label={`eliteOS Sales Dashboard — ${workspaceName}`}>
            <span className="eos-brand-mark" aria-hidden>
              <img src={workspaceLogoUrl} alt="" />
            </span>
            <span className="eos-brand-text">
              <span className="eos-brand-wordmark">eliteOS</span>
              <span className="eos-brand-sub">Sales Dashboard · {workspaceName}</span>
            </span>
          </span>
        </header>
        <main className="sales-main">
          <section className="eos-auth-panel" aria-label="Sign-in unavailable">
            <p className="eos-auth-eyebrow">Sales Dashboard · {workspaceName}</p>
            <h2 className="eos-auth-title">Sign-in unavailable</h2>
            <p className="eos-auth-sub">Supabase session bootstrap failed. Fix configuration or try again.</p>
            <div className="eos-banner" role="alert">{authBootstrapError}</div>
            <button type="button" className="eos-auth-cta" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (!session?.access_token) {
    return (
      <div className="sales-shell">
        <header className="eos-topbar" role="banner">
          <a
            href={config.homeUrl}
            className="eos-brand-row"
            aria-label={`eliteOS Sales Dashboard — ${workspaceName}`}
          >
            <span className="eos-brand-mark" aria-hidden>
              <img src={workspaceLogoUrl} alt="" />
            </span>
            <span className="eos-brand-text">
              <span className="eos-brand-wordmark">eliteOS</span>
              <span className="eos-brand-sub">Sales Dashboard · {workspaceName}</span>
            </span>
          </a>
        </header>
        <main className="sales-main">
          <section className="eos-auth-panel" aria-label="Sign in">
            <p className="eos-auth-eyebrow">Internal tool · Sales Dashboard</p>
            <h2 className="eos-auth-title">Sign in to continue</h2>
            <p className="eos-auth-sub">
              Use your eliteOS staff account. Backend authorization (sales head access + approved role) is enforced
              on every API call — no Moraware credentials are exposed to the browser.
            </p>
            <form onSubmit={submitLogin}>
              <div className="eos-auth-grid">
                <div className="eos-auth-field">
                  <label htmlFor="sales-email">Email</label>
                  <input
                    id="sales-email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="eos-auth-field">
                  <label htmlFor="sales-password">Password</label>
                  <input
                    id="sales-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
              {authError ? <div className="eos-banner" role="alert">{authError}</div> : null}
              <button type="submit" className="eos-auth-cta" disabled={loginBusy}>
                {loginBusy ? "Signing in…" : "Sign in"}
              </button>
              <p className="eos-auth-trust">
                Authenticated through Supabase. No service-role keys are used in the browser. No browser-side
                Moraware calls.
              </p>
            </form>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="sales-shell">
      <header className="eos-topbar" role="banner">
        <a
          href={config.homeUrl}
          className="eos-brand-row"
          aria-label={`eliteOS Sales Dashboard — ${workspaceName}`}
        >
          <span className="eos-brand-mark" aria-hidden>
            <img src={workspaceLogoUrl} alt="" />
          </span>
          <span className="eos-brand-text">
            <span className="eos-brand-wordmark">eliteOS</span>
            <span className="eos-brand-sub">Sales Dashboard · {workspaceName}</span>
          </span>
        </a>
        <div className="eos-topbar-actions">
          <div className="eos-account-wrap" ref={userMenuRef}>
            <button
              type="button"
              className={`eos-account${userMenuOpen ? " is-open" : ""}`}
              aria-label="Open account menu"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <span className="eos-avatar" aria-hidden>
                {userDisplayInitials}
              </span>
              <span className="eos-account-text">
                <span className="eos-account-name">{userDisplayName}</span>
                {userRole || (userEmail && userEmail.toLowerCase() !== userDisplayName.toLowerCase()) ? (
                  <span className="eos-account-role">
                    {userRole ? `role · ${userRole}` : userEmail}
                  </span>
                ) : null}
              </span>
              <span className="eos-account-caret" aria-hidden>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>
            {userMenuOpen ? (
              <div className="eos-user-menu" role="menu" aria-label="Account menu">
                <div className="eos-user-menu-header">
                  <p className="eos-user-menu-name">{userDisplayName}</p>
                  {userEmail ? <p className="eos-user-menu-email">{userEmail}</p> : null}
                  <p className="eos-user-menu-workspace">
                    <span>Workspace ·</span> <strong>{workspaceName}</strong>
                    <span className="eos-user-menu-sep" aria-hidden>·</span>
                    <span>on eliteOS</span>
                  </p>
                </div>
                <div className="eos-user-menu-list">
                  <a
                    href={config.homeUrl}
                    className="eos-user-menu-item"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <span className="eos-user-menu-icon" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 11.5L12 4l9 7.5" />
                        <path d="M5 10v10h14V10" />
                        <path d="M10 20v-6h4v6" />
                      </svg>
                    </span>
                    <span className="eos-user-menu-label">
                      <span>Open Home</span>
                      <span className="eos-user-menu-meta">eliteOS Launcher</span>
                    </span>
                    <span className="eos-user-menu-shortcut" aria-hidden>↗</span>
                  </a>
                  <a
                    href={`${config.homeUrl}?view=profile`}
                    className="eos-user-menu-item"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    title="Profile & preferences"
                  >
                    <span className="eos-user-menu-icon" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="3.5" />
                        <path d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5" />
                      </svg>
                    </span>
                    <span className="eos-user-menu-label">
                      <span>Profile &amp; preferences</span>
                      <span className="eos-user-menu-meta">eliteOS Home</span>
                    </span>
                  </a>
                </div>
                <div className="eos-user-menu-footer">
                  <button
                    type="button"
                    className="eos-user-menu-item eos-user-menu-signout"
                    role="menuitem"
                    onClick={signOut}
                  >
                    <span className="eos-user-menu-icon" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    </span>
                    <span className="eos-user-menu-label">Sign out</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="sales-main">
        {accessForbidden ? (
          <>
            <section className="eos-hero" aria-labelledby="sales-hero-title">
              <div className="eos-hero-aurora" aria-hidden />
              <div className="eos-hero-grid">
                <div className="eos-hero-main">
                  <p className="eos-hero-eyebrow">Internal tool · Sales Dashboard</p>
                  <h1 id="sales-hero-title" className="eos-hero-title">Access required</h1>
                  <p className="eos-hero-sub">
                    Your account is signed in, but it doesn&rsquo;t have the <strong>sales</strong> head. Ask an admin to grant
                    access in System Admin → People &amp; access.
                  </p>
                </div>
              </div>
            </section>
            <div className="eos-banner" role="alert">
              {loadError} Ask an admin to assign the <strong>sales</strong> head if you should have access.
            </div>
            <p>
              <a href={config.homeUrl}>Return to Home</a>
            </p>
          </>
        ) : (
          <>
            <section className="eos-hero" aria-labelledby="sales-hero-title">
              <div className="eos-hero-aurora" aria-hidden />
              <div className="eos-hero-grid">
                <div className="eos-hero-main">
                  <p className="eos-hero-eyebrow">Internal tool · Sales Dashboard</p>
                  <h1 id="sales-hero-title" className="eos-hero-title">
                    Sales performance command center
                  </h1>
                  <p className="eos-hero-sub">
                    One leadership view for <strong>Moraware production actuals</strong>, the{" "}
                    <strong>Quote Library pipeline</strong>, planned <strong>KPI history</strong>, and{" "}
                    <strong>data trust</strong>. Moraware records the work, Quote Library records the quotes —
                    Sales explains and compares those facts without mutating them.
                  </p>
                  <div className="eos-hero-chips">
                    <span className="eos-hero-chip eos-hero-chip--info">
                      <strong>Source ·</strong> Moraware sync · Quote Library
                    </span>
                    <span className="eos-hero-chip eos-hero-chip--warn">
                      <strong>Trust ·</strong> Branch / rep gated by approved Sales Account Mapping
                    </span>
                    <span className="eos-hero-chip">
                      <strong>API ·</strong> <code>{config.backendBaseUrl || "(same origin)"}</code>
                    </span>
                  </div>
                </div>

                <aside className="eos-hero-workspace" aria-label={`Workspace · ${workspaceName}`}>
                  <p className="eos-hero-workspace-eyebrow">Workspace</p>
                  <div className="eos-hero-workspace-card">
                    <div className="eos-hero-workspace-mark">
                      <img
                        src={workspaceLogoUrl}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                          const fallback = (e.currentTarget.parentElement as HTMLElement | null)?.querySelector(
                            ".eos-hero-workspace-initials"
                          ) as HTMLElement | null;
                          if (fallback) fallback.style.display = "flex";
                        }}
                      />
                      <span
                        className="eos-hero-workspace-initials"
                        aria-hidden="true"
                        style={{ display: "none" }}
                      >
                        {workspaceInitialsValue}
                      </span>
                    </div>
                    <div className="eos-hero-workspace-text">
                      <p className="eos-hero-workspace-name">{workspaceName}</p>
                      <p className="eos-hero-workspace-meta">
                        <span>on </span>
                        <span className="eos-hero-workspace-platform">eliteOS</span>
                        <span className="eos-hero-workspace-sep" aria-hidden>·</span>
                        <span>{workspaceShortId}</span>
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            </section>

            {loadError && !accessForbidden ? (
              <div className="eos-banner" role="alert" style={{ whiteSpace: "pre-wrap" }}>
                {loadError}
              </div>
            ) : null}

            <nav className="eos-tabbar" aria-label="Sales Head views">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`eos-tab${salesTab === t.id ? " is-on" : ""}`}
                  aria-current={salesTab === t.id ? "page" : undefined}
                  onClick={() => setSalesTab(t.id)}
                >
                  {t.label}
                  {t.planning ? <span className="eos-tab-badge">Planning</span> : null}
                </button>
              ))}
            </nav>

            {salesTab === "command_center" ? (
              <SalesCommandCenterView token={token} onLoadError={onPiLoadError} />
            ) : null}

            {salesTab === "quote_pipeline" ? <QuotePipelinePanel token={token} /> : null}

            {salesTab === "kpi_history" ? <KpiV1Panel token={token} /> : null}

            {salesTab === "intelligence" ? (
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
                    style={{
                      marginBottom: "1rem",
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      padding: "1rem",
                      background: "#fff"
                    }}
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
                      <select
                        value={draftFilters.jobStatus}
                        onChange={(e) => setDraftFilters((f) => ({ ...f, jobStatus: e.target.value }))}
                      >
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
                      <input
                        value={draftFilters.city}
                        onChange={(e) => setDraftFilters((f) => ({ ...f, city: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Min Sq.Ft.</span>
                      <input
                        value={draftFilters.minSqft}
                        onChange={(e) => setDraftFilters((f) => ({ ...f, minSqft: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span>Max Sq.Ft.</span>
                      <input
                        value={draftFilters.maxSqft}
                        onChange={(e) => setDraftFilters((f) => ({ ...f, maxSqft: e.target.value }))}
                      />
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
                <SalesIntelligenceView
                  token={token}
                  me={me}
                  legacyFilterQuery={legacyFilterQuery}
                  onLoadError={onPiLoadError}
                />
              </>
            ) : null}
          </>
        )}
      </main>

      <footer className="eos-footer-bar" role="contentinfo">
        <span>eliteOS · Sales Dashboard</span>
        <span className="eos-footer-meta">
          Authorized staff only — backend enforces role + sales head access on every API call.
        </span>
      </footer>
    </div>
  );
}
