import assert from "node:assert/strict";
import {
  ACCOUNT_INTELLIGENCE_THRESHOLDS,
  WORKING_MILESTONE_ANCHORS,
  WORKING_TARGET_HORIZON_END,
  assembleBookIntelligence,
  classifyAccountEvidence,
  generatePlanCopy,
  readPlanBook
} from "./salesOpsAccountIntelligence.mjs";
import { generateMilestoneRamp } from "./salesOpsMonths.mjs";
import { createSalesOpsMemoryStore } from "./salesOpsMemoryStore.mjs";
import { createSalesOpsService, SalesOpsError } from "./salesOpsService.mjs";

const ORG = "00000000-0000-4000-8000-aaaaaaaaaaaa";
const REP = "00000000-0000-4000-8000-0000000000aa";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";
const AD = "00000000-0000-4000-8000-0000000000ad";
const AS_OF = "2026-08-15T12:00:00.000Z";

function fact(period, sf, extras = {}) {
  return {
    salespersonUserId: REP,
    accountDirectoryAccountId: AD,
    performanceMonth: period,
    creditedSf: sf,
    status: "credited",
    ...extras
  };
}

function months(sfByPeriod) {
  return Object.entries(sfByPeriod).map(([period, sf]) => fact(period, sf));
}

{
  assert.equal(ACCOUNT_INTELLIGENCE_THRESHOLDS.status, "proposed_default");
  assert.equal(WORKING_TARGET_HORIZON_END, "2027-12-31");
  const ramp = generateMilestoneRamp(WORKING_MILESTONE_ANCHORS);
  assert.equal(ramp.find((r) => r.period === "2027-01").installedTarget, 1000);
  assert.equal(ramp.find((r) => r.period === "2027-03").installedTarget, 1500);
  assert.equal(ramp.find((r) => r.period === "2027-09").installedTarget, 2000);
  assert.equal(ramp.find((r) => r.period === "2027-12").installedTarget, 2500);
  assert.ok(!ramp.some((r) => String(r.period).startsWith("2026")));
  assert.ok(!ramp.some((r) => String(r.period).startsWith("2028")));
  assert.equal(ramp.find((r) => r.period === "2027-02").installedTarget, 1250);
}

{
  const gap = classifyAccountEvidence(
    { id: "acc-gap", accountName: "Unlinked Cabinets", accountDirectoryAccountId: null },
    months({ "2026-07": 400, "2026-08": 400 }),
    { asOf: AS_OF }
  );
  assert.equal(gap.suggestedCategory, "IDENTITY_DATA_GAP");
  assert.equal(gap.reasonCode, "identity_review_required");
  assert.equal(gap.trailingCompletedSf, null);
  assert.equal(gap.productionStatus, "IDENTITY_APPROVAL_REQUIRED");
  assert.equal(gap.reasonCopy, "Production unavailable — identity review required");
}

{
  const none = classifyAccountEvidence(
    { id: "acc-new", accountName: "New Shop", accountDirectoryAccountId: AD },
    [],
    { asOf: AS_OF }
  );
  assert.equal(none.suggestedCategory, "NEW_UNPROVEN");
  assert.equal(none.trailingCompletedSf, null);
  assert.equal(none.productionStatus, "NO_PRODUCTION_EVIDENCE");
  assert.notEqual(none.trailingCompletedSf, 0);
}

{
  const facts = months({
    "2026-03": 200,
    "2026-04": 210,
    "2026-05": 190,
    "2026-06": 205,
    "2026-07": 200,
    "2026-08": 198
  });
  const anchor = classifyAccountEvidence(
    { id: "acc-anchor", accountName: "Anchor Shop", accountDirectoryAccountId: AD },
    facts,
    { asOf: AS_OF }
  );
  assert.equal(anchor.suggestedCategory, "ANCHOR");
  assert.equal(anchor.reasonCode, "stable_producing_base");
  assert.match(anchor.reasonCopy, /Produced in 5 of last 6 months|Produced in 6 of last 6 months/);
}

{
  const facts = months({
    "2026-02": 400,
    "2026-03": 380,
    "2026-05": 120,
    "2026-08": 80
  });
  const down = classifyAccountEvidence(
    { id: "acc-down", accountName: "Sliding Shop", accountDirectoryAccountId: AD, nextContact: "2026-07-01" },
    facts,
    { asOf: AS_OF }
  );
  assert.equal(down.suggestedCategory, "NEEDS_ATTENTION");
  assert.ok(["trailing_decline", "decline_and_overdue", "contact_overdue"].includes(down.reasonCode));
}

