/**
 * slabsmithPreflight — unit tests (pure helpers + mock count DB, no live Supabase).
 * Run: npm run eos:test:slabsmith-preflight
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeSlabsmithInventory } from "./normalizeSlabsmithInventory.js";
import { SLABSMITH_EXTERNAL_SOURCE } from "./normalizeSlabsmithInventory.js";
import {
  aggregateSourceCountsFromFetchedRows,
  buildInventorySourceBreakdown,
  buildPreflightRecommendation,
  countIncomingMatchingExistingSlabsmith,
  detectPreflightCountMismatch,
  formatPreflightReport,
  KNOWN_INVENTORY_SOURCES,
  SLABCLOUD_EXTERNAL_SOURCE,
  summarizeSlabsmithIdMatches,
  validatePreflightEnv,
} from "./slabsmithPreflight.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_XML = readFileSync(join(__dirname, "fixtures/sample-slabs.xml"), "utf8");
const { rows } = normalizeSlabsmithInventory(FIXTURE_XML);

// ── validatePreflightEnv ──────────────────────────────────────────────────────
{
  assert.throws(() => validatePreflightEnv({}), /SUPABASE_URL/);
  assert.throws(
    () =>
      validatePreflightEnv({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "key",
      }),
    /SLABOS_ORGANIZATION_ID/
  );
  assert.doesNotThrow(() =>
    validatePreflightEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key",
      SLABOS_ORGANIZATION_ID: "89180433-9fab-4024-bec9-a14d870bd0a8",
    })
  );
  console.log("ok: validatePreflightEnv");
}

// ── aggregateSourceCountsFromFetchedRows (Supabase 1000-row limit bug) ────────
{
  const slabcloudOnlyFetch = Array.from({ length: 1000 }, () => ({
    external_source: SLABCLOUD_EXTERNAL_SOURCE,
  }));
  const truncated = aggregateSourceCountsFromFetchedRows(slabcloudOnlyFetch);
  assert.equal(truncated[SLABCLOUD_EXTERNAL_SOURCE], 1000);
  assert.equal(truncated[SLABSMITH_EXTERNAL_SOURCE], undefined, "truncated fetch hides slabsmith rows");

  const fullFetch = [
    ...slabcloudOnlyFetch,
    ...Array.from({ length: 1621 }, () => ({ external_source: SLABSMITH_EXTERNAL_SOURCE })),
  ];
  const complete = aggregateSourceCountsFromFetchedRows(fullFetch);
  assert.equal(complete[SLABCLOUD_EXTERNAL_SOURCE], 1000);
  assert.equal(complete[SLABSMITH_EXTERNAL_SOURCE], 1621);
  console.log("ok: aggregateSourceCountsFromFetchedRows truncation case");
}

// ── countIncomingMatchingExistingSlabsmith ────────────────────────────────────
{
  const existing = [{ external_slab_id: "TEST-1001" }, { external_slab_id: "TEST-2002-1" }];
  assert.equal(countIncomingMatchingExistingSlabsmith(rows, existing), 2);
  assert.equal(countIncomingMatchingExistingSlabsmith(rows, []), 0);
  console.log("ok: countIncomingMatchingExistingSlabsmith");
}

// ── summarizeSlabsmithIdMatches ───────────────────────────────────────────────
{
  const incoming = [{ external_slab_id: "A" }, { external_slab_id: "B" }, { external_slab_id: "C" }];
  const existing = [{ external_slab_id: "A" }, { external_slab_id: "B" }];
  const summary = summarizeSlabsmithIdMatches(incoming, existing);
  assert.equal(summary.matching_incoming_rows, 2);
  assert.equal(summary.existing_slabsmith_rows_matched, 2);
  assert.equal(summary.incoming_row_count, 3);
  console.log("ok: summarizeSlabsmithIdMatches");
}

// ── detectPreflightCountMismatch ──────────────────────────────────────────────
{
  const mismatch = detectPreflightCountMismatch({
    existingSlabsmithTotal: 0,
    matchingIncomingSlabsmith: 1621,
    existingSlabsmithRowsMatched: 1621,
  });
  assert.equal(mismatch.length, 1);
  assert.match(mismatch[0], /slabsmith total count is 0/);

  const consistent = detectPreflightCountMismatch({
    existingSlabsmithTotal: 1621,
    matchingIncomingSlabsmith: 1621,
    existingSlabsmithRowsMatched: 1621,
  });
  assert.equal(consistent.length, 0);
  console.log("ok: detectPreflightCountMismatch");
}

// ── buildInventorySourceBreakdown (mock exact-count DB) ───────────────────────
{
  /** @type {Record<string, number>} */
  const counts = {
    "org|": 2621,
    "org|slabcloud|": 1000,
    "org|slabcloud|active": 1000,
    "org|slabcloud|typed": 1000,
    "org|slabsmith|": 1621,
    "org|slabsmith|active": 1621,
    "org|slabsmith|typed": 1595,
  };

  function countKey(filters) {
    const org = filters.organization_id ?? "";
    const source = filters.external_source ?? "";
    const active = filters.is_active === true ? "active" : "";
    const typed = filters.source_inventory_scope === "typed" ? "typed" : "";
    return [org, source, active || typed].filter(Boolean).join("|") + (typed && !active ? "" : "");
  }

  function resolveMockCount(filters) {
    const org = filters.organization_id ?? "";
    const source = filters.external_source ?? "";
    const active = filters.is_active === true;
    const typed =
      filters.source_inventory_scope === "typed" &&
      Array.isArray(filters.source_inventory_type);

    if (!source) return counts[`${org}|`] ?? 0;
    if (active) return counts[`${org}|${source}|active`] ?? 0;
    if (typed) return counts[`${org}|${source}|typed`] ?? 0;
    return counts[`${org}|${source}|`] ?? 0;
  }

  const mockDb = {
    from() {
      /** @type {Record<string, unknown>} */
      const filters = {};
      const chain = {
        select(_cols, _opts) {
          return chain;
        },
        eq(col, val) {
          filters[col] = val;
          return chain;
        },
        in(col, val) {
          filters[col] = val;
          return chain;
        },
        limit() {
          return chain;
        },
        async then(resolve) {
          resolve({ count: resolveMockCount(filters), error: null });
        },
      };
      return chain;
    },
  };

  const breakdown = await buildInventorySourceBreakdown(mockDb, "org");
  assert.equal(breakdown.total, 2621);
  assert.equal(breakdown.slabcloud, 1000);
  assert.equal(breakdown.slabsmith, 1621);
  assert.equal(breakdown.active_by_external_source[SLABSMITH_EXTERNAL_SOURCE], 1621);
  assert.equal(breakdown.typed_by_external_source[SLABSMITH_EXTERNAL_SOURCE], 1595);
  assert.deepEqual(Object.keys(breakdown.total_by_external_source).sort(), [
    SLABCLOUD_EXTERNAL_SOURCE,
    SLABSMITH_EXTERNAL_SOURCE,
  ]);
  assert.deepEqual([...KNOWN_INVENTORY_SOURCES], [SLABCLOUD_EXTERNAL_SOURCE, SLABSMITH_EXTERNAL_SOURCE]);
  console.log("ok: buildInventorySourceBreakdown mock counts");
}

