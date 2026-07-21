/**
 * Customer summary tabs, terminology, removed blocks, print adapter, edge labels.
 * Run: node --experimental-strip-types app-digital-estimate/src/phaseCustomerSummaryEdgePrint.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildOriginalBreakdown,
  buildUpdatedBreakdown,
  buildChangesBreakdown,
} from "./customerEstimateBreakdown.ts";
import { buildDigitalEstimatePrintModel } from "./customerPrintAdapter.ts";
import { resolveEdgeOptionPriceEffect } from "../../backend-core/src/digitalEstimate/catalog/studioEdgeAuthority.mjs";
import {
  rejectGovernedScopeQuantitySelections,
} from "../../backend-core/src/digitalEstimate/configuration/publicConfigurationService.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const printDoc = readFileSync(join(__dirname, "DigitalEstimatePrintDocument.tsx"), "utf8");
const printCss = readFileSync(join(__dirname, "digitalEstimatePrint.css"), "utf8");
const adapter = readFileSync(join(__dirname, "customerPrintAdapter.ts"), "utf8");
const breakdown = readFileSync(join(__dirname, "customerEstimateBreakdown.ts"), "utf8");
const publicSvc = readFileSync(
  join(
    __dirname,
    "../../backend-core/src/digitalEstimate/configuration/publicConfigurationService.mjs",
  ),
  "utf8",
);
const edgeAuth = readFileSync(
  join(__dirname, "../../backend-core/src/digitalEstimate/catalog/studioEdgeAuthority.mjs"),
  "utf8",
);

console.log("\nphaseCustomerSummaryEdgePrint.test.ts\n");

// --- Summary tabs ---
assert.ok(view.includes('["estimate", "Estimate"]'), "1. Estimate tab");
assert.ok(view.includes('["changes", "Changes"]'), "2. Changes tab");
assert.ok(!view.includes('["original", "Original"]'), "3. Original tab absent");
assert.ok(!view.includes('["updated", "Updated"]'), "4. Updated tab absent");
assert.ok(view.includes('useState<"estimate" | "changes">("estimate")'), "5. Estimate default");
assert.ok(view.includes("de-estimate-tab-${id}"), "5b. tab test ids");
assert.ok(!view.includes("de-estimate-tab-original"), "3b. original tab id absent");
assert.ok(breakdown.includes("buildOriginalBreakdown"), "6. Original builder retained internally");
assert.ok(view.includes("Published estimate"), "7. Published estimate label");
assert.ok(view.includes("Your estimate"), "8. Your estimate label");
assert.ok(view.includes("calculation: savedCalc"), "9. Estimate uses savedCalc");
assert.ok(view.includes("roomPricingChanges"), "10. Changes uses pricing changes");
assert.ok(!view.includes("Project add-ons"), "34. Project add-ons absent");
assert.ok(!/uppercase tracking-widest[^>]*>Included</.test(view), "37. standalone Included absent");
assert.ok(view.includes("Print estimate"), "42. Print action");
assert.ok(view.includes("canPrint"), "44. print gated on save state");
assert.ok(printDoc.includes("Elite Stone Fabrication"), "64. shared branding");
assert.ok(printDoc.includes("@quote-lib/customerEstimate/documentLogo"), "64. shared logo");
assert.ok(adapter.includes("buildDigitalEstimatePrintModel"), "68. print adapter");
assert.ok(!adapter.includes("Math.round(rate"), "70. no React LF×rate");
assert.ok(printCss.includes("@media print"), "53. print CSS");
assert.ok(printCss.includes("de-screen-root"), "53. hide screen chrome");
assert.ok(publicSvc.includes("governed_scope_quantity_forbidden"), "39. scope qty rejection");
assert.ok(publicSvc.includes("rejectGovernedScopeQuantitySelections"), "39. reject helper");
assert.ok(edgeAuth.includes("Elite will confirm this option and price."), "32. review copy");
assert.ok(view.includes("from published estimate"), "17. room delta language");
assert.ok(!view.includes("Current configured total"), "14. no Current configured total");
assert.ok(!view.includes("Your updated estimate"), "13. no Your updated estimate");
console.log("ok: summary / terminology / removed / print source markers");

// --- Terminology + Estimate authority ---
{
  const updated = buildUpdatedBreakdown({
    calculation: {
      roomPricing: {
        kind: "updated",
        rooms: [
          {
            roomName: "Kitchen",
            countertopAmount: 2460,
            backsplashAmount: 248,
            addOnsAmount: 955,
            roomTotal: 3663,
            addOnLines: [{ label: "Sink — Precis", amount: 575 }],
          },
        ],
        projectAddOns: [{ label: "Trip charge", amount: 500 }],
        projectTotal: 4163,
      },
    },
  });
  assert.equal(updated.title, "Your estimate");
  assert.equal(updated.total, 4163);
  assert.ok(updated.lines.some((l) => l.label === "Countertop" && l.amount === 2460));
  assert.ok(updated.lines.some((l) => l.label === "Trip charge" && l.amount === 500));
  assert.ok(updated.lines.some((l) => l.label === "Your estimate" && l.amount === 4163));
  assert.equal(updated.lines.filter((l) => /Trip charge/i.test(l.label)).length, 1);

  const original = buildOriginalBreakdown({
    roomPricing: {
      kind: "original",
      rooms: [
        {
          roomName: "Kitchen",
          countertopAmount: 2000,
          backsplashAmount: 248,
          addOnsAmount: 0,
          roomTotal: 2248,
          addOnLines: [],
        },
      ],
      projectAddOns: [{ label: "Trip charge", amount: 500 }],
      projectTotal: 2748,
    },
  });
  assert.equal(original.title, "Published estimate");
  assert.ok(original.total === 2748);

  const changes = buildChangesBreakdown({
    changeLines: [],
    roomPricingChanges: {
      rows: [
        {
          roomName: "Kitchen",
          categoryLabel: "Edge",
          originalLabel: "Eased",
          updatedLabel: "Small Ogee",
          amountDelta: 450,
          status: "changed",
        },
      ],
      totalDelta: 450,
    },
  });
  assert.ok(changes.lines.some((l) => /Eased → Small Ogee/.test(l.label)));
  assert.ok(changes.lines.some((l) => l.label === "Difference from published estimate"));
  console.log("ok: Estimate / Published / Changes terminology + hierarchy");
}

// --- Edge price effects ---
{
  const lf = 18;
  const basis = "direct";
  const original = resolveEdgeOptionPriceEffect({
    profileToken: "edge_eased",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: lf,
    pricingBasis: basis,
  });
  assert.equal(original.priceEffectLabel, "Original selection");

  for (const free of ["edge_large_eased", "edge_full_bullnose", "edge_large_ogee", "edge_bevel"]) {
    const effect = resolveEdgeOptionPriceEffect({
      profileToken: free,
      originalProfileToken: "edge_eased",
      edgeLinearFeet: lf,
      pricingBasis: basis,
    });
    assert.equal(effect.priceEffectLabel, "Included", free);
  }

  for (const premium of ["edge_small_ogee", "edge_crescent", "edge_knife"]) {
    const effect = resolveEdgeOptionPriceEffect({
      profileToken: premium,
      originalProfileToken: "edge_eased",
      edgeLinearFeet: lf,
      pricingBasis: basis,
    });
    assert.match(effect.priceEffectLabel, /^\+\$/, premium);
    assert.notEqual(effect.customerPriceTreatment, "review_required", premium);
  }

  const missingLf = resolveEdgeOptionPriceEffect({
    profileToken: "edge_small_ogee",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: 0,
    pricingBasis: basis,
  });
  assert.equal(missingLf.priceEffectLabel, "Elite will confirm this option and price.");
  assert.equal(missingLf.reviewReasonCode, "missing_edge_lf");
  console.log("ok: canonical edge effects + review fallback");
}

// --- Governed scope quantity rejection ---
{
  assert.throws(
    () => rejectGovernedScopeQuantitySelections([{ optionKey: "qty-cook", quantity: 1 }]),
    (err: { code?: string }) => err?.code === "governed_scope_quantity_forbidden",
  );
  assert.throws(
    () => rejectGovernedScopeQuantitySelections([{ optionKey: "qty-sink", quantity: 2 }]),
    (err: { code?: string }) => err?.code === "governed_scope_quantity_forbidden",
  );
  // Empty / zero qty does not reject
  rejectGovernedScopeQuantitySelections([{ optionKey: "qty-cook", quantity: 0 }]);
  rejectGovernedScopeQuantitySelections([{ optionKey: "edge:kitchen:edge_eased", quantity: 1 }]);
  console.log("ok: governed scope quantity rejection");
}

// --- Print adapter reconciliation ---
{
  const roomPricing = {
    kind: "updated",
    rooms: [
      {
        roomName: "Kitchen",
        countertopAmount: 2460,
        backsplashAmount: 248,
        addOnsAmount: 955,
        roomTotal: 3663,
        addOnLines: [
          { label: "Edge — Small Ogee", amount: 450 },
          { label: "Sink — Precis 27\" Sink", amount: 575 },
        ],
      },
    ],
    projectAddOns: [{ label: "Trip charge", amount: 500 }],
    projectTotal: 4163,
  };
  const model = buildDigitalEstimatePrintModel({
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        sourceName: "Kitchen",
        selectedColorId: "c1",
        selectedColorName: "Bayshore Sand",
        selectedOptionKey: null,
        customerMayEditLabel: false,
        locked: false,
        countertopIncluded: true,
        backsplashIncluded: true,
        measurementStatus: null,
        baselineLabel: null,
        roomNote: "",
        sinkDraft: null,
        faucetDraft: null,
        backsplashDraft: null,
        sinkProducts: [],
        faucetProducts: [],
        accessoryProducts: [],
        specialtyProducts: [],
        cooktopSummary: null,
        colors: [
          {
            id: "c1",
            optionKey: "material:kitchen:bayshore",
            name: "Bayshore Sand",
            pricingGroupLabel: "Group Promo",
            imageThumb: null,
            imageFull: null,
            selected: true,
            includedInBaseline: false,
          },
        ],
        choiceOptions: [],
        sideSplashPieces: [],
        backsplashSummary: "4-inch backsplash",
        sinkSummary: 'Precis 27" Sink — Coal Black',
        faucetSummary: "Contemporary Round Beverage Faucet",
        accessoriesSummary: "None selected",
        edgeSummary: "Small Ogee",
        specialtySummary: "None selected",
        roomPricing: roomPricing.rooms[0],
      },
    ] as never,
    roomPricing: roomPricing as never,
    estimateTotal: 4163,
    customerName: "Pat Customer",
    projectName: "Kitchen remodel",
    projectAddress: "1 Main St",
    quoteNumber: "Q-100",
    pricingValidThrough: "2026-08-01",
    projectNote: null,
  });
  assert.equal(model.estimateTotal, 4163);
  assert.equal(model.rooms[0].roomTotal, 3663);
  assert.equal(model.rooms[0].countertopAmount, 2460);
  assert.equal(model.projectLines.filter((l) => /Trip charge/i.test(l.label)).length, 1);
  assert.ok(model.rooms[0].selections.some((s) => s.label === "Edge" && s.value === "Small Ogee"));
  assert.ok(model.rooms[0].selections.some((s) => s.label === "Backsplash"));
  const blob = JSON.stringify(model);
  assert.ok(!/\b\d+(\.\d+)?\s*sf\b/i.test(blob), "57. no SF");
  assert.ok(!/\b\d+(\.\d+)?\s*lf\b/i.test(blob), "58. no LF");
  assert.ok(!/pricingBasis|ratePerLf|billedSf|measuredSf/i.test(blob), "59-60. no rates/basis");
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(blob), "56. no UUIDs");
  console.log("ok: print adapter reconciles saved DTO + redaction");
}

console.log("\nphaseCustomerSummaryEdgePrint: all checks passed\n");
