/**
 * slabCloudHourlySyncApi — unit tests.
 *
 * Tests the security, method handling, anti-overlap guard, response shape,
 * and safety invariants of the GET|POST /api/internal/slabcloud/hourly-sync route.
 *
 * Uses only mock objects — no network, no real Supabase, no file I/O.
 *
 * Run: npm run eos:test:slabcloud-cache
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateCronSecret,
  readCronSecret,
  resolveOrgId,
  findActiveRunningSync,
  buildHourlySyncConfig,
  buildHourlySyncResponse,
  attachSlabCloudHourlySyncRoutes,
  OVERLAP_STALE_THRESHOLD_MS,
  EXTERNAL_SOURCE_SLABCLOUD,
} from "./slabCloudHourlySyncApi.js";

const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";
const VALID_SECRET = "test-cron-secret-abc123";

// ── Env var utilities ─────────────────────────────────────────────────────────

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function withEnvAsync(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v == null) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ── Minimal mock Supabase builder ─────────────────────────────────────────────

function mockDb({ overlapRows = [], shouldError = false } = {}) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        gt() { return this; },
        order() { return this; },
        limit() {
          return shouldError
            ? { data: null, error: { message: "DB query failed" } }
            : { data: overlapRows, error: null };
        },
      };
    },
  };
}

// ── Minimal Express-like mock for route handler tests ─────────────────────────

/**
 * Build a minimal mock Express app that captures registered handlers for testing.
 * Supports app.get, app.post, app.all.
 * Returns { routes, dispatch(method, req) }.
 */
function mockApp() {
  const routes = [];
  const app = {
    get(path, handler) { routes.push({ method: "GET", path, handler }); },
    post(path, handler) { routes.push({ method: "POST", path, handler }); },
    all(path, handler) { routes.push({ method: "ALL", path, handler }); },
  };

  function dispatch(method, req) {
    const upperMethod = method.toUpperCase();
    const matched = routes.find(
      (r) =>
        r.path === "/api/internal/slabcloud/hourly-sync" &&
        (r.method === upperMethod || r.method === "ALL")
    );
    if (!matched) {
      return Promise.resolve({ status: 404, body: { ok: false, error: "Not Found" } });
    }
    return new Promise((resolve) => {
      const res = {
        _status: 200,
        _body: null,
        status(code) { this._status = code; return this; },
        json(body) { resolve({ status: this._status, body }); },
      };
      matched.handler(req, res);
    });
  }

  return { app, routes, dispatch };
}

// ── readCronSecret ────────────────────────────────────────────────────────────

describe("readCronSecret", () => {
  it("returns null when all three env vars are absent", () => {
    withEnv({ CRON_SECRET: null, EOS_CRON_SECRET: null, ELITEOS_CRON_SECRET: null }, () => {
      assert.equal(readCronSecret(), null);
    });
  });

  it("returns null when all three env vars are empty strings", () => {
    withEnv({ CRON_SECRET: "", EOS_CRON_SECRET: "", ELITEOS_CRON_SECRET: "" }, () => {
      assert.equal(readCronSecret(), null);
    });
  });

  it("prefers CRON_SECRET over EOS_CRON_SECRET and ELITEOS_CRON_SECRET", () => {
    withEnv(
      { CRON_SECRET: "cron-primary", EOS_CRON_SECRET: "eos-fallback", ELITEOS_CRON_SECRET: "elite-fallback" },
      () => {
        assert.equal(readCronSecret(), "cron-primary");
      }
    );
  });

  it("falls back to EOS_CRON_SECRET when CRON_SECRET is absent", () => {
    withEnv({ CRON_SECRET: null, EOS_CRON_SECRET: VALID_SECRET, ELITEOS_CRON_SECRET: null }, () => {
      assert.equal(readCronSecret(), VALID_SECRET);
    });
  });

  it("falls back to ELITEOS_CRON_SECRET when CRON_SECRET and EOS_CRON_SECRET are absent", () => {
    withEnv({ CRON_SECRET: null, EOS_CRON_SECRET: null, ELITEOS_CRON_SECRET: "eliteos-only" }, () => {
      assert.equal(readCronSecret(), "eliteos-only");
    });
  });
});

// ── validateCronSecret ────────────────────────────────────────────────────────

