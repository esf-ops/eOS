/**
 * Public Cambria showcase helpers — filter + sanitize for /api/public/cambria-showroom.
 *
 * Inventory authority remains slabOS live inventory (active slab_inventory rows).
 * This module never exposes costs, margins, rack/lot, supplier codes, or debug fields.
 */

import { normalizeMaterialName } from "./colorProgramMatching.js";

/**
 * True when normalized text mentions Cambria as a whole token
 * (e.g. "Cambria", "Cambria Quartz") — not a random substring of another brand.
 * @param {unknown} value
 */
export function textMentionsCambria(value) {
  const n = normalizeMaterialName(value);
  if (!n) return false;
  return n === "cambria" || n.split(/\s+/).includes("cambria");
}

/**
 * Catalog / Elite 100 design rows — Cambria when material (or normalized material) is Cambria.
 * @param {Record<string, unknown>|null|undefined} item
 */
export function isCambriaCatalogItem(item) {
  if (!item || typeof item !== "object") return false;
  return (
    textMentionsCambria(item.normalized_material_name) ||
    textMentionsCambria(item.material_name)
  );
}

/**
 * Live inventory rows — Cambria when material/brand/vendor/distributor fields mention Cambria.
 * Robust across manufacturer/vendor naming without hardcoding a single fragile display string.
 * @param {Record<string, unknown>|null|undefined} item
 */
export function isCambriaInventoryItem(item) {
  if (!item || typeof item !== "object") return false;
  return (
    textMentionsCambria(item.material_name) ||
    textMentionsCambria(item.normalized_material_name) ||
    textMentionsCambria(item.distributor) ||
    textMentionsCambria(item.manufacturer) ||
    textMentionsCambria(item.vendor) ||
    textMentionsCambria(item.brand)
  );
}

/**
 * Public-safe Cambria design card (Elite 100 shape with inventory counts kept for the vendor meeting).
 * Strips inventory IDs, match debug, and other internal identifiers.
 * @param {Record<string, unknown>} card
 */
export function toPublicCambriaDesignCard(card) {
  if (!card || typeof card !== "object") return card;
  const {
    current_inventory_image_inventory_id: _cii,
    current_inventory_image_source_inventory_type: _cist,
    representative_image_inventory_id: _rii,
    representative_image_source_inventory_type: _rist,
    match_debug: _md,
    source_public_slug: _sps,
    source_api_company_code: _sac,
    source_asset_company_code: _sacc,
    rack: _rack,
    lot: _lot,
    distributor: _dist,
    cost: _cost,
    unit_cost: _uc,
    supplier_cost: _sc,
    margin: _margin,
    price: _price,
    ...publicCard
  } = card;
  return publicCard;
}

/**
 * Public-safe live inventory color card for Cambria kiosk grids.
 * @param {Record<string, unknown>} card
 */
export function toPublicCambriaInventoryCard(card) {
  if (!card || typeof card !== "object") return card;
  const imageUrl = card.representative_image_url ?? card.image_url ?? null;
  const thumbUrl =
    card.representative_thumbnail_url ?? card.thumbnail_url ?? imageUrl ?? null;
  return {
    color_key: card.color_key ?? null,
    color_name: card.color_name ?? null,
    material_name: card.material_name ?? "Cambria",
    total_inventory_count: Number(card.total_inventory_count ?? 0),
    slab_count: Number(card.slab_count ?? 0),
    remnant_count: Number(card.remnant_count ?? 0),
    thickness_nominal: card.thickness_nominal ?? null,
    representative_image_url: imageUrl,
    representative_thumbnail_url: thumbUrl,
    // Aliases matching protected live-inventory card fields (public-safe URLs only).
    image_url: imageUrl,
    thumbnail_url: thumbUrl,
  };
}

/**
 * Group active Cambria inventory rows into kiosk-friendly color cards.
 * Groups by color_name (material is always Cambria after filter).
 * Never sums SlabCloud count_for_color — physical row counts only.
 *
 * @param {Array<Record<string, unknown>>} rows  Already Cambria-filtered active rows
 * @param {Map<string, Record<string, unknown>>} imageMap
 * @param {(imageMap: Map<string, Record<string, unknown>>, row: Record<string, unknown>, filter: unknown) => { image_url?: string|null, thumbnail_url?: string|null, image_status?: string|null }|null} lookupImage
 *   Same argument order as lookupInventoryImage(imageMap, inventoryRow, sourceFilter).
 * @param {unknown} [sourceFilter]
 */
