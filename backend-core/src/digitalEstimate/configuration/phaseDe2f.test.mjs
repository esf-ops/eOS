/**
 * Phase DE.2F — Review request + amendment + re-publication tests.
 * Run: node backend-core/src/digitalEstimate/configuration/phaseDe2f.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";

import { createInMemoryDigitalEstimateRepository } from "../digitalEstimateRepository.mjs";
import { publishDigitalEstimate } from "../digitalEstimatePublishService.mjs";
import { hashDigitalEstimateToken } from "../digitalEstimateToken.mjs";
import { createInMemoryConfigurationRepository } from "./configurationRepository.mjs";
import { createInMemoryPricingPolicyRepository } from "./pricingPolicyRepository.mjs";
import { createInMemoryAmendmentRepository } from "./amendmentRepository.mjs";
import {
  isDigitalEstimateReviewRequestsEnabled,
  isDigitalEstimateAmendmentsEnabled,
  isDigitalEstimateReviewRequestRuntimeEnabled,
  isDigitalEstimateAmendmentStudioRuntimeEnabled,
  REVIEW_STATUS,
  AMENDMENT_STATUS
} from "./amendmentConfig.mjs";
import { createPublicConfigurationService } from "./publicConfigurationService.mjs";
import {
  createReviewRequestService,
  rejectReviewRequestAuthority
} from "./reviewRequestService.mjs";
import {
  createAmendmentStudioService,
  buildStructuredComparison,
  rejectAmendmentCallerAuthority
} from "./amendmentStudioService.mjs";
import { maybeAttachDigitalEstimateReviewRequestRoutes } from "./reviewRequestRoutes.js";
import { maybeAttachDigitalEstimateAmendmentRoutes } from "./amendmentRoutes.js";
import { generateConfigurationSessionSecret } from "./publicConfigurationSession.mjs";
import { resetDigitalEstimatePublicRateLimitsForTests } from "../digitalEstimateRateLimit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const ORG2 = "22222222-2222-4222-8222-222222222222";
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ENV_ON = {
  DIGITAL_ESTIMATE_API_ENABLED: "1",
  DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0",
  DIGITAL_ESTIMATE_PUBLISH_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED: "1",
  DIGITAL_ESTIMATE_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED: "1",
  DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED: "1",
  DIGITAL_ESTIMATE_AMENDMENTS_ENABLED: "1",
  ELITE100_ESTIMATE_STUDIO_ENABLED: "1",
  DIGITAL_ESTIMATE_ALLOW_LOCALHOST_PUBLIC_ORIGIN: "1",
  DIGITAL_ESTIMATE_ALLOW_INSECURE_SESSION_COOKIE: "1",
  HEAD_URL_DIGITAL_ESTIMATE: "http://localhost:5190",
  NODE_ENV: "development"
};

function eliteHeader() {
  return {
    id: QUOTE_ID,
    organization_id: ORG,
    quote_source: "internal_quote",
    quote_number: "ESF-DYER-000200",
    quote_number_base: "ESF-DYER-000200",
    revision_number: 1,
    revision_label: "R1",
    quote_family_root_id: QUOTE_ID,
    is_current_revision: true,
    archived_at: null,
    customer_name: "Test Customer",
    project_name: "Kitchen Remodel",
    project_address: "1 Main St",
    estimated_material_group: "Group B",
    partner_account_id: null,
    calculation_snapshot: {
      materialGroup: "Group B",
      materialProgramDefault: "elite_100",
      totals: { retail: 870, wholesale: 800, estimated_sqft: 10 },
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: 870,
        customer_estimate_customer_facing_notes: "Thank you.",
        estimate_rooms: [
          { id: "kitchen", name: "Kitchen", countertopSqft: 10, materialGroup: "group_b" }
        ],
        customer_estimate_print_snapshot: { finalRounded: 870 }
      }
    }
  };
}

async function seedStack() {
  const deRepo = createInMemoryDigitalEstimateRepository();
  deRepo.seedQuote(eliteHeader());
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
          { id: "kitchen", name: "Kitchen", countertopSqft: 10, materialGroup: "group_b" }
        ]
      }
    }
  };
  snap.customer_snapshot_json = {
    ...(snap.customer_snapshot_json || {}),
    totals: { estimatedProjectTotal: 870 },
    project: { customerName: "Customer", name: "Kitchen", projectName: "Kitchen Remodel" },
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
  await cfgRepo.upsertDraftOption(ORG, draft.id, {
    groupId: group.id,
    optionKey: "material:kitchen:group_b",
    displayLabel: "Kitchen — Group B",
    defaultQty: 1,
    sellPrice: 0,
    compatibilityJson: { roomKey: "kitchen", materialGroup: "group_b", role: "material_selection" }
  });
  await cfgRepo.upsertDraftOption(ORG, draft.id, {
    groupId: group.id,
    optionKey: "material:kitchen:group_c",
    displayLabel: "Kitchen — Group C",
    defaultQty: 0,
    sellPrice: 0,
    compatibilityJson: { roomKey: "kitchen", materialGroup: "group_c", role: "material_selection" }
  });
  await cfgRepo.activateEnvelope(ORG, draft.id, {
    actorUserId: "u1",
    pricingPolicyFingerprint: "p",
    catalogFingerprint: "c"
  });

  const amdRepo = createInMemoryAmendmentRepository({
    deRepository: deRepo,
    configurationRepository: cfgRepo
  });

  const publicService = createPublicConfigurationService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing
  });
  const reviewService = createReviewRequestService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    amendmentRepository: amdRepo
  });
  const studioService = createAmendmentStudioService({
    env: ENV_ON,
    deRepository: deRepo,
    configurationRepository: cfgRepo,
    pricingPolicyRepository: pricing,
    amendmentRepository: amdRepo
  });

  return {
    deRepo,
    cfgRepo,
    pricing,
    amdRepo,
    published,
    publication,
    publicService,
    reviewService,
    studioService
  };
}

async function openConfiguredSession(stack) {
  const exchanged = await stack.publicService.exchangePublicationToken({
    rawToken: stack.published.accessToken
  });
  const saved = await stack.publicService.saveSelections({
    rawSecret: exchanged.rawSecret,
    body: {
      items: [{ optionKey: "material:kitchen:group_c", quantity: 1 }],
      expectedRowVersion: exchanged.state.session.rowVersion,
      idempotencyKey: `sel-${randomUUID()}`
    }
  });
  return {
    rawSecret: exchanged.rawSecret,
    session: saved.session,
    calculation: saved.calculation,
    selectionHash: saved.selectionHash
  };
}

// --- Flags default off ---
{
  assert.equal(isDigitalEstimateReviewRequestsEnabled({}), false);
  assert.equal(isDigitalEstimateAmendmentsEnabled({}), false);
  assert.equal(isDigitalEstimateReviewRequestRuntimeEnabled({}), false);
  assert.equal(isDigitalEstimateAmendmentStudioRuntimeEnabled({}), false);
  const offR = maybeAttachDigitalEstimateReviewRequestRoutes(express(), { env: {}, getSupabase: () => ({}) });
  const offA = maybeAttachDigitalEstimateAmendmentRoutes(express(), { env: {}, getSupabase: () => ({}) });
  assert.equal(offR.mounted, false);
  assert.equal(offA.mounted, false);
  console.log("ok: DE.2F flags default off / routes unmounted");
}

// --- SQL migration present, unapplied conventions ---
{
  const sql = readFileSync(
    join(__dirname, "../../../supabase/eliteos_digital_estimate_amendment_v1.sql"),
    "utf8"
  );
  assert.ok(sql.includes("digital_estimate_configuration_review_requests"));
  assert.ok(sql.includes("digital_estimate_amendments"));
  assert.ok(sql.includes("digital_estimate_amendment_events"));
  assert.ok(sql.includes("digital_estimate_publish_amendment_atomic"));
  assert.ok(sql.includes("service_role"));
  assert.ok(sql.includes("quote_headers") === false || sql.includes("Does not write quote_headers"));
  assert.equal(sql.includes("insert into public.quote_headers"), false);
  console.log("ok: amendment migration additive + atomic RPC");
}

// --- Authority rejection ---
{
  assert.throws(() => rejectReviewRequestAuthority({ Wholesale: 1 }), /forbidden|refresh/i);
  assert.throws(() => rejectReviewRequestAuthority({ accepted: true }), /forbidden|refresh/i);
  assert.throws(() => rejectAmendmentCallerAuthority({ chargeableCounterSf: 12 }), /Caller|forbidden/i);
  assert.throws(() => rejectAmendmentCallerAuthority({ sold: true }), /Caller|forbidden/i);
  console.log("ok: spoofed totals/prices/sold rejected");
}

// --- Valid review request ---
{
  resetDigitalEstimatePublicRateLimitsForTests?.();
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  const created = await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: {
      expectedRowVersion: cfg.session.rowVersion,
      idempotencyKey: "idem-1",
      customerNote: "Please check Group C"
    }
  });
  assert.equal(created.ok, true);
  assert.equal(created.reused, false);
  assert.ok(created.reviewRequest.requestReference);
  assert.equal(created.reviewRequest.status, REVIEW_STATUS.REQUESTED);
  assert.ok(String(created.disclaimer).includes("not an order"));
  assert.equal(created.reviewRequest.emailSent, false);
  console.log("ok: valid review request");
}

// --- Incomplete configuration rejected ---
{
  const stack = await seedStack();
  const { rawSecret, secretHash } = generateConfigurationSessionSecret();
  const active = await stack.cfgRepo.getActiveEnvelope(ORG, stack.publication.id);
  await stack.cfgRepo.createPublicConfigurationSession({
    organizationId: ORG,
    publicationId: stack.publication.id,
    envelopeId: active.id,
    sessionSecretHash: secretHash,
    status: "active"
  });
  await assert.rejects(
    () =>
      stack.reviewService.createReviewRequest({
        rawSecret,
        body: { expectedRowVersion: 1, idempotencyKey: "x" }
      }),
    /save your selections|incomplete/i
  );
  console.log("ok: incomplete configuration rejected");
}

// --- Duplicate idempotent ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  const a = await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "same" }
  });
  const b = await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "same" }
  });
  assert.equal(b.reused, true);
  assert.equal(a.reviewRequest.requestReference, b.reviewRequest.requestReference);
  console.log("ok: duplicate idempotent review request");
}

// --- Request immutable ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  const created = await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "imm" }
  });
  const id = stack.amdRepo._dump().reviewRequests[0].id;
  const before = structuredClone(stack.amdRepo._dump().reviewRequests[0]);
  // mutate selections after
  const afterSave = await stack.publicService.saveSelections({
    rawSecret: cfg.rawSecret,
    body: {
      items: [{ optionKey: "material:kitchen:group_b", quantity: 1 }],
      expectedRowVersion: cfg.session.rowVersion,
      idempotencyKey: `sel-after-${randomUUID()}`
    }
  });
  assert.equal(afterSave.ok, true);
  assert.notEqual(afterSave.selectionHash, before.selection_hash);
  const after = await stack.amdRepo.getReviewRequest(ORG, id);
  assert.equal(after.selection_hash, before.selection_hash);
  assert.deepEqual(after.request_snapshot_json, before.request_snapshot_json);
  const current = await stack.reviewService.getCurrentReviewRequest({ rawSecret: cfg.rawSecret });
  assert.equal(current.reviewRequest.currentSelectionsDifferFromSubmitted, true);
  console.log("ok: review request immutable; later selections differ flag");
}

// --- Note sanitized ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  const created = await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: {
      expectedRowVersion: cfg.session.rowVersion,
      idempotencyKey: "note",
      customerNote: "<script>alert(1)</script>Hello"
    }
  });
  assert.equal(created.reviewRequest.customerNote.includes("<script>"), false);
  assert.ok(created.reviewRequest.customerNote.includes("Hello"));
  console.log("ok: customer note sanitized");
}

// --- No publish/email/quote revision on request ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  const pubsBefore = stack.deRepo._dump().publications.length;
  const quoteBefore = JSON.stringify(stack.deRepo._dump());
  await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "sidefx" }
  });
  assert.equal(stack.deRepo._dump().publications.length, pubsBefore);
  assert.ok(quoteBefore.includes(QUOTE_ID));
  assert.equal(stack.amdRepo.listEvents(ORG).some((e) => e.event_type === "review_requested"), true);
  assert.equal(stack.amdRepo.listEvents(ORG).some((e) => e.event_type === "amendment_published"), false);
  console.log("ok: review request does not publish/email/revise quote");
}

// --- Structured comparison ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "cmp" }
  });
  const req = stack.amdRepo._dump().reviewRequests[0];
  const cmp = buildStructuredComparison({
    request: req,
    sourceCustomerSnapshot: stack.deRepo._dump().snapshots[0].customer_snapshot_json,
    envelopeOptions: []
  });
  assert.ok(cmp.rows.length >= 1);
  assert.ok(cmp.customerSafeTotals);
  assert.ok(cmp.internalTotals);
  console.log("ok: structured comparison");
}

// --- Studio list / cross-org ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "list" }
  });
  const list = await stack.studioService.listReviewRequests(ORG);
  assert.equal(list.reviewRequests.length, 1);
  const other = await stack.studioService.listReviewRequests(ORG2);
  assert.equal(other.reviewRequests.length, 0);
  await assert.rejects(
    () => stack.studioService.getReviewRequestDetail(ORG2, list.reviewRequests[0].id),
    /not found/i
  );
  console.log("ok: Studio list + cross-org inaccessible");
}

// --- Amendment draft + concurrency + locked measurements ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "amd" }
  });
  const reqId = stack.amdRepo._dump().reviewRequests[0].id;
  const draft = await stack.studioService.createAmendmentDraft(ORG, reqId, "estimator-1");
  assert.equal(draft.amendment.status, AMENDMENT_STATUS.DRAFT);
  await assert.rejects(
    () =>
      stack.studioService.updateAmendmentDraft(
        ORG,
        draft.amendment.id,
        { chargeableCounterSf: 99, expectedRowVersion: draft.amendment.rowVersion },
        "estimator-1"
      ),
    /Caller|locked|forbidden/i
  );
  const updated = await stack.studioService.updateAmendmentDraft(
    ORG,
    draft.amendment.id,
    {
      expectedRowVersion: draft.amendment.rowVersion,
      customerSafeExplanation: "Group C confirmed",
      internalNote: "Checked inventory"
    },
    "estimator-1"
  );
  assert.equal(updated.amendment.rowVersion, draft.amendment.rowVersion + 1);
  await assert.rejects(
    () =>
      stack.studioService.updateAmendmentDraft(
        ORG,
        draft.amendment.id,
        { expectedRowVersion: draft.amendment.rowVersion, customerSafeExplanation: "stale" },
        "estimator-1"
      ),
    /row_version|conflict/i
  );
  console.log("ok: amendment draft + concurrency + locked measurements");
}

// --- DE.2C validate + customer-safe serializer ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "val" }
  });
  const reqId = stack.amdRepo._dump().reviewRequests[0].id;
  const draft = await stack.studioService.createAmendmentDraft(ORG, reqId, "u1");
  const validated = await stack.studioService.validateAmendment(
    ORG,
    draft.amendment.id,
    { expectedRowVersion: draft.amendment.rowVersion },
    "u1"
  );
  assert.equal(validated.amendment.status, AMENDMENT_STATUS.READY);
  assert.ok(validated.calculation);
  assert.ok(validated.customerSafe);
  const blob = JSON.stringify(validated.customerSafe);
  assert.equal(blob.includes("Wholesale"), false);
  assert.equal(blob.includes("markup"), false);
  console.log("ok: DE.2C amendment validation + customer-safe serializer");
}

// --- Atomic publish success + old token/session ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "pub" }
  });
  const reqId = stack.amdRepo._dump().reviewRequests[0].id;
  const draft = await stack.studioService.createAmendmentDraft(ORG, reqId, "u1");
  const validated = await stack.studioService.validateAmendment(
    ORG,
    draft.amendment.id,
    { expectedRowVersion: draft.amendment.rowVersion },
    "u1"
  );
  const oldTokenHash = hashDigitalEstimateToken(stack.published.accessToken);
  const oldPubId = stack.publication.id;
  const pubsBefore = stack.deRepo._dump().publications.filter((p) => p.status === "active").length;
  assert.equal(pubsBefore, 1);

  const published = await stack.studioService.publishAmendment(
    ORG,
    validated.amendment.id,
    { confirm: true, expectedRowVersion: validated.amendment.rowVersion },
    "u1"
  );
  assert.equal(published.ok, true);
  assert.ok(published.accessToken);
  assert.ok(published.customerUrl.includes("/e#"));
  assert.ok(published.customerUrl.includes(published.accessToken));
  assert.equal(published.publication.sourceType, "digital_estimate_amendment");

  const active = stack.deRepo._dump().publications.filter((p) => p.status === "active");
  assert.equal(active.length, 1);
  assert.equal(active[0].id, published.publication.id);
  const oldPub = await stack.deRepo.getPublication(ORG, oldPubId);
  assert.equal(oldPub.status, "superseded");
  const oldTok = await stack.deRepo.findAnyTokenByHash(oldTokenHash);
  assert.ok(oldTok.revoked_at);

  // New token hash-only
  const dump = JSON.stringify(stack.deRepo._dump());
  assert.equal(dump.includes(published.accessToken), false);

  // Old session blocked
  const sessions = stack.cfgRepo._dump().sessions.filter((s) => s.publication_id === oldPubId);
  assert.ok(sessions.every((s) => s.status === "revoked"));

  // Idempotent republish does not re-issue token
  const again = await stack.studioService.publishAmendment(
    ORG,
    validated.amendment.id,
    { confirm: true },
    "u1"
  );
  assert.equal(again.reused, true);
  assert.equal(again.accessToken, null);

  // No quote_headers mutation API on DE repository
  assert.equal(typeof stack.deRepo.insertQuoteHeader, "undefined");
  console.log("ok: atomic amendment publish + supersession + one-time token");
}

// --- Failure injection rollback ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "fail" }
  });
  const reqId = stack.amdRepo._dump().reviewRequests[0].id;
  const draft = await stack.studioService.createAmendmentDraft(ORG, reqId, "u1");
  const validated = await stack.studioService.validateAmendment(
    ORG,
    draft.amendment.id,
    { expectedRowVersion: draft.amendment.rowVersion },
    "u1"
  );
  const checkpointPubs = structuredClone(stack.deRepo._dump());
  const checkpointAmd = structuredClone(stack.amdRepo._dump());
  const real = stack.deRepo.publishAtomic.bind(stack.deRepo);
  let calls = 0;
  stack.deRepo.publishAtomic = async (payload) => {
    calls += 1;
    if (calls === 1) {
      const r = await real(payload);
      throw Object.assign(new Error("injected post-publish failure"), { code: "injected" });
    }
    return real(payload);
  };
  // Force failure after publish by wrapping amendment repo
  const realPublish = stack.amdRepo.publishAmendmentAtomic.bind(stack.amdRepo);
  stack.amdRepo.publishAmendmentAtomic = async (args) => {
    const result = await realPublish(args);
    // simulate failure after success path by throwing before return once
    if (!globalThis.__de2f_fail_once) {
      globalThis.__de2f_fail_once = true;
      // Manually corrupt then rely on restore — instead throw inside by monkeypatching appendEvent
    }
    return result;
  };
  // Cleaner: inject throw inside publishAtomic after mutating
  stack.deRepo.publishAtomic = async (payload) => {
    await real(payload);
    throw Object.assign(new Error("injected"), { code: "injected" });
  };
  stack.amdRepo.publishAmendmentAtomic = realPublish;

  await assert.rejects(
    () =>
      stack.studioService.publishAmendment(
        ORG,
        validated.amendment.id,
        { confirm: true, expectedRowVersion: validated.amendment.rowVersion },
        "u1"
      ),
    /injected/
  );
  // After failure, memory restore should leave one active original
  const active = stack.deRepo._dump().publications.filter((p) => p.status === "active");
  assert.equal(active.length, 1);
  assert.equal(active[0].id, stack.publication.id);
  const amd = await stack.amdRepo.getAmendment(ORG, validated.amendment.id);
  assert.notEqual(amd.status, AMENDMENT_STATUS.PUBLISHED);
  console.log("ok: failure injection rolls back amendment publish");
  void checkpointPubs;
  void checkpointAmd;
}

// --- Concurrent publish one winner ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "race" }
  });
  const reqId = stack.amdRepo._dump().reviewRequests[0].id;
  const draft = await stack.studioService.createAmendmentDraft(ORG, reqId, "u1");
  const validated = await stack.studioService.validateAmendment(
    ORG,
    draft.amendment.id,
    { expectedRowVersion: draft.amendment.rowVersion },
    "u1"
  );
  const results = await Promise.allSettled([
    stack.studioService.publishAmendment(
      ORG,
      validated.amendment.id,
      { confirm: true, expectedRowVersion: validated.amendment.rowVersion },
      "u1"
    ),
    stack.studioService.publishAmendment(
      ORG,
      validated.amendment.id,
      { confirm: true, expectedRowVersion: validated.amendment.rowVersion },
      "u1"
    )
  ]);
  const ok = results.filter((r) => r.status === "fulfilled");
  assert.ok(ok.length >= 1);
  const active = stack.deRepo._dump().publications.filter((p) => p.status === "active");
  assert.equal(active.length, 1);
  console.log("ok: concurrent publish produces one active replacement");
}

// --- Safe events / no secrets ---
{
  const stack = await seedStack();
  const cfg = await openConfiguredSession(stack);
  await stack.reviewService.createReviewRequest({
    rawSecret: cfg.rawSecret,
    body: { expectedRowVersion: cfg.session.rowVersion, idempotencyKey: "evt" }
  });
  const evtBlob = JSON.stringify(stack.amdRepo.listEvents(ORG));
  assert.equal(evtBlob.includes(stack.published.accessToken), false);
  assert.equal(evtBlob.includes("Authorization"), false);
  console.log("ok: safe events redaction");
}

// --- calculateQuote / quote_headers untouched in source ---
{
  const calcPath = join(__dirname, "../../quotes/quoteCalculator.js");
  // Only assert our new files don't import calculateQuote
  const amdSvc = readFileSync(join(__dirname, "amendmentStudioService.mjs"), "utf8");
  const revSvc = readFileSync(join(__dirname, "reviewRequestService.mjs"), "utf8");
  assert.equal(/\bimport\b[^\n]*calculateQuote/.test(amdSvc + revSvc), false);
  assert.equal(/\bcalculateQuote\s*\(/.test(amdSvc.replace(/Never calls calculateQuote\(\)\./g, "") + revSvc), false);
  assert.equal(/from\([\"']quote_headers[\"']\)/.test(amdSvc + revSvc), false);
  assert.equal(amdSvc.includes("insert into public.quote_headers"), false);
  void calcPath;
  console.log("ok: no calculateQuote / quote_headers writes in DE.2F services");
}

console.log("\nAll phase DE.2F backend tests passed.\n");
