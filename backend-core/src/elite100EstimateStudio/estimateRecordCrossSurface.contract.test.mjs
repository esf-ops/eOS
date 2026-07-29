/**
 * Cross-surface Estimate Record contracts: Takeoff ↔ Verified ↔ revision ↔ commercial ↔ DE.
 */
import assert from "node:assert/strict";
import {
  buildAiEstimatorSummary,
  buildVerifiedRoomsFromEstimate
} from "./studioAiEstimatorSummary.mjs";
import { buildCommercialConfiguration } from "./studioCommercialConfiguration.mjs";
import {
  BASE_ROOM_EXACT,
  CANONICAL_OPENINGS,
  EXPECTED_COUNTERTOP_SF,
  EXPECTED_PIECE_SF,
  BACKSPLASH_SF,
  buildScenario,
  deriveTakeoffCountertopSf,
  recalculateCommercialAuthority,
  vanityPackageLabel
} from "../../../app-elite100-estimate-studio/src/review/munstermanFixtures.mjs";

console.log("\nestimateRecordCrossSurface.contract.test.mjs\n");

function islandEstimate() {
  return {
    revision: 1,
    scope: {
      addOns: { "qty-sink": 1, "qty-bar": 1, "qty-cook": 1, "qty-outlet": 0 },
      edgeEligibleLinearFeet: 26.25,
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          included: true,
          backsplashSqft: 7.72,
          pieces: [
            {
              id: "left",
              name: "Left run",
              pieceType: "counter",
              lengthIn: 69.5,
              depthIn: 36,
              quantity: 1,
              included: true
            },
            {
              id: "back",
              name: "Back run",
              pieceType: "counter",
              lengthIn: 112.5,
              depthIn: 25.5,
              quantity: 1,
              included: true
            },
            {
              id: "sink",
              name: "Sink wall",
              pieceType: "counter",
              lengthIn: 96,
              depthIn: 24,
              quantity: 1,
              included: true,
              cutouts: [
                { type: "kitchen_sink", quantity: 1 },
                { type: "cooktop", quantity: 1 }
              ]
            },
            {
              id: "island",
              name: "Kitchen Island",
              pieceType: "counter",
              lengthIn: 96,
              depthIn: 36,
              quantity: 1,
              included: true
            }
          ]
        },
        {
          id: "bath",
          name: "Bathroom",
          included: true,
          backsplashSqft: 1.03,
          addOns: { "qty-bar": 1 },
          pieces: [
            {
              id: "vanity",
              name: "Vanity Top",
              pieceType: "counter",
              lengthIn: 37,
              depthIn: 22.5,
              quantity: 1,
              included: true,
              cutouts: [{ type: "vanity_bar_sink", quantity: 1 }]
            }
          ],
          vanityProgram: {
            selectedProgram: "37_S",
            bowlCount: 1,
            serverPrice: 1850,
            includedScope: [
              "Vanity top",
              "Included backsplash",
              "1 vanity/bar sink opening",
              "Included sink configuration"
            ],
            permittedSinkUpgrades: ["Oval bisque", "Rectangular white", "Rectangular bisque"]
          }
        }
      ]
    },
    calculation: {
      totals: {
        baseExactTotal: 4122,
        commercialAdjustmentExact: 156.66,
        adjustedExactTotal: 5278.66,
        exactTotal: 5278.66,
        accountAdjustment: 156.66,
        customerDisplayTotal: 5280,
        customerConfiguredExactTotal: 5278.66,
        customerConfiguredDisplayTotal: 5280
      },
      fabrication: { edge: { finalLf: 26.25 } },
      warnings: [],
      unresolvedItems: []
    },
    approval: { approvedAt: "2026-07-29T14:00:00.000Z" }
  };
}

{
  assert.equal(deriveTakeoffCountertopSf(96), EXPECTED_COUNTERTOP_SF);
  assert.equal(EXPECTED_COUNTERTOP_SF, 83.08);
  assert.equal(BACKSPLASH_SF, 8.75);
  console.log("ok: Takeoff fixture countertop SF = 83.08");
}

