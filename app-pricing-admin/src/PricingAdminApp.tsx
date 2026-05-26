import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGetJson, apiPatchJson, ApiError } from "@quote-lib/api";
import { config, EOS_LOGO_URL } from "@quote-lib/config";
import { getSupabase } from "./lib/supabase";
import PartnerSetupTab from "./PartnerSetupTab";

type Tab = "dashboard" | "partner_setup" | "groups" | "addons" | "rules" | "audit" | "planned";

type Row = Record<string, unknown>;

/**
 * Brand architecture mirrors Home Launcher / Quote Library / Internal Estimate.
 *
 * The Pricing Admin head is single-tenant today — it does NOT call `/api/me`
 * and has no access to `organization_*` payload fields. We mirror the platform
 * `DEFAULT_WORKSPACE_*` constants so the protected-head topbar reads as part
 * of the same eliteOS family, and so that a future iteration (which may
 * receive `organization_logo_url` from the backend) can extend
 * `resolveWorkspaceLogoUrl` without touching the JSX.
 *
 * Resolution order:
 *   1. me.user.organization_logo_url       — not in scope here yet
 *   2. headsPayload.user.organization_logo_url — not in scope here yet
 *   3. Local Elite Stone Fabrication asset (EOS_LOGO_URL)
 *   4. Initials in a gradient frame
 */
const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const DEFAULT_WORKSPACE_SHORT = "ESF";

function resolveWorkspaceName(): string {
  return DEFAULT_WORKSPACE_NAME;
}

function resolveWorkspaceShortId(): string {
  return DEFAULT_WORKSPACE_SHORT;
}

function resolveWorkspaceLogoUrl(): string | null {
  return EOS_LOGO_URL || null;
}

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

/**
 * eliteOS Home / Launcher canonical URL. Used by the user menu's "Open Home"
 * action. Configurable via `VITE_HEAD_URL_HOME` for staging / local dev;
 * defaults to the production launcher domain documented in
 * `docs/eliteos/CURRENT_SYSTEM_MAP.md`.
 */
function homeLauncherUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_HOME ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}

