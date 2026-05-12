import React, { useCallback, useState } from "react";
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

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Supabase is not configured — use demo fallback for calculate.");
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
        setSubmitMsg("Sign in with Supabase to submit a live quote — preview only below.");
        setSubmitPreview(JSON.stringify({ ...payload, _demo: true }, null, 2));
        return;
      }

      const raw = (await apiPostJson("/api/quote/submit", sessionToken, payload)) as Record<string, unknown>;
      if (raw.ok === true) {
        setSubmitMsg(`Submitted successfully. Quote # ${String(raw.quoteNumber ?? "")}`);
        setSubmitPreview(JSON.stringify(raw, null, 2));
      } else {
        setSubmitMsg(String(raw.error || "Submit failed"));
        setSubmitPreview(JSON.stringify(raw, null, 2));
      }
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown> | string | null;
        let parsed: Record<string, unknown> | null = null;
        if (body && typeof body === "object") parsed = body as Record<string, unknown>;
        const installed = parsed?.installed === false;
        if (e.status === 503 || installed) {
          setSubmitMsg("Quote tables are not installed in Supabase yet — demo JSON preview only.");
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

  return (
    <div className="page">
      <header className="header">
        <img className="logo" src={EOS_LOGO_URL} alt="Elite Stone Fabrication" />
        <div>
          <h1 className="title">Quote Demo</h1>
          <p className="subtitle">Partner quoting platform preview · Not production</p>
        </div>
      </header>

      <div className="banner">
        <strong>API:</strong> <code>{backendHint}</code>
        {liveApi ? (
          <span className="pill ok">Live calculate/submit</span>
        ) : (
          <span className="pill warn">Demo fallback (sign in for live)</span>
        )}
      </div>

      {supabase ? (
        <section className="card">
          <h2>Sign in (optional)</h2>
          <p className="muted">Use your eOS Supabase user to call the real quote API. Without sign-in, Calculate uses the labeled prototype fallback.</p>
          {sessionToken ? (
            <div className="row">
              <span className="pill ok">Signed in</span>
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
        <section className="card muted">
          <h2>Supabase not configured</h2>
          <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> for live API. Calculate still works via demo fallback.</p>
        </section>
      )}

      <section className="card">
        <h2>1. Quote mode</h2>
        <div className="mode-row">
          <button
            type="button"
            className={`btn big ${quoteMode === "public" ? "primary" : "secondary"}`}
            onClick={() => setQuoteMode("public")}
          >
            Public Retail
          </button>
          <button
            type="button"
            className={`btn big ${quoteMode === "partner" ? "primary" : "secondary"}`}
            onClick={() => setQuoteMode("partner")}
          >
            Partner / Internal Demo
          </button>
        </div>
        {quoteMode === "public" ? (
          <p className="callout">
            Retail pricing includes at least <strong>25% protection</strong> over partner/dealer pricing. Wholesale and line
            detail are hidden in this mode.
          </p>
        ) : (
          <p className="callout internal">
            <strong>Internal / demo only</strong> — wholesale-style economics and line items may be shown for discussion. Do
            not share externally as final pricing.
          </p>
        )}
      </section>

      <section className="card">
        <h2>2. Customer &amp; project</h2>
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
        <h2>3. Materials &amp; add-ons</h2>
        <label className="check">
          <input type="checkbox" checked={useRooms} onChange={(e) => setUseRooms(e.target.checked)} />
          Use simple room input (single room)
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
              Room material group
              <select value={roomGroup} onChange={(e) => setRoomGroup(e.target.value)}>
                {MATERIAL_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Room countertop sq ft
              <input value={roomCt} onChange={(e) => setRoomCt(e.target.value)} />
            </label>
            <label>
              Room backsplash sq ft
              <input value={roomBs} onChange={(e) => setRoomBs(e.target.value)} />
            </label>
          </div>
        )}

        <h3 className="h3">Add-ons (quantities)</h3>
        <div className="grid3">
          <label>
            Kitchen sink cutouts
            <input value={sink} onChange={(e) => setSink(e.target.value)} />
          </label>
          <label>
            Vanity/bar sink cutouts
            <input value={bar} onChange={(e) => setBar(e.target.value)} />
          </label>
          <label>
            Cooktop cutouts
            <input value={cook} onChange={(e) => setCook(e.target.value)} />
          </label>
          <label>
            Outlet cutouts
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
            Partner retail display markup %
            <input value={partnerRetailPct} onChange={(e) => setPartnerRetailPct(e.target.value)} style={{ maxWidth: 120 }} />
          </label>
        ) : null}
      </section>

      <div className="actions">
        <button type="button" className="btn primary big" disabled={calcBusy} onClick={() => void handleCalculate()}>
          {calcBusy ? "Calculating…" : "Calculate"}
        </button>
        <button type="button" className="btn secondary big" disabled={submitBusy} onClick={() => void handleSubmit()}>
          {submitBusy ? "Submitting…" : "Submit quote"}
        </button>
      </div>

      {usedFallback ? (
        <div className="fallback-banner" role="status">
          {demoResult?.fallbackLabel ?? "Demo calculation fallback — backend not connected."}
        </div>
      ) : null}

      {calcError ? <p className="error">{calcError}</p> : null}

      <section className="card results">
        <h2>7. Results</h2>
        {quoteMode === "public" ? (
          <>
            {apiPublic ? (
              <ul className="kv">
                <li>
                  <span>Estimated total (retail)</span>
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
                <li>
                  <span>Add-ons</span>
                  <strong className="muted">Line detail omitted in public retail API response</strong>
                </li>
              </ul>
            ) : demoResult ? (
              <ul className="kv">
                <li>
                  <span>Estimated total (retail)</span>
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
                  <span>Add-ons</span>
                  <strong>{demoResult.addOnsSummary.join(" · ")}</strong>
                </li>
              </ul>
            ) : (
              <p className="muted">Run Calculate to see results.</p>
            )}
            <p className="callout">
              Retail pricing includes at least <strong>25% protection</strong> over partner/dealer pricing.
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
                  <span>Profit (display)</span>
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
                  <span>Profit (display)</span>
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
              <p className="muted">Run Calculate to see results.</p>
            )}
            {(apiPartner?.warnings?.length ?? 0) + (demoResult?.warnings?.length ?? 0) > 0 ? (
              <div className="warn-box">
                <strong>Warnings</strong>
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
                      <th>Name</th>
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
                      <th>Name</th>
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
              Calculation notes: partner mode uses the same engine as the partner portal prototype; retail display applies
              markup % for demo only.
            </p>
          </>
        )}
        <p>
          <strong>Quote confidence:</strong>{" "}
          {apiPublic
            ? "Live engine (public-safe response)."
            : apiPartner
              ? "Live engine — review inputs and warnings above."
              : demoResult?.confidence ?? "—"}
        </p>
        <p>
          <strong>Review needed:</strong> {demoResult?.reviewNeeded === false ? "No" : demoResult ? "Yes" : "—"}
        </p>
      </section>

      <section className="card">
        <h2>8. Submit status</h2>
        {submitMsg ? <p>{submitMsg}</p> : <p className="muted">Submit sends to POST /api/quote/submit when signed in.</p>}
        {submitPreview ? <pre className="preview">{submitPreview}</pre> : null}
      </section>

      <section className="card notes">
        <h2>9. Meeting demo notes</h2>
        <ul>
          <li>Pricing is moving into Supabase and the eOS Brain — structures and rules replace static HTML spreadsheets.</li>
          <li>
            <strong>Public retail</strong> protects dealers with at least <strong>25%+</strong> markup on the economics the
            calculator uses.
          </li>
          <li>Partners can be assigned pricing structures in System Admin (quote pricing APIs).</li>
          <li>Monday.com quote tracking is <strong>staged</strong> — sync logs first, live API when configured.</li>
          <li>
            Quotes feed <strong>forecast</strong>, bid/close ratio, total quote value, salesperson, branch, and partner
            analytics pipelines.
          </li>
          <li>
            Future <strong>AI Takeoff</strong> and <strong>Visualize</strong> are already planned in the data model (see{" "}
            <code>docs/quote-platform/ai-takeoff-and-visualize-plan.md</code>).
          </li>
        </ul>
      </section>

      <footer className="footer">eOS Quote Demo · eliteOS · {new Date().getFullYear()}</footer>
    </div>
  );
}
