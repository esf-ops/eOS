/**
 * slabCloudImageVerification — unit tests.
 *
 * Mock Supabase + mock fetch. No real network, no real DB.
 * Run: npm run eos:test:slabcloud-images
 */
import assert from "node:assert/strict";

import {
  verifySlabCloudImages,
  verifyImageUrl,
  pickUrl,
  buildImageStatusUpdate,
  isImageVerifyWriteEnabled,
  loadImageRows,
  IMAGE_VERIFY_WRITE_ENV,
  DEFAULT_VERIFY_KIND,
} from "./slabCloudImageVerification.js";
import { TABLE_IMAGES, TABLE_INVENTORY } from "./slabCloudPersistence.js";

const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";

function tick(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function row(id, slabId) {
  return {
    id,
    organization_id: ORG_ID,
    external_slab_id: slabId,
    thumbnail_url: `https://slabcloud.com/slabs/kbyd/${slabId}_thumb.jpg`,
    image_url: `https://slabcloud.com/slabs/kbyd/${slabId}.jpg`,
    image_status: "unknown",
  };
}

// ── Mock Supabase ────────────────────────────────────────────────────────────
function createMockSupabase({ rows = [], failOn = null } = {}) {
  const calls = { selects: [], updates: [], deletes: [] };

  function shouldFail(table, op) {
    return failOn && failOn.table === table && failOn.op === op;
  }

  function makeBuilder(table, op, payload) {
    const filters = [];
    return {
      table,
      op,
      payload,
      filters,
      select(cols) {
        this._select = cols;
        return this;
      },
      eq(col, val) {
        filters.push({ col, val });
        return this;
      },
      limit(n) {
        this._limit = n;
        return this;
      },
      then(resolve) {
        let result;
        if (shouldFail(table, op)) {
          result = { data: null, error: { message: `mock fail ${table}.${op}`, code: "MOCK" } };
        } else if (op === "select") {
          result = { data: rows, error: null };
        } else {
          result = { data: null, error: null };
        }
        return resolve(result);
      },
    };
  }

  return {
    calls,
    from(table) {
      return {
        select(cols) {
          const b = makeBuilder(table, "select");
          b.select(cols);
          calls.selects.push(b);
          return b;
        },
        update(payload) {
          const b = makeBuilder(table, "update", payload);
          calls.updates.push(b);
          return b;
        },
        delete() {
          const b = makeBuilder(table, "delete");
          calls.deletes.push(b);
          return b;
        },
      };
    },
  };
}

// Mock fetch builder: handler(url, opts) -> { ok, status } | throws
function makeFetch(handler) {
  return async (url, opts) => handler(url, opts);
}

// ── isImageVerifyWriteEnabled gate ───────────────────────────────────────────
{
  const prev = process.env[IMAGE_VERIFY_WRITE_ENV];
  delete process.env[IMAGE_VERIFY_WRITE_ENV];
  assert.equal(isImageVerifyWriteEnabled(), false, "absent → false");
  process.env[IMAGE_VERIFY_WRITE_ENV] = "true";
  assert.equal(isImageVerifyWriteEnabled(), false, "'true' → false (must be exactly 1)");
  process.env[IMAGE_VERIFY_WRITE_ENV] = "1";
  assert.equal(isImageVerifyWriteEnabled(), true, "'1' → true");
  if (prev === undefined) delete process.env[IMAGE_VERIFY_WRITE_ENV];
  else process.env[IMAGE_VERIFY_WRITE_ENV] = prev;
  console.log("ok: write gate");
}

// ── pickUrl ──────────────────────────────────────────────────────────────────
{
  const r = row("x", "S1");
  assert.equal(pickUrl(r, "thumbnail-first"), r.thumbnail_url, "thumbnail-first");
  assert.equal(pickUrl(r, "image-first"), r.image_url, "image-first");
  assert.equal(pickUrl(r, "thumbnail"), r.thumbnail_url, "thumbnail");
  assert.equal(pickUrl(r, "image"), r.image_url, "image");
  assert.equal(pickUrl({ image_url: "u" }, "thumbnail-first"), "u", "falls back to image when no thumb");
  assert.equal(pickUrl({}, DEFAULT_VERIFY_KIND), null, "no urls → null");
  console.log("ok: pickUrl");
}

// ── buildImageStatusUpdate ───────────────────────────────────────────────────
{
  const p = buildImageStatusUpdate({ status: "ok", now: () => "2026-01-01T00:00:00.000Z" });
  assert.deepEqual(
    p,
    { image_status: "ok", last_checked_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
    "update payload shape"
  );
  console.log("ok: buildImageStatusUpdate");
}

// ── verifyImageUrl: ok on HEAD 200 ───────────────────────────────────────────
{
  const fetchImpl = makeFetch(() => ({ ok: true, status: 200 }));
  const v = await verifyImageUrl("https://x/y.jpg", { fetchImpl });
  assert.deepEqual({ status: v.status, method: v.method }, { status: "ok", method: "HEAD" }, "HEAD 200 → ok");
  console.log("ok: verifyImageUrl ok (HEAD 200)");
}

// ── verifyImageUrl: missing on 404 ───────────────────────────────────────────
{
  const fetchImpl = makeFetch(() => ({ ok: false, status: 404 }));
  const v = await verifyImageUrl("https://x/y.jpg", { fetchImpl });
  assert.equal(v.status, "missing", "404 → missing");
  console.log("ok: verifyImageUrl missing (404)");
}

// ── verifyImageUrl: error on timeout/network ─────────────────────────────────
{
  const fetchImpl = makeFetch(() => {
    const e = new Error("aborted");
    e.name = "AbortError";
    throw e;
  });
  const v = await verifyImageUrl("https://x/y.jpg", { fetchImpl, timeoutMs: 50 });
  assert.equal(v.status, "error", "network error → error");
  console.log("ok: verifyImageUrl error (timeout/network)");
}

// ── verifyImageUrl: HEAD 405 falls back to range GET ─────────────────────────
{
  const fetchImpl = makeFetch((url, opts) => {
    if (opts.method === "HEAD") return { ok: false, status: 405 };
    return { ok: true, status: 206 }; // GET range
  });
  const v = await verifyImageUrl("https://x/y.jpg", { fetchImpl });
  assert.deepEqual({ status: v.status, method: v.method }, { status: "ok", method: "GET" }, "405 → GET fallback ok");
  console.log("ok: verifyImageUrl HEAD 405 → GET fallback");
}

// ── No DB updates when write flag off (dry-run) ──────────────────────────────
{
  const rows = [row("img-1", "S1"), row("img-2", "S2")];
  const db = createMockSupabase({ rows });
  const fetchImpl = makeFetch(() => ({ ok: true, status: 200 }));
  const result = await verifySlabCloudImages({
    db,
    organizationId: ORG_ID,
    writeEnabled: false,
    fetchImpl,
  });
  assert.equal(result.mode, "dry-run", "dry-run mode");
  assert.equal(db.calls.updates.length, 0, "no update calls");
  assert.equal(result.counts.checked, 2, "checked 2");
  assert.equal(result.counts.ok, 2, "ok 2");
  assert.equal(result.counts.written, 0, "written 0");
  console.log("ok: no DB updates when write flag off");
}

// ── DB updates when write flag on ────────────────────────────────────────────
{
  const rows = [row("img-1", "S1"), row("img-2", "S2")];
  const db = createMockSupabase({ rows });
  const fetchImpl = makeFetch(() => ({ ok: true, status: 200 }));
  const result = await verifySlabCloudImages({
    db,
    organizationId: ORG_ID,
    writeEnabled: true,
    fetchImpl,
  });
  assert.equal(result.mode, "write", "write mode");
  assert.equal(db.calls.updates.length, 2, "two update calls");
  assert.equal(result.counts.written, 2, "written 2");

  // All updates target slab_images, set image_status, scoped by id + org
  for (const u of db.calls.updates) {
    assert.equal(u.table, TABLE_IMAGES, "update targets slab_images");
    assert.ok("image_status" in u.payload, "payload sets image_status");
    assert.ok("last_checked_at" in u.payload, "payload sets last_checked_at");
    const cols = u.filters.map((f) => f.col);
    assert.ok(cols.includes("id"), "scoped by id");
    assert.ok(cols.includes("organization_id"), "scoped by organization_id");
  }
  console.log("ok: DB updates when write flag on");
}

// ── Only organization_id-scoped rows are queried ─────────────────────────────
{
  const db = createMockSupabase({ rows: [] });
  const fetchImpl = makeFetch(() => ({ ok: true, status: 200 }));
  await verifySlabCloudImages({ db, organizationId: ORG_ID, writeEnabled: false, fetchImpl });
  assert.equal(db.calls.selects.length, 1, "one select");
  const sel = db.calls.selects[0];
  assert.equal(sel.table, TABLE_IMAGES, "select on slab_images");
  const orgFilter = sel.filters.find((f) => f.col === "organization_id");
  assert.ok(orgFilter && orgFilter.val === ORG_ID, "select scoped by organization_id");
  const statusFilter = sel.filters.find((f) => f.col === "image_status");
  assert.ok(statusFilter && statusFilter.val === "unknown", "default status filter unknown");
  console.log("ok: only organization_id-scoped rows queried");
}

// ── No deletes; slab_inventory never updated ─────────────────────────────────
{
  const rows = [row("img-1", "S1")];
  const db = createMockSupabase({ rows });
  const fetchImpl = makeFetch(() => ({ ok: false, status: 404 }));
  await verifySlabCloudImages({ db, organizationId: ORG_ID, writeEnabled: true, fetchImpl });
  assert.equal(db.calls.deletes.length, 0, "no delete calls");
  for (const u of db.calls.updates) {
    assert.notEqual(u.table, TABLE_INVENTORY, "slab_inventory never updated");
  }
  console.log("ok: no deletes; slab_inventory never updated");
}

// ── Concurrency does not exceed configured limit ─────────────────────────────
{
  const rows = Array.from({ length: 12 }, (_, i) => row(`img-${i}`, `S${i}`));
  const db = createMockSupabase({ rows });
  let active = 0;
  let maxActive = 0;
  const fetchImpl = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await tick(5);
    active -= 1;
    return { ok: true, status: 200 };
  };
  await verifySlabCloudImages({
    db,
    organizationId: ORG_ID,
    concurrency: 3,
    writeEnabled: false,
    fetchImpl,
  });
  assert.ok(maxActive <= 3, `concurrency capped at 3 (saw ${maxActive})`);
  assert.ok(maxActive >= 2, `some parallelism observed (saw ${maxActive})`);
  console.log(`ok: concurrency capped (max active ${maxActive})`);
}

// ── Missing/null URL → skipped, not checked ──────────────────────────────────
{
  const rows = [{ id: "no-url", organization_id: ORG_ID, external_slab_id: "S9", image_status: "unknown" }];
  const db = createMockSupabase({ rows });
  const fetchImpl = makeFetch(() => ({ ok: true, status: 200 }));
  const result = await verifySlabCloudImages({ db, organizationId: ORG_ID, writeEnabled: true, fetchImpl });
  assert.equal(result.counts.skipped, 1, "row without url skipped");
  assert.equal(result.counts.checked, 0, "nothing checked");
  assert.equal(db.calls.updates.length, 0, "skipped rows are not updated");
  console.log("ok: missing url → skipped");
}

// ── Requires db + organizationId ─────────────────────────────────────────────
{
  let threwNoDb = false;
  try {
    await verifySlabCloudImages({ db: null, organizationId: ORG_ID });
  } catch {
    threwNoDb = true;
  }
  assert.equal(threwNoDb, true, "no db → throws");

  let threwNoOrg = false;
  try {
    await verifySlabCloudImages({ db: createMockSupabase(), organizationId: null });
  } catch {
    threwNoOrg = true;
  }
  assert.equal(threwNoOrg, true, "no org → throws");
  console.log("ok: requires db + organizationId");
}

// ── loadImageRows respects 'all' status filter (no status eq) ─────────────────
{
  const db = createMockSupabase({ rows: [row("a", "S1")] });
  await loadImageRows(db, { organizationId: ORG_ID, statusFilter: "all", limit: 10 });
  const sel = db.calls.selects[0];
  const statusFilter = sel.filters.find((f) => f.col === "image_status");
  assert.ok(!statusFilter, "'all' disables status filter");
  console.log("ok: loadImageRows 'all' status filter");
}

console.log("\nslabCloudImageVerification: all tests passed");
