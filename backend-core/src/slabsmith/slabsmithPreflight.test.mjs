/**
 * slabsmithPreflight — unit tests (pure helpers, no live Supabase).
 * Run: npm run eos:test:slabsmith-preflight
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeSlabsmithInventory } from "./normalizeSlabsmithInventory.js";
import {
  buildPreflightRecommendation,
  countIncomingMatchingExistingSlabsmith,
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

// ── countIncomingMatchingExistingSlabsmith ────────────────────────────────────
{
  const existing = [{ external_slab_id: "TEST-1001" }, { external_slab_id: "TEST-2002-1" }];
  assert.equal(countIncomingMatchingExistingSlabsmith(rows, existing), 2);
  assert.equal(countIncomingMatchingExistingSlabsmith(rows, []), 0);
  console.log("ok: countIncomingMatchingExistingSlabsmith");
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

console.log("\nAll slabsmithPreflight tests passed.");
