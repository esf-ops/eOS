import assert from "node:assert/strict";
import {
  BASELINE_BUCKETS,
  reconcileCompletedSfBaselineGap,
  suggestAssignedUserId
} from "./salesOpsBaselineGap.mjs";
import { COMPLETED_SF_BASELINE_ACCEPTANCE, STARTER_PACK_KEY } from "./salesOpsIdentityReview.mjs";

const REP = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const AD = "00000000-0000-4000-8000-0000000000ad";

function hint(mondayName, suggested = mondayName, extras = {}) {
  return {
    packKey: STARTER_PACK_KEY,
    mondayName,
    suggestedDirectoryName: suggested,
    evidenceKind: extras.kind || "alias",
    strength: extras.strength || "standard"
  };
}

function account(id, name, assignedUserId, extras = {}) {
  return {
    id,
    accountName: name,
    assignedUserId,
    mondayAssignedUserId: assignedUserId ? "99" : null,
    accountDirectoryAccountId: extras.ad || null
  };
}

function review(salesOpsAccountId, status, extras = {}) {
  return {
    salesOpsAccountId,
    status,
    linkedAccountDirectoryAccountId: extras.ad || null,
    candidates: extras.candidates || [],
    evidence: extras.evidence || [],
    conflictReason: extras.conflictReason || null
  };
}

function fact({ mw, date, sqft, name = null, status = "MATCHED", creditable = true }) {
  return {
    sourceAccountId: mw,
    completedInstallDate: date,
    sqft,
    accountName: name,
    formIdentityStatus: status,
    creditable,
    isActive: true
  };
}

