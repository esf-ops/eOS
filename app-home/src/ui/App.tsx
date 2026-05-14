import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, apiFetch } from "../lib/api";
import { EOS_LOGO_URL, resolveHeadLaunchUrl } from "../lib/config";
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

type SectionTitle =
  | "Leadership"
  | "Operations"
  | "Admin"
  | "Sales / Quote"
  | "Field"
  | "People"
  | "Partner"
  | "Coming Soon";

const SECTION_ORDER: SectionTitle[] = [
  "Leadership",
  "Operations",
  "Admin",
  "Sales / Quote",
  "Field",
  "People",
  "Partner",
  "Coming Soon"
];

const SECURITY_NOTE =
  "This eliteOS Launcher reflects your assignments; each head’s eliteOS Brain APIs still enforce permissions on every request.";

function mapBackendCategory(category: string): Exclude<SectionTitle, "Coming Soon"> {
  const c = String(category ?? "").trim().toLowerCase();
  if (c.includes("leadership")) return "Leadership";
  if (c.includes("admin")) return "Admin";
  if (c.includes("revenue") || c.includes("commercial")) return "Sales / Quote";
  if (c.includes("field")) return "Field";
  if (c.includes("people")) return "People";
  if (c.includes("partner")) return "Partner";
  return "Operations";
}

function pickLaunchUrl(head: HeadCard): string | null {
  const fromApi = String(head.url ?? "").trim();
  if (fromApi) return fromApi.replace(/\/+$/, "");
  return resolveHeadLaunchUrl(head.slug);
}

function launcherSection(head: HeadCard): SectionTitle {
  const url = pickLaunchUrl(head);
  const roadmapish =
    head.visibilityReason === "admin_roadmap" || head.visibilityReason === "full_catalog";
  if ((!head.enabled && roadmapish) || (head.enabled && !url)) return "Coming Soon";
  return mapBackendCategory(head.category);
}

function titleCaseStatus(s: string): string {
  const t = String(s ?? "").trim().toLowerCase();
  if (!t) return "";
  return t.slice(0, 1).toUpperCase() + t.slice(1);
}

function resolveStatusBadges(head: HeadCard): string[] {
  const url = pickLaunchUrl(head);
  const badges: string[] = [];
  if (!head.enabled) badges.push("Not assigned");
  if (head.status) badges.push(titleCaseStatus(head.status));
  else if (head.enabled && !url) badges.push("No URL configured");
  return badges;
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
    const buckets: Record<string, HeadCard[]> = {};
    for (const k of SECTION_ORDER) buckets[k] = [];
    for (const h of hs) {
      const sec = launcherSection(h);
      if (!buckets[sec]) buckets[sec] = [];
      buckets[sec].push(h);
    }
    return SECTION_ORDER.map((section) => ({ section, items: buckets[section] ?? [] }));
  }, [headsPayload]);

  const showShell = Boolean(session?.access_token);
  const u = me?.user;
  const headsUser = headsPayload?.user;
  const roleLc = String(u?.role ?? "").trim().toLowerCase();
  const isAdminLike = roleLc === "admin" || roleLc === "super_admin";
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
              <div className="tag">Elite Stone Fabrication — eliteOS Launcher</div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="btn" onClick={() => void reloadAccess()} disabled={refreshBusy || loadingData}>
              {refreshBusy ? "Refreshing…" : "Refresh access"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void signOutClick()}>
              Sign out
            </button>
          </div>
        </header>
      ) : null}

      <main className="main">
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
              Moraware records the work. eliteOS explains the work. The heads move the work.
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
              Skip for now — go to launcher
            </button>
          </div>
        ) : (
          <>
            <div className="user-strip">
              <strong>{displayName}</strong>
              {displayEmail ? (
                <>
                  {" "}
                  · <span>{displayEmail}</span>
                </>
              ) : null}
              {u?.role ? (
                <>
                  {" "}
                  · role <strong>{u.role}</strong>
                </>
              ) : null}
              {displayOrg ? (
                <>
                  {" "}
                  · organization <span className="mono-inline">{displayOrg}</span>
                </>
              ) : null}
            </div>

            <p className="muted-note" style={{ marginTop: 0 }}>
              {SECURITY_NOTE}
            </p>

            {loadError ? <div className="banner banner-error">{loadError}</div> : null}

            {headsPayload?.inactive ? (
              <div className="banner banner-warn">This account is inactive. You cannot launch heads until an admin re-enables access.</div>
            ) : null}

            {loadingData && !headsPayload ? <p className="muted-note">Loading your access…</p> : null}

            {assignableHeads.length === 0 && headsPayload && !loadingData ? (
              <div className="empty-box" style={{ marginBottom: 24 }}>
                {isAdminLike ? (
                  <>
                    <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#0f172a" }}>No heads are assigned yet.</p>
                    <p style={{ margin: 0 }}>Open System Admin to assign access.</p>
                  </>
                ) : (
                  <>
                    <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#0f172a" }}>No heads assigned yet. Contact an admin.</p>
                    <p style={{ margin: 0 }}>If you expected access, ask your eliteOS administrator to grant the right heads.</p>
                  </>
                )}
              </div>
            ) : null}

            {grouped.map(({ section, items }) => {
              if (!items.length) return null;
              return (
                <section key={section}>
                  <h2 className="section-title">{section}</h2>
                  <div className="card-grid">
                    {items.map((h) => {
                      const url = pickLaunchUrl(h);
                      const canNavigate = Boolean(h.enabled && url);
                      const inactiveClass = !canNavigate ? " disabled" : "";
                      const pills = resolveStatusBadges(h);
                      const cardTitle = String(h.title ?? h.label ?? "").trim() || h.label;

                      function openHead() {
                        if (!canNavigate || !url) return;
                        window.open(url, "_blank", "noopener,noreferrer");
                      }

                      return (
                        <article key={h.slug} className={`head-card${inactiveClass}`}>
                          <div className="cat">{h.category}</div>
                          <h3>{cardTitle}</h3>
                          <p className="desc">{h.description}</p>
                          {h.role_note ? <p className="role-note">{h.role_note}</p> : null}
                          {url ? (
                            <p className="url-line" title={url}>
                              {url}
                            </p>
                          ) : null}
                          <div className="slug-line">
                            Head slug: <code>{h.slug}</code>
                          </div>
                          {pills.length ? (
                            <div className="pill-stack">
                              {pills.map((t, pi) => (
                                <span key={`${h.slug}-${pi}-${t}`} className="pill-soon">
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {canNavigate ?
                            <button type="button" className="btn btn-open action-row" onClick={openHead}>
                              Open head
                            </button>
                          : null}
                          {!canNavigate ?
                            <div className="action-placeholder muted-note" aria-hidden="true">
                              —
                            </div>
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

      <footer className="footer-bar">eliteOS Home · Elite Stone Fabrication · Keep the Titans running well.</footer>
    </div>
  );
}
