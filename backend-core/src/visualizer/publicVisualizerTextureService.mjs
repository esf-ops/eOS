/**
 * Public visualizer texture service — backend static JSON + optional Elite 100 DB assets.
 * Read-only Supabase queries. No slab inventory route coupling.
 * Never reads app-visualizer/catalog at runtime.
 */
import {
  buildElite100PublicTextures,
  findForbiddenPublicFields,
  normalizeColorNameKey,
} from "./elite100VisualAssetTextures.mjs";
import { lookupCambriaPublicMaterial } from "./cambriaPublicVisualizerMaterials.mjs";
import { readPublicVisualizerAssetConfig } from "./publicVisualizerConfig.mjs";
import { listBackendStaticPublicTextures } from "./publicVisualizerStaticCatalog.mjs";

/** @type {Map<string, { displayName: string, fullUrl: string, thumbUrl: string, source: string }>} */
let materialRegistry = new Map();

/** @type {number} */
let registryBuiltAtMs = 0;

const REGISTRY_TTL_MS = 5 * 60 * 1000;

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} supabase
 * @param {string} organizationId
 */
export async function fetchElite100CatalogAndAssets(supabase, organizationId) {
  if (!supabase || !organizationId) {
    return { catalogItems: [], assets: [], warning: "supabase_or_org_not_configured" };
  }

  try {
    const { data: collections, error: collErr } = await supabase
      .from("slab_color_collections")
      .select("id,collection_key,is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(5);

    if (collErr) {
      if (isMissingRelationError(collErr)) {
        return { catalogItems: [], assets: [], warning: "collections_table_missing" };
      }
      throw collErr;
    }

    const elite =
      (collections ?? []).find((c) => String(c.collection_key ?? "").includes("elite100")) ??
      (collections ?? [])[0] ??
      null;

    if (!elite?.id) {
      return { catalogItems: [], assets: [], warning: "no_active_elite100_collection" };
    }

    const { data: catalogItems, error: catErr } = await supabase
      .from("slab_color_catalog_items")
      .select("id,color_name,material_name,price_group,display_name,color_key,is_active")
      .eq("organization_id", organizationId)
      .eq("collection_id", elite.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (catErr) {
      if (isMissingRelationError(catErr)) {
        return { catalogItems: [], assets: [], warning: "catalog_items_table_missing" };
      }
      throw catErr;
    }

    const ids = (catalogItems ?? []).map((c) => c.id).filter(Boolean);
    if (!ids.length) {
      return { catalogItems: [], assets: [], warning: "catalog_items_empty" };
    }

    const { data: assets, error: assetErr } = await supabase
      .from("slab_color_visual_assets")
      .select(
        "catalog_item_id,texture_url_600,texture_url_1024,hero_url,original_image_url,asset_kind,review_status,is_primary,is_active,product_slug,source_color_name",
      )
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .in("catalog_item_id", ids);

    if (assetErr) {
      if (isMissingRelationError(assetErr)) {
        return { catalogItems: catalogItems ?? [], assets: [], warning: "visual_assets_table_missing" };
      }
      throw assetErr;
    }

    return {
      catalogItems: catalogItems ?? [],
      assets: assets ?? [],
      warning: null,
    };
  } catch (err) {
    return {
      catalogItems: [],
      assets: [],
      warning: "query_failed",
      errorMessage: String(err?.message ?? err),
    };
  }
}

/**
 * @param {Array<object>} staticTextures
 * @param {Array<object>} eliteTextures
 */
export function mergePublicVisualizerTextures(staticTextures, eliteTextures) {
  const eliteNames = new Set(
    eliteTextures.map((t) => normalizeColorNameKey(t.displayName)).filter(Boolean),
  );

  const merged = [];
  for (const row of eliteTextures) {
    merged.push({ ...row });
  }

  for (const row of staticTextures) {
    const nameKey = normalizeColorNameKey(row.displayName);
    if (nameKey && eliteNames.has(nameKey)) continue;
    merged.push({ ...row });
  }

  merged.sort((a, b) =>
    String(a.displayName ?? "").localeCompare(String(b.displayName ?? ""), undefined, {
      sensitivity: "base",
    }),
  );

  return merged;
}

/**
 * @param {Array<object>} textures
 */
function rebuildMaterialRegistry(textures) {
  const next = new Map();
  for (const t of textures) {
    if (!t?.id || !t.fullUrl) continue;
    next.set(String(t.id), {
      displayName: String(t.displayName ?? t.id),
      fullUrl: String(t.fullUrl),
      thumbUrl: String(t.thumbUrl ?? t.fullUrl),
      source: String(t.source ?? "static"),
    });
  }
  materialRegistry = next;
  registryBuiltAtMs = Date.now();
}

/**
 * @param {string|null|undefined} warning
 * @param {string|null|undefined} extra
 * @returns {string|null}
 */
function joinWarnings(warning, extra) {
  const parts = [warning, extra].map((w) => String(w ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

/**
 * @param {{ getSupabase?: () => import("@supabase/supabase-js").SupabaseClient|null, forceRefresh?: boolean }} [opts]
 */
export async function listPublicVisualizerTextures(opts = {}) {
  try {
    const assetCfg = readPublicVisualizerAssetConfig();
    const staticLoaded = listBackendStaticPublicTextures();
    const staticRows = staticLoaded.textures;

    /** @type {Array<object>} */
    let eliteRows = [];
    /** @type {Record<string, number>} */
    let skipped = {};
    let elite100Warning = null;

    if (assetCfg.useElite100Assets && assetCfg.organizationId && opts.getSupabase) {
      const supabase = opts.getSupabase();
      const fetched = await fetchElite100CatalogAndAssets(supabase, assetCfg.organizationId);
      if (fetched.warning) {
        elite100Warning = fetched.errorMessage
          ? `${fetched.warning}: ${fetched.errorMessage}`
          : fetched.warning;
      }
      const built = buildElite100PublicTextures(fetched.catalogItems, fetched.assets);
      eliteRows = built.textures;
      skipped = built.skipped;
    } else if (assetCfg.useElite100Assets && !assetCfg.organizationId) {
      elite100Warning = "PUBLIC_VISUALIZER_ORGANIZATION_ID not configured";
    }

    const merged = mergePublicVisualizerTextures(staticRows, eliteRows);
    rebuildMaterialRegistry(merged);

    const colorFamilies = [...new Set(merged.map((t) => t.colorFamily).filter(Boolean))].sort();
    const collections = [...new Set(merged.map((t) => t.collection).filter(Boolean))].sort();

    const elite100Count = merged.filter((t) => t.source === "elite100_visual_asset").length;
    const staticCount = merged.filter((t) => t.source === "static").length;
    const finalCount = merged.length;

    const warning = joinWarnings(staticLoaded.warning, elite100Warning);

    return {
      textures: merged,
      meta: {
        totalListed: finalCount,
        totalAvailable: finalCount,
        finalCount,
        staticCount,
        elite100AssetCount: elite100Count,
        elite100VisualAssetCount: elite100Count,
        usesElite100Assets: assetCfg.useElite100Assets && elite100Count > 0,
        collections,
        colorFamilies,
        skippedAssets: skipped,
        warning,
        fallbackStaticOnly: elite100Count === 0,
        groups: collections,
      },
      staticFallbackCount: staticLoaded.catalogEntryCount,
    };
  } catch (err) {
    console.warn("[public-visualizer/textures] list failed:", err?.message || String(err));
    return {
      textures: [],
      meta: {
        totalListed: 0,
        totalAvailable: 0,
        finalCount: 0,
        staticCount: 0,
        elite100AssetCount: 0,
        elite100VisualAssetCount: 0,
        usesElite100Assets: false,
        collections: [],
        colorFamilies: [],
        skippedAssets: {},
        warning: `texture_list_failed: ${String(err?.message ?? err)}`,
        fallbackStaticOnly: true,
        groups: [],
      },
      staticFallbackCount: 0,
    };
  }
}

/**
 * @param {{ getSupabase?: () => import("@supabase/supabase-js").SupabaseClient|null }} [opts]
 */
export async function ensureMaterialRegistry(opts = {}) {
  if (Date.now() - registryBuiltAtMs < REGISTRY_TTL_MS && materialRegistry.size > 0) {
    return;
  }
  await listPublicVisualizerTextures({ ...opts, forceRefresh: true });
}

const MATERIAL_FETCH_TIMEOUT_MS = 30_000;
const MATERIAL_FETCH_MAX_BYTES = 12 * 1024 * 1024;

/**
 * @param {string} url
 */
async function fetchRemoteTextureBytes(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MATERIAL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) {
      throw Object.assign(new Error(`Failed to fetch material image (${res.status}).`), {
        statusCode: 502,
      });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MATERIAL_FETCH_MAX_BYTES) {
      throw Object.assign(new Error("Material image is too large."), { statusCode: 413 });
    }
    const mimeType = String(res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    return { buffer: buf, mimeType: mimeType || "image/jpeg" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} materialId
 * @param {{ getSupabase?: () => import("@supabase/supabase-js").SupabaseClient|null }} [opts]
 */
export async function loadPublicMaterialBytes(materialId, opts = {}) {
  const id = String(materialId ?? "").trim();
  if (!id) {
    throw Object.assign(new Error("Choose a countertop material before generating."), {
      statusCode: 400,
      code: "MISSING_MATERIAL",
    });
  }

  await ensureMaterialRegistry(opts);

  let reg = materialRegistry.get(id);
  if (!reg) {
    // Cambria mode materials (cambria-<catalog_item_id>) are not in the Elite 100
    // list response — resolve on demand from public-safe visual assets only.
    const cambria = await lookupCambriaPublicMaterial(id, opts);
    if (cambria?.fullUrl) {
      reg = {
        displayName: cambria.displayName,
        fullUrl: cambria.fullUrl,
        thumbUrl: cambria.thumbUrl,
        source: cambria.source,
      };
      materialRegistry.set(id, reg);
    }
  }

  if (!reg) {
    throw Object.assign(new Error(`Unknown material: ${id}`), { statusCode: 400, code: "UNKNOWN_MATERIAL" });
  }

  const remote = await fetchRemoteTextureBytes(reg.fullUrl);
  return {
    buffer: remote.buffer,
    mimeType: remote.mimeType,
    materialName: reg.displayName,
  };
}

/** Test helper */
export function resetPublicMaterialRegistryForTests() {
  materialRegistry = new Map();
  registryBuiltAtMs = 0;
}

/** Test helper — scan payload for forbidden public fields. */
export function scanPublicTexturePayload(payload) {
  return findForbiddenPublicFields(payload);
}
