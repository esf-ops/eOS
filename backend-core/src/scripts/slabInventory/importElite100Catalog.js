#!/usr/bin/env node
/**
 * importElite100Catalog.js — Import Elite 100 color fixture into Supabase catalog tables.
 *
 * DEFAULT: dry-run. No Supabase writes unless ELITE100_CATALOG_WRITE_ENABLED=1.
 *
 * In dry-run mode: reads + validates the fixture, prints normalized records and counts,
 * and reports what would be written — without touching Supabase.
 *
 * In write mode: upserts the collection record and all catalog items.
 *
 * Safety:
 *   - Never touches slab_inventory, pricing tables, or SlabCloud.
 *   - Fails loudly if Group G is present in the fixture.
 *   - Fails loudly if write is enabled but org-id or Supabase creds are missing.
 *   - Idempotent: re-running is safe (upsert by unique keys).
 *
 * Env vars:
 *   ELITE100_CATALOG_WRITE_ENABLED  default off — must be "1" to write
 *   SLABOS_ORGANIZATION_ID          required when writing (primary)
 *   SLABCLOUD_ORGANIZATION_ID       fallback alias for org id
 *   SUPABASE_URL                    required when writing
 *   SUPABASE_SERVICE_ROLE_KEY       required when writing
 *   ELITE100_COLLECTION_KEY         default "elite100-2026"
 *   ELITE100_COLLECTION_NAME        default "Elite 100 Color Collection 2026"
 *   ELITE100_FIXTURE_PATH           default fixtures/elite100-2026.json (relative to this script)
 *
 * REVIEW REQUIRED:
 *   Chris must verify the elite100-2026.json fixture transcription against the
 *   original "The 100 Color Collection" document before running write-enabled import.
 *   Items with "_review" fields in the fixture require special attention.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeColorName,
  normalizeMaterialName,
  buildColorKey,
  ACTIVE_PRICE_GROUPS,
} from "../../slabInventory/colorProgramMatching.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WRITE_ENABLED = process.env.ELITE100_CATALOG_WRITE_ENABLED === "1";
const ORG_ID =
  process.env.SLABOS_ORGANIZATION_ID ||
  process.env.SLABCLOUD_ORGANIZATION_ID ||
  null;
const COLLECTION_KEY =
  process.env.ELITE100_COLLECTION_KEY || "elite100-2026";
const COLLECTION_NAME =
  process.env.ELITE100_COLLECTION_NAME || "Elite 100 Color Collection 2026";
const FIXTURE_PATH =
  process.env.ELITE100_FIXTURE_PATH ||
  join(__dirname, "../../slabInventory/fixtures/elite100-2026.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFixture(path) {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
}

/**
 * Validate and flatten fixture items.
 * Throws if Group G is present or any active-group check fails.
 * Returns { items, reviewItems, groupCounts, warnings }.
 */
function processFixture(fixture) {
  const groups = fixture.groups || {};
  const groupKeys = Object.keys(groups);

  // Reject Group G outright
  if (groupKeys.includes("G")) {
    throw new Error(
      "FIXTURE VALIDATION FAILED: Group G found in fixture. " +
        "Group G is not an active ESF price group. Remove it before import."
    );
  }

  // Warn about unexpected groups
  const unknownGroups = groupKeys.filter(
    (g) => !ACTIVE_PRICE_GROUPS.includes(g)
  );
  if (unknownGroups.length) {
    throw new Error(
      `FIXTURE VALIDATION FAILED: Unexpected price groups: ${unknownGroups.join(", ")}. ` +
        `Only active groups are allowed: ${ACTIVE_PRICE_GROUPS.join(", ")}.`
    );
  }

  const items = [];
  const reviewItems = [];
  const groupCounts = {};
  const warnings = [];

  for (const group of ACTIVE_PRICE_GROUPS) {
    const rawItems = groups[group] || [];
    groupCounts[group] = rawItems.length;

    for (const raw of rawItems) {
      if (!raw.color_name || !raw.material_name) {
        warnings.push(
          `[${group}] Item missing color_name or material_name: ${JSON.stringify(raw)}`
        );
        continue;
      }
      const normalized_color_name = normalizeColorName(raw.color_name);
      const normalized_material_name = normalizeMaterialName(raw.material_name);
      const color_key = buildColorKey(
        raw.color_name,
        raw.material_name,
        raw.price_group || group
      );

      const item = {
        price_group: raw.price_group || group,
        color_name: raw.color_name,
        material_name: raw.material_name,
        display_name: raw.display_name || `${raw.color_name} - ${raw.material_name}`,
        normalized_color_name,
        normalized_material_name,
        color_key,
        sort_order: raw.sort_order ?? null,
        is_active: true,
        notes: raw._review || null,
      };

      items.push(item);

      if (raw._review) {
        reviewItems.push({ group, color_name: raw.color_name, review_note: raw._review });
      }
    }
  }

  return { items, reviewItems, groupCounts, warnings };
}

// ---------------------------------------------------------------------------
// Supabase write helpers
// ---------------------------------------------------------------------------

