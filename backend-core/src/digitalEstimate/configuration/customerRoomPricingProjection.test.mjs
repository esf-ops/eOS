/**
 * Authoritative room-level customer pricing projection — tests.
 * Run: node backend-core/src/digitalEstimate/configuration/customerRoomPricingProjection.test.mjs
 */
import assert from "node:assert/strict";
import { calculateElite100ConfigDeltaV2, ELITE100_CONFIG_DELTA_ENGINE_ID_V2 } from "./elite100ConfigDeltaEngineV2.mjs";
import {
  FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT,
  FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT
} from "./approvedPricingFixtures.mjs";
import {
  buildUpdatedRoomPricingProjection,
  buildOriginalRoomPricingProjection,
  buildChangesRoomPricingProjection,
  toPublicRoomPricingDto,
  toPublicChangesPricingDto,
  toInternalQueueWorkspaceSummary,
  mapLegacyLineToRoom
} from "./customerRoomPricingProjection.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";
import { assertPublicDtoHasNoForbiddenContent } from "../digitalEstimatePublicSerializer.mjs";
import { BACKSPLASH_REVIEW_CODES } from "./backsplashPricingAuthority.mjs";

console.log("\ncustomerRoomPricingProjection.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const PUB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SNAP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ENV = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function rates() {
  return {
    direct: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT },
    wholesale: { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT }
  };
}

function baseInputV2(overrides = {}) {
  return {
    organizationId: ORG,
    publication: { id: PUB, snapshotId: SNAP, status: "active" },
    envelope: { id: ENV, version: 1, status: "active", publicationId: PUB },
    pricingPolicyFingerprint: "policy-fp-v2",
    catalogFingerprint: "catalog-fp-v2",
    engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID_V2,
    pricingBasis: "direct",
    materialProgram: "elite_100",
    frozenBaseRates: rates(),
    rooms: [
      { roomKey: "kitchen", displayName: "Kitchen", chargeableCounterSf: 40, selectedMaterialGroup: "promo", baselineMaterialGroup: "promo" },
      { roomKey: "powder", displayName: "Powder Bath", chargeableCounterSf: 6, selectedMaterialGroup: "group_a", baselineMaterialGroup: "group_a" }
    ],
    baseline: {
      exactTotal: 4200,
      displayTotal: 4200,
      rooms: [
        { roomKey: "kitchen", materialGroup: "promo" },
        { roomKey: "powder", materialGroup: "group_a" }
      ]
    },
    materialTaxPolicy: { bps: 200 },
    authorizedMaterialMarkup: { bps: 0 },
    options: [],
    customLines: [],
    credits: [],
    accountMemberships: [],
    materialRateOverrides: [],
    estimateAdjustments: [],
    partnerAccountId: null,
    asOf: "2026-07-21T12:00:00.000Z",
    ...overrides
  };
}

function assertNoOptionKeysOrSfLf(dto) {
  const raw = JSON.stringify(dto);
  assert.ok(!/optionKey/i.test(raw), `unexpected optionKey in public DTO: ${raw}`);
  assert.ok(!/\bsf\b/i.test(raw), `unexpected SF token in public DTO: ${raw}`);
  assert.ok(!/\blf\b/i.test(raw), `unexpected LF token in public DTO: ${raw}`);
  assert.ok(!/chargeableCounterSf|edgeLinearFeet/i.test(raw));
}

// 1-2. No-op save: two rooms, stable roomId/name, no options
{
  const r = calculateElite100ConfigDeltaV2(baseInputV2());
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal, reviewFlags: [] });
  assert.equal(updated.rooms.length, 2);
  assert.deepEqual(updated.rooms.map((x) => x.roomId), ["kitchen", "powder"]);
  assert.deepEqual(updated.rooms.map((x) => x.roomName), ["Kitchen", "Powder Bath"]);
  assert.equal(updated.reconciliationStatus, "reconciled");
  assert.equal(updated.rooms[0].materialDeltaCents, 0);
  assert.equal(updated.rooms[0].attributionStatus, "proportional_allocation_of_baseline");
  console.log("ok: stable roomId/name; no-op save reconciles with $0 deltas");
}

