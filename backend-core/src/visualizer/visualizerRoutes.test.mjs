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

console.log("\nvisualizerRoutes.test.mjs\n");

assert.ok(buildVisualizerPrompt({ materialName: "Carrara Royale" }).includes(VISUALIZER_CORE_INSTRUCTION));
assert.ok(buildVisualizerPrompt({ materialName: "Carrara Royale" }).includes("Carrara Royale"));
assert.equal(VISUALIZER_DISCLAIMER.includes("Concept visualization only"), true);
console.log("ok: prompt + disclaimer");

const entries = loadCatalogEntries();
assert.equal(entries.length, 14, "catalog JSON should list 14 textures");
assert.ok(findCatalogTexture("charcoal-vein"));
assert.equal(findCatalogTexture("missing"), null);

const { textures, meta } = listTexturesForApi();
assert.equal(textures.length, 14, "all 14 texture files should exist on disk");
assert.equal(meta.totalAvailable, 14);
assert.ok(meta.groups.includes("Elite 100 Collection"));
assert.ok(meta.groups.includes("Visualizer Demo"));
assert.ok(meta.colorFamilies.includes("White"));
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
console.log("ok: routes mounted");

console.log("\nvisualizerRoutes tests passed.\n");
