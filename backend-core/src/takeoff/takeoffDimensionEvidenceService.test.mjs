/**
 * takeoffDimensionEvidenceService — unit tests.
 *
 * Run: npm run eos:test:takeoff-dimension-evidence
 *
 * All tests use a mocked provider function — no real OpenAI calls.
 *
 * Tests:
 *   1. Valid evidence JSON returns normalized DimensionEvidence object
 *   2. recommendedMeasurementPages from pageInventory passed to provider as context
 *   3. Invalid / non-JSON response throws evidenceFailed error
 *   4. Empty provider response throws evidenceFailed error
 *   5. Missing dimensions array throws evidenceFailed error
 *   6. Provider called with correct params (fileBuffer, mimeType, filename)
 *   7. Cutouts array captured separately from dimensions (structural test)
 *   8. Provider throwing an error re-throws as evidenceFailed
 *   9. evidencePromptVersion included in returned evidence
 *  10. No quote mutation, no pricing in result
 */

import assert from "node:assert/strict";
import { runDimensionEvidence, EVIDENCE_PROMPT_VERSION } from "./takeoffDimensionEvidenceService.mjs";

const FAKE_FILE_BUFFER = Buffer.from("fake-plan-file");
const FAKE_FILENAME    = "test-plan.pdf";
const FAKE_ORG_ID      = "11111111-2222-3333-4444-555555555555";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeValidEvidenceJson(overrides = {}) {
  return JSON.stringify({
    schemaVersion: "1.0",
    sourcePages: [1],
    dimensions: [
      {
        id: "dim-1",
        pageNumber: 1,
        label: "Island top",
        rawText: "108 x 56",
        lengthIn: 108,
        depthIn: 56,
        confidence: "high",
        category: "countertop_run",
        interpretationNotes: [],
      },
      {
        id: "dim-2",
        pageNumber: 1,
        label: "Sink wall",
        rawText: "91.5\"",
        lengthIn: 91.5,
        depthIn: null,
        confidence: "high",
        category: "countertop_run",
        interpretationNotes: ["Depth not labeled"],
      },
    ],
    notes: [
      { pageNumber: 1, text: "4\" B/S standard", category: "backsplash", confidence: "high" },
    ],
    cutouts: [
      { pageNumber: 1, type: "sink", label: "Sink cutout", confidence: "high", notes: [] },
    ],
    uncertainItems: [],
    reviewRequired: false,
    ...overrides,
  });
}

function mockProvider(rawText) {
  return async () => {
    let parsed = null;
    let parseError = null;
    try { parsed = JSON.parse(rawText); } catch (e) { parseError = e.message; }
    return { rawText, parsed, parseError, modelUsed: "gpt-4o-mock", usage: {} };
  };
}

// ── Test 1. Valid JSON → normalized DimensionEvidence ─────────────────────────
{
  const result = await runDimensionEvidence({
    fileBuffer:       FAKE_FILE_BUFFER,
    mimeType:         "application/pdf",
    originalFilename: FAKE_FILENAME,
    providerFn:       mockProvider(makeValidEvidenceJson()),
  });

  assert.equal(result.schemaVersion, "1.0", "T1: schemaVersion preserved");
  assert.ok(Array.isArray(result.dimensions), "T1: dimensions is array");
  assert.equal(result.dimensions.length, 2, "T1: 2 dimensions parsed");
  assert.equal(result.dimensions[0].label, "Island top", "T1: first dimension label");
  assert.equal(result.dimensions[0].lengthIn, 108, "T1: lengthIn preserved");
  assert.equal(result.dimensions[0].depthIn, 56, "T1: depthIn preserved");
  assert.ok(Array.isArray(result.notes), "T1: notes is array");
  assert.equal(result.notes.length, 1, "T1: 1 note parsed");
  assert.ok(Array.isArray(result.cutouts), "T1: cutouts is array");
  assert.equal(result.cutouts.length, 1, "T1: 1 cutout parsed");
  assert.equal(result.reviewRequired, false, "T1: reviewRequired false");
  console.log("ok: valid evidence JSON parsed into normalized DimensionEvidence");
}

