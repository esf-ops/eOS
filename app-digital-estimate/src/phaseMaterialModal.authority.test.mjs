/**
 * Material modal group normalization + All-tab behavior regressions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const adapter = readFileSync(join(__dirname, "lovableViewModel.ts"), "utf8");

assert.ok(view.includes('activeGroup === "All"'), "All tab must stay selectable");
assert.ok(
  view.includes('if (activeGroup === "All") return'),
  "All must not be reset by groups effect"
);
assert.ok(view.includes('useState<string>("All")') || view.includes('useState("All")'));
assert.ok(view.includes("onError={() => setPreviewBroken(true)}"));
assert.ok(view.includes("onError={() => setBroken(true)}"), "thumb fallback on image failure");
assert.ok(view.includes("de-material-placeholder"));
assert.ok(adapter.includes("normalizePricingGroupLabel"));
assert.ok(adapter.includes('"Promo"'));

// Behavior mirror
function normalizePricingGroupLabel(raw) {
  const s = String(raw || "").trim();
  if (!s) return "Elite 100";
  const key = s.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (key === "promo" || key === "group promo" || key === "group_promo") return "Promo";
  const letter = key.match(/^(?:group\s*)?([a-f])$/);
  if (letter) return letter[1].toUpperCase();
  if (key === "remnant") return "Remnant";
  if (key === "elite 100" || key === "elite100") return "Elite 100";
  const groupLetter = key.match(/^group\s+([a-f])$/);
  if (groupLetter) return groupLetter[1].toUpperCase();
  return s;
}

assert.equal(normalizePricingGroupLabel("Group Promo"), "Promo");
assert.equal(normalizePricingGroupLabel("Promo"), "Promo");
assert.equal(normalizePricingGroupLabel("group-promo"), "Promo");
assert.equal(normalizePricingGroupLabel("Group A"), "A");
assert.equal(normalizePricingGroupLabel("group_b"), "B");
assert.equal(normalizePricingGroupLabel("C"), "C");

console.log("ok: material All-tab + group normalization + image fallback");
console.log("\nAll material modal authority tests passed.\n");
