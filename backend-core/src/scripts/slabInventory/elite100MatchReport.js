#!/usr/bin/env node
/**
 * elite100MatchReport.js — Compare Elite 100 catalog colors to active inventory.
 *
 * Read-only. No alias writes. Outputs matched/unmatched catalog colors,
 * unmapped inventory groups, and fuzzy alias suggestions for operator review.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required)
 *   SLABOS_ORGANIZATION_ID or SLABCLOUD_ORGANIZATION_ID (required)
 *   SLAB_INVENTORY_ACTIVE_SOURCE  default slabsmith (via resolveInventorySourceFilter)
 *
 * Usage:
 *   npm run eos:slab-inventory:elite100-match-report
 *   npm run eos:slab-inventory:elite100-match-report -- --json
 *   npm run eos:slab-inventory:elite100-match-report -- --limit 20
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { buildElite100MatchReport } from "../../slabInventory/elite100MatchDiagnostics.js";
import { fetchAllActiveInventoryRowsForElite100Matching } from "../../slabInventory/elite100InventoryFetch.js";
import { resolveInventorySourceFilter } from "../../slabInventory/slabInventorySourceFilter.js";

const ORG_ID =
  process.env.SLABOS_ORGANIZATION_ID ||
  process.env.SLABCLOUD_ORGANIZATION_ID ||
  null;
const JSON_OUT = process.argv.includes("--json");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  if (i === -1) return null;
  const n = Number.parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

function requireEnv() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }
  if (!ORG_ID) {
    console.error("ERROR: SLABOS_ORGANIZATION_ID (or SLABCLOUD_ORGANIZATION_ID) is required.");
    process.exit(1);
  }
}

async function loadActiveCollection(supabase, organizationId) {
  const { data, error } = await supabase
    .from("slab_color_collections")
    .select("id,collection_key,display_name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function loadCatalogItems(supabase, organizationId, collectionId) {
  const { data, error } = await supabase
    .from("slab_color_catalog_items")
    .select(
      "id,color_name,material_name,price_group,normalized_color_name,normalized_material_name,display_name,sort_order"
    )
    .eq("organization_id", organizationId)
    .eq("collection_id", collectionId)
    .eq("is_active", true);
  if (error) throw error;
  return data ?? [];
}

async function loadResolvedAliasesForCatalog(supabase, organizationId, catalogItemList) {
  const catalogItemIds = catalogItemList.map((c) => c.id).filter(Boolean);
  if (!catalogItemIds.length) return [];

  const { data, error } = await supabase
    .from("slab_color_aliases")
    .select(
      "catalog_item_id,alias_color_name,alias_material_name,normalized_alias_color_name,normalized_alias_material_name"
    )
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("catalog_item_id", catalogItemIds);
  if (error) throw error;

  const catalogItemMap = new Map(catalogItemList.map((c) => [c.id, c]));
  return (data ?? [])
    .map((alias) => {
      const catItem = catalogItemMap.get(alias.catalog_item_id);
      if (!catItem) return null;
      return {
        normalized_alias_color_name: alias.normalized_alias_color_name,
        normalized_alias_material_name: alias.normalized_alias_material_name ?? "",
        alias_color_name: alias.alias_color_name,
        alias_material_name: alias.alias_material_name,
        catalog_color_name: catItem.color_name,
        catalog_material_name: catItem.material_name,
      };
    })
    .filter(Boolean);
}

async function loadActiveInventory(supabase, organizationId, sourceFilter) {
  const scopeInv = (q) => {
    q = q.eq("organization_id", organizationId);
    if (sourceFilter.mode === "single" && sourceFilter.externalSource) {
      q = q.eq("external_source", sourceFilter.externalSource);
    }
    return q;
  };
  return fetchAllActiveInventoryRowsForElite100Matching(supabase, scopeInv);
}

function printSection(title) {
  console.log("");
  console.log("=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

function printHumanReport(report) {
  printSection("Elite 100 Match Report");
  console.log(`Active inventory source : ${report.active_inventory_source ?? "(env default)"}`);
  console.log(
    `Active inventory rows fetched: ${report.active_inventory_rows_fetched ?? report.inventory_row_count}`
  );
  if (report.active_inventory_fetch_pages != null) {
    console.log(`Active inventory fetch pages : ${report.active_inventory_fetch_pages}`);
  }
  if (report.expected_active_count != null) {
    console.log(`Expected active inventory count: ${report.expected_active_count}`);
  }
  if (report.active_inventory_fetch_complete != null) {
    console.log(
      `Active inventory fetch complete: ${report.active_inventory_fetch_complete ? "yes" : "NO — INCOMPLETE"}`
    );
  }
  if (report.fetch_warning) {
    console.log("");
    console.log("*** WARNING ***");
    console.log(report.fetch_warning);
    console.log("*** WARNING ***");
  }
  console.log(`Unique inventory colors : ${report.unique_inventory_color_groups}`);
  console.log(`Catalog items           : ${report.catalog_item_count}`);
  console.log(`Matched catalog colors  : ${report.matched_catalog_count}`);
  console.log(`Unmatched catalog colors: ${report.unmatched_catalog_count}`);
  console.log(`Unmapped inventory groups: ${report.unmapped_inventory_group_count}`);

  printSection(`Matched catalog (${report.matched_catalog.length})`);
  const matchedShow = LIMIT ? report.matched_catalog.slice(0, LIMIT) : report.matched_catalog;
  for (const row of matchedShow) {
    console.log(
      `  ✓ ${row.catalog_color_name} — ${row.catalog_material_name} [${row.matched_inventory_row_count} rows, ${row.match_methods.join("+")}]`
    );
    for (const src of row.matched_inventory_sources ?? []) {
      console.log(
        `      ← inventory "${src.color_name}" / "${src.material_name ?? ""}" (${src.row_count} rows, ${src.match_method})`
      );
    }
  }
  if (LIMIT && report.matched_catalog.length > LIMIT) {
    console.log(`  … ${report.matched_catalog.length - LIMIT} more (use --limit 0 or omit for all)`);
  }

  printSection(`Unmatched catalog — needs alias or name fix (${report.unmatched_catalog.length})`);
  const unmatchedShow = LIMIT ? report.unmatched_catalog.slice(0, LIMIT) : report.unmatched_catalog;
  for (const row of unmatchedShow) {
    console.log(`  ✗ ${row.catalog_color_name} — ${row.catalog_material_name}`);
    console.log(
      `      normalized: ${row.normalized_catalog_color_name} / ${row.normalized_catalog_material_name}`
    );
    if (row.approved_aliases?.length) {
      console.log(`      approved aliases (${row.approved_aliases.length}):`);
      for (const a of row.approved_aliases) {
        console.log(
          `        · "${a.alias_color_name}" / "${a.alias_material_name ?? ""}"`
        );
      }
    } else {
      console.log("      approved aliases: (none)");
    }
    if (row.fuzzy_candidate_inventory?.length) {
      console.log("      fuzzy inventory candidates:");
      for (const c of row.fuzzy_candidate_inventory) {
        console.log(
          `        ? "${c.color_name}" / "${c.material_name ?? ""}" — ${c.row_count} rows, sim=${c.color_similarity}`
        );
      }
    } else {
      console.log("      fuzzy inventory candidates: (none above threshold)");
    }
  }

  printSection(`Unmapped inventory — not Elite 100 (${report.unmapped_inventory.length})`);
  const unmappedShow = LIMIT ? report.unmapped_inventory.slice(0, LIMIT) : report.unmapped_inventory;
  for (const row of unmappedShow) {
    console.log(
      `  · "${row.color_name}" / "${row.material_name ?? ""}" — ${row.row_count} rows` +
        (row.nearest_match_method === "fuzzy"
          ? ` (nearest fuzzy confidence ${row.nearest_match_confidence})`
          : "")
    );
  }

  if (report.suggested_alias_candidates?.length) {
    printSection(`Suggested alias candidates — review only (${report.suggested_alias_candidates.length})`);
    const sugShow = LIMIT
      ? report.suggested_alias_candidates.slice(0, LIMIT)
      : report.suggested_alias_candidates;
    for (const s of sugShow) {
      console.log(
        `  ? inventory "${s.source.color_name}" / "${s.source.material_name ?? ""}" (${s.source.row_count} rows)` +
          ` → catalog "${s.suggested_catalog.color_name}" / "${s.suggested_catalog.material_name}"` +
          ` [sim=${s.color_similarity}]`
      );
    }
  }

  console.log("");
  console.log("Next step: add approved rows to slab_color_aliases, then re-run this report.");
  console.log("API debug: GET /api/slab-inventory/elite100-programs?debug=match (staff auth required)");
}

async function main() {
  requireEnv();
  const sourceFilter = resolveInventorySourceFilter({ env: process.env });
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const collection = await loadActiveCollection(supabase, ORG_ID);
  if (!collection) {
    console.error("No active Elite 100 collection for organization.");
    process.exit(1);
  }

  const catalogItemList = await loadCatalogItems(supabase, ORG_ID, collection.id);
  const resolvedAliases = await loadResolvedAliasesForCatalog(
    supabase,
    ORG_ID,
    catalogItemList
  );
  const inventoryFetch = await loadActiveInventory(supabase, ORG_ID, sourceFilter);
  const invRows = inventoryFetch.rows;

  const report = buildElite100MatchReport({
    catalogItemList,
    invRows,
    resolvedAliases,
    activeInventorySource: sourceFilter.resolved,
    inventoryFetch,
  });

  report.collection = {
    collection_key: collection.collection_key,
    display_name: collection.display_name,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printHumanReport(report);
}

main().catch((e) => {
  console.error("ERROR:", e?.message || e);
  process.exit(1);
});
