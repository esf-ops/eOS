/**
 * Account Directory Phase 4B — human status review queue (ADMIN, per-account).
 * Reuses the Phase 4 classifier. Never bulk-mutates. Never auto-links QuickBooks.
 */

import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";
import { ACCOUNT_DIRECTORY_CAPABILITIES, roleHasCapability } from "./accountDirectoryAuth.mjs";
import {
  STATUS_RECONCILE_VERSION,
  STATUS_REVIEW_ACTION,
  KEEP_CURRENT_REASONS,
  assertNoSensitivePayload,
  buildStatusReviewCopy,
  evidenceFingerprint,
  isExceptionTransition,
  rankMethodLabel
} from "./accountDirectoryStatusReconciliation.mjs";
import {
  classifyLoadedEvidence,
  loadStatusReconciliationEvidence,
  loadStatusReconciliationEvidenceForAccount
} from "./accountDirectoryStatusReconciliationLoad.mjs";

const DECISIONS = new Set(["accept_recommendation", "keep_current", "mark_needs_review"]);
const MAX_PAGE = 100;
const DEFAULT_PAGE = 50;

function paginateItems(items, page, pageSize) {
  const limit = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE, 1), MAX_PAGE);
  const pageNum = Math.max(Number(page) || 1, 1);
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const safePage = totalPages === 0 ? 1 : Math.min(pageNum, totalPages);
  const offset = (safePage - 1) * limit;
  return {
    items: items.slice(offset, offset + limit),
    total,
    page: safePage,
    pageSize: limit,
    totalPages,
    hasPreviousPage: safePage > 1,
    hasNextPage: totalPages > 0 && safePage < totalPages
  };
}

function requireAdmin(role) {
  if (!roleHasCapability(role, ACCOUNT_DIRECTORY_CAPABILITIES.ADMIN)) {
    throw new AccountDirectoryError(
      "forbidden",
      "Permission denied for Account Directory status review.",
      403
    );
  }
}

function latestReviewByAccount(events) {
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const event of events || []) {
    const id = String(event.accountId || event.account_id || "");
    if (!id || map.has(id)) continue;
    if (String(event.action) !== STATUS_REVIEW_ACTION) continue;
    map.set(id, event);
  }
  return map;
}

function toPublicItem(classified, reviewEvent, accountRowVersion) {
  const fingerprint = evidenceFingerprint(classified);
  const copy = buildStatusReviewCopy(classified);
  const values = reviewEvent?.newValues || reviewEvent?.new_values || {};
  const reviewFingerprint = values.evidenceFingerprint || null;
  const keepCurrentSameEvidence =
    values.decision === "keep_current" && reviewFingerprint === fingerprint;
  const evidenceChanged =
    Boolean(reviewEvent) && reviewFingerprint && reviewFingerprint !== fingerprint;
  return {
    accountId: classified.accountId,
    displayName: classified.displayName,
    currentStatus: classified.currentStatus,
    recommendedStatus: classified.proposedStatus,
    reasonCode: classified.reasonCode,
    category: copy.category,
    confidence: classified.confidence,
    why: copy.headline,
    evidenceBullets: copy.bullets,
    evidenceFingerprint: fingerprint,
    classifierVersion: classified.version || STATUS_RECONCILE_VERSION,
    rowVersion: accountRowVersion ?? null,
    qb: {
      exactLinked: classified.evidence.qb.exactLinked,
      enrichmentState: classified.evidence.qb.enrichmentState,
      matchDisplayName: classified.qbMatch?.displayName || null,
      matchExplanation: classified.qbMatch?.explanation || null
    },
    eliteos: {
      hasQuotesOrEstimates: Number(classified.evidence.eliteos.quoteOrEstimateCount || 0) > 0,
      acceptedOrSoldEvidence: Boolean(classified.evidence.eliteos.acceptedOrSoldEvidence)
    },
    suppressed: keepCurrentSameEvidence,
    evidenceChanged,
    review: reviewEvent
      ? {
          decision: values.decision || null,
          keepReason: values.keepReason || null,
          note: values.note || null,
          actorUserId: reviewEvent.actorUserId || reviewEvent.actor_user_id || null,
          at: reviewEvent.createdAt || reviewEvent.created_at || null
        }
      : null
  };
}

