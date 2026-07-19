/**
 * Reusable link recovery — wrap write/read, replace fail-closed, newest active token.
 * Run: node backend-core/src/digitalEstimate/phaseDe11.reusableLink.recovery.test.mjs
 */
import assert from "node:assert/strict";
import { createInMemoryDigitalEstimateRepository } from "./digitalEstimateRepository.mjs";
import {
  publishDigitalEstimate,
  replaceDigitalEstimateToken
} from "./digitalEstimatePublishService.mjs";
import {
  normalizeLinkWrapKeySecret,
  unwrapDigitalEstimateAccessTokenDetailed,
  wrapDigitalEstimateAccessToken
} from "./digitalEstimateTokenWrap.mjs";
import { InMemoryStudioEstimateRepository } from "../elite100EstimateStudio/inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "../elite100EstimateStudio/studioEstimateService.mjs";
import { createStudioEstimateDigitalEstimateService } from "../elite100EstimateStudio/studioEstimateDigitalEstimateService.mjs";
import { createInMemoryConfigurationRepository } from "./configuration/configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./configuration/pricingPolicyRepository.mjs";
import { createConfigurationStudioService } from "./configuration/configurationStudioService.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "../elite100EstimateStudio/studioEstimateTypes.mjs";
import { randomUUID } from "node:crypto";

const ORG = "11111111-1111-4111-8111-111111111111";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const ENV = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_RUNTIME_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_LINK_WRAP_KEY: "unit-test-wrap-key-aaaaaaaa",
  ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "https://digital.eliteosfab.com",
  NODE_ENV: "test"
};

function eliteHeader() {
  return {
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-EXAMPLE-000100",
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: QUOTE_ID,
    is_current_revision: true,
    archived_at: null,
    customer_name: "Example Homes LLC",
    project_name: "Kitchen",
    calculation_snapshot: {
      materialProgramDefault: "elite_100",
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 10000,
        estimate_rooms: [{ name: "Kitchen", materialProgramOverride: "inherit" }],
        customer_estimate_print_snapshot: { finalRounded: 10000, rooms: [], summaryRows: [] }
      }
    }
  };
}

function approvedEstimateRow(id = randomUUID()) {
  const fingerprint = "fp-rec-1";
  return {
    id,
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: TAKEOFF_ID,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: {
      customerName: "Hoskins",
      projectName: "Kitchen",
      projectAddress: "1 Main",
      materialGroup: "Group Promo",
      rooms: [{ id: "kitchen", name: "Kitchen", included: true, countertopSqft: 40, pieces: [] }],
      addOns: { "qty-sink": 1 },
      unresolvedManualReview: false
    },
    calculationSnapshot: {
      fingerprint,
      pricingEngine: "quoteCalculator",
      pricingVersion: 2,
      totals: { customerDisplayTotal: 5000, exactInternalTotal: 5500 }
    },
    calculationFingerprint: fingerprint,
    pricingEngine: "quoteCalculator",
    pricingVersion: 2,
    approval: {
      approvedAt: new Date().toISOString(),
      approvedByUserId: ACTOR,
      calculationFingerprint: fingerprint,
      customerDisplayTotal: 5000
    },
    staleReason: null
  };
}

console.log("\nphaseDe11.reusableLink.recovery.test.mjs\n");

// Key normalization (Vercel whitespace/newlines)
{
  assert.equal(normalizeLinkWrapKeySecret('  "abcdef"  '), "abcdef");
  assert.equal(normalizeLinkWrapKeySecret("secret\nwith\nbreaks"), "secretwithbreaks");
  const envNl = { ...ENV, DIGITAL_ESTIMATE_LINK_WRAP_KEY: "  unit-test-wrap-key-aaaaaaaa\n" };
  const a = wrapDigitalEstimateAccessToken("token-aaaaaaaaaaaaaaaaaaaa", envNl);
  const b = unwrapDigitalEstimateAccessTokenDetailed(a, {
    ...ENV,
    DIGITAL_ESTIMATE_LINK_WRAP_KEY: "unit-test-wrap-key-aaaaaaaa"
  });
  assert.equal(b.ok, true);
  console.log("ok: wrap key whitespace/newlines normalized consistently");
}