// 3. Room total equals component amounts (invariant, item 18)
{
  const r = calculateElite100ConfigDeltaV2(baseInputV2());
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  for (const room of updated.rooms) {
    assert.equal(
      room.roomTotalCents,
      room.countertopAmountCents + (room.backsplashAmountCents ?? 0) + room.addOnsAmountCents
    );
  }
  console.log("ok: roomTotal = countertop + backsplash + add-ons for every room");
}

// 4. Configured total equals rooms plus project-level charges (item 19)
{
  const r = calculateElite100ConfigDeltaV2(
    baseInputV2({
      options: [
        {
          optionKey: "sink:kitchen:esf:blanco:inteos-33",
          displayLabel: "ESF Sink — Inteos 33\" Workstation",
          quantity: 1,
          sellPrice: 900,
          pricingMode: "per_each",
          customerPriceTreatment: "absolute",
          availabilityState: "active",
          includedInBaseline: false
        },
        {
          optionKey: "qty-sink:kitchen",
          displayLabel: "Kitchen — Sink cutout",
          quantity: 1,
          sellPrice: 150,
          pricingMode: "per_each",
          customerPriceTreatment: "absolute",
          availabilityState: "active",
          includedInBaseline: false
        },
        {
          optionKey: "faucet:kitchen:esf:moen:align",
          displayLabel: "Moen Align",
          quantity: 1,
          sellPrice: 320,
          pricingMode: "per_each",
          customerPriceTreatment: "absolute",
          availabilityState: "active",
          includedInBaseline: false
        },
        {
          optionKey: "edge:powder:eased",
          displayLabel: "Eased edge",
          quantity: 6,
          sellPrice: 5,
          pricingMode: "per_each",
          customerPriceTreatment: "absolute",
          availabilityState: "active",
          includedInBaseline: false
        }
      ],
      customLines: [{ key: "delivery", label: "Delivery", amount: 75, customerFacing: true }]
    })
  );
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  const kitchen = updated.rooms.find((x) => x.roomId === "kitchen");
  const powder = updated.rooms.find((x) => x.roomId === "powder");
  assert.equal(kitchen.addOnsAmountCents, 900_00 + 150_00 + 320_00);
  assert.equal(powder.addOnsAmountCents, 30_00);
  assert.equal(
    updated.roomSubtotalCents + updated.projectAddOnsTotalCents + updated.governedAdjustmentsCents,
    updated.configuredExactTotalCents
  );
  assert.equal(updated.reconciliationStatus, "reconciled");
  console.log("ok: configured total reconciles exactly to rooms + project-level charges (item 19)");
}

