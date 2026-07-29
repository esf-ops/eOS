/**
 * Estimate Options guided workflow — interaction + presentation contracts.
 * Run: node backend-core/src/elite100EstimateStudio/estimateOptionsInteraction.contract.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const commercial = readFileSync(
  join(
    root,
    "app-elite100-estimate-studio/src/estimateQueue/estimateRecord/CommercialConfigurationSection.tsx"
  ),
  "utf8"
);
const workspace = readFileSync(
  join(root, "app-elite100-estimate-studio/src/estimateQueue/AiEstimatorWorkspace.tsx"),
  "utf8"
);
const takeoff = readFileSync(
  join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
  "utf8"
);
const harness = readFileSync(
  join(root, "app-elite100-estimate-studio/src/review/EstimateRecordReviewApp.tsx"),
  "utf8"
);

console.log("\nestimateOptionsInteraction.contract.test.mjs\n");

{
  assert.match(commercial, /Estimate Options/);
  assert.match(commercial, /Configure charges, account pricing, programs, and optional scope\./);
  assert.match(commercial, /Additional charges and credits/);
  assert.match(commercial, /Account adjustment/);
  assert.match(commercial, /Bathroom Vanity Program/);
  assert.match(commercial, /Island waterfalls/);
  assert.equal(commercial.includes(">Additional Lines<"), false);
  assert.equal(commercial.includes("Estimate Adjustments"), false);
  console.log("ok: A structure — Estimate Options four cards");
}

{
  assert.match(commercial, /Updating price…/);
  assert.match(commercial, /Unsaved changes/);
  assert.match(commercial, /Save failed/);
  assert.match(commercial, /showSaveButton/);
  assert.match(commercial, /Try saving again/);
  assert.match(commercial, /isSaved/);
  assert.match(workspace, /saveStatus=\{revisionSaveStatus\}/);
  console.log("ok: A save-state — status vocabulary + Save now gated");
}

{
  assert.match(commercial, /No account adjustment applied\./);
  assert.match(commercial, /Apply adjustment/);
  assert.match(commercial, /not a separate surcharge/);
  assert.match(commercial, /eq-account-adjustment-impact/);
  assert.match(commercial, /Spahn &amp; Rose account pricing/);
  assert.equal(commercial.includes('data-testid="eq-source-manual"'), false);
  console.log("ok: B account adjustment compact card");
}

{
  assert.match(commercial, /Same-trip status needs confirmation\./);
  assert.match(commercial, /Confirm same-trip installation:/);
  assert.match(commercial, /data-testid="eq-vanity-same-trip"/);
  assert.match(commercial, /data-testid="eq-vanity-separate-trip"/);
  assert.equal(commercial.includes("Needs one missing decision"), false);
  assert.match(commercial, /Apply Vanity Program/);
  assert.match(commercial, /Remove program/);
  assert.match(commercial, /Customer choices/);
  assert.match(commercial, /Current program price:/);
  assert.equal(commercial.includes("Package total calculated on save"), false);
  assert.match(commercial, /eq-vanity-permitted-options/);
  assert.match(commercial, /tripConfirmed/);
  console.log("ok: C vanity guided apply + no duplicate trip confirm");
}

{
  assert.match(commercial, /Add left waterfall/);
  assert.match(commercial, /Add right waterfall/);
  assert.match(commercial, /onRequestAddIslandWaterfall/);
  assert.match(commercial, /No waterfall included\./);
  assert.match(workspace, /STUDIO_REQUEST_ADD_ISLAND_WATERFALL/);
  assert.match(takeoff, /STUDIO_REQUEST_ADD_ISLAND_WATERFALL/);
  assert.match(harness, /onRequestAddIslandWaterfall/);
  assert.match(commercial, /Physical scope:/);
  assert.match(commercial, /Commercial choices:/);
  console.log("ok: D waterfall contextual Add actions + Takeoff delegate");
}

{
  assert.match(commercial, /No additional lines have been added\./);
  assert.match(commercial, /More options/);
  assert.match(commercial, /eq-customer-line-preview/);
  assert.match(commercial, /customerPreviewLines\.length > 0/);
  assert.match(commercial, /Add Tear Out/);
  assert.match(commercial, /eq-lines-empty/);
  console.log("ok: E additional lines compact empty + More options");
}

{
  assert.match(commercial, /eq-options-draft-total/);
  assert.match(commercial, /eq-options-display-total/);
  assert.match(commercial, /Current draft estimate/);
  assert.match(commercial, /Customer display total/);
  assert.match(commercial, /eq-option-impact|eq-lines-impact|eq-vanity-impact|eq-waterfall-impact/);
  console.log("ok: live price feedback from props / server values");
}

console.log("\nAll Estimate Options interaction contracts passed.\n");
