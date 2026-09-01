import assert from "node:assert/strict";
import { generateLinearRamp, generateMilestoneRamp, mergeExplicitMonthlyTargets, uniquePeriodTargets } from "./salesOpsMonths.mjs";
import { attainmentPct, monthRow, varianceSf } from "./salesOpsPerformanceMath.mjs";
import { summarizeExactIdentity } from "./salesOpsIdentityAudit.mjs";
import { contributeByAccount, selectPlanVersionForPeriod } from "./salesOpsAttribution.mjs";
import { createSalesOpsMemoryStore } from "./salesOpsMemoryStore.mjs";
import { createSalesOpsService, SalesOpsError } from "./salesOpsService.mjs";
import { ACTUAL_SF_DEFINITION_STATUS } from "./salesOpsPerformanceMath.mjs";

const ORG = "00000000-0000-4000-8000-aaaaaaaaaaaa";
const ORG_B = "00000000-0000-4000-8000-bbbbbbbbbbbb";
const REP_A = "00000000-0000-4000-8000-0000000000aa";
const REP_B = "00000000-0000-4000-8000-0000000000bb";
const MGR = "00000000-0000-4000-8000-0000000000cc";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";
const OTHER = "00000000-0000-4000-8000-0000000000ee";
const AD_1 = "00000000-0000-4000-8000-0000000000a1";
const AD_2 = "00000000-0000-4000-8000-0000000000a2";

function user(id, role, org) {
  return { id, email: `${id.slice(-4)}@example.test`, full_name: "Sentinel", role, organization_id: org, isActive: true };
}

function wrapCounts(store) {
  const counts = {};
  const wrap = (name) => {
    const orig = store[name]?.bind(store);
    if (!orig) return;
    counts[name] = 0;
    store[name] = (...args) => {
      counts[name] += 1;
      return orig(...args);
    };
  };
  wrap("listAttributionFacts");
  wrap("listPeriodTargetsForPlanIds");
  wrap("listPlansForOrg");
  wrap("listAccountIdentityRows");
  wrap("listActiveExternalLinks");
  wrap("listAccountsForUser");
  return counts;
}

async function publishedPlan(svc, userId, periodTargets) {
  const admin = user(ADMIN, "admin", ORG);
  const created = await svc.createPlanForUser(admin, {
    userId,
    planName: "Sentinel plan",
    startDate: "2026-09-01",
    endDate: "2026-12-31",
    periodTargets
  });
  await svc.updateAdminPlan(admin, created.plan.id, { periodTargets });
  await svc.submitAdminPlan(admin, created.plan.id);
  await svc.approveAdminPlan(admin, created.plan.id);
  return svc.publishAdminPlan(admin, created.plan.id, { effectiveStartDate: "2026-09-01" });
}