// 5. Sink product, cutout, faucet, accessories, edge, side splash each appear exactly once
{
  const r = calculateElite100ConfigDeltaV2(
    baseInputV2({
      options: [
        { optionKey: "sink:kitchen:esf:blanco:inteos-33", displayLabel: "ESF Sink — Inteos 33\"", quantity: 1, sellPrice: 900, pricingMode: "per_each", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false },
        { optionKey: "qty-sink:kitchen", displayLabel: "Kitchen — Sink cutout", quantity: 1, sellPrice: 150, pricingMode: "per_each", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false },
        { optionKey: "faucet:kitchen:esf:moen:align", displayLabel: "Moen Align", quantity: 1, sellPrice: 320, pricingMode: "per_each", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false },
        { optionKey: "accessory:kitchen:esf:blanco:grid", displayLabel: "Sink grid", quantity: 1, sellPrice: 60, pricingMode: "per_each", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false },
        { optionKey: "edge:kitchen:mitered", displayLabel: "Mitered edge", quantity: 10, sellPrice: 8, pricingMode: "per_each", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false },
        { optionKey: "sidesplash:kitchen:piece-1:left", displayLabel: "Side splash", quantity: 1, sellPrice: 45, pricingMode: "fixed", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false },
        { optionKey: "specialty:kitchen:esf:elkay:soap", displayLabel: "Soap dispenser", quantity: 1, sellPrice: 40, pricingMode: "per_each", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false }
      ]
    })
  );
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  const kitchen = updated.rooms.find((x) => x.roomId === "kitchen");
  const categories = kitchen.customerFacingLines.map((l) => l.category);
  for (const cat of ["sink", "sink_cutout", "faucet", "accessories", "edge", "side_splash", "specialty"]) {
    assert.equal(categories.filter((c) => c === cat).length, 1, `expected exactly one ${cat} line, got ${categories.filter((c) => c === cat).length}`);
  }
  assert.equal(kitchen.selectedSink, "ESF Sink — Inteos 33\"");
  assert.equal(kitchen.selectedFaucet, "Moen Align");
  assert.equal(kitchen.selectedEdge, "Mitered edge");
  assert.deepEqual(kitchen.selectedAccessories, ["Sink grid"]);
  assert.deepEqual(kitchen.selectedSpecialtyItems, ["Soap dispenser"]);
  console.log("ok: sink/cutout/faucet/accessory/edge/side-splash/specialty each appear exactly once, correctly room-attributed");
}

// 6. Customer-provided sink has no ESF product charge; No sink has no cutout (by absence of options)
{
  const r = calculateElite100ConfigDeltaV2(
    baseInputV2({
      options: [
        { optionKey: "sink:kitchen:customer_provided", displayLabel: "Customer-provided sink", quantity: 1, sellPrice: 0, pricingMode: "per_each", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false },
        { optionKey: "qty-sink:kitchen", displayLabel: "Kitchen — Sink cutout", quantity: 1, sellPrice: 150, pricingMode: "per_each", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false }
      ]
    })
  );
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  const kitchen = updated.rooms.find((x) => x.roomId === "kitchen");
  assert.equal(kitchen.selectedSink, "Customer-provided sink");
  const sinkProductLines = kitchen.customerFacingLines.filter((l) => l.category === "sink");
  assert.equal(sinkProductLines.length, 1);
  assert.equal(sinkProductLines[0].amountCents, 0, "customer-provided sink must carry no ESF product charge");
  const cutoutLines = kitchen.customerFacingLines.filter((l) => l.category === "sink_cutout");
  assert.equal(cutoutLines.length, 1);
  assert.equal(cutoutLines[0].amountCents, 150_00);
  const powder = updated.rooms.find((x) => x.roomId === "powder");
  assert.equal(powder.customerFacingLines.filter((l) => l.category === "sink_cutout").length, 0);
  console.log("ok: customer-provided sink has no ESF product charge; room without a sink has no cutout");
}

// 7. Backsplash review-required flag: amount null, room total still reconciles (no fabricated price).
// Sourced from the room's own governed backsplashReviewCodes (backsplashPricingAuthority.mjs +
// elite100ConfigDeltaEngineV2.mjs), not a flat legacy reviewFlags string.
{
  const r = calculateElite100ConfigDeltaV2(
    baseInputV2({
      rooms: [
        {
          roomKey: "kitchen",
          displayName: "Kitchen",
          chargeableCounterSf: 40,
          selectedMaterialGroup: "promo",
          baselineMaterialGroup: "promo",
          backsplashMode: "full_height",
          baselineBacksplashMode: "standard_4in",
          backsplashReviewCodes: [BACKSPLASH_REVIEW_CODES.FULL_HEIGHT_MEASUREMENT_REQUIRED],
          backsplashConfiguredBilledSf: null
        },
        { roomKey: "powder", displayName: "Powder Bath", chargeableCounterSf: 6, selectedMaterialGroup: "group_a", baselineMaterialGroup: "group_a" }
      ]
    })
  );
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  const kitchen = updated.rooms.find((x) => x.roomId === "kitchen");
  assert.equal(kitchen.backsplashAmountCents, null);
  assert.equal(kitchen.reviewRequiredItems.length, 1);
  assert.equal(kitchen.reviewRequiredItems[0].category, "backsplash");
  assert.equal(kitchen.reviewRequiredItems[0].code, BACKSPLASH_REVIEW_CODES.FULL_HEIGHT_MEASUREMENT_REQUIRED);
  assert.equal(kitchen.roomTotalCents, kitchen.countertopAmountCents + kitchen.addOnsAmountCents);
  assert.equal(updated.reconciliationStatus, "review_required");
  console.log("ok: full-height backsplash flags review-required without inventing a price; still reconciles");
}

