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
  console.log("ok: 13–15 SQL uniqueness + immutability; no quote_headers alteration");
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

console.log("\nAll estimate-lifecycle persistence hardening tests passed.\n");
