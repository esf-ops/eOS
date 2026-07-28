/**
 * Fix automatic Takeoff approval → Studio Scope handoff.
 *
 * Proves refreshScopeFromTakeoff no longer 500s on an approved consolidated
 * Takeoff whose legacy approval gate still reports VALIDATION_ERRORS, and that
 * the seeded Scope + pricingVersion 4 calculation carry real geometry.
 *
 * Run: node backend-core/src/elite100EstimateStudio/studioTakeoffApprovalHandoff.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { buildTakeoffImportPayload } from "../takeoff/takeoffImportPayload.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PRICING_VERSION_4 = 4;
const PRICING_ENGINE_V1 = "elite100-room-pricing-v1";

console.log("\nstudioTakeoffApprovalHandoff.test.mjs\n");

/** Production-shaped approved Takeoff: real rooms + legacy validation errors. */
function productionShapedApprovedResult() {
  return {
    schemaVersion: "1",
    status: "approved",
    rooms: [
      {
        id: "room-kitchen",
        name: "Kitchen",
        roomType: "Kitchen",
        areas: [
          {
            id: "area-main",
            label: "Main",
            backsplashIncluded: true,
            backsplashScope: "stone",
            runs: [
              {
                id: "run-cooktop",
                label: "Cooktop wall",
                lengthIn: 112.5,
                depthIn: 25.5,
                pieceType: "counter",
                backsplashEligible: true,
                finishedEdge: {
                  frontEdgeLengthIn: 112.5,
                  totalFinishedEdgeLengthIn: 112.5,
                  approved: true
                }
              },
              {
                id: "run-sink",
                label: "Sink wall",
                lengthIn: 96,
                depthIn: 25.5,
                pieceType: "counter",
                backsplashEligible: true,
                finishedEdge: {
                  frontEdgeLengthIn: 96,
                  totalFinishedEdgeLengthIn: 96,
                  approved: true
                },
                cutouts: [{ type: "sink", quantity: 1 }]
              },
              {
                id: "run-cooktop-fhb",
                label: "Cooktop wall FHB",
                lengthIn: 112.5,
                depthIn: 18,
                pieceType: "counter",
                backsplashEligible: false,
                finishedEdge: {
                  frontEdgeLengthIn: 112.5,
                  totalFinishedEdgeLengthIn: 112.5,
                  approved: true
                }
              },
              {
                id: "run-sink-fhb",
                label: "Sink wall FHB",
                lengthIn: 96,
                depthIn: 18,
                pieceType: "counter",
                backsplashEligible: false,
                finishedEdge: {
                  frontEdgeLengthIn: 96,
                  totalFinishedEdgeLengthIn: 96,
                  approved: true
                }
              },
              {
                id: "run-bs",
                label: "Backsplash",
                lengthIn: 208.5,
                depthIn: 4,
                pieceType: "splash",
                backsplashEligible: true
              }
            ]
          }
        ]
      }
    ]
  };
}

function legacyBlockingValidation() {
  return {
    hasErrors: true,
    errorCount: 2,
    diagnostics: [
      {
        level: "error",
        code: "VALIDATION_ERRORS",
        message: "2 validation error(s) must be resolved before approval."
      },
      {
        level: "error",
        code: "REFERENCE_TOTAL_COUNTERTOP_MISMATCH",
        message: "Reference countertop total mismatch"
      }
    ]
  };
}

{
  // Reproduce: after consolidated approve, rebuild without ignoreApprovalGateBlockers
  // throws a bare Error (route would map to HTTP 500).
  const takeoffResult = productionShapedApprovedResult();
  let threwBare = false;
  try {
    buildTakeoffImportPayload({
      takeoffJobId: JOB,
      takeoffResultId: "result-1",
      takeoffResult,
      reviewState: {
        excludedRunIds: [],
        flagResolutions: {},
        roomCompleteness: { "room-kitchen": true },
        referenceTotalAcks: {},
        evidenceAcks: {}
      },
      computed: {},
      validation: legacyBlockingValidation(),
      qaGate: { status: "ready_for_review", topIssues: [] },
      requireApproved: true,
      reviewStatus: "approved",
      ignoreApprovalGateBlockers: false
    });
  } catch (e) {
    threwBare = true;
    assert.equal(e.statusCode, undefined, "legacy gate throw has no statusCode → was HTTP 500");
    assert.match(String(e.message), /validation/i);
  }
  assert.ok(threwBare, "reproduced legacy-gate bare throw after approval");

  // Same inputs with ignoreApprovalGateBlockers succeed (what consolidated approve uses).
  const okPayload = buildTakeoffImportPayload({
    takeoffJobId: JOB,
    takeoffResultId: "result-1",
    takeoffResult,
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: { "room-kitchen": true },
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    computed: {},
    validation: legacyBlockingValidation(),
    qaGate: { status: "ready_for_review", topIssues: [] },
    requireApproved: true,
    reviewStatus: "approved",
    ignoreApprovalGateBlockers: true
  });
  assert.ok(okPayload.rooms.length >= 1);
  console.log("ok: 1 reproduced legacy-gate 500 cause; ignoreApprovalGateBlockers is the fix");
}

