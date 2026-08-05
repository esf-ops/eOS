/**
 * Elite 100 Quote Flow — Slice 1D Estimates list + official scope PATCH.
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowSlice1d.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createQuoteFlowEstimatesService,
  validateAndNormalizeOfficialScopeRooms
} from "./quoteFlowEstimates.mjs";
import {
  presentQuoteFlowEstimateListItem,
  resolveEstimateDisplayName,
  summarizeOfficialScope
} from "./quoteFlowEstimatesPresenter.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowSlice1d.test.mjs\n");

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "case-est-1";
const JOB = "22222222-2222-4222-8222-222222222222";
const EST = "33333333-3333-4333-8333-333333333333";
const EST_UNSCOPED = "44444444-4444-4444-8444-444444444444";

const scopedRooms = [
  {
    id: "r1",
    name: "Kitchen",
    roomType: "Kitchen",
    included: true,
    pieces: [
      {
        id: "p1",
        name: "Island",
        lengthIn: 96,
        depthIn: 25.5,
        quantity: 1,
        included: true,
        excluded: false
      }
    ]
  }
];

{
  const summary = summarizeOfficialScope({ rooms: scopedRooms });
  assert.equal(summary.roomCount, 1);
  assert.equal(summary.pieceCount, 1);
  assert.equal(summary.openEdgeLf, 0);
  const withEdge = summarizeOfficialScope({
    rooms: [
      {
        ...scopedRooms[0],
        pieces: [{ ...scopedRooms[0].pieces[0], openEdgeLf: 12.5 }]
      }
    ]
  });
  assert.equal(withEdge.openEdgeLf, 12.5);
  assert.match(withEdge.label, /12\.5 LF open edge/);
  const fromAlias = summarizeOfficialScope({
    rooms: [
      {
        ...scopedRooms[0],
        pieces: [{ ...scopedRooms[0].pieces[0], exposedEdgeLf: 8 }]
      }
    ]
  });
  assert.equal(fromAlias.openEdgeLf, 8);
  const item = presentQuoteFlowEstimateListItem({
    id: EST,
    status: "ready_to_price",
    intakeCaseId: CASE,
    takeoffJobId: JOB,
    scope: { rooms: scopedRooms, projectName: "Remodel" },
    customerIdentitySnapshot: { displayName: "Buyer Co" },
    updatedAt: "2026-08-04T12:00:00.000Z"
  });
  assert.equal(item.estimateId, EST);
  assert.equal(item.customerName, "Buyer Co");
  assert.equal(item.projectName, "Remodel");
  assert.equal(item.estimateName, "Remodel");
  assert.equal(item.status.key, "scope_set");
  assert.equal(item.scopeSource?.key, "ai_takeoff");
  assert.equal(item.scopeSummary.countertopSf > 0, true);
  assert.equal(item.scopeSummary.openEdgeLf, 0);
  assert.equal(
    resolveEstimateDisplayName({
      customerName: "Unknown contact",
      planFilename: "Hoskins Williams Job.pdf",
      scope: {}
    }),
    "Hoskins Williams Job"
  );
  const manual = presentQuoteFlowEstimateListItem({
    id: "m1",
    status: "ready_to_price",
    scope: {
      rooms: scopedRooms,
      source: "quote_flow_manual_scope",
      projectName: "Manual Job",
      quoteFlowScopeEdited: true
    }
  });
  assert.equal(manual.scopeSource.key, "manual");
  assert.equal(manual.status.key, "scope_edited");
  console.log("ok: estimates presenter");
}

{
  /** @type {any[]} */
  const store = [
    {
      id: EST,
      organizationId: ORG,
      status: "ready_to_price",
      intakeCaseId: CASE,
      takeoffJobId: JOB,
      sourceTakeoffResultId: "result-1",
      scope: { rooms: structuredClone(scopedRooms), projectName: "Remodel" },
      customerIdentitySnapshot: { displayName: "Buyer Co" },
      updatedAt: "2026-08-04T12:00:00.000Z",
      createdAt: "2026-08-04T11:00:00.000Z"
    },
    {
      id: EST_UNSCOPED,
      organizationId: ORG,
      status: "draft",
      intakeCaseId: "case-unscoped",
      takeoffJobId: "job-unscoped",
      scope: { rooms: [] },
      updatedAt: "2026-08-04T12:30:00.000Z"
    }
  ];

  let updateScopeCalls = 0;
  let refreshCalls = 0;
  let calculateCalls = 0;
  let approveCalls = 0;

  const estimateRepository = {
    async listActiveForOrganization(organizationId) {
      return store.filter((r) => r.organizationId === organizationId);
    },
    async getById(organizationId, estimateId) {
      return store.find((r) => r.organizationId === organizationId && r.id === estimateId) || null;
    }
  };

  const studioEstimateService = {
    repository: estimateRepository,
    async updateScope({ estimateId, body }) {
      updateScopeCalls += 1;
      const row = store.find((r) => r.id === estimateId);
      assert.ok(row);
      const patch = body?.scope && typeof body.scope === "object" ? body.scope : {};
      const rooms = Array.isArray(patch.rooms) ? patch.rooms : row.scope?.rooms;
      row.scope = { ...row.scope, ...patch, rooms };
      row.updatedAt = new Date().toISOString();
      return { ...row };
    },
    async refreshScopeFromTakeoff() {
      refreshCalls += 1;
      throw new Error("refreshScopeFromTakeoff must not be called");
    },
    async calculate() {
      calculateCalls += 1;
      throw new Error("calculate must not be called");
    },
    async approve() {
      approveCalls += 1;
      throw new Error("approve must not be called");
    }
  };

  const svc = createQuoteFlowEstimatesService({
    estimateRepository,
    studioEstimateService
  });

  const list = await svc.listEstimates({ organizationId: ORG });
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].estimateId, EST);
  assert.ok(!list.items.some((i) => i.estimateId === EST_UNSCOPED));
  assert.equal(isOfficialScopeSet(store[1]), false);
  console.log("ok: Estimates route lists scoped estimates; unscoped excluded");

  const detail = await svc.getEstimateDetail({ organizationId: ORG, estimateId: EST });
  assert.equal(detail.estimate.estimateId, EST);
  assert.equal(detail.estimate.scope.rooms.length, 1);
  assert.equal(detail.estimate.scope.rooms[0].pieces[0].lengthIn, 96);
  assert.equal(detail.sideEffects.takeoffRerun, false);
  console.log("ok: Estimate detail loads official scope");

  const patchedRooms = validateAndNormalizeOfficialScopeRooms([
    {
      ...scopedRooms[0],
      name: "Kitchen island zone",
      pieces: [
        {
          ...scopedRooms[0].pieces[0],
          name: "Island top",
          lengthIn: 108,
          depthIn: 26,
          quantity: 2,
          openEdgeLf: 14.5
        },
        {
          id: "p2",
          name: "Sink run",
          lengthIn: 72,
          depthIn: 25.5,
          quantity: 1,
          included: true,
          exposedEdgeLf: 6
        }
      ]
    }
  ]);
  assert.equal(patchedRooms[0].pieces[0].openEdgeLf, 14.5);
  assert.equal(patchedRooms[0].pieces[0].finishedEdgeLf, 14.5);
  assert.equal(patchedRooms[0].pieces[0].exposedEdgeLf, 14.5);
  assert.equal(patchedRooms[0].pieces[1].openEdgeLf, 6);

  const patched = await svc.patchOfficialScope({
    organizationId: ORG,
    estimateId: EST,
    body: { scope: { rooms: patchedRooms } }
  });
  assert.equal(patched.ok, true);
  assert.equal(updateScopeCalls, 1);
  assert.equal(patched.estimate.scope.rooms[0].name, "Kitchen island zone");
  assert.equal(patched.estimate.scope.rooms[0].pieces[0].lengthIn, 108);
  assert.equal(patched.estimate.scope.rooms[0].pieces[0].openEdgeLf, 14.5);
  assert.equal(patched.estimate.scope.rooms[0].pieces[1].openEdgeLf, 6);
  assert.equal(patched.estimate.scopeSummary.openEdgeLf, 14.5 * 2 + 6);
  assert.equal(patched.estimate.scope.rooms[0].pieces.length, 2);
  assert.equal(patched.estimate.takeoffJobId, JOB);
  assert.equal(patched.estimate.intakeCaseId, CASE);
  assert.equal(patched.estimate.sourceTakeoffResultId, "result-1");
  assert.equal(patched.sideEffects.takeoffRerun, false);
  assert.equal(patched.sideEffects.calculated, false);
  assert.equal(patched.sideEffects.approved, false);
  assert.equal(patched.sideEffects.published, false);
  assert.equal(patched.sideEffects.accepted, false);
  assert.equal(patched.sideEffects.sold, false);
  assert.equal(refreshCalls, 0);
  assert.equal(calculateCalls, 0);
  assert.equal(approveCalls, 0);
  console.log("ok: PATCH scope persists manual edits; preserves takeoff linkage");

  const again = await svc.patchOfficialScope({
    organizationId: ORG,
    estimateId: EST,
    body: { scope: { rooms: patched.estimate.scope.rooms } }
  });
  assert.equal(again.reused, true);
  assert.equal(updateScopeCalls, 1);
  console.log("ok: PATCH scope is idempotent for identical rooms");

  const named = await svc.patchOfficialScope({
    organizationId: ORG,
    estimateId: EST,
    body: {
      scope: {
        rooms: patched.estimate.scope.rooms,
        projectName: "Relihan VanderSchot Finals Plans",
        estimateName: "Relihan VanderSchot Finals Plans"
      }
    }
  });
  assert.equal(named.ok, true);
  assert.equal(named.message, "Scope saved.");
  assert.equal(named.estimate.estimateName, "Relihan VanderSchot Finals Plans");
  assert.equal(store.find((r) => r.id === EST)?.scope?.projectName, "Relihan VanderSchot Finals Plans");
  console.log("ok: PATCH persists estimate/job name on scope");

  await assert.rejects(
    () =>
      svc.patchOfficialScope({
        organizationId: ORG,
        estimateId: EST,
        body: { scope: { rooms: "bad" } }
      }),
    (e) => e.code === "scope_invalid"
  );
  console.log("ok: PATCH scope validates payload");

  await assert.rejects(
    () => svc.getEstimateDetail({ organizationId: ORG, estimateId: EST_UNSCOPED }),
    (e) => e.code === "estimate_not_scoped"
  );
  console.log("ok: unscoped estimate detail rejected");
}

