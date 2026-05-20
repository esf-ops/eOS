import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, apiFetch } from "../lib/api";
import { EOS_LOGO_URL, resolveHeadLaunchUrl, sanitizeLauncherLaunchUrl } from "../lib/config";
import { supabase } from "../lib/supabase";

function readOAuthErrorFromBrowser(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const qs = new URLSearchParams(window.location.search);
    const qerr = (qs.get("error_description") || qs.get("error") || "").trim();
    if (qerr) return decodeURIComponent(qerr.replace(/\+/g, " "));
    const rawHash = (window.location.hash || "").replace(/^#/, "").trim();
    if (!rawHash) return null;
    const hp = new URLSearchParams(rawHash);
    const herr = (hp.get("error_description") || hp.get("error") || "").trim();
    if (herr) return decodeURIComponent(herr.replace(/\+/g, " "));
  } catch {
    return null;
  }
  return null;
}

type MeUser = {
  id: string;
  email: string;
  role: string;
  fullName?: string;
  full_name?: string;
  department?: string;
  organization_id?: string | null;
  user_kind?: string;
  isActive?: boolean;
};

type MeResp = { ok: boolean; user: MeUser };

type HeadVisibilityReason = "assigned" | "role_default" | "admin_roadmap" | "full_catalog";

type HeadStatus = "live" | "testing" | "planned";

type HeadCard = {
  slug: string;
  title?: string;
  label: string;
  description: string;
  href: string;
  category: string;
  enabled: boolean;
  visibilityReason?: HeadVisibilityReason;
  url?: string | null;
  status?: HeadStatus;
  is_available?: boolean;
  role_note?: string | null;
};

type HeadsResp = {
  ok: boolean;
  inactive?: boolean;
  user?: { id: string; email: string; role: string; userKind?: string; full_name?: string; organization_id?: string | null };
  heads: HeadCard[];
};

const SECURITY_NOTE =
  "What you see here reflects your access assignments. The Brain still enforces sign-in and permissions on every request.";

/** User-facing launcher titles only — internal API slugs and governance keys are unchanged. */
const LAUNCHER_TOOL_TITLE_BY_SLUG: Record<string, string> = {
  quote: "Estimating Tool",
  quote_library: "Quote Library",
  pricing_admin: "Pricing Admin",
  system_admin: "System Admin",
  public_quote: "Public Quote Tool",
  executive: "Executive Dashboard",
  brain_health: "System Health",
  sales: "Sales Dashboard",
  production: "Production Dashboard",
  shop_tv: "Shop Floor TV",
  install: "Install",
  purchasing: "Purchasing",
  customer_service: "Customer Service",
  hr: "HR",
  safety: "Safety",
  marketing: "Marketing",
  finance: "Finance",
  reports: "Reports",
  partner_quote: "Partner Quote Tool",
  dealer_resources: "Dealer Resources"
};

function launcherCardTitle(h: HeadCard): string {
  const mapped = LAUNCHER_TOOL_TITLE_BY_SLUG[h.slug];
  if (mapped) return mapped;
  const fallback = String(h.title ?? h.label ?? "").trim();
  return fallback || h.slug;
}

const AVAILABLE_SORT_PRIORITY = [
  "quote",
  "quote_library",
  "pricing_admin",
  "system_admin",
  "org_directory",
  "public_quote"
];

type LauncherSection = "Available Tools" | "Coming Soon Tools";

function pickLaunchUrl(head: HeadCard): string | null {
  const fromApi = sanitizeLauncherLaunchUrl(head.url);
  if (import.meta.env.DEV) {
    const fb = sanitizeLauncherLaunchUrl(resolveHeadLaunchUrl(head.slug));
    return fromApi || fb;
  }
  return fromApi;
}

function isEliteosfabProductionUrl(url: string): boolean {
  try {
    const h = new URL(String(url).trim()).hostname.toLowerCase();
    return h === "eliteosfab.com" || h.endsWith(".eliteosfab.com");
  } catch {
    return false;
  }
}

function headLauncherBucket(head: HeadCard): "available" | "roadmap" {
  return pickLaunchUrl(head) ? "available" : "roadmap";
}

function pillClass(text: string): string {
  if (text === "Live") return "pill pill-live";
  if (text === "Preview") return "pill pill-preview";
  if (text === "Available") return "pill pill-available";
  if (text === "Public") return "pill pill-public";
  if (text === "Admin") return "pill pill-admin";
  if (text === "Not assigned") return "pill pill-warn";
  if (text === "Coming soon") return "pill pill-roadmap";
  return "pill pill-muted";
}

