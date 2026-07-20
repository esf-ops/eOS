/**
 * Phase DE.2H — Elite 100 customer material catalog + color→group server authority.
 * Run: node backend-core/src/digitalEstimate/configuration/phaseDe2h.materialCatalog.test.mjs
 */
import assert from "node:assert/strict";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "../digitalEstimatePublishService.mjs";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./pricingPolicyRepository.mjs";
import { createPublicConfigurationService, rejectPublicSelectionAuthority } from "./publicConfigurationService.mjs";
import { createConfigurationStudioService } from "./configurationStudioService.mjs";
import {
  ELITE100_CUSTOMER_MATERIALS,
  ELITE100_MATERIAL_CATALOG_CONTRACT,
  ELITE100_MATERIAL_CATALOG_CONTRACT_V1,
  buildRemnantCustomerMaterial,
  getElite100CustomerMaterial,
  isKnownMaterialOrLegacyGroupToken,
  listElite100CustomerMaterials,
  pickDefaultMaterialForGroup,
  resolveMaterialSelectionFromOption,
  toCustomerSafeMaterialRecord
} from "./elite100CustomerMaterialCatalog.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";
import { calculateElite100ConfigDeltaV2 } from "./elite100ConfigDeltaEngineV2.mjs";
import { FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT, FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT } from "./approvedPricingFixtures.mjs";

const ORG = "11111111-1111-4111-8111-111111111112";
const QUOTE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const EXPECTED_GROUP_COUNTS = Object.freeze({
  promo: 15,
  group_a: 18,
  group_b: 18,
  group_c: 17,
  group_d: 16,
  group_e: 5,
  group_f: 11
});

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

function eliteHeader(group = "Group B") {
  const code = group.toLowerCase().includes("promo") ? "promo" : "group_b";
  return {
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-MAT-000100",
    quote_number_base: "ESF-MAT-000100",
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: QUOTE_ID,
    is_current_revision: true,
    archived_at: null,
    customer_name: "Test Customer",
    project_name: "Kitchen Remodel",
    project_address: "1 Main St",
    estimated_material_group: group,
    partner_account_id: null,
    calculation_snapshot: {
      materialGroup: group,
      materialProgramDefault: "elite_100",
      totals: { retail: 5000, wholesale: 4500, estimated_sqft: 40 },
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 5000,
        estimate_rooms: [
          { id: "kitchen", name: "Kitchen", countertopSqft: 40, materialGroup: code, colorName: "Alabaster" }
        ],
        customer_estimate_print_snapshot: { finalRounded: 5000 }
      }
    }
  };
}

