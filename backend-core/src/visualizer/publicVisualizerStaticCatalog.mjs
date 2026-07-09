/**
 * Backend-owned static texture catalog for public visualizer.
 * Does not read app-visualizer/ paths. Safe for Vercel deployment.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ELITE100_COLLECTION_LABEL } from "./elite100VisualAssetTextures.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BACKEND_STATIC_CATALOG_PATH = path.join(__dirname, "visualizer-static-textures.json");

/** Demo-only slugs excluded from public fallback. */
export const DEMO_TEXTURE_SLUGS = new Set(["warm-quartz", "storm-gray", "charcoal-vein"]);

/**
 * @returns {string}
 */
export function resolveStaticTextureBaseUrl() {
  return (
    String(process.env.PUBLIC_VISUALIZER_STATIC_TEXTURE_BASE_URL ?? "").trim().replace(/\/$/, "") ||
    String(process.env.HEAD_URL_VISUALIZER ?? "").trim().replace(/\/$/, "") ||
    "https://visualizer.eliteosfab.com"
  );
}

/**
 * @param {string|null|undefined} url
 * @param {string} [baseUrl]
 * @returns {string|null}
 */
export function resolvePublicTextureUrl(url, baseUrl = resolveStaticTextureBaseUrl()) {
  const u = String(url ?? "").trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  const base = String(baseUrl ?? "").replace(/\/$/, "");
  if (!base) return u.startsWith("/") ? u : `/${u}`;
  return `${base}${u.startsWith("/") ? u : `/${u}`}`;
}

/**
 * @param {object|null|undefined} entry
 * @returns {boolean}
 */
export function isDemoTextureEntry(entry) {
  if (!entry) return true;
  const id = String(entry.id ?? entry.slug ?? "").trim().toLowerCase();
  const slug = String(entry.slug ?? entry.id ?? "").trim().toLowerCase();
  if (DEMO_TEXTURE_SLUGS.has(id) || DEMO_TEXTURE_SLUGS.has(slug)) return true;
  const thumb = String(entry.thumbUrl ?? entry.thumbPath ?? "");
  const full = String(entry.fullUrl ?? entry.fullPath ?? "");
  return thumb.includes("/demo/") || full.includes("/demo/");
}

/**
 * Load backend-owned catalog entries. Never throws.
 * @param {string} [catalogPath]
 * @returns {Array<object>}
 */
export function loadBackendStaticCatalogEntries(catalogPath = BACKEND_STATIC_CATALOG_PATH) {
  try {
    if (!fs.existsSync(catalogPath)) return [];
    const raw = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    const list = Array.isArray(raw?.textures) ? raw.textures : [];
    return list
      .filter((t) => t && t.active !== false && !isDemoTextureEntry(t))
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  } catch {
    return [];
  }
}

/**
 * @param {object} entry
 * @param {string} [baseUrl]
 * @returns {object|null}
 */
export function mapBackendStaticToPublic(entry, baseUrl = resolveStaticTextureBaseUrl()) {
  if (!entry || isDemoTextureEntry(entry)) return null;

  const thumbUrl = resolvePublicTextureUrl(entry.thumbUrl ?? entry.thumbPath, baseUrl);
  const fullUrl = resolvePublicTextureUrl(entry.fullUrl ?? entry.fullPath, baseUrl);
  if (!thumbUrl || !fullUrl) return null;

  return {
    id: String(entry.id ?? entry.slug ?? ""),
    slug: String(entry.slug ?? entry.id ?? ""),
    displayName: String(entry.displayName ?? entry.name ?? entry.id ?? "Color"),
    collection: entry.collection ?? entry.group ?? ELITE100_COLLECTION_LABEL,
    colorFamily: entry.colorFamily ?? null,
    patternType: entry.patternType ?? null,
    thumbUrl,
    fullUrl,
    source: "static",
  };
}

/**
 * @param {{ catalogPath?: string, baseUrl?: string }} [opts]
 * @returns {{ textures: Array<object>, catalogEntryCount: number, warning: string|null }}
 */
export function listBackendStaticPublicTextures(opts = {}) {
  const catalogPath = opts.catalogPath ?? BACKEND_STATIC_CATALOG_PATH;
  const baseUrl = opts.baseUrl ?? resolveStaticTextureBaseUrl();
  const entries = loadBackendStaticCatalogEntries(catalogPath);
  const textures = entries.map((e) => mapBackendStaticToPublic(e, baseUrl)).filter(Boolean);
  const warning =
    entries.length === 0
      ? fs.existsSync(catalogPath)
        ? "static_catalog_empty"
        : "static_catalog_missing"
      : null;

  return {
    textures,
    catalogEntryCount: entries.length,
    warning,
  };
}