function resolveCardBadges(head: HeadCard, roadmapSection: boolean): string[] {
  const url = pickLaunchUrl(head);
  if (roadmapSection || !url) {
    return ["Coming soon"];
  }
  const badges: string[] = [];
  if (!head.enabled && head.slug !== "public_quote") badges.push("Not assigned");
  if (head.slug === "public_quote") badges.push("Public");
  if (head.slug === "system_admin" || head.slug === "pricing_admin") badges.push("Admin");

  if (isEliteosfabProductionUrl(url)) badges.push("Live");
  else if (url.includes("vercel.app")) badges.push("Preview");
  else badges.push("Available");

  return badges;
}

function shouldShowUrlOnCard(url: string | null): boolean {
  if (!url || sanitizeLauncherLaunchUrl(url) !== url) return false;
  if (import.meta.env.DEV) return true;
  return !isEliteosfabProductionUrl(url);
}

function sortAvailableHeads(a: HeadCard, b: HeadCard): number {
  const ua = Boolean(pickLaunchUrl(a) && a.enabled);
  const ub = Boolean(pickLaunchUrl(b) && b.enabled);
  if (ua !== ub) return ua ? -1 : 1;
  const ia = AVAILABLE_SORT_PRIORITY.indexOf(a.slug);
  const ib = AVAILABLE_SORT_PRIORITY.indexOf(b.slug);
  const pa = ia === -1 ? 999 : ia;
  const pb = ib === -1 ? 999 : ib;
  if (pa !== pb) return pa - pb;
  return launcherCardTitle(a).localeCompare(launcherCardTitle(b));
}

