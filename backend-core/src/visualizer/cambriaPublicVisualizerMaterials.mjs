/**
 * Resolve Cambria catalog materials for the public visualizer render path.
 * Public-safe only: approved visual-asset texture URLs, no costs/inventory IDs.
 */
import { isCambriaCatalogItem } from "../slabInventory/cambriaPublicShowroom.js";
import {
  chooseBestAssetsByCatalogId,
  pickElite100TextureUrls,
  slugifyVisualizerKey,
} from "./elite100VisualAssetTextures.mjs";
import { resolvePublicVisualizerOrganizationId } from "./publicVisualizerConfig.mjs";

export const CAMBRIA_MATERIAL_ID_PREFIX = "cambria-";

/**
 * @param {string|null|undefined} materialId
 * @returns {string|null} catalog item UUID when id is cambria-<uuid>
 */
export function parseCambriaMaterialId(materialId) {
  const id = String(materialId ?? "").trim();
  if (!id.toLowerCase().startsWith(CAMBRIA_MATERIAL_ID_PREFIX)) return null;
  const rest = id.slice(CAMBRIA_MATERIAL_ID_PREFIX.length).trim();
  return rest || null;
}

/**
 * Build a public visualizer material id for a Cambria catalog item.
 * @param {string|null|undefined} catalogItemId
 */
export function buildCambriaMaterialId(catalogItemId) {
  const id = String(catalogItemId ?? "").trim();
  if (!id) return null;
  return `${CAMBRIA_MATERIAL_ID_PREFIX}${id}`;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {string} organizationId
 * @param {string} catalogItemId
 * @returns {Promise<{ displayName: string, fullUrl: string, thumbUrl: string, source: string, slug: string }|null>}
 */
export async function resolveCambriaPublicMaterial(supabase, organizationId, catalogItemId) {
  if (!supabase || !organizationId || !catalogItemId) return null;

  const { data: item, error: itemErr } = await supabase
    .from("slab_color_catalog_items")
    .select("id,color_name,material_name,display_name,color_key,price_group,is_active,organization_id")
    .eq("organization_id", organizationId)
    .eq("id", catalogItemId)
    .maybeSingle();

  if (itemErr || !item || item.is_active === false) return null;
  if (!isCambriaCatalogItem(item)) return null;

  const { data: assets, error: assetErr } = await supabase
    .from("slab_color_visual_assets")
    .select(
      "catalog_item_id,texture_url_600,texture_url_1024,hero_url,original_image_url,asset_kind,review_status,is_primary,is_active,product_slug,source_color_name",
    )
    .eq("organization_id", organizationId)
    .eq("catalog_item_id", catalogItemId)
    .eq("is_active", true);

  if (assetErr) return null;

  const bestMap = chooseBestAssetsByCatalogId(assets ?? []);
  const asset = bestMap.get(String(catalogItemId));
  if (!asset) return null;

  const { fullUrl, thumbUrl } = pickElite100TextureUrls(asset);
  if (!fullUrl) return null;

  const displayName = String(item.display_name ?? item.color_name ?? "Cambria").trim() || "Cambria";
  const slug = slugifyVisualizerKey(item.color_key || item.color_name || item.id);

  return {
    displayName,
    fullUrl: String(fullUrl),
    thumbUrl: String(thumbUrl ?? fullUrl),
    source: "cambria_visual_asset",
    slug,
  };
}

/**
 * @param {string} materialId
 * @param {{ getSupabase?: () => import("@supabase/supabase-js").SupabaseClient|null }} [opts]
 * @returns {Promise<{ displayName: string, fullUrl: string, thumbUrl: string, source: string }|null>}
 */
export async function lookupCambriaPublicMaterial(materialId, opts = {}) {
  const catalogItemId = parseCambriaMaterialId(materialId);
  if (!catalogItemId) return null;

  const organizationId = resolvePublicVisualizerOrganizationId();
  if (!organizationId) return null;

  const getSupabase = typeof opts.getSupabase === "function" ? opts.getSupabase : () => null;
  const supabase = getSupabase();
  if (!supabase) return null;

  return resolveCambriaPublicMaterial(supabase, organizationId, catalogItemId);
}
