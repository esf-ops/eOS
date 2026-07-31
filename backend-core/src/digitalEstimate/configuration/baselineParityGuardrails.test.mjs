/**
 * Digital Estimate baseline parity + customer UI guardrails.
 * Run: node backend-core/src/digitalEstimate/configuration/baselineParityGuardrails.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyBaselineParityToCustomerCalculation,
  applyEdgeOptionPriceGuardrail,
  BASELINE_PARITY_NOTICES,
  CUSTOMER_PRICING_AUTHORITY,
  CUSTOMER_PRICING_STATUS,
  isCustomerRepricingAuthoritative,
  publicCalcDivergesFromBaseline,
  resolvePublishedBaselineTotal
} from "./baselineParityGuardrails.mjs";
import {
  buildPublicCustomerConfigurationReadModel,
  sanitizeCustomerConfigurationFoundation
} from "./customerConfigurationFoundation.mjs";
import { resolveEdgeOptionPriceEffect } from "../catalog/studioEdgeAuthority.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../../..");

console.log("\nbaselineParityGuardrails.test.mjs\n");

assert.equal(isCustomerRepricingAuthoritative(), false);
console.log("ok: 1 customer repricing is frozen until Slice K");

{
  const baseline = 8230;
  const diverged = {
    baselineDisplayTotal: baseline,
    configuredDisplayTotal: 6013,
    displayTotalDelta: -2217,
    roomPricing: {
      kind: "updated",
      rooms: [{ roomName: "Kitchen", countertopAmount: 0, backsplashAmount: 400, roomTotal: 400 }]
    }
  };
  assert.equal(publicCalcDivergesFromBaseline(diverged, baseline), true);
  const publishedRoomPricingPublic = {
    kind: "original",
    rooms: [
      {
        roomName: "Kitchen",
        countertopAmount: 7000,
        backsplashAmount: 400,
        addOnsAmount: 830,
        roomTotal: 8230
      }
    ],
    projectTotal: 8230
  };
  const guarded = applyBaselineParityToCustomerCalculation(diverged, {
    baselineDisplayTotal: baseline,
    publishedRoomPricingPublic,
    hasPendingPriceAffectingChanges: true
  });
  assert.equal(guarded.configuredDisplayTotal, 8230);
  assert.equal(guarded.baselineDisplayTotal, 8230);
  assert.equal(guarded.displayTotalDelta, 0);
  assert.equal(guarded.pricingAuthority, CUSTOMER_PRICING_AUTHORITY.PUBLISHED_BASELINE_FROZEN);
  assert.equal(guarded.customerPricingStatus, CUSTOMER_PRICING_STATUS.PENDING_ESTIMATOR_REVIEW);
  assert.equal(guarded.canSubmitForFinalReview, false);
  assert.equal(guarded.roomPricing.rooms[0].countertopAmount, 7000);
  assert.ok(guarded.customerPricingNotice.includes("review") || guarded.customerPricingNotice.includes("Elite"));
  console.log("ok: 2 diverged calc clamped to baseline; countertop not zeroed");
}

{
  const baselineOnly = applyBaselineParityToCustomerCalculation(
    {
      baselineDisplayTotal: 8230,
      configuredDisplayTotal: 8230,
      displayTotalDelta: 0
    },
    { baselineDisplayTotal: 8230, hasPendingPriceAffectingChanges: false }
  );
  assert.equal(baselineOnly.configuredDisplayTotal, 8230);
  assert.equal(baselineOnly.customerPricingStatus, CUSTOMER_PRICING_STATUS.BASELINE);
  assert.equal(resolvePublishedBaselineTotal(baselineOnly), 8230);
  console.log("ok: 3 no-change open keeps baseline parity");
}

{
  // Backend-calculated upgraded edge display amounts are preserved for UI only.
  const edge = applyEdgeOptionPriceGuardrail({
    optionKey: "edge:kitchen:edge_knife",
    includedInBaseline: false,
    premium: true,
    visibleDelta: 152,
    priceEffectCents: 15200,
    priceEffectLabel: "+$152",
    customerPriceTreatment: "delta",
    selectable: true
  });
  assert.equal(edge.priceEffectCents, 15200);
  assert.equal(edge.visibleDelta, 152);
  assert.equal(edge.priceEffectLabel, "+$152");
  assert.equal(edge.selectable, true);

  const original = applyEdgeOptionPriceGuardrail({
    optionKey: "edge:kitchen:edge_knife",
    includedInBaseline: true,
    premium: true,
    customerPriceTreatment: "original_selection",
    priceEffectLabel: "Original selection",
    priceEffectCents: 0,
    visibleDelta: 0
  });
  assert.equal(original.priceEffectLabel, "Included in your estimate");
  assert.equal(original.priceEffectCents, 0);

  const included = applyEdgeOptionPriceGuardrail({
    optionKey: "edge:kitchen:edge_eased",
    includedInBaseline: false,
    premium: false,
    customerPriceTreatment: "included_alternate",
    priceEffectLabel: "Included",
    priceEffectCents: 0
  });
  assert.equal(included.priceEffectLabel, "+$0");
  assert.equal(included.priceEffectCents, 0);
  console.log("ok: 4 edge display prices preserved; Original selection relabeled");
}

{
  const knife = resolveEdgeOptionPriceEffect({
    profileToken: "edge_knife",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: 10.13,
    pricingBasis: "direct"
  });
  assert.ok(knife.priceEffectCents > 0);
  assert.match(knife.priceEffectLabel, /^\+\$/);
  const eased = resolveEdgeOptionPriceEffect({
    profileToken: "edge_eased",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: 10.13,
    pricingBasis: "direct"
  });
  assert.equal(eased.priceEffectLabel, "Included in your estimate");
  assert.equal(eased.priceEffectCents, 0);
  const largeEased = resolveEdgeOptionPriceEffect({
    profileToken: "edge_large_eased",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: 10.13,
    pricingBasis: "direct"
  });
  assert.equal(largeEased.priceEffectLabel, "+$0");
  console.log("ok: 5 backend edge option effects: included +$0 / upgraded +$ / selected label");
}

{
  const foundation = buildPublicCustomerConfigurationReadModel(
    sanitizeCustomerConfigurationFoundation(
      {
        selectedMaterial: { colorName: "Promo White", materialGroup: "Promo", roomId: "kitchen" },
        selectedEdgeProfile: { profileToken: "edge_ogee", profileName: "Ogee" }
      },
      { rejectForbidden: false }
    )
  );
  assert.equal(foundation.canSubmitForFinalReview, false);
  assert.equal(foundation.approvedBaselinePreserved, true);
  console.log("ok: 6 foundation keeps canSubmitForFinalReview false");
}

{
  const svc = readFileSync(join(__dirname, "publicConfigurationService.mjs"), "utf8");
  assert.ok(svc.includes("applyBaselineParityToCustomerCalculation"));
  assert.ok(svc.includes("applyEdgeOptionPriceGuardrail"));
  assert.ok(svc.includes("roomsForCalc"));
  assert.ok(svc.includes("isCustomerRepricingAuthoritative()"));
  assert.ok(!svc.includes("createSold"));
  assert.ok(!svc.includes("autoAccept"));
  console.log("ok: 7 publicConfigurationService wires guardrails; no sold/auto-accept");
}

{
  const view = readFileSync(
    join(root, "app-digital-estimate/src/ConfigurationView.tsx"),
    "utf8"
  );
  assert.ok(!view.includes("Original selection"));
  assert.ok(view.includes("Included in your estimate") || view.includes("Selected"));
  assert.ok(view.includes("de-edge-section-note"));
  assert.ok(view.includes("Changes need review"));
  assert.ok(view.includes("Requested change"));
  assert.ok(view.includes("canSubmitForFinalReview"));
  assert.ok(view.includes("de-final-approval-unavailable"));
  assert.ok(view.includes("Final approval will be available after estimator review"));
  assert.ok(view.includes('data-testid="de-request-review"'));
  assert.ok(view.includes("canSubmitForFinalReview && !configurationLocked"));
  // No browser edge LF × rate math
  assert.ok(!/finishedEdgeLf\s*\*|edgeLinearFeet\s*\*|UPGRADED_EDGE/.test(view));
  console.log("ok: 8 frontend edge copy + final-approve gate; no browser pricing");
}

{
  const breakdown = readFileSync(
    join(root, "app-digital-estimate/src/customerEstimateBreakdown.ts"),
    "utf8"
  );
  assert.ok(breakdown.includes("showCountertop"));
  assert.ok(breakdown.includes("never show $0 countertop lines"));
  console.log("ok: 9 breakdown suppresses misleading $0 countertop lines");
}

{
  assert.ok(BASELINE_PARITY_NOTICES.EDGE_REVIEW.includes("reviewed by Elite"));
  assert.equal(BASELINE_PARITY_NOTICES.CHANGES_NEED_REVIEW, "Changes need review");
  console.log("ok: 10 section-level edge review notice");
}

console.log("\nAll baseline parity guardrail tests passed.\n");