export function groupCambriaLiveInventoryCards(rows, imageMap, lookupImage, sourceFilter = null) {
  /** @type {Map<string, {
   *   color_name: string|null,
   *   material_name: string|null,
   *   slabCount: number,
   *   remnantCount: number,
   *   thicknesses: Set<string>,
   *   inventoryRows: Array<Record<string, unknown>>,
   * }>} */
  const groups = new Map();

  for (const r of Array.isArray(rows) ? rows : []) {
    if (!isCambriaInventoryItem(r)) continue;
    if (r.is_active === false) continue;

    const colorName = String(r.color_name ?? "").trim() || null;
    const key = normalizeMaterialName(colorName) || "unknown";
    let g = groups.get(key);
    if (!g) {
      g = {
        color_name: colorName,
        material_name: String(r.material_name ?? "").trim() || "Cambria",
        slabCount: 0,
        remnantCount: 0,
        thicknesses: new Set(),
        inventoryRows: [],
      };
      groups.set(key, g);
    }
    g.inventoryRows.push(r);
    const t = String(r.source_inventory_type ?? "").trim();
    if (t === "Slab") g.slabCount += 1;
    else if (t === "Remnant") g.remnantCount += 1;
    else g.slabCount += 1; // treat unknown typed rows as slab-like for count
    const thick = String(r.thickness_nominal ?? "").trim();
    if (thick) g.thicknesses.add(thick);
  }

  const cards = [];
  for (const [colorKey, g] of groups.entries()) {
    let repImage = null;
    let repThumbnail = null;
    let foundOk = false;
    for (const invRow of g.inventoryRows) {
      const img =
        typeof lookupImage === "function"
          ? lookupImage(imageMap, invRow, sourceFilter)
          : null;
      if (!img) continue;
      const status = String(img.image_status ?? "").toLowerCase();
      if (status === "missing" || status === "error") continue;
      const full = img.image_url ?? null;
      const thumb = img.thumbnail_url ?? img.image_url ?? null;
      if (!full && !thumb) continue;
      // Prefer verified "ok" images; keep first usable URL as fallback.
      if (status === "ok") {
        repImage = full || thumb;
        repThumbnail = thumb || full;
        foundOk = true;
        break;
      }
      if (!foundOk && !repImage) {
        repImage = full || thumb;
        repThumbnail = thumb || full;
      }
    }
    const thicknesses = [...g.thicknesses].sort();
    cards.push(
      toPublicCambriaInventoryCard({
        color_key: `cambria--${colorKey}`,
        color_name: g.color_name,
        material_name: g.material_name,
        total_inventory_count: g.slabCount + g.remnantCount,
        slab_count: g.slabCount,
        remnant_count: g.remnantCount,
        thickness_nominal: thicknesses.length === 1 ? thicknesses[0] : thicknesses.length > 1 ? thicknesses.join(" / ") : null,
        representative_image_url: repImage,
        representative_thumbnail_url: repThumbnail,
        image_url: repImage,
        thumbnail_url: repThumbnail,
      })
    );
  }

  cards.sort((a, b) =>
    String(a.color_name ?? "").localeCompare(String(b.color_name ?? ""), undefined, { sensitivity: "base" })
  );
  return cards;
}

/**
 * Assemble the public Cambria showcase JSON body from pre-built design groups + inventory cards.
 * @param {{
 *   collection: Record<string, unknown>|null,
 *   designGroups: Array<{ price_group: string, items: Array<Record<string, unknown>> }>,
 *   inventoryCards: Array<Record<string, unknown>>,
 *   price_group_order: string[],
 *   note?: string,
 * }} input
 */
export function buildPublicCambriaShowroomPayload(input) {
  const collection = input?.collection ?? null;
  const designGroups = Array.isArray(input?.designGroups) ? input.designGroups : [];
  const inventoryCards = Array.isArray(input?.inventoryCards) ? input.inventoryCards : [];
  const price_group_order = Array.isArray(input?.price_group_order) ? input.price_group_order : [];

  const designCount = designGroups.reduce((sum, g) => sum + (g.items?.length ?? 0), 0);
  const inventoryPieceCount = inventoryCards.reduce(
    (sum, c) => sum + Number(c.total_inventory_count ?? 0),
    0
  );

  return {
    ok: true,
    title: "Cambria Showcase",
    subtitle: "Live inventory and stocked designs at Elite Stone Fabrication",
    collection: collection
      ? {
          collection_key: collection.collection_key ?? null,
          display_name: collection.display_name ?? null,
          collection_year: collection.collection_year ?? null,
          is_active: collection.is_active !== false,
        }
      : null,
    designs: {
      label: "Cambria Designs",
      groups: designGroups,
      total: designCount,
    },
    inventory: {
      label: "Cambria Live Inventory",
      items: inventoryCards,
      total_colors: inventoryCards.length,
      total_pieces: inventoryPieceCount,
    },
    price_group_order,
    ...(input?.note ? { note: input.note } : {}),
  };
}
