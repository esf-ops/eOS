#!/usr/bin/env node
/**
 * importElite100AliasReviews.js — Apply Chris-reviewed alias/reject decisions
 * from elite100-2026-alias-review-seed.json into Supabase.
 *
 * Dry-run by default. Writes only when ELITE100_ALIAS_REVIEW_WRITE_ENABLED=1.
 *
 * For approved_alias_candidates:
 *   - Finds the catalog item by catalog_color_name + catalog_material_name + price_group
 *   - Inserts a slab_color_aliases row (source_system = slabcloud) if not already present
 *   - Does NOT create duplicates — checks for existing row before inserting (SELECT-then-INSERT)
 *
 * For rejected_fuzzy_candidates:
 *   - Finds the catalog item that was wrongly suggested (rejected_catalog_*)
 *   - Inserts a slab_color_program_match_reviews row (review_status = rejected) if not present
 *
 * Idempotency:
 *   - Uses SELECT-then-INSERT instead of upsert/onConflict.
 *   - Safe to re-run even if unique indexes are missing or were added after production setup.
 *   - Handles nullable material fields correctly (IS NULL vs = value).
 *
 * Guards:
 *   - Never touches slab_inventory
 *   - Never activates the collection (is_active remains false)
 *   - Never mutates SlabCloud source rows
 *   - Dry-run mode prints payloads without sending them to Supabase
 *
 * Env vars:
 *   ELITE100_ALIAS_REVIEW_WRITE_ENABLED    set to "1" to enable writes
 *   SLABOS_ORGANIZATION_ID                 required for writes
 *   SLABCLOUD_ORGANIZATION_ID              fallback alias
 *   SUPABASE_URL                           required for writes
 *   SUPABASE_SERVICE_ROLE_KEY              required for writes
 *   ELITE100_COLLECTION_KEY                default "elite100-2026"
 *   ELITE100_ALIAS_SEED_PATH               default fixtures/elite100-2026-alias-review-seed.json
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildAliasPayload,
  buildRejectReviewPayload,
  normalizeColorName,
  normalizeMaterialName,
} from "../../slabInventory/colorProgramMatching.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WRITE_ENABLED =
  process.env.ELITE100_ALIAS_REVIEW_WRITE_ENABLED === "1";
const ORG_ID =
  process.env.SLABOS_ORGANIZATION_ID ||
  process.env.SLABCLOUD_ORGANIZATION_ID ||
  null;
const COLLECTION_KEY =
  process.env.ELITE100_COLLECTION_KEY || "elite100-2026";
const SEED_PATH =
  process.env.ELITE100_ALIAS_SEED_PATH ||
  join(__dirname, "../../slabInventory/fixtures/elite100-2026-alias-review-seed.json");

// ---------------------------------------------------------------------------
// Load seed fixture
// ---------------------------------------------------------------------------

function loadSeed(seedPath) {
  const raw = JSON.parse(readFileSync(seedPath, "utf8"));
  const approved = Array.isArray(raw.approved_alias_candidates)
    ? raw.approved_alias_candidates
    : [];
  const rejected = Array.isArray(raw.rejected_fuzzy_candidates)
    ? raw.rejected_fuzzy_candidates
    : [];
  return { approved, rejected };
}

// ---------------------------------------------------------------------------
// Idempotency helpers — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Find an existing alias row using the logical import key.
 * Handles nullable normalized_alias_material_name correctly.
 *
 * @param {object} supabase  Supabase client (or mock)
 * @param {string} orgId
 * @param {string} catalogItemId
 * @param {string} normColor   normalized_alias_color_name
 * @param {string|null} normMaterial  normalized_alias_material_name (may be null)
 * @param {string} sourceSystem  e.g. "slabcloud"
 * @returns {Promise<{id: string}|null>} existing row or null
 */
export async function findExistingAlias(
  supabase,
  orgId,
  catalogItemId,
  normColor,
  normMaterial,
  sourceSystem
) {
  let q = supabase
    .from("slab_color_aliases")
    .select("id")
    .eq("organization_id", orgId)
    .eq("catalog_item_id", catalogItemId)
    .eq("normalized_alias_color_name", normColor)
    .eq("source_system", sourceSystem);

  if (normMaterial != null && normMaterial !== "") {
    q = q.eq("normalized_alias_material_name", normMaterial);
  } else {
    q = q.is("normalized_alias_material_name", null);
  }

  const { data, error } = await q.limit(1);
  if (error) throw new Error(`Alias lookup error: ${error.message}`);
  return data?.[0] ?? null;
}

