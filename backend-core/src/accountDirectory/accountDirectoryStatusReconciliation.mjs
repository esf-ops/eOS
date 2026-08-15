import { createHash } from "node:crypto";

/**
 * Account Directory customer-status reconciliation (Phase 4) — read-only classifier.
 *
 * Account Directory = identity / relationship lifecycle authority.
 * QuickBooks = authority for established accounting/customer identity.
 *
 * Never promotes Active from name similarity. Never writes.
 */

export const AD_STATUSES = Object.freeze([
  "active",
  "prospect",
  "inactive",
  "needs_review",
  "archived"
]);

export const STATUS_RECONCILE_VERSION = "ad_status_reconcile_v1";

export const STATUS_REVIEW_ACTION = "status_reconciliation_reviewed";

export const EXCEPTION_TRANSITIONS = Object.freeze([
  ["active", "needs_review"],
  ["prospect", "needs_review"],
  ["active", "prospect"]
]);

export const KEEP_CURRENT_REASONS = Object.freeze([
  "known_customer_awaiting_qb",
  "strategic_manual",
  "historical_customer",
  "other"
]);

export const ESTABLISHED_ESTIMATE_STATUSES = Object.freeze([
  "sold",
  "accepted",
  "accepted_awaiting_sold_review"
]);

export const QB_WORKBOOK_SEED_SOURCE = "quickbooks_workbook_seed";
export const MASTER_LIST_SOURCE = "account_master_list";

const ARCHIVE_NAME_RE =
  /^(test|dummy|asdf|xxx+|n\/?a|na|unknown|do not use|delete me|sample)\b/i;

/**
 * @param {string|null|undefined} status
 */
export function isEstablishedEstimateStatus(status) {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  return ESTABLISHED_ESTIMATE_STATUSES.includes(s);
}

/**
 * Staff-safe enrichment state from exact link + suggestion row.
 * Name rank may produce suggested_match / needs_review / conflict only.
 *
 * @param {{
 *   exactLinked?: boolean,
 *   suggestionStatus?: string|null
 * }} args
 */
export function resolveEnrichmentState(args) {
  if (args?.exactLinked) return "linked";
  const st = String(args?.suggestionStatus || "").trim().toLowerCase();
  if (st === "conflict") return "conflict";
  if (st === "needs_review") return "needs_review";
  if (st === "open") return "suggested_match";
  return "not_linked";
}

function currentLifecycleStatus(account) {
  if (account?.archivedAt || account?.status === "archived") return "archived";
  const status = String(account?.status || "").trim();
  return AD_STATUSES.includes(status) ? status : "needs_review";
}

/**
 * Pure classifier. Does not I/O.
 *
 * @param {object} input
 */
