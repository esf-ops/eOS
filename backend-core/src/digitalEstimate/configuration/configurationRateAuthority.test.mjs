/**
 * Customer repricing uses the publication's pinned pricing, never the org's current schedule.
 * Approving a different schedule after publication cannot change an existing publication's
 * customer-option pricing; publications whose basis cannot be established are blocked with a
 * "contact Elite" message and their published totals stay unchanged.
 * Run: node backend-core/src/digitalEstimate/configuration/configurationRateAuthority.test.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createInMemoryDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "../digitalEstimatePublishService.mjs";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import { createPublicConfigurationService } from "./publicConfigurationService.mjs";
import { buildTrustedConfigurationContext, serverApprovedOptionCatalog } from "./configurationTrustedContext.mjs";
import {
  FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT,
  FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT
} from "./approvedPricingFixtures.mjs";
import {
  BUILTIN_ELITE100_RATE_SET_KEY,
  BUILTIN_RATE_SETS,
  PRICING_BASIS_UNESTABLISHED_CUSTOMER_MESSAGE,
  computeRateSetId,
  pinForNewPublication,
  resolvePublicationPricingPin
} from "./publicationPricingPin.mjs";
import { ESF_DIRECT_PRICE_PER_SQFT, PROTOTYPE_TIER_PRICE_PER_SQFT } from "../../quotes/quoteCalculator.js";
import { ELITE100_CUTOUT_RATES, ELITE100_TEAROUT } from "../../elite100EstimateStudio/elite100RoomPricingCalculator.mjs";
import { resetDigitalEstimatePublicRateLimitsForTests } from "../digitalEstimateRateLimit.mjs";

const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  ELITE100_ESTIMATE_STUDIO_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

/** A schedule approved *after* publication, with rates that differ from the built-in set. */
const LATER_DIRECT = { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT, group_b: 90, group_c: 110 };
const LATER_WHOLESALE = { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT, group_b: 70, group_c: 88 };

/** Asynchronous provider like the Supabase repository; `behavior` can change mid-test. */
function laterApprovedSchedule(behavior = "approved") {
  return {
    mode: "test_async",
    behavior,
    calls: 0,
    async getBaseRates(_organizationId, scheduleCode) {
      this.calls += 1;
      await new Promise((r) => setTimeout(r, 1));
      if (this.behavior === "fail") throw Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
      if (this.behavior === "none") return {};
      return scheduleCode === "wholesale" ? { ...LATER_WHOLESALE } : { ...LATER_DIRECT };
    }
  };
}

/** Rate evidence as `buildStudioPricingRuleEvidence` records it from the Studio calculation. */
function ruleEvidence({ basis = "direct", rooms, accountRules = {}, ...rest } = {}) {
  return {
    schema: 1,
    pricingEngine: "elite100_room_pricing",
    pricingBasis: basis,
    materialRateTable: basis === "wholesale" ? { ...PROTOTYPE_TIER_PRICE_PER_SQFT } : { ...ESF_DIRECT_PRICE_PER_SQFT },
    materialUseTaxPercent: 2,
    cutoutRates: { ...ELITE100_CUTOUT_RATES },
    rooms: rooms || [
      {
        roomKey: "kitchen",
        materialGroup: "Group B",
        ratePerSf: basis === "wholesale" ? PROTOTYPE_TIER_PRICE_PER_SQFT["Group B"] : ESF_DIRECT_PRICE_PER_SQFT["Group B"],
        rateSource: "elite100_v4_fallback_table",
        materialUseTaxPercent: 2
      }
    ],
    accountRules: { wattsTrusted: false, spahnTrusted: false, estimateWideAdjustmentPercent: 0, ...accountRules },
    ...rest
  };
}

