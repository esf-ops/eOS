/**
 * Studio room backsplash + friendly choice option helpers (tests).
 * Run: node backend-core/src/elite100EstimateStudio/studioSlice2Foundation.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyRoomBacksplashPatch,
  chargeableBacksplashForPricing,
  deriveRoomBacksplashFromImportRoom
} from "./studioRoomBacksplash.mjs";
import {
  buildCustomerChoiceConfiguration,
  friendlyChoicesToAllowedOptionKeys,
  inferFriendlyChoiceFlags,
  partitionAllowedOptionKeys
} from "./studioCustomerChoiceOptions.mjs";
import { emptyStudioEstimateScope } from "./studioEstimateTypes.mjs";
import { calculateStudioEstimate } from "./studioEstimatePricing.mjs";
import { seedScopeFromTakeoffPayload } from "./studioEstimateService.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\nstudioSlice2Foundation.test.mjs\n");

{
  assert.equal(emptyStudioEstimateScope().pricingBasis, "wholesale");
  assert.deepEqual(emptyStudioEstimateScope().customLineItems, []);
  const preserved = {
    ...emptyStudioEstimateScope(),
    pricingBasis: "direct",
    customerName: "Saved Co"
  };
  assert.equal(preserved.pricingBasis, "direct");
  console.log("ok: new estimate scope defaults to Wholesale + empty custom lines");
}

{
  const custom = await calculateStudioEstimate({
    scope: {
      ...emptyStudioEstimateScope(),
      pricingBasis: "wholesale",
      materialGroup: "Group Promo",
      rooms: [
        {
          id: "r1",
          name: "Kitchen",
          included: true,
          countertopSqft: 10,
          includeBacksplash: false,
          backsplashSqft: 0,
          pieces: []
        }
      ],
      customLineItems: [
        {
          name: "Job site protection",
          category: "Labor",
          quantity: 2,
          unit: "ea",
          unitPrice: 50,
          customerFacing: true
        },
        {
          name: "Internal freight",
          category: "Fee",
          quantity: 1,
          unit: "ea",
          unitPrice: 75,
          customerFacing: false
        }
      ]
    },
    env: {}
  });
  assert.equal(custom.fabrication.customLineItemsTotal, 175);
  assert.equal(custom.fabrication.customLineItemsCustomerVisibleTotal, 100);
  assert.equal(custom.fabrication.customLineItemsInternalOnlyTotal, 75);
  assert.ok(custom.totals.exactInternalTotal >= 175);
  // Internal-only lines are CHARGED (included in the customer display total)
  // but absorbed by name into stone categories at publication — the customer
  // pays them without ever seeing the internal description
  // (internal_custom_line_allocation_v1).
  assert.equal(
    custom.totals.customerDisplayTotal,
    custom.totals.exactInternalTotal - (custom.totals.internalMarkupAmount || 0)
  );
  console.log("ok: custom line items calculate server-side; internal-only charged but absorbed (never named publicly)");
}

{
  const withBs = deriveRoomBacksplashFromImportRoom({
    name: "Kitchen",
    pieces: [
      {
        name: "Splash",
        pieceType: "backsplash",
        lengthIn: 120,
        depthIn: 6,
        sqft: 5,
        backsplash: { type: "high", heightIn: 6, linearIn: 120, sqft: 5 }
      }
    ]
  });
  assert.equal(withBs.includeBacksplash, true);
  assert.equal(withBs.backsplashHeightIn, 6);
  assert.equal(withBs.backsplashHeightMode, "custom");
  assert.equal(withBs.backsplashSqft, 5);

  const none = deriveRoomBacksplashFromImportRoom({
    name: "Bath",
    pieces: [{ name: "Top", pieceType: "counter", lengthIn: 60, depthIn: 22, sqft: 9.17 }]
  });
  assert.equal(none.includeBacksplash, false);
  assert.equal(none.backsplashHeightIn, null);
  assert.equal(none.backsplashSqft, 0);

  const defaultStd = applyRoomBacksplashPatch(
    { includeBacksplash: false, backsplashSqft: 0 },
    { includeBacksplash: true, backsplashMeasuredLengthIn: 144 }
  );
  assert.equal(defaultStd.backsplashHeightIn, 4);
  assert.equal(defaultStd.backsplashSqft, 4);

  const preserved = applyRoomBacksplashPatch(
    { includeBacksplash: true, backsplashHeightIn: 12, backsplashMeasuredLengthIn: 144 },
    { includeBacksplash: true }
  );
  assert.equal(preserved.backsplashHeightIn, 12);

  const pricedOff = chargeableBacksplashForPricing({
    includeBacksplash: false,
    backsplashSqft: 9,
    backsplashHeightIn: 4
  });
  assert.equal(pricedOff.backsplashSqft, 0);
  console.log("ok: backsplash include/height defaults only when applicable; custom height preserved");
}

{
  const seeded = seedScopeFromTakeoffPayload({
    rooms: [
      {
        name: "Kitchen",
        pieces: [
          {
            name: "Island splash",
            pieceType: "backsplash",
            lengthIn: 96,
            depthIn: 18,
            sqft: 12,
            backsplash: { type: "full_height", heightIn: 18, linearIn: 96, sqft: 12 }
          }
        ],
        guidedShapeGroups: [
          {
            label: "Island splash",
            shapeType: "backsplash",
            pieces: [{ label: "Island splash", pieceType: "backsplash", lengthIn: 96, depthIn: 18 }]
          }
        ]
      },
      {
        name: "Laundry",
        pieces: [{ name: "Top", pieceType: "counter", lengthIn: 48, depthIn: 24, sqft: 8 }],
        guidedShapeGroups: [
          {
            label: "Top",
            shapeType: "counter",
            pieces: [{ label: "Top", pieceType: "counter", lengthIn: 48, depthIn: 24 }]
          }
        ]
      }
    ]
  });
  assert.equal(seeded.pricingBasis, "wholesale");
  const kitchen = seeded.rooms.find((r) => r.name === "Kitchen");
  const laundry = seeded.rooms.find((r) => r.name === "Laundry");
  assert.equal(kitchen.includeBacksplash, true);
  assert.equal(kitchen.backsplashHeightIn, 18);
  assert.equal(laundry.includeBacksplash, false);
  assert.equal(laundry.backsplashHeightIn, null);
  console.log("ok: seedScope preserves custom height and does not default every room to splash");
}

{
  const keys = friendlyChoicesToAllowedOptionKeys({
    materialColor: true,
    sink: true,
    cooktop: true,
    edge: true,
    backsplash: true
  });
  assert.deepEqual(keys.sort(), ["qty-cook", "qty-sink", "qty-ss"].sort());
  const cfg = buildCustomerChoiceConfiguration(
    { sink: true, cooktop: false, materialColor: true, edge: true, backsplash: false },
    ["legacy-foo"]
  );
  assert.ok(cfg.allowedOptionKeys.includes("qty-sink"));
  assert.ok(cfg.allowedOptionKeys.includes("legacy-foo"));
  assert.ok(!cfg.allowedOptionKeys.includes("qty-cook"));
  const parts = partitionAllowedOptionKeys(["qty-sink", "mystery-key"]);
  assert.deepEqual(parts.known, ["qty-sink"]);
  assert.deepEqual(parts.legacyUnknown, ["mystery-key"]);
  const inferred = inferFriendlyChoiceFlags({ allowedOptionKeys: ["qty-sink", "qty-cook"] });
  assert.equal(inferred.sink, true);
  assert.equal(inferred.cooktop_cutout, true);
  console.log("ok: friendly choice controls produce valid catalog keys; legacy unknowns preserved");
}

{
  const panel = readFileSync(
    join(__dirname, "../../../app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx"),
    "utf8"
  );
  assert.ok(!panel.includes("Allowed options (catalog keys)"));
  assert.ok(!panel.includes('data-testid="eq-de-allowed-options"'));
  assert.ok(panel.includes("eq-de-customer-choices"));
  assert.ok(panel.includes("Customer may choose"));
  console.log("ok: raw catalog-key field absent from estimator UI");
}

{
  const deApp = readFileSync(
    join(__dirname, "../../../app-digital-estimate/src/ConfigurationView.tsx"),
    "utf8"
  );
  assert.ok(!/\bWholesale\b/.test(deApp));
  assert.ok(!/Direct\/Retail/.test(deApp));
  const publicSvc = readFileSync(
    join(__dirname, "../digitalEstimate/configuration/publicConfigurationService.mjs"),
    "utf8"
  );
  assert.ok(publicSvc.includes('"Wholesale"'));
  assert.ok(publicSvc.includes('"Direct"'));
  console.log("ok: public Digital Estimate UI does not expose Wholesale/Direct language");
}

console.log("\nAll studioSlice2Foundation tests passed.\n");
