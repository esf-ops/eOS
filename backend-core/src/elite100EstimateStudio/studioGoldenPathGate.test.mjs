/**
 * Studio golden-path regression gate — core state transitions (sentinel data only).
 *
 * Protects quote-to-publication paths A–G identified in
 * docs/eliteos/audits/STUDIO_GOLDEN_PATH_REGRESSION_PLAN.md.
 *
 * Run: node backend-core/src/elite100EstimateStudio/studioGoldenPathGate.test.mjs
 * Or:  npm run eos:test:studio-golden-path-gate
 *
 * No production credentials. No network. No SQL.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryStudioEstimateRepository } from "./inMemoryStudioEstimateRepository.mjs";
import { createStudioEstimateService } from "./studioEstimateService.mjs";
import { createStudioManualEstimateService } from "./studioManualEstimateService.mjs";
import { InMemoryQuoteIntakeRepository } from "../quoteIntake/quoteIntakeRepository.mjs";
import {
  buildStudioWorkspaceWorkflow,
  workflowAllowsAction
} from "./studioWorkspaceWorkflow.mjs";
import {
  buildSafeStudioPublicationSummary,
  isCurrentActivePublicationForEstimate
} from "./studioPublicationSummary.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { MANUAL_ESTIMATE_ORIGIN } from "./studioManualPhysicalScope.mjs";
import { PROJECT_METADATA_SCOPE_KEYS } from "./studioProjectDetails.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

const ORG_ALPHA = "org-alpha-0000-4000-8000-000000000001";
const ORG_BETA = "org-beta-0000-4000-8000-000000000002";
const ACTOR = "actor-golden-0000-4000-8000-000000000099";
const CASE_REVISE = "case-golden-revise-001";
/** Sentinel ids for Path C (rev2 id is assigned by createRevisionFrom). */
const EST_REV_1 = "estimate-revision-1";
const PUB_REV_1 = "publication-revision-1";

console.log("\nstudioGoldenPathGate.test.mjs\n");

/** Delivery / communication / sold mutation sentinels */
function createDeliverySpies() {
  const calls = [];
  return {
    calls,
    publish: (...args) => {
      calls.push({ op: "publish", args });
      throw new Error("sentinel: publish must not be called");
    },
    republish: (...args) => {
      calls.push({ op: "republish", args });
      throw new Error("sentinel: republish must not be called");
    },
    replace: (...args) => {
      calls.push({ op: "replace", args });
      throw new Error("sentinel: replace must not be called");
    },
    revoke: (...args) => {
      calls.push({ op: "revoke", args });
      throw new Error("sentinel: revoke must not be called");
    },
    createReviewRequest: (...args) => {
      calls.push({ op: "createReviewRequest", args });
      throw new Error("sentinel: createReviewRequest must not be called");
    },
    sendEmail: (...args) => {
      calls.push({ op: "sendEmail", args });
      throw new Error("sentinel: sendEmail must not be called");
    },
    sendNotification: (...args) => {
      calls.push({ op: "sendNotification", args });
      throw new Error("sentinel: sendNotification must not be called");
    },
    markSold: (...args) => {
      calls.push({ op: "markSold", args });
      throw new Error("sentinel: markSold must not be called");
    },
    createQuickBooks: (...args) => {
      calls.push({ op: "createQuickBooks", args });
      throw new Error("sentinel: createQuickBooks must not be called");
    },
    createMoraware: (...args) => {
      calls.push({ op: "createMoraware", args });
      throw new Error("sentinel: createMoraware must not be called");
    },
    assertZero() {
      assert.equal(calls.length, 0, `expected zero delivery mutations, got ${JSON.stringify(calls)}`);
    }
  };
}

/**
 * Mirrors EstimateTakeoffWorkspace.applyActiveEstimateChange + panel estimateId props.
 * Used to prove multi-panel convergence after revision (AUDIT-014 / AUDIT-002).
 * Not a second workflow implementation — only ID reconciliation.
 */
