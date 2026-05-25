import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, apiFetch } from "../lib/api";
import { EOS_LOGO_URL, resolveHeadLaunchUrl, sanitizeLauncherLaunchUrl } from "../lib/config";
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
  /** Optional, forward-compatible. Used by the hero workspace panel when backend supplies it. */
  organization_name?: string | null;
  organization_logo_url?: string | null;
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
  user?: {
    id: string;
    email: string;
    role: string;
    userKind?: string;
    full_name?: string;
    organization_id?: string | null;
    /** Optional, forward-compatible. Surfaced in the hero workspace panel when present. */
    organization_name?: string | null;
    organization_logo_url?: string | null;
  };
  heads: HeadCard[];
};

/**
 * Default workspace identity for the current Elite tenant.
 *
 * eliteOS is Elite Stone Fabrication's workspace inside the slabOS platform.
 * When the backend eventually returns `organization_name` / `organization_logo_url`
 * for any tenant, those values take precedence over these defaults — no UI change
 * needed. Kept here (not scattered) so a multi-tenant rollout has one place to swap.
 */
const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const DEFAULT_WORKSPACE_SHORT = "Elite Stone";

function resolveWorkspaceName(me: MeResp | null, heads: HeadsResp | null): string {
  return (
    String(me?.user?.organization_name ?? "").trim() ||
    String(heads?.user?.organization_name ?? "").trim() ||
    DEFAULT_WORKSPACE_NAME
  );
}

function resolveWorkspaceLogoUrl(me: MeResp | null, heads: HeadsResp | null): string {
  const fromBackend =
    String(me?.user?.organization_logo_url ?? "").trim() ||
    String(heads?.user?.organization_logo_url ?? "").trim();
  if (fromBackend) return fromBackend;
  // Local fallback — current tenant uses the existing Elite Stone Fabrication asset.
  return EOS_LOGO_URL;
}

function workspaceShortId(orgId: string | null | undefined): string {
  const s = String(orgId ?? "").trim();
  if (!s) return "";
  // Show the first UUID block (8 chars) so admins can recognize the workspace at a glance
  // without exposing the full ID. Falls back to first 8 of any non-UUID string.
  return s.split("-")[0]?.slice(0, 8) || s.slice(0, 8);
}

function workspaceInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "EO";
}

const SECURITY_NOTE =
  "What you see here reflects your access assignments. The Brain still enforces sign-in and permissions on every request.";

/** User-facing launcher titles only — internal API slugs and governance keys are unchanged. */
const LAUNCHER_TOOL_TITLE_BY_SLUG: Record<string, string> = {
  quote: "Estimating Tool",
  quote_library: "Quote Library",
  pricing_admin: "Pricing Admin",
  system_admin: "System Admin",
  public_quote: "Public Quote Tool",
  executive: "Executive Dashboard",
  brain_health: "System Health",
  sales: "Sales Dashboard",
  production: "Production Dashboard",
  shop_tv: "Shop Floor TV",
  install: "Install",
  purchasing: "Purchasing",
  customer_service: "Customer Service",
  hr: "HR",
  safety: "Safety",
  marketing: "Marketing",
  finance: "Finance",
  reports: "Reports",
  partner_quote: "Partner Quote Tool",
  dealer_resources: "Dealer Resources"
};

/**
 * Visual category tint per head slug. Drives the icon tile gradient and a subtle card accent.
 * Purely presentational — does not affect permissions, ordering, or routing.
 */
type HeadTint = "navy" | "burgundy" | "violet" | "teal" | "amber" | "slate";

const HEAD_TINT_BY_SLUG: Record<string, HeadTint> = {
  quote: "burgundy",
  quote_library: "navy",
  pricing_admin: "amber",
  system_admin: "slate",
  public_quote: "teal",
  executive: "violet",
  brain_health: "teal",
  sales: "violet",
  production: "navy",
  shop_tv: "slate",
  install: "amber",
  purchasing: "amber",
  customer_service: "teal",
  hr: "violet",
  safety: "burgundy",
  marketing: "violet",
  finance: "navy",
  reports: "slate",
  partner_quote: "burgundy",
  dealer_resources: "navy",
  org_directory: "slate"
};

