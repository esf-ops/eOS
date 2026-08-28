import assert from "node:assert/strict";
import { classifyIdentityCase, COMPLETED_SF_BASELINE_ACCEPTANCE, baselineMonthTotals, canAutoCommit, isExactNameBulkEligible } from "./salesOpsIdentityReview.mjs";
import { createSalesOpsMemoryStore } from "./salesOpsMemoryStore.mjs";
import { createSalesOpsService, SalesOpsError } from "./salesOpsService.mjs";
import {
  COMPLETED_FIRST_INSTALL_EVENT,
  COMPLETED_INSTALLATION_SF,
  OBSERVED_WORKSHEET_FACT_COLUMNS,
  PRODUCTION_COMPLETED_INSTALLATION_SUPPORT,
  API_WORKSHEET_COMPLETED_INSTALLATION_SUPPORT,
  buildCompletedInstallationFacts,
  reverseAttributionFact
} from "./salesOpsCompletedInstallationSf.mjs";
import { WORKSHEET_FACTS_WRITER_COLUMNS } from "../moraware/morawareJobWorksheetPreparedFacts.mjs";
import {
  joinInstallActivitiesToWorksheets,
  reconcileInstallFacts,
  evaluateInstallActivitySource
} from "./salesOpsMorawareInstallEvidence.mjs";
import { payableCommissionSf, isCompensationFinallyApproved, isCommissionReportLocked } from "./salesOpsCompensation.mjs";
import { generateMilestoneRamp } from "./salesOpsMonths.mjs";
import { normalizeOrgMatchKey } from "../accountDirectory/accountDirectoryMasterList.mjs";

const ORG = "00000000-0000-4000-8000-aaaaaaaaaaaa";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";
const REP = "00000000-0000-4000-8000-0000000000aa";
const AD_A = "00000000-0000-4000-8000-0000000000a1";
const AD_B = "00000000-0000-4000-8000-0000000000a2";
const CASEY = "00000000-0000-4000-8000-0000000000cc";
const AD_C = "00000000-0000-4000-8000-0000000000a3";

function user(id, role) {
  return { id, email: `${id.slice(-4)}@example.test`, full_name: "Sentinel", role, organization_id: ORG, isActive: true };
}

