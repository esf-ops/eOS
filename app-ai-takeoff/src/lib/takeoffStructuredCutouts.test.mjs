/**
 * Structured cutout scope regression — replaces the freeform "sink:1" input.
 *
 * Contract: run.cutouts = [{ type, quantity, source, note? }]
 * Types: kitchen_sink | vanity_bar_sink | cooktop | electrical_outlet |
 *        pop_up_outlet | other (note required for review).
 *
 * Run: node app-ai-takeoff/src/lib/takeoffStructuredCutouts.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flattenPieces, patchRun } from "./consolidatedWorksheetRows.mjs";
import {
  collectCutoutReviewIssues,
  deriveFabricationQuantitiesFromImportPayload,
  normalizeRunCutouts,
  normalizeTakeoffCutoutScope,
  setCutoutNote,
  setCutoutQuantity,
  summarizeRunCutouts,
  TAKEOFF_CUTOUT_TYPES,
  toggleCutoutEntry
} from "../../../backend-core/src/takeoff/takeoffCutoutScope.mjs";
import { normalizeTakeoffBacksplashEligibility } from "../../../backend-core/src/takeoff/takeoffBacksplashEligibility.mjs";
import { buildTakeoffImportPayload } from "../../../backend-core/src/takeoff/takeoffImportPayload.mjs";
import { computeTakeoffMeasurements } from "../../../backend-core/src/takeoff/takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "../../../backend-core/src/takeoff/takeoffValidator.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(join(root, "components/ConsolidatedTakeoffReview.tsx"), "utf8");

console.log("\ntakeoffStructuredCutouts.test.mjs\n");

function draft() {
  return normalizeTakeoffCutoutScope(
    normalizeTakeoffBacksplashEligibility({
      schemaVersion: "1.0",
      status: "draft",
      rooms: [
        {
          id: "room-kitchen",
          name: "Kitchen",
          areas: [
            {
              id: "area-main",
              label: "Main",
              backsplashScope: "stone",
              runs: [
                { id: "run-1", label: "Sink wall", lengthIn: 100, depthIn: 25.5, pieceType: "counter", backsplashEligible: true },
                { id: "run-2", label: "Stove wall", lengthIn: 80, depthIn: 25.5, pieceType: "counter", backsplashEligible: true },
                { id: "run-3", label: "Island", lengthIn: 72, depthIn: 40, pieceType: "counter", backsplashEligible: false }
              ]
            }
          ]
        }
      ]
    }).takeoff
  ).takeoff;
}

// ── 11–15. every supported physical cutout type can be selected ──────────────
{
  const cases = [
    ["kitchen_sink", "Kitchen sink"],
    ["vanity_bar_sink", "Vanity/bar sink"],
    ["cooktop", "Cooktop"],
    ["electrical_outlet", "Electrical outlet"],
    ["pop_up_outlet", "Pop-up outlet"]
  ];
  let n = 11;
  for (const [type, label] of cases) {
    const cutouts = toggleCutoutEntry([], type, true);
    assert.deepEqual(cutouts, [{ type, quantity: 1, source: "estimator_confirmed" }]);
    assert.equal(summarizeRunCutouts(cutouts), label);
    assert.ok(
      TAKEOFF_CUTOUT_TYPES.some((t) => t.type === type),
      `${n}: ${type} is a supported type`
    );
    console.log(`  ✓ ${n}. ${label} cutout can be selected`);
    n += 1;
  }
}

// ── 16. other requires note / review ──────────────────────────────────────────
{
  const noNote = toggleCutoutEntry([], "other", true);
  const issues = collectCutoutReviewIssues(noNote);
  assert.equal(issues.length, 1, "16: note-less other flags review");
  assert.equal(issues[0].code, "OTHER_CUTOUT_NOTE_REQUIRED");
  const withNote = setCutoutNote(noNote, "other", "soap dispenser hole");
  assert.equal(collectCutoutReviewIssues(withNote).length, 0, "16: note clears review");
  assert.equal(summarizeRunCutouts(withNote), "Other (soap dispenser hole)");
  // Ungoverned: other never maps to a governed add-on quantity.
  const derived = deriveFabricationQuantitiesFromImportPayload({
    rooms: [{ name: "Kitchen", pieces: [{ cutouts: withNote }] }]
  });
  assert.deepEqual(derived.addOnQuantities, {}, "16: other is not auto-priced");
  assert.equal(derived.reviewCutouts.length, 1, "16: other lands in review list");
  console.log("  ✓ 16. other requires note/review and never auto-prices");
}

// ── 17. multiple cutouts can exist on one run ─────────────────────────────────
{
  let cutouts = toggleCutoutEntry([], "kitchen_sink", true);
  cutouts = toggleCutoutEntry(cutouts, "cooktop", true);
  cutouts = setCutoutQuantity(cutouts, "cooktop", 2);
  assert.equal(cutouts.length, 2);
  assert.equal(summarizeRunCutouts(cutouts), "Kitchen sink, Cooktop ×2");
  console.log("  ✓ 17. multiple cutouts can exist on one run");
}

// ── 18. one run's cutouts do not alter another ────────────────────────────────
{
  let d = draft();
  d = patchRun(
    d,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-2" },
    { cutouts: toggleCutoutEntry([], "cooktop", true) }
  );
  const rows = flattenPieces(d, new Set());
  assert.equal(rows.find((r) => r.runId === "run-2").cutoutsSummary, "Cooktop");
  assert.equal(rows.find((r) => r.runId === "run-1").cutoutsSummary, "None");
  assert.equal(rows.find((r) => r.runId === "run-3").cutoutsSummary, "None");
  console.log("  ✓ 18. one run's cutouts do not alter another");
}

// ── 19. save/reload preserves structured cutouts ──────────────────────────────
{
  let d = draft();
  const cutouts = toggleCutoutEntry(toggleCutoutEntry([], "kitchen_sink", true), "electrical_outlet", true);
  d = patchRun(d, { roomId: "room-kitchen", areaId: "area-main", runId: "run-1" }, { cutouts });
  const reloaded = normalizeTakeoffCutoutScope(structuredClone(d)).takeoff;
  const rows = flattenPieces(reloaded, new Set());
  assert.deepEqual(
    rows.find((r) => r.runId === "run-1").cutouts,
    [
      { type: "kitchen_sink", quantity: 1, source: "estimator_confirmed" },
      { type: "electrical_outlet", quantity: 1, source: "estimator_confirmed" }
    ],
    "19: structured entries survive reload normalization"
  );
  console.log("  ✓ 19. save/reload preserves structured cutouts");
}

// ── 20. approval payload preserves structured cutouts ─────────────────────────
{
  let d = draft();
  d = patchRun(
    d,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-1" },
    { cutouts: toggleCutoutEntry([], "kitchen_sink", true) }
  );
  d = patchRun(
    d,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-2" },
    { cutouts: toggleCutoutEntry([], "cooktop", true) }
  );
  d = { ...d, status: "approved" };
  const computed = computeTakeoffMeasurements(d);
  const payload = buildTakeoffImportPayload({
    takeoffJobId: "job-sc",
    takeoffResultId: "result-sc",
    takeoffResult: d,
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: { "room-kitchen": true },
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    computed,
    validation: validateTakeoffResult(d, computed),
    qaGate: { status: "ready_for_review", topIssues: [] },
    reviewStatus: "approved",
    ignoreApprovalGateBlockers: true
  });
  const byName = Object.fromEntries(payload.rooms[0].pieces.map((p) => [p.name, p]));
  assert.deepEqual(byName["Sink wall"].cutouts, [
    { type: "kitchen_sink", quantity: 1, source: "estimator_confirmed" }
  ]);
  assert.deepEqual(byName["Stove wall"].cutouts, [
    { type: "cooktop", quantity: 1, source: "estimator_confirmed" }
  ]);
  assert.deepEqual(byName["Island"].cutouts, []);
  // Room/run ownership preserved — never aggregated by room name alone.
  assert.equal(byName["Sink wall"].runId, "run-1");
  assert.equal(byName["Sink wall"].roomId, "room-kitchen");
  // Payload-level derived quantities + summary present for Pricing Setup.
  assert.deepEqual(payload.fabricationQuantities.addOnQuantities, {
    "qty-sink": 1,
    "qty-cook": 1
  });
  assert.equal(payload.scopeSummary.kitchenSinkCutouts, 1);
  assert.equal(payload.scopeSummary.cooktopCutouts, 1);
  console.log("  ✓ 20. approval payload preserves structured cutouts");
}

// ── 21. no freeform parsing required ──────────────────────────────────────────
{
  assert.ok(!component.includes('placeholder="sink:1"'), "21: freeform input removed");
  const cutoutsBlock = component.slice(
    component.indexOf('data-testid="ctr-cutouts"'),
    component.indexOf('data-testid="ctr-cutouts"') + 4000
  );
  assert.ok(!cutoutsBlock.includes('split(":")'), "21: no colon parsing in cutouts UI");
  assert.ok(component.includes("toggleCutoutEntry"), "21: structured toggles in UI");
  console.log("  ✓ 21. no freeform parsing required");
}

// ── 22. legacy cutout strings normalize safely ────────────────────────────────
{
  const fromString = normalizeRunCutouts("sink:1, cooktop:2, weirdthing:1");
  assert.deepEqual(fromString.cutouts, [
    { type: "kitchen_sink", quantity: 1, source: "legacy" },
    { type: "cooktop", quantity: 2, source: "legacy" },
    { type: "other", quantity: 1, source: "legacy", note: "weirdthing" }
  ]);
  const fromMap = normalizeRunCutouts({ sink: 1, outlet: 3, popup: 1 });
  assert.deepEqual(fromMap.cutouts, [
    { type: "kitchen_sink", quantity: 1, source: "legacy" },
    { type: "electrical_outlet", quantity: 3, source: "legacy" },
    { type: "pop_up_outlet", quantity: 1, source: "legacy" }
  ]);
  assert.deepEqual(normalizeRunCutouts(null).cutouts, []);
  assert.deepEqual(normalizeRunCutouts(42).cutouts, [], "22: garbage input yields empty");
  // Full-draft normalization heals legacy shapes in place.
  const healed = normalizeTakeoffCutoutScope({
    schemaVersion: "1.0",
    rooms: [
      {
        id: "r1",
        areas: [{ id: "a1", runs: [{ id: "x1", label: "L", lengthIn: 10, depthIn: 10, cutouts: { sink: 1 } }] }]
      }
    ]
  }).takeoff;
  assert.deepEqual(healed.rooms[0].areas[0].runs[0].cutouts, [
    { type: "kitchen_sink", quantity: 1, source: "legacy" }
  ]);
  console.log("  ✓ 22. legacy cutout strings normalize safely");
}

// ── 23. duplicate cutout charge is prevented ──────────────────────────────────
{
  // Duplicate entries of the same type merge, never double.
  const merged = normalizeRunCutouts([
    { type: "kitchen_sink", quantity: 1, source: "ai_suggested" },
    { type: "kitchen_sink", quantity: 1, source: "estimator_confirmed" }
  ]);
  assert.equal(merged.cutouts.length, 1, "23: same-type entries merge");
  assert.equal(merged.cutouts[0].quantity, 2, "23: quantities sum once");
  // Derived quantities count each opening exactly once and skip excluded pieces.
  const derived = deriveFabricationQuantitiesFromImportPayload({
    rooms: [
      {
        name: "Kitchen",
        pieces: [
          { runId: "r1", cutouts: [{ type: "kitchen_sink", quantity: 1, source: "estimator_confirmed" }] },
          { runId: "r2", includedInTakeoff: false, cutouts: [{ type: "kitchen_sink", quantity: 1, source: "estimator_confirmed" }] }
        ]
      }
    ]
  });
  assert.deepEqual(derived.addOnQuantities, { "qty-sink": 1 }, "23: excluded piece never charges");
  console.log("  ✓ 23. duplicate cutout charge is prevented");
}

console.log("\ntakeoffStructuredCutouts.test.mjs — passed\n");
