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
  isUnsafeCustomerFacingCalc,
  publicCalcDivergesFromBaseline,
  resolvePricedSelectionTotal,
  resolvePublishedBaselineTotal
} from "./baselineParityGuardrails.mjs";
import {
  buildPublicCustomerConfigurationReadModel,
  sanitizeCustomerConfigurationFoundation
} from "./customerConfigurationFoundation.mjs";
import { resolveEdgeOptionPriceEffect } from "../catalog/studioEdgeAuthority.mjs";
import {
  calculateElite100ConfigDelta,
  ELITE100_CONFIG_DELTA_ENGINE_ID
} from "./currentConfigDeltaEngine.mjs";
import {
  FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT,
  FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT
} from "./approvedPricingFixtures.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../../..");

console.log("\nbaselineParityGuardrails.test.mjs\n");

assert.equal(isCustomerRepricingAuthoritative(), true);
console.log("ok: 1 customer selection reprice is authoritative");

{
  const baseline = 8230;
  const priced = {
    baselineDisplayTotal: baseline,
    configuredDisplayTotal: 9120,
    displayTotalDelta: 890,
    roomPricing: {
      kind: "updated",
      rooms: [
        {
          roomName: "Kitchen",
          countertopAmount: 7800,
          backsplashAmount: 400,
          addOnsAmount: 920,
          roomTotal: 9120
        }
      ]
    }
  };
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
  const guarded = applyBaselineParityToCustomerCalculation(priced, {
    baselineDisplayTotal: baseline,
    publishedRoomPricingPublic,
    scopeReviewRequired: false
  });
  assert.equal(guarded.pricingAuthority, CUSTOMER_PRICING_AUTHORITY.AUTHORITATIVE_BACKEND_REPRICE);
  assert.equal(guarded.configuredDisplayTotal, 9120);
  assert.equal(guarded.pricedSelectionTotal, 9120);
  assert.equal(guarded.publishedBaselineTotal, 8230);
  assert.equal(guarded.displayTotalDelta, 890);
  assert.equal(guarded.customerPricingStatus, CUSTOMER_PRICING_STATUS.PRICED_SELECTION);
  assert.equal(guarded.scopeReviewRequired, false);
  assert.equal(guarded.canSubmitForFinalReview, false);
  assert.equal(guarded.roomPricing.rooms[0].countertopAmount, 7800);
  console.log("ok: 2 material/selection reprice updates customer total");
}

{
  const unsafe = applyBaselineParityToCustomerCalculation(
    {
      baselineDisplayTotal: 8230,
      configuredDisplayTotal: 400,
      displayTotalDelta: -7830,
      roomPricing: {
        kind: "updated",
        rooms: [{ roomName: "Kitchen", countertopAmount: 0, backsplashAmount: 400, roomTotal: 400 }]
      }
    },
    {
      baselineDisplayTotal: 8230,
      publishedRoomPricingPublic: {
        rooms: [{ roomName: "Kitchen", countertopAmount: 7000, roomTotal: 8230 }]
      },
      scopeReviewRequired: false
    }
  );
  assert.equal(unsafe.pricingAuthority, CUSTOMER_PRICING_AUTHORITY.PUBLISHED_BASELINE_FROZEN);
  assert.equal(unsafe.configuredDisplayTotal, 8230);
  assert.equal(unsafe.roomPricing.rooms[0].countertopAmount, 7000);
  assert.equal(isUnsafeCustomerFacingCalc(
    {
      configuredDisplayTotal: 400,
      baselineDisplayTotal: 8230,
      roomPricing: { rooms: [{ roomName: "Kitchen", countertopAmount: 0 }] }
    },
    { rooms: [{ roomName: "Kitchen", countertopAmount: 7000 }] }
  ), true);
  console.log("ok: 3 unsafe $0 countertop still freezes to baseline");
}

