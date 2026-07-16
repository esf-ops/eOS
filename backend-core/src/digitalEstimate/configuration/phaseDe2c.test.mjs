/**
 * Phase DE.2C — elite100-config-delta-v1 golden fixtures + security tests.
 * Run: node backend-core/src/digitalEstimate/configuration/phaseDe2c.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import {
  FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT,
  FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT
} from "./approvedPricingFixtures.mjs";
import {
  calculateElite100ConfigDelta,
  ELITE100_CONFIG_DELTA_ENGINE_ID,
  fingerprintCanonical
} from "./elite100ConfigDeltaEngine.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";
import { ceilCentsToTenDollars, dollarsToCents } from "./money.mjs";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import { calculateAndPersistConfigurationDelta } from "./configurationCalculationService.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const PUB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SNAP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ENV = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WATTS_ACCT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SPAHN_ACCT = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const OTHER_ACCT = "99999999-9999-4999-8999-999999999999";
const WATTS_GROUP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SPAHN_GROUP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

function rates() {
  return {
    direct: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT },
    wholesale: { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT }
  };
}

function baseInput(overrides = {}) {
  return {
    organizationId: ORG,
    publication: { id: PUB, snapshotId: SNAP, status: "active" },
    envelope: { id: ENV, version: 1, status: "active", publicationId: PUB },
    pricingPolicyFingerprint: "policy-fp-v1",
    catalogFingerprint: "catalog-fp-v1",
    engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID,
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

function wattsMembership() {
  return {
    id: "mem-watts",
    organizationId: ORG,
    accountGroupId: WATTS_GROUP,
    partnerAccountId: WATTS_ACCT,
    isActive: true
  };
}

function wattsOverride(extra = {}) {
  return {
    id: "ovr-watts",
    organizationId: ORG,
    accountGroupId: WATTS_GROUP,
    accountGroupCode: "watts",
    overrideKind: "watts_promo",
    groupCode: "promo",
    ratePerSqft: 40,
    priority: 200,
    isActive: true,
    ...extra
  };
}

function spahnMembership(accountId = SPAHN_ACCT) {
  return {
    id: `mem-spahn-${accountId}`,
    organizationId: ORG,
    accountGroupId: SPAHN_GROUP,
    partnerAccountId: accountId,
    isActive: true
  };
}

function spahnAdjustment(extra = {}) {
  return {
    id: "adj-spahn",
    organizationId: ORG,
    accountGroupId: SPAHN_GROUP,
    accountGroupCode: "spahn_and_rose",
    adjustmentCode: "spahn_and_rose_entire_estimate_pct",
    bps: 300,
    rate: 0.03,
    isActive: true,
    ...extra
  };
}

// --- Money helpers ---
{
  assert.equal(ceilCentsToTenDollars(487000), 487000);
  assert.equal(ceilCentsToTenDollars(487001), 488000);
  assert.equal(ceilCentsToTenDollars(487500), 488000);
  assert.equal(ceilCentsToTenDollars(487999), 488000);
  assert.equal(ceilCentsToTenDollars(488000), 488000);
  assert.equal(dollarsToCents(85), 8500);
  console.log("ok: ceiling-to-$10 boundaries + cents");
}

// 1. DIRECT GROUP B, 10 SF
{
  const r = calculateElite100ConfigDelta(baseInput());
  assert.equal(r.totals.materialSell, 850);
  assert.equal(r.totals.materialUseTax, 17);
  assert.equal(r.totals.configuredExactTotal, 867);
  assert.equal(r.totals.configuredDisplayTotal, 870);
  assertPublicConfigurationHasNoForbiddenContent(r.public);
  console.log("ok: golden Direct Group B 10 SF → 867/870");
}

// 2. WHOLESALE REMNANT, 10 SF
{
  const r = calculateElite100ConfigDelta(
    baseInput({
      pricingBasis: "wholesale",
      rooms: [
        {
          roomKey: "kitchen",
          chargeableCounterSf: 10,
          selectedMaterialGroup: "remnant"
        }
      ]
    })
  );
  assert.equal(r.totals.materialSell, 450);
  assert.equal(r.totals.materialUseTax, 9);
  assert.equal(r.totals.configuredExactTotal, 459);
  assert.equal(r.totals.configuredDisplayTotal, 460);
  console.log("ok: golden Wholesale Remnant 10 SF → 459/460");
}

// 3. DIRECT REMNANT, 10 SF
{
  const r = calculateElite100ConfigDelta(
    baseInput({
      rooms: [
        { roomKey: "kitchen", chargeableCounterSf: 10, selectedMaterialGroup: "remnant" }
      ]
    })
  );
  assert.equal(r.totals.materialSell, 500);
  assert.equal(r.totals.materialUseTax, 10);
  assert.equal(r.totals.configuredExactTotal, 510);
  assert.equal(r.totals.configuredDisplayTotal, 510);
  console.log("ok: golden Direct Remnant 10 SF → 510/510");
}

// 4. WATT'S PROMO, 10 SF
{
  const r = calculateElite100ConfigDelta(
    baseInput({
      partnerAccountId: WATTS_ACCT,
      accountMemberships: [wattsMembership()],
      materialRateOverrides: [wattsOverride()],
      rooms: [
        { roomKey: "kitchen", chargeableCounterSf: 10, selectedMaterialGroup: "promo" }
      ]
    })
  );
  assert.equal(r.internal.rooms[0].resolution.finalRateCents, 4000);
  assert.equal(r.internal.rooms[0].resolution.source, "account_specific_promo_override");
  assert.equal(r.totals.materialSell, 400);
  assert.equal(r.totals.materialUseTax, 8);
  assert.equal(r.totals.configuredExactTotal, 408);
  assert.equal(r.totals.configuredDisplayTotal, 410);
  assert.equal(r.public.configuredDisplayTotal, 410);
  assert.throws(() =>
    assertPublicConfigurationHasNoForbiddenContent({ watts: true })
  );
  console.log("ok: golden Watt's Promo 10 SF → 408/410");
}

// 5. SPAHN & ROSE DIRECT GROUP A, 10 SF
{
  const r = calculateElite100ConfigDelta(
    baseInput({
      partnerAccountId: SPAHN_ACCT,
      accountMemberships: [spahnMembership()],
      estimateAdjustments: [spahnAdjustment()],
      rooms: [
        { roomKey: "kitchen", chargeableCounterSf: 10, selectedMaterialGroup: "group_a" }
      ]
    })
  );
  assert.equal(r.totals.materialSell, 770);
  assert.equal(r.totals.materialUseTax, 15.4);
  assert.equal(r.totals.preAdjustmentSubtotal, 785.4);
  assert.equal(r.totals.spahnAdjustment, 23.56);
  assert.equal(r.totals.configuredExactTotal, 808.96);
  assert.equal(r.totals.configuredDisplayTotal, 810);
  assert.ok(r.internal.spahnAndRose);
  assert.equal(Object.hasOwn(r.public, "spahnAndRose"), false);
  console.log("ok: golden Spahn Group A 10 SF → 808.96/810");
}

// 6. AUTHORIZED MARKUP Wholesale Group A 10%
{
  const r = calculateElite100ConfigDelta(
    baseInput({
      pricingBasis: "wholesale",
      authorizedMaterialMarkup: {
        bps: 1000,
        authorizedByUserId: "estimator-1",
        reason: "authorized test markup",
        evidence: { ticket: "DE2C" }
      },
      rooms: [
        { roomKey: "kitchen", chargeableCounterSf: 10, selectedMaterialGroup: "group_a" }
      ]
    })
  );
  assert.equal(r.totals.materialSell, 627);
  assert.equal(r.totals.materialUseTax, 12.54);
  assert.equal(r.totals.configuredExactTotal, 639.54);
  assert.equal(r.totals.configuredDisplayTotal, 640);
  console.log("ok: golden authorized 10% markup Wholesale A → 639.54/640");
}

// 7. GROUP B → GROUP C delta
{
  const baseline = calculateElite100ConfigDelta(baseInput());
  const configured = calculateElite100ConfigDelta(
    baseInput({
      rooms: [
        {
          roomKey: "kitchen",
          chargeableCounterSf: 10,
          selectedMaterialGroup: "group_c",
          baselineMaterialGroup: "group_b"
        }
      ],
      baseline: {
        exactTotal: baseline.totals.configuredExactTotal,
        displayTotal: baseline.totals.configuredDisplayTotal,
        rooms: [{ roomKey: "kitchen", materialGroup: "group_b" }]
      }
    })
  );
  assert.equal(baseline.totals.configuredExactTotal, 867);
  assert.equal(baseline.totals.configuredDisplayTotal, 870);
  assert.equal(configured.totals.materialSell, 950);
  assert.equal(configured.totals.materialUseTax, 19);
  assert.equal(configured.totals.configuredExactTotal, 969);
  assert.equal(configured.totals.configuredDisplayTotal, 970);
  assert.equal(configured.totals.exactDelta, 102);
  assert.equal(configured.totals.displayDelta, 100);
  console.log("ok: golden B→C delta exact 102 display 100");
}

// 8. DIRECT GROUP B + sink cutout
{
  const r = calculateElite100ConfigDelta(
    baseInput({
      options: [
        {
          optionKey: "qty-sink",
          displayLabel: "Kitchen Sink Cutouts",
          quantity: 1,
          sellPrice: 200,
          pricingMode: "per_each",
          customerPriceTreatment: "absolute",
          minQty: 0,
          maxQty: 5
        }
      ]
    })
  );
  assert.equal(r.totals.configuredExactTotal, 1067);
  assert.equal(r.totals.configuredDisplayTotal, 1070);
  console.log("ok: golden Group B + sink cutout → 1067/1070");
}

// 9. Watt's spoofed customer name without membership
{
  const r = calculateElite100ConfigDelta(
    baseInput({
      partnerAccountId: null,
      materialRateOverrides: [wattsOverride()],
      rooms: [
        { roomKey: "kitchen", chargeableCounterSf: 10, selectedMaterialGroup: "promo" }
      ]
      // note: customer name not consulted
    })
  );
  assert.equal(r.internal.rooms[0].resolution.finalRateCents, 7000);
  assert.equal(r.totals.materialSell, 700);
  console.log("ok: Watt's name spoof without membership → Promo 70");
}

// 10. Spahn spoof without membership
{
  const r = calculateElite100ConfigDelta(
    baseInput({
      partnerAccountId: OTHER_ACCT,
      estimateAdjustments: [spahnAdjustment()],
      rooms: [
        { roomKey: "kitchen", chargeableCounterSf: 10, selectedMaterialGroup: "group_a" }
      ]
    })
  );
  assert.equal(r.totals.spahnAdjustment, 0);
  assert.equal(r.totals.configuredExactTotal, 785.4);
  console.log("ok: Spahn spoof without membership → no 3%");
}

// 11. Cross-org account membership
{
  assert.throws(
    () =>
      calculateElite100ConfigDelta(
        baseInput({
          partnerAccountId: WATTS_ACCT,
          accountMemberships: [
            { ...wattsMembership(), organizationId: ORG_B }
          ],
          materialRateOverrides: [wattsOverride()],
          rooms: [
            { roomKey: "kitchen", chargeableCounterSf: 10, selectedMaterialGroup: "promo" }
          ]
        })
      ),
    (e) => e.code === "cross_org_account_rule"
  );
  console.log("ok: cross-org membership fail closed");
}

// 12. Conflicting active account overrides
{
  assert.throws(
    () =>
      calculateElite100ConfigDelta(
        baseInput({
          partnerAccountId: WATTS_ACCT,
          accountMemberships: [wattsMembership()],
          materialRateOverrides: [
            wattsOverride({ id: "w1" }),
            wattsOverride({ id: "w2", ratePerSqft: 40 })
          ],
          rooms: [
            { roomKey: "kitchen", chargeableCounterSf: 10, selectedMaterialGroup: "promo" }
          ]
        })
      ),
    (e) => e.code === "conflicting_account_overrides"
  );
  console.log("ok: conflicting Watt's overrides fail closed");
}

// 13. Expired Watt's rule → base schedule
{
  const r = calculateElite100ConfigDelta(
    baseInput({
      partnerAccountId: WATTS_ACCT,
      accountMemberships: [wattsMembership()],
      materialRateOverrides: [
        wattsOverride({ effectiveTo: "2020-01-01T00:00:00.000Z" })
      ],
      rooms: [
        { roomKey: "kitchen", chargeableCounterSf: 10, selectedMaterialGroup: "promo" }
      ]
    })
  );
  assert.equal(r.internal.rooms[0].resolution.finalRateCents, 7000);
  console.log("ok: expired Watt's → base Promo 70");
}

// 14. Unresolved Blanco / waterfall / pop-up
{
  assert.throws(
    () =>
      calculateElite100ConfigDelta(
        baseInput({
          options: [
            {
              optionKey: "blanco_unresolved",
              displayLabel: "Stock Blanco",
              quantity: 1,
              sellPrice: 450,
              availabilityState: "review_required",
              customerPriceTreatment: "absolute",
              pricingMode: "per_each"
            }
          ]
        })
      ),
    (e) => e.code === "requires_estimator_review"
  );
  assert.throws(
    () =>
      calculateElite100ConfigDelta(
        baseInput({
          options: [
            {
              optionKey: "waterfall_unresolved",
              quantity: 1,
              sellPrice: 600,
              availabilityState: "unavailable",
              pricingMode: "fixed"
            }
          ]
        })
      ),
    (e) => e.code === "option_unavailable"
  );
  console.log("ok: unresolved Blanco/waterfall never silently priced");
}

// Property: identical inputs → identical fingerprints
{
  const a = calculateElite100ConfigDelta(baseInput());
  const b = calculateElite100ConfigDelta(baseInput());
  assert.equal(a.inputFingerprint, b.inputFingerprint);
  assert.equal(a.calculationFingerprint, b.calculationFingerprint);
  console.log("ok: deterministic fingerprints");
}

// Selection ordering cannot change result
{
  const opts = [
    {
      optionKey: "qty-sink",
      quantity: 1,
      sellPrice: 200,
      pricingMode: "per_each",
      customerPriceTreatment: "absolute"
    },
    {
      optionKey: "qty-outlet",
      quantity: 2,
      sellPrice: 30,
      pricingMode: "per_each",
      customerPriceTreatment: "absolute"
    }
  ];
  const a = calculateElite100ConfigDelta(baseInput({ options: opts }));
  const b = calculateElite100ConfigDelta(baseInput({ options: [...opts].reverse() }));
  assert.equal(a.calculationFingerprint, b.calculationFingerprint);
  assert.equal(a.totals.configuredExactTotal, b.totals.configuredExactTotal);
  console.log("ok: option order independence");
}

// Reject browser-supplied authority
{
  for (const bad of [
    { sellPrice: 1 },
    { markup: 10 },
    { taxRate: 0.09 },
    { configuredTotal: 999 },
    { accountGroupCode: "watts" },
    { clientClaims: { partnerAccountId: WATTS_ACCT } }
  ]) {
    assert.throws(
      () => calculateElite100ConfigDelta(baseInput(bad)),
      (e) => e.code === "forbidden_caller_authority" || e.code === "forbidden_caller_authority"
    );
  }
  assert.throws(
    () =>
      calculateElite100ConfigDelta(
        baseInput({
          authorizedMaterialMarkup: { bps: 1000 }
        })
      ),
    (e) => e.code === "markup_unauthorized"
  );
  console.log("ok: browser price/markup/tax/account/total rejected");
}

// Direct/Wholesale distinct + tax on every schedule
{
  const d = calculateElite100ConfigDelta(
    baseInput({
      rooms: [{ roomKey: "k", chargeableCounterSf: 10, selectedMaterialGroup: "promo" }]
    })
  );
  const w = calculateElite100ConfigDelta(
    baseInput({
      pricingBasis: "wholesale",
      rooms: [{ roomKey: "k", chargeableCounterSf: 10, selectedMaterialGroup: "promo" }]
    })
  );
  assert.equal(d.totals.materialSell, 700);
  assert.equal(w.totals.materialSell, 450);
  assert.notEqual(d.totals.materialSell, w.totals.materialSell);
  assert.ok(d.totals.materialUseTax > 0 && w.totals.materialUseTax > 0);
  console.log("ok: Direct/Wholesale distinct + 2% tax both schedules");
}

// Watt's only Promo
{
  const r = calculateElite100ConfigDelta(
    baseInput({
      partnerAccountId: WATTS_ACCT,
      accountMemberships: [wattsMembership()],
      materialRateOverrides: [wattsOverride()],
      rooms: [
        { roomKey: "kitchen", chargeableCounterSf: 10, selectedMaterialGroup: "group_b" }
      ]
    })
  );
  assert.equal(r.internal.rooms[0].resolution.finalRateCents, 8500);
  console.log("ok: Watt's does not affect Group B");
}

// Spahn after tax + lines
{
  const r = calculateElite100ConfigDelta(
    baseInput({
      partnerAccountId: SPAHN_ACCT,
      accountMemberships: [spahnMembership()],
      estimateAdjustments: [spahnAdjustment()],
      options: [
        {
          optionKey: "qty-sink",
          quantity: 1,
          sellPrice: 200,
          pricingMode: "per_each",
          customerPriceTreatment: "absolute"
        }
      ],
      rooms: [
        { roomKey: "kitchen", chargeableCounterSf: 10, selectedMaterialGroup: "group_b" }
      ]
    })
  );
  // 850+17+200=1067; *1.03 = 1099.01; display 1100
  assert.equal(r.totals.preAdjustmentSubtotal, 1067);
  assert.equal(r.totals.spahnAdjustment, 32.01);
  assert.equal(r.totals.configuredExactTotal, 1099.01);
  assert.equal(r.totals.configuredDisplayTotal, 1100);
  console.log("ok: Spahn applies after tax and add-ons");
}

// Fail closed: missing snapshot / inactive pub / bad envelope
{
  assert.throws(
    () =>
      calculateElite100ConfigDelta(
        baseInput({ publication: { id: PUB, status: "active" } })
      ),
    (e) => e.code === "missing_publication_snapshot"
  );
  assert.throws(
    () =>
      calculateElite100ConfigDelta(
        baseInput({ publication: { id: PUB, snapshotId: SNAP, status: "revoked" } })
      ),
    (e) => e.code === "publication_not_active"
  );
  assert.throws(
    () =>
      calculateElite100ConfigDelta(
        baseInput({
          envelope: { id: ENV, version: 1, status: "active", publicationId: "other" }
        })
      ),
    (e) => e.code === "envelope_publication_mismatch"
  );
  console.log("ok: publication/envelope fail-closed gates");
}

// Persistence + idempotency
{
  const repo = createInMemoryConfigurationRepository();
  repo.seedPublication({
    id: PUB,
    organization_id: ORG,
    source_quote_id: randomUUID(),
    status: "active",
    source_quote_fingerprint: "fp",
    customer_snapshot_hash: "c",
    pricing_evidence_hash: "e"
  });
  repo.seedSnapshot({
    id: SNAP,
    organization_id: ORG,
    publication_id: PUB,
    customer_snapshot_json: {},
    pricing_evidence_json: {},
    customer_snapshot_hash: "c",
    pricing_evidence_hash: "e"
  });
  const draft = await repo.createDraftEnvelope({
    organizationId: ORG,
    publicationId: PUB,
    actorUserId: "u1"
  });
  const g = await repo.upsertDraftGroup(ORG, draft.id, {
    groupKey: "material",
    displayLabel: "Material"
  });
  await repo.upsertDraftOption(ORG, draft.id, {
    groupId: g.id,
    optionKey: "group_b",
    displayLabel: "Group B",
    sellPrice: 0,
    customerPriceTreatment: "included"
  });
  await repo.activateEnvelope(ORG, draft.id, {
    actorUserId: "u1",
    pricingPolicyFingerprint: "policy-fp-v1",
    catalogFingerprint: "catalog-fp-v1"
  });
  const session = await repo.createSession(ORG, {
    publicationId: PUB,
    envelopeId: draft.id
  });
  const sel = await repo.saveSelection(ORG, session.id, { selections: { group_b: 1 } });

  const trusted = baseInput({
    envelope: { id: draft.id, version: 1, status: "active", publicationId: PUB },
    publication: { id: PUB, snapshotId: SNAP, status: "active" }
  });
  const first = await calculateAndPersistConfigurationDelta({
    organizationId: ORG,
    repository: repo,
    selectionId: sel.id,
    trustedInput: trusted,
    idempotencyKey: "idem-1"
  });
  const second = await calculateAndPersistConfigurationDelta({
    organizationId: ORG,
    repository: repo,
    selectionId: sel.id,
    trustedInput: trusted,
    idempotencyKey: "idem-1"
  });
  assert.equal(first.calculation.id, second.calculation.id);
  assert.equal(second.reused, true);
  await assert.rejects(() => repo.updateCalculation(), (e) => e.code === "immutable");
  console.log("ok: persist + idempotency + immutable calc");
}

// Historical fixture reproducible after live fixture mutation
{
  const frozen = rates();
  const r1 = calculateElite100ConfigDelta(baseInput({ frozenBaseRates: frozen }));
  frozen.direct.group_b = 999;
  const r2 = calculateElite100ConfigDelta(
    baseInput({
      frozenBaseRates: {
        direct: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT },
        wholesale: { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT }
      }
    })
  );
  assert.equal(r1.totals.configuredExactTotal, 867);
  assert.equal(r2.totals.configuredExactTotal, 867);
  console.log("ok: historical frozen rates reproducible");
}

// No calculateQuote import in engine modules
{
  for (const f of [
    "elite100ConfigDeltaEngine.mjs",
    "elite100ConfigDeltaPublicSerializer.mjs",
    "configurationCalculationService.mjs",
    "money.mjs"
  ]) {
    const src = readFileSync(join(__dirname, f), "utf8");
    assert.equal(/from\s+["'][^"']*quoteCalculator/.test(src), false);
    assert.equal(src.includes('.from("quote_headers")'), false);
  }
  console.log("ok: engine modules isolated from calculateQuote/quote_headers");
}

// fingerprint helper export
{
  assert.equal(typeof fingerprintCanonical({ a: 1 }), "string");
  console.log("ok: fingerprintCanonical export");
}

console.log("\nAll phaseDe2c engine tests passed.\n");
