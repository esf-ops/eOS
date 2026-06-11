/**
 * takeoffConfig — safe provider config tests (v5.9.3).
 *
 * Tests that readSafeProviderConfig() returns the correct shape and
 * never exposes API key values to the caller.
 *
 * Run: npm run eos:test:takeoff-config
 *
 * Tests:
 *   1. OpenAI default config shape is correct
 *   2. Gemini config shape is correct
 *   3. TAKEOFF_AI_ENABLED unset → takeoffAiEnabled=false
 *   4. Both keys detected correctly regardless of active provider
 *   5. Empty key strings → hasKey=false
 *   6. No key values appear in the returned object (security check)
 */
import assert from "node:assert/strict";
import { readSafeProviderConfig } from "./takeoffAiProvider.mjs";

console.log("\ntakeoffConfig — safe provider config tests\n");

// ── Helper: temporarily override env vars, run fn, restore ────────────────

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === null || v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = String(v);
    }
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

// ── T1. OpenAI default config shape ──────────────────────────────────────

{
  const result = withEnv({
    TAKEOFF_AI_ENABLED:  "1",
    TAKEOFF_AI_PROVIDER: "openai",
    TAKEOFF_AI_MODEL:    "gpt-4o",
    OPENAI_API_KEY:      "sk-test-should-not-appear",
    GEMINI_API_KEY:      null,
  }, () => readSafeProviderConfig());

  assert.equal(result.takeoffAiEnabled, true,    "T1: takeoffAiEnabled=true");
  assert.equal(result.activeProvider,   "openai", "T1: activeProvider=openai");
  assert.equal(result.model,            "gpt-4o", "T1: model=gpt-4o");
  assert.equal(result.hasOpenAiKey,     true,    "T1: hasOpenAiKey=true");
  assert.equal(result.hasGeminiKey,     false,   "T1: hasGeminiKey=false when no GEMINI_API_KEY");
  assert.equal(result.hasExayardKey,    false,   "T1: hasExayardKey=false when no EXAYARD_API_KEY");
  assert.equal(result.hasExayardOrganizationId, false, "T1: hasExayardOrganizationId=false");
  assert.ok(typeof result.takeoffAiEnabled === "boolean", "T1: takeoffAiEnabled is boolean");
  assert.ok(typeof result.activeProvider   === "string",  "T1: activeProvider is string");
  assert.ok(typeof result.model            === "string",  "T1: model is string");
  assert.ok(typeof result.hasOpenAiKey     === "boolean", "T1: hasOpenAiKey is boolean");
  assert.ok(typeof result.hasGeminiKey     === "boolean", "T1: hasGeminiKey is boolean");
  console.log("ok T1: openai config shape is correct");
}

// ── T2. Gemini config shape ───────────────────────────────────────────────

{
  const result = withEnv({
    TAKEOFF_AI_ENABLED:   "1",
    TAKEOFF_AI_PROVIDER:  "gemini",
    GEMINI_TAKEOFF_MODEL: "gemini-2.5-pro",
    GEMINI_API_KEY:       "gemini-secret-should-not-appear",
    OPENAI_API_KEY:       null,
  }, () => readSafeProviderConfig());

  assert.equal(result.takeoffAiEnabled, true,           "T2: takeoffAiEnabled=true");
  assert.equal(result.activeProvider,   "gemini",        "T2: activeProvider=gemini");
  assert.equal(result.model,            "gemini-2.5-pro","T2: model=gemini-2.5-pro");
  assert.equal(result.hasGeminiKey,     true,            "T2: hasGeminiKey=true");
  assert.equal(result.hasOpenAiKey,     false,           "T2: hasOpenAiKey=false");
  console.log("ok T2: gemini config shape is correct");
}

// ── T3. TAKEOFF_AI_ENABLED not set → disabled ─────────────────────────────

{
  const result = withEnv({
    TAKEOFF_AI_ENABLED:  null,
    TAKEOFF_AI_PROVIDER: "openai",
    OPENAI_API_KEY:      "sk-x",
  }, () => readSafeProviderConfig());

  assert.equal(result.takeoffAiEnabled, false, "T3: takeoffAiEnabled=false when env unset");
  console.log("ok T3: TAKEOFF_AI_ENABLED unset → takeoffAiEnabled=false");
}

