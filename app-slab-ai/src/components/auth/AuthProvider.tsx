"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase";

type SessionState = {
  loading: boolean;
  accessToken: string | null;
  userEmail: string | null;
  context: {
    userId: string;
    organizationId: string | null;
    role: string;
    displayName?: string | null;
    authMode: "brain" | "dev_bypass";
    devBypass?: boolean;
    canAdministerKnowledge?: boolean;
  } | null;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<SessionState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [context, setContext] = useState<SessionState["context"]>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    let token: string | null = null;
    let email: string | null = null;

    if (supabase) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
      email = data.session?.user?.email ?? null;
    }

    const headers: HeadersInit = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch("/api/ai/session", { headers, cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setAccessToken(token);
      setUserEmail(email);
      setContext(null);
      setError(body.error || "Sign in required");
      setLoading(false);
      return;
    }
    const body = (await res.json()) as SessionState["context"] & { ok: boolean };
    setAccessToken(token);
    setUserEmail(email);
    setContext({
      userId: body!.userId,
      organizationId: body!.organizationId,
      role: body!.role,
      displayName: body!.displayName,
      authMode: body!.authMode,
      devBypass: body!.devBypass,
      canAdministerKnowledge: Boolean((body as { canAdministerKnowledge?: boolean }).canAdministerKnowledge),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) throw err;
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setAccessToken(null);
    setUserEmail(null);
    setContext(null);
  }, []);

  const value = useMemo(
    () => ({ loading, accessToken, userEmail, context, error, refresh, signIn, signOut }),
    [loading, accessToken, userEmail, context, error, refresh, signIn, signOut]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth requires AuthProvider");
  return ctx;
}