{
  const hints = [
    hint("S&R Construction"),
    hint("KDN Builders", "KDN Builders"),
    hint("Cabinet Studio Inc", "Cabinet Studio"),
    hint("Van Dyke Construction", "Van Dyke Construction Co. LLC"),
    hint("Dyersville- Ries Design", "Ries Design"),
    hint("Dyersville-Builders Select", "Builders Select Cedar Falls"),
    hint("Signature Homes"),
    hint("BoWood Company"),
    hint("Dyersville- Ubben's Building Supplies, Inc.", "Ubben's Building Supplies, Inc."),
    hint("Dyersville- Epworth Cabinet Shop", "Cabinet shop", { strength: "weak" }),
    hint("TW Homes", null, { kind: "exclusion" })
  ];
  const accounts = [
    account("a-sr", "S&R Construction", REP, { ad: AD }),
    account("a-kdn", "KDN Builders", REP, { ad: "ad-kdn" }),
    account("a-cs", "Cabinet Studio", REP, { ad: "ad-cs" }),
    account("a-vd", "Van Dyke Construction Co. LLC", REP, { ad: "ad-vd" }),
    account("a-ries", "Ries Design", REP),
    account("a-bs", "Builders Select Cedar Falls", REP),
    account("a-sig", "Signature Homes", REP, { ad: "ad-sig" }),
    account("a-bo", "BoWood Company", REP, { ad: "ad-bo" }),
    account("a-ub", "Ubben's Building Supplies, Inc.", REP, { ad: "ad-ub" }),
    account("a-cab", "Cabinet shop", REP),
    account("a-extra", "Current Only Builder", REP, { ad: "ad-extra" }),
    account("a-tw", "TW Homes", OTHER)
  ];
  const reviews = [
    review("a-sr", "EXACT_SOURCE_ID", { ad: AD, candidates: [{ accountDirectoryAccountId: AD, evidence: ["existing_monday_external_link"], morawareIds: ["mw-sr"] }] }),
    review("a-kdn", "EXACT_SOURCE_ID", { ad: "ad-kdn", candidates: [{ accountDirectoryAccountId: "ad-kdn", evidence: ["existing_monday_external_link"], morawareIds: ["mw-kdn"] }] }),
    review("a-cs", "EXACT_SOURCE_ID", { ad: "ad-cs", candidates: [{ accountDirectoryAccountId: "ad-cs", evidence: ["existing_monday_external_link"], morawareIds: ["mw-cs"] }] }),
    review("a-vd", "EXACT_SOURCE_ID", { ad: "ad-vd", candidates: [{ accountDirectoryAccountId: "ad-vd", evidence: ["existing_monday_external_link"], morawareIds: ["mw-vd"] }] }),
    review("a-ries", "NO_CANDIDATE"),
    review("a-bs", "NO_CANDIDATE"),
    review("a-sig", "EXACT_SOURCE_ID", { ad: "ad-sig", candidates: [{ accountDirectoryAccountId: "ad-sig", evidence: ["existing_monday_external_link"], morawareIds: ["mw-sig"] }] }),
    review("a-bo", "EXACT_SOURCE_ID", { ad: "ad-bo", candidates: [{ accountDirectoryAccountId: "ad-bo", evidence: ["existing_monday_external_link"], morawareIds: ["mw-bo"] }] }),
    review("a-ub", "EXACT_SOURCE_ID", { ad: "ad-ub", candidates: [{ accountDirectoryAccountId: "ad-ub", evidence: ["existing_monday_external_link"], morawareIds: ["mw-ub"] }] }),
    review("a-cab", "NO_CANDIDATE"),
    review("a-extra", "EXACT_SOURCE_ID", { ad: "ad-extra", candidates: [{ accountDirectoryAccountId: "ad-extra", evidence: ["existing_monday_external_link"], morawareIds: ["mw-extra"] }] })
  ];
  const morawareLinks = [
    { accountId: AD, externalId: "mw-sr" },
    { accountId: "ad-kdn", externalId: "mw-kdn" },
    { accountId: "ad-cs", externalId: "mw-cs" },
    { accountId: "ad-vd", externalId: "mw-vd" },
    { accountId: "ad-sig", externalId: "mw-sig" },
    { accountId: "ad-bo", externalId: "mw-bo" },
    { accountId: "ad-ub", externalId: "mw-ub" },
    { accountId: "ad-extra", externalId: "mw-extra" }
  ];
  const formFacts = [
    fact({ mw: "mw-sr", date: "2026-05-10", sqft: 107 }),
    fact({ mw: "mw-sr", date: "2026-06-10", sqft: 95.5 }),
    fact({ mw: "mw-sr", date: "2026-07-10", sqft: 210 }),
    fact({ mw: "mw-kdn", date: "2026-05-10", sqft: 38 }),
    fact({ mw: "mw-kdn", date: "2026-06-10", sqft: 197 }),
    fact({ mw: "mw-kdn", date: "2026-07-10", sqft: 39 }),
    fact({ mw: "mw-cs", date: "2026-05-10", sqft: 187 }),
    fact({ mw: "mw-cs", date: "2026-06-10", sqft: 69 }),
    fact({ mw: "mw-vd", date: "2026-05-10", sqft: 148.5 }),
    fact({ mw: "mw-sig", date: "2026-06-10", sqft: 89.5 }),
    fact({ mw: "mw-bo", date: "2026-05-10", sqft: 54 }),
    fact({ mw: "mw-ub", date: "2026-07-10", sqft: 24 }),
    fact({ mw: "mw-ries", date: "2026-06-10", sqft: 129, name: "Dyersville- Ries Design" }),
    fact({ mw: "mw-bs", date: "2026-05-10", sqft: 40, name: "Dyersville-Builders Select" }),
    fact({ mw: "mw-bs", date: "2026-07-10", sqft: 61, name: "Dyersville-Builders Select" }),
    fact({ mw: "mw-cab", date: "2026-06-10", sqft: 89, name: "Dyersville- Epworth Cabinet Shop" }),
    fact({ mw: "mw-extra", date: "2026-06-10", sqft: 62 })
  ];
  const names = [
    { externalId: "mw-ries", accountName: "Dyersville- Ries Design" },
    { externalId: "mw-bs", accountName: "Dyersville-Builders Select" },
    { externalId: "mw-cab", accountName: "Dyersville- Epworth Cabinet Shop" }
  ];

  const report = reconcileCompletedSfBaselineGap({
    assignedUserId: REP,
    hints,
    accounts,
    reviews,
    morawareLinks,
    formFacts,
    morawareAccountNames: names,
    labelByUser: new Map([[REP, "Rep Sentinel"], [OTHER, "Other Sentinel"]])
  });

  assert.equal(report.attributionWrites, false);
  assert.equal(report.nameMatchedReconstruction.reconciled, true);
  assert.equal(report.nameMatchedReconstruction.actual.total, COMPLETED_SF_BASELINE_ACCEPTANCE.total);
  assert.equal(report.nameMatchedReconstruction.actual.may, 574.5);
  assert.equal(report.nameMatchedReconstruction.actual.june, 669);
  assert.equal(report.nameMatchedReconstruction.actual.july, 334);
  assert.equal(report.stableIdReconstruction.actual.total, 1258.5);
  assert.equal(report.authoritativeReconstruction.actual.total, 1258.5);
  assert.equal(report.currentApprovedIdentitySf.total, 1258.5);
  assert.equal(report.historicalApprovedMappingSf.total, 0);
  assert.equal(report.diagnosticPotentialReconstruction.actual.total, 1258.5);
  assert.equal(report.unresolvedStableIdSf, 319);
  assert.equal(report.verdict, "IDENTITY_APPROVAL_REQUIRED");
  assert.equal(report.activationGate, "BASELINE_MISMATCH");
  assert.equal(report.identityApprovalRequired, true);
  assert.equal(report.historicalOwnershipGapFound, false);
  assert.equal(report.currentBookVsHistoricalBook.both.accounts, 10);
  assert.equal(report.currentBookVsHistoricalBook.historicalOnly.accounts, 0);
  assert.equal(report.currentBookVsHistoricalBook.currentOnly.accounts, 1);
  assert.equal(report.currentBookVsHistoricalBook.currentOnly.sf, 62);
  assert.equal(report.currentBookPreviewGapSf, 257);
  const byLetter = Object.fromEntries(report.gapByCause.map((r) => [r.letter, r.totalSf]));
  assert.equal(byLetter.A, 1258.5);
  assert.equal(byLetter.D, 319);
  assert.equal(byLetter.E, 0);
  assert.equal(report.reviewQueue[0].accountName, "Ries Design");
  assert.equal(report.reviewQueue[0].totalSf, 129);
  assert.equal(report.reviewQueue[0].bucket, BASELINE_BUCKETS.D);
  assert.ok(report.reviewQueue.find((r) => r.accountName === "Cabinet shop")?.requiredAction.includes("Weak"));
  assert.equal(report.historicalAccounts.some((r) => r.accountName === "TW Homes"), false);
  assert.equal(JSON.stringify(report).includes(AD), false);
}