// Replace writes token_wrapped; immediate + refresh recover customerUrl via Studio readiness
{
  const studioRepo = new InMemoryStudioEstimateRepository();
  const deRepo = createInMemoryDigitalEstimateRepository();
  const row = approvedEstimateRow();
  await studioRepo.create({ ...row, createdByUserId: ACTOR });
  await studioRepo.update(
    ORG,
    row.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: row.calculationSnapshot,
      approval: row.approval,
      pricingEngine: "quoteCalculator",
      pricingVersion: 2,
      scope: row.scope
    },
    ACTOR
  );
  const pricing = createInMemoryPricingPolicyRepository();
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const studioEstimateService = createStudioEstimateService({
    env: ENV,
    repository: studioRepo,
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" })
  });
  Object.defineProperty(studioEstimateService, "repositoryMode", { value: "memory" });
  const svc = createStudioEstimateDigitalEstimateService({
    env: ENV,
    studioEstimateService,
    digitalEstimateRepository: deRepo,
    configurationStudioService: createConfigurationStudioService({
      configurationRepository: cfgRepo,
      pricingPolicyRepository: pricing,
      deRepository: deRepo,
      env: ENV
    }),
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" })
  });

  const published = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: "rec-1", configuration: { allowedOptionKeys: ["qty-sink"] } }
  });
  assert.equal(published.linkStatus || "active", "active");
  assert.ok(published.customerUrl);
  assert.ok((await deRepo.getActiveTokenForPublication(ORG, published.publication.id)).token_wrapped);

  const replaced = await replaceDigitalEstimateToken({
    env: ENV,
    organizationId: ORG,
    actorUserId: ACTOR,
    repository: deRepo,
    publicationId: published.publication.id,
    body: { confirm: true }
  });
  assert.equal(replaced.linkStatus, "active");
  assert.ok(replaced.customerUrl);
  assert.notEqual(replaced.accessToken, published.accessToken);
  assert.ok((await deRepo.getActiveTokenForPublication(ORG, published.publication.id)).token_wrapped);

  assert.ok(replaced.customerUrl.includes("/e/"));
  assert.equal(replaced.customerUrl.includes("#"), false);
  assert.equal(replaced.linkDiagnostics?.wrapKeyPresent, true);
  assert.equal(replaced.linkDiagnostics?.tokenWrappedGenerated, true);
  assert.equal(replaced.linkDiagnostics?.tokenWrappedPersisted, true);
  assert.equal(replaced.linkDiagnostics?.persistedRowReadBack, true);
  assert.equal(replaced.linkDiagnostics?.decryptVerified, true);
  assert.equal(replaced.linkDiagnostics?.customerUrlPresent, true);

  const detail1 = await svc.assessReadiness(ORG, row.id);
  assert.equal(detail1.activePublication?.linkStatus, "active");
  assert.equal(detail1.activePublication?.customerUrl, replaced.customerUrl);
  assert.ok(detail1.activePublication.customerUrl.includes("/e/"));
  assert.equal(
    Object.prototype.hasOwnProperty.call(detail1.activePublication, "customerUrl"),
    true
  );
  assert.equal(Object.prototype.hasOwnProperty.call(detail1.activePublication, "linkStatus"), true);
  // Route serializer must not strip fields (JSON round-trip).
  const serialized = JSON.parse(JSON.stringify(detail1));
  assert.equal(serialized.activePublication.customerUrl, replaced.customerUrl);
  assert.equal(serialized.activePublication.linkStatus, "active");

  const detail2 = await svc.assessReadiness(ORG, row.id);
  assert.equal(detail2.activePublication?.customerUrl, replaced.customerUrl);
  console.log("ok: replacement writes token_wrapped; immediate + refresh return customerUrl");
}

// Persistence/atomic failure must not invalidate the previous working token
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const before = await repo.getActiveTokenForPublication(ORG, published.publication.id);
  const failingRepo = {
    ...repo,
    getPublication: repo.getPublication.bind(repo),
    getActiveTokenForPublication: repo.getActiveTokenForPublication.bind(repo),
    listTokensForPublication: repo.listTokensForPublication.bind(repo),
    probeTokenWrappedColumn: repo.probeTokenWrappedColumn.bind(repo),
    assertActiveTokenWrappedWritable: repo.assertActiveTokenWrappedWritable.bind(repo),
    async replaceTokenAtomic() {
      const err = new Error("simulated persistence failure");
      err.code = "token_wrap_persist_failed";
      err.statusCode = 503;
      throw err;
    }
  };
  const err = await replaceDigitalEstimateToken({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: failingRepo,
    publicationId: published.publication.id,
    body: { confirm: true }
  }).catch((e) => e);
  assert.equal(err.code, "token_wrap_persist_failed");
  assert.equal(err.diagnostics?.tokenWrappedPersisted, false);
  const after = await repo.getActiveTokenForPublication(ORG, published.publication.id);
  assert.equal(after.id, before.id);
  assert.equal(after.revoked_at, null);
  assert.equal(after.token_hash, before.token_hash);
  assert.ok(after.token_wrapped);
  console.log("ok: persistence failure does not invalidate previous working token");
}

