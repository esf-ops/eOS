/**
 * Public visualizer texture service — static JSON + optional Elite 100 DB assets.
 * Read-only Supabase queries. No slab inventory route coupling.
 */
import {
  buildElite100PublicTextures,
  normalizeColorNameKey,
  STATIC_COLLECTION_LABEL,
} from "./elite100VisualAssetTextures.mjs";
import { readPublicVisualizerAssetConfig } from "./publicVisualizerConfig.mjs";
import {
  findCatalogTexture,
  listTexturesForApi,
  loadCatalogEntries,
  loadTextureBytes,
  textureFileStatus,
} from "./visualizerTextureCatalog.mjs";

/** @type {Map<string, { displayName: string, fullUrl: string, thumbUrl: string, source: string, localRelativePath?: string|null }>} */
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
 * @param {object} entry
 */
function mapStaticPublicTexture(entry) {
  const status = textureFileStatus(entry);
  const thumbUrl = `/material-textures/${entry.thumbPath}`;
  const fullUrl = `/material-textures/${entry.fullPath}`;
  if (!status.hasImage) return null;

  return {
    id: entry.id,
    slug: entry.slug,
    displayName: entry.displayName,
    collection: entry.group ?? STATIC_COLLECTION_LABEL,
    colorFamily: entry.colorFamily ?? null,
    patternType: entry.patternType ?? null,
    thumbUrl: status.hasThumb ? thumbUrl : fullUrl,
    fullUrl,
    source: "static",
    _localRelativePath: entry.fullPath,
  };
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
    const { _localRelativePath: _drop, ...pub } = row;
    merged.push(pub);
  }

  for (const row of staticTextures) {
    const nameKey = normalizeColorNameKey(row.displayName);
    if (nameKey && eliteNames.has(nameKey)) continue;
    const { _localRelativePath: _drop, ...pub } = row;
    merged.push(pub);
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
      localRelativePath: t._localRelativePath ?? null,
    });
  }
  materialRegistry = next;
  registryBuiltAtMs = Date.now();
}

/**
 * @param {{ getSupabase?: () => import("@supabase/supabase-js").SupabaseClient|null, forceRefresh?: boolean }} [opts]
 */
export async function listPublicVisualizerTextures(opts = {}) {
  const assetCfg = readPublicVisualizerAssetConfig();
  const staticListed = listTexturesForApi();
  const staticRows = loadCatalogEntries()
    .map(mapStaticPublicTexture)
    .filter(Boolean);

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

  const mergedInternal = mergePublicVisualizerTextures(staticRows, eliteRows);
  rebuildMaterialRegistry(mergedInternal);

  const textures = mergedInternal.map(({ _localRelativePath: _l, ...rest }) => rest);
  const colorFamilies = [...new Set(textures.map((t) => t.colorFamily).filter(Boolean))].sort();
  const collections = [...new Set(textures.map((t) => t.collection).filter(Boolean))].sort();

  const elite100Count = textures.filter((t) => t.source === "elite100_visual_asset").length;
  const staticCount = textures.filter((t) => t.source === "static").length;

  return {
    textures,
    meta: {
      totalListed: textures.length,
      totalAvailable: textures.length,
      staticCount,
      elite100VisualAssetCount: elite100Count,
      usesElite100Assets: assetCfg.useElite100Assets && elite100Count > 0,
      collections,
      colorFamilies,
      skippedAssets: skipped,
      warning: elite100Warning,
      fallbackStaticOnly: elite100Count === 0,
      groups: collections,
    },
    staticFallbackCount: staticListed.textures.length,
  };
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

  const reg = materialRegistry.get(id);
  if (reg) {
    if (reg.localRelativePath) {
      try {
        const loaded = loadTextureBytes(id);
        return {
          buffer: loaded.buffer,
          mimeType: loaded.mimeType,
          materialName: loaded.materialName,
        };
      } catch {
        /* fall through to remote */
      }
    }
    const remote = await fetchRemoteTextureBytes(reg.fullUrl);
    return {
      buffer: remote.buffer,
      mimeType: remote.mimeType,
      materialName: reg.displayName,
    };
  }

  const staticEntry = findCatalogTexture(id);
  if (staticEntry) {
    const loaded = loadTextureBytes(id);
    return {
      buffer: loaded.buffer,
      mimeType: loaded.mimeType,
      materialName: loaded.materialName,
    };
  }

  throw Object.assign(new Error(`Unknown material: ${id}`), { statusCode: 400, code: "UNKNOWN_MATERIAL" });
}

/** Test helper */
export function resetPublicMaterialRegistryForTests() {
  materialRegistry = new Map();
  registryBuiltAtMs = 0;
}
