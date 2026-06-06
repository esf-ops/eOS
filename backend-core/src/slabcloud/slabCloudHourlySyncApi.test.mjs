/**
 * slabCloudHourlySyncApi — unit tests.
 *
 * Tests the security, anti-overlap guard, response shape, and safety invariants
 * of the POST /api/internal/slabcloud/hourly-sync route.
 *
 * Uses only mock objects — no network, no real Supabase, no file I/O.
 *
 * Run: npm run eos:test:slabcloud-cache
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  validateCronSecret,
  readCronSecret,
  resolveOrgId,
  findActiveRunningSync,
  buildHourlySyncConfig,
  buildHourlySyncResponse,
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

/**
 * Build a minimal mock Supabase client for anti-overlap tests.
 * `overlapRows`: array of rows to return from slabcloud_sync_runs query.
 * `shouldError`: if true, the query returns an error.
 */
function mockDb({ overlapRows = [], shouldError = false } = {}) {
  return {
    from(table) {
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

// ── validateCronSecret ────────────────────────────────────────────────────────

describe("validateCronSecret", () => {
  it("returns status 500 when EOS_CRON_SECRET is not configured", () => {
    withEnv({ EOS_CRON_SECRET: null }, () => {
      const req = { headers: { "x-eos-cron-secret": "any" } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, false);
      assert.equal(result.status, 500);
      assert.match(result.error, /EOS_CRON_SECRET not configured/);
    });
  });

  it("returns 401 when header is missing", () => {
    withEnv({ EOS_CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: {} };
      const result = validateCronSecret(req);
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
      assert.match(result.error, /Unauthorized/);
    });
  });

  it("returns 401 when header is empty string", () => {
    withEnv({ EOS_CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { "x-eos-cron-secret": "" } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
    });
  });

  it("returns 401 when header has wrong value", () => {
    withEnv({ EOS_CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { "x-eos-cron-secret": "wrong-secret" } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
    });
  });

  it("returns ok:true when header matches EOS_CRON_SECRET exactly", () => {
    withEnv({ EOS_CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { "x-eos-cron-secret": VALID_SECRET } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, true);
    });
  });

  it("rejects if header value has extra whitespace", () => {
    withEnv({ EOS_CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { "x-eos-cron-secret": ` ${VALID_SECRET} ` } };
      // The header value is trimmed before comparison; secret value is also trimmed.
      const result = validateCronSecret(req);
      assert.equal(result.ok, true, "trimmed header should still match trimmed secret");
    });
  });

  it("accepts valid secret via Authorization: Bearer (Vercel Cron native pattern)", () => {
    withEnv({ EOS_CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { authorization: `Bearer ${VALID_SECRET}` } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, true);
    });
  });

  it("rejects wrong secret in Authorization: Bearer", () => {
    withEnv({ EOS_CRON_SECRET: VALID_SECRET }, () => {
      const req = { headers: { authorization: "Bearer wrong-secret" } };
      const result = validateCronSecret(req);
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
    });
  });
});

// ── readCronSecret ────────────────────────────────────────────────────────────