function eliteHeader({ basis = "direct", evidence = ruleEvidence({ basis }), partnerAccountId = null } = {}) {
  return {
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-RATE-000100",
    quote_number_base: "ESF-RATE-000100",
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: QUOTE_ID,
    is_current_revision: true,
    archived_at: null,
    customer_name: "Synthetic Customer",
    project_name: "Kitchen",
    project_address: "1 Synthetic St",
    estimated_material_group: "Group B",
    partner_account_id: partnerAccountId,
    calculation_snapshot: {
      materialGroup: "Group B",
      materialProgramDefault: "elite_100",
      totals: { retail: 870, wholesale: 800, estimated_sqft: 10 },
      ...(evidence ? { pricingRuleEvidence: evidence } : {}),
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 870,
        pricing_basis: basis,
        estimate_rooms: [{ id: "kitchen", name: "Kitchen", countertopSqft: 10, materialGroup: "group_b" }],
        customer_estimate_print_snapshot: { finalRounded: 870 }
      }
    }
  };
}

/**
 * @param {{ provider?: object, evidence?: "published"|"legacy"|"legacy_no_basis"|object }} opts
 *   "published" keeps the pin frozen by publishDigitalEstimate; "legacy" strips it (pre-pin
 *   publication with a recorded basis); "legacy_no_basis" also removes the basis; an object
 *   replaces `pricingPin`.
 */
async function seedStack({
  provider = laterApprovedSchedule("none"),
  evidence = "published",
  header = {}
} = {}) {
  resetDigitalEstimatePublicRateLimitsForTests?.();
  const deRepo = createInMemoryDigitalEstimateRepository();
  deRepo.seedQuote(eliteHeader(header));
  const published = await publishDigitalEstimate({
    env: ENV_ON,
    organizationId: ORG,
    actorUserId: "u1",
    repository: deRepo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: provider });
  const publication = deRepo._dump().publications[0];
  const snap = deRepo._dump().snapshots[0];
  const frozenPin = snap.pricing_evidence_json.pricingPin;
  const basis = evidence === "legacy_no_basis" ? {} : { pricing_basis: header.basis || "direct" };
  snap.pricing_evidence_json = {
    materialProgramDefault: "elite_100",
    calculationSnapshotCopy: {
      materialProgramDefault: "elite_100",
      internal_ui: {
        ...basis,
        estimate_rooms: [{ id: "kitchen", name: "Kitchen", countertopSqft: 10, materialGroup: "group_b" }]
      }
    },
    ...(evidence === "published" ? { pricingPin: frozenPin } : {}),
    ...(evidence && typeof evidence === "object" ? { pricingPin: evidence } : {})
  };
  snap.customer_snapshot_json = {
    ...(snap.customer_snapshot_json || {}),
    totals: { estimatedProjectTotal: 870 },
    project: { customerName: "Customer", name: "Kitchen", projectName: "Kitchen" },
    rooms: [{ name: "Kitchen", materialLabel: "Group B", summaryLines: [], colorLabel: null }]
  };
  cfgRepo.seedPublication(publication);
  cfgRepo.seedSnapshot(snap);
  const draft = await cfgRepo.createDraftEnvelope({
    organizationId: ORG,
    publicationId: publication.id,
    actorUserId: "u1",
    body: {}
  });
  const group = await cfgRepo.upsertDraftGroup(ORG, draft.id, {
    groupKey: "material_by_room",
    displayLabel: "Material by room",
    required: true
  });
  for (const [code, qty] of [["group_b", 1], ["group_c", 0]]) {
    await cfgRepo.upsertDraftOption(ORG, draft.id, {
      groupId: group.id,
      optionKey: `material:kitchen:${code}`,
      displayLabel: `Kitchen — ${code}`,
      defaultQty: qty,
      sellPrice: 0,
      compatibilityJson: { roomKey: "kitchen", materialGroup: code, role: "material_selection" }
    });
  }
  await cfgRepo.activateEnvelope(ORG, draft.id, { actorUserId: "u1", pricingPolicyFingerprint: "p", catalogFingerprint: "c" });
  const publicService = createPublicConfigurationService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: provider
  });
  return { deRepo, publication, published, publicService, frozenPin, provider };
}