// --- Catalog authority ---
{
  assert.equal(ELITE100_MATERIAL_CATALOG_CONTRACT, "elite100-customer-materials-v2");
  assert.equal(ELITE100_MATERIAL_CATALOG_CONTRACT_V1, "elite100-customer-materials-v1");

  const activeVisible = listElite100CustomerMaterials();
  assert.equal(activeVisible.length, 100);
  assert.equal(ELITE100_CUSTOMER_MATERIALS.length, 100);

  const groupCounts = {};
  for (const m of activeVisible) {
    groupCounts[m.pricingGroupCode] = (groupCounts[m.pricingGroupCode] || 0) + 1;
  }
  assert.deepEqual(groupCounts, EXPECTED_GROUP_COUNTS);

  const ids = activeVisible.map((m) => m.materialId);
  assert.equal(new Set(ids).size, 100, "every materialId is unique");

  // Preserved v1 materialIds
  for (const id of [
    "e100-carrara-classic",
    "e100-classic-grey",
    "e100-india-black-pearl",
    "e100-honeydew",
    "e100-calacatta-gold",
    "e100-alabaster"
  ]) {
    assert.ok(getElite100CustomerMaterial(id), `preserved materialId ${id}`);
  }

  const royale = getElite100CustomerMaterial("e100-carrara-royale");
  assert.ok(royale);
  assert.equal(royale.pricingGroupCode, "promo");
  assert.equal(royale.imageThumbPath, "/materials/elite100/thumb/carrara-royale.jpg");
  assert.equal(royale.textureFallbackStatus, "ready");
  assert.equal(royale.active, true);
  assert.equal(royale.customerVisible, true);
  assert.equal(royale.collectionLabel, "Elite 100");

  const missingTexture = getElite100CustomerMaterial("e100-moonflakes");
  assert.ok(missingTexture);
  assert.equal(missingTexture.imageThumbPath, null);
  assert.equal(missingTexture.textureFallbackStatus, "missing");

  const safe = toCustomerSafeMaterialRecord(royale, {
    roomKey: "kitchen",
    optionKey: "material:kitchen:e100-carrara-royale"
  });
  assert.equal(safe.materialId, "e100-carrara-royale");
  assert.equal("pricingGroupCode" in safe, false);
  assert.equal(safe.textureFallbackStatus, "ready");
  assertPublicConfigurationHasNoForbiddenContent(safe);

  // Remnant / inactive excluded from default list
  assert.equal(activeVisible.some((m) => m.pricingGroupCode === "remnant"), false);
  assert.equal(activeVisible.every((m) => m.active && m.customerVisible), true);
  const remnant = buildRemnantCustomerMaterial({
    materialId: "e100-remnant-sample",
    displayName: "Remnant Sample"
  });
  assert.equal(remnant.customerVisible, false);
  assert.equal(remnant.remnantPermitted, false);
  assert.equal(remnant.active, false);

  const forged = resolveMaterialSelectionFromOption({
    optionKey: "material:kitchen:e100-does-not-exist"
  });
  assert.equal(forged.materialGroup, null);

  const fromCatalog = resolveMaterialSelectionFromOption({
    optionKey: "material:kitchen:e100-antique-gray"
  });
  assert.equal(fromCatalog.materialGroup, "promo");

  const legacy = resolveMaterialSelectionFromOption({
    optionKey: "material:kitchen:group_b",
    compatibilityJson: { materialGroup: "group_b", role: "material_selection" }
  });
  assert.equal(legacy.materialGroup, "group_b");
  assert.equal(legacy.legacyGroupOnly, true);

  assert.equal(listElite100CustomerMaterials().filter((m) => m.imageThumbPath).length, 11);
  assert.equal(listElite100CustomerMaterials().filter((m) => m.textureFallbackStatus === "ready").length, 11);
  assert.ok(isKnownMaterialOrLegacyGroupToken("e100-carrara-classic"));
  assert.ok(isKnownMaterialOrLegacyGroupToken("group_f"));
  assert.ok(pickDefaultMaterialForGroup("promo")?.imageThumbPath);

  assert.throws(
    () => rejectPublicSelectionAuthority({ materialGroup: "group_f" }),
    (e) => e.statusCode === 400
  );
  assert.throws(
    () => rejectPublicSelectionAuthority({ total: 999 }),
    (e) => e.statusCode === 400
  );
  console.log("ok: catalog authority + full Elite 100 + customer-safe projection + authority reject");
}

// --- Engine: same-group $0 / cross-group delta ---
{
  const rates = {
    direct: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT },
    wholesale: { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT }
  };

  const base = {
    organizationId: ORG,
    publication: { id: "p", snapshotId: "s", status: "active", quoteFamilyRootId: "qf" },
    envelope: { id: "e", version: 1, status: "active", publicationId: "p" },
    pricingPolicyFingerprint: "fp",
    catalogFingerprint: "cf",
    engineVersion: "elite100-config-delta-v2",
    pricingBasis: "direct",
    partnerAccountId: null,
    accountMemberships: [],
    materialRateOverrides: [],
    estimateAdjustments: [],
    frozenBaseRates: rates,
    authorizedMaterialMarkup: { bps: 0 },
    materialTaxPolicy: { bps: 200 },
    options: [],
    baseline: {
      exactTotal: 2040,
      displayTotal: 2040,
      rooms: [{ roomKey: "kitchen", materialGroup: "promo" }]
    },
    pricingValidThrough: "2099-12-31",
    materialProgram: "elite_100",
    actor: { type: "system" },
    asOf: "2026-07-16T12:00:00.000Z"
  };

  const sameGroup = calculateElite100ConfigDeltaV2({
    ...base,
    rooms: [
      {
        roomKey: "kitchen",
        displayName: "Kitchen",
        chargeableCounterSf: 40,
        selectedMaterialGroup: "promo",
        baselineMaterialGroup: "promo"
      }
    ]
  });
  assert.equal(Number(sameGroup.totals.exactDelta), 0);

  const cross = calculateElite100ConfigDeltaV2({
    ...base,
    rooms: [
      {
        roomKey: "kitchen",
        displayName: "Kitchen",
        chargeableCounterSf: 40,
        selectedMaterialGroup: "group_b",
        baselineMaterialGroup: "promo"
      }
    ]
  });
  assert.notEqual(Number(cross.totals.exactDelta), 0);
  console.log("ok: same-group $0 and cross-group v2 delta");
}

