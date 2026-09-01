/**
 * May–July completed-install baseline gap reconcilation.
 * Historical book is starter_handoff_v1 alias evidence, not current Monday ownership.
 * Does not write sales_ops_sf_attribution_facts. Does not auto-approve identity.
 */

import { normalizeOrgMatchKey } from "../accountDirectory/accountDirectoryMasterList.mjs";
import {
  COMPLETED_SF_BASELINE_ACCEPTANCE,
  STARTER_PACK_KEY,
  WEAK_ALIAS_EVIDENCE,
  BULK_EXACT_NAME_EVIDENCE,
  compareCompletedSfBaseline,
  isExactSourceIdStatus
} from "./salesOpsIdentityReview.mjs";
import {
  identityOwnershipLabel,
  identityOwnershipState,
  resolveSalespersonDisplayName,
  UNKNOWN_SALESPERSON_LABEL
} from "./salesOpsSalespersonLabel.mjs";

export const BASELINE_GAP_PACK_KEY = STARTER_PACK_KEY;
export const BASELINE_WINDOW = Object.freeze({
  from: "2026-05-01",
  toExclusive: "2026-08-01"
});

export const BASELINE_BUCKETS = Object.freeze({
  A: "A_APPROVED_IDENTITY_MORAWARE",
  B: "B_EXACT_CANDIDATE_PENDING",
  C: "C_CANDIDATE_NO_MORAWARE",
  D: "D_NO_CANDIDATE",
  E: "E_HISTORICAL_NOT_CURRENT_OWNER",
  F: "F_UNRESOLVED_FORM_IDENTITY",
  G: "G_DEDUPE_OR_EXCLUSION",
  H: "H_OTHER"
});

const BUCKET_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H"];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function emptyMonths() {
  return { may: 0, june: 0, july: 0, total: 0 };
}

function addMonths(target, month, sf) {
  const n = round2(sf);
  if (!n) return;
  if (month === "may") target.may = round2(target.may + n);
  else if (month === "june") target.june = round2(target.june + n);
  else if (month === "july") target.july = round2(target.july + n);
  target.total = round2(target.may + target.june + target.july);
}

export function baselineMonthFromDate(date) {
  const s = String(date || "").slice(0, 10);
  if (s >= "2026-05-01" && s < "2026-06-01") return "may";
  if (s >= "2026-06-01" && s < "2026-07-01") return "june";
  if (s >= "2026-07-01" && s < "2026-08-01") return "july";
  return null;
}

function nkey(value) {
  return normalizeOrgMatchKey(value);
}

function unique(values) {
  return [...new Set((values || []).map((v) => String(v || "").trim()).filter(Boolean))];
}

function hintKeys(hint) {
  return unique([hint.mondayName, hint.suggestedDirectoryName]).map(nkey).filter(Boolean);
}

export function historicalAliasHints(hints, packKey = BASELINE_GAP_PACK_KEY) {
  return (hints || []).filter(
    (h) => String(h.packKey || BASELINE_GAP_PACK_KEY) === String(packKey) && h.evidenceKind === "alias"
  );
}

export function historicalExclusionHints(hints, packKey = BASELINE_GAP_PACK_KEY) {
  return (hints || []).filter(
    (h) => String(h.packKey || BASELINE_GAP_PACK_KEY) === String(packKey) && h.evidenceKind === "exclusion"
  );
}

function isWeakHint(hint) {
  return hint?.strength === "weak" || String(hint?.notes || "").toLowerCase().includes("least exact");
}

function isActiveFact(fact) {
  if (!fact) return false;
  if (fact.isActive === false) return false;
  if (fact.supersededBy) return false;
  return true;
}

function isMatchedCreditable(fact) {
  if (!isActiveFact(fact)) return false;
  if (String(fact.formIdentityStatus || fact.form_identity_status || "") !== "MATCHED") return false;
  if (fact.creditable === false) return false;
  return true;
}