async function customerSave(stack, optionKey) {
  const exchanged = await stack.publicService.exchangePublicationToken({ rawToken: stack.published.accessToken });
  return stack.publicService.saveSelections({
    rawSecret: exchanged.rawSecret,
    body: {
      items: [{ optionKey, quantity: 1 }],
      expectedRowVersion: exchanged.state.session.rowVersion,
      idempotencyKey: `sel-${randomUUID()}`
    }
  });
}

function ctxFor(stack, extra = {}) {
  return buildTrustedConfigurationContext({
    organizationId: ORG,
    publicationId: stack.publication.id,
    deRepository: stack.deRepo,
    pricingPolicyRepository: stack.provider,
    ...extra
  });
}

// The built-in set is exactly what the calculator prices baselines with, so pinning it can
// never disagree with a published total.
{
  const set = BUILTIN_RATE_SETS[BUILTIN_ELITE100_RATE_SET_KEY];
  const toGroupCodes = (t) => ({
    promo: t["Group Promo"], group_a: t["Group A"], group_b: t["Group B"], group_c: t["Group C"],
    group_d: t["Group D"], group_e: t["Group E"], group_f: t["Group F"], remnant: t.Remnant
  });
  assert.deepEqual({ ...set.rates.direct }, toGroupCodes(ESF_DIRECT_PRICE_PER_SQFT));
  assert.deepEqual({ ...set.rates.wholesale }, toGroupCodes(PROTOTYPE_TIER_PRICE_PER_SQFT));
  assert.deepEqual({ ...set.rates.direct }, { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT });
  assert.deepEqual({ ...set.rates.wholesale }, { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT });
  assert.equal(set.optionPrices["qty-sink"], ELITE100_CUTOUT_RATES.kitchenSink);
  assert.equal(set.optionPrices["qty-bar"], ELITE100_CUTOUT_RATES.vanitySink);
  assert.equal(set.optionPrices["qty-cook"], ELITE100_CUTOUT_RATES.cooktop);
  assert.equal(set.optionPrices["qty-outlet"], ELITE100_CUTOUT_RATES.electricalOutlet);
  assert.equal(set.optionPrices.tearout, ELITE100_TEAROUT);
  for (const o of serverApprovedOptionCatalog().filter((x) => x.availabilityState === "active")) {
    assert.equal(set.optionPrices[o.optionKey], o.sellPrice, `built-in pin prices ${o.optionKey} like the catalog`);
  }
  assert.throws(() => { set.rates.direct.group_b = 1; }, "built-in rate set is immutable");
  console.log("ok: built-in rate set equals calculator tables, fixtures and option catalog; immutable");
}

// Publishing freezes a pin: technical id + schedule, no approval fields.
{
  const stack = await seedStack();
  const pin = stack.frozenPin;
  assert.equal(pin.schema, 1);
  assert.equal(pin.source, "calculation");
  assert.equal(pin.pricingBasis, "direct");
  assert.deepEqual(pin.repricingBlockedReasons || [], []);
  assert.equal(pin.materialUseTaxBps, 200);
  assert.equal(pin.rateSetId, computeRateSetId(pin));
  assert.match(pin.rateSetId, /^rs1_[0-9a-f]{64}$/);
  for (const k of Object.keys(pin)) assert.doesNotMatch(k, /approv/i, "pin carries no approval");
  assert.equal(stack.provider.calls, 0, "publishing does not consult the current schedule");
  console.log("ok: publish freezes a content-addressed pin with no approval fields");
}

