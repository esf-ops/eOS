import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiPostJson, ApiError } from "@quote-lib/api";
import { config, EOS_LOGO_URL } from "@quote-lib/config";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import { resolveAccessToken } from "../../app-internal-estimate/src/lib/authSession";
import { getSupabase } from "./lib/supabase";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const DEFAULT_WORKSPACE_SHORT = "ESF";

const MATERIAL_TYPES = ["quartz", "granite", "marble", "quartzite", "porcelain"] as const;

/** Display-only defaults — backend applies authoritative rates at Calculate. */
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
  { id: "sec-material", label: "Custom material" },
  { id: "sec-measure", label: "Areas / sq ft" },
  { id: "sec-review", label: "Review" },
  { id: "sec-save", label: "Save" }
] as const;

type CalcResult = Record<string, unknown>;

type FormState = {
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
  notes: string;
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
  projectSqft: string;
  installCost: string;
  otherCostBasis: string;
  pricingMode: "retail" | "wholesale";
};

const INITIAL_FORM: FormState = {
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
  notes: "",
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
  projectSqft: "",
  installCost: "",
  otherCostBasis: "",
  pricingMode: "retail"
};

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

function buildPayload(form: FormState): Record<string, unknown> {
  return {
    customer_name: form.customerName.trim() || form.accountName.trim() || null,
    project_name: form.projectName.trim() || null,
    project_address: form.projectAddress.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    zip: form.zip.trim() || null,
    sales_rep: form.salesRep.trim() || null,
    branch: form.branch.trim() || null,
    prepared_by: form.enteredBy.trim() || null,
    notes: form.notes.trim() || null,
    colorName: form.colorName.trim(),
    materialType: form.materialType,
    supplierName: form.supplierName.trim(),
    slabWidth: form.slabWidth ? Number(form.slabWidth) : undefined,
    slabHeight: form.slabHeight ? Number(form.slabHeight) : undefined,
    slabSqft: form.slabSqft ? Number(form.slabSqft) : undefined,
    slabQuantity: Number(form.slabQuantity) || 1,
    costPerSqft: form.costPerSqft ? Number(form.costPerSqft) : undefined,
    costPerSlab: form.costPerSlab ? Number(form.costPerSlab) : undefined,
    freightCostToEsf: Number(form.freightCostToEsf) || 0,
    projectSqft: Number(form.projectSqft) || undefined,
    installCost: form.installCost ? Number(form.installCost) : 0,
    otherCostBasis: form.otherCostBasis ? Number(form.otherCostBasis) : 0,
    pricingMode: form.pricingMode
  };
}

