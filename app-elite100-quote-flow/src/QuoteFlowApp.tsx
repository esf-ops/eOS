import React, { useEffect, useMemo, useRef, useState } from "react";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import { apiGet, ApiError } from "./lib/api";
import { homeLauncherUrl } from "./lib/config";
import { getSupabase } from "./lib/supabase";
import InboxPage from "./inbox/InboxPage";
import EstimateQueuePage from "./queue/EstimateQueuePage";
import EstimatesListPage from "./estimates/EstimatesListPage";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";
const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

type MainNav = "inbox" | "queue" | "estimates";

function userInitialsFor(name: string, email: string): string {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const e = String(email || "").trim();
  if (e) return e.includes("@") ? e.split("@")[0].slice(0, 2).toUpperCase() : e.slice(0, 2);
  return "QF";
}

function parseNavFromSearch(): MainNav {
  try {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "queue" || tab === "estimates" || tab === "inbox") return tab;
  } catch {
    /* ignore */
  }
  return "inbox";
}

function TabPanel({ active, testId, children }: { active: boolean; testId: string; children: React.ReactNode }) {
  return (
    <div data-testid={testId} hidden={!active} style={active ? { display: "contents" } : undefined}>
      {children}
    </div>
  );
}

export default function QuoteFlowApp() {
  const supabase = useMemo(() => getSupabase(), []);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [mainNav, setMainNav] = useState<MainNav>(() => parseNavFromSearch());
  const [shellStatus, setShellStatus] = useState<string | null>(null);
  const [openEstimateId, setOpenEstimateId] = useState<string | null>(null);
  const [openEstimateSeq, setOpenEstimateSeq] = useState(0);
  const [openInboxMessageKey, setOpenInboxMessageKey] = useState<string | null>(null);
  const [openInboxSeq, setOpenInboxSeq] = useState(0);
  /** Pages stay mounted after first visit so switching tabs never discards in-progress work. */
  const [visitedNav, setVisitedNav] = useState<ReadonlySet<MainNav>>(() => new Set([mainNav]));

  useEffect(() => {
    if (!supabase) {
      setBootError("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const session = data.session;
      setSessionToken(session?.access_token ?? null);
      setUserEmail(session?.user?.email ?? "");
      setUserMetaName(
        String(
          (session?.user?.user_metadata as { full_name?: string } | undefined)?.full_name || ""
        )
      );
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token ?? null);
      setUserEmail(session?.user?.email ?? "");
      setUserMetaName(
        String(
          (session?.user?.user_metadata as { full_name?: string } | undefined)?.full_name || ""
        )
      );
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const sessionTokenRef = useRef(sessionToken);
  sessionTokenRef.current = sessionToken;
  const hasSession = Boolean(sessionToken);

  // Once per sign-in; a token refresh is not a reconnect.
  useEffect(() => {
    const token = sessionTokenRef.current;
    if (!token) {
      setShellStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const body = (await apiGet("/api/elite100-quote-flow/health", token)) as {
          ok?: boolean;
          shell?: string;
        };
        if (!cancelled) {
          setShellStatus(
            body?.shell === "slice-1a" ||
              body?.shell === "slice-1b" ||
              body?.shell === "slice-1c" ||
              body?.shell === "slice-1d"
              ? "Quote Flow connected"
              : "Connected"
          );
        }
      } catch (e) {
        if (!cancelled) {
          const msg =
            e instanceof ApiError
              ? e.status === 404
                ? "Quote Flow API is not enabled on Brain (feature flag)."
                : e.status === 403
                  ? "You do not have access to Elite 100 Quote Flow."
                  : e.message
              : "Could not reach Quote Flow API.";
          setShellStatus(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  function setNav(next: MainNav) {
    setMainNav(next);
    setVisitedNav((prev) => (prev.has(next) ? prev : new Set([...prev, next])));
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    if (!supabase) {
      setAuthError("Supabase is not configured.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
  }

  const menuItems: EliteosTopbarMenuItem[] = [
    {
      id: "home",
      label: "Open Home",
      onSelect: () => {
        window.location.href = homeLauncherUrl();
      }
    },
    {
      id: "sign-out",
      label: "Sign out",
      onSelect: () => {
        void signOut();
      }
    }
  ];

  if (bootError) {
    return (
      <div className="qf-boot-error" data-testid="qf-boot-error">
        <h1>Elite 100 Quote Flow</h1>
        <p>{bootError}</p>
      </div>
    );
  }

  if (!sessionToken) {
    return (
      <div className="qf-auth" data-testid="qf-auth">
        <div className="qf-auth__card">
          <h1>Elite 100 Quote Flow</h1>
          <p className="qf-muted">Sign in to open Inbox, Estimate Queue, and Estimates.</p>
          <form onSubmit={(ev) => void signIn(ev)}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {authError ? <p className="qf-error">{authError}</p> : null}
            <button type="submit" className="qf-btn-primary">
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="qf-app" data-testid="qf-app">
      <EliteosTopbar
        appName="Elite 100 Quote Flow"
        organizationName={DEFAULT_WORKSPACE_NAME}
        logoSrc={EOS_LOGO_URL}
        homeHref={homeLauncherUrl()}
        userDisplayName={userMetaName || userEmail || "Estimator"}
        userEmail={userEmail}
        userInitials={userInitialsFor(userMetaName, userEmail)}
        menuItems={menuItems}
        onSignOut={() => void signOut()}
      />

      <div
        className={
          mainNav === "inbox" || mainNav === "queue" || mainNav === "estimates"
            ? "qf-shell qf-shell--command"
            : "qf-shell"
        }
      >
        <nav className="qf-nav" aria-label="Quote Flow" data-testid="qf-nav">
          <button
            type="button"
            className={mainNav === "inbox" ? "qf-nav__btn is-active" : "qf-nav__btn"}
            data-testid="qf-nav-inbox"
            onClick={() => setNav("inbox")}
          >
            Inbox
          </button>
          <button
            type="button"
            className={mainNav === "queue" ? "qf-nav__btn is-active" : "qf-nav__btn"}
            data-testid="qf-nav-queue"
            onClick={() => setNav("queue")}
          >
            Estimate Queue
          </button>
          <button
            type="button"
            className={mainNav === "estimates" ? "qf-nav__btn is-active" : "qf-nav__btn"}
            data-testid="qf-nav-estimates"
            onClick={() => setNav("estimates")}
          >
            Estimates
          </button>
        </nav>

        {shellStatus ? (
          <p className="qf-shell-status" data-testid="qf-shell-status">
            {shellStatus}
          </p>
        ) : null}

        <main className="qf-main">
          {visitedNav.has("inbox") ? (
            <TabPanel active={mainNav === "inbox"} testId="qf-tab-inbox">
              <InboxPage
                authToken={sessionToken}
                isActive={mainNav === "inbox"}
                initialMessageKey={openInboxMessageKey}
                openRequestSeq={openInboxSeq}
                onOpenQueue={() => setNav("queue")}
                onOpenEstimates={(estimateId) => {
                  setOpenEstimateId(estimateId || null);
                  setOpenEstimateSeq((n) => n + 1);
                  setNav("estimates");
                }}
              />
            </TabPanel>
          ) : null}
          {visitedNav.has("queue") ? (
            <TabPanel active={mainNav === "queue"} testId="qf-tab-queue">
              <EstimateQueuePage
                authToken={sessionToken}
                isActive={mainNav === "queue"}
                onOpenEstimates={(estimateId) => {
                  setOpenEstimateId(estimateId || null);
                  setOpenEstimateSeq((n) => n + 1);
                  setNav("estimates");
                }}
                onOpenInbox={(messageKey) => {
                  setOpenInboxMessageKey(messageKey || null);
                  setOpenInboxSeq((n) => n + 1);
                  setNav("inbox");
                }}
              />
            </TabPanel>
          ) : null}
          {visitedNav.has("estimates") ? (
            <TabPanel active={mainNav === "estimates"} testId="qf-tab-estimates">
              <EstimatesListPage
                authToken={sessionToken}
                isActive={mainNav === "estimates"}
                initialEstimateId={openEstimateId}
                openRequestSeq={openEstimateSeq}
              />
            </TabPanel>
          ) : null}
        </main>
      </div>
    </div>
  );
}
