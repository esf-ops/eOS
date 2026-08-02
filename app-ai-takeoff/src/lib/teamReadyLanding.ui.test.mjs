/**
 * Team-ready AI Takeoff Lab landing — UI wiring tests (no browser).
 * Run: node app-ai-takeoff/src/lib/teamReadyLanding.ui.test.mjs
 *
 * Asserts the standalone head presents: title, helper text, section nav,
 * plain-English job statuses, empty states, and safety language — and does
 * NOT reach into Studio V2 takeoff import behavior.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "TakeoffLabApp.tsx"), "utf8");
const inbox = readFileSync(join(root, "components/TakeoffRunInbox.tsx"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");

console.log("\nteamReadyLanding.ui.test.mjs\n");

// 1. Page title is "AI Takeoff Lab" in topbar + hero heading.
assert.ok(app.includes('appName="AI Takeoff Lab"'), "topbar appName");
assert.ok(app.includes('"AI Takeoff Lab"'), "hero heading");

// 2. Helper text (exact product copy).
assert.ok(
  app.includes("Review AI-generated measurements before they are used in estimates."),
  "helper sentence 1"
);
assert.ok(
  app.includes("AI Takeoff owns measurement evidence only; Studio V2 owns pricing and publishing."),
  "helper sentence 2"
);

// 3. Safety language — review required + not the pricing/publishing owner.
assert.ok(app.includes("AI measurements require review before production use."), "safety review");
assert.ok(app.includes("Pricing and publishing are not"), "safety pricing/publishing");

// 4. Section navigation with the four labels.
assert.ok(app.includes("takeoff-section-nav"), "section nav present");
assert.ok(app.includes("Takeoff Jobs"), "Jobs section label");
assert.ok(app.includes("Upload / Start Takeoff"), "Upload section label");
assert.ok(app.includes("Review Workbench"), "Review section label");
assert.ok(app.includes("Approved / History"), "Approved section label");

// 5. Section navigation is driven by a real, gated state — not always shown.
assert.ok(app.includes("effectiveSection"), "effectiveSection derived");
assert.ok(app.includes("goToLabSection"), "section nav handler");
assert.ok(app.includes("const inReview ="), "review context derived from real state");

// 6. Job list uses the plain-English status mapper (no raw status tokens rendered).
assert.ok(inbox.includes("deriveTakeoffJobDisplayStatus"), "inbox uses status mapper");
assert.ok(inbox.includes("takeoffJobStatusChipClass"), "inbox uses chip mapper");
assert.ok(!inbox.includes("{job.status}"), "inbox must not render raw job.status");
assert.ok(!inbox.includes("{job.reviewStatus}"), "inbox must not render raw reviewStatus");

// 7. Approved/history is backed by the existing review_status query, not new data.
assert.ok(inbox.includes("review_status: reviewStatusFilter"), "approved filter via existing query");
assert.ok(app.includes('effectiveSection === "approved" ? "approved" : undefined'), "approved filter wired");

// 8. Clear empty states (no invented rows).
assert.ok(inbox.includes("No takeoff jobs yet. Upload a plan file to begin."), "empty jobs copy");
assert.ok(inbox.includes("No approved takeoffs yet."), "empty approved copy");

// 9. Styles exist for the new landing chrome.
assert.ok(styles.includes(".takeoff-section-nav"), "section nav styles");
assert.ok(styles.includes(".takeoff-page-helper"), "helper styles");
assert.ok(styles.includes(".takeoff-page-safety"), "safety styles");
assert.ok(styles.includes(".takeoff-inbox-chip--neutral"), "neutral chip style");

// 10. Guardrails: this head must not touch Studio V2 takeoff import behavior.
assert.ok(!app.includes("studioV2TakeoffImport"), "no Studio V2 import coupling");
assert.ok(!app.includes("simplified-publish"), "no publish coupling");
assert.ok(!app.includes("refresh-from-takeoff"), "no Studio refresh coupling");

console.log("  ✓ title, helper, sections, plain-English statuses, empty + safety copy");
console.log("\nteamReadyLanding.ui.test.mjs — passed\n");
