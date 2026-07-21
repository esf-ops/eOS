/**
 * Final-row Takeoff worksheet interaction regression.
 *
 * Hosted bug: rows 1–3 Backsplash checkboxes toggled fine, row 4 (the last
 * visible row) could not be toggled. Root cause: the sticky bottom action bar
 * (.ctr-actions, position: sticky; bottom: 0) painted a full-width strip over
 * the last row; its flex-gap/padding regions intercepted clicks meant for the
 * final row's controls. Fix: pointer-events: none on the bar container with
 * pointer-events: auto restored on its children, plus scroll room after the
 * last table row.
 *
 * Run: node app-ai-takeoff/src/lib/takeoffFinalRowInteraction.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flattenPieces, patchRun } from "./consolidatedWorksheetRows.mjs";
import { ensureUniqueTakeoffIdentity } from "../../../backend-core/src/takeoff/takeoffAuthoritativeResult.mjs";
import { normalizeTakeoffBacksplashEligibility } from "../../../backend-core/src/takeoff/takeoffBacksplashEligibility.mjs";
import { normalizeTakeoffCutoutScope } from "../../../backend-core/src/takeoff/takeoffCutoutScope.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(join(root, "components/ConsolidatedTakeoffReview.tsx"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");

console.log("\ntakeoffFinalRowInteraction.test.mjs\n");

function heal(takeoff) {
  const unique = ensureUniqueTakeoffIdentity(takeoff).takeoff;
  return normalizeTakeoffCutoutScope(
    normalizeTakeoffBacksplashEligibility(unique).takeoff
  ).takeoff;
}

function fourRunDraft() {
  return heal({
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
              { id: "run-1", label: "Sink wall", lengthIn: 100, depthIn: 25.5, pieceType: "counter", backsplashEligible: false },
              { id: "run-2", label: "Stove wall", lengthIn: 80, depthIn: 25.5, pieceType: "counter", backsplashEligible: false },
              { id: "run-3", label: "Fridge wall", lengthIn: 60, depthIn: 25.5, pieceType: "counter", backsplashEligible: false },
              { id: "run-4", label: "Island", lengthIn: 72, depthIn: 40, pieceType: "counter", backsplashEligible: false }
            ]
          }
        ]
      }
    ]
  });
}

function toggleRow(draft, runId) {
  return patchRun(
    draft,
    { roomId: "room-kitchen", areaId: "area-main", runId },
    { backsplashEligible: true, backsplashEligibilitySource: "estimator_confirmed" }
  );
}

// ── 1. first-row backsplash checkbox works ────────────────────────────────────
{
  const rows = flattenPieces(toggleRow(fourRunDraft(), "run-1"), new Set());
  assert.deepEqual(rows.map((r) => r.backsplashEligible), [true, false, false, false]);
  console.log("  ✓ 1. first-row backsplash checkbox works");
}

// ── 2. middle-row checkbox works ──────────────────────────────────────────────
{
  const rows = flattenPieces(toggleRow(fourRunDraft(), "run-2"), new Set());
  assert.deepEqual(rows.map((r) => r.backsplashEligible), [false, true, false, false]);
  console.log("  ✓ 2. middle-row checkbox works");
}

// ── 3. final-row checkbox works ───────────────────────────────────────────────
{
  const rows = flattenPieces(toggleRow(fourRunDraft(), "run-4"), new Set());
  assert.deepEqual(rows.map((r) => r.backsplashEligible), [false, false, false, true]);
  console.log("  ✓ 3. final-row checkbox works");
}

// ── 4. final-row click is not intercepted by the sticky action bar ────────────
{
  // The bar itself must be click-transparent…
  assert.ok(
    /\.ctr-actions\s*\{[\s\S]*?pointer-events:\s*none/.test(styles),
    "4: sticky action bar container is pointer-events none"
  );
  // …while its buttons/messages stay interactive.
  assert.ok(
    /\.ctr-actions\s*>\s*\*\s*\{[\s\S]*?pointer-events:\s*auto/.test(styles),
    "4: action bar children restore pointer-events"
  );
  // No opaque full-width background painting over the final row.
  assert.ok(
    /\.ctr-actions\s*\{[\s\S]*?background:\s*transparent/.test(styles),
    "4: action bar strip is transparent"
  );
  // The last row can scroll clear of the sticky bar.
  assert.ok(
    /\.ctr-table\s*\{[\s\S]*?margin-bottom:\s*56px/.test(styles),
    "4: scroll room after final row"
  );
  console.log("  ✓ 4. final-row click is not intercepted");
}

// ── 5. final-row Space key toggles (native checkbox, no custom switch) ────────
{
  const idx = component.indexOf('data-testid="ctr-backsplash-eligible"');
  const block = component.slice(Math.max(0, idx - 400), idx + 400);
  assert.ok(block.includes('type="checkbox"'), "5: native checkbox");
  assert.ok(!block.includes('role="switch"'), "5: no custom switch");
  assert.ok(!/tabIndex=\{\s*-1\s*\}/.test(block), "5: in tab order");
  console.log("  ✓ 5. final-row Space key toggles via native checkbox");
}

// ── 6. all control ids are unique across all four rows ───────────────────────
{
  const rows = flattenPieces(fourRunDraft(), new Set());
  const ids = [];
  for (const row of rows) {
    const key = `${row.roomId}-${row.areaId}-${row.runId}`;
    ids.push(`ctr-bs-${key}`, `ctr-incl-${key}`, `ctr-cutouts-${key}`);
  }
  assert.equal(new Set(ids).size, ids.length, "6: no duplicate ids");
  assert.ok(
    component.includes("const rowControlKey = `${row.roomId}-${row.areaId}-${row.runId}`"),
    "6: ids built from full row identity"
  );
  console.log("  ✓ 6. all control ids are unique");
}

// ── 7. no final-child CSS blocks pointer events ───────────────────────────────
{
  assert.ok(
    !/last-child[\s\S]{0,160}pointer-events:\s*none/.test(styles),
    "7: no :last-child pointer-events none"
  );
  assert.ok(
    !/tr:last-child[\s\S]{0,160}(display:\s*none|visibility:\s*hidden)/.test(styles),
    "7: no hidden final row"
  );
  console.log("  ✓ 7. no final-child CSS blocks pointer events");
}

// ── 8. no Actions/Notes cell overlaps the final row's controls ────────────────
{
  assert.ok(
    /\.ctr-table th, \.ctr-table td\s*\{[\s\S]*?overflow:\s*hidden/.test(styles),
    "8: cells contain overflow by default"
  );
  assert.ok(
    !/\.ctr-col-actions[\s\S]{0,200}position:\s*absolute/.test(styles),
    "8: actions column not absolutely positioned"
  );
  assert.ok(
    !/\.ctr-col-notes[\s\S]{0,200}position:\s*absolute/.test(styles),
    "8: notes column not absolutely positioned"
  );
  console.log("  ✓ 8. no Actions/Notes cell overlaps final row");
}

// ── 9. save/reload preserves final-row state ──────────────────────────────────
{
  const draft = toggleRow(fourRunDraft(), "run-4");
  const reloaded = heal(structuredClone(draft));
  const rows = flattenPieces(reloaded, new Set());
  assert.equal(rows.find((r) => r.runId === "run-4").backsplashEligible, true);
  assert.deepEqual(
    rows.map((r) => r.backsplashEligible),
    [false, false, false, true],
    "9: only final row true after reload"
  );
  console.log("  ✓ 9. save/reload preserves final-row state");
}

// ── 10. row identity remains unique (even after duplicate-id normalization) ───
{
  const dup = heal({
    schemaVersion: "1.0",
    status: "draft",
    rooms: [
      {
        id: "room-1",
        name: "Kitchen",
        areas: [
          {
            id: "area-1",
            label: "Main",
            runs: [
              { id: "run-x", label: "A", lengthIn: 50, depthIn: 25 },
              { id: "run-x", label: "B", lengthIn: 60, depthIn: 25 },
              { id: "run-x", label: "C", lengthIn: 70, depthIn: 25 },
              { id: "run-x", label: "D", lengthIn: 80, depthIn: 25 }
            ]
          }
        ]
      }
    ]
  });
  const rows = flattenPieces(dup, new Set());
  const keys = rows.map((r) => r.key);
  assert.equal(new Set(keys).size, 4, "10: 4 unique row keys after healing");
  console.log("  ✓ 10. row identity remains unique");
}

console.log("\ntakeoffFinalRowInteraction.test.mjs — passed\n");
