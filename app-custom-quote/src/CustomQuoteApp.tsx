import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPostJson, ApiError } from "@quote-lib/api";
import { config, EOS_LOGO_URL } from "@quote-lib/config";
import {
  createEstimatorRoom,
  serializeRoomDraftsForInternalUi,
  serializeRoomsForApi
} from "@quote-lib/prototypeQuoteMath";
import type { RoomDraft } from "@quote-lib/quoteTypes";
import RoomScopeBuilder from "@quote-ui/RoomScopeBuilder";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import VisualLayoutCanvas, {
  visualCanvasSummaryStats,
  visualLayoutKeysForRooms,
  type VisualLayoutEntry
} from "../../app-internal-estimate/src/VisualLayoutCanvas";
import { resolveAccessToken } from "../../app-internal-estimate/src/lib/authSession";
import {
  customQuoteProjectSqftFromRooms,
  customQuoteScopeSummary,
  sumCustomQuoteAddonCosts
} from "./lib/customQuoteScope";
import { getSupabase } from "./lib/supabase";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const DEFAULT_WORKSPACE_SHORT = "ESF";
const OFF_PROGRAM_GROUP = "Off-program";

const MATERIAL_TYPES = ["quartz", "granite", "marble", "quartzite", "porcelain"] as const;

const FABRICATION_DEFAULT_HINT: Record<string, number> = {
  quartz: 22,
  granite: 32,
  marble: 38,
  quartzite: 38,
  porcelain: 38
};

const INTERNAL_SALES_REPS = ["Casey", "Thera", "MJ", "House", "Direct"] as const;
const INTERNAL_BRANCHES = ["Dyersville", "Iowa City", "Lisbon"] as const;

const WORKFLOW_SECTIONS = [
  { id: "sec-job", label: "Job Info" },
  { id: "sec-material", label: "Custom Material / Slab Cost Variables" },
  { id: "sec-rooms", label: "Rooms / Areas" },
  { id: "sec-visual", label: "Visual layout" },
  { id: "sec-addons", label: "Add-ons & Custom Items" },
  { id: "sec-review", label: "Review" },
  { id: "sec-save", label: "Save" }
] as const;

const CUSTOM_LINE_CATEGORIES = [
  "Sink",
  "Faucet",
  "Plumbing fixture",
  "Accessory",
  "Labor",
  "Fee",
  "Discount/Credit",
  "Other"
] as const;

type CustomLineRow = {
  id: string;
  name: string;
  description: string;
  category: (typeof CUSTOM_LINE_CATEGORIES)[number];
  qty: string;
  unitPrice: string;
  customerFacing: boolean;
  internalNote: string;
  roomName: string;
  roomId: string;
};

const CUSTOM_LINE_PRESETS: Array<{
  key: string;
  name: string;
  description: string;
  category: CustomLineRow["category"];
  unitPrice: string;
}> = [
  { key: "trip", name: "Trip Charge", description: "Travel / trip", category: "Fee", unitPrice: "75" },
  { key: "labor", name: "Labor / Install Fee", description: "Install or labor line", category: "Labor", unitPrice: "0" },
  { key: "mat", name: "Additional Material Cost", description: "Extra material allowance", category: "Other", unitPrice: "0" },
  { key: "disc", name: "Discount / Credit", description: "", category: "Discount/Credit", unitPrice: "100" },
  { key: "other", name: "Other", description: "Miscellaneous", category: "Other", unitPrice: "0" }
];