function headTintFor(slug: string): HeadTint {
  return HEAD_TINT_BY_SLUG[slug] ?? "slate";
}

/**
 * Inline SVG glyph for each head. Stroke-based, currentColor, no external icon font.
 * Falls back to a neutral grid glyph when slug is unknown.
 */
function HeadGlyph({ slug }: { slug: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };
  switch (slug) {
    case "quote":
      return (
        <svg {...common}>
          <path d="M4 19l4-1 11-11a1.8 1.8 0 0 0 0-2.5l-.5-.5a1.8 1.8 0 0 0-2.5 0L5 15l-1 4Z" />
          <path d="M14.5 6.5l3 3" />
        </svg>
      );
    case "quote_library":
      return (
        <svg {...common}>
          <path d="M5 4h11a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2Z" />
          <path d="M9 8h6" />
          <path d="M9 12h4" />
        </svg>
      );
    case "pricing_admin":
      return (
        <svg {...common}>
          <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z" />
          <circle cx="8" cy="8" r="1.6" />
        </svg>
      );
    case "system_admin":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.28 16.93l.06-.06A1.7 1.7 0 0 0 4.68 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.07 4.28l.06.06a1.7 1.7 0 0 0 1.87.34h.07a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.07a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
        </svg>
      );
    case "public_quote":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a13 13 0 0 1 0 18a13 13 0 0 1 0-18Z" />
        </svg>
      );
    case "partner_quote":
      return (
        <svg {...common}>
          <path d="M3 10l4-4 4 4 4-4 4 4-4 4-4-4-4 4-4-4Z" />
          <path d="M11 14l3 3" />
        </svg>
      );
    case "dealer_resources":
      return (
        <svg {...common}>
          <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5Z" />
          <path d="M8 7h8" />
          <path d="M8 11h6" />
        </svg>
      );
    case "executive":
      return (
        <svg {...common}>
          <path d="M4 19h16" />
          <path d="M7 16V9" />
          <path d="M12 16V5" />
          <path d="M17 16v-5" />
        </svg>
      );
    case "brain_health":
      return (
        <svg {...common}>
          <path d="M3 12h4l2-5 4 10 2-5h6" />
        </svg>
      );
    case "sales":
      return (
        <svg {...common}>
          <path d="M3 17l6-6 4 4 8-9" />
          <path d="M14 6h7v7" />
        </svg>
      );
    case "production":
      return (
        <svg {...common}>
          <path d="M3 7l9-4 9 4-9 4-9-4Z" />
          <path d="M3 12l9 4 9-4" />
          <path d="M3 17l9 4 9-4" />
        </svg>
      );
    case "shop_tv":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      );
    case "install":
      return (
        <svg {...common}>
          <path d="M14 4l6 6-3 3-3-3-7 7H4v-3l7-7-3-3 3-3Z" />
        </svg>
      );
    case "purchasing":
      return (
        <svg {...common}>
          <path d="M3 4h2l2 12h12l2-8H7" />
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="18" cy="20" r="1.4" />
        </svg>
      );
    case "customer_service":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.5 8.5 0 1 1-3.4-6.8" />
          <path d="M21 4v5h-5" />
          <path d="M8 13a4 4 0 0 0 8 0" />
        </svg>
      );
    case "hr":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <circle cx="17" cy="9" r="2.4" />
          <path d="M15 20a4 4 0 0 1 6-3.5" />
        </svg>
      );
    case "safety":
      return (
        <svg {...common}>
          <path d="M12 3l8 3v6a8 8 0 0 1-8 9 8 8 0 0 1-8-9V6l8-3Z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "marketing":
      return (
        <svg {...common}>
          <path d="M3 11l16-7v16L3 13v-2Z" />
          <path d="M7 13v6" />
        </svg>
      );
    case "finance":
      return (
        <svg {...common}>
          <path d="M12 2v20" />
          <path d="M17 6.5a4 4 0 0 0-4-2.5h-2a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-2a4 4 0 0 1-4-2.5" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M5 3h10l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M14 3v5h5" />
          <path d="M8 14h8" />
          <path d="M8 18h5" />
        </svg>
      );
    case "org_directory":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10" />
          <path d="M7 13h7" />
          <path d="M7 17h4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      );
  }
}

