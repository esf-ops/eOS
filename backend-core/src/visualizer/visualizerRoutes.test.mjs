import assert from "node:assert/strict";
import { buildVisualizerPrompt, VISUALIZER_CORE_INSTRUCTION, VISUALIZER_DISCLAIMER } from "./visualizerPrompt.mjs";
import {
  findCatalogTexture,
  listTexturesForApi,
  loadCatalogEntries,
} from "./visualizerTextureCatalog.mjs";
import {
  getRenderProvider,
  readSafeRenderConfig,
  SUPPORTED_VISUALIZER_PROVIDERS,
} from "./visualizerRenderProvider.mjs";
import { attachVisualizerRoutes } from "./visualizerRoutes.js";
import { attachPublicVisualizerRoutes } from "./publicVisualizerRoutes.js";
import { readSafePublicVisualizerConfig } from "./publicVisualizerConfig.mjs";
import {
  checkPublicRenderRateLimit,
  resetPublicRenderRateLimitsForTests,
} from "./publicVisualizerRateLimit.mjs";
import {
  buildElite100PublicTextures,
  chooseBestAssetsByCatalogId,
  findForbiddenPublicFields,
  skipReasonForAsset,
} from "./elite100VisualAssetTextures.mjs";
import {
  DEMO_TEXTURE_SLUGS,
  isDemoTextureEntry,
  listBackendStaticPublicTextures,
  loadBackendStaticCatalogEntries,
  BACKEND_STATIC_CATALOG_PATH,
} from "./publicVisualizerStaticCatalog.mjs";
import {
  listPublicVisualizerTextures,
  mergePublicVisualizerTextures,
  resetPublicMaterialRegistryForTests,
  scanPublicTexturePayload,
} from "./publicVisualizerTextureService.mjs";

console.log("\nvisualizerRoutes.test.mjs\n");

assert.ok(buildVisualizerPrompt({ materialName: "Carrara Royale" }).includes(VISUALIZER_CORE_INSTRUCTION));
assert.ok(buildVisualizerPrompt({ materialName: "Carrara Royale" }).includes("Carrara Royale"));
assert.equal(VISUALIZER_DISCLAIMER.includes("Concept visualization only"), true);
assert.equal(VISUALIZER_DISCLAIMER.includes("pricing may vary"), true);
console.log("ok: prompt + disclaimer");

const entries = loadCatalogEntries();
assert.equal(entries.length, 14, "catalog JSON should list 14 textures");
assert.ok(findCatalogTexture("charcoal-vein"));
assert.equal(findCatalogTexture("missing"), null);

const { textures, meta } = listTexturesForApi();
assert.equal(textures.length, 14, "all 14 texture files should exist on disk");
assert.equal(meta.totalAvailable, 14);
assert.ok(meta.groups.includes("Preview Collection"));
assert.ok(meta.colorFamilies.includes("White"));
assert.ok(meta.colorFamilies.includes("Beige"));
assert.ok(meta.colorFamilies.includes("Black"));
assert.ok(textures.every((t) => t.thumbUrl && t.fullUrl && t.hasImage));
console.log("ok: full texture catalog with meta");

assert.equal(getRenderProvider("gemini").name, "geminiVisualizerRenderProvider");
assert.equal(getRenderProvider("openai").name, "openAiVisualizerRenderProvider");
assert.deepEqual(SUPPORTED_VISUALIZER_PROVIDERS, ["gemini", "openai"]);
console.log("ok: provider factory");

const prev = {
  VISUALIZER_RENDER_ENABLED: process.env.VISUALIZER_RENDER_ENABLED,
  VISUALIZER_RENDER_PROVIDER: process.env.VISUALIZER_RENDER_PROVIDER,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};
process.env.VISUALIZER_RENDER_ENABLED = "1";
process.env.VISUALIZER_RENDER_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "test-key";
const safe = readSafeRenderConfig();
assert.equal(safe.visualizerRenderEnabled, true);
assert.equal("apiKey" in safe, false);
process.env.VISUALIZER_RENDER_ENABLED = prev.VISUALIZER_RENDER_ENABLED;
process.env.VISUALIZER_RENDER_PROVIDER = prev.VISUALIZER_RENDER_PROVIDER;
process.env.GEMINI_API_KEY = prev.GEMINI_API_KEY;
console.log("ok: safe config");

