/**
 * Live Inventory share links — helpers + routes against an in-memory Supabase fake.
 * Run: node backend-core/src/liveInventory/liveInventoryShares.test.mjs
 */
import assert from "node:assert/strict";

import {
  attachLiveInventoryShareRoutes,
  createShareRateLimiter,
  generateShareToken,
  hashShareToken,
  parseShareCreateBody,
  shareState,
  snapshotShareItems,
} from "./liveInventoryShares.js";

console.log("\nliveInventoryShares.test.mjs\n");

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const P1 = "aaaaaaaa-0000-4000-8000-000000000001";
const P2 = "aaaaaaaa-0000-4000-8000-000000000002";
const P_OTHER_ORG = "bbbbbbbb-0000-4000-8000-000000000003";

// ── Pure helpers ────────────────────────────────────────────────────────────
{
  const { rawToken, tokenHash } = generateShareToken();
  assert.match(rawToken, /^[A-Za-z0-9_-]{43}$/, "256-bit base64url");
  assert.equal(tokenHash, hashShareToken(rawToken));
  assert.match(tokenHash, /^[0-9a-f]{64}$/);
  assert.notEqual(generateShareToken().rawToken, rawToken);
  console.log("ok: token generation + hashing");
}
{
  assert.equal(parseShareCreateBody({}).ok, false);
  assert.equal(parseShareCreateBody({ piece_ids: ["not-a-uuid"] }).ok, false);
  assert.equal(parseShareCreateBody({ piece_ids: [P1], expires_in_days: 365 }).ok, false);
  const tooMany = Array.from({ length: 61 }, (_, i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`);
  assert.equal(parseShareCreateBody({ piece_ids: tooMany }).ok, false);
  const ok = parseShareCreateBody({ piece_ids: [P2, P1, P2], title: "  Kitchen  ", message: "x".repeat(2000) });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.pieceIds, [P2, P1], "dedupe keeps order");
  assert.equal(ok.value.title, "Kitchen");
  assert.equal(ok.value.message.length, 1000);
  assert.equal(ok.value.expiresInDays, 30);
  assert.equal(ok.value.showContact, true);
  console.log("ok: create body validation");
}
{
  const t = Date.parse("2026-11-25T00:00:00Z");
  assert.equal(shareState({ expires_at: "2026-12-01T00:00:00Z" }, t), "active");
  assert.equal(shareState({ expires_at: "2026-11-01T00:00:00Z" }, t), "expired");
  assert.equal(shareState({ expires_at: "2026-12-01T00:00:00Z", revoked_at: "2026-11-20T00:00:00Z" }, t), "revoked");
  const rl = createShareRateLimiter(2, 1000);
  assert.equal(rl("ip", 0).allowed, true);
  assert.equal(rl("ip", 1).allowed, true);
  assert.equal(rl("ip", 2).allowed, false);
  assert.equal(rl("ip", 1001).allowed, true);
  console.log("ok: share state + rate limiter");
}

// ── In-memory Supabase fake ────────────────────────────────────────────────
function createFakeDb(tables) {
  const match = (row, f) => {
    if (f.op === "eq") return String(row[f.col]) === String(f.val);
    if (f.op === "in") return f.val.map(String).includes(String(row[f.col]));
    if (f.op === "is") return row[f.col] == null;
    return true;
  };
  return {
    tables,
    from(table) {
      const q = { table, filters: [], mode: "select", payload: null, single: false, limit: null, range: null };
      const exec = () => {
        const rows = (tables[table] ||= []);
        if (q.mode === "insert") {
          const row = { id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`, view_count: 0, created_at: "2026-11-25T00:00:00Z", ...q.payload };
          if (rows.some((r) => r.token_hash && r.token_hash === row.token_hash)) return { data: null, error: { message: "dup" } };
          rows.push(row);
          return { data: q.single ? row : [row], error: null };
        }
        let hit = rows.filter((r) => q.filters.every((f) => match(r, f)));
        if (q.mode === "update") {
          hit.forEach((r) => Object.assign(r, q.payload));
          return { data: hit, error: null };
        }
        if (q.range) hit = hit.slice(q.range[0], q.range[1] + 1);
        if (q.limit != null) hit = hit.slice(0, q.limit);
        return { data: q.single ? hit[0] ?? null : hit, error: null };
      };
      const api = {
        select() { return api; },
        insert(p) { q.mode = "insert"; q.payload = p; return api; },
        update(p) { q.mode = "update"; q.payload = p; return api; },
        eq(col, val) { q.filters.push({ op: "eq", col, val }); return api; },
        in(col, val) { q.filters.push({ op: "in", col, val }); return api; },
        is(col, val) { q.filters.push({ op: "is", col, val }); return api; },
        neq() { return api; },
        order() { return api; },
        limit(n) { q.limit = n; return api; },
        range(a, b) { q.range = [a, b]; return api; },
        single() { q.single = true; return api; },
        then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
      };
      return api;
    },
  };
}