const AVAILABLE_SORT_PRIORITY = [
  "quote",
  "quote_library",
  "pricing_admin",
  "system_admin",
  "org_directory",
  "public_quote"
];

type LauncherSection = "Available Tools" | "Coming Soon Tools";

function pickLaunchUrl(head: HeadCard): string | null {
  const fromApi = sanitizeLauncherLaunchUrl(head.url);
  if (import.meta.env.DEV) {
    const fb = sanitizeLauncherLaunchUrl(resolveHeadLaunchUrl(head.slug));
    return fromApi || fb;
  }
  return fromApi;
}

function isEliteosfabProductionUrl(url: string): boolean {
  try {
    const h = new URL(String(url).trim()).hostname.toLowerCase();
    return h === "eliteosfab.com" || h.endsWith(".eliteosfab.com");
  } catch {
    return false;
  }
}

function headLauncherBucket(head: HeadCard): "available" | "roadmap" {
  return pickLaunchUrl(head) ? "available" : "roadmap";
}

function pillClass(text: string): string {
  if (text === "Live") return "pill pill-live";
  if (text === "Preview") return "pill pill-preview";
  if (text === "Available") return "pill pill-available";
  if (text === "Public") return "pill pill-public";
  if (text === "Admin") return "pill pill-admin";
  if (text === "Not assigned") return "pill pill-warn";
  if (text === "Coming soon") return "pill pill-roadmap";
  return "pill pill-muted";
}

function resolveCardBadges(head: HeadCard, roadmapSection: boolean): string[] {
  const url = pickLaunchUrl(head);
  if (roadmapSection || !url) {
    return ["Coming soon"];
  }
  const badges: string[] = [];
  if (!head.enabled && head.slug !== "public_quote") badges.push("Not assigned");
  if (head.slug === "public_quote") badges.push("Public");
  if (head.slug === "system_admin" || head.slug === "pricing_admin") badges.push("Admin");

  if (isEliteosfabProductionUrl(url)) badges.push("Live");
  else if (url.includes("vercel.app")) badges.push("Preview");
  else badges.push("Available");

  return badges;
}

function shouldShowUrlOnCard(url: string | null): boolean {
  if (!url || sanitizeLauncherLaunchUrl(url) !== url) return false;
  if (import.meta.env.DEV) return true;
  return !isEliteosfabProductionUrl(url);
}

function launcherCardTitle(h: HeadCard): string {
  const mapped = LAUNCHER_TOOL_TITLE_BY_SLUG[h.slug];
  if (mapped) return mapped;
  const fallback = String(h.title ?? h.label ?? "").trim();
  return fallback || h.slug;
}

function sortAvailableHeads(a: HeadCard, b: HeadCard): number {
  const ua = Boolean(pickLaunchUrl(a) && a.enabled);
  const ub = Boolean(pickLaunchUrl(b) && b.enabled);
  if (ua !== ub) return ua ? -1 : 1;
  const ia = AVAILABLE_SORT_PRIORITY.indexOf(a.slug);
  const ib = AVAILABLE_SORT_PRIORITY.indexOf(b.slug);
  const pa = ia === -1 ? 999 : ia;
  const pb = ib === -1 ? 999 : ib;
  if (pa !== pb) return pa - pb;
  return launcherCardTitle(a).localeCompare(launcherCardTitle(b));
}

function sortRoadmapHeads(a: HeadCard, b: HeadCard): number {
  return launcherCardTitle(a).localeCompare(launcherCardTitle(b));
}

