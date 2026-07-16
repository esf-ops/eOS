import React, { useEffect, useMemo, useState } from "react";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import ConfigurationWorkspace from "./ConfigurationWorkspace";
import ReviewWorkspace from "./ReviewWorkspace";
import { apiGet, apiPost, ApiError } from "./lib/api";
import { getSupabase } from "./lib/supabase";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";
const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

type QuoteListItem = {
  id: string;
  quoteNumber: string;
  revisionLabel?: string;
  customerName?: string;
  projectName?: string;
  customerDisplayTotal?: number | null;
};

type QuoteDetail = {
  quote: {
    id: string;
    quoteNumber: string;
    revisionNumber?: number;
    revisionLabel?: string;
    customerName?: string;
    projectName?: string;
    projectAddress?: string;
  };
  eligibility: { eligible: boolean; code: string; message: string };
  preview: { ok?: boolean; estimate?: { totals?: { estimatedProjectTotal?: number }; pricingValidThrough?: string } } | null;
  publications: Array<{
    id: string;
    status: string;
    publishedAt?: string;
    pricingValidThrough?: string | null;
    accessExpiresAt?: string;
  }>;
};

function uiEnabled(): boolean {
  return String(import.meta.env.VITE_ELITE100_ESTIMATE_STUDIO_UI_ENABLED ?? "").trim() === "true";
}

function homeLauncherUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_HOME ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}

function userInitialsFor(name: string, email: string): string {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const e = String(email || "").trim();
  if (e) return e.includes("@") ? e.split("@")[0].slice(0, 2).toUpperCase() : e.slice(0, 2);
  return "E1";
}

