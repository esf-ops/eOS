/**
 * visualizerRoutes.test.mjs — unit tests for visualizer MVP (no live AI calls).
 *
 * Run: node backend-core/src/visualizer/visualizerRoutes.test.mjs
 */
import assert from "node:assert/strict";
import { buildVisualizerPrompt, VISUALIZER_CORE_INSTRUCTION, VISUALIZER_DISCLAIMER } from "./visualizerPrompt.mjs";
import {
  DEMO_TEXTURE_CATALOG,
  findDemoTexture,
  listDemoTexturesForApi,
} from "./visualizerTextureCatalog.mjs";
import {
  getRenderProvider,
  readSafeRenderConfig,
  SUPPORTED_VISUALIZER_PROVIDERS,
} from "./visualizerRenderProvider.mjs";
import { attachVisualizerRoutes } from "./visualizerRoutes.js";

console.log("\nvisualizerRoutes.test.mjs\n");

// ── Prompt ────────────────────────────────────────────────────────────────────

assert.ok(buildVisualizerPrompt({ materialName: "Carrara Royale" }).includes(VISUALIZER_CORE_INSTRUCTION));
assert.ok(buildVisualizerPrompt({ materialName: "Carrara Royale" }).includes("Carrara Royale"));
assert.ok(buildVisualizerPrompt({ userInstruction: "Matte finish" }).includes("Matte finish"));
console.log("ok: buildVisualizerPrompt includes core instruction and material");

assert.equal(VISUALIZER_DISCLAIMER.includes("Concept visualization only"), true);
console.log("ok: disclaimer text present");

// ── Texture catalog ───────────────────────────────────────────────────────────

assert.equal(DEMO_TEXTURE_CATALOG.length, 11);
assert.ok(findDemoTexture("carrara-royale"));
assert.equal(findDemoTexture("missing"), null);
const listed = listDemoTexturesForApi();
assert.equal(listed.length, 11);
assert.ok(listed.every((t) => t.id && t.name && t.thumbUrl && t.fullUrl));
console.log("ok: demo texture catalog");

// ── Provider factory ──────────────────────────────────────────────────────────

assert.equal(getRenderProvider("gemini").name, "geminiVisualizerRenderProvider");
assert.equal(getRenderProvider("openai").name, "openAiVisualizerRenderProvider");
assert.throws(() => getRenderProvider("exayard"), /Unsupported visualizer provider/);
assert.deepEqual(SUPPORTED_VISUALIZER_PROVIDERS, ["gemini", "openai"]);
console.log("ok: render provider factory");

// ── Safe config (no secrets) ──────────────────────────────────────────────────

const prev = {
  VISUALIZER_RENDER_ENABLED: process.env.VISUALIZER_RENDER_ENABLED,
  VISUALIZER_RENDER_PROVIDER: process.env.VISUALIZER_RENDER_PROVIDER,
  VISUALIZER_RENDER_MODEL: process.env.VISUALIZER_RENDER_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

process.env.VISUALIZER_RENDER_ENABLED = "1";
process.env.VISUALIZER_RENDER_PROVIDER = "gemini";
process.env.VISUALIZER_RENDER_MODEL = "gemini-2.0-flash-preview-image-generation";
process.env.GEMINI_API_KEY = "test-key-not-exposed";
process.env.OPENAI_API_KEY = "";

const safe = readSafeRenderConfig();
assert.equal(safe.visualizerRenderEnabled, true);
assert.equal(safe.activeProvider, "gemini");
assert.equal(safe.hasGeminiKey, true);
assert.equal(safe.hasOpenAiKey, false);
assert.equal("apiKey" in safe, false);
assert.equal("GEMINI_API_KEY" in safe, false);
console.log("ok: readSafeRenderConfig excludes secrets");

process.env.VISUALIZER_RENDER_ENABLED = prev.VISUALIZER_RENDER_ENABLED;
process.env.VISUALIZER_RENDER_PROVIDER = prev.VISUALIZER_RENDER_PROVIDER;
process.env.VISUALIZER_RENDER_MODEL = prev.VISUALIZER_RENDER_MODEL;
process.env.GEMINI_API_KEY = prev.GEMINI_API_KEY;
process.env.OPENAI_API_KEY = prev.OPENAI_API_KEY;

// ── Route mounting ────────────────────────────────────────────────────────────

/** @type {Array<{ method: string, path: string, handlers: Function[] }>} */
const routes = [];
const mockApp = {
  get(path, ...handlers) {
    routes.push({ method: "GET", path, handlers });
  },
  post(path, ...handlers) {
    routes.push({ method: "POST", path, handlers });
  },
};

let headAccessUsed = false;
attachVisualizerRoutes(mockApp, {
  requireAuth: () => (_req, _res, next) => next(),
  headAccess: (_req, _res, next) => {
    headAccessUsed = true;
    next();
  },
});

assert.ok(routes.some((r) => r.path === "/api/visualizer/config"));
assert.ok(routes.some((r) => r.path === "/api/visualizer/textures"));
assert.ok(routes.some((r) => r.path === "/api/visualizer/render"));
assert.ok(!routes.some((r) => r.path.startsWith("/api/takeoff")));
console.log("ok: visualizer routes mounted under /api/visualizer/* only");

const renderRoute = routes.find((r) => r.path === "/api/visualizer/render");
assert.ok(renderRoute);
assert.ok(renderRoute.handlers.length >= 2, "render route has auth + head + parser + handler");
console.log("ok: render route handler stack");

console.log("\nvisualizerRoutes tests passed.\n");
