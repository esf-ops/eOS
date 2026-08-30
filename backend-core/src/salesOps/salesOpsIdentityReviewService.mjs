/**
 * Rebuild and approve Monday → Account Directory identity reviews.
 */

import { mondayExternalId, SALES_OPS_MONDAY_EXTERNAL_SYSTEM } from "./salesOpsConstants.js";
import { normalizeOrgMatchKey } from "../accountDirectory/accountDirectoryMasterList.mjs";
import { MORAWARE_EXTERNAL_SYSTEM, QUICKBOOKS_EXTERNAL_SYSTEM } from "./salesOpsIdentityAudit.mjs";
import {
  buildIdentityIndexes,
  bulkSkipReason,
  canAutoCommit,
  classifyIdentityCase,
  groupLinksByExternal,
  identityMatchQualityLabel,
  identityReviewBucket,
  isExactNameBulkEligible,
  matchMethodFromReview,
  mondayMatchesForAccount,
  summarizeReviewRows
} from "./salesOpsIdentityReview.mjs";
import {
  identityOwnershipLabel,
  identityOwnershipState,
  resolveSalespersonDisplayName,
  UNKNOWN_SALESPERSON_LABEL
} from "./salesOpsSalespersonLabel.mjs";
import { SalesOpsError } from "./salesOpsPlanLifecycle.mjs";

const MASTER_LIST_SYSTEM = "account_master_list";

function mapHint(row) {
  return {
    mondayName: row.mondayName,
    suggestedDirectoryName: row.suggestedDirectoryName,
    evidenceKind: row.evidenceKind,
    strength: row.strength || "standard",
    notes: row.notes || null
  };
}

export async function rebuildIdentityReviews(store, { organizationId, actorUserId, autoCommit = true }) {
  const [salesOps, directoryAccounts, aliases, mondayLinks, morawareLinks, qbLinks, masterListLinks, hints] = await Promise.all([
    store.listAccountIdentityRows(organizationId),
    store.listDirectoryIdentityAccounts(organizationId),
    store.listDirectoryAliases(organizationId),
    store.listActiveExternalLinks(organizationId, SALES_OPS_MONDAY_EXTERNAL_SYSTEM),
    store.listActiveExternalLinks(organizationId, MORAWARE_EXTERNAL_SYSTEM),
    store.listActiveExternalLinks(organizationId, QUICKBOOKS_EXTERNAL_SYSTEM),
    store.listActiveExternalLinks(organizationId, MASTER_LIST_SYSTEM),
    store.listIdentityHints(organizationId)
  ]);
  const indexes = buildIdentityIndexes({
    directoryAccounts,
    aliases,
    morawareLinks,
    qbLinks,
    masterListLinks,
    hints: hints.map(mapHint)
  });
  const mondayByExternal = groupLinksByExternal(mondayLinks);
  const persist = [];
  const classifiedByAccount = new Map();
  for (const account of salesOps) {
    const classified = classifyIdentityCase({
      account,
      mondayMatches: mondayMatchesForAccount(account, mondayByExternal),
      directoryByNorm: indexes.directoryByNorm,
      aliasesByNorm: indexes.aliasesByNorm,
      hints: indexes.hintsByMondayNorm.get(normalizeOrgMatchKey(account.accountName)) || [],
      morawareByAccount: indexes.morawareByAccount,
      qbByAccount: indexes.qbByAccount,
      masterListByAccount: indexes.masterListByAccount,
      directoryNameById: indexes.directoryNameById
    });
    classifiedByAccount.set(account.id, classified);
    persist.push({
      salesOpsAccountId: account.id,
      mondayBoardId: account.mondayBoardId,
      mondayItemId: account.mondayItemId,
      mondayAccountName: account.accountName,
      status: classified.status,
      autoLinkable: classified.autoLinkable,
      candidates: classified.candidates,
      evidence: classified.evidence,
      conflictReason: classified.conflictReason,
      exclusionHint: classified.exclusionHint,
      linkedAccountDirectoryAccountId: classified.canonicalAccountDirectoryAccountId
    });
  }
  const saved = await store.replaceIdentityReviews(organizationId, persist);
  let autoLinked = 0;
  if (autoCommit) {
    const byId = new Map(salesOps.map((a) => [a.id, a]));
    for (const row of saved) {
      const classified = classifiedByAccount.get(row.salesOpsAccountId);
      if (!canAutoCommit(classified)) continue;
      const account = byId.get(row.salesOpsAccountId);
      if (String(account?.accountDirectoryAccountId || "") === String(classified.canonicalAccountDirectoryAccountId)) {
        continue;
      }
      try {
        await commitExactMondayLink(store, {
          organizationId,
          actorUserId,
          review: row,
          accountDirectoryAccountId: classified.canonicalAccountDirectoryAccountId,
          action: "auto_link",
          reason: "existing_monday_external_link"
        });
        autoLinked += 1;
      } catch (e) {
        if (e.code === "monday_link_conflict") continue;
        throw e;
      }
    }
  }
  return {
    ...summarizeReviewRows(saved),
    autoLinked,
    deterministicBridge: false,
    linkingMethod: "exact_external_id_only"
  };
}