const routes = [];
const mockApp = {
  get(path, ...handlers) { routes.push({ method: "GET", path, handlers }); },
  post(path, ...handlers) { routes.push({ method: "POST", path, handlers }); },
};
attachVisualizerRoutes(mockApp, {
  requireAuth: () => (_req, _res, next) => next(),
  headAccess: (_req, _res, next) => next(),
});
assert.ok(routes.some((r) => r.path === "/api/visualizer/textures"));
assert.ok(!routes.some((r) => r.path.startsWith("/api/takeoff")));
console.log("ok: protected routes mounted");

const pubRoutes = [];
const mockPubApp = {
  get(path, ...handlers) { pubRoutes.push({ method: "GET", path, handlers }); },
  post(path, ...handlers) { pubRoutes.push({ method: "POST", path, handlers }); },
};
attachPublicVisualizerRoutes(mockPubApp);
assert.ok(pubRoutes.some((r) => r.path === "/api/public-visualizer/config"));
assert.ok(pubRoutes.some((r) => r.path === "/api/public-visualizer/textures"));
assert.ok(pubRoutes.some((r) => r.path === "/api/public-visualizer/render"));
console.log("ok: public routes mounted");

const pubPrev = {
  PUBLIC_VISUALIZER_ENABLED: process.env.PUBLIC_VISUALIZER_ENABLED,
  PUBLIC_VISUALIZER_RENDER_ENABLED: process.env.PUBLIC_VISUALIZER_RENDER_ENABLED,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};
process.env.PUBLIC_VISUALIZER_ENABLED = "1";
process.env.PUBLIC_VISUALIZER_RENDER_ENABLED = "1";
process.env.GEMINI_API_KEY = "test-key";
const pubSafe = readSafePublicVisualizerConfig();
assert.equal(pubSafe.publicVisualizerEnabled, true);
assert.equal(pubSafe.renderEnabled, true);
assert.equal("apiKey" in pubSafe, false);
assert.equal("hasGeminiKey" in pubSafe, false);
process.env.PUBLIC_VISUALIZER_ENABLED = pubPrev.PUBLIC_VISUALIZER_ENABLED;
process.env.PUBLIC_VISUALIZER_RENDER_ENABLED = pubPrev.PUBLIC_VISUALIZER_RENDER_ENABLED;
process.env.GEMINI_API_KEY = pubPrev.GEMINI_API_KEY;
console.log("ok: safe public config");

resetPublicRenderRateLimitsForTests();
const first = checkPublicRenderRateLimit("203.0.113.1", 2);
assert.equal(first.allowed, true);
const second = checkPublicRenderRateLimit("203.0.113.1", 2);
assert.equal(second.allowed, true);
const third = checkPublicRenderRateLimit("203.0.113.1", 2);
assert.equal(third.allowed, false);
resetPublicRenderRateLimitsForTests();
console.log("ok: public rate limit");

// ── Elite 100 visual asset filtering (pure) ─────────────────────────────────
const sampleCatalog = [
  {
    id: "cat-1",
    color_name: "Carrara Royale",
    color_key: "carrara-royale",
    price_group: "Promo",
    display_name: "Carrara Royale - ESF",
  },
  {
    id: "cat-2",
    color_name: "Moonflakes",
    color_key: "moonflakes",
    price_group: "Promo",
    display_name: "Moonflakes - ASMI",
  },
];

const sampleAssets = [
  {
    catalog_item_id: "cat-1",
    texture_url_1024: "https://cdn.example/royale-1024.jpg",
    texture_url_600: "https://cdn.example/royale-600.jpg",
    asset_kind: "texture",
    review_status: "approved",
    is_primary: true,
    is_active: true,
  },
  {
    catalog_item_id: "cat-1",
    texture_url_600: "https://cdn.example/royale-imported-600.jpg",
    asset_kind: "texture",
    review_status: "imported",
    is_primary: false,
    is_active: true,
  },
  {
    catalog_item_id: "cat-2",
    hero_url: "https://cdn.example/moon-hero.jpg",
    asset_kind: "manual_upload",
    review_status: "approved",
    is_primary: true,
    is_active: true,
  },
  {
    catalog_item_id: "cat-2",
    texture_url_1024: "https://cdn.example/slab-photo.jpg",
    asset_kind: "slab_photo",
    review_status: "approved",
    is_primary: false,
    is_active: true,
  },
  {
    catalog_item_id: "cat-2",
    texture_url_1024: "https://cdn.example/rejected.jpg",
    asset_kind: "texture",
    review_status: "rejected",
    is_primary: false,
    is_active: true,
  },
];

