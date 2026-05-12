import React, { useCallback, useEffect, useState } from "react";
import { apiPostJson, ApiError } from "../lib/api";
import { config, EOS_LOGO_URL } from "../lib/config";
import { demoCalculate, TIER_RATES, type DemoCalculateResult } from "../lib/demoFallback";
import { getSupabase } from "../lib/supabase";

const MATERIAL_GROUPS = Object.keys(TIER_RATES);

type QuoteMode = "public" | "partner";

type ApiPartnerResult = {
  ok?: boolean;
  totals?: { wholesale?: number; retail?: number; profit?: number; estimated_sqft?: number };
  snapshot?: {
    lineItems?: Array<Record<string, unknown>>;
    pricingStructure?: Record<string, unknown>;
  };
  warnings?: string[];
};

type ApiPublicResult = {
  ok?: boolean;
  display?: string;
  totals?: { retail?: number; estimated_sqft?: number };
  snapshot?: Record<string, unknown>;
  warnings?: string[];
};

function num(v: string): number {
  const n = Number.parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function App() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [quoteMode, setQuoteMode] = useState<QuoteMode>("public");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [projectType, setProjectType] = useState("Kitchen");
  const [branch, setBranch] = useState("Dyersville");
  const [salesRep, setSalesRep] = useState("");
  const [materialGroup, setMaterialGroup] = useState("Group Promo");
  const [ct, setCt] = useState("45");
  const [bs, setBs] = useState("12");
  const [sink, setSink] = useState("1");
  const [bar, setBar] = useState("0");
  const [cook, setCook] = useState("1");
  const [outlet, setOutlet] = useState("0");
  const [ss, setSs] = useState("0");
  const [blanco, setBlanco] = useState("0");
  const [tearYes, setTearYes] = useState(false);
  const [useRooms, setUseRooms] = useState(false);
  const [roomName, setRoomName] = useState("Kitchen");
  const [roomCt, setRoomCt] = useState("45");
  const [roomBs, setRoomBs] = useState("12");
  const [roomGroup, setRoomGroup] = useState("Group Promo");
  const [partnerRetailPct, setPartnerRetailPct] = useState("20");

  const [calcBusy, setCalcBusy] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [demoResult, setDemoResult] = useState<DemoCalculateResult | null>(null);
  const [apiPublic, setApiPublic] = useState<ApiPublicResult | null>(null);
  const [apiPartner, setApiPartner] = useState<ApiPartnerResult | null>(null);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitPreview, setSubmitPreview] = useState<string | null>(null);

  const liveApi = Boolean(sessionToken);
  const lastCalcLive = !usedFallback && (apiPublic != null || apiPartner != null);

  useEffect(() => {
    setDemoResult(null);
    setApiPublic(null);
    setApiPartner(null);
    setUsedFallback(false);
    setCalcError(null);
  }, [quoteMode]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Demo only — add Supabase URL and anon key to your environment to enable sign-in.");
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
  }, [supabase]);

  const buildAddOns = useCallback(() => {
    const o: Record<string, number> = {
      "qty-sink": num(sink),
      "qty-bar": num(bar),
      "qty-cook": num(cook),
      "qty-outlet": num(outlet),
      "qty-ss": num(ss),
      "qty-blanco": num(blanco),
      tearout: tearYes ? 1 : 0
    };
    return o;
  }, [sink, bar, cook, outlet, ss, blanco, tearYes]);

  const buildCalcPayload = useCallback(() => {
    const addOns = buildAddOns();
    const rooms = useRooms
      ? [
          {
            name: roomName.trim() || "Room 1",
            room_name: roomName.trim() || "Room 1",
            materialGroup: roomGroup,
            group: roomGroup,
            countertopSqft: num(roomCt),
            backsplashSqft: num(roomBs)
          }
        ]
      : [];
    return {
      quoteSource: quoteMode === "public" ? "public_retail" : "partner_portal",
      materialGroup,
      areas: {
        countertopSqft: num(ct),
        backsplashSqft: num(bs)
      },
      addOns,
      engine: useRooms ? "rooms" : "legacy",
      rooms,
      retailMarkupPercent: num(partnerRetailPct),
      customer_name: customerName.trim() || undefined,
      customer_email: email.trim() || undefined,
      customer_phone: phone.trim() || undefined,
      project_type: projectType.trim() || undefined,
      branch: branch.trim() || undefined,
      sales_rep: salesRep.trim() || undefined
    };
  }, [
    quoteMode,
    materialGroup,
    ct,
    bs,
    buildAddOns,
    useRooms,
    roomName,
    roomGroup,
    roomCt,
    roomBs,
    partnerRetailPct,
    customerName,
    email,
    phone,
    projectType,
    branch,
    salesRep
  ]);

  const runFallback = useCallback(() => {
    setUsedFallback(true);
    setApiPublic(null);
    setApiPartner(null);
    setDemoResult(
      demoCalculate({
        mode: quoteMode,
        materialGroup,
        countertopSqft: num(ct),
        backsplashSqft: num(bs),
        addOns: buildAddOns(),
        useRooms,
        rooms: useRooms
          ? [{ name: roomName.trim() || "Room 1", materialGroup: roomGroup, countertopSqft: num(roomCt), backsplashSqft: num(roomBs) }]
          : [],
        partnerRetailPercent: num(partnerRetailPct)
      })
    );
  }, [
    quoteMode,
    materialGroup,
    ct,
    bs,
    buildAddOns,
    useRooms,
    roomName,
    roomGroup,
    roomCt,
    roomBs,
    partnerRetailPct
  ]);

  const handleCalculate = useCallback(async () => {
    setCalcBusy(true);
    setCalcError(null);
    setDemoResult(null);
    setApiPublic(null);
    setApiPartner(null);
    setUsedFallback(false);
    const payload = buildCalcPayload();

    if (!sessionToken) {
      runFallback();
      setCalcBusy(false);
      return;
    }

    try {
      const raw = (await apiPostJson("/api/quote/calculate", sessionToken, payload)) as Record<string, unknown>;
      if (raw.display === "public_retail_safe") {
        setApiPublic(raw as ApiPublicResult);
        setUsedFallback(false);
        setCalcBusy(false);
        return;
      }
      if (raw.ok === true) {
        setApiPartner(raw as ApiPartnerResult);
        setUsedFallback(false);
        setCalcBusy(false);
        return;
      }
      runFallback();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown> | null;
        const installed = body && body.installed === false;
        if (e.status === 503 || installed || e.status === 0 || e.status >= 500) {
          runFallback();
          setCalcBusy(false);
          return;
        }
        if (e.status === 401) {
          runFallback();
          setCalcBusy(false);
          return;
        }
        setCalcError(e.message);
        setCalcBusy(false);
        return;
      }
      runFallback();
    }
    setCalcBusy(false);
  }, [sessionToken, buildCalcPayload, runFallback]);

  const buildSubmitPayload = useCallback(() => {
    return {
      ...buildCalcPayload(),
      customer_name: customerName.trim() || null,
      customer_email: email.trim() || null,
      customer_phone: phone.trim() || null,
      project_type: projectType.trim() || null,
      branch: branch.trim() || null,
      sales_rep: salesRep.trim() || null
    };
  }, [buildCalcPayload, customerName, email, phone, projectType, branch, salesRep]);

  const handleSubmit = useCallback(async () => {
    setSubmitBusy(true);
    setSubmitMsg(null);
    setSubmitPreview(null);
    const payload = buildSubmitPayload();

    try {
      if (!sessionToken) {
        setSubmitMsg("Sign in to save a quote to eOS. Below is a preview of the data we would send — nothing is stored yet.");
        setSubmitPreview(JSON.stringify({ ...payload, _demo: true }, null, 2));
        return;
      }

      const raw = (await apiPostJson("/api/quote/submit", sessionToken, payload)) as Record<string, unknown>;
      if (raw.ok === true) {
        setSubmitMsg(`Saved. Quote # ${String(raw.quoteNumber ?? "")}`);
        setSubmitPreview(JSON.stringify(raw, null, 2));
      } else {
        setSubmitMsg(String(raw.error || "Something went wrong"));
        setSubmitPreview(JSON.stringify(raw, null, 2));
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown> | string | null;
        let parsed: Record<string, unknown> | null = null;
        if (body && typeof body === "object") parsed = body as Record<string, unknown>;
        const installed = parsed?.installed === false;
        if (e.status === 503 || installed) {
          setSubmitMsg("Quote storage isn’t set up in this environment yet. Here’s a preview of what we would save.");
          setSubmitPreview(JSON.stringify({ request: payload, error: body }, null, 2));
          return;
        }
        setSubmitMsg(e.message);
        setSubmitPreview(JSON.stringify({ request: payload, error: body ?? e.message }, null, 2));
        return;
      }
      setSubmitMsg(String(e));
    } finally {
      setSubmitBusy(false);
    }
  }, [sessionToken, buildSubmitPayload]);

  const backendHint = config.backendBaseUrl;

  const hasPublicSummary = quoteMode === "public" && (apiPublic != null || demoResult != null);
  const hasPartnerSummary = quoteMode === "partner" && (apiPartner?.totals != null || demoResult != null);
  const showSummary = hasPublicSummary || hasPartnerSummary;

  const pubRetail = apiPublic?.totals?.retail ?? demoResult?.retail;
  const pubSqft = apiPublic?.totals?.estimated_sqft ?? demoResult?.estimated_sqft;
  const pubMaterial = quoteMode === "public" && apiPublic ? materialGroup : demoResult?.materialGroup ?? materialGroup;

  const partWholesale = apiPartner?.totals?.wholesale ?? demoResult?.wholesale;
  const partRetail = apiPartner?.totals?.retail ?? demoResult?.retail;
  const partSqft = apiPartner?.totals?.estimated_sqft ?? demoResult?.estimated_sqft;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-brand">
          <img className="logo" src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
          <div className="hero-titles">
            <h1 className="title">Quote</h1>
            <p className="subtitle">Estimate countertops and add-ons — preview experience for leadership</p>
          </div>
        </div>
        <div className="hero-badges">
          <span className="badge badge-demo">Meeting demo</span>
          <span className="badge badge-preview">Preview · Not production</span>
        </div>
      </header>

      <div className="status-strip">
        <p className="status-strip-main">
          {liveApi ? (
            <>
              <span className="pill pill-live">Live API</span> Signed in — calculations use eOS when available.
            </>
          ) : (
            <>
              <span className="pill pill-demo">Demo mode active</span> Sample quotes run in your browser until you sign in.
            </>
          )}
        </p>
        <p className="status-strip-sub">
          {liveApi
            ? "Live quote saving and tracking use your configured eOS Brain / Supabase project."
            : "This preview can calculate sample quotes locally. Live quote saving and tracking will connect to eOS Brain / Supabase when production is configured."}
        </p>
        <p className="status-strip-meta" aria-label="Backend base URL">
          {backendHint}
        </p>
      </div>

      <div className="layout">
        <div className="main-col">
          {supabase ? (
            <section className="card">
              <h2>Account</h2>
              <p className="muted">Optional — sign in to run calculations against the live API and save quotes.</p>
              {sessionToken ? (
                <div className="row">
                  <span className="pill pill-live">Signed in</span>
                  <button type="button" className="btn secondary" onClick={() => void signOut()}>
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="grid2">
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
                  <button type="button" className="btn primary" disabled={authBusy} onClick={() => void signIn()}>
                    {authBusy ? "Signing in…" : "Sign in"}
                  </button>
                </div>
              )}
              {authError ? <p className="error">{authError}</p> : null}
            </section>
          ) : (
            <section className="card">
              <h2>Demo mode active</h2>
              <p className="muted">
                This preview can calculate sample quotes locally. Live quote saving and tracking will connect to eOS
                Brain / Supabase when production is configured.
              </p>
            </section>
          )}

          <section className="card">
            <h2>How would you like to quote?</h2>
            <div className="mode-row">
              <button
                type="button"
                className={`btn big ${quoteMode === "public" ? "mode-on" : "mode-off"}`}
                onClick={() => setQuoteMode("public")}
              >
                Public retail
              </button>
              <button
                type="button"
                className={`btn big ${quoteMode === "partner" ? "mode-on" : "mode-off"}`}
                onClick={() => setQuoteMode("partner")}
              >
                Partner / internal demo
              </button>
            </div>
            {quoteMode === "public" ? (
              <p className="callout">
                Public retail pricing includes at least <strong>25% protection</strong> over dealer/partner pricing. This
                view shows homeowner-safe totals only.
              </p>
            ) : (
              <p className="callout internal">
                <strong>Partner / internal demo</strong> — wholesale-style detail may appear for discussion. Not for
                external homeowner-facing use.
              </p>
            )}
          </section>

          <section className="card">
            <h2>Customer &amp; project</h2>
            <div className="grid3">
              <label>
                Customer name
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Jane Homeowner" />
              </label>
              <label>
                Phone
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="563-555-0100" />
              </label>
              <label>
                Email
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
              </label>
              <label>
                Project type
                <input value={projectType} onChange={(e) => setProjectType(e.target.value)} />
              </label>
              <label>
                Branch
                <input value={branch} onChange={(e) => setBranch(e.target.value)} />
              </label>
              <label>
                Sales rep
                <input value={salesRep} onChange={(e) => setSalesRep(e.target.value)} />
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Materials &amp; add-ons</h2>
            <label className="check">
              <input type="checkbox" checked={useRooms} onChange={(e) => setUseRooms(e.target.checked)} />
              Use one room (name + separate square feet)
            </label>

            {!useRooms ? (
              <div className="grid3">
                <label>
                  Material group
                  <select value={materialGroup} onChange={(e) => setMaterialGroup(e.target.value)}>
                    {MATERIAL_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Countertop sq ft
                  <input value={ct} onChange={(e) => setCt(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Backsplash sq ft
                  <input value={bs} onChange={(e) => setBs(e.target.value)} inputMode="decimal" />
                </label>
              </div>
            ) : (
              <div className="grid3">
                <label>
                  Room name
                  <input value={roomName} onChange={(e) => setRoomName(e.target.value)} />
                </label>
                <label>
                  Material group
                  <select value={roomGroup} onChange={(e) => setRoomGroup(e.target.value)}>
                    {MATERIAL_GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Countertop sq ft
                  <input value={roomCt} onChange={(e) => setRoomCt(e.target.value)} />
                </label>
                <label>
                  Backsplash sq ft
                  <input value={roomBs} onChange={(e) => setRoomBs(e.target.value)} />
                </label>
              </div>
            )}

            <h3 className="h3">Add-ons</h3>
            <div className="grid3">
              <label>
                Kitchen sink cutouts
                <input value={sink} onChange={(e) => setSink(e.target.value)} />
              </label>
              <label>
                Vanity / bar sink cutouts
                <input value={bar} onChange={(e) => setBar(e.target.value)} />
              </label>
              <label>
                Cooktop cutouts
                <input value={cook} onChange={(e) => setCook(e.target.value)} />
              </label>
              <label>
                Electrical outlet cutouts
                <input value={outlet} onChange={(e) => setOutlet(e.target.value)} />
              </label>
              <label>
                ESF stainless sink
                <input value={ss} onChange={(e) => setSs(e.target.value)} />
              </label>
              <label>
                Stock Blanco sink
                <input value={blanco} onChange={(e) => setBlanco(e.target.value)} />
              </label>
            </div>
            <label className="check">
              <input type="checkbox" checked={tearYes} onChange={(e) => setTearYes(e.target.checked)} />
              Tear-out needed
            </label>

            {quoteMode === "partner" ? (
              <label>
                Display markup % (partner retail view)
                <input value={partnerRetailPct} onChange={(e) => setPartnerRetailPct(e.target.value)} style={{ maxWidth: 140 }} />
              </label>
            ) : null}
          </section>

          <div className="actions">
            <button type="button" className="btn primary big" disabled={calcBusy} onClick={() => void handleCalculate()}>
              {calcBusy ? "Calculating…" : "Calculate"}
            </button>
            <button type="button" className="btn secondary big" disabled={submitBusy} onClick={() => void handleSubmit()}>
              {submitBusy ? "Working…" : "Submit quote"}
            </button>
          </div>
          {!sessionToken ? (
            <p className="muted small" style={{ marginTop: 0 }}>
              <strong>Submit quote</strong> is a preview until you sign in and production storage is configured — use{" "}
              <strong>Calculate</strong> for the main demo.
            </p>
          ) : null}

          {usedFallback ? (
            <div className="fallback-banner" role="status">
              {demoResult?.fallbackLabel ?? "Demo calculation fallback — backend not connected."}
            </div>
          ) : null}

          {calcError ? <p className="error">{calcError}</p> : null}

          <section className="card">
            <p className="section-lead">Full breakdown</p>
            <h2>{quoteMode === "public" ? "Your estimate" : "Internal detail"}</h2>
            {quoteMode === "partner" ? (
              <div className="internal-banner">
                <strong>Internal demo detail — not public-facing.</strong> Wholesale and line economics below are for staff
                discussion only.
              </div>
            ) : null}
            {quoteMode === "public" ? (
              <>
                {apiPublic ? (
                  <ul className="kv">
                    <li>
                      <span>Estimated retail quote</span>
                      <strong>${Number(apiPublic.totals?.retail ?? 0).toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Estimated sq ft</span>
                      <strong>{Number(apiPublic.totals?.estimated_sqft ?? 0).toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Material group</span>
                      <strong>{materialGroup}</strong>
                    </li>
                  </ul>
                ) : demoResult ? (
                  <ul className="kv">
                    <li>
                      <span>Estimated retail quote</span>
                      <strong>${demoResult.retail.toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Estimated sq ft</span>
                      <strong>{demoResult.estimated_sqft.toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Material group</span>
                      <strong>{demoResult.materialGroup}</strong>
                    </li>
                    <li>
                      <span>Add-ons included</span>
                      <strong>{demoResult.addOnsSummary.join(" · ")}</strong>
                    </li>
                  </ul>
                ) : (
                  <p className="muted">Tap <strong>Calculate</strong> to see your estimate.</p>
                )}
                <p className="callout" style={{ marginTop: 16 }}>
                  Public retail pricing includes at least <strong>25% protection</strong> over dealer/partner pricing.
                </p>
              </>
            ) : (
              <>
                {apiPartner?.totals ? (
                  <ul className="kv">
                    <li>
                      <span>Wholesale estimate</span>
                      <strong>${Number(apiPartner.totals.wholesale ?? 0).toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Retail (display)</span>
                      <strong>${Number(apiPartner.totals.retail ?? 0).toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Display profit</span>
                      <strong>${Number(apiPartner.totals.profit ?? 0).toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Estimated sq ft</span>
                      <strong>{Number(apiPartner.totals.estimated_sqft ?? 0).toFixed(2)}</strong>
                    </li>
                  </ul>
                ) : demoResult ? (
                  <ul className="kv">
                    <li>
                      <span>Wholesale estimate</span>
                      <strong>${(demoResult.wholesale ?? 0).toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Retail (display)</span>
                      <strong>${demoResult.retail.toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Display profit</span>
                      <strong>${(demoResult.profit ?? 0).toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Estimated sq ft</span>
                      <strong>{demoResult.estimated_sqft.toFixed(2)}</strong>
                    </li>
                    <li>
                      <span>Material group</span>
                      <strong>{demoResult.materialGroup}</strong>
                    </li>
                  </ul>
                ) : (
                  <p className="muted">Tap <strong>Calculate</strong> to see your estimate.</p>
                )}
                {(apiPartner?.warnings?.length ?? 0) + (demoResult?.warnings?.length ?? 0) > 0 ? (
                  <div className="warn-box">
                    <strong>Heads up</strong>
                    <ul>
                      {(apiPartner?.warnings ?? demoResult?.warnings ?? []).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {apiPartner?.snapshot?.lineItems && Array.isArray(apiPartner.snapshot.lineItems) ? (
                  <div className="lines">
                    <strong>Line items</strong>
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>$/unit</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apiPartner.snapshot.lineItems.map((ln, i) => (
                          <tr key={i}>
                            <td>{String(ln.item_name ?? "")}</td>
                            <td>{String(ln.quantity ?? "")}</td>
                            <td>${Number(ln.unit_price ?? 0).toFixed(2)}</td>
                            <td>${Number(ln.line_subtotal ?? 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : demoResult?.lineItems.length ? (
                  <div className="lines">
                    <strong>Line items (demo)</strong>
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>$/unit</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {demoResult.lineItems.map((ln, i) => (
                          <tr key={i}>
                            <td>{ln.item_name}</td>
                            <td>{ln.quantity}</td>
                            <td>${ln.unit_price.toFixed(2)}</td>
                            <td>${ln.line_subtotal.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <p className="muted small">
                  Partner view uses the same engine as the partner portal; display markup is for illustration only.
                </p>
              </>
            )}
            <p style={{ marginTop: 14 }}>
              <strong>Confidence:</strong>{" "}
              {apiPublic
                ? "Live calculation (public-safe)."
                : apiPartner
                  ? "Live calculation — review notes above."
                  : demoResult?.confidence ?? "—"}
            </p>
            <p>
              <strong>Review suggested:</strong>{" "}
              {demoResult?.reviewNeeded === false ? "No" : demoResult ? "Yes" : "—"}
            </p>
          </section>

          <section className="card">
            <h2>Save quote</h2>
            {submitMsg ? <p>{submitMsg}</p> : <p className="muted">Submit saves to eOS when you’re signed in and quote tables are installed.</p>}
            {submitPreview ? <pre className="preview">{submitPreview}</pre> : null}
          </section>

          <section className="card notes">
            <h2>What this proves</h2>
            <ul>
              <li>Pricing is moving into Supabase and the eOS Brain — structures and rules replace static HTML spreadsheets.</li>
              <li>
                <strong>Public retail</strong> protects dealers with at least <strong>25%+</strong> markup on the economics
                the calculator uses.
              </li>
              <li>Partners can be assigned pricing structures in System Admin (quote pricing APIs).</li>
              <li>Monday.com quote tracking is <strong>staged</strong> — sync logs first, live API when configured.</li>
              <li>
                Quotes feed <strong>forecast</strong>, bid/close ratio, total quote value, salesperson, branch, and partner
                analytics.
              </li>
              <li>
                Future <strong>AI Takeoff</strong> and <strong>Visualize</strong> are already planned in the data model (see{" "}
                <code>docs/quote-platform/ai-takeoff-and-visualize-plan.md</code>).
              </li>
            </ul>
          </section>
        </div>

        <aside className="side-col">
          {showSummary ? (
            <div className="summary-card">
              {quoteMode === "public" && pubRetail != null ? (
                <>
                  <h2>Your estimate</h2>
                  <p className="summary-kicker">Estimated retail quote</p>
                  <p className="summary-hero-value">${Number(pubRetail).toFixed(2)}</p>
                  <div className="summary-rows">
                    <div className="summary-row">
                      <span>Estimated sq ft</span>
                      <strong>{Number(pubSqft ?? 0).toFixed(2)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Material group</span>
                      <strong>{pubMaterial}</strong>
                    </div>
                  </div>
                  <div className="protection-badge">25%+ dealer protection applied</div>
                  <p className="summary-foot">
                    Public retail pricing includes at least 25% protection over dealer/partner pricing.
                  </p>
                  {lastCalcLive ? <p className="summary-foot">Live API response</p> : null}
                </>
              ) : null}
              {quoteMode === "partner" && partRetail != null ? (
                <>
                  <h2>Your estimate</h2>
                  <p className="summary-kicker">Estimated quote total</p>
                  <p className="summary-hero-value">${Number(partRetail).toFixed(2)}</p>
                  <div className="summary-rows">
                    {partWholesale != null ? (
                      <div className="summary-row">
                        <span>Wholesale estimate</span>
                        <strong>${Number(partWholesale).toFixed(2)}</strong>
                      </div>
                    ) : null}
                    <div className="summary-row">
                      <span>Retail / protected (display)</span>
                      <strong>${Number(partRetail).toFixed(2)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Estimated sq ft</span>
                      <strong>{Number(partSqft ?? 0).toFixed(2)}</strong>
                    </div>
                  </div>
                  <div className="internal-badge">Internal / demo — not public-facing</div>
                  <p className="summary-foot">Shown for staff discussion; not homeowner-facing.</p>
                  {lastCalcLive ? <p className="summary-foot">Live API response</p> : null}
                </>
              ) : null}
            </div>
          ) : (
            <div className="summary-card">
              <h2>Your estimate</h2>
              <p className="muted" style={{ margin: 0 }}>
                Enter details on the left, then tap <strong>Calculate</strong> to see your summary here.
              </p>
            </div>
          )}
        </aside>
      </div>

      <footer className="footer">eOS Quote · Elite Stone Fabrication · {new Date().getFullYear()}</footer>
    </div>
  );
}
