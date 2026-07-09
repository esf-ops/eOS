/**
 * Static visualizer texture catalog — reads shared JSON manifest.
 * No live inventory API calls.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Repo root: backend-core/src/visualizer -> repo root */
export function visualizerRepoRoot() {
  return path.resolve(__dirname, "../../..");
}

const CATALOG_JSON_PATH = path.join(
  visualizerRepoRoot(),
  "app-visualizer/catalog/visualizer-textures.json",
);

const TEXTURE_PUBLIC_ROOT = path.join(
  visualizerRepoRoot(),
  "app-visualizer/public/material-textures",
);

/** @type {Array<object>|null} */
let _cachedEntries = null;

/**
 * @returns {Array<object>}
 */
export function loadCatalogEntries() {
  if (_cachedEntries) return _cachedEntries;
  if (!fs.existsSync(CATALOG_JSON_PATH)) {
    throw new Error(`Visualizer texture catalog not found: ${CATALOG_JSON_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(CATALOG_JSON_PATH, "utf8"));
  const list = Array.isArray(raw?.textures) ? raw.textures : [];
  _cachedEntries = list
    .filter((t) => t && t.active !== false)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  return _cachedEntries;
}

/**
 * @param {string} relativePath
 * @returns {string}
 */
export function resolveTextureFile(relativePath) {
  return path.join(TEXTURE_PUBLIC_ROOT, relativePath);
}

/**
 * @param {object} entry
 */
export function texturePublicUrls(entry) {
  return {
    thumbUrl: `/material-textures/${entry.thumbPath}`,
    fullUrl: `/material-textures/${entry.fullPath}`,
  };
}

/**
 * @param {object} entry
 */
export function textureFileStatus(entry) {
  const fullFile = resolveTextureFile(entry.fullPath);
  const thumbFile = resolveTextureFile(entry.thumbPath);
  const hasFull = fs.existsSync(fullFile);
  const hasThumb = fs.existsSync(thumbFile);
  return {
    hasImage: hasFull,
    hasThumb,
    fullFile,
    thumbFile,
  };
}

/**
 * @param {string} materialId
 * @returns {object|null}
 */
export function findCatalogTexture(materialId) {
  const id = String(materialId ?? "").trim();
  if (!id) return null;
  return loadCatalogEntries().find((t) => t.id === id || t.slug === id) ?? null;
}

/**
 * @returns {Array<object>}
 */
export function listTexturesForApi() {
  const entries = loadCatalogEntries();
  const groups = new Set();
  const colorFamilies = new Set();
  /** @type {Array<object>} */
  const textures = [];

  for (const entry of entries) {
    const status = textureFileStatus(entry);
    const urls = texturePublicUrls(entry);
    if (entry.group) groups.add(entry.group);
    if (entry.colorFamily) colorFamilies.add(entry.colorFamily);

    textures.push({
      id: entry.id,
      slug: entry.slug,
      name: entry.displayName,
      displayName: entry.displayName,
      group: entry.group ?? null,
      colorFamily: entry.colorFamily ?? null,
      finish: entry.finish ?? null,
      sourceLabel: entry.sourceLabel ?? null,
      thumbUrl: status.hasThumb ? urls.thumbUrl : status.hasImage ? urls.fullUrl : null,
      fullUrl: status.hasImage ? urls.fullUrl : null,
      hasImage: status.hasImage,
      active: entry.active !== false,
    });
  }

  return {
    textures: textures.filter((t) => t.hasImage && t.thumbUrl && t.fullUrl),
    meta: {
      totalListed: textures.length,
      totalAvailable: textures.filter((t) => t.hasImage).length,
      groups: [...groups].sort(),
      colorFamilies: [...colorFamilies].sort(),
    },
  };
}

/**
 * @param {string} materialId
 * @returns {{ buffer: Buffer, mimeType: string, materialName: string }}
 */
export function loadTextureBytes(materialId) {
  const entry = findCatalogTexture(materialId);
  if (!entry) {
    throw Object.assign(new Error(`Unknown materialId: ${materialId}`), { statusCode: 400 });
  }
  if (entry.active === false) {
    throw Object.assign(new Error(`Material is not available: ${materialId}`), { statusCode: 400 });
  }
  const { hasImage, fullFile } = textureFileStatus(entry);
  if (!hasImage) {
    throw Object.assign(
      new Error(`Texture file missing for ${materialId}. Expected ${fullFile}`),
      { statusCode: 503 },
    );
  }
  return {
    buffer: fs.readFileSync(fullFile),
    mimeType: "image/jpeg",
    materialName: entry.displayName,
  };
}

/** @deprecated use loadCatalogEntries */
export const DEMO_TEXTURE_CATALOG = loadCatalogEntries;

/** @deprecated */
export function findDemoTexture(materialId) {
  return findCatalogTexture(materialId);
}

/** @deprecated */
export function listDemoTexturesForApi() {
  return listTexturesForApi().textures;
}

/** @deprecated */
export function loadDemoTextureBytes(materialId) {
  return loadTextureBytes(materialId);
}

/** @deprecated */
export function resolveDemoTextureFile(relativePath) {
  return resolveTextureFile(relativePath);
}
