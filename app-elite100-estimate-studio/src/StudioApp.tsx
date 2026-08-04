import React, { useEffect, useMemo, useState } from "react";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import ConfigurationWorkspace from "./ConfigurationWorkspace";
import ReviewWorkspace from "./ReviewWorkspace";
import EstimateQueuePage from "./estimateQueue/EstimateQueuePage";
import EstimateCommandCenterPage from "./estimateQueue/EstimateCommandCenterPage";
import EstimateTakeoffWorkspace from "./estimateQueue/EstimateTakeoffWorkspace";
import StudioV2EstimatorShell, { studioV2UiEnabled } from "./estimateQueue/StudioV2EstimatorShell";
import DigitalEstimatesPage from "./digitalEstimates/DigitalEstimatesPage";
import SharedInboxPage from "./estimateQueue/SharedInboxPage";
import AllEstimatesPage from "./estimateQueue/AllEstimatesPage";
import ManualEstimateWizard from "./estimateQueue/ManualEstimateWizard";
import Elite100CommandShell from "./shell/Elite100CommandShell";
import { apiGet, apiPost, ApiError } from "./lib/api";
import {
  applyStudioV2WorkspaceUrl,
  parseStudioV2WorkspaceDeepLink
} from "./lib/studioV2Url.mjs";
import { getSupabase } from "./lib/supabase";

type QueueReturnNav =
  | "shared-inbox"
  | "command-center"
  | "all-estimates"
  | "digital-estimates"
  | "estimate-queue";
type MainNav =
  | QueueReturnNav
  | "studio-v2"
  | "publications"
  | "reviews"
  | "estimate-workspace";
type WorkspaceFocus = "takeoff" | "scope" | "digital" | "review" | null;

/** V2 preview only when UI flag is on AND URL has studioV2=1 (V1 remains default). */
function studioV2PreviewRequested(): boolean {
  if (!studioV2UiEnabled()) return false;
  try {
    return parseStudioV2WorkspaceDeepLink(window.location.search).studioV2;
  } catch {
    return false;
  }
}

/** Initial V2 deep-link (refresh-safe). Navigation only — no approve/calc/publish. */
function initialStudioV2DeepLink(): {
  caseId: string | null;
  openWorkspace: boolean;
  caseIdInvalid: boolean;
} {
  if (!studioV2UiEnabled()) {
    return { caseId: null, openWorkspace: false, caseIdInvalid: false };
  }
  try {
    const parsed = parseStudioV2WorkspaceDeepLink(window.location.search);
    if (parsed.studioV2 && parsed.caseIdInvalid) {
      return { caseId: null, openWorkspace: false, caseIdInvalid: true };
    }
    if (parsed.studioV2 && parsed.caseId) {
      return { caseId: parsed.caseId, openWorkspace: true, caseIdInvalid: false };
    }
  } catch {
    /* ignore */
  }
  return { caseId: null, openWorkspace: false, caseIdInvalid: false };
}

