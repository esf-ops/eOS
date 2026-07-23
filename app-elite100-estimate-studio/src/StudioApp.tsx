import React, { useEffect, useMemo, useState } from "react";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import ConfigurationWorkspace from "./ConfigurationWorkspace";
import ReviewWorkspace from "./ReviewWorkspace";
import EstimateQueuePage from "./estimateQueue/EstimateQueuePage";
import EstimateCommandCenterPage from "./estimateQueue/EstimateCommandCenterPage";
import EstimateTakeoffWorkspace from "./estimateQueue/EstimateTakeoffWorkspace";
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
    revisionNumber?: number;
    revisionLabel?: string;
    customerUrl?: string | null;
    linkStatus?: string | null;
  }>;
};

type LoadQuoteOptions = {
  preserveCustomerLink?: boolean;
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
  const [publishInFlight, setPublishInFlight] = useState(false);
  const [replaceInFlight, setReplaceInFlight] = useState(false);
  const [customerLink, setCustomerLink] = useState<string | null>(null);
  const [publishStaffNotice, setPublishStaffNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [studioConfigOk, setStudioConfigOk] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mainNav, setMainNav] = useState<
    | "command-center"
    | "estimate-queue"
    | "publications"
    | "reviews"
    | "estimate-workspace"
  >("command-center");
  const [queueReturnNav, setQueueReturnNav] = useState<"command-center" | "estimate-queue">(
    "command-center"
  );
  const [moreNavOpen, setMoreNavOpen] = useState(false);
  const [intakeCaseId, setIntakeCaseId] = useState<string | null>(null);
  const [estimateWorkspaceCaseId, setEstimateWorkspaceCaseId] = useState<string | null>(null);
  const [workspaceFocus, setWorkspaceFocus] = useState<
    "takeoff" | "scope" | "digital" | "review" | null
  >(null);
  const [organizationName, setOrganizationName] = useState(DEFAULT_WORKSPACE_NAME);
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState(EOS_LOGO_URL);
  const [userSubtitle, setUserSubtitle] = useState("");
  const [profileFullName, setProfileFullName] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSessionToken(data.session?.access_token ?? null);
      const u = data.session?.user;
      setUserEmail(u?.email ?? "");
      setUserId(u?.id ?? null);
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token ?? null);
      setUserEmail(session?.user?.email ?? "");
      setUserId(session?.user?.id ?? null);
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

  // Same user/workspace identity source as Home Launcher (`GET /api/me`).
  useEffect(() => {
    if (!sessionToken) return;
    let alive = true;
    (async () => {
      try {
        const me = (await apiGet("/api/me", sessionToken)) as {
          user?: {
            email?: string;
            full_name?: string;
            fullName?: string;
            job_title?: string | null;
            department?: string | null;
            role?: string;
            organization_name?: string | null;
            organization_logo_url?: string | null;
          };
        };
        if (!alive) return;
        const u = me?.user || {};
        const name = String(u.full_name ?? u.fullName ?? "").trim();
        if (name) setProfileFullName(name);
        if (u.email) setUserEmail(String(u.email));
        const subtitle =
          String(u.job_title ?? "").trim() ||
          String(u.department ?? "").trim() ||
          String(u.role ?? "").trim() ||
          "";
        setUserSubtitle(subtitle);
        const org = String(u.organization_name ?? "").trim();
        if (org) setOrganizationName(org);
        else setOrganizationName(DEFAULT_WORKSPACE_NAME);
        const logo = String(u.organization_logo_url ?? "").trim();
        setOrganizationLogoUrl(logo || EOS_LOGO_URL);
      } catch {
        if (!alive) return;
        // Keep session fallbacks; topbar still renders.
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
    setCustomerLink(null);
    setPublishStaffNotice(null);
    setPublishInFlight(false);
    setReplaceInFlight(false);
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

  async function loadQuote(id: string, options: LoadQuoteOptions = {}) {
    if (!sessionToken) return;
    const switchingQuote = id !== selectedId;
    setSelectedId(id);
    setActionError(null);
    if (switchingQuote) {
      setCustomerLink(null);
      setPublishStaffNotice(null);
      setPubDetail(null);
    }
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
        const recovered =
          (typeof active.customerUrl === "string" && active.customerUrl) ||
          (pd &&
          typeof (pd as { publication?: { customerUrl?: string } }).publication?.customerUrl ===
            "string"
            ? (pd as { publication?: { customerUrl?: string } }).publication!.customerUrl!
            : null);
        if (recovered) setCustomerLink(recovered);
        else if (!options.preserveCustomerLink) setCustomerLink(null);
      } else {
        setPubDetail(null);
        if (!options.preserveCustomerLink) setCustomerLink(null);
      }
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Unable to load quote");
      setDetail(null);
    } finally {
      setBusy(false);
    }
  }

  const activePublication = detail?.publications?.find((p) => p.status === "active") ?? null;
  const activeSameRevision =
    Boolean(activePublication) &&
    detail?.quote?.revisionNumber != null &&
    activePublication?.revisionNumber === detail.quote.revisionNumber;

  async function publish() {
    if (!sessionToken || !selectedId || publishInFlight) return;
    if (activeSameRevision) return;
    const confirmMessage = activePublication
      ? "Publish a new Digital Estimate? This supersedes the current active publication for this quote family."
      : "Publish Digital Estimate? This freezes a customer-safe snapshot.";
    if (!window.confirm(confirmMessage)) return;
    setPublishInFlight(true);
    setActionError(null);
    try {
      const body = (await apiPost("/api/elite100-estimate-studio/publications", sessionToken, {
        quoteId: selectedId,
        confirm: true
      })) as {
        customerUrl?: string;
        oneTimeUrl?: string;
        shareUrl?: string;
        staffNotice?: string | null;
        syntheticPilot?: { awaitingSyntheticAllowlist?: boolean };
      };
      const link = body.customerUrl || body.oneTimeUrl || body.shareUrl || null;
      setCustomerLink(link);
      setPublishStaffNotice(
        body.staffNotice ||
          (body.syntheticPilot?.awaitingSyntheticAllowlist
            ? "Customer configuration is blocked while DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY is on. Set it to 0 for live customer Digital Estimates."
            : null)
      );
      await loadQuote(selectedId, { preserveCustomerLink: true });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Publish failed");
    } finally {
      setPublishInFlight(false);
    }
  }

  async function copyLink() {
    if (!customerLink || !sessionToken) return;
    const publicationId =
      pubDetail?.publication?.id ||
      detail?.publications?.find((p) => p.status === "active")?.id ||
      null;
    if (!publicationId) return;
    try {
      await navigator.clipboard.writeText(customerLink);
      await apiPost(
        `/api/elite100-estimate-studio/publications/${String(publicationId)}/events/link-copied`,
        sessionToken,
        {}
      );
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Copy failed");
    }
  }

  async function replaceToken() {
    if (!sessionToken || !pubDetail?.publication?.id || replaceInFlight) return;
    if (!window.confirm("Replace access token? The previous link will stop working.")) return;
    setReplaceInFlight(true);
    setActionError(null);
    try {
      const body = (await apiPost(
        `/api/elite100-estimate-studio/publications/${String(pubDetail.publication.id)}/replace-token`,
        sessionToken,
        { confirm: true }
      )) as { customerUrl?: string; oneTimeUrl?: string; shareUrl?: string };
      const link = body.customerUrl || body.oneTimeUrl || body.shareUrl || null;
      setCustomerLink(link);
      await loadQuote(selectedId!, { preserveCustomerLink: true });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Replace failed");
    } finally {
      setReplaceInFlight(false);
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
      setCustomerLink(null);
      setPublishStaffNotice(null);
      await loadQuote(selectedId!);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  const menuItems: EliteosTopbarMenuItem[] = [
    {
      label: "Open Home",
      meta: "eliteOS Home Launcher",
      href: homeLauncherUrl(),
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 11.5L12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      )
    },
    {
      label: "Profile & preferences",
      meta: "eliteOS Home",
      href: `${homeLauncherUrl()}?view=profile`,
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5" />
        </svg>
      )
    }
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
      <div className="shell">
        <EliteosTopbar
          appName="Elite 100 Estimate Studio"
          organizationName={organizationName}
          logoSrc={organizationLogoUrl}
          homeHref={homeLauncherUrl()}
        />
        <main className="studio-shell">
          <form className="sign-in" onSubmit={signIn}>
            <h1>Sign in to continue</h1>
            <p className="muted">Use your eliteOS staff account.</p>
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
        </main>
      </div>
    );
  }

  const displayName = profileFullName || userMetaName || userEmail;

  return (
    <div className="shell" data-testid="studio-app-shell">
      <EliteosTopbar
        appName="Elite 100 Estimate Studio"
        organizationName={organizationName}
        logoSrc={organizationLogoUrl}
        homeHref={homeLauncherUrl()}
        userName={displayName}
        userEmail={userEmail}
        userSubtitle={userSubtitle}
        initials={userInitialsFor(profileFullName || userMetaName, userEmail)}
        menuItems={menuItems}
        onSignOut={() => void signOut()}
      />
      <main
        className={
          mainNav === "command-center" ||
          mainNav === "estimate-queue" ||
          mainNav === "estimate-workspace"
            ? "studio-shell studio-shell--wide"
            : "studio-shell"
        }
      >
        {mainNav === "publications" ? (
          <div className="pilot-banner" data-testid="studio-publications-banner">
            Private Elite 100 Estimate Studio — publishes frozen Digital Estimates only. Does not
            recalculate or modify the source Internal Estimate.
          </div>
        ) : null}
        {bootError || studioConfigOk === false ? (
          <div className="error-box">{bootError || "Studio API unavailable for this account."}</div>
        ) : null}
        {actionError ? <div className="error-box">{actionError}</div> : null}

        <nav className="studio-nav" aria-label="Studio sections" data-testid="studio-primary-nav">
          <button
            type="button"
            className={
              mainNav === "command-center" || mainNav === "estimate-workspace" ? "active" : ""
            }
            data-testid="studio-nav-command-center"
            onClick={() => {
              setMainNav("command-center");
              setQueueReturnNav("command-center");
              setEstimateWorkspaceCaseId(null);
              setMoreNavOpen(false);
            }}
          >
            Command Center
          </button>
          <button
            type="button"
            className={mainNav === "publications" ? "active" : ""}
            data-testid="studio-nav-publications"
            onClick={() => {
              setMainNav("publications");
              setMoreNavOpen(false);
            }}
          >
            Publications
          </button>
          <button
            type="button"
            className={mainNav === "reviews" ? "active" : ""}
            data-testid="studio-nav-review-requests"
            onClick={() => {
              setMainNav("reviews");
              setMoreNavOpen(false);
            }}
          >
            Review Requests
          </button>
          <div className="studio-nav-more">
            <button
              type="button"
              className={mainNav === "estimate-queue" ? "active" : ""}
              data-testid="studio-nav-more"
              aria-expanded={moreNavOpen}
              aria-haspopup="menu"
              onClick={() => setMoreNavOpen((v) => !v)}
            >
              More
            </button>
            {moreNavOpen ? (
              <ul className="studio-nav-more-menu" role="menu" data-testid="studio-nav-more-menu">
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="studio-nav-legacy-queue"
                    onClick={() => {
                      setMainNav("estimate-queue");
                      setQueueReturnNav("estimate-queue");
                      setEstimateWorkspaceCaseId(null);
                      setMoreNavOpen(false);
                    }}
                  >
                    Open legacy queue
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
        </nav>

        {mainNav === "command-center" ? (
          <EstimateCommandCenterPage
            authToken={sessionToken}
            currentUserId={userId}
            selectedCaseId={intakeCaseId}
            onSelectCase={setIntakeCaseId}
            onOpenEstimate={(caseId, options) => {
              setQueueReturnNav("command-center");
              setEstimateWorkspaceCaseId(caseId);
              setIntakeCaseId(caseId);
              const target = String(options?.openTarget || "takeoff");
              setWorkspaceFocus(
                target === "scope" || target === "digital" || target === "review" || target === "takeoff"
                  ? target
                  : "takeoff"
              );
              setMainNav("estimate-workspace");
            }}
          />
        ) : null}

        {mainNav === "estimate-queue" ? (
          <EstimateQueuePage
            authToken={sessionToken}
            selectedCaseId={intakeCaseId}
            onSelectCase={setIntakeCaseId}
            onOpenEstimate={(caseId, options) => {
              setQueueReturnNav("estimate-queue");
              setEstimateWorkspaceCaseId(caseId);
              setIntakeCaseId(caseId);
              const target = String(options?.openTarget || "takeoff");
              setWorkspaceFocus(
                target === "scope" || target === "digital" || target === "review" || target === "takeoff"
                  ? target
                  : "takeoff"
              );
              setMainNav("estimate-workspace");
            }}
          />
        ) : null}

        {mainNav === "estimate-workspace" && estimateWorkspaceCaseId ? (
          <EstimateTakeoffWorkspace
            authToken={sessionToken}
            caseId={estimateWorkspaceCaseId}
            initialFocus={workspaceFocus || "takeoff"}
            onBackToQueue={() => {
              setMainNav(queueReturnNav);
              setEstimateWorkspaceCaseId(null);
              setWorkspaceFocus(null);
            }}
          />
        ) : null}

        {mainNav === "reviews" ? (
          <ReviewWorkspace
            token={sessionToken}
            onAuthFailure={() => {
              setSessionToken(null);
              setActionError("Session ended or access denied");
            }}
            onOpenEstimate={(caseId) => {
              setQueueReturnNav("command-center");
              setEstimateWorkspaceCaseId(caseId);
              setIntakeCaseId(caseId);
              setMainNav("estimate-workspace");
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

                {activePublication ? (
                  <div className="warn-box" role="status">
                    <strong>Active publication exists</strong>
                    {activeSameRevision ? (
                      <p className="muted">
                        This saved revision already has an active Digital Estimate. The customer link stays available
                        after refresh. Use <strong>Replace link</strong> only when you need a new URL.
                      </p>
                    ) : (
                      <p className="muted">
                        An active publication exists for a different revision. Publishing again will supersede it with a
                        new frozen snapshot.
                      </p>
                    )}
                  </div>
                ) : null}

                <div className="actions">
                  <button
                    type="button"
                    disabled={busy || publishInFlight || !detail.eligibility.eligible || activeSameRevision}
                    onClick={() => void publish()}
                  >
                    {publishInFlight ? "Publishing…" : "Publish Digital Estimate"}
                  </button>
                  {pubDetail?.publication?.status === "active" ? (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy || replaceInFlight}
                        onClick={() => void replaceToken()}
                      >
                        {replaceInFlight ? "Replacing…" : "Replace link"}
                      </button>
                      <button type="button" className="secondary" disabled={busy} onClick={() => void revoke()}>
                        Revoke
                      </button>
                    </>
                  ) : null}
                </div>

                {customerLink ? (
                  <div className="token-once" role="status" aria-live="polite" data-testid="studio-stable-customer-link">
                    <h3>Customer link</h3>
                    <p>Stable reusable link for this active publication. Available after refresh until replaced, revoked, or superseded.</p>
                    {publishStaffNotice ? <p className="muted">{publishStaffNotice}</p> : null}
                    <p className="muted">{customerLink}</p>
                    <div className="actions">
                      <button type="button" onClick={() => void copyLink()}>
                        Copy link
                      </button>
                      <a className="btn secondary" href={customerLink} target="_blank" rel="noreferrer">
                        Open customer view
                      </a>
                    </div>
                  </div>
                ) : activePublication ? (
                  <p className="muted">
                    No recoverable customer URL yet — use <strong>Replace link</strong> once to create one.
                  </p>
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
    </div>
  );
}