assert.equal(skipReasonForAsset({ asset_kind: "slab_photo", review_status: "approved", is_active: true }), "slab_photo");
assert.equal(skipReasonForAsset({ asset_kind: "texture", review_status: "needs_review", is_active: true }), "needs_review");

const best = chooseBestAssetsByCatalogId(sampleAssets);
assert.equal(best.get("cat-1")?.review_status, "approved");
assert.equal(best.get("cat-2")?.asset_kind, "manual_upload");

const built = buildElite100PublicTextures(sampleCatalog, sampleAssets);
assert.equal(built.textures.length, 2);
assert.equal(built.textures[0].source, "elite100_visual_asset");
assert.ok(built.textures.every((t) => t.fullUrl && t.thumbUrl));
assert.ok(built.skipped.slab_photo >= 1);
assert.ok(built.skipped.rejected >= 1);

const forbidden = findForbiddenPublicFields({
  textures: built.textures,
  meta: { skippedAssets: built.skipped },
});
assert.equal(forbidden.length, 0, `forbidden fields leaked: ${forbidden.join(", ")}`);
console.log("ok: elite100 visual asset filter/dedupe");

resetPublicMaterialRegistryForTests();
const staticOnly = await listPublicVisualizerTextures({ getSupabase: () => null });
assert.equal(staticOnly.meta.staticCount, 11);
assert.equal(staticOnly.meta.finalCount, 11);
assert.equal(staticOnly.meta.elite100AssetCount, 0);
assert.equal(staticOnly.meta.elite100VisualAssetCount, 0);
assert.equal(staticOnly.meta.fallbackStaticOnly, true);
assert.equal(staticOnly.textures.length, 11);
assert.ok(staticOnly.textures.every((t) => t.source === "static"));
assert.equal(staticOnly.textures.some((t) => t.slug === "warm-quartz"), false);
assert.equal(staticOnly.textures.some((t) => t.slug === "storm-gray"), false);
assert.equal(staticOnly.textures.some((t) => t.slug === "charcoal-vein"), false);
const staticForbidden = scanPublicTexturePayload(staticOnly);
assert.equal(staticForbidden.length, 0, `forbidden fields leaked: ${staticForbidden.join(", ")}`);
console.log("ok: backend static fallback textures");

const backendEntries = loadBackendStaticCatalogEntries();
assert.equal(backendEntries.length, 11);
assert.ok(BACKEND_STATIC_CATALOG_PATH.includes("visualizer-static-textures.json"));
assert.ok(!backendEntries.some((e) => isDemoTextureEntry(e)));
for (const slug of DEMO_TEXTURE_SLUGS) {
  assert.equal(backendEntries.some((e) => e.slug === slug), false, `demo slug ${slug} should be excluded`);
}
console.log("ok: backend-owned catalog path (no demo materials)");

const missingCatalog = listBackendStaticPublicTextures({
  catalogPath: "/tmp/visualizer-static-textures-missing-test.json",
});
assert.equal(missingCatalog.textures.length, 0);
assert.equal(missingCatalog.warning, "static_catalog_missing");
resetPublicMaterialRegistryForTests();
const resilientList = await listPublicVisualizerTextures({ getSupabase: () => null });
assert.ok(Array.isArray(resilientList.textures));
assert.equal(typeof resilientList.meta.finalCount, "number");
console.log("ok: public texture list is resilient");

const merged = mergePublicVisualizerTextures(
  [{ id: "carrara-royale", displayName: "Carrara Royale", source: "static", fullUrl: "/a.jpg", thumbUrl: "/a.jpg", slug: "carrara-royale", collection: "Preview Collection", colorFamily: "White", patternType: "veined" }],
  [{ id: "e100-carrara-royale", displayName: "Carrara Royale", source: "elite100_visual_asset", fullUrl: "https://cdn/x.jpg", thumbUrl: "https://cdn/x.jpg", slug: "carrara-royale", collection: "Elite 100 · Group Promo", colorFamily: "White", patternType: "veined" }],
);
assert.equal(merged.length, 1);
assert.equal(merged[0].source, "elite100_visual_asset");
console.log("ok: merge prefers elite100 over static duplicate name");

console.log("\nvisualizerRoutes tests passed.\n");