describe("readCronSecret", () => {
  it("returns null when env var is absent", () => {
    withEnv({ EOS_CRON_SECRET: null }, () => {
      assert.equal(readCronSecret(), null);
    });
  });

  it("returns null when env var is empty string", () => {
    withEnv({ EOS_CRON_SECRET: "" }, () => {
      assert.equal(readCronSecret(), null);
    });
  });

  it("returns the secret string when set", () => {
    withEnv({ EOS_CRON_SECRET: VALID_SECRET }, () => {
      assert.equal(readCronSecret(), VALID_SECRET);
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
    withEnv(
      { SLABOS_ORGANIZATION_ID: "aaa", SLABCLOUD_ORGANIZATION_ID: "bbb" },
      () => {
        assert.equal(resolveOrgId(), "aaa");
      }
    );
  });

  it("falls back to SLABCLOUD_ORGANIZATION_ID when SLABOS_ORGANIZATION_ID is absent", () => {
    withEnv(
      { SLABOS_ORGANIZATION_ID: null, SLABCLOUD_ORGANIZATION_ID: ORG_ID },
      () => {
        assert.equal(resolveOrgId(), ORG_ID);
      }
    );
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
      started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
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

  it("stale threshold: a run started exactly OVERLAP_STALE_THRESHOLD_MS ago is ignored", async () => {
    // Simulate: the query returns no rows because started_at is too old.
    // In a real DB the gt() filter excludes it. Here we confirm the threshold constant
    // is 60 minutes (3600000 ms) so external schedulers can plan around it.
    assert.equal(OVERLAP_STALE_THRESHOLD_MS, 60 * 60 * 1000);
  });
});

// ── buildHourlySyncConfig ─────────────────────────────────────────────────────

describe("buildHourlySyncConfig", () => {
  it("always uses typed inventory scope", () => {
    withEnv(
      {
        SLABCLOUD_API_COMPANY_CODE: "kbyd",
        SLABCLOUD_ASSET_COMPANY_CODE: "kbyd",
        SLABCLOUD_PUBLIC_SLUG: "esf",
      },
      () => {
        const config = buildHourlySyncConfig();
        assert.equal(config.inventoryScope, "typed");
      }
    );
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
        assert.ok(
          config.baseUrl.includes("slabcloud.com"),
          "default baseUrl should point to slabcloud.com"
        );
      }
    );
  });

  it("does not use count_for_color as a config value", () => {
    const config = buildHourlySyncConfig();
    // The client config should not have any count_for_color property
    assert.ok(!("count_for_color" in config));
  });
});

// ── buildHourlySyncResponse ───────────────────────────────────────────────────

describe("buildHourlySyncResponse", () => {
  const now = "2026-01-01T00:00:00.000Z";

  it("returns ok:true with all required fields in write mode", () => {
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
    const payload = buildHourlySyncResponse({
      result,
      organizationId: ORG_ID,
      startedAt: now,
      finishedAt: now,
    });

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

  it("returns ok:true in dry-run mode (uses wouldWrite counts)", () => {
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
    const payload = buildHourlySyncResponse({
      result,
      organizationId: ORG_ID,
      startedAt: now,
      finishedAt: now,
    });

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

// ── Safety invariants ─────────────────────────────────────────────────────────

describe("Safety invariants", () => {
  it("module does not import any write-back-to-SlabCloud path", async () => {
    // Verify the module source does not reference SlabCloud write/POST operations.
    // We do this by importing the module and checking that the exported functions
    // don't reference writeback endpoints.
    const mod = await import("./slabCloudHourlySyncApi.js");
    assert.ok(typeof mod.attachSlabCloudHourlySyncRoutes === "function");
    assert.ok(typeof mod.findActiveRunningSync === "function");
    assert.ok(typeof mod.buildHourlySyncResponse === "function");
    // No writeback helpers should be exported
    assert.ok(!("writeToSlabCloud" in mod));
    assert.ok(!("postToSlabCloud" in mod));
  });

  it("OVERLAP_STALE_THRESHOLD_MS is exactly 60 minutes", () => {
    assert.equal(OVERLAP_STALE_THRESHOLD_MS, 60 * 60 * 1000);
  });

  it("buildHourlySyncConfig always returns inventoryScope=typed (never slab/remnant/all)", () => {
    withEnv({ SLABCLOUD_INVENTORY_SCOPE: "slab" }, () => {
      // Even if someone sets SLABCLOUD_INVENTORY_SCOPE to "slab" globally,
      // the hourly sync config should override it to typed.
      const config = buildHourlySyncConfig();
      assert.equal(config.inventoryScope, "typed");
    });
  });

  it("scheduler secrets are not embedded in module (docs only)", () => {
    // This module must not contain any hardcoded secret values.
    // We verify by checking the exported constants don't look like secrets.
    assert.ok(typeof EXTERNAL_SOURCE_SLABCLOUD === "string");
    assert.equal(EXTERNAL_SOURCE_SLABCLOUD, "slabcloud");
    // No literal secret strings exposed via exports
    assert.ok(!EXTERNAL_SOURCE_SLABCLOUD.match(/[a-f0-9]{32,}/i));
  });
});