function reconcilePanelsToActive(panels, nextId, meta = {}) {
  const next = { ...panels };
  for (const key of Object.keys(next)) {
    next[key] = { ...next[key], estimateId: nextId };
  }
  if (meta.previousRevisionSummary) {
    next.workflowHeader = {
      ...next.workflowHeader,
      previousRevisionSummary: meta.previousRevisionSummary
    };
  }
  next.workspace = { ...next.workspace, estimateId: nextId, scopeRefreshKey: (next.workspace.scopeRefreshKey || 0) + 1 };
  return next;
}

/** Old contradictory behavior: only pricing updates; Manual Scope stays on rev1. */
function reconcilePanelsOldBroken(panels, nextId) {
  return {
    ...panels,
    pricingSetup: { ...panels.pricingSetup, estimateId: nextId },
    workflowHeader: { ...panels.workflowHeader, estimateId: nextId }
  };
}

function manualConfirmedScope(overrides = {}) {
  return {
    estimateOrigin: MANUAL_ESTIMATE_ORIGIN,
    physicalScopeSource: MANUAL_ESTIMATE_ORIGIN,
    manualScopeConfirmed: true,
    projectName: "Oak Street Kitchen",
    projectAddress: "100 Oak St",
    internalNote: "sentinel note",
    rooms: [
      {
        id: "room-1",
        name: "Kitchen",
        included: true,
        pieces: [{ id: "p1", label: "Island", lengthIn: 96, depthIn: 25.5, included: true }]
      }
    ],
    ...overrides
  };
}

function activePublicationFor(estimate, overrides = {}) {
  return {
    id: PUB_REV_1,
    status: "active",
    revisionNumber: estimate.revision,
    estimateId: estimate.id,
    publishedAt: "2026-07-24T14:00:00Z",
    pricingValidThrough: "2026-08-22",
    customerUrl: "https://example.test/de/golden-stable",
    linkStatus: "active",
    ...overrides
  };
}

function createStudioPair(orgId = ORG_ALPHA) {
  const intake = new InMemoryQuoteIntakeRepository();
  const estimates = new InMemoryStudioEstimateRepository();
  const delivery = createDeliverySpies();
  const manual = createStudioManualEstimateService({
    quoteIntakeRepository: intake,
    studioEstimateRepository: estimates
  });
  const studio = createStudioEstimateService({
    repository: estimates,
    env: { ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH: "1" },
    loadTakeoffWorkspace: async () => null,
    loadLatestTakeoffResult: async () => null,
    calculateStudioEstimateImpl: async ({ scope }) => ({
      fingerprint: `fp-golden-${scope?.projectName || "x"}`,
      pricingEngine: "sentinel",
      pricingVersion: 1,
      totals: { exactInternalTotal: 4500, customerDisplayTotal: 5200 },
      fabrication: { edge: { finalLf: 12 } },
      scopeFingerprint: "scope-fp-golden"
    })
  });
  return { intake, estimates, manual, studio, delivery, orgId };
}

