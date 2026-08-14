import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import EliteosTopbar from "../../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../../shared/eliteos-ui/EliteosTopbar";
import { ApiError, apiFetch } from "../lib/api";
import { config } from "../lib/config";
import { getSupabase } from "../lib/supabase";
import FinanceWorkspace from "./FinanceWorkspace";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const ALLOWED_ROLES = new Set(["admin", "super_admin", "executive", "finance", "accounting"]);

type MeResp = {
  ok?: boolean;
  user?: {
    id?: string;
    email?: string;
    role?: string;
    fullName?: string;
    full_name?: string;
    job_title?: string | null;
    department?: string | null;
    organization_id?: string | null;
    organization_name?: string | null;
  };
};

function homeLauncherUrl(): string {
  const fromConfig = String(config.homeUrl ?? "").trim().replace(/\/+$/, "");
  if (fromConfig) return fromConfig;
  const raw = String(import.meta.env.VITE_HEAD_URL_HOME ?? "").trim().replace(/\/+$/, "");
  return raw || "https://www.eliteosfab.com";
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
  if (e) return e.includes("@") ? e.split("@")[0].slice(0, 2).toUpperCase() : e.slice(0, 2).toUpperCase();
  return "FN";
}

function roleAllowed(role: unknown): boolean {
  return ALLOWED_ROLES.has(String(role ?? "").trim().toLowerCase());
}

export default function App() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState("");
  const [me, setMe] = useState<MeResp["user"] | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const loadMe = useCallback(async (token: string) => {
    setLoadingUser(true);
    setAuthError("");
    try {
      const resp = (await apiFetch("/api/me", { token })) as MeResp;
      setMe(resp.user ?? null);
    } catch (e: unknown) {
      setMe(null);
      setAuthError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoadingUser(false);
      setAuthError("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
      return;
    }

    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const token = data.session?.access_token ?? "";
      setSessionToken(token);
      if (token) void loadMe(token);
      else setLoadingUser(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      const token = session?.access_token ?? "";
      setSessionToken(token);
      if (_event === "SIGNED_OUT") {
        setMe(null);
        setLoadingUser(false);
        return;
      }
      if (_event === "TOKEN_REFRESHED") return;
      if (token) void loadMe(token);
      else {
        setMe(null);
        setLoadingUser(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase, loadMe]);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSigningIn(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (err: unknown) {
      setAuthError(String((err as Error)?.message ?? err));
    } finally {
      setSigningIn(false);
    }
  };

  const onSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMe(null);
    setSessionToken("");
  };

  const displayName =
    String(me?.fullName ?? me?.full_name ?? "").trim() ||
    deriveDisplayNameFromEmail(String(me?.email ?? ""));
  const emailAddr = String(me?.email ?? "");
  const role = String(me?.role ?? "");
  const orgName = String(me?.organization_name ?? "Elite Stone Fabrication");
  const allowed = roleAllowed(role);

  const menuItems: EliteosTopbarMenuItem[] = useMemo(
    () => [
      {
        label: "Home Launcher",
        href: homeLauncherUrl(),
      },
    ],
    [],
  );

  return (
    <div className="fin-shell">
      <EliteosTopbar
        appName="Finance"
        organizationName={orgName}
        logoSrc={EOS_LOGO_URL}
        homeHref={homeLauncherUrl()}
        userName={displayName || (sessionToken ? "Signed in" : "Guest")}
        userEmail={emailAddr}
        userSubtitle={role || undefined}
        initials={userInitialsFor(displayName, emailAddr)}
        menuItems={menuItems}
        onSignOut={sessionToken ? () => void onSignOut() : undefined}
      />

      <main>
        {!sessionToken && !loadingUser ? (
          <div className="fin-auth">
            <p className="fin-kicker">eliteOS Finance</p>
            <h1>Sign in to Finance</h1>
            <p className="fin-lead">
              Governed Accrual statements and working-capital facts from QuickBooks. Admin, executive,
              finance, and accounting roles with <code>finance</code> head access.
            </p>
            <form className="fin-auth-form" onSubmit={(e) => void onSignIn(e)}>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  required
                />
              </label>
              {authError ? <div className="fin-banner fail">{authError}</div> : null}
              <button type="submit" className="fin-btn" disabled={signingIn}>
                {signingIn ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        ) : loadingUser ? (
          <div className="fin-page">
            <p className="fin-muted">Checking session…</p>
          </div>
        ) : !allowed ? (
          <div className="fin-page">
            <div className="fin-banner fail">
              This head requires an admin, executive, finance, or accounting role with finance head
              access. Navigation hiding is not security — Brain routes enforce access.
            </div>
          </div>
        ) : (
          <FinanceWorkspace token={sessionToken} />
        )}
      </main>
    </div>
  );
}