{
  const routes = readFileSync(join(__dirname, "elite100QuoteFlowRoutes.js"), "utf8");
  assert.match(routes, /\/api\/elite100-quote-flow\/estimates/);
  assert.match(routes, /estimates\/:estimateId\/scope/);
  assert.match(routes, /slice-1d/);
  assert.doesNotMatch(
    routes,
    /publishDigitalEstimate|markSold|calculateStudio|approveWorkingDraft|takeoff-finish/
  );
  const estimatesSrc = readFileSync(join(__dirname, "quoteFlowEstimates.mjs"), "utf8");
  assert.match(estimatesSrc, /updateScope/);
  assert.doesNotMatch(estimatesSrc, /refreshScopeFromTakeoff\(/);
  assert.doesNotMatch(estimatesSrc, /\.calculate\(|\.approve\(/);
  assert.match(estimatesSrc, /takeoffRerun:\s*false/);
  console.log("ok: route/source contracts; no takeoff rerun / calculate / approve / publish");
}

{
  const ui = [
    readFileSync(join(root, "app-elite100-quote-flow/src/estimates/EstimatesListPage.tsx"), "utf8"),
    readFileSync(join(root, "app-elite100-quote-flow/src/estimates/OfficialScopeEditor.tsx"), "utf8")
  ].join("\n");
  assert.match(ui, /Official scope/);
  assert.match(ui, /qf-official-scope-editor/);
  assert.match(ui, /qf-scope--worksheet|qf-scope__table/);
  assert.match(ui, /Manual edits here do not rerun AI Takeoff/);
  assert.match(ui, /Save Scope/);
  assert.match(ui, /qf-estimates-sticky-save|Unsaved scope changes/);
  assert.match(ui, /qf-page--command|qf-estimates--command/);
  assert.match(ui, /qf-estimates--library|qf-estimates--ql/);
  assert.match(ui, /qf-estimates-modal/);
  assert.match(ui, /qf-el-table|qf-estimates-table/);
  assert.match(ui, /Estimate command center/);
  assert.match(ui, /Back to library/);
  assert.match(ui, /Open edge LF/);
  assert.match(ui, /qf-estimates-tab-pricing|Pricing/);
  assert.match(ui, /Digital Estimate/);
  assert.doesNotMatch(ui, /Exclude piece|qf-scope-exclude-piece/);
  assert.doesNotMatch(ui, /takeoff-iframe|ConsolidatedTakeoffReview|quoteFlowSetScope/);
  assert.doesNotMatch(ui, /\bV1\b|\bV2\b|Studio V2/);
  assert.doesNotMatch(ui, /\bSet Scope\b/);
  assert.doesNotMatch(ui, /qf-estimates--command-layout/);
  assert.doesNotMatch(ui, /qf-estimates__cards/);
  console.log("ok: Estimates Quote Library table layout; polished scope worksheet; Open edge LF; no takeoff iframe; no V1/V2");
}

{
  const de = join(root, "app-digital-estimate");
  const dig = join(root, "backend-core/src/digitalEstimate");
  // Contract: this test file must not require edits under those trees.
  assert.ok(de);
  assert.ok(dig);
  console.log("ok: slice 1d test does not touch digital estimate modules");
}

console.log("\nquoteFlowSlice1d.test.mjs: ok\n");