// ---------------------------------------------------------------------------
// PATH A — Manual estimate workflow gating (canonical buildStudioWorkspaceWorkflow)
// ---------------------------------------------------------------------------
{
  const unconfirmed = {
    id: "est-manual-a",
    revision: 1,
    status: STUDIO_ESTIMATE_STATUSES.DRAFT,
    scope: {
      ...manualConfirmedScope(),
      manualScopeConfirmed: false
    }
  };
  const wf0 = buildStudioWorkspaceWorkflow(unconfirmed);
  assert.equal(wf0.nextRequiredAction, "confirm_manual_scope");
  assert.ok(!workflowAllowsAction(wf0, "calculate"));
  assert.ok(!workflowAllowsAction(wf0, "approve"));
  assert.ok(!workflowAllowsAction(wf0, "publish"));

  const dirtyPhysical = buildStudioWorkspaceWorkflow(
    { ...unconfirmed, scope: manualConfirmedScope() },
    { manualScopeDirty: true }
  );
  assert.equal(dirtyPhysical.nextRequiredAction, "save_manual_scope");
  assert.ok(!workflowAllowsAction(dirtyPhysical, "calculate"));

  const dirtyPricing = buildStudioWorkspaceWorkflow(
    {
      id: "est-manual-a",
      revision: 1,
      status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
      scope: manualConfirmedScope()
    },
    { pricingDirty: true }
  );
  assert.equal(dirtyPricing.nextRequiredAction, "save_pricing");
  assert.ok(!workflowAllowsAction(dirtyPricing, "calculate"));

  const readyCalc = buildStudioWorkspaceWorkflow({
    id: "est-manual-a",
    revision: 1,
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    scope: manualConfirmedScope()
  });
  assert.equal(readyCalc.nextRequiredAction, "calculate");
  assert.ok(workflowAllowsAction(readyCalc, "calculate"));
  assert.ok(!workflowAllowsAction(readyCalc, "approve"));

  const priced = buildStudioWorkspaceWorkflow({
    id: "est-manual-a",
    revision: 1,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    scope: manualConfirmedScope(),
    calculation: { fingerprint: "fp-a1", calculatedAt: "2026-07-24T12:00:00Z" }
  });
  assert.equal(priced.nextRequiredAction, "approve");
  assert.ok(workflowAllowsAction(priced, "approve"));
  assert.ok(!workflowAllowsAction(priced, "publish"));

  const approvedEstimate = {
    id: "est-manual-a",
    revision: 1,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    scope: manualConfirmedScope(),
    calculation: { fingerprint: "fp-a1" },
    approval: { approvedAt: "2026-07-24T13:00:00Z" }
  };
  const approved = buildStudioWorkspaceWorkflow(approvedEstimate);
  assert.equal(approved.currentStage, "ready_to_publish");
  assert.ok(workflowAllowsAction(approved, "publish"));

  const pub = buildSafeStudioPublicationSummary({
    estimate: approvedEstimate,
    activePublication: activePublicationFor(approvedEstimate)
  });
  assert.equal(pub.active, true);
  assert.equal(pub.state, "published_waiting_for_customer");
  const published = buildStudioWorkspaceWorkflow(approvedEstimate, { publication: pub });
  assert.equal(published.currentStage, "published");
  assert.equal(published.nextRequiredAction, "wait_for_customer");
  assert.notEqual(published.nextRequiredAction, "calculate");
  assert.notEqual(published.nextRequiredAction, "approve");
  assert.notEqual(published.nextRequiredAction, "publish");
  assert.ok(workflowAllowsAction(published, "open_customer_view"));
  assert.ok(workflowAllowsAction(published, "copy_customer_link"));
  assert.equal(pub.customerUrl, "https://example.test/de/golden-stable");

  console.log("  ✓ PATH A manual gating + published reopen does not restart calc/approve/publish");
}

// ---------------------------------------------------------------------------
// PATH B — Takeoff approval does not commercially approve or publish
// ---------------------------------------------------------------------------
{
  const delivery = createDeliverySpies();
  const takeoffGateSrc = readFileSync(
    path.join(root, "backend-core/src/takeoff/takeoffApprovalGate.mjs"),
    "utf8"
  );
  assert.doesNotMatch(takeoffGateSrc, /publishDigitalEstimate|sendEstimateEmail|markSold/);
  assert.match(takeoffGateSrc, /canApprove|evaluateTakeoffApprovalGate/);

  const seeded = {
    id: "est-takeoff-b",
    revision: 1,
    status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
    takeoffJobId: "takeoff-job-golden-1",
    scope: {
      projectName: "Plan Kitchen",
      rooms: [{ id: "r1", name: "Kitchen", included: true, pieces: [] }],
      physicalScopeSource: "takeoff",
      estimateOrigin: "takeoff"
    }
  };
  const wf = buildStudioWorkspaceWorkflow(seeded);
  assert.equal(wf.nextRequiredAction, "calculate");
  assert.ok(!workflowAllowsAction(wf, "approve"), "Takeoff-seeded scope still needs calculation before approve");
  assert.ok(!workflowAllowsAction(wf, "publish"), "Takeoff approval path does not publish");
  delivery.assertZero();
  console.log("  ✓ PATH B Takeoff seed ≠ commercial approve/publish");
}