function factSf(fact) {
  const n = Number(fact?.sqft);
  return Number.isFinite(n) ? n : 0;
}

function factDate(fact) {
  return fact?.completedInstallDate || fact?.completed_install_date || null;
}

function morawareIdsForAd(morawareByAccount, adId) {
  return [...(morawareByAccount.get(String(adId || "")) || [])];
}

function reviewForAccount(reviewsByAccountId, accountId) {
  return reviewsByAccountId.get(String(accountId || "")) || null;
}

function candidateAd(review, account) {
  const approved = String(account?.accountDirectoryAccountId || review?.linkedAccountDirectoryAccountId || "").trim();
  if (approved) return approved;
  const candidates = review?.candidates || [];
  if (candidates.length === 1) return String(candidates[0].accountDirectoryAccountId || "").trim() || null;
  return null;
}

function exactPending(review) {
  if (!review || isExactSourceIdStatus(review.status)) return false;
  if (review.status !== "REVIEW_REQUIRED") return false;
  const candidates = review.candidates || [];
  if (candidates.length !== 1) return false;
  const evidence = unique([...(review.evidence || []), ...(candidates[0].evidence || [])]);
  if (evidence.includes(WEAK_ALIAS_EVIDENCE) || candidates[0].hintStrength === "weak") return false;
  return evidence.includes(BULK_EXACT_NAME_EVIDENCE);
}

function requiredAction(bucket, { weak = false, exclusion = false } = {}) {
  if (exclusion || bucket === "G") {
    return "Leave excluded. Starter-pack exclusions are not commissionable and are not part of the May–July baseline.";
  }
  if (bucket === "A") return "No identity action. Do not write attribution until the acceptance gate passes for the full historical book.";
  if (bucket === "B") return "Human-approve the exact 1:1 Account Directory candidate in Identity Review. Do not auto-approve.";
  if (bucket === "C") {
    return "Human-approve the Account Directory candidate, then confirm an exact Moraware link exists before crediting.";
  }
  if (bucket === "D") {
    if (weak) {
      return "Weak starter alias. Human confirmation required. Never bulk-approve. Find the Account Directory account and Moraware link without creating a directory row from the Monday name alone.";
    }
    return "Resolve why this Monday account has no Account Directory candidate. Do not create a directory account from the Monday name. Then approve the exact link and confirm Moraware.";
  }
  if (bucket === "E") {
    return "Keep historical starter-book credit. Current Monday owner is CRM visibility only and must not erase May–July attribution.";
  }
  if (bucket === "F") return "Resolve the Moraware job/form identity. Unresolved form facts are not creditable.";
  if (bucket === "H") return "Manual review. Evidence is insufficient for a more specific bucket.";
  return "Manual review.";
}

function evidenceKindLabel(review, hint) {
  if (hint && isWeakHint(hint)) return "weak_alias";
  const evidence = unique([...(review?.evidence || []), ...((review?.candidates || []).flatMap((c) => c.evidence || []))]);
  if (evidence.includes(BULK_EXACT_NAME_EVIDENCE) || evidence.includes("exact_display_name")) return "exact_display_name";
  if (evidence.includes("existing_monday_external_link") || evidence.includes("exact_source_id")) {
    return "existing_monday_external_link";
  }
  if (evidence.includes("exact_alias") || evidence.includes("starter_package_alias")) return "alias";
  if (review?.status === "NO_CANDIDATE") return "no_candidate";
  return evidence[0] || "starter_handoff_v1";
}

function classifyAccountBucket({
  currentlyOwned,
  review,
  approvedAd,
  morawareIds,
  hasUnresolvedFacts,
  weak,
  exclusion,
  ambiguousMondayMatches
}) {
  if (exclusion) return "G";
  if (ambiguousMondayMatches) return "H";
  if (!currentlyOwned) return "E";
  if (hasUnresolvedFacts && !morawareIds.length) return "F";
  if (approvedAd && morawareIds.length) return "A";
  if (exactPending(review) && morawareIds.length) return "B";
  if ((approvedAd || (review?.candidates || []).length === 1) && !morawareIds.length) return "C";
  if (!review || review.status === "NO_CANDIDATE" || (review.candidates || []).length === 0) return "D";
  if (hasUnresolvedFacts) return "F";
  if (weak) return "H";
  if (review.status === "CONFLICT") return "H";
  return "H";
}