export function classifyAccountStatus(input) {
  const accountId = String(input.accountId || "");
  const displayName = String(input.displayName || "").trim();
  const currentStatus = currentLifecycleStatus(input);
  const qb = input.qb || {};
  const eliteos = input.eliteos || {};
  const reasons = [];
  const reviewFlags = [...(input.reviewFlags || [])];

  const exactLinked = Boolean(qb.exactLinked);
  const rootExists = Boolean(qb.rootExists);
  const qbActive = qb.qbActive;
  const isJob = Boolean(qb.isJob);
  const sharedRoot = Number(qb.sharedRootAccountCount || 0) > 1;
  const enrichmentState = qb.enrichmentState || resolveEnrichmentState(qb);
  const quoteOrEstimateCount = Number(eliteos.quoteOrEstimateCount || 0);
  const acceptedOrSold = Boolean(eliteos.acceptedOrSoldEvidence);
  const nameSimilarity = Boolean(input.nameSimilarityToUnlinkedQb);
  const contactCount = Number(input.contactCount || 0);
  const locationCount = Number(input.locationCount || 0);
  const aliasCount = Number(input.aliasCount || 0);
  const source = String(input.source || "").trim();

  if (nameSimilarity && !exactLinked) {
    reviewFlags.push("possible_qb_name_match");
  }

  if (currentStatus === "archived") {
    return finish({
      accountId,
      displayName,
      currentStatus,
      proposedStatus: "archived",
      confidence: "high",
      reasonCode: "leave_archived",
      reasons: ["Existing archived records stay archived until a human restores them."],
      reviewFlags,
      qb,
      eliteos,
      bucket: "archived"
    });
  }

  if (exactLinked) {
    if (isJob) {
      reasons.push("Exact QuickBooks link points at a job/subcustomer, not a customer root.");
      return finish({
        accountId,
        displayName,
        currentStatus,
        proposedStatus: "needs_review",
        confidence: "high",
        reasonCode: "qb_job_hierarchy",
        reasons,
        reviewFlags: [...reviewFlags, "qb_job_linked_as_customer"],
        qb,
        eliteos,
        bucket: "needs_review"
      });
    }
    if (sharedRoot) {
      reasons.push("More than one Account Directory record shares the same exact QuickBooks root.");
      return finish({
        accountId,
        displayName,
        currentStatus,
        proposedStatus: "needs_review",
        confidence: "high",
        reasonCode: "qb_shared_root",
        reasons,
        reviewFlags: [...reviewFlags, "possible_duplicate"],
        qb,
        eliteos,
        bucket: "needs_review"
      });
    }
    if (!rootExists) {
      reasons.push("Exact QuickBooks link exists, but the linked root is missing from prepared customer facts.");
      return finish({
        accountId,
        displayName,
        currentStatus,
        proposedStatus: "needs_review",
        confidence: "medium",
        reasonCode: "qb_root_missing",
        reasons,
        reviewFlags: [...reviewFlags, "missing_qb_root_fact"],
        qb,
        eliteos,
        bucket: "needs_review"
      });
    }
    if (qbActive === false) {
      reasons.push("Exact QuickBooks customer exists and QuickBooks marks the root inactive.");
      return finish({
        accountId,
        displayName,
        currentStatus,
        proposedStatus: "inactive",
        confidence: "high",
        reasonCode: "exact_qb_inactive",
        reasons,
        reviewFlags,
        qb,
        eliteos,
        bucket: "inactive"
      });
    }
    if (qbActive === true) {
      reasons.push("Exact QuickBooks customer exists and QuickBooks marks the root active.");
      return finish({
        accountId,
        displayName,
        currentStatus,
        proposedStatus: "active",
        confidence: "high",
        reasonCode: "exact_qb_active",
        reasons,
        reviewFlags,
        qb,
        eliteos,
        bucket: "active"
      });
    }
    reasons.push("Exact QuickBooks link exists but prepared active/inactive state is unknown.");
    return finish({
      accountId,
      displayName,
      currentStatus,
      proposedStatus: "needs_review",
      confidence: "medium",
      reasonCode: "qb_active_unknown",
      reasons,
      reviewFlags,
      qb,
      eliteos,
      bucket: "needs_review"
    });
  }

  // Unlinked: name similarity / suggestions never establish Active.
  if (enrichmentState === "conflict") {
    reasons.push("QuickBooks enrichment reports a conflict. No auto-link.");
    return finish({
      accountId,
      displayName,
      currentStatus,
      proposedStatus: "needs_review",
      confidence: "high",
      reasonCode: "qb_conflict",
      reasons,
      reviewFlags,
      qb,
      eliteos,
      bucket: "needs_review"
    });
  }
  if (enrichmentState === "suggested_match" || enrichmentState === "needs_review") {
    reasons.push("QuickBooks has a suggested or unresolved name match. Human confirmation required.");
    return finish({
      accountId,
      displayName,
      currentStatus,
      proposedStatus: "needs_review",
      confidence: "medium",
      reasonCode: enrichmentState === "suggested_match" ? "qb_suggestion" : "qb_enrichment_needs_review",
      reasons,
      reviewFlags,
      qb,
      eliteos,
      bucket: "needs_review"
    });
  }

  if (acceptedOrSold) {
    reasons.push("Accepted or sold estimate evidence exists, but there is no exact QuickBooks customer link.");
    return finish({
      accountId,
      displayName,
      currentStatus,
      proposedStatus: "needs_review",
      confidence: "high",
      reasonCode: "sold_without_qb",
      reasons,
      reviewFlags: [...reviewFlags, "unresolved_accounting_identity"],
      qb,
      eliteos,
      bucket: "needs_review"
    });
  }

  if (quoteOrEstimateCount > 0) {
    reasons.push("Pre-sale quote/estimate activity exists. A quote alone is not an established customer.");
    return finish({
      accountId,
      displayName,
      currentStatus,
      proposedStatus: "prospect",
      confidence: "medium",
      reasonCode: "presale_only",
      reasons,
      reviewFlags,
      qb,
      eliteos,
      bucket: "prospect"
    });
  }

  if (source === QB_WORKBOOK_SEED_SOURCE) {
    reasons.push("Row came from the QuickBooks workbook seed but has no exact QuickBooks link.");
    return finish({
      accountId,
      displayName,
      currentStatus,
      proposedStatus: "needs_review",
      confidence: "medium",
      reasonCode: "seed_unlinked_qb_workbook",
      reasons,
      reviewFlags: [...reviewFlags, "import_provenance"],
      qb,
      eliteos,
      bucket: "needs_review"
    });
  }

  if (ARCHIVE_NAME_RE.test(displayName) && contactCount === 0 && locationCount === 0) {
    reasons.push("Looks like a test or placeholder row. Archive only after human review — not proposed as archived.");
    return finish({
      accountId,
      displayName,
      currentStatus,
      proposedStatus: currentStatus,
      confidence: "low",
      reasonCode: "archive_candidate",
      reasons,
      reviewFlags: [...reviewFlags, "archive_candidate"],
      qb,
      eliteos,
      bucket: "archive_candidate"
    });
  }

  const hasIdentityBits = contactCount > 0 || locationCount > 0 || aliasCount > 0;
  if (hasIdentityBits || source === "manual" || source === MASTER_LIST_SOURCE) {
    reasons.push("No exact accounting identity. Pre-sale or directory identity only — prospect candidate.");
    return finish({
      accountId,
      displayName,
      currentStatus,
      proposedStatus: "prospect",
      confidence: "low",
      reasonCode: "prospect_candidate",
      reasons,
      reviewFlags: [...reviewFlags, "prospect_candidate"],
      qb,
      eliteos,
      bucket: "prospect"
    });
  }

  reasons.push("No exact QuickBooks link and no meaningful customer evidence. Not a destructive change.");
  return finish({
    accountId,
    displayName,
    currentStatus,
    proposedStatus: "needs_review",
    confidence: "low",
    reasonCode: "insufficient_evidence",
    reasons,
    reviewFlags: [...reviewFlags, "unresolved"],
    qb,
    eliteos,
    bucket: "unresolved"
  });
}