// ── Test 2. pageInventory context passed to provider ─────────────────────────
{
  const capturedCalls = [];
  const capturingProvider = async (params) => {
    capturedCalls.push(params);
    const raw = makeValidEvidenceJson();
    return { rawText: raw, parsed: JSON.parse(raw), parseError: null, modelUsed: "gpt-4o", usage: {} };
  };

  const pageInventory = {
    recommendedMeasurementPages: [1, 2],
    pagesToIgnore: [3],
  };

  await runDimensionEvidence({
    fileBuffer:       FAKE_FILE_BUFFER,
    mimeType:         "application/pdf",
    originalFilename: FAKE_FILENAME,
    pageInventory,
    providerFn:       capturingProvider,
  });

  assert.equal(capturedCalls.length, 1, "T2: provider called once");
  assert.deepEqual(capturedCalls[0].pageInventory, pageInventory, "T2: pageInventory passed to provider");
  console.log("ok: pageInventory context passed through to evidence provider");
}

// ── Test 3. Invalid JSON throws evidenceFailed ─────────────────────────────────
{
  let threw = false;
  try {
    await runDimensionEvidence({
      fileBuffer:       FAKE_FILE_BUFFER,
      mimeType:         "application/pdf",
      originalFilename: FAKE_FILENAME,
      providerFn:       mockProvider("this is not json"),
    });
  } catch (err) {
    threw = true;
    assert.ok(err.evidenceFailed === true, "T3: evidenceFailed flag on parse error");
    assert.ok(err.statusCode === 422, "T3: statusCode 422 for parse error");
  }
  assert.ok(threw, "T3: threw for invalid JSON");
  console.log("ok: invalid evidence JSON throws evidenceFailed error");
}

// ── Test 4. Empty string response throws evidenceFailed ───────────────────────
{
  let threw = false;
  try {
    await runDimensionEvidence({
      fileBuffer:       FAKE_FILE_BUFFER,
      mimeType:         "application/pdf",
      originalFilename: FAKE_FILENAME,
      providerFn:       async () => ({ rawText: "", parsed: null, parseError: "empty", modelUsed: "mock", usage: {} }),
    });
  } catch (err) {
    threw = true;
    assert.ok(err.evidenceFailed === true, "T4: evidenceFailed on empty response");
  }
  assert.ok(threw, "T4: threw for empty response");
  console.log("ok: empty evidence response throws evidenceFailed error");
}

// ── Test 5. Missing dimensions array throws evidenceFailed ────────────────────
{
  const invalidEvidence = JSON.stringify({ schemaVersion: "1.0", sourcePages: [1] }); // no dimensions
  let threw = false;
  try {
    await runDimensionEvidence({
      fileBuffer:       FAKE_FILE_BUFFER,
      mimeType:         "application/pdf",
      originalFilename: FAKE_FILENAME,
      providerFn:       mockProvider(invalidEvidence),
    });
  } catch (err) {
    threw = true;
    assert.ok(err.evidenceFailed === true, "T5: evidenceFailed when dimensions missing");
    assert.ok(err.statusCode === 422, "T5: statusCode 422");
  }
  assert.ok(threw, "T5: threw when dimensions array is missing");
  console.log("ok: missing dimensions array throws evidenceFailed error");
}

// ── Test 6. Provider called with correct params ───────────────────────────────
{
  const capturedCalls = [];
  const capturingProvider = async (params) => {
    capturedCalls.push(params);
    const raw = makeValidEvidenceJson();
    return { rawText: raw, parsed: JSON.parse(raw), parseError: null, modelUsed: "gpt-4o", usage: {} };
  };

  await runDimensionEvidence({
    fileBuffer:       FAKE_FILE_BUFFER,
    mimeType:         "image/jpeg",
    originalFilename: FAKE_FILENAME,
    modelName:        "gpt-4o-mini",
    providerFn:       capturingProvider,
  });

  const call = capturedCalls[0];
  assert.ok(Buffer.isBuffer(call.fileBuffer), "T6: fileBuffer passed as Buffer");
  assert.equal(call.mimeType, "image/jpeg", "T6: mimeType passed");
  assert.equal(call.originalFilename, FAKE_FILENAME, "T6: filename passed");
  assert.equal(call.modelName, "gpt-4o-mini", "T6: modelName passed");
  console.log("ok: provider called with correct params (fileBuffer, mimeType, filename, modelName)");
}

