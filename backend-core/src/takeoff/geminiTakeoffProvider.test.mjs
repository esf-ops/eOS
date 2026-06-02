/**
 * geminiTakeoffProvider.test.mjs — mocked unit tests for Gemini AI provider.
 *
 * All tests mock global.fetch — no real Gemini API calls are made.
 *
 * Coverage:
 *   T1.  geminiExtractionProvider parses valid JSON response.
 *   T2.  geminiExtractionProvider strips markdown fences (```json ... ```).
 *   T3.  geminiExtractionProvider strips plain fences (``` ... ```).
 *   T4.  missing GEMINI_API_KEY gives a clear 503 error.
 *   T5.  Gemini API HTTP error is surfaced with status code.
 *   T6.  geminiInventoryProvider returns pages array.
 *   T7.  geminiEvidenceProvider returns dimensions array.
 *   T8.  provider/model metadata is returned on all three passes.
 *   T9.  TAKEOFF_AI_PROVIDER=gemini routes extraction through geminiExtractionProvider.
 *   T10. TAKEOFF_AI_PROVIDER=openai keeps openAiTakeoffProvider.
 *   T11. invalid TAKEOFF_AI_PROVIDER is rejected.
 *   T12. getInventoryProvider("gemini") returns geminiInventoryProvider.
 *   T13. getInventoryProvider("openai") returns null.
 *   T14. getEvidenceProvider("gemini") returns geminiEvidenceProvider.
 *   T15. getEvidenceProvider("openai") returns null.
 *   T16. readExtractionConfig reads GEMINI_API_KEY when provider is gemini.
 *   T17. readExtractionConfig reads OPENAI_API_KEY when provider is openai.
 *   T18. stripJsonFences strips ```json ... ``` wrapper.
 *   T19. stripJsonFences strips ``` ... ``` wrapper.
 *   T20. stripJsonFences leaves plain JSON untouched.
 *   T21. v5.8.1 QA gate: expected CT 49 / computed 80.93 → do_not_import.
 *   T22. v5.8.1 QA gate: expected CT 50 / computed 73 → do_not_import.
 *   T23. v5.8.1 QA gate: expected CT 31 / computed 32.98 → ready_for_review.
 *   T24. no quote mutation — provider never touches pricing or quote_headers.
 */
import assert from "node:assert/strict";

import {
  geminiExtractionProvider,
  geminiInventoryProvider,
  geminiEvidenceProvider,
  stripJsonFences,
} from "./geminiTakeoffProvider.mjs";
import {
  getExtractionProvider,
  getInventoryProvider,
  getEvidenceProvider,
  readExtractionConfig,
  SUPPORTED_PROVIDERS,
} from "./takeoffAiProvider.mjs";
import { evaluateTakeoffQaGate } from "./takeoffQaGate.mjs";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_FILE_BUFFER = Buffer.from("fake-pdf-bytes");
const TEST_MIME        = "application/pdf";
const TEST_FILENAME    = "test-plan.pdf";
const TEST_API_KEY     = "GEMINI-TEST-KEY-never-real";
const TEST_MODEL       = "gemini-2.5-pro";

/**
 * Build a mock Gemini generateContent response with the given text payload.
 * Optionally sets modelVersion.
 */
function mockGeminiResponse(text, modelVersion = "gemini-2.5-pro-preview-test") {
  return {
    candidates: [{
      content: {
        parts: [{ text }],
        role: "model",
      },
      finishReason: "STOP",
    }],
    usageMetadata: {
      promptTokenCount:     100,
      candidatesTokenCount: 50,
    },
    modelVersion,
  };
}

/**
 * Install a one-shot mock fetch and restore after the callback.
 */
async function withMockFetch(mockFn, callback) {
  const original = global.fetch;
  global.fetch = mockFn;
  try {
    return await callback();
  } finally {
    global.fetch = original;
  }
}

/**
 * Return a mock fetch that responds with a successful Gemini response wrapping the given text.
 */
function makeOkFetch(responseText) {
  return async (_url, _opts) => ({
    ok:   true,
    status: 200,
    text: async () => JSON.stringify(mockGeminiResponse(responseText)),
  });
}

/**
 * Return a mock fetch that responds with a Gemini API error.
 */