export async function commitExactMondayLink(store, { organizationId, actorUserId, review, accountDirectoryAccountId, action, reason }) {
  const adId = String(accountDirectoryAccountId || "").trim();
  if (!adId) throw new SalesOpsError("Account Directory UUID is required.", 400, "directory_required");
  const prior = review.linkedAccountDirectoryAccountId || null;
  await store.insertMondayAccountDirectoryLink({
    organizationId,
    boardId: review.mondayBoardId,
    itemId: review.mondayItemId,
    accountId: adId,
    linkedBy: actorUserId
  });
  await store.setSalesOpsAccountDirectoryId(organizationId, review.salesOpsAccountId, adId);
  await store.insertIdentityReviewEvent({
    organizationId,
    reviewId: review.id,
    salesOpsAccountId: review.salesOpsAccountId,
    mondayItemId: review.mondayItemId,
    mondayBoardId: review.mondayBoardId,
    accountDirectoryAccountId: adId,
    actorUserId,
    action,
    reason: reason || null,
    matchMethod: matchMethodFromReview(review),
    evidenceShown: review.candidates || [],
    priorAccountDirectoryAccountId: prior
  });
  return store.updateIdentityReview(organizationId, review.id, {
    status: "EXACT_SOURCE_ID",
    autoLinkable: true,
    linkedAccountDirectoryAccountId: adId
  });
}

export async function approveIdentityReview(store, { organizationId, actorUserId, review, accountDirectoryAccountId, reason, action = "approve" }) {
  const adId = String(accountDirectoryAccountId || "").trim();
  const allowed = new Set((review.candidates || []).map((c) => String(c.accountDirectoryAccountId)));
  if (!allowed.has(adId)) {
    throw new SalesOpsError("Select a candidate shown on this review.", 409, "candidate_required");
  }
  if (review.status === "CONFLICT" && review.conflictReason === "monday_external_id_maps_to_multiple_directory_accounts") {
    throw new SalesOpsError("Ambiguous Monday identity cannot be approved.", 409, "identity_conflict");
  }
  return commitExactMondayLink(store, {
    organizationId,
    actorUserId,
    review,
    accountDirectoryAccountId: adId,
    action,
    reason
  });
}

export async function rejectIdentityReview(store, { organizationId, actorUserId, review, reason, action = "reject" }) {
  await store.insertIdentityReviewEvent({
    organizationId,
    reviewId: review.id,
    salesOpsAccountId: review.salesOpsAccountId,
    mondayItemId: review.mondayItemId,
    mondayBoardId: review.mondayBoardId,
    accountDirectoryAccountId: null,
    actorUserId,
    action,
    reason: reason || null,
    matchMethod: matchMethodFromReview(review),
    evidenceShown: review.candidates || [],
    priorAccountDirectoryAccountId: review.linkedAccountDirectoryAccountId || null
  });
  return review;
}

function skippedPreviewRow(review, reason) {
  return {
    reviewId: review?.id || null,
    reason,
    mondayAccountName: review?.mondayAccountName || null
  };
}

export function emptyBulkPreviewSummary(selectedCount = 0) {
  return {
    selectedCount,
    salespersonScope: "None",
    exactMatchQualifiedCount: 0,
    morawareLinkedCount: 0,
    quickbooksLinkedCount: 0,
    unassignedAccountCount: 0,
    exclusionCount: 0,
    skippedCount: 0
  };
}

export function previewBulkIdentityReviews(reviews, accountsById = new Map(), { labelByUser = new Map() } = {}) {
  const items = [];
  const skipped = [];
  const listed = reviews || [];
  const salespersonNames = new Set();
  for (const review of listed) {
    const reason = bulkSkipReason(review);
    if (reason) {
      skipped.push(skippedPreviewRow(review, reason));
      continue;
    }
    const candidate = (review.candidates || [])[0];
    const account = accountsById.get(review.salesOpsAccountId) || null;
    const ownershipState = identityOwnershipState({
      mondayAssignedUserId: account?.mondayAssignedUserId,
      assignedUserId: account?.assignedUserId
    });
    const salespersonDisplayName = account?.assignedUserId
      ? labelByUser.get(String(account.assignedUserId)) || UNKNOWN_SALESPERSON_LABEL
      : null;
    if (salespersonDisplayName) salespersonNames.add(salespersonDisplayName);
    items.push({
      reviewId: review.id,
      mondayAccountName: review.mondayAccountName,
      mondayBoardId: review.mondayBoardId,
      mondayItemId: review.mondayItemId,
      proposedAccountDirectoryAccountId: candidate.accountDirectoryAccountId,
      proposedDisplayName: candidate.displayName || null,
      morawareIdCount: (candidate.morawareIds || []).length,
      morawareLinked: (candidate.morawareIds || []).length > 0,
      quickbooksLinked: Boolean(candidate.quickbooksLinked),
      masterListLinked: Boolean(candidate.masterListLinked),
      branch: account?.branch || null,
      market: account?.market || null,
      evidence: candidate.evidence || review.evidence || [],
      matchMethod: matchMethodFromReview(review),
      ownershipState,
      ownershipLabel: identityOwnershipLabel({ ownershipState, salespersonDisplayName }),
      salespersonDisplayName,
      exclusionHint: Boolean(review.exclusionHint),
      conflictWarning: review.conflictReason || (review.exclusionHint ? "exclusion_hint_non_commissionable" : null)
    });
  }
  const named = [...salespersonNames];
  const summary = {
    selectedCount: listed.length,
    salespersonScope:
      named.length === 0
        ? "Unassigned or unmapped in this selection"
        : named.length <= 3
          ? named.join(", ")
          : `${named.length} salespeople`,
    exactMatchQualifiedCount: items.length,
    morawareLinkedCount: items.filter((item) => item.morawareLinked).length,
    quickbooksLinkedCount: items.filter((item) => item.quickbooksLinked).length,
    unassignedAccountCount: items.filter((item) => item.ownershipState === "unassigned").length,
    exclusionCount: items.filter((item) => item.exclusionHint).length + skipped.length,
    skippedCount: skipped.length
  };
  return { items, skipped, eligibleCount: items.length, summary };
}

