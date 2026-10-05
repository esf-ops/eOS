/**
 * Authorization for the QuickBooks estimate routes through the real Quote Library stack:
 * real rejectPartnerOnlyUser, requireHeadAccess and organization resolution. Only the
 * Supabase token check is replaced; it loads user_profiles and fills req.user the way
 * requireAuth's attachUser does.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { attachQuoteLibraryRoutes } from "./quoteLibraryApi.js";
import { requireHeadAccess } from "../auth/headAccessMiddleware.js";
import { DEFAULT_ORGANIZATION_KEY } from "../organizations/organizationContext.js";
import { fakeSupabase, fixtureTables, ID_LEAK, ORG, OTHER_ORG } from "./quoteLibraryQuickbooksEstimates.testFixtures.mjs";

// Keep the real audit logger from ever reaching a database from this test.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const ORG_A_ESTIMATE = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B_ESTIMATE = "aaaaaaaa-0000-4000-8000-000000000005";
const MISSING_ORG = "99999999-9999-4999-8999-999999999999";

const profile = (id, extra = {}) => ({
  id,
  email: `${id}@example.test`,
  role: "estimator",
  is_active: true,
  user_kind: "internal",
  organization_id: ORG,
  ...extra
});

function tables() {
  return {
    ...fixtureTables(),
    organizations: [
      { id: ORG, organization_key: DEFAULT_ORGANIZATION_KEY, display_name: "Org A (default)" },
      { id: OTHER_ORG, organization_key: "tenant_b", display_name: "Org B" }
    ],
    user_profiles: [
      profile("staff-a"),
      profile("staff-b", { organization_id: OTHER_ORG }),
      profile("no-head"),
      profile("partner", { user_kind: "dealer_partner" }),
      profile("inactive", { is_active: false }),
      profile("admin-a", { role: "admin" }),
      profile("no-org", { organization_id: null }),
      profile("bad-org", { organization_id: MISSING_ORG })
    ],
    user_head_access: [
      { user_id: "staff-a", head_slug: "quote_library" },
      { user_id: "staff-b", head_slug: "quote_library" },
      { user_id: "no-head", head_slug: "account_directory" },
      { user_id: "partner", head_slug: "quote_library" },
      { user_id: "inactive", head_slug: "quote_library" },
      { user_id: "no-org", head_slug: "quote_library" },
      { user_id: "bad-org", head_slug: "quote_library" }
    ]
  };
}

function profileLoadingRequireAuth(getSupabase) {
  return () => async (req, res, next) => {
    const m = /^Bearer tok:(.+)$/.exec(String(req.headers.authorization || ""));
    if (!req.headers.authorization) return res.status(401).json({ ok: false, error: "Missing bearer token" });
    if (!m) return res.status(401).json({ ok: false, error: "Invalid token" });
    const { data } = await getSupabase().from("user_profiles").select("*").eq("id", m[1]).limit(1);
    const p = data?.[0];
    if (!p) return res.status(401).json({ ok: false, error: "Invalid token" });
    req.user = {
      id: p.id,
      email: p.email,
      role: p.role || "viewer",
      organization_id: p.organization_id || null,
      user_kind: p.user_kind || "internal",
      isActive: p.is_active !== false
    };
    if (!req.user.isActive) return res.status(403).json({ ok: false, error: "User inactive" });
    next();
  };
}

async function withRealStack(fn) {
  const getSupabase = () => fakeSupabase(tables());
  const app = express();
  attachQuoteLibraryRoutes(app, { requireAuth: profileLoadingRequireAuth(getSupabase), requireHeadAccess, getSupabase });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/quote-library/quickbooks`;
  const get = (path, user, headers = {}) =>
    fetch(base + path, { headers: { ...(user ? { authorization: `Bearer tok:${user}` } : {}), ...headers } });
  try {
    await fn(get);
  } finally {
    server.close();
  }
}

const ROUTES = ["/estimates", "/estimates/export", "/freshness", `/estimates/${ORG_A_ESTIMATE}`];

test("unauthenticated, partner, inactive and no-head-access callers are refused on every route", async () => {
  await withRealStack(async (get) => {
    for (const p of ROUTES) {
      assert.equal((await get(p, null)).status, 401, `no token ${p}`);
      assert.equal((await get(p, null, { authorization: "Bearer junk" })).status, 401, `bad token ${p}`);
      assert.equal((await get(p, "ghost")).status, 401, `unknown user ${p}`);
      const partner = await get(p, "partner");
      assert.equal(partner.status, 403, `partner ${p}`);
      assert.equal((await partner.json()).code, "partner_use_partner_routes");
      assert.equal((await get(p, "inactive")).status, 403, `inactive ${p}`);
      const noHead = await get(p, "no-head");
      assert.equal(noHead.status, 403, `no head ${p}`);
      assert.equal((await noHead.json()).error, "You do not have access to this head.");
    }
  });
});

test("granted staff and admins without an explicit grant are allowed", async () => {
  await withRealStack(async (get) => {
    for (const user of ["staff-a", "admin-a"]) {
      const r = await get("/estimates", user);
      assert.equal(r.status, 200, user);
      assert.equal((await r.json()).total, 3, user);
    }
  });
});

test("cross-organization: each org sees only its own estimates; other-org ids are 404", async () => {
  await withRealStack(async (get) => {
    const b = await (await get("/estimates", "staff-b")).json();
    assert.deepEqual(b.rows.map((r) => r.estimateNumber), ["26-300"]);
    assert.equal(b.summary.value, 9999);
    assert.doesNotMatch(JSON.stringify(b), ID_LEAK);

    assert.equal((await get(`/estimates/${ORG_A_ESTIMATE}`, "staff-b")).status, 404);
    const own = await get(`/estimates/${ORG_B_ESTIMATE}`, "staff-b");
    assert.equal(own.status, 200);
    assert.equal((await own.json()).linesStatus, "not_in_snapshot", "org A's snapshot is never used for org B");

    const a = await (await get("/estimates", "staff-a")).json();
    assert.ok(!a.rows.some((r) => r.estimateNumber === "26-300"));
    assert.equal((await get(`/estimates/${ORG_B_ESTIMATE}`, "staff-a")).status, 404);
    assert.equal((await get(`/estimates/${ORG_B_ESTIMATE}`, "admin-a")).status, 404, "admin bypass is head access only, not org scope");

    const csv = await (await get("/estimates/export", "staff-b")).text();
    assert.match(csv, /26-300/);
    assert.doesNotMatch(csv, /26-100|26-101|26-200/);

    const fresh = await (await get("/freshness", "staff-b")).json();
    assert.equal(fresh.estimates.from, "2026-05-02");
    assert.equal(fresh.estimates.refreshWindowStart, "2026-09-01");
    assert.equal(fresh.lineItems.snapshotAt, null);
  });
});

test("organization cannot be chosen by header or query, and the default-org fallback is refused", async () => {
  await withRealStack(async (get) => {
    const override = { "x-organization-key": DEFAULT_ORGANIZATION_KEY };
    const b = await (await get(`/estimates?organization_key=${DEFAULT_ORGANIZATION_KEY}`, "staff-b", override)).json();
    assert.deepEqual(b.rows.map((r) => r.estimateNumber), ["26-300"]);

    for (const user of ["no-org", "bad-org"]) {
      for (const p of ROUTES) {
        const r = await get(p, user, override);
        assert.equal(r.status, 403, `${user} ${p}`);
        assert.equal((await r.json()).code, "organization_required");
      }
    }
  });
});