function firstNameFromDisplay(name: string, email: string): string {
  const n = name.trim();
  if (n && !n.includes("@")) {
    const first = n.split(/\s+/)[0];
    if (first) return first;
  }
  const local = email.split("@")[0] || "";
  const candidate = local.split(/[._-]/)[0] || "";
  if (!candidate) return "";
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

function initialsFor(name: string, email: string): string {
  const n = (name || "").trim();
  if (n && !n.includes("@")) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const local = (email || "").split("@")[0] || "";
  if (local) return local.slice(0, 2).toUpperCase();
  return "EO";
}

/**
 * Typographic mark for the slabOS platform brand.
 *
 * Pure SVG, monochromatic, no asset request. Used only at the platform-level
 * surfaces (sign-in, sign-out gate). Inside a signed-in workspace the brand
 * mark on the topbar is the tenant's logo, not slabOS, to avoid mixing levels.
 */
function SlabMark({ size = 28 }: { size?: number }) {
  const w = size * 1.85;
  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 52 28"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="slab-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0b1a33" />
          <stop offset="100%" stopColor="#a3132f" />
        </linearGradient>
      </defs>
      {/* Stacked slab silhouettes — recognizable but quiet */}
      <path d="M10 6 L46 6 L42 13 L6 13 Z" fill="url(#slab-mark-grad)" opacity="0.92" />
      <path d="M14 16 L50 16 L46 23 L10 23 Z" fill="url(#slab-mark-grad)" opacity="0.55" />
    </svg>
  );
}