function finish(row) {
  const changed = row.currentStatus !== row.proposedStatus;
  return {
    accountId: row.accountId,
    displayName: row.displayName,
    currentStatus: row.currentStatus,
    proposedStatus: row.proposedStatus,
    confidence: row.confidence,
    reasonCode: row.reasonCode,
    reasons: row.reasons,
    evidence: {
      qb: {
        exactLinked: Boolean(row.qb?.exactLinked),
        rootExists: Boolean(row.qb?.rootExists),
        qbActive: row.qb?.qbActive ?? null,
        enrichmentState: row.qb?.enrichmentState || resolveEnrichmentState(row.qb)
      },
      eliteos: {
        quoteOrEstimateCount: Number(row.eliteos?.quoteOrEstimateCount || 0),
        acceptedOrSoldEvidence: Boolean(row.eliteos?.acceptedOrSoldEvidence),
        otherDeterministicEvidence: row.eliteos?.otherDeterministicEvidence || []
      }
    },
    reviewFlags: [...new Set(row.reviewFlags || [])],
    bucket: row.bucket,
    changed,
    version: STATUS_RECONCILE_VERSION
  };
}

/**
 * @param {object[]} classified
 */
export function buildTransitionMatrix(classified) {
  /** @type {Record<string, Record<string, number>>} */
  const matrix = {};
  for (const row of classified || []) {
    const from = row.currentStatus || "unknown";
    const to = row.proposedStatus || "unknown";
    matrix[from] = matrix[from] || {};
    matrix[from][to] = (matrix[from][to] || 0) + 1;
  }
  return matrix;
}

/**
 * @param {object[]} classified
 */