// ── buildPreflightRecommendation ──────────────────────────────────────────────
{
  const allReadable = {
    slabcloud_sync_runs: { readable: true },
    slab_inventory_raw_records: { readable: true },
    slab_inventory: { readable: true },
  };

  const ok = buildPreflightRecommendation({
    tablesReadable: allReadable,
    incomingRowCount: 3,
    needsReviewCount: 1,
    existingSlabcloudCount: 0,
  });
  assert.equal(ok.safe_to_write, true);
  assert.match(ok.reason, /readable/);

  const reimport = buildPreflightRecommendation({
    tablesReadable: allReadable,
    incomingRowCount: 1621,
    existingSlabsmithCount: 1621,
    matchingIncomingSlabsmith: 1621,
    existingSlabcloudCount: 1000,
  });
  assert.equal(reimport.safe_to_write, true);
  assert.match(reimport.reason, /re-import\/update scenario/);
  assert.match(reimport.reason, /slabcloud/);

  const slabcloudRisk = buildPreflightRecommendation({
    tablesReadable: allReadable,
    incomingRowCount: 100,
    existingSlabcloudCount: 500,
  });
  assert.equal(slabcloudRisk.safe_to_write, true);
  assert.match(slabcloudRisk.reason, /slabcloud/);

  const unreadable = buildPreflightRecommendation({
    tablesReadable: {
      ...allReadable,
      slab_inventory: { readable: false, error: "relation does not exist" },
    },
    incomingRowCount: 10,
  });
  assert.equal(unreadable.safe_to_write, false);
  assert.match(unreadable.reason, /not readable/);

  const empty = buildPreflightRecommendation({
    tablesReadable: allReadable,
    incomingRowCount: 0,
  });
  assert.equal(empty.safe_to_write, false);
  console.log("ok: buildPreflightRecommendation");
}

// ── formatPreflightReport includes expanded counts ────────────────────────────
{
  const text = formatPreflightReport({
    organization_id: "org-1",
    tables: {
      slabcloud_sync_runs: { readable: true },
      slab_inventory_raw_records: { readable: true },
      slab_inventory: { readable: true },
    },
    existing: {
      total_by_external_source: { slabcloud: 1000, slabsmith: 1621 },
      active_by_external_source: { slabcloud: 1000, slabsmith: 1621 },
      typed_by_external_source: { slabcloud: 1000, slabsmith: 1595 },
      total: 2621,
      slabsmith: 1621,
      slabcloud: 1000,
    },
    incoming: {
      row_count: 1621,
      by_source_inventory_type: { Slab: 329, Remnant: 1266 },
      by_source_price_group: { B: 100 },
      matching_existing_slabsmith: 1621,
      existing_slabsmith_rows_matched: 1621,
      external_company_code: "local",
      needs_review: 26,
    },
    warnings: [],
    duplicate_source_risk: {
      has_existing_slabcloud_rows: true,
      existing_slabcloud_count: 1000,
      message: "mixed sources",
    },
    recommendation: { safe_to_write: true, reason: "ok" },
  });

  assert.match(text, /total by external_source \(all rows/);
  assert.match(text, /active by external_source/);
  assert.match(text, /typed by external_source/);
  assert.match(text, /external_source=slabsmith: 1621/);
  assert.match(text, /existing slabsmith rows matched \(by ID lookup\): 1621/);
  assert.doesNotMatch(text, /WARNING.*slabsmith total count is 0/);
  console.log("ok: formatPreflightReport expanded counts");
}

console.log("\nAll slabsmithPreflight tests passed.");