export default function StudioApp() {
  const supabase = useMemo(() => getSupabase(), []);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [pubDetail, setPubDetail] = useState<{
    publication: Record<string, unknown>;
    events: Array<{ eventType: string; createdAt: string; actorType?: string }>;
    preview?: unknown;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null);
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [publishStaffNotice, setPublishStaffNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [studioConfigOk, setStudioConfigOk] = useState<boolean | null>(null);
  const [mainNav, setMainNav] = useState<"publications" | "reviews">("publications");

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSessionToken(data.session?.access_token ?? null);
      const u = data.session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token ?? null);
      setUserEmail(session?.user?.email ?? "");
      setUserMetaName(
        String(session?.user?.user_metadata?.full_name ?? session?.user?.user_metadata?.name ?? "").trim()
      );
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!sessionToken || !uiEnabled()) return;
    let alive = true;
    (async () => {
      try {
        await apiGet("/api/elite100-estimate-studio/config", sessionToken);
        if (alive) setStudioConfigOk(true);
      } catch (e) {
        if (!alive) return;
        setStudioConfigOk(false);
        setBootError(e instanceof ApiError ? e.message : "Studio unavailable");
      }
    })();
    return () => {
      alive = false;
    };
  }, [sessionToken]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    if (!supabase) {
      setAuthError("Supabase is not configured");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setSessionToken(null);
    setDetail(null);
    setPubDetail(null);
    setOneTimeLink(null);
    setOneTimeToken(null);
    setActionError(null);
  }

  async function runSearch() {
    if (!sessionToken) return;
    setActionError(null);
    setBusy(true);
    try {
      const q = encodeURIComponent(search.trim());
      const body = (await apiGet(
        `/api/elite100-estimate-studio/quotes?q=${q}&limit=40`,
        sessionToken
      )) as { quotes?: QuoteListItem[] };
      setQuotes(body.quotes || []);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadQuote(id: string) {
    if (!sessionToken) return;
    setSelectedId(id);
    setActionError(null);
    setOneTimeLink(null);
    setOneTimeToken(null);
    setPubDetail(null);
    setBusy(true);
    try {
      const body = (await apiGet(`/api/elite100-estimate-studio/quotes/${id}`, sessionToken)) as QuoteDetail;
      setDetail(body);
      const active = (body.publications || []).find((p) => p.status === "active");
      if (active?.id) {
        const pd = (await apiGet(
          `/api/elite100-estimate-studio/publications/${active.id}`,
          sessionToken
        )) as typeof pubDetail;
        setPubDetail(pd);
      }
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Unable to load quote");
      setDetail(null);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!sessionToken || !selectedId) return;
    if (!window.confirm("Publish Digital Estimate? This freezes a customer-safe snapshot.")) return;
    setBusy(true);
    setActionError(null);
    try {
      const body = (await apiPost("/api/elite100-estimate-studio/publications", sessionToken, {
        quoteId: selectedId,
        confirm: true
      })) as {
        accessToken?: string;
        customerUrl?: string;
        staffNotice?: string | null;
        syntheticPilot?: { awaitingSyntheticAllowlist?: boolean };
      };
      setOneTimeToken(body.accessToken || null);
      setOneTimeLink(body.customerUrl || null);
      setPublishStaffNotice(
        body.staffNotice ||
          (body.syntheticPilot?.awaitingSyntheticAllowlist
            ? "Replacement publication awaiting synthetic allowlist"
            : null)
      );
      await loadQuote(selectedId);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!oneTimeLink || !sessionToken || !pubDetail?.publication?.id) return;
    try {
      await navigator.clipboard.writeText(oneTimeLink);
      await apiPost(
        `/api/elite100-estimate-studio/publications/${String(pubDetail.publication.id)}/events/link-copied`,
        sessionToken,
        {}
      );
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Copy failed");
    }
  }

  async function replaceToken() {
    if (!sessionToken || !pubDetail?.publication?.id) return;
    if (!window.confirm("Replace access token? The previous link will stop working.")) return;
    setBusy(true);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/publications/${String(pubDetail.publication.id)}/replace-token`,
        sessionToken,
        { confirm: true }
      )) as { accessToken?: string; customerUrl?: string };
      setOneTimeToken(body.accessToken || null);
      setOneTimeLink(body.customerUrl || null);
      await loadQuote(selectedId!);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Replace failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!sessionToken || !pubDetail?.publication?.id) return;
    if (!window.confirm("Revoke this publication? Customers will no longer see it.")) return;
    setBusy(true);
    try {
      await apiPost(
        `/api/elite100-estimate-studio/publications/${String(pubDetail.publication.id)}/revoke`,
        sessionToken,
        { confirm: true }
      );
      setOneTimeLink(null);
      setOneTimeToken(null);
      await loadQuote(selectedId!);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  const menuItems: EliteosTopbarMenuItem[] = [
    { id: "home", label: "Home Launcher", href: homeLauncherUrl() }
  ];

  if (!uiEnabled()) {
    return (
      <div className="disabled-shell">
        <h1>Elite 100 Estimate Studio</h1>
        <p className="muted">
          UI flag is off (<code>VITE_ELITE100_ESTIMATE_STUDIO_UI_ENABLED</code>). Backend authorization remains
          authoritative regardless of this flag.
        </p>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className="disabled-shell">
        <h1>Elite 100 Estimate Studio</h1>
        <p className="muted">Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</p>
      </div>
    );
  }

  if (!sessionToken) {
    return (
      <form className="sign-in" onSubmit={signIn}>
        <h1>Elite 100 Estimate Studio</h1>
        <p className="muted">Sign in with your eliteOS account (private pilot).</p>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {authError ? <div className="error-box">{authError}</div> : null}
        <div className="actions">
          <button type="submit">Sign in</button>
        </div>
      </form>
    );
  }

  const displayName = userMetaName || userEmail;

  return (
    <>
      <EliteosTopbar
        appName="Elite 100 Estimate Studio"
        organizationName={DEFAULT_WORKSPACE_NAME}
        logoSrc={EOS_LOGO_URL}
        homeHref={homeLauncherUrl()}
        userName={displayName}
        userEmail={userEmail}
        initials={userInitialsFor(userMetaName, userEmail)}
        menuItems={menuItems}
        onSignOut={() => void signOut()}
        statusSlot={<span>Private pilot</span>}
      />
      <main className="studio-shell">
        <div className="pilot-banner">
          Private Elite 100 Estimate Studio — publishes frozen Digital Estimates only. Does not recalculate or
          modify the source Internal Estimate.
        </div>
        {bootError || studioConfigOk === false ? (
          <div className="error-box">{bootError || "Studio API unavailable for this account."}</div>
        ) : null}
        {actionError ? <div className="error-box">{actionError}</div> : null}

        <nav className="studio-nav" aria-label="Studio sections">
          <button
            type="button"
            className={mainNav === "publications" ? "active" : ""}
            onClick={() => setMainNav("publications")}
          >
            Publications
          </button>
          <button
            type="button"
            className={mainNav === "reviews" ? "active" : ""}
            onClick={() => setMainNav("reviews")}
          >
            Customer review requests
          </button>
        </nav>

        {mainNav === "reviews" ? (
          <ReviewWorkspace
            token={sessionToken}
            onAuthFailure={() => {
              setSessionToken(null);
              setActionError("Session ended or access denied");
            }}
          />
        ) : null}

        {mainNav === "publications" ? (
        <div className="studio-grid">
          <section className="panel">
            <h2>Find Elite 100 estimate</h2>
            <div className="search-row">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Quote #, customer, project"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch();
                }}
              />
              <button type="button" disabled={busy} onClick={() => void runSearch()}>
                Search
              </button>
            </div>
            <ul className="quote-list">
              {quotes.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    className={selectedId === q.id ? "active" : ""}
                    onClick={() => void loadQuote(q.id)}
                  >
                    <strong>{q.quoteNumber}</strong> {q.revisionLabel || ""}
                    <span className="meta">
                      {q.customerName || "—"} · {q.projectName || "—"}
                      {q.customerDisplayTotal != null ? ` · $${q.customerDisplayTotal}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!quotes.length ? <p className="muted">Search saved Elite 100 Internal Estimates.</p> : null}
          </section>

          <section className="panel">
            <h2>Publication workspace</h2>
            {!detail ? (
              <p className="muted">Select a quote to preview and publish.</p>
            ) : (
              <>
                <p>
                  <strong>{detail.quote.quoteNumber}</strong> {detail.quote.revisionLabel || ""}
                </p>
                <p className="muted">
                  {detail.quote.customerName} · {detail.quote.projectName}
                  {detail.quote.projectAddress ? ` · ${detail.quote.projectAddress}` : ""}
                </p>
                <p>
                  Eligibility:{" "}
                  {detail.eligibility.eligible ? (
                    <strong>Eligible Elite 100</strong>
                  ) : (
                    <span className="muted">{detail.eligibility.message}</span>
                  )}
                </p>
                {detail.preview?.estimate?.totals?.estimatedProjectTotal != null ? (
                  <div className="preview-block">
                    <h3>Customer-safe preview</h3>
                    <p>
                      Estimated project total:{" "}
                      <strong>${detail.preview.estimate.totals.estimatedProjectTotal}</strong>
                    </p>
                    <p className="muted">Frozen at publish — this preview is built from the saved snapshot only.</p>
                  </div>
                ) : null}

                <div className="actions">
                  <button type="button" disabled={busy || !detail.eligibility.eligible} onClick={() => void publish()}>
                    Publish Digital Estimate
                  </button>
                  {pubDetail?.publication?.status === "active" ? (
                    <>
                      <button type="button" className="secondary" disabled={busy} onClick={() => void replaceToken()}>
                        Replace token
                      </button>
                      <button type="button" className="secondary" disabled={busy} onClick={() => void revoke()}>
                        Revoke
                      </button>
                      {oneTimeLink ? (
                        <a className="btn secondary" href={oneTimeLink} target="_blank" rel="noreferrer">
                          Open customer portal
                        </a>
                      ) : null}
                    </>
                  ) : null}
                </div>

                {oneTimeLink ? (
                  <div className="token-once">
                    <strong>One-time link</strong> — copy now; raw token is not stored for later retrieval.
                    {publishStaffNotice ? (
                      <p className="muted" role="status">
                        {publishStaffNotice}
                      </p>
                    ) : null}
                    <code>{oneTimeLink}</code>
                    {oneTimeToken ? <span className="muted">Token length: {oneTimeToken.length}</span> : null}
                    <div className="actions">
                      <button type="button" onClick={() => void copyLink()}>
                        Copy link
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="preview-block">
                  <h3>Publication history</h3>
                  {!detail.publications?.length ? (
                    <p className="muted">No publications yet.</p>
                  ) : (
                    <ul className="event-list">
                      {detail.publications.map((p) => (
                        <li key={p.id}>
                          <strong>{p.status}</strong> · {p.publishedAt || "—"}
                          {p.pricingValidThrough ? ` · valid through ${p.pricingValidThrough}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {pubDetail?.events?.length ? (
                  <div className="preview-block">
                    <h3>Events</h3>
                    <ul className="event-list">
                      {pubDetail.events.map((ev, i) => (
                        <li key={`${ev.eventType}-${ev.createdAt}-${i}`}>
                          {ev.eventType} · {ev.actorType || "—"} · {ev.createdAt}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <ConfigurationWorkspace
                  token={sessionToken}
                  publicationId={
                    pubDetail?.publication?.status === "active"
                      ? String(pubDetail.publication.id)
                      : (detail.publications || []).find((p) => p.status === "active")?.id || null
                  }
                  onAuthFailure={() => {
                    setSessionToken(null);
                    setDetail(null);
                    setPubDetail(null);
                    setActionError("Session ended or access denied");
                  }}
                />
              </>
            )}
          </section>
        </div>
        ) : null}
      </main>
    </>
  );
}
