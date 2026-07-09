/**
 * Pure helpers — Elite 100 visual asset → public visualizer texture rows.
 * No slab inventory imports. No operational fields in outputs.
 */

export const ALLOWED_REVIEW_STATUSES = new Set(["approved", "imported"]);
export const ALLOWED_ASSET_KINDS = new Set(["texture", "manual_upload", "manufacturer"]);
export const EXCLUDED_ASSET_KINDS = new Set(["slab_photo", "generated"]);

export const ELITE100_COLLECTION_LABEL = "Elite 100 Collection";
export const STATIC_COLLECTION_LABEL = "Preview Collection";

/**
 * @param {string|null|undefined} name
 */
export function slugifyVisualizerKey(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * @param {string|null|undefined} name
 */
export function normalizeColorNameKey(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string|null|undefined} priceGroup
 */
export function priceGroupCollectionLabel(priceGroup) {
  const pg = String(priceGroup ?? "").trim();
  if (!pg) return ELITE100_COLLECTION_LABEL;
  if (pg.toLowerCase() === "promo") return "Elite 100 · Group Promo";
  return `Elite 100 · Group ${pg}`;
}

/**
 * @param {object|null|undefined} asset
 */
export function scoreElite100VisualAsset(asset) {
  if (!asset || asset.is_active === false) return 0;
  if (!ALLOWED_REVIEW_STATUSES.has(String(asset.review_status ?? ""))) return 0;
  const kind = String(asset.asset_kind ?? "texture");
  if (EXCLUDED_ASSET_KINDS.has(kind) || kind === "slab_photo") return 0;
  if (!ALLOWED_ASSET_KINDS.has(kind)) return 0;

  const statusScore = asset.review_status === "approved" ? 1000 : 100;
  const primaryScore = asset.is_primary ? 50 : 0;
  const kindScore =
    kind === "texture" ? 10 : kind === "manufacturer" ? 8 : kind === "manual_upload" ? 6 : 0;
  return statusScore + primaryScore + kindScore;
}

/**
 * @param {object|null|undefined} asset
 * @returns {{ fullUrl: string|null, thumbUrl: string|null }}
 */
export function pickElite100TextureUrls(asset) {
  if (!asset) return { fullUrl: null, thumbUrl: null };
  const kind = String(asset.asset_kind ?? "texture");
  if (EXCLUDED_ASSET_KINDS.has(kind) || kind === "slab_photo") {
    return { fullUrl: null, thumbUrl: null };
  }

  const fullUrl =
    asset.texture_url_1024 ??
    asset.hero_url ??
    asset.texture_url_600 ??
    (ALLOWED_ASSET_KINDS.has(kind) ? asset.original_image_url ?? null : null);

  const thumbUrl =
    asset.texture_url_600 ??
    asset.texture_url_1024 ??
    asset.hero_url ??
    fullUrl;

  return {
    fullUrl: fullUrl ? String(fullUrl) : null,
    thumbUrl: thumbUrl ? String(thumbUrl) : null,
  };
}

/**
 * @param {object} asset
 * @returns {string|null}
 */
export function skipReasonForAsset(asset) {
  if (!asset) return "missing_asset";
  if (asset.is_active === false) return "inactive";
  const review = String(asset.review_status ?? "");
  if (review === "needs_review") return "needs_review";
  if (review === "rejected") return "rejected";
  if (!ALLOWED_REVIEW_STATUSES.has(review)) return "bad_review_status";
  const kind = String(asset.asset_kind ?? "texture");
  if (kind === "slab_photo") return "slab_photo";
  if (EXCLUDED_ASSET_KINDS.has(kind)) return "excluded_kind";
  if (!ALLOWED_ASSET_KINDS.has(kind)) return "bad_asset_kind";
  const { fullUrl } = pickElite100TextureUrls(asset);
  if (!fullUrl) return "missing_url";
  return null;
}

/**
 * Choose best asset per catalog_item_id from raw rows.
 * @param {Array<object>} assets
 * @returns {Map<string, object>}
 */
export function chooseBestAssetsByCatalogId(assets) {
  /** @type {Map<string, { asset: object, score: number }>} */
  const best = new Map();
  for (const asset of Array.isArray(assets) ? assets : []) {
    const catalogId = String(asset.catalog_item_id ?? "").trim();
    if (!catalogId) continue;
    const score = scoreElite100VisualAsset(asset);
    if (score <= 0) continue;
    const prev = best.get(catalogId);
    if (!prev || score > prev.score) {
      best.set(catalogId, { asset, score });
    } else if (score === prev.score) {
      const prevUrls = pickElite100TextureUrls(prev.asset);
      const nextUrls = pickElite100TextureUrls(asset);
      const prevHas1024 = Boolean(prev.asset.texture_url_1024);
      const nextHas1024 = Boolean(asset.texture_url_1024);
      if (nextHas1024 && !prevHas1024) {
        best.set(catalogId, { asset, score });
      } else if (nextUrls.fullUrl && !prevUrls.fullUrl) {
        best.set(catalogId, { asset, score });
      }
    }
  }
  const out = new Map();
  for (const [id, entry] of best.entries()) {
    out.set(id, entry.asset);
  }
  return out;
}

/**
 * @param {object} catalogItem
 * @param {object} asset
 */
export function buildElite100PublicTexture(catalogItem, asset) {
  const { fullUrl, thumbUrl } = pickElite100TextureUrls(asset);
  if (!fullUrl || !thumbUrl) return null;

  const colorName = String(catalogItem.display_name ?? catalogItem.color_name ?? "Color").trim();
  const slug = slugifyVisualizerKey(
    catalogItem.color_key || catalogItem.color_name || catalogItem.id,
  );
  const id = `e100-${slug || "color"}`;

  return {
    id,
    slug,
    displayName: catalogItem.color_name ?? colorName,
    collection: priceGroupCollectionLabel(catalogItem.price_group),
    colorFamily: inferColorFamily(catalogItem.color_name),
    patternType: inferPatternType(catalogItem.color_name),
    thumbUrl,
    fullUrl,
    source: "elite100_visual_asset",
  };
}

/**
 * @param {string|null|undefined} colorName
 */
export function inferColorFamily(colorName) {
  const n = normalizeColorNameKey(colorName);
  if (!n) return null;
  if (/\bblack\b|\bpearl\b|\bobsidian\b|\bcharcoal\b/.test(n)) return "Black";
  if (/\bbrown\b|\bespresso\b|\bchocolate\b|\bsuede\b/.test(n)) return "Brown";
  if (/\bgray\b|\bgrey\b|\bsilver\b|\bgraphite\b|\bstorm\b/.test(n)) return "Gray";
  if (/\bbeige\b|\bsand\b|\btaupe\b|\bwarm\b|\bfuzzy\b/.test(n)) return "Beige";
  if (/\bwhite\b|\bdove\b|\bblizzard\b|\bcarrara\b|\bbianco\b|\bcalacatta\b/.test(n)) {
    return "White";
  }
  return null;
}

/**
 * @param {string|null|undefined} colorName
 */
export function inferPatternType(colorName) {
  const n = normalizeColorNameKey(colorName);
  if (!n) return null;
  if (/\bvein\b|\bcalacatta\b|\bcarrara\b|\bmarble\b|\bstatuario\b/.test(n)) return "veined";
  return "solid";
}

/**
 * @param {Array<object>} catalogItems
 * @param {Array<object>} assets
 */
export function buildElite100PublicTextures(catalogItems, assets) {
  /** @type {Record<string, number>} */
  const skipped = {};
  const bump = (reason) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  const catalogById = new Map(
    (Array.isArray(catalogItems) ? catalogItems : [])
      .filter((c) => c?.id)
      .map((c) => [String(c.id), c]),
  );

  for (const asset of Array.isArray(assets) ? assets : []) {
    const reason = skipReasonForAsset(asset);
    if (reason) bump(reason);
  }

  const bestByCatalog = chooseBestAssetsByCatalogId(assets);
  /** @type {Array<object>} */
  const textures = [];

  for (const [catalogId, asset] of bestByCatalog.entries()) {
    const catalogItem = catalogById.get(catalogId);
    if (!catalogItem) {
      bump("missing_catalog_item");
      continue;
    }
    const row = buildElite100PublicTexture(catalogItem, asset);
    if (!row) {
      bump("missing_url");
      continue;
    }
    textures.push(row);
  }

  textures.sort((a, b) =>
    String(a.displayName ?? "").localeCompare(String(b.displayName ?? ""), undefined, {
      sensitivity: "base",
    }),
  );

  return { textures, skipped };
}

/** Fields that must never appear in public visualizer texture API payloads. */
export const FORBIDDEN_PUBLIC_TEXTURE_FIELDS = [
  "catalog_item_id",
  "organization_id",
  "inventory_id",
  "slab_count",
  "remnant_count",
  "current_inventory_count",
  "representative_image_url",
  "has_inventory",
  "price",
  "cost",
  "location",
  "rack",
  "lot",
  "review_status",
  "asset_kind",
  "source_system",
  "raw",
];

/**
 * @param {unknown} value
 * @param {string} [path]
 * @returns {string[]}
 */
export function findForbiddenPublicFields(value, path = "") {
  /** @type {string[]} */
  const hits = [];
  if (value == null || typeof value !== "object") return hits;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      hits.push(...findForbiddenPublicFields(value[i], `${path}[${i}]`));
    }
    return hits;
  }
  for (const [key, child] of Object.entries(value)) {
    const full = path ? `${path}.${key}` : key;
    if (FORBIDDEN_PUBLIC_TEXTURE_FIELDS.includes(key)) hits.push(full);
    hits.push(...findForbiddenPublicFields(child, full));
  }
  return hits;
}