export function summarizeStatusReconciliation(classified) {
  const rows = classified || [];
  const countWhere = (fn) => rows.filter(fn).length;
  const buckets = {
    active: countWhere((r) => r.bucket === "active"),
    inactive: countWhere((r) => r.bucket === "inactive"),
    prospect: countWhere((r) => r.bucket === "prospect"),
    needs_review: countWhere((r) => r.bucket === "needs_review"),
    archived: countWhere((r) => r.bucket === "archived"),
    archive_candidate: countWhere((r) => r.bucket === "archive_candidate"),
    unresolved: countWhere((r) => r.bucket === "unresolved")
  };
  return {
    version: STATUS_RECONCILE_VERSION,
    total: rows.length,
    buckets,
    exactQbLinked: countWhere((r) => r.evidence.qb.exactLinked),
    unlinked: countWhere((r) => !r.evidence.qb.exactLinked),
    confirmedActiveQbCustomers: countWhere((r) => r.reasonCode === "exact_qb_active"),
    confirmedInactiveQbCustomers: countWhere((r) => r.reasonCode === "exact_qb_inactive"),
    qbSuggestedMatch: countWhere((r) => r.evidence.qb.enrichmentState === "suggested_match"),
    qbConflict: countWhere((r) => r.evidence.qb.enrichmentState === "conflict"),
    qbNeedsReviewEnrichment: countWhere((r) => r.evidence.qb.enrichmentState === "needs_review"),
    activeWithoutQbLink: countWhere((r) => r.currentStatus === "active" && !r.evidence.qb.exactLinked),
    prospectWithExactQbLink: countWhere((r) => r.currentStatus === "prospect" && r.evidence.qb.exactLinked),
    inactiveLinkedToActiveQb: countWhere(
      (r) => r.currentStatus === "inactive" && r.evidence.qb.exactLinked && r.evidence.qb.qbActive === true
    ),
    possibleDuplicates: countWhere((r) => (r.reviewFlags || []).includes("possible_duplicate")),
    changed: countWhere((r) => r.changed),
    unchanged: countWhere((r) => !r.changed),
    transitions: buildTransitionMatrix(rows)
  };
}

/**
 * Human-readable samples without ListIDs or financial amounts.
 *
 * @param {object[]} classified
 * @param {number} [perBucket]
 */
export function sampleBuckets(classified, perBucket = 15) {
  /** @type {Record<string, object[]>} */
  const byBucket = {};
  for (const row of classified || []) {
    const key = row.bucket || "unresolved";
    byBucket[key] = byBucket[key] || [];
    if (byBucket[key].length < perBucket) {
      byBucket[key].push({
        accountId: row.accountId,
        displayName: row.displayName,
        currentStatus: row.currentStatus,
        proposedStatus: row.proposedStatus,
        reasonCode: row.reasonCode,
        reason: (row.reasons || [])[0] || null,
        confidence: row.confidence,
        reviewFlags: row.reviewFlags,
        evidence: {
          exactQuickBooksCustomer: row.evidence.qb.exactLinked,
          qbActive: row.evidence.qb.qbActive,
          enrichment: row.evidence.qb.enrichmentState,
          quoteOrEstimateCount: row.evidence.eliteos.quoteOrEstimateCount,
          acceptedOrSoldEvidence: row.evidence.eliteos.acceptedOrSoldEvidence
        }
      });
    }
  }
  return byBucket;
}

/**
 * @param {object} summary
 * @param {object} [extra]
 */
export function formatStatusReconcileConsole(summary, extra = {}) {
  const lines = [
    `Account Directory status reconciliation dry-run (${summary.version})`,
    `mode: read-only`,
    `databaseWrites: 0`,
    `total: ${summary.total}`,
    `exactQbLinked: ${summary.exactQbLinked}`,
    `unlinked: ${summary.unlinked}`,
    `confirmedActiveQbCustomers: ${summary.confirmedActiveQbCustomers}`,
    `confirmedInactiveQbCustomers: ${summary.confirmedInactiveQbCustomers}`,
    `trueProspects: ${summary.buckets.prospect}`,
    `needsReview: ${summary.buckets.needs_review}`,
    `alreadyArchived: ${summary.buckets.archived}`,
    `archiveCandidates: ${summary.buckets.archive_candidate}`,
    `unresolved: ${summary.buckets.unresolved}`,
    `qbSuggestedMatch: ${summary.qbSuggestedMatch}`,
    `qbConflict: ${summary.qbConflict}`,
    `qbNeedsReviewEnrichment: ${summary.qbNeedsReviewEnrichment}`,
    `activeWithoutQbLink: ${summary.activeWithoutQbLink}`,
    `prospectWithExactQbLink: ${summary.prospectWithExactQbLink}`,
    `inactiveLinkedToActiveQb: ${summary.inactiveLinkedToActiveQb}`,
    `possibleDuplicates: ${summary.possibleDuplicates}`,
    `changed: ${summary.changed}`,
    `unchanged: ${summary.unchanged}`,
    "transitions:"
  ];
  const fromKeys = Object.keys(summary.transitions || {}).sort();
  for (const from of fromKeys) {
    const toMap = summary.transitions[from];
    for (const to of Object.keys(toMap).sort()) {
      lines.push(`  ${from} → ${to}  ${toMap[to]}`);
    }
  }
  if (extra.namedExamples) {
    lines.push("namedExamples:");
    for (const [label, row] of Object.entries(extra.namedExamples)) {
      if (!row) {
        lines.push(`  ${label}: not found`);
        continue;
      }
      lines.push(
        `  ${label}: ${row.displayName}  ${row.currentStatus} → ${row.proposedStatus}  (${row.reasonCode})`
      );
    }
  }
  return lines.join("\n");
}