// Core guarantee: a schedule approved after publication cannot alter this publication's
// customer-option pricing. 10 SF B → C at pinned 85 → 95: (950 + 19) − (850 + 17) = +102.
{
  const stack = await seedStack({ provider: laterApprovedSchedule("none") });
  const before = await customerSave(stack, "material:kitchen:group_c");
  assert.equal(before.calculation.configuredDisplayTotal, 972);
  const ctxBefore = await ctxFor(stack);

  stack.provider.behavior = "approved";
  const after = await customerSave(stack, "material:kitchen:group_c");
  assert.equal(after.calculation.displayTotalDelta, 102, "not the +204 the later schedule would give");
  assert.equal(after.calculation.configuredDisplayTotal, 972);
  const ctxAfter = await ctxFor(stack);
  assert.deepEqual(ctxAfter.frozenBaseRates, ctxBefore.frozenBaseRates);
  assert.deepEqual(
    ctxAfter.optionCatalogInternal.map((o) => [o.optionKey, o.sellPrice]),
    ctxBefore.optionCatalogInternal.map((o) => [o.optionKey, o.sellPrice])
  );
  assert.equal(ctxAfter.pricingPolicyFingerprint, ctxBefore.pricingPolicyFingerprint);
  assert.equal(ctxAfter.rateSource, "pinned");
  assert.equal(stack.provider.calls, 0, "customer repricing never reads the current schedule");
  console.log("ok: approving a different schedule later does not change existing customer-option pricing (+$102 stays)");
}

// A schedule outage cannot affect repricing either — there is no lookup to fail.
{
  const stack = await seedStack({ provider: laterApprovedSchedule("fail") });
  const saved = await customerSave(stack, "material:kitchen:group_c");
  assert.equal(saved.calculation.configuredDisplayTotal, 972);
  console.log("ok: schedule lookup failure is irrelevant to pinned repricing");
}

// Keeping the published material preserves the published total.
{
  const stack = await seedStack();
  const saved = await customerSave(stack, "material:kitchen:group_b");
  assert.equal(saved.calculation.configuredDisplayTotal, 870);
  assert.equal(saved.calculation.displayTotalDelta, 0);
  console.log("ok: published total preserved when the customer keeps the published material");
}

// A publication pinned to a different set keeps pricing from its own pin even though the
// built-in set is current: B → C at 90 → 110 = (1100 + 22) − (900 + 18) = +204.
{
  const laterPin = {
    ...pinForNewPublication({ pricingBasis: "direct" }),
    source: "policy_version",
    rateSetKey: null,
    repricingBlockedReasons: [],
    policyVersionId: "22222222-2222-4222-8222-222222222222",
    rates: { direct: { ...LATER_DIRECT }, wholesale: { ...LATER_WHOLESALE } },
    optionPrices: { ...pinForNewPublication().optionPrices, "qty-sink": 225 }
  };
  laterPin.rateSetId = computeRateSetId(laterPin);
  const stack = await seedStack({ evidence: laterPin });
  const saved = await customerSave(stack, "material:kitchen:group_c");
  assert.equal(saved.calculation.displayTotalDelta, 204);
  assert.equal(saved.calculation.configuredDisplayTotal, 1074);
  const ctx = await ctxFor(stack);
  assert.equal(ctx.optionCatalogInternal.find((o) => o.optionKey === "qty-sink").sellPrice, 225);
  assert.equal(ctx.pricingPin.policyVersionId, laterPin.policyVersionId);
  console.log("ok: repricing follows the publication's own pin, not the current built-in set (+$204, sink cutout $225)");
}

// The pin records the rates the calculation actually used, not the defaults available at
// publish: Pricing Admin set Group B to $88 (default $85). B → C = 10 × 1.02 × (95 − 88).
{
  const stack = await seedStack({
    header: {
      evidence: ruleEvidence({
        rooms: [{ roomKey: "kitchen", materialGroup: "Group B", ratePerSf: 88, rateSource: "pricing_admin_override", materialUseTaxPercent: 2 }]
      })
    }
  });
  assert.equal(stack.frozenPin.rates.direct.group_b, 88);
  assert.notEqual(stack.frozenPin.rates.direct.group_b, ESF_DIRECT_PRICE_PER_SQFT["Group B"]);
  assert.ok(stack.frozenPin.rules.some((r) => /pricing_admin_override/.test(JSON.stringify(r))));
  const saved = await customerSave(stack, "material:kitchen:group_c");
  assert.equal(saved.calculation.displayTotalDelta, 71.4, "priced from the $88 actually used, not the $85 default (+102)");
  const kept = await customerSave(stack, "material:kitchen:group_b");
  assert.equal(kept.calculation.configuredDisplayTotal, 870);
  console.log("ok: pin captures the Pricing Admin override the calculation used (+$71.40, not the default +$102)");
}