// ── T4. Both keys detected regardless of active provider ─────────────────

{
  const result = withEnv({
    TAKEOFF_AI_ENABLED:   "1",
    TAKEOFF_AI_PROVIDER:  "openai",   // openai is active
    OPENAI_API_KEY:       "sk-y",
    GEMINI_API_KEY:       "gemini-y", // gemini key also present (misconfiguration scenario)
  }, () => readSafeProviderConfig());

  assert.equal(result.activeProvider, "openai", "T4: activeProvider=openai");
  assert.equal(result.hasOpenAiKey,   true,     "T4: hasOpenAiKey=true");
  assert.equal(result.hasGeminiKey,   true,     "T4: hasGeminiKey=true even when not active");
  console.log("ok T4: both keys detected correctly regardless of active provider");
}

// ── T5. Empty key strings → hasKey=false ─────────────────────────────────

{
  const result = withEnv({
    TAKEOFF_AI_ENABLED:  "1",
    TAKEOFF_AI_PROVIDER: "openai",
    OPENAI_API_KEY:      "",
    GEMINI_API_KEY:      "",
  }, () => readSafeProviderConfig());

  assert.equal(result.hasOpenAiKey, false, "T5: empty OPENAI_API_KEY → false");
  assert.equal(result.hasGeminiKey, false, "T5: empty GEMINI_API_KEY → false");
  console.log("ok T5: empty key strings → hasKey=false");
}

// ── T6. No API key values in returned object (security) ──────────────────

{
  const FAKE_OPENAI_KEY  = "sk-should-never-be-in-output-1234";
  const FAKE_GEMINI_KEY  = "gemini-should-never-be-in-output-5678";

  const result = withEnv({
    TAKEOFF_AI_ENABLED:   "1",
    TAKEOFF_AI_PROVIDER:  "gemini",
    GEMINI_TAKEOFF_MODEL: "gemini-2.5-pro",
    OPENAI_API_KEY:       FAKE_OPENAI_KEY,
    GEMINI_API_KEY:       FAKE_GEMINI_KEY,
  }, () => readSafeProviderConfig());

  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(FAKE_OPENAI_KEY), "T6: OpenAI key value absent from output");
  assert.ok(!serialized.includes(FAKE_GEMINI_KEY), "T6: Gemini key value absent from output");

  // Verify only expected keys are present
  const outputKeys = Object.keys(result);
  const allowedKeys = [
    "takeoffAiEnabled",
    "activeProvider",
    "model",
    "hasGeminiKey",
    "hasOpenAiKey",
    "hasExayardKey",
    "hasExayardOrganizationId",
  ];
  for (const k of outputKeys) {
    assert.ok(allowedKeys.includes(k), `T6: unexpected key "${k}" in safe config output`);
  }
  console.log("ok T6: no API key values in output; only expected keys present");
}

// ── T7. Exayard config shape ───────────────────────────────────────────────

{
  const FAKE_EXAYARD_KEY = "ey-exayard-should-never-be-in-output";
  const result = withEnv({
    TAKEOFF_AI_ENABLED:       "1",
    TAKEOFF_AI_PROVIDER:      "exayard",
    EXAYARD_API_KEY:          FAKE_EXAYARD_KEY,
    EXAYARD_ORGANIZATION_ID:  "org_test",
    OPENAI_API_KEY:           null,
    GEMINI_API_KEY:           null,
  }, () => readSafeProviderConfig());

  assert.equal(result.activeProvider, "exayard", "T7: activeProvider=exayard");
  assert.equal(result.model, "platform", "T7: model=platform");
  assert.equal(result.hasExayardKey, true, "T7: hasExayardKey=true");
  assert.equal(result.hasExayardOrganizationId, true, "T7: hasExayardOrganizationId=true");
  assert.equal(result.hasOpenAiKey, false, "T7: hasOpenAiKey=false");
  assert.equal(result.hasGeminiKey, false, "T7: hasGeminiKey=false");
  assert.ok(!JSON.stringify(result).includes(FAKE_EXAYARD_KEY), "T7: Exayard key absent from output");
  console.log("ok T7: exayard config shape is correct");
}

console.log("\ntakeoffConfig: all 7 tests passed");