/** Arrow glyph shown inside the primary "Open" affordance. */
function ArrowOut() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
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
    const token = session?.access_token ?? "";
    if (token) {
      try {
        await apiFetch("/api/auth/log-event", {
          token,
          method: "POST",
          body: { event_type: "sign_out", tool_slug: "home" }
        });
      } catch {
        /* best-effort audit only */
      }
    }
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
    const available: HeadCard[] = [];
    const roadmap: HeadCard[] = [];
    for (const h of hs) {
      (headLauncherBucket(h) === "available" ? available : roadmap).push(h);
    }
    available.sort(sortAvailableHeads);
    roadmap.sort(sortRoadmapHeads);
    return [
      { section: "Available Tools" as const, items: available },
      { section: "Coming Soon Tools" as const, items: roadmap }
    ] satisfies Array<{ section: LauncherSection; items: HeadCard[] }>;
  }, [headsPayload]);

  const showShell = Boolean(session?.access_token);
  const u = me?.user;
  const headsUser = headsPayload?.user;
  const roleLc = String(u?.role ?? "").trim().toLowerCase();
  const isAdminLike = roleLc === "admin" || roleLc === "super_admin";
  const showTechnicalDetails = isAdminLike || roleLc === "executive";
  const displayName =
    String(u?.full_name ?? u?.fullName ?? "").trim() ||
    String(u?.email ?? session?.user?.email ?? "").trim() ||
    "Signed in user";
  const displayEmail = String(u?.email ?? session?.user?.email ?? "").trim();
  const displayOrg = String(u?.organization_id ?? headsUser?.organization_id ?? "").trim();
  const firstName = firstNameFromDisplay(displayName, displayEmail);
  const initials = initialsFor(displayName, displayEmail);
  const workspaceName = resolveWorkspaceName(me, headsPayload);
  const workspaceLogoUrl = resolveWorkspaceLogoUrl(me, headsPayload);
  const workspaceShort = workspaceShortId(displayOrg);
  const workspaceInits = workspaceInitials(workspaceName);
  // True when the backend has not supplied an org logo and we're showing the local Elite fallback.
  const workspaceLogoIsFallback = workspaceLogoUrl === EOS_LOGO_URL;

  const availableCount = grouped.find((g) => g.section === "Available Tools")?.items.length ?? 0;
  const roadmapCount = grouped.find((g) => g.section === "Coming Soon Tools")?.items.length ?? 0;
  const heroGreeting = firstName ? `Welcome back, ${firstName}.` : "Welcome back.";

  return (
    <div className="shell">
      {showShell ? (
        <header className="topbar" role="banner">
          <a href="/" className="brand-row brand-row-link" aria-label={`eliteOS Home — ${workspaceName}`}>
            <span className="brand-mark" aria-hidden>
              <img src={workspaceLogoUrl} alt="" />
            </span>
            <span className="brand-text">
              <span className="brand-wordmark">eliteOS</span>
              <span className="brand-sub">{workspaceName}</span>
            </span>
          </a>
          <div className="topbar-actions">
            <div className="topbar-account" aria-label="Signed in user">
              <span className="topbar-avatar" aria-hidden>{initials}</span>
              <span className="topbar-account-text">
                <span className="topbar-account-name">{displayName}</span>
                {u?.role ? <span className="topbar-account-role">{u.role}</span> : null}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => void reloadAccess()}
              disabled={refreshBusy || loadingData}
              title="Refresh your tool access from the Brain"
            >
              {refreshBusy ? "Refreshing…" : "Refresh access"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void signOutClick()}>
              Sign out
            </button>
          </div>
        </header>
      ) : null}

      <main className="main launcher-main" role="main">
        {!showShell ? (
          <div className="auth-stage">
            <section className="auth-brand" aria-hidden={false}>
              <div className="slab-brand-row">
                <span className="slab-brand-mark" aria-hidden>
                  <SlabMark size={30} />
                </span>
                <h1 className="slab-wordmark">slabOS</h1>
              </div>
              <p className="slab-tagline">Fabrication operating system.</p>
              <p className="slab-positioning">
                A premium operating layer for stone fabricators — quotes, pricing, partners, sales,
                production, and shop flow in one place.
              </p>
              <div className="slab-tenant-line" aria-label="Current workspace">
                <span className="slab-tenant-dot" aria-hidden />
                <span className="slab-tenant-text">
                  <strong>Elite Stone Fabrication</strong> runs on slabOS
                </span>
              </div>
            </section>
            <section className="auth-panel" aria-label="Sign in">
              {urlFlowError ? (
                <div className="banner banner-error" role="alert" style={{ marginBottom: 16 }}>
                  {urlFlowError}
                </div>
              ) : null}
              <header className="auth-panel-header">
                <h2 className="auth-panel-title">Sign in to your workspace</h2>
                <p className="auth-panel-sub">
                  Continue to the eliteOS launcher for Elite Stone Fabrication.
                </p>
              </header>
              <form onSubmit={(e) => void submitLogin(e)} noValidate>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
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
                {authError ? (
                  <div className="banner banner-error" role="alert" style={{ marginBottom: 12 }}>
                    {authError}
                  </div>
                ) : null}
                <button type="submit" className="btn btn-primary" disabled={loginBusy}>
                  {loginBusy ? "Signing in…" : "Sign in"}
                </button>
              </form>
              <p className="muted-note auth-trust">
                Authenticated through Supabase. No Moraware credentials or service role keys are used here.
              </p>
            </section>
          </div>
        ) : invitePasswordGate ? (
          <div className="auth-panel auth-panel-standalone" aria-label="Set password">
            <div className="slab-brand-row slab-brand-row-compact">
              <span className="slab-brand-mark" aria-hidden>
                <SlabMark size={22} />
              </span>
              <span className="slab-wordmark slab-wordmark-compact">slabOS</span>
            </div>
            <header className="auth-panel-header">
              <h2 className="auth-panel-title">Finish your workspace account</h2>
              <p className="auth-panel-sub">
                You signed in from an invite or reset link. Set a password you can use with email sign-in, or continue and
                set it later in account settings.
              </p>
            </header>
            <form onSubmit={(e) => void submitInvitePassword(e)} noValidate>
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
              {invitePwErr ? (
                <div className="banner banner-error" role="alert" style={{ marginBottom: 12 }}>
                  {invitePwErr}
                </div>
              ) : null}
              <button type="submit" className="btn btn-primary" disabled={invitePwBusy}>
                {invitePwBusy ? "Saving…" : "Save password & continue"}
              </button>
            </form>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={skipInvitePassword}>
              Skip for now — open launcher
            </button>
          </div>
        ) : (
          <>
            <section className="hero" aria-labelledby="hero-greeting">
              <div className="hero-grid">
                <div className="hero-inner">
                  <p className="hero-eyebrow">Workspace · {workspaceName}</p>
                  <h1 id="hero-greeting" className="hero-title">{heroGreeting}</h1>
                  <p className="hero-motto">Keep the Titans running well.</p>
                  <p className="hero-positioning">
                    One operating layer for quotes, pricing, partners, sales, production, and shop flow.
                  </p>
                  <div className="hero-stats" role="list">
                    <div className="hero-stat" role="listitem">
                      <span className="hero-stat-value">{loadingData && !headsPayload ? "—" : availableCount}</span>
                      <span className="hero-stat-label">{availableCount === 1 ? "Tool available" : "Tools available"}</span>
                    </div>
                    <div className="hero-stat-divider" aria-hidden />
                    <div className="hero-stat" role="listitem">
                      <span className="hero-stat-value">{loadingData && !headsPayload ? "—" : roadmapCount}</span>
                      <span className="hero-stat-label">On the roadmap</span>
                    </div>
                    <div className="hero-stat-divider" aria-hidden />
                    <div className="hero-stat" role="listitem">
                      <span className="hero-stat-value">{u?.role ?? "—"}</span>
                      <span className="hero-stat-label">Your role</span>
                    </div>
                  </div>
                </div>
                <aside
                  className="hero-workspace"
                  aria-label={`Workspace: ${workspaceName}`}
                >
                  <span className="hero-workspace-eyebrow">Workspace</span>
                  <div className="hero-workspace-frame">
                    {workspaceLogoUrl ? (
                      <img
                        src={workspaceLogoUrl}
                        alt={workspaceLogoIsFallback ? "" : `${workspaceName} logo`}
                        className="hero-workspace-logo"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="hero-workspace-initials" aria-hidden>{workspaceInits}</span>
                    )}
                  </div>
                  <div className="hero-workspace-name">{workspaceName}</div>
                  <div className="hero-workspace-meta">
                    <span className="hero-workspace-platform">on slabOS</span>
                    {workspaceShort ? (
                      <>
                        <span className="hero-workspace-sep" aria-hidden>·</span>
                        <code
                          className="hero-workspace-id"
                          title={`Organization ID: ${displayOrg}`}
                        >
                          {workspaceShort}
                        </code>
                      </>
                    ) : null}
                  </div>
                </aside>
              </div>
              <div className="hero-aurora" aria-hidden />
            </section>

            {loadError ? (
              <div className="banner banner-error" role="alert">
                <strong>Could not load your tools.</strong>
                <span style={{ display: "block", marginTop: 4 }}>{loadError}</span>
                <button
                  type="button"
                  className="btn btn-quiet"
                  style={{ marginTop: 10 }}
                  onClick={() => void reloadAccess()}
                  disabled={refreshBusy || loadingData}
                >
                  {refreshBusy ? "Retrying…" : "Retry"}
                </button>
              </div>
            ) : null}

            {headsPayload?.inactive ? (
              <div className="banner banner-warn" role="alert">
                <strong>This account is inactive.</strong>
                <span style={{ display: "block", marginTop: 4 }}>
                  You can sign in, but tools are read-only until an admin re-enables access.
                </span>
              </div>
            ) : null}

            {loadingData && !headsPayload ? (
              <div className="card-grid card-grid-available" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="head-card head-card-available skeleton-card">
                    <div className="skel skel-icon" />
                    <div className="skel skel-title" />
                    <div className="skel skel-line" />
                    <div className="skel skel-line skel-line-short" />
                    <div className="skel skel-btn" />
                  </div>
                ))}
              </div>
            ) : null}

            {assignableHeads.length === 0 && headsPayload && !loadingData ? (
              <div className="empty-box launcher-empty" role="status">
                {isAdminLike ? (
                  <>
                    <p className="empty-title">No tools are assigned yet.</p>
                    <p className="empty-sub">Open System Admin to assign tool access to this account.</p>
                  </>
                ) : (
                  <>
                    <p className="empty-title">No tools assigned yet.</p>
                    <p className="empty-sub">Ask your eliteOS administrator for the tools you need.</p>
                  </>
                )}
              </div>
            ) : null}

            {grouped.map(({ section, items }) => {
              if (!items.length) return null;
              const roadmapSection = section === "Coming Soon Tools";
              return (
                <section
                  key={section}
                  className={`launcher-section${roadmapSection ? " launcher-section-roadmap" : " launcher-section-available"}`}
                  aria-label={section}
                >
                  <div className="section-head">
                    <h2 className="section-title">{section}</h2>
                    <span className="section-count">{items.length}</span>
                  </div>
                  {roadmapSection ? (
                    <p className="section-lede">
                      Planned tools live here until a production launch link is configured on the Brain.
                    </p>
                  ) : (
                    <p className="section-lede">
                      Production tools you can open when assigned. Each destination still enforces Brain permissions.
                    </p>
                  )}
                  <div className={roadmapSection ? "card-grid card-grid-roadmap" : "card-grid card-grid-available"}>
                    {items.map((h) => {
                      const url = pickLaunchUrl(h);
                      const canNavigate = Boolean(h.enabled && url && !roadmapSection);
                      const inactiveClass = !canNavigate ? " is-muted" : "";
                      const pills = resolveCardBadges(h, roadmapSection);
                      const cardTitle = launcherCardTitle(h);
                      const showUrl = shouldShowUrlOnCard(url);
                      const openLabel = h.slug === "public_quote" ? "Open public site" : "Open tool";
                      const tint = headTintFor(h.slug);

                      function openHead() {
                        if (!canNavigate || !url) return;
                        window.open(url, "_blank", "noopener,noreferrer");
                      }

                      return (
                        <article
                          key={h.slug}
                          className={`head-card${roadmapSection ? " head-card-roadmap" : " head-card-available"}${inactiveClass} tint-${tint}`}
                        >
                          <div className="head-card-top">
                            <span className={`head-glyph head-glyph-${tint}`} aria-hidden>
                              <HeadGlyph slug={h.slug} />
                            </span>
                            <div className="pill-row" aria-label="Status">
                              {pills.map((t, pi) => (
                                <span key={`${h.slug}-${pi}-${t}`} className={pillClass(t)}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                          <h3 className="head-card-title">{cardTitle}</h3>
                          <p className={roadmapSection ? "desc desc-roadmap" : "desc"}>{h.description}</p>
                          {showUrl && url ? (
                            <p className="url-subtle" title={url}>
                              {url}
                            </p>
                          ) : null}
                          {canNavigate ? (
                            <button type="button" className="btn btn-open head-open-btn" onClick={openHead}>
                              <span>{openLabel}</span>
                              <ArrowOut />
                            </button>
                          ) : null}
                          {!canNavigate && !roadmapSection ? (
                            <p className="card-foot muted-note">
                              {url ? "Ask your admin for access to open this tool." : null}
                            </p>
                          ) : null}
                          {roadmapSection ? (
                            <p className="card-foot muted-note">On the roadmap — not available to open yet.</p>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <details className="access-details" aria-label="Access details">
              <summary className="access-details-summary">Access details</summary>
              <div className="access-details-body">
                <p className="muted-note access-note">{SECURITY_NOTE}</p>
                {displayOrg ? (
                  <p className="access-meta">
                    <span className="access-meta-label">Organization</span>
                    <code className="access-meta-value">{displayOrg}</code>
                  </p>
                ) : null}
                {showTechnicalDetails && headsPayload?.heads?.length ? (
                  <div className="tech-details">
                    <div className="tech-details-caption">Technical reference (internal slug → launch URL)</div>
                    <ul className="tech-details-list">
                      {headsPayload.heads.map((h) => (
                        <li key={`tech-${h.slug}`}>
                          <div className="tech-tool-line">
                            <span className="tech-tool-label">{launcherCardTitle(h)}</span>
                            <code className="tech-slug">{h.slug}</code>
                            {h.slug === "quote" ?
                              <span className="tech-gloss"> Internal Estimate access key</span>
                            : null}
                          </div>
                          <span className="tech-url">{pickLaunchUrl(h) ?? "—"}</span>
                          {h.role_note ?
                            <span className="tech-role-note">{h.role_note}</span>
                          : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>
          </>
        )}
      </main>

      <footer className="footer-bar" role="contentinfo">
        <div className="footer-line footer-brand">eliteOS · Elite Stone Fabrication</div>
        <div className="footer-line footer-tagline">Keep the Titans running well.</div>
      </footer>
    </div>
  );
}