/**
 * Find an existing review row using the logical import key.
 * Handles nullable normalized_source_material_name and matched_catalog_item_id.
 *
 * @param {object} supabase  Supabase client (or mock)
 * @param {string} orgId
 * @param {string} normColor   normalized_source_color_name
 * @param {string|null} normMaterial  normalized_source_material_name (may be null)
 * @param {string} matchMethod  e.g. "fuzzy"
 * @param {string} reviewStatus  e.g. "rejected"
 * @param {string|null} matchedCatalogItemId  (may be null)
 * @returns {Promise<{id: string}|null>} existing row or null
 */
export async function findExistingReview(
  supabase,
  orgId,
  normColor,
  normMaterial,
  matchMethod,
  reviewStatus,
  matchedCatalogItemId
) {
  let q = supabase
    .from("slab_color_program_match_reviews")
    .select("id")
    .eq("organization_id", orgId)
    .eq("normalized_source_color_name", normColor)
    .eq("match_method", matchMethod)
    .eq("review_status", reviewStatus);

  if (normMaterial != null && normMaterial !== "") {
    q = q.eq("normalized_source_material_name", normMaterial);
  } else {
    q = q.is("normalized_source_material_name", null);
  }

  if (matchedCatalogItemId != null) {
    q = q.eq("matched_catalog_item_id", matchedCatalogItemId);
  } else {
    q = q.is("matched_catalog_item_id", null);
  }

  const { data, error } = await q.limit(1);
  if (error) throw new Error(`Review lookup error: ${error.message}`);
  return data?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Look up catalog item id by (color_name, material_name, price_group, org, collection)
// ---------------------------------------------------------------------------

async function findCatalogItemId(
  supabase,
  orgId,
  collectionId,
  colorName,
  materialName,
  priceGroup
) {
  const { data, error } = await supabase
    .from("slab_color_catalog_items")
    .select("id, color_name, material_name, price_group")
    .eq("organization_id", orgId)
    .eq("collection_id", collectionId)
    .eq("normalized_color_name", normalizeColorName(colorName))
    .eq("normalized_material_name", normalizeMaterialName(materialName || ""))
    .eq("price_group", priceGroup)
    .limit(1);

  if (error) {
    console.warn(
      `  WARN: catalog item lookup failed for "${colorName} - ${materialName}" [${priceGroup}]: ${error.message}`
    );
    return null;
  }
  return data?.[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Look up collection id by key
// ---------------------------------------------------------------------------

async function findCollectionId(supabase, orgId, collectionKey) {
  const { data, error } = await supabase
    .from("slab_color_collections")
    .select("id, is_active, collection_key")
    .eq("organization_id", orgId)
    .eq("collection_key", collectionKey)
    .limit(1);

  if (error) throw new Error(`Collection lookup failed: ${error.message}`);
  return data?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Apply approved aliases — SELECT-then-INSERT (idempotent, no ON CONFLICT needed)
// ---------------------------------------------------------------------------

async function applyApprovedAliases(
  supabase,
  orgId,
  collectionId,
  approved,
  isDryRun
) {
  let successCount = 0;
  let skipCount = 0;

  for (const candidate of approved) {
    const catalogItemId = await findCatalogItemId(
      supabase,
      orgId,
      collectionId,
      candidate.catalog_color_name,
      candidate.catalog_material_name,
      candidate.price_group
    );

    if (!catalogItemId) {
      console.warn(
        `  SKIP: could not find catalog item for "${candidate.catalog_color_name} - ${candidate.catalog_material_name}" [${candidate.price_group}]`
      );
      skipCount += 1;
      continue;
    }

    const payload = buildAliasPayload(candidate, orgId, catalogItemId);

    if (isDryRun) {
      console.log(
        `  [DRY-RUN] alias: "${candidate.source_color_name} - ${candidate.source_material_name}"` +
          ` → catalog item ${catalogItemId} (${candidate.catalog_color_name} - ${candidate.catalog_material_name})`
      );
      successCount += 1;
      continue;
    }

    // SELECT-then-INSERT: check for existing row before inserting.
    // Does not require a unique index on the DB — works on any schema version.
    let existing;
    try {
      existing = await findExistingAlias(
        supabase,
        orgId,
        catalogItemId,
        payload.normalized_alias_color_name,
        payload.normalized_alias_material_name ?? null,
        payload.source_system
      );
    } catch (lookupErr) {
      console.warn(
        `  WARN: alias existence check failed for "${candidate.source_color_name}": ${lookupErr.message}`
      );
      skipCount += 1;
      continue;
    }

    if (existing) {
      console.log(
        `  SKIP (already exists): alias "${candidate.source_color_name} - ${candidate.source_material_name}"` +
          ` → "${candidate.catalog_color_name} - ${candidate.catalog_material_name}" [id=${existing.id}]`
      );
      skipCount += 1;
      continue;
    }

    const { error } = await supabase
      .from("slab_color_aliases")
      .insert(payload);

    if (error) {
      console.warn(
        `  WARN: alias insert failed for "${candidate.source_color_name}": ${error.message}`
      );
      skipCount += 1;
    } else {
      console.log(
        `  OK: alias inserted — "${candidate.source_color_name} - ${candidate.source_material_name}"` +
          ` → "${candidate.catalog_color_name} - ${candidate.catalog_material_name}" [${candidate.price_group}]`
      );
      successCount += 1;
    }
  }

  return { successCount, skipCount };
}

// ---------------------------------------------------------------------------
// Apply rejected fuzzy reviews — SELECT-then-INSERT (idempotent, no ON CONFLICT needed)
// ---------------------------------------------------------------------------

async function applyRejectedReviews(
  supabase,
  orgId,
  collectionId,
  rejected,
  isDryRun
) {
  let successCount = 0;
  let skipCount = 0;

  for (const candidate of rejected) {
    // Find the catalog item that was wrongly suggested (to reference in the review row)
    const catalogItemId = candidate.rejected_catalog_color_name
      ? await findCatalogItemId(
          supabase,
          orgId,
          collectionId,
          candidate.rejected_catalog_color_name,
          candidate.rejected_catalog_material_name || "",
          candidate.price_group || ""
        )
      : null;

    if (!catalogItemId) {
      console.warn(
        `  NOTE: rejected catalog item not found for "${candidate.rejected_catalog_color_name}" — review row will have null matched_catalog_item_id`
      );
    }

    const payload = buildRejectReviewPayload(candidate, orgId, catalogItemId);

    if (isDryRun) {
      console.log(
        `  [DRY-RUN] reject review: "${candidate.source_color_name} - ${candidate.source_material_name}"` +
          ` ✗ "${candidate.rejected_catalog_color_name}" (review_status=rejected)`
      );
      successCount += 1;
      continue;
    }

    // SELECT-then-INSERT: check for existing row before inserting.
    let existing;
    try {
      existing = await findExistingReview(
        supabase,
        orgId,
        payload.normalized_source_color_name,
        payload.normalized_source_material_name ?? null,
        payload.match_method,
        payload.review_status,
        payload.matched_catalog_item_id ?? null
      );
    } catch (lookupErr) {
      console.warn(
        `  WARN: review existence check failed for "${candidate.source_color_name}": ${lookupErr.message}`
      );
      skipCount += 1;
      continue;
    }

    if (existing) {
      console.log(
        `  SKIP (already exists): reject review "${candidate.source_color_name} - ${candidate.source_material_name}"` +
          ` ✗ "${candidate.rejected_catalog_color_name}" [id=${existing.id}]`
      );
      skipCount += 1;
      continue;
    }

    const { error } = await supabase
      .from("slab_color_program_match_reviews")
      .insert(payload);

    if (error) {
      console.warn(
        `  WARN: reject review insert failed for "${candidate.source_color_name}": ${error.message}`
      );
      skipCount += 1;
    } else {
      console.log(
        `  OK: reject review inserted — "${candidate.source_color_name} - ${candidate.source_material_name}"` +
          ` ✗ "${candidate.rejected_catalog_color_name}" [rejected]`
      );
      successCount += 1;
    }
  }

  return { successCount, skipCount };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const isDryRun = !WRITE_ENABLED;

  console.log("=".repeat(70));
  console.log("importElite100AliasReviews");
  console.log(`Mode       : ${isDryRun ? "DRY-RUN (no writes)" : "WRITE ENABLED"}`);
  console.log(`Seed file  : ${SEED_PATH}`);
  console.log(`Collection : ${COLLECTION_KEY}`);
  console.log("=".repeat(70));

  // Load seed
  let approved, rejected;
  try {
    ({ approved, rejected } = loadSeed(SEED_PATH));
  } catch (e) {
    console.error(`ERROR: Failed to load seed file: ${e.message}`);
    process.exit(1);
  }
  console.log(`Approved alias candidates : ${approved.length}`);
  console.log(`Rejected fuzzy candidates : ${rejected.length}`);

  // Validate write prerequisites
  if (!isDryRun) {
    if (!ORG_ID) {
      console.error(
        "ERROR: SLABOS_ORGANIZATION_ID (or SLABCLOUD_ORGANIZATION_ID) is required when write is enabled."
      );
      process.exit(1);
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error(
        "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when write is enabled."
      );
      process.exit(1);
    }
  }

  // In dry-run with no credentials, we can still print payloads using a placeholder orgId
  const effectiveOrgId = ORG_ID || "dry-run-placeholder-org";
  const effectiveCollectionId = "dry-run-placeholder-collection";

  let supabase = null;
  let collectionId = effectiveCollectionId;

  if (!isDryRun) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // Verify collection exists (must not auto-activate it)
    const collection = await findCollectionId(supabase, effectiveOrgId, COLLECTION_KEY);
    if (!collection) {
      console.error(
        `ERROR: Collection "${COLLECTION_KEY}" not found for org ${effectiveOrgId}. ` +
          `Run importElite100Catalog.js first.`
      );
      process.exit(1);
    }
    collectionId = collection.id;
    console.log(
      `Collection found: ${collectionId} (is_active=${collection.is_active})`
    );
    if (collection.is_active) {
      console.warn(
        "  NOTE: Collection is already active. Aliases will still be applied safely."
      );
    }
  } else {
    console.log(
      "\nDRY-RUN: printing planned operations (no Supabase calls for writes).\n"
    );
  }

  // Process approved aliases
  console.log(`\n--- Approved aliases (${approved.length}) ---`);
  let aliasResults;
  if (!isDryRun && supabase) {
    aliasResults = await applyApprovedAliases(
      supabase,
      effectiveOrgId,
      collectionId,
      approved,
      false
    );
  } else {
    // Dry-run: build and print payloads using placeholder IDs
    for (const candidate of approved) {
      const payload = buildAliasPayload(candidate, effectiveOrgId, null);
      console.log(
        `  [DRY-RUN] alias payload for "${candidate.source_color_name} - ${candidate.source_material_name}":`
      );
      console.log(
        `    normalized_alias_color_name  : ${payload.normalized_alias_color_name}`
      );
      console.log(
        `    normalized_alias_material_name: ${payload.normalized_alias_material_name}`
      );
      console.log(
        `    → catalog: "${candidate.catalog_color_name} - ${candidate.catalog_material_name}" [${candidate.price_group}]`
      );
    }
    aliasResults = { successCount: approved.length, skipCount: 0 };
  }

  // Process rejected reviews
  console.log(`\n--- Rejected fuzzy candidates (${rejected.length}) ---`);
  let reviewResults;
  if (!isDryRun && supabase) {
    reviewResults = await applyRejectedReviews(
      supabase,
      effectiveOrgId,
      collectionId,
      rejected,
      false
    );
  } else {
    for (const candidate of rejected) {
      const payload = buildRejectReviewPayload(candidate, effectiveOrgId, null);
      console.log(
        `  [DRY-RUN] reject review payload for "${candidate.source_color_name} - ${candidate.source_material_name}":`
      );
      console.log(
        `    normalized_source_color_name : ${payload.normalized_source_color_name}`
      );
      console.log(`    review_status                : ${payload.review_status}`);
      console.log(`    match_method                 : ${payload.match_method}`);
      console.log(
        `    ✗ rejected suggestion: "${candidate.rejected_catalog_color_name}" — ${candidate.reason}`
      );
    }
    reviewResults = { successCount: rejected.length, skipCount: 0 };
  }

  // Summary
  console.log("\n" + "─".repeat(70));
  console.log("SUMMARY");
  console.log(`  Aliases processed  : ${aliasResults.successCount} OK, ${aliasResults.skipCount} skipped`);
  console.log(`  Reviews processed  : ${reviewResults.successCount} OK, ${reviewResults.skipCount} skipped`);
  if (isDryRun) {
    console.log("\nThis was a dry-run. No changes were made to Supabase.");
    console.log(
      "Set ELITE100_ALIAS_REVIEW_WRITE_ENABLED=1 (plus org + Supabase creds) to apply."
    );
  } else {
    console.log("\nDone. Collection is_active remains unchanged (still requires manual activation).");
    console.log("Next: run previewElite100Matches.js to verify updated alias counts.");
  }
}

// Guard: only run main() when executed directly, not when imported by tests.
if (process.argv[1] === __filename) {
  main().catch((e) => {
    console.error("Unhandled error:", e);
    process.exit(1);
  });
}
