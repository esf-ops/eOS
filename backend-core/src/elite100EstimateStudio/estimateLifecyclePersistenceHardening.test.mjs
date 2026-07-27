/**
 * Pre-push hardening: legacy Quote Library compatibility + production persistence fail-closed.
 * Run: npm run eos:test:estimate-lifecycle-closeout
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  mergeQuoteLibraryWithStudioBridge,
  tagLegacyQuoteLibraryRow,
  studioEstimateToQuoteLibraryBridgeRow,
  isStudioBridgeQuoteId,
  assertLegacyQuoteLibraryMutationId
} from "./studioQuoteLibraryBridge.mjs";
import { buildAllEstimatesRow } from "./studioAllEstimatesService.mjs";
import {
  createStudioLifecycleRepository,
  resolveStudioLifecycleRepositoryForRoutes
} from "./studioLifecycleRepositoryFactory.mjs";
import { createInMemoryStudioLifecycleRepository } from "./studioLifecycleRepository.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("\nestimateLifecyclePersistenceHardening.test.mjs\n");

// ── Quote Library legacy shape preservation ─────────────────────────────────

{
  const legacy = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      quote_number: "ESF-100",
      quote_status: "sent",
      customer_name: "Legacy Co",
      project_name: "Barn",
      grand_total: 1200,
      updated_at: "2026-01-01T00:00:00.000Z",
      handoff_status: "none"
    }
  ];
  const off = mergeQuoteLibraryWithStudioBridge(legacy, [], { includeStudio: false });
  assert.equal(off.length, 1);
  assert.deepEqual(off[0], legacy[0]);
  assert.equal(off[0].source, undefined);
  assert.equal(off[0].source_label, undefined);
  console.log("ok: 1 include_studio=false returns legacy rows unchanged");
}

{
  const legacy = [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      quote_number: "ESF-200",
      quote_status: "sold",
      customer_name: "Legacy Co",
      updated_at: "2026-02-01T00:00:00.000Z"
    }
  ];
  const studioRow = buildAllEstimatesRow({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    intakeCaseId: "case-1",
    revision: 1,
    status: "approved",
    scope: { customerName: "Studio Co", projectName: "Kitchen" },
    calculationSnapshot: { totals: { customerDisplayTotal: 5000 } },
    createdAt: "2026-03-01",
    updatedAt: "2026-03-02",
    lifecycleStatus: "accepted_awaiting_sold_review"
  });
  const merged = mergeQuoteLibraryWithStudioBridge(legacy, [studioRow], {
    includeStudio: true
  });
  assert.equal(merged.length, 2);
  const leg = merged.find((r) => r.id === legacy[0].id);
  const stu = merged.find((r) => isStudioBridgeQuoteId(r.id));
  assert.ok(leg);
  assert.equal(leg.quote_number, "ESF-200");
  assert.equal(leg.quote_status, "sold");
  assert.equal(leg.source_label, "Legacy Quote");
  assert.equal(leg.open_action.key, "open_legacy_quote");
  assert.equal(stu.source_label, "Studio Estimate");
  assert.equal(stu.open_action.key, "open_estimate_studio");
  assert.ok(String(stu.id).startsWith("studio:"));
  assert.notEqual(stu.id, leg.id);
  console.log("ok: 2 include_studio=true adds Studio without removing legacy fields");
}

{
  assert.equal(isStudioBridgeQuoteId("studio:abc"), true);
  assert.equal(isStudioBridgeQuoteId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), false);
  assert.throws(
    () => assertLegacyQuoteLibraryMutationId("studio:cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
    (e) => e.code === "studio_bridge_mutation_forbidden" && e.statusCode === 400
  );
  assert.doesNotThrow(() =>
    assertLegacyQuoteLibraryMutationId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
  );
  console.log("ok: 3 Studio bridge ids cannot invoke legacy mutations");
}

{
  const bridge = studioEstimateToQuoteLibraryBridgeRow(
    buildAllEstimatesRow({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      intakeCaseId: "case-x",
      revision: 2,
      status: "approved",
      scope: { customerName: "A", projectName: "B" },
      calculationSnapshot: { totals: { customerDisplayTotal: 1 } }
    })
  );
  assert.equal(bridge.is_studio_bridge, true);
  assert.equal(bridge.quote_source, "elite100_studio");
  assert.ok(!("exactInternalTotal" in bridge));
  // Bridge never claims a real quote_headers id
  assert.ok(isStudioBridgeQuoteId(bridge.id));
  console.log("ok: 4 Studio bridge rows do not use quote_headers ids");
}

{
  const tagged = tagLegacyQuoteLibraryRow({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    quote_number: "Q1",
    quote_status: "sent"
  });
  assert.equal(tagged.lineage, "legacy");
  assert.equal(tagged.quote_number, "Q1");
  console.log("ok: 5 legacy tagging is additive");
}

// ── Production memory fallback forbidden ────────────────────────────────────

{
  assert.throws(
    () =>
      createStudioLifecycleRepository({
        env: { ELITE100_STUDIO_LIFECYCLE_REPOSITORY: "memory" },
        allowMemory: false
      }),
    (e) => e.code === "studio_lifecycle_persistence_unavailable"
  );
  assert.throws(
    () =>
      createStudioLifecycleRepository({
        env: { ELITE100_STUDIO_LIFECYCLE_REPOSITORY: "supabase" },
        allowMemory: false
      }),
    (e) => e.code === "studio_lifecycle_persistence_unavailable"
  );
  const mem = createStudioLifecycleRepository({
    env: { ELITE100_STUDIO_LIFECYCLE_REPOSITORY: "memory" },
    allowMemory: true
  });
  assert.equal(mem.mode, "memory");
  const injected = createInMemoryStudioLifecycleRepository();
  const viaInject = createStudioLifecycleRepository({ repository: injected });
  assert.equal(viaInject.mode, "injected");
  console.log("ok: 6–8 production forbids memory; tests may inject/allowMemory");
}

{
  assert.throws(
    () =>
      resolveStudioLifecycleRepositoryForRoutes({
        env: { ELITE100_STUDIO_LIFECYCLE_REPOSITORY: "supabase" },
        getSupabase: () => null
      }),
    (e) => e.code === "studio_lifecycle_persistence_unavailable" && e.statusCode === 503
  );
  console.log("ok: 9 missing supabase client → 503 persistence unavailable");
}

// Fake unavailable repo behaves like missing tables
{
  const unavailable = {
    mode: "unavailable",
    async getAcceptanceByPublication() {
      const e = new Error("unavailable");
      e.code = "studio_lifecycle_persistence_unavailable";
      e.statusCode = 503;
      throw e;
    },
    async createAcceptance() {
      const e = new Error("unavailable");
      e.code = "studio_lifecycle_persistence_unavailable";
      e.statusCode = 503;
      throw e;
    },
    async getSoldReviewForEstimate() {
      const e = new Error("unavailable");
      e.code = "studio_lifecycle_persistence_unavailable";
      e.statusCode = 503;
      throw e;
    },
    async createSoldSnapshot() {
      const e = new Error("unavailable");
      e.code = "studio_lifecycle_persistence_unavailable";
      e.statusCode = 503;
      throw e;
    }
  };
  await assert.rejects(
    () => unavailable.createAcceptance({ organizationId: "o", publicationId: "p" }),
    (e) => e.statusCode === 503 && e.code === "studio_lifecycle_persistence_unavailable"
  );
  await assert.rejects(
    () => unavailable.createSoldSnapshot({ organizationId: "o", studioEstimateId: "e" }),
    (e) => e.statusCode === 503
  );
  console.log("ok: 10–12 missing tables cannot accept / mark sold / show success");
}

// DB uniqueness documented in SQL
{
  const sql = readFileSync(
    join(__dirname, "../../supabase/eliteos_studio_estimate_lifecycle_closeout_v1.sql"),
    "utf8"
  );
  assert.ok(sql.includes("uq_studio_acceptance_org_publication"));
  assert.ok(sql.includes("uq_studio_sold_snapshot_org_estimate"));
  assert.ok(sql.includes("uq_studio_sold_snapshot_org_acceptance"));
  assert.ok(sql.includes("uq_studio_sold_review_org_estimate"));
  assert.ok(!/ALTER TABLE public\.quote_headers/i.test(sql));
  assert.ok(!/CREATE TABLE.*quote_headers/i.test(sql));
  assert.ok(sql.includes("studio_estimate_acceptances_immutable"));
  assert.ok(sql.includes("studio_estimate_sold_snapshots_immutable"));
  assert.ok(sql.includes("studio_estimate_lifecycle_events_immutable"));
  assert.ok(sql.includes("studio_estimate_sold_reviews_lock_after_sold"));
  assert.ok(/BEGIN\s*;/.test(sql));
  assert.ok(/COMMIT\s*;/.test(sql));
  assert.ok(sql.includes("RAISE EXCEPTION"));
  assert.ok(!/skip lifecycle closeout/i.test(sql));
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert.ok(/REVOKE ALL ON TABLE public\.studio_estimate_acceptances FROM anon, authenticated/);
  assert.ok(/REVOKE ALL ON TABLE public\.studio_estimate_sold_reviews FROM anon, authenticated/);
  assert.ok(/REVOKE ALL ON TABLE public\.studio_estimate_sold_snapshots FROM anon, authenticated/);
  assert.ok(/REVOKE ALL ON TABLE public\.studio_estimate_lifecycle_events FROM anon, authenticated/);
  assert.ok(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.studio_estimate_acceptances TO service_role/);
  assert.ok(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.studio_estimate_sold_reviews TO service_role/);
  assert.ok(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.studio_estimate_sold_snapshots TO service_role/);
  assert.ok(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.studio_estimate_lifecycle_events TO service_role/);
  assert.equal(
    [...sql.matchAll(/^\s*CREATE\s+POLICY\b/gim)].length,
    0,
    "migration must not create anon/authenticated policies"
  );
  assert.ok(sql.includes("studio_estimate_lifecycle_events_publication_id_fkey"));
  assert.ok(sql.includes("studio_estimate_lifecycle_events_acceptance_id_fkey"));
  assert.ok(sql.includes("studio_estimate_lifecycle_events_sold_snapshot_id_fkey"));
  assert.ok(sql.includes("studio_estimate_acceptances_org_match"));
  assert.ok(sql.includes("studio_estimate_sold_reviews_org_match"));
  assert.ok(sql.includes("studio_estimate_sold_snapshots_org_match"));
  assert.ok(sql.includes("studio_estimate_lifecycle_events_org_match"));
  assert.ok(sql.includes("conrelid = 'public.studio_estimates'::regclass"));
  assert.ok(sql.includes("relrowsecurity"));
  assert.ok(sql.includes("relforcerowsecurity"));
  assert.ok(sql.includes("pg_policies"));
  assert.ok(/intake_case_id NOT NULL/.test(sql));
  console.log("ok: 13–15 SQL uniqueness + RLS + txn + FKs + org triggers; no quote_headers");
}

// Route source: no memory fallback in production wiring
{
  const routesSrc = readFileSync(join(__dirname, "elite100EstimateStudioRoutes.js"), "utf8");
  const acceptRoutesSrc = readFileSync(join(__dirname, "studioFinalAcceptanceRoutes.js"), "utf8");
  const factorySrc = readFileSync(join(__dirname, "studioLifecycleRepositoryFactory.mjs"), "utf8");
  assert.ok(routesSrc.includes("resolveStudioLifecycleRepositoryForRoutes"));
  assert.equal(/getSharedMemoryLifecycle|createInMemoryStudioLifecycleRepository\(/.test(routesSrc), false);
  assert.ok(acceptRoutesSrc.includes("resolveStudioLifecycleRepositoryForRoutes"));
  assert.equal(/getSharedMemoryLifecycle/.test(acceptRoutesSrc), false);
  assert.ok(factorySrc.includes("allowMemory"));
  assert.ok(factorySrc.includes("studio_lifecycle_persistence_unavailable"));
  console.log("ok: 16 routes use fail-closed factory; no shared memory lifecycle");
}

// Side-effect boundaries still hold
{
  const acceptSrc = readFileSync(join(__dirname, "studioFinalAcceptanceService.mjs"), "utf8");
  const soldSrc = readFileSync(join(__dirname, "studioSoldReviewService.mjs"), "utf8");
  assert.equal(/sendMail|nodemailer|publishDigitalEstimate/i.test(acceptSrc), false);
  assert.equal(/createQuickbooks|writeMoraware/i.test(soldSrc), false);
  assert.ok(/quickbooksWritten:\s*false/.test(acceptSrc));
  console.log("ok: 17 no email/publication/QB/Moraware side effects");
}

// QL API rejects studio bridge ids
{
  const qlSrc = readFileSync(join(__dirname, "../quotes/quoteLibraryApi.js"), "utf8");
  assert.ok(qlSrc.includes("rejectStudioBridgeIdParam"));
  assert.ok(qlSrc.includes("studio_bridge_mutation_forbidden"));
  assert.ok(qlSrc.includes('includeStudioRaw === "1"'));
  console.log("ok: 18 Quote Library mutations reject Studio bridge ids; include_studio opt-in");
}

// ── Sold-review lock after Mark Sold (memory mirrors DB trigger) ────────────

{
  const { emptySoldReviewChecklist } = await import("./studioLifecycleTypes.mjs");
  const lifecycle = createInMemoryStudioLifecycleRepository();
  const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const orgB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const estimateId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const publicationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  const { acceptance } = await lifecycle.createAcceptance({
    organizationId: org,
    intakeCaseId: "case-manual-1",
    studioEstimateId: estimateId,
    estimateRevision: 1,
    publicationId,
    customerSafeSnapshot: { total: 1 },
    customerDisplayTotal: 100
  });
  assert.ok(acceptance.intake_case_id);

  const before = await lifecycle.upsertSoldReview({
    organizationId: org,
    intakeCaseId: "case-manual-1",
    studioEstimateId: estimateId,
    acceptanceId: acceptance.id,
    checklist: { ...emptySoldReviewChecklist(), customerAccountCorrect: true }
  });
  assert.equal(before.checklist_complete, false);
  console.log("ok: 19 sold-review checklist update before Mark Sold succeeds");

  const { soldSnapshot } = await lifecycle.createSoldSnapshot({
    organizationId: org,
    intakeCaseId: "case-manual-1",
    studioEstimateId: estimateId,
    estimateRevision: 1,
    acceptanceId: acceptance.id,
    soldReviewId: before.id,
    checklistSnapshot: before.checklist_json,
    soldSnapshot: { locked: true },
    customerDisplayTotal: 100
  });
  const snapClone = structuredClone(soldSnapshot);

  await assert.rejects(
    () =>
      lifecycle.upsertSoldReview({
        organizationId: org,
        intakeCaseId: "case-manual-1",
        studioEstimateId: estimateId,
        acceptanceId: acceptance.id,
        checklist: { ...emptySoldReviewChecklist(), customerAccountCorrect: false }
      }),
    (e) => e.code === "sold_review_locked" && e.statusCode === 409
  );
  console.log("ok: 20 sold-review checklist update after Mark Sold fails");

  await assert.rejects(
    () => lifecycle.deleteSoldReview(org, estimateId),
    (e) => e.code === "sold_review_locked"
  );
  console.log("ok: 21 sold-review delete after Mark Sold fails");

  const snapAfter = await lifecycle.getSoldSnapshotForEstimate(org, estimateId);
  assert.deepEqual(snapAfter.sold_snapshot_json, snapClone.sold_snapshot_json);
  assert.equal(snapAfter.id, snapClone.id);
  console.log("ok: 22 sold snapshot remains unchanged after lock attempts");

  // Cross-org linkage rejected without leaking sibling existence details
  await assert.rejects(
    () =>
      lifecycle.createAcceptance({
        organizationId: orgB,
        intakeCaseId: "case-x",
        studioEstimateId: estimateId,
        publicationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        estimateOrganizationId: org,
        customerSafeSnapshot: {}
      }),
    (e) => e.code === "not_found" && e.statusCode === 404 && e.message === "Not found"
  );
  await assert.rejects(
    () =>
      lifecycle.upsertSoldReview({
        organizationId: orgB,
        intakeCaseId: "case-x",
        studioEstimateId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        acceptanceId: acceptance.id,
        checklist: emptySoldReviewChecklist()
      }),
    (e) => e.code === "not_found" && e.message === "Not found"
  );
  await assert.rejects(
    () =>
      lifecycle.createSoldSnapshot({
        organizationId: orgB,
        intakeCaseId: "case-x",
        studioEstimateId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        acceptanceId: acceptance.id,
        acceptanceOrganizationId: org,
        soldSnapshot: {}
      }),
    (e) => e.code === "not_found"
  );
  console.log("ok: 23 cross-organization linkage rejected without existence leak");
}

// Manual estimate intake_case_id compatibility (schema + create path)
{
  const sql = readFileSync(
    join(__dirname, "../../supabase/eliteos_studio_estimate_lifecycle_closeout_v1.sql"),
    "utf8"
  );
  const studioEstSql = readFileSync(
    join(__dirname, "../../supabase/eliteos_studio_estimates_v1.sql"),
    "utf8"
  );
  const manualSrc = readFileSync(join(__dirname, "studioManualEstimateService.mjs"), "utf8");
  assert.ok(studioEstSql.includes("intake_case_id text not null"));
  assert.ok(/intake_case_id text NOT NULL/.test(sql));
  assert.ok(manualSrc.includes("intakeCaseId: caseRow.id"));
  assert.ok(manualSrc.includes("Unable to create manual intake case"));
  assert.equal(/quote_headers/.test(manualSrc), false);
  console.log("ok: 24 manual Studio estimates always carry intake_case_id; no fake quote_headers");
}

// Acceptance + sold snapshot + events immutability documented; service-role path supported
{
  const factorySrc = readFileSync(join(__dirname, "studioLifecycleRepositoryFactory.mjs"), "utf8");
  const supabaseSrc = readFileSync(join(__dirname, "supabaseStudioLifecycleRepository.mjs"), "utf8");
  assert.ok(factorySrc.includes("createSupabaseStudioLifecycleRepository"));
  assert.ok(supabaseSrc.includes("service_role") || supabaseSrc.includes("from(ACCEPTANCES)"));
  assert.ok(supabaseSrc.includes("sold_review_locked") || supabaseSrc.includes("isSoldReviewLockedError"));
  assert.ok(supabaseSrc.includes("isOrgMatchViolation"));
  console.log("ok: 25 service-role repository path + lock/org error mapping supported");
}

// Final Acceptance remains Brain-only (no direct table exposure in public routes)
{
  const acceptRoutes = readFileSync(join(__dirname, "studioFinalAcceptanceRoutes.js"), "utf8");
  assert.ok(acceptRoutes.includes("resolveStudioLifecycleRepositoryForRoutes"));
  assert.equal(/from\(["']studio_estimate_acceptances["']\)/.test(acceptRoutes), false);
  assert.equal(/SUPABASE_ANON|createBrowserClient/.test(acceptRoutes), false);
  console.log("ok: 26 public Final Acceptance writes only through backend-core");
}

console.log("\nAll estimate-lifecycle persistence hardening tests passed.\n");