/**
 * @param {object[]} classified
 */
export function isExceptionTransition(currentStatus, proposedStatus) {
  return EXCEPTION_TRANSITIONS.some(([from, to]) => from === currentStatus && to === proposedStatus);
}

/**
 * Deterministic fingerprint of evidence that produced the recommendation.
 * Material identity/lifecycle changes must change this value.
 *
 * @param {object} classified
 */
export function evidenceFingerprint(classified) {
  const qb = classified?.evidence?.qb || {};
  const elite = classified?.evidence?.eliteos || {};
  const payload = [
    classified?.version || STATUS_RECONCILE_VERSION,
    classified?.proposedStatus || "",
    classified?.reasonCode || "",
    qb.exactLinked ? "1" : "0",
    qb.rootExists ? "1" : "0",
    qb.qbActive === true ? "1" : qb.qbActive === false ? "0" : "u",
    String(qb.enrichmentState || ""),
    elite.acceptedOrSoldEvidence ? "1" : "0"
  ].join("|");
  return createSha256(payload);
}

function createSha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex").slice(0, 32);
}

export function reviewCategory(reasonCode) {
  const code = String(reasonCode || "");
  if (code === "qb_suggestion") return "possible_qb_match";
  if (code === "qb_enrichment_needs_review") return "ambiguous_qb_match";
  if (code === "sold_without_qb") return "established_without_qb";
  if (code === "seed_unlinked_qb_workbook") return "imported_unconfirmed";
  if (
    code === "qb_conflict" ||
    code === "qb_job_hierarchy" ||
    code === "qb_shared_root" ||
    code === "qb_root_missing"
  ) {
    return "structural_conflict";
  }
  if (code === "prospect_candidate" || code === "presale_only") return "unlinked_directory_identity";
  return "needs_human_review";
}

export function rankMethodLabel(method) {
  const m = String(method || "");
  if (m === "exact_norm_name") return "Close name match — not a confirmed QuickBooks link";
  if (m === "substring" || m === "token_overlap") return "Similar name — not a confirmed QuickBooks link";
  if (m === "exact_list_id") return "Exact QuickBooks identity";
  if (!m) return null;
  return "Name ranking requires confirmation";
}

/**
 * Staff-safe business copy for the human review card.
 *
 * @param {object} classified
 */
export function buildStatusReviewCopy(classified) {
  const current = classified?.currentStatus;
  const proposed = classified?.proposedStatus;
  const code = classified?.reasonCode;
  const category = reviewCategory(code);
  if (code === "qb_suggestion" || code === "qb_enrichment_needs_review") {
    return {
      category,
      headline: "A possible QuickBooks customer match exists, but no exact accounting identity has been confirmed.",
      bullets: [
        "No exact QuickBooks link",
        "QuickBooks match requires confirmation",
        "A name match cannot establish Active automatically"
      ]
    };
  }
  if (current === "active" && proposed === "prospect") {
    return {
      category,
      headline:
        "This relationship exists in Account Directory but there is no confirmed QuickBooks customer and no established-customer lifecycle evidence.",
      bullets: [
        "No exact QuickBooks link",
        "No accepted or sold estimate on this identity",
        "This is a recommendation, not a statement that they are not a customer"
      ]
    };
  }
  if (code === "sold_without_qb") {
    return {
      category,
      headline: "Established-customer evidence exists, but accounting identity is unresolved.",
      bullets: ["No exact QuickBooks link", "Accepted or sold estimate is on file", "Needs a confirmed QuickBooks customer link"]
    };
  }
  if (code === "seed_unlinked_qb_workbook") {
    return {
      category,
      headline: "This identity came from the QuickBooks workbook import without a confirmed exact link.",
      bullets: ["Imported/workbook provenance", "No exact QuickBooks link", "Do not auto-link by name"]
    };
  }
  return {
    category,
    headline: (classified?.reasons || [])[0] || "This account needs a human lifecycle decision.",
    bullets: ["Review the recommendation before changing status"]
  };
}

export function assertNoSensitivePayload(classified) {
  const json = JSON.stringify(classified);
  if (
    /listid|txnid|entity_id|gross_profit|cogs|payroll|owner_draw|source_id|raw_payload/i.test(
      json
    )
  ) {
    throw new Error("Status reconciliation payload leaked forbidden fields.");
  }
}