// Watts accounts: Promo is $40 in the pin even when no room used Promo.
{
  const stack = await seedStack({
    header: {
      partnerAccountId: "acct-watts",
      evidence: ruleEvidence({ accountRules: { wattsTrusted: true } })
    }
  });
  assert.equal(stack.frozenPin.rates.direct.promo, 40);
  assert.deepEqual(stack.frozenPin.repricingBlockedReasons || [], []);
  const ctx = await ctxFor(stack);
  assert.equal(ctx.canConfigure, true);
  assert.equal(ctx.frozenBaseRates.direct.promo, 40);
  console.log("ok: Watts account pin carries the $40 Promo rate");
}

// Retail/wholesale basis is preserved: a wholesale calculation pins wholesale rates and the
// customer path reprices on wholesale. B → C = 10 × 1.02 × (wholesale C − wholesale B).
{
  const stack = await seedStack({ header: { basis: "wholesale" } });
  assert.equal(stack.frozenPin.pricingBasis, "wholesale");
  const ctx = await ctxFor(stack);
  assert.equal(ctx.pricingBasis, "wholesale");
  const saved = await customerSave(stack, "material:kitchen:group_c");
  const expected = Math.round(10 * 1.02 * (PROTOTYPE_TIER_PRICE_PER_SQFT["Group C"] - PROTOTYPE_TIER_PRICE_PER_SQFT["Group B"]) * 100) / 100;
  assert.equal(saved.calculation.displayTotalDelta, expected);
  console.log(`ok: wholesale basis preserved through the pin (+$${expected})`);
}

// Rules the customer path cannot reproduce block repricing explicitly — no silent fallback.
async function assertBlocked(stack, reasonPattern, label) {
  assert.ok((stack.frozenPin.repricingBlockedReasons || []).some((r) => reasonPattern.test(r)), label);
  const ctx = await ctxFor(stack);
  assert.equal(ctx.canConfigure, false, label);
  assert.ok(ctx.blockers.some((b) => b.code === "pricing_rules_not_reproducible"), label);
  const exchanged = await stack.publicService.exchangePublicationToken({ rawToken: stack.published.accessToken });
  assert.equal(exchanged.state.lifecycle, "blocked", label);
  assert.match(exchanged.state.message, /contact Elite/i, label);
  await assert.rejects(
    stack.publicService.saveSelections({
      rawSecret: exchanged.rawSecret,
      body: {
        items: [{ optionKey: "material:kitchen:group_c", quantity: 1 }],
        expectedRowVersion: exchanged.state.session?.rowVersion ?? 1,
        idempotencyKey: `sel-${randomUUID()}`
      }
    }),
    (e) => e.statusCode === 409 && /contact Elite/i.test(e.message),
    label
  );
  assert.equal(stack.deRepo._dump().publications[0].status, "active", `${label}: not revoked`);
}
{
  await assertBlocked(
    await seedStack({
      header: {
        evidence: ruleEvidence({ accountRules: { estimateWideAdjustmentPercent: 5, estimateWideAdjustmentSource: "manual", accountAdjustmentAmount: 43.5 } })
      }
    }),
    /^estimate_wide_adjustment:manual/,
    "manual estimate-wide adjustment"
  );
  await assertBlocked(
    await seedStack({
      header: {
        evidence: ruleEvidence({
          rooms: [{ roomKey: "kitchen", materialGroup: "Group B", ratePerSf: 85, rateSource: "elite100_v4_fallback_table", materialUseTaxPercent: 2, vanityProgram: true }]
        })
      }
    }),
    /vanity_program/,
    "Vanity Program bundled room"
  );
  await assertBlocked(
    await seedStack({
      header: {
        evidence: ruleEvidence({
          rooms: [{ roomKey: "kitchen", materialGroup: "Group B", ratePerSf: 91.5, rateSource: "elite100_v4_fallback_table", materialUseTaxPercent: 2 }]
        })
      }
    }),
    /room_rate_not_reproducible/,
    "room rate the table cannot explain"
  );
  await assertBlocked(await seedStack({ header: { evidence: null } }), /no_rate_evidence/, "no calculation rate evidence");
  await assertBlocked(
    await seedStack({ header: { basis: "direct", evidence: ruleEvidence({ basis: "wholesale" }) } }),
    /basis/,
    "evidence basis differs from the published basis"
  );
  console.log("ok: manual adjustment, Vanity Program, unexplained rate, missing evidence and basis mismatch all block with contact-Elite");
}

