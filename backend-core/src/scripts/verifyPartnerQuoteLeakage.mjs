/**
 * Partner Quote leakage verification — DB-backed API + row checks.
 *
 * Requires explicit env (see docs/quote-platform/partner-quote-leakage-verification.md).
 * Writes two test partner_quote rows when submit tests run.
 *
 * Run (from repo root, backend-core .env loaded):
 *   PARTNER_LEAK_TEST_CONFIRM=yes node backend-core/src/scripts/verifyPartnerQuoteLeakage.mjs
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function optionalEnv(name) {
  return String(process.env[name] ?? "").trim() || null;
}

function loadConfig() {
  if (String(process.env.PARTNER_LEAK_TEST_CONFIRM ?? "").trim() !== "yes") {
    throw new Error(
      "Refusing to run: set PARTNER_LEAK_TEST_CONFIRM=yes (this script submits test partner_quote rows). See docs/quote-platform/partner-quote-leakage-verification.md"
    );
  }
  const partnerA = requiredEnv("PARTNER_LEAK_PARTNER_A_ID");
  const partnerB = requiredEnv("PARTNER_LEAK_PARTNER_B_ID");
  if (!UUID_RE.test(partnerA) || !UUID_RE.test(partnerB)) {
    throw new Error("PARTNER_LEAK_PARTNER_A_ID and PARTNER_LEAK_PARTNER_B_ID must be valid UUIDs");
  }
  if (partnerA === partnerB) {
    throw new Error("PARTNER_LEAK_PARTNER_A_ID and PARTNER_LEAK_PARTNER_B_ID must differ");
  }
  return {
    supabaseUrl: requiredEnv("SUPABASE_URL"),
    anonKey: requiredEnv("SUPABASE_ANON_KEY"),
    serviceKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    apiBase: String(process.env.EOS_API_BASE_URL ?? "http://localhost:3001").trim().replace(/\/+$/, ""),
    userA: {
      email: requiredEnv("PARTNER_LEAK_USER_A_EMAIL"),
      password: requiredEnv("PARTNER_LEAK_USER_A_PASSWORD")
    },
    userB: {
      email: requiredEnv("PARTNER_LEAK_USER_B_EMAIL"),
      password: requiredEnv("PARTNER_LEAK_USER_B_PASSWORD")
    },
    partnerA,
    partnerB,
    orgId: optionalEnv("PARTNER_LEAK_ORGANIZATION_ID"),
    skipSubmit: String(process.env.PARTNER_LEAK_SKIP_SUBMIT ?? "").trim() === "1",
    markerPrefix: String(process.env.PARTNER_LEAK_MARKER_PREFIX ?? "PARTNER_LEAK_TEST").trim() || "PARTNER_LEAK_TEST"
  };
}

function adminClient(cfg) {
  return createClient(cfg.supabaseUrl, cfg.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function anonClient(cfg) {
  return createClient(cfg.supabaseUrl, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function signIn(cfg, email, password) {
  const sb = anonClient(cfg);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  const token = data?.session?.access_token;
  const userId = data?.user?.id;
  if (!token || !userId) throw new Error(`No session for ${email}`);
  return { token, userId, email };
}

async function apiJson(method, cfg, path, token, body = null) {
  const url = `${cfg.apiBase}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/json"
  };
  if (body != null) headers["content-type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 500) };
  }
  return { status: res.status, ok: res.ok, json };
}

function assertForbidden(label, res, expectedCodes = []) {
  assert.ok(res.status === 403 || res.status === 404, `${label}: expected 403/404, got ${res.status} body=${JSON.stringify(res.json)}`);
  const code = String(res.json?.code ?? "");
  if (expectedCodes.length && code) {
    assert.ok(expectedCodes.includes(code), `${label}: expected code in ${expectedCodes.join(", ")}, got ${code} body=${JSON.stringify(res.json)}`);
  }
}

/** Internal/library/generic routes must not be usable by dealer_partner test users. */
function assertDealerBlockedFromInternalRoute(label, res) {
  assert.equal(res.status, 403, `${label}: expected 403, got ${res.status} body=${JSON.stringify(res.json)}`);
  const code = String(res.json?.code ?? "");
  const err = String(res.json?.error ?? "");
  const safe =
    code === "partner_use_partner_routes" ||
    (code === "forbidden" && /partner-quote routes/i.test(err)) ||
    (!code && /do not have access to this head/i.test(err));
  assert.ok(
    safe,
    `${label}: unsafe or unexpected block — need partner_use_partner_routes or documented head denial. code=${JSON.stringify(code)} error=${JSON.stringify(err)} body=${JSON.stringify(res.json)}`
  );
}

