/**
 * Tests for takeoffPageInventoryService — first-pass page classification.
 *
 * All tests use mocked AI providers.
 * No real OpenAI API calls are made.
 * No quote mutation. No pricing changes.
 *
 * Test coverage:
 *   1.  Valid inventory JSON returned → parsed correctly with pages array
 *   2.  Valid inventory JSON → recommendedMeasurementPages computed from pages
 *   3.  Invalid JSON from provider → error thrown with useful message
 *   4.  Empty response from provider → error thrown
 *   5.  Provider returns missing pages array → error thrown
 *   6.  Empty pages array → returned as-is (valid empty inventory)
 *   7.  Provider called with file buffer + modelName + originalFilename
 *   8.  Provider throws → error re-thrown with inventoryFailed flag
 *   9.  inventoryPromptVersion included in returned object
 *  10.  No quote mutation, no pricing changes in returned object
 */

import assert from "node:assert/strict";
import { runPageInventory, INVENTORY_PROMPT_VERSION } from "./takeoffPageInventoryService.mjs";

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    if (err.actual !== undefined || err.expected !== undefined) {
      console.error(`    actual:   ${JSON.stringify(err.actual)}`);
      console.error(`    expected: ${JSON.stringify(err.expected)}`);
    }
    failed++;
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_FILE = Buffer.from("MOCK_PDF_BYTES");
const MOCK_MIME = "application/pdf";
const MOCK_FILENAME = "kitchen_plan.pdf";

function makeValidInventory() {
  return {
    schemaVersion: "1.0",
    pages: [
      {
        pageNumber:                   1,
        pageType:                     "hand_sketch",
        measurementRelevance:         "high",
        orientation:                  "upright",
        containsCountertopDimensions: true,
        containsBacksplashNotes:      true,
        containsCutoutNotes:          false,
        containsMaterialColorNotes:   false,
        summary:                      "Hand-drawn kitchen sketch with labeled dimensions.",
        visibleDimensions: [
          { label: "Island", value: "108 x 56", unit: "in", confidence: "high", rawText: "108\" x 56\"" },
        ],
        visibleNotes: [
          { text: "4\" B/S", category: "backsplash", confidence: "high" },
        ],
        recommendedForTakeoff: true,
        reviewNotes: [],
      },
      {
        pageNumber:                   2,
        pageType:                     "email_context",
        measurementRelevance:         "none",
        orientation:                  "upright",
        containsCountertopDimensions: false,
        containsBacksplashNotes:      false,
        containsCutoutNotes:          false,
        containsMaterialColorNotes:   true,
        summary:                      "Customer email requesting quartz countertops.",
        visibleDimensions: [],
        visibleNotes: [
          { text: "White quartz", category: "material", confidence: "high" },
        ],
        recommendedForTakeoff: false,
        reviewNotes: ["Email context only — no measurements."],
      },
    ],
    recommendedMeasurementPages: [1],
    pagesToIgnore: [2],
    overallNotes: [],
  };
}

/** Build a mock provider that returns the given inventory JSON. */
function makeSuccessProvider(inventory = makeValidInventory()) {
  return async (input) => {
    const rawText = JSON.stringify(inventory);
    let parsed = null;
    let parseError = null;
    try { parsed = JSON.parse(rawText); } catch (e) { parseError = e.message; }
    return { rawText, parsed, parseError, modelUsed: "gpt-4o", usage: { promptTokens: 300, completionTokens: 400 } };
  };
}

/** Mock provider that returns invalid JSON string. */
function makeInvalidJsonProvider() {
  return async () => ({
    rawText:    "This is not JSON",
    parsed:     null,
    parseError: "Unexpected token T",
    modelUsed:  "gpt-4o",
    usage:      { promptTokens: 100, completionTokens: 20 },
  });
}

/** Mock provider that returns empty text. */
function makeEmptyProvider() {
  return async () => ({
    rawText:    "",
    parsed:     null,
    parseError: "Model returned an empty response",
    modelUsed:  "gpt-4o",
    usage:      { promptTokens: 100, completionTokens: 0 },
  });
}