{
  const mapped = reconcileCompletedSfBaselineGap({
    assignedUserId: REP,
    hints: [
      {
        packKey: STARTER_PACK_KEY,
        mondayName: "Dyersville- Epworth Cabinet Shop",
        suggestedDirectoryName: "Cabinet shop",
        evidenceKind: "alias",
        strength: "weak",
        accountDirectoryAccountId: "ad-epworth",
        historicalIdentityStatus: "approved"
      }
    ],
    accounts: [account("a-cab", "Cabinet shop", REP)],
    reviews: [
      review("a-cab", "NO_CANDIDATE", {
        evidence: ["possible_duplicate_of"],
        conflictReason: "POSSIBLE_DUPLICATE_OF Epworth Cabinet Shop (Monday item exact-item)"
      })
    ],
    morawareLinks: [{ accountId: "ad-epworth", externalId: "mw-cab" }],
    formFacts: [fact({ mw: "mw-cab", date: "2026-06-10", sqft: 89, name: "Dyersville- Epworth Cabinet Shop" })],
    morawareAccountNames: [{ externalId: "mw-cab", accountName: "Dyersville- Epworth Cabinet Shop" }],
    labelByUser: new Map([[REP, "Rep Sentinel"]])
  });
  assert.equal(mapped.stableIdReconstruction.actual.total, 89);
  assert.equal(mapped.stableIdReconstruction.actual.june, 89);
  assert.equal(mapped.historicalApprovedMappingSf.total, 89);
  assert.equal(mapped.currentApprovedIdentitySf.total, 0);
  assert.equal(mapped.authoritativeReconstruction.reconciled, false);
  assert.equal(mapped.gapByCause.find((r) => r.letter === "A").totalSf, 89);
  assert.equal(mapped.historicalAccounts[0].accountDirectoryCandidateStatus, "historical_alias_approved");
  assert.ok(mapped.historicalAccounts[0].requiredAction.includes("POSSIBLE_DUPLICATE_OF"));
  assert.equal(mapped.historicalAccounts[0].identityStatus, "NO_CANDIDATE");
}

