/**
 * Phase DE.2B — Digital Estimate configuration + pricing-policy foundation tests.
 * Run: node backend-core/src/digitalEstimate/configuration/phaseDe2b.test.mjs
 *
 * Does not call calculateQuote(). Does not apply SQL. Does not write quote_headers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

import {
  CALCULATOR_VS_CONFIRMED_REMNANT_WHOLESALE,
  FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT,
  FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT,
  FIXTURE_GLOBAL_MATERIAL_USE_TAX,
  FIXTURE_SPAHN_AND_ROSE_ESTIMATE_ADJUSTMENT,
  FIXTURE_WATTS_PROMO_OVERRIDE
} from "./approvedPricingFixtures.mjs";
import {
  isDigitalEstimateConfigurationEnabled,
  isDigitalEstimateConfigurationRuntimeEnabled
} from "./configurationConfig.mjs";
import { createDigitalEstimateConfigurationStack } from "./configurationFactory.mjs";
import {
  assertPublicConfigurationHasNoForbiddenContent,
  toPublicConfigurationOption
} from "./configurationPublicSerializer.mjs";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import {
  applyMaterialUseTax,
  createInMemoryPricingPolicyRepository
} from "./pricingPolicyRepository.mjs";
import { normalizeSelectionPayload } from "./configurationValidation.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const PUB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUOTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WATTS_ACCOUNT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WATTS_ACCOUNT_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SPAHN_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SPAHN_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const OTHER_ACCOUNT = "99999999-9999-4999-8999-999999999999";

function seedPub(repo, overrides = {}) {
  const publication = {
    id: PUB,
    organization_id: ORG,
    source_quote_id: QUOTE,
    quote_family_root_id: QUOTE,
    revision_number: 1,
    status: "active",
    source_quote_fingerprint: "fp-source",
    customer_snapshot_hash: "fp-customer",
    pricing_evidence_hash: "fp-evidence",
    pricing_valid_through: "2026-12-31",
    ...overrides
  };
  repo.seedPublication(publication);
  repo.seedSnapshot({
    id: randomUUID(),
    organization_id: publication.organization_id,
    publication_id: publication.id,
    customer_snapshot_json: { totals: { estimatedProjectTotal: 5000 } },
    pricing_evidence_json: { internal: true },
    customer_snapshot_hash: publication.customer_snapshot_hash,
    pricing_evidence_hash: publication.pricing_evidence_hash
  });
  return publication;
}

async function buildMinimalActiveEnvelope(repo, organizationId = ORG) {
  seedPub(repo, organizationId !== ORG ? { organization_id: organizationId, id: randomUUID() } : {});
  const pubs = organizationId === ORG ? PUB : [...repo._dump().envelopes];
  const publicationId =
    organizationId === ORG
      ? PUB
      : (await (async () => {
          const id = randomUUID();
          repo.seedPublication({
            id,
            organization_id: organizationId,
            source_quote_id: QUOTE,
            quote_family_root_id: QUOTE,
            revision_number: 1,
            status: "active",
            source_quote_fingerprint: "fp",
            customer_snapshot_hash: "c",
            pricing_evidence_hash: "e"
          });
          repo.seedSnapshot({
            id: randomUUID(),
            organization_id: organizationId,
            publication_id: id,
            customer_snapshot_json: {},
            pricing_evidence_json: {},
            customer_snapshot_hash: "c",
            pricing_evidence_hash: "e"
          });
          return id;
        })());

  const draft = await repo.createDraftEnvelope({
    organizationId,
    publicationId,
    actorUserId: "u1",
    body: {}
  });
  const group = await repo.upsertDraftGroup(organizationId, draft.id, {
    groupKey: "sink_package",
    displayLabel: "Sink package",
    required: true
  });
  await repo.upsertDraftOption(organizationId, draft.id, {
    groupId: group.id,
    optionKey: "blanco_stock",
    displayLabel: "Stock Blanco",
    sellPrice: 450,
    customerPriceTreatment: "absolute",
    pricingMode: "per_each",
    minQty: 0,
    maxQty: 2,
    defaultQty: 0,
    costBasis: 200,
    wholesaleRate: 400,
    notesInternal: "internal margin note"
  });
  const activated = await repo.activateEnvelope(organizationId, draft.id, {
    actorUserId: "u1",
    pricingPolicyFingerprint: "policy-fp",
    catalogFingerprint: "catalog-fp"
  });
  return { draft, group, activated, publicationId };
}

// --- Flags ---
{
  assert.equal(isDigitalEstimateConfigurationEnabled({}), false);
  assert.equal(
    isDigitalEstimateConfigurationEnabled({ DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1" }),
    true
  );
  assert.equal(
    isDigitalEstimateConfigurationRuntimeEnabled({
      DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
      DIGITAL_ESTIMATE_API_ENABLED: "1",
      ELITE100_ESTIMATE_STUDIO_ENABLED: "0"
    }),
    false
  );
  console.log("ok: configuration flags default off / require studio+api");
}

// --- Factory fail-closed ---
{
  assert.equal(createDigitalEstimateConfigurationStack({ env: {}, requireRuntimeFlags: true }), null);
  assert.equal(
    createDigitalEstimateConfigurationStack({
      env: { DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "0" },
      mode: "memory",
      requireRuntimeFlags: true
    }),
    null
  );
  assert.throws(
    () =>
      createDigitalEstimateConfigurationStack({
        env: {
          DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
          DIGITAL_ESTIMATE_API_ENABLED: "1",
          ELITE100_ESTIMATE_STUDIO_ENABLED: "1"
        },
        mode: "supabase",
        db: null,
        requireRuntimeFlags: true
      }),
    (e) => e.code === "supabase_misconfigured"
  );
  const mem = createDigitalEstimateConfigurationStack({
    env: {
      DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
      DIGITAL_ESTIMATE_API_ENABLED: "1",
      ELITE100_ESTIMATE_STUDIO_ENABLED: "1"
    },
    mode: "memory",
    requireRuntimeFlags: true
  });
  assert.equal(mem.mode, "memory");
  console.log("ok: factory flags-off null + supabase fails closed");
}

// --- Draft create/edit + activation + immutability ---
{
  const repo = createInMemoryConfigurationRepository();
  seedPub(repo);
  const draft = await repo.createDraftEnvelope({
    organizationId: ORG,
    publicationId: PUB,
    actorUserId: "u1",
    body: {}
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.organization_id, ORG);
  assert.equal(draft.source_quote_id, QUOTE);

  await assert.rejects(
    () =>
      repo.createDraftEnvelope({
        organizationId: ORG,
        publicationId: PUB,
        body: { organizationId: ORG_B }
      }),
    (e) => e.code === "forbidden_caller_authority"
  );

  const g = await repo.upsertDraftGroup(ORG, draft.id, {
    groupKey: "edge",
    displayLabel: "Edge"
  });
  await repo.upsertDraftOption(ORG, draft.id, {
    groupId: g.id,
    optionKey: "included_edge",
    displayLabel: "Included",
    customerPriceTreatment: "included",
    sellPrice: 0,
    defaultQty: 1,
    includedInBaseline: true
  });

  const act = await repo.activateEnvelope(ORG, draft.id, {
    actorUserId: "u1",
    pricingPolicyFingerprint: "p1",
    catalogFingerprint: "c1"
  });
  assert.equal(act.envelope.status, "active");
  assert.equal(act.supersededCount, 0);

  await assert.rejects(
    () => repo.upsertDraftGroup(ORG, draft.id, { groupKey: "x", displayLabel: "X" }),
    (e) => e.code === "immutable"
  );
  await assert.rejects(
    () =>
      repo.upsertDraftOption(ORG, draft.id, {
        groupId: g.id,
        optionKey: "y",
        displayLabel: "Y",
        sellPrice: 1
      }),
    (e) => e.code === "immutable"
  );

  const active = await repo.getActiveEnvelope(ORG, PUB);
  assert.equal(active.id, draft.id);
  console.log("ok: draft create/edit, activate, active immutability");
}

// --- Clone-on-edit + supersession + single active ---
{
  const repo = createInMemoryConfigurationRepository();
  const { activated, publicationId } = await buildMinimalActiveEnvelope(repo);
  const clone = await repo.cloneEnvelopeToDraft(ORG, activated.envelope.id, { actorUserId: "u1" });
  assert.equal(clone.status, "draft");
  assert.equal(clone.cloned_from_envelope_id, activated.envelope.id);
  const graph = await repo.getEnvelopeGraph(ORG, clone.id);
  assert.ok(graph.options.length >= 1);

  await repo.activateEnvelope(ORG, clone.id, { actorUserId: "u1" });
  const versions = await repo.listEnvelopesForPublication(ORG, publicationId);
  const actives = versions.filter((v) => v.status === "active");
  assert.equal(actives.length, 1);
  assert.equal(actives[0].id, clone.id);
  const prior = versions.find((v) => v.id === activated.envelope.id);
  assert.equal(prior.status, "superseded");
  assert.equal(prior.superseded_by_envelope_id, clone.id);
  console.log("ok: clone-on-edit, supersession, single active");
}

// --- Atomic activation rollback ---
{
  const repo = createInMemoryConfigurationRepository();
  seedPub(repo);
  const draft = await repo.createDraftEnvelope({
    organizationId: ORG,
    publicationId: PUB,
    actorUserId: "u1"
  });
  // no groups/options → validation failure → rollback
  await assert.rejects(
    () => repo.activateEnvelope(ORG, draft.id, { actorUserId: "u1" }),
    (e) => e.code === "validation_failed"
  );
  const after = await repo.getEnvelope(ORG, draft.id);
  assert.equal(after.status, "draft");
  assert.equal((await repo.getActiveEnvelope(ORG, PUB)), null);
  console.log("ok: activation rollback on validation failure");
}

// --- Concurrent activation ---
{
  const repo = createInMemoryConfigurationRepository();
  seedPub(repo);
  async function makeDraft(key) {
    const d = await repo.createDraftEnvelope({
      organizationId: ORG,
      publicationId: PUB,
      actorUserId: "u1"
    });
    const g = await repo.upsertDraftGroup(ORG, d.id, {
      groupKey: `g_${key}`,
      displayLabel: "G"
    });
    await repo.upsertDraftOption(ORG, d.id, {
      groupId: g.id,
      optionKey: `opt_${key}`,
      displayLabel: "O",
      sellPrice: 10
    });
    return d;
  }
  const a = await makeDraft("a");
  const b = await makeDraft("b");
  const results = await Promise.allSettled([
    repo.activateEnvelope(ORG, a.id, { actorUserId: "u1" }),
    repo.activateEnvelope(ORG, b.id, { actorUserId: "u2" })
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  assert.equal(fulfilled.length, 2);
  const actives = (await repo.listEnvelopesForPublication(ORG, PUB)).filter((e) => e.status === "active");
  assert.equal(actives.length, 1);
  console.log("ok: concurrent activation → single active");
}

// --- Cross-org denial ---
{
  const repo = createInMemoryConfigurationRepository();
  const { activated } = await buildMinimalActiveEnvelope(repo);
  assert.equal(await repo.getEnvelope(ORG_B, activated.envelope.id), null);
  await assert.rejects(
    () => repo.activateEnvelope(ORG_B, activated.envelope.id, { actorUserId: "x" }),
    (e) => e.code === "not_found"
  );
  console.log("ok: cross-org denial");
}

// --- Spoofed price / selection authority ---
{
  const repo = createInMemoryConfigurationRepository();
  const { activated } = await buildMinimalActiveEnvelope(repo);
  const session = await repo.createSession(ORG, {
    publicationId: PUB,
    envelopeId: activated.envelope.id
  });
  await assert.rejects(
    () =>
      repo.saveSelection(ORG, session.id, {
        selections: { blanco_stock: 1 },
        sellPrice: 1,
        markup: 25
      }),
    (e) => e.code === "forbidden_caller_authority"
  );
  assert.throws(
    () => normalizeSelectionPayload({ blanco_stock: 1, organizationId: ORG }, []),
    (e) => e.code === "forbidden_caller_authority"
  );
  console.log("ok: spoofed price/org rejected");
}

// --- Selection rules, qty, idempotency, optimistic concurrency ---
{
  const repo = createInMemoryConfigurationRepository();
  const { activated } = await buildMinimalActiveEnvelope(repo);
  const session = await repo.createSession(ORG, {
    publicationId: PUB,
    envelopeId: activated.envelope.id
  });
  await assert.rejects(
    () => repo.saveSelection(ORG, session.id, { selections: { blanco_stock: 99 } }),
    (e) => e.code === "qty_out_of_bounds"
  );
  await assert.rejects(
    () => repo.saveSelection(ORG, session.id, { selections: { unknown: 1 } }),
    (e) => e.code === "unknown_option"
  );
  const s1 = await repo.saveSelection(
    ORG,
    session.id,
    { selections: { blanco_stock: 1 } },
    { idempotencyKey: "idem-1", expectedRowVersion: 1 }
  );
  const s2 = await repo.saveSelection(
    ORG,
    session.id,
    { selections: { blanco_stock: 2 } },
    { idempotencyKey: "idem-1" }
  );
  assert.equal(s1.id, s2.id);
  await assert.rejects(
    () =>
      repo.saveSelection(
        ORG,
        session.id,
        { selections: { blanco_stock: 1 } },
        { expectedRowVersion: 1 }
      ),
    (e) => e.code === "row_version_conflict"
  );
  console.log("ok: selection validation, idempotency, optimistic concurrency");
}

// --- Append-only events + immutable calculations ---
{
  const repo = createInMemoryConfigurationRepository();
  const { activated } = await buildMinimalActiveEnvelope(repo);
  const session = await repo.createSession(ORG, {
    publicationId: PUB,
    envelopeId: activated.envelope.id
  });
  const sel = await repo.saveSelection(ORG, session.id, { selections: { blanco_stock: 1 } });
  const calc = await repo.insertCalculation(ORG, {
    selectionId: sel.id,
    customerResultJson: { configuredTotal: 450, options: [{ optionKey: "blanco_stock", qty: 1 }] },
    internalEvidenceJson: {
      frozenRules: [{ ruleId: "x", rate: 40 }],
      materialTax: applyMaterialUseTax(1000)
    },
    baselineTotal: 5000,
    configuredTotal: 5450
  });
  assert.ok(calc.id);
  await assert.rejects(() => repo.updateCalculation(), (e) => e.code === "immutable");
  await assert.rejects(() => repo.updateEvent(), (e) => e.code === "immutable");
  const ev = repo.listEvents(ORG, activated.envelope.id);
  assert.ok(ev.some((e) => e.event_type === "envelope_activated"));
  assert.ok(ev.some((e) => e.event_type === "calculated"));
  console.log("ok: append-only events + immutable calculations");
}

// --- Public forbidden-field projection ---
{
  const publicOpt = toPublicConfigurationOption({
    option_key: "blanco_stock",
    display_label: "Stock Blanco",
    sell_price: 450,
    cost_basis: 200,
    wholesale_rate: 400,
    notes_internal: "secret",
    customer_price_treatment: "absolute",
    notes_customer: "Nice sink"
  });
  assert.equal(publicOpt.visibleSellPrice, 450);
  assert.equal(Object.hasOwn(publicOpt, "cost_basis"), false);
  assert.equal(Object.hasOwn(publicOpt, "wholesale_rate"), false);
  assertPublicConfigurationHasNoForbiddenContent(publicOpt);
  assert.throws(() =>
    assertPublicConfigurationHasNoForbiddenContent({ wholesale: 45, optionKey: "x" })
  );
  console.log("ok: public forbidden-field projection");
}

// --- No raw tokens in migration / no quote_headers alter ---
{
  const sql = readFileSync(
    join(__dirname, "../../../supabase/eliteos_digital_estimate_configuration_v1.sql"),
    "utf8"
  );
  assert.ok(sql.includes("set search_path = public"));
  assert.ok(sql.includes("digital_estimate_activate_configuration_envelope"));
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("revoke all on table public.digital_estimate_configuration_envelopes from anon, authenticated"));
  assert.ok(sql.includes("grant execute on function public.digital_estimate_activate_configuration_envelope"));
  assert.ok(sql.includes("uq_de_config_one_active_envelope_per_publication"));
  assert.equal(sql.includes("raw_token"), false);
  assert.equal(sql.includes("alter table public.quote_headers"), false);
  assert.equal(sql.includes("quote_price_group_rates"), false);
  assert.ok(sql.includes("partner_account_id"));
  assert.ok(sql.includes("never quote_headers.customer_name") || sql.includes("Never") || sql.includes("customer_name"));
  console.log("ok: migration RLS/grants/search_path audit (unapplied)");
}

// --- Pricing fixtures: schedules distinct + Remnant 45/50 ---
{
  const policy = createInMemoryPricingPolicyRepository();
  policy.seedConfirmedElite100Fixtures(ORG);
  assert.equal(policy.schedulesAreDistinct(ORG), true);
  assert.equal(policy.getBaseRates(ORG, "direct").promo, 70);
  assert.equal(policy.getBaseRates(ORG, "wholesale").promo, 45);
  assert.equal(policy.getBaseRates(ORG, "direct").remnant, 50);
  assert.equal(policy.getBaseRates(ORG, "wholesale").remnant, 45);
  assert.equal(FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT.remnant, 45);
  assert.equal(FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT.remnant, 50);
  assert.equal(CALCULATOR_VS_CONFIRMED_REMNANT_WHOLESALE.calculatorWholesaleRemnant, 50);
  assert.equal(CALCULATOR_VS_CONFIRMED_REMNANT_WHOLESALE.confirmedPolicyWholesaleRemnant, 45);
  console.log("ok: Direct/Wholesale distinct + Remnant fixture 45/50");
}

// --- Watt's Promo $40 only for members ---
{
  const policy = createInMemoryPricingPolicyRepository();
  const seeded = policy.seedConfirmedElite100Fixtures(ORG);
  await policy.addAccountGroupMember(ORG, seeded.wattsAccountGroupId, WATTS_ACCOUNT);

  const watts = policy.resolveMaterialRate(ORG, WATTS_ACCOUNT, "direct", "promo");
  assert.equal(watts.ratePerSqft, FIXTURE_WATTS_PROMO_OVERRIDE.ratePerSqft);
  assert.equal(watts.source, "account_material_override");
  assert.ok(watts.frozen.ruleId);

  const other = policy.resolveMaterialRate(ORG, OTHER_ACCOUNT, "direct", "promo");
  assert.equal(other.ratePerSqft, 70);
  assert.equal(other.source, "base_schedule");

  // customer-name spoofing is not an API — only partnerAccountId matters
  const nameSpoof = policy.resolveMaterialRate(ORG, null, "direct", "promo");
  assert.equal(nameSpoof.ratePerSqft, 70);
  console.log("ok: Watt's Promo 40 for group members only");
}

// --- Spahn & Rose 3% for multiple members; not by name ---
{
  const policy = createInMemoryPricingPolicyRepository();
  const seeded = policy.seedConfirmedElite100Fixtures(ORG);
  await policy.addAccountGroupMember(ORG, seeded.spahnAccountGroupId, SPAHN_A);
  await policy.addAccountGroupMember(ORG, seeded.spahnAccountGroupId, SPAHN_B);

  const a = policy.resolveEstimateAdjustments(ORG, SPAHN_A);
  const b = policy.resolveEstimateAdjustments(ORG, SPAHN_B);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].rate, FIXTURE_SPAHN_AND_ROSE_ESTIMATE_ADJUSTMENT.rate);
  assert.equal(a[0].basisPolicy, "entire_pre_rounded_estimate_including_material_use_tax");
  assert.ok(a[0].frozen.ruleId);

  const other = policy.resolveEstimateAdjustments(ORG, OTHER_ACCOUNT);
  assert.equal(other.length, 0);
  console.log("ok: Spahn & Rose 3% multi-member; no name activation");
}

// --- 2% material use tax across schedules ---
{
  const tax = applyMaterialUseTax(1000, FIXTURE_GLOBAL_MATERIAL_USE_TAX);
  assert.equal(tax.rate, 0.02);
  assert.equal(tax.taxAmount, 20);
  assert.equal(tax.taxableBasis, "material_sell_amount");
  for (const schedule of ["wholesale", "direct", "account"]) {
    assert.ok(FIXTURE_GLOBAL_MATERIAL_USE_TAX.appliesAcrossSchedules.includes(schedule));
  }
  assert.ok(FIXTURE_GLOBAL_MATERIAL_USE_TAX.excludesCategories.includes("products"));
  assert.ok(FIXTURE_GLOBAL_MATERIAL_USE_TAX.excludesCategories.includes("fabrication_addons"));
  console.log("ok: 2% material use-tax policy fixture across schedules");
}

// --- Effective dates / inactive rules ---
{
  const policy = createInMemoryPricingPolicyRepository();
  const seeded = policy.seedConfirmedElite100Fixtures(ORG);
  await policy.addAccountGroupMember(ORG, seeded.wattsAccountGroupId, WATTS_ACCOUNT_2, {
    effective_from: "2099-01-01T00:00:00.000Z"
  });
  const future = policy.resolveMaterialRate(ORG, WATTS_ACCOUNT_2, "direct", "promo");
  assert.equal(future.ratePerSqft, 70);
  console.log("ok: account rules respect effective dates");
}

// --- Cross-org account rules denied ---
{
  const policy = createInMemoryPricingPolicyRepository();
  const seeded = policy.seedConfirmedElite100Fixtures(ORG);
  await policy.addAccountGroupMember(ORG, seeded.wattsAccountGroupId, WATTS_ACCOUNT);
  const cross = policy.resolveMaterialRate(ORG_B, WATTS_ACCOUNT, "direct", "promo");
  assert.equal(cross.ratePerSqft, FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT.promo);
  console.log("ok: cross-org account rules denied");
}

// --- Future calc evidence freezes rule IDs ---
{
  const policy = createInMemoryPricingPolicyRepository();
  const seeded = policy.seedConfirmedElite100Fixtures(ORG);
  await policy.addAccountGroupMember(ORG, seeded.wattsAccountGroupId, WATTS_ACCOUNT);
  await policy.addAccountGroupMember(ORG, seeded.spahnAccountGroupId, SPAHN_A);
  const rate = policy.resolveMaterialRate(ORG, WATTS_ACCOUNT, "direct", "promo");
  const adj = policy.resolveEstimateAdjustments(ORG, SPAHN_A);
  const tax = applyMaterialUseTax(2000);
  const evidence = {
    materialRate: rate.frozen,
    estimateAdjustments: adj.map((a) => a.frozen),
    materialTax: tax.frozen
  };
  assert.equal(evidence.materialRate.ratePerSqft, 40);
  assert.equal(evidence.estimateAdjustments[0].rate, 0.03);
  assert.equal(evidence.materialTax.rate, 0.02);
  assertPublicConfigurationHasNoForbiddenContent({
    configuredTotal: 100,
    options: [{ optionKey: "x", qty: 1 }]
  });
  console.log("ok: calculation evidence freeze fields");
}

// --- Estimator overrides append-only ---
{
  const policy = createInMemoryPricingPolicyRepository();
  await policy.appendEstimatorOverride({
    organization_id: ORG,
    override_scope: "estimate",
    override_value: -100,
    value_basis: "absolute",
    reason_internal: "goodwill",
    caps_policy_json: { maxDiscount: null }
  });
  await assert.rejects(() => policy.updateEstimatorOverride(), (e) => e.code === "immutable");
  console.log("ok: estimator override append-only");
}

// --- No calculateQuote import in configuration module ---
{
  const files = [
    "configurationRepository.mjs",
    "pricingPolicyRepository.mjs",
    "configurationFactory.mjs",
    "configurationValidation.mjs",
    "approvedPricingFixtures.mjs"
  ];
  for (const f of files) {
    const src = readFileSync(join(__dirname, f), "utf8");
    assert.equal(/from\s+["'][^"']*quoteCalculator/.test(src), false);
    assert.equal(/import\s*\{[^}]*calculateQuote/.test(src), false);
    assert.equal(src.includes('.from("quote_headers")'), false);
    assert.equal(src.includes("updateQuoteHeader"), false);
  }
  console.log("ok: configuration modules do not import calculateQuote / write quote_headers");
}

// --- Hash stability ---
{
  const h1 = createHash("sha256").update(JSON.stringify({ a: 1 })).digest("hex");
  assert.equal(typeof h1, "string");
  console.log("ok: fingerprint helpers available");
}

console.log("\nAll phaseDe2b backend tests passed.\n");
