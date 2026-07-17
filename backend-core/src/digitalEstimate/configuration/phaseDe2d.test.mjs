/**
 * Phase DE.2D — Private Studio configuration envelope builder tests.
 * Run: node backend-core/src/digitalEstimate/configuration/phaseDe2d.test.mjs
 *
 * Does not call calculateQuote(). Does not apply SQL. Does not write quote_headers.
 * Does not enable production flags or grant pilots.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";

import {
  FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT
} from "./approvedPricingFixtures.mjs";
import {
  isDigitalEstimateConfigurationEnabled,
  isDigitalEstimateConfigurationRuntimeEnabled
} from "./configurationConfig.mjs";
import {
  maybeAttachDigitalEstimateConfigurationRoutes
} from "./configurationRoutes.js";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./pricingPolicyRepository.mjs";
import { createConfigurationStudioService } from "./configurationStudioService.mjs";
import {
  buildTrustedConfigurationContext,
  rejectClientAuthoritativeEconomics,
  serverApprovedOptionCatalog
} from "./configurationTrustedContext.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";
import { calculateAndPersistConfigurationDelta } from "./configurationCalculationService.mjs";
import { ELITE100_CONFIG_DELTA_ENGINE_ID } from "./currentConfigDeltaEngine.mjs";
import { ELITE100_ESTIMATE_STUDIO_HEAD_SLUG } from "../../elite100EstimateStudio/elite100EstimateStudioConfig.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const PUB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUOTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WATTS_ACCT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SPAHN_ACCT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PILOT_ID = "pilot-user-de2d-aaaaaaaa";
const PILOT_EMAIL = "pilot-de2d@example.com";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  ELITE100_ESTIMATE_STUDIO_ENABLED: "1",
  ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS: PILOT_ID,
  ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS: PILOT_EMAIL
};

function evidenceWithRooms(rooms) {
  return {
    materialProgramDefault: "elite_100",
    calculationSnapshotCopy: {
      materialProgramDefault: "elite_100",
      internal_ui: { estimate_rooms: rooms }
    }
  };
}

function seedPublicationPair(deRepo, cfgRepo, overrides = {}) {
  const publication = {
    id: PUB,
    organization_id: ORG,
    source_quote_id: QUOTE,
    quote_family_root_id: QUOTE,
    revision_number: 1,
    revision_label: "R1",
    quote_number: "E100-1001",
    status: "active",
    source_quote_fingerprint: "fp-source",
    customer_snapshot_hash: "fp-customer",
    pricing_evidence_hash: "fp-evidence",
    pricing_valid_through: "2026-12-31",
    ...overrides
  };
  const snap = {
    id: randomUUID(),
    organization_id: publication.organization_id,
    publication_id: publication.id,
    customer_snapshot_json: {
      project: { customerName: "Acme Cabinets", name: "Kitchen remodel" },
      totals: { estimatedProjectTotal: 870 }
    },
    pricing_evidence_json: evidenceWithRooms([
      {
        id: "kitchen",
        name: "Kitchen",
        countertopSqft: 10,
        materialGroup: "group_b"
      }
    ]),
    customer_snapshot_hash: publication.customer_snapshot_hash,
    pricing_evidence_hash: publication.pricing_evidence_hash
  };
  deRepo.seedPublication(publication);
  deRepo.seedSnapshot(snap);
  cfgRepo.seedPublication(publication);
  cfgRepo.seedSnapshot(snap);
  return { publication, snap };
}

/** Minimal DE repo surface for trusted context + Studio service */
function createDualDeRepo() {
  const pubs = new Map();
  const snaps = new Map();
  const headers = new Map();
  return {
    seedPublication(row) {
      pubs.set(String(row.id), structuredClone(row));
    },
    seedSnapshot(row) {
      snaps.set(String(row.publication_id), structuredClone(row));
    },
    seedQuoteHeader(row) {
      headers.set(`${row.organization_id}:${row.id}`, structuredClone(row));
    },
    async getPublication(organizationId, publicationId) {
      const row = pubs.get(String(publicationId));
      if (!row || row.organization_id !== organizationId) return null;
      return structuredClone(row);
    },
    async getSnapshotByPublicationId(organizationId, publicationId) {
      const row = snaps.get(String(publicationId));
      if (!row || row.organization_id !== organizationId) return null;
      return structuredClone(row);
    },
    async getQuoteHeader(organizationId, quoteId) {
      return structuredClone(headers.get(`${organizationId}:${quoteId}`) || null);
    },
    _assertNoQuoteHeaderWrites() {
      return true;
    },
    _dump() {
      return {
        publications: [...pubs.values()],
        snapshots: [...snaps.values()],
        headers: [...headers.values()]
      };
    }
  };
}

