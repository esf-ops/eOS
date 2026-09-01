import assert from "node:assert/strict";
import {
  ACCOUNT_INTELLIGENCE_RULESET,
  ACCOUNT_INTELLIGENCE_VERSION,
  WORKING_MILESTONE_ANCHORS,
  WORKING_TARGET_HORIZON_END,
  assembleBookIntelligence,
  classifyAccountEvidence,
  filterBookAccounts,
  generatePlanCopy,
  readPlanBook,
  sortBookAccounts
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

function classify(accountExtras, sfByPeriod) {
  return classifyAccountEvidence(
    { id: "acc", accountName: "Sentinel Account", accountDirectoryAccountId: AD, ...accountExtras },
    months(sfByPeriod),
    { asOf: AS_OF }
  );
}

{
  assert.equal(ACCOUNT_INTELLIGENCE_RULESET.version, "sales_account_intelligence_v1");
  assert.equal(ACCOUNT_INTELLIGENCE_RULESET.status, "governed_v1");
  assert.equal(ACCOUNT_INTELLIGENCE_VERSION, "sales_account_intelligence_v1");
  assert.equal(ACCOUNT_INTELLIGENCE_RULESET.lookbackMonths, 6);
  assert.equal(ACCOUNT_INTELLIGENCE_RULESET.anchorProducingMonths, 5);
  assert.equal(ACCOUNT_INTELLIGENCE_RULESET.comparisonWindowDays, 90);
  assert.equal(ACCOUNT_INTELLIGENCE_RULESET.growthPct, 15);
  assert.equal(ACCOUNT_INTELLIGENCE_RULESET.watchDeclinePct, 15);
  assert.equal(ACCOUNT_INTELLIGENCE_RULESET.attentionDeclinePct, 25);
  assert.equal(ACCOUNT_INTELLIGENCE_RULESET.reactivationDays, 120);
  assert.equal(ACCOUNT_INTELLIGENCE_RULESET.growthMinPriorSf, 100);
  assert.equal(WORKING_TARGET_HORIZON_END, "2027-12-31");
  const ramp = generateMilestoneRamp(WORKING_MILESTONE_ANCHORS);
  assert.equal(ramp.find((r) => r.period === "2027-01").installedTarget, 1000);
}

{
  const gap = classifyAccountEvidence(
    { id: "acc-gap", accountName: "Unlinked Cabinets", accountDirectoryAccountId: null },
    months({ "2026-07": 400, "2026-08": 400 }),
    { asOf: AS_OF }
  );
  assert.equal(gap.suggestedRole, null);
  assert.equal(gap.suggestedHealth, "DATA_GAP");
  assert.equal(gap.trailingCompletedSf, null);
  assert.equal(gap.productionStatus, "IDENTITY_APPROVAL_REQUIRED");
  assert.ok(gap.reasons.includes("Production history unavailable until account identity is resolved."));
}

{
  const none = classify({}, {});
  assert.equal(none.suggestedRole, "NEW_UNPROVEN");
  assert.equal(none.suggestedHealth, "HEALTHY");
  assert.equal(none.trailingCompletedSf, null);
  assert.equal(none.productionStatus, "NO_PRODUCTION_EVIDENCE");
  assert.notEqual(none.trailingCompletedSf, 0);
}

{
  const anchor = classify({ nextStrategicMilestone: "Q4 review" }, {
    "2026-03": 200,
    "2026-04": 210,
    "2026-05": 190,
    "2026-06": 205,
    "2026-07": 200,
    "2026-08": 198
  });
  assert.equal(anchor.suggestedRole, "ANCHOR");
  assert.equal(anchor.producingMonths, 6);
  assert.equal(anchor.lookbackMonths, 6);
  assert.match(anchor.reasonCopy, /Produced in 6 of last 6 months/);
}

{
  const five = classify({ nextStrategicMilestone: "Review" }, {
    "2026-03": 200,
    "2026-04": 200,
    "2026-06": 200,
    "2026-07": 200,
    "2026-08": 200
  });
  assert.equal(five.suggestedRole, "ANCHOR");
  assert.equal(five.producingMonths, 5);
}

{
  const combo = classify({ nextStrategicMilestone: "Review" }, {
    "2026-02": 400,
    "2026-03": 400,
    "2026-04": 400,
    "2026-05": 200,
    "2026-06": 200,
    "2026-07": 200,
    "2026-08": 200
  });
  assert.equal(combo.suggestedRole, "ANCHOR");
  assert.equal(combo.suggestedHealth, "NEEDS_ATTENTION");
  assert.ok(combo.changePct <= -25);
  assert.match(combo.reasonCopy, /Trailing 90-day SF down/);
}

{
  const overdue = classify(
    { nextContact: "2026-08-03", nextStrategicMilestone: "Review" },
    {
      "2026-03": 200,
      "2026-04": 200,
      "2026-05": 200,
      "2026-06": 200,
      "2026-07": 200,
      "2026-08": 200
    }
  );
  assert.equal(overdue.suggestedRole, "ANCHOR");
  assert.equal(overdue.suggestedHealth, "WATCH");
  assert.equal(overdue.overdueDays, 12);
  assert.ok(overdue.reasons.some((r) => r === "Next contact overdue 12 days"));
}

{
  const watch = classify({ nextStrategicMilestone: "Review" }, {
    "2026-02": 334,
    "2026-03": 333,
    "2026-04": 333,
    "2026-05": 200,
    "2026-06": 200,
    "2026-07": 200,
    "2026-08": 200
  });
  assert.equal(watch.suggestedRole, "ANCHOR");
  assert.equal(watch.suggestedHealth, "WATCH");
  assert.ok(watch.changePct <= -15 && watch.changePct > -25);
}

{
  const growth = classify(
    { nextContact: "2026-08-01", nextStrategicMilestone: "Review" },
    {
      "2026-02": 200,
      "2026-07": 120,
      "2026-08": 130
    }
  );
  assert.equal(growth.suggestedRole, "GROWTH_OPPORTUNITY");
  assert.equal(growth.suggestedHealth, "WATCH");
  assert.ok(growth.changePct >= 15);
}

{
  const growthExact = classify({ nextStrategicMilestone: "Review" }, {
    "2026-02": 200,
    "2026-08": 230
  });
  assert.equal(growthExact.suggestedRole, "GROWTH_OPPORTUNITY");
  assert.equal(growthExact.changePct, 15);
  assert.equal(growthExact.suggestedHealth, "HEALTHY");
}

{
  const noisy = classify({ nextStrategicMilestone: "Review" }, {
    "2026-02": 10,
    "2026-08": 20
  });
  assert.notEqual(noisy.suggestedRole, "GROWTH_OPPORTUNITY");
}

{
  const dormant = classify({ nextStrategicMilestone: "Review" }, {
    "2025-11": 500,
    "2025-12": 480,
    "2026-01": 460
  });
  assert.equal(dormant.suggestedRole, "REACTIVATION");
  assert.equal(dormant.suggestedHealth, "NEEDS_ATTENTION");
  assert.ok(dormant.reasons.some((r) => r.includes("No completed-install production in 120 days")));
}

{
  const exactly120 = classifyAccountEvidence(
    { id: "acc", accountName: "Sentinel Account", accountDirectoryAccountId: AD, nextStrategicMilestone: "Review" },
    [fact("2026-04", 400, { qualifyingDate: "2026-04-17" })],
    { asOf: AS_OF }
  );
  assert.equal(exactly120.suggestedRole, "REACTIVATION");
  assert.equal(exactly120.suggestedHealth, "NEEDS_ATTENTION");
}

{
  const under120 = classifyAccountEvidence(
    { id: "acc", accountName: "Sentinel Account", accountDirectoryAccountId: AD, nextStrategicMilestone: "Review" },
    [fact("2026-04", 400, { qualifyingDate: "2026-04-18" })],
    { asOf: AS_OF }
  );
  assert.notEqual(under120.suggestedRole, "REACTIVATION");
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
      "2026-02": 400,
      "2026-03": 400,
      "2026-04": 400,
      "2026-05": 200,
      "2026-06": 200,
      "2026-07": 200,
      "2026-08": 200
    }),
    {
      asOf: AS_OF,
      salespersonUserId: REP,
      planBook: {
        selectedAccountIds: ["acc-anchor"],
        roleOverrides: { "acc-anchor": "GROWTH_OPPORTUNITY" },
        healthOverrides: { "acc-anchor": "WATCH" }
      }
    }
  );
  assert.equal(book.ruleset.version, "sales_account_intelligence_v1");
  const blob = JSON.stringify(book.accounts);
  assert.equal(blob.includes("item-secret"), false);
  assert.equal(blob.includes("accountDirectoryAccountId"), false);
  assert.equal(blob.includes("mondayItemId"), false);
  const gap = book.accounts.find((a) => a.salesOpsAccountId === "acc-gap");
  assert.equal(gap.trailingCompletedSf, null);
  assert.equal(gap.suggestedHealth, "DATA_GAP");
  assert.equal(gap.appliedHealth, "DATA_GAP");
  assert.equal(gap.suggestedRole, null);
  const overridden = book.accounts.find((a) => a.salesOpsAccountId === "acc-anchor");
  assert.equal(overridden.suggestedRole, "ANCHOR");
  assert.equal(overridden.suggestedHealth, "NEEDS_ATTENTION");
  assert.equal(overridden.appliedRole, "GROWTH_OPPORTUNITY");
  assert.equal(overridden.appliedHealth, "WATCH");
  assert.equal(overridden.trailingCompletedSf, overridden.trailingCompletedSf);
  assert.equal(overridden.selected, true);
}

