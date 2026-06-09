/**
 * slabsmithIngestApi — unit tests (mock Supabase/persistence, no network).
 * Run: npm run eos:test:slabsmith-ingest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  createSlabsmithIngestHandler,
  buildIngestResponse,
  extractXmlFromIngestBody,
  ingestSlabsmithInventoryXml,
  readSlabsmithSyncToken,
  resolveSlabsmithSyncOrganizationId,
  sanitizeIngestResponse,
  SLABSMITH_SYNC_TOKEN_HEADER,
  validateIngestServerEnv,
  validateSlabsmithSyncToken,
} from "./slabsmithIngestApi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_XML = readFileSync(join(__dirname, "fixtures/sample-slabs.xml"), "utf8");
const VALID_TOKEN = "test-slabsmith-sync-token";
const ORG_ID = "89180433-9fab-4024-bec9-a14d870bd0a8";

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

function dispatchIngest(req, handlerDeps) {
  const handler = createSlabsmithIngestHandler(handlerDeps);
  return new Promise((resolve) => {
    const res = {
      _status: 200,
      status(code) {
        this._status = code;
        return this;
      },
      json(body) {
        resolve({ status: this._status, body });
      },
    };
    const request = {
      ...req,
      header(name) {
        const key = String(name ?? "").toLowerCase();
        return req.headers?.[key] ?? req.headers?.[name];
      },
    };
    handler(request, res);
  });
}

describe("validateSlabsmithSyncToken", () => {
  it("returns 500 when server token is not configured", () => {
    withEnv({ SLABSMITH_SYNC_TOKEN: null }, () => {
      const result = validateSlabsmithSyncToken({ headers: {} });
      assert.equal(result.ok, false);
      assert.equal(result.status, 500);
    });
  });

  it("returns 401 when header is missing", () => {
    withEnv({ SLABSMITH_SYNC_TOKEN: VALID_TOKEN }, () => {
      const result = validateSlabsmithSyncToken({ headers: {} });
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
      assert.match(result.error, /Missing/i);
    });
  });

  it("returns 401 when header is invalid", () => {
    withEnv({ SLABSMITH_SYNC_TOKEN: VALID_TOKEN }, () => {
      const result = validateSlabsmithSyncToken({
        headers: { [SLABSMITH_SYNC_TOKEN_HEADER]: "wrong-token" },
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 401);
    });
  });

  it("accepts valid token", () => {
    withEnv({ SLABSMITH_SYNC_TOKEN: VALID_TOKEN }, () => {
      const result = validateSlabsmithSyncToken({
        headers: { [SLABSMITH_SYNC_TOKEN_HEADER]: VALID_TOKEN },
      });
      assert.equal(result.ok, true);
    });
  });
});

describe("extractXmlFromIngestBody", () => {
  it("accepts raw XML string body", () => {
    const xml = extractXmlFromIngestBody(FIXTURE_XML, "application/xml");
    assert.match(xml, /Slabsmith\.dbo\.Slabs/);
  });

  it("accepts JSON body with xml field", () => {
    const xml = extractXmlFromIngestBody(
      Buffer.from(JSON.stringify({ xml: FIXTURE_XML })),
      "application/json"
    );
    assert.match(xml, /TEST-1001/);
  });
});

describe("ingestSlabsmithInventoryXml", () => {
  it("calls persistence with normalized rows and writeEnabled true", async () => {
    let captured = null;
    const mockPersist = async (params) => {
      captured = params;
      return {
        status: "completed",
        syncRunId: "run-123",
        rows_seen: params.normalized.length,
        inserted: params.normalized.length,
        updated: 0,
        unchanged: 0,
        raw_records_written: params.normalized.length,
        slab_inventory_upserted: params.normalized.length,
        needs_review: 1,
        warnings: ["needs_review: 1"],
        errors: null,
      };
    };

    const response = await ingestSlabsmithInventoryXml({
      xml: FIXTURE_XML,
      db: {},
      organizationId: ORG_ID,
      persistFn: mockPersist,
    });

    assert.ok(captured);
    assert.equal(captured.writeEnabled, true);
    assert.equal(captured.organizationId, ORG_ID);
    assert.equal(captured.runMeta.triggeredBy, "windows_connector");
    assert.equal(captured.normalized.length, 3);
    assert.equal(response.rows_seen, 3);
    assert.equal(response.sync_run_id, "run-123");
    assert.equal(response.warnings_count, 1);
  });
});

describe("buildIngestResponse / sanitizeIngestResponse", () => {
  it("does not expose secrets in response payload", () => {
    const payload = buildIngestResponse({
      status: "completed",
      syncRunId: "abc",
      rows_seen: 10,
      inserted: 10,
      warnings: [],
    });
    assert.doesNotThrow(() => sanitizeIngestResponse(payload));
    assert.throws(
      () => sanitizeIngestResponse({ error: "SUPABASE_SERVICE_ROLE_KEY leaked" }),
      /must not expose secrets/
    );
  });
});

describe("attachSlabsmithIngestRoutes", () => {
  const baseEnv = {
    SLABSMITH_SYNC_TOKEN: VALID_TOKEN,
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key-not-in-response",
    SLABOS_ORGANIZATION_ID: ORG_ID,
  };

  it("rejects missing token before persistence", async () => {
    await withEnvAsync(baseEnv, async () => {
      let persistCalled = false;
      const deps = {
        getSupabase: () => ({}),
        persistSlabsmithInventory: async () => {
          persistCalled = true;
          return {};
        },
      };

      const resp = await dispatchIngest(
        {
          headers: { "content-type": "application/xml" },
          body: Buffer.from(FIXTURE_XML),
        },
        deps
      );

      assert.equal(resp.status, 401);
      assert.equal(persistCalled, false);
    });
  });

  it("rejects invalid token before persistence", async () => {
    await withEnvAsync(baseEnv, async () => {
      let persistCalled = false;
      const deps = {
        getSupabase: () => ({}),
        persistSlabsmithInventory: async () => {
          persistCalled = true;
          return {};
        },
      };

      const resp = await dispatchIngest(
        {
          headers: {
            "content-type": "application/xml",
            [SLABSMITH_SYNC_TOKEN_HEADER]: "bad-token",
          },
          body: Buffer.from(FIXTURE_XML),
        },
        deps
      );

      assert.equal(resp.status, 401);
      assert.equal(persistCalled, false);
    });
  });

  it("accepts valid token and returns ingest counts", async () => {
    await withEnvAsync(baseEnv, async () => {
      const deps = {
        getSupabase: () => ({}),
        persistSlabsmithInventory: async ({ normalized }) => ({
          status: "completed",
          syncRunId: "sync-run-1",
          rows_seen: normalized.length,
          inserted: normalized.length,
          updated: 0,
          unchanged: 0,
          raw_records_written: normalized.length,
          slab_inventory_upserted: normalized.length,
          needs_review: 1,
          warnings: [],
          errors: null,
        }),
      };

      const resp = await dispatchIngest(
        {
          headers: {
            "content-type": "application/xml",
            [SLABSMITH_SYNC_TOKEN_HEADER]: VALID_TOKEN,
          },
          body: Buffer.from(FIXTURE_XML),
        },
        deps
      );

      assert.equal(resp.status, 200);
      assert.equal(resp.body.ok, true);
      assert.equal(resp.body.rows_seen, 3);
      assert.equal(resp.body.sync_run_id, "sync-run-1");
      assert.equal(JSON.stringify(resp.body).includes("service-key"), false);
      assert.equal(JSON.stringify(resp.body).includes(VALID_TOKEN), false);
    });
  });
});

describe("resolveSlabsmithSyncOrganizationId", () => {
  it("prefers SLABSMITH_SYNC_ORGANIZATION_ID over SLABOS_ORGANIZATION_ID", () => {
    const id = resolveSlabsmithSyncOrganizationId({
      SLABSMITH_SYNC_ORGANIZATION_ID: "sync-org",
      SLABOS_ORGANIZATION_ID: "slabos-org",
    });
    assert.equal(id, "sync-org");
  });
});

describe("readSlabsmithSyncToken", () => {
  it("reads token from env", () => {
    withEnv({ SLABSMITH_SYNC_TOKEN: " abc " }, () => {
      assert.equal(readSlabsmithSyncToken(), "abc");
    });
  });
});

describe("validateIngestServerEnv", () => {
  it("requires Supabase credentials and org id", () => {
    const bad = validateIngestServerEnv({});
    assert.equal(bad.ok, false);
    const good = validateIngestServerEnv({
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      SLABOS_ORGANIZATION_ID: ORG_ID,
    });
    assert.equal(good.ok, true);
    assert.equal(good.organizationId, ORG_ID);
  });
});

console.log("slabsmithIngestApi: all tests passed");
