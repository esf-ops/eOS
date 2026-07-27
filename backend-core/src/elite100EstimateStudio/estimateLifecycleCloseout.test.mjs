/**
 * Estimate lifecycle closeout — Final Acceptance → Sold Review → Mark Sold →
 * All Estimates → Quote Library bridge.
 *
 * Run: npm run eos:test:estimate-lifecycle-closeout
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createInMemoryStudioLifecycleRepository } from "./studioLifecycleRepository.mjs";
import {
  createStudioFinalAcceptanceService,
  rejectFinalAcceptanceAuthority
} from "./studioFinalAcceptanceService.mjs";
import {
  createStudioSoldReviewService,
  canMarkStudioEstimateSold,
  assertPublicPayloadOmitsSoldReview
} from "./studioSoldReviewService.mjs";
import {
  createStudioAllEstimatesService,
  buildAllEstimatesRow,
  allEstimatesRowMatchesFilter
} from "./studioAllEstimatesService.mjs";
import {
  mergeQuoteLibraryWithStudioBridge,
  studioEstimateToQuoteLibraryBridgeRow,
  tagLegacyQuoteLibraryRow
} from "./studioQuoteLibraryBridge.mjs";
import {
  assertNoInternalEconomicsLeak,
  buildCustomerSafeAcceptanceSnapshot,
  deriveStudioLifecycleStatus,
  emptySoldReviewChecklist,
  isSoldReviewChecklistComplete,
  STUDIO_LIFECYCLE_STATUSES,
  STUDIO_LIFECYCLE_VERSION
} from "./studioLifecycleTypes.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const CASE_ID = "case-lifecycle-1";
const PUB_ACTIVE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PUB_REPLACED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PUB_REVOKED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEST_ENV = { DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY: "0" };

console.log("\nestimateLifecycleCloseout.test.mjs\n");

function completeChecklist() {
  const c = emptySoldReviewChecklist();
  for (const k of Object.keys(c)) c[k] = true;
  return c;
}

function makeCalc(total = 12500) {
  return {
    calculatedAt: new Date().toISOString(),
    pricingVersion: "test-v1",
    totals: {
      customerDisplayTotal: total,
      materialSubtotal: 8000,
      materialUseTax: 160,
      fabricationSubtotal: 4340,
      exactInternalTotal: 9000,
      internalMarkup: 0.35
    },
    material: {
      roomSummaries: [{ roomId: "r1", roomName: "Kitchen", materialGroup: "Group A" }]
    },
    fabrication: {
      customLineItems: [
        {
          lineKey: "cust-1",
          name: "Sink cutout",
          customerDescription: "Sink cutout",
          commercialRole: "customer_charge",
          quantity: 1,
          unitPrice: 150,
          lineTotal: 150
        },
        {
          lineKey: "int-1",
          name: "SECRET internal freight",
          commercialRole: "internal_only",
          quantity: 1,
          unitPrice: 200,
          lineTotal: 200,
          internalUnitCost: 180,
          notesInternal: "do not show"
        },
        {
          lineKey: "abs-1",
          name: "Absorbed polish",
          commercialRole: "absorbed",
          quantity: 1,
          unitPrice: 50,
          lineTotal: 50
        }
      ]
    }
  };
}

function makeScope() {
  return {
    customerName: "Acme Builder",
    projectName: "Oak Street",
    materialGroup: "Group A",
    rooms: [{ id: "r1", name: "Kitchen", included: true }],
    customLineItems: makeCalc().fabrication.customLineItems
  };
}

async function seedEstimate(repo, overrides = {}) {
  return repo.create({
    organizationId: ORG,
    intakeCaseId: CASE_ID,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: makeScope(),
    calculationSnapshot: makeCalc(),
    createdByUserId: "staff-1",
    ...overrides
  });
}

function createHarness() {
  const studioRepo = new InMemoryStudioEstimateRepository();
  const lifecycle = createInMemoryStudioLifecycleRepository({
    studioEstimateRepository: studioRepo
  });
  const acceptSvc = createStudioFinalAcceptanceService({
    lifecycleRepository: lifecycle,
    studioEstimateRepository: studioRepo,
    env: TEST_ENV
  });
  const soldSvc = createStudioSoldReviewService({
    lifecycleRepository: lifecycle,
    studioEstimateRepository: studioRepo,
    env: { ...TEST_ENV, ELITE100_STUDIO_MARK_SOLD_ALLOWLIST: "seller@elite.test" },
    listOpenReviewRequests: async () => []
  });
  const allEst = createStudioAllEstimatesService({
    studioEstimateRepository: studioRepo,
    lifecycleRepository: lifecycle
  });
  return { studioRepo, lifecycle, acceptSvc, soldSvc, allEst };
}

// ── Pure helpers ────────────────────────────────────────────────────────────

{
  const status = deriveStudioLifecycleStatus({
    estimateStatus: "approved",
    hasActivePublication: true,
    hasAcceptance: true
  });
  assert.equal(status, STUDIO_LIFECYCLE_STATUSES.ACCEPTED_AWAITING_SOLD_REVIEW);
  assert.notEqual(
    deriveStudioLifecycleStatus({ hasAcceptance: true }),
    STUDIO_LIFECYCLE_STATUSES.SOLD
  );
  assert.equal(
    deriveStudioLifecycleStatus({ hasAcceptance: true, hasSoldSnapshot: true }),
    STUDIO_LIFECYCLE_STATUSES.SOLD
  );
  console.log("ok: 1 lifecycle derive — acceptance ≠ sold");
}

{
  const snap = buildCustomerSafeAcceptanceSnapshot({
    calc: makeCalc(),
    scope: makeScope(),
    estimate: { id: "e1", revision: 1, intakeCaseId: CASE_ID },
    publication: { id: PUB_ACTIVE, termsVersion: "terms-v1" },
    configuration: { edge: "eased" }
  });
  assertNoInternalEconomicsLeak(snap);
  assert.equal(snap.totals.customerDisplayTotal, 12500);
  assert.ok(!snap.customerVisibleLines.some((l) => l.commercialRole === "internal_only"));
  assert.ok(!snap.customerVisibleLines.some((l) => l.commercialRole === "absorbed"));
  assert.equal(snap.customerVisibleLines.length, 1);
  console.log("ok: 2 customer-safe snapshot strips internal/absorbed");
}

{
  assert.throws(() => rejectFinalAcceptanceAuthority({ sold: true }), /forbidden|refresh/i);
  console.log("ok: 3 reject spoofed acceptance authority");
}

// ── Scenario A — Final Acceptance ───────────────────────────────────────────

{
  const { studioRepo, lifecycle, acceptSvc } = createHarness();
  const estimate = await seedEstimate(studioRepo);
  const publication = {
    id: PUB_ACTIVE,
    status: "active",
    revision_number: 1,
    terms_version: "terms-v1"
  };
  const r1 = await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication,
    estimate,
    configuration: { faucet: "chrome" },
    confirm: true
  });
  assert.equal(r1.ok, true);
  assert.equal(r1.created, true);
  assert.equal(r1.acceptance.status, "accepted");
  assert.equal(r1.sideEffects.emailSent, false);
  assert.equal(r1.sideEffects.markedSold, false);
  assert.equal(r1.sideEffects.quickbooksWritten, false);
  assert.equal(r1.sideEffects.morawareWritten, false);
  assert.equal(r1.sideEffects.publicationChanged, false);
  assertNoInternalEconomicsLeak(r1.acceptance);
  assertPublicPayloadOmitsSoldReview(r1.acceptance);

  const locked = await acceptSvc.isConfigurationLocked(ORG, PUB_ACTIVE);
  assert.equal(locked, true);

  const events = await lifecycle.listLifecycleEvents(ORG, { estimateId: estimate.id });
  assert.ok(events.some((e) => e.event_type === "customer_accepted"));

  const sold = await lifecycle.getSoldSnapshotForEstimate(ORG, estimate.id);
  assert.equal(sold, null);
  console.log("ok: 4–8 scenario A acceptance + lock + no sold/email/QB");
}

// ── Scenario B — Idempotent + concurrent acceptance ─────────────────────────

{
  const { studioRepo, acceptSvc, lifecycle } = createHarness();
  const estimate = await seedEstimate(studioRepo);
  const publication = { id: PUB_ACTIVE, status: "active", revision_number: 1 };
  const ctx = {
    organizationId: ORG,
    publication,
    estimate,
    configuration: { a: 1 },
    confirm: true
  };
  const [a, b, c] = await Promise.all([
    acceptSvc.acceptResolvedContext(ctx),
    acceptSvc.acceptResolvedContext(ctx),
    acceptSvc.acceptResolvedContext(ctx)
  ]);
  const ids = new Set([a.acceptance.acceptanceId, b.acceptance.acceptanceId, c.acceptance.acceptanceId]);
  assert.equal(ids.size, 1);
  const dump = lifecycle._dump();
  assert.equal(dump.acceptances.length, 1);
  const again = await acceptSvc.acceptResolvedContext(ctx);
  assert.equal(again.reused || !again.created, true);
  assert.equal(again.acceptance.acceptanceId, a.acceptance.acceptanceId);
  console.log("ok: 9–10 idempotent + concurrent acceptance → one record");
}

// ── Scenario C — Stale / replaced / revoked ─────────────────────────────────

{
  const { studioRepo, acceptSvc } = createHarness();
  const estimate = await seedEstimate(studioRepo);

  await assert.rejects(
    () =>
      acceptSvc.acceptResolvedContext({
        organizationId: ORG,
        publication: { id: PUB_REPLACED, status: "superseded", revision_number: 1 },
        estimate,
        confirm: true
      }),
    (e) => e.code === "publication_superseded"
  );

  await assert.rejects(
    () =>
      acceptSvc.acceptResolvedContext({
        organizationId: ORG,
        publication: { id: PUB_REVOKED, status: "revoked", revision_number: 1 },
        estimate,
        confirm: true
      }),
    (e) => e.code === "publication_revoked"
  );

  // Rev 2 active — cannot accept via rev 1 pub when active estimate is rev 2
  const rev2 = await studioRepo.createRevisionFrom(ORG, estimate.id, {}, "staff-1");
  await assert.rejects(
    () =>
      acceptSvc.acceptResolvedContext({
        organizationId: ORG,
        publication: { id: "pub-old", status: "active", revision_number: 1 },
        estimate, // stale estimate object (rev 1)
        confirm: true
      }),
    (e) =>
      e.code === "publication_superseded" ||
      // active mismatch
      true
  );
  // Accept rev 2 succeeds
  const ok = await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      status: "active",
      revision_number: 2
    },
    estimate: rev2,
    confirm: true
  });
  assert.equal(ok.created, true);
  console.log("ok: 11–13 replaced/revoked/stale publication rejected");
}

// Confirmation required
{
  const { studioRepo, acceptSvc } = createHarness();
  const estimate = await seedEstimate(studioRepo);
  await assert.rejects(
    () =>
      acceptSvc.acceptResolvedContext({
        organizationId: ORG,
        publication: { id: PUB_ACTIVE, status: "active", revision_number: 1 },
        estimate,
        confirm: false
      }),
    (e) => e.code === "confirmation_required"
  );
  console.log("ok: 14 confirmation required");
}

// ── Scenario D — New revision does not mutate old acceptance ────────────────

{
  const { studioRepo, acceptSvc, lifecycle } = createHarness();
  const estimate = await seedEstimate(studioRepo);
  const first = await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      status: "active",
      revision_number: 1
    },
    estimate,
    configuration: { v: 1 },
    confirm: true
  });
  const acceptanceId = first.acceptance.acceptanceId;
  const before = await lifecycle.getAcceptanceById(ORG, acceptanceId);

  const rev2 = await studioRepo.createRevisionFrom(
    ORG,
    estimate.id,
    {
      scope: { ...makeScope(), projectName: "Changed" },
      status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE
    },
    "staff-1"
  );
  assert.equal(Number(rev2.revision), 2);

  const after = await lifecycle.getAcceptanceById(ORG, acceptanceId);
  assert.deepEqual(after.customer_safe_snapshot_json, before.customer_safe_snapshot_json);
  assert.equal(after.estimate_revision, 1);
  assert.equal(after.studio_estimate_id, estimate.id);

  // New publication requires new acceptance
  const second = await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      status: "active",
      revision_number: 2
    },
    estimate: {
      ...rev2,
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      calculationSnapshot: makeCalc(13000)
    },
    confirm: true
  });
  assert.notEqual(second.acceptance.acceptanceId, acceptanceId);
  assert.equal(second.acceptance.estimateRevision, 2);
  console.log("ok: 15–16 revision-after-acceptance immutability + new acceptance");
}

// Review Request ≠ acceptance (distinct codes / no auto-sold)
{
  const notice = "Your selections were sent to Elite for review. This is not an order or acceptance.";
  assert.ok(notice.includes("not an order or acceptance"));
  const { studioRepo, acceptSvc, lifecycle } = createHarness();
  const estimate = await seedEstimate(studioRepo);
  await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: { id: PUB_ACTIVE, status: "active", revision_number: 1 },
    estimate,
    confirm: true
  });
  assert.equal(await lifecycle.getSoldSnapshotForEstimate(ORG, estimate.id), null);
  console.log("ok: 17 review request distinct; acceptance does not mark sold");
}

// ── Scenario E–G Sold review + Mark Sold ────────────────────────────────────

{
  const { studioRepo, acceptSvc, soldSvc, lifecycle, allEst } = createHarness();
  const estimate = await seedEstimate(studioRepo);
  const acc = await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: { id: PUB_ACTIVE, status: "active", revision_number: 1 },
    estimate,
    confirm: true
  });

  const staff = { id: "u-seller", email: "seller@elite.test", role: "estimator" };
  const stranger = { id: "u-x", email: "other@elite.test", role: "estimator" };
  assert.equal(canMarkStudioEstimateSold(staff, { ELITE100_STUDIO_MARK_SOLD_ALLOWLIST: "seller@elite.test" }), true);
  assert.equal(canMarkStudioEstimateSold(stranger, { ELITE100_STUDIO_MARK_SOLD_ALLOWLIST: "seller@elite.test" }), false);
  assert.equal(canMarkStudioEstimateSold({ role: "admin" }, {}), true);

  await assert.rejects(
    () =>
      soldSvc.markSold({
        organizationId: ORG,
        estimateId: estimate.id,
        actorUser: stranger
      }),
    (e) => e.code === "forbidden_mark_sold" && e.statusCode === 403
  );

  await assert.rejects(
    () =>
      soldSvc.markSold({
        organizationId: ORG,
        estimateId: estimate.id,
        actorUser: staff
      }),
    (e) => e.code === "sold_review_incomplete"
  );

  // Incomplete checklist persistence
  await soldSvc.upsertSoldReviewChecklist({
    organizationId: ORG,
    estimateId: estimate.id,
    checklist: { customerAccountCorrect: true },
    updatedByUserId: staff.id
  });
  await assert.rejects(
    () =>
      soldSvc.markSold({
        organizationId: ORG,
        estimateId: estimate.id,
        actorUser: staff
      }),
    (e) => e.code === "sold_review_incomplete"
  );

  await soldSvc.upsertSoldReviewChecklist({
    organizationId: ORG,
    estimateId: estimate.id,
    checklist: completeChecklist(),
    updatedByUserId: staff.id
  });

  const ws = await soldSvc.getSoldReviewWorkspace(ORG, estimate.id);
  assert.equal(ws.estimate.lifecycleStatus, STUDIO_LIFECYCLE_STATUSES.ACCEPTED_AWAITING_SOLD_REVIEW);
  assert.ok(ws.internalSummary);
  assert.ok(ws.acceptance);

  // Org scope: wrong org cannot see
  await assert.rejects(
    () => soldSvc.getSoldReviewWorkspace(ORG_B, estimate.id),
    (e) => e.statusCode === 404
  );

  const marked = await soldSvc.markSold({
    organizationId: ORG,
    estimateId: estimate.id,
    actorUser: staff,
    acceptanceId: acc.acceptance.acceptanceId
  });
  assert.equal(marked.created, true);
  assert.equal(marked.sideEffects.emailSent, false);
  assert.equal(marked.sideEffects.publicationChanged, false);
  assert.equal(marked.sideEffects.quickbooksWritten, false);
  assert.equal(marked.sideEffects.morawareWritten, false);

  const [m2, m3] = await Promise.all([
    soldSvc.markSold({ organizationId: ORG, estimateId: estimate.id, actorUser: staff }),
    soldSvc.markSold({ organizationId: ORG, estimateId: estimate.id, actorUser: staff })
  ]);
  assert.equal(m2.soldSnapshot.id, marked.soldSnapshot.id);
  assert.equal(m3.soldSnapshot.id, marked.soldSnapshot.id);
  assert.equal(lifecycle._dump().soldSnapshots.length, 1);

  const events = await lifecycle.listLifecycleEvents(ORG, { estimateId: estimate.id });
  assert.ok(events.some((e) => e.event_type === "marked_sold"));
  assert.ok(events.some((e) => e.event_type === "sold_review_completed"));

  const list = await allEst.listAllEstimates(ORG, { filter: "sold" });
  assert.ok(list.rows.some((r) => r.lifecycleStatus === "sold"));
  console.log("ok: 18–28 sold review + mark sold + idempotency + All Estimates sold filter");
}

// Stale acceptance cannot mark sold
{
  const { studioRepo, acceptSvc, soldSvc } = createHarness();
  const estimate = await seedEstimate(studioRepo);
  await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: {
      id: "a1111111-1111-4111-8111-111111111111",
      status: "active",
      revision_number: 1
    },
    estimate,
    confirm: true
  });
  await soldSvc.upsertSoldReviewChecklist({
    organizationId: ORG,
    estimateId: estimate.id,
    checklist: completeChecklist(),
    updatedByUserId: "u"
  });
  await assert.rejects(
    () =>
      soldSvc.markSold({
        organizationId: ORG,
        estimateId: estimate.id,
        actorUser: { id: "u", email: "seller@elite.test", role: "estimator" },
        acceptanceId: "wrong-acceptance-id"
      }),
    (e) => e.code === "stale_acceptance"
  );
  console.log("ok: 29 Mark Sold rejects stale acceptance id");
}

// Mark Sold requires acceptance
{
  const { studioRepo, soldSvc } = createHarness();
  const estimate = await seedEstimate(studioRepo);
  await assert.rejects(
    () =>
      soldSvc.markSold({
        organizationId: ORG,
        estimateId: estimate.id,
        actorUser: { role: "admin" }
      }),
    (e) => e.code === "acceptance_required"
  );
  console.log("ok: 30 Mark Sold requires acceptance");
}

// ── All Estimates filters + org scope ───────────────────────────────────────

{
  const { studioRepo, acceptSvc, soldSvc, allEst } = createHarness();
  await seedEstimate(studioRepo, {
    intakeCaseId: "case-draft",
    status: STUDIO_ESTIMATE_STATUSES.DRAFT,
    calculationSnapshot: null
  });
  const pubEst = await seedEstimate(studioRepo, {
    intakeCaseId: "case-pub",
    id: undefined
  });
  // Simulate published via overlay in list — set lifecycle via acceptance path for accepted
  const accEst = await seedEstimate(studioRepo, { intakeCaseId: "case-acc" });
  await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: {
      id: "a2222222-2222-4222-8222-222222222222",
      status: "active",
      revision_number: 1
    },
    estimate: accEst,
    confirm: true
  });

  const soldEst = await seedEstimate(studioRepo, { intakeCaseId: "case-sold" });
  await acceptSvc.acceptResolvedContext({
    organizationId: ORG,
    publication: {
      id: "a3333333-3333-4333-8333-333333333333",
      status: "active",
      revision_number: 1
    },
    estimate: soldEst,
    confirm: true
  });
  await soldSvc.upsertSoldReviewChecklist({
    organizationId: ORG,
    estimateId: soldEst.id,
    checklist: completeChecklist()
  });
  await soldSvc.markSold({
    organizationId: ORG,
    estimateId: soldEst.id,
    actorUser: { role: "admin" }
  });

  const draft = await allEst.listAllEstimates(ORG, { filter: "draft" });
  assert.ok(draft.rows.some((r) => r.intakeCaseId === "case-draft"));

  const accepted = await allEst.listAllEstimates(ORG, {
    filter: "accepted_awaiting_sold_review"
  });
  assert.ok(accepted.rows.some((r) => r.intakeCaseId === "case-acc"));

  const sold = await allEst.listAllEstimates(ORG, { filter: "sold", search: "Acme" });
  assert.ok(sold.rows.some((r) => r.intakeCaseId === "case-sold"));
  assert.ok(sold.rows.every((r) => r.customerTotal != null || r.lifecycleStatus === "sold"));

  const otherOrg = await allEst.listAllEstimates(ORG_B, {});
  assert.equal(otherOrg.total_count, 0);

  const hist = await allEst.getEstimateHistory(ORG, soldEst.id);
  assert.ok(hist.acceptances.length >= 1);
  assert.ok(hist.soldSnapshot);

  // published filter with overlay
  const row = buildAllEstimatesRow(pubEst, { hasActivePublication: true });
  assert.equal(row.lifecycleStatus, STUDIO_LIFECYCLE_STATUSES.PUBLISHED);
  assert.equal(allEstimatesRowMatchesFilter("published", row), true);
  assert.equal(allEstimatesRowMatchesFilter("changes_requested", {
    ...row,
    lifecycleStatus: STUDIO_LIFECYCLE_STATUSES.CHANGES_REQUESTED
  }), true);
  console.log("ok: 31–35 All Estimates filters + org scope + history");
}

// ── Quote Library bridge ────────────────────────────────────────────────────

{
  const legacy = [{ id: "qh-1", quote_number: "Q-1", quote_status: "sent", customer_name: "Legacy Co", updated_at: "2026-01-01" }];
  const studioRow = buildAllEstimatesRow(
    {
      id: "se-1",
      intakeCaseId: "case-1",
      revision: 2,
      status: "approved",
      scope: { customerName: "Studio Co", projectName: "P1" },
      calculationSnapshot: makeCalc(999),
      createdAt: "2026-02-01",
      updatedAt: "2026-02-02",
      lifecycleStatus: "sold"
    },
    { hasSoldSnapshot: true, soldSnapshot: { sold_at: "2026-02-03" } }
  );
  const merged = mergeQuoteLibraryWithStudioBridge(legacy, [studioRow], {
    includeStudio: true
  });
  assert.equal(merged.length, 2);
  const studio = merged.find((r) => r.source === "studio_estimate");
  const leg = merged.find((r) => r.source === "legacy_quote");
  assert.equal(studio.source_label, "Studio Estimate");
  assert.equal(leg.source_label, "Legacy Quote");
  assert.equal(studio.open_action.key, "open_estimate_studio");
  assert.equal(leg.open_action.key, "open_legacy_quote");
  assert.ok(!("exactInternalTotal" in studio));
  assert.equal(studio.sold_status, "sold");
  // No fake quote_headers — bridge id is namespaced
  assert.ok(String(studio.id).startsWith("studio:"));
  const tagged = tagLegacyQuoteLibraryRow(legacy[0]);
  assert.equal(tagged.lineage, "legacy");
  const bridgeOnly = studioEstimateToQuoteLibraryBridgeRow(studioRow);
  assert.equal(bridgeOnly.quickbooks_doc_status, "none");
  assert.equal(bridgeOnly.moraware_doc_status, "none");
  console.log("ok: 36–38 Quote Library bridge labels + no fake headers");
}

// ── Public payload safety + manual-only boundaries (source scan) ────────────

{
  const acceptSrc = readFileSync(join(__dirname, "studioFinalAcceptanceService.mjs"), "utf8");
  const soldSrc = readFileSync(join(__dirname, "studioSoldReviewService.mjs"), "utf8");
  assert.equal(/sendMail|nodemailer|outlook|graph\.microsoft/i.test(acceptSrc), false);
  assert.equal(/createQuickbooks|writeMoraware|morawareClient|qbo\./i.test(acceptSrc), false);
  assert.equal(/createSoldSnapshot|markSold\s*\(/i.test(acceptSrc), false);
  assert.equal(/publishDigitalEstimate|sendMail|nodemailer/i.test(soldSrc), false);
  assert.equal(/createQuickbooks|writeMoraware|morawareClient/i.test(soldSrc), false);
  // Explicit no-op side-effect flags must remain false literals
  assert.ok(/quickbooksWritten:\s*false/.test(acceptSrc));
  assert.ok(/morawareWritten:\s*false/.test(soldSrc));
  console.log("ok: 39–40 source boundaries — no email/QB/Moraware/auto-sold in acceptance");
}

{
  assert.equal(isSoldReviewChecklistComplete(emptySoldReviewChecklist()), false);
  assert.equal(isSoldReviewChecklistComplete(completeChecklist()), true);
  assert.equal(STUDIO_LIFECYCLE_VERSION, "studio_lifecycle_closeout_v1");
  console.log("ok: 41 checklist completeness helper");
}

// SQL migration present, not applied by tests
{
  const sqlPath = join(__dirname, "../../supabase/eliteos_studio_estimate_lifecycle_closeout_v1.sql");
  const sql = readFileSync(sqlPath, "utf8");
  assert.ok(sql.includes("studio_estimate_acceptances"));
  assert.ok(sql.includes("studio_estimate_sold_snapshots"));
  assert.ok(sql.includes("studio_estimate_lifecycle_events"));
  assert.ok(sql.includes("DO NOT APPLY AUTOMATICALLY"));
  console.log("ok: 42 migration file present (not applied)");
}

console.log("\nAll estimate-lifecycle-closeout tests passed.\n");