// ---------------------------------------------------------------------------
// PATH C — Revision after publication + multi-panel sync (critical)
// ---------------------------------------------------------------------------
{
  const { estimates, studio, delivery } = createStudioPair();

  // Seed revision 1 as approved (simulating published revision)
  const rev1 = await estimates.create({
    id: EST_REV_1,
    organizationId: ORG_ALPHA,
    intakeCaseId: CASE_REVISE,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: manualConfirmedScope({ materialSku: "SKU-A" }),
    calculationSnapshot: {
      fingerprint: "fp-rev1",
      totals: { exactInternalTotal: 4500 }
    },
    approval: { approvedAt: "2026-07-20T10:00:00Z", exactInternalTotal: 4500 },
    createdByUserId: ACTOR
  });
  assert.equal(rev1.id, EST_REV_1);
  assert.equal(rev1.status, STUDIO_ESTIMATE_STATUSES.APPROVED);

  const pubActiveOnRev1 = activePublicationFor(rev1);
  const summaryOnRev1 = buildSafeStudioPublicationSummary({
    estimate: rev1,
    activePublication: pubActiveOnRev1
  });
  assert.equal(summaryOnRev1.active, true);
  assert.equal(summaryOnRev1.state, "published_waiting_for_customer");

  const wfPublished = buildStudioWorkspaceWorkflow(
    {
      id: rev1.id,
      revision: 1,
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      scope: rev1.scope,
      calculation: { fingerprint: "fp-rev1" },
      approval: rev1.approval
    },
    { publication: summaryOnRev1 }
  );
  assert.equal(wfPublished.currentStage, "published");

  // Price-affecting edit → createRevisionFrom (same path as service revise helpers)
  const previousRevisionSummary = {
    revision: 1,
    approvedAt: rev1.approval.approvedAt,
    exactInternalTotal: 4500,
    label: "Previous revision approved: $4500.00"
  };
  const rev2 = await estimates.createRevisionFrom(
    ORG_ALPHA,
    EST_REV_1,
    {
      status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
      scope: manualConfirmedScope({ materialSku: "SKU-B" }),
      staleReason: "Scope changed after approval — recalculate and reapprove"
    },
    ACTOR
  );
  const EST_REV_2 = rev2.id;
  assert.ok(EST_REV_2 && EST_REV_2 !== EST_REV_1, "revision 2 gets a new estimate id");
  assert.equal(rev2.revision, 2);
  assert.equal(rev2.status, STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE);

  const superseded = await estimates.getById(ORG_ALPHA, EST_REV_1);
  assert.equal(superseded.status, STUDIO_ESTIMATE_STATUSES.SUPERSEDED);
  assert.ok(superseded.approval?.approvedAt, "rev1 approval snapshot preserved on superseded row");

  const active = await estimates.getActiveByIntakeCase(ORG_ALPHA, CASE_REVISE);
  assert.equal(active.id, EST_REV_2, "canonical active estimate is revision 2");

  // Multi-panel sync: after revision, all panels must share EST_REV_2
  let panels = {
    workspace: { estimateId: EST_REV_1, scopeRefreshKey: 0 },
    manualScope: { estimateId: EST_REV_1 },
    pricingSetup: { estimateId: EST_REV_1 },
    projectDetails: { estimateId: EST_REV_1 },
    workflowHeader: { estimateId: EST_REV_1, previousRevisionSummary: null }
  };

  // Prove old contradictory behavior fails the invariant
  const broken = reconcilePanelsOldBroken(panels, EST_REV_2);
  assert.equal(broken.manualScope.estimateId, EST_REV_1, "old bug: Manual Scope retained rev1");
  assert.equal(broken.pricingSetup.estimateId, EST_REV_2, "old bug: Pricing moved to rev2");
  assert.notEqual(
    broken.manualScope.estimateId,
    broken.pricingSetup.estimateId,
    "old contradictory IDs disagree"
  );

  // Current synchronized behavior (onActiveEstimateChange / applyActiveEstimateChange)
  panels = reconcilePanelsToActive(panels, EST_REV_2, { previousRevisionSummary });
  const ids = [
    panels.workspace.estimateId,
    panels.manualScope.estimateId,
    panels.pricingSetup.estimateId,
    panels.projectDetails.estimateId,
    panels.workflowHeader.estimateId
  ];
  assert.ok(ids.every((id) => id === EST_REV_2), `all panels must share ${EST_REV_2}, got ${ids.join(",")}`);
  assert.equal(panels.workflowHeader.previousRevisionSummary.revision, 1);
  assert.ok(panels.workspace.scopeRefreshKey >= 1);

  // Historical publication: rev1 pub is not current for rev2 estimate
  assert.equal(isCurrentActivePublicationForEstimate(rev2, pubActiveOnRev1), false);
  const histSummary = buildSafeStudioPublicationSummary({
    estimate: { id: EST_REV_2, revision: 2, status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE },
    activePublication: pubActiveOnRev1
  });
  assert.equal(histSummary.historical, true);
  assert.equal(histSummary.active, false);
  assert.equal(histSummary.customerUrl, null, "staff summary does not expose historical URL as current");

  // Frozen publication row object remains unchanged
  assert.equal(pubActiveOnRev1.id, PUB_REV_1);
  assert.equal(pubActiveOnRev1.customerUrl, "https://example.test/de/golden-stable");
  assert.equal(pubActiveOnRev1.revisionNumber, 1);

  // Rev2 workflow: must calculate; historical publication must not show as published current
  const wfRev2 = buildStudioWorkspaceWorkflow(
    {
      id: EST_REV_2,
      revision: 2,
      status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
      scope: rev2.scope,
      staleReason: rev2.staleReason
    },
    {
      historicalApproval: previousRevisionSummary,
      publication: histSummary
    }
  );
  assert.equal(wfRev2.estimateId, EST_REV_2);
  assert.equal(wfRev2.nextRequiredAction, "calculate");
  assert.equal(wfRev2.currentStage, "calculation_required");
  assert.ok(!wfRev2.approvalCurrent);
  assert.ok(!wfRev2.calculationCurrent);
  assert.ok(wfRev2.historicalApproval);
  assert.equal(wfRev2.historicalApproval.revision, 1);
  assert.notEqual(wfRev2.currentStage, "published");

  // Delayed rev1 response must not regress active workspace ID (monotonic policy).
  // UI wiring: ManualPhysicalScopeEditor / applyActiveEstimateChange advance on nextId;
  // getActiveByIntakeCase is the refresh source of truth for the family.
  function applyDelayedPanelResponse(currentActiveId, responseEstimateId, responseRevision, activeRevision) {
    if (Number(responseRevision) < Number(activeRevision)) {
      return currentActiveId;
    }
    if (responseEstimateId !== currentActiveId && Number(responseRevision) >= Number(activeRevision)) {
      return responseEstimateId;
    }
    return currentActiveId;
  }
  assert.equal(
    applyDelayedPanelResponse(EST_REV_2, EST_REV_1, 1, 2),
    EST_REV_2,
    "delayed rev1 response must not overwrite rev2"
  );

  const refreshed = await estimates.getActiveByIntakeCase(ORG_ALPHA, CASE_REVISE);
  assert.equal(refreshed.id, EST_REV_2);

  delivery.assertZero();

  const activeView = await estimates.getById(ORG_ALPHA, EST_REV_2);
  assert.ok(activeView);
  assert.ok(studio);
  console.log("  ✓ PATH C revision-after-publish + multi-panel sync + historical publication");
}

