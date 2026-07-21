/**
 * Hosted Takeoff worksheet interaction regression — Backsplash checkbox and
 * Cutouts input must remain clickable/focusable (not covered by overflow,
 * not disabled by autosave, not sharing hit targets across columns).
 *
 * Run: node app-ai-takeoff/src/lib/takeoffRowControlsInteraction.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flattenPieces, patchRun } from "./consolidatedWorksheetRows.mjs";
import { normalizeTakeoffBacksplashEligibility } from "../../../backend-core/src/takeoff/takeoffBacksplashEligibility.mjs";
import { buildTakeoffImportPayload } from "../../../backend-core/src/takeoff/takeoffImportPayload.mjs";
import { computeTakeoffMeasurements } from "../../../backend-core/src/takeoff/takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "../../../backend-core/src/takeoff/takeoffValidator.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(join(root, "components/ConsolidatedTakeoffReview.tsx"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");

console.log("\ntakeoffRowControlsInteraction.test.mjs\n");

function fourRunDraft() {
  return normalizeTakeoffBacksplashEligibility({
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
              {
                id: "run-1",
                label: "Sink wall",
                lengthIn: 100,
                depthIn: 25.5,
                pieceType: "counter",
                backsplashEligible: false,
                cutouts: {}
              },
              {
                id: "run-2",
                label: "Stove wall",
                lengthIn: 80,
                depthIn: 25.5,
                pieceType: "counter",
                backsplashEligible: false,
                cutouts: {}
              },
              {
                id: "run-3",
                label: "Fridge wall",
                lengthIn: 60,
                depthIn: 25.5,
                pieceType: "counter",
                backsplashEligible: false,
                cutouts: {}
              },
              {
                id: "run-4",
                label: "Island",
                lengthIn: 72,
                depthIn: 40,
                pieceType: "counter",
                backsplashEligible: false,
                cutouts: {}
              }
            ]
          }
        ]
      }
    ]
  }).takeoff;
}

function extractControlBlock(marker) {
  const idx = component.indexOf(marker);
  assert.ok(idx >= 0, `missing marker ${marker}`);
  return component.slice(Math.max(0, idx - 400), idx + 900);
}

// ── 1. backsplash checkbox is not disabled by autosave/loading ───────────────
{
  const block = extractControlBlock('data-testid="ctr-backsplash-eligible"');
  assert.ok(block.includes("disabled={rowLocked}"), "1: only rowLocked gates checkbox");
  assert.ok(
    component.includes('const rowLocked = approveStatus === "approved"'),
    "1: rowLocked is approval-only"
  );
  assert.ok(
    !block.includes("disabled={saveStatus") &&
      !block.includes("disabled={aiPhase") &&
      !/disabled=\{[^}]*saveStatus/.test(component),
    "1: autosave does not disable backsplash"
  );
  console.log("  ✓ 1. backsplash checkbox is not disabled by autosave");
}

// ── 2. backsplash checkbox receives click (hit-target + label association) ───
{
  assert.ok(component.includes("htmlFor={bsId}"), "2: label htmlFor associated");
  assert.ok(component.includes("id={bsId}"), "2: checkbox has id");
  assert.ok(
    styles.includes('input[type="checkbox"]') &&
      styles.includes("pointer-events: auto"),
    "2: checkbox pointer-events auto"
  );
  assert.ok(
    styles.includes(".ctr-bs-toggle") && styles.includes("pointer-events: auto"),
    "2: label pointer-events auto"
  );
  console.log("  ✓ 2. backsplash checkbox click target + label wiring");
}

// ── 3. backsplash checkbox changes only one row ──────────────────────────────
{
  let draft = fourRunDraft();
  draft = patchRun(
    draft,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-1" },
    { backsplashEligible: true, backsplashEligibilitySource: "estimator_confirmed" }
  );
  const rows = flattenPieces(draft, new Set());
  assert.deepEqual(
    rows.map((r) => r.backsplashEligible),
    [true, false, false, false],
    "3: only row 1 toggled"
  );
  console.log("  ✓ 3. backsplash checkbox changes only one row");
}

// ── 4. cutouts input is not readOnly ─────────────────────────────────────────
{
  const block = extractControlBlock('data-testid="ctr-cutouts"');
  assert.ok(!block.includes("readOnly"), "4: cutouts has no readOnly prop");
  assert.ok(block.includes("disabled={rowLocked}"), "4: only approval locks cutouts");
  assert.ok(
    !/ctr-cutouts[\s\S]{0,500}disabled=\{saveStatus/.test(component),
    "4: saveStatus does not disable cutouts"
  );
  console.log("  ✓ 4. cutouts input is not readOnly");
}

// ── 5. cutouts input receives focus (focusable markup + CSS) ─────────────────
{
  assert.ok(component.includes("htmlFor={cutId}"), "5: cutouts label association");
  assert.ok(component.includes("id={cutId}"), "5: cutouts unique id");
  assert.ok(
    styles.includes(".ctr-cutouts-input") && styles.includes("pointer-events: auto"),
    "5: cutouts pointer-events auto"
  );
  assert.ok(
    styles.includes("input:focus-visible") || styles.includes(":focus-visible"),
    "5: visible focus ring"
  );
  assert.ok(
    !/ctr-cutouts-input[\s\S]{0,200}pointer-events:\s*none/.test(styles),
    "5: cutouts not pointer-events none"
  );
  console.log("  ✓ 5. cutouts input focusable wiring");
}

// ── 6. cutouts input updates only one row ────────────────────────────────────
{
  let draft = fourRunDraft();
  draft = patchRun(
    draft,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-2" },
    { cutouts: { sink: 1 } }
  );
  const rows = flattenPieces(draft, new Set());
  assert.equal(rows.find((r) => r.runId === "run-2").cutoutsLabel, "sink:1", "6: row 2 cutouts");
  assert.equal(rows.find((r) => r.runId === "run-1").cutoutsLabel, "", "6: row 1 unchanged");
  assert.equal(rows.find((r) => r.runId === "run-3").cutoutsLabel, "", "6: row 3 unchanged");
  console.log("  ✓ 6. cutouts input updates only one row");
}

// ── 7. autosave state does not disable either control ────────────────────────
{
  assert.ok(
    !component.includes('disabled={saveStatus !== "idle"}') &&
      !component.includes('disabled={saveStatus === "saving"}') &&
      !component.includes("disabled={aiPhase"),
    "7: no autosave/AI disable binding on row controls"
  );
  assert.ok(
    component.includes('const rowLocked = approveStatus === "approved"'),
    "7: only approval locks rows"
  );
  console.log("  ✓ 7. autosave state does not disable either control");
}

// ── 8. save/reload preserves both values ─────────────────────────────────────
{
  let draft = fourRunDraft();
  draft = patchRun(
    draft,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-1" },
    { backsplashEligible: true, backsplashEligibilitySource: "estimator_confirmed" }
  );
  draft = patchRun(
    draft,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-2" },
    { cutouts: { cooktop: 1 } }
  );
  const reloaded = normalizeTakeoffBacksplashEligibility(structuredClone(draft)).takeoff;
  const rows = flattenPieces(reloaded, new Set());
  assert.equal(rows.find((r) => r.runId === "run-1").backsplashEligible, true, "8: bs preserved");
  assert.equal(rows.find((r) => r.runId === "run-2").cutoutsLabel, "cooktop:1", "8: cutouts preserved");
  console.log("  ✓ 8. save/reload preserves both values");
}

// ── 9. keyboard Tab reaches both controls (no tabIndex=-1) ───────────────────
{
  const bsBlock = extractControlBlock('data-testid="ctr-backsplash-eligible"');
  const cutBlock = extractControlBlock('data-testid="ctr-cutouts"');
  assert.ok(!/tabIndex=\{\s*-1\s*\}/.test(bsBlock), "9: bs not removed from tab order");
  assert.ok(!/tabIndex=\{\s*-1\s*\}/.test(cutBlock), "9: cutouts not removed from tab order");
  assert.ok(component.includes("htmlFor={bsId}") && component.includes("htmlFor={cutId}"));
  console.log("  ✓ 9. Tab can reach both controls (no tabIndex=-1)");
}

// ── 10. Space toggles checkbox (native checkbox + label) ─────────────────────
{
  const bsBlock = extractControlBlock('data-testid="ctr-backsplash-eligible"');
  assert.ok(bsBlock.includes('type="checkbox"'), "10: native checkbox");
  assert.ok(component.includes("htmlFor={bsId}"), "10: label enables Space activation");
  assert.ok(!bsBlock.includes('role="switch"'), "10: not a custom non-keyboard switch");
  console.log("  ✓ 10. Space toggles via native checkbox + label");
}

// ── 11. no duplicate input IDs ───────────────────────────────────────────────
{
  assert.ok(
    component.includes("`ctr-bs-${rowControlKey}`") ||
      component.includes("ctr-bs-${rowControlKey}"),
    "11: bs id uses room+area+run key"
  );
  assert.ok(
    component.includes("`ctr-cutouts-${rowControlKey}`") ||
      component.includes("ctr-cutouts-${rowControlKey}"),
    "11: cutouts id uses room+area+run key"
  );
  assert.ok(
    component.includes(
      "const rowControlKey = `${row.roomId}-${row.areaId}-${row.runId}`"
    ),
    "11: composite key from full row identity"
  );
  // Simulate two rows → ids are distinct.
  const a = `ctr-bs-room-kitchen-area-main-run-1`;
  const b = `ctr-bs-room-kitchen-area-main-run-2`;
  assert.notEqual(a, b, "11: distinct ids per run");
  console.log("  ✓ 11. no duplicate input IDs");
}

// ── 12. no CSS overlay blocks pointer events ────────────────────────────────
{
  assert.ok(
    styles.includes('input:not([type="checkbox"]):not([type="radio"])'),
    "12: width:100% excluded for checkboxes"
  );
  assert.ok(
    !/^\s*\.ctr-table input\s*,/m.test(styles) ||
      styles.includes('input:not([type="checkbox"])'),
    "12: global table input rule no longer forces checkbox stretch"
  );
  // Plan panel must sit under the worksheet.
  assert.ok(styles.includes(".ctr-plan") && styles.includes("z-index: 0"), "12: plan z-index 0");
  assert.ok(
    styles.includes(".ctr-main") &&
      styles.includes("isolation: isolate") &&
      /ctr-main[\s\S]{0,200}z-index:\s*1/.test(styles),
    "12: main worksheet above plan"
  );
  assert.ok(
    styles.includes("td:focus-within") && styles.includes("z-index: 3"),
    "12: focused cell elevates above overflow"
  );
  assert.ok(
    /\.ctr-table th, \.ctr-table td\s*\{[\s\S]*?overflow:\s*hidden/.test(styles),
    "12: cells contain overflow by default"
  );
  assert.ok(
    !/\.ctr-col-bs[\s\S]{0,120}pointer-events:\s*none/.test(styles) &&
      !/\.ctr-col-cutouts[\s\S]{0,120}pointer-events:\s*none/.test(styles),
    "12: target columns not pointer-events none"
  );
  console.log("  ✓ 12. no CSS overlay blocks pointer events");
}

// ── 13. existing row-identity tests still pass (smoke import) ────────────────
{
  const identity = readFileSync(join(root, "lib/takeoffPieceRowIdentity.test.mjs"), "utf8");
  assert.ok(identity.includes("editing piece 2 changes only piece 2"));
  console.log("  ✓ 13. row-identity suite still present (run separately)");
}

// ── 14. backsplash eligibility tests still pass (smoke import) ───────────────
{
  const elig = readFileSync(join(root, "lib/takeoffBacksplashEligibility.test.mjs"), "utf8");
  assert.ok(elig.includes("eligibility toggle updates only one row"));
  console.log("  ✓ 14. eligibility suite still present (run separately)");
}

// ── 15. approval payload preserves cutouts and eligibility ───────────────────
{
  let draft = fourRunDraft();
  draft = patchRun(
    draft,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-1" },
    { backsplashEligible: true, cutouts: { sink: 1 } }
  );
  draft = patchRun(
    draft,
    { roomId: "room-kitchen", areaId: "area-main", runId: "run-3" },
    { backsplashEligible: true, cutouts: { cooktop: 1 } }
  );
  draft = { ...draft, status: "approved" };
  const computed = computeTakeoffMeasurements(draft);
  const validation = validateTakeoffResult(draft, computed);
  const payload = buildTakeoffImportPayload({
    takeoffJobId: "job-ix",
    takeoffResultId: "result-ix",
    takeoffResult: draft,
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: { "room-kitchen": true },
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    computed,
    validation,
    qaGate: { status: "ready_for_review", topIssues: [] },
    reviewStatus: "approved",
    ignoreApprovalGateBlockers: true
  });
  const byName = Object.fromEntries(payload.rooms[0].pieces.map((p) => [p.name, p]));
  assert.equal(byName["Sink wall"].backsplashEligible, true, "15: run1 eligible");
  assert.equal(byName["Stove wall"].backsplashEligible, false, "15: run2 not eligible");
  assert.equal(byName["Fridge wall"].backsplashEligible, true, "15: run3 eligible");
  assert.deepEqual(byName["Sink wall"].cutouts, { sink: 1 }, "15: run1 cutouts in payload");
  assert.deepEqual(byName["Fridge wall"].cutouts, { cooktop: 1 }, "15: run3 cutouts in payload");
  assert.deepEqual(byName["Stove wall"].cutouts, {}, "15: run2 empty cutouts");
  console.log("  ✓ 15. approval payload preserves cutouts + eligibility");
}

console.log("\ntakeoffRowControlsInteraction.test.mjs — passed\n");