function attachQbMatch(classified, record) {
  const name = record?.qb?.suggestionDisplayName ? String(record.qb.suggestionDisplayName) : null;
  return {
    ...classified,
    qbMatch: name
      ? {
          displayName: name,
          explanation: rankMethodLabel(record.qb.suggestionRankMethod)
        }
      : null
  };
}

/**
 * @param {object} args
 */
export async function listStatusReviewQueue(args) {
  requireAdmin(args.role);
  const loaded = await loadStatusReconciliationEvidence({
    store: args.store,
    supabase: args.supabase,
    organizationId: args.organizationId
  });
  const classifiedWrap = classifyLoadedEvidence(loaded);
  assertNoSensitivePayload(classifiedWrap.classified);

  const events =
    typeof args.store.listAuditEventsByAction === "function"
      ? await args.store.listAuditEventsByAction(args.organizationId, STATUS_REVIEW_ACTION, {
          limit: 5000
        })
      : [];
  const reviews = latestReviewByAccount(events);
  const rowVersionById = new Map((loaded.records || []).map((r) => [r.accountId, r.rowVersion]));
  const recordById = new Map((loaded.records || []).map((r) => [r.accountId, r]));

  const items = classifiedWrap.classified
    .filter((row) => isExceptionTransition(row.currentStatus, row.proposedStatus))
    .map((row) =>
      toPublicItem(
        attachQbMatch(row, recordById.get(row.accountId)),
        reviews.get(row.accountId) || null,
        rowVersionById.get(row.accountId)
      )
    );

  const needsDecision = items.filter((row) => !row.suppressed);
  const reviewed = items.filter((row) => row.review && !row.evidenceChanged);
  const counts = {
    needsDecision: needsDecision.length,
    needsReview: needsDecision.filter((row) => row.recommendedStatus === "needs_review").length,
    prospectRecommendations: needsDecision.filter((row) => row.recommendedStatus === "prospect")
      .length,
    reviewed: reviewed.length
  };

  const q = args.query || {};
  const search = String(q.search || "").trim().toLowerCase();
  const reviewedFilter = String(q.reviewed || "").trim();
  let filtered = items;
  if (reviewedFilter === "unresolved") filtered = filtered.filter((row) => !row.suppressed);
  if (reviewedFilter === "reviewed") filtered = filtered.filter((row) => Boolean(row.review));
  if (q.proposedStatus) {
    filtered = filtered.filter((row) => row.recommendedStatus === q.proposedStatus);
  }
  if (q.currentStatus) filtered = filtered.filter((row) => row.currentStatus === q.currentStatus);
  if (q.reasonCode) filtered = filtered.filter((row) => row.reasonCode === q.reasonCode);
  if (q.category) filtered = filtered.filter((row) => row.category === q.category);
  if (q.qbState) filtered = filtered.filter((row) => row.qb.enrichmentState === q.qbState);
  if (search) {
    filtered = filtered.filter((row) => String(row.displayName || "").toLowerCase().includes(search));
  }

  const paged = paginateItems(filtered, q.page, q.pageSize);
  const payload = {
    ok: true,
    classifierVersion: STATUS_RECONCILE_VERSION,
    counts,
    ...paged,
    databaseWrites: 0
  };
  assertNoSensitivePayload(payload);
  return payload;
}