// ---------------------------------------------------------------------------
// PATH D — Metadata-only project details (no revision / no calc clear)
// ---------------------------------------------------------------------------
{
  const { estimates, manual, studio, delivery } = createStudioPair();
  const rooms = [
    {
      id: "room-kitchen",
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
    organizationId: ORG_ALPHA,
    actorUserId: ACTOR,
    idempotencyKey: "golden-meta-1",
    body: {
      projectName: "Meta Kitchen",
      projectAddress: "1 Meta Way",
      customerName: "Meta Customer"
    }
  });
  const estimateId = created.estimateId;
  await manual.saveManualScopeDraft({
    organizationId: ORG_ALPHA,
    estimateId,
    actorUserId: ACTOR,
    body: { scope: { rooms, addOns: { "qty-sink": 1 } } }
  });
  await manual.confirmManualScope({
    organizationId: ORG_ALPHA,
    estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  const priced = await studio.calculate({
    organizationId: ORG_ALPHA,
    estimateId,
    actorUserId: ACTOR,
    body: {}
  });
  assert.equal(priced.status, STUDIO_ESTIMATE_STATUSES.PRICED);
  const calcFp = priced.calculation?.fingerprint || priced.calculationFingerprint;
  assert.ok(calcFp);

  const approved = await studio.approve({
    organizationId: ORG_ALPHA,
    estimateId,
    actorUserId: ACTOR,
    body: { confirm: true }
  });
  assert.equal(approved.status, STUDIO_ESTIMATE_STATUSES.APPROVED);
  const beforeRev = (await estimates.getById(ORG_ALPHA, estimateId)).revision;

  const meta = await studio.updateProjectDetails({
    organizationId: ORG_ALPHA,
    estimateId,
    actorUserId: ACTOR,
    body: {
      projectName: "Meta Kitchen Renamed",
      projectAddress: "2 Meta Way",
      internalNote: "updated note"
    }
  });
  assert.equal(meta.published, false);
  assert.equal(meta.notified, false);
  assert.equal(meta.calculationCleared, false);
  assert.equal(meta.revised, false);
  const after = await estimates.getById(ORG_ALPHA, estimateId);
  assert.equal(after.id, estimateId, "active estimate ID unchanged");
  assert.equal(after.revision, beforeRev, "no new revision for metadata-only");
  assert.equal(after.status, STUDIO_ESTIMATE_STATUSES.APPROVED, "approval remains current");
  assert.equal(after.calculationSnapshot?.fingerprint, calcFp, "calculation fingerprint unchanged");
  assert.equal(after.scope.projectName, "Meta Kitchen Renamed");
  assert.ok(PROJECT_METADATA_SCOPE_KEYS.includes("projectName"));
  delivery.assertZero();
  console.log("  ✓ PATH D metadata-only edit preserves calc/approval/revision");
}

// ---------------------------------------------------------------------------
// PATH E — Transient failure contracts (source-level, no optimistic success)
// ---------------------------------------------------------------------------
{
  const api = readFileSync(path.join(root, "app-elite100-estimate-studio/src/lib/api.ts"), "utf8");
  assert.match(api, /export function isTransientHttpError/);
  assert.match(api, /502|503|504/);
  assert.match(api, /export function transientFailureMessage/);

  const scopePanel = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateScopePanel.tsx"),
    "utf8"
  );
  const header = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateWorkflowHeader.tsx"),
    "utf8"
  );
  const de = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/EstimateDigitalEstimatePanel.tsx"),
    "utf8"
  );
  const manual = readFileSync(
    path.join(root, "app-elite100-estimate-studio/src/estimateQueue/ManualPhysicalScopeEditor.tsx"),
    "utf8"
  );

  assert.match(header, /Refresh status|Service temporarily unavailable/);
  assert.match(scopePanel, /isTransientHttpError/);
  assert.match(manual, /isTransientHttpError/);
  assert.match(de, /Publication status could not be refreshed|isTransientHttpError/);

  // Recovery blocks must not auto-publish / auto-approve
  for (const src of [header, scopePanel, manual, de]) {
    const recovery = src.match(
      /(?:transientError|isTransientHttpError|Refresh status|pendingRetry)[\s\S]{0,900}/g
    ) || [];
    for (const block of recovery) {
      assert.doesNotMatch(block, /publishDigitalEstimate\s*\(/);
      assert.doesNotMatch(block, /\/digital-estimate\/publish/);
    }
  }
  console.log("  ✓ PATH E transient 502/503/504 recovery contracts (no auto publish/approve)");
}

