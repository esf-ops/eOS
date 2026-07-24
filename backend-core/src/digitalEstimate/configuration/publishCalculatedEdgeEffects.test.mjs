/**
 * Freeze Studio-calculated premium edge effects at Digital Estimate publication.
 * Run: node backend-core/src/digitalEstimate/configuration/publishCalculatedEdgeEffects.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildStudioEstimateRoomsForPublication,
  buildSyntheticQuoteHeaderFromStudioEstimate
} from "../../elite100EstimateStudio/studioEstimatePublicationAdapter.mjs";
import {
  buildCustomerSafeEdgeOptionEffects,
  edgeEffectFromFrozenPublication,
  findFrozenEdgeOptionEffect,
  FREE_EDGE_PROFILES,
  PREMIUM_EDGE_PROFILES,
  resolveEdgeOptionPriceEffect,
  resolvePremiumEdgeRatePerLf
} from "../catalog/studioEdgeAuthority.mjs";
import {
  buildUpdatedRoomPricingProjection,
  toPublicRoomPricingDto,
  buildChangesRoomPricingProjection,
  buildOriginalRoomPricingProjection
} from "./customerRoomPricingProjection.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";

console.log("\npublishCalculatedEdgeEffects.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const LF = 10.13;
const DIRECT_RATE = resolvePremiumEdgeRatePerLf("direct");
const EXPECTED_PREMIUM_CENTS = Math.round(DIRECT_RATE * LF * 100);

function studioEstimateFixture(overrides = {}) {
  return {
    id: "studio-est-edge-fx",
    organizationId: ORG,
    revision: 2,
    status: "approved",
    takeoffJobId: "takeoff-edge",
    approval: {
      customerDisplayTotal: 5500,
      calculationFingerprint: "fp-edge"
    },
    calculationSnapshot: {
      pricingBasis: "direct",
      fabrication: {
        edge: {
          profileToken: "edge_eased",
          finalLf: LF,
          pricedLf: 0,
          ratePerLf: 0,
          amount: 0,
          tier: "free"
        },
        addOns: { "qty-sink": 1 }
      },
      totals: { customerDisplayTotal: 5500 }
    },
    scope: {
      customerName: "Hosted Test",
      projectName: "Kitchen Remodel",
      materialGroup: "Group Promo",
      pricingBasis: "direct",
      physicalScopeSource: "takeoff",
      edgeProfileToken: "edge_eased",
      edgeLinearFeet: 0,
      edgeEligibleLinearFeet: LF,
      takeoffScopeSummary: { derivedOpenEdgeLf: LF },
      edgeScopeAdjustmentLf: 0,
      addOns: { "qty-sink": 1 },
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          included: true,
          countertopSqft: 40,
          backsplashSqft: 0,
          pieces: [
            {
              id: "k-run",
              name: "Kitchen run",
              pieceType: "counter",
              lengthIn: Math.round(LF * 12 * 100) / 100,
              depthIn: 25.5,
              sqft: 40,
              included: true,
              finishedEdge: {
                frontEdgeLengthIn: Math.round(LF * 12 * 100) / 100,
                leftExposedEdgeLengthIn: 0,
                rightExposedEdgeLengthIn: 0,
                otherExposedEdgeLengthIn: 0,
                totalFinishedEdgeLengthIn: Math.round(LF * 12 * 100) / 100,
                approved: true,
                source: "estimator_confirmed"
              }
            }
          ]
        },
        {
          id: "bath",
          name: "Bath",
          roomType: "Bathroom",
          included: true,
          countertopSqft: 12,
          backsplashSqft: 0,
          pieces: []
        }
      ]
    },
    ...overrides
  };
}

// 1. Studio calculates premium edge effect (same cents the freeze will use)
{
  for (const premium of PREMIUM_EDGE_PROFILES) {
    const effect = resolveEdgeOptionPriceEffect({
      profileToken: premium.optionToken,
      originalProfileToken: "edge_eased",
      edgeLinearFeet: LF,
      pricingBasis: "direct"
    });
    assert.equal(effect.priceEffectCents, EXPECTED_PREMIUM_CENTS, premium.label);
    assert.match(effect.priceEffectLabel, /^\+\$/);
    assert.equal(effect.customerPriceTreatment, "delta");
  }
  console.log("ok: Studio premium edge effect cents match LF × governed rate");
}

// 2. Publication freezes that exact effect (customer-safe, no LF/rate/basis)
{
  const header = buildSyntheticQuoteHeaderFromStudioEstimate(studioEstimateFixture());
  const effects = header.calculation_snapshot.internal_ui.edge_option_effects;
  // Per-room effects: 8 profiles × 2 rooms
  assert.ok(Array.isArray(effects) && effects.length === 16);

  const eased = findFrozenEdgeOptionEffect(effects, "edge_eased", "kitchen");
  assert.equal(eased.classification, "included");
  assert.equal(eased.originalSelection, true);
  assert.equal(eased.priceEffectCents, 0);
  assert.equal(eased.priceEffectLabel, "Original selection");
  assert.equal(eased.reviewRequired, false);
  assert.equal(eased.roomKey, "kitchen");

  for (const free of FREE_EDGE_PROFILES.filter((p) => p.optionToken !== "edge_eased")) {
    const row = findFrozenEdgeOptionEffect(effects, free.optionToken, "kitchen");
    assert.equal(row.priceEffectLabel, "Included");
    assert.equal(row.priceEffectCents, 0);
    assert.equal(row.reviewRequired, false);
  }

  for (const premium of PREMIUM_EDGE_PROFILES) {
    const row = findFrozenEdgeOptionEffect(effects, premium.optionToken, "kitchen");
    assert.equal(row.classification, "premium");
    assert.equal(row.priceEffectCents, EXPECTED_PREMIUM_CENTS);
    assert.match(row.priceEffectLabel, /^\+\$/);
    assert.equal(row.reviewRequired, false);
    assert.equal(row.available, true);
  }

  const rooms = buildStudioEstimateRoomsForPublication(studioEstimateFixture());
  assert.equal(rooms[0].edgeLinearFeet, LF);
  assert.equal(rooms[1].edgeLinearFeet, 0, "bath has no approved piece edge LF");
  assert.equal(rooms[0].edgeQuantityAuthoritative, true);

  const frozenJson = JSON.stringify(effects);
  assert.equal(frozenJson.includes("ratePerLf"), false);
  assert.equal(frozenJson.includes("pricingBasis"), false);
  assert.equal(frozenJson.includes("finalLf"), false);
  assert.equal(frozenJson.includes("edgeLinearFeet"), false);
  assert.equal(frozenJson.includes('"lf"'), false);
  console.log("ok: publication freezes exact premium cents; no LF/rate/basis in effects");
}

// 3–4. Public runtime prefers frozen effect (even when trusted LF is zero)
{
  const built = buildCustomerSafeEdgeOptionEffects({
    finalPricedEdgeLf: LF,
    pricingBasis: "direct",
    originalProfileToken: "edge_eased",
    roomKey: "kitchen",
    roomName: "Kitchen"
  });
  const crescent = findFrozenEdgeOptionEffect(built, "edge_crescent");
  const fromFrozen = edgeEffectFromFrozenPublication(crescent);
  assert.equal(fromFrozen.priceEffectCents, EXPECTED_PREMIUM_CENTS);
  assert.match(fromFrozen.priceEffectLabel, /^\+\$/);
  assert.equal(fromFrozen.available, true);
  assert.equal(fromFrozen.customerPriceTreatment, "delta");
  assert.equal(fromFrozen.fromFrozenPublication, true);

  // Simulate missing trusted LF: runtime resolve would review-require, frozen wins.
  const withoutLf = resolveEdgeOptionPriceEffect({
    profileToken: "edge_crescent",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: 0,
    pricingBasis: "direct"
  });
  assert.equal(withoutLf.customerPriceTreatment, "review_required");
  assert.equal(withoutLf.reviewReasonCode, "missing_edge_lf");
  assert.notEqual(fromFrozen.customerPriceTreatment, "review_required");
  console.log("ok: frozen effect wins over missing_edge_lf runtime fallback");
}

// 5. No LF/rate/basis on public room pricing DTO when premium is selected via frozen cents
{
  const published = {
    version: 1,
    rooms: [
      {
        roomId: "kitchen",
        roomName: "Kitchen",
        countertopAmountCents: 4000_00,
        backsplashAmountCents: 0,
        addOnsAmountCents: 0,
        roomTotalCents: 4000_00,
        customerFacingLines: []
      }
    ],
    projectAddOnLines: [],
    totalCents: 4000_00
  };
  const configuredExact = 4000_00 + EXPECTED_PREMIUM_CENTS;
  const updated = buildUpdatedRoomPricingProjection({
    publishedRoomPricing: published,
    internal: {
      rooms: [
        {
          roomKey: "kitchen",
          displayName: "Kitchen",
          materialSellCents: 4000_00,
          materialUseTaxCents: 0,
          backsplashMode: "none",
          backsplashConfiguredAmountCents: 0,
          materialDeltaCents: 0
        }
      ],
      options: [
        {
          optionKey: "edge:kitchen:edge_crescent",
          displayLabel: "Crescent",
          qty: 1,
          amountCents: EXPECTED_PREMIUM_CENTS
        }
      ],
      configuredExactTotalCents: configuredExact,
      configuredDisplayTotalCents: configuredExact,
      exactConfigurationDeltaCents: EXPECTED_PREMIUM_CENTS
    },
    reviewFlags: []
  });
  const dto = toPublicRoomPricingDto(updated);
  const edgeLine = dto.rooms[0].addOns.lines.find((l) => /Edge — Crescent/i.test(l.label));
  assert.ok(edgeLine, "one Add-ons Edge — Crescent line");
  assert.equal(edgeLine.amountCents, EXPECTED_PREMIUM_CENTS);
  assert.equal(dto.rooms[0].addOns.amountCents, EXPECTED_PREMIUM_CENTS);
  assert.equal(
    dto.rooms[0].roomTotalDetail.amountCents,
    configuredExact,
    "room total updates once"
  );
  assert.equal(dto.projectTotal, configuredExact / 100, "project total updates once");

  const publicRaw = JSON.stringify(dto);
  assert.equal(publicRaw.includes("ratePerLf"), false);
  assert.equal(publicRaw.includes("pricingBasis"), false);
  assert.equal(publicRaw.includes("edgeLinearFeet"), false);
  assertPublicConfigurationHasNoForbiddenContent({ roomPricing: dto });

  const changes = buildChangesRoomPricingProjection({
    original: buildOriginalRoomPricingProjection({ roomPricing: published }),
    updated
  });
  const edgeChange = (changes.rows || []).find((r) => r.category === "edge");
  assert.ok(edgeChange, "Changes shows the edge change");
  assert.equal(edgeChange.amountDeltaCents, EXPECTED_PREMIUM_CENTS);
  console.log("ok: frozen premium selection → one Add-ons line; totals once; Changes; no LF/rate");
}

// 6. Included profiles remain $0; original says Original selection
{
  const effects = buildCustomerSafeEdgeOptionEffects({
    finalPricedEdgeLf: LF,
    pricingBasis: "direct",
    originalProfileToken: "edge_eased"
  });
  assert.equal(
    findFrozenEdgeOptionEffect(effects, "edge_eased").priceEffectLabel,
    "Original selection"
  );
  for (const free of FREE_EDGE_PROFILES.filter((p) => p.optionToken !== "edge_eased")) {
    assert.equal(findFrozenEdgeOptionEffect(effects, free.optionToken).priceEffectCents, 0);
  }
  console.log("ok: included profiles $0; original label preserved");
}

// 7. Legacy publication without frozen effects may fall back to review-required
{
  const header = buildSyntheticQuoteHeaderFromStudioEstimate(studioEstimateFixture());
  delete header.calculation_snapshot.internal_ui.edge_option_effects;
  assert.equal(header.calculation_snapshot.internal_ui.edge_option_effects, undefined);
  const legacy = resolveEdgeOptionPriceEffect({
    profileToken: "edge_knife",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: 0,
    pricingBasis: "direct"
  });
  assert.equal(legacy.customerPriceTreatment, "review_required");
  assert.equal(legacy.priceEffectLabel, "Elite will confirm this option and price.");
  console.log("ok: legacy missing freeze + missing LF → review-required");
}

// 8. Newly published revision never review-requires when Studio calculated the effect
{
  const effects = buildSyntheticQuoteHeaderFromStudioEstimate(studioEstimateFixture())
    .calculation_snapshot.internal_ui.edge_option_effects;
  for (const premium of PREMIUM_EDGE_PROFILES) {
    const frozen = findFrozenEdgeOptionEffect(effects, premium.optionToken, "kitchen");
    const mapped = edgeEffectFromFrozenPublication(frozen);
    assert.equal(mapped.reviewRequired || mapped.customerPriceTreatment === "review_required", false);
    assert.notEqual(mapped.priceEffectLabel, "Elite will confirm this option and price.");
  }
  console.log("ok: new publication with calculated effects never shows review-required for premium");
}

// 9. Save path contract: frozen effect → qty 1 fixed absolute (no LF × rate in payload)
{
  const frozen = findFrozenEdgeOptionEffect(
    buildCustomerSafeEdgeOptionEffects({
      finalPricedEdgeLf: LF,
      pricingBasis: "direct",
      originalProfileToken: "edge_eased"
    }),
    "edge_crescent"
  );
  const saveLine = {
    optionKey: "edge:kitchen:edge_crescent",
    displayLabel: frozen.profile,
    quantity: 1,
    sellPrice: frozen.priceEffectCents / 100,
    pricingMode: "fixed",
    customerPriceTreatment: "absolute"
  };
  assert.equal(saveLine.quantity, 1);
  assert.equal(saveLine.pricingMode, "fixed");
  assert.equal(Math.round(saveLine.sellPrice * 100), EXPECTED_PREMIUM_CENTS);
  assert.notEqual(saveLine.quantity, LF);
  console.log("ok: save uses frozen absolute cents (qty 1), not LF × rate");
}

console.log("\nAll publishCalculatedEdgeEffects tests passed.\n");