function createFakeApp() {
  const routes = new Map();
  const add = (m) => (path, ...handlers) => routes.set(`${m} ${path}`, handlers.flat());
  return {
    get: add("GET"),
    post: add("POST"),
    async call(method, path, { params = {}, body, user = null, headers = {} } = {}) {
      const handlers = routes.get(`${method} ${path}`);
      assert.ok(handlers, `route ${method} ${path}`);
      const req = { params, body, user, headers, ip: "1.2.3.4", query: {} };
      const res = {
        statusCode: 200,
        headers: {},
        body: undefined,
        set(k, v) { this.headers[k] = v; return this; },
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
      };
      for (const h of handlers) {
        let nextCalled = false;
        // express.json() parser: body already set in tests.
        if (h.name === "jsonParser") { continue; }
        await h(req, res, () => { nextCalled = true; });
        if (!nextCalled) break;
      }
      return res;
    },
  };
}

const inv = (id, org, extra = {}) => ({
  id,
  organization_id: org,
  external_source: "slabsmith",
  external_slab_id: `S-${id.slice(-1)}`,
  inventory_id: `#${id.slice(-1)}`,
  color_name: "Lusso Dior",
  material_name: "Stratus",
  source_inventory_type: "Slab",
  source_inventory_scope: "typed",
  price_group: "D",
  thickness_nominal: "3 cm",
  rack: "A3",
  lot: "L-9",
  width_actual_in: 79,
  length_actual_in: 130,
  is_active: true,
  ...extra,
});

const db = createFakeDb({
  organizations: [{ id: ORG_A, display_name: "Elite Stone Fabrication" }],
  slab_inventory: [inv(P1, ORG_A), inv(P2, ORG_A, { source_inventory_type: "Remnant", length_actual_in: 50, width_actual_in: 25 }), inv(P_OTHER_ORG, ORG_B)],
  slab_images: [
    { organization_id: ORG_A, external_source: "slabsmith", external_slab_id: "S-1", image_url: "https://img/full1.jpg", thumbnail_url: "https://img/t1.jpg", image_status: "ok", image_url_pattern: "slabsmith_local_upload" },
  ],
  slab_piece_geometry: [{ organization_id: ORG_A, external_source: "slabsmith", external_slab_id: "S-1", status: "ok", area_sqft: 70.1, swatch_url: "https://img/sw1.jpg" }],
  live_inventory_shares: [],
});

let clock = Date.parse("2026-11-25T12:00:00Z");
const app = createFakeApp();
const userA = { id: "user-a", email: "rep@elite.test", full_name: "Rae Rep" };
const orgOf = { "user-a": ORG_A, "user-b": ORG_B };
const jsonParser = function jsonParser() {};
attachLiveInventoryShareRoutes(app, {
  requireAuth: () => (req, res, next) => (req.user ? next() : res.status(401).json({ ok: false })),
  requireAnyHeadAccess: () => (_req, _res, next) => next(),
  headSlugs: ["live_inventory"],
  getSupabase: () => db,
  now: () => clock,
  resolveOrgId: async (req) => orgOf[req.user?.id] ?? null,
  rateLimiter: createShareRateLimiter(1000),
});
void jsonParser;

// ── Create ─────────────────────────────────────────────────────────────────
{
  const unauth = await app.call("POST", "/api/live-inventory/shares", { body: { piece_ids: [P1] } });
  assert.equal(unauth.statusCode, 401);

  const crossOrg = await app.call("POST", "/api/live-inventory/shares", { user: userA, body: { piece_ids: [P1, P_OTHER_ORG] } });
  assert.equal(crossOrg.statusCode, 400, "another org's piece cannot be shared");
  assert.equal(db.tables.live_inventory_shares.length, 0);
}

const created = await app.call("POST", "/api/live-inventory/shares", {
  user: userA,
  body: { piece_ids: [P2, P1], title: "Kitchen", customer_name: "Pat", message: "Two options", expires_in_days: 7 },
});
assert.equal(created.statusCode, 201);
const token = created.body.token;
assert.match(token, /^[A-Za-z0-9_-]{43}$/);
assert.equal(created.body.path, `/s/${token}`);
{
  const stored = db.tables.live_inventory_shares[0];
  assert.equal(stored.organization_id, ORG_A);
  assert.equal(stored.token_hash, hashShareToken(token));
  assert.ok(!JSON.stringify(stored).includes(token), "raw token never stored");
  assert.deepEqual(stored.items.map((i) => i.inventory_row_id), [P2, P1], "rep order kept");
  assert.equal(stored.created_by, "user-a");
  assert.equal(stored.expires_at, new Date(clock + 7 * 86_400_000).toISOString());
  console.log("ok: create — auth, org-scoped pieces, hash-only token, snapshot");
}