// 8. Reconciliation failure is explicit, never silently adjusted
{
  const r = calculateElite100ConfigDeltaV2(baseInputV2());
  const tampered = { ...r.internal, configuredExactTotalCents: r.internal.configuredExactTotalCents + 1 };
  const updated = buildUpdatedRoomPricingProjection({ internal: tampered });
  assert.equal(updated.reconciliationStatus, "failed");
  assert.ok(updated.diagnostics);
  assert.equal(updated.diagnostics.diffCents, -1);
  console.log("ok: reconciliation failure is explicit (reconciliationStatus=failed + diagnostics), no silent adjustment");
}

// 9. Integer-cent math throughout; rounding matches authoritative total
{
  const r = calculateElite100ConfigDeltaV2(baseInputV2());
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  for (const room of updated.rooms) {
    assert.ok(Number.isInteger(room.countertopAmountCents));
    assert.ok(Number.isInteger(room.roomTotalCents));
  }
  assert.ok(Number.isInteger(updated.configuredExactTotalCents));
  assert.equal(updated.configuredDisplayTotalCents, r.internal.configuredDisplayTotalCents);
  console.log("ok: integer-cent math throughout; display rounding matches authoritative total");
}

// 10. Public DTO never exposes option keys, SF/LF, or internal pricing evidence
{
  const r = calculateElite100ConfigDeltaV2(
    baseInputV2({
      options: [
        { optionKey: "sink:kitchen:esf:blanco:inteos-33", displayLabel: "ESF Sink — Inteos 33\"", quantity: 1, sellPrice: 900, pricingMode: "per_each", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false }
      ]
    })
  );
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  const dto = toPublicRoomPricingDto(updated);
  assertNoOptionKeysOrSfLf(dto);
  assertPublicConfigurationHasNoForbiddenContent(dto);
  assertPublicDtoHasNoForbiddenContent(dto);
  assert.equal(dto.rooms[0].countertopAmount, updated.rooms[0].countertopAmountCents / 100);
  console.log("ok: public room pricing DTO is customer-safe (no option keys, SF/LF, cost/margin/tax/spahn)");
}

// 11. Original projection: rooms not currently attributable, but never fabricates a number
{
  const original = buildOriginalRoomPricingProjection({
    rooms: [
      { name: "Kitchen", materialLabel: "Group B", colorLabel: "Bayshore Sand" },
      { name: "Powder Bath", materialLabel: "Group A", colorLabel: null }
    ],
    lineItems: [
      { label: "Kitchen Sink Cutouts", amount: 150 },
      { label: "Vanity/Bar Sink Cutouts", amount: 90 },
      { label: "Estimated project total", amount: 4200 }
    ],
    totals: { estimatedProjectTotal: 4200 }
  });
  assert.equal(original.rooms.length, 2);
  assert.equal(original.rooms[0].countertopAmountCents, null);
  assert.equal(original.rooms[0].attributionStatus, "not_currently_attributable");
  assert.equal(original.reconciliationStatus, "not_attributable");
  // "Kitchen Sink Cutouts" unambiguously maps to Kitchen; "Vanity/Bar..." does not map to any known room name
  assert.equal(original.rooms[0].addOnsAmountCents, 150_00);
  assert.ok(original.unresolvedLegacyLines.includes("Vanity/Bar Sink Cutouts"));
  assert.equal(original.projectTotalCents, 420000);
  console.log("ok: Original projection never fabricates room countertop/backsplash $; maps only unambiguous legacy lines");
}

