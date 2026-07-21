/**
 * Phase DE.2C.v2 — elite100-config-delta-v2 frozen-baseline goldens.
 * Run: node backend-core/src/digitalEstimate/configuration/phaseDe2c.v2.test.mjs
 */
import assert from "node:assert/strict";

import {
  FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT,
  FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT
} from "./approvedPricingFixtures.mjs";
import {
  calculateElite100ConfigDeltaV2,
  ELITE100_CONFIG_DELTA_ENGINE_ID_V2
} from "./elite100ConfigDeltaEngineV2.mjs";
import { calculateElite100ConfigDeltaV1 } from "./currentConfigDeltaEngine.mjs";
import { ELITE100_CONFIG_DELTA_ENGINE_ID_V1 } from "./elite100ConfigDeltaConstants.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";

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
      {
        roomKey: "kitchen",
        displayName: "Kitchen",
        chargeableCounterSf: 10,
        selectedMaterialGroup: "group_b",
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
    asOf: "2026-07-16T12:00:00.000Z",
    ...overrides
  };
}

function frozenBaselineKitchen40(overrides = {}) {
  return baseInputV2({
    rooms: [
      {
        roomKey: "kitchen",
        displayName: "Kitchen",
        chargeableCounterSf: 40,
        selectedMaterialGroup: "promo",
        baselineMaterialGroup: "promo"
      }
    ],
    baseline: {
      exactTotal: 2040,
      displayTotal: 2040,
      rooms: [{ roomKey: "kitchen", materialGroup: "promo" }]
    },
    ...overrides
  });
}

// Identity separation: v1 and v2 remain distinct
{
  assert.equal(ELITE100_CONFIG_DELTA_ENGINE_ID_V1, "elite100-config-delta-v1");
  assert.equal(ELITE100_CONFIG_DELTA_ENGINE_ID_V2, "elite100-config-delta-v2");
  const v1 = calculateElite100ConfigDeltaV1({
    ...baseInputV2({
      engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID_V1,
      baseline: { exactTotal: 2040, displayTotal: 2040 }
    }),
    rooms: [
      {
        roomKey: "kitchen",
        chargeableCounterSf: 40,
        selectedMaterialGroup: "promo",
        baselineMaterialGroup: "promo"
      }
    ]
  });
  const v2 = calculateElite100ConfigDeltaV2(frozenBaselineKitchen40());
  assert.equal(v1.engineVersion, ELITE100_CONFIG_DELTA_ENGINE_ID_V1);
  assert.equal(v2.engineVersion, ELITE100_CONFIG_DELTA_ENGINE_ID_V2);
  // v1 full-reprices; v2 anchors frozen total
  assert.equal(v1.totals.configuredExactTotal, 2856);
  assert.equal(v2.totals.configuredExactTotal, 2040);
  assert.notEqual(v1.calculationFingerprint, v2.calculationFingerprint);
  console.log("ok: v1 preserved absolute reprice; v2 anchors frozen baseline");
}

// No-op save = $0 delta
{
  const r = calculateElite100ConfigDeltaV2(frozenBaselineKitchen40());
  assert.equal(r.internal.frozenBaselineAnchor, true);
  assert.equal(r.internal.materialDeltaCents, 0);
  assert.equal(r.totals.exactDelta, 0);
  assert.equal(r.totals.displayDelta, 0);
  assert.equal(r.totals.configuredExactTotal, 2040);
  assert.equal(r.totals.configuredDisplayTotal, 2040);
  console.log("ok: v2 golden no-op save → $0 delta");
}

// 3 × $55 rectangular vanity = $165 option delta
{
  const r = calculateElite100ConfigDeltaV2(
    frozenBaselineKitchen40({
      options: [
        {
          optionKey: "qty-v-rect",
          displayLabel: "ESF Rectangular Vanity Sink",
          quantity: 3,
          sellPrice: 55,
          pricingMode: "per_each",
          customerPriceTreatment: "absolute"
        }
      ]
    })
  );
  assert.equal(r.internal.materialDeltaCents, 0);
  assert.equal(r.internal.optionsTotalCents, 16500);
  assert.equal(r.totals.exactDelta, 165);
  assert.equal(r.totals.configuredExactTotal, 2205);
  assert.equal(r.totals.configuredDisplayTotal, 2205);
  assert.equal(r.internal.displayRoundingAdjustmentCents, 0);
  console.log("ok: v2 golden 3×$55 vanity → exact $165 anchored display delta");
}