async function upsertCollection(supabase, organizationId, fixture) {
  const collectionRow = {
    organization_id: organizationId,
    collection_key: COLLECTION_KEY,
    display_name: COLLECTION_NAME,
    collection_year: fixture.collection_year || null,
    is_active: false, // operator must manually activate after verifying catalog
    notes: "Imported from elite100-2026.json fixture. Verify _review items before activating.",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("slab_color_collections")
    .upsert(collectionRow, {
      onConflict: "organization_id,collection_key",
      ignoreDuplicates: false,
    })
    .select("id")
    .limit(1);

  if (error) throw new Error(`upsertCollection failed: ${error.message}`);
  return data[0].id;
}

async function upsertCatalogItems(supabase, organizationId, collectionId, items) {
  const rows = items.map((item) => ({
    ...item,
    organization_id: organizationId,
    collection_id: collectionId,
    updated_at: new Date().toISOString(),
  }));

  // Batch in chunks of 50 to stay within PostgREST limits
  const CHUNK = 50;
  let totalUpserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("slab_color_catalog_items")
      .upsert(chunk, {
        onConflict: "organization_id,collection_id,color_key",
        ignoreDuplicates: false,
      });
    if (error) throw new Error(`upsertCatalogItems chunk ${i} failed: ${error.message}`);
    totalUpserted += chunk.length;
  }
  return totalUpserted;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(70));
  console.log("Elite 100 Catalog Import");
  console.log(`Mode: ${WRITE_ENABLED ? "WRITE-ENABLED" : "DRY-RUN (safe)"}`);
  console.log(`Collection key: ${COLLECTION_KEY}`);
  console.log(`Fixture: ${FIXTURE_PATH}`);
  console.log("=".repeat(70));

  // Load fixture
  let fixture;
  try {
    fixture = loadFixture(FIXTURE_PATH);
  } catch (e) {
    console.error(`ERROR: Failed to load fixture: ${e.message}`);
    process.exit(1);
  }
  console.log(`Fixture loaded: ${fixture.display_name || fixture.collection_key}`);

  // Process + validate
  let processed;
  try {
    processed = processFixture(fixture);
  } catch (e) {
    console.error(`\nFIXTURE VALIDATION ERROR:\n${e.message}`);
    process.exit(1);
  }

  const { items, reviewItems, groupCounts, warnings } = processed;

  // Print group counts
  console.log("\nGroup counts:");
  for (const g of ACTIVE_PRICE_GROUPS) {
    console.log(`  ${g.padEnd(6)}: ${(groupCounts[g] || 0).toString().padStart(3)} items`);
  }
  console.log(`  TOTAL : ${items.length.toString().padStart(3)} items`);

  // Print review items
  if (reviewItems.length) {
    console.log(`\n⚠️  ${reviewItems.length} item(s) flagged for review:`);
    for (const r of reviewItems) {
      console.log(`  [${r.group}] ${r.color_name}: ${r.review_note}`);
    }
    console.log(
      "\n  NOTE: These items require Chris to verify against the original document"
    );
    console.log("  before activating the collection in production.");
  }

  // Print warnings
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  // Print sample normalized rows
  console.log("\nSample normalized rows (first 3):");
  for (const item of items.slice(0, 3)) {
    console.log(
      `  [${item.price_group}] ${item.color_name} / ${item.material_name}` +
        ` → key: ${item.color_key}` +
        (item.notes ? ` [REVIEW]` : "")
    );
  }

  if (!WRITE_ENABLED) {
    console.log(
      "\nDRY-RUN complete. No Supabase writes performed."
    );
    console.log(
      `Would write: 1 collection + ${items.length} catalog items.`
    );
    console.log(
      "\nTo write after Chris approves the fixture:"
    );
    console.log(
      "  ELITE100_CATALOG_WRITE_ENABLED=1 \\\n" +
        "    SLABOS_ORGANIZATION_ID=<org-uuid> \\\n" +
        "    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\\n" +
        "    npm run eos:elite100:import-catalog"
    );
    return;
  }

  // Write-enabled path
  if (!ORG_ID) {
    console.error(
      "\nERROR: SLABOS_ORGANIZATION_ID (or SLABCLOUD_ORGANIZATION_ID) is required for write mode."
    );
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "\nERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for write mode."
    );
    process.exit(1);
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  console.log(`\nWriting to Supabase (org: ${ORG_ID})...`);

  try {
    const collectionId = await upsertCollection(supabase, ORG_ID, fixture);
    console.log(`  Collection upserted: ${collectionId}`);

    const upsertedCount = await upsertCatalogItems(supabase, ORG_ID, collectionId, items);
    console.log(`  Catalog items upserted: ${upsertedCount}`);

    console.log("\nWrite complete.");
    console.log(
      "NOTE: Collection is_active=false. Manually set is_active=true after verifying the catalog."
    );
    console.log("Next: npm run eos:elite100:preview-matches");
  } catch (e) {
    console.error(`\nWRITE ERROR: ${e.message}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