async function main() {
  const ramp = generateLinearRamp({ startMonth: "2027-01", startSf: 1000, endMonth: "2027-12", endSf: 2500 });
  assert.equal(ramp[0].period, "2027-01");
  assert.equal(ramp[0].installedTarget, 1000);
  assert.equal(ramp.at(-1).period, "2027-12");
  assert.equal(ramp.at(-1).installedTarget, 2500);
  assert.equal(ramp.length, 12);
  assert.equal(new Set(ramp.map((r) => r.period)).size, 12);

  const milestones = generateMilestoneRamp([
    { period: "2027-01", sf: 1000 },
    { period: "2027-03", sf: 1500 },
    { period: "2027-09", sf: 2000 },
    { period: "2027-12", sf: 2500 }
  ]);
  assert.equal(milestones[0].period, "2027-01");
  assert.equal(milestones.at(-1).period, "2027-12");
  assert.equal(milestones.find((r) => r.period === "2027-12").installedTarget, 2500);
  assert.equal(milestones.find((r) => r.period === "2027-03").installedTarget, 1500);
  assert.equal(milestones.find((r) => r.period === "2027-09").installedTarget, 2000);
  assert.ok(!milestones.some((r) => r.period.startsWith("2028")));
  assert.ok(!milestones.some((r) => r.period.startsWith("2026")));

  assert.throws(() => uniquePeriodTargets([{ period: "2026-09", installedTarget: 1 }, { period: "2026-09", installedTarget: 2 }]));
  const merged = mergeExplicitMonthlyTargets([{ period: "2026-09", installedTarget: 50 }], "2026-09-01", "2026-11-30");
  assert.equal(merged.length, 3);
  assert.equal(merged[0].installedTarget, 50);
  assert.equal(merged[1].installedTarget, 0);

  assert.equal(varianceSf(1318, 1500), -182);
  assert.equal(attainmentPct(1318, 1500), 87.9);
  const missing = monthRow({ period: "2026-09", goalSf: 1500, actualSf: null, actualStatus: ACTUAL_SF_DEFINITION_STATUS });
  assert.equal(missing.actualSf, null);
  assert.equal(missing.varianceSf, null);
  assert.notEqual(missing.actualSf, 0);

  const identity = summarizeExactIdentity({
    salesOpsAccounts: [
      { id: "s1", mondayBoardId: "b", mondayItemId: "1", accountDirectoryAccountId: AD_1 },
      { id: "s2", mondayBoardId: "b", mondayItemId: "2", accountDirectoryAccountId: null },
      { id: "s3", mondayBoardId: "b", mondayItemId: "3", accountDirectoryAccountId: AD_2 }
    ],
    mondayLinks: [{ boardId: "b", mondayItemId: "1", accountId: AD_1 }],
    morawareLinks: [
      { externalId: "MW-1", accountId: AD_1 },
      { externalId: "MW-2", accountId: AD_1 }
    ],
    quickbooksLinks: [{ externalId: "QB-1", accountId: AD_1 }]
  });
  assert.equal(identity.salesOpsAccountsTotal, 3);
  assert.equal(identity.accountDirectoryLinked, 1);
  assert.equal(identity.unlinked, 1);
  assert.equal(identity.conflicted, 1);
  assert.equal(identity.morawareLinked, 1);
  assert.equal(identity.multiMorawareAccounts, 1);
  assert.equal(identity.quickbooksLinked, 1);
  assert.equal(identity.linkingMethod, "exact_external_id_only");

  const nameOnly = summarizeExactIdentity({
    salesOpsAccounts: [{ id: "s9", mondayBoardId: "b", mondayItemId: "99", accountDirectoryAccountId: null }],
    mondayLinks: [],
    morawareLinks: [],
    quickbooksLinks: []
  });
  assert.equal(nameOnly.accountDirectoryLinked, 0);
  assert.equal(nameOnly.unlinked, 1);

  const v1 = { id: "p1", status: "superseded", publishedAt: "2026-09-01T00:00:00Z", versionNumber: 1, effectiveStartDate: "2026-09-01", endDate: "2028-12-31" };
  const v2 = { id: "p2", status: "active", publishedAt: "2027-01-15T00:00:00Z", versionNumber: 2, effectiveStartDate: "2026-09-01", endDate: "2028-12-31" };
  assert.equal(selectPlanVersionForPeriod([v1, v2], "2026-10").id, "p1");
  assert.equal(selectPlanVersionForPeriod([v1, v2], "2027-02").id, "p2");

  const store = createSalesOpsMemoryStore();
  const counts = wrapCounts(store);
  const svc = createSalesOpsService({ store, now: () => new Date("2026-10-15T12:00:00Z") });
  const admin = user(ADMIN, "admin", ORG);
  const alex = user(REP_A, "sales", ORG);
  const blake = user(REP_B, "sales", ORG);
  const mgr = user(MGR, "sales", ORG);
  const outsider = user(OTHER, "sales", ORG_B);
  store.seedUser(admin);
  store.seedUser(alex);
  store.seedUser(blake);
  store.seedUser(mgr);
  await store.upsertRepMapping({
    organizationId: ORG,
    userId: REP_A,
    mondayUserId: "1001",
    salespersonLabel: "Alex Sentinel",
    active: true
  });

  const draft = await svc.createPlanForUser(admin, {
    userId: REP_A,
    planName: "Monthly builder",
    startDate: "2026-09-01",
    endDate: "2026-12-31"
  });
  assert.equal(draft.periodTargets.length, 4);
  assert.equal(draft.periodTargets[0].period, "2026-09");

  await svc.generateAdminRamp(admin, draft.plan.id, {
    startMonth: "2026-09",
    startSf: 1000,
    endMonth: "2026-12",
    endSf: 1300
  });
  const ramped = await svc.getAdminPlan(admin, draft.plan.id);
  assert.equal(Number(ramped.periodTargets.find((p) => p.period === "2026-09").installedTarget), 1000);
  assert.equal(Number(ramped.periodTargets.find((p) => p.period === "2026-12").installedTarget), 1300);
  const oct = ramped.periodTargets.find((p) => p.period === "2026-10");
  assert.ok(Number(oct.installedTarget) > 1000 && Number(oct.installedTarget) < 1300);

  const edited = ramped.periodTargets.map((p) => (p.period === "2026-10" ? { ...p, installedTarget: 1111 } : p));
  await svc.updateAdminPlan(admin, draft.plan.id, { periodTargets: edited });
  const afterEdit = await svc.getAdminPlan(admin, draft.plan.id);
  assert.equal(Number(afterEdit.periodTargets.find((p) => p.period === "2026-10").installedTarget), 1111);

  await assert.rejects(() => svc.generateAdminRamp(alex, draft.plan.id, { startMonth: "2026-09", startSf: 1, endMonth: "2026-12", endSf: 2 }), (e) => e instanceof SalesOpsError && e.status === 404);

  await svc.submitAdminPlan(admin, draft.plan.id);
  await svc.approveAdminPlan(admin, draft.plan.id);
  const published = await svc.publishAdminPlan(admin, draft.plan.id, { effectiveStartDate: "2026-09-01" });
  assert.equal(published.plan.status, "active");

  await assert.rejects(
    () => svc.updateAdminPlan(admin, draft.plan.id, { periodTargets: edited }),
    (e) => e.status === 409
  );

  const revision = await svc.reviseAdminPlan(admin, draft.plan.id);
  assert.equal(revision.plan.status, "draft");
  assert.equal(revision.plan.versionNumber, 2);

  const perfBeforeFacts = await svc.getMyPerformance(alex);
  assert.equal(perfBeforeFacts.currentMonth.period, "2026-10");
  assert.equal(perfBeforeFacts.currentMonth.goalSf, 1111);
  assert.equal(perfBeforeFacts.currentMonth.actualSf, null);
  assert.equal(perfBeforeFacts.currentMonth.actualStatus, ACTUAL_SF_DEFINITION_STATUS);
  assert.notEqual(perfBeforeFacts.currentMonth.actualSf, 0);
  assert.equal(perfBeforeFacts.actualSfDefinition.status, ACTUAL_SF_DEFINITION_STATUS);

  store.upsertAccount({
    id: "acc-1",
    organizationId: ORG,
    mondayBoardId: "18397092941",
    mondayItemId: "item-1",
    accountName: "Sentinel Cabinets",
    assignedUserId: REP_A,
    accountDirectoryAccountId: AD_1,
    archived: false,
    sourceState: "active"
  });
  store.seedMondayAccountDirectoryLink(ORG, "18397092941", "item-1", AD_1);
  store.seedExternalLink(ORG, "moraware", "MW-1", AD_1);
  store.seedExternalLink(ORG, "moraware", "MW-2", AD_1);
  store.seedExternalLink(ORG, "quickbooks_desktop", "QB-ROOT-1", AD_1);

  await store.insertAttributionFact({
    organizationId: ORG,
    salespersonUserId: REP_A,
    accountDirectoryAccountId: AD_1,
    salesOpsAccountId: "acc-1",
    morawareAccountId: "MW-1",
    morawareJobId: "job-oct",
    qualifyingEvent: "sentinel_test_event",
    qualifyingDate: "2026-10-08",
    performanceMonth: "2026-10",
    creditedSf: 200,
    attributionBasis: "explicit_fact"
  });

  const perf = await svc.getMyPerformance(alex, { includeAccounts: true });
  assert.equal(perf.currentMonth.actualSf, 200);
  assert.equal(perf.currentMonth.actualStatus, "AVAILABLE");
  assert.equal(perf.currentMonth.varianceSf, 200 - 1111);
  assert.equal(perf.accounts[0].accountDirectoryAccountId, AD_1);
  assert.equal(perf.accounts[0].canOpenWorkspace, true);

  store.upsertAccount({
    id: "acc-1",
    organizationId: ORG,
    mondayBoardId: "18397092941",
    mondayItemId: "item-1",
    accountName: "Sentinel Cabinets",
    assignedUserId: REP_B,
    accountDirectoryAccountId: AD_1,
    archived: false,
    sourceState: "active"
  });
  const afterMove = await svc.getMyPerformance(alex, { includeAccounts: true, period: "2026-10" });
  assert.equal(afterMove.currentMonth.actualSf, 200);
  assert.equal(afterMove.accounts[0].canOpenWorkspace, false);
  assert.equal(afterMove.accounts[0].accountName, null);

  const blakeOct = await svc.getMyPerformance(blake, { period: "2026-10" });
  assert.equal(blakeOct.currentMonth.actualSf, null);

  await store.insertAttributionFact({
    organizationId: ORG,
    salespersonUserId: REP_A,
    accountDirectoryAccountId: AD_1,
    salesOpsAccountId: "acc-1",
    morawareJobId: "job-oct-rev",
    qualifyingEvent: "sentinel_test_event",
    qualifyingDate: "2026-10-20",
    performanceMonth: "2026-10",
    creditedSf: -40,
    status: "reversed",
    attributionBasis: "explicit_fact"
  });
  const reversed = await svc.getMyPerformance(alex, { period: "2026-10" });
  assert.equal(reversed.currentMonth.actualSf, 160);

  await assert.rejects(() => svc.getScopedPerformance(blake, REP_A), (e) => e.status === 404);
  await svc.assignManager(admin, { managerUserId: MGR, reportUserId: REP_A, canViewCommission: false, canMutateAccounts: false });
  const mgrView = await svc.getScopedPerformance(mgr, REP_A, { period: "2026-10" });
  assert.equal(mgrView.currentMonth.actualSf, 160);
  await assert.rejects(() => svc.getScopedPerformance(mgr, REP_B), (e) => e.status === 404);

  const team = await svc.getTeamPerformance(admin);
  assert.ok(team.rows.some((r) => r.userId === REP_A && r.actualSf === 160));
  assert.equal(team.rows.find((r) => r.userId === REP_A).displayName, "Alex Sentinel");
  assert.notEqual(team.rows.find((r) => r.userId === REP_A).displayName, REP_A);
  assert.ok(!String(team.rows.find((r) => r.userId === REP_A).displayName).includes(REP_A.slice(0, 8)));
  const mgrTeam = await svc.getTeamPerformance(mgr);
  assert.equal(mgrTeam.rows.some((r) => r.userId === REP_A), true);
  assert.equal(mgrTeam.rows.some((r) => r.userId === REP_B), false);
  await assert.rejects(() => svc.getTeamPerformance(blake), (e) => e.status === 404);
  await assert.rejects(() => svc.getIdentityAudit(alex), (e) => e.status === 404);
  await assert.rejects(() => svc.getScopedPerformance(outsider, REP_A), (e) => e.status === 404);

  const audit = await svc.getIdentityAudit(admin);
  assert.equal(audit.accountDirectoryLinked, 1);
  assert.equal(audit.morawareLinked, 1);
  assert.equal(audit.multiMorawareAccounts, 1);
  assert.equal(audit.quickbooksLinked, 1);

  counts.listAttributionFacts = 0;
  counts.listPeriodTargetsForPlanIds = 0;
  counts.listPlansForOrg = 0;
  await svc.getTeamPerformance(admin);
  assert.equal(counts.listAttributionFacts, 1);
  assert.equal(counts.listPeriodTargetsForPlanIds, 1);
  assert.equal(counts.listPlansForOrg, 1);

  const contrib = contributeByAccount(
    [
      { accountDirectoryAccountId: AD_1, creditedSf: 80, salespersonUserId: REP_A, salesOpsAccountId: "acc-1" },
      { accountDirectoryAccountId: AD_2, creditedSf: 20, salespersonUserId: REP_A, salesOpsAccountId: "hidden" }
    ],
    { inScopeSalesOpsAccountIds: new Set(["acc-1"]) }
  );
  assert.equal(contrib[0].canOpenWorkspace, true);
  assert.equal(contrib[1].canOpenWorkspace, false);

  await store.insertAttributionFact({
    organizationId: ORG,
    salespersonUserId: REP_B,
    accountDirectoryAccountId: AD_1,
    salesOpsAccountId: "acc-1",
    morawareJobId: "job-may-blake",
    qualifyingEvent: "sentinel_test_event",
    qualifyingDate: "2026-05-08",
    performanceMonth: "2026-05",
    creditedSf: 100,
    attributionBasis: "explicit_fact"
  });
  const blakeNoPlan = await svc.getMyPerformance(blake);
  assert.equal(blakeNoPlan.readiness.attributionActive, true);
  assert.equal(blakeNoPlan.readiness.publishedPlanAvailable, false);
  assert.equal(blakeNoPlan.readiness.actualSfAvailable, true);
  assert.equal(blakeNoPlan.ytd.actualSf, 100);
  assert.equal(blakeNoPlan.currentMonth.actualSf, 0);
  assert.equal(blakeNoPlan.currentMonth.goalSf, null);
  assert.equal(blakeNoPlan.currentMonth.varianceSf, null);
  assert.equal(blakeNoPlan.currentMonth.actualStatus, "AVAILABLE");
  assert.equal(blakeNoPlan.actualSfDefinition.status, "AVAILABLE");
  assert.equal(blakeNoPlan.months.find((m) => m.period === "2026-05").actualSf, 100);

  const operating = await svc.getOperatingView(admin, REP_B);
  assert.equal(operating.readiness.actualSfAvailable, true);
  assert.equal(operating.readiness.publishedPlanAvailable, false);
  assert.equal(operating.performance.ytd.actualSf, 100);
  assert.equal(operating.plan, null);
  assert.ok(operating.assignedCount >= 0);

  const scopedAcc = await svc.getScopedAccounts(admin, REP_B, { limit: 50 });
  assert.equal(typeof scopedAcc.assignedCount, "number");
  assert.equal(scopedAcc.assignedUserId, REP_B);
  await assert.rejects(() => svc.getScopedAccounts(blake, REP_A), (e) => e.status === 404);
  await assert.rejects(() => svc.listOperatingPeople(blake), (e) => e.status === 404);
  const people = await svc.listOperatingPeople(admin);
  assert.ok(people.people.some((p) => p.userId === REP_A && p.displayName === "Alex Sentinel"));

  const bookNoPlan = await svc.getBookIntelligenceForUser(admin, REP_B);
  assert.ok(bookNoPlan.accounts);
  assert.equal(bookNoPlan.canOpenIdentityReview, true);

  await publishedPlan(svc, REP_B, mergeExplicitMonthlyTargets([], "2026-09-01", "2026-12-31"));
  console.log("salesOpsPerformance.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