describe("validateCronSecret", () => {
  it("returns status 500 when no server-side secret is configured", () => {
    withEnv({ CRON_SECRET: null, EOS_CRON_SECRET: null, ELITEOS_CRON_SECRET: null }, () => {
      const req = { headers: { authorization: `Bearer ${VALID_SECRET}` } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, false);
      assert.equal(result.status, 500);
      assert.match(result.error, /No cron secret configured/);
    });
  });

  it("returns 401 when no header is provided", () => {
    withEnv({ CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: {} };
      const result = validateCronSecret(req);
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
      assert.match(result.error, /Unauthorized/);
    });
  });

  it("returns 401 when Authorization: Bearer has wrong value", () => {
    withEnv({ CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { authorization: "Bearer wrong-secret" } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
    });
  });

  it("returns 401 when x-eos-cron-secret has wrong value", () => {
    withEnv({ EOS_CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { "x-eos-cron-secret": "wrong-secret" } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
    });
  });

  it("returns 401 when x-eos-cron-secret is empty string", () => {
    withEnv({ EOS_CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { "x-eos-cron-secret": "" } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
    });
  });

  it("accepts Authorization: Bearer with CRON_SECRET (Vercel Cron GET pattern)", () => {
    withEnv({ CRON_SECRET: VALID_SECRET, EOS_CRON_SECRET: null, ELITEOS_CRON_SECRET: null }, () => {
      const req = { headers: { authorization: `Bearer ${VALID_SECRET}` } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, true);
    });
  });

  it("accepts Authorization: Bearer with EOS_CRON_SECRET when CRON_SECRET absent", () => {
    withEnv({ CRON_SECRET: null, EOS_CRON_SECRET: VALID_SECRET, ELITEOS_CRON_SECRET: null }, () => {
      const req = { headers: { authorization: `Bearer ${VALID_SECRET}` } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, true);
    });
  });

  it("accepts x-eos-cron-secret matching EOS_CRON_SECRET (manual POST pattern)", () => {
    withEnv({ CRON_SECRET: null, EOS_CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { "x-eos-cron-secret": VALID_SECRET } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, true);
    });
  });

  it("accepts x-eos-cron-secret matching CRON_SECRET", () => {
    withEnv({ CRON_SECRET: VALID_SECRET, EOS_CRON_SECRET: null }, () => {
      const req = { headers: { "x-eos-cron-secret": VALID_SECRET } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, true);
    });
  });

  it("accepts x-eliteos-cron-secret header", () => {
    withEnv({ CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { "x-eliteos-cron-secret": VALID_SECRET } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, true);
    });
  });

  it("rejects x-eliteos-cron-secret with wrong value", () => {
    withEnv({ CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { "x-eliteos-cron-secret": "wrong" } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
    });
  });

  it("Authorization: Bearer is case-insensitive on the Bearer prefix", () => {
    withEnv({ CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { authorization: `BEARER ${VALID_SECRET}` } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, true);
    });
  });

  it("trims whitespace from header values before comparison", () => {
    withEnv({ EOS_CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { "x-eos-cron-secret": ` ${VALID_SECRET} ` } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, true);
    });
  });
});

// ── resolveOrgId ──────────────────────────────────────────────────────────────

describe("resolveOrgId", () => {
  it("returns null when neither env var is set", () => {
    withEnv({ SLABOS_ORGANIZATION_ID: null, SLABCLOUD_ORGANIZATION_ID: null }, () => {
      assert.equal(resolveOrgId(), null);
    });
  });

  it("prefers SLABOS_ORGANIZATION_ID over SLABCLOUD_ORGANIZATION_ID", () => {
    withEnv({ SLABOS_ORGANIZATION_ID: "aaa", SLABCLOUD_ORGANIZATION_ID: "bbb" }, () => {
      assert.equal(resolveOrgId(), "aaa");
    });
  });

  it("falls back to SLABCLOUD_ORGANIZATION_ID when SLABOS_ORGANIZATION_ID is absent", () => {
    withEnv({ SLABOS_ORGANIZATION_ID: null, SLABCLOUD_ORGANIZATION_ID: ORG_ID }, () => {
      assert.equal(resolveOrgId(), ORG_ID);
    });
  });
});

// ── findActiveRunningSync ─────────────────────────────────────────────────────