// ── Public read ────────────────────────────────────────────────────────────
{
  const res = await app.call("GET", "/api/public/live-inventory/shares/:token", { params: { token } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.headers["Referrer-Policy"], "no-referrer");
  const { share, pieces } = res.body;
  assert.equal(share.organization_name, "Elite Stone Fabrication");
  assert.deepEqual(share.contact, { name: "Rae Rep", email: "rep@elite.test" });
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0].type, "remnant");
  assert.equal(pieces[1].image_url, "https://img/full1.jpg");
  assert.equal(pieces[1].swatch_url, "https://img/sw1.jpg");
  assert.equal(pieces[1].area_sqft, 70.1);
  const text = JSON.stringify(res.body);
  for (const leak of ["A3", "L-9", "price_group", "\"D\"", "rack", "lot", ORG_A, P1, P2, "S-1", "slabsmith", "user-a"]) {
    assert.ok(!text.includes(leak), `public DTO must not include ${leak}`);
  }
  assert.equal(db.tables.live_inventory_shares[0].view_count, 1);
  console.log("ok: public DTO — allow-listed fields only, view counted");
}
{
  // Sold piece → unavailable, no photo.
  db.tables.slab_inventory[0].is_active = false;
  const res = await app.call("GET", "/api/public/live-inventory/shares/:token", { params: { token } });
  const sold = res.body.pieces[1];
  assert.equal(sold.available, false);
  assert.equal(sold.image_url, null);
  assert.equal(sold.color_name, "Lusso Dior", "snapshot keeps the name");
  db.tables.slab_inventory[0].is_active = true;
  console.log("ok: sold piece shows as no longer available");
}
{
  const bad = await app.call("GET", "/api/public/live-inventory/shares/:token", { params: { token: "short" } });
  assert.equal(bad.statusCode, 404);
  const unknown = await app.call("GET", "/api/public/live-inventory/shares/:token", { params: { token: generateShareToken().rawToken } });
  assert.equal(unknown.statusCode, 404);
  assert.deepEqual(unknown.body, { ok: false, error: "This link is not available." });
  clock += 8 * 86_400_000;
  const expired = await app.call("GET", "/api/public/live-inventory/shares/:token", { params: { token } });
  assert.equal(expired.statusCode, 410);
  assert.deepEqual(expired.body, unknown.body, "expired is indistinguishable in body");
  clock -= 8 * 86_400_000;
  console.log("ok: invalid / unknown → 404, expired → 410, generic body");
}

// ── List + revoke ──────────────────────────────────────────────────────────
{
  const list = await app.call("GET", "/api/live-inventory/shares", { user: userA });
  assert.equal(list.body.shares.length, 1);
  assert.equal(list.body.shares[0].piece_count, 2);
  assert.equal(list.body.shares[0].state, "active");
  assert.ok(!JSON.stringify(list.body).includes("token_hash"));

  const userB = { id: "user-b", email: "b@other.test" };
  const otherList = await app.call("GET", "/api/live-inventory/shares", { user: userB });
  assert.equal(otherList.body.shares.length, 0, "other org sees none");
  const id = list.body.shares[0].id;
  const otherRevoke = await app.call("POST", "/api/live-inventory/shares/:id/revoke", { user: userB, params: { id } });
  assert.equal(otherRevoke.statusCode, 404, "cannot revoke another org's link");

  const noOrg = await app.call("GET", "/api/live-inventory/shares", { user: { id: "user-x" } });
  assert.equal(noOrg.statusCode, 403);

  const revoke = await app.call("POST", "/api/live-inventory/shares/:id/revoke", { user: userA, params: { id } });
  assert.equal(revoke.statusCode, 200);
  assert.equal(revoke.body.share.state, "revoked");
  assert.equal(db.tables.live_inventory_shares[0].revoked_by, "user-a");
  const after = await app.call("GET", "/api/public/live-inventory/shares/:token", { params: { token } });
  assert.equal(after.statusCode, 410);
  console.log("ok: list + revoke are org-scoped; revoked link stops resolving");
}

console.log("\nliveInventoryShares: all tests passed");