{
  const baselineOnly = applyBaselineParityToCustomerCalculation(
    {
      baselineDisplayTotal: 8230,
      configuredDisplayTotal: 8230,
      displayTotalDelta: 0
    },
    { baselineDisplayTotal: 8230, scopeReviewRequired: false }
  );
  assert.equal(baselineOnly.configuredDisplayTotal, 8230);
  assert.equal(baselineOnly.customerPricingStatus, CUSTOMER_PRICING_STATUS.BASELINE);
  assert.equal(resolvePublishedBaselineTotal(baselineOnly), 8230);
  assert.equal(resolvePricedSelectionTotal(baselineOnly), 8230);
  console.log("ok: 4 no-change open keeps baseline parity");
}

{
  const scope = applyBaselineParityToCustomerCalculation(
    {
      baselineDisplayTotal: 8230,
      configuredDisplayTotal: 8450,
      displayTotalDelta: 220,
      roomPricing: {
        rooms: [{ roomName: "Kitchen", countertopAmount: 7200, roomTotal: 8450 }]
      }
    },
    {
      baselineDisplayTotal: 8230,
      publishedRoomPricingPublic: {
        rooms: [{ roomName: "Kitchen", countertopAmount: 7000, roomTotal: 8230 }]
      },
      scopeReviewRequired: true
    }
  );
  assert.equal(scope.scopeReviewRequired, true);
  assert.equal(scope.customerPricingStatus, CUSTOMER_PRICING_STATUS.SCOPE_REVIEW_REQUIRED);
  assert.equal(scope.configuredDisplayTotal, 8450);
  assert.equal(scope.customerPricingNotice, BASELINE_PARITY_NOTICES.NEEDS_ELITE_REVIEW);
  console.log("ok: 5 scope review flagged without freezing priced selection total");
}

{
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
  assert.equal(edge.priceEffectLabel, "+$152");

  const original = applyEdgeOptionPriceGuardrail({
    optionKey: "edge:kitchen:edge_knife",
    includedInBaseline: true,
    premium: true,
    customerPriceTreatment: "original_selection",
    priceEffectLabel: "Original selection",
    priceEffectCents: 15200
  });
  assert.equal(original.priceEffectLabel, "Included in published estimate");
  assert.equal(original.priceEffectCents, 15200);

  const included = applyEdgeOptionPriceGuardrail({
    optionKey: "edge:kitchen:edge_eased",
    includedInBaseline: false,
    premium: false,
    customerPriceTreatment: "included_alternate",
    priceEffectCents: 0
  });
  assert.equal(included.priceEffectLabel, "+$0");
  console.log("ok: 6 edge display: included +$0 / premium +$ / published knife context");
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
  console.log("ok: 7 backend knife effect cents calculated");
}

{
  const foundation = buildPublicCustomerConfigurationReadModel(
    sanitizeCustomerConfigurationFoundation(
      {
        selectedMaterial: { colorName: "Calacatta Viol", materialGroup: "Group F", roomId: "kitchen" },
        selectedEdgeProfile: { profileToken: "edge_knife", profileName: "Knife" }
      },
      { rejectForbidden: false }
    )
  );
  assert.equal(foundation.requiresEstimatorReview, false);
  assert.equal(foundation.canSubmitForFinalReview, false);
  assert.ok(foundation.selectionChanges.count >= 1);
  console.log("ok: 8 material/edge selection does not require estimator review");
}

{
  const scopeFoundation = buildPublicCustomerConfigurationReadModel(
    sanitizeCustomerConfigurationFoundation(
      {
        requestedOpenings: [{ type: "cooktop", quantity: 1 }]
      },
      { rejectForbidden: false }
    )
  );
  assert.equal(scopeFoundation.requiresEstimatorReview, true);
  assert.ok(scopeFoundation.scopeChangeRequests.count >= 1);
  console.log("ok: 9 physical scope request requires estimator review");
}