export default function CustomQuoteApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [calc, setCalc] = useState<CalcResult | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [backendCalcOk, setBackendCalcOk] = useState<boolean | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [err, setErr] = useState("");
  const [submitMsg, setSubmitMsg] = useState("");
  const [lastSavedQuoteId, setLastSavedQuoteId] = useState("");
  const [lastSavedQuoteNumber, setLastSavedQuoteNumber] = useState("");
  const [activeWorkflowSectionId, setActiveWorkflowSectionId] = useState<string | null>("sec-job");

  const workspaceName = DEFAULT_WORKSPACE_NAME;
  const workspaceShortId = DEFAULT_WORKSPACE_SHORT;
  const workspaceLogoUrl = EOS_LOGO_URL;
  const workspaceInitialsValue = userInitialsFor(workspaceName, "");

  const patch = useCallback((key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setCalc(null);
    setBackendCalcOk(null);
    setErr("");
    setSubmitMsg("");
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthBusy(false);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const tok = data.session?.access_token ?? null;
      setSessionToken(tok);
      const u = data.session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
      if (!form.enteredBy && u?.email) {
        setForm((f) => ({ ...f, enteredBy: deriveDisplayNameFromEmail(u.email ?? "") }));
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
        const heads = res.heads ?? [];
        setAccessDenied(!heads.some((h) => h.slug === "custom_quote" && h.enabled !== false));
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

  const scrollToWorkflowSection = useCallback((id: string) => {
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
      const result = (await apiPostJson("/api/custom-quotes/calculate", tok, buildPayload(form))) as CalcResult;
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
  }, [supabase, form]);

  const runSave = useCallback(async () => {
    if (!supabase || !calc) return;
    const tok = await resolveAccessToken(supabase);
    if (!tok) return;
    setSaveBusy(true);
    setErr("");
    setSubmitMsg("");
    try {
      const result = (await apiPostJson("/api/custom-quotes/save", tok, buildPayload(form))) as Record<string, unknown>;
      const qn = String(result.quote_number ?? "");
      const qid = String(result.quote_id ?? "");
      setLastSavedQuoteNumber(qn);
      setLastSavedQuoteId(qid);
      setSubmitMsg(qn ? `Saved ${qn} to Quote Library.` : "Saved to Quote Library.");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
  }, [supabase, form, calc]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Sign-in is not configured in this build.");
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword
      });
      if (error) throw error;
      const tok = data.session?.access_token;
      if (!tok) throw new Error("No access token returned");
      setSessionToken(tok);
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

  const fabDefaultHint = FABRICATION_DEFAULT_HINT[form.materialType] ?? FABRICATION_DEFAULT_HINT.quartz;
  const appliedFabRate =
    calc?.pricingInputsSnapshot && typeof calc.pricingInputsSnapshot === "object"
      ? Number((calc.pricingInputsSnapshot as Record<string, unknown>).fabricationRatePerSqft)
      : NaN;
  const fabDisplay = Number.isFinite(appliedFabRate) ? appliedFabRate : fabDefaultHint;

  const warnings = Array.isArray(calc?.warnings) ? (calc.warnings as string[]) : [];
  const sellPrice = calc?.sellPrice != null ? Number(calc.sellPrice) : null;
  const projectSqftNum = Number(form.projectSqft) || 0;

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
            organizationName={workspaceName}
            logoSrc={workspaceLogoUrl}
            homeHref={homeLauncherUrl()}
            userName={userDisplayName}
            userEmail={userEmail}
            userSubtitle={userRole || "Staff · ESF only"}
            initials={userInitialsFor(userDisplayName, userEmail)}
            menuItems={menuItems}
            onSignOut={() => void signOut()}
          />
        ) : (
          <EliteosTopbar
            appName="Custom Quote"
            organizationName={workspaceName}
            logoSrc={workspaceLogoUrl}
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
                      <span>
                        {calcBusy ? "Calculating…" : backendCalcOk ? "Backend confirmed" : "Awaiting Calculate"}
                      </span>
                    </span>
                  ) : null}
                </div>
                <h1 id="cq-hero-title" className="ie-hero-title">
                  Custom quote <span className="ie-hero-title-accent">workspace</span>
                </h1>
                <p className="ie-hero-sub">
                  Off-program / non-Elite-100 material quotes with markup/uplift over total cost basis. Saves to Quote
                  Library as <strong>custom_quote</strong> — separate from Internal Estimate Direct/Wholesale math.
                </p>
                <dl className="ie-hero-stats" aria-label="Live quote context">
                  <div className="ie-hero-stat">
                    <dt>Material</dt>
                    <dd>{form.materialType ? form.materialType.charAt(0).toUpperCase() + form.materialType.slice(1) : "—"}</dd>
                  </div>
                  <div className="ie-hero-stat">
                    <dt>Project sf</dt>
                    <dd>{projectSqftNum > 0 ? projectSqftNum.toFixed(1) : "—"}</dd>
                  </div>
                  <div className="ie-hero-stat">
                    <dt>Basis</dt>
                    <dd>{form.pricingMode === "wholesale" ? "Wholesale +15%" : "Retail +25%"}</dd>
                  </div>
                  <div className="ie-hero-stat">
                    <dt>Branch</dt>
                    <dd>{form.branch || "—"}</dd>
                  </div>
                  <div className="ie-hero-stat ie-hero-stat-mode">
                    <dt>Sell price</dt>
                    <dd>{sellPrice != null ? money(sellPrice) : "—"}</dd>
                  </div>
                </dl>
              </div>

              <aside className="hero-workspace" aria-label={`Workspace · ${workspaceName}`}>
                <p className="hero-workspace-eyebrow">Workspace</p>
                <div className="hero-workspace-card">
                  <div className="hero-workspace-mark">
                    <img src={workspaceLogoUrl} alt="" loading="lazy" />
                  </div>
                  <div className="hero-workspace-text">
                    <p className="hero-workspace-name">{workspaceName}</p>
                    <p className="hero-workspace-meta">
                      <span>on </span>
                      <span className="hero-workspace-platform">slabOS</span>
                      <span className="hero-workspace-sep" aria-hidden>
                        ·
                      </span>
                      <span>{workspaceShortId}</span>
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          {accessDenied ? (
            <div className="warn-box" role="alert" style={{ margin: "0 16px 16px" }}>
              <strong>Access denied.</strong> Ask an admin to grant the <code>custom_quote</code> head. This tool is not
              available to dealers or partners.
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
                  <p className="ie-signin-eyebrow">Sign in to calculate and save</p>
                  <h2 id="cq-signin-title" className="ie-signin-title">
                    Sign in with your <span className="ie-signin-title-accent">eliteOS</span> account
                  </h2>
                  <p className="ie-signin-sub">Custom Quote is ESF internal only. Calculate and Save require authentication.</p>
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
                    {backendCalcOk === true ? "Backend connected" : backendCalcOk === false ? "Calculate failed" : "Ready"}
                  </span>
                  <span className="ie-live-strip-copy">
                    {backendCalcOk === true
                      ? "Backend calculation confirmed. Review warnings and save to Quote Library when ready."
                      : "Enter job info, custom material variables, and project sq ft — then tap Calculate for authoritative pricing."}
                  </span>
                </div>
              ) : null}

              {err ? (
                <div className="warn-box" role="alert">
                  <strong>Error</strong>
                  <p style={{ margin: "6px 0 0" }}>{err}</p>
                </div>
              ) : null}

              {/* 1 · Account / Project Details — matches Internal Estimate Job Info */}
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
                        <input
                          value={form.accountName}
                          onChange={(e) => patch("accountName", e.target.value)}
                          placeholder="Account name"
                        />
                      </label>
                      <label>
                        Account contact phone
                        <input value={form.accountPhone} onChange={(e) => patch("accountPhone", e.target.value)} placeholder="Phone" />
                      </label>
                      <label>
                        Account contact email
                        <input value={form.accountEmail} onChange={(e) => patch("accountEmail", e.target.value)} placeholder="Email" />
                      </label>
                    </div>
                  </div>

                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Customer</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Customer
                        <input
                          value={form.customerName}
                          onChange={(e) => patch("customerName", e.target.value)}
                          placeholder="Customer or site"
                        />
                      </label>
                      <label>
                        Customer phone
                        <input value={form.customerPhone} onChange={(e) => patch("customerPhone", e.target.value)} placeholder="Phone" />
                      </label>
                      <label>
                        Customer email
                        <input value={form.customerEmail} onChange={(e) => patch("customerEmail", e.target.value)} placeholder="Email" />
                      </label>
                    </div>
                  </div>

                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Project</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Elite job name
                        <input value={form.projectName} onChange={(e) => patch("projectName", e.target.value)} placeholder="Job name" />
                      </label>
                      <label>
                        Project address
                        <input
                          value={form.projectAddress}
                          onChange={(e) => patch("projectAddress", e.target.value)}
                          placeholder="Street address"
                        />
                      </label>
                      <label>
                        City
                        <input value={form.city} onChange={(e) => patch("city", e.target.value)} placeholder="City" />
                      </label>
                      <label>
                        State
                        <input value={form.state} onChange={(e) => patch("state", e.target.value)} placeholder="IA" />
                      </label>
                      <label>
                        ZIP
                        <input value={form.zip} onChange={(e) => patch("zip", e.target.value)} placeholder="ZIP" />
                      </label>
                    </div>
                  </div>

                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Sales &amp; quote settings</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Branch
                        <select value={form.branch} onChange={(e) => patch("branch", e.target.value)}>
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
                        <select value={form.salesRep} onChange={(e) => patch("salesRep", e.target.value)}>
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
                        <input value={form.enteredBy} onChange={(e) => patch("enteredBy", e.target.value)} placeholder="Defaults from sign-in" />
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2 · Custom Material / Slab Cost Variables — before measurement */}
              <section id="sec-material" className="card">
                <div className="ie-section-head">
                  <h2 className="ie-section-title">Custom Material / Slab Cost Variables</h2>
                  <p className="ie-section-meta">
                    Off-program slab pricing · Freight to ESF · Fabrication defaults · Retail/Wholesale uplift on total
                    cost basis
                  </p>
                </div>
                <p className="ie-note-quiet" role="note">
                  <span className="ie-note-quiet-dot" aria-hidden />
                  Markup/uplift applies to material, freight, fabrication, install, and other costs — not gross-margin
                  inversion (<code>cost ÷ (1 − margin)</code> is not used).
                </p>

                <div className="ie-job-groups" style={{ marginTop: 16 }}>
                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Material &amp; supplier</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Color name
                        <input value={form.colorName} onChange={(e) => patch("colorName", e.target.value)} placeholder="Slab color" />
                      </label>
                      <label>
                        Material type
                        <select value={form.materialType} onChange={(e) => patch("materialType", e.target.value)}>
                          {MATERIAL_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Supplier name
                        <input value={form.supplierName} onChange={(e) => patch("supplierName", e.target.value)} placeholder="Supplier" />
                      </label>
                    </div>
                  </div>

                  <div className="ie-job-group">
                    <p className="ie-job-group-head">Slab size &amp; cost</p>
                    <div className="grid3 ie-job-grid">
                      <label>
                        Slab width (in)
                        <input type="number" min={0} value={form.slabWidth} onChange={(e) => patch("slabWidth", e.target.value)} />
                      </label>
                      <label>
                        Slab height (in)
                        <input type="number" min={0} value={form.slabHeight} onChange={(e) => patch("slabHeight", e.target.value)} />
                      </label>
                      <label>
                        Slab sq ft override
                        <input type="number" min={0} step={0.01} value={form.slabSqft} onChange={(e) => patch("slabSqft", e.target.value)} placeholder="Optional" />
                      </label>
                      <label>
                        Slab quantity
                        <input type="number" min={1} value={form.slabQuantity} onChange={(e) => patch("slabQuantity", e.target.value)} />
                      </label>
                      <label>
                        Cost per sq ft
                        <input type="number" min={0} step={0.01} value={form.costPerSqft} onChange={(e) => patch("costPerSqft", e.target.value)} />
                      </label>
                      <label>
                        Cost per slab
                        <input type="number" min={0} step={0.01} value={form.costPerSlab} onChange={(e) => patch("costPerSlab", e.target.value)} />
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
                          value={form.freightCostToEsf}
                          onChange={(e) => patch("freightCostToEsf", e.target.value)}
                        />
                      </label>
                      <label>
                        Fabrication / shop rate ($/sf)
                        <input
                          type="text"
                          readOnly
                          className="cq-readonly-default"
                          value={`$${fabDisplay.toFixed(2)} / sf`}
                          aria-readonly="true"
                        />
                        <span className="cq-fab-rate-hint">
                          {backendCalcOk
                            ? <>Applied at Calculate: <strong>${fabDisplay.toFixed(2)}/sf</strong> (backend)</>
                            : <>Expected default for {form.materialType}: <strong>${fabDefaultHint.toFixed(2)}/sf</strong> — confirmed at Calculate</>}
                        </span>
                      </label>
                      <label>
                        Pricing mode
                        <div className="ie-pricing-toggle" role="group" aria-label="Custom quote pricing mode" style={{ marginTop: 6 }}>
                          <button
                            type="button"
                            className={form.pricingMode === "wholesale" ? "on" : ""}
                            onClick={() => patch("pricingMode", "wholesale")}
                          >
                            Wholesale (+15%)
                          </button>
                          <button
                            type="button"
                            className={form.pricingMode === "retail" ? "on" : ""}
                            onClick={() => patch("pricingMode", "retail")}
                          >
                            Retail (+25%)
                          </button>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              {/* 3 · Measurement / project sq ft — Internal Estimate room-area styling */}
              <section id="sec-measure" className="card">
                <div className="ie-section-head">
                  <h2 className="ie-section-title">Project Square Footage / Areas</h2>
                  <p className="ie-section-meta">
                    Sellable/project sq ft drives fabrication · Optional install/labor and other cost basis lines
                  </p>
                </div>
                <div className="grid3 ie-job-grid">
                  <label>
                    Project sq ft
                    <input type="number" min={0} step={0.01} value={form.projectSqft} onChange={(e) => patch("projectSqft", e.target.value)} />
                  </label>
                  <label>
                    Install / labor ($)
                    <input type="number" min={0} step={0.01} value={form.installCost} onChange={(e) => patch("installCost", e.target.value)} />
                  </label>
                  <label>
                    Other cost basis ($)
                    <input type="number" min={0} step={0.01} value={form.otherCostBasis} onChange={(e) => patch("otherCostBasis", e.target.value)} />
                  </label>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Internal notes
                    <textarea value={form.notes} onChange={(e) => patch("notes", e.target.value)} rows={3} placeholder="Estimator notes (internal)" />
                  </label>
                </div>
              </section>

              <div className="ie-workflow-tail">
                {/* 4 · Review */}
                <section id="sec-review" className="card">
                  <div className="ie-section-head">
                    <h2 className="ie-section-title">Review</h2>
                    <p className="ie-section-meta">Backend calculation · Utilization &amp; multiplier review warnings</p>
                  </div>

                  {!calc ? (
                    <p className="muted">Tap <strong>Calculate</strong> in the pinned bar after entering material and project sq ft.</p>
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
                        <p className="ok small">No utilization or multiplier warnings from backend.</p>
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
                            <td>Fabrication / shop</td>
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
                            <td>
                              Sell price ({String(calc.pricingMode)} · {pct(calc.pricingUpliftPercent)} uplift)
                            </td>
                            <td>
                              <strong>{money(calc.sellPrice)}</strong>
                            </td>
                          </tr>
                          <tr>
                            <td>Profit · actual gross margin · multiplier</td>
                            <td>
                              {money(calc.profitDollars)} · {pct(calc.actualGrossMarginPercent)} ·{" "}
                              {Number(calc.multiplier).toFixed(2)}×
                            </td>
                          </tr>
                          <tr>
                            <td>Slab utilization</td>
                            <td>{pct(calc.utilizationPercent)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </>
                  )}
                </section>

                {/* 5 · Save */}
                <section id="sec-save" className="card">
                  <div className="ie-section-head">
                    <h2 className="ie-section-title">Save</h2>
                    <p className="ie-section-meta">Save to Quote Library · quote_source custom_quote</p>
                  </div>
                  {submitMsg ? (
                    <p className="ie-note-quiet ie-note-info" role="status">
                      <span className="ie-note-quiet-dot" aria-hidden />
                      {submitMsg}
                    </p>
                  ) : (
                    <p className="muted">Calculate first, then save. Creates a draft row in Quote Library.</p>
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
                </section>
              </div>
            </main>

            <aside className="ie-aside side-col" aria-label="Custom quote summary">
              <div className="ie-aside-panel summary-card ie-summary-card-compact">
                <div className="ie-aside-scroll">
                  <div className="ie-summary-head">
                    <p className="ie-summary-eyebrow">Live quote panel</p>
                    <h2 className="ie-summary-title">Custom quote summary</h2>
                    <p className="ie-summary-mode-pill" data-mode={form.pricingMode}>
                      <span className="ie-summary-mode-dot" aria-hidden />
                      {form.pricingMode === "wholesale" ? "Wholesale +15%" : "Retail +25%"}
                    </p>
                  </div>

                  <div className="ie-summary-section ie-summary-hero">
                    <p className="ie-summary-kicker">Sell price · uplift on total cost</p>
                    <p className="ie-summary-compact-hero">{sellPrice != null ? money(sellPrice) : "—"}</p>
                    {backendCalcOk ? (
                      <p className="ie-summary-hero-sub is-confirmed">
                        <span className="ie-summary-hero-sub-dot" aria-hidden />
                        Last Calculate (backend): <strong>{money(calc?.sellPrice)}</strong>
                      </p>
                    ) : (
                      <p className="ie-summary-hero-sub is-preview">
                        <span className="ie-summary-hero-sub-dot" aria-hidden />
                        Tap Calculate for authoritative backend pricing.
                      </p>
                    )}
                  </div>

                  {calc ? (
                    <div className="ie-summary-section">
                      <p className="ie-summary-section-head">Breakdown</p>
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
                        <div className="summary-row ie-summary-row-compact">
                          <span>Cost basis</span>
                          <strong>{money(calc.totalCostBasis)}</strong>
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
                  {calcBusy ? "Calculating…" : backendCalcOk ? "Backend confirmed" : sessionToken ? "Ready" : "Sign in"}
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
                className="btn secondary btn-sm"
                disabled={saveDisabled || accessDenied}
                title={!calc ? "Calculate first" : undefined}
                onClick={() => void runSave()}
              >
                {saveBusy ? "Saving…" : "Save to Quote Library"}
              </button>
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}