{
  const sorted = sortBookAccounts([
    { accountName: "Zeta", appliedRole: "NEW_UNPROVEN", appliedHealth: "HEALTHY" },
    { accountName: "Beta", appliedRole: "ANCHOR", appliedHealth: "HEALTHY" },
    { accountName: "Alpha", appliedRole: "ANCHOR", appliedHealth: "NEEDS_ATTENTION" },
    { accountName: "Delta", appliedRole: "REACTIVATION", appliedHealth: "NEEDS_ATTENTION" },
    { accountName: "Gamma", appliedRole: "GROWTH_OPPORTUNITY", appliedHealth: "NEEDS_ATTENTION" },
    { accountName: "Epsilon", appliedRole: "GROWTH_OPPORTUNITY", appliedHealth: "HEALTHY" },
    { accountName: "Eta", appliedRole: null, appliedHealth: "DATA_GAP" }
  ]);
  assert.deepEqual(
    sorted.map((r) => r.accountName),
    ["Alpha", "Gamma", "Delta", "Epsilon", "Beta", "Zeta", "Eta"]
  );
  const filtered = filterBookAccounts(sorted, { role: "ANCHOR", health: "NEEDS_ATTENTION" });
  assert.deepEqual(filtered.map((r) => r.accountName), ["Alpha"]);
}