// --- Flags ---
{
  assert.equal(isDigitalEstimateConfigurationEnabled({}), false);
  assert.equal(
    isDigitalEstimateConfigurationRuntimeEnabled({
      DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
      DIGITAL_ESTIMATE_API_ENABLED: "1",
      ELITE100_ESTIMATE_STUDIO_ENABLED: "0"
    }),
    false
  );
  const app = express();
  const off = maybeAttachDigitalEstimateConfigurationRoutes(app, {
    requireAuth: () => (_r, _s, n) => n(),
    getSupabase: () => ({}),
    env: {}
  });
  assert.equal(off.mounted, false);
  console.log("ok: configuration routes unmounted when flags off");
}

// --- rejectClientAuthoritativeEconomics ---
{
  assert.throws(
    () => rejectClientAuthoritativeEconomics({ sellPrice: 99 }),
    (e) => e.code === "forbidden_caller_authority"
  );
  assert.throws(
    () => rejectClientAuthoritativeEconomics({ organizationId: ORG }),
    (e) => e.code === "forbidden_caller_authority"
  );
  assert.throws(
    () => rejectClientAuthoritativeEconomics({ accountGroupCode: "watts" }),
    (e) => e.code === "forbidden_caller_authority"
  );
  rejectClientAuthoritativeEconomics({ roomSelections: { kitchen: "group_a" } });
  console.log("ok: client economics / org / account spoof rejected");
}

// --- Trusted context builder ---
{
  const deRepo = createDualDeRepo();
  const cfgRepo = createInMemoryConfigurationRepository();
  const pricing = createInMemoryPricingPolicyRepository();
  pricing.seedConfirmedElite100Fixtures(ORG);
  seedPublicationPair(deRepo, cfgRepo);

  const ctx = await buildTrustedConfigurationContext({
    organizationId: ORG,
    publicationId: PUB,
    deRepository: deRepo,
    pricingPolicyRepository: pricing
  });
  assert.equal(ctx.canConfigure, true);
  assert.equal(ctx.rooms[0].chargeableCounterSf, 10);
  assert.equal(ctx.rooms[0].baselineMaterialGroup, "group_b");
  assert.ok(ctx.accountMappingNotice);
  assert.equal(ctx.partnerAccountId, null);
  assert.equal(ctx.optionCatalog[0].sellPrice, undefined);
  assert.ok(ctx.optionCatalogInternal.some((o) => o.optionKey === "qty-sink"));
  assert.equal(ctx.frozenBaseRates.direct.group_b, FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT.group_b);

  // Missing SF blocker
  deRepo.seedSnapshot({
    id: randomUUID(),
    organization_id: ORG,
    publication_id: PUB,
    customer_snapshot_json: { totals: { estimatedProjectTotal: 100 } },
    pricing_evidence_json: { materialProgramDefault: "elite_100", calculationSnapshotCopy: {} },
    customer_snapshot_hash: "c",
    pricing_evidence_hash: "e"
  });
  const blocked = await buildTrustedConfigurationContext({
    organizationId: ORG,
    publicationId: PUB,
    deRepository: deRepo,
    pricingPolicyRepository: pricing
  });
  assert.equal(blocked.canConfigure, false);
  assert.ok(blocked.blockers.some((b) => b.code === "missing_locked_measurement"));
  console.log("ok: trusted context + missing measurement blocker");
}

