/**
 * Phase 4G.4 backfill CLI tests — mocked Supabase only.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BACKFILL_DEFAULT_LIMIT,
  REQUIRED_ENV,
  V4_MIGRATION_HINT,
  formatEntitySummaryLine,
  normalizeBackfillResult,
  parsePositiveIntEnv,
  runBackfillCli,
  trackBackfillProgress,
} from "./backfillQuickBooksIntelligence.mjs";
import { QB_INTELLIGENCE_BACKFILL_RPCS } from "../quickbooks/quickBooksIntelligenceAggregateRepository.js";

const ORG = "00000000-0000-4000-8000-0000000000fa";
const SECRET = "SENTINEL_SERVICE_ROLE_SECRET_DO_NOT_PRINT";

describe("backfillQuickBooksIntelligence helpers", () => {
  it("parses positive int env with ceiling", () => {
    assert.equal(parsePositiveIntEnv(undefined, BACKFILL_DEFAULT_LIMIT, 20000), 5000);
    assert.equal(parsePositiveIntEnv("1000", 5000, 20000), 1000);
    assert.equal(parsePositiveIntEnv("99999", 5000, 20000), 20000);
  });

  it("normalizes backfill results including updated_count", () => {
    assert.deepEqual(
      normalizeBackfillResult({
        ok: true,
        entity: "invoices",
        updated_count: 100,
        remaining: 45800,
        limit: 100,
        backfill_version: "v4",
      }),
      {
        ok: true,
        entity: "invoices",
        updated: 100,
        remaining: 45800,
        limit: 100,
        backfill_version: "v4",
      },
    );
  });

  it("tracks no-progress when remaining is stuck while updating", () => {
    let stuck = 0;
    let prev = 45900;
    for (let i = 0; i < 3; i += 1) {
      const r = trackBackfillProgress({
        updated: 100,
        remaining: 45900,
        previousRemaining: prev,
        stuckRounds: stuck,
        threshold: 3,
      });
      stuck = r.stuckRounds;
      if (i < 2) assert.equal(r.isStuck, false);
      else assert.equal(r.isStuck, true);
      prev = 45900;
    }
  });

  it("formats summary without PII", () => {
    const line = formatEntitySummaryLine({
      entity: "invoices",
      rounds: 2,
      totalUpdated: 9000,
      remaining: 0,
    });
    assert.match(line, /invoices/);
    assert.equal(line.includes("raw_payload"), false);
  });
});

describe("runBackfillCli", () => {
  it("fails safely on missing env", async () => {
    const result = await runBackfillCli({ env: {}, log: () => {} });
    assert.equal(result.exitCode, 1);
    assert.match(result.lines[0], /Missing required env/);
    for (const key of REQUIRED_ENV) {
      assert.match(result.lines[0], new RegExp(key));
    }
    assert.equal(result.lines.join("\n").includes(SECRET), false);
  });

  it("loops until remaining is zero and prints safe counts", async () => {
    /** @type {Record<string, number>} */
    const remainingByRpc = {
      [QB_INTELLIGENCE_BACKFILL_RPCS.invoices]: 2,
      [QB_INTELLIGENCE_BACKFILL_RPCS.payments]: 1,
      [QB_INTELLIGENCE_BACKFILL_RPCS.estimates]: 0,
      [QB_INTELLIGENCE_BACKFILL_RPCS.sales_orders]: 0,
    };
    /** @type {string[]} */
    const rpcNames = [];

    const result = await runBackfillCli({
      env: {
        SUPABASE_URL: "https://fake.supabase.local",
        SUPABASE_SERVICE_ROLE_KEY: SECRET,
        QB_IMPORT_ORGANIZATION_ID: ORG,
        QB_INTEL_BACKFILL_LIMIT: "5000",
      },
      log: () => {},
      getSupabase: () => ({
        rpc: async (name, args) => {
          rpcNames.push(name);
          assert.equal(args.p_limit, 5000);
          const before = remainingByRpc[name] ?? 0;
          if (before <= 0) {
            return {
              data: {
                ok: true,
                entity: name,
                updated: 0,
                updated_count: 0,
                remaining: 0,
                limit: 5000,
                backfill_version: "v4",
              },
              error: null,
            };
          }
          remainingByRpc[name] = Math.max(0, before - 1);
          return {
            data: {
              ok: true,
              entity: name,
              updated: 5000,
              updated_count: 5000,
              remaining: remainingByRpc[name],
              limit: 5000,
              backfill_version: "v4",
            },
            error: null,
          };
        },
      }),
    });

    assert.equal(result.exitCode, 0);
    assert.ok(rpcNames.includes(QB_INTELLIGENCE_BACKFILL_RPCS.invoices));
    const out = result.lines.join("\n");
    assert.match(out, /backfill complete/);
    assert.equal(out.includes(SECRET), false);
    assert.equal(out.includes("raw_payload"), false);
  });

  it("stops early with no-progress diagnostic when remaining is stuck", async () => {
    const result = await runBackfillCli({
      env: {
        SUPABASE_URL: "https://fake.supabase.local",
        SUPABASE_SERVICE_ROLE_KEY: SECRET,
        QB_IMPORT_ORGANIZATION_ID: ORG,
        QB_INTEL_BACKFILL_LIMIT: "100",
        QB_INTEL_BACKFILL_NO_PROGRESS_ROUNDS: "3",
      },
      log: () => {},
      getSupabase: () => ({
        rpc: async () => ({
          data: {
            ok: true,
            entity: "invoices",
            updated: 100,
            updated_count: 100,
            remaining: 45900,
            limit: 100,
          },
          error: null,
        }),
      }),
    });

    assert.equal(result.exitCode, 1);
    const out = result.lines.join("\n");
    assert.match(out, /QB_BACKFILL_NO_PROGRESS/);
    assert.match(out, /v4_backfill_progress/);
    assert.ok(out.includes(V4_MIGRATION_HINT) || out.includes("v4_backfill_progress"));
    assert.equal(out.includes(SECRET), false);
    assert.equal(out.includes("raw_payload"), false);
    assert.equal(out.includes("SENTINEL_NAME"), false);
  });

  it("returns safe failure when RPC missing", async () => {
    const result = await runBackfillCli({
      env: {
        SUPABASE_URL: "https://fake.supabase.local",
        SUPABASE_SERVICE_ROLE_KEY: SECRET,
        QB_IMPORT_ORGANIZATION_ID: ORG,
      },
      log: () => {},
      getSupabase: () => ({
        rpc: async () => ({
          data: null,
          error: {
            code: "PGRST202",
            message: "Could not find the function SENTINEL_NAME raw_payload",
          },
        }),
      }),
    });
    assert.equal(result.exitCode, 1);
    const out = result.lines.join("\n");
    assert.match(out, /backfill failed/);
    assert.equal(out.includes(SECRET), false);
    assert.equal(out.includes("SENTINEL_NAME"), false);
    assert.equal(out.includes("raw_payload"), false);
  });
});
