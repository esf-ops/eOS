/**
 * Studio Digital Estimate publish fix — readiness ≡ publish validation,
 * quote_headers bridge, structured errors.
 * Run: node backend-core/src/elite100EstimateStudio/studioEstimateDigitalEstimate.publishFix.test.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInMemoryDigitalEstimateRepository } from "../digitalEstimate/digitalEstimateRepository.mjs";
import { createInMemoryConfigurationRepository } from "../digitalEstimate/configuration/configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "../digitalEstimate/configuration/pricingPolicyRepository.mjs";
import { createConfigurationStudioService } from "../digitalEstimate/configuration/configurationStudioService.mjs";
import { createInMemoryAmendmentRepository } from "../digitalEstimate/configuration/amendmentRepository.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { createStudioEstimateDigitalEstimateService } from "./studioEstimateDigitalEstimateService.mjs";
import {
  assessStudioEstimatePublicationReadiness,
  resolveStudioPricingValidThrough
} from "./studioEstimatePublicationAdapter.mjs";
import {
  ensureStudioEstimatePublicationSource,
  mapStudioPublicationPersistenceError
} from "./studioEstimatePublicationSource.mjs";
import { buildSyntheticQuoteHeaderFromStudioEstimate } from "./studioEstimatePublicationAdapter.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_DEV_LINK_WRAP: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_RUNTIME_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED: "1",
  DIGITAL_ESTIMATE_REVIEW_REQUEST_RUNTIME_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

function approvedEstimateRow(overrides = {}) {
  const id = overrides.id || randomUUID();
  const fingerprint = overrides.fingerprint || "fp-approved-1";
  const { scope: scopeOverrides, ...rest } = overrides;
  const baseScope = {
    customerName: "Hoskins Williams",
    projectName: "Kitchen",
    projectAddress: "1 Main St",
    partnerAccountId: null,
    pricingBasis: "direct",
    materialGroup: "Group Promo",
    colorName: "Carrara Classic",
    colorTbd: false,
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        included: true,
        countertopSqft: 40,
        backsplashSqft: 8,
        pieces: []
      }
    ],
    addOns: { "qty-sink": 1 },
    edgeMode: "included",
    edgeLinearFeet: 0,
    miterHeightKey: null,
    miterLinearFeet: 0,
    buildupSqft: 0,
    estimatorNotes: "internal only",
    internalMarkupPercent: 10,
    unresolvedManualReview: false
  };
  return {
    id,
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    takeoffJobId: TAKEOFF_ID,
    sourceTakeoffResultId: "result-1",
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: { ...baseScope, ...(scopeOverrides || {}) },
    calculationSnapshot: {
      fingerprint,
      calculatedAt: new Date().toISOString(),
      pricingEngine: "quoteCalculator",
      pricingVersion: 2,
      totals: { customerDisplayTotal: 5123.45, exactInternalTotal: 5635.8 },
      internalMarkup: { percent: 10, amount: 512.35 }
    },
    calculationFingerprint: fingerprint,
    pricingEngine: "quoteCalculator",
    pricingVersion: 2,
    approval: {
      approvedAt: new Date().toISOString(),
      approvedByUserId: ACTOR,
      calculationFingerprint: fingerprint,
      customerDisplayTotal: 5123.45,
      exactInternalTotal: 5635.8
    },
    staleReason: null,
    supersededAt: null,
    ...rest
  };
}

function harness() {
  const studioRepo = new InMemoryStudioEstimateRepository();
  const deRepo = createInMemoryDigitalEstimateRepository();
  const pricing = createInMemoryPricingPolicyRepository();
  const cfgRepo = createInMemoryConfigurationRepository({ pricingPolicyRepository: pricing });
  const amendmentRepo = createInMemoryAmendmentRepository({
    deRepository: deRepo,
    configurationRepository: cfgRepo
  });
  const studioEstimateService = createStudioEstimateService({
    env: ENV_ON,
    repository: studioRepo,
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved", approvedAt: new Date().toISOString() }),
    loadLatestTakeoffResult: async () => null,
    calculateStudioEstimateImpl: async () => ({
      fingerprint: "fp-calc",
      pricingEngine: "quoteCalculator",
      pricingVersion: 2,
      totals: { customerDisplayTotal: 5000, exactInternalTotal: 5500 }
    })
  });
  Object.defineProperty(studioEstimateService, "repositoryMode", { value: "memory" });

  const configurationStudioService = createConfigurationStudioService({
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    deRepository: deRepo,
    env: ENV_ON
  });

  const svc = createStudioEstimateDigitalEstimateService({
    env: ENV_ON,
    studioEstimateService,
    digitalEstimateRepository: deRepo,
    configurationStudioService,
    amendmentRepository: amendmentRepo,
    loadTakeoffWorkspace: async () => ({ reviewStatus: "approved" })
  });

  return { studioRepo, deRepo, svc };
}

async function seedApproved(studioRepo, row) {
  await studioRepo.create({ ...row, createdByUserId: ACTOR });
  await studioRepo.update(
    ORG,
    row.id,
    {
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: row.calculationSnapshot,
      approval: row.approval,
      pricingEngine: row.pricingEngine,
      pricingVersion: row.pricingVersion,
      scope: row.scope
    },
    ACTOR
  );
}

console.log("\nstudioEstimateDigitalEstimate.publishFix.test.mjs\n");

// 1. Readiness and publish use identical validation (shared assess function + same config)
{
  const blank = approvedEstimateRow({
    scope: { customerName: "", projectName: "" }
  });
  const cfg = {
    pricingValidThrough: "2099-01-01",
    allowedOptionKeys: ["qty-sink"]
  };
  const readiness = assessStudioEstimatePublicationReadiness({
    estimate: blank,
    repositoryMode: "supabase",
    takeoffReviewStatus: "approved",
    env: ENV_ON,
    configuration: cfg,
    now: new Date("2026-07-18T12:00:00.000Z")
  });
  assert.equal(readiness.eligible, false);
  const codes = readiness.blockingReasons.map((b) => b.code);
  assert.ok(codes.includes("customer_name_required"));
  assert.ok(codes.includes("project_name_required"));
  assert.ok(codes.includes("invalid_pricing_valid_through"));

  const { studioRepo, svc } = harness();
  await seedApproved(studioRepo, blank);
  const pubErr = await svc
    .publish({
      organizationId: ORG,
      estimateId: blank.id,
      actorUserId: ACTOR,
      body: { confirm: true, configuration: cfg }
    })
    .catch((e) => e);
  assert.equal(pubErr instanceof Error, true);
  assert.ok(
    ["customer_name_required", "project_name_required", "invalid_pricing_valid_through"].includes(
      pubErr.code
    )
  );
  assert.ok(Array.isArray(pubErr.blockingReasons) || Array.isArray(pubErr.blockers));
  console.log("ok: 1 readiness and publish share identical validation (same blocker codes)");
}

// 2. Blank required customer/project fields
{
  const row = approvedEstimateRow({
    scope: { customerName: "  ", projectName: "", projectAddress: "" }
  });
  const r = assessStudioEstimatePublicationReadiness({
    estimate: row,
    repositoryMode: "supabase",
    takeoffReviewStatus: "approved",
    env: ENV_ON,
    configuration: { allowedOptionKeys: ["qty-sink"] },
    now: new Date("2026-07-18T12:00:00.000Z")
  });
  assert.equal(r.eligible, false);
  const customer = r.blockingReasons.find((b) => b.code === "customer_name_required");
  const project = r.blockingReasons.find((b) => b.code === "project_name_required");
  assert.equal(customer?.field, "customerName");
  assert.equal(project?.field, "projectName");
  assert.match(customer.message, /Customer name is required/i);
  assert.match(project.message, /Add a project name before publishing/i);
  assert.equal(project.action, "edit_project_details");
  assert.equal(project.title, "Project name required");
  console.log("ok: 2 blank customer/project block readiness with field + message");
}

// 3. Invalid catalog option key
{
  const r = assessStudioEstimatePublicationReadiness({
    estimate: approvedEstimateRow(),
    repositoryMode: "supabase",
    takeoffReviewStatus: "approved",
    env: ENV_ON,
    configuration: { allowedOptionKeys: ["qty-not-a-real-option"] },
    now: new Date("2026-07-18T12:00:00.000Z")
  });
  assert.equal(r.eligible, false);
  assert.equal(r.code, "unknown_catalog_option");
  assert.match(r.message, /not a valid catalog option/i);
  assert.equal(r.field, "allowedOptionKeys");
  console.log("ok: 3 invalid catalog option key identified clearly");
}

// 4. Invalid pricing-valid-through returns allowed range
{
  const now = new Date("2026-07-18T12:00:00.000Z");
  const resolved = resolveStudioPricingValidThrough("2026-12-01", ENV_ON, now);
  assert.equal(resolved.ok, false);
  assert.equal(resolved.blocker.code, "invalid_pricing_valid_through");
  assert.equal(resolved.blocker.allowedRange.min, "2026-07-18");
  assert.ok(resolved.blocker.allowedRange.max);
  assert.match(resolved.blocker.message, /between July 18/i);
  assert.match(resolved.blocker.message, /2026/);

  const r = assessStudioEstimatePublicationReadiness({
    estimate: approvedEstimateRow(),
    repositoryMode: "supabase",
    takeoffReviewStatus: "approved",
    env: ENV_ON,
    configuration: { pricingValidThrough: "2026-12-01", allowedOptionKeys: ["qty-sink"] },
    now
  });
  assert.equal(r.eligible, false);
  assert.equal(r.allowedRange.min, "2026-07-18");
  console.log("ok: 4 invalid pricing-valid-through returns allowed range");
}

// 5. Eligible readiness followed by publish succeeds (+ bridge seed)
{
  const { studioRepo, svc, deRepo } = harness();
  const row = approvedEstimateRow();
  await seedApproved(studioRepo, row);
  const configuration = {
    pricingValidThrough: "2026-08-18",
    allowedOptionKeys: ["qty-sink"]
  };
  const readiness = await svc.assessReadiness(ORG, row.id, configuration);
  assert.equal(readiness.readiness.eligible, true, readiness.readiness.message);
  assert.equal(readiness.readiness.details.pricingValidThrough, "2026-08-18");

  const published = await svc.publish({
    organizationId: ORG,
    estimateId: row.id,
    actorUserId: ACTOR,
    body: { confirm: true, idempotencyKey: "pf-1", configuration }
  });
  assert.equal(published.ok, true);
  assert.ok(published.accessToken);
  assert.equal(published.publication.status, "active");
  assert.ok(deRepo.getQuote(row.id), "bridge seed creates memory quote_headers source");
  console.log("ok: 5 eligible readiness followed by publish succeeds");
}

// 6–7. Persistence error mapping + unstructured generic path
{
  const fk = mapStudioPublicationPersistenceError({
    code: "23503",
    message: 'insert or update on table "quote_publications" violates foreign key constraint "quote_publications_source_quote_id_fkey"'
  });
  assert.equal(fk.code, "publication_source_missing");
  assert.equal(fk.statusCode, 503);
  assert.match(fk.message, /Publication storage is unavailable/i);

  const plain = new Error("boom");
  const mapped = mapStudioPublicationPersistenceError(plain);
  assert.equal(mapped.code, "publication_storage_unavailable");
  assert.equal(mapped.statusCode, 503);

  // Bridge upsert against fake db
  let upserted = null;
  const fakeDb = {
    from() {
      return {
        upsert(row) {
          upserted = row;
          return Promise.resolve({ error: null });
        }
      };
    }
  };
  const estimate = approvedEstimateRow();
  const synthetic = buildSyntheticQuoteHeaderFromStudioEstimate(estimate, { organizationId: ORG });
  const ensured = await ensureStudioEstimatePublicationSource({
    db: fakeDb,
    organizationId: ORG,
    estimate,
    syntheticHeader: synthetic
  });
  assert.equal(ensured.ok, true);
  assert.equal(upserted.id, estimate.id);
  assert.equal(upserted.quote_source, "elite100_studio_bridge");
  assert.ok(upserted.archived_at);
  console.log("ok: 6–7 persistence mapping + quote_headers bridge upsert shape");
}

// 8. Studio UI surfaces structured error + pilot diagnostic; generic only for unstructured
{
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const panelPath = join(
    __dirname,
    "../../../app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx"
  );
  const panel = readFileSync(panelPath, "utf8");
  assert.ok(panel.includes("formatStructuredPublishError"));
  assert.ok(panel.includes("eq-de-pilot-diagnostic"));
  assert.ok(panel.includes("readinessBlockerCodes"));
  assert.ok(panel.includes("Unable to publish Digital Estimate"));
  assert.ok(panel.includes("e instanceof ApiError"));
  assert.ok(panel.includes("readinessQuery"));
  console.log("ok: 8 Studio panel displays structured error + pilot diagnostic");
}

console.log("\nAll Studio Digital Estimate publish-fix tests passed.\n");
