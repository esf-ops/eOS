/**
 * Active-revision mutation guard (AUDIT-002).
 * Run: node backend-core/src/elite100EstimateStudio/studioEstimateActiveRevisionGuard.test.mjs
 */
import assert from "node:assert/strict";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { createStudioManualEstimateService } from "./studioManualEstimateService.mjs";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { MANUAL_ESTIMATE_ORIGIN } from "./studioManualPhysicalScope.mjs";
import {
  loadActiveEstimateForMutation,
  createEstimateRevisionSupersededError
} from "./studioEstimateActiveRevisionGuard.mjs";

const ORG = "org-guard-0000-4000-8000-000000000001";
const ACTOR = "actor-guard-0000-4000-8000-000000000099";

console.log("\nstudioEstimateActiveRevisionGuard.test.mjs\n");

{
  const err = createEstimateRevisionSupersededError({
    requestedEstimateId: "est-old",
    activeEstimateId: "est-new"
  });
  assert.equal(err.statusCode, 409);
  assert.equal(err.code, "estimate_revision_superseded");
  assert.equal(err.activeEstimateId, "est-new");
  assert.equal(err.requestedEstimateId, "est-old");
  console.log("  ✓ 409 error shape");
}

{
  const estimates = new InMemoryStudioEstimateRepository();
  const intake = new InMemoryQuoteIntakeRepository();
  const studio = createStudioEstimateService({
    repository: estimates,
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    loadTakeoffWorkspace: async () => null,
    loadLatestTakeoffResult: async () => null,
    calculateStudioEstimateImpl: async () => ({
      fingerprint: "fp-guard",
      pricingEngine: "sentinel",
      pricingVersion: 1,
      totals: { exactInternalTotal: 100, customerDisplayTotal: 120 },
      fabrication: { edge: { finalLf: 1 } },
      scopeFingerprint: "s"
    })
  });
  const manual = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: estimates,
    studioEstimateService: studio
  });

  const rooms = [
    {
      id: "room-1",
      name: "Kitchen",
      roomType: "Kitchen",
      openEdgeMeasurementMode: "room_total",
      openEdgeLf: 10,
      pieces: [
        {
          id: "p1",
          name: "Run",
          pieceType: "counter",
          measurementMode: "dimensions",
          lengthIn: 96,
          depthIn: 25.5
        }
      ]
    }
  ];

  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "guard-1",
    body: { projectName: "Guard Kitchen", customerName: "Guard Co" }
  });
  const est1 = created.estimateId;
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: est1,
    actorUserId: ACTOR,
    body: { scope: { rooms, addOns: {} } }
  });
  await manual.confirmManualScope({
    organizationId: ORG,
    estimateId: est1,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  await studio.calculate({ organizationId: ORG, estimateId: est1, actorUserId: ACTOR, body: {} });
  await studio.approve({
    organizationId: ORG,
    estimateId: est1,
    actorUserId: ACTOR,
    body: { confirm: true }
  });

  // Active mutation still works
  const meta = await studio.updateProjectDetails({
    organizationId: ORG,
    estimateId: est1,
    actorUserId: ACTOR,
    body: { projectName: "Guard Kitchen 2" }
  });
  assert.equal(meta.estimate.scope.projectName, "Guard Kitchen 2");

  // Price-affecting revise via createRevisionFrom
  const rev2 = await estimates.createRevisionFrom(
    ORG,
    est1,
    {
      status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
      scope: {
        estimateOrigin: MANUAL_ESTIMATE_ORIGIN,
        physicalScopeSource: MANUAL_ESTIMATE_ORIGIN,
        manualScopeConfirmed: true,
        projectName: "Guard Kitchen 2",
        rooms,
        materialSku: "SKU-B"
      },
      staleReason: "changed"
    },
    ACTOR
  );
  assert.notEqual(rev2.id, est1);
  const superseded = await estimates.getById(ORG, est1);
  assert.equal(superseded.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);
  const scopeBefore = structuredClone(superseded.scope);

  // Stale mutations rejected
  for (const [label, fn] of [
    [
      "manual-scope",
      () =>
        manual.saveManualScopeDraft({
          organizationId: ORG,
          estimateId: est1,
          actorUserId: ACTOR,
          body: { scope: { rooms, addOns: { "qty-sink": 9 } } }
        })
    ],
    [
      "confirm",
      () =>
        manual.confirmManualScope({
          organizationId: ORG,
          estimateId: est1,
          actorUserId: ACTOR,
          body: { confirm: true }
        })
    ],
    [
      "calculate",
      () => studio.calculate({ organizationId: ORG, estimateId: est1, actorUserId: ACTOR, body: {} })
    ],
    [
      "approve",
      () =>
        studio.approve({
          organizationId: ORG,
          estimateId: est1,
          actorUserId: ACTOR,
          body: { confirm: true }
        })
    ],
    [
      "project-details",
      () =>
        studio.updateProjectDetails({
          organizationId: ORG,
          estimateId: est1,
          actorUserId: ACTOR,
          body: { projectName: "Should Not Apply" }
        })
    ]
  ]) {
    let threw = false;
    try {
      await fn();
    } catch (e) {
      threw = true;
      assert.equal(e.code, "estimate_revision_superseded", label);
      assert.equal(e.statusCode, 409, label);
      assert.equal(e.activeEstimateId, rev2.id, label);
      assert.equal(e.requestedEstimateId, est1, label);
    }
    assert.ok(threw, `${label} must throw`);
  }

  // updateScope on a frozen/superseded revision does not throw: the estimator
  // keeps typing and the write transparently lands on a new editable draft.
  // The frozen row itself must still be untouched (persistent workspace, §5).
  const forked = await studio.updateScope({
    organizationId: ORG,
    estimateId: est1,
    actorUserId: ACTOR,
    body: { scope: { materialSku: "HACK" } }
  });
  assert.notEqual(forked.id, est1, "frozen revision is never the write target");
  assert.equal(forked.id, rev2.id, "acquisition reuses the existing editable sibling draft");
  assert.equal(forked.scope.materialSku, "HACK", "the edit lands on the editable draft");

  const after = await estimates.getById(ORG, est1);
  assert.deepEqual(after.scope, scopeBefore, "superseded row unchanged");
  const active = await estimates.getById(ORG, rev2.id);
  assert.equal(active.scope.materialSku, "HACK", "active revision received the edit");
  // project-details still 409s on a superseded row — no auto-fork there.
  assert.notEqual(active.scope.projectName, "Should Not Apply");

  // Active revision still mutable
  await studio.updateProjectDetails({
    organizationId: ORG,
    estimateId: rev2.id,
    actorUserId: ACTOR,
    body: { projectName: "Active OK" }
  });
  const activeAfter = await estimates.getById(ORG, rev2.id);
  assert.equal(activeAfter.scope.projectName, "Active OK");

  // Org isolation: cannot discover other org active id via guard
  const other = new InMemoryStudioEstimateRepository();
  await other.create({
    id: "other-est",
    organizationId: "org-other",
    intakeCaseId: "case-other",
    status: STUDIO_ESTIMATE_STATUSES.SUPERSEDED,
    revision: 1,
    scope: { projectName: "X" }
  });
  let isoThrew = false;
  try {
    await loadActiveEstimateForMutation({
      repository: other,
      organizationId: ORG,
      estimateId: "other-est"
    });
  } catch (e) {
    isoThrew = true;
    assert.equal(e.statusCode, 404);
  }
  assert.ok(isoThrew);

  console.log("  ✓ superseded mutations 409; active ok; row unchanged; org isolation");
}

console.log("\nstudioEstimateActiveRevisionGuard.test.mjs — all passed\n");
