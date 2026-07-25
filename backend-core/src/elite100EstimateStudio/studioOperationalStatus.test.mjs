/**
 * Canonical operational status adapter tests (AUDIT-001).
 * Run: node backend-core/src/elite100EstimateStudio/studioOperationalStatus.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildStudioOperationalState,
  resolveStudioOperationalKey
} from "./studioOperationalStatus.mjs";
import { buildStudioWorkspaceWorkflow } from "./studioWorkspaceWorkflow.mjs";
import { MANUAL_ESTIMATE_ORIGIN } from "./studioManualPhysicalScope.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";

console.log("\nstudioOperationalStatus.test.mjs\n");

function assertState(input, expect) {
  const s = buildStudioOperationalState(input);
  assert.equal(s.key, expect.key, `key for ${JSON.stringify(input)}`);
  assert.equal(s.primaryAction, expect.primaryAction);
  assert.equal(s.openTarget, expect.openTarget);
  assert.equal(s.needsAttention, expect.needsAttention);
  assert.equal(s.mutates, false);
  return s;
}

assertState({ workflowStatus: "New" }, {
  key: "new_request",
  primaryAction: "Open request",
  openTarget: "takeoff",
  needsAttention: true
});

assertState({ workflowStatus: "Takeoff processing" }, {
  key: "takeoff_processing",
  primaryAction: "View progress",
  openTarget: "takeoff",
  needsAttention: true
});

assertState({ workflowStatus: "Takeoff failed" }, {
  key: "takeoff_failed",
  primaryAction: "Resolve Takeoff issue",
  openTarget: "takeoff",
  needsAttention: true
});

assertState({ workflowStatus: "Needs estimator review" }, {
  key: "needs_takeoff_review",
  primaryAction: "Review AI Takeoff",
  openTarget: "takeoff",
  needsAttention: true
});

assertState(
  {
    workflowStatus: "Scope in progress",
    sourceType: "manual",
    estimateOrigin: "manual_staff",
    manualScopeConfirmed: false,
    estimateStatus: "draft"
  },
  {
    key: "needs_scope",
    primaryAction: "Complete Manual Scope",
    openTarget: "scope",
    needsAttention: true
  }
);

assertState(
  {
    workflowStatus: "Scope in progress",
    sourceType: "manual",
    estimateOrigin: "manual_staff",
    manualScopeConfirmed: false,
    estimateStatus: "ready_to_price"
  },
  {
    key: "needs_scope_confirmation",
    primaryAction: "Confirm Manual Scope",
    openTarget: "scope",
    needsAttention: true
  }
);

assertState(
  {
    workflowStatus: "Scope in progress",
    sourceType: "manual",
    estimateOrigin: "manual_staff",
    manualScopeConfirmed: true,
    estimateStatus: "ready_to_price"
  },
  {
    key: "needs_calculation",
    primaryAction: "Calculate Estimate",
    openTarget: "scope",
    needsAttention: true
  }
);

assertState(
  {
    workflowStatus: "Scope in progress",
    sourceType: "manual",
    estimateOrigin: "manual_staff",
    manualScopeConfirmed: true,
    estimateStatus: "priced"
  },
  {
    key: "needs_approval",
    primaryAction: "Approve Estimate",
    openTarget: "scope",
    needsAttention: true
  }
);

assertState(
  { workflowStatus: "Ready for approval", estimateStatus: "approved" },
  {
    key: "ready_to_publish",
    primaryAction: "Configure Digital Estimate",
    openTarget: "digital",
    needsAttention: true
  }
);

assertState(
  {
    workflowStatus: "Published",
    estimateStatus: "approved",
    publicationStatus: "active"
  },
  {
    key: "published_waiting_for_customer",
    primaryAction: "Open customer estimate",
    openTarget: "digital",
    needsAttention: false
  }
);

assertState(
  {
    workflowStatus: "Customer reviewing",
    estimateStatus: "approved",
    publicationStatus: "active",
    customerViewed: true
  },
  {
    key: "customer_viewed",
    primaryAction: "View publication details",
    openTarget: "digital",
    needsAttention: false
  }
);

assertState(
  { workflowStatus: "Customer submitted" },
  {
    key: "customer_review_requested",
    primaryAction: "Review customer request",
    openTarget: "review",
    needsAttention: true
  }
);

// Stale current revision beats historical publication
{
  const s = assertState(
    {
      workflowStatus: "Published",
      estimateStatus: "ready_to_price",
      staleReason: "Scope changed after approval",
      publicationHistorical: true,
      publicationStatus: "active",
      sourceType: "manual",
      estimateOrigin: "manual_staff",
      manualScopeConfirmed: true
    },
    {
      key: "needs_calculation",
      primaryAction: "Calculate Estimate",
      openTarget: "scope",
      needsAttention: true
    }
  );
  assert.notEqual(s.key, "published_waiting_for_customer");
  console.log("  ✓ stale revision precedes historical publication");
}

// Confirmed manual without takeoff is not takeoff_failed
{
  const key = resolveStudioOperationalKey({
    workflowStatus: "Takeoff failed",
    sourceType: "manual",
    estimateOrigin: "manual_staff",
    manualScopeConfirmed: true,
    estimateStatus: "ready_to_price"
  });
  assert.equal(key, "needs_calculation");
  console.log("  ✓ confirmed manual ignores takeoff_failed vocabulary");
}

// Cross-check with Studio workspace next action for priced estimate
{
  const wf = buildStudioWorkspaceWorkflow({
    id: "e1",
    revision: 1,
    status: STUDIO_ESTIMATE_STATUSES.PRICED,
    scope: {
      estimateOrigin: MANUAL_ESTIMATE_ORIGIN,
      physicalScopeSource: MANUAL_ESTIMATE_ORIGIN,
      manualScopeConfirmed: true,
      projectName: "X"
    },
    calculation: { fingerprint: "fp" }
  });
  const op = buildStudioOperationalState({
    sourceType: "manual",
    estimateOrigin: "manual_staff",
    manualScopeConfirmed: true,
    estimateStatus: "priced",
    workflowStatus: "Scope in progress"
  });
  assert.equal(wf.nextRequiredAction, "approve");
  assert.equal(op.key, "needs_approval");
  console.log("  ✓ queue adapter aligns with Studio approve next action");
}

assert.equal(buildStudioOperationalState({ workflowStatus: "Closed" }).key, "historical_or_closed");

console.log("\nstudioOperationalStatus.test.mjs — all passed\n");
