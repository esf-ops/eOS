import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import express from "express";

import {
  constantTimeEqualString,
  extractSlabsmithPartnerToken,
  isSlabsmithPartnerApiEnabled,
  isSlabsmithPartnerWriteEnabled,
  validateSlabsmithPartnerAccess,
} from "./slabsmithPartnerAuth.js";
import {
  attachSlabsmithPartnerRoutes,
  mapPartnerInventoryRow,
  normalizePartnerWriteOperations,
  PARTNER_WRITE_ALLOWLIST,
  sanitizePartnerResponse,
  SLABSMITH_PARTNER_BASE,
} from "./slabsmithPartnerApi.js";

const PARTNER_TOKEN = "partner-token-value-32chars!!!!!";
const SYNC_TOKEN = "sync-token-value-different-32ch!";
const ORG_ID = "11111111-1111-4111-8111-111111111111";

async function withEnv(overrides, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === null || v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("slabsmithPartnerAuth", () => {
  it("constantTimeEqualString matches equal strings", () => {
    assert.equal(constantTimeEqualString("abc", "abc"), true);
    assert.equal(constantTimeEqualString("abc", "abd"), false);
    assert.equal(constantTimeEqualString("", "a"), false);
  });

  it("extracts bearer or header token", () => {
    assert.equal(
      extractSlabsmithPartnerToken({
        header: (n) => (n === "authorization" ? `Bearer ${PARTNER_TOKEN}` : ""),
        headers: {},
      }),
      PARTNER_TOKEN
    );
    assert.equal(
      extractSlabsmithPartnerToken({
        header: (n) =>
          n === "x-eliteos-slabsmith-partner-token" ? PARTNER_TOKEN : "",
        headers: {},
      }),
      PARTNER_TOKEN
    );
  });

  it("rejects when disabled / missing token / sync token collision", async () => {
    await withEnv(
      {
        SLABSMITH_PARTNER_API_ENABLED: "0",
        SLABSMITH_PARTNER_API_TOKEN: PARTNER_TOKEN,
        SLABOS_ORGANIZATION_ID: ORG_ID,
      },
      () => {
        assert.equal(isSlabsmithPartnerApiEnabled(), false);
        const r = validateSlabsmithPartnerAccess({ headers: {}, header: () => "" });
        assert.equal(r.status, 404);
      }
    );

    await withEnv(
      {
        SLABSMITH_PARTNER_API_ENABLED: "1",
        SLABSMITH_PARTNER_API_TOKEN: PARTNER_TOKEN,
        SLABSMITH_SYNC_TOKEN: PARTNER_TOKEN,
        SLABOS_ORGANIZATION_ID: ORG_ID,
      },
      () => {
        const r = validateSlabsmithPartnerAccess({
          header: (n) => (n === "authorization" ? `Bearer ${PARTNER_TOKEN}` : ""),
          headers: {},
        });
        assert.equal(r.status, 500);
        assert.match(r.error, /must not equal/);
      }
    );
  });

  it("accepts valid partner token", async () => {
    await withEnv(
      {
        SLABSMITH_PARTNER_API_ENABLED: "1",
        SLABSMITH_PARTNER_API_TOKEN: PARTNER_TOKEN,
        SLABSMITH_SYNC_TOKEN: SYNC_TOKEN,
        SLABOS_ORGANIZATION_ID: ORG_ID,
      },
      () => {
        const r = validateSlabsmithPartnerAccess({
          header: (n) => (n === "authorization" ? `Bearer ${PARTNER_TOKEN}` : ""),
          headers: {},
        });
        assert.equal(r.ok, true);
        assert.equal(r.organizationId, ORG_ID);
        assert.equal(isSlabsmithPartnerWriteEnabled(), false);
      }
    );
  });
});

describe("partner DTO helpers", () => {
  it("maps inventory rows without leaking secrets", () => {
    const mapped = mapPartnerInventoryRow(
      {
        id: "row-1",
        external_source: "slabsmith",
        external_slab_id: "slab-1",
        inventory_id: "INV-1",
        color_name: "Calacatta",
        material_name: "Quartz",
        price_group: "A",
        rack: "R1",
        lot: "L1",
        source_inventory_type: "Slab",
        is_active: true,
        updated_at: "2026-01-01T00:00:00Z",
      },
      { image_url: "https://example.com/a.jpg", thumbnail_url: null, image_status: "ok" }
    );
    assert.equal(mapped.inventory_id, "INV-1");
    assert.equal(mapped.image_url, "https://example.com/a.jpg");
    assert.equal(sanitizePartnerResponse({ ok: true, row: mapped }).ok, true);
  });

  it("normalizes allowlisted write operations", () => {
    const bad = normalizePartnerWriteOperations([{ field: "cost", value: "1" }]);
    assert.equal(bad.ok, false);

    const ok = normalizePartnerWriteOperations([
      { field: "rack", value: "A-12" },
      { field: "status", value: "Available" },
    ]);
    assert.equal(ok.ok, true);
    assert.equal(ok.operations.length, 2);
    assert.ok(PARTNER_WRITE_ALLOWLIST.includes("rack"));
  });
});

describe("attachSlabsmithPartnerRoutes", () => {
  /** @type {import("http").Server} */
  let server;
  /** @type {number} */
  let port;
  /** @type {Array<Record<string, unknown>>} */
  let inventoryRows;
  /** @type {Array<Record<string, unknown>>} */
  let imageRows;
  /** @type {Array<Record<string, unknown>>} */
  let writeRows;

  function makeQuery(table) {
    const state = {
      filters: /** @type {Array<[string, unknown]>} */ ([]),
      inFilters: /** @type {Array<[string, unknown[]]>} */ ([]),
      range: null,
      maybe: false,
      single: false,
      insertPayload: null,
    };

    const run = () => {
      if (table === "slab_inventory") {
        let rows = inventoryRows.slice();
        for (const [col, val] of state.filters) {
          rows = rows.filter((r) => r[col] === val);
        }
        if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
        if (state.maybe || state.single) {
          return { data: rows[0] ?? null, error: null, count: rows.length };
        }
        return { data: rows, error: null, count: inventoryRows.length };
      }
      if (table === "slab_images") {
        let rows = imageRows.slice();
        for (const [col, val] of state.filters) {
          rows = rows.filter((r) => r[col] === val);
        }
        for (const [col, vals] of state.inFilters) {
          rows = rows.filter((r) => vals.includes(r[col]));
        }
        return { data: rows, error: null };
      }
      if (table === "slabsmith_partner_write_requests") {
        if (state.insertPayload) {
          const row = {
            id: "wr-1",
            created_at: "2026-01-01T00:00:00Z",
            ...state.insertPayload,
          };
          writeRows.push(row);
          return {
            data: {
              id: row.id,
              status: row.status,
              apply_status: row.apply_status,
              created_at: row.created_at,
              external_slab_id: row.external_slab_id,
              inventory_id: row.inventory_id,
              operations: row.operations,
            },
            error: null,
          };
        }
        let rows = writeRows.slice();
        for (const [col, val] of state.filters) {
          rows = rows.filter((r) => r[col] === val);
        }
        return { data: rows[0] ?? null, error: null };
      }
      return { data: null, error: { message: `unknown table ${table}` } };
    };

    const api = {
      select(_cols, _opts) {
        return api;
      },
      eq(col, val) {
        state.filters.push([col, val]);
        return api;
      },
      in(col, vals) {
        state.inFilters.push([col, vals]);
        return api;
      },
      gte() {
        return api;
      },
      order() {
        return api;
      },
      range(from, to) {
        state.range = [from, to];
        return api;
      },
      insert(payload) {
        state.insertPayload = payload;
        return api;
      },
      maybeSingle() {
        state.maybe = true;
        return Promise.resolve(run());
      },
      single() {
        state.single = true;
        return Promise.resolve(run());
      },
      then(resolve, reject) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };

    return api;
  }

  before(async () => {
    inventoryRows = [
      {
        id: "inv-uuid-1",
        organization_id: ORG_ID,
        external_source: "slabsmith",
        external_slab_id: "slab-abc",
        inventory_id: "INV-100",
        color_name: "White",
        material_name: "Quartz",
        distributor: null,
        price_group: "B",
        thickness_nominal: "3cm",
        rack: "1",
        lot: "9",
        width_actual_in: 60,
        length_actual_in: 120,
        source_inventory_type: "Slab",
        is_active: true,
        updated_at: "2026-06-01T00:00:00Z",
      },
    ];
    imageRows = [
      {
        organization_id: ORG_ID,
        external_source: "slabsmith",
        external_slab_id: "slab-abc",
        image_url: "https://cdn.example/full.jpg",
        thumbnail_url: "https://cdn.example/thumb.jpg",
        image_status: "ok",
        image_url_pattern: "slabsmith_local_upload",
      },
    ];
    writeRows = [];

    const app = express();
    attachSlabsmithPartnerRoutes(app, {
      getSupabase: () => ({
        from: (table) => makeQuery(table),
      }),
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function partnerEnv(extra = {}) {
    return {
      SLABSMITH_PARTNER_API_ENABLED: "1",
      SLABSMITH_PARTNER_API_TOKEN: PARTNER_TOKEN,
      SLABSMITH_SYNC_TOKEN: SYNC_TOKEN,
      SLABOS_ORGANIZATION_ID: ORG_ID,
      SLABSMITH_PARTNER_WRITE_ENABLED: "0",
      ...extra,
    };
  }

  async function get(path, headers = {}) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    const body = await res.json();
    return { status: res.status, body };
  }

  async function post(path, payload, headers = {}) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  it("returns 404 when partner API disabled", async () => {
    await withEnv({ SLABSMITH_PARTNER_API_ENABLED: "0" }, async () => {
      const { status } = await get(`${SLABSMITH_PARTNER_BASE}/health`, {
        authorization: `Bearer ${PARTNER_TOKEN}`,
      });
      assert.equal(status, 404);
    });
  });

  it("lists inventory with images when authorized", async () => {
    await withEnv(partnerEnv(), async () => {
      const { status, body } = await get(`${SLABSMITH_PARTNER_BASE}/inventory`, {
        authorization: `Bearer ${PARTNER_TOKEN}`,
      });
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.rows.length, 1);
      assert.equal(body.rows[0].inventory_id, "INV-100");
      assert.equal(body.rows[0].image_url, "https://cdn.example/full.jpg");
    });
  });

  it("rejects write when write gate is off", async () => {
    await withEnv(partnerEnv(), async () => {
      const { status, body } = await post(
        `${SLABSMITH_PARTNER_BASE}/write-requests`,
        {
          inventory_id: "INV-100",
          operations: [{ field: "rack", value: "Z-1" }],
        },
        { authorization: `Bearer ${PARTNER_TOKEN}` }
      );
      assert.equal(status, 403);
      assert.equal(body.write_enabled, false);
    });
  });

  it("accepts write request when write gate is on", async () => {
    await withEnv(partnerEnv({ SLABSMITH_PARTNER_WRITE_ENABLED: "1" }), async () => {
      const { status, body } = await post(
        `${SLABSMITH_PARTNER_BASE}/write-requests`,
        {
          inventory_id: "INV-100",
          client_request_id: "req-1",
          operations: [{ field: "rack", value: "Z-1" }],
        },
        { authorization: `Bearer ${PARTNER_TOKEN}` }
      );
      assert.equal(status, 202);
      assert.equal(body.ok, true);
      assert.equal(body.write_request.apply_status, "queued_pending_worker");
    });
  });
});