{
  const facts = months({
    "2025-11": 500,
    "2025-12": 480,
    "2026-01": 460
  });
  const dormant = classifyAccountEvidence(
    { id: "acc-sleep", accountName: "Quiet Shop", accountDirectoryAccountId: AD },
    facts,
    { asOf: AS_OF }
  );
  assert.equal(dormant.suggestedCategory, "REACTIVATION");
  assert.equal(dormant.reasonCode, "dormant_historical_producer");
  assert.match(dormant.reasonCopy, /No completed-install SF in 120 days/);
}

{
  const facts = months({
    "2026-04": 50,
    "2026-07": 90,
    "2026-08": 140
  });
  const growth = classifyAccountEvidence(
    { id: "acc-grow", accountName: "Rising Shop", accountDirectoryAccountId: AD },
    facts,
    { asOf: AS_OF }
  );
  assert.ok(["GROWTH_OPPORTUNITY", "NEW_UNPROVEN", "ANCHOR"].includes(growth.suggestedCategory));
}

{
  const book = assembleBookIntelligence(
    [
      {
        id: "acc-gap",
        accountName: "Gap Cabinets",
        accountDirectoryAccountId: null,
        mondayItemId: "item-secret"
      },
      {
        id: "acc-anchor",
        accountName: "Anchor Shop",
        accountDirectoryAccountId: AD,
        nextStrategicMilestone: "Q4 review"
      }
    ],
    months({
      "2026-03": 200,
      "2026-04": 210,
      "2026-05": 190,
      "2026-06": 205,
      "2026-07": 200,
      "2026-08": 198
    }),
    {
      asOf: AS_OF,
      salespersonUserId: REP,
      planBook: {
        selectedAccountIds: ["acc-anchor"],
        categoryOverrides: { "acc-anchor": "GROWTH_OPPORTUNITY" }
      }
    }
  );
  const blob = JSON.stringify(book.accounts);
  assert.equal(blob.includes("item-secret"), false);
  assert.equal(blob.includes("accountDirectoryAccountId"), false);
  assert.equal(blob.includes("mondayItemId"), false);
  const gap = book.accounts.find((a) => a.salesOpsAccountId === "acc-gap");
  assert.equal(gap.trailingCompletedSf, null);
  assert.equal(gap.suggestedCategory, "IDENTITY_DATA_GAP");
  const overridden = book.accounts.find((a) => a.salesOpsAccountId === "acc-anchor");
  assert.equal(overridden.suggestedCategory, "ANCHOR");
  assert.equal(overridden.appliedCategory, "GROWTH_OPPORTUNITY");
  assert.equal(overridden.overrideCategory, "GROWTH_OPPORTUNITY");
  assert.equal(overridden.selected, true);
  assert.equal(overridden.nextStrategicMilestone, "Q4 review");
  assert.equal(overridden.financialEnrichment.status, "UNAVAILABLE");
}

{
  const copy = generatePlanCopy({
    salespersonName: "Alex Sentinel",
    territoryName: "Cedar Valley / 380 Corridor",
    northStarTarget: 2500,
    northStarTargetDate: "2027-12-31"
  });
  assert.match(copy.introduction, /2,500 installed SF/);
  assert.match(copy.successDefinition, /Completed Installation SF|completed-install/i);
}

{
  const parsed = readPlanBook({
    planBook: { selectedAccountIds: ["a"], categoryOverrides: { a: "ANCHOR" } }
  });
  assert.deepEqual(parsed.selectedAccountIds, ["a"]);
  assert.equal(parsed.categoryOverrides.a, "ANCHOR");
}