// 12. mapLegacyLineToRoom is deterministic and rejects ambiguity
{
  assert.equal(mapLegacyLineToRoom("Kitchen Sink Cutouts", ["Kitchen", "Powder Bath"]), "Kitchen");
  assert.equal(mapLegacyLineToRoom("ESF Stainless Kitchen Sink", ["Kitchen"]), "Kitchen");
  assert.equal(mapLegacyLineToRoom("Vanity/Bar Sink Cutouts", ["Kitchen", "Powder Bath"]), null);
  assert.equal(
    mapLegacyLineToRoom("Powder Bath Sink Cutouts", ["Powder", "Powder Bath"]),
    null,
    "a label matched by two distinct room names must not auto-map"
  );
  console.log("ok: legacy line → room mapping is deterministic and rejects ambiguous matches");
}

// 13. Changes projection shows original → updated with customer-facing labels, no option keys
{
  const r = calculateElite100ConfigDeltaV2(
    baseInputV2({
      rooms: [{ roomKey: "kitchen", displayName: "Kitchen", chargeableCounterSf: 40, selectedMaterialGroup: "group_b", baselineMaterialGroup: "promo" }],
      baseline: { exactTotal: 2800, displayTotal: 2800, rooms: [{ roomKey: "kitchen", materialGroup: "promo" }] },
      options: [
        { optionKey: "sink:kitchen:esf:blanco:inteos-33", displayLabel: "ESF Sink — Inteos 33\" · Coal Black", quantity: 1, sellPrice: 900, pricingMode: "per_each", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false },
        { optionKey: "qty-sink:kitchen", displayLabel: "Kitchen — Sink cutout", quantity: 1, sellPrice: 150, pricingMode: "per_each", customerPriceTreatment: "absolute", availabilityState: "active", includedInBaseline: false }
      ]
    })
  );
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  const original = buildOriginalRoomPricingProjection({
    rooms: [{ name: "Kitchen", materialLabel: "Group Promo" }],
    lineItems: [],
    totals: { estimatedProjectTotal: 2800 }
  });
  const changes = buildChangesRoomPricingProjection({ original, updated });
  const materialRow = changes.rows.find((row) => row.category === "material");
  assert.ok(materialRow);
  assert.equal(materialRow.originalLabel, "promo");
  assert.equal(materialRow.updatedLabel, "group_b");
  const sinkRow = changes.rows.find((row) => row.category === "sink");
  assert.equal(sinkRow.status, "new_selection");
  assert.equal(sinkRow.originalLabel, "Not selected");
  assert.ok(sinkRow.updatedLabel.includes("Inteos"));
  const dto = toPublicChangesPricingDto(changes);
  assertNoOptionKeysOrSfLf(dto);
  assert.ok(!/qty-sink|sink:kitchen:esf/i.test(JSON.stringify(dto)));
  console.log("ok: Changes projection shows original → updated with customer-facing labels, no raw option keys");
}

