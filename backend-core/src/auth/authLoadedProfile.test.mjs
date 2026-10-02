/**
 * requireAuth's user_profiles read is reused by assertInternalQuoteOperator and
 * resolveOrganizationContext for the same request — and only for that request.
 * Runs the real middleware against a loopback stand-in for Supabase Auth + PostgREST.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const ORG_DEFAULT = { id: "00000000-0000-4000-8000-0000000000d0", organization_key: "elite_stone_fabrication", display_name: "Default" };
const ORG_TENANT = { id: "00000000-0000-4000-8000-0000000000a1", organization_key: "tenant_a", display_name: "Tenant A" };
const USERS = {
  "good-internal": { id: "10000000-0000-4000-8000-000000000001", user_kind: "internal", organization_id: ORG_TENANT.id },
  "good-partner": { id: "10000000-0000-4000-8000-000000000002", user_kind: "dealer_partner", organization_id: ORG_TENANT.id },
  "good-noorg": { id: "10000000-0000-4000-8000-000000000003", user_kind: null, organization_id: null }
};
const profileRow = (u) => ({
  id: u.id,
  email: `${u.id}@example.test`,
  full_name: "Test",
  role: "sales",
  department: null,
  is_active: true,
  user_kind: u.user_kind,
  last_login_at: null,
  organization_id: u.organization_id,
  job_title: null
});

const calls = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const table = url.pathname.replace(/^\/(rest|auth)\/v1\//, "");
  calls.push(table);
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/auth/v1/user") {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const u = USERS[token];
    return u ? send(200, { id: u.id, email: `${u.id}@example.test`, aud: "authenticated" }) : send(401, { msg: "bad jwt" });
  }
  const eq = (col) => (url.searchParams.get(col) || "").replace(/^eq\./, "");
  if (table === "user_profiles") {
    const u = Object.values(USERS).find((x) => x.id === eq("id"));
    return send(200, u ? [profileRow(u)] : []);
  }
  if (table === "organizations") {
    const all = [ORG_DEFAULT, ORG_TENANT];
    const rows = eq("id") ? all.filter((o) => o.id === eq("id")) : all.filter((o) => o.organization_key === eq("organization_key"));
    return send(200, rows);
  }
  send(404, { message: "not found" });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const { requireAuth, authLoadedProfileFor } = await import("./authMiddleware.js");
const { assertInternalQuoteOperator } = await import("../quotes/partnerContext.js");
const { resolveOrganizationContext } = await import("../organizations/organizationContext.js");
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.SUPABASE_URL, "test-service-role", {
  auth: { persistSession: false, autoRefreshToken: false }
});

test.after(() => server.close());

async function authenticate(token) {
  const req = { header: (n) => (n.toLowerCase() === "authorization" ? `Bearer ${token}` : undefined), headers: {}, query: {} };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  let passed = false;
  await requireAuth()(req, res, () => {
    passed = true;
  });
  return { req, res, passed };
}

test("internal user: operator check and org context reuse the auth profile read", async () => {
  calls.length = 0;
  const { req, passed } = await authenticate("good-internal");
  assert.equal(passed, true);
  assert.deepEqual(calls, ["user", "user_profiles"]);

  calls.length = 0;
  await assertInternalQuoteOperator(req, db);
  const ctx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
  assert.equal(ctx.organizationId, ORG_TENANT.id);
  assert.equal(ctx.source, "user_profile");
  assert.deepEqual(calls.sort(), ["organizations", "organizations"]);
});

test("dealer partner is still refused, without an extra profile query", async () => {
  const { req } = await authenticate("good-partner");
  calls.length = 0;
  await assert.rejects(assertInternalQuoteOperator(req, db), (e) => e.statusCode === 403 && e.code === "partner_use_partner_routes");
  assert.deepEqual(calls, []);
});

test("user without organization falls back to the default org exactly as before", async () => {
  const { req } = await authenticate("good-noorg");
  calls.length = 0;
  await assertInternalQuoteOperator(req, db);
  const ctx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
  assert.equal(ctx.organizationId, ORG_DEFAULT.id);
  assert.equal(ctx.source, "default_authenticated");
  assert.deepEqual(calls, ["organizations"]);
});

test("a request not authenticated by requireAuth still queries user_profiles", async () => {
  const req = { user: { id: USERS["good-partner"].id, user_kind: "internal" }, headers: {}, query: {} };
  assert.equal(authLoadedProfileFor(req), null);
  calls.length = 0;
  await assert.rejects(assertInternalQuoteOperator(req, db), (e) => e.statusCode === 403);
  const ctx = await resolveOrganizationContext({ req, supabase: db, mode: "authenticated" });
  assert.equal(ctx.organizationId, ORG_TENANT.id);
  assert.deepEqual(calls, ["user_profiles", "organizations", "user_profiles", "organizations"]);
});

test("the loaded profile is ignored if req.user is swapped to another user", async () => {
  const { req } = await authenticate("good-internal");
  req.user = { ...req.user, id: USERS["good-partner"].id };
  assert.equal(authLoadedProfileFor(req), null);
  await assert.rejects(assertInternalQuoteOperator(req, db), (e) => e.statusCode === 403);
});

test("invalid token is rejected before any profile read", async () => {
  calls.length = 0;
  const { res, passed } = await authenticate("bad-token");
  assert.equal(passed, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(calls, ["user"]);
});