{
  const est = islandEstimate();
  const rooms = buildVerifiedRoomsFromEstimate(est);
  const kitchen = rooms.find((r) => r.name === "Kitchen");
  const bath = rooms.find((r) => r.name === "Bathroom");
  assert.ok(kitchen.pieces.some((p) => p.name === "Kitchen Island"));
  assert.equal(
    kitchen.pieces.find((p) => p.name === "Kitchen Island").squareFeet,
    EXPECTED_PIECE_SF["Kitchen Island"]
  );
  assert.equal(kitchen.countertopSf, 77.3);
  assert.equal(bath.countertopSf, EXPECTED_PIECE_SF["Vanity Top"]);

  const summary = buildAiEstimatorSummary({ estimate: est });
  assert.equal(summary.measurements.countertopSf, EXPECTED_COUNTERTOP_SF);
  assert.equal(summary.measurements.backsplashSf, BACKSPLASH_SF);

  for (const [name, sf] of Object.entries(EXPECTED_PIECE_SF)) {
    const piece = summary.rooms.flatMap((r) => r.pieces).find((p) => p.name === name);
    assert.ok(piece, `missing piece ${name}`);
    assert.equal(piece.squareFeet, sf, `${name} SF`);
    assert.ok(piece.squareFeet > 0, `${name} must be nonzero`);
  }

  assert.equal(summary.measurements.openingsByType.kitchenSink, 1);
  assert.equal(summary.measurements.openingsByType.vanityBarSink, 1);
  assert.equal(summary.measurements.openingsByType.cooktop, 1);
  assert.equal(summary.measurements.openingsByType.outlet, 0);

  assert.equal(summary.pricing.baseExactTotal, 4122);
  assert.equal(summary.pricing.commercialAdjustmentExact, 156.66);
  assert.equal(summary.pricing.adjustedExactTotal, 5278.66);
  assert.equal(summary.pricing.customerDisplayTotal, 5280);
  assert.equal(summary.pricing.customerConfiguredDisplayTotal, 5280);
  console.log("ok: Kitchen Island inclusion + piece SF + openings + named totals");
}

{
  const scenario = buildScenario("approved");
  assert.equal(scenario.aiSummary.measurements.countertopSf, EXPECTED_COUNTERTOP_SF);
  assert.equal(scenario.revisions[0].countertopSf, EXPECTED_COUNTERTOP_SF);
  assert.deepEqual(scenario.aiSummary.measurements.openingsByType, {
    ...CANONICAL_OPENINGS
  });
  assert.equal(scenario.aiSummary.pricing.customerDisplayTotal, 5280);
  assert.equal(scenario.commercial.estimateAdjustment.customerDisplayTotal, 5280);
  assert.equal(scenario.commercial.estimateAdjustment.baseExactTotal, BASE_ROOM_EXACT);
  assert.equal(scenario.commercial.estimateAdjustment.eligibleBasisExact, 5222);
  assert.equal(scenario.commercial.estimateAdjustment.exactAdjustment, 156.66);
  assert.equal(scenario.commercial.estimateAdjustment.adjustedExactTotal, 5278.66);
  const island = scenario.aiSummary.rooms
    .flatMap((r) => r.pieces)
    .find((p) => p.name === "Kitchen Island");
  assert.ok(island);
  assert.equal(island.squareFeet, 24);
  console.log("ok: harness Takeoff=Verified=revision snapshot SF 83.08");
}