{
  const report = reconcileCompletedSfBaselineGap({
    assignedUserId: REP,
    hints: [hint("Anchor Homes")],
    accounts: [account("moved", "Anchor Homes", OTHER, { ad: AD })],
    reviews: [
      review("moved", "EXACT_SOURCE_ID", {
        ad: AD,
        candidates: [{ accountDirectoryAccountId: AD, evidence: ["existing_monday_external_link"], morawareIds: ["mw-1"] }]
      })
    ],
    morawareLinks: [{ accountId: AD, externalId: "mw-1" }],
    formFacts: [fact({ mw: "mw-1", date: "2026-05-01", sqft: 40 })],
    labelByUser: new Map([[OTHER, "Other Sentinel"]])
  });
  assert.equal(report.historicalOwnershipGapFound, true);
  assert.equal(report.gapByCause.find((r) => r.letter === "E").totalSf, 40);
  assert.equal(report.currentBookVsHistoricalBook.historicalOnly.accounts, 1);
  assert.ok(report.reviewQueue[0].requiredAction.includes("Current Monday owner"));
}

{
  const pending = reconcileCompletedSfBaselineGap({
    assignedUserId: REP,
    hints: [hint("Pending Exact Co")],
    accounts: [account("p1", "Pending Exact Co", REP)],
    reviews: [
      review("p1", "REVIEW_REQUIRED", {
        candidates: [
          {
            accountDirectoryAccountId: AD,
            evidence: ["exact_display_name"],
            morawareIds: ["mw-p"]
          }
        ],
        evidence: ["exact_display_name"]
      })
    ],
    morawareLinks: [{ accountId: AD, externalId: "mw-p" }],
    formFacts: [fact({ mw: "mw-p", date: "2026-05-02", sqft: 10 })]
  });
  assert.equal(pending.gapByCause.find((r) => r.letter === "B").totalSf, 10);
  assert.equal(pending.reviewQueue[0].accountDirectoryCandidateStatus, "pending_exact");
  assert.equal(pending.diagnosticPotentialReconstruction.actual.total, 10);
  assert.equal(pending.authoritativeReconstruction.actual.total, 0);
  assert.equal(pending.activationGate, "BASELINE_MISMATCH");
  assert.equal(pending.identityApprovalRequired, true);
}