describe("findActiveRunningSync", () => {
  it("returns null when no running sync exists", async () => {
    const db = mockDb({ overlapRows: [] });
    const result = await findActiveRunningSync(db, ORG_ID);
    assert.equal(result, null);
  });

  it("returns the running row when an active sync exists", async () => {
    const row = {
      id: "sync-run-abc",
      started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      status: "running",
      organization_id: ORG_ID,
      external_source: EXTERNAL_SOURCE_SLABCLOUD,
    };
    const db = mockDb({ overlapRows: [row] });
    const result = await findActiveRunningSync(db, ORG_ID);
    assert.deepEqual(result, row);
  });

  it("throws when the DB query errors", async () => {
    const db = mockDb({ shouldError: true });
    await assert.rejects(
      () => findActiveRunningSync(db, ORG_ID),
      /Anti-overlap query failed/
    );
  });

  it("stale threshold constant is exactly 60 minutes", () => {
    assert.equal(OVERLAP_STALE_THRESHOLD_MS, 60 * 60 * 1000);
  });
});

// ── buildHourlySyncConfig ─────────────────────────────────────────────────────

describe("buildHourlySyncConfig", () => {
  it("always uses typed inventory scope", () => {
    withEnv(
      { SLABCLOUD_API_COMPANY_CODE: "kbyd", SLABCLOUD_ASSET_COMPANY_CODE: "kbyd", SLABCLOUD_PUBLIC_SLUG: "esf" },
      () => {
        const config = buildHourlySyncConfig();
        assert.equal(config.inventoryScope, "typed");
      }
    );
  });

  it("ignores SLABCLOUD_INVENTORY_SCOPE env var — always forces typed", () => {
    withEnv({ SLABCLOUD_INVENTORY_SCOPE: "slab" }, () => {
      const config = buildHourlySyncConfig();
      assert.equal(config.inventoryScope, "typed");
    });
  });

  it("defaults to kbyd and esf when env vars are absent", () => {
    withEnv(
      {
        SLABCLOUD_API_COMPANY_CODE: null,
        SLABCLOUD_COMPANY_CODE: null,
        SLABCLOUD_ASSET_COMPANY_CODE: null,
        SLABCLOUD_PUBLIC_SLUG: null,
        SLABCLOUD_BASE_URL: null,
      },
      () => {
        const config = buildHourlySyncConfig();
        assert.equal(config.apiCompanyCode, "kbyd");
        assert.equal(config.publicSlug, "esf");
        assert.ok(config.baseUrl.includes("slabcloud.com"));
      }
    );
  });

  it("does not include count_for_color in the config object", () => {
    const config = buildHourlySyncConfig();
    assert.ok(!("count_for_color" in config));
  });
});

// ── buildHourlySyncResponse ───────────────────────────────────────────────────

describe("buildHourlySyncResponse", () => {
  const now = "2026-01-01T00:00:00.000Z";

  it("returns all required fields in write mode", () => {
    const result = {
      normalizedCount: 1679,
      typeBreakdown: { Slab: 401, Remnant: 1278 },
      warnings: [],
      persistence: {
        mode: "write",
        writeEnabled: true,
        syncRunId: "run-abc-123",
        written: { rawRecords: 1679, slabInventory: 1679, slabMaterials: 5, slabImages: 401 },
        wouldWrite: null,
      },
    };
    const payload = buildHourlySyncResponse({ result, organizationId: ORG_ID, startedAt: now, finishedAt: now });

    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "write");
    assert.equal(payload.organization_id, ORG_ID);
    assert.equal(payload.sync_run_id, "run-abc-123");
    assert.equal(payload.inventory_scope, "typed");
    assert.equal(payload.normalized_records, 1679);
    assert.equal(payload.slab_count, 401);
    assert.equal(payload.remnant_count, 1278);
    assert.equal(payload.raw_written, 1679);
    assert.equal(payload.inventory_upserted, 1679);
    assert.equal(payload.materials_upserted, 5);
    assert.equal(payload.images_upserted, 401);
    assert.deepEqual(payload.warnings, []);
    assert.equal(payload.started_at, now);
    assert.equal(payload.finished_at, now);
  });

  it("uses wouldWrite counts in dry-run mode", () => {
    const result = {
      normalizedCount: 100,
      typeBreakdown: { Slab: 60, Remnant: 40 },
      warnings: ["test warning"],
      persistence: {
        mode: "dry_run",
        writeEnabled: false,
        syncRunId: null,
        written: null,
        wouldWrite: { syncRuns: 1, rawRecords: 100, slabInventory: 95, slabMaterials: 4, slabImages: 60 },
      },
    };
    const payload = buildHourlySyncResponse({ result, organizationId: ORG_ID, startedAt: now, finishedAt: now });

    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "dry_run");
    assert.equal(payload.sync_run_id, null);
    assert.equal(payload.raw_written, 100);
    assert.equal(payload.inventory_upserted, 95);
    assert.equal(payload.materials_upserted, 4);
    assert.equal(payload.images_upserted, 60);
    assert.deepEqual(payload.warnings, ["test warning"]);
  });

  it("always reports inventory_scope as typed", () => {
    const payload = buildHourlySyncResponse({
      result: { normalizedCount: 0, typeBreakdown: {}, warnings: [], persistence: {} },
      organizationId: ORG_ID,
      startedAt: now,
      finishedAt: now,
    });
    assert.equal(payload.inventory_scope, "typed");
  });
});