function assertPartnerSafeCalculate(label, json) {
  assert.equal(json?.display, "partner_quote_safe", `${label}: display must be partner_quote_safe`);
  const totals = json?.totals ?? {};
  assert.ok(!("wholesale" in totals), `${label}: totals must not expose wholesale`);
  assert.ok(!("profit" in totals), `${label}: totals must not expose profit`);
  const snap = json?.snapshot ?? {};
  assert.ok(!("internal_ui" in snap), `${label}: snapshot must not expose internal_ui`);
  assert.ok(!("ruleCount" in snap), `${label}: snapshot must not expose ruleCount`);
  const blob = JSON.stringify(json);
  assert.ok(!/"wholesale"\s*:/i.test(blob), `${label}: JSON must not include wholesale field`);
  assert.ok(!/"profit"\s*:/i.test(blob), `${label}: JSON must not include profit field`);
}

function minimalPartnerPayload(marker, materialGroup = "Group B") {
  return {
    engine: "rooms",
    materialGroup,
    customer_name: marker,
    project_name: "Partner leak verification",
    rooms: [
      {
        name: "Leak test area",
        materialGroup,
        countertopSqft: 12,
        backsplashSqft: 0,
        calcMode: "Manual Sq Ft"
      }
    ]
  };
}

async function preflight(cfg, admin, userA, userB) {
  const { data: pa, error: paErr } = await admin.from("quote_partner_accounts").select("id,organization_id,account_slug").eq("id", cfg.partnerA).limit(1);
  if (paErr) throw paErr;
  if (!pa?.[0]) throw new Error(`Partner A not found: ${cfg.partnerA}`);
  const { data: pb, error: pbErr } = await admin.from("quote_partner_accounts").select("id,organization_id,account_slug").eq("id", cfg.partnerB).limit(1);
  if (pbErr) throw pbErr;
  if (!pb?.[0]) throw new Error(`Partner B not found: ${cfg.partnerB}`);

  const orgA = pa[0].organization_id ? String(pa[0].organization_id) : null;
  const orgB = pb[0].organization_id ? String(pb[0].organization_id) : null;
  if (orgA && orgB && orgA !== orgB) {
    throw new Error("Partner A and B must share the same organization_id for this test");
  }
  const orgId = cfg.orgId || orgA || orgB;
  if (cfg.orgId && orgA && cfg.orgId !== orgA) {
    throw new Error("PARTNER_LEAK_ORGANIZATION_ID does not match partner A organization_id");
  }

  for (const [label, uid, pid] of [
    ["A", userA.userId, cfg.partnerA],
    ["B", userB.userId, cfg.partnerB]
  ]) {
    const { data: prof } = await admin.from("user_profiles").select("user_kind,email").eq("id", uid).limit(1);
    const kind = String(prof?.[0]?.user_kind ?? "");
    if (kind !== "dealer_partner") {
      throw new Error(
        `User ${label} (${prof?.[0]?.email}) must have user_kind=dealer_partner for internal-route block tests (got ${kind || "unknown"})`
      );
    }
    const { data: heads } = await admin.from("user_head_access").select("head_slug").eq("user_id", uid);
    const slugs = new Set((heads || []).map((h) => h.head_slug));
    if (!slugs.has("partner_quote")) {
      throw new Error(`User ${label} missing user_head_access.partner_quote`);
    }
    const { data: access } = await admin
      .from("quote_partner_user_access")
      .select("partner_account_id,is_active,role")
      .eq("user_id", uid)
      .eq("is_active", true);
    const partnerIds = new Set((access || []).map((a) => String(a.partner_account_id)));
    if (!partnerIds.has(pid)) {
      throw new Error(`User ${label} missing active quote_partner_user_access for partner ${pid}`);
    }
    const { data: asn } = await admin
      .from("quote_partner_pricing_assignments")
      .select("id")
      .eq("partner_account_id", pid)
      .eq("is_active", true)
      .limit(1);
    if (!asn?.length) {
      throw new Error(`Partner ${label} (${pid}) has no active pricing assignment`);
    }
  }

  const { data: crossA } = await admin
    .from("quote_partner_user_access")
    .select("id")
    .eq("user_id", userA.userId)
    .eq("partner_account_id", cfg.partnerB)
    .eq("is_active", true)
    .limit(1);
  if (crossA?.length) {
    throw new Error("User A must NOT have active access to partner B (cross-access breaks isolation test)");
  }
  const { data: crossB } = await admin
    .from("quote_partner_user_access")
    .select("id")
    .eq("user_id", userB.userId)
    .eq("partner_account_id", cfg.partnerA)
    .eq("is_active", true)
    .limit(1);
  if (crossB?.length) {
    throw new Error("User B must NOT have active access to partner A");
  }

  console.log("[preflight] ok", {
    organization_id: orgId,
    partner_a_slug: pa[0].account_slug,
    partner_b_slug: pb[0].account_slug
  });
  return { orgId };
}

