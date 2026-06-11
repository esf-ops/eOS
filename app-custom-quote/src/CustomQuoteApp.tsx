import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiPostJson, ApiError } from "@quote-lib/api";
import { EOS_LOGO_URL } from "@quote-lib/config";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import { getSupabase } from "./lib/supabase";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

const MATERIAL_TYPES = ["quartz", "granite", "marble", "quartzite", "porcelain"] as const;

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

function buildPayload(form: FormState): Record<string, unknown> {
  return {
    customer_name: form.customerName.trim() || null,
    project_name: form.projectName.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    sales_rep: form.salesRep.trim() || null,
    branch: form.branch.trim() || null,
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

type FormState = {
  customerName: string;
  projectName: string;
  city: string;
  state: string;
  salesRep: string;
  branch: string;
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
  customerName: "",
  projectName: "",
  city: "",
  state: "",
  salesRep: "",
  branch: "",
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

export default function CustomQuoteApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [authBusy, setAuthBusy] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [calc, setCalc] = useState<CalcResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!supabase) {
      setAuthBusy(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const tok = data.session?.access_token ?? null;
      setSessionToken(tok);
      const u = data.session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
      setAuthBusy(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      setSessionToken(session?.access_token ?? null);
      const u = session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = (await fetch(
          `${String(import.meta.env.VITE_BACKEND_URL || "http://localhost:3001").replace(/\/+$/, "").replace(/\/api$/i, "")}/api/me/heads`,
          { headers: { authorization: `Bearer ${sessionToken}` } }
        ).then((r) => r.json())) as { heads?: { slug: string; enabled?: boolean }[] };
        if (cancelled) return;
        const heads = res.heads ?? [];
        const allowed = heads.some((h) => h.slug === "custom_quote" && h.enabled !== false);
        setAccessDenied(!allowed);
      } catch {
        if (!cancelled) setAccessDenied(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const patch = useCallback((key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setCalc(null);
    setErr("");
    setMsg("");
  }, []);

  const runCalculate = useCallback(async () => {
    if (!sessionToken) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const result = (await apiPostJson("/api/custom-quotes/calculate", sessionToken, buildPayload(form))) as CalcResult;
      setCalc(result);
    } catch (e) {
      setCalc(null);
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [sessionToken, form]);

  const runSave = useCallback(async () => {
    if (!sessionToken) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const result = (await apiPostJson("/api/custom-quotes/save", sessionToken, buildPayload(form))) as Record<
        string,
        unknown
      >;
      const qn = String(result.quote_number ?? "");
      const qid = String(result.quote_id ?? "");
      setMsg(
        qn
          ? `Saved ${qn} to Quote Library.${qid ? ` View in Quote Library when ready.` : ""}`
          : "Saved to Quote Library."
      );
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [sessionToken, form]);

  const signIn = useCallback(async () => {
    if (!supabase) return;
    const email = window.prompt("Work email for magic link sign-in:");
    if (!email?.trim()) return;
    await supabase.auth.signInWithOtp({ email: email.trim() });
    window.alert("Check your email for the sign-in link.");
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSessionToken(null);
    setCalc(null);
  }, [supabase]);

  const userDisplayName = useMemo(
    () => userMetaName || deriveDisplayNameFromEmail(userEmail) || "Signed in",
    [userMetaName, userEmail]
  );

  const menuItems: EliteosTopbarMenuItem[] = useMemo(
    () => [
      { label: "Open Home", href: homeLauncherUrl() },
      { label: "Quote Library", href: quoteLibraryUrl() }
    ],
    []
  );

  if (authBusy) {
    return (
      <div className="cq-shell">
        <main className="cq-main muted">Loading session…</main>
      </div>
    );
  }

  if (!supabase || !sessionToken) {
    return (
      <div className="cq-shell">
        <div className="auth-panel">
          <h1>Custom Quote</h1>
          <p className="muted">ESF internal — off-program material quotes. Sign in to continue.</p>
          <button type="button" className="btn btn-primary" onClick={() => void signIn()}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="cq-shell">
        <EliteosTopbar
          appName="Custom Quote"
          organizationName={DEFAULT_WORKSPACE_NAME}
          logoSrc={EOS_LOGO_URL}
          homeHref={homeLauncherUrl()}
          userName={userDisplayName}
          userEmail={userEmail}
          userSubtitle={userRole || "Staff"}
          initials={userInitialsFor(userDisplayName, userEmail)}
          menuItems={menuItems}
          onSignOut={() => void signOut()}
        />
        <main className="cq-main">
          <div className="banner banner-err">
            Access denied. Ask an admin to grant the <code>custom_quote</code> head.
          </div>
        </main>
      </div>
    );
  }

  const warnings = Array.isArray(calc?.warnings) ? (calc.warnings as string[]) : [];

  return (
    <div className="cq-shell">
      <EliteosTopbar
        appName="Custom Quote"
        organizationName={DEFAULT_WORKSPACE_NAME}
        logoSrc={EOS_LOGO_URL}
        homeHref={homeLauncherUrl()}
        userName={userDisplayName}
        userEmail={userEmail}
        userSubtitle={userRole || "Staff"}
        initials={userInitialsFor(userDisplayName, userEmail)}
        menuItems={menuItems}
        onSignOut={() => void signOut()}
      />

      <main className="cq-main">
        <header className="cq-hero">
          <h1>Off-program material quote</h1>
          <p>
            For non-Elite-100 / off-program slabs only. Retail and wholesale apply{" "}
            <strong>markup/uplift to all costs</strong> (material, freight, fabrication, install) — not
            gross-margin inversion. Review warnings are advisory, not hard blocks.
          </p>
        </header>

        {err ? <div className="banner banner-err">{err}</div> : null}
        {msg ? <div className="banner banner-ok">{msg}</div> : null}

        <section className="cq-card">
          <h2>1 · Job / customer</h2>
          <div className="cq-grid">
            <label>
              Customer name
              <input value={form.customerName} onChange={(e) => patch("customerName", e.target.value)} />
            </label>
            <label>
              Project name
              <input value={form.projectName} onChange={(e) => patch("projectName", e.target.value)} />
            </label>
            <label>
              City
              <input value={form.city} onChange={(e) => patch("city", e.target.value)} />
            </label>
            <label>
              State
              <input value={form.state} onChange={(e) => patch("state", e.target.value)} />
            </label>
            <label>
              Sales rep
              <input value={form.salesRep} onChange={(e) => patch("salesRep", e.target.value)} />
            </label>
            <label>
              Branch
              <input value={form.branch} onChange={(e) => patch("branch", e.target.value)} />
            </label>
          </div>
        </section>

        <section className="cq-card">
          <h2>2 · Material / supplier</h2>
          <div className="cq-grid">
            <label>
              Color name
              <input value={form.colorName} onChange={(e) => patch("colorName", e.target.value)} required />
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
            <label className="cq-span-2">
              Supplier
              <input value={form.supplierName} onChange={(e) => patch("supplierName", e.target.value)} />
            </label>
          </div>
        </section>

        <section className="cq-card">
          <h2>3 · Slab size / quantity / cost</h2>
          <div className="cq-grid">
            <label>
              Slab width (in)
              <input type="number" min="0" value={form.slabWidth} onChange={(e) => patch("slabWidth", e.target.value)} />
            </label>
            <label>
              Slab height (in)
              <input type="number" min="0" value={form.slabHeight} onChange={(e) => patch("slabHeight", e.target.value)} />
            </label>
            <label>
              Or slab sq ft
              <span className="hint">Use instead of width × height</span>
              <input type="number" min="0" step="0.01" value={form.slabSqft} onChange={(e) => patch("slabSqft", e.target.value)} />
            </label>
            <label>
              Slab quantity
              <input type="number" min="1" value={form.slabQuantity} onChange={(e) => patch("slabQuantity", e.target.value)} />
            </label>
            <label>
              Cost per sq ft
              <input type="number" min="0" step="0.01" value={form.costPerSqft} onChange={(e) => patch("costPerSqft", e.target.value)} />
            </label>
            <label>
              Or cost per slab
              <input type="number" min="0" step="0.01" value={form.costPerSlab} onChange={(e) => patch("costPerSlab", e.target.value)} />
            </label>
          </div>
        </section>

        <section className="cq-card">
          <h2>4 · Freight · 5 · Project sq ft · 6 · Pricing mode</h2>
          <div className="cq-grid">
            <label>
              Freight to ESF ($)
              <input type="number" min="0" step="0.01" value={form.freightCostToEsf} onChange={(e) => patch("freightCostToEsf", e.target.value)} />
            </label>
            <label>
              Project sq ft
              <input type="number" min="0" step="0.01" value={form.projectSqft} onChange={(e) => patch("projectSqft", e.target.value)} />
            </label>
            <label>
              Install / labor ($)
              <input type="number" min="0" step="0.01" value={form.installCost} onChange={(e) => patch("installCost", e.target.value)} />
            </label>
            <label>
              Other cost basis ($)
              <input type="number" min="0" step="0.01" value={form.otherCostBasis} onChange={(e) => patch("otherCostBasis", e.target.value)} />
            </label>
            <label className="cq-span-2">
              Pricing mode
              <select
                value={form.pricingMode}
                onChange={(e) => patch("pricingMode", e.target.value as "retail" | "wholesale")}
              >
                <option value="retail">Retail (+25% uplift on total cost)</option>
                <option value="wholesale">Wholesale (+15% uplift on total cost)</option>
              </select>
            </label>
          </div>
          <div className="cq-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void runCalculate()}>
              Calculate
            </button>
            <button type="button" className="btn" disabled={busy || !calc} onClick={() => void runSave()}>
              Save to Quote Library
            </button>
          </div>
        </section>

        {warnings.length ? (
          <section className="cq-card">
            <h2>8 · Review warnings</h2>
            <div className="banner banner-warn">
              {warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
          </section>
        ) : null}

        {calc ? (
          <section className="cq-card">
            <h2>9 · Internal cost breakdown</h2>
            <table className="breakdown-table">
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
                    <td>Other</td>
                    <td>{money(calc.otherCostBasis)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td>Total cost basis</td>
                  <td>{money(calc.totalCostBasis)}</td>
                </tr>
                <tr>
                  <td>
                    Sell price ({String(calc.pricingMode)} · {pct(calc.pricingUpliftPercent)} uplift)
                  </td>
                  <td>{money(calc.sellPrice)}</td>
                </tr>
                <tr>
                  <td>Profit $ · actual gross margin · multiplier</td>
                  <td>
                    {money(calc.profitDollars)} · {pct(calc.actualGrossMarginPercent)} ·{" "}
                    {Number(calc.multiplier).toFixed(2)}×
                  </td>
                </tr>
                <tr>
                  <td>Utilization</td>
                  <td>{pct(calc.utilizationPercent)}</td>
                </tr>
              </tbody>
            </table>
            <label className="cq-span-2" style={{ display: "block", marginTop: "1rem" }}>
              Notes
              <textarea value={form.notes} onChange={(e) => patch("notes", e.target.value)} />
            </label>
          </section>
        ) : null}
      </main>

      <footer className="footer-bar">eliteOS · Custom Quote · Off-program material only</footer>
    </div>
  );
}