// Included default option remains $0 delta
{
  const r = calculateElite100ConfigDeltaV2(
    frozenBaselineKitchen40({
      options: [
        {
          optionKey: "qty-ss",
          displayLabel: "ESF Stainless Kitchen Sink",
          quantity: 1,
          sellPrice: 160,
          pricingMode: "per_each",
          customerPriceTreatment: "absolute",
          includedInBaseline: true,
          defaultQty: 1
        }
      ]
    })
  );
  assert.equal(r.internal.optionsTotalCents, 0);
  assert.equal(r.totals.exactDelta, 0);
  assert.equal(r.totals.configuredExactTotal, 2040);
  console.log("ok: v2 golden included stainless qty 1 → $0 delta");
}

// Original material unchanged = $0 material delta
{
  const r = calculateElite100ConfigDeltaV2(frozenBaselineKitchen40());
  assert.equal(r.totals.materialSell, 2800);
  assert.equal(r.totals.materialUseTax, 56);
  assert.equal(r.internal.materialDeltaCents, 0);
  assert.equal(r.totals.configuredExactTotal, 2040);
  console.log("ok: v2 golden unchanged Promo → $0 material delta");
}

// Promo → Group B = rate-difference + tax difference
{
  const r = calculateElite100ConfigDeltaV2(
    frozenBaselineKitchen40({
      rooms: [
        {
          roomKey: "kitchen",
          displayName: "Kitchen",
          chargeableCounterSf: 40,
          selectedMaterialGroup: "group_b",
          baselineMaterialGroup: "promo"
        }
      ]
    })
  );
  assert.equal(r.internal.materialDeltaCents, 61200);
  assert.equal(r.totals.exactDelta, 612);
  assert.equal(r.totals.configuredExactTotal, 2652);
  assert.equal(r.totals.configuredDisplayTotal, 2652);
  console.log("ok: v2 golden Promo→Group B → rate+tax difference delta");
}

// Unresolved baseline evidence blocks material-change recalculation
{
  assert.throws(
    () =>
      calculateElite100ConfigDeltaV2(
        baseInputV2({
          rooms: [
            {
              roomKey: "kitchen",
              chargeableCounterSf: 10,
              selectedMaterialGroup: "group_c",
              baselineMaterialGroup: "group_b"
            }
          ],
          baseline: {
            exactTotal: 870,
            displayTotal: 870,
            rooms: [{ roomKey: "kitchen", materialGroup: null }]
          },
          frozenBaseRates: {
            direct: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT, group_b: null },
            wholesale: { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT }
          }
        })
      ),
    (e) =>
      e.code === "unresolved_baseline_material" ||
      e.code === "missing_material_rate" ||
      e.code === "unknown_material_group"
  );
  console.log("ok: v2 unresolved baseline evidence blocks material delta");
}

// Frozen-anchor display delta deterministic (no whole-total re-rounding)
{
  const r = calculateElite100ConfigDeltaV2(
    frozenBaselineKitchen40({
      options: [{ optionKey: "qty-v-rect", quantity: 3, sellPrice: 55, pricingMode: "per_each" }]
    })
  );
  assert.equal(r.totals.configuredExactTotal, 2205);
  assert.equal(r.totals.configuredDisplayTotal, 2205);
  const again = calculateElite100ConfigDeltaV2(
    frozenBaselineKitchen40({
      options: [{ optionKey: "qty-v-rect", quantity: 3, sellPrice: 55, pricingMode: "per_each" }]
    })
  );
  assert.equal(again.calculationFingerprint, r.calculationFingerprint);
  console.log("ok: v2 frozen-anchor display delta deterministic");
}

// Public DTO never exposes internal economics
{
  const r = calculateElite100ConfigDeltaV2(
    frozenBaselineKitchen40({
      options: [{ optionKey: "qty-v-rect", quantity: 3, sellPrice: 55, pricingMode: "per_each" }]
    })
  );
  assertPublicConfigurationHasNoForbiddenContent(r.public);
  const blob = JSON.stringify(r.public).toLowerCase();
  for (const needle of [
    "materialusetax",
    "taxbps",
    "markup",
    "spahn",
    "watts",
    "finalrate",
    "frozenbaserate",
    "accountgroup",
    "materialdeltacents",
    "selectiondeltasubtotal"
  ]) {
    assert.equal(blob.includes(needle), false, `public leaked ${needle}`);
  }
  console.log("ok: v2 public DTO strips rates/markup/tax/account/internal evidence");
}

// Reject wrong engine version on v2 entrypoint
{
  assert.throws(
    () =>
      calculateElite100ConfigDeltaV2(
        frozenBaselineKitchen40({ engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID_V1 })
      ),
    (e) => e.code === "engine_version_mismatch"
  );
  console.log("ok: v2 rejects v1 engineVersion (no silent relabel)");
}

console.log("\nAll phaseDe2c.v2 engine tests passed.\n");