{
  const svc = readFileSync(join(__dirname, "publicConfigurationService.mjs"), "utf8");
  assert.ok(svc.includes("applyBaselineParityToCustomerCalculation"));
  assert.ok(svc.includes("roomsForCalc"));
  assert.ok(svc.includes("calculateElite100ConfigDelta"));
  assert.ok(svc.includes("scopeReviewRequired"));
  assert.ok(!svc.includes("createSold"));
  assert.ok(!svc.includes("autoAccept"));
  // Must live-price selections unconditionally — not force every room back to
  // its baseline material group by default (only the narrow missing-rate
  // degrade path below is allowed to do that, and only for the offending room).
  assert.ok(svc.includes("const roomsForCalc = rooms;"));
  console.log("ok: 10 publicConfigurationService live-prices selections; no sold/auto-accept");
}

{
  const view = readFileSync(
    join(root, "app-digital-estimate/src/ConfigurationView.tsx"),
    "utf8"
  );
  assert.ok(!view.includes("Original selection"));
  assert.ok(view.includes("Needs Elite review") || view.includes("de-changes-need-review"));
  assert.ok(view.includes("Changes saved") || view.includes("de-changes-saved"));
  assert.ok(view.includes("canSubmitForFinalReview"));
  assert.ok(view.includes("de-final-approval-unavailable"));
  assert.ok(view.includes('data-testid="de-request-review"'));
  assert.ok(view.includes("canSubmitForFinalReview && !configurationLocked"));
  assert.ok(!/finishedEdgeLf\s*\*|edgeLinearFeet\s*\*|UPGRADED_EDGE/.test(view));
  assert.ok(!view.includes("de-edge-pending-request"));
  console.log("ok: 11 frontend live-price copy + final-approve gate; no browser pricing");
}

{
  const breakdown = readFileSync(
    join(root, "app-digital-estimate/src/customerEstimateBreakdown.ts"),
    "utf8"
  );
  assert.ok(breakdown.includes("showCountertop"));
  assert.ok(breakdown.includes("never show $0 countertop lines"));
  console.log("ok: 12 breakdown suppresses misleading $0 countertop lines");
}

{
  assert.equal(publicCalcDivergesFromBaseline({ configuredDisplayTotal: 9000 }, 8230), true);
  assert.equal(BASELINE_PARITY_NOTICES.NEEDS_ELITE_REVIEW, "Needs Elite review");
  console.log("ok: 13 divergence + scope review notice helpers");
}

// ---------------------------------------------------------------------------
// 14. Frozen fail-closed state is sticky/idempotent — a second guard pass over
// an already-frozen result must not reclassify it as safe.
// ---------------------------------------------------------------------------
{
  const publishedRoomPricingPublic = {
    rooms: [{ roomName: "Kitchen", countertopAmount: 7000, roomTotal: 8230 }]
  };
  const unsafeRaw = {
    baselineDisplayTotal: 8230,
    configuredDisplayTotal: 400,
    displayTotalDelta: -7830,
    roomPricing: {
      kind: "updated",
      rooms: [{ roomName: "Kitchen", countertopAmount: 0, backsplashAmount: 400, roomTotal: 400 }]
    }
  };
  const firstPass = applyBaselineParityToCustomerCalculation(unsafeRaw, {
    baselineDisplayTotal: 8230,
    publishedRoomPricingPublic,
    scopeReviewRequired: false
  });
  assert.equal(firstPass.pricingAuthority, CUSTOMER_PRICING_AUTHORITY.PUBLISHED_BASELINE_FROZEN);
  assert.equal(firstPass.customerPricingNotice, BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW);

  // Simulate a page reload: the persisted, already-frozen result is re-guarded
  // on read. Freezing already reset totals/rooms to match the published
  // baseline, so a naive re-check of "is this unsafe" alone would say no.
  const secondPass = applyBaselineParityToCustomerCalculation(firstPass, {
    baselineDisplayTotal: 8230,
    publishedRoomPricingPublic,
    scopeReviewRequired: false
  });
  assert.equal(secondPass.pricingAuthority, CUSTOMER_PRICING_AUTHORITY.PUBLISHED_BASELINE_FROZEN);
  assert.equal(secondPass.configuredDisplayTotal, 8230);
  assert.equal(secondPass.customerPricingNotice, BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW);

  // Third pass to rule out a two-call coincidence.
  const thirdPass = applyBaselineParityToCustomerCalculation(secondPass, {
    baselineDisplayTotal: 8230,
    publishedRoomPricingPublic,
    scopeReviewRequired: false
  });
  assert.equal(thirdPass.pricingAuthority, CUSTOMER_PRICING_AUTHORITY.PUBLISHED_BASELINE_FROZEN);
  assert.equal(thirdPass.customerPricingNotice, BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW);
  console.log("ok: 14 frozen fail-closed state stays frozen across repeated guard passes");
}