// --- Public flow with color IDs ---
{
  const deRepo = createInMemoryDigitalEstimateRepository();
  deRepo.seedQuote(eliteHeader("Group B"));
  const published = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u1",
    repository: deRepo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });

  const pricing = createInMemoryPricingPolicyRepository();
  pricing.seedConfirmedElite100Fixtures(ORG);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const publication = deRepo._dump().publications[0];
  const snap = deRepo._dump().snapshots[0];
  snap.pricing_evidence_json = {
    materialProgramDefault: "elite_100",
    calculationSnapshotCopy: {
      materialProgramDefault: "elite_100",
      internal_ui: {
        estimate_rooms: [
          { id: "kitchen", name: "Kitchen", countertopSqft: 40, materialGroup: "group_b", colorName: "Alabaster" }
        ]
      }
    }
  };
  snap.customer_snapshot_json = {
    ...(snap.customer_snapshot_json || {}),
    totals: { estimatedProjectTotal: 5000 },
    project: { customerName: "Customer", name: "Kitchen" }
  };
  cfgRepo.seedPublication(publication);
  cfgRepo.seedSnapshot(snap);

  const studio = createConfigurationStudioService({
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });

  const draftGraph = await studio.createDraft(ORG, "u1", publication.id, {});
  const matGroup = draftGraph.groups.find((g) => g.group_key === "material_by_room");
  assert.ok(matGroup);
  const seededMaterialOpts = draftGraph.options.filter((o) => String(o.option_key).startsWith("material:"));
  assert.equal(seededMaterialOpts.length, 100, "createDraft seeds all customer-visible materials");
  const seeded = seededMaterialOpts.find((o) => String(o.option_key).includes("e100-"));
  assert.ok(seeded);
  assert.ok(
    String(seeded.option_key).includes("e100-") || String(seeded.compatibility_json?.materialColorId || "").includes("e100-")
  );
  const baselineSeeded = seededMaterialOpts.filter((o) => o.included_in_baseline || o.includedInBaseline);
  assert.equal(baselineSeeded.length, 1, "only default material includedInBaseline");

  // Upsert a few known options (createDraft already seeded all 100)
  await studio.putOptions(ORG, draftGraph.envelope.id, {
    options: [
      {
        groupId: matGroup.id,
        optionKey: "material:kitchen:e100-alabaster",
        displayLabel: "Alabaster",
        defaultQty: 1,
        includedInBaseline: true,
        minQty: 0,
        maxQty: 1,
        compatibilityJson: {
          roomKey: "kitchen",
          materialColorId: "e100-alabaster",
          role: "material_selection",
          isDefault: true
        }
      },
      {
        groupId: matGroup.id,
        optionKey: "material:kitchen:e100-calacatta-gold",
        displayLabel: "Calacatta Gold",
        defaultQty: 0,
        includedInBaseline: false,
        minQty: 0,
        maxQty: 1,
        compatibilityJson: {
          roomKey: "kitchen",
          materialColorId: "e100-calacatta-gold",
          role: "material_selection"
        }
      },
      {
        groupId: matGroup.id,
        optionKey: "material:kitchen:e100-carrara-royale",
        displayLabel: "Carrara Royale",
        defaultQty: 0,
        includedInBaseline: false,
        minQty: 0,
        maxQty: 1,
        compatibilityJson: {
          roomKey: "kitchen",
          materialColorId: "e100-carrara-royale",
          role: "material_selection"
        }
      }
    ]
  });

  await studio.activate(ORG, draftGraph.envelope.id, { confirm: true, acknowledgeFreeze: true }, "u1");

  const service = createPublicConfigurationService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });

  const exchanged = await service.exchangePublicationToken({ rawToken: published.accessToken });
  assert.equal(exchanged.state.lifecycle, "active");
  const materials = exchanged.state.configuration.materials || [];
  assert.equal(materials.length, 100);
  const ids = materials.map((m) => m.materialId);
  assert.equal(new Set(ids).size, 100);
  assert.ok(ids.includes("e100-alabaster"));
  assert.ok(ids.includes("e100-calacatta-gold"));
  assert.ok(ids.includes("e100-carrara-royale"));
  assert.ok(ids.includes("e100-skara-brae"));
  for (const m of materials) {
    assert.equal("pricingGroupCode" in m, false);
    assert.equal("materialGroup" in m, false);
    assert.ok(m.textureFallbackStatus === "ready" || m.textureFallbackStatus === "missing");
    if (m.imageAssetPath) assert.ok(String(m.imageAssetPath).startsWith("/materials/elite100/"));
  }
  assertPublicConfigurationHasNoForbiddenContent(materials);
  assert.equal(JSON.stringify(exchanged.state).includes("http://"), false);

  // Same-group color change (alabaster → calacatta gold, both group_b)
  const same = await service.saveSelections({
    rawSecret: exchanged.rawSecret,
    body: {
      expectedRowVersion: exchanged.state.session.rowVersion,
      idempotencyKey: "mat-same-1",
      items: [{ optionKey: "material:kitchen:e100-calacatta-gold", quantity: 1 }]
    }
  });
  assert.equal(same.ok, true);
  assert.equal(Number(same.calculation?.displayDelta ?? same.calculation?.totals?.displayDelta ?? 0), 0);

  // Cross-group (group_b → promo)
  const cross = await service.saveSelections({
    rawSecret: exchanged.rawSecret,
    body: {
      expectedRowVersion: same.session.rowVersion,
      idempotencyKey: "mat-cross-1",
      items: [{ optionKey: "material:kitchen:e100-carrara-royale", quantity: 1 }]
    }
  });
  assert.notEqual(Number(cross.calculation?.displayDelta ?? cross.calculation?.totals?.displayDelta), 0);

  // Group F color from full catalog saves successfully
  const groupF = await service.saveSelections({
    rawSecret: exchanged.rawSecret,
    body: {
      expectedRowVersion: cross.session.rowVersion,
      idempotencyKey: "mat-group-f-1",
      items: [{ optionKey: "material:kitchen:e100-skara-brae", quantity: 1 }]
    }
  });
  assert.equal(groupF.ok, true);
  assert.notEqual(Number(groupF.calculation?.displayDelta ?? groupF.calculation?.totals?.displayDelta), 0);

  // Unknown color rejected
  await assert.rejects(
    () =>
      service.saveSelections({
        rawSecret: exchanged.rawSecret,
        body: {
          expectedRowVersion: groupF.session.rowVersion,
          idempotencyKey: "mat-forge-1",
          items: [{ optionKey: "material:kitchen:e100-forged", quantity: 1 }]
        }
      }),
    (e) => e.statusCode === 422 || e.statusCode === 400 || e.code === "invalid_selection" || e.code === "unknown_option"
  );

  // Forged group on item rejected
  await assert.rejects(
    () =>
      service.saveSelections({
        rawSecret: exchanged.rawSecret,
        body: {
          expectedRowVersion: groupF.session.rowVersion,
          idempotencyKey: "mat-forge-group",
          items: [{ optionKey: "material:kitchen:e100-alabaster", quantity: 1, materialGroup: "group_f" }]
        }
      }),
    (e) => e.statusCode === 400 || e.code === "forbidden_caller_authority"
  );

  // Studio context exposes full catalog for estimators
  const ctx = await studio.getPublicationContext(ORG, publication.id);
  assert.equal((ctx.context.materialCatalog || []).length, 100);
  assert.equal(ctx.context.materialCatalogContract, ELITE100_MATERIAL_CATALOG_CONTRACT);

  console.log("ok: public color selection same/cross/forge + studio catalog (100)");
}

console.log("\nphaseDe2h.materialCatalog.test.mjs");
console.log(`catalog size=${ELITE100_CUSTOMER_MATERIALS.length}`);
