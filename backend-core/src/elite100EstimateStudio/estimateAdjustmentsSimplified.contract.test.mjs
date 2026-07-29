/**
 * Estimate Adjustments / Vanity / waterfall UX simplification contracts.
 * Run: node backend-core/src/elite100EstimateStudio/estimateAdjustmentsSimplified.contract.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCommercialConfiguration } from "./studioCommercialConfiguration.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

console.log("\nestimateAdjustmentsSimplified.contract.test.mjs\n");

{
  const commercial = readFileSync(
    join(
      root,
      "app-elite100-estimate-studio/src/estimateQueue/estimateRecord/CommercialConfigurationSection.tsx"
    ),
    "utf8"
  );
  assert.match(commercial, /Additional Lines|Estimate Adjustments/);
  assert.match(commercial, /Additional charges and credits|Lines/);
  assert.match(commercial, /Account adjustment/);
  assert.match(commercial, /View calculation details/);
  assert.match(commercial, /Add item|Add line/);
  assert.match(commercial, /Add Tear Out/);
  assert.equal(commercial.includes("Add Crane $350"), false);
  assert.equal(commercial.includes('data-testid="eq-add-crane"'), false);
  assert.match(commercial, /Needs one missing decision/);
  assert.match(commercial, /<select[\s\S]*data-testid="eq-vanity-package"/);
  assert.equal(commercial.includes("Eligibility: Review required"), false);
  assert.equal(commercial.includes("Add Crane $350"), false);
  assert.equal(commercial.includes('data-testid="eq-add-crane"'), false);
  assert.match(commercial, /No waterfalls are included\. Add one from an island in Takeoff\./);
  console.log("ok: Estimate Adjustments labels + no Crane preset + vanity select");
}

{
  const commercialCfg = readFileSync(
    join(root, "backend-core/src/elite100EstimateStudio/studioCommercialConfiguration.mjs"),
    "utf8"
  );
  assert.match(
    commercialCfg,
    /Confirm whether the vanity will be templated and installed with the kitchen/
  );
  console.log("ok: vanity actionable eligibility copy in read model");
}

{
  const takeoff = readFileSync(
    join(root, "app-ai-takeoff/src/components/ConsolidatedTakeoffReview.tsx"),
    "utf8"
  );
  assert.match(takeoff, /ctr-add-left-waterfall/);
  assert.match(takeoff, /ctr-add-right-waterfall/);
  assert.match(takeoff, /Add left waterfall/);
  assert.match(takeoff, /Add right waterfall/);
  console.log("ok: contextual island waterfall actions");
}

{
  const estimate = {
    scope: {
      rooms: [
        {
          id: "bath",
          name: "Bathroom",
          roomType: "bath",
          pieces: [
            {
              id: "vanity",
              name: "Vanity Top",
              included: true,
              lengthIn: 37,
              depthIn: 22.5,
              cutouts: [{ type: "vanity_bar_sink", quantity: 1 }]
            }
          ],
          vanityProgram: {
            selectedProgram: "37_S",
            sameTripConfirmed: true,
            additionalTrips: 0,
            includedScope: ["Vanity top", "Included sink"],
            permittedSinkUpgrades: ["Rectangular white"],
            serverPrice: 1850
          }
        },
        {
          id: "kitchen",
          name: "Kitchen",
          pieces: [
            {
              id: "island",
              name: "Kitchen Island",
              included: true,
              lengthIn: 84,
              depthIn: 36
            }
          ],
          configuration: {
            waterfalls: [
              {
                id: "wf-island-left",
                targetPieceId: "island",
                side: "left",
                panelWidthIn: 36,
                legHeightIn: 36,
                quantity: 1,
                customerOptional: true,
                backsidePolish: true,
                miterKey: "2-3in"
              }
            ]
          }
        }
      ],
      customLineItems: [],
      estimateWideAdjustment: { active: true, percentage: 3, reason: "Spahn & Rose account pricing" }
    },
    calculationSnapshot: {
      totals: {
        exactInternalTotal: 4122,
        customerDisplayTotal: 4250
      },
      fabrication: { commercialLines: { customerVisibleExact: 750 } }
    }
  };
  const commercial = buildCommercialConfiguration(estimate);
  assert.equal(commercial.vanityPrograms.length, 1);
  assert.equal(commercial.vanityPrograms[0].physicalFacts.bowlCount, 1);
  assert.equal(commercial.vanityPrograms[0].physicalFacts.sinkOpenings, 1);
  assert.equal(commercial.vanityPrograms[0].selectedProgram, "37_S");
  assert.match(
    commercial.vanityPrograms[0].selectedProgramLabel,
    /37-inch Single-Bowl Vanity Program/
  );
  assert.equal(commercial.waterfalls.length, 1);
  assert.equal(commercial.waterfalls[0].pieceLabel, "Kitchen Island");
  assert.equal(commercial.waterfalls[0].side, "left");
  console.log("ok: Vanity single-bowl derivation + waterfall commercial reference");
}

{
  const needsDecision = buildCommercialConfiguration({
    scope: {
      rooms: [
        {
          id: "bath",
          name: "Bathroom",
          pieces: [
            {
              id: "vanity",
              name: "Vanity Top",
              included: true,
              lengthIn: 37,
              depthIn: 22.5,
              cutouts: [{ type: "vanity_bar_sink", quantity: 1 }]
            }
          ],
          vanityProgram: {}
        }
      ]
    },
    calculationSnapshot: { totals: {} }
  });
  assert.equal(needsDecision.vanityPrograms[0].eligible, null);
  assert.ok(
    needsDecision.vanityPrograms[0].eligibilityReasons.some((r) =>
      /templated and installed with the kitchen/i.test(r)
    )
  );
  console.log("ok: Vanity actionable eligibility");
}

console.log("\nAll estimateAdjustmentsSimplified contracts passed.\n");