function sortRoadmapHeads(a: HeadCard, b: HeadCard): number {
  return launcherCardTitle(a).localeCompare(launcherCardTitle(b));
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [me, setMe] = useState<MeResp | null>(null);
  const [headsPayload, setHeadsPayload] = useState<HeadsResp | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadingData, setLoadingData] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);

  const bootUrlRef = useRef<{ path: string; hash: string; search: string } | null>(null);
  if (bootUrlRef.current === null && typeof window !== "undefined") {
    bootUrlRef.current = {
      path: window.location.pathname,
      hash: window.location.hash,
      search: window.location.search
    };
  }

  const [urlFlowError, setUrlFlowError] = useState("");
  const [invitePasswordGate, setInvitePasswordGate] = useState(false);
  const [invitePw, setInvitePw] = useState("");
  const [invitePw2, setInvitePw2] = useState("");
  const [invitePwBusy, setInvitePwBusy] = useState(false);
  const [invitePwErr, setInvitePwErr] = useState("");

  const hydrate = useCallback(async (token: string) => {
    const t = String(token ?? "").trim();
    if (!t) return;
    setLoadError("");
    setLoadingData(true);
    try {
      const [meJson, headsJson] = await Promise.all([
        apiFetch("/api/me", { token: t }) as Promise<MeResp>,
        apiFetch("/api/me/heads", { token: t }) as Promise<HeadsResp>
      ]);
      setMe(meJson);
      setHeadsPayload(headsJson);
    } catch (e: unknown) {
      if (e instanceof ApiError) setLoadError(e.message);
      else setLoadError(String((e as Error)?.message ?? e));
      setHeadsPayload(null);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useLayoutEffect(() => {
    const err = readOAuthErrorFromBrowser();
    if (!err) return;
    setUrlFlowError(err);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  useEffect(() => {
    const snap = bootUrlRef.current;
    if (!snap || urlFlowError) return;
    const expectsEmailLink =
      /^\/auth\/callback\/?$/i.test(snap.path) ||
      /access_token=/.test(snap.hash) ||
      /\bcode=/.test(snap.search);
    if (!expectsEmailLink) return;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setUrlFlowError(
          "This invite link is expired or invalid. Please ask your admin to send a new invite."
        );
        window.history.replaceState({}, document.title, "/");
      }
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [urlFlowError]);

  useEffect(() => {
    const token = String(session?.access_token ?? "").trim();
    if (!token || urlFlowError) return;
    const snap = bootUrlRef.current;
    if (!snap) return;
    const cameFromEmailLink =
      /^\/auth\/callback\/?$/i.test(snap.path) ||
      /access_token=/.test(snap.hash) ||
      /\bcode=/.test(snap.search);
    if (!cameFromEmailLink) return;
    setInvitePasswordGate(true);
    window.history.replaceState({}, document.title, "/");
    bootUrlRef.current = { path: "/", hash: "", search: "" };
  }, [session, urlFlowError]);

  const reloadAccess = useCallback(async () => {
    const t = String(accessToken ?? "").trim();
    if (!t) return;
    setRefreshBusy(true);
    try {
      await hydrate(t);
    } finally {
      setRefreshBusy(false);
    }
  }, [accessToken, hydrate]);

  useEffect(() => {
    let alive = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        const s = data.session ?? null;
        setSession(s);
        const t = s?.access_token ?? "";
        setAccessToken(t);
        if (t) void hydrate(t);
      })
      .catch(() => {});

    const { data: sub } = supabase.auth.onAuthStateChange((evt, sess) => {
      if (!alive) return;

      const t = sess?.access_token ?? "";
      setSession(sess);
      setAccessToken(t);

      if (evt === "SIGNED_OUT" || !t) {
        setMe(null);
        setHeadsPayload(null);
        setLoadError("");
        setInvitePasswordGate(false);
        setInvitePw("");
        setInvitePw2("");
        setInvitePwErr("");
        return;
      }

      if (evt === "TOKEN_REFRESHED") {
        return;
      }

      if (evt === "INITIAL_SESSION") {
        return;
      }

      if (evt === "SIGNED_IN" || evt === "USER_UPDATED") {
        void hydrate(t);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [hydrate]);

  async function submitLogin(ev: React.FormEvent) {
    ev.preventDefault();
    setAuthError("");
    setLoginBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e: unknown) {
      const err = e as Error;
      setAuthError(String(err?.message ?? e));
    } finally {
      setLoginBusy(false);
    }
  }

  async function signOutClick() {
    const token = session?.access_token ?? "";
    if (token) {
      try {
        await apiFetch("/api/auth/log-event", {
          token,
          method: "POST",
          body: { event_type: "sign_out", tool_slug: "home" }
        });
      } catch {
        /* best-effort audit only */
      }
    }
    setInvitePasswordGate(false);
    setInvitePw("");
    setInvitePw2("");
    setInvitePwErr("");
    setUrlFlowError("");
    await supabase.auth.signOut();
  }

  async function submitInvitePassword(ev: React.FormEvent) {
    ev.preventDefault();
    setInvitePwErr("");
    if (invitePw.length < 8) {
      setInvitePwErr("Use at least 8 characters.");
      return;
    }
    if (invitePw !== invitePw2) {
      setInvitePwErr("Passwords do not match.");
      return;
    }
    setInvitePwBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: invitePw });
      if (error) throw error;
      setInvitePasswordGate(false);
      setInvitePw("");
      setInvitePw2("");
    } catch (e: unknown) {
      setInvitePwErr(String((e as Error)?.message ?? e));
    } finally {
      setInvitePwBusy(false);
    }
  }

  function skipInvitePassword() {
    setInvitePasswordGate(false);
    setInvitePw("");
    setInvitePw2("");
    setInvitePwErr("");
  }

  const assignableHeads = useMemo(() => {
    const hs = headsPayload?.heads ?? [];
    return hs.filter((h) => h.slug !== "public_quote" && h.enabled);
  }, [headsPayload]);

  const grouped = useMemo(() => {
    const hs = headsPayload?.heads ?? [];
    const available: HeadCard[] = [];
    const roadmap: HeadCard[] = [];
    for (const h of hs) {
      (headLauncherBucket(h) === "available" ? available : roadmap).push(h);
    }
    available.sort(sortAvailableHeads);
    roadmap.sort(sortRoadmapHeads);
    return [
      { section: "Available Tools" as const, items: available },
      { section: "Coming Soon Tools" as const, items: roadmap }
    ] satisfies Array<{ section: LauncherSection; items: HeadCard[] }>;
  }, [headsPayload]);

  const showShell = Boolean(session?.access_token);
  const u = me?.user;
  const headsUser = headsPayload?.user;
  const roleLc = String(u?.role ?? "").trim().toLowerCase();
  const isAdminLike = roleLc === "admin" || roleLc === "super_admin";
  const showTechnicalDetails = isAdminLike || roleLc === "executive";
  const displayName =
    String(u?.full_name ?? u?.fullName ?? "").trim() ||
    String(u?.email ?? session?.user?.email ?? "").trim() ||
    "Signed in user";
  const displayEmail = String(u?.email ?? session?.user?.email ?? "").trim();
  const displayOrg = String(u?.organization_id ?? headsUser?.organization_id ?? "").trim();

  return (
    <div className="shell">
      {showShell ? (
        <header className="topbar">
          <div className="brand-row">
            <img src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
            <div className="brand-text">
              <h1>eliteOS Home</h1>
              <div className="tag">Elite Stone Fabrication — operating system launcher</div>
            </div>
          </div>
          <div className="topbar-actions">
            <button type="button" className="btn" onClick={() => void reloadAccess()} disabled={refreshBusy || loadingData}>
              {refreshBusy ? "Refreshing…" : "Refresh access"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void signOutClick()}>
              Sign out
            </button>
          </div>
        </header>
      ) : null}

      <main className="main launcher-main">
        {!showShell ? (
          <div className="login-panel">
            {urlFlowError ? (
              <div className="banner banner-error" style={{ marginBottom: 16 }}>
                {urlFlowError}
              </div>
            ) : null}
            <div className="brand-row" style={{ marginBottom: 16 }}>
              <img src={EOS_LOGO_URL} alt="" style={{ height: 48 }} />
              <div className="brand-text">
                <h1>eliteOS</h1>
                <div className="tag">Elite Stone · eliteOS</div>
              </div>
            </div>
            <p className="motto">Keep the Titans running well.</p>
            <p className="subtitle">
              Moraware records the work. eliteOS explains the work. Your tools move the work.
            </p>
            <form onSubmit={(e) => void submitLogin(e)}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {authError ? <div className="banner banner-error" style={{ marginBottom: 12 }}>{authError}</div> : null}
              <button type="submit" className="btn btn-primary" disabled={loginBusy}>
                {loginBusy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="muted-note">
              Authentication uses Supabase (anon key only). No Moraware credentials or service role keys are used in this
              app.
            </p>
          </div>
        ) : invitePasswordGate ? (
          <div className="login-panel" style={{ maxWidth: 440 }}>
            <h2 style={{ marginTop: 0 }}>Finish your eliteOS account</h2>
            <p className="subtitle" style={{ marginBottom: 16 }}>
              You signed in from an invite or reset link. Set a password you can use with email sign-in, or continue to the
              launcher and set it later in Supabase Account settings.
            </p>
            <form onSubmit={(e) => void submitInvitePassword(e)}>
              <div className="field">
                <label htmlFor="invite-pw">New password</label>
                <input
                  id="invite-pw"
                  type="password"
                  autoComplete="new-password"
                  value={invitePw}
                  onChange={(e) => setInvitePw(e.target.value)}
                  minLength={8}
                />
              </div>
              <div className="field">
                <label htmlFor="invite-pw2">Confirm password</label>
                <input
                  id="invite-pw2"
                  type="password"
                  autoComplete="new-password"
                  value={invitePw2}
                  onChange={(e) => setInvitePw2(e.target.value)}
                  minLength={8}
                />
              </div>
              {invitePwErr ? <div className="banner banner-error" style={{ marginBottom: 12 }}>{invitePwErr}</div> : null}
              <button type="submit" className="btn btn-primary" disabled={invitePwBusy}>
                {invitePwBusy ? "Saving…" : "Save password & continue"}
              </button>
            </form>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={skipInvitePassword}>
              Skip for now — open launcher
            </button>
          </div>
        ) : (
          <>
            <div className="launcher-intro">
              <div className="user-summary">
                <div className="user-summary-primary">
                  <span className="user-summary-name">{displayName}</span>
                  {displayEmail ? <span className="user-summary-email">{displayEmail}</span> : null}
                </div>
                {u?.role ? <span className="role-chip">{u.role}</span> : null}
              </div>

              <details className="access-details">
                <summary className="access-details-summary">Access details</summary>
                <div className="access-details-body">
                  <p className="muted-note access-note">{SECURITY_NOTE}</p>
                  {displayOrg ? (
                    <p className="access-meta">
                      <span className="access-meta-label">Organization</span>
                      <code className="access-meta-value">{displayOrg}</code>
                    </p>
                  ) : null}
                  {showTechnicalDetails && headsPayload?.heads?.length ? (
                    <div className="tech-details">
                      <div className="tech-details-caption">Technical reference (internal slug → launch URL)</div>
                      <ul className="tech-details-list">
                        {headsPayload.heads.map((h) => (
                          <li key={`tech-${h.slug}`}>
                            <div className="tech-tool-line">
                              <span className="tech-tool-label">{launcherCardTitle(h)}</span>
                              <code className="tech-slug">{h.slug}</code>
                              {h.slug === "quote" ?
                                <span className="tech-gloss"> Internal Estimate access key</span>
                              : null}
                            </div>
                            <span className="tech-url">{pickLaunchUrl(h) ?? "—"}</span>
                            {h.role_note ?
                              <span className="tech-role-note">{h.role_note}</span>
                            : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </details>
            </div>

            {loadError ? <div className="banner banner-error">{loadError}</div> : null}

            {headsPayload?.inactive ? (
              <div className="banner banner-warn">
                This account is inactive. You cannot open tools until an admin re-enables access.
              </div>
            ) : null}

            {loadingData && !headsPayload ? <p className="muted-note">Loading your tools…</p> : null}

            {assignableHeads.length === 0 && headsPayload && !loadingData ? (
              <div className="empty-box launcher-empty">
                {isAdminLike ? (
                  <>
                    <p className="empty-title">No tools are assigned yet.</p>
                    <p className="empty-sub">Use System Admin to assign tool access.</p>
                  </>
                ) : (
                  <>
                    <p className="empty-title">No tools assigned yet.</p>
                    <p className="empty-sub">Ask your eliteOS administrator for the tools you need.</p>
                  </>
                )}
              </div>
            ) : null}

            {grouped.map(({ section, items }) => {
              if (!items.length) return null;
              const roadmapSection = section === "Coming Soon Tools";
              return (
                <section
                  key={section}
                  className={`launcher-section${roadmapSection ? " launcher-section-roadmap" : " launcher-section-available"}`}
                >
                  <h2 className="section-kicker">{section}</h2>
                  {roadmapSection ?
                    <p className="section-lede muted-note">
                      Planned tools stay informational here until a production launch link is configured on the Brain.
                    </p>
                  :
                    <p className="section-lede muted-note">
                      Production tools you can open when assigned. Each destination still enforces Brain permissions.
                    </p>
                  }
                  <div className={roadmapSection ? "card-grid card-grid-roadmap" : "card-grid card-grid-available"}>
                    {items.map((h) => {
                      const url = pickLaunchUrl(h);
                      const canNavigate = Boolean(h.enabled && url && !roadmapSection);
                      const inactiveClass = !canNavigate ? " is-muted" : "";
                      const pills = resolveCardBadges(h, roadmapSection);
                      const cardTitle = launcherCardTitle(h);
                      const showUrl = shouldShowUrlOnCard(url);
                      const openLabel = h.slug === "public_quote" ? "Open public site" : "Open tool";

                      function openHead() {
                        if (!canNavigate || !url) return;
                        window.open(url, "_blank", "noopener,noreferrer");
                      }

                      return (
                        <article
                          key={h.slug}
                          className={`head-card${roadmapSection ? " head-card-roadmap" : " head-card-available"}${inactiveClass}`}
                        >
                          <h3 className="head-card-title">{cardTitle}</h3>
                          <p className={roadmapSection ? "desc desc-roadmap" : "desc"}>{h.description}</p>
                          {showUrl && url ?
                            <p className="url-subtle" title={url}>
                              {url}
                            </p>
                          : null}
                          <div className="pill-row">
                            {pills.map((t, pi) => (
                              <span key={`${h.slug}-${pi}-${t}`} className={pillClass(t)}>
                                {t}
                              </span>
                            ))}
                          </div>
                          {canNavigate ?
                            <button type="button" className="btn btn-open head-open-btn" onClick={openHead}>
                              {openLabel}
                            </button>
                          : null}
                          {!canNavigate && !roadmapSection ?
                            <p className="card-foot muted-note">
                              {url ? "Ask your admin for access to open this tool." : null}
                            </p>
                          : null}
                          {roadmapSection ?
                            <p className="card-foot muted-note">On the roadmap — not available to open yet.</p>
                          : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>

      <footer className="footer-bar">
        <div className="footer-line footer-brand">eliteOS · Elite Stone Fabrication</div>
        <div className="footer-line footer-tagline">Keep the Titans running well.</div>
      </footer>
    </div>
  );
}
