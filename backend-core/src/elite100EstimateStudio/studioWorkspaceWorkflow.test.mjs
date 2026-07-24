/**
 * studioWorkspaceWorkflow — unit tests
 * Run: node backend-core/src/elite100EstimateStudio/studioWorkspaceWorkflow.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildStudioWorkspaceWorkflow,
  workflowAllowsAction
} from "./studioWorkspaceWorkflow.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { MANUAL_ESTIMATE_ORIGIN } from "./studioManualPhysicalScope.mjs";

console.log("\nstudioWorkspaceWorkflow.test.mjs\n");

/** @param {boolean} confirmed */
function manualScope(confirmed) {
  return {
    estimateOrigin: MANUAL_ESTIMATE_ORIGIN,
    physicalScopeSource: MANUAL_ESTIMATE_ORIGIN,
    manualScopeConfirmed: confirmed,
    projectName: "Oak Street Kitchen"
  };
}

/** @param {object} [overrides] */
function sentinelEstimate(overrides = {}) {
  const scope = overrides.scope ?? manualScope(false);
  const { scope: _s, ...rest } = overrides;
  return {
    id: "est-sentinel-1",
    revision: 2,
    status: STUDIO_ESTIMATE_STATUSES.DRAFT,
    scope,
    ...rest
  };
}

// 1. Manual estimate unconfirmed → confirm_manual_scope; calculate blocked
{
  const wf = buildStudioWorkspaceWorkflow(sentinelEstimate());
  assert.equal(wf.nextRequiredAction, "confirm_manual_scope");
  assert.equal(wf.currentStage, "manual_scope_unconfirmed");
  assert.ok(!wf.allowedActions.includes("calculate"));
  assert.ok(
    wf.blockers.some((b) => b.code === "manual_scope_not_confirmed"),
    "manual scope blocker present"
  );
  console.log("  ✓ T1 manual unconfirmed → confirm_manual_scope; calculate blocked");
}

// 2. manualScopeDirty → save_manual_scope
{
  const wf = buildStudioWorkspaceWorkflow(
    sentinelEstimate({ scope: manualScope(true) }),
    { manualScopeDirty: true }
  );
  assert.equal(wf.nextRequiredAction, "save_manual_scope");
  assert.equal(wf.currentStage, "manual_scope_unsaved");
  assert.ok(wf.allowedActions.includes("save_manual_scope"));
  console.log("  ✓ T2 manualScopeDirty → save_manual_scope");
}

// 3. confirmed + pricingDirty → save_pricing; calculate blocked via blocker
{
  const wf = buildStudioWorkspaceWorkflow(
    sentinelEstimate({ scope: manualScope(true) }),
    { pricingDirty: true }
  );
  assert.equal(wf.nextRequiredAction, "save_pricing");
  assert.equal(wf.currentStage, "pricing_unsaved");
  assert.ok(!wf.allowedActions.includes("calculate"));
  assert.ok(
    wf.blockers.some((b) => b.code === "pricing_unsaved" && b.action === "save_pricing"),
    "pricing unsaved blocker"
  );
  console.log("  ✓ T3 confirmed + pricingDirty → save_pricing; calculate blocked");
}

// 4. confirmed + saved pricing + no calc → calculate
{
  const wf = buildStudioWorkspaceWorkflow(
    sentinelEstimate({
      status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
      scope: manualScope(true)
    })
  );
  assert.equal(wf.nextRequiredAction, "calculate");
  assert.equal(wf.currentStage, "calculation_required");
  assert.ok(wf.allowedActions.includes("calculate"));
  assert.equal(wf.calculationCurrent, false);
  console.log("  ✓ T4 confirmed + saved pricing + no calc → calculate");
}

// 5. priced + calculation fingerprint → approve
{
  const wf = buildStudioWorkspaceWorkflow(
    sentinelEstimate({
      status: STUDIO_ESTIMATE_STATUSES.PRICED,
      scope: manualScope(true),
      calculation: { fingerprint: "fp-priced-1", calculatedAt: "2026-07-24T12:00:00Z" }
    })
  );
  assert.equal(wf.nextRequiredAction, "approve");
  assert.equal(wf.currentStage, "approval_required");
  assert.ok(wf.calculationCurrent);
  assert.ok(wf.allowedActions.includes("approve"));
  console.log("  ✓ T5 priced + fingerprint → approve");
}

// 6. approved + blank project name → add_project_name
{
  const wf = buildStudioWorkspaceWorkflow(
    sentinelEstimate({
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      scope: {
        ...manualScope(true),
        projectName: ""
      },
      calculation: { fingerprint: "fp-approved-1" },
      approval: { approvedAt: "2026-07-24T13:00:00Z" }
    })
  );
  assert.equal(wf.nextRequiredAction, "add_project_name");
  assert.equal(wf.currentStage, "project_details_required");
  assert.ok(wf.blockers.some((b) => b.code === "project_name_required"));
  console.log("  ✓ T6 approved + blank project name → add_project_name");
}

// 7. approved + valid project name → configure_digital_estimate / publish allowed
{
  const wf = buildStudioWorkspaceWorkflow(
    sentinelEstimate({
      status: STUDIO_ESTIMATE_STATUSES.APPROVED,
      scope: manualScope(true),
      calculation: { fingerprint: "fp-approved-2" },
      approval: { approvedAt: "2026-07-24T13:00:00Z" }
    })
  );
  assert.equal(wf.nextRequiredAction, "configure_digital_estimate");
  assert.equal(wf.currentStage, "ready_to_publish");
  assert.ok(wf.allowedActions.includes("configure_digital_estimate"));
  assert.ok(wf.allowedActions.includes("publish"));
  assert.ok(workflowAllowsAction(wf, "publish"));
  console.log("  ✓ T7 approved + valid project name → configure / publish allowed");
}

// 8. historicalApproval appears on workflow
{
  const historical = {
    revision: 1,
    approvedAt: "2026-07-20T10:00:00Z",
    exactInternalTotal: 4520.5,
    label: "Previous revision approved: $4520.50"
  };
  const wf = buildStudioWorkspaceWorkflow(
    sentinelEstimate({
      status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE,
      scope: manualScope(true)
    }),
    { historicalApproval: historical }
  );
  assert.ok(wf.historicalApproval);
  assert.equal(wf.historicalApproval.revision, 1);
  assert.equal(wf.historicalApproval.approvedAt, historical.approvedAt);
  assert.equal(wf.historicalApproval.exactInternalTotal, 4520.5);
  assert.match(wf.historicalApproval.label, /Previous revision approved/);
  console.log("  ✓ T8 historicalApproval on workflow");
}

// 9. superseded → resolve_failure
{
  const wf = buildStudioWorkspaceWorkflow(
    sentinelEstimate({
      status: STUDIO_ESTIMATE_STATUSES.SUPERSEDED,
      scope: manualScope(true)
    })
  );
  assert.equal(wf.nextRequiredAction, "resolve_failure");
  assert.equal(wf.currentStage, "superseded");
  assert.ok(wf.blockers.some((b) => b.code === "estimate_superseded"));
  console.log("  ✓ T9 superseded → resolve_failure");
}

console.log("\nstudioWorkspaceWorkflow.test.mjs — all passed\n");