// Clearing the blocked reasons breaks the content hash, so a block cannot be edited away.
{
  const stack = await seedStack({
    header: { evidence: ruleEvidence({ accountRules: { estimateWideAdjustmentPercent: 3, estimateWideAdjustmentSource: "manual" } }) }
  });
  const unblocked = { ...stack.frozenPin, repricingBlockedReasons: [] };
  const tamperedStack = await seedStack({
    header: { evidence: ruleEvidence({ accountRules: { estimateWideAdjustmentPercent: 3, estimateWideAdjustmentSource: "manual" } }) },
    evidence: unblocked
  });
  const ctx = await ctxFor(tamperedStack);
  assert.equal(ctx.canConfigure, false);
  assert.ok(ctx.blockers.some((b) => b.code === "pricing_pin_invalid"));
  console.log("ok: removing blocked reasons from a pin invalidates it");
}

// Changing current account overrides / adjustments after publication does not reprice a pinned
// publication (the pin already carries the account rules its calculation used).
{
  const currentPolicy = {
    ...laterApprovedSchedule("approved"),
    _dump() {
      return {
        accountGroups: [{ id: "g1", group_code: "watts" }],
        memberships: [{ id: "m1", organization_id: ORG, account_group_id: "g1", partner_account_id: "acct-1" }],
        materialOverrides: [
          { id: "o1", organization_id: ORG, account_group_id: "g1", group_code: "group_c", rate_per_sqft: 200, schedule_code: "direct", priority: 1 }
        ],
        estimateAdjustments: [{ id: "a1", organization_id: ORG, account_group_id: "g1", adjustment_code: "later", rate_bps: 500, rate: 0.05 }]
      };
    }
  };
  const stack = await seedStack({ provider: currentPolicy, header: { partnerAccountId: "acct-1" } });
  const ctx = await ctxFor(stack);
  assert.deepEqual(ctx.materialRateOverrides, []);
  assert.deepEqual(ctx.estimateAdjustments, []);
  const saved = await customerSave(stack, "material:kitchen:group_c");
  assert.equal(saved.calculation.displayTotalDelta, 102);
  assert.equal(saved.calculation.configuredDisplayTotal, 972);
  console.log("ok: current account overrides/adjustments added later do not reprice a pinned publication");
}

// A tampered pin is refused rather than trusted.
{
  const tampered = { ...pinForNewPublication({ pricingBasis: "direct" }) };
  tampered.rates = { ...tampered.rates, direct: { ...tampered.rates.direct, group_c: 60 } };
  const stack = await seedStack({ evidence: tampered });
  const ctx = await ctxFor(stack);
  assert.equal(ctx.canConfigure, false);
  assert.ok(ctx.blockers.some((b) => b.code === "pricing_pin_invalid"));
  console.log("ok: pin whose content no longer matches its rateSetId blocks repricing");
}

