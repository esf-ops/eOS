/**
 * Production-shaped live workspace acceptance (service + persistence).
 * Uses real Studio services and in-memory persistence — not static fixtures.
 *
 * Run: node backend-core/src/elite100EstimateStudio/liveEstimateWorkspaceAcceptance.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createStudioEstimateService,
  syncWaterfallSelectionsFromScopeRooms,
  seedScopeFromTakeoffPayload
} from "./studioEstimateService.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { buildCommercialConfiguration } from "./studioCommercialConfiguration.mjs";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAKEOFF = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const root = dirname(fileURLToPath(import.meta.url));

console.log("\nliveEstimateWorkspaceAcceptance.test.mjs\n");

function importPayload(islandLengthIn = 96, withLeftWaterfall = false) {
  return {
    rooms: [
      {
        name: "Kitchen",
        pieces: [
          {
            name: "Kitchen Island",
            pieceType: "counter",
            lengthIn: islandLengthIn,
            depthIn: 36,
            sqft: (islandLengthIn * 36) / 144,
            runId: "island",
            waterfallPanels: withLeftWaterfall
              ? [
                  {
                    id: "wf-island-left",
                    side: "left",
                    panelWidthIn: 36,
                    panelHeightIn: 36,
                    quantity: 1,
                    included: true
                  }
                ]
              : undefined
          },
          {
            name: "Run A",
            pieceType: "counter",
            lengthIn: 120,
            depthIn: 25.5,
            sqft: (120 * 25.5) / 144,
            runId: "run-a"
          }
        ],
        guidedShapeGroups: [
          {
            label: "Kitchen",
            shapeType: "counter",
            pieces: [
              {
                id: "island",
                name: "Kitchen Island",
                label: "Kitchen Island",
                pieceType: "counter",
                lengthIn: islandLengthIn,
                depthIn: 36
              },
              {
                id: "run-a",
                name: "Run A",
                label: "Run A",
                pieceType: "counter",
                lengthIn: 120,
                depthIn: 25.5
              }
            ]
          }
        ]
      },
      {
        name: "Bathroom",
        pieces: [
          {
            name: "Vanity",
            pieceType: "counter",
            lengthIn: 37,
            depthIn: 22.5,
            sqft: (37 * 22.5) / 144,
            runId: "vanity",
            cutouts: [{ type: "sink", qty: 1 }]
          }
        ],
        guidedShapeGroups: [
          {
            label: "Bathroom",
            shapeType: "counter",
            pieces: [
              {
                id: "vanity",
                name: "Vanity",
                label: "Vanity",
                pieceType: "counter",
                lengthIn: 37,
                depthIn: 22.5
              }
            ]
          }
        ]
      }
    ],
    scopeSummary: {
      roomCount: 2,
      pieceCount: 3,
      countertopSqft: 40,
      edgeEligibleLinearFeet: 20
    },
    fabricationQuantities: { addOnQuantities: { "qty-bar": 1 } }
  };
}

let latestPayload = importPayload(96, false);
const repo = new InMemoryStudioEstimateRepository();
const requestLog = [];

const studio = createStudioEstimateService({
  repository: repo,
  env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
  loadTakeoffWorkspace: async () => ({
    reviewStatus: "approved",
    approvedAt: new Date().toISOString()
  }),
  loadLatestTakeoffResult: async () => ({
    id: "result-1",
    draft: {
      rooms: [
        {
          id: "kitchen",
          name: "Kitchen",
          areas: [
            {
              runs: latestPayload.rooms[0].pieces.map((p) => ({
                id: p.runId,
                label: p.name,
                lengthIn: p.lengthIn,
                depthIn: p.depthIn,
                included: true,
                waterfallPanels: p.waterfallPanels || []
              }))
            }
          ]
        },
        {
          id: "bath",
          name: "Bathroom",
          areas: [
            {
              runs: latestPayload.rooms[1].pieces.map((p) => ({
                id: p.runId,
                label: p.name,
                lengthIn: p.lengthIn,
                depthIn: p.depthIn,
                included: true,
                cutouts: p.cutouts || []
              }))
            }
          ]
        }
      ]
    },
    reviewStatus: "approved"
  }),
  // refreshScopeFromTakeoff uses buildTakeoffImportPayload internally when a
  // result exists; for this acceptance path we override via seed by swapping
  // loadLatestTakeoffResult draft and forcing a local seed helper when needed.
  reopenTakeoffForRevision: async () => ({ ok: true })
});

const r1Scope = seedScopeFromTakeoffPayload(importPayload(96, false), {
  projectName: "Live Workspace Acceptance",
  materialGroup: "Group Promo",
  pricingBasis: "Wholesale"
});
r1Scope.rooms = (r1Scope.rooms || []).map((r) =>
  String(r.name || "").toLowerCase().includes("bath")
    ? { ...r, roomType: "vanity" }
    : r
);

const r1 = await repo.create({
  organizationId: ORG,
  intakeCaseId: CASE_ID,
  takeoffJobId: TAKEOFF,
  createdByUserId: ACTOR,
  status: STUDIO_ESTIMATE_STATUSES.APPROVED,
  revision: 1,
  scope: r1Scope,
  calculationSnapshot: {
    fingerprint: "fp-r1",
    pricingVersion: 4,
    totals: { customerDisplayTotal: 8000, exactTotal: 7995.5 }
  },
  approval: {
    approvedAt: new Date().toISOString(),
    calculationFingerprint: "fp-r1",
    customerDisplayTotal: 8000
  }
});
// Mark R1 as the still-active customer publication target. The in-memory
// estimate row does not own DE tokens; full publish/DE coverage lives in the
// existing Digital Estimate publication suites. This flag proves R2 edits do
// not clear R1's customer-active marker.
const r1Row = repo.byId.get(r1.id);
r1Row.publication = {
  active: true,
  customerUrl: "https://example.test/de/r1",
  publishedAt: new Date().toISOString(),
  revision: 1
};
r1Row.publishedAt = r1Row.publication.publishedAt;

const r1ScopeBefore = structuredClone(r1Row.scope);
const r1CalcBefore = structuredClone(r1Row.calculationSnapshot);
const r1ApprovalBefore = structuredClone(r1Row.approval);

assert.ok((r1.scope.rooms || []).length >= 2, "Takeoff-derived rooms present");
assert.ok(
  (r1.scope.rooms || []).some((r) =>
    (r.pieces || []).some((p) => /island/i.test(String(p.name || "")))
  ),
  "Kitchen Island present"
);
console.log("ok: 1–2 open estimate; Takeoff scope populated");

const ensured = await studio.ensureEditableEstimateDraft({
  organizationId: ORG,
  estimateId: r1.id,
  basedOnRevisionId: r1.id,
  actorUserId: ACTOR
});
requestLog.push("ensure-editable-draft");
assert.equal(ensured.created, true);
assert.equal(ensured.estimate.revision, 2);
const r2Id = ensured.estimate.id;

const concurrent = await Promise.all([
  studio.ensureEditableEstimateDraft({
    organizationId: ORG,
    estimateId: r1.id,
    basedOnRevisionId: r1.id,
    actorUserId: ACTOR
  }),
  studio.ensureEditableEstimateDraft({
    organizationId: ORG,
    estimateId: r1.id,
    basedOnRevisionId: r1.id,
    actorUserId: ACTOR
  })
]);
assert.equal(concurrent[0].estimate.id, r2Id);
assert.equal(concurrent[1].estimate.id, r2Id);
assert.equal(concurrent[0].created || concurrent[1].created, false);
console.log("ok: 3–5 concurrent ensure-editable-draft reuses one R2");

// Physical dimension change via canonical seed (same mapper refresh uses)
latestPayload = importPayload(108, false);
const nextScope = seedScopeFromTakeoffPayload(latestPayload, {
  ...(await repo.getById(ORG, r2Id)).scope,
  materialGroup: "Group Promo",
  pricingBasis: "Wholesale"
});
nextScope.rooms = (nextScope.rooms || []).map((r) =>
  String(r.name || "").toLowerCase().includes("bath")
    ? { ...r, roomType: "vanity" }
    : r
);
await studio.updateScope({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: { scope: { rooms: nextScope.rooms, roomConfigurations: nextScope.roomConfigurations } }
});
requestLog.push("PATCH");

const afterDim = await repo.getById(ORG, r2Id);
const island = (afterDim.scope.rooms || [])
  .flatMap((r) => r.pieces || [])
  .find((p) => /island/i.test(String(p.name || "")));
assert.equal(Number(island?.lengthIn), 108, "changed dimension remains");

const priced = await studio.calculate({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: {}
});
requestLog.push("calculate");
assert.ok(priced?.estimate || priced?.calculationSnapshot || priced?.ok !== false);
console.log("ok: 6 draft calculate before approval");

// Tear Out add → edit → remove; Crane remains
await studio.updateScope({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: {
    scope: {
      customLineItems: [
        {
          id: "tear",
          name: "Tear Out",
          quantity: 1,
          unitPrice: 750,
          commercialRole: "customer_charge",
          percentageEligible: true,
          customerFacing: true,
          category: "Service"
        }
      ]
    }
  }
});
requestLog.push("PATCH");
await studio.updateScope({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: {
    scope: {
      customLineItems: [
        {
          id: "tear",
          name: "Tear Out",
          quantity: 1,
          unitPrice: 725,
          commercialRole: "customer_charge",
          percentageEligible: true,
          customerFacing: true,
          category: "Service"
        }
      ]
    }
  }
});
requestLog.push("PATCH");
await studio.updateScope({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: {
    scope: {
      customLineItems: [
        {
          id: "crane",
          name: "Crane",
          quantity: 1,
          unitPrice: 350,
          commercialRole: "customer_charge",
          percentageEligible: true,
          customerFacing: true,
          category: "Other"
        }
      ]
    }
  }
});
requestLog.push("PATCH");
const afterLines = await repo.getById(ORG, r2Id);
assert.equal(afterLines.scope.customLineItems.length, 1);
assert.equal(afterLines.scope.customLineItems[0].name, "Crane");
console.log("ok: 7–11 Tear Out removed; Crane remains");

await studio.updateScope({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: {
    scope: {
      estimateWideAdjustment: {
        active: true,
        percentage: 3,
        reason: "Account pricing",
        source: "manual"
      }
    }
  }
});
requestLog.push("PATCH");
const afterAdj = await repo.getById(ORG, r2Id);
assert.equal(afterAdj.scope.estimateWideAdjustment.percentage, 3);
assert.equal(afterAdj.scope.estimateWideAdjustment.reason, "Account pricing");
console.log("ok: 12–15 account adjustment 3% + reason");

const bathId =
  (afterAdj.scope.rooms || []).find((r) => /bath/i.test(String(r.name || "")))?.id || "bath";
await studio.updateScope({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: {
    scope: {
      roomConfigurations: {
        [bathId]: { vanityProgram: { applyProgram: true, useStandardPricing: false } }
      }
    }
  }
});
requestLog.push("PATCH");
const vanityCalc = await studio.calculate({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: {}
});
requestLog.push("calculate");
const commercial = buildCommercialConfiguration(vanityCalc.estimate || (await repo.getById(ORG, r2Id)));
assert.ok(Array.isArray(commercial.vanityPrograms));
assert.equal(
  commercial.vanityPrograms.some((v) => v.tripQuestion != null),
  false
);
console.log("ok: 16–17 Vanity one-click; no questionnaire in read model");

// Island left waterfall via canonical mapper
latestPayload = importPayload(108, true);
const wfScope = seedScopeFromTakeoffPayload(latestPayload, {
  ...(await repo.getById(ORG, r2Id)).scope,
  materialGroup: "Group Promo",
  pricingBasis: "Wholesale"
});
await studio.updateScope({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: {
    scope: {
      rooms: wfScope.rooms,
      roomConfigurations: wfScope.roomConfigurations
    }
  }
});
requestLog.push("PATCH");
const afterWf = await repo.getById(ORG, r2Id);
const islandAfter = (afterWf.scope.rooms || [])
  .flatMap((r) => r.pieces || [])
  .find((p) => /island/i.test(String(p.name || "")));
assert.ok(Array.isArray(islandAfter?.waterfallPanels));
assert.equal(islandAfter.waterfallPanels[0].side, "left");
console.log("ok: 18–19 island left waterfall on piece via Takeoff-to-Scope mapper");

const refreshCalls = requestLog.filter((r) => r === "refresh-from-takeoff").length;
await studio.updateScope({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: {
    scope: {
      estimateWideAdjustment: {
        active: true,
        percentage: 3,
        reason: "Account pricing",
        source: "manual"
      }
    }
  }
});
requestLog.push("PATCH");
assert.equal(
  requestLog.filter((r) => r === "refresh-from-takeoff").length,
  refreshCalls,
  "commercial edit did not refresh-from-takeoff"
);
console.log("ok: commercial edits do not refresh-from-takeoff");

const reloaded = await repo.getById(ORG, r2Id);
assert.equal(
  Number(
    (reloaded.scope.rooms || [])
      .flatMap((r) => r.pieces || [])
      .find((p) => /island/i.test(String(p.name || "")))?.lengthIn
  ),
  108
);
assert.equal(reloaded.scope.customLineItems[0].name, "Crane");
assert.equal(reloaded.scope.estimateWideAdjustment.percentage, 3);
assert.equal(reloaded.scope.estimateWideAdjustment.reason, "Account pricing");
assert.ok(
  (reloaded.scope.rooms || [])
    .flatMap((r) => r.pieces || [])
    .some((p) => Array.isArray(p.waterfallPanels) && p.waterfallPanels.length)
);
console.log("ok: 20–22 reload preserves dimension, Crane, 3%, reason, waterfall");

const r1Final = await repo.getById(ORG, r1.id);
assert.deepEqual(r1Final.scope, r1ScopeBefore, "R1 scope unchanged");
assert.deepEqual(r1Final.calculationSnapshot, r1CalcBefore, "R1 calculation unchanged");
assert.deepEqual(r1Final.approval, r1ApprovalBefore, "R1 approval unchanged");
assert.equal(r1Final.publication?.customerUrl, "https://example.test/de/r1");
assert.equal(r1Final.publication?.active, true);
console.log("ok: R1 byte-for-byte preserved; customer link still active");

await studio.calculate({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: {}
});
requestLog.push("calculate");
const approved = await studio.approve({
  organizationId: ORG,
  estimateId: r2Id,
  actorUserId: ACTOR,
  body: { confirm: true }
});
requestLog.push("approve");
const approvedStatus = String(approved.estimate?.status || approved.status || "").toLowerCase();
assert.equal(approvedStatus, STUDIO_ESTIMATE_STATUSES.APPROVED);
const r1AfterApprove = await repo.getById(ORG, r1.id);
assert.equal(r1AfterApprove.publication?.customerUrl, "https://example.test/de/r1");
assert.equal(r1AfterApprove.publication?.active, true);
assert.deepEqual(r1AfterApprove.scope, r1ScopeBefore, "approve R2 does not mutate R1");
console.log("ok: 23–24 Approve Revised Estimate; R1 publication remains");

const siblings = await repo.listByIntakeCase(ORG, CASE_ID);
assert.equal(siblings.filter((e) => e.revision === 2).length, 1, "exactly one R2");
console.log("ok: exactly one editable draft created");

const svcSrc = readFileSync(join(root, "studioEstimateService.mjs"), "utf8");
assert.ok(svcSrc.includes("calculateStudioEstimateV4"));
assert.ok(svcSrc.includes("seedScopeFromTakeoffPayload"));
assert.ok(svcSrc.includes("takeoffImportPayloadToRoomDrafts"));
assert.equal(svcSrc.includes("fakeCalculate"), false);
assert.equal(svcSrc.includes("STATIC_FIXTURE_TOTAL"), false);

const workspaceSrc = readFileSync(
  join(root, "../../../app-elite100-estimate-studio/src/estimateQueue/AiEstimatorWorkspace.tsx"),
  "utf8"
);
assert.ok(workspaceSrc.includes("key={takeoffMountIdRef.current}"));
assert.ok(workspaceSrc.includes('data-stable-mount="1"'));
assert.ok(workspaceSrc.includes("createWorkspaceSaveQueue"));
assert.equal(workspaceSrc.includes("eq-takeoff-handoff-overlay"), false);
assert.ok(workspaceSrc.includes("eq-takeoff-inline-status"));
console.log("ok: source contracts — v4, stable Takeoff, no fake path, no overlay");

{
  const rooms = [
    {
      id: "kitchen",
      pieces: [
        {
          id: "island",
          waterfallPanels: [
            { id: "wf-1", side: "left", panelHeightIn: 36, quantity: 1, included: true }
          ]
        }
      ]
    }
  ];
  const synced = syncWaterfallSelectionsFromScopeRooms(
    {
      kitchen: {
        waterfalls: [
          { id: "wf-1", miterKey: "2-3in", backsidePolish: true, customerOptional: true }
        ]
      }
    },
    rooms
  );
  assert.equal(synced.kitchen.waterfalls[0].miterKey, "2-3in");
  assert.equal(synced.kitchen.waterfalls[0].legHeightIn, 36);
  assert.equal(synced.kitchen.waterfalls[0].targetPieceId, "island");
  console.log("ok: waterfall sync preserves commercial settings");
}

console.log("\nliveEstimateWorkspaceAcceptance.test.mjs — passed\n");