{
  const svcSrc = readFileSync(
    join(root, "backend-core/src/elite100EstimateStudio/studioEstimateService.mjs"),
    "utf8"
  );
  const refreshFn = svcSrc.slice(
    svcSrc.indexOf("async function refreshScopeFromTakeoff"),
    svcSrc.indexOf("async function refreshScopeFromTakeoff") + 4500
  );
  assert.ok(
    refreshFn.includes("ignoreApprovalGateBlockers: true"),
    "refreshScopeFromTakeoff must ignore legacy gate after approval"
  );
  assert.equal(
    (refreshFn.match(/loadWorkspace\(/g) || []).length,
    1,
    "refreshScopeFromTakeoff loads workspace exactly once"
  );
  assert.ok(refreshFn.includes("takeoff_result_not_ready"));
  assert.ok(refreshFn.includes("retryable = true"));
  console.log("ok: 2 refreshScopeFromTakeoff source contracts");
}

{
  let workspaceLoads = 0;
  let resultLoads = 0;
  let latestReady = false;
  const takeoffResult = productionShapedApprovedResult();
  const frozenPayload = buildTakeoffImportPayload({
    takeoffJobId: JOB,
    takeoffResultId: "result-approved-1",
    takeoffResult,
    reviewState: {
      excludedRunIds: [],
      flagResolutions: {},
      roomCompleteness: { "room-kitchen": true },
      referenceTotalAcks: {},
      evidenceAcks: {}
    },
    computed: {},
    validation: legacyBlockingValidation(),
    qaGate: { status: "ready_for_review", topIssues: [] },
    requireApproved: true,
    reviewStatus: "approved",
    ignoreApprovalGateBlockers: true
  });

  const repository = new InMemoryStudioEstimateRepository();
  const service = createStudioEstimateService({
    repository,
    env: {},
    loadTakeoffWorkspace: async () => {
      workspaceLoads += 1;
      return {
        takeoffJobId: JOB,
        reviewStatus: "approved",
        approvedAt: "2026-07-28T18:00:00.000Z",
        approvedByUserId: ACTOR,
        latestResult: { id: "result-approved-1" }
      };
    },
    loadLatestTakeoffResult: async () => {
      resultLoads += 1;
      if (!latestReady) {
        const err = new Error("No saved result found for this takeoff workspace");
        err.statusCode = 404;
        throw err;
      }
      return {
        id: "result-approved-1",
        resultId: "result-approved-1",
        normalizedTakeoffJson: takeoffResult,
        computedMeasurementsJson: {},
        validationDiagnosticsJson: legacyBlockingValidation(),
        reviewState: {
          excludedRunIds: [],
          flagResolutions: {},
          roomCompleteness: { "room-kitchen": true },
          referenceTotalAcks: {},
          evidenceAcks: {}
        },
        // Omit frozen importPayload so rebuild path is exercised with
        // ignoreApprovalGateBlockers (the production 500 path).
        importPayload: null
      };
    }
  });

  const created = await repository.create({
    organizationId: ORG,
    intakeCaseId: "intake-handoff-1",
    takeoffJobId: JOB,
    status: STUDIO_ESTIMATE_STATUSES.NEEDS_TAKEOFF_APPROVAL,
    scope: {
      projectName: "Handoff Kitchen",
      customerName: "Handoff Co",
      customerEmail: "handoff@example.com",
      materialGroup: "Group 1",
      rooms: []
    },
    createdByUserId: ACTOR
  });

  // Transient: approved but latest result not visible yet → structured retryable 409.
  let retryErr = null;
  try {
    await service.refreshScopeFromTakeoff({
      organizationId: ORG,
      estimateId: created.id,
      actorUserId: ACTOR,
      force: true
    });
  } catch (e) {
    retryErr = e;
  }
  assert.ok(retryErr, "missing latest result must throw");
  assert.equal(retryErr.statusCode, 409);
  assert.equal(retryErr.code, "takeoff_result_not_ready");
  assert.equal(retryErr.retryable, true);
  assert.equal(workspaceLoads, 1, "one workspace load on not-ready path");

  // Ready: legacy validation still present — must NOT 500.
  latestReady = true;
  workspaceLoads = 0;
  resultLoads = 0;
  const refreshed = await service.refreshScopeFromTakeoff({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    force: true
  });
  assert.equal(workspaceLoads, 1, "one workspace load on success path");
  assert.equal(resultLoads, 1);
  assert.ok(refreshed.estimate, "handoff returns updated estimate, not preview-only");
  assert.ok(
    Array.isArray(refreshed.estimate.scope?.rooms) && refreshed.estimate.scope.rooms.length >= 1,
    "canonical Scope has approved rooms"
  );

  const pieces = refreshed.estimate.scope.rooms.flatMap((r) => r.pieces || []);
  assert.ok(pieces.length >= 4, "approved included pieces present");
  const byName = Object.fromEntries(
    pieces.map((p) => [String(p.name || p.label || ""), p])
  );
  assert.equal(Number(byName["Cooktop wall"]?.lengthIn), 112.5);
  assert.equal(Number(byName["Cooktop wall"]?.depthIn), 25.5);
  assert.equal(Number(byName["Sink wall"]?.lengthIn), 96);
  assert.equal(Number(byName["Sink wall"]?.depthIn), 25.5);
  assert.ok(
    Number(refreshed.preview?.nextCountertopSf) > 0,
    "preview SF is non-zero"
  );

  // Also prove frozen approved importPayload path works.
  const serviceWithFrozen = createStudioEstimateService({
    repository,
    env: {},
    loadTakeoffWorkspace: async () => ({
      takeoffJobId: JOB,
      reviewStatus: "approved",
      approvedAt: "2026-07-28T18:00:00.000Z",
      approvedByUserId: ACTOR,
      latestResult: { id: "result-approved-1" }
    }),
    loadLatestTakeoffResult: async () => ({
      id: "result-approved-1",
      normalizedTakeoffJson: takeoffResult,
      computedMeasurementsJson: {},
      validationDiagnosticsJson: legacyBlockingValidation(),
      reviewState: null,
      importPayload: frozenPayload
    })
  });
  const again = await serviceWithFrozen.refreshScopeFromTakeoff({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    force: true
  });
  assert.ok(again.estimate.scope.rooms.length >= 1);

  const priced = await service.calculate({
    organizationId: ORG,
    estimateId: created.id,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(priced.calculation.pricingEngine, PRICING_ENGINE_V1);
  assert.equal(priced.calculation.pricingVersion, PRICING_VERSION_4);
  const roomSf = (priced.scope?.rooms || []).reduce(
    (s, r) => s + (Number(r.countertopSqft) || 0),
    0
  );
  const billing = priced.calculation.scopeBilling || {};
  const measured =
    Number(billing.measuredCountertopSf) ||
    Number(billing.billableCountertopSf) ||
    roomSf ||
    Number(refreshed.preview?.nextCountertopSf) ||
    0;
  assert.ok(measured > 0, "measured countertop SF > 0");
  assert.ok(
    Number(priced.calculation.totals.customerDisplayTotal) > 0,
    "starting total calculable"
  );
  console.log("ok: 3 refresh-from-takeoff imports geometry + calculates pricingVersion 4");
}

{
  const panel = readFileSync(
    join(root, "app-elite100-estimate-studio/src/estimateQueue/AiTakeoffFirstPanel.tsx"),
    "utf8"
  );
  assert.ok(panel.includes("setMeasurementsApproved(true)"));
  assert.ok(panel.includes("refreshFromTakeoffWithRetry"));
  assert.ok(panel.includes("refresh-from-takeoff"));
  assert.ok(panel.includes("/calculate"));
  // measurementsApproved must only flip after successful refresh + calculate.
  const handoffStart = panel.indexOf("const completeApprovalHandoff");
  const handoffEnd = panel.indexOf("// postMessage from Takeoff Review");
  const handoff = panel.slice(handoffStart, handoffEnd > handoffStart ? handoffEnd : handoffStart + 5000);
  const approvedIdx = handoff.indexOf("setMeasurementsApproved(true)");
  const refreshCallIdx = handoff.indexOf("refreshFromTakeoffWithRetry");
  const calcIdx = handoff.indexOf("/calculate");
  assert.ok(approvedIdx !== -1, "success path sets measurementsApproved");
  assert.ok(refreshCallIdx !== -1 && approvedIdx > refreshCallIdx, "approved after refresh");
  assert.ok(calcIdx !== -1 && approvedIdx > calcIdx, "approved after calculate");
  assert.ok(handoff.includes("setMeasurementsApproved(false)"), "failure clears approved flag");
  assert.ok(panel.includes("Building verified estimate"));
  assert.ok(panel.includes("eq-ai-retry-handoff"));
  assert.ok(panel.includes("isRetryableHandoffError"));
  assert.ok(panel.includes("takeoff_result_not_ready"));
  assert.ok(panel.includes("handoffInFlightRef"));
  assert.ok(panel.includes("eq-takeoff-handoff-overlay"));
  assert.ok(panel.includes("APPROVAL_FALLBACK_POLL_MS"));
  assert.ok(
    !panel.includes('setMeasurementsApproved(true);\n\n        const created'),
    "must not set approved before estimate load"
  );
  console.log("ok: 4 frontend handoff state machine contracts");
}

console.log("\nstudioTakeoffApprovalHandoff.test.mjs — passed\n");
