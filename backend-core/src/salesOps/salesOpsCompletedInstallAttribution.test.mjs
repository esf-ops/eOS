import assert from "node:assert/strict";
import {
  COMPLETED_SF_BASELINE_ACCEPTANCE,
  assertAttributionDoesNotRewriteHistory,
  compareCompletedSfBaseline,
  planCompletedInstallAttribution
} from "./salesOpsCompletedInstallAttribution.mjs";

const ORG = "00000000-0000-4000-8000-aaaaaaaaaaaa";
const REP = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const AD = "00000000-0000-4000-8000-0000000000ad";

const approved = [
  {
    id: "acc-1",
    organizationId: ORG,
    assignedUserId: REP,
    accountDirectoryAccountId: AD
  }
];

const links = [{ accountId: AD, externalId: "MW-1" }];

function formFact(extras) {
  return {
    id: extras.id || "prep-1",
    sourceAccountId: "MW-1",
    sourceJobId: extras.job || "j1",
    sourceFormId: extras.form || "f1",
    formIdentityStatus: extras.status || "MATCHED",
    completedInstallDate: extras.date,
    sqft: extras.sqft,
    creditable: extras.creditable !== false,
    isActive: extras.isActive !== false,
    supersededBy: extras.supersededBy || null,
    reportFeedId: "feed-1",
    reportRunId: "run-1",
    observationKey: extras.id || "obs-1"
  };
}

{
  const unapproved = planCompletedInstallAttribution({
    organizationId: ORG,
    approvedAccounts: [{ id: "acc-gap", assignedUserId: REP, accountDirectoryAccountId: null }],
    morawareLinks: links,
    formFacts: [formFact({ date: "2026-05-12", sqft: 574.5 })]
  });
  assert.equal(unapproved.plannedCount, 0);
  assert.ok(unapproved.skipped.some((s) => s.reason === "identity_not_approved"));
}

{
  const unresolved = planCompletedInstallAttribution({
    organizationId: ORG,
    approvedAccounts: approved,
    morawareLinks: links,
    formFacts: [formFact({ date: "2026-05-12", sqft: 574.5, status: "FORM_IDENTITY_UNRESOLVED" })]
  });
  assert.equal(unresolved.plannedCount, 0);
}

{
  const planned = planCompletedInstallAttribution({
    organizationId: ORG,
    approvedAccounts: approved,
    morawareLinks: links,
    formFacts: [
      formFact({ id: "m", job: "j1", form: "f1", date: "2026-05-12", sqft: 574.5 }),
      formFact({ id: "n", job: "j2", form: "f2", date: "2026-06-03", sqft: 669 }),
      formFact({ id: "o", job: "j3", form: "f3", date: "2026-07-18", sqft: 334 })
    ]
  });
  assert.equal(planned.plannedCount, 3);
  assert.equal(planned.facts[0].salespersonUserId, REP);
  assert.equal(planned.facts[0].attributionBasis, "COMPLETED_INSTALLATION_SF");
  assert.equal(planned.facts[0].qualifyingEvent, "completed_first_install");
  assert.equal(planned.facts[0].sourceLineage.formIdentityStatus, "MATCHED");
  assert.equal(planned.facts[0].ownershipEvidence.assignedUserId, REP);
  assert.equal(planned.facts[0].attributionEffectiveStart, "2026-05-12");
  assert.deepEqual(planned.monthTotals, COMPLETED_SF_BASELINE_ACCEPTANCE);
  assert.equal(planned.baseline.reconciled, true);
  assert.deepEqual(planned.baseline.difference, { may: 0, june: 0, july: 0, total: 0, average: 0 });
}

{
  const existing = [
    {
      id: "existing-1",
      organizationId: ORG,
      salespersonUserId: REP,
      morawareJobId: "j1",
      morawareFormId: "f1",
      qualifyingEvent: "completed_first_install",
      status: "credited",
      creditedSf: 574.5
    }
  ];
  const moved = planCompletedInstallAttribution({
    organizationId: ORG,
    approvedAccounts: [{ ...approved[0], assignedUserId: OTHER }],
    morawareLinks: links,
    formFacts: [formFact({ job: "j1", form: "f1", date: "2026-05-12", sqft: 574.5 })],
    existingFacts: existing
  });
  assert.equal(moved.plannedCount, 0);
  assert.equal(assertAttributionDoesNotRewriteHistory(existing, moved.facts), true);
}

{
  const mismatch = compareCompletedSfBaseline({
    may: 534.5,
    june: 513,
    july: 273,
    total: 1320.5,
    average: 440.2
  });
  assert.equal(mismatch.reconciled, false);
  assert.equal(mismatch.expected.total, 1577.5);
  assert.equal(mismatch.actual.total, 1320.5);
  assert.equal(mismatch.difference.total, -257);
}

console.log("salesOpsCompletedInstallAttribution.test.mjs: ok");
