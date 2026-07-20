/**
 * Elite 100 Estimate Studio + Digital Estimate production polish phase — regression tests.
 * Covers: room-grouped customer breakdown rendering, and Studio diagnostics disclosure cleanup.
 *
 * Run: node --experimental-strip-types src/phaseProductionPolish.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  groupBreakdownLinesByRoom,
  buildOriginalBreakdown,
} from "./customerEstimateBreakdown.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\nphaseProductionPolish.ui.test.mjs\n");

// --- 1. Room grouping preserves first-seen room order and buckets project lines last ---
{
  const grouped = groupBreakdownLinesByRoom([
    { key: "a", label: "Sink", amount: 500, amountLabel: "$500", roomName: "Kitchen", category: "Product" },
    { key: "b", label: "Project note", amount: null, amountLabel: "", roomName: null, category: "Custom" },
    { key: "c", label: "Faucet", amount: 300, amountLabel: "$300", roomName: "Kitchen", category: "Product" },
    { key: "d", label: "Sink cutout", amount: 150, amountLabel: "$150", roomName: "Powder", category: "Cutout" },
  ]);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].roomName, "Kitchen");
  assert.equal(grouped[0].lines.length, 2);
  assert.equal(grouped[1].roomName, "Powder");
  assert.equal(grouped[2].roomName, null);
  assert.equal(grouped[2].lines[0].key, "b");
  console.log("ok: groupBreakdownLinesByRoom orders named rooms first, project lines last");
}

// --- 2. Grouping never drops or duplicates lines ---
{
  const lines = [
    { key: "1", label: "A", amount: 1, amountLabel: "$1", roomName: "Kitchen", category: null },
    { key: "2", label: "B", amount: 2, amountLabel: "$2", roomName: "Bath", category: null },
    { key: "3", label: "C", amount: 3, amountLabel: "$3", roomName: "Kitchen", category: null },
  ];
  const grouped = groupBreakdownLinesByRoom(lines);
  const flat = grouped.flatMap((g) => g.lines);
  assert.equal(flat.length, lines.length);
  assert.deepEqual(
    flat.map((l) => l.key).sort(),
    lines.map((l) => l.key).sort()
  );
  console.log("ok: room grouping is lossless (no dropped/duplicated lines)");
}

// --- 3. Empty input is handled safely ---
{
  assert.deepEqual(groupBreakdownLinesByRoom([]), []);
  console.log("ok: empty breakdown lines produce no groups");
}

// --- 4. ConfigurationView renders breakdown lines grouped by room (no flat unstructured render) ---
{
  const viewSrc = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
  assert.ok(viewSrc.includes("groupBreakdownLinesByRoom"));
  assert.ok(viewSrc.includes("de-breakdown-room-group"));
  assert.ok(viewSrc.includes("de-breakdown-room-heading"));
  console.log("ok: ConfigurationView renders room-grouped breakdown sections");
}

// --- 5. Original breakdown never surfaces square footage even when present in legacy summary lines ---
{
  const view = buildOriginalBreakdown({
    rooms: [
      {
        name: "Kitchen",
        materialLabel: "Carrara Classic",
        colorLabel: null,
        summaryLines: ["45.2 SF countertop", "Eased edge"],
      },
    ],
    lineItems: [{ label: "Sink cutout", amount: 150 }],
    totals: { estimatedProjectTotal: 7000 },
  });
  const joined = view.lines.map((l) => l.label).join(" | ");
  assert.ok(!/\d+(\.\d+)?\s*sf\b/i.test(joined), `unexpected SF token in: ${joined}`);
  assert.ok(joined.includes("Eased edge"));
  console.log("ok: original breakdown filters square-footage tokens from legacy summary lines");
}

// --- 6. Studio Digital Estimate panel gates raw link-recovery diagnostics behind a disclosure ---
{
  const panelPath = join(
    __dirname,
    "../../app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx"
  );
  const panelSrc = readFileSync(panelPath, "utf8");
  assert.ok(panelSrc.includes("Troubleshooting details"), "expected a collapsed troubleshooting disclosure");
  assert.ok(
    /<details[^>]*data-testid="eq-de-link-diagnostics"/.test(panelSrc),
    "expected raw diagnostics wired inside a <details> element, not rendered unconditionally"
  );
  assert.ok(
    panelSrc.includes("could not be recovered automatically") ||
      panelSrc.includes("recovery check passed"),
    "expected a plain-language status line above the raw diagnostic fields"
  );
  console.log("ok: Studio link diagnostics are hidden behind a Troubleshooting details disclosure");
}

console.log("\nAll phaseProductionPolish.ui.test.mjs checks passed.\n");