{
  const hints = [
    hint("S&R Construction"),
    hint("KDN Builders"),
    hint("Cabinet Studio Inc", "Cabinet Studio"),
    hint("Van Dyke Construction", "Van Dyke Construction Co. LLC"),
    hint("Dyersville- Ries Design", "Ries Design"),
    hint("Dyersville-Builders Select", "Builders Select Cedar Falls"),
    hint("Signature Homes"),
    hint("BoWood Company"),
    hint("Dyersville- Ubben's Building Supplies, Inc.", "Ubben's Building Supplies, Inc."),
    {
      packKey: STARTER_PACK_KEY,
      mondayName: "Dyersville- Epworth Cabinet Shop",
      suggestedDirectoryName: "Cabinet shop",
      evidenceKind: "alias",
      strength: "weak",
      accountDirectoryAccountId: "ad-epworth",
      historicalIdentityStatus: "approved"
    }
  ];
  const accounts = [
    account("a-sr", "S&R Construction", REP, { ad: AD }),
    account("a-kdn", "KDN Builders", REP, { ad: "ad-kdn" }),
    account("a-cs", "Cabinet Studio", REP, { ad: "ad-cs" }),
    account("a-vd", "Van Dyke Construction Co. LLC", REP, { ad: "ad-vd" }),
    account("a-ries", "Ries Design", REP, { ad: "ad-ries" }),
    account("a-bs", "Builders Select Cedar Falls", REP, { ad: "ad-bs" }),
    account("a-sig", "Signature Homes", REP, { ad: "ad-sig" }),
    account("a-bo", "BoWood Company", REP, { ad: "ad-bo" }),
    account("a-ub", "Ubben's Building Supplies, Inc.", REP, { ad: "ad-ub" }),
    account("a-cab", "Cabinet shop", REP)
  ];
  const reviews = [
    review("a-sr", "EXACT_SOURCE_ID", { ad: AD }),
    review("a-kdn", "EXACT_SOURCE_ID", { ad: "ad-kdn" }),
    review("a-cs", "EXACT_SOURCE_ID", { ad: "ad-cs" }),
    review("a-vd", "EXACT_SOURCE_ID", { ad: "ad-vd" }),
    review("a-ries", "EXACT_SOURCE_ID", { ad: "ad-ries" }),
    review("a-bs", "EXACT_SOURCE_ID", { ad: "ad-bs" }),
    review("a-sig", "EXACT_SOURCE_ID", { ad: "ad-sig" }),
    review("a-bo", "EXACT_SOURCE_ID", { ad: "ad-bo" }),
    review("a-ub", "EXACT_SOURCE_ID", { ad: "ad-ub" }),
    review("a-cab", "NO_CANDIDATE", {
      evidence: ["possible_duplicate_of"],
      conflictReason: "POSSIBLE_DUPLICATE_OF Epworth Cabinet Shop"
    })
  ];
  const morawareLinks = [
    { accountId: AD, externalId: "mw-sr" },
    { accountId: "ad-kdn", externalId: "mw-kdn" },
    { accountId: "ad-cs", externalId: "mw-cs" },
    { accountId: "ad-vd", externalId: "mw-vd" },
    { accountId: "ad-ries", externalId: "mw-ries" },
    { accountId: "ad-bs", externalId: "mw-bs" },
    { accountId: "ad-sig", externalId: "mw-sig" },
    { accountId: "ad-bo", externalId: "mw-bo" },
    { accountId: "ad-ub", externalId: "mw-ub" },
    { accountId: "ad-epworth", externalId: "mw-cab" }
  ];
  const formFacts = [
    fact({ mw: "mw-sr", date: "2026-05-10", sqft: 107 }),
    fact({ mw: "mw-sr", date: "2026-06-10", sqft: 95.5 }),
    fact({ mw: "mw-sr", date: "2026-07-10", sqft: 210 }),
    fact({ mw: "mw-kdn", date: "2026-05-10", sqft: 38 }),
    fact({ mw: "mw-kdn", date: "2026-06-10", sqft: 197 }),
    fact({ mw: "mw-kdn", date: "2026-07-10", sqft: 39 }),
    fact({ mw: "mw-cs", date: "2026-05-10", sqft: 187 }),
    fact({ mw: "mw-cs", date: "2026-06-10", sqft: 69 }),
    fact({ mw: "mw-vd", date: "2026-05-10", sqft: 148.5 }),
    fact({ mw: "mw-ries", date: "2026-06-10", sqft: 129 }),
    fact({ mw: "mw-bs", date: "2026-05-10", sqft: 40 }),
    fact({ mw: "mw-bs", date: "2026-07-10", sqft: 61 }),
    fact({ mw: "mw-sig", date: "2026-06-10", sqft: 89.5 }),
    fact({ mw: "mw-bo", date: "2026-05-10", sqft: 54 }),
    fact({ mw: "mw-ub", date: "2026-07-10", sqft: 24 }),
    fact({ mw: "mw-cab", date: "2026-06-10", sqft: 89 })
  ];
  const report = reconcileCompletedSfBaselineGap({
    assignedUserId: REP,
    hints,
    accounts,
    reviews,
    morawareLinks,
    formFacts
  });
  assert.equal(report.currentApprovedIdentitySf.may, 574.5);
  assert.equal(report.currentApprovedIdentitySf.june, 580);
  assert.equal(report.currentApprovedIdentitySf.july, 334);
  assert.equal(report.currentApprovedIdentitySf.total, 1488.5);
  assert.equal(report.historicalApprovedMappingSf.may, 0);
  assert.equal(report.historicalApprovedMappingSf.june, 89);
  assert.equal(report.historicalApprovedMappingSf.july, 0);
  assert.equal(report.historicalApprovedMappingSf.total, 89);
  assert.equal(report.totalAuthoritativeSf.total, 1577.5);
  assert.equal(report.authoritativeReconstruction.reconciled, true);
  assert.equal(report.activationGate, "BASELINE_RECONCILED");
  assert.equal(report.identityApprovalRequired, false);
  assert.equal(report.historicalAccounts.find((r) => r.accountName === "Cabinet shop").attributionAuthority, "historical_mapping");
  assert.equal(report.historicalAccounts.find((r) => r.accountName === "Ries Design").attributionAuthority, "monday_approved");
}

assert.equal(
  suggestAssignedUserId(
    [account("a", "S&R Construction", REP), account("b", "Other", OTHER)],
    [hint("S&R Construction")]
  ),
  REP
);

console.log("salesOpsBaselineGap.test.mjs: ok");