export async function bulkApproveIdentityReviews(store, { organizationId, actorUserId, reviews, reason }) {
  const approved = [];
  const skipped = [];
  for (const review of reviews || []) {
    const skip = bulkSkipReason(review);
    if (skip) {
      skipped.push({ reviewId: review.id, reason: skip });
      continue;
    }
    const adId = review.candidates[0].accountDirectoryAccountId;
    try {
      await approveIdentityReview(store, {
        organizationId,
        actorUserId,
        review,
        accountDirectoryAccountId: adId,
        reason: reason || "bulk_human_approved_exact_name",
        action: "bulk_approve"
      });
      approved.push(review.id);
    } catch (e) {
      skipped.push({ reviewId: review.id, reason: e.code || "approve_failed" });
    }
  }
  return { approved, skipped, approvedCount: approved.length };
}

export async function bulkRejectIdentityReviews(store, { organizationId, actorUserId, reviews, reason, action = "bulk_reject" }) {
  const rejected = [];
  const skipped = [];
  for (const review of reviews || []) {
    if (action === "skip") {
      await rejectIdentityReview(store, {
        organizationId,
        actorUserId,
        review,
        reason: reason || "left_unresolved",
        action: "skip"
      });
      rejected.push(review.id);
      continue;
    }
    await rejectIdentityReview(store, {
      organizationId,
      actorUserId,
      review,
      reason: reason || "bulk_rejected",
      action: "bulk_reject"
    });
    rejected.push(review.id);
  }
  return { rejected, skipped, rejectedCount: rejected.length };
}

export function dtoIdentityCandidate(candidate) {
  return {
    accountDirectoryAccountId: candidate.accountDirectoryAccountId,
    displayName: candidate.displayName || null,
    evidence: candidate.evidence || [],
    morawareIds: candidate.morawareIds || [],
    quickbooksLinked: Boolean(candidate.quickbooksLinked),
    masterListLinked: Boolean(candidate.masterListLinked),
    hintStrength: candidate.hintStrength || null
  };
}

export function dtoIdentityReview(row, account = null, extras = {}) {
  if (!row) return null;
  const ownershipState = identityOwnershipState({
    mondayAssignedUserId: account?.mondayAssignedUserId,
    assignedUserId: account?.assignedUserId
  });
  const salespersonDisplayName =
    extras.salespersonDisplayName ||
    resolveSalespersonDisplayName({ salespersonLabel: extras.salespersonLabel });
  const reviewBucket = identityReviewBucket(row);
  return {
    id: row.id,
    salesOpsAccountId: row.salesOpsAccountId,
    mondayBoardId: row.mondayBoardId,
    mondayItemId: row.mondayItemId,
    mondayAccountName: row.mondayAccountName,
    mondayUrl: account?.mondayUrl || null,
    branch: account?.branch || null,
    market: account?.market || null,
    assignedUserId: account?.assignedUserId || null,
    mondayAssignedUserId: account?.mondayAssignedUserId || null,
    ownershipState,
    ownershipLabel: identityOwnershipLabel({ ownershipState, salespersonDisplayName }),
    salespersonLabel: ownershipState === "mapped" ? salespersonDisplayName : null,
    salespersonDisplayName: ownershipState === "mapped" ? salespersonDisplayName : UNKNOWN_SALESPERSON_LABEL,
    packKeys: extras.packKeys || [],
    bulkEligible: isExactNameBulkEligible(row),
    reviewBucket,
    matchQualityLabel: identityMatchQualityLabel(reviewBucket),
    status: row.status,
    autoLinkable: Boolean(row.autoLinkable),
    evidence: row.evidence || [],
    conflictReason: row.conflictReason || null,
    exclusionHint: Boolean(row.exclusionHint),
    linkedAccountDirectoryAccountId: row.linkedAccountDirectoryAccountId || null,
    candidates: (row.candidates || []).map(dtoIdentityCandidate),
    rebuiltAt: row.rebuiltAt || null
  };
}

export { mondayExternalId };
