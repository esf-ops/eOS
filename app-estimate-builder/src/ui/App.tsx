import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import EliteosTopbar from "../../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../../shared/eliteos-ui/EliteosTopbar";
import { ApiError, apiGet } from "../lib/api";
import { config } from "../lib/config";
import { getSupabase } from "../lib/supabase";
import EstimateBuilder from "./EstimateBuilder";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

type MeUser = {
  email?: string;
  role?: string;
  fullName?: string;
  full_name?: string;
  organization_name?: string | null;
};

function initialsFor(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return email ? email.slice(0, 2).toUpperCase() : "EB";
}

export default function App() {
  const supabase = getSupabase();
  const [token, setToken] = useState("");
  const [me, setMe] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(!config.preview);
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const loadMe = useCallback(async (t: string) => {
    setLoading(true);
    setAuthError("");
    try {
      const resp = await apiGet<{ user?: MeUser }>("/api/me", t);
      setMe(resp.user ?? null);
    } catch (e) {
      setMe(null);
      setAuthError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (config.preview) return;
    if (!supabase) {
      setLoading(false);
      setAuthError("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const t = data.session?.access_token ?? "";
      setToken(t);
      if (t) void loadMe(t);
      else setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session: Session | null) => {
      const t = session?.access_token ?? "";
      setToken(t);
      if (event === "TOKEN_REFRESHED") return;
      if (event === "SIGNED_OUT" || !t) {
        setMe(null);
        setLoading(false);
        return;
      }
      void loadMe(t);
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
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setAuthError(error.message);
    setSigningIn(false);
  };

  const onSignOut = async () => {
    await supabase?.auth.signOut();
    setMe(null);
    setToken("");
  };

  const displayName = String(me?.fullName ?? me?.full_name ?? "").trim();
  const emailAddr = String(me?.email ?? "");
  const menuItems: EliteosTopbarMenuItem[] = useMemo(() => {
    const items: EliteosTopbarMenuItem[] = [{ label: "Home Launcher", href: config.homeUrl }];
    if (config.quoteLibraryUrl) items.push({ label: "Quote Library", href: config.quoteLibraryUrl });
    return items;
  }, []);
  const ready = config.preview || Boolean(token && me);

  return (
    <div className="eb-shell">
      <div className="eb-no-print">
        <EliteosTopbar
          appName="Estimate Builder"
          organizationName={String(me?.organization_name ?? "Elite Stone Fabrication")}
          logoSrc={EOS_LOGO_URL}
          homeHref={config.homeUrl}
          userName={displayName || emailAddr || (config.preview ? "Local preview" : "Guest")}
          userEmail={emailAddr}
          userSubtitle={me?.role || (config.preview ? "Dev harness · not signed in" : undefined)}
          initials={initialsFor(displayName, emailAddr)}
          menuItems={menuItems}
          onSignOut={token ? () => void onSignOut() : undefined}
        />
      </div>
      {ready ? (
        <EstimateBuilder token={token} preparedByDefault={displayName || emailAddr} />
      ) : loading ? (
        <main className="eb-page">
          <p className="eb-muted">Checking session…</p>
        </main>
      ) : (
        <main className="eb-auth">
          <p className="eb-kicker">eliteOS</p>
          <h1>Sign in to Estimate Builder</h1>
          <form className="eb-auth-form" onSubmit={(e) => void onSignIn(e)}>
            <label>
              Email
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {authError ? <div className="eb-banner eb-banner-danger">{authError}</div> : null}
            <button type="submit" className="eb-btn eb-btn-primary" disabled={signingIn}>
              {signingIn ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </main>
      )}
    </div>
  );
}
