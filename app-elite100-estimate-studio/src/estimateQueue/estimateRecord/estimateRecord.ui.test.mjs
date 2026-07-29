/**
 * Persistent Estimate Record — six sections always mounted.
 * Run: node app-elite100-estimate-studio/src/estimateQueue/estimateRecord/estimateRecord.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const workspace = readFileSync(join(root, "src/estimateQueue/AiEstimatorWorkspace.tsx"), "utf8");
const sections = readFileSync(
  join(root, "src/estimateQueue/estimateRecord/EstimateRecordSections.tsx"),
  "utf8"
);
const commercial = readFileSync(
  join(root, "src/estimateQueue/estimateRecord/CommercialConfigurationSection.tsx"),
  "utf8"
);
const takeoff = readFileSync(
  join(root, "../app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
  "utf8"
);

console.log("\nestimateRecord.ui.test.mjs\n");

{
  assert.ok(workspace.includes('data-estimate-record="1"'));
  assert.ok(workspace.includes("EstimateRecordHeader"));
  assert.ok(workspace.includes("eq-ai-takeoff-surface"));
  assert.ok(workspace.includes("VerifiedEstimateSection"));
  assert.ok(workspace.includes("CommercialConfigurationSection"));
  assert.ok(workspace.includes("DigitalEstimateSection"));
  assert.ok(workspace.includes("EstimateRevisionHistory"));
  assert.equal(/<ManualPhysicalScopeEditor/.test(workspace), false);
  assert.equal(/eq-section-tabs/.test(workspace), false);
  console.log("ok: six persistent sections mounted; no legacy tabs/editor");
}

{
  for (const id of [
    "eq-estimate-record-header",
    "eq-verified-estimate-section",
    "eq-digital-estimate-section",
    "eq-commercial-configuration-section",
    "eq-revision-history-section",
    "eq-custom-line-items-editor",
    "eq-estimate-percentage-adjustment",
    "eq-vanity-program-configuration",
    "eq-waterfall-configuration",
    "eq-save-commercial-changes",
    "eq-publish-digital-estimate",
    "eq-create-measurement-revision"
  ]) {
    assert.ok(
      workspace.includes(id) || sections.includes(id) || commercial.includes(id),
      `missing ${id}`
    );
  }
  assert.ok(commercial.includes("Add Tear Out") || commercial.includes("tearout"));
  assert.ok(sections.includes('type="button"'));
  assert.ok(sections.includes("e.preventDefault()"));
  console.log("ok: commercial + digital estimate controls present; publish is type=button");
}

{
  assert.ok(takeoff.includes("urlWorkspace.mode === \"readonly\""));
  assert.ok(takeoff.includes("if (urlWorkspace.mode === \"readonly\") return;"));
  console.log("ok: Takeoff beforeunload skipped in readonly (inline publish safety)");
}

{
  assert.ok(workspace.includes("saveCommercial"));
  assert.ok(workspace.includes("estimateWideAdjustment"));
  assert.ok(workspace.includes("customLineItems"));
  assert.ok(workspace.includes("/calculate"));
  console.log("ok: commercial save recalculates via server");
}

console.log("\nAll estimateRecord UI tests passed.\n");