async function main() {
  const cfg = loadConfig();
  const admin = adminClient(cfg);
  const userA = await signIn(cfg, cfg.userA.email, cfg.userA.password);
  const userB = await signIn(cfg, cfg.userB.email, cfg.userB.password);
  await preflight(cfg, admin, userA, userB);

  const q = (partnerId) => `?partnerAccountId=${encodeURIComponent(partnerId)}`;
  const stamp = Date.now();
  const markerA = `${cfg.markerPrefix}_A_${stamp}`;
  const markerB = `${cfg.markerPrefix}_B_${stamp}`;

  let quoteIdA = null;
  let quoteIdB = null;

  // --- Context isolation ---
  {
    const res = await apiJson("GET", cfg, `/api/partner-quote/context${q(cfg.partnerA)}`, userA.token);
    assert.equal(res.status, 200, "User A context for partner A");
    assert.equal(String(res.json?.partner_account?.id ?? ""), cfg.partnerA, "User A context partner_account.id");
  }
  {
    const res = await apiJson("GET", cfg, `/api/partner-quote/context${q(cfg.partnerB)}`, userA.token);
    assertForbidden("User A context for partner B", res, ["partner_account_forbidden", "partner_context_denied"]);
  }
  {
    const res = await apiJson("GET", cfg, `/api/partner-quote/context${q(cfg.partnerB)}`, userB.token);
    assert.equal(res.status, 200, "User B context for partner B");
  }
  {
    const res = await apiJson("GET", cfg, `/api/partner-quote/context${q(cfg.partnerA)}`, userB.token);
    assertForbidden("User B context for partner A", res, ["partner_account_forbidden", "partner_context_denied"]);
  }
  console.log("[context] cross-partner denial ok");

  // --- Internal / library / generic quote routes (dealer_partner) ---
  for (const [label, token] of [
    ["A", userA.token],
    ["B", userB.token]
  ]) {
    const internalCalc = await apiJson("POST", cfg, "/api/internal-quotes/calculate", token, {
      quoteSource: "internal_quote",
      engine: "legacy",
      areas: { countertopSqft: 10, backsplashSqft: 0 },
      materialGroup: "Group B"
    });
    assertDealerBlockedFromInternalRoute(`${label} POST /api/internal-quotes/calculate`, internalCalc);
    if (String(internalCalc.json?.code ?? "") !== "partner_use_partner_routes") {
      console.warn(
        `[routes] ${label} internal-quotes/calculate blocked with code=${JSON.stringify(internalCalc.json?.code)} (acceptable if head denied before partner guard)`
      );
    }

    const library = await apiJson("GET", cfg, "/api/quote-library/quotes?page=1&pageSize=5", token);
    assertDealerBlockedFromInternalRoute(`${label} GET /api/quote-library/quotes`, library);

    const genericSubmit = await apiJson("POST", cfg, "/api/quote/submit", token, {
      quote_source: "partner_quote",
      partner_account_id: cfg.partnerA,
      engine: "rooms",
      rooms: [{ name: "X", materialGroup: "Group B", countertopSqft: 1, backsplashSqft: 0 }]
    });
    assertDealerBlockedFromInternalRoute(`${label} POST /api/quote/submit`, genericSubmit);
    assert.equal(
      String(genericSubmit.json?.code ?? ""),
      "partner_use_partner_routes",
      `${label} generic submit should use partner guard (no head middleware). body=${JSON.stringify(genericSubmit.json)}`
    );
  }
  console.log("[routes] dealer_partner blocked from internal/library/generic ok");

  // --- Calculate + submit ---
  if (!cfg.skipSubmit) {
    const calcA = await apiJson("POST", cfg, `/api/partner-quote/calculate${q(cfg.partnerA)}`, userA.token, {
      ...minimalPartnerPayload(markerA),
      partnerAccountId: cfg.partnerA
    });
    assert.equal(calcA.status, 200, "User A calculate");
    assertPartnerSafeCalculate("User A calculate", calcA.json);

    const submitA = await apiJson("POST", cfg, `/api/partner-quote/submit${q(cfg.partnerA)}`, userA.token, {
      ...minimalPartnerPayload(markerA),
      partnerAccountId: cfg.partnerA
    });
    assert.equal(submitA.status, 200, "User A submit");
    quoteIdA = submitA.json?.quote_id ?? submitA.json?.quoteId ?? null;
    assert.ok(quoteIdA, "User A submit must return quote_id");

    const calcB = await apiJson("POST", cfg, `/api/partner-quote/calculate${q(cfg.partnerB)}`, userB.token, {
      ...minimalPartnerPayload(markerB),
      partnerAccountId: cfg.partnerB
    });
    assert.equal(calcB.status, 200, "User B calculate");
    assertPartnerSafeCalculate("User B calculate", calcB.json);

    const submitB = await apiJson("POST", cfg, `/api/partner-quote/submit${q(cfg.partnerB)}`, userB.token, {
      ...minimalPartnerPayload(markerB),
      partnerAccountId: cfg.partnerB
    });
    assert.equal(submitB.status, 200, "User B submit");
    quoteIdB = submitB.json?.quote_id ?? submitB.json?.quoteId ?? null;
    assert.ok(quoteIdB, "User B submit must return quote_id");

    const { data: rowA, error: eA } = await admin
      .from("quote_headers")
      .select("id,quote_source,partner_account_id,customer_name,created_by_user_id")
      .eq("id", quoteIdA)
      .limit(1);
    if (eA) throw eA;
    assert.equal(rowA?.[0]?.quote_source, "partner_quote");
    assert.equal(String(rowA?.[0]?.partner_account_id), cfg.partnerA);
    assert.equal(rowA?.[0]?.customer_name, markerA);
    assert.equal(String(rowA?.[0]?.created_by_user_id), userA.userId);

    const { data: rowB, error: eB } = await admin
      .from("quote_headers")
      .select("id,quote_source,partner_account_id,customer_name,created_by_user_id")
      .eq("id", quoteIdB)
      .limit(1);
    if (eB) throw eB;
    assert.equal(rowB?.[0]?.quote_source, "partner_quote");
    assert.equal(String(rowB?.[0]?.partner_account_id), cfg.partnerB);
    assert.equal(rowB?.[0]?.customer_name, markerB);

    const snapA = await admin.from("quote_headers").select("calculation_snapshot").eq("id", quoteIdA).limit(1);
    const snapBlob = JSON.stringify(snapA?.data?.[0]?.calculation_snapshot ?? {});
    assert.ok(snapBlob.includes("wholesale") || snapBlob.includes("profit"), "DB snapshot may contain internal economics (server-only)");
    console.log("[submit] DB rows verified (snapshot internal economics allowed server-side only)");
  } else {
    console.log("[submit] skipped (PARTNER_LEAK_SKIP_SUBMIT=1)");
  }

  // --- My quotes scoping ---
  {
    const res = await apiJson("GET", cfg, `/api/partner-quote/my-quotes${q(cfg.partnerA)}`, userA.token);
    assert.equal(res.status, 200);
    const quotes = Array.isArray(res.json?.quotes) ? res.json.quotes : [];
    for (const row of quotes) {
      assert.ok(!("calculation_snapshot" in row), "my-quotes must not expose calculation_snapshot");
    }
    if (quoteIdB) {
      assert.ok(!quotes.some((r) => String(r.id) === String(quoteIdB)), "User A my-quotes must not include partner B quote");
    }
    if (quoteIdA) {
      assert.ok(quotes.some((r) => String(r.id) === String(quoteIdA)), "User A my-quotes must include submitted A quote");
    }
  }
  {
    const res = await apiJson("GET", cfg, `/api/partner-quote/my-quotes${q(cfg.partnerB)}`, userB.token);
    assert.equal(res.status, 200);
    const quotes = Array.isArray(res.json?.quotes) ? res.json.quotes : [];
    if (quoteIdA) {
      assert.ok(!quotes.some((r) => String(r.id) === String(quoteIdA)), "User B my-quotes must not include partner A quote");
    }
    if (quoteIdB) {
      assert.ok(quotes.some((r) => String(r.id) === String(quoteIdB)), "User B my-quotes must include submitted B quote");
    }
  }
  console.log("[my-quotes] cross-partner list isolation ok");

  console.log("\n[verifyPartnerQuoteLeakage] ALL CHECKS PASSED");
  if (quoteIdA || quoteIdB) {
    console.log("Test quote rows (optional cleanup):", { quoteIdA, quoteIdB, markerA, markerB });
  }
}

main().catch((e) => {
  console.error("\n[verifyPartnerQuoteLeakage] FAILED:", e?.message || e);
  process.exit(1);
});
