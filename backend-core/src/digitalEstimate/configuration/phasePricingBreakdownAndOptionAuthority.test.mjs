/**
 * Digital Estimate pricing breakdown + option authority regressions.
 * Run: node backend-core/src/digitalEstimate/configuration/phasePricingBreakdownAndOptionAuthority.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildStudioEstimateRoomsForPublication,
  buildSyntheticQuoteHeaderFromStudioEstimate
} from "../../elite100EstimateStudio/studioEstimatePublicationAdapter.mjs";
import { buildPublicationFreezePayloads } from "../digitalEstimateSnapshot.mjs";
import {
  buildRoomPricingPublishSnapshot,
  normalizeFabricationAddOnsForSnapshot
} from "./roomPricingPublishSnapshot.mjs";
import {
  buildUpdatedRoomPricingProjection,
  buildOriginalRoomPricingProjection,
  buildChangesRoomPricingProjection,
  toPublicRoomPricingDto,
  toPublicChangesPricingDto,
  assertConfiguredBacksplashNoneIsZero
} from "./customerRoomPricingProjection.mjs";
import {
  calculateElite100ConfigDeltaV2,
  ELITE100_CONFIG_DELTA_ENGINE_ID_V2
} from "./elite100ConfigDeltaEngineV2.mjs";
import {
  FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT,
  FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT
} from "./approvedPricingFixtures.mjs";
import {
  resolveEdgeOptionPriceEffect,
  ALL_EDGE_PROFILES,
  FREE_EDGE_PROFILES,
  PREMIUM_EDGE_PROFILES
} from "../catalog/studioEdgeAuthority.mjs";
import { buildSideSplashOptionDefinitions } from "../catalog/digitalEstimateProductOptions.mjs";
import { customerPriceEffectLabel } from "../catalog/customerFacingCopy.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";

console.log("\nphasePricingBreakdownAndOptionAuthority.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";

function studioEstimateFixture() {
  return {
    id: "studio-est-1",
    organizationId: ORG,
    revision: 1,
    status: "approved",
    takeoffJobId: "takeoff-1",
    approval: {
      customerDisplayTotal: 5500,
      calculationFingerprint: "fp-1"
    },
    scope: {
      customerName: "Hosted Test",
      projectName: "Kitchen Remodel",
      materialGroup: "Group Promo",
      pricingBasis: "direct",
      physicalScopeSource: "takeoff",
      edgeLinearFeet: 0,
      edgeEligibleLinearFeet: 10.13,
      takeoffScopeSummary: { derivedOpenEdgeLf: 10.13 },
      edgeScopeAdjustmentLf: 0,
      addOns: { "qty-sink": 1 },
      customLineItems: [
        {
          name: "Trip charge",
          quantity: 1,
          unitPrice: 150,
          customerFacing: true,
          category: "Service"
        }
      ],
      customerCatalogPermissions: { edge: true, side_splash: true },
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          roomType: "Kitchen",
          included: true,
          countertopSqft: 40,
          backsplashSqft: 8,
          backsplashHeightMode: "standard",
          pieces: [
            {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              name: "Sink Run",
              pieceType: "counter",
              depthIn: 25.5,
              included: true,
              sideSplashLeftEligible: true,
              sideSplashRightEligible: true
            },
            {
              id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              name: "Left of Stove",
              pieceType: "counter",
              depthIn: 25.5,
              included: true,
              sideSplashLeftEligible: true,
              sideSplashRightEligible: false
            },
            {
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              name: "Right of Stove",
              pieceType: "counter",
              depthIn: 25.5,
              included: true,
              sideSplashLeftEligible: false,
              sideSplashRightEligible: true
            },
            {
              id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              name: "Peninsula",
              pieceType: "counter",
              depthIn: 36,
              included: true,
              sideSplashLeftEligible: true,
              sideSplashRightEligible: true
            },
            {
              id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              name: "Ineligible Island",
              pieceType: "counter",
              depthIn: 36,
              included: true,
              sideSplashLeftEligible: false,
              sideSplashRightEligible: false
            }
          ]
        }
      ]
    },
    calculationSnapshot: {
      fingerprint: "fp-1",
      pricingBasis: "direct",
      totals: { customerDisplayTotal: 5500 },
      fabrication: {
        addOns: { "qty-sink": 1 },
        customLineItems: [
          {
            name: "Trip charge",
            quantity: 1,
            unitPrice: 150,
            customerFacing: true,
            category: "Service"
          }
        ]
      }
    }
  };
}

// ---------------------------------------------------------------------------
// 1. Publication freezes pieces, edge LF, fabrication add-ons, pricingBasis
// ---------------------------------------------------------------------------
{
  const estimate = studioEstimateFixture();
  const rooms = buildStudioEstimateRoomsForPublication(estimate);
  assert.equal(rooms.length, 1);
  assert.ok(rooms[0].edgeLinearFeet > 10, "final priced edge LF frozen on room");
  assert.equal(rooms[0].pieces.length, 5);
  assert.equal(rooms[0].pieces[0].displayLabel, "Sink Run");
  assert.equal(rooms[0].pieces[0].name, "Sink Run");
  assert.equal(rooms[0].pieces[4].sideSplashEligible, false);

  const header = buildSyntheticQuoteHeaderFromStudioEstimate(estimate);
  const iu = header.calculation_snapshot.internal_ui;
  assert.equal(iu.pricing_basis, "direct");
  assert.equal(iu.fabrication_add_ons["qty-sink"], 1);
  assert.ok(iu.estimate_rooms[0].pieces[0].displayLabel === "Sink Run");

  const freeze = buildPublicationFreezePayloads({
    header,
    publishedAt: "2026-07-21T12:00:00.000Z",
    pricingValidThrough: "2026-08-20"
  });
  assert.ok(freeze.customerSnapshot.roomPricing, "roomPricing snapshot present");
  const snap = freeze.customerSnapshot.roomPricing;
  const kitchen = snap.rooms[0];
  assert.ok(kitchen.countertopAmountCents > 0, "Original Countertop renders");
  assert.ok(kitchen.backsplashAmountCents > 0, "Original Backsplash renders");
  assert.ok(
    kitchen.customerFacingLines.some((l) => /sink cutout|Kitchen Sink Cutouts/i.test(l.label)),
    "Original sink cutout renders"
  );
  assert.ok(
    kitchen.customerFacingLines.some((l) => /Customer-provided sink/i.test(l.label)),
    "Original sink product (customer-provided) renders"
  );
  assert.ok(
    snap.projectAddOnLines.some((l) => /Trip charge/i.test(l.label)),
    "Original trip charge renders"
  );
  assert.equal(
    kitchen.countertopAmountCents + kitchen.backsplashAmountCents + kitchen.addOnsAmountCents,
    kitchen.roomTotalCents
  );
  assert.equal(snap.totalCents, 5500_00);
  console.log("ok: Original freeze includes Countertop, Backsplash, sink, cutout, trip, totals");
}

// ---------------------------------------------------------------------------
// 2. Side-splash labels + eligibility
// ---------------------------------------------------------------------------
{
  const rooms = buildStudioEstimateRoomsForPublication(studioEstimateFixture());
  const opts = buildSideSplashOptionDefinitions({
    roomKey: "kitchen",
    pieces: rooms[0].pieces
  });
  const labels = [...new Set(opts.map((o) => o.compatibilityJson.pieceDisplayName))];
  assert.deepEqual(labels.sort(), [
    "Left of Stove",
    "Peninsula",
    "Right of Stove",
    "Sink Run"
  ]);
  assert.equal(
    opts.some((o) => /Ineligible/i.test(o.compatibilityJson.pieceDisplayName)),
    false
  );
  for (const opt of opts) {
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}/i.test(opt.displayLabel),
      false,
      "UUID must not appear in customer-visible displayLabel"
    );
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}/i.test(opt.compatibilityJson.pieceDisplayName),
      false,
      "UUID must not appear in pieceDisplayName"
    );
  }
  console.log("ok: side-splash modal uses estimator labels; ineligible runs omitted; no UUIDs in labels");
}

// ---------------------------------------------------------------------------
// 3. Edge option price effects — Included / Original / premium upcharge
// ---------------------------------------------------------------------------
{
  const lf = 10.13;
  const original = resolveEdgeOptionPriceEffect({
    profileToken: "edge_eased",
    originalProfileToken: "edge_eased",
    edgeLinearFeet: lf,
    pricingBasis: "direct"
  });
  assert.equal(original.priceEffectLabel, "Original selection");
  assert.equal(original.priceEffectCents, 0);

  for (const free of FREE_EDGE_PROFILES.filter((p) => p.optionToken !== "edge_eased")) {
    const effect = resolveEdgeOptionPriceEffect({
      profileToken: free.optionToken,
      originalProfileToken: "edge_eased",
      edgeLinearFeet: lf,
      pricingBasis: "direct"
    });
    assert.equal(effect.priceEffectLabel, "Included", free.label);
    assert.equal(effect.priceEffectCents, 0);
  }

  for (const premium of PREMIUM_EDGE_PROFILES) {
    const direct = resolveEdgeOptionPriceEffect({
      profileToken: premium.optionToken,
      originalProfileToken: "edge_eased",
      edgeLinearFeet: lf,
      pricingBasis: "direct"
    });
    assert.ok(direct.priceEffectCents > 0, `${premium.label} direct upcharge`);
    assert.match(direct.priceEffectLabel, /^\+\$/);
    assert.equal(direct.priceEffectCents, Math.round(25 * lf * 100));

    const wholesale = resolveEdgeOptionPriceEffect({
      profileToken: premium.optionToken,
      originalProfileToken: "edge_eased",
      edgeLinearFeet: lf,
      pricingBasis: "wholesale"
    });
    assert.equal(wholesale.priceEffectCents, Math.round(15 * lf * 100));
  }

  assert.equal(ALL_EDGE_PROFILES.length, 8);
  assert.equal(
    customerPriceEffectLabel({
      customerPriceTreatment: "included_alternate",
      edgeTier: "free",
      visibleDelta: 0
    }),
    "Included"
  );
  console.log("ok: edge Included / Original selection / premium Direct+Wholesale upcharges");
}

// ---------------------------------------------------------------------------
// 4. No backsplash invariant + material-group shared rate (Promo → F)
// ---------------------------------------------------------------------------
{
  const rates = {
    direct: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT },
    wholesale: { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT }
  };
  const baseInput = (basis, selectedGroup, backsplashMode) => ({
    organizationId: ORG,
    publication: { id: "pub-1", snapshotId: "snap-1", status: "active", quoteFamilyRootId: "fam-1" },
    envelope: { id: "env-1", version: 1, status: "active", publicationId: "pub-1" },
    pricingPolicyFingerprint: "pf",
    catalogFingerprint: "cf",
    engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID_V2,
    pricingBasis: basis,
    materialProgram: "elite_100",
    frozenBaseRates: rates,
    rooms: [
      {
        roomKey: "kitchen",
        displayName: "Kitchen",
        chargeableCounterSf: 40,
        selectedMaterialGroup: selectedGroup,
        baselineMaterialGroup: "promo",
        backsplashMode,
        baselineBacksplashMode: "standard_4in",
        backsplashConfiguredBilledSf: backsplashMode === "none" ? 0 : 8,
        backsplashOriginalBilledSf: 8,
        backsplashBaselineAmountCents: null,
        backsplashReviewCodes: []
      }
    ],
    lockedScope: { edgeLinearFeetTotal: 10.13 },
    baseline: {
      exactTotal: 5000,
      displayTotal: 5000,
      rooms: [{ roomKey: "kitchen", materialGroup: "promo" }]
    },
    options: [],
    customLines: [],
    credits: [],
    accountMemberships: [],
    materialRateOverrides: [],
    estimateAdjustments: [],
    partnerAccountId: null,
    authorizedMaterialMarkup: { bps: 0 },
    materialTaxPolicy: { bps: 200 },
    asOf: "2026-07-21T12:00:00.000Z"
  });

  for (const basis of ["direct", "wholesale"]) {
    const promo4 = calculateElite100ConfigDeltaV2(baseInput(basis, "promo", "standard_4in"));
    const groupF4 = calculateElite100ConfigDeltaV2(baseInput(basis, "group_f", "standard_4in"));
    const groupFNone = calculateElite100ConfigDeltaV2(baseInput(basis, "group_f", "none"));

    const promoRoom = promo4.internal.rooms[0];
    const fRoom = groupF4.internal.rooms[0];
    const noneRoom = groupFNone.internal.rooms[0];

    assert.equal(fRoom.selectedMaterialGroup, "group_f", `${basis}: configured group is Group F`);
    // Countertop and Backsplash share the same configured room rate.
    assert.equal(fRoom.resolution.finalRateCents, noneRoom.resolution.finalRateCents);
    assert.ok(
      fRoom.backsplashConfiguredAmountCents > promoRoom.backsplashConfiguredAmountCents,
      `${basis}: Group F backsplash > Promo backsplash`
    );
    assert.ok(
      fRoom.materialSellCents > promoRoom.materialSellCents,
      `${basis}: Group F countertop > Promo countertop`
    );
    assert.equal(noneRoom.backsplashConfiguredAmountCents, 0);
    const bsDelta = groupFNone.internal.backsplashGroupDeltas?.[0]?.exactBacksplashDeltaCents;
    assert.ok(bsDelta < 0, `${basis}: backsplash removal delta must be negative`);
    // Material upgrade Promo→F can outweigh backsplash removal in the net project
    // delta; the category-level removal credit must still be exact and negative.
    const removalOnly = calculateElite100ConfigDeltaV2(baseInput(basis, "promo", "none"));
    assert.ok(removalOnly.internal.exactConfigurationDeltaCents < 0);

    const published = buildRoomPricingPublishSnapshot({
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          countertopSqft: 40,
          backsplashSqft: 8,
          backsplashHeightMode: "standard",
          materialGroup: "Group Promo"
        }
      ],
      customLineItems: [],
      fabricationAddOns: { "qty-sink": 1 },
      customerDisplayTotalCents: Math.trunc(Number(promo4.internal.baselineExactTotalCents)),
      createdAt: "2026-07-21T12:00:00.000Z"
    });

    const updatedNone = buildUpdatedRoomPricingProjection({
      internal: {
        ...groupFNone.internal,
        frozenBaselineAnchor: true,
        rooms: groupFNone.internal.rooms.map((r) => ({
          ...r,
          backsplashBaselineAmountCents: published.rooms[0].backsplashAmountCents
        }))
      },
      publishedRoomPricing: published
    });
    assert.equal(updatedNone.rooms[0].backsplashAmountCents, 0);
    assertConfiguredBacksplashNoneIsZero(updatedNone.rooms[0]);
    assert.throws(
      () =>
        assertConfiguredBacksplashNoneIsZero({
          backsplashMode: "none",
          backsplashAmountCents: 100,
          roomId: "kitchen"
        }),
      /configured_backsplash_none_nonzero/
    );

    const publicUpdated = toPublicRoomPricingDto(updatedNone);
    assert.equal(publicUpdated.rooms[0].backsplashAmount, 0);
    assert.equal(publicUpdated.rooms[0].backsplash.displayAmount, 0);
    assert.equal(publicUpdated.rooms[0].backsplash.mode, "none");
    const raw = JSON.stringify(publicUpdated);
    for (const bad of ["billedSf", "ratePerLf", "pricingBasis", "eligibleLf", "measuredSf"]) {
      assert.equal(raw.includes(bad), false, `leaked ${bad}`);
    }

    const original = buildOriginalRoomPricingProjection({ roomPricing: published });
    const changes = buildChangesRoomPricingProjection({ original, updated: updatedNone });
    const bsRow = changes.rows.find((r) => r.category === "backsplash");
    assert.ok(bsRow);
    assert.equal(bsRow.status, "removed");
    assert.ok(bsRow.amountDeltaCents < 0);

    console.log(`ok: ${basis} Promo→F shares configured rate; none stays $0; Changes shows removal`);
  }
}

// ---------------------------------------------------------------------------
// 5. Normalized contract + public redaction
// ---------------------------------------------------------------------------
{
  const snap = buildRoomPricingPublishSnapshot({
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        countertopSqft: 40,
        backsplashSqft: 8,
        backsplashHeightMode: "standard",
        materialGroup: "Group Promo"
      }
    ],
    customLineItems: [
      {
        name: "Hidden broker holdback",
        quantity: 1,
        unitPrice: 100,
        customerFacing: false,
        category: "Internal"
      },
      {
        name: "Trip charge",
        quantity: 1,
        unitPrice: 150,
        customerFacing: true
      }
    ],
    fabricationAddOns: { "qty-sink": 1 },
    customerDisplayTotalCents: 5500_00
  });
  const original = buildOriginalRoomPricingProjection({ roomPricing: snap });
  const dto = toPublicRoomPricingDto(original);
  assert.ok(dto.rooms[0].countertop);
  assert.ok(dto.rooms[0].backsplash);
  assert.ok(dto.rooms[0].addOns);
  assert.ok(dto.rooms[0].addOns.lines.some((l) => /Sink/i.test(l.label)));
  assert.ok(dto.projectAddOns.some((l) => /Trip charge/i.test(l.label)));
  const raw = JSON.stringify(dto);
  assert.equal(raw.includes("Hidden broker"), false);
  assert.equal(raw.includes("customLineAllocations"), false);
  assert.equal(raw.includes("allocatedCents"), false);
  assertPublicConfigurationHasNoForbiddenContent({ roomPricing: dto });
  console.log("ok: normalized Original contract; hidden lines redacted; forbidden guard passes");
}

// ---------------------------------------------------------------------------
// 6. Fabrication add-on normalizer room ownership
// ---------------------------------------------------------------------------
{
  const lines = normalizeFabricationAddOnsForSnapshot(
    { "qty-sink": 1, "qty-ss": 1 },
    [{ roomId: "kitchen", roomName: "Kitchen", roomType: "Kitchen" }]
  );
  assert.ok(lines.some((l) => l.category === "sink_cutout"));
  assert.ok(lines.some((l) => l.category === "sink" && /Stainless/i.test(l.label)));
  assert.equal(
    lines.some((l) => /Customer-provided/i.test(l.label)),
    false,
    "ESF sink present → no customer-provided placeholder"
  );
  console.log("ok: fabrication add-ons normalize into room-owned sink + cutout lines");
}

console.log("\nAll phasePricingBreakdownAndOptionAuthority tests passed.\n");
