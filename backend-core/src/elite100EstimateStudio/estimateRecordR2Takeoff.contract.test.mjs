/**
 * R2 Takeoff readiness, waterfall ownership, and lifecycle messaging contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TAKEOFF_REVIEW_READY,
  summarizeTakeoffDraftForReady,
  estimateWaterfallServerPrice,
  localReviewStorageKey
} from "../../../app-ai-takeoff/src/lib/takeoffReviewReadyContract.mjs";
import { buildLocalReviewTakeoffDraft } from "../../../app-ai-takeoff/src/lib/localReviewTakeoffFixture.mjs";
import { approveButtonLabel } from "../../../app-ai-takeoff/src/lib/consolidatedApproveClick.mjs";
import { buildScenario } from "../../../app-elite100-estimate-studio/src/review/munstermanFixtures.mjs";

console.log("\nestimateRecordR2Takeoff.contract.test.mjs\n");

{
  assert.equal(TAKEOFF_REVIEW_READY, "TAKEOFF_REVIEW_READY");
  const draft = buildLocalReviewTakeoffDraft({ withWaterfall: true, sinkWallLengthIn: 120 });
  const summary = summarizeTakeoffDraftForReady(draft);
  assert.equal(summary.roomCount, 2);
  assert.equal(summary.pieceCount, 5);
  assert.equal(summary.waterfalls.length, 1);
  assert.equal(summary.waterfalls[0].pieceLabel, "Kitchen Island");
  assert.equal(summary.waterfalls[0].side, "left");
  assert.equal(summary.waterfalls[0].panelWidthIn, 36);
  assert.equal(summary.waterfalls[0].panelHeightIn, 36);
  console.log("ok: Takeoff ready summary + R2 waterfall physical facts");
}

{
  const base = estimateWaterfallServerPrice({
    panelWidthIn: 36,
    panelHeightIn: 36,
    quantity: 1,
    miterKey: "2-3in",
    backsidePolish: true
  });
  const taller = estimateWaterfallServerPrice({
    panelWidthIn: 36,
    panelHeightIn: 42,
    quantity: 1,
    miterKey: "2-3in",
    backsidePolish: true
  });
  assert.ok(taller > base, "taller Takeoff panel must increase server price");
  console.log("ok: waterfall dimension-to-price");
}

{
  assert.equal(
    approveButtonLabel({ approveStatus: "idle", advisoryCount: 0, blockingCount: 0, isRevisionDraft: true }),
    "Approve Revised Estimate"
  );
  assert.equal(localReviewStorageKey("local-review-takeoff", 2), "eliteos-local-review-takeoff:local-review-takeoff:r2");
  console.log("ok: Approve Revised Estimate + storage key");
}

{
  const draft = buildScenario("draft");
  assert.equal(draft.commercial.scopeDetection.vanityDetected, true);
  assert.equal(draft.commercial.scopeDetection.islandDetected, true);
  assert.equal(draft.commercial.scopeDetection.waterfallGeometryPresent, false);
  assert.equal(draft.measurementsApproved, false);
  const commercialSrc = readFileSync(
    new URL(
      "../../../app-elite100-estimate-studio/src/estimateQueue/estimateRecord/CommercialConfigurationSection.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(commercialSrc, /No waterfalls are included\. Add one from an island in Takeoff/);
  assert.match(commercialSrc, /Bathroom vanity detected\. Approve measurements/);
  assert.match(commercialSrc, /eq-waterfall-physical-facts/);
  assert.match(commercialSrc, /Physical scope from Takeoff/);
  assert.equal(commercialSrc.includes('data-testid="eq-add-waterfall"'), false);
  assert.equal(commercialSrc.includes('<input\n                      type="number"\n                      disabled={!props.editable}\n                      value={w.panelWidthIn}'), false);
  assert.match(commercialSrc, /<dd data-testid="eq-waterfall-width">/);
  console.log("ok: pre-approval messaging + commercial does not edit width/height");
}

{
  const r2 = buildScenario("r2");
  assert.match(r2.takeoffQuery, /isRevisionDraft=1/);
  assert.match(r2.takeoffQuery, /withWaterfall=1/);
  assert.match(r2.takeoffQuery, /sinkWallLengthIn=120/);
  assert.equal(r2.takeoffMode, "editable");
  assert.equal(r2.commercial.waterfalls[0].id, "wf-island-left");
  assert.equal(r2.commercial.scopeDetection.waterfallGeometryPresent, true);
  console.log("ok: R2 editable Takeoff query + waterfall reference id");
}

{
  const takeoffSrc = readFileSync(
    new URL("../../../app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx", import.meta.url),
    "utf8"
  );
  assert.match(takeoffSrc, /TAKEOFF_REVIEW_READY/);
  assert.match(takeoffSrc, /saveLocalReviewDraft/);
  assert.match(takeoffSrc, /ctr-waterfall-physical-scope/);
  assert.match(takeoffSrc, /ctr-waterfall-height/);
  const shot = readFileSync(
    new URL(
      "../../../app-elite100-estimate-studio/scripts/runEstimateRecordVisualProof.mjs",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(shot, /estimate-record-commercial-controls-v4/);
  assert.match(shot, /TAKEOFF_REVIEW_READY/);
  assert.match(shot, /refusing screenshot/);
  assert.match(shot, /requireRevisedApprove/);
  console.log("ok: readiness contract + screenshot blank-iframe failure guards");
}

console.log("\nAll estimateRecordR2Takeoff contracts passed.\n");
