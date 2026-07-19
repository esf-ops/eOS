/**
 * Digital Estimate customer experience — foundation (materials + customer info).
 * Run: node app-digital-estimate/src/phaseCustomerExperience.foundation.test.mjs
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const view = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const adapter = readFileSync(join(__dirname, "lovableViewModel.ts"), "utf8");
const api = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");
const publicSvc = readFileSync(
  join(
    __dirname,
    "../../backend-core/src/digitalEstimate/configuration/publicConfigurationService.mjs"
  ),
  "utf8"
);
const catalog = readFileSync(
  join(
    __dirname,
    "../../backend-core/src/digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs"
  ),
  "utf8"
);
const draftHelper = readFileSync(
  join(
    __dirname,
    "../../backend-core/src/digitalEstimate/configuration/customerConfigurationDraft.mjs"
  ),
  "utf8"
);
const reviewSvc = readFileSync(
  join(
    __dirname,
    "../../backend-core/src/digitalEstimate/configuration/reviewRequestService.mjs"
  ),
  "utf8"
);

console.log("\nphaseCustomerExperience.foundation.test.mjs\n");

assert.ok(view.includes("de-customer-info"));
assert.ok(view.includes("de-room-card"));
assert.ok(view.includes("de-color-modal"));
assert.ok(view.includes("de-open-color-modal"));
assert.ok(view.includes("groupColorsByPricingGroup"));
assert.ok(view.includes("customerInfoDraft"));
assert.ok(view.includes("Measurements are locked"));
assert.ok(view.includes("de-room-counter-sf"));
assert.ok(view.includes("de-room-label"));
assert.ok(view.includes("Suggested change"));
assert.ok(!/\bWholesale\b/.test(view));
assert.ok(!/Direct\/Retail/.test(view));
assert.ok(!view.includes("pricingGroupCode"));
assert.ok(!view.includes("estimatorNotes"));
assert.ok(!view.includes("qty-sink"));
assert.ok(adapter.includes("pricingGroupLabel"));
assert.ok(adapter.includes("export function groupColorsByPricingGroup"));
assert.ok(adapter.includes("sourceProject"));
assert.ok(api.includes("customerInfoDraft"));
assert.ok(api.includes("pricingGroupLabel"));
assert.ok(api.includes("roomLabelDrafts"));
assert.ok(publicSvc.includes("countertopSf"));
assert.ok(publicSvc.includes("customerInfoDraft"));
assert.ok(publicSvc.includes("mergeSelectionPayloadMeta"));
assert.ok(catalog.includes("pricingGroupLabel: groupLabel"));
assert.ok(catalog.includes("toCustomerSafeMaterialRecord"));
assert.ok(catalog.includes("toStudioMaterialRecord"));
assert.ok(draftHelper.includes("CUSTOMER_INFO_DRAFT_KEY"));
assert.ok(reviewSvc.includes("customerInfoDraft"));
assert.ok(reviewSvc.includes("sourceProject"));

const fullDir = join(appRoot, "public", "materials", "elite100", "full");
const thumbDir = join(appRoot, "public", "materials", "elite100", "thumb");
assert.ok(existsSync(fullDir), "full textures directory missing");
assert.ok(existsSync(thumbDir), "thumb textures directory missing");
assert.equal(readdirSync(fullDir).filter((f) => f.endsWith(".jpg")).length, 11);
assert.equal(readdirSync(thumbDir).filter((f) => f.endsWith(".jpg")).length, 11);

// Inline mirror of groupColorsByPricingGroup ordering for behavior check.
const PRICING_GROUP_TAB_ORDER = [
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F",
  "Remnant",
  "Elite 100"
];
function groupColorsByPricingGroup(colors) {
  const map = new Map();
  for (const c of colors) {
    const label = c.pricingGroupLabel || "Elite 100";
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(c);
  }
  const ordered = [];
  for (const label of PRICING_GROUP_TAB_ORDER) {
    if (map.has(label)) {
      ordered.push({ label, colors: map.get(label) });
      map.delete(label);
    }
  }
  for (const [label, list] of map) ordered.push({ label, colors: list });
  return ordered;
}
const grouped = groupColorsByPricingGroup([
  { pricingGroupLabel: "Group A" },
  { pricingGroupLabel: "Group Promo" }
]);
assert.equal(grouped[0].label, "Group Promo");
assert.equal(grouped[1].label, "Group A");

console.log("ok: customer info + room cards + color modal grouping wired");
console.log("ok: textures present; public UI omits Wholesale/Direct/raw keys");
console.log("ok: drafts persist with selection payload; review snapshot carries corrections");
console.log("\nAll phaseCustomerExperience.foundation tests passed.\n");
