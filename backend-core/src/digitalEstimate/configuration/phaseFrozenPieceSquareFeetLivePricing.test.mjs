/**
 * Digital Estimate live pricing — frozen piece SF must survive publication.
 *
 * Regression: publication froze countertop pieces without their `sqft`, and the
 * trusted context treated those pieces as the billing sections. Every room then
 * entered config-delta with 0 chargeable countertop SF, so a permitted material /
 * edge selection priced Countertop $0 with backsplash-only room totals — which the
 * baseline parity guardrail (correctly) froze to the published baseline. The
 * customer could never see a live-priced total.
 *
 * Run: node backend-core/src/digitalEstimate/configuration/phaseFrozenPieceSquareFeetLivePricing.test.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildStudioEstimateRoomsForPublication } from "../../elite100EstimateStudio/studioEstimatePublicationAdapter.mjs";
import { extractLockedRoomsFromEvidence } from "./configurationTrustedContext.mjs";
import {
  calculateElite100ConfigDelta,
  ELITE100_CONFIG_DELTA_ENGINE_ID
} from "./currentConfigDeltaEngine.mjs";
import {
  FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT,
  FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT
} from "./approvedPricingFixtures.mjs";
import {
  applyBaselineParityToCustomerCalculation,
  CUSTOMER_PRICING_AUTHORITY,
  hasBacksplashOnlyCountertopCollapse
} from "./baselineParityGuardrails.mjs";

console.log("\nphaseFrozenPieceSquareFeetLivePricing.test.mjs\n");

const studioEstimate = {
  id: randomUUID(),
  revision: 1,
  scope: {
    materialGroup: "Group F",
    colorName: "Aurataj",
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        included: true,
        countertopSqft: 53.4,
        backsplashSqft: 24,
        edgeLinearFeet: 32,
        edgeQuantityAuthoritative: true,
        pieces: [
          { id: "p1", name: "Island", pieceType: "counter", sqft: 30.2, included: true },
          { id: "p2", name: "Perimeter", pieceType: "counter", sqft: 23.2, included: true }
        ]
      }
    ]
  }
};

function trustedRooms(estimateRooms) {
  const { rooms, blockers } = extractLockedRoomsFromEvidence(
    { calculationSnapshotCopy: { internal_ui: { estimate_rooms: estimateRooms } } },
    null
  );
  return { rooms, blockers };
}

// 1. Publication freeze preserves each piece's measured SF.
const publishedRooms = buildStudioEstimateRoomsForPublication(studioEstimate);
assert.equal(publishedRooms.length, 1);
assert.deepEqual(
  publishedRooms[0].pieces.map((p) => p.sqft),
  [30.2, 23.2],
  "frozen pieces must carry section SF"
);

// 2. Trusted context bills the section ceiling (31 + 24), never 0.
const current = trustedRooms(publishedRooms);
assert.deepEqual(current.blockers, []);
assert.equal(current.rooms[0].chargeableCounterSf, 55);

// 3. Legacy publications (pieces frozen with no SF) fall back to room-level SF
//    instead of silently billing 0 SF.
const legacyRooms = publishedRooms.map((r) => ({
  ...r,
  pieces: r.pieces.map(({ sqft, ...rest }) => rest)
}));
const legacy = trustedRooms(legacyRooms);
assert.deepEqual(legacy.blockers, []);
assert.equal(legacy.rooms[0].chargeableCounterSf, 54);
assert.ok(legacy.rooms[0].chargeableCounterSf > 0, "legacy pub must not bill 0 countertop SF");

// 4. A saved material change to Group C now prices a complete room (countertop
//    included) and stays authoritative through the parity guardrail.
function priceSelection(room, selectedGroup) {
  return calculateElite100ConfigDelta({
    organizationId: randomUUID(),
    publication: { id: randomUUID(), snapshotId: randomUUID(), status: "active" },
    envelope: { id: randomUUID(), version: 1, status: "active" },
    pricingPolicyFingerprint: "pricing-fp",
    catalogFingerprint: "catalog-fp",
    engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID,
    pricingBasis: "direct",
    materialProgram: "elite_100",
    frozenBaseRates: {
      direct: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT },
      wholesale: { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT }
    },
    materialTaxPolicy: { bps: 200 },
    authorizedMaterialMarkup: { bps: 0 },
    options: [],
    rooms: [
      {
        roomKey: room.roomKey,
        displayName: room.displayName,
        chargeableCounterSf: room.chargeableCounterSf,
        selectedMaterialGroup: selectedGroup,
        baselineMaterialGroup: room.baselineMaterialGroup,
        backsplashConfiguredBilledSf: room.backsplashSf
      }
    ],
    lockedScope: { edgeLinearFeetTotal: 32 },
    baseline: {
      exactTotal: 7120,
      displayTotal: 7120,
      rooms: [{ roomKey: room.roomKey, materialGroup: room.baselineMaterialGroup }]
    },
    actor: { type: "public" }
  });
}

for (const [label, ctx] of [
  ["current publication", current],
  ["legacy publication", legacy]
]) {
  const result = priceSelection(ctx.rooms[0], "group_c");
  const rows = result.public?.rooms || result.public?.roomPricing?.rooms || [];
  assert.ok(rows.length, `${label}: expected priced rooms`);
  assert.equal(rows[0].countertopIncluded, true, `${label}: countertop must stay in scope`);
  assert.equal(rows[0].selectedMaterialLabel, "Group C", `${label}: selected group must price`);

  const configured = Number(
    result.public?.configuredDisplayTotal ?? result.public?.totals?.configuredDisplayTotal
  );
  assert.ok(configured > 0, `${label}: configured total must be priced`);
  assert.notEqual(configured, 7120, `${label}: Group C selection must move the total`);

  const guarded = applyBaselineParityToCustomerCalculation(
    {
      baselineDisplayTotal: 7120,
      configuredDisplayTotal: configured,
      pricedSelectionTotal: configured,
      roomPricing: {
        kind: "updated",
        rooms: [
          {
            roomName: "Kitchen",
            selectedMaterial: "Group C",
            countertopAmount: 3200,
            backsplashAmount: 1400,
            roomTotal: 4600
          }
        ]
      }
    },
    { baselineDisplayTotal: 7120 }
  );
  assert.equal(
    guarded.pricingAuthority,
    CUSTOMER_PRICING_AUTHORITY.AUTHORITATIVE_BACKEND_REPRICE,
    `${label}: complete reprice must stay authoritative`
  );
  assert.equal(guarded.pricedSelectionTotal, configured);
  assert.equal(guarded.customerPricingNotice, null);
}

// 5. The failure shape itself still freezes: 0 chargeable SF collapses countertop,
//    and that must never become the customer-facing total.
const zeroSfResult = priceSelection(
  { ...current.rooms[0], chargeableCounterSf: 0 },
  "group_c"
);
assert.ok(zeroSfResult.public);
assert.equal(
  hasBacksplashOnlyCountertopCollapse([
    { roomName: "Kitchen", selectedMaterial: "Group C", countertopAmount: 0, backsplashAmount: 459, roomTotal: 459 }
  ]),
  true
);
const frozen = applyBaselineParityToCustomerCalculation(
  {
    baselineDisplayTotal: 7120,
    configuredDisplayTotal: 5264,
    pricedSelectionTotal: 5264,
    roomPricing: {
      kind: "updated",
      rooms: [
        {
          roomName: "Kitchen",
          selectedMaterial: "Group C",
          countertopAmount: 0,
          backsplashAmount: 459,
          roomTotal: 459
        }
      ]
    }
  },
  { baselineDisplayTotal: 7120 }
);
assert.equal(frozen.pricingAuthority, CUSTOMER_PRICING_AUTHORITY.PUBLISHED_BASELINE_FROZEN);
assert.equal(frozen.pricedSelectionTotal, 7120);
assert.equal(frozen.roomPricing, null);

// 6. Published/approved evidence is never mutated while reading it.
assert.equal(studioEstimate.scope.rooms[0].pieces[0].sqft, 30.2);
assert.equal(publishedRooms[0].countertopSqft, 53.4);

console.log("phaseFrozenPieceSquareFeetLivePricing: OK");