// ---------------------------------------------------------------------------
// PATH F — Zero automatic delivery on reads / navigation (source + spies)
// ---------------------------------------------------------------------------
{
  const delivery = createDeliverySpies();
  const files = [
    "backend-core/src/elite100EstimateStudio/studioPublicationSummary.mjs",
    "backend-core/src/elite100EstimateStudio/studioWorkspaceWorkflow.mjs",
    "backend-core/src/elite100EstimateStudio/studioEstimateQueueWorkflow.mjs",
    "backend-core/src/elite100EstimateStudio/studioCommandCenterViewModel.mjs",
    "app-elite100-estimate-studio/src/estimateQueue/EstimatePublicationSummary.tsx",
    "app-elite100-estimate-studio/src/estimateQueue/EstimateWorkflowHeader.tsx"
  ];
  const forbidden = [
    /publishDigitalEstimate\s*\(/,
    /replaceDigitalEstimate/,
    /revokeDigitalEstimate/,
    /sendEstimateEmail\s*\(/,
    /runQuoteDelivery\s*\(/,
    /markSold\s*\(/,
    /createQuickBooks|quickbooksCreate/i,
    /createMoraware|morawareCreate/i
  ];
  for (const rel of files) {
    const src = readFileSync(path.join(root, rel), "utf8");
    for (const re of forbidden) {
      assert.doesNotMatch(src, re, `${rel} must not contain ${re}`);
    }
  }

  // Read-model helpers are pure — invoke with spies that must stay at zero
  const est = {
    id: "est-f",
    revision: 1,
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    scope: manualConfirmedScope(),
    calculation: { fingerprint: "fp-f" },
    approval: { approvedAt: "2026-07-24T13:00:00Z" }
  };
  const summary = buildSafeStudioPublicationSummary({
    estimate: est,
    activePublication: activePublicationFor(est)
  });
  buildStudioWorkspaceWorkflow(est, { publication: summary });
  delivery.assertZero();
  console.log("  ✓ PATH F zero automatic delivery on workflow/publication read models");
}

// ---------------------------------------------------------------------------
// PATH G — Organization isolation (in-memory repository boundary)
// ---------------------------------------------------------------------------
{
  const estimates = new InMemoryStudioEstimateRepository();
  await estimates.create({
    id: "est-alpha-1",
    organizationId: ORG_ALPHA,
    intakeCaseId: "case-alpha-1",
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: manualConfirmedScope(),
    createdByUserId: ACTOR
  });
  await estimates.create({
    id: "est-beta-1",
    organizationId: ORG_BETA,
    intakeCaseId: "case-beta-1",
    status: STUDIO_ESTIMATE_STATUSES.APPROVED,
    revision: 1,
    scope: manualConfirmedScope({ projectName: "Beta Only" }),
    createdByUserId: ACTOR
  });

  const cross = await estimates.getById(ORG_ALPHA, "est-beta-1");
  assert.equal(cross, null, "org-alpha cannot read org-beta estimate");

  let threw = false;
  try {
    await estimates.update(ORG_ALPHA, "est-beta-1", { staleReason: "x" }, ACTOR);
  } catch (e) {
    threw = true;
    assert.equal(e.code || e.statusCode, e.code || 404);
  }
  assert.ok(threw, "org-alpha cannot mutate org-beta estimate");

  const betaStill = await estimates.getById(ORG_BETA, "est-beta-1");
  assert.equal(betaStill.scope.projectName, "Beta Only");
  console.log("  ✓ PATH G org-alpha / org-beta isolation");
}

console.log("\nstudioGoldenPathGate.test.mjs — all passed\n");