// Atomic insert without token_wrapped must fail closed (simulates old Supabase path)
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const before = await repo.getActiveTokenForPublication(ORG, published.publication.id);
  const err = await repo
    .replaceTokenAtomic({
      organizationId: ORG,
      publicationId: published.publication.id,
      newTokenHash: "deadbeef",
      actorUserId: "pilot",
      replacedAt: new Date().toISOString()
      // tokenWrapped intentionally omitted
    })
    .catch((e) => e);
  assert.equal(err.code, "token_wrapped_required");
  const after = await repo.getActiveTokenForPublication(ORG, published.publication.id);
  assert.equal(after.id, before.id);
  assert.equal(after.revoked_at, null);
  console.log("ok: replaceTokenAtomic requires token_wrapped before invalidating prior token");
}

// Newest active token selected; revoked ignored
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const first = await repo.getActiveTokenForPublication(ORG, published.publication.id);
  await replaceDigitalEstimateToken({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    publicationId: published.publication.id,
    body: { confirm: true }
  });
  const second = await repo.getActiveTokenForPublication(ORG, published.publication.id);
  assert.notEqual(second.id, first.id);
  assert.ok(first.revoked_at || (await repo.listTokensForPublication(ORG, published.publication.id)).find((t) => t.id === first.id).revoked_at);
  assert.equal(second.revoked_at, null);
  assert.ok(second.token_wrapped);
  console.log("ok: newest active token selected; revoked ignored");
}

// Missing wrap key prevents replacement before invalidating old link
{
  const repo = createInMemoryDigitalEstimateRepository();
  repo.seedQuote(eliteHeader());
  const published = await publishDigitalEstimate({
    env: ENV,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    body: { quoteId: QUOTE_ID, confirm: true }
  });
  const before = await repo.getActiveTokenForPublication(ORG, published.publication.id);
  const envNoKey = {
    DIGITAL_ESTIMATE_API_ENABLED: "1",
    DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
    DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
    DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
    HEAD_URL_DIGITAL_ESTIMATE: "https://digital.eliteosfab.com",
    NODE_ENV: "production"
  };
  const err = await replaceDigitalEstimateToken({
    env: envNoKey,
    organizationId: ORG,
    actorUserId: "pilot",
    repository: repo,
    publicationId: published.publication.id,
    body: { confirm: true }
  }).catch((e) => e);
  assert.equal(err.code, "link_wrap_key_missing");
  const after = await repo.getActiveTokenForPublication(ORG, published.publication.id);
  assert.equal(after.id, before.id);
  assert.equal(after.revoked_at, null);
  assert.equal(after.token_hash, before.token_hash);
  console.log("ok: missing wrap key prevents replacement before invalidating old link");
}

// Mismatched key → structured recovery error (not silent needs_replace)
{
  const studioRepo = new InMemoryStudioEstimateRepository();
  const deRepo = createInMemoryDigitalEstimateRepository();
  const row = approvedEstimateRow();
  await studioRepo.create({ ...row, createdByUserId: ACTOR });
  await studioRepo.update(
    ORG,
    row.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: row.calculationSnapshot,
      approval: row.approval,
      pricingEngine: "quoteCalculator",
      pricingVersion: 2,
      scope: row.scope
    },
    ACTOR
  );
  const pricing = createInMemoryPricingPolicyRepository();
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const studioEstimateService = createStudioEstimateService({
    env: ENV,
    repository: studioRepo,
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" })
  });
  Object.defineProperty(studioEstimateService, "repositoryMode", { value: "memory" });
  const svcPublish = createStudioEstimateDigitalEstimateService({
    env: ENV,
    studioEstimateService,
    digitalEstimateRepository: deRepo,
    configurationStudioService: createConfigurationStudioService({
      configurationRepository: cfgRepo,
      pricingPolicyRepository: pricing,
      deRepository: deRepo,
      env: ENV
    }),
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" })
  });
  await svcPublish.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: "mismatch-1", configuration: {} }
  });

  const svcRead = createStudioEstimateDigitalEstimateService({
    env: { ...ENV, DIGITAL_ESTIMATE_LINK_WRAP_KEY: "different-key-bbbbbbbbbbbb" },
    studioEstimateService,
    digitalEstimateRepository: deRepo,
    configurationStudioService: createConfigurationStudioService({
      configurationRepository: cfgRepo,
      pricingPolicyRepository: pricing,
      deRepository: deRepo,
      env: ENV
    }),
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" })
  });
  const detail = await svcRead.assessReadiness(ORG, row.id);
  assert.equal(detail.activePublication?.linkStatus, "recovery_error");
  assert.equal(detail.activePublication?.linkError?.code, "link_unwrap_failed");
  assert.equal(detail.activePublication?.linkDiagnostics?.decryptSucceeded, false);
  assert.equal(detail.activePublication?.linkDiagnostics?.tokenWrappedPresent, true);
  assert.equal(detail.activePublication?.customerUrl, null);
  console.log("ok: mismatched key returns structured recovery error");
}

console.log("\nAll reusable-link recovery tests passed.\n");