// 14. Internal Queue/Workspace summary omits per-room/option detail
{
  const r = calculateElite100ConfigDeltaV2(baseInputV2());
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  const summary = toInternalQueueWorkspaceSummary(updated, {
    lastSavedAt: "2026-07-21T00:00:00Z",
    missingInformationCount: 2,
    pricingValidThrough: "2026-08-20",
    snapshotVersion: "v1",
    snapshotAvailability: "available"
  });
  assert.deepEqual(Object.keys(summary).sort(), [
    "backsplashPricingStatus",
    "changedRoomCount",
    "configuredTotal",
    "delta",
    "lastSavedAt",
    "missingInformationCount",
    "originalTotal",
    "pricingValidThrough",
    "reconciliationStatus",
    "reviewRequiredCount",
    "roomCount",
    "snapshotAvailability",
    "snapshotVersion",
    "unresolvedPricingCount"
  ]);
  assert.equal(summary.roomCount, 2);
  assert.equal(summary.missingInformationCount, 2);
  assert.equal(summary.pricingValidThrough, "2026-08-20");
  assert.equal(summary.snapshotVersion, "v1");
  assert.equal(summary.snapshotAvailability, "available");
  assert.equal(summary.backsplashPricingStatus, "priced");
  assert.equal(summary.unresolvedPricingCount, 0);
  console.log("ok: internal Queue/Workspace summary is a flat, option-key-free top-line projection");
}

// 15. Latest saved selection only — pending browser state is never part of this module's input surface
{
  // The module only accepts an already-computed `internal` result and reviewFlags — there is no
  // browser/session/draft parameter anywhere in its API, so unsaved client state structurally
  // cannot leak into the projection.
  const src = await import("node:fs").then((m) => m.readFileSync(new URL("./customerRoomPricingProjection.mjs", import.meta.url), "utf8"));
  assert.ok(!/localStorage|sessionStorage|browserPayload|clientClaims/i.test(src));
  console.log("ok: module surface excludes any pending/browser-state input by construction");
}

// 16. Original total matches frozen publication; updated total matches the Brain calculation exactly
{
  const r = calculateElite100ConfigDeltaV2(baseInputV2());
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  const original = buildOriginalRoomPricingProjection({
    rooms: [{ name: "Kitchen" }, { name: "Powder Bath" }],
    lineItems: [],
    totals: { estimatedProjectTotal: 4200 }
  });
  assert.equal(original.projectTotalCents, 420000);
  assert.equal(updated.originalTotalCents, 420000);
  assert.equal(updated.configuredExactTotalCents, r.internal.configuredExactTotalCents);
  assert.equal(updated.configuredExactTotalCents, r.totals.configuredExactTotal * 100);
  console.log("ok: Original total matches frozen publication; Updated total matches the Brain calculation exactly");
}

// 17. Standalone (non-anchor) mode: no baseline provided — countertop uses the engine's absolute
// reprice directly (no proportional allocation needed/possible) and still reconciles exactly.
{
  const r = calculateElite100ConfigDeltaV2(baseInputV2({ baseline: undefined }));
  assert.equal(r.internal.frozenBaselineAnchor, false);
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  assert.equal(updated.rooms[0].attributionStatus, "absolute_reprice");
  assert.equal(updated.reconciliationStatus, "reconciled");
  assert.equal(
    updated.roomSubtotalCents + updated.projectAddOnsTotalCents + updated.governedAdjustmentsCents,
    updated.configuredExactTotalCents
  );
  console.log("ok: standalone (non-anchor) mode reconciles exactly using the engine's own absolute reprice");
}

// 18. Project-level add-on / option remains project-level, not attributed to any room
{
  const r = calculateElite100ConfigDeltaV2(
    baseInputV2({
      options: [
        {
          optionKey: "project-wide-delivery-surcharge",
          displayLabel: "Delivery surcharge",
          quantity: 1,
          sellPrice: 50,
          pricingMode: "per_each",
          customerPriceTreatment: "absolute",
          availabilityState: "active",
          includedInBaseline: false
        }
      ]
    })
  );
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  assert.equal(updated.projectLevelOptionsCents, 5000);
  for (const room of updated.rooms) {
    assert.equal(room.addOnsAmountCents, 0);
  }
  assert.equal(updated.reconciliationStatus, "reconciled");
  console.log("ok: an option with no room-attributable key stays project-level and is never assigned to a room");
}

