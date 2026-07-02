import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiFetch } from "../lib/api";
import { config } from "../lib/config";
import { supabase } from "../lib/supabase";
import type { MeResp } from "../lib/types";
import SalesAppHero from "./sales-dashboard/SalesAppHero";
import { SalesDashboardProvider } from "./sales-dashboard/SalesDashboardContext";
import SalesDetailDrawer from "./sales-dashboard/SalesDetailDrawer";
import SalesTabBar from "./sales-dashboard/SalesTabBar";
import SalesTabPanels from "./sales-dashboard/SalesTabPanels";
import "./sales-dashboard.css";
import "./command-center.css";
import EliteosTopbar from "../../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../../shared/eliteos-ui/EliteosTopbar";
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authBootstrapError, setAuthBootstrapError] = useState("");
  const [me, setMe] = useState<MeResp | null>(null);
  const [loadError, setLoadError] = useState("");

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

  // Chip subtitle: match the Home Launcher / Quote Library fallback order
  // (job_title -> department -> role). Role/title is upper-cased here so it
  // reads as a polished label (e.g. "ARCHITECT"); the shared chip-role style
  // is not force-uppercased in this head (see styles.css override) so the
  // email fallback keeps its natural casing. Email is only used when no
  // role/title is available, and never when it just echoes the display name.
  const userRoleTitle = (
    String(me?.user?.job_title ?? "").trim() ||
    String(me?.user?.department ?? "").trim() ||
    String(me?.user?.role ?? "").trim()
  );
  const userChipSubtitle = userRoleTitle
    ? userRoleTitle.toUpperCase()
    : userEmail && userEmail.toLowerCase() !== userDisplayName.toLowerCase()
      ? userEmail
      : "";

  const workspaceName = DEFAULT_WORKSPACE_NAME;
  const workspaceShortId = DEFAULT_WORKSPACE_SHORT;
  const workspaceLogoUrl = ELITE_LOGO_URL;
  const workspaceInitialsValue = useMemo(() => workspaceInitials(workspaceName), [workspaceName]);

  const salesMenuItems: EliteosTopbarMenuItem[] = [
    {
      label: "Open Home",
      meta: "eliteOS Launcher",
      href: config.homeUrl,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11.5L12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      )
    },
    {
      label: "Profile & preferences",
      meta: "eliteOS Home",
      href: `${config.homeUrl}?view=profile`,
      title: "Profile & preferences",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5" />
        </svg>
      )
    }
  ];

  const accessForbidden = Boolean(loadError && loadError.includes("do not have access"));

  if (authBootstrapError.trim() && !session?.access_token) {
    return (
      <div className="sales-shell">
        <EliteosTopbar
          appName="Sales Dashboard"
          organizationName={workspaceName}
          logoSrc={workspaceLogoUrl}
        />
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
        <EliteosTopbar
          appName="Sales Dashboard"
          organizationName={workspaceName}
          logoSrc={workspaceLogoUrl}
          homeHref={config.homeUrl}
        />
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
      <EliteosTopbar
        appName="Sales Dashboard"
        organizationName={workspaceName}
        logoSrc={workspaceLogoUrl}
        homeHref={config.homeUrl}
        userName={userDisplayName}
        userEmail={userEmail}
        userSubtitle={userChipSubtitle}
        initials={userDisplayInitials}
        menuItems={salesMenuItems}
        onSignOut={signOut}
      />

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
            {loadError && !accessForbidden ? (
              <div className="eos-banner" role="alert" style={{ whiteSpace: "pre-wrap" }}>
                {loadError}
              </div>
            ) : null}

            <SalesDashboardProvider token={token} onLoadError={onPiLoadError}>
              <SalesAppHero />
              <SalesTabBar />
              <SalesDetailDrawer />
              <SalesTabPanels token={token} onLoadError={onPiLoadError} />
            </SalesDashboardProvider>
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