function normalizeWorkspaceFocus(
  target: string | undefined,
  fallback: NonNullable<WorkspaceFocus>
): NonNullable<WorkspaceFocus> {
  const t = String(target || fallback);
  if (t === "manual-scope") return "scope";
  if (t === "scope" || t === "digital" || t === "review" || t === "takeoff") return t;
  return fallback;
}

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
  const [mainNav, setMainNav] = useState<MainNav>(() =>
    initialStudioV2DeepLink().openWorkspace ? "estimate-workspace" : "shared-inbox"
  );
  const [queueReturnNav, setQueueReturnNav] = useState<QueueReturnNav>("shared-inbox");
  const [moreNavOpen, setMoreNavOpen] = useState(false);
  const [newEstimateOpen, setNewEstimateOpen] = useState(false);
  const [publicationsMode, setPublicationsMode] = useState<"portfolio" | "publish-search">(
    "portfolio"
  );
  const [preselectReviewRequestId, setPreselectReviewRequestId] = useState<string | null>(null);
  const [intakeCaseId, setIntakeCaseId] = useState<string | null>(
    () => initialStudioV2DeepLink().caseId
  );
  const [estimateWorkspaceCaseId, setEstimateWorkspaceCaseId] = useState<string | null>(
    () => initialStudioV2DeepLink().caseId
  );
  const [workspaceFocus, setWorkspaceFocus] = useState<WorkspaceFocus>(null);
  /** Slice A: opt-in V2 shell; default remains V1 EstimateTakeoffWorkspace. */
  const [studioV2Preview, setStudioV2Preview] = useState(() => studioV2PreviewRequested());
  const [organizationName, setOrganizationName] = useState(DEFAULT_WORKSPACE_NAME);
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState(EOS_LOGO_URL);
  const [userSubtitle, setUserSubtitle] = useState("");
  const [profileFullName, setProfileFullName] = useState("");

  const [studioV2DeepLinkError, setStudioV2DeepLinkError] = useState<string | null>(() =>
    initialStudioV2DeepLink().caseIdInvalid
      ? "This Studio V2 link is invalid. Return to Inbox and open the estimate again."
      : null
  );

  function studioV2UrlSyncActive(): boolean {
    return studioV2UiEnabled() && (studioV2Preview || studioV2PreviewRequested());
  }

  function openEstimateWorkspace(opts: {
    caseId: string;
    returnNav: QueueReturnNav;
    openTarget?: string;
    focusFallback?: NonNullable<WorkspaceFocus>;
  }) {
    const caseId = String(opts.caseId || "").trim();
    setQueueReturnNav(opts.returnNav);
    setEstimateWorkspaceCaseId(caseId);
    setIntakeCaseId(caseId);
    setWorkspaceFocus(normalizeWorkspaceFocus(opts.openTarget, opts.focusFallback || "takeoff"));
    setMainNav("estimate-workspace");
    setStudioV2DeepLinkError(null);
    // URL addressability is V2-only; V1 keeps prior in-memory navigation.
    if (studioV2UiEnabled() && (studioV2Preview || studioV2PreviewRequested())) {
      applyStudioV2WorkspaceUrl({ caseId, mode: "push" });
    }
  }

  function leaveEstimateWorkspace(returnNav?: QueueReturnNav) {
    const next = returnNav || queueReturnNav;
    setMainNav(next);
    setEstimateWorkspaceCaseId(null);
    setWorkspaceFocus(null);
    setStudioV2DeepLinkError(null);
    if (studioV2UiEnabled() && studioV2PreviewRequested()) {
      // Keep ?studioV2=1; only drop the selected case.
      applyStudioV2WorkspaceUrl({ caseId: null, mode: "push" });
      setStudioV2Preview(true);
    } else {
      setStudioV2Preview(false);
    }
  }

  function clearWorkspaceSelectionFromNav(nextNav: QueueReturnNav | "publications" | "reviews") {
    setEstimateWorkspaceCaseId(null);
    setWorkspaceFocus(null);
    if (studioV2UrlSyncActive()) {
      applyStudioV2WorkspaceUrl({ caseId: null, mode: "push" });
    }
    if (nextNav === "publications" || nextNav === "reviews") {
      setMainNav(nextNav);
    } else {
      setMainNav(nextNav);
      setQueueReturnNav(nextNav);
    }
  }

  function openStudioV2Landing() {
    setStudioV2Preview(true);
    setEstimateWorkspaceCaseId(null);
    setWorkspaceFocus(null);
    setStudioV2DeepLinkError(null);
    setMainNav("studio-v2");
    setMoreNavOpen(false);
    if (studioV2UiEnabled()) {
      applyStudioV2WorkspaceUrl({ caseId: null, mode: "push" });
    }
  }

  // Browser back/forward restores or clears V2 workspace from the URL.
  useEffect(() => {
    function onPopState() {
      if (!studioV2UiEnabled()) return;
      const parsed = parseStudioV2WorkspaceDeepLink(window.location.search);
      setStudioV2Preview(parsed.studioV2);
      if (parsed.studioV2 && parsed.caseIdInvalid) {
        setEstimateWorkspaceCaseId(null);
        setWorkspaceFocus(null);
        setStudioV2DeepLinkError(
          "This Studio V2 link is invalid. Return to Inbox and open the estimate again."
        );
        setMainNav(queueReturnNav);
        return;
      }
      setStudioV2DeepLinkError(null);
      if (parsed.studioV2 && parsed.caseId) {
        setEstimateWorkspaceCaseId(parsed.caseId);
        setIntakeCaseId(parsed.caseId);
        setMainNav("estimate-workspace");
        return;
      }
      setEstimateWorkspaceCaseId(null);
      setWorkspaceFocus(null);
      setMainNav((prev) => (prev === "estimate-workspace" ? queueReturnNav : prev));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [queueReturnNav]);

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
        className={[
          "studio-shell",
          mainNav === "shared-inbox" ||
          mainNav === "command-center" ||
          mainNav === "all-estimates" ||
          mainNav === "digital-estimates" ||
          mainNav === "estimate-queue" ||
          mainNav === "estimate-workspace" ||
          mainNav === "publications" ||
          mainNav === "studio-v2"
            ? "studio-shell--wide"
            : "",
          studioV2Preview && studioV2UiEnabled() ? "studio-shell--v2" : ""
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {mainNav === "publications" && publicationsMode === "publish-search" ? (
          <div className="pilot-banner" data-testid="studio-publications-banner">
            Private Elite 100 Estimate Studio — publishes frozen Digital Estimates only. Does not
            recalculate or modify the source Internal Estimate.
          </div>
        ) : null}
        {bootError || studioConfigOk === false ? (
          <div className="error-box">{bootError || "Studio API unavailable for this account."}</div>
        ) : null}
        {actionError ? <div className="error-box">{actionError}</div> : null}
        {studioV2DeepLinkError ? (
          <div className="error-box" data-testid="studio-v2-deeplink-error">
            <p>{studioV2DeepLinkError}</p>
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="studio-v2-deeplink-error-back"
              onClick={() => leaveEstimateWorkspace("shared-inbox")}
            >
              Back to Inbox
            </button>
          </div>
        ) : null}

        <Elite100CommandShell
          workspaceName={organizationName || "Elite Stone Fabrication"}
          showHero={mainNav !== "estimate-workspace"}
        >
        <nav className="studio-nav" aria-label="Studio sections" data-testid="studio-primary-nav">
          <button
            type="button"
            className={
              mainNav === "shared-inbox" ||
              (mainNav === "estimate-workspace" && queueReturnNav === "shared-inbox")
                ? "active"
                : ""
            }
            data-testid="studio-nav-inbox"
            onClick={() => {
              clearWorkspaceSelectionFromNav("shared-inbox");
              setMoreNavOpen(false);
            }}
          >
            Inbox
          </button>
          <button
            type="button"
            className={
              mainNav === "all-estimates" ||
              (mainNav === "estimate-workspace" && queueReturnNav === "all-estimates")
                ? "active"
                : ""
            }
            data-testid="studio-nav-estimates"
            onClick={() => {
              clearWorkspaceSelectionFromNav("all-estimates");
              setMoreNavOpen(false);
            }}
          >
            Estimates
          </button>
          <button
            type="button"
            className={
              mainNav === "digital-estimates" ||
              (mainNav === "estimate-workspace" && queueReturnNav === "digital-estimates")
                ? "active"
                : ""
            }
            data-testid="studio-nav-digital-estimates"
            title="Customer links and customer activity"
            onClick={() => {
              clearWorkspaceSelectionFromNav("digital-estimates");
              setMoreNavOpen(false);
            }}
          >
            Digital Estimates
          </button>
          {studioV2UiEnabled() ? (
            <button
              type="button"
              className={
                mainNav === "studio-v2" ||
                (mainNav === "estimate-workspace" && studioV2Preview)
                  ? "active"
                  : ""
              }
              data-testid="studio-nav-studio-v2"
              title="Estimate workspace and estimate authority"
              onClick={() => {
                if (estimateWorkspaceCaseId) {
                  setStudioV2Preview(true);
                  setMainNav("estimate-workspace");
                  setStudioV2DeepLinkError(null);
                  applyStudioV2WorkspaceUrl({
                    caseId: estimateWorkspaceCaseId,
                    mode: "push"
                  });
                  setMoreNavOpen(false);
                  return;
                }
                openStudioV2Landing();
              }}
            >
              Studio V2
            </button>
          ) : null}
          <button
            type="button"
            className="eq-btn-primary studio-nav-new-estimate"
            data-testid="studio-nav-new-estimate"
            title="Create a new estimate — starts you directly in Scope"
            onClick={() => setNewEstimateOpen(true)}
          >
            + New Estimate
          </button>
          <div className="studio-nav-more">
            <button
              type="button"
              className={
                mainNav === "command-center" ||
                mainNav === "publications" ||
                mainNav === "reviews" ||
                mainNav === "estimate-queue"
                  ? "active"
                  : ""
              }
              data-testid="studio-nav-more"
              aria-expanded={moreNavOpen}
              aria-haspopup="menu"
              onClick={() => setMoreNavOpen((v) => !v)}
            >
              More
            </button>
            {moreNavOpen ? (
              <ul className="studio-nav-more-menu" role="menu" data-testid="studio-nav-more-menu">
                <li className="studio-nav-more-label" role="none">
                  Legacy / compatibility
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="studio-nav-command-center"
                    onClick={() => {
                      clearWorkspaceSelectionFromNav("command-center");
                      setMoreNavOpen(false);
                    }}
                  >
                    Command Center (Compatibility)
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="studio-nav-publication-workspace"
                    onClick={() => {
                      clearWorkspaceSelectionFromNav("publications");
                      setPublicationsMode("publish-search");
                      setMoreNavOpen(false);
                    }}
                  >
                    Legacy Publish Digital Estimate
                  </button>
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="studio-nav-review-requests"
                    onClick={() => {
                      clearWorkspaceSelectionFromNav("reviews");
                      setMoreNavOpen(false);
                    }}
                  >
                    Review Requests (Compatibility)
                  </button>
                </li>
                <li className="studio-nav-more-label" role="none">
                  Support tools
                </li>
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="studio-nav-legacy-queue"
                    onClick={() => {
                      clearWorkspaceSelectionFromNav("estimate-queue");
                      setMoreNavOpen(false);
                    }}
                  >
                    Open Legacy Queue
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
        </nav>

        {mainNav === "shared-inbox" ? (
          <SharedInboxPage
            authToken={sessionToken}
            onOpenEstimate={(caseId, options) => {
              openEstimateWorkspace({
                caseId,
                returnNav: "shared-inbox",
                openTarget: options?.openTarget,
                focusFallback: "takeoff"
              });
            }}
          />
        ) : null}

        {mainNav === "command-center" ? (
          <EstimateCommandCenterPage
            authToken={sessionToken}
            currentUserId={userId}
            selectedCaseId={intakeCaseId}
            onSelectCase={setIntakeCaseId}
            onOpenEstimate={(caseId, options) => {
              // manual-scope → scope focus (Manual Scope editor + Pricing Setup)
              openEstimateWorkspace({
                caseId,
                returnNav: "command-center",
                openTarget: options?.openTarget,
                focusFallback: "takeoff"
              });
            }}
          />
        ) : null}

        {mainNav === "all-estimates" ? (
          <AllEstimatesPage
            authToken={sessionToken}
            onOpenEstimate={(caseId, options) => {
              openEstimateWorkspace({
                caseId,
                returnNav: "all-estimates",
                openTarget: options?.openTarget,
                focusFallback: "scope"
              });
            }}
          />
        ) : null}

        {mainNav === "digital-estimates" ? (
          <DigitalEstimatesPage
            authToken={sessionToken}
            onOpenEstimate={(caseId, options) => {
              setStudioV2Preview(true);
              openEstimateWorkspace({
                caseId,
                returnNav: "digital-estimates",
                openTarget: options?.openTarget,
                focusFallback: "digital"
              });
              applyStudioV2WorkspaceUrl({ caseId, mode: "push" });
            }}
            onOpenReviewRequest={(reviewRequestId) => {
              setPreselectReviewRequestId(reviewRequestId);
              setMainNav("reviews");
            }}
          />
        ) : null}

        {mainNav === "studio-v2" && !estimateWorkspaceCaseId ? (
          <section className="panel studio-v2-landing e100-empty-landing" data-testid="studio-v2-landing">
            <p className="studio-v2-landing__eyebrow">Estimate workspace · estimate authority</p>
            <h1>Studio V2 Workspace</h1>
            <p className="muted">
              Open an estimate from Inbox, Estimates, or Digital Estimates to begin.
            </p>
            <p className="e100-empty-landing__hint muted">
              Studio V2 is where estimators own scope, pricing, approval, and publish — not an error
              state.
            </p>
            <div className="actions e100-action-bar e100-action-bar--start">
              <button
                type="button"
                className="eq-btn-primary"
                data-testid="studio-v2-landing-inbox"
                onClick={() => clearWorkspaceSelectionFromNav("shared-inbox")}
              >
                Go to Inbox
              </button>
              <button
                type="button"
                className="eq-btn-secondary"
                data-testid="studio-v2-landing-estimates"
                onClick={() => clearWorkspaceSelectionFromNav("all-estimates")}
              >
                Go to Estimates
              </button>
              <button
                type="button"
                className="eq-btn-secondary"
                data-testid="studio-v2-landing-digital-estimates"
                onClick={() => clearWorkspaceSelectionFromNav("digital-estimates")}
              >
                Go to Digital Estimates
              </button>
            </div>
          </section>
        ) : null}

        {mainNav === "estimate-queue" ? (
          <EstimateQueuePage
            authToken={sessionToken}
            selectedCaseId={intakeCaseId}
            onSelectCase={setIntakeCaseId}
            onOpenEstimate={(caseId, options) => {
              openEstimateWorkspace({
                caseId,
                returnNav: "estimate-queue",
                openTarget: options?.openTarget,
                focusFallback: "takeoff"
              });
            }}
          />
        ) : null}

        {mainNav === "estimate-workspace" && estimateWorkspaceCaseId ? (
          studioV2Preview && studioV2UiEnabled() ? (
            <StudioV2EstimatorShell
              authToken={sessionToken}
              caseId={estimateWorkspaceCaseId}
              onBack={() => leaveEstimateWorkspace()}
              onOpenV1={() => setStudioV2Preview(false)}
            />
          ) : (
            <EstimateTakeoffWorkspace
              authToken={sessionToken}
              caseId={estimateWorkspaceCaseId}
              initialFocus={workspaceFocus || "takeoff"}
              onBackToQueue={() => {
                // V1: in-memory only (no URL caseId sync).
                setMainNav(queueReturnNav);
                setEstimateWorkspaceCaseId(null);
                setWorkspaceFocus(null);
              }}
            />
          )
        ) : null}

        {mainNav === "reviews" ? (
          <ReviewWorkspace
            token={sessionToken}
            initialReviewRequestId={preselectReviewRequestId}
            onAuthFailure={() => {
              setSessionToken(null);
              setActionError("Session ended or access denied");
            }}
            onOpenEstimate={(caseId) => {
              openEstimateWorkspace({
                caseId,
                returnNav: "command-center",
                openTarget: "review",
                focusFallback: "review"
              });
            }}
          />
        ) : null}

        {mainNav === "publications" && publicationsMode === "publish-search" ? (
        <div className="studio-grid">
          <p className="muted">
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="live-de-back-to-portfolio"
              onClick={() => {
                setPublicationsMode("portfolio");
                clearWorkspaceSelectionFromNav("digital-estimates");
              }}
            >
              ← Back to Digital Estimates
            </button>
          </p>
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
        </Elite100CommandShell>
      </main>

      <ManualEstimateWizard
        authToken={sessionToken}
        open={newEstimateOpen}
        skipChooser
        onClose={() => setNewEstimateOpen(false)}
        onCreated={({ intakeCaseId }) => {
          // Standalone create never returns to Inbox/a legacy queue — it
          // opens directly in Scope. "Back" from the workspace returns to
          // whichever primary list section launched it.
          openEstimateWorkspace({
            caseId: intakeCaseId,
            returnNav:
              mainNav === "all-estimates" || mainNav === "digital-estimates"
                ? mainNav
                : "shared-inbox",
            openTarget: "scope",
            focusFallback: "scope"
          });
          setNewEstimateOpen(false);
        }}
      />
    </div>
  );
}
