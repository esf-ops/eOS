import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, apiFetch } from "../lib/api";
import { EOS_LOGO_URL, resolveHeadLaunchUrl } from "../lib/config";
import { supabase } from "../lib/supabase";

type MeUser = {
  id: string;
  email: string;
  role: string;
  fullName?: string;
  department?: string;
  isActive?: boolean;
};

type MeResp = { ok: boolean; user: MeUser };

type HeadVisibilityReason = "assigned" | "role_default" | "admin_roadmap";

type HeadCard = {
  slug: string;
  label: string;
  description: string;
  href: string;
  category: string;
  enabled: boolean;
  visibilityReason?: HeadVisibilityReason;
};

type HeadsResp = {
  ok: boolean;
  inactive?: boolean;
  user?: { id: string; email: string; role: string; userKind?: string };
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
  "Access shown here reflects your assignments; each head’s APIs still enforce permissions on every request.";

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

function launcherSection(head: HeadCard): SectionTitle {
  const url = resolveHeadLaunchUrl(head.slug);
  if ((!head.enabled && head.visibilityReason === "admin_roadmap") || (head.enabled && !url)) return "Coming Soon";
  return mapBackendCategory(head.category);
}

function resolveStatusPills(head: HeadCard): string[] {
  const url = resolveHeadLaunchUrl(head.slug);
  const roadmap = head.visibilityReason === "admin_roadmap";
  if (!head.enabled) {
    if (roadmap) return ["Coming soon"];
    return ["Not assigned"];
  }
  /** Launch URL not wired in env defaults — surfaced as roadmap-style copy consistent with Exec/BH/System Admin rollout. */
  if (!url) return ["Coming soon"];
  return [];
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
        return;
      }

      /** Token rotation keeps `access_token` current for API calls — no launcher refetch. */
      if (evt === "TOKEN_REFRESHED") {
        return;
      }

      /** `getSession()` already hydrates — avoid duplicate fetches from this emission. */
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
    await supabase.auth.signOut();
  }

  const enabledCount = useMemo(() => {
    const hs = headsPayload?.heads ?? [];
    return hs.filter((h) => h.enabled).length;
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
  const isAdminUser = String(u?.role ?? "").trim().toLowerCase() === "admin";
  const displayName =
    String(u?.fullName ?? "").trim() || String(u?.email ?? session?.user?.email ?? "").trim() || "Signed in user";
  const displayEmail = String(u?.email ?? session?.user?.email ?? "").trim();

  return (
    <div className="shell">
      {showShell ? (
        <header className="topbar">
          <div className="brand-row">
            <img src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
            <div className="brand-text">
              <h1>eliteOS Home</h1>
              <div className="tag">Keep the Titans running well.</div>
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
            <div className="brand-row" style={{ marginBottom: 16 }}>
              <img src={EOS_LOGO_URL} alt="" style={{ height: 48 }} />
              <div className="brand-text">
                <h1>eliteOS</h1>
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
            </div>

            <p className="muted-note" style={{ marginTop: 0 }}>
              {SECURITY_NOTE}
            </p>

            {loadError ? <div className="banner banner-error">{loadError}</div> : null}

            {headsPayload?.inactive ? (
              <div className="banner banner-warn">This account is inactive. You cannot launch heads until an admin re-enables access.</div>
            ) : null}

            {loadingData && !headsPayload ? <p className="muted-note">Loading your access…</p> : null}

            {(headsPayload?.heads ?? []).length === 0 && headsPayload && !loadingData ? (
              <div className="empty-box" style={{ marginBottom: 24 }}>
                {isAdminUser ? (
                  <>
                    <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#0f172a" }}>No heads are assigned yet.</p>
                    <p style={{ margin: 0 }}>Open System Admin to assign access.</p>
                  </>
                ) : (
                  <>
                    <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#0f172a" }}>
                      No eliteOS heads are assigned to your account yet.
                    </p>
                    <p style={{ margin: 0 }}>Contact your eliteOS admin.</p>
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
                      const url = resolveHeadLaunchUrl(h.slug);
                      const canNavigate = Boolean(h.enabled && url);
                      const inactiveClass = !canNavigate ? " disabled" : "";
                      const pills = resolveStatusPills(h);

                      function openHead() {
                        if (!canNavigate || !url) return;
                        window.open(url, "_blank", "noopener,noreferrer");
                      }

                      return (
                        <article key={h.slug} className={`head-card${inactiveClass}`}>
                          <div className="cat">{h.category}</div>
                          <h3>{h.label}</h3>
                          <p className="desc">{h.description}</p>
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
                          : /** Avoid duplicate “Open head” noise in exports/prints when there is nothing to launch */ null}
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

      <footer className="footer-bar">Keep the Titans running well.</footer>
    </div>
  );
}