// Pre-pin publication with a recorded basis: the built-in set is the only one ever used.
{
  const stack = await seedStack({ evidence: "legacy" });
  const saved = await customerSave(stack, "material:kitchen:group_c");
  assert.equal(saved.calculation.configuredDisplayTotal, 972);
  const ctx = await ctxFor(stack);
  assert.equal(ctx.rateSource, "legacy_builtin");
  assert.equal(ctx.pricingPin.rateSetKey, BUILTIN_ELITE100_RATE_SET_KEY);
  console.log("ok: legacy publication with a recorded basis reprices from the built-in set");
}

// Pre-pin publications whose calculation used rules the built-in set lacks are blocked, not
// silently repriced from defaults.
{
  const legacy = (extra) => ({
    calculationSnapshotCopy: { internal_ui: { pricing_basis: "direct" }, ...extra }
  });
  for (const [extra, reason] of [
    [{ rooms: [{ bundled: true }] }, "vanity_program_room"],
    [{ rooms: [{ wattsOverrideApplied: true }] }, "watts_trusted_account"],
    [{ rooms: [{ customSlabPackage: true }] }, "custom_slab_package"],
    [{ totals: { accountAdjustment: 26.1, estimateWideAdjustment: { active: true, percentage: 3 } } }, "estimate_wide_adjustment"]
  ]) {
    const r = resolvePublicationPricingPin(legacy(extra));
    assert.equal(r.ok, false, reason);
    assert.equal(r.code, "pricing_rules_not_reproducible", reason);
    assert.match(r.reason, new RegExp(reason));
  }
  assert.equal(resolvePublicationPricingPin(legacy({ rooms: [{ bundled: false }] })).ok, true);
  console.log("ok: legacy publications with Vanity Program, Watts, custom slab or adjustments are blocked");
}

// Basis cannot be established: customer sees the published total and a contact-Elite message;
// saves are refused; nothing is pinned or rewritten.
{
  const stack = await seedStack({ evidence: "legacy_no_basis" });
  const ctx = await ctxFor(stack);
  assert.equal(ctx.canConfigure, false);
  assert.ok(ctx.blockers.some((b) => b.code === "pricing_basis_unestablished"));

  const exchanged = await stack.publicService.exchangePublicationToken({ rawToken: stack.published.accessToken });
  assert.equal(exchanged.state.lifecycle, "blocked");
  assert.equal(exchanged.state.message, PRICING_BASIS_UNESTABLISHED_CUSTOMER_MESSAGE);
  assert.match(exchanged.state.message, /contact Elite/i);
  assert.equal(exchanged.state.configuration, null);
  assert.equal(exchanged.state.readMode, "baseline", "customer can still accept the published total as quoted");
  assert.ok(exchanged.state.session?.id, "session present for accept-as-quoted");
  assert.equal(exchanged.state.estimate?.totals?.estimatedProjectTotal ?? 870, 870, "published total unchanged");

  await assert.rejects(
    stack.publicService.saveSelections({
      rawSecret: exchanged.rawSecret,
      body: {
        items: [{ optionKey: "material:kitchen:group_c", quantity: 1 }],
        expectedRowVersion: exchanged.state.session?.rowVersion ?? 1,
        idempotencyKey: `sel-${randomUUID()}`
      }
    }),
    (e) => e.code === "pricing_basis_unestablished" && e.statusCode === 409 && /contact Elite/i.test(e.message)
  );
  const snap = stack.deRepo._dump().snapshots[0];
  assert.equal(snap.pricing_evidence_json.pricingPin, undefined, "no automatic pin written");
  assert.equal(stack.deRepo._dump().publications[0].status, "active", "not revoked");
  console.log("ok: unestablished basis → contact-Elite block, total unchanged, no auto-pin or revoke");
}

// Staff may still preview by choosing the schedule explicitly.
{
  const stack = await seedStack({ evidence: "legacy_no_basis" });
  const ctx = await ctxFor(stack, { pricingBasis: "wholesale" });
  assert.equal(ctx.canConfigure, true);
  assert.equal(ctx.pricingBasis, "wholesale");
  assert.equal(ctx.rateSource, "staff_selected_basis");
  console.log("ok: staff can preview an unestablished publication by choosing the schedule explicitly");
}
