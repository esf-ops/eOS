/**
 * Set Scope dirty persist + backsplash/open-edge round-trip regressions.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowSetScopeDirtyPersist.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyTakeoffBacksplashToOfficialRooms,
  applyTakeoffPieceGeometryToOfficialRooms,
  collectImportRoomsFromTakeoffResult
} from "./quoteFlowBacksplash.mjs";
import { applyTakeoffOpenEdgeLfToOfficialRooms } from "./quoteFlowOpenEdge.mjs";
import { summarizeOfficialScope } from "./quoteFlowEstimatesPresenter.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowSetScopeDirtyPersist.test.mjs\n");

{
  const takeoff = {
    rooms: [
      {
        id: "r1",
        name: "Kitchen",
        areas: [
          {
            runs: [
              {
                id: "p1",
                label: "Run A",
                lengthIn: 120,
                depthIn: 25.5,
                quantity: 1,
                backsplashEligible: true,
                finishedEdge: { totalFinishedEdgeLengthIn: 11.65 }
              },
              {
                id: "p2",
                label: "Run B",
                lengthIn: 80,
                depthIn: 25.5,
                quantity: 1,
                backsplashEligible: false,
                finishedEdge: { totalFinishedEdgeLengthIn: 5.88 }
              }
            ]
          }
        ]
      }
    ]
  };

  const official = [
    {
      id: "r1",
      name: "Kitchen",
      includeBacksplash: false,
      backsplashSqft: 0,
      pieces: [
        {
          id: "p1",
          takeoffRunId: "p1",
          name: "Run A",
          lengthIn: 100,
          depthIn: 25.5,
          quantity: 1,
          included: true,
          openEdgeLf: 0
        },
        {
          id: "p2",
          takeoffRunId: "p2",
          name: "Run B",
          lengthIn: 80,
          depthIn: 25.5,
          quantity: 1,
          included: true,
          openEdgeLf: 0
        }
      ]
    }
  ];

  const importRooms = collectImportRoomsFromTakeoffResult(takeoff);
  assert.equal(importRooms[0].pieces.length, 2);
  assert.equal(importRooms[0].pieces[0].backsplashEligible, true);

  const withGeom = applyTakeoffPieceGeometryToOfficialRooms(official, takeoff);
  assert.equal(withGeom[0].pieces[0].lengthIn, 120, "dirty length survives remapper");

  const withBs = applyTakeoffBacksplashToOfficialRooms(withGeom, takeoff);
  assert.equal(withBs[0].includeBacksplash, true, "dirty backsplash inclusion survives");
  assert.ok(Number(withBs[0].backsplashSqft) > 0, "backsplash SF calculated");

  const withEdge = applyTakeoffOpenEdgeLfToOfficialRooms(withBs, takeoff);
  const summary = summarizeOfficialScope({ rooms: withEdge });
  assert.ok(summary.openEdgeLf > 0, "open edge LF aggregate from takeoff");
  assert.ok(summary.backsplashSf > 0, "backsplash SF aggregate from takeoff");
  console.log("ok: dirty length + backsplash + open-edge remappers round-trip");
}

{
  const queue = readFileSync(
    join(root, "app-elite100-quote-flow/src/queue/EstimateQueuePage.tsx"),
    "utf8"
  );
  assert.match(queue, /requestSaveDraftFromIframe/);
  assert.match(queue, /SET_SCOPE_SAVE_REQUIRED_ERROR|SET_SCOPE_IFRAME_REQUIRED_ERROR/);
  assert.match(queue, /Saving takeoff…/);
  assert.doesNotMatch(queue, /takeoffResult:\s*payload\.takeoffResult/);
  assert.doesNotMatch(queue, /If postMessage times out \/ fails, still call Set Scope/);
  assert.doesNotMatch(queue, /payload\?\.takeoffResult \|\| undefined/);
  console.log("ok: Set Scope persists dirty draft before creating official scope");
}

{
  const origins = readFileSync(
    join(root, "app-elite100-quote-flow/src/lib/takeoffPostMessageOrigins.mjs"),
    "utf8"
  );
  assert.match(origins, /requestSaveDraftFromIframe/);
  assert.match(origins, /TAKEOFF_REVIEW_DRAFT_SAVE_FAILED/);
  console.log("ok: Save Draft iframe bridge waits for success/failure");
}

{
  const takeoffUi = readFileSync(
    join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  assert.match(takeoffUi, /TAKEOFF_REVIEW_DRAFT_SAVE_FAILED/);
  assert.match(takeoffUi, /alreadyClean: true/);
  console.log("ok: Review Takeoff emits save success even when already clean");
}

{
  const setScopeSrc = readFileSync(join(__dirname, "quoteFlowSetScope.mjs"), "utf8");
  assert.match(setScopeSrc, /applyTakeoffBacksplashToOfficialRooms/);
  assert.match(setScopeSrc, /applyTakeoffPieceGeometryToOfficialRooms/);
  console.log("ok: afterEnsure remaps backsplash + piece geometry");
}

{
  const pricingUi = readFileSync(
    join(root, "app-elite100-quote-flow/src/estimates/OfficialPricingPanel.tsx"),
    "utf8"
  );
  assert.match(pricingUi, /Pricing &amp; Selections|Pricing & Selections/);
  assert.match(pricingUi, /qf-pricing-starting-selections/);
  assert.match(pricingUi, /qf-pricing-color-name/);
  assert.match(pricingUi, /qf-pricing-edge-profile-token/);
  assert.match(pricingUi, /qf-pricing-room-selections/);
  assert.match(pricingUi, /roomSelections/);
  const estimates = readFileSync(
    join(root, "app-elite100-quote-flow/src/estimates/EstimatesListPage.tsx"),
    "utf8"
  );
  assert.match(estimates, /Pricing & Selections/);
  const pricingSvc = readFileSync(join(__dirname, "quoteFlowPricing.mjs"), "utf8");
  assert.match(pricingSvc, /startingSelections/);
  assert.match(pricingSvc, /roomSelections/);
  assert.match(pricingSvc, /colorTbd/);
  console.log("ok: Pricing & Selections Starting Configuration UX + persistence");
}

console.log("\nquoteFlowSetScopeDirtyPersist.test.mjs: ok\n");