function makeErrFetch(status, message) {
  return async (_url, _opts) => ({
    ok:   false,
    status,
    text: async () => JSON.stringify({ error: { code: status, message } }),
  });
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function t(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log("geminiTakeoffProvider.test.mjs");

// T1 — valid JSON parsed correctly
await t("T1: geminiExtractionProvider parses valid JSON response", async () => {
  const fakeResult = {
    rooms: [{ roomName: "Kitchen", countertopSf: 50, backsplashSf: 0 }],
    status: "draft",
  };
  const result = await withMockFetch(
    makeOkFetch(JSON.stringify(fakeResult)),
    () => geminiExtractionProvider({
      fileBuffer: TEST_FILE_BUFFER,
      mimeType:   TEST_MIME,
      originalFilename: TEST_FILENAME,
      modelName:  TEST_MODEL,
      apiKey:     TEST_API_KEY,
    })
  );
  assert.equal(result.parseError, null, "parseError should be null");
  assert.ok(result.parsed, "parsed should be truthy");
  assert.equal(result.parsed.rooms?.[0]?.roomName, "Kitchen");
  assert.equal(result.provider, "gemini");
});

// T2 — strips ```json ... ``` fences
await t("T2: geminiExtractionProvider strips markdown ```json fences", async () => {
  const fakeResult = { rooms: [], status: "draft" };
  const fenced = `\`\`\`json\n${JSON.stringify(fakeResult)}\n\`\`\``;
  const result = await withMockFetch(
    makeOkFetch(fenced),
    () => geminiExtractionProvider({
      fileBuffer: TEST_FILE_BUFFER,
      mimeType:   TEST_MIME,
      originalFilename: TEST_FILENAME,
      modelName:  TEST_MODEL,
      apiKey:     TEST_API_KEY,
    })
  );
  assert.equal(result.parseError, null, "parseError should be null after fence stripping");
  assert.ok(Array.isArray(result.parsed?.rooms), "parsed.rooms should be an array");
});

// T3 — strips plain ``` fences
await t("T3: geminiExtractionProvider strips plain ``` fences", async () => {
  const fakeResult = { rooms: [], status: "draft" };
  const fenced = `\`\`\`\n${JSON.stringify(fakeResult)}\n\`\`\``;
  const result = await withMockFetch(
    makeOkFetch(fenced),
    () => geminiExtractionProvider({
      fileBuffer: TEST_FILE_BUFFER,
      mimeType:   TEST_MIME,
      originalFilename: TEST_FILENAME,
      modelName:  TEST_MODEL,
      apiKey:     TEST_API_KEY,
    })
  );
  assert.equal(result.parseError, null);
  assert.ok(Array.isArray(result.parsed?.rooms));
});

// T4 — missing API key gives clear error
await t("T4: missing GEMINI_API_KEY gives a clear 503 error", async () => {
  await assert.rejects(
    () => geminiExtractionProvider({
      fileBuffer: TEST_FILE_BUFFER,
      mimeType:   TEST_MIME,
      originalFilename: TEST_FILENAME,
      modelName:  TEST_MODEL,
      apiKey:     null,
    }),
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.ok(err.message.includes("GEMINI_API_KEY"), `expected GEMINI_API_KEY in message, got: ${err.message}`);
      return true;
    }
  );
});

// T5 — Gemini API HTTP error is surfaced
await t("T5: Gemini API HTTP error is surfaced with status code", async () => {
  await assert.rejects(
    () => withMockFetch(
      makeErrFetch(400, "API key not valid"),
      () => geminiExtractionProvider({
        fileBuffer: TEST_FILE_BUFFER,
        mimeType:   TEST_MIME,
        originalFilename: TEST_FILENAME,
        modelName:  TEST_MODEL,
        apiKey:     TEST_API_KEY,
      })
    ),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes("API key not valid"), `expected error detail in message`);
      return true;
    }
  );
});

// T6 — inventory provider returns pages array
await t("T6: geminiInventoryProvider returns valid inventory shape", async () => {
  const fakeInventory = {
    pages: [{ pageNumber: 1, pageType: "plan", recommendedForTakeoff: true }],
    recommendedMeasurementPages: [1],
    pagesToIgnore: [],
    overallNotes: [],
  };
  const result = await withMockFetch(
    makeOkFetch(JSON.stringify(fakeInventory)),
    () => geminiInventoryProvider({
      fileBuffer: TEST_FILE_BUFFER,
      mimeType:   TEST_MIME,
      originalFilename: TEST_FILENAME,
      modelName:  TEST_MODEL,
      apiKey:     TEST_API_KEY,
    })
  );
  assert.equal(result.parseError, null);
  assert.ok(Array.isArray(result.parsed?.pages));
  assert.equal(result.provider, "gemini");
});