function newRowId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2, 11)}`;
}

type MaterialForm = {
  colorName: string;
  materialType: string;
  supplierName: string;
  slabWidth: string;
  slabHeight: string;
  slabSqft: string;
  slabQuantity: string;
  costPerSqft: string;
  costPerSlab: string;
  freightCostToEsf: string;
  pricingMode: "retail" | "wholesale";
};

type JobForm = {
  accountName: string;
  accountPhone: string;
  accountEmail: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  projectName: string;
  projectAddress: string;
  city: string;
  state: string;
  zip: string;
  branch: string;
  salesRep: string;
  enteredBy: string;
  projectType: string;
  notes: string;
};

type CalcResult = Record<string, unknown>;

function homeLauncherUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_HOME ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}

function quoteLibraryUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_QUOTE_LIBRARY ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://quotes.eliteosfab.com";
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
  if (e) {
    const local = e.includes("@") ? e.split("@")[0] : e;
    const parts = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }
  return "ES";
}

function money(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function pct(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

const INITIAL_JOB: JobForm = {
  accountName: "",
  accountPhone: "",
  accountEmail: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  projectName: "",
  projectAddress: "",
  city: "",
  state: "",
  zip: "",
  branch: INTERNAL_BRANCHES[0],
  salesRep: "",
  enteredBy: "",
  projectType: "New construction",
  notes: ""
};

const INITIAL_MATERIAL: MaterialForm = {
  colorName: "",
  materialType: "quartz",
  supplierName: "",
  slabWidth: "",
  slabHeight: "",
  slabSqft: "",
  slabQuantity: "1",
  costPerSqft: "",
  costPerSlab: "",
  freightCostToEsf: "0",
  pricingMode: "retail"
};

export default function CustomQuoteApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [job, setJob] = useState<JobForm>(INITIAL_JOB);
  const [material, setMaterial] = useState<MaterialForm>(INITIAL_MATERIAL);
  const [roomDrafts, setRoomDrafts] = useState<RoomDraft[]>(() => [createEstimatorRoom(OFF_PROGRAM_GROUP)]);
  const [customLineRows, setCustomLineRows] = useState<CustomLineRow[]>([]);
  const [visualLayoutByPieceKey, setVisualLayoutByPieceKey] = useState<Record<string, VisualLayoutEntry>>({});
  const [visualCanvasExpanded, setVisualCanvasExpanded] = useState(false);
  const [calc, setCalc] = useState<CalcResult | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [backendCalcOk, setBackendCalcOk] = useState<boolean | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [err, setErr] = useState("");
  const [submitMsg, setSubmitMsg] = useState("");
  const [lastSavedQuoteId, setLastSavedQuoteId] = useState("");
  const [lastSavedQuoteNumber, setLastSavedQuoteNumber] = useState("");
  const [activeWorkflowSectionId, setActiveWorkflowSectionId] = useState<string | null>("sec-job");
  const enteredBySeeded = useRef(false);

  const scopeSummary = useMemo(
    () => customQuoteScopeSummary(roomDrafts, job.projectType),
    [roomDrafts, job.projectType]
  );

  const addonCosts = useMemo(() => sumCustomQuoteAddonCosts(customLineRows), [customLineRows]);

  const visualCanvasSummary = useMemo(() => visualCanvasSummaryStats(roomDrafts), [roomDrafts]);

  const patchJob = useCallback((key: keyof JobForm, value: string) => {
    setJob((f) => ({ ...f, [key]: value }));
    invalidateCalc();
  }, []);

  const patchMaterial = useCallback((key: keyof MaterialForm, value: string) => {
    setMaterial((f) => ({ ...f, [key]: value }));
    invalidateCalc();
  }, []);

  function invalidateCalc() {
    setCalc(null);
    setBackendCalcOk(null);
    setErr("");
    setSubmitMsg("");
  }

  const buildPayload = useCallback(() => {
    const projectSqft = customQuoteProjectSqftFromRooms(roomDrafts, job.projectType);
    const customLineItems = customLineRows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        category: r.category,
        qty: r.qty,
        unitPrice: r.unitPrice,
        customerFacing: r.customerFacing,
        roomId: r.roomId,
        roomName: r.roomName
      }));

    return {
      customer_name: job.customerName.trim() || job.accountName.trim() || null,
      project_name: job.projectName.trim() || null,
      project_address: job.projectAddress.trim() || null,
      city: job.city.trim() || null,
      state: job.state.trim() || null,
      zip: job.zip.trim() || null,
      sales_rep: job.salesRep.trim() || null,
      branch: job.branch.trim() || null,
      prepared_by: job.enteredBy.trim() || null,
      notes: job.notes.trim() || null,
      project_type: job.projectType.trim() || null,
      colorName: material.colorName.trim(),
      materialType: material.materialType,
      supplierName: material.supplierName.trim(),
      slabWidth: material.slabWidth ? Number(material.slabWidth) : undefined,
      slabHeight: material.slabHeight ? Number(material.slabHeight) : undefined,
      slabSqft: material.slabSqft ? Number(material.slabSqft) : undefined,
      slabQuantity: Number(material.slabQuantity) || 1,
      costPerSqft: material.costPerSqft ? Number(material.costPerSqft) : undefined,
      costPerSlab: material.costPerSlab ? Number(material.costPerSlab) : undefined,
      freightCostToEsf: Number(material.freightCostToEsf) || 0,
      projectSqft: projectSqft > 0 ? projectSqft : undefined,
      installCost: addonCosts.installCost,
      otherCostBasis: addonCosts.otherCostBasis,
      pricingMode: material.pricingMode,
      rooms: serializeRoomsForApi(roomDrafts),
      estimateRoomDrafts: serializeRoomDraftsForInternalUi(roomDrafts),
      customLineItems,
      job_info: {
        account: job.accountName.trim() || null,
        account_contact_phone: job.accountPhone.trim() || null,
        account_contact_email: job.accountEmail.trim() || null
      },
      scope_summary: scopeSummary
    };
  }, [job, material, roomDrafts, customLineRows, addonCosts, scopeSummary]);

  useEffect(() => {
    if (!supabase) {
      setAuthBusy(false);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSessionToken(data.session?.access_token ?? null);
      const u = data.session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
      if (!enteredBySeeded.current && u?.email) {
        enteredBySeeded.current = true;
        setJob((f) => ({ ...f, enteredBy: deriveDisplayNameFromEmail(u.email ?? "") }));
      }
      setAuthBusy(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      if (!alive) return;
      setSessionToken(session?.access_token ?? null);
      const u = session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    (async () => {
      try {
        const base = config.backendBaseUrl.replace(/\/+$/, "");
        const res = (await fetch(`${base}/api/me/heads`, {
          headers: { authorization: `Bearer ${sessionToken}` }
        }).then((r) => r.json())) as { heads?: { slug: string; enabled?: boolean }[] };
        if (cancelled) return;
        setAccessDenied(!res.heads?.some((h) => h.slug === "custom_quote" && h.enabled !== false));
      } catch {
        if (!cancelled) setAccessDenied(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    const ids = WORKFLOW_SECTIONS.map((s) => s.id);
    const targets = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!targets.length) return;
    const visibility = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set((entry.target as HTMLElement).id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        ids.forEach((id) => {
          const ratio = visibility.get(id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        });
        if (bestId) setActiveWorkflowSectionId(bestId);
      },
      { rootMargin: "-35% 0px -50% 0px", threshold: [0.05, 0.25, 0.5, 0.75, 1] }
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sessionToken, accessDenied]);

  useEffect(() => {
    const valid = visualLayoutKeysForRooms(roomDrafts);
    setVisualLayoutByPieceKey((prev) => {
      const next: Record<string, VisualLayoutEntry> = {};
      for (const k of valid) {
        if (prev[k]) next[k] = prev[k];
      }
      return next;
    });
    invalidateCalc();
  }, [roomDrafts]);

  const scrollToWorkflowSection = useCallback((id: string) => {
    if (id === "sec-visual") setVisualCanvasExpanded(true);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const runCalculate = useCallback(async () => {
    if (!supabase) return;
    const tok = await resolveAccessToken(supabase);
    if (!tok) return;
    setCalcBusy(true);
    setErr("");
    setSubmitMsg("");
    try {
      const result = (await apiPostJson("/api/custom-quotes/calculate", tok, buildPayload())) as CalcResult;
      setCalc(result);
      setBackendCalcOk(true);
      setSessionToken(tok);
    } catch (e) {
      setCalc(null);
      setBackendCalcOk(false);
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setCalcBusy(false);
    }
  }, [supabase, buildPayload]);

  const runSave = useCallback(async () => {
    if (!supabase || !calc) return;
    const tok = await resolveAccessToken(supabase);
    if (!tok) return;
    setSaveBusy(true);
    setErr("");
    setSubmitMsg("");
    try {
      const result = (await apiPostJson("/api/custom-quotes/save", tok, buildPayload())) as Record<string, unknown>;
      setLastSavedQuoteNumber(String(result.quote_number ?? ""));
      setLastSavedQuoteId(String(result.quote_id ?? ""));
      setSubmitMsg(`Saved ${String(result.quote_number ?? "quote")} to Quote Library.`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
  }, [supabase, calc, buildPayload]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Sign-in is not configured.");
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword
      });
      if (error) throw error;
      if (!data.session?.access_token) throw new Error("No access token returned");
      setSessionToken(data.session.access_token);
      setBackendCalcOk(null);
      setAuthPassword("");
    } catch (e: unknown) {
      setAuthError(String((e as Error)?.message || e));
    } finally {
      setAuthBusy(false);
    }
  }, [authEmail, authPassword, supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSessionToken(null);
    setCalc(null);
    setBackendCalcOk(null);
  }, [supabase]);

  const userDisplayName = useMemo(
    () => userMetaName || deriveDisplayNameFromEmail(userEmail) || "Signed in",
    [userMetaName, userEmail]
  );

  const menuItems: EliteosTopbarMenuItem[] = useMemo(
    () => [
      { label: "Open Home", meta: "eliteOS Launcher", href: homeLauncherUrl() },
      { label: "Quote Library", meta: "All quotes", href: quoteLibraryUrl() }
    ],
    []
  );

  const fabDefaultHint = FABRICATION_DEFAULT_HINT[material.materialType] ?? 22;
  const appliedFabRate =
    calc?.pricingInputsSnapshot && typeof calc.pricingInputsSnapshot === "object"
      ? Number((calc.pricingInputsSnapshot as Record<string, unknown>).fabricationRatePerSqft)
      : NaN;
  const fabDisplay = Number.isFinite(appliedFabRate) ? appliedFabRate : fabDefaultHint;

  const warnings = Array.isArray(calc?.warnings) ? (calc.warnings as string[]) : [];
  const sellPrice = calc?.sellPrice != null ? Number(calc.sellPrice) : null;
  const saveDisabled = saveBusy || calcBusy || !calc || backendCalcOk !== true;

  if (authBusy) {
    return (
      <div className="shell page-internal-estimate">
        <main className="page ie-main muted">Loading session…</main>
      </div>
    );
  }

  return (
    <div className={`shell page-internal-estimate${sessionToken ? " ie-shell-signed-in" : " ie-shell-preview"}`}>
      <div className="ie-no-print">
        {sessionToken ? (
          <EliteosTopbar
            appName="Custom Quote"
            organizationName={DEFAULT_WORKSPACE_NAME}
            logoSrc={EOS_LOGO_URL}
            homeHref={homeLauncherUrl()}
            userName={userDisplayName}
            userEmail={userEmail}
            userSubtitle="Staff · ESF only"
            initials={userInitialsFor(userDisplayName, userEmail)}
            menuItems={menuItems}
            onSignOut={() => void signOut()}
          />
        ) : (
          <EliteosTopbar
            appName="Custom Quote"
            organizationName={DEFAULT_WORKSPACE_NAME}
            logoSrc={EOS_LOGO_URL}
            homeHref={homeLauncherUrl()}
          />
        )}

        <div className="ie-shell-body">
          <section className="ie-hero" aria-labelledby="cq-hero-title">
            <div className="ie-hero-aurora" aria-hidden />
            <div className="ie-hero-grid">
              <div className="ie-hero-main">
                <div className="ie-hero-eyebrow-row">
                  <p className="ie-hero-eyebrow">Internal tool · Custom Quote · Off-program material</p>
                  {sessionToken ? (
                    <span
                      className={`ie-hero-live${calcBusy ? " is-busy" : backendCalcOk ? " is-confirmed" : " is-preview"}`}
                      aria-live="polite"
                    >
                      <span className="ie-hero-live-dot" aria-hidden />
                      <span>{calcBusy ? "Calculating…" : backendCalcOk ? "Backend confirmed" : "Live preview"}</span>
                    </span>
                  ) : null}
                </div>
                <h1 id="cq-hero-title" className="ie-hero-title">
                  Custom quote <span className="ie-hero-title-accent">workspace</span>
                </h1>
                <p className="ie-hero-sub">
                  Same estimator workflow as Internal Estimate — rooms, layout verification, and custom lines — with
                  off-program slab cost variables and markup/uplift pricing. Saves to Quote Library as{" "}
                  <strong>custom_quote</strong>.
                </p>
                <dl className="ie-hero-stats" aria-label="Live quote context">
                  <div className="ie-hero-stat">
                    <dt>Rooms</dt>
                    <dd>{roomDrafts.length}</dd>
                  </div>
                  <div className="ie-hero-stat">
                    <dt>Fab sf</dt>
                    <dd>{scopeSummary.projectSqft > 0 ? scopeSummary.projectSqft.toFixed(1) : "—"}</dd>
                  </div>
                  <div className="ie-hero-stat">
                    <dt>Basis</dt>
                    <dd>{material.pricingMode === "wholesale" ? "Wholesale +15%" : "Retail +25%"}</dd>
                  </div>
                  <div className="ie-hero-stat">
                    <dt>Branch</dt>
                    <dd>{job.branch || "—"}</dd>
                  </div>
                  <div className="ie-hero-stat ie-hero-stat-mode">
                    <dt>Sell price</dt>
                    <dd>{sellPrice != null ? money(sellPrice) : "—"}</dd>
                  </div>
                </dl>
              </div>
              <aside className="hero-workspace" aria-label={`Workspace · ${DEFAULT_WORKSPACE_NAME}`}>
                <p className="hero-workspace-eyebrow">Workspace</p>
                <div className="hero-workspace-card">
                  <div className="hero-workspace-mark">
                    <img src={EOS_LOGO_URL} alt="" loading="lazy" />
                  </div>
                  <div className="hero-workspace-text">
                    <p className="hero-workspace-name">{DEFAULT_WORKSPACE_NAME}</p>
                    <p className="hero-workspace-meta">
                      <span>on </span>
                      <span className="hero-workspace-platform">slabOS</span>
                      <span className="hero-workspace-sep" aria-hidden>
                        ·
                      </span>
                      <span>{DEFAULT_WORKSPACE_SHORT}</span>
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          {accessDenied ? (
            <div className="warn-box" role="alert" style={{ margin: "0 16px 16px" }}>
              <strong>Access denied.</strong> Grant <code>custom_quote</code> head access. Not available to dealers or
              partners.
            </div>
          ) : null}

          <div className="ie-app-shell">
            <nav className="ie-rail" aria-label="Custom quote workflow">
              <p className="ie-rail-title" aria-hidden>
                Workflow
              </p>
              {WORKFLOW_SECTIONS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={`ie-rail-link${activeWorkflowSectionId === s.id ? " is-active" : ""}`}
                  aria-current={activeWorkflowSectionId === s.id ? "true" : undefined}
                  onClick={() => scrollToWorkflowSection(s.id)}
                >
                  <span className="ie-rail-link-num" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="ie-rail-link-label">{s.label}</span>
                </button>
              ))}
            </nav>

            <main className="ie-main">
              {supabase && !sessionToken ? (
                <div className="card ie-signin-row" role="region" aria-labelledby="cq-signin-title">
                  <p className="ie-signin-eyebrow">Preview · Sign in to save, calculate, or print</p>
                  <h2 id="cq-signin-title" className="ie-signin-title">
                    Sign in with your <span className="ie-signin-title-accent">eliteOS</span> account
                  </h2>
                  <p className="ie-signin-sub">Calculate and Save require an authenticated ESF session.</p>
                  <div className="ie-signin-fields">
                    <label>
                      Email
                      <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoComplete="username" />
                    </label>
                    <label>
                      Password
                      <input
                        type="password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                    </label>
                    <button type="button" className="btn primary ie-signin-submit" disabled={authBusy} onClick={() => void signIn()}>
                      {authBusy ? "Signing in…" : "Sign in"}
                    </button>
                  </div>
                  {authError ? (
                    <p className="ie-note-quiet ie-note-error" role="alert">
                      <span className="ie-note-quiet-dot" aria-hidden />
                      {authError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {sessionToken ? (
                <div
                  className={`ie-live-strip${backendCalcOk === true ? " is-confirmed" : backendCalcOk === false ? " is-warn" : " is-preview"}`}
                  role="status"
                  aria-live="polite"
                >
                  <span className="ie-live-strip-dot" aria-hidden />
                  <span className="ie-live-strip-label">
                    {backendCalcOk === true ? "Backend connected" : backendCalcOk === false ? "Calculate failed" : "Live preview"}
                  </span>
                  <span className="ie-live-strip-copy">
                    Room sq ft drives fabrication quantity. Custom material variables drive slab/freight cost — not Elite
                    100 tier $/sf.
                  </span>
                </div>
              ) : null}

              {err ? (
                <div className="warn-box" role="alert">
                  <strong>Error</strong>
                  <p style={{ margin: "6px 0 0" }}>{err}</p>
                </div>
              ) : null}

              {/* 1 Job Info */}
              <section id="sec-job" className="card">
                <div className="ie-section-head">
                  <h2 className="ie-section-title">Job Info</h2>
                  <p className="ie-section-meta">
                    Account &amp; customer contact · Project location · Sales team · Quote settings
                  </p>
                </div>
                <div className="ie-job-groups">
                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Account</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Account
                        <input value={job.accountName} onChange={(e) => patchJob("accountName", e.target.value)} placeholder="Account Name" />
                      </label>
                      <label>
                        Account contact phone
                        <input value={job.accountPhone} onChange={(e) => patchJob("accountPhone", e.target.value)} placeholder="Phone" />
                      </label>
                      <label>
                        Account contact email
                        <input value={job.accountEmail} onChange={(e) => patchJob("accountEmail", e.target.value)} placeholder="Email" />
                      </label>
                    </div>
                  </div>
                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Customer</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Customer
                        <input value={job.customerName} onChange={(e) => patchJob("customerName", e.target.value)} placeholder="Customer or site" />
                      </label>
                      <label>
                        Customer phone
                        <input value={job.customerPhone} onChange={(e) => patchJob("customerPhone", e.target.value)} placeholder="Phone" />
                      </label>
                      <label>
                        Customer email
                        <input value={job.customerEmail} onChange={(e) => patchJob("customerEmail", e.target.value)} placeholder="Email" />
                      </label>
                    </div>
                  </div>
                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Project</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Elite job name
                        <input value={job.projectName} onChange={(e) => patchJob("projectName", e.target.value)} placeholder="Job name" />
                      </label>
                      <label>
                        Project address
                        <input value={job.projectAddress} onChange={(e) => patchJob("projectAddress", e.target.value)} placeholder="Street address" />
                      </label>
                      <label>
                        City
                        <input value={job.city} onChange={(e) => patchJob("city", e.target.value)} placeholder="City" />
                      </label>
                      <label>
                        State
                        <input value={job.state} onChange={(e) => patchJob("state", e.target.value)} placeholder="IA" />
                      </label>
                      <label>
                        ZIP
                        <input value={job.zip} onChange={(e) => patchJob("zip", e.target.value)} placeholder="ZIP" />
                      </label>
                      <label>
                        Project type
                        <input value={job.projectType} onChange={(e) => patchJob("projectType", e.target.value)} />
                      </label>
                    </div>
                  </div>
                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Sales &amp; quote settings</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Branch
                        <select value={job.branch} onChange={(e) => patchJob("branch", e.target.value)}>
                          {INTERNAL_BRANCHES.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="ie-label-text">
                          Salesperson <span className="req-star" aria-label="required">*</span>
                        </span>
                        <select value={job.salesRep} onChange={(e) => patchJob("salesRep", e.target.value)}>
                          <option value="">— Select —</option>
                          {INTERNAL_SALES_REPS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Entered by
                        <input value={job.enteredBy} onChange={(e) => patchJob("enteredBy", e.target.value)} placeholder="Defaults from sign-in" />
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2 Custom Material — directly under Job Info */}
              <section id="sec-material" className="card">
                <div className="ie-section-head">
                  <h2 className="ie-section-title">Custom Material / Slab Cost Variables</h2>
                  <p className="ie-section-meta">
                    Off-program slab pricing · Freight · Fabrication defaults · Retail/Wholesale uplift on total cost basis
                  </p>
                </div>
                <p className="ie-note-quiet" role="note">
                  <span className="ie-note-quiet-dot" aria-hidden />
                  Sell price = total cost basis × (1 + uplift). Retail +25% · Wholesale +15%. Not gross-margin inversion.
                </p>
                <div className="ie-job-groups" style={{ marginTop: 16 }}>
                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Material &amp; supplier</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Color name
                        <input value={material.colorName} onChange={(e) => patchMaterial("colorName", e.target.value)} />
                      </label>
                      <label>
                        Material type
                        <select value={material.materialType} onChange={(e) => patchMaterial("materialType", e.target.value)}>
                          {MATERIAL_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Supplier name
                        <input value={material.supplierName} onChange={(e) => patchMaterial("supplierName", e.target.value)} />
                      </label>
                    </div>
                  </div>
                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Slab size &amp; cost</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Slab width (in)
                        <input type="number" min={0} value={material.slabWidth} onChange={(e) => patchMaterial("slabWidth", e.target.value)} />
                      </label>
                      <label>
                        Slab height (in)
                        <input type="number" min={0} value={material.slabHeight} onChange={(e) => patchMaterial("slabHeight", e.target.value)} />
                      </label>
                      <label>
                        Slab sq ft override
                        <input type="number" min={0} step={0.01} value={material.slabSqft} onChange={(e) => patchMaterial("slabSqft", e.target.value)} />
                      </label>
                      <label>
                        Slab quantity
                        <input type="number" min={1} value={material.slabQuantity} onChange={(e) => patchMaterial("slabQuantity", e.target.value)} />
                      </label>
                      <label>
                        Cost per sq ft
                        <input type="number" min={0} step={0.01} value={material.costPerSqft} onChange={(e) => patchMaterial("costPerSqft", e.target.value)} />
                      </label>
                      <label>
                        Cost per slab
                        <input type="number" min={0} step={0.01} value={material.costPerSlab} onChange={(e) => patchMaterial("costPerSlab", e.target.value)} />
                      </label>
                    </div>
                  </div>
                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Freight, fabrication &amp; pricing mode</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Freight cost to ESF ($)
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={material.freightCostToEsf}
                          onChange={(e) => patchMaterial("freightCostToEsf", e.target.value)}
                        />
                      </label>
                      <label>
                        Fabrication / shop rate ($/sf)
                        <input readOnly className="cq-readonly-default" value={`$${fabDisplay.toFixed(2)} / sf`} aria-readonly="true" />
                        <span className="cq-fab-rate-hint">
                          {backendCalcOk ? (
                            <>Backend applied: <strong>${fabDisplay.toFixed(2)}/sf</strong></>
                          ) : (
                            <>
                              Default for {material.materialType}: <strong>${fabDefaultHint.toFixed(2)}/sf</strong> — confirmed at Calculate
                            </>
                          )}
                        </span>
                      </label>
                      <label>
                        Pricing mode
                        <div className="ie-pricing-toggle" role="group" aria-label="Pricing mode" style={{ marginTop: 6 }}>
                          <button
                            type="button"
                            className={material.pricingMode === "wholesale" ? "on" : ""}
                            onClick={() => patchMaterial("pricingMode", "wholesale")}
                          >
                            Wholesale (+15%)
                          </button>
                          <button
                            type="button"
                            className={material.pricingMode === "retail" ? "on" : ""}
                            onClick={() => patchMaterial("pricingMode", "retail")}
                          >
                            Retail (+25%)
                          </button>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              {/* 3 Rooms / Areas — IE RoomScopeBuilder */}
              <section id="sec-rooms" className="card">
                <div className="ie-section-head">
                  <h2 className="ie-section-title">Rooms / Areas</h2>
                  <p className="ie-section-meta">
                    Guided shapes or manual sq ft · Measurement drives fabrication sf — material $ comes from Custom Material
                    card, not Elite 100 tiers
                  </p>
                </div>
                <p className="ie-note-quiet" role="note">
                  <span className="ie-note-quiet-dot" aria-hidden />
                  Fabrication quantity: <strong>{scopeSummary.projectSqft.toFixed(2)} sf</strong> (chargeable counter{" "}
                  {scopeSummary.chargeableCounterSqft.toFixed(2)} + splash/FHB {scopeSummary.backsplashFhbSqft.toFixed(2)}).
                  Per-room Elite add-on $ is not included in custom quote cost basis — use Add-ons &amp; Custom Items below.
                </p>
                <RoomScopeBuilder
                  rooms={roomDrafts}
                  onRoomsChange={setRoomDrafts}
                  materialGroups={[OFF_PROGRAM_GROUP]}
                  hideRapidLinear
                  enableDestructiveGuards
                />
              </section>

              {/* 4 Visual layout */}
              <section id="sec-visual" className="card ie-visual-section">
                <div className="ie-visual-summary-row">
                  <div className="ie-visual-summary-text">
                    <div className="ie-section-head ie-section-head-tight">
                      <h2 className="ie-section-title ie-visual-heading">Visual layout verification</h2>
                      <p className="ie-section-meta">
                        Drag-and-rotate verification board · does not change Calculate, Save, or custom quote totals
                      </p>
                    </div>
                    <p className="ie-visual-meta">
                      <span className="ie-visual-meta-chip">
                        <strong>{visualCanvasSummary.roomCount}</strong> room{visualCanvasSummary.roomCount === 1 ? "" : "s"}
                      </span>
                      <span className="ie-visual-meta-chip">
                        <strong>{visualCanvasSummary.pieceCount}</strong> piece{visualCanvasSummary.pieceCount === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                  <div className="ie-visual-summary-actions">
                    <button
                      type="button"
                      className="btn secondary btn-sm"
                      onClick={() => setVisualCanvasExpanded((v) => !v)}
                      aria-expanded={visualCanvasExpanded}
                    >
                      {visualCanvasExpanded ? "Collapse canvas" : "Open layout canvas"}
                    </button>
                  </div>
                </div>
                {visualCanvasExpanded ? (
                  <>
                    <p className="muted small ie-visual-expand-note">
                      Optional verification — layout does not affect custom quote pricing math.
                    </p>
                    <VisualLayoutCanvas
                      rooms={roomDrafts}
                      layoutByPieceKey={visualLayoutByPieceKey}
                      setLayoutByPieceKey={setVisualLayoutByPieceKey}
                      estimateColorTbd={false}
                    />
                  </>
                ) : null}
              </section>

              {/* 5 Add-ons & Custom Items */}
              <section id="sec-addons" className="card">
                <div className="ie-section-head">
                  <h2 className="ie-section-title">Add-ons &amp; Custom Items</h2>
                  <p className="ie-section-meta">
                    Structured passthrough lines · Labor/install → cost basis · Does not use Elite 100 tier material math
                  </p>
                </div>
                <p className="muted small ie-addons-cutout-hint">
                  Sink cutouts and room fixed add-ons in the room builder are not auto-priced here. Add install/labor/fees
                  as custom lines when needed.
                </p>
                <h3 className="h3">Structured custom line items</h3>
                <div className="ie-custom-line-presets" role="group" aria-label="Add custom line">
                  {CUSTOM_LINE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className="btn secondary ie-custom-line-preset-btn"
                      onClick={() =>
                        setCustomLineRows((prev) => [
                          ...prev,
                          {
                            id: newRowId(),
                            name: p.name,
                            description: p.description,
                            category: p.category,
                            qty: "1",
                            unitPrice: p.unitPrice,
                            customerFacing: false,
                            internalNote: "",
                            roomName: "",
                            roomId: ""
                          }
                        ])
                      }
                    >
                      + {p.name}
                    </button>
                  ))}
                </div>
                {customLineRows.map((row) => (
                  <div key={row.id} className="grid3" style={{ marginBottom: 10, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
                    <label>
                      Item name
                      <input
                        value={row.name}
                        onChange={(e) =>
                          setCustomLineRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, name: e.target.value } : x)))
                        }
                      />
                    </label>
                    <label>
                      Category
                      <select
                        value={row.category}
                        onChange={(e) => {
                          invalidateCalc();
                          setCustomLineRows((prev) =>
                            prev.map((x) =>
                              x.id === row.id ? { ...x, category: e.target.value as CustomLineRow["category"] } : x
                            )
                          );
                        }}
                      >
                        {CUSTOM_LINE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Qty
                      <input
                        value={row.qty}
                        onChange={(e) => {
                          invalidateCalc();
                          setCustomLineRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, qty: e.target.value } : x)));
                        }}
                      />
                    </label>
                    <label>
                      Unit price ($)
                      <input
                        value={row.unitPrice}
                        onChange={(e) => {
                          invalidateCalc();
                          setCustomLineRows((prev) =>
                            prev.map((x) => (x.id === row.id ? { ...x, unitPrice: e.target.value } : x))
                          );
                        }}
                      />
                    </label>
                    <label>
                      Room
                      <select
                        value={row.roomId}
                        onChange={(e) => {
                          invalidateCalc();
                          const roomId = e.target.value;
                          const linked = roomDrafts.find((rd) => rd.id === roomId);
                          setCustomLineRows((prev) =>
                            prev.map((x) =>
                              x.id === row.id
                                ? { ...x, roomId, roomName: linked?.name ?? "" }
                                : x
                            )
                          );
                        }}
                      >
                        <option value="">—</option>
                        {roomDrafts.map((rd) => (
                          <option key={rd.id} value={rd.id}>
                            {rd.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button
                        type="button"
                        className="btn secondary btn-sm"
                        onClick={() => {
                          invalidateCalc();
                          setCustomLineRows((prev) => prev.filter((x) => x.id !== row.id));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    setCustomLineRows((prev) => [
                      ...prev,
                      {
                        id: newRowId(),
                        name: "",
                        description: "",
                        category: "Other",
                        qty: "1",
                        unitPrice: "0",
                        customerFacing: false,
                        internalNote: "",
                        roomName: "",
                        roomId: ""
                      }
                    ])
                  }
                >
                  + Add custom line item
                </button>
                <p className="muted small" style={{ marginTop: 12 }}>
                  Install/labor lines: <strong>{money(addonCosts.installCost)}</strong> · Other cost basis:{" "}
                  <strong>{money(addonCosts.otherCostBasis)}</strong>
                </p>
              </section>

              <div className="ie-workflow-tail">
                {/* 6 Review */}
                <section id="sec-review" className="card">
                  <div className="ie-section-head">
                    <h2 className="ie-section-title">Review</h2>
                    <p className="ie-section-meta">Custom quote cost basis · Uplift · Utilization &amp; multiplier warnings</p>
                  </div>
                  {!calc ? (
                    <p className="muted">
                      Tap <strong>Calculate</strong> after Job Info, Custom Material, and Rooms / Areas are complete.
                    </p>
                  ) : (
                    <>
                      {warnings.length ? (
                        <div className="warn-box" style={{ marginBottom: 14 }}>
                          <strong>Review warnings</strong>
                          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                            {warnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="ok small">No utilization or multiplier warnings.</p>
                      )}
                      <table className="print-table">
                        <thead>
                          <tr>
                            <th>Line</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Material</td>
                            <td>{money(calc.materialCost)}</td>
                          </tr>
                          <tr>
                            <td>Freight to ESF</td>
                            <td>{money(calc.freightCost)}</td>
                          </tr>
                          <tr>
                            <td>Fabrication / shop ({scopeSummary.projectSqft.toFixed(2)} sf)</td>
                            <td>{money(calc.fabricationCost)}</td>
                          </tr>
                          {Number(calc.installCost) > 0 ? (
                            <tr>
                              <td>Install / labor</td>
                              <td>{money(calc.installCost)}</td>
                            </tr>
                          ) : null}
                          {Number(calc.otherCostBasis) > 0 ? (
                            <tr>
                              <td>Other cost basis</td>
                              <td>{money(calc.otherCostBasis)}</td>
                            </tr>
                          ) : null}
                          <tr>
                            <td>
                              <strong>Total cost basis</strong>
                            </td>
                            <td>
                              <strong>{money(calc.totalCostBasis)}</strong>
                            </td>
                          </tr>
                          <tr>
                            <td>Uplift ({pct(calc.pricingUpliftPercent)})</td>
                            <td>{String(calc.pricingMode)}</td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Sell price</strong>
                            </td>
                            <td>
                              <strong>{money(calc.sellPrice)}</strong>
                            </td>
                          </tr>
                          <tr>
                            <td>Utilization</td>
                            <td>{pct(calc.utilizationPercent)}</td>
                          </tr>
                          <tr>
                            <td>Multiplier</td>
                            <td>{Number(calc.multiplier).toFixed(2)}×</td>
                          </tr>
                          <tr>
                            <td>Actual gross margin (reporting)</td>
                            <td>{pct(calc.actualGrossMarginPercent)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </>
                  )}
                </section>

                {/* 7 Save */}
                <section id="sec-save" className="card">
                  <div className="ie-section-head">
                    <h2 className="ie-section-title">Save</h2>
                    <p className="ie-section-meta">Save to Quote Library · quote_source custom_quote · Create-only in v1</p>
                  </div>
                  {submitMsg ? (
                    <p className="ie-note-quiet ie-note-info" role="status">
                      <span className="ie-note-quiet-dot" aria-hidden />
                      {submitMsg}
                    </p>
                  ) : (
                    <p className="muted">Calculate first, then save. Update/revision, print, and email are not enabled for Custom Quote v1.</p>
                  )}
                  {lastSavedQuoteNumber ? (
                    <p style={{ marginTop: 12 }}>
                      <a
                        className="btn secondary"
                        href={
                          lastSavedQuoteId
                            ? `${quoteLibraryUrl()}/?quoteId=${encodeURIComponent(lastSavedQuoteId)}`
                            : quoteLibraryUrl()
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        View in Quote Library
                      </a>
                    </p>
                  ) : null}
                  <label style={{ display: "block", marginTop: 12 }}>
                    Internal notes
                    <textarea value={job.notes} onChange={(e) => patchJob("notes", e.target.value)} rows={3} />
                  </label>
                </section>
              </div>
            </main>

            {/* IE-style right summary */}
            <aside className="ie-aside side-col" aria-label="Custom quote summary">
              <div className="ie-aside-panel summary-card ie-summary-card-compact">
                <div className="ie-aside-scroll">
                  <div className="ie-summary-head">
                    <p className="ie-summary-eyebrow">Live quote panel</p>
                    <h2 className="ie-summary-title">Custom quote summary</h2>
                    <p className="ie-summary-mode-pill" data-mode={material.pricingMode}>
                      <span className="ie-summary-mode-dot" aria-hidden />
                      {material.pricingMode === "wholesale" ? "Wholesale +15%" : "Retail +25%"}
                    </p>
                  </div>
                  <div className="ie-summary-section ie-summary-hero">
                    <p className="ie-summary-kicker">Sell price · uplift on total cost</p>
                    <p className="ie-summary-compact-hero">{sellPrice != null ? money(sellPrice) : "—"}</p>
                    {backendCalcOk ? (
                      <p className="ie-summary-hero-sub is-confirmed">
                        <span className="ie-summary-hero-sub-dot" aria-hidden />
                        Last Calculate: <strong>{money(calc?.sellPrice)}</strong>
                      </p>
                    ) : (
                      <p className="ie-summary-hero-sub is-preview">
                        <span className="ie-summary-hero-sub-dot" aria-hidden />
                        Tap Calculate for backend-confirmed pricing.
                      </p>
                    )}
                  </div>
                  <div className="ie-summary-section">
                    <p className="ie-summary-section-head">Scope (from rooms)</p>
                    <div className="summary-rows ie-summary-rows-compact">
                      <div className="summary-row ie-summary-row-compact">
                        <span>Rooms</span>
                        <strong>{roomDrafts.length}</strong>
                      </div>
                      <div className="summary-row ie-summary-row-compact">
                        <span>Fab quantity sf</span>
                        <strong>{scopeSummary.projectSqft.toFixed(2)}</strong>
                      </div>
                      <div className="summary-row ie-summary-row-compact">
                        <span>Chargeable counter sf</span>
                        <strong>{scopeSummary.chargeableCounterSqft.toFixed(2)}</strong>
                      </div>
                      <div className="summary-row ie-summary-row-compact">
                        <span>Splash + FHB sf</span>
                        <strong>{scopeSummary.backsplashFhbSqft.toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                  {calc ? (
                    <div className="ie-summary-section">
                      <p className="ie-summary-section-head">Cost breakdown</p>
                      <div className="summary-rows ie-summary-rows-compact">
                        <div className="summary-row ie-summary-row-compact">
                          <span>Material</span>
                          <strong>{money(calc.materialCost)}</strong>
                        </div>
                        <div className="summary-row ie-summary-row-compact">
                          <span>Freight</span>
                          <strong>{money(calc.freightCost)}</strong>
                        </div>
                        <div className="summary-row ie-summary-row-compact">
                          <span>Fabrication</span>
                          <strong>{money(calc.fabricationCost)}</strong>
                        </div>
                        {Number(calc.installCost) > 0 ? (
                          <div className="summary-row ie-summary-row-compact">
                            <span>Install / labor</span>
                            <strong>{money(calc.installCost)}</strong>
                          </div>
                        ) : null}
                        {Number(calc.otherCostBasis) > 0 ? (
                          <div className="summary-row ie-summary-row-compact">
                            <span>Other</span>
                            <strong>{money(calc.otherCostBasis)}</strong>
                          </div>
                        ) : null}
                        <div className="summary-row ie-summary-row-compact">
                          <span>Cost basis</span>
                          <strong>{money(calc.totalCostBasis)}</strong>
                        </div>
                        <div className="summary-row ie-summary-row-compact">
                          <span>Uplift</span>
                          <strong>{pct(calc.pricingUpliftPercent)}</strong>
                        </div>
                        <div className="summary-row ie-summary-row-compact">
                          <span>Utilization</span>
                          <strong>{pct(calc.utilizationPercent)}</strong>
                        </div>
                        <div className="summary-row ie-summary-row-compact">
                          <span>Multiplier</span>
                          <strong>{Number(calc.multiplier).toFixed(2)}×</strong>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {warnings.length ? (
                    <div className="ie-summary-section">
                      <p className="ie-summary-section-head">Warnings</p>
                      <ul className="muted small" style={{ margin: 0, paddingLeft: 16 }}>
                        {warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* IE-style sticky actions — Calculate + Save only; Print/Email disabled v1 */}
        <nav className="ie-sticky-actions" aria-label="Pinned custom quote actions">
          <div className="ie-sticky-actions-inner">
            <div className="ie-sticky-status" aria-live="polite">
              <span
                className={`ie-sticky-status-pill${
                  calcBusy ? " is-busy" : backendCalcOk ? " is-confirmed" : sessionToken ? " is-preview" : " is-signed-out"
                }`}
              >
                <span className="ie-sticky-status-dot" aria-hidden />
                <span className="ie-sticky-status-label">
                  {calcBusy ? "Calculating…" : backendCalcOk ? "Backend confirmed" : sessionToken ? "Live preview" : "Sign in"}
                </span>
              </span>
              <span className="ie-sticky-status-total" aria-label="Sell price">
                {sellPrice != null ? money(sellPrice) : "—"}
              </span>
            </div>
            <div className="ie-sticky-actions-cluster">
              <button
                type="button"
                className="btn primary btn-sm"
                disabled={calcBusy || !sessionToken || accessDenied}
                onClick={() => void runCalculate()}
              >
                {calcBusy ? "Calculating…" : "Calculate"}
              </button>
              <button
                type="button"
                className="btn primary btn-sm"
                disabled={saveDisabled || accessDenied}
                title={!calc ? "Calculate first" : undefined}
                onClick={() => void runSave()}
              >
                {saveBusy ? "Saving…" : "Save quote"}
              </button>
            </div>
          </div>
          {submitMsg ? (
            <p className={`ie-sticky-save-msg${err ? " is-error" : " is-ok"}`} role="status">
              {submitMsg}
            </p>
          ) : null}
        </nav>
      </div>
    </div>
  );
}