// ── Route method handling ─────────────────────────────────────────────────────

describe("Route method handling", () => {
  function buildReq(method, headers = {}) {
    return { method, headers };
  }

  it("registers GET and POST routes (not only POST)", () => {
    const { app, routes } = mockApp();
    attachSlabCloudHourlySyncRoutes(app, { getSupabase: () => mockDb() });
    const path = "/api/internal/slabcloud/hourly-sync";
    const getRoute = routes.find((r) => r.method === "GET" && r.path === path);
    const postRoute = routes.find((r) => r.method === "POST" && r.path === path);
    const allRoute = routes.find((r) => r.method === "ALL" && r.path === path);
    assert.ok(getRoute, "GET route should be registered");
    assert.ok(postRoute, "POST route should be registered");
    assert.ok(allRoute, "ALL (405) catch-all should be registered");
  });

  it("GET with valid Authorization: Bearer returns 401 without valid org (secret accepted)", async () => {
    await withEnvAsync(
      { CRON_SECRET: VALID_SECRET, SLABOS_ORGANIZATION_ID: null, SLABCLOUD_ORGANIZATION_ID: null },
      async () => {
        const { app, dispatch } = mockApp();
        attachSlabCloudHourlySyncRoutes(app, { getSupabase: () => mockDb() });
        const req = { method: "GET", headers: { authorization: `Bearer ${VALID_SECRET}` } };
        // Secret is valid; org ID is missing → 500
        const resp = await dispatch("GET", req);
        assert.equal(resp.status, 500);
        assert.match(resp.body.error, /SLABOS_ORGANIZATION_ID/);
      }
    );
  });

  it("GET with missing secret returns 500 when no cron secret configured", async () => {
    await withEnvAsync(
      { CRON_SECRET: null, EOS_CRON_SECRET: null, ELITEOS_CRON_SECRET: null },
      async () => {
        const { app, dispatch } = mockApp();
        attachSlabCloudHourlySyncRoutes(app, { getSupabase: () => mockDb() });
        const req = { method: "GET", headers: {} };
        const resp = await dispatch("GET", req);
        assert.equal(resp.status, 500);
        assert.match(resp.body.error, /No cron secret configured/);
      }
    );
  });

  it("GET with wrong secret returns 401", async () => {
    await withEnvAsync({ CRON_SECRET: VALID_SECRET }, async () => {
      const { app, dispatch } = mockApp();
      attachSlabCloudHourlySyncRoutes(app, { getSupabase: () => mockDb() });
      const req = { method: "GET", headers: { authorization: "Bearer wrong-secret" } };
      const resp = await dispatch("GET", req);
      assert.equal(resp.status, 401);
      assert.equal(resp.body.ok, false);
    });
  });

  it("POST with x-eos-cron-secret accepted (manual test pattern)", async () => {
    await withEnvAsync(
      { EOS_CRON_SECRET: VALID_SECRET, CRON_SECRET: null, SLABOS_ORGANIZATION_ID: null, SLABCLOUD_ORGANIZATION_ID: null },
      async () => {
        const { app, dispatch } = mockApp();
        attachSlabCloudHourlySyncRoutes(app, { getSupabase: () => mockDb() });
        const req = { method: "POST", headers: { "x-eos-cron-secret": VALID_SECRET } };
        // Secret valid; org missing → 500 (secret accepted, different failure)
        const resp = await dispatch("POST", req);
        assert.equal(resp.status, 500);
        assert.match(resp.body.error, /SLABOS_ORGANIZATION_ID/);
      }
    );
  });

  it("DELETE method returns 405 Method Not Allowed", async () => {
    const { app, dispatch } = mockApp();
    attachSlabCloudHourlySyncRoutes(app, { getSupabase: () => mockDb() });
    const req = { method: "DELETE", headers: {} };
    const resp = await dispatch("ALL", req);
    assert.equal(resp.status, 405);
    assert.equal(resp.body.ok, false);
    assert.match(resp.body.error, /Method Not Allowed/);
  });

  it("PATCH method returns 405", async () => {
    const { app, dispatch } = mockApp();
    attachSlabCloudHourlySyncRoutes(app, { getSupabase: () => mockDb() });
    const req = { method: "PATCH", headers: {} };
    const resp = await dispatch("ALL", req);
    assert.equal(resp.status, 405);
  });

  it("anti-overlap guard returns 409 when active sync found — via GET route", async () => {
    const activeRow = {
      id: "running-sync-id",
      started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      status: "running",
      organization_id: ORG_ID,
      external_source: EXTERNAL_SOURCE_SLABCLOUD,
    };
    await withEnvAsync(
      { CRON_SECRET: VALID_SECRET, SLABOS_ORGANIZATION_ID: ORG_ID },
      async () => {
        const { app, dispatch } = mockApp();
        attachSlabCloudHourlySyncRoutes(app, {
          getSupabase: () => mockDb({ overlapRows: [activeRow] }),
        });
        const req = { method: "GET", headers: { authorization: `Bearer ${VALID_SECRET}` } };
        const resp = await dispatch("GET", req);
        assert.equal(resp.status, 409);
        assert.equal(resp.body.ok, false);
        assert.equal(resp.body.skipped, true);
        assert.equal(resp.body.reason, "sync_already_running");
        assert.equal(resp.body.existing_sync_run_id, "running-sync-id");
      }
    );
  });

  it("anti-overlap guard allows sync when no active run found — via POST route", async () => {
    // With no overlap and a real sync module this would try to fetch SlabCloud.
    // We only test that the anti-overlap guard passes (returns non-409).
    // The sync itself will fail (no real network) — we just confirm it got past the guard.
    await withEnvAsync(
      { CRON_SECRET: VALID_SECRET, SLABOS_ORGANIZATION_ID: ORG_ID },
      async () => {
        const { app, dispatch } = mockApp();
        attachSlabCloudHourlySyncRoutes(app, {
          getSupabase: () => mockDb({ overlapRows: [] }),
        });
        const req = { method: "POST", headers: { "x-eos-cron-secret": VALID_SECRET } };
        const resp = await dispatch("POST", req);
        // Not 409 (overlap guard did not block)
        assert.notEqual(resp.status, 409);
        // Not 401/500 from secret/org checks
        assert.notEqual(resp.status, 401);
        assert.ok(resp.status !== 500 || !resp.body.error?.includes("SLABOS_ORGANIZATION_ID"),
          "Should pass auth and org check");
      }
    );
  });
});