{
  const store = createSalesOpsMemoryStore();
  const svc = createSalesOpsService({
    store,
    monday: {},
    now: () => new Date(AS_OF)
  });
  const admin = {
    id: ADMIN,
    email: "admin@example.test",
    full_name: "Admin",
    role: "admin",
    organization_id: ORG,
    isActive: true
  };
  const sales = {
    id: REP,
    email: "rep@example.test",
    full_name: "Alex Sentinel",
    role: "sales",
    organization_id: ORG,
    isActive: true
  };

  store.upsertAccount({
    id: "acc-live",
    organizationId: ORG,
    mondayBoardId: "board",
    mondayItemId: "item-live",
    accountDirectoryAccountId: AD,
    accountName: "Live Cabinets",
    assignedUserId: REP,
    sourceState: "active",
    archived: false,
    lastContact: "2026-08-01",
    nextContact: "2026-08-20",
    nextStrategicMilestone: "Sample drop"
  });
  store.upsertAccount({
    id: "acc-gap",
    organizationId: ORG,
    mondayBoardId: "board",
    mondayItemId: "item-gap",
    accountDirectoryAccountId: null,
    accountName: "Unlinked Cabinets",
    assignedUserId: REP,
    sourceState: "active",
    archived: false
  });
  await store.insertAttributionFact({
    organizationId: ORG,
    salespersonUserId: REP,
    accountDirectoryAccountId: AD,
    salesOpsAccountId: "acc-live",
    morawareJobId: "job-1",
    qualifyingEvent: "sentinel_test_event",
    qualifyingDate: "2026-08-08",
    performanceMonth: "2026-08",
    creditedSf: 220
  });

  const draft = await svc.createPlanForUser(admin, { userId: REP, planName: "Working draft" });
  assert.equal(String(draft.plan.endDate).slice(0, 7), "2027-12");
  assert.equal(Number(draft.plan.northStarTarget), 2500);
  assert.ok(draft.metricTargets.some((m) => m.metricKey === "meaningful_touches"));
  assert.equal(draft.plan.rhythms.weekly.includes("pipeline"), true);

  const intel = await svc.getAdminBookIntelligence(admin, draft.plan.id);
  const live = intel.accounts.find((a) => a.accountName === "Live Cabinets");
  const gap = intel.accounts.find((a) => a.accountName === "Unlinked Cabinets");
  assert.equal(gap.suggestedCategory, "IDENTITY_DATA_GAP");
  assert.equal(gap.trailingCompletedSf, null);
  assert.equal(JSON.stringify(intel).includes("item-gap"), false);
  assert.equal(JSON.stringify(intel.accounts).includes(AD), false);
  const beforeSf = live.trailingCompletedSf;
  const beforeCategory = live.suggestedCategory;

  await svc.updateAdminPlan(admin, draft.plan.id, {
    accountExpectations: {
      planBook: {
        selectedAccountIds: [live.salesOpsAccountId],
        categoryOverrides: { [live.salesOpsAccountId]: "NEEDS_ATTENTION" }
      }
    }
  });
  const after = await svc.getAdminBookIntelligence(admin, draft.plan.id);
  const afterLive = after.accounts.find((a) => a.accountName === "Live Cabinets");
  assert.equal(afterLive.trailingCompletedSf, beforeSf);
  assert.equal(afterLive.suggestedCategory, beforeCategory);
  assert.equal(afterLive.appliedCategory, "NEEDS_ATTENTION");
  const stored = await store.getAccount(ORG, "acc-live");
  assert.equal(stored.accountDirectoryAccountId, AD);
  assert.equal(stored.nextStrategicMilestone, "Sample drop");

  await assert.rejects(() => svc.getAdminBookIntelligence(sales, draft.plan.id), (e) => e instanceof SalesOpsError && e.status === 404);

  const proto = await svc.createPlanForUser(admin, { userId: REP, usePrototype: true, planName: "Prototype reference" });
  assert.equal(proto.plan.isPrototype, true);
  assert.equal(String(proto.plan.northStarTargetDate).slice(0, 4), "2028");
  assert.equal(Number(proto.periodTargets.find((p) => p.period === "2027-01")?.installedTarget), 850);

  const generated = await svc.generateAdminRamp(admin, draft.plan.id, {
    anchors: WORKING_MILESTONE_ANCHORS.map((a) => ({ ...a }))
  });
  assert.equal(generated.plan.status, "draft");
  assert.equal(Number(generated.periodTargets.find((p) => p.period === "2027-01").installedTarget), 1000);
  assert.equal(Number(generated.periodTargets.find((p) => p.period === "2027-03").installedTarget), 1500);
  assert.equal(Number(generated.periodTargets.find((p) => p.period === "2027-09").installedTarget), 2000);
  assert.equal(Number(generated.periodTargets.find((p) => p.period === "2027-12").installedTarget), 2500);
  const sep2026 = generated.periodTargets.find((p) => p.period === "2026-09");
  if (sep2026) assert.notEqual(Number(sep2026.installedTarget), 1000);

  await svc.submitAdminPlan(admin, draft.plan.id);
  await svc.approveAdminPlan(admin, draft.plan.id);
  const published = await svc.publishAdminPlan(admin, draft.plan.id, { effectiveStartDate: "2026-08-01" });
  assert.equal(published.plan.status, "active");
  await assert.rejects(
    () => svc.updateAdminPlan(admin, draft.plan.id, { northStarTarget: 1 }),
    (e) => e instanceof SalesOpsError && e.code === "immutable_plan"
  );

  const mine = await svc.getMyPlanBookIntelligence(sales);
  assert.equal(mine.accounts.find((a) => a.accountName === "Live Cabinets").appliedCategory, "NEEDS_ATTENTION");
}

console.log("salesOpsAccountIntelligence.test.mjs: ok");