async function main() {
  assert.deepEqual([...OBSERVED_WORKSHEET_FACT_COLUMNS], [...WORKSHEET_FACTS_WRITER_COLUMNS]);
  assert.equal(API_WORKSHEET_COMPLETED_INSTALLATION_SUPPORT.supported, false);
  assert.ok(API_WORKSHEET_COMPLETED_INSTALLATION_SUPPORT.missing.some((m) => /completed_install_date/i.test(m) || /first-install date/i.test(m)));
  assert.equal(PRODUCTION_COMPLETED_INSTALLATION_SUPPORT.supported, true);
  assert.equal(PRODUCTION_COMPLETED_INSTALLATION_SUPPORT.metric, COMPLETED_INSTALLATION_SF);

  const missing = buildCompletedInstallationFacts([
    { organizationId: ORG, accountDirectoryAccountId: AD_A, morawareJobId: "j1", morawareFormId: "f1", sqft: 10 }
  ]);
  assert.equal(missing.facts.length, 0);
  assert.equal(missing.skipped[0].reason, "missing_qualifying_evidence");

  const built = buildCompletedInstallationFacts([
    {
      organizationId: ORG,
      salespersonUserId: REP,
      accountDirectoryAccountId: AD_A,
      morawareAccountId: "MW-1",
      morawareJobId: "j1",
      morawareFormId: "f1",
      qualifyingEvent: COMPLETED_FIRST_INSTALL_EVENT,
      qualifyingDate: "2026-05-12",
      sqft: 574.5,
      commissionEligible: true
    },
    {
      organizationId: ORG,
      salespersonUserId: REP,
      accountDirectoryAccountId: AD_A,
      morawareJobId: "j1",
      morawareFormId: "f1",
      qualifyingEvent: COMPLETED_FIRST_INSTALL_EVENT,
      qualifyingDate: "2026-05-12",
      sqft: 574.5
    },
    {
      organizationId: ORG,
      salespersonUserId: REP,
      accountDirectoryAccountId: AD_A,
      morawareJobId: "j2",
      morawareFormId: "f2",
      qualifyingEvent: COMPLETED_FIRST_INSTALL_EVENT,
      qualifyingDate: "2026-06-03",
      sqft: 669
    },
    {
      organizationId: ORG,
      salespersonUserId: REP,
      accountDirectoryAccountId: AD_A,
      morawareJobId: "j3",
      morawareFormId: "f3",
      qualifyingEvent: COMPLETED_FIRST_INSTALL_EVENT,
      qualifyingDate: "2026-07-18",
      sqft: 334
    }
  ]);
  assert.equal(built.facts.length, 3);
  assert.ok(built.skipped.some((s) => s.reason === "duplicate_worksheet_event"));
  const totals = baselineMonthTotals(built.facts);
  assert.deepEqual(totals, COMPLETED_SF_BASELINE_ACCEPTANCE);
  const reversal = reverseAttributionFact({ ...built.facts[0], id: "fact-1" });
  assert.equal(reversal.status, "reversed");
  assert.equal(reversal.reversalOfId, "fact-1");
  assert.equal(reversal.creditedSf, -574.5);

  const srKey = normalizeOrgMatchKey("S&R Construction");
  const nameOnly = classifyIdentityCase({
    account: { mondayBoardId: "b", mondayItemId: "1", accountName: "S&R Construction" },
    mondayMatches: [],
    directoryByNorm: new Map([[srKey, [{ id: AD_A, displayName: "S&R Construction" }]]]),
    directoryNameById: new Map([[AD_A, "S&R Construction"]])
  });
  assert.equal(nameOnly.status, "REVIEW_REQUIRED");
  assert.equal(canAutoCommit(nameOnly), false);

  const exact = classifyIdentityCase({
    account: { mondayBoardId: "b", mondayItemId: "1", accountDirectoryAccountId: AD_A },
    mondayMatches: [AD_A],
    directoryNameById: new Map([[AD_A, "Canonical"]])
  });
  assert.equal(exact.status, "EXACT_SOURCE_ID");
  assert.equal(canAutoCommit(exact), true);
  assert.equal(isExactNameBulkEligible(nameOnly), true);

  const cabinetKey = normalizeOrgMatchKey("Cabinet shop");
  const weak = classifyIdentityCase({
    account: { mondayBoardId: "b", mondayItemId: "epworth", accountName: "Dyersville- Epworth Cabinet Shop" },
    mondayMatches: [],
    directoryByNorm: new Map([[cabinetKey, [{ id: AD_B, displayName: "Cabinet shop" }]]]),
    hints: [
      {
        mondayName: "Dyersville- Epworth Cabinet Shop",
        suggestedDirectoryName: "Cabinet shop",
        evidenceKind: "alias",
        strength: "weak"
      }
    ],
    directoryNameById: new Map([[AD_B, "Cabinet shop"]])
  });
  assert.equal(weak.status, "REVIEW_REQUIRED");
  assert.equal(canAutoCommit(weak), false);
  assert.equal(isExactNameBulkEligible(weak), false);
  assert.ok(weak.candidates[0].evidence.includes("starter_package_weak_alias"));

  const store = createSalesOpsMemoryStore();
  const svc = createSalesOpsService({ store });
  const admin = user(ADMIN, "admin");
  const sales = user(REP, "sales");

  store.seedDirectoryAccount({ id: AD_A, organizationId: ORG, displayName: "S&R Construction" });
  store.seedDirectoryAccount({ id: AD_B, organizationId: ORG, displayName: "Cabinet shop" });
  store.seedDirectoryAccount({ id: AD_C, organizationId: ORG, displayName: "Westfield Homes" });
  await store.upsertRepMapping({
    organizationId: ORG,
    userId: REP,
    mondayUserId: "99000001",
    salespersonLabel: "Rep Sentinel"
  });
  await store.upsertRepMapping({
    organizationId: ORG,
    userId: CASEY,
    mondayUserId: "99000002",
    salespersonLabel: "Other Sentinel"
  });
  store.seedDirectoryAlias({ organizationId: ORG, accountId: AD_A, aliasValue: "SNR Construction" });
  store.seedIdentityHint({
    organizationId: ORG,
    mondayName: "Dyersville- Epworth Cabinet Shop",
    suggestedDirectoryName: "Cabinet shop",
    evidenceKind: "alias",
    strength: "weak"
  });
  store.seedIdentityHint({
    organizationId: ORG,
    mondayName: "Allan Custom Homes",
    evidenceKind: "exclusion",
    strength: "standard"
  });
  const mondayExact = await store.upsertAccount({
    organizationId: ORG,
    mondayBoardId: "18397092941",
    mondayItemId: "exact-1",
    accountName: "Exact Linked Co",
    assignedUserId: REP,
    sourceState: "active"
  });
  store.seedMondayAccountDirectoryLink(ORG, "18397092941", "exact-1", AD_A);
  store.seedExternalLink(ORG, "moraware", "MW-9", AD_A);
  store.seedExternalLink(ORG, "quickbooks_desktop", "QB-ROOT", AD_A);
  const nameAcc = await store.upsertAccount({
    organizationId: ORG,
    mondayBoardId: "18397092941",
    mondayItemId: "name-1",
    accountName: "S&R Construction",
    assignedUserId: REP,
    sourceState: "active"
  });
  const aliasAcc = await store.upsertAccount({
    organizationId: ORG,
    mondayBoardId: "18397092941",
    mondayItemId: "alias-1",
    accountName: "SNR Construction",
    assignedUserId: REP,
    sourceState: "active"
  });
  await store.upsertAccount({
    organizationId: ORG,
    mondayBoardId: "18397092941",
    mondayItemId: "none-1",
    accountName: "Unknown Builder LLC",
    assignedUserId: REP,
    sourceState: "active"
  });
  await store.upsertAccount({
    organizationId: ORG,
    mondayBoardId: "18397092941",
    mondayItemId: "epworth-1",
    accountName: "Dyersville- Epworth Cabinet Shop",
    assignedUserId: REP,
    sourceState: "active"
  });
  await store.upsertAccount({
    organizationId: ORG,
    mondayBoardId: "18397092941",
    mondayItemId: "excl-1",
    accountName: "Allan Custom Homes",
    assignedUserId: REP,
    sourceState: "active"
  });
  await store.upsertAccount({
    organizationId: ORG,
    mondayBoardId: "18397092941",
    mondayItemId: "casey-1",
    accountName: "Westfield Homes",
    assignedUserId: CASEY,
    sourceState: "active"
  });

  await assert.rejects(() => svc.rebuildIdentityReviews(sales), (e) => e instanceof SalesOpsError && e.status === 404);
  const rebuilt = await svc.rebuildIdentityReviews(admin);
  assert.equal(rebuilt.linkingMethod, "exact_external_id_only");
  assert.equal(rebuilt.deterministicBridge, false);
  assert.equal(rebuilt.exactSourceId, 1);
  assert.equal(rebuilt.exactAutoLinkable, 1);
  assert.equal(rebuilt.autoLinked, 1);
  assert.ok(rebuilt.reviewRequired >= 2);
  assert.ok(rebuilt.noCandidate >= 1);

  const rows = await svc.listIdentityReviews(admin);
  const exactRow = rows.find((r) => r.mondayItemId === "exact-1");
  const nameRow = rows.find((r) => r.salesOpsAccountId === nameAcc.id);
  const aliasRow = rows.find((r) => r.salesOpsAccountId === aliasAcc.id);
  const noneRow = rows.find((r) => r.mondayItemId === "none-1");
  const weakRow = rows.find((r) => r.mondayItemId === "epworth-1");
  const exclRow = rows.find((r) => r.mondayItemId === "excl-1");
  assert.equal(exactRow.status, "EXACT_SOURCE_ID");
  assert.equal(exactRow.linkedAccountDirectoryAccountId, AD_A);
  assert.equal(exactRow.salespersonLabel, "Rep Sentinel");
  assert.equal(exactRow.bulkEligible, false);
  assert.equal(exactRow.candidates[0].quickbooksLinked, true);
  assert.deepEqual(exactRow.candidates[0].morawareIds, ["MW-9"]);
  assert.equal(Object.prototype.hasOwnProperty.call(exactRow.candidates[0], "quickbooksIds"), false);
  assert.equal(nameRow.status, "REVIEW_REQUIRED");
  assert.equal(nameRow.autoLinkable, false);
  assert.equal(nameRow.bulkEligible, true);
  assert.equal(aliasRow.status, "REVIEW_REQUIRED");
  assert.equal(aliasRow.bulkEligible, false);
  assert.ok(aliasRow.candidates[0].evidence.includes("exact_alias"));
  assert.equal(aliasRow.candidates[0].accountDirectoryAccountId, AD_A);
  assert.equal(noneRow.status, "NO_CANDIDATE");
  assert.equal(weakRow.status, "REVIEW_REQUIRED");
  assert.equal(weakRow.autoLinkable, false);
  assert.equal(weakRow.bulkEligible, false);
  assert.equal(exclRow.exclusionHint, true);
  assert.equal(exclRow.status, "NO_CANDIDATE");

  const afterRebuild = await store.listAccountIdentityRows(ORG);
  assert.equal(afterRebuild.find((a) => a.id === mondayExact.id).accountDirectoryAccountId, AD_A);
  assert.equal(afterRebuild.find((a) => a.id === nameAcc.id).accountDirectoryAccountId, null);

  await assert.rejects(
    () => svc.approveIdentityReview(admin, nameRow.id, { accountDirectoryAccountId: AD_B }),
    (e) => e.code === "candidate_required"
  );
  const approved = await svc.approveIdentityReview(admin, nameRow.id, {
    accountDirectoryAccountId: AD_A,
    reason: "shown exact name candidate"
  });
  assert.equal(approved.linkedAccountDirectoryAccountId, AD_A);
  const linked = await store.listActiveExternalLinks(ORG, "monday");
  assert.equal(linked.filter((l) => l.externalId === "18397092941:name-1").length, 1);
  assert.equal(linked.find((l) => l.externalId === "18397092941:name-1").accountId, AD_A);

  await assert.rejects(
    () =>
      store.insertMondayAccountDirectoryLink({
        organizationId: ORG,
        boardId: "18397092941",
        itemId: "name-1",
        accountId: AD_B
      }),
    (e) => e.code === "monday_link_conflict"
  );

  const audit = await svc.getIdentityAudit(admin);
  assert.equal(audit.accountDirectoryLinked, 2);
  assert.equal(audit.morawareLinked, 2);
  assert.equal(audit.quickbooksLinked, 2);

  const people = await svc.listAdminPeople(admin);
  assert.ok(people.some((p) => p.userId === CASEY && p.salespersonLabel === "Other Sentinel"));
  const bySalesperson = await svc.listIdentityReviews(admin, { assignedUserId: CASEY });
  assert.ok(bySalesperson.length >= 1);
  assert.ok(bySalesperson.every((r) => r.assignedUserId === CASEY));
  assert.ok(bySalesperson.some((r) => r.mondayItemId === "casey-1"));
  assert.ok(!bySalesperson.some((r) => r.mondayItemId === "name-1"));

  const packRows = await svc.listIdentityReviews(admin, { packKey: "starter_handoff_v1" });
  assert.ok(packRows.some((r) => r.mondayItemId === "epworth-1"));
  assert.ok(packRows.some((r) => r.mondayItemId === "excl-1"));

  const bulkOnly = await svc.listIdentityReviews(admin, { status: "REVIEW_REQUIRED", bulkEligible: "1" });
  assert.ok(bulkOnly.every((r) => r.bulkEligible));
  assert.ok(!bulkOnly.some((r) => r.mondayItemId === "epworth-1"));
  assert.ok(!bulkOnly.some((r) => r.mondayItemId === "alias-1"));

  await assert.rejects(() => svc.previewBulkIdentityReviews(sales, [weakRow.id]), (e) => e.status === 404);
  const caseyRow = (await svc.listIdentityReviews(admin)).find((r) => r.mondayItemId === "casey-1");
  const preview = await svc.previewBulkIdentityReviews(admin, [caseyRow.id, weakRow.id, aliasRow.id, noneRow.id]);
  assert.equal(preview.eligibleCount, 1);
  assert.equal(preview.items[0].reviewId, caseyRow.id);
  assert.equal(preview.items[0].morawareIdCount, 0);
  assert.equal(preview.items[0].quickbooksLinked, false);
  assert.ok(preview.skipped.some((s) => s.reason === "weak_alias_not_bulk_eligible"));
  assert.ok(preview.skipped.some((s) => s.reason === "not_exact_display_name"));
  assert.ok(preview.skipped.some((s) => s.reason === "no_candidate"));
  assert.equal(JSON.stringify(preview).includes("QB-ROOT"), false);

  const bulk = await svc.bulkIdentityReviews(admin, {
    action: "approve",
    reviewIds: [caseyRow.id, weakRow.id],
    reason: "bulk exact name"
  });
  assert.equal(bulk.approvedCount, 1);
  assert.ok(bulk.skipped.some((s) => s.reason === "weak_alias_not_bulk_eligible"));
  const caseyLinked = (await store.listActiveExternalLinks(ORG, "monday")).find(
    (l) => l.externalId === "18397092941:casey-1"
  );
  assert.equal(caseyLinked.accountId, AD_C);
  const events = await store.listIdentityReviewEvents(ORG);
  const bulkEvent = events.find((e) => e.action === "bulk_approve");
  assert.ok(bulkEvent);
  assert.equal(bulkEvent.actorUserId, ADMIN);
  assert.equal(bulkEvent.matchMethod, "exact_display_name");
  assert.equal(bulkEvent.accountDirectoryAccountId, AD_C);
  assert.ok(bulkEvent.priorAccountDirectoryAccountId == null);
  const stillWeak = (await store.listAccountIdentityRows(ORG)).find((a) => a.mondayItemId === "epworth-1");
  assert.equal(stillWeak.accountDirectoryAccountId, null);

  const afterBulkAudit = await svc.getIdentityAudit(admin);
  assert.equal(afterBulkAudit.accountDirectoryLinked, 3);
  assert.equal(afterBulkAudit.morawareLinked, 2);
  assert.equal(afterBulkAudit.quickbooksLinked, 2);

  await store.insertAttributionFact({
    ...built.facts[0],
    salespersonUserId: REP,
    morawareFormId: "f1"
  });
  await assert.rejects(
    () =>
      store.insertAttributionFact({
        ...built.facts[0],
        salespersonUserId: REP,
        morawareFormId: "f1"
      }),
    (e) => e.code === "duplicate_worksheet_event"
  );

  const proposal = await store.upsertCompensationProposal({
    organizationId: ORG,
    userId: REP,
    status: "proposal",
    ratePerSf: 1,
    effectiveDate: "2026-09-01",
    basis: "all_completed_sf",
    finallyApproved: false
  });
  assert.equal(isCompensationFinallyApproved(proposal), false);
  const facts = [
    {
      accountDirectoryAccountId: AD_A,
      creditedSf: 100,
      commissionEligible: true,
      qualifyingDate: "2026-07-01",
      status: "credited"
    },
    {
      accountDirectoryAccountId: AD_B,
      creditedSf: 50,
      commissionEligible: false,
      qualifyingDate: "2026-10-01",
      status: "credited"
    },
    {
      accountDirectoryAccountId: AD_A,
      creditedSf: 25,
      commissionEligible: true,
      qualifyingDate: "2026-10-01",
      status: "credited"
    }
  ];
  assert.equal(
    payableCommissionSf(facts, {
      proposalFinallyApproved: false,
      effectiveDate: "2026-09-01",
      eligibleAccountIds: new Set([AD_A])
    }),
    null
  );
  assert.equal(
    payableCommissionSf(facts, {
      proposalFinallyApproved: true,
      effectiveDate: "2026-09-01",
      eligibleAccountIds: new Set([AD_A])
    }),
    25
  );
  assert.equal(isCommissionReportLocked("PAID"), true);
  assert.equal(isCommissionReportLocked("DRAFT"), false);

  const draft = await svc.createPlanForUser(admin, {
    userId: REP,
    planName: "Milestone draft",
    startDate: "2027-01-01",
    endDate: "2027-12-31"
  });
  const generated = await svc.generateAdminRamp(admin, draft.plan.id, {
    anchors: [
      { period: "2027-01", sf: 1000 },
      { period: "2027-03", sf: 1500 },
      { period: "2027-09", sf: 2000 },
      { period: "2027-12", sf: 2500 }
    ]
  });
  assert.equal(generated.draftGenerated, true);
  assert.equal(generated.plan.status, "draft");
  assert.equal(generated.periodTargets.find((p) => p.period === "2027-12").installedTarget, 2500);
  assert.ok(!generated.periodTargets.some((p) => String(p.period).startsWith("2028")));
  assert.ok(!generated.periodTargets.some((p) => String(p.period).startsWith("2026")));
  const shape = generateMilestoneRamp([
    { period: "2027-01", sf: 1000 },
    { period: "2027-12", sf: 2500 }
  ]);
  assert.equal(shape.at(-1).period, "2027-12");

  const compensation = await svc.getCompensationConfig(admin, { admin: true });
  assert.equal(compensation.finallyApproved, false);
  assert.ok(compensation.bases.includes("incremental_above_baseline"));
  assert.ok(compensation.workflow.includes("READY_FOR_PAYMENT"));

  await assert.rejects(() => svc.listIdentityReviews(sales), (e) => e.status === 404);
  await assert.rejects(() => svc.bulkIdentityReviews(sales, { action: "approve", reviewIds: [nameRow.id] }), (e) => e.status === 404);
  await assert.rejects(() => svc.getCompensationConfig(sales, { admin: true }), (e) => e.status === 404);

  const jobGrain = joinInstallActivitiesToWorksheets({
    activities: [
      {
        sourceJobId: "j1",
        sourceActivityId: "a1",
        activityTypeName: "Install - Fox",
        activityStatusName: "Complete",
        rawPayload: { status: "Complete", activityType: "Install - Fox", job: "j1", startDate: "2026-05-12" }
      }
    ],
    worksheets: [{ sourceJobId: "j1", sourceFormId: "f1", sqft: 574.5 }]
  });
  assert.equal(jobGrain.facts.length, 0);
  assert.equal(jobGrain.nPlusOne, false);
  assert.equal(jobGrain.worksheetJoinSupported, false);
  assert.ok(jobGrain.skipped.some((s) => s.reason === "activity_missing_form_id"));
  assert.equal(evaluateInstallActivitySource(jobGrain.source ? [] : []).worksheetJoinSupported, false);
  assert.equal(evaluateInstallActivitySource(jobGrain.skipped.map(() => ({}))).worksheetJoinSupported, false);
  const observedAudit = evaluateInstallActivitySource([
    {
      activityTypeName: "Install - Fox",
      activityStatusName: "Complete",
      rawPayload: { startDate: "2026-05-12", status: "Complete", activityType: "Install - Fox" }
    }
  ]);
  assert.equal(observedAudit.withFormId, 0);
  assert.equal(observedAudit.withCompletedAt, 0);
  assert.equal(observedAudit.worksheetJoinSupported, false);

  const firstPass = joinInstallActivitiesToWorksheets({
    activities: [
      {
        sourceJobId: "j1",
        sourceFormId: "f1",
        sourceActivityId: "a-open",
        activityTypeName: "Install - Fox",
        activityStatusName: "Scheduled",
        rawPayload: { formId: "f1", status: "Scheduled" }
      }
    ],
    worksheets: [{ sourceJobId: "j1", sourceFormId: "f1", sqft: 574.5 }]
  });
  assert.equal(firstPass.facts.length, 0);
  assert.ok(firstPass.skipped.some((s) => s.reason === "missing_qualifying_event"));

  const incremental = joinInstallActivitiesToWorksheets({
    activities: [
      {
        sourceJobId: "j1",
        sourceFormId: "f1",
        sourceActivityId: "a-done",
        activityTypeName: "Install - Fox",
        activityStatusName: "Complete",
        rawPayload: { formId: "f1", status: "Complete", completedAt: "2026-05-12" }
      },
      {
        sourceJobId: "j1",
        sourceFormId: "f1",
        sourceActivityId: "a-dup",
        activityTypeName: "Install - Fox",
        activityStatusName: "Complete",
        rawPayload: { formId: "f1", status: "Complete", completedAt: "2026-05-20" }
      },
      {
        sourceJobId: "j2",
        sourceFormId: "f2",
        sourceActivityId: "a-jun",
        activityTypeName: "Install - Quartz Basic",
        activityStatusName: "Complete",
        rawPayload: { formId: "f2", completed_at: "2026-06-03", status: "Complete" }
      },
      {
        sourceJobId: "j3",
        sourceFormId: "f3",
        sourceActivityId: "a-jul",
        activityTypeName: "Install - Fox",
        activityStatusName: "Complete",
        rawPayload: { formId: "f3", completedDate: "2026-07-18", status: "Complete" }
      },
      {
        sourceJobId: "j-miss",
        sourceFormId: "f-miss",
        sourceActivityId: "a-miss",
        activityTypeName: "Install - Fox",
        activityStatusName: "Complete",
        rawPayload: { formId: "f-miss", completedAt: "2026-05-01", status: "Complete" }
      },
      {
        sourceJobId: "j-zero",
        sourceFormId: "f-zero",
        sourceActivityId: "a-zero",
        activityTypeName: "Install - Fox",
        activityStatusName: "Complete",
        rawPayload: { formId: "f-zero", completedAt: "2026-05-02", status: "Complete" }
      }
    ],
    worksheets: [
      { sourceJobId: "j1", sourceFormId: "f1", sqft: 574.5 },
      { sourceJobId: "j2", sourceFormId: "f2", sqft: 669 },
      { sourceJobId: "j3", sourceFormId: "f3", sqft: 334 },
      { sourceJobId: "j-miss", sourceFormId: "f-miss", sqft: null },
      { sourceJobId: "j-zero", sourceFormId: "f-zero", sqft: 0 }
    ]
  });
  assert.equal(incremental.nPlusOne, false);
  assert.equal(incremental.facts.length, 4);
  assert.equal(incremental.facts.find((f) => f.sourceFormId === "f1").completedFirstInstallAtSource, "2026-05-12");
  assert.equal(incremental.facts.find((f) => f.sourceFormId === "f1").sqft, 574.5);
  assert.ok(incremental.skipped.some((s) => s.reason === "duplicate_activity"));
  assert.ok(incremental.skipped.some((s) => s.reason === "missing_sqft"));
  assert.equal(incremental.facts.find((f) => f.sourceFormId === "f-zero").sqft, 0);

  const full = joinInstallActivitiesToWorksheets({
    activities: incremental.facts.slice(0, 3).map((f) => ({
      sourceJobId: f.sourceJobId,
      sourceFormId: f.sourceFormId,
      sourceActivityId: f.sourceActivityId,
      activityTypeName: f.installEventType,
      activityStatusName: "Complete",
      rawPayload: { formId: f.sourceFormId, completedAt: f.completedFirstInstallAtSource, status: "Complete" }
    })),
    worksheets: [
      { sourceJobId: "j1", sourceFormId: "f1", sqft: 574.5 },
      { sourceJobId: "j2", sourceFormId: "f2", sqft: 669 },
      { sourceJobId: "j3", sourceFormId: "f3", sqft: 334 }
    ]
  });
  const recon = reconcileInstallFacts(incremental.facts, full);
  assert.equal(recon.facts.length, 3);
  assert.ok(recon.reversed.some((f) => f.sourceFormId === "f-zero"));
  assert.equal(recon.nPlusOne, false);

  console.log("salesOpsIdentityReview.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