// ---------------------------------------------------------------------------
// 15. Frozen fail-closed notice uses customer-safe, non-technical copy.
// ---------------------------------------------------------------------------
{
  assert.equal(
    BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW,
    "This selection needs Elite review before the estimate can update."
  );
  assert.ok(!/Price updates for this change require estimator review/.test(
    BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW
  ));
  console.log("ok: 15 fail-closed notice copy is customer-friendly, not technical");
}

// ---------------------------------------------------------------------------
// 16. Missing frozen material rate degrades safely — reproduces the exact
// engine failure (countertop material, not side-splash) and proves the
// service catches it (source-level, since the in-memory pricing fixtures
// always float a schedule floor and can't reproduce the DB gap end-to-end).
// ---------------------------------------------------------------------------
{
  const ORG = "11111111-1111-4111-8111-111111111111";
  const PUB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const SNAP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const ENV = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const frozenBaseRatesMissingGroupC = {
    direct: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT, group_c: null },
    wholesale: { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT }
  };
  let thrown = null;
  try {
    calculateElite100ConfigDelta({
      organizationId: ORG,
      publication: { id: PUB, snapshotId: SNAP, status: "active" },
      envelope: { id: ENV, version: 1, status: "active", publicationId: PUB },
      pricingPolicyFingerprint: "policy-fp",
      catalogFingerprint: "catalog-fp",
      engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID,
      pricingBasis: "direct",
      materialProgram: "elite_100",
      frozenBaseRates: frozenBaseRatesMissingGroupC,
      rooms: [
        {
          roomKey: "kitchen",
          displayName: "Kitchen",
          chargeableCounterSf: 10,
          selectedMaterialGroup: "group_c",
          baselineMaterialGroup: "group_b"
        }
      ],
      materialTaxPolicy: { bps: 200 },
      authorizedMaterialMarkup: { bps: 0 },
      options: [],
      customLines: [],
      credits: [],
      accountMemberships: [],
      materialRateOverrides: [],
      estimateAdjustments: [],
      partnerAccountId: null,
      baseline: {
        exactTotal: 850,
        displayTotal: 850,
        rooms: [{ roomKey: "kitchen", materialGroup: "group_b" }]
      },
      asOf: "2026-07-30T12:00:00.000Z"
    });
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown, "engine throws for a countertop material group missing its frozen rate");
  assert.equal(thrown.code, "missing_material_rate");
  assert.equal(thrown.statusCode, 422);

  const svc = readFileSync(join(__dirname, "publicConfigurationService.mjs"), "utf8");
  assert.ok(
    svc.includes('e?.code === "missing_material_rate"'),
    "service catches missing_material_rate specifically"
  );
  assert.ok(
    svc.includes("materialRateMissingReview = true"),
    "service marks the review flag instead of leaving the calc mid-throw"
  );
  assert.ok(
    svc.includes("selectedMaterialGroup: r.baselineMaterialGroup || r.selectedMaterialGroup"),
    "service degrades the offending room(s) back to the published baseline material group"
  );
  assert.ok(
    svc.includes("forceFreeze: materialRateMissingReview"),
    "service forces the fail-closed freeze so the customer sees the published total, not a broken save"
  );
  console.log("ok: 16 missing countertop material rate degrades to review/frozen baseline, not a save failure");
}

