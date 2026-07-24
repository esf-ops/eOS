/**
 * Manual Studio estimate creation — service + safety tests (sentinel data only).
 * Run: node backend-core/src/elite100EstimateStudio/studioManualEstimate.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioManualEstimateService } from "./studioManualEstimateService.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import {
  MANUAL_ESTIMATE_ORIGIN,
  applyNormalizedManualRooms,
  buildInitialManualScope,
  isConfirmedManualPhysicalScope,
  normalizeManualRooms,
  stripClientManualAuthority,
  validateManualScopeForConfirm
} from "./studioManualPhysicalScope.mjs";
import { deriveQueueWorkflowStatus, deriveQueueOpenTarget } from "./studioEstimateQueueWorkflow.mjs";
import { nextActionFromRow } from "./studioCommandCenterViewModel.mjs";
import { assessStudioEstimatePublicationReadiness } from "./studioEstimatePublicationAdapter.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function kitchenDraft() {
  return {
    rooms: [
      {
        id: "room-kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        included: true,
        pieces: [
          {
            id: "p1",
            name: "Run A",
            pieceType: "counter",
            measurementMode: "dimensions",
            lengthIn: 96,
            depthIn: 25.5,
            finishedEdge: {
              frontEdgeLengthIn: 96,
              leftExposedEdgeLengthIn: 0,
              rightExposedEdgeLengthIn: 0,
              otherExposedEdgeLengthIn: 0,
              totalFinishedEdgeLengthIn: 96,
              approved: true
            }
          },
          {
            id: "p2",
            name: "Run B",
            pieceType: "counter",
            measurementMode: "dimensions",
            lengthIn: 48,
            depthIn: 25.5,
            finishedEdge: {
              frontEdgeLengthIn: 48,
              totalFinishedEdgeLengthIn: 48,
              approved: true
            }
          }
        ]
      },
      {
        id: "room-bath",
        name: "Bathroom",
        roomType: "Vanity",
        included: true,
        pieces: [
          {
            id: "p3",
            name: "Vanity top",
            pieceType: "vanity_top",
            measurementMode: "dimensions",
            lengthIn: 60,
            depthIn: 22
          }
        ]
      }
    ],
    addOns: { "qty-sink": 1, "qty-outlet": 2 }
  };
}

console.log("\nstudioManualEstimate.test.mjs\n");

// Physical scope normalize / authority strip
{
  const stripped = stripClientManualAuthority({
    rooms: [],
    manualScopeConfirmed: true,
    estimateOrigin: "email_ai_takeoff",
    physicalScopeSource: "takeoff",
    projectName: "Keep me"
  });
  assert.equal(stripped.manualScopeConfirmed, undefined);
  assert.equal(stripped.estimateOrigin, undefined);
  assert.equal(stripped.projectName, "Keep me");

  const rooms = normalizeManualRooms(kitchenDraft().rooms);
  assert.equal(rooms.length, 2);
  assert.equal(rooms[0].id, "room-kitchen");
  assert.ok(rooms[0].pieces[0].sqft > 0);
  assert.equal(rooms[1].pieces[0].pricingLabel, "Vanity top (standard countertop pricing)");
  assert.equal(rooms[0].pieces[0].source, MANUAL_ESTIMATE_ORIGIN);

  // Dimensions vs direct area mutual exclusivity in normalize
  const direct = normalizeManualRooms([
    {
      id: "r1",
      name: "Kitchen",
      pieces: [
        {
          id: "d1",
          name: "Top",
          measurementMode: "direct_area",
          sqft: 40,
          lengthIn: 100,
          depthIn: 25
        }
      ]
    }
  ]);
  assert.equal(direct[0].pieces[0].measurementMode, "direct_area");
  assert.equal(direct[0].pieces[0].sqft, 40);
  assert.equal(direct[0].pieces[0].directAreaOverride, true);

  const initial = buildInitialManualScope({ projectName: "Sentinel Project" });
  assert.equal(initial.estimateOrigin, MANUAL_ESTIMATE_ORIGIN);
  assert.equal(initial.manualScopeConfirmed, false);
  assert.equal(validateManualScopeForConfirm(initial).length > 0, true);
  console.log("ok: normalize / strip client authority / vanity label / measurement modes");
}

{
  const intake = new InMemoryQuoteIntakeRepository();
  const estimates = new InMemoryStudioEstimateRepository();
  const svc = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: estimates
  });

  const created = await svc.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "idem-sentinel-1",
    body: {
      projectName: "Sentinel Kitchen",
      customerName: "Acme Cabinets",
      // Browser attempt to forge confirmation — ignored on create
      manualScopeConfirmed: true,
      estimateOrigin: "email_ai_takeoff"
    }
  });
  assert.ok(created.intakeCaseId);
  assert.ok(created.estimateId);
  assert.equal(created.estimateOrigin, MANUAL_ESTIMATE_ORIGIN);
  assert.equal(created.openTarget, "manual-scope");

  const caseRow = intake.getCase(ORG, created.intakeCaseId);
  assert.equal(caseRow.sourceType, "manual");
  assert.equal((caseRow.attachments || []).length, 0);
  assert.equal(caseRow.sourceMessage?.internetMessageId ?? null, null);
  assert.ok(caseRow.sourceMessage?.contentHash);

  const est = await estimates.getById(ORG, created.estimateId);
  assert.equal(est.intakeCaseId, created.intakeCaseId);
  assert.equal(est.takeoffJobId, null);
  assert.equal(est.status, STUDIO_ESTIMATE_STATUSES.DRAFT);
  assert.equal(est.scope.estimateOrigin, MANUAL_ESTIMATE_ORIGIN);
  assert.equal(est.scope.manualScopeConfirmed, false);
  assert.equal(est.scope.physicalScopeSource, MANUAL_ESTIMATE_ORIGIN);
  assert.ok(est.scope.manualCreateRequestFingerprint);

  // Same key + same request → same estimate (retry)
  const again = await svc.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "idem-sentinel-1",
    body: {
      projectName: "Sentinel Kitchen",
      customerName: "Acme Cabinets"
    }
  });
  assert.equal(again.intakeCaseId, created.intakeCaseId);
  assert.equal(again.estimateId, created.estimateId);
  const allCases = intake.listCases(ORG, { limit: 50 });
  const manualCases = allCases.filter((c) => c.sourceType === "manual");
  assert.equal(manualCases.length, 1);

  // Same key + conflicting payload → clean conflict
  let conflicted = false;
  try {
    await svc.createManualEstimate({
      organizationId: ORG,
      actorUserId: ACTOR,
      idempotencyKey: "idem-sentinel-1",
      body: { projectName: "Different Project", customerName: "Acme Cabinets" }
    });
  } catch (e) {
    conflicted = e.code === "idempotency_payload_conflict" && e.statusCode === 409;
  }
  assert.equal(conflicted, true);

  // Different key + identical payload → two legitimate estimates
  const second = await svc.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "idem-sentinel-2-distinct",
    body: {
      projectName: "Sentinel Kitchen",
      customerName: "Acme Cabinets"
    }
  });
  assert.notEqual(second.intakeCaseId, created.intakeCaseId);
  assert.notEqual(second.estimateId, created.estimateId);
  assert.equal(intake.listCases(ORG, { limit: 50 }).filter((c) => c.sourceType === "manual").length, 2);

  // Cross-org: same key does not collide
  const ORG_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const otherOrg = await svc.createManualEstimate({
    organizationId: ORG_B,
    actorUserId: ACTOR,
    idempotencyKey: "idem-sentinel-1",
    body: {
      projectName: "Sentinel Kitchen",
      customerName: "Acme Cabinets"
    }
  });
  assert.notEqual(otherOrg.intakeCaseId, created.intakeCaseId);
  console.log("ok: 1–10 create + idempotency key/retry/conflict/distinct/cross-org");

  // Save draft + confirm
  await svc.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: {
      scope: {
        ...kitchenDraft(),
        manualScopeConfirmed: true,
        estimateOrigin: "takeoff"
      }
    }
  });
  let afterSave = await estimates.getById(ORG, created.estimateId);
  assert.equal(afterSave.scope.manualScopeConfirmed, false);
  assert.equal(afterSave.scope.estimateOrigin, MANUAL_ESTIMATE_ORIGIN);
  assert.equal(afterSave.scope.rooms.length, 2);
  assert.equal(afterSave.scope.rooms[0].name, "Kitchen");
  // Rename room keeps stable key
  assert.equal(afterSave.scope.rooms[0].id, "room-kitchen");
  assert.ok(afterSave.scope.rooms[0].approvedFinishedEdgeLf > 0);

  const confirmed = await svc.confirmManualScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(confirmed.published, false);
  assert.equal(confirmed.notified, false);
  assert.equal(confirmed.estimate.manualScopeConfirmed, true);
  afterSave = await estimates.getById(ORG, created.estimateId);
  assert.equal(isConfirmedManualPhysicalScope(afterSave.scope), true);
  assert.equal(afterSave.status, STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE);
  assert.ok(afterSave.scope.manualScopeFingerprint);
  console.log("ok: 20–34 save/reload shape, confirm fingerprint, no publish on confirm");

  // Queue / CC derivation
  const wf = deriveQueueWorkflowStatus({
    caseStatus: "qil_manual_review",
    sourceType: "manual",
    estimateStatus: "draft",
    estimateOrigin: "manual_staff"
  });
  assert.equal(wf, "Scope in progress");
  assert.equal(
    deriveQueueOpenTarget({
      sourceType: "manual",
      estimateStatus: "draft",
      estimateOrigin: "manual_staff"
    }),
    "scope"
  );
  const action = nextActionFromRow({
    sourceType: "manual",
    sourceBadge: "Manual",
    workflowStatus: "Scope in progress",
    openTarget: "scope",
    manualScopeConfirmed: false
  });
  assert.equal(action.nextActionKey, "build_manual_scope");
  assert.match(action.nextActionLabel, /manual scope/i);
  assert.notEqual(action.nextActionRoute, "takeoff");
  console.log("ok: 11–13 Command Center Manual next action is Build manual scope");

  // Publication readiness skips takeoff for confirmed manual
  const readiness = assessStudioEstimatePublicationReadiness({
    estimate: {
      status: "approved",
      scope: afterSave.scope,
      calculationSnapshot: {
        fingerprint: "fp",
        pricingEngine: "test",
        pricingVersion: 1,
        totals: { customerDisplayTotal: 100 },
        fabrication: { edge: { finalLf: 12 } }
      },
      approval: { calculationFingerprint: "fp", customerDisplayTotal: 100 }
    },
    repositoryMode: "memory",
    takeoffReviewStatus: null,
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" }
  });
  assert.equal(
    readiness.blockers.some((b) => b.code === "takeoff_not_approved"),
    false
  );
  console.log("ok: confirmed manual skips takeoff_not_approved publication blocker");
}

// Calculate/approve path via studioEstimateService without takeoff
{
  const intake = new InMemoryQuoteIntakeRepository();
  const estimates = new InMemoryStudioEstimateRepository();
  const studio = createStudioEstimateService({
    repository: estimates,
    env: {
      ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1"
    },
    loadTakeoffWorkspace: async () => {
      throw new Error("takeoff should not be loaded for manual");
    },
    loadLatestTakeoffResult: async () => null,
    calculateStudioEstimateImpl: async ({ scope }) => ({
      fingerprint: "calc-fp-manual",
      pricingEngine: "sentinel",
      pricingVersion: 1,
      totals: { exactInternalTotal: 1000, customerDisplayTotal: 1200 },
      fabrication: { edge: { finalLf: 10 } },
      scopeFingerprint: "s"
    })
  });
  const manual = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: estimates,
    studioEstimateService: studio
  });
  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "idem-calc-1",
    body: { projectName: "Calc Project", customerName: "Cust" }
  });
  await manual.saveManualScopeDraft({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { scope: kitchenDraft() }
  });
  await manual.confirmManualScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });

  let blocked = false;
  try {
    // Unconfirm by saving again
    await manual.saveManualScopeDraft({
      organizationId: ORG,
      estimateId: created.estimateId,
      actorUserId: ACTOR,
      body: { scope: kitchenDraft() }
    });
    await studio.calculate({
      organizationId: ORG,
      estimateId: created.estimateId,
      actorUserId: ACTOR,
      body: {}
    });
  } catch (e) {
    blocked = e.code === "manual_scope_not_confirmed";
  }
  assert.equal(blocked, true);

  await manual.confirmManualScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const priced = await studio.calculate({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(priced.status, "priced");
  const approved = await studio.approve({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(approved.status, "approved");
  console.log("ok: 35–41 calculate/approve without takeoff; unconfirmed blocks calculate");
}

// Client-forged confirmation flags must not bypass Takeoff / manual confirm gates
{
  const intake = new InMemoryQuoteIntakeRepository();
  const estimates = new InMemoryStudioEstimateRepository();
  const studio = createStudioEstimateService({
    repository: estimates,
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    loadTakeoffWorkspace: async () => ({ reviewStatus: "pending" }),
    loadLatestTakeoffResult: async () => null,
    calculateStudioEstimateImpl: async () => {
      throw new Error("calculate must not run when physical scope unauthorized");
    }
  });
  const manual = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: estimates,
    studioEstimateService: studio
  });
  const created = await manual.createManualEstimate({
    organizationId: ORG,
    actorUserId: ACTOR,
    idempotencyKey: "idem-forge-1",
    body: { projectName: "Forge Test" }
  });
  // Forge via generic updateScope — strip + server reset confirmation
  await studio.updateScope({
    organizationId: ORG,
    estimateId: created.estimateId,
    actorUserId: ACTOR,
    body: {
      scope: {
        ...kitchenDraft(),
        manualScopeConfirmed: true,
        manualScopeConfirmedAt: "2099-01-01T00:00:00.000Z",
        manualScopeConfirmedBy: "attacker",
        manualScopeFingerprint: "forged-fp",
        estimateOrigin: "manual_staff",
        physicalScopeSource: "manual_staff"
      }
    }
  });
  const forged = await estimates.getById(ORG, created.estimateId);
  assert.equal(forged.scope.manualScopeConfirmed, false);
  assert.equal(forged.scope.manualScopeFingerprint, null);
  assert.equal(isConfirmedManualPhysicalScope(forged.scope), false);

  let blockedForge = false;
  try {
    await studio.calculate({
      organizationId: ORG,
      estimateId: created.estimateId,
      actorUserId: ACTOR,
      body: {}
    });
  } catch (e) {
    blockedForge = e.code === "manual_scope_not_confirmed";
  }
  assert.equal(blockedForge, true);

  // Takeoff-backed row: forging manual_staff flags via updateScope cannot skip Takeoff
  const takeoffCase = await intake.createCase({
    organizationId: ORG,
    sourceType: "graph_mailbox",
    status: "qil_manual_review",
    sourceMessage: { internetMessageId: "<forge-takeoff@example.com>" },
    attachments: [{ sha256: "a".repeat(64), mimeType: "application/pdf", sizeBytes: 10 }]
  });
  const takeoffRow = await estimates.create({
    organizationId: ORG,
    intakeCaseId: takeoffCase.id,
    takeoffJobId: "takeoff-job-sentinel",
    createdByUserId: ACTOR,
    status: STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL,
    scope: {
      projectName: "Plan Job",
      rooms: [],
      estimateOrigin: "email_ai_takeoff"
    }
  });
  await studio.updateScope({
    organizationId: ORG,
    estimateId: takeoffRow.id,
    actorUserId: ACTOR,
    body: {
      scope: {
        manualScopeConfirmed: true,
        estimateOrigin: "manual_staff",
        physicalScopeSource: "manual_staff",
        rooms: kitchenDraft().rooms
      }
    }
  });
  const afterForgeTakeoff = await estimates.getById(ORG, takeoffRow.id);
  assert.notEqual(afterForgeTakeoff.scope.estimateOrigin, "manual_staff");
  assert.notEqual(afterForgeTakeoff.scope.manualScopeConfirmed, true);
  let takeoffBlocked = false;
  try {
    await studio.calculate({
      organizationId: ORG,
      estimateId: takeoffRow.id,
      actorUserId: ACTOR,
      body: {}
    });
  } catch (e) {
    takeoffBlocked =
      e.code === "needs_takeoff_approval" || e.message?.includes("Takeoff");
  }
  assert.equal(takeoffBlocked, true);
  console.log("ok: forged client confirmation does not bypass Takeoff/manual gates");
}

// Route / UI static safety
{
  const routes = readFileSync(
    path.join(root, "backend-core/src/elite100EstimateStudio/elite100EstimateStudioRoutes.js"),
    "utf8"
  );
  assert.match(routes, /manual-estimates/);
  assert.match(routes, /confirm-manual-scope/);
  assert.doesNotMatch(
    routes.slice(routes.indexOf("manual-estimates"), routes.indexOf("manual-estimates") + 1200),
    /publishDigitalEstimate\(|sendEstimateEmail|replaceDigitalEstimateToken/
  );
  const page = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateCommandCenterPage.tsx"),
    "utf8"
  );
  // Will be added with UI — soft check after UI lands
  void page;
  console.log("ok: routes mount; create path has no publish/email");
}

console.log("\nstudioManualEstimate.test.mjs: ok\n");