// --- No customer-name account matching ---
{
  const deRepo = createDualDeRepo();
  const cfgRepo = createInMemoryConfigurationRepository();
  const pricing = createInMemoryPricingPolicyRepository();
  const seeded = pricing.seedConfirmedElite100Fixtures(ORG);
  await pricing.addAccountGroupMember(ORG, seeded.wattsAccountGroupId, WATTS_ACCT);
  seedPublicationPair(deRepo, cfgRepo);
  deRepo.seedQuoteHeader({
    id: QUOTE,
    organization_id: ORG,
    partner_account_id: null,
    customer_name: "Watt's Building Supply"
  });
  const ctx = await buildTrustedConfigurationContext({
    organizationId: ORG,
    publicationId: PUB,
    deRepository: deRepo,
    pricingPolicyRepository: pricing
  });
  assert.equal(ctx.partnerAccountId, null);
  assert.ok(ctx.accountMappingNotice);
  console.log("ok: Watt's name-only does not map account pricing");
}

// --- Studio service: draft / preview / activate / clone ---
{
  const deRepo = createDualDeRepo();
  const pricing = createInMemoryPricingPolicyRepository();
  pricing.seedConfirmedElite100Fixtures(ORG);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  seedPublicationPair(deRepo, cfgRepo);

  const svc = createConfigurationStudioService({
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });

  const created = await svc.createDraft(ORG, PILOT_ID, PUB, {});
  assert.equal(created.envelope.status, "draft");
  assert.ok(created.options.length >= 1);

  // Optimistic concurrency
  await assert.rejects(
    () =>
      svc.patchDraft(ORG, created.envelope.id, { expectedRowVersion: 999, pricing_valid_through: "2027-01-01" }, PILOT_ID),
    (e) => e.code === "row_version_conflict" || e.statusCode === 409
  );

  // Price spoof rejected
  await assert.rejects(
    () => svc.preview(ORG, created.envelope.id, { sellPrice: 1 }, PILOT_ID),
    (e) => e.code === "forbidden_caller_authority"
  );

  // Markup requires reason
  await assert.rejects(
    () =>
      svc.preview(
        ORG,
        created.envelope.id,
        { requestedMarkupPercent: 5 },
        PILOT_ID
      ),
    (e) => e.code === "markup_reason_required"
  );

  const preview = await svc.preview(
    ORG,
    created.envelope.id,
    {
      roomSelections: { kitchen: "group_b" },
      requestedMarkupPercent: 0
    },
    PILOT_ID
  );
  assert.equal(preview.internalPreview.configuredExactTotal, 870);
  assert.equal(preview.internalPreview.configuredDisplayTotal, 870);
  assert.equal(preview.internalPreview.exactDelta, 0);
  assert.equal(preview.internalPreview.displayDelta, 0);
  assert.equal(preview.internalPreview.materialUseTax, 17);
  assertPublicConfigurationHasNoForbiddenContent(preview.customerSafePreview);
  assert.equal(
    JSON.stringify(preview.customerSafePreview).includes("materialUseTax"),
    false
  );
  assert.equal(JSON.stringify(preview.customerSafePreview).toLowerCase().includes("spahn"), false);

  const validation = await svc.validate(ORG, created.envelope.id);
  assert.equal(validation.ok, true);

  await assert.rejects(
    () => svc.activate(ORG, created.envelope.id, { confirm: true }, PILOT_ID),
    (e) => e.code === "acknowledge_required"
  );

  const activated = await svc.activate(
    ORG,
    created.envelope.id,
    { confirm: true, acknowledgeFreeze: true },
    PILOT_ID
  );
  assert.equal(activated.envelope.status, "active");

  await assert.rejects(
    () =>
      svc.putGroups(ORG, created.envelope.id, {
        groups: [{ groupKey: "x", displayLabel: "X" }]
      }),
    (e) => e.code === "immutable" || e.statusCode === 403
  );

  const cloned = await svc.clone(ORG, created.envelope.id, PILOT_ID);
  assert.equal(cloned.status, "draft");
  assert.notEqual(cloned.id, created.envelope.id);
  assert.equal(cloned.cloned_from_envelope_id, created.envelope.id);
  const stillActive = await cfgRepo.getActiveEnvelope(ORG, PUB);
  assert.equal(stillActive.id, created.envelope.id);

  // Activate clone supersedes
  const mat = (await cfgRepo.getEnvelopeGraph(ORG, cloned.id)).groups.find(
    (g) => g.group_key === "material_by_room"
  );
  if (!mat) {
    await cfgRepo.upsertDraftGroup(ORG, cloned.id, {
      groupKey: "material_by_room",
      displayLabel: "Material",
      required: true
    });
  }
  const g2 = (await cfgRepo.getEnvelopeGraph(ORG, cloned.id)).groups[0];
  await cfgRepo.upsertDraftOption(ORG, cloned.id, {
    groupId: g2.id,
    optionKey: "material:kitchen:group_b",
    displayLabel: "Kitchen B",
    defaultQty: 1,
    sellPrice: 0,
    compatibilityJson: { roomKey: "kitchen", materialGroup: "group_b" }
  });
  await svc.activate(ORG, cloned.id, { confirm: true, acknowledgeFreeze: true }, PILOT_ID);
  const prior = await cfgRepo.getEnvelope(ORG, created.envelope.id);
  assert.equal(prior.status, "superseded");
  console.log("ok: draft/preview/activate/clone/supersede + golden preview");
}

