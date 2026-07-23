/**
 * Command Center UI wiring regressions (source-level; no browser).
 * Run: node app-elite100-estimate-studio/src/estimateQueue/estimateCommandCenter.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const app = readFileSync(join(root, "app-elite100-estimate-studio/src/StudioApp.tsx"), "utf8");
const page = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateCommandCenterPage.tsx"),
  "utf8"
);
const legacy = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateQueuePage.tsx"),
  "utf8"
);
const css = readFileSync(join(root, "app-elite100-estimate-studio/src/styles.css"), "utf8");

console.log("\nestimateCommandCenter.ui.test.mjs\n");

// 13. Studio defaults to Command Center
assert.ok(app.includes('"command-center"'));
assert.ok(app.includes('useState<\n    | "command-center"') || app.includes('"command-center"'));
assert.match(app, /useState<[\s\S]*?>\("command-center"\)/);
assert.ok(app.includes("EstimateCommandCenterPage"));
console.log("ok: Studio defaults to Command Center");

// 14. Legacy queue remains accessible
assert.ok(app.includes("EstimateQueuePage"));
assert.ok(app.includes("studio-nav-legacy-queue") || app.includes("Legacy queue"));
assert.ok(app.includes('mainNav === "estimate-queue"'));
assert.ok(legacy.includes("estimate-queue-dashboard"));
assert.ok(page.includes("ecc-legacy-queue"));
console.log("ok: legacy queue remains accessible");

// Primary action uses existing openTarget routes
assert.ok(page.includes("nextActionRoute"));
assert.ok(page.includes("onOpenEstimate(item.estimateRef"));
assert.ok(page.includes('openTarget: item.nextActionRoute'));
console.log("ok: primary action uses existing workspace routes");

// Read-only list surface (no approve/publish/assign writes in Command Center page)
assert.equal(page.includes("/approve"), false);
assert.equal(page.includes("/publish"), false);
assert.equal(page.includes("assignEstimateQueueCase"), false);
// Soft-open record is existing authorized action when user clicks primary/open
assert.ok(page.includes("recordEstimateQueueOpened"));
console.log("ok: Command Center does not add approve/publish/assign writes");

// Empty / loading / retry
assert.ok(page.includes("ecc-empty"));
assert.ok(page.includes("ecc-loading"));
assert.ok(page.includes("ecc-retry"));
assert.ok(page.includes("You’re caught up") || page.includes("You're caught up") || page.includes("caught up"));
console.log("ok: empty/loading/retry states present");

// Accessibility / responsive hooks
assert.ok(page.includes('aria-label="Estimate summary"'));
assert.ok(page.includes('role="tablist"'));
assert.ok(page.includes("Escape"));
assert.ok(css.includes(".ecc-summary"));
assert.ok(css.includes("@media (max-width: 768px)"));
assert.ok(css.includes(".ecc-drawer"));
console.log("ok: a11y + responsive styles present");

// Session filter persistence
assert.ok(page.includes("saveCommandCenterSessionPrefs"));
assert.ok(page.includes("loadCommandCenterSessionPrefs"));
console.log("ok: session filter persistence wired");

// Needs attention default
assert.ok(page.includes('"needs_attention"') || page.includes("needs_attention"));
assert.ok(page.includes("My work"));
console.log("ok: Needs attention + My work defaults present");

console.log("\nAll estimateCommandCenter UI wiring tests passed.\n");
