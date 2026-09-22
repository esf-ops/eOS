"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, context, error, signIn, userEmail, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--fg-secondary)]">
        Checking access…
      </div>
    );
  }

  if (!context) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
        <h1 className="text-xl font-semibold text-[var(--fg)]">Sign in to slabOS AI Studio</h1>
        <p className="mt-2 text-sm text-[var(--fg-secondary)]">
          Access requires an eliteOS account with the <code className="text-xs">slab_ai</code> head.
          Permissions are enforced by Brain — not by this UI alone.
        </p>
        {error ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {error}
          </p>
        ) : null}
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setFormError(null);
            void signIn(email, password)
              .catch((err) => setFormError((err as Error).message))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input
              type="email"
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <input
              type="password"
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {formError ? <p className="text-xs text-[var(--danger)]">{formError}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-[11px] text-[var(--muted-fg)]">
          Local tip: set <code>SLAB_AI_DEV_AUTH_BYPASS=1</code> in development only for a labeled sentinel session.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--fg-secondary)]">
        <span>
          {context.devBypass ? (
            <strong className="text-amber-700 dark:text-amber-300">DEV AUTH BYPASS · sentinel user/org</strong>
          ) : (
            <>
              Signed in as <strong>{context.displayName || userEmail || context.userId}</strong>
              {context.organizationId ? ` · org ${context.organizationId.slice(0, 8)}…` : " · no org"}
            </>
          )}
        </span>
        {!context.devBypass ? (
          <button type="button" className="underline" onClick={() => void signOut()}>
            Sign out
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