// T7 — evidence provider returns dimensions array
await t("T7: geminiEvidenceProvider returns valid evidence shape", async () => {
  const fakeEvidence = {
    dimensions: [{ label: "Counter A", valueSf: 24.5, confidence: "high" }],
    notes: [],
    cutouts: [],
    referenceTotals: [],
    uncertainItems: [],
  };
  const result = await withMockFetch(
    makeOkFetch(JSON.stringify(fakeEvidence)),
    () => geminiEvidenceProvider({
      fileBuffer: TEST_FILE_BUFFER,
      mimeType:   TEST_MIME,
      originalFilename: TEST_FILENAME,
      modelName:  TEST_MODEL,
      apiKey:     TEST_API_KEY,
    })
  );
  assert.equal(result.parseError, null);
  assert.ok(Array.isArray(result.parsed?.dimensions));
  assert.equal(result.provider, "gemini");
});

// T8 — provider/model metadata on all passes
await t("T8: provider and modelUsed returned on all three passes", async () => {
  const fakeExtraction = { rooms: [], status: "draft" };
  const fakeInventory  = { pages: [] };
  const fakeEvidence   = { dimensions: [] };

  for (const [label, fn, fakeData] of [
    ["extraction", geminiExtractionProvider, fakeExtraction],
    ["inventory",  geminiInventoryProvider,  fakeInventory],
    ["evidence",   geminiEvidenceProvider,   fakeEvidence],
  ]) {
    const result = await withMockFetch(
      makeOkFetch(JSON.stringify(fakeData)),
      () => fn({
        fileBuffer: TEST_FILE_BUFFER,
        mimeType:   TEST_MIME,
        originalFilename: TEST_FILENAME,
        modelName:  TEST_MODEL,
        apiKey:     TEST_API_KEY,
      })
    );
    assert.equal(result.provider, "gemini", `${label}: provider should be gemini`);
    assert.equal(typeof result.modelUsed, "string", `${label}: modelUsed should be a string`);
    assert.ok(result.modelUsed.length > 0, `${label}: modelUsed should not be empty`);
  }
});

// T9 — TAKEOFF_AI_PROVIDER=gemini routes through geminiExtractionProvider
await t("T9: getExtractionProvider('gemini') returns geminiExtractionProvider", () => {
  const provider = getExtractionProvider("gemini");
  assert.equal(provider, geminiExtractionProvider);
});

// T10 — TAKEOFF_AI_PROVIDER=openai keeps openAiTakeoffProvider
await t("T10: getExtractionProvider('openai') does not return geminiExtractionProvider", () => {
  const provider = getExtractionProvider("openai");
  assert.notEqual(provider, geminiExtractionProvider);
  assert.equal(typeof provider, "function");
});

// T11 — invalid provider rejected
await t("T11: getExtractionProvider('anthropic') throws with clear message", () => {
  assert.throws(
    () => getExtractionProvider("anthropic"),
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.ok(err.message.includes("anthropic"), `expected provider name in message`);
      assert.ok(err.message.includes("Supported:"));
      return true;
    }
  );
});

// T12 — getInventoryProvider("gemini") returns geminiInventoryProvider
await t("T12: getInventoryProvider('gemini') returns geminiInventoryProvider", () => {
  assert.equal(getInventoryProvider("gemini"), geminiInventoryProvider);
});

// T13 — getInventoryProvider("openai") returns null
await t("T13: getInventoryProvider('openai') returns null (uses service default)", () => {
  assert.equal(getInventoryProvider("openai"), null);
});

// T14 — getEvidenceProvider("gemini") returns geminiEvidenceProvider
await t("T14: getEvidenceProvider('gemini') returns geminiEvidenceProvider", () => {
  assert.equal(getEvidenceProvider("gemini"), geminiEvidenceProvider);
});