{
  const parsed = readPlanBook({
    planBook: {
      selectedAccountIds: ["a"],
      categoryOverrides: { a: "NEEDS_ATTENTION", b: "ANCHOR" }
    }
  });
  assert.equal(parsed.healthOverrides.a, "NEEDS_ATTENTION");
  assert.equal(parsed.roleOverrides.b, "ANCHOR");
}

{
  const copy = generatePlanCopy({
    salespersonName: "Alex Sentinel",
    territoryName: "Cedar Valley / 380 Corridor",
    northStarTarget: 2500,
    northStarTargetDate: "2027-12-31"
  });
  assert.match(copy.introduction, /2,500 installed SF/);
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
  const intel = await svc.getAdminBookIntelligence(admin, draft.plan.id);
  assert.equal(intel.ruleset.version, "sales_account_intelligence_v1");
  const live = intel.accounts.find((a) => a.accountName === "Live Cabinets");
  const gap = intel.accounts.find((a) => a.accountName === "Unlinked Cabinets");
  assert.equal(gap.suggestedHealth, "DATA_GAP");
  assert.equal(gap.trailingCompletedSf, null);
  assert.equal(JSON.stringify(intel.accounts).includes("item-gap"), false);
  assert.equal(JSON.stringify(intel.accounts).includes(AD), false);
  const beforeSf = live.trailingCompletedSf;
  const beforeRole = live.suggestedRole;
  const beforeHealth = live.suggestedHealth;

  await svc.updateAdminPlan(admin, draft.plan.id, {
    accountExpectations: {
      planBook: {
        selectedAccountIds: [live.salesOpsAccountId],
        roleOverrides: { [live.salesOpsAccountId]: "GROWTH_OPPORTUNITY" },
        healthOverrides: { [live.salesOpsAccountId]: "NEEDS_ATTENTION" }
      }
    }
  });
  const after = await svc.getAdminBookIntelligence(admin, draft.plan.id);
  const afterLive = after.accounts.find((a) => a.accountName === "Live Cabinets");
  assert.equal(afterLive.trailingCompletedSf, beforeSf);
  assert.equal(afterLive.suggestedRole, beforeRole);
  assert.equal(afterLive.suggestedHealth, beforeHealth);
  assert.equal(afterLive.appliedRole, "GROWTH_OPPORTUNITY");
  assert.equal(afterLive.appliedHealth, "NEEDS_ATTENTION");
  const stored = await store.getAccount(ORG, "acc-live");
  assert.equal(stored.accountDirectoryAccountId, AD);
  assert.equal(stored.nextStrategicMilestone, "Sample drop");

  await assert.rejects(() => svc.getAdminBookIntelligence(sales, draft.plan.id), (e) => e instanceof SalesOpsError && e.status === 404);

  const proto = await svc.createPlanForUser(admin, { userId: REP, usePrototype: true, planName: "Prototype reference" });
  assert.equal(proto.plan.isPrototype, true);

  const generated = await svc.generateAdminRamp(admin, draft.plan.id, {
    anchors: WORKING_MILESTONE_ANCHORS.map((a) => ({ ...a }))
  });
  assert.equal(generated.plan.status, "draft");
  assert.equal(Number(generated.periodTargets.find((p) => p.period === "2027-12").installedTarget), 2500);

  await svc.submitAdminPlan(admin, draft.plan.id);
  await svc.approveAdminPlan(admin, draft.plan.id);
  const published = await svc.publishAdminPlan(admin, draft.plan.id, { effectiveStartDate: "2026-08-01" });
  assert.equal(published.plan.status, "active");
  await assert.rejects(
    () => svc.updateAdminPlan(admin, draft.plan.id, { northStarTarget: 1 }),
    (e) => e instanceof SalesOpsError && e.code === "immutable_plan"
  );

  const mine = await svc.getMyPlanBookIntelligence(sales);
  assert.equal(mine.accounts.find((a) => a.accountName === "Live Cabinets").appliedRole, "GROWTH_OPPORTUNITY");
  assert.equal(mine.accounts.find((a) => a.accountName === "Live Cabinets").appliedHealth, "NEEDS_ATTENTION");
}

console.log("salesOpsAccountIntelligence.test.mjs: ok");