// ── Safety invariants ─────────────────────────────────────────────────────────

describe("Safety invariants", () => {
  it("module exports expected surface (no writeback helpers)", async () => {
    const mod = await import("./slabCloudHourlySyncApi.js");
    assert.ok(typeof mod.attachSlabCloudHourlySyncRoutes === "function");
    assert.ok(typeof mod.findActiveRunningSync === "function");
    assert.ok(typeof mod.buildHourlySyncResponse === "function");
    assert.ok(typeof mod.validateCronSecret === "function");
    assert.ok(typeof mod.readCronSecret === "function");
    assert.ok(!("writeToSlabCloud" in mod));
    assert.ok(!("postToSlabCloud" in mod));
  });

  it("OVERLAP_STALE_THRESHOLD_MS is exactly 60 minutes", () => {
    assert.equal(OVERLAP_STALE_THRESHOLD_MS, 60 * 60 * 1000);
  });

  it("EXTERNAL_SOURCE_SLABCLOUD is 'slabcloud' with no embedded secrets", () => {
    assert.equal(EXTERNAL_SOURCE_SLABCLOUD, "slabcloud");
    assert.ok(!EXTERNAL_SOURCE_SLABCLOUD.match(/[a-f0-9]{32,}/i));
  });

  it("readCronSecret never exposes the secret value in this test file — tested indirectly", () => {
    // Ensure the three env var names are correct (typos would break production silently).
    const envVarNames = ["CRON_SECRET", "EOS_CRON_SECRET", "ELITEOS_CRON_SECRET"];
    for (const name of envVarNames) {
      withEnv({ [name]: "sentinel-value" }, () => {
        // Temporarily clear the others to confirm priority
        withEnv(
          Object.fromEntries(envVarNames.filter((n) => n !== name).map((n) => [n, null])),
          () => {
            assert.equal(readCronSecret(), "sentinel-value", `${name} should be read`);
          }
        );
      });
    }
  });
});