// --- Watt's trusted vs name-only preview ---
{
  const deRepo = createDualDeRepo();
  const pricing = createInMemoryPricingPolicyRepository();
  const seeded = pricing.seedConfirmedElite100Fixtures(ORG);
  await pricing.addAccountGroupMember(ORG, seeded.wattsAccountGroupId, WATTS_ACCT);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  seedPublicationPair(deRepo, cfgRepo);
  deRepo.seedQuoteHeader({ id: QUOTE, organization_id: ORG, partner_account_id: WATTS_ACCT });

  const svc = createConfigurationStudioService({
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  const draft = await svc.createDraft(ORG, PILOT_ID, PUB, {});
  const wattsPreview = await svc.preview(
    ORG,
    draft.envelope.id,
    { roomSelections: { kitchen: "promo" } },
    PILOT_ID
  );
  // 10 SF * 40 = 400 + 2% tax 8 = 408 selected economics
  // Frozen baseline display 870 + (408 − 867 Group B economics) = 411
  assert.equal(wattsPreview.internalPreview.materialSell, 400);
  assert.equal(wattsPreview.internalPreview.configuredExactTotal, 411);
  assert.equal(wattsPreview.internalPreview.exactDelta, -459);
  console.log("ok: Watt's trusted Promo $40 preview");
}

// --- Spahn trusted +3% ---
{
  const deRepo = createDualDeRepo();
  const pricing = createInMemoryPricingPolicyRepository();
  const seeded = pricing.seedConfirmedElite100Fixtures(ORG);
  await pricing.addAccountGroupMember(ORG, seeded.spahnAccountGroupId, SPAHN_ACCT);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  seedPublicationPair(deRepo, cfgRepo);
  deRepo.seedQuoteHeader({ id: QUOTE, organization_id: ORG, partner_account_id: SPAHN_ACCT });
  const svc = createConfigurationStudioService({
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  const draft = await svc.createDraft(ORG, PILOT_ID, PUB, {});
  const prev = await svc.preview(
    ORG,
    draft.envelope.id,
    { roomSelections: { kitchen: "group_b" } },
    PILOT_ID
  );
  // No-op material keep: Spahn must not reprice the frozen baseline.
  assert.equal(prev.internalPreview.exactDelta, 0);
  assert.equal(prev.internalPreview.spahnAdjustment, 0);
  assert.equal(prev.internalPreview.configuredExactTotal, 870);

  const withOption = await svc.preview(
    ORG,
    draft.envelope.id,
    {
      roomSelections: { kitchen: "group_b" },
      optionQuantities: { "qty-sink": 1 }
    },
    PILOT_ID
  );
  // Selection delta $200 + Spahn 3% on delta only → 206; configured = 870 + 206 = 1076
  assert.equal(withOption.internalPreview.exactDelta, 206);
  assert.equal(withOption.internalPreview.spahnAdjustment, 6);
  assert.equal(withOption.internalPreview.configuredExactTotal, 1076);
  console.log("ok: Spahn trusted +3% on selection delta only");
}

// --- Cross-org denial ---
{
  const deRepo = createDualDeRepo();
  const pricing = createInMemoryPricingPolicyRepository();
  pricing.seedConfirmedElite100Fixtures(ORG);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  seedPublicationPair(deRepo, cfgRepo);
  const svc = createConfigurationStudioService({
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  await assert.rejects(
    () => svc.getPublicationContext(ORG_B, PUB),
    (e) => e.statusCode === 404 || e.code === "publication_not_found"
  );
  console.log("ok: cross-org publication denial");
}

// --- Unresolved option blocked ---
{
  const deRepo = createDualDeRepo();
  const pricing = createInMemoryPricingPolicyRepository();
  pricing.seedConfirmedElite100Fixtures(ORG);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  seedPublicationPair(deRepo, cfgRepo);
  const svc = createConfigurationStudioService({
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  const draft = await svc.createDraft(ORG, PILOT_ID, PUB, {});
  await assert.rejects(
    () =>
      svc.preview(ORG, draft.envelope.id, { optionQuantities: { waterfall: 1 } }, PILOT_ID),
    (e) => e.code === "unresolved_product"
  );
  const blanco = serverApprovedOptionCatalog().find((o) => o.optionKey === "qty-blanco");
  assert.equal(blanco.availabilityState, "review_required");
  console.log("ok: unresolved products blocked / review_required");
}

// --- Calculation + event atomicity (memory) ---
{
  const pricing = createInMemoryPricingPolicyRepository();
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  seedPublicationPair(createDualDeRepo(), cfgRepo);
  const draft = await cfgRepo.createDraftEnvelope({
    organizationId: ORG,
    publicationId: PUB,
    actorUserId: PILOT_ID,
    body: {}
  });
  const group = await cfgRepo.upsertDraftGroup(ORG, draft.id, {
    groupKey: "g",
    displayLabel: "G",
    required: true
  });
  await cfgRepo.upsertDraftOption(ORG, draft.id, {
    groupId: group.id,
    optionKey: "opt",
    displayLabel: "Opt",
    sellPrice: 0,
    defaultQty: 1
  });
  await cfgRepo.activateEnvelope(ORG, draft.id, {
    actorUserId: PILOT_ID,
    pricingPolicyFingerprint: "p",
    catalogFingerprint: "c"
  });
  const session = await cfgRepo.createSession(ORG, {
    envelopeId: draft.id,
    publicationId: PUB
  });
  const selection = await cfgRepo.saveSelection(ORG, session.id, { selections: { opt: 1 } });

  const trustedInput = {
    organizationId: ORG,
    publication: { id: PUB, snapshotId: "s", status: "active" },
    envelope: { id: draft.id, version: 1, status: "active", publicationId: PUB },
    pricingPolicyFingerprint: "p",
    catalogFingerprint: "c",
    engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID,
    pricingBasis: "direct",
    frozenBaseRates: {
      direct: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT },
      wholesale: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT }
    },
    rooms: [
      {
        roomKey: "kitchen",
        chargeableCounterSf: 10,
        selectedMaterialGroup: "group_b",
        baselineMaterialGroup: "group_b"
      }
    ],
    materialTaxPolicy: { bps: 200 },
    authorizedMaterialMarkup: { bps: 0 },
    options: [],
    baseline: { exactTotal: 0, displayTotal: 0, rooms: [] },
    accountMemberships: [],
    materialRateOverrides: [],
    estimateAdjustments: [],
    partnerAccountId: null
  };

  const persisted = await calculateAndPersistConfigurationDelta({
    organizationId: ORG,
    repository: cfgRepo,
    selectionId: selection.id,
    trustedInput,
    idempotencyKey: "idem-de2d-1"
  });
  assert.ok(persisted.calculation);
  const events = cfgRepo.listEvents(ORG, draft.id);
  assert.ok(events.some((e) => e.event_type === "calculated"));

  const again = await calculateAndPersistConfigurationDelta({
    organizationId: ORG,
    repository: cfgRepo,
    selectionId: selection.id,
    trustedInput,
    idempotencyKey: "idem-de2d-1"
  });
  assert.equal(again.reused, true);
  assert.equal(again.calculation.id, persisted.calculation.id);
  console.log("ok: calculation/event persistence + idempotency");
}

// --- SQL RPC present (unapplied) ---
{
  const sql = readFileSync(
    join(__dirname, "../../../supabase/eliteos_digital_estimate_configuration_v1.sql"),
    "utf8"
  );
  assert.ok(sql.includes("digital_estimate_insert_configuration_calculation"));
  assert.ok(sql.includes("set search_path = public"));
  assert.ok(sql.includes("grant execute on function public.digital_estimate_insert_configuration_calculation"));
  assert.ok(sql.includes("to service_role"));
  console.log("ok: atomic calculation RPC present in unapplied SQL");
}

// --- No calculateQuote / quote_headers writes in DE.2D module ---
{
  const files = [
    "configurationStudioService.mjs",
    "configurationTrustedContext.mjs",
    "configurationRoutes.js",
    "ConfigurationWorkspace.tsx"
  ];
  // Studio UI is outside this folder — check service + routes only here
  for (const f of ["configurationStudioService.mjs", "configurationTrustedContext.mjs", "configurationRoutes.js"]) {
    const src = readFileSync(join(__dirname, f), "utf8");
    assert.equal(src.includes("calculateQuote"), false, f);
    assert.equal(src.includes("quote_headers"), false, f);
  }
  const ui = readFileSync(
    join(__dirname, "../../../../app-elite100-estimate-studio/src/ConfigurationWorkspace.tsx"),
    "utf8"
  );
  assert.equal(ui.includes("calculateQuote"), false);
  assert.equal(ui.includes("localStorage"), false);
  assert.equal(ui.includes("dangerouslySetInnerHTML"), false);
  assert.ok(ui.includes("Internal preview"));
  assert.ok(ui.includes("Customer-safe preview"));
  console.log("ok: no calculateQuote / no localStorage internals / preview separation in UI");
}

// --- Route mount with flags ---
{
  const deRepo = createDualDeRepo();
  const pricing = createInMemoryPricingPolicyRepository();
  pricing.seedConfirmedElite100Fixtures(ORG);
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  seedPublicationPair(deRepo, cfgRepo);

  const app = express();
  // Lightweight harness mirroring staff chain without org DB
  const requireAuth = () => (req, res, next) => {
    req.user = { id: PILOT_ID, email: PILOT_EMAIL };
    next();
  };
  // Directly exercise service via a mini route for access-chain documentation —
  // full Express org middleware needs Supabase; verified separately via maybeAttach + service tests.
  const mounted = maybeAttachDigitalEstimateConfigurationRoutes(app, {
    env: ENV_ON,
    requireAuth,
    getSupabase: () => ({}),
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    configurationStack: { mode: "memory" }
  });
  assert.equal(mounted.mounted, true);
  // UI flag cannot grant access — backend still needs server flags (already proven off-mount)
  assert.equal(
    maybeAttachDigitalEstimateConfigurationRoutes(express(), {
      env: { ...ENV_ON, DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "0" },
      requireAuth,
      getSupabase: () => ({}),
      configurationRepository: cfgRepo,
      deRepository: deRepo,
      pricingPolicyRepository: pricing,
      configurationStack: { mode: "memory" }
    }).mounted,
    false
  );
  console.log("ok: routes mount only with full server flag chain; UI flag irrelevant");
}

// --- Head slug documented ---
{
  assert.equal(ELITE100_ESTIMATE_STUDIO_HEAD_SLUG, "elite100_estimate_studio");
  console.log("ok: Studio head slug unchanged");
}

console.log("\nAll phaseDe2d backend tests passed.\n");