// ---------------------------------------------------------------------------
// 17. Fresh, never-saved estimate does not falsely claim "Changes saved".
// ---------------------------------------------------------------------------
{
  const view = readFileSync(
    join(root, "app-digital-estimate/src/ConfigurationView.tsx"),
    "utf8"
  );
  assert.ok(
    view.includes("hasEverSaved"),
    "sidebar distinguishes a real save from a fresh/untouched estimate"
  );
  assert.ok(
    view.includes("As published"),
    "fresh untouched estimate shows an as-published status, not Changes saved"
  );
  assert.ok(
    /hasEverSaved \? \(/.test(view) || view.includes(": hasEverSaved ? ("),
    "Changes saved is gated behind hasEverSaved rather than always shown when not pending"
  );
  console.log("ok: 17 fresh untouched estimate does not show Changes saved");
}

// ---------------------------------------------------------------------------
// 18. Frozen/fail-closed pricing notice is visible to the customer, not only
// shown for scope-review changes.
// ---------------------------------------------------------------------------
{
  const view = readFileSync(
    join(root, "app-digital-estimate/src/ConfigurationView.tsx"),
    "utf8"
  );
  assert.ok(
    view.includes("showPricingNotice"),
    "notice visibility is derived, not inlined only behind changesNeedReview"
  );
  assert.ok(
    /changesNeedReview \|\| pricingFrozen/.test(view),
    "notice renders for the frozen fail-closed case, not only scope review"
  );
  console.log("ok: 18 frozen/fail-closed state renders a customer-visible explanation");
}

// ---------------------------------------------------------------------------
// 19. Screenshot regression — incomplete material-change calc must never
// become authoritative. Published Kitchen: $7,120 with real countertop
// dollars. Customer-priced Kitchen after a material selection: Countertop
// $0 / Backsplash $459 / Room total $459 — the room still has countertop
// scope, so a material/color change can never make countertop disappear.
// Reproduces two real root causes found in isUnsafeCustomerFacingCalc:
//  (a) the real public room DTO (customerRoomPricingProjection.mjs
//      toPublicRoom) never carries a roomKey, so a naive `"" === ""`
//      roomKey fallback trivially matched every published room onto
//      whichever calc room came first in the array;
//  (b) legacy publications with no per-room dollar snapshot report
//      countertopAmount: null on the published side, which the old code
//      treated as "nothing to protect" and silently skipped.
// ---------------------------------------------------------------------------
{
  // 19a. Two rooms, Kitchen is NOT first in the array, and neither DTO
  // carries a roomKey (the real production shape) — the bug matched every
  // published room onto calcRooms[0] (Powder Bath) and never inspected Kitchen.
  const twoRoomScreenshot = applyBaselineParityToCustomerCalculation(
    {
      baselineDisplayTotal: 7120,
      configuredDisplayTotal: 5264,
      displayTotalDelta: -1856,
      roomPricing: {
        kind: "updated",
        rooms: [
          { roomName: "Powder Bath", countertopAmount: 300, backsplashAmount: 0, addOnsAmount: 0, roomTotal: 300 },
          { roomName: "Kitchen", countertopAmount: 0, backsplashAmount: 459, addOnsAmount: 0, roomTotal: 459 }
        ]
      }
    },
    {
      baselineDisplayTotal: 7120,
      publishedRoomPricingPublic: {
        rooms: [
          { roomName: "Powder Bath", countertopAmount: 300, backsplashAmount: 0, addOnsAmount: 0, roomTotal: 300 },
          {
            roomName: "Kitchen",
            countertopAmount: 6661,
            backsplashAmount: 459,
            addOnsAmount: 0,
            roomTotal: 7120,
            selectedMaterial: "Calacatta Viol"
          }
        ]
      },
      scopeReviewRequired: false
    }
  );
  assert.equal(
    twoRoomScreenshot.pricingAuthority,
    CUSTOMER_PRICING_AUTHORITY.PUBLISHED_BASELINE_FROZEN,
    "19a. incomplete two-room material-change calc must freeze to baseline"
  );
  assert.equal(twoRoomScreenshot.configuredDisplayTotal, 7120, "19a. no incorrect $5,264 total");
  assert.equal(twoRoomScreenshot.roomPricing.rooms.find((r) => r.roomName === "Kitchen").countertopAmount, 6661);
  assert.equal(
    twoRoomScreenshot.customerPricingNotice,
    BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW,
    "19a. customer-safe notice is shown"
  );

  // 19b. Legacy publication: no per-room dollar snapshot exists, so the
  // published side can only report a material label, never countertopAmount.
  const legacyScreenshot = applyBaselineParityToCustomerCalculation(
    {
      baselineDisplayTotal: 7120,
      configuredDisplayTotal: 5264,
      displayTotalDelta: -1856,
      roomPricing: {
        kind: "updated",
        rooms: [
          {
            roomName: "Kitchen",
            countertopAmount: 0,
            backsplashAmount: 459,
            addOnsAmount: 0,
            roomTotal: 459,
            selectedMaterial: "Group F"
          }
        ]
      }
    },
    {
      baselineDisplayTotal: 7120,
      publishedRoomPricingPublic: {
        rooms: [
          {
            roomName: "Kitchen",
            countertopAmount: null,
            backsplashAmount: null,
            addOnsAmount: 0,
            roomTotal: null,
            selectedMaterial: "Calacatta Viol"
          }
        ]
      },
      scopeReviewRequired: false
    }
  );
  assert.equal(
    legacyScreenshot.pricingAuthority,
    CUSTOMER_PRICING_AUTHORITY.PUBLISHED_BASELINE_FROZEN,
    "19b. legacy publication with unresolved per-room countertop must still freeze"
  );
  assert.equal(legacyScreenshot.configuredDisplayTotal, 7120, "19b. no incorrect $5,264 total");
  assert.equal(
    legacyScreenshot.customerPricingNotice,
    BASELINE_PARITY_NOTICES.PRICE_UPDATE_REVIEW,
    "19b. customer-safe notice is shown"
  );

  // Direct unit coverage of the detector itself for both root causes.
  assert.equal(
    isUnsafeCustomerFacingCalc(
      {
        roomPricing: {
          rooms: [
            { roomName: "Powder Bath", countertopAmount: 300 },
            { roomName: "Kitchen", countertopAmount: 0, backsplashAmount: 459 }
          ]
        }
      },
      {
        rooms: [
          { roomName: "Powder Bath", countertopAmount: 300 },
          { roomName: "Kitchen", countertopAmount: 6661, selectedMaterial: "Calacatta Viol" }
        ]
      }
    ),
    true,
    "19c. matching bug: Kitchen not first in the array is still caught"
  );
  assert.equal(
    isUnsafeCustomerFacingCalc(
      { roomPricing: { rooms: [{ roomName: "Kitchen", countertopAmount: 0, selectedMaterial: "Group F" }] } },
      { rooms: [{ roomName: "Kitchen", countertopAmount: null, selectedMaterial: "Calacatta Viol" }] }
    ),
    true,
    "19d. legacy null published countertop is still caught via material signal"
  );

  // Sanity: a legitimate material upgrade in the same two-room shape must
  // NOT be misclassified as unsafe.
  assert.equal(
    isUnsafeCustomerFacingCalc(
      {
        roomPricing: {
          rooms: [
            { roomName: "Powder Bath", countertopAmount: 300 },
            { roomName: "Kitchen", countertopAmount: 7441, backsplashAmount: 459, selectedMaterial: "Group F" }
          ]
        }
      },
      {
        rooms: [
          { roomName: "Powder Bath", countertopAmount: 300 },
          { roomName: "Kitchen", countertopAmount: 6661, selectedMaterial: "Calacatta Viol" }
        ]
      }
    ),
    false,
    "19e. legitimate material upgrade with real countertop dollars is not frozen"
  );

  console.log("ok: 19 screenshot regression — incomplete material-change calc freezes to baseline");
}

console.log("\nAll baseline parity guardrail tests passed.\n");
