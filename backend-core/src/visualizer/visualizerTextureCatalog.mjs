/**
 * Static demo texture catalog for the standalone visualizer MVP.
 * Copied from app-slab-inventory pilot textures — no live inventory API calls.
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

/** @type {readonly { id: string, name: string, slug: string, thumbPath: string, fullPath: string }[]} */
export const DEMO_TEXTURE_CATALOG = Object.freeze([
  { id: "carrara-royale", name: "Carrara Royale", slug: "carrara-royale", thumbPath: "thumb/carrara-royale.jpg", fullPath: "full/carrara-royale.jpg" },
  { id: "carrara-classic", name: "Carrara Classic", slug: "carrara-classic", thumbPath: "thumb/carrara-classic.jpg", fullPath: "full/carrara-classic.jpg" },
  { id: "bianco-carrara", name: "Bianco Carrara", slug: "bianco-carrara", thumbPath: "thumb/bianco-carrara.jpg", fullPath: "full/bianco-carrara.jpg" },
  { id: "bayshore-sand", name: "Bayshore Sand", slug: "bayshore-sand", thumbPath: "thumb/bayshore-sand.jpg", fullPath: "full/bayshore-sand.jpg" },
  { id: "antique-gray", name: "Antique Gray", slug: "antique-gray", thumbPath: "thumb/antique-gray.jpg", fullPath: "full/antique-gray.jpg" },
  { id: "sicilia", name: "Sicilia", slug: "sicilia", thumbPath: "thumb/sicilia.jpg", fullPath: "full/sicilia.jpg" },
  { id: "classic-gray", name: "Classic Grey", slug: "classic-gray", thumbPath: "thumb/classic-gray.jpg", fullPath: "full/classic-gray.jpg" },
  { id: "white-dove", name: "White Dove", slug: "white-dove", thumbPath: "thumb/white-dove.jpg", fullPath: "full/white-dove.jpg" },
  { id: "silver-pearl-polished", name: "Silver Pearl", slug: "silver-pearl-polished", thumbPath: "thumb/silver-pearl-polished.jpg", fullPath: "full/silver-pearl-polished.jpg" },
  { id: "suede-brown-polished", name: "Suede Brown", slug: "suede-brown-polished", thumbPath: "thumb/suede-brown-polished.jpg", fullPath: "full/suede-brown-polished.jpg" },
  { id: "india-black-pearl-polished", name: "India Black Pearl", slug: "india-black-pearl-polished", thumbPath: "thumb/india-black-pearl-polished.jpg", fullPath: "full/india-black-pearl-polished.jpg" },
]);

const TEXTURE_PUBLIC_ROOT = path.join(
  visualizerRepoRoot(),
  "app-visualizer/public/material-textures/elite100",
);

/**
 * @param {string} relativePath
 * @returns {string}
 */
export function resolveDemoTextureFile(relativePath) {
  return path.join(TEXTURE_PUBLIC_ROOT, relativePath);
}

/**
 * @param {string} materialId
 * @returns {typeof DEMO_TEXTURE_CATALOG[number]|null}
 */
export function findDemoTexture(materialId) {
  const id = String(materialId ?? "").trim();
  if (!id) return null;
  return DEMO_TEXTURE_CATALOG.find((t) => t.id === id || t.slug === id) ?? null;
}

/**
 * Public URLs served by app-visualizer static assets (frontend origin).
 * @param {typeof DEMO_TEXTURE_CATALOG[number]} texture
 */
export function texturePublicUrls(texture) {
  return {
    thumbUrl: `/material-textures/elite100/${texture.thumbPath}`,
    fullUrl: `/material-textures/elite100/${texture.fullPath}`,
  };
}

/**
 * @returns {Array<{ id: string, name: string, slug: string, thumbUrl: string, fullUrl: string, hasImage: boolean }>}
 */
export function listDemoTexturesForApi() {
  return DEMO_TEXTURE_CATALOG.map((texture) => {
    const urls = texturePublicUrls(texture);
    const fullFile = resolveDemoTextureFile(texture.fullPath);
    const hasImage = fs.existsSync(fullFile);
    return {
      id: texture.id,
      name: texture.name,
      slug: texture.slug,
      thumbUrl: urls.thumbUrl,
      fullUrl: urls.fullUrl,
      hasImage,
    };
  });
}

/**
 * Load material bytes for render provider.
 * @param {string} materialId
 * @returns {{ buffer: Buffer, mimeType: string, materialName: string }}
 */
export function loadDemoTextureBytes(materialId) {
  const texture = findDemoTexture(materialId);
  if (!texture) {
    throw Object.assign(new Error(`Unknown materialId: ${materialId}`), { statusCode: 400 });
  }
  const filePath = resolveDemoTextureFile(texture.fullPath);
  if (!fs.existsSync(filePath)) {
    throw Object.assign(
      new Error(`Demo texture file missing for ${materialId}. Copy pilot JPGs into app-visualizer/public/material-textures/elite100/`),
      { statusCode: 503 },
    );
  }
  return {
    buffer: fs.readFileSync(filePath),
    mimeType: "image/jpeg",
    materialName: texture.name,
  };
}