// ── Test 7. Cutouts captured separately from dimensions ───────────────────────
{
  // Fixture has "Sink wall" (a countertop run near the sink) in dimensions[]
  // and "Sink cutout" (the actual opening) in cutouts[]. They are different things.
  const result = await runDimensionEvidence({
    fileBuffer:       FAKE_FILE_BUFFER,
    mimeType:         "application/pdf",
    originalFilename: FAKE_FILENAME,
    providerFn:       mockProvider(makeValidEvidenceJson()),
  });

  // The cutout record (type="sink") must be in cutouts[], not in dimensions[]
  const dimensionCategories = result.dimensions.map((d) => d.category);
  assert.ok(!dimensionCategories.includes("cutout"), "T7: no dimension has category cutout");
  assert.equal(result.cutouts.length, 1, "T7: exactly 1 cutout in cutouts array");
  assert.equal(result.cutouts[0].type, "sink", "T7: cutout type is sink");
  assert.equal(result.cutouts[0].label, "Sink cutout", "T7: cutout label preserved");
  // Dimensions should NOT contain a record that is just a cutout marker
  // "Sink wall" is a valid countertop run (counter area near sink) — should be in dimensions[]
  const sinkWallDim = result.dimensions.find((d) => d.label === "Sink wall");
  assert.ok(sinkWallDim, "T7: 'Sink wall' countertop run is correctly in dimensions[]");
  assert.equal(sinkWallDim.category, "countertop_run", "T7: sink wall is categorized as countertop_run");
  console.log("ok: cutouts captured in cutouts[] separately from dimensions[]");
}

// ── Test 8. Provider throwing error re-throws as evidenceFailed ───────────────
{
  const throwingProvider = async () => {
    throw Object.assign(new Error("OpenAI API error 503"), { statusCode: 503 });
  };
  let threw = false;
  try {
    await runDimensionEvidence({
      fileBuffer:       FAKE_FILE_BUFFER,
      mimeType:         "application/pdf",
      originalFilename: FAKE_FILENAME,
      providerFn:       throwingProvider,
    });
  } catch (err) {
    threw = true;
    assert.ok(err.evidenceFailed === true, "T8: evidenceFailed flag set when provider throws");
    assert.ok(err.message.includes("Dimension evidence AI call failed"), "T8: message wraps original");
  }
  assert.ok(threw, "T8: threw when provider throws");
  console.log("ok: provider throw re-wrapped as evidenceFailed error");
}

// ── Test 9. evidencePromptVersion included in result ─────────────────────────
{
  const result = await runDimensionEvidence({
    fileBuffer:       FAKE_FILE_BUFFER,
    mimeType:         "application/pdf",
    originalFilename: FAKE_FILENAME,
    providerFn:       mockProvider(makeValidEvidenceJson()),
  });

  assert.equal(result.evidencePromptVersion, EVIDENCE_PROMPT_VERSION, "T9: evidencePromptVersion in result");
  assert.equal(result.evidencePromptVersion, "v1", "T9: evidencePromptVersion is v1");
  console.log("ok: evidencePromptVersion included in returned DimensionEvidence");
}

// ── Test 10. No quote mutation, no pricing in result ──────────────────────────
{
  const result = await runDimensionEvidence({
    fileBuffer:       FAKE_FILE_BUFFER,
    mimeType:         "application/pdf",
    originalFilename: FAKE_FILENAME,
    providerFn:       mockProvider(makeValidEvidenceJson()),
  });

  // Result must not contain any quote/pricing-related keys
  const forbiddenKeys = [
    "quoteId", "quote_id", "pricingRate", "countertopRate", "pricePerSf",
    "quote_headers", "lineItems", "organizationId", FAKE_ORG_ID,
  ];
  const resultStr = JSON.stringify(result);
  for (const key of forbiddenKeys) {
    assert.ok(!resultStr.includes(key), `T10: result must not contain "${key}"`);
  }
  console.log("ok: dimension evidence result contains no quote mutation / pricing data");
}

console.log("\ntakeoffDimensionEvidenceService: all 10 tests passed");