/**
 * Derive a friendly display name from an email address. Pure client-side; no
 * backend call is added by this head.
 */
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
  /**
   * Email + metadata name come straight from the Supabase session.user
   * object (kept up to date by `onAuthStateChange`). No new backend call
   * is added by this head — the protected-head user chip is purely
   * client-side, matching the Home / Quote Library / Internal Estimate
   * pattern documented in `docs/eliteos/eliteos-ui-direction.md`.
   *
   * Role is intentionally NOT surfaced — Pricing Admin does not know the
   * caller's role without a backend call, so any role-gated link (e.g.
   * System Admin) is omitted to avoid implying false access. The backend
   * still authoritatively enforces role/head-access on every API call.
   */
  const [userEmail, setUserEmail] = useState<string>("");
  const [userMetaName, setUserMetaName] = useState<string>("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

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

  const workspaceName = useMemo(() => resolveWorkspaceName(), []);
  const workspaceShortId = useMemo(() => resolveWorkspaceShortId(), []);
  const workspaceLogoUrl = useMemo(() => resolveWorkspaceLogoUrl(), []);
  const workspaceInitialsValue = useMemo(() => workspaceInitials(workspaceName), [workspaceName]);
  const homeBase = useMemo(() => homeLauncherUrl(), []);

  const userDisplayName = useMemo(
    () => userMetaName || deriveDisplayNameFromEmail(userEmail) || "Signed in",
    [userMetaName, userEmail]
  );
  const userDisplayInitials = useMemo(
    () => userInitialsFor(userMetaName, userEmail),
    [userMetaName, userEmail]
  );

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
    setUserEmail("");
    setUserMetaName("");
    setUserMenuOpen(false);
  }, [supabase]);

  /**
   * Restore session token + capture display identity from Supabase. Mirrors
   * Quote Library / Internal Estimate — no new backend call is added.
   */
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const applySession = (sess: {
      access_token?: string;
      user?: { id?: string; email?: string | null; user_metadata?: Record<string, unknown> } | null;
    } | null) => {
      if (!alive) return;
      const tok = sess?.access_token ?? "";
      setSessionToken(tok || null);
      const u = sess?.user || null;
      setUserEmail(String(u?.email ?? ""));
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const metaName =
        [meta.full_name, meta.name, meta.display_name]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .find((v) => Boolean(v)) || "";
      setUserMetaName(metaName);
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => applySession(sess));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

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
        setErr("Forbidden — need admin, finance, or executive role and eliteOS Pricing Admin Head access.");
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

  const handleMenuReload = async () => {
    setUserMenuOpen(false);
    await loadCore();
    if (tab === "audit") await loadAudit();
  };

  return (
    <div className="shell">
      <header className="topbar" role="banner">
        <a
          href={homeBase}
          className="brand-row brand-row-link"
          aria-label={`eliteOS Pricing Admin — ${workspaceName}`}
        >
          <span className="brand-mark" aria-hidden>
            {workspaceLogoUrl ? <img src={workspaceLogoUrl} alt="" /> : null}
          </span>
          <span className="brand-text">
            <span className="brand-wordmark">eliteOS</span>
            <span className="brand-sub">Pricing Admin · {workspaceName}</span>
          </span>
        </a>
        <div className="topbar-actions">
          {sessionToken ? (
            <div className="topbar-account-wrap" ref={userMenuRef}>
              <button
                type="button"
                className={`topbar-account${userMenuOpen ? " is-open" : ""}`}
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                <span className="topbar-avatar" aria-hidden>
                  {userDisplayInitials}
                </span>
                <span className="topbar-account-text">
                  <span className="topbar-account-name">{userDisplayName}</span>
                  {userEmail && userEmail.toLowerCase() !== userDisplayName.toLowerCase() ? (
                    <span className="topbar-account-role">{userEmail}</span>
                  ) : null}
                </span>
                <span className="topbar-account-caret" aria-hidden>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
              {userMenuOpen ? (
                <div className="user-menu" role="menu" aria-label="Account menu">
                  <div className="user-menu-header">
                    <p className="user-menu-name">{userDisplayName}</p>
                    {userEmail ? <p className="user-menu-email">{userEmail}</p> : null}
                    <p className="user-menu-workspace">
                      <span>Workspace ·</span>{" "}
                      <strong>{workspaceName}</strong>
                      <span className="user-menu-sep" aria-hidden>·</span>
                      <span>on slabOS</span>
                    </p>
                  </div>
                  <div className="user-menu-list">
                    <a
                      href={homeBase}
                      className="user-menu-item"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <span className="user-menu-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 11.5L12 4l9 7.5" />
                          <path d="M5 10v10h14V10" />
                          <path d="M10 20v-6h4v6" />
                        </svg>
                      </span>
                      <span className="user-menu-label">
                        <span>Open Home</span>
                        <span className="user-menu-meta">eliteOS Launcher</span>
                      </span>
                      <span className="user-menu-shortcut" aria-hidden>↗</span>
                    </a>
                    <button
                      type="button"
                      className="user-menu-item"
                      role="menuitem"
                      onClick={() => void handleMenuReload()}
                      disabled={busy}
                    >
                      <span className="user-menu-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 1 1-3-6.7" />
                          <path d="M21 4v5h-5" />
                        </svg>
                      </span>
                      <span className="user-menu-label">
                        <span>{busy ? "Reloading…" : "Reload pricing data"}</span>
                        <span className="user-menu-meta">Groups, rates, add-ons, rules</span>
                      </span>
                    </button>
                    <a
                      href={`${homeBase}?view=profile`}
                      className="user-menu-item"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      title="Profile & preferences"
                    >
                      <span className="user-menu-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="8" r="3.5" />
                          <path d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5" />
                        </svg>
                      </span>
                      <span className="user-menu-label">
                        <span>Profile &amp; preferences</span>
                        <span className="user-menu-meta">eliteOS Home</span>
                      </span>
                    </a>
                  </div>
                  <div className="user-menu-footer">
                    <button
                      type="button"
                      className="user-menu-item user-menu-signout"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        void signOut();
                      }}
                    >
                      <span className="user-menu-icon" aria-hidden>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                      </span>
                      <span className="user-menu-label">Sign out</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <main className="main" role="main">
        {!supabase ? (
          <div className="banner banner-warn" role="alert">
            <strong>Supabase is not configured.</strong>{" "}
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to sign in.
          </div>
        ) : null}

        {!sessionToken && supabase ? (
          <section className="auth-panel auth-panel-standalone" aria-label="Sign in">
            <header className="auth-panel-header">
              <p className="auth-panel-eyebrow">Pricing Admin · {workspaceName}</p>
              <h2 className="auth-panel-title">Sign in to continue</h2>
              <p className="auth-panel-sub">
                Use your eliteOS staff account. Backend authorization (admin / finance / executive role + Pricing Admin head access) is enforced on every API call.
              </p>
            </header>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="pa-email">Email</label>
                <input
                  id="pa-email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoComplete="username"
                  placeholder="you@example.com"
                />
              </div>
              <div className="field">
                <label htmlFor="pa-password">Password</label>
                <input
                  id="pa-password"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
            {authError ? (
              <div className="banner banner-error" role="alert" style={{ marginTop: 8 }}>
                {authError}
              </div>
            ) : null}
            <button
              type="button"
              className="btn primary"
              style={{ marginTop: 16 }}
              disabled={authBusy}
              onClick={() => void signIn()}
            >
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
            <p className="auth-trust">
              Authenticated through Supabase. No service-role keys are used in the browser.
            </p>
          </section>
        ) : null}

        {sessionToken ? (
          <>
            <section className="pa-hero" aria-labelledby="pa-hero-title">
              <div className="hero-aurora" aria-hidden />
              <div className="pa-hero-grid">
                <div className="pa-hero-main">
                  <p className="hero-eyebrow">Internal tool · Pricing Admin</p>
                  <h1 id="pa-hero-title" className="hero-title">Pricing control center</h1>
                  <p className="hero-sub">
                    Manage quote pricing inputs, material rates, add-ons, public policy rules, and resolver readiness. Backend{" "}
                    <code>/api/pricing-admin/*</code>.
                  </p>
                  <p className="hero-domain muted-note">
                    <span>API ·</span> <code className="hero-domain-code">{config.backendBaseUrl}</code>
                    <span className="hero-domain-sep" aria-hidden>·</span>
                    <span>Last row update (loaded scope) · </span>
                    <code className="hero-domain-code">{lastUpdated}</code>
                  </p>
                </div>

                <aside className="hero-workspace" aria-label={`Workspace · ${workspaceName}`}>
                  <p className="hero-workspace-eyebrow">Workspace</p>
                  <div className="hero-workspace-card">
                    <div className="hero-workspace-mark">
                      {workspaceLogoUrl ? (
                        <img
                          src={workspaceLogoUrl}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                            const fallback = (e.currentTarget.parentElement as HTMLElement | null)?.querySelector(
                              ".hero-workspace-initials"
                            ) as HTMLElement | null;
                            if (fallback) fallback.style.display = "flex";
                          }}
                        />
                      ) : null}
                      <span
                        className="hero-workspace-initials"
                        aria-hidden={workspaceLogoUrl ? "true" : "false"}
                        style={workspaceLogoUrl ? { display: "none" } : undefined}
                      >
                        {workspaceInitialsValue}
                      </span>
                    </div>
                    <div className="hero-workspace-text">
                      <p className="hero-workspace-name">{workspaceName}</p>
                      <p className="hero-workspace-meta">
                        <span>on </span>
                        <span className="hero-workspace-platform">slabOS</span>
                        <span className="hero-workspace-sep" aria-hidden>·</span>
                        <span>{workspaceShortId}</span>
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            </section>

            <div className="warn" role="note">
              <strong>Important:</strong> Changes here affect <strong>future</strong> quotes only after the calculator is wired to
              the pricing resolver. Existing quotes keep their saved calculation snapshots. Public consumer math today still uses{" "}
              <code>quoteCalculator.js</code> constants.
            </div>

            {msg ? <div className="banner banner-info" role="status">{msg}</div> : null}
            {err ? <div className="banner banner-error" role="alert">{err}</div> : null}
            {busy ? <p className="muted">Loading…</p> : null}

            <div className="tabs">
              {(
                [
                  ["dashboard", "Dashboard"],
                  ["partner_setup", "Partner setup"],
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

            {tab === "partner_setup" ? (
              <PartnerSetupTab sessionToken={sessionToken} onMessage={setMsg} onError={setErr} />
            ) : null}

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
              <div className="card pa-edit-sticky" style={{ position: "sticky", bottom: 0 }}>
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
              <div className="card pa-edit-sticky" style={{ position: "sticky", bottom: 0 }}>
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
      </main>

      <footer className="footer-bar" role="contentinfo">
        <span>eliteOS · Pricing Admin</span>
        <span className="footer-meta">Authorized staff only — backend authorization is the source of truth.</span>
      </footer>
    </div>
  );
}