async function writeReviewDisposition(args, classified, decision, extra) {
  const row = await args.store.insertAuditEvent({
    organizationId: args.organizationId,
    accountId: classified.accountId,
    entityType: "account",
    entityId: classified.accountId,
    action: STATUS_REVIEW_ACTION,
    actorUserId: args.actorUserId ?? null,
    changedFields: ["status_reconciliation_review"],
    oldValues: { status: classified.currentStatus },
    newValues: {
      decision,
      currentStatus: classified.currentStatus,
      recommendedStatus: classified.proposedStatus,
      reasonCodes: [classified.reasonCode],
      evidenceFingerprint: evidenceFingerprint(classified),
      classifierVersion: classified.version || STATUS_RECONCILE_VERSION,
      keepReason: extra.keepReason || null,
      note: extra.note || null
    },
    requestId: args.requestId ?? null
  });
  if (!row) {
    throw new AccountDirectoryError(
      "audit_write_failed",
      "Could not persist the status review decision.",
      500
    );
  }
}

/**
 * Per-account review decision. No bulk path.
 *
 * @param {object} args
 */
export async function decideStatusReview(args) {
  requireAdmin(args.role);
  const decision = String(args.decision || "").trim();
  if (!DECISIONS.has(decision)) {
    throw new AccountDirectoryError("invalid_decision", "Unknown status review decision.", 400);
  }

  const loaded = await loadStatusReconciliationEvidenceForAccount({
    store: args.store,
    supabase: args.supabase,
    organizationId: args.organizationId,
    accountId: args.accountId
  });
  const classifiedWrap = classifyLoadedEvidence(loaded);
  const classified = classifiedWrap.classified[0] || null;
  if (!classified || classified.accountId !== args.accountId) {
    throw new AccountDirectoryError("not_found", "Account not found.", 404);
  }

  const fingerprint = evidenceFingerprint(classified);
  if (args.evidenceFingerprint && args.evidenceFingerprint !== fingerprint) {
    throw new AccountDirectoryError(
      "evidence_changed",
      "New evidence requires another review. Reload the queue and try again.",
      409,
      { evidenceFingerprint: fingerprint }
    );
  }

  if (decision === "accept_recommendation") {
    if (classified.proposedStatus === "active" && !classified.evidence.qb.exactLinked) {
      throw new AccountDirectoryError(
        "fuzzy_active_forbidden",
        "Active requires an exact QuickBooks customer link. Confirm the match in the QuickBooks workflow first.",
        400
      );
    }
    if (!["prospect", "needs_review", "inactive", "active"].includes(classified.proposedStatus)) {
      throw new AccountDirectoryError("invalid_status", "This recommendation cannot be applied.", 400);
    }
    const updated = await args.service.updateAccount({
      organizationId: args.organizationId,
      role: args.role,
      actorUserId: args.actorUserId,
      requestId: args.requestId,
      accountId: args.accountId,
      payload: { status: classified.proposedStatus, rowVersion: args.rowVersion }
    });
    await writeReviewDisposition(args, classified, decision, { note: args.note });
    return { ok: true, account: updated, decision };
  }

  if (decision === "mark_needs_review") {
    const updated = await args.service.updateAccount({
      organizationId: args.organizationId,
      role: args.role,
      actorUserId: args.actorUserId,
      requestId: args.requestId,
      accountId: args.accountId,
      payload: { status: "needs_review", rowVersion: args.rowVersion }
    });
    await writeReviewDisposition(args, classified, decision, { note: args.note });
    return { ok: true, account: updated, decision };
  }

  if (classified.currentStatus === "active" && classified.proposedStatus === "prospect") {
    const keepReason = String(args.keepReason || "").trim();
    if (!KEEP_CURRENT_REASONS.includes(keepReason)) {
      throw new AccountDirectoryError(
        "keep_reason_required",
        "Keeping Active requires a short reason.",
        400
      );
    }
    await writeReviewDisposition(args, classified, decision, {
      keepReason,
      note: args.note
    });
    return { ok: true, decision, accountId: args.accountId };
  }

  await writeReviewDisposition(args, classified, decision, { note: args.note });
  return { ok: true, decision, accountId: args.accountId };
}