// 19. Regression (DE.Polish-3): a room whose frozen baseline total already implicitly
// includes an unchanged, governed backsplash amount must NOT have that amount counted
// twice (once folded into the SF-weighted "Countertop" baseline allocation, and again as
// the separately-priced "Backsplash" line). roomTotal must equal the room's exact
// proportional share of the frozen baseline total, with countertop+backsplash summing
// back to that share exactly, for every room — never inflating the project total.
{
  const r = calculateElite100ConfigDeltaV2(
    baseInputV2({
      rooms: [
        {
          roomKey: "kitchen",
          displayName: "Kitchen",
          chargeableCounterSf: 40,
          selectedMaterialGroup: "promo",
          baselineMaterialGroup: "promo",
          backsplashMode: "standard_4in",
          baselineBacksplashMode: "standard_4in",
          backsplashReviewCodes: [],
          backsplashOriginalBilledSf: 8,
          backsplashConfiguredBilledSf: 8
        },
        { roomKey: "powder", displayName: "Powder Bath", chargeableCounterSf: 6, selectedMaterialGroup: "group_a", baselineMaterialGroup: "group_a" }
      ]
    })
  );
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  const kitchen = updated.rooms.find((x) => x.roomId === "kitchen");
  assert.ok(kitchen.backsplashAmountCents > 0, "unchanged 4-inch backsplash must still price a real amount");
  assert.equal(
    kitchen.countertopAmountCents + kitchen.backsplashAmountCents + kitchen.addOnsAmountCents,
    kitchen.roomTotalCents
  );
  assert.equal(
    updated.roomSubtotalCents + updated.projectAddOnsTotalCents + updated.governedAdjustmentsCents,
    updated.configuredExactTotalCents,
    "no-op save with an unchanged baked-in backsplash must reconcile exactly — never double-count"
  );
  assert.equal(updated.reconciliationStatus, "reconciled");
  // The frozen baseline total is unchanged (no mode/material change) so the project total
  // must equal the baseline exactly — proof the backsplash dollars were not added twice.
  assert.equal(updated.configuredExactTotalCents, updated.originalTotalCents);
  console.log("ok: unchanged baked-in backsplash is never double-counted between Countertop and Backsplash");
}

// 20. Regression: when the configured backsplash amount is unresolved (review-required),
// the room total still carries the known baseline backsplash dollars forward unchanged
// (mirrors the engine's own "delta stays 0 when unresolved" rule) rather than silently
// dropping money out of the room total while still charging it project-wide.
{
  const r = calculateElite100ConfigDeltaV2(
    baseInputV2({
      rooms: [
        {
          roomKey: "kitchen",
          displayName: "Kitchen",
          chargeableCounterSf: 40,
          selectedMaterialGroup: "promo",
          baselineMaterialGroup: "promo",
          backsplashMode: "full_height",
          baselineBacksplashMode: "standard_4in",
          backsplashReviewCodes: ["full_height_measurement_required"],
          backsplashOriginalBilledSf: 8,
          backsplashConfiguredBilledSf: null
        },
        { roomKey: "powder", displayName: "Powder Bath", chargeableCounterSf: 6, selectedMaterialGroup: "group_a", baselineMaterialGroup: "group_a" }
      ]
    })
  );
  const updated = buildUpdatedRoomPricingProjection({ internal: r.internal });
  const kitchen = updated.rooms.find((x) => x.roomId === "kitchen");
  assert.ok(kitchen.backsplashAmountCents > 0, "unresolved backsplash carries the known baseline $ forward, never $0/null");
  assert.equal(kitchen.reviewRequiredItems.length, 1);
  assert.equal(
    updated.roomSubtotalCents + updated.projectAddOnsTotalCents + updated.governedAdjustmentsCents,
    updated.configuredExactTotalCents
  );
  assert.equal(updated.configuredExactTotalCents, updated.originalTotalCents);
  console.log("ok: unresolved backsplash pricing carries the known baseline $ forward and still reconciles exactly");
}

console.log("\nAll customerRoomPricingProjection tests passed.\n");
