/**
 * Load active slab_color_catalog_items (+ optional aliases) for sales classification.
 * Read-only — no mutations.
 */

import { loadElite100CatalogItems } from "./elite100CatalogFixture.js";

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} organizationId
 */
export async function loadSalesColorCatalog(supabase, organizationId) {
  const fallback = loadElite100CatalogItems().map((row) => ({
    ...row,
    id: null,
    catalog_source: "fixture_elite100_2026"
  }));

  if (!organizationId) {
    return {
      items: fallback,
      aliases: [],
      source: "fixture_elite100_2026",
      supabaseAvailable: false,
      itemCount: fallback.length
    };
  }

  try {
    let collectionId = null;
    const { data: collections, error: collErr } = await supabase
      .from("slab_color_collections")
      .select("id,collection_key,is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(5);

    if (collErr && !isMissingRelationError(collErr)) throw collErr;

    const elite =
      (collections ?? []).find((c) => String(c.collection_key ?? "").includes("elite100")) ??
      (collections ?? [])[0] ??
      null;
    collectionId = elite?.id ?? null;

    if (!collectionId) {
      return {
        items: fallback,
        aliases: [],
        source: "fixture_elite100_2026",
        supabaseAvailable: false,
        itemCount: fallback.length,
        note: "No active slab_color_collections row for organization"
      };
    }

    const { data: catalogItems, error: catErr } = await supabase
      .from("slab_color_catalog_items")
      .select(
        "id,color_name,material_name,price_group,display_name,normalized_color_name,normalized_material_name,color_key,is_active"
      )
      .eq("organization_id", organizationId)
      .eq("collection_id", collectionId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (catErr) throw catErr;

    if (!catalogItems?.length) {
      return {
        items: fallback,
        aliases: [],
        source: "fixture_elite100_2026",
        supabaseAvailable: true,
        itemCount: fallback.length,
        note: "slab_color_catalog_items empty — using fixture fallback"
      };
    }

    const items = catalogItems.map((row) => ({
      id: row.id,
      price_group: row.price_group,
      color_name: row.color_name,
      material_name: row.material_name,
      display_name: row.display_name,
      normalized_color_name: row.normalized_color_name,
      normalized_material_name: row.normalized_material_name,
      color_key: row.color_key,
      catalog_source: "slab_color_catalog_items"
    }));

    const catalogItemIds = items.map((i) => i.id).filter(Boolean);
    let aliases = [];
    if (catalogItemIds.length) {
      const { data: aliasRows, error: aliasErr } = await supabase
        .from("slab_color_aliases")
        .select(
          "catalog_item_id,alias_color_name,alias_material_name,normalized_alias_color_name,normalized_alias_material_name"
        )
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .in("catalog_item_id", catalogItemIds);
      if (!aliasErr && aliasRows?.length) {
        const byId = new Map(items.map((i) => [i.id, i]));
        aliases = aliasRows
          .map((a) => {
            const cat = byId.get(a.catalog_item_id);
            if (!cat) return null;
            return {
              normalized_alias_color_name: a.normalized_alias_color_name,
              normalized_alias_material_name: a.normalized_alias_material_name ?? "",
              catalog_color_name: cat.color_name,
              catalog_material_name: cat.material_name
            };
          })
          .filter(Boolean);
      }
    }

    return {
      items,
      aliases,
      source: "slab_color_catalog_items",
      supabaseAvailable: true,
      itemCount: items.length,
      collectionId
    };
  } catch (e) {
    if (isMissingRelationError(e)) {
      return {
        items: fallback,
        aliases: [],
        source: "fixture_elite100_2026",
        supabaseAvailable: false,
        itemCount: fallback.length,
        note: String(e?.message ?? e)
      };
    }
    throw e;
  }
}