/** Mock provider that throws. */
function makeThrowingProvider(msg = "AI network error", statusCode = 503) {
  return async () => { throw Object.assign(new Error(msg), { statusCode }); };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. Valid inventory JSON returned → parsed correctly
await test("valid inventory JSON → parsed and returned correctly", async () => {
  const inventory = await runPageInventory({
    fileBuffer:       MOCK_FILE,
    mimeType:         MOCK_MIME,
    originalFilename: MOCK_FILENAME,
    providerFn:       makeSuccessProvider(),
  });

  assert.equal(inventory.schemaVersion, "1.0", "schemaVersion must be 1.0");
  assert.ok(Array.isArray(inventory.pages), "pages must be an array");
  assert.equal(inventory.pages.length, 2, "must have 2 pages");
  assert.equal(inventory.pages[0].pageType, "hand_sketch", "first page type mismatch");
  assert.equal(inventory.pages[1].pageType, "email_context", "second page type mismatch");
});

// 2. recommendedMeasurementPages populated correctly
await test("recommendedMeasurementPages returned correctly", async () => {
  const inventory = await runPageInventory({
    fileBuffer:       MOCK_FILE,
    mimeType:         MOCK_MIME,
    originalFilename: MOCK_FILENAME,
    providerFn:       makeSuccessProvider(),
  });

  assert.deepEqual(
    inventory.recommendedMeasurementPages,
    [1],
    "recommendedMeasurementPages must be [1]"
  );
  assert.deepEqual(
    inventory.pagesToIgnore,
    [2],
    "pagesToIgnore must be [2]"
  );
});

// 3. Invalid JSON from provider → error thrown with useful message
await test("invalid JSON from provider → throws with useful message", async () => {
  await assert.rejects(
    () => runPageInventory({
      fileBuffer:       MOCK_FILE,
      mimeType:         MOCK_MIME,
      originalFilename: MOCK_FILENAME,
      providerFn:       makeInvalidJsonProvider(),
    }),
    (err) => {
      assert.ok(
        err.message.includes("Page inventory JSON parse failed"),
        `Expected parse error message, got: ${err.message}`
      );
      assert.equal(err.inventoryFailed, true, "inventoryFailed flag must be set");
      return true;
    }
  );
});

// 4. Empty response from provider → error thrown
await test("empty response from provider → throws", async () => {
  await assert.rejects(
    () => runPageInventory({
      fileBuffer:       MOCK_FILE,
      mimeType:         MOCK_MIME,
      originalFilename: MOCK_FILENAME,
      providerFn:       makeEmptyProvider(),
    }),
    (err) => {
      assert.ok(err.message.includes("parse failed"), `Expected parse failed, got: ${err.message}`);
      return true;
    }
  );
});

// 5. Provider returns object missing pages array → error thrown
await test("inventory missing pages array → throws with useful message", async () => {
  const badInventory = makeSuccessProvider({ schemaVersion: "1.0", overallNotes: [] });
  await assert.rejects(
    () => runPageInventory({
      fileBuffer:       MOCK_FILE,
      mimeType:         MOCK_MIME,
      originalFilename: MOCK_FILENAME,
      providerFn:       badInventory,
    }),
    (err) => {
      assert.ok(
        err.message.includes("pages array"),
        `Expected missing pages error, got: ${err.message}`
      );
      assert.equal(err.inventoryFailed, true, "inventoryFailed flag must be set");
      return true;
    }
  );
});

// 6. Empty pages array → returned as-is (valid empty inventory)
await test("empty pages array → returned without error", async () => {
  const emptyInventory = {
    schemaVersion: "1.0",
    pages: [],
    recommendedMeasurementPages: [],
    pagesToIgnore: [],
    overallNotes: [],
  };
  const result = await runPageInventory({
    fileBuffer:       MOCK_FILE,
    mimeType:         MOCK_MIME,
    originalFilename: MOCK_FILENAME,
    providerFn:       makeSuccessProvider(emptyInventory),
  });
  assert.ok(Array.isArray(result.pages), "pages must be an array");
  assert.equal(result.pages.length, 0, "pages must be empty");
});

// 7. Provider called with file buffer, modelName, and originalFilename
await test("provider called with correct inputs (fileBuffer, mimeType, originalFilename)", async () => {
  let capturedInput = null;
  const capturingProvider = async (input) => {
    capturedInput = input;
    const fixture = makeValidInventory();
    return {
      rawText:    JSON.stringify(fixture),
      parsed:     fixture,
      parseError: null,
      modelUsed:  "gpt-4o",
      usage:      { promptTokens: 300, completionTokens: 400 },
    };
  };

  await runPageInventory({
    fileBuffer:       MOCK_FILE,
    mimeType:         MOCK_MIME,
    originalFilename: MOCK_FILENAME,
    modelName:        "gpt-4o",
    providerFn:       capturingProvider,
  });

  assert.ok(capturedInput, "provider must have been called");
  assert.ok(Buffer.isBuffer(capturedInput.fileBuffer), "fileBuffer must be a Buffer");
  assert.equal(capturedInput.mimeType,         MOCK_MIME,     "mimeType mismatch");
  assert.equal(capturedInput.originalFilename, MOCK_FILENAME, "originalFilename mismatch");
  assert.equal(capturedInput.modelName,        "gpt-4o",      "modelName mismatch");
});

// 8. Provider throws → error re-thrown with inventoryFailed flag
await test("provider throws → error re-thrown with inventoryFailed=true", async () => {
  await assert.rejects(
    () => runPageInventory({
      fileBuffer:       MOCK_FILE,
      mimeType:         MOCK_MIME,
      originalFilename: MOCK_FILENAME,
      providerFn:       makeThrowingProvider("AI call timed out"),
    }),
    (err) => {
      assert.ok(
        err.message.includes("Page inventory AI call failed"),
        `Expected inventory AI call failed, got: ${err.message}`
      );
      assert.equal(err.inventoryFailed, true, "inventoryFailed must be true");
      return true;
    }
  );
});

// 9. inventoryPromptVersion included in returned object
await test("inventoryPromptVersion included in returned inventory", async () => {
  const result = await runPageInventory({
    fileBuffer:       MOCK_FILE,
    mimeType:         MOCK_MIME,
    originalFilename: MOCK_FILENAME,
    providerFn:       makeSuccessProvider(),
  });
  assert.equal(
    result.inventoryPromptVersion,
    INVENTORY_PROMPT_VERSION,
    "inventoryPromptVersion must match INVENTORY_PROMPT_VERSION export"
  );
});

// 10. No quote mutation, no pricing in result
await test("no quote mutation or pricing data in inventory result", async () => {
  const result = await runPageInventory({
    fileBuffer:       MOCK_FILE,
    mimeType:         MOCK_MIME,
    originalFilename: MOCK_FILENAME,
    providerFn:       makeSuccessProvider(),
  });
  const resultStr = JSON.stringify(result);
  assert.ok(!resultStr.includes("quote_header"), "must not reference quote_headers");
  assert.ok(!resultStr.includes("price"),        "must not contain price data");
  assert.ok(!resultStr.includes("countertopSf"), "must not contain computed SF");
  assert.ok(!resultStr.includes("storage_path"), "must not contain storage_path");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