function emptyBucketGrid() {
  const grid = {};
  for (const letter of BUCKET_ORDER) {
    grid[letter] = {
      bucket: BASELINE_BUCKETS[letter],
      letter,
      ...emptyMonths()
    };
  }
  return grid;
}

/**
 * Pure reconcilation of the starter-pack historical May–July book vs current Monday ownership.
 */
export function reconcileCompletedSfBaselineGap({
  assignedUserId,
  packKey = BASELINE_GAP_PACK_KEY,
  hints = [],
  accounts = [],
  reviews = [],
  morawareLinks = [],
  formFacts = [],
  morawareAccountNames = [],
  labelByUser = new Map(),
  showIds = false
} = {}) {
  const salespersonUserId = String(assignedUserId || "").trim();
  const aliasHints = historicalAliasHints(hints, packKey);
  const exclusionHints = historicalExclusionHints(hints, packKey);
  const aliasKeyToHint = new Map();
  for (const hint of aliasHints) {
    for (const key of hintKeys(hint)) {
      if (!aliasKeyToHint.has(key)) aliasKeyToHint.set(key, hint);
    }
  }
  const exclusionKeys = new Set(exclusionHints.flatMap(hintKeys));

  const reviewsByAccountId = new Map();
  for (const row of reviews || []) {
    reviewsByAccountId.set(String(row.salesOpsAccountId), row);
  }
  const morawareByAccount = new Map();
  for (const link of morawareLinks || []) {
    const ad = String(link.accountId || "").trim();
    const ext = String(link.externalId || "").trim();
    if (!ad || !ext) continue;
    if (!morawareByAccount.has(ad)) morawareByAccount.set(ad, new Set());
    morawareByAccount.get(ad).add(ext);
  }
  const nameByMw = new Map();
  for (const row of morawareAccountNames || []) {
    const id = String(row.externalId || row.accountId || row.account_id || "").trim();
    const name = String(row.accountName || row.account_name || "").trim();
    if (id && name && !nameByMw.has(id)) nameByMw.set(id, name);
  }

  const historicalAccounts = [];
  const seen = new Set();
  for (const account of accounts || []) {
    const key = nkey(account.accountName);
    const hint = aliasKeyToHint.get(key);
    if (!hint) continue;
    if (seen.has(account.id)) continue;
    seen.add(account.id);
    historicalAccounts.push({ account, hint });
  }

  const historicalIds = new Set(historicalAccounts.map((row) => row.account.id));
  const currentIds = new Set(
    (accounts || [])
      .filter((a) => salespersonUserId && String(a.assignedUserId || "") === salespersonUserId)
      .map((a) => a.id)
  );

  const mwToHistorical = new Map();
  const nameToHistorical = new Map();
  for (const row of historicalAccounts) {
    const review = reviewForAccount(reviewsByAccountId, row.account.id);
    const ad = candidateAd(review, row.account);
    for (const ext of morawareIdsForAd(morawareByAccount, ad)) {
      if (!mwToHistorical.has(ext)) mwToHistorical.set(ext, []);
      mwToHistorical.get(ext).push(row);
    }
    for (const key of hintKeys(row.hint)) {
      if (!nameToHistorical.has(key)) nameToHistorical.set(key, []);
      nameToHistorical.get(key).push(row);
    }
    const mondayKey = nkey(row.account.accountName);
    if (mondayKey) {
      if (!nameToHistorical.has(mondayKey)) nameToHistorical.set(mondayKey, []);
      if (!nameToHistorical.get(mondayKey).includes(row)) nameToHistorical.get(mondayKey).push(row);
    }
  }

  const perAccount = new Map();
  for (const row of historicalAccounts) {
    perAccount.set(row.account.id, {
      ...row,
      months: emptyMonths(),
      stableMonths: emptyMonths(),
      factCount: 0,
      unresolvedFactSf: 0,
      duplicateFactSf: 0
    });
  }

  const windowFacts = (formFacts || []).filter((fact) => isActiveFact(fact) && baselineMonthFromDate(factDate(fact)));
  const bucketGrid = emptyBucketGrid();
  for (const fact of windowFacts) {
    const month = baselineMonthFromDate(factDate(fact));
    const sf = factSf(fact);
    if (!month || !sf) continue;
    const sourceAccountId = String(fact.sourceAccountId || fact.source_account_id || "").trim();
    const reportName = nkey(fact.accountName || fact.account_name || nameByMw.get(sourceAccountId) || "");
    let owners = sourceAccountId ? mwToHistorical.get(sourceAccountId) || [] : [];
    if (!owners.length && reportName) owners = nameToHistorical.get(reportName) || [];
    if (owners.length > 1) {
      const first = perAccount.get(owners[0].account.id);
      if (first) {
        first.duplicateFactSf = round2(first.duplicateFactSf + sf);
        addMonths(bucketGrid.G, month, sf);
      }
      continue;
    }
    if (!owners.length) continue;
    const rec = perAccount.get(owners[0].account.id);
    rec.factCount += 1;
    addMonths(rec.months, month, sf);
    if (isMatchedCreditable(fact) && sourceAccountId && (mwToHistorical.get(sourceAccountId) || []).length) {
      addMonths(rec.stableMonths, month, sf);
    } else if (!isMatchedCreditable(fact)) {
      rec.unresolvedFactSf = round2(rec.unresolvedFactSf + sf);
    }
  }

  const reviewQueue = [];
  const historicalRows = [];
  for (const rec of perAccount.values()) {
    const account = rec.account;
    const review = reviewForAccount(reviewsByAccountId, account.id);
    const currentlyOwned = salespersonUserId ? String(account.assignedUserId || "") === salespersonUserId : false;
    const approvedAd = String(account.accountDirectoryAccountId || review?.linkedAccountDirectoryAccountId || "").trim();
    const candidate = candidateAd(review, account);
    const morawareIds = morawareIdsForAd(morawareByAccount, candidate || approvedAd);
    const bucket = classifyAccountBucket({
      currentlyOwned,
      review,
      approvedAd,
      morawareIds,
      hasUnresolvedFacts: rec.unresolvedFactSf > 0 && rec.stableMonths.total === 0,
      weak: isWeakHint(rec.hint),
      exclusion: false,
      ambiguousMondayMatches: false
    });
    addMonths(bucketGrid[bucket], "may", rec.months.may);
    addMonths(bucketGrid[bucket], "june", rec.months.june);
    addMonths(bucketGrid[bucket], "july", rec.months.july);
    const ownerId = account.assignedUserId ? String(account.assignedUserId) : null;
    const ownerName = ownerId
      ? labelByUser.get(ownerId) || resolveSalespersonDisplayName({ staffFullName: null }) || UNKNOWN_SALESPERSON_LABEL
      : UNKNOWN_SALESPERSON_LABEL;
    const ownershipState = identityOwnershipState({
      mondayAssignedUserId: account.mondayAssignedUserId,
      assignedUserId: account.assignedUserId
    });
    const candidateStatus =
      approvedAd || isExactSourceIdStatus(review?.status)
        ? "approved"
        : exactPending(review)
          ? "pending_exact"
          : (review?.candidates || []).length
            ? "candidate"
            : "no_candidate";
    const morawareStatus = morawareIds.length
      ? "linked"
      : rec.months.total > 0
        ? "name_matched_unlinked"
        : "not_linked";
    const row = {
      accountName: account.accountName,
      maySf: rec.months.may,
      juneSf: rec.months.june,
      julySf: rec.months.july,
      totalSf: rec.months.total,
      stableIdSf: rec.stableMonths.total,
      missingStableIdSf: round2(rec.months.total - rec.stableMonths.total),
      currentOwner: identityOwnershipLabel({
        ownershipState,
        salespersonDisplayName: ownerId ? ownerName : null
      }),
      currentlyOwned,
      inCurrentBook: currentIds.has(account.id),
      historicalAttributionEvidence: "starter_handoff_v1 alias pack — approved May–July baseline account set",
      accountDirectoryCandidateStatus: candidateStatus,
      morawareLinkStatus: morawareStatus,
      matchEvidence: evidenceKindLabel(review, rec.hint),
      identityStatus: review?.status || "NO_CANDIDATE",
      bucket: BASELINE_BUCKETS[bucket],
      bucketLetter: bucket,
      requiredAction: requiredAction(bucket, { weak: isWeakHint(rec.hint) }),
      starterHintStrength: rec.hint.strength || "standard"
    };
    if (showIds) {
      row.salesOpsAccountId = account.id;
      row.accountDirectoryAccountId = approvedAd || candidate || null;
      row.morawareIds = morawareIds;
    }
    historicalRows.push(row);
    if (bucket !== "A" && rec.months.total > 0) reviewQueue.push(row);
  }

  reviewQueue.sort((a, b) => b.missingStableIdSf - a.missingStableIdSf || b.totalSf - a.totalSf || a.accountName.localeCompare(b.accountName));
  historicalRows.sort((a, b) => b.totalSf - a.totalSf || a.accountName.localeCompare(b.accountName));

  const historicalMonths = emptyMonths();
  const stableMonths = emptyMonths();
  for (const rec of perAccount.values()) {
    addMonths(historicalMonths, "may", rec.months.may);
    addMonths(historicalMonths, "june", rec.months.june);
    addMonths(historicalMonths, "july", rec.months.july);
    addMonths(stableMonths, "may", rec.stableMonths.may);
    addMonths(stableMonths, "june", rec.stableMonths.june);
    addMonths(stableMonths, "july", rec.stableMonths.july);
  }

  let currentOnlyCount = 0;
  const currentOnlyMonths = emptyMonths();
  for (const account of accounts || []) {
    if (!currentIds.has(account.id) || historicalIds.has(account.id)) continue;
    currentOnlyCount += 1;
    const review = reviewForAccount(reviewsByAccountId, account.id);
    const ad = candidateAd(review, account);
    const ids = new Set(morawareIdsForAd(morawareByAccount, ad));
    if (!ids.size) continue;
    for (const fact of windowFacts) {
      const sourceAccountId = String(fact.sourceAccountId || fact.source_account_id || "").trim();
      if (!ids.has(sourceAccountId) || !isMatchedCreditable(fact)) continue;
      const month = baselineMonthFromDate(factDate(fact));
      if (month) addMonths(currentOnlyMonths, month, factSf(fact));
    }
  }

  const bothCount = historicalAccounts.filter((row) => currentIds.has(row.account.id)).length;
  const historicalOnlyCount = historicalAccounts.length - bothCount;
  const bothSf = historicalAccounts
    .filter((row) => currentIds.has(row.account.id))
    .reduce((sum, row) => round2(sum + (perAccount.get(row.account.id)?.months.total || 0)), 0);
  const historicalOnlySf = round2(historicalMonths.total - bothSf);

  const nameMatched = compareCompletedSfBaseline({
    may: historicalMonths.may,
    june: historicalMonths.june,
    july: historicalMonths.july,
    total: historicalMonths.total,
    average: Math.round((historicalMonths.total / 3) * 10) / 10
  });
  const stableId = compareCompletedSfBaseline({
    may: stableMonths.may,
    june: stableMonths.june,
    july: stableMonths.july,
    total: stableMonths.total,
    average: Math.round((stableMonths.total / 3) * 10) / 10
  });

  const unresolvedStableSf = round2(COMPLETED_SF_BASELINE_ACCEPTANCE.total - stableMonths.total);
  const previewGap = round2(COMPLETED_SF_BASELINE_ACCEPTANCE.total - (stableMonths.total + currentOnlyMonths.total));
  const identityApprovalRequired = historicalRows.some((row) => ["B", "C", "D"].includes(row.bucketLetter));
  const historicalOwnershipGapFound = historicalOnlyCount > 0 || historicalRows.some((row) => row.bucketLetter === "E");

  let verdict = "BASELINE_RECONCILIATION_READY";
  if (stableId.reconciled && nameMatched.reconciled) verdict = "BASELINE_RECONCILED";
  else if (identityApprovalRequired) verdict = "IDENTITY_APPROVAL_REQUIRED";
  else if (historicalOwnershipGapFound) verdict = "HISTORICAL_OWNERSHIP_GAP_FOUND";
  else if (!stableId.reconciled || !nameMatched.reconciled) verdict = "BASELINE_MISMATCH";

  const approvedCount = historicalRows.filter((row) => row.accountDirectoryCandidateStatus === "approved").length;
  const pendingExactCount = historicalRows.filter((row) => row.accountDirectoryCandidateStatus === "pending_exact").length;
  const noCandidateCount = historicalRows.filter((row) => row.accountDirectoryCandidateStatus === "no_candidate").length;

  return {
    verdict,
    activationGate: stableId.reconciled ? "BASELINE_RECONCILED" : "BASELINE_MISMATCH",
    identityApprovalRequired,
    historicalOwnershipGapFound,
    attributionWrites: false,
    packKey,
    window: BASELINE_WINDOW,
    expected: { ...COMPLETED_SF_BASELINE_ACCEPTANCE },
    nameMatchedReconstruction: nameMatched,
    stableIdReconstruction: stableId,
    unresolvedStableIdSf: unresolvedStableSf,
    currentBookPreviewGapSf: previewGap,
    currentBookVsHistoricalBook: {
      both: { accounts: bothCount, sf: bothSf },
      historicalOnly: { accounts: historicalOnlyCount, sf: historicalOnlySf },
      currentOnly: { accounts: currentOnlyCount, sf: currentOnlyMonths.total }
    },
    gapByCause: BUCKET_ORDER.map((letter) => ({
      letter,
      bucket: BASELINE_BUCKETS[letter],
      maySf: bucketGrid[letter].may,
      juneSf: bucketGrid[letter].june,
      julySf: bucketGrid[letter].july,
      totalSf: bucketGrid[letter].total
    })),
    reviewQueue,
    historicalAccounts: historicalRows,
    approvalState: {
      approved: approvedCount,
      pendingExact: pendingExactCount,
      noCandidate: noCandidateCount,
      recommendedFirstApprovalSet: "exact_1to1_moraware_linked_human_approval_only"
    },
    suggestedAssignedUserId: suggestAssignedUserIdFromRows(historicalAccounts)
  };
}

export function hintAccountNames(hints, packKey = BASELINE_GAP_PACK_KEY) {
  return unique(
    [...historicalAliasHints(hints, packKey), ...historicalExclusionHints(hints, packKey)].flatMap((h) => [
      h.mondayName,
      h.suggestedDirectoryName
    ])
  );
}

export function suggestAssignedUserId(accounts, hints, packKey = BASELINE_GAP_PACK_KEY) {
  const keys = new Set(historicalAliasHints(hints, packKey).flatMap(hintKeys));
  const rows = (accounts || []).filter((a) => keys.has(nkey(a.accountName)));
  return suggestAssignedUserIdFromRows(rows.map((account) => ({ account })));
}

function suggestAssignedUserIdFromRows(historicalAccounts) {
  const counts = new Map();
  for (const row of historicalAccounts) {
    const id = String(row.account?.assignedUserId || "").trim();
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  let tied = false;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
      tied = false;
    } else if (n === bestN && id !== best) tied = true;
  }
  return tied ? null : best;
}