{
  const authority = recalculateCommercialAuthority({
    customLines: [
      {
        id: "tear",
        description: "Tear Out",
        quantity: 1,
        unitPriceExact: 750,
        customerVisible: true,
        percentageEligible: true,
        commercialRole: "customer_charge"
      },
      {
        id: "crane",
        description: "Crane",
        quantity: 1,
        unitPriceExact: 350,
        customerVisible: true,
        percentageEligible: true,
        commercialRole: "customer_charge"
      },
      {
        id: "credit",
        description: "Courtesy credit",
        quantity: 1,
        unitPriceExact: 100,
        customerVisible: true,
        percentageEligible: false,
        commercialRole: "credit"
      },
      {
        id: "internal",
        description: "Internal",
        quantity: 1,
        unitPriceExact: 200,
        customerVisible: false,
        percentageEligible: false,
        commercialRole: "internal_only"
      }
    ],
    percentage: 3,
    active: true,
    vanityApplied: true
  });
  assert.equal(authority.baseExactTotal, 4122);
  assert.equal(authority.eligibleBasisExact, 5222);
  assert.equal(authority.commercialAdjustmentExact, 156.66);
  assert.equal(authority.nonPercentageCommercialExact, -100);
  assert.equal(authority.adjustedExactTotal, 5278.66);
  assert.equal(authority.customerDisplayTotal, 5280);
  assert.equal(authority.internalOnlyTotal, 200);
  const tear = authority.customerSafeGroups.find((g) => /Tear Out/i.test(g.label));
  assert.equal(tear.amount, 772.5);
  const crane = authority.customerSafeGroups.find((g) => /Crane/i.test(g.label));
  assert.equal(crane.amount, 360.5);
  assert.equal(
    authority.customerSafeGroups.filter((g) => /Vanity\/bar sink|vanity material/i.test(g.label))
      .length,
    0,
    "no double-charge vanity opening/material lines when program applied"
  );
  assert.ok(authority.customerSafeGroups.some((g) => g.label === "Bathroom Vanity Program"));
  console.log("ok: commercial recalculation + adjusted preview amounts + no vanity double charge");
}

{
  assert.equal(vanityPackageLabel("37_S"), "37-inch Single-Bowl Vanity Program");
  assert.equal(vanityPackageLabel("48_D"), "48-inch Double-Bowl Vanity Program");
  const commercial = buildCommercialConfiguration(islandEstimate());
  assert.equal(commercial.vanityPrograms.length, 1);
  assert.equal(commercial.vanityPrograms[0].physicalFacts.sinkOpenings, 1);
  assert.equal(commercial.vanityPrograms[0].selectedProgram, "37_S");
  assert.equal(
    commercial.vanityPrograms[0].selectedProgramLabel,
    "37-inch Single-Bowl Vanity Program"
  );
  assert.equal(commercial.vanityPrograms[0].serverPrice, 1850);
  console.log("ok: Vanity Program estimator projection");
}

{
  const r2 = buildScenario("r2");
  assert.equal(r2.publishedRevision, 1);
  assert.equal(r2.estimateRevision, 2);
  assert.equal(r2.measurementsApproved, false);
  assert.ok(r2.customerUrl);
  assert.equal(r2.showPublishRevised, false);
  assert.match(r2.revisionBanner || "", /R1 remains published/i);

  const approved = buildScenario("r2-approved");
  assert.equal(approved.measurementsApproved, true);
  assert.equal(approved.showPublishRevised, true);
  console.log("ok: R1 published / R2 draft Digital Estimate state fixture");
}

{
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL(
        "../../../app-elite100-estimate-studio/src/estimateQueue/estimateRecord/EstimateRecordSections.tsx",
        import.meta.url
      ),
      "utf8"
    )
  );
  assert.match(src, /eq-de-r1-remains-active/);
  assert.match(src, /remains active while R/);
  assert.match(src, /!hasActivePublication/);
  console.log("ok: Digital Estimate R1/R2 rendered-state contracts present");
}

{
  const css = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL("../../../app-digital-estimate/src/digitalEstimatePrint.css", import.meta.url),
      "utf8"
    )
  );
  assert.match(css, /\.de-print-only/);
  assert.match(css, /\.de-screen-only/);
  assert.match(css, /@media print/);
  assert.match(css, /@media screen/);
  assert.match(css, /\.de-print-root[\s\S]*display:\s*none/);
  console.log("ok: screen/print CSS contract");
}

console.log("\nAll estimateRecordCrossSurface contracts passed.\n");