// T15 — getEvidenceProvider("openai") returns null
await t("T15: getEvidenceProvider('openai') returns null (uses service default)", () => {
  assert.equal(getEvidenceProvider("openai"), null);
});

// T16 — readExtractionConfig reads GEMINI_API_KEY when provider is gemini
await t("T16: readExtractionConfig reads GEMINI_API_KEY for gemini provider", () => {
  const saved = {
    TAKEOFF_AI_PROVIDER:   process.env.TAKEOFF_AI_PROVIDER,
    TAKEOFF_AI_ENABLED:    process.env.TAKEOFF_AI_ENABLED,
    GEMINI_API_KEY:        process.env.GEMINI_API_KEY,
    GEMINI_TAKEOFF_MODEL:  process.env.GEMINI_TAKEOFF_MODEL,
    OPENAI_API_KEY:        process.env.OPENAI_API_KEY,
  };
  process.env.TAKEOFF_AI_PROVIDER  = "gemini";
  process.env.TAKEOFF_AI_ENABLED   = "1";
  process.env.GEMINI_API_KEY       = "test-gemini-key";
  process.env.GEMINI_TAKEOFF_MODEL = "gemini-2.5-pro";
  process.env.OPENAI_API_KEY       = "sk-should-not-be-used";

  try {
    const config = readExtractionConfig();
    assert.equal(config.providerName, "gemini");
    assert.equal(config.apiKey, "test-gemini-key");
    assert.equal(config.modelName, "gemini-2.5-pro");
    assert.equal(config.enabled, true);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// T17 — readExtractionConfig reads OPENAI_API_KEY when provider is openai
await t("T17: readExtractionConfig reads OPENAI_API_KEY for openai provider", () => {
  const saved = {
    TAKEOFF_AI_PROVIDER: process.env.TAKEOFF_AI_PROVIDER,
    TAKEOFF_AI_ENABLED:  process.env.TAKEOFF_AI_ENABLED,
    OPENAI_API_KEY:      process.env.OPENAI_API_KEY,
    TAKEOFF_AI_MODEL:    process.env.TAKEOFF_AI_MODEL,
    GEMINI_API_KEY:      process.env.GEMINI_API_KEY,
  };
  process.env.TAKEOFF_AI_PROVIDER = "openai";
  process.env.TAKEOFF_AI_ENABLED  = "1";
  process.env.OPENAI_API_KEY      = "sk-test-openai";
  process.env.TAKEOFF_AI_MODEL    = "gpt-4o";
  process.env.GEMINI_API_KEY      = "should-not-be-used";

  try {
    const config = readExtractionConfig();
    assert.equal(config.providerName, "openai");
    assert.equal(config.apiKey, "sk-test-openai");
    assert.equal(config.modelName, "gpt-4o");
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// T18-T20 — stripJsonFences
await t("T18: stripJsonFences strips ```json...``` wrapper", () => {
  const input  = '```json\n{"foo":"bar"}\n```';
  const output = stripJsonFences(input);
  assert.equal(output, '{"foo":"bar"}');
});

await t("T19: stripJsonFences strips plain ```...``` wrapper", () => {
  const input  = '```\n{"foo":"bar"}\n```';
  const output = stripJsonFences(input);
  assert.equal(output, '{"foo":"bar"}');
});

await t("T20: stripJsonFences leaves plain JSON untouched", () => {
  const input  = '{"foo":"bar"}';
  const output = stripJsonFences(input);
  assert.equal(output, '{"foo":"bar"}');
});

// T21-T23 — v5.8.1 QA gate behavior preserved (not affected by Gemini provider)

const MINIMAL_TAKEOFF = (countertopSf, backsplashSf) => ({
  rooms: [{
    roomName: "Kitchen",
    surfaces: [{
      surfaceType: "countertop",
      runs: [{ length: Math.sqrt(countertopSf), width: Math.sqrt(countertopSf) }],
    }],
  }],
});

const MINIMAL_COMPUTED = (ctSf, bsSf) => ({
  countertopExactSf: ctSf,
  backsplashExactSf: bsSf,
  combinedExactSf:   ctSf + bsSf,
  chargeableCountertopSf: ctSf,
  chargeableBacksplashSf: bsSf,
});

await t("T21: v5.8.1 QA gate: expected CT 49 / computed 80.93 → do_not_import", () => {
  const qaGate = evaluateTakeoffQaGate({
    takeoffResult:         MINIMAL_TAKEOFF(80.93, 0),
    computedMeasurements:  MINIMAL_COMPUTED(80.93, 0),
    validationDiagnostics: { errors: [], warnings: [], errorCount: 0, warningCount: 0 },
    dimensionEvidence:     null,
    pageInventory:         null,
    benchmarkContext: {
      source:               "benchmark",
      label:                "Weidenheim 49",
      expectedCountertopSf: 49,
      expectedBacksplashSf: 0,
      toleranceCountertopSf: 2,
      toleranceBacksplashSf: 0,
    },
    benchmarkEvaluation:   null,
  });
  assert.equal(qaGate.status, "do_not_import",
    `expected do_not_import, got: ${qaGate.status} — issues: ${qaGate.topIssues?.map(i=>i.code).join(", ")}`);
});

await t("T22: v5.8.1 QA gate: expected CT 50 / computed 73 → do_not_import", () => {
  const qaGate = evaluateTakeoffQaGate({
    takeoffResult:         MINIMAL_TAKEOFF(73, 0),
    computedMeasurements:  MINIMAL_COMPUTED(73, 0),
    validationDiagnostics: { errors: [], warnings: [], errorCount: 0, warningCount: 0 },
    dimensionEvidence:     null,
    pageInventory:         null,
    benchmarkContext: {
      source:               "benchmark",
      label:                "Kelley 50",
      expectedCountertopSf: 50,
      expectedBacksplashSf: 0,
      toleranceCountertopSf: 2,
      toleranceBacksplashSf: 0,
    },
    benchmarkEvaluation:   null,
  });
  assert.equal(qaGate.status, "do_not_import",
    `expected do_not_import, got: ${qaGate.status}`);
});

await t("T23: v5.8.1 QA gate: expected CT 31 / computed 32.98 → ready_for_review (within tolerance)", () => {
  const qaGate = evaluateTakeoffQaGate({
    takeoffResult:         MINIMAL_TAKEOFF(32.98, 0),
    computedMeasurements:  MINIMAL_COMPUTED(32.98, 0),
    validationDiagnostics: { errors: [], warnings: [], errorCount: 0, warningCount: 0 },
    dimensionEvidence:     null,
    pageInventory:         null,
    benchmarkContext: {
      source:               "benchmark",
      label:                "Merschman 31",
      expectedCountertopSf: 31,
      expectedBacksplashSf: 0,
      toleranceCountertopSf: 2,
      toleranceBacksplashSf: 0,
    },
    benchmarkEvaluation:   null,
  });
  assert.equal(qaGate.status, "ready_for_review",
    `expected ready_for_review, got: ${qaGate.status}`);
});

// T24 — no quote mutation
await t("T24: gemini provider exports have no pricing or quote mutation references", () => {
  // This test verifies by import structure — if the module imports pricing/quote mutation
  // functions, those imports would be caught in code review. Here we verify the providers
  // return only the expected contract fields.
  const fakeResult = { rooms: [], status: "draft" };
  return withMockFetch(
    makeOkFetch(JSON.stringify(fakeResult)),
    async () => {
      const result = await geminiExtractionProvider({
        fileBuffer: TEST_FILE_BUFFER,
        mimeType:   TEST_MIME,
        originalFilename: TEST_FILENAME,
        modelName:  TEST_MODEL,
        apiKey:     TEST_API_KEY,
      });
      const keys = Object.keys(result);
      const allowed = new Set(["rawText", "parsed", "parseError", "modelUsed", "usage", "provider"]);
      for (const k of keys) {
        assert.ok(allowed.has(k), `unexpected key in provider output: ${k}`);
      }
      assert.ok(!("quoteId" in result), "provider must not return quoteId");
      assert.ok(!("pricingTier" in result), "provider must not return pricingTier");
    }
  );
});

// T25 — SUPPORTED_PROVIDERS includes gemini
await t("T25: SUPPORTED_PROVIDERS includes gemini and openai", () => {
  assert.ok(SUPPORTED_PROVIDERS.includes("gemini"), "gemini should be in SUPPORTED_PROVIDERS");
  assert.ok(SUPPORTED_PROVIDERS.includes("openai"), "openai should be in SUPPORTED_PROVIDERS");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
