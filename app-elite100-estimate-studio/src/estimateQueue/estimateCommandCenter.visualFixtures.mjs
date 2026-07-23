/**
 * Deterministic Command Center UI fixtures (sentinel data only).
 * Used by visual/regression source tests — not production traffic.
 */

/** @typedef {import('../../../backend-core/src/elite100EstimateStudio/studioCommandCenterViewModel.mjs')} VM */

export const ECC_VISUAL_FIXTURES = {
  needsTakeoffReview: {
    id: "ecc-fixture-takeoff-review",
    customerName: "Monticello Custom Interiors",
    projectName: "Nietert Kitchen",
    workflowStatus: "Takeoff draft ready",
    needsAttention: true,
    attentionReasons: ["takeoff_needs_review"],
    openTarget: "takeoff",
    assignedEstimatorLabel: "Chris Henely",
    assignedEstimatorUserId: "user-fixture-chris",
    receivedAt: "2026-07-20T10:00:00Z",
    lastActivityAt: "2026-07-21T09:00:00Z",
    roomCount: 1,
    pieceCount: 6
  },
  readyToPublish: {
    id: "ecc-fixture-ready-publish",
    customerName: "Summit Cabinetry",
    projectName: "Lakeview Remodel",
    workflowStatus: "Ready for approval",
    needsAttention: true,
    attentionReasons: ["approved_not_published"],
    openTarget: "digital",
    assignedEstimatorLabel: "Chris Henely",
    assignedEstimatorUserId: "user-fixture-chris",
    receivedAt: "2026-07-18T10:00:00Z",
    lastActivityAt: "2026-07-22T11:00:00Z",
    roomCount: 2,
    pieceCount: 11
  },
  customerConfiguring: {
    id: "ecc-fixture-customer-config",
    customerName: "Harbor Homes",
    projectName: "Bay Condo Bath",
    workflowStatus: "Published",
    needsAttention: false,
    attentionReasons: [],
    openTarget: "digital",
    assignedEstimatorLabel: "Chris Henely",
    assignedEstimatorUserId: "user-fixture-chris",
    receivedAt: "2026-07-15T10:00:00Z",
    lastActivityAt: "2026-07-19T14:00:00Z",
    roomCount: 1,
    pieceCount: 4
  },
  reviewRequested: {
    id: "ecc-fixture-review-requested",
    customerName: "Northside Design",
    projectName: "Primary Suite",
    workflowStatus: "Customer submitted",
    needsAttention: true,
    attentionReasons: ["customer_requested_changes"],
    openTarget: "review",
    assignedEstimatorLabel: "Chris Henely",
    assignedEstimatorUserId: "user-fixture-chris",
    receivedAt: "2026-07-12T10:00:00Z",
    lastActivityAt: "2026-07-22T16:00:00Z",
    roomCount: 1,
    pieceCount: 8
  },
  hardProcessingFailure: {
    id: "ecc-fixture-takeoff-failed",
    customerName: "Prairie Stone Co",
    projectName: "Workshop Sink Run",
    workflowStatus: "Takeoff failed",
    needsAttention: true,
    attentionReasons: ["failed"],
    openTarget: "takeoff",
    assignedEstimatorLabel: "Assigned estimator",
    assignedEstimatorUserId: "user-fixture-other",
    receivedAt: "2026-07-21T08:00:00Z",
    lastActivityAt: "2026-07-21T08:30:00Z",
    roomCount: 0,
    pieceCount: 0
  },
  unassignedEstimate: {
    id: "ecc-fixture-unassigned",
    customerName: "Open Intake Builder",
    projectName: "Guest Bath",
    workflowStatus: "New intake",
    needsAttention: true,
    attentionReasons: ["unopened"],
    openTarget: "takeoff",
    assignedEstimatorLabel: "Unassigned",
    assignedEstimatorUserId: null,
    receivedAt: "2026-07-22T12:00:00Z",
    lastActivityAt: null,
    roomCount: 1,
    pieceCount: 2
  },
  /** Queue API historically returned truncated UUID stubs — presentation must neutralize. */
  uuidAssigneeStub: {
    id: "ecc-fixture-uuid-assignee",
    customerName: "Identity Gap Client",
    projectName: "Unknown Owner Job",
    workflowStatus: "Takeoff draft ready",
    needsAttention: true,
    attentionReasons: ["takeoff_needs_review"],
    openTarget: "takeoff",
    assignedEstimatorLabel: "User 902c8f2c…",
    assignedEstimatorUserId: "902c8f2c-aaaa-bbbb-cccc-ddddeeee0001",
    receivedAt: "2026-07-20T10:00:00Z",
    lastActivityAt: "2026-07-20T11:00:00Z",
    roomCount: 1,
    pieceCount: 3
  },
  unknownCustomerProject: {
    id: "ecc-fixture-unknown-names",
    customerName: "",
    projectName: "",
    workflowStatus: "Takeoff draft ready",
    needsAttention: true,
    attentionReasons: ["takeoff_needs_review"],
    openTarget: "takeoff",
    assignedEstimatorLabel: "Unassigned",
    assignedEstimatorUserId: null,
    receivedAt: "2026-07-19T10:00:00Z",
    lastActivityAt: "2026-07-19T10:00:00Z",
    roomCount: 0,
    pieceCount: 0
  },
  longCustomerProjectNames: {
    id: "ecc-fixture-long-names",
    customerName:
      "Southeast Regional Architectural Millwork & Custom Interiors Collaborative LLC",
    projectName:
      "Phase 2 — Executive Hospitality Wing Island/Peninsula Complex with Full Backsplash Package",
    workflowStatus: "Scope in progress",
    needsAttention: false,
    attentionReasons: [],
    openTarget: "scope",
    assignedEstimatorLabel: "Chris Henely",
    assignedEstimatorUserId: "user-fixture-chris",
    receivedAt: "2026-07-10T10:00:00Z",
    lastActivityAt: "2026-07-18T10:00:00Z",
    roomCount: 3,
    pieceCount: 24
  },
  /** Empty page → all summary counts zero. */
  zeroCountPage: []
};

export const ECC_SUMMARY_CARD_KEYS = [
  "needs_attention",
  "in_progress",
  "ready_to_publish",
  "waiting_on_customer",
  "review_requested"
];

export const ECC_VIEWPORTS = [320, 375, 768, 1024];
