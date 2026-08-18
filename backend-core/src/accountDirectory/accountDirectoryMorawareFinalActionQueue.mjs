/**
 * Final-action Moraware review queue helpers.
 *
 * Human-reviewed plan rows are temporary operator input — not production identity.
 * Runtime always re-resolves exact Moraware source_account_id from Brain accounts
 * and current AD links. Names are evidence, never durable identity.
 *
 * Read-only classification. Does not create accounts or links.
 */

import { normalizeQuickBooksListId } from "./accountDirectoryQbLinkValidation.mjs";

export const EXECUTABLE_FINAL_ACTIONS = Object.freeze([
  "CONNECT_MORAWARE_TO_EXISTING_AD",
  "CREATE_AD_FROM_QB_THEN_CONNECT"
]);

export const NON_EXECUTABLE_FINAL_ACTIONS = Object.freeze([
  "MANUAL_QB_ROOT_SELECTION",
  "KEEP_UNRESOLVED",
  "IGNORE_LEGACY",
  "INTERNAL_BUCKET",
  "REVIEW_REQUIRED"
]);

export const FINAL_ACTION_READINESS = Object.freeze({
  ALREADY_LINKED_EXACT: "ALREADY_LINKED_EXACT",
  READY_CONNECT_EXISTING_AD: "READY_CONNECT_EXISTING_AD",
  READY_CREATE_FROM_QB_THEN_CONNECT: "READY_CREATE_FROM_QB_THEN_CONNECT",
  BLOCKED_MORAWARE_SOURCE_ID: "BLOCKED_MORAWARE_SOURCE_ID",
  NON_EXECUTABLE_BY_PLAN: "NON_EXECUTABLE_BY_PLAN"
});

const FAST_QUEUE_KINDS = new Set([
  FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD,
  FINAL_ACTION_READINESS.READY_CREATE_FROM_QB_THEN_CONNECT
]);

function trimName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Deterministic display-name key: trimmed, case-insensitive, whitespace-collapsed. */
export function exactSourceNameKey(name) {
  return trimName(name).toLowerCase();
}

/** Leading Dyersville routing tag only. */
export function stripDyersvilleRoutingPrefix(name) {
  return trimName(name)
    .replace(/^dyersville\s*[-–—,]\s*/i, "")
    .replace(/^dyersville-/i, "");
}

export function strippedSourceNameKey(name) {
  return exactSourceNameKey(stripDyersvilleRoutingPrefix(name));
}

function uniqueById(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const id = String(row?.sourceAccountId || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ sourceAccountId: id, accountName: trimName(row.accountName) });
  }
  return out;
}

/**
 * Exact Moraware source-account resolution. Never fuzzy.
 * @returns {{ matches: Array<{ sourceAccountId: string, accountName: string }>, reason: string }}
 */
export function resolveMorawareSourceAccounts(actionRow, sourceAccounts) {
  const planName = trimName(actionRow?.moraware_name || actionRow?.morawareName);
  const accounts = uniqueById(sourceAccounts);
  if (!planName) return { matches: [], reason: "missing_plan_name" };

  const exactKey = exactSourceNameKey(planName);
  const exactHits = accounts.filter((a) => exactSourceNameKey(a.accountName) === exactKey);
  if (exactHits.length === 1) return { matches: exactHits, reason: "exact_account_name" };
  if (exactHits.length > 1) return { matches: uniqueById(exactHits), reason: "multiple_exact_account_name" };

  const strippedPlan = strippedSourceNameKey(planName);
  if (!strippedPlan || strippedPlan === exactKey) return { matches: [], reason: "zero_source_id_match" };
  const strippedHits = accounts.filter((a) => strippedSourceNameKey(a.accountName) === strippedPlan);
  if (strippedHits.length === 1) return { matches: strippedHits, reason: "exact_stripped_dyersville_name" };
  if (strippedHits.length > 1) return { matches: uniqueById(strippedHits), reason: "multiple_stripped_name" };
  return { matches: [], reason: "zero_source_id_match" };
}

function indexActiveLinks(links, systemKey = null) {
  const byExternalId = new Map();
  for (const link of links || []) {
    if (!link || link.isActive === false) continue;
    if (systemKey) {
      const system = String(link.externalSystem || link.external_system || "").trim();
      if (system && system !== systemKey) continue;
    }
    const externalId = String(link.externalId || link.external_id || "").trim();
    const accountId = String(link.accountId || link.account_id || "").trim();
    if (!externalId || !accountId) continue;
    if (!byExternalId.has(externalId)) byExternalId.set(externalId, { accountId, link });
  }
  return byExternalId;
}

function directoryName(directoryAccounts, accountId) {
  const id = String(accountId || "").trim();
  const hit = (directoryAccounts || []).find((a) => String(a.id) === id);
  return hit?.displayName || hit?.name || "";
}

/**
 * Classify one final-action row against live source IDs and exact links.
 */
export function classifyFinalActionReadiness(input) {
  const action = String(input?.action?.final_action || input?.action?.finalAction || "").trim();
  const plannedAd = String(input?.action?.ad_uuid || input?.action?.adUuid || "").trim();
  const plannedAdName = trimName(input?.action?.ad_display_name || input?.action?.adDisplayName);
  const plannedQbListId = normalizeQuickBooksListId(input?.action?.qb_list_id || input?.action?.qbListId);
  const plannedQbName = trimName(input?.action?.qb_name || input?.action?.qbName);
  const plannedQbActive = String(input?.action?.qb_active || input?.action?.qbActive || "").toUpperCase();

  const base = {
    moraware_name: trimName(input?.action?.moraware_name || input?.action?.morawareName),
    normalized_customer_name: trimName(
      input?.action?.normalized_customer_name ||
        input?.action?.normalizedCustomerName ||
        stripDyersvilleRoutingPrefix(input?.action?.moraware_name)
    ),
    planned_final_action: action,
    moraware_account_id: "",
    moraware_source_name: "",
    ad_uuid: plannedAd,
    ad_display_name: plannedAdName,
    qb_list_id: plannedQbListId,
    qb_name: plannedQbName,
    qb_active: plannedQbActive === "YES" || plannedQbActive === "TRUE" || input?.action?.qb_active === true,
    readiness: FINAL_ACTION_READINESS.BLOCKED_MORAWARE_SOURCE_ID,
    blocked_reason: "",
    reclassified_from_create: false
  };

  if (NON_EXECUTABLE_FINAL_ACTIONS.includes(action) || !EXECUTABLE_FINAL_ACTIONS.includes(action)) {
    return { ...base, readiness: FINAL_ACTION_READINESS.NON_EXECUTABLE_BY_PLAN, blocked_reason: "non_executable_plan_class" };
  }

  const resolved = resolveMorawareSourceAccounts(input.action, input.sourceAccounts);
  if (resolved.matches.length !== 1) {
    return {
      ...base,
      readiness: FINAL_ACTION_READINESS.BLOCKED_MORAWARE_SOURCE_ID,
      blocked_reason: resolved.reason,
      source_match_count: resolved.matches.length
    };
  }

  const source = resolved.matches[0];
  base.moraware_account_id = source.sourceAccountId;
  base.moraware_source_name = source.accountName;

  const mwLink = input.morawareLinksBySourceId?.get(source.sourceAccountId) || null;
  const qbOwner = plannedQbListId ? input.qbLinksByListId?.get(plannedQbListId) || null : null;

  if (mwLink) {
    if (plannedAd && mwLink.accountId !== plannedAd) {
      return {
        ...base,
        readiness: FINAL_ACTION_READINESS.BLOCKED_MORAWARE_SOURCE_ID,
        blocked_reason: "contradictory_current_moraware_link",
        current_ad_uuid: mwLink.accountId
      };
    }
    if (action === "CREATE_AD_FROM_QB_THEN_CONNECT" && qbOwner && qbOwner.accountId !== mwLink.accountId) {
      return {
        ...base,
        readiness: FINAL_ACTION_READINESS.BLOCKED_MORAWARE_SOURCE_ID,
        blocked_reason: "contradictory_current_moraware_link",
        current_ad_uuid: mwLink.accountId
      };
    }
    const linkedAd = mwLink.accountId;
    if (!plannedAd || linkedAd === plannedAd || (action === "CREATE_AD_FROM_QB_THEN_CONNECT" && qbOwner?.accountId === linkedAd)) {
      return {
        ...base,
        ad_uuid: linkedAd,
        ad_display_name: directoryName(input.directoryAccounts, linkedAd) || plannedAdName,
        readiness: FINAL_ACTION_READINESS.ALREADY_LINKED_EXACT,
        blocked_reason: ""
      };
    }
  }

  if (action === "CREATE_AD_FROM_QB_THEN_CONNECT") {
    if (!plannedQbListId) {
      return { ...base, readiness: FINAL_ACTION_READINESS.BLOCKED_MORAWARE_SOURCE_ID, blocked_reason: "missing_qb_list_id" };
    }
    if (qbOwner) {
      return {
        ...base,
        ad_uuid: qbOwner.accountId,
        ad_display_name: directoryName(input.directoryAccounts, qbOwner.accountId) || plannedAdName,
        readiness: FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD,
        reclassified_from_create: true,
        blocked_reason: ""
      };
    }
    return { ...base, readiness: FINAL_ACTION_READINESS.READY_CREATE_FROM_QB_THEN_CONNECT, blocked_reason: "" };
  }

  if (!plannedAd) {
    return { ...base, readiness: FINAL_ACTION_READINESS.BLOCKED_MORAWARE_SOURCE_ID, blocked_reason: "missing_ad_uuid" };
  }
  return { ...base, readiness: FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD, blocked_reason: "" };
}

export function buildFinalActionReadiness({
  actions = [],
  sourceAccounts = [],
  morawareLinks = [],
  qbLinks = [],
  directoryAccounts = []
} = {}) {
  const morawareLinksBySourceId = indexActiveLinks(morawareLinks, "moraware");
  const qbLinksByListId = new Map();
  for (const link of qbLinks || []) {
    if (!link || link.isActive === false) continue;
    const system = String(link.externalSystem || link.external_system || "quickbooks_desktop").trim();
    if (system && system !== "quickbooks_desktop") continue;
    const listId = normalizeQuickBooksListId(link.externalId || link.external_id);
    const accountId = String(link.accountId || link.account_id || "").trim();
    if (!listId || !accountId || qbLinksByListId.has(listId)) continue;
    qbLinksByListId.set(listId, { accountId, link });
  }

  const rows = (actions || []).map((action) =>
    classifyFinalActionReadiness({
      action,
      sourceAccounts,
      morawareLinksBySourceId,
      qbLinksByListId,
      directoryAccounts
    })
  );

  const counts = {
    total: rows.length,
    [FINAL_ACTION_READINESS.ALREADY_LINKED_EXACT]: 0,
    [FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD]: 0,
    [FINAL_ACTION_READINESS.READY_CREATE_FROM_QB_THEN_CONNECT]: 0,
    [FINAL_ACTION_READINESS.BLOCKED_MORAWARE_SOURCE_ID]: 0,
    [FINAL_ACTION_READINESS.NON_EXECUTABLE_BY_PLAN]: 0
  };
  for (const row of rows) counts[row.readiness] = (counts[row.readiness] || 0) + 1;

  return { rows, counts };
}

export function isFastFinalActionQueueRow(row) {
  return FAST_QUEUE_KINDS.has(String(row?.readiness || ""));
}

/**
 * Ready execution queue only. Non-executable and blocked rows never enter.
 * CONNECT rows first, then CREATE.
 */
export function toFastFinalActionQueue(readiness) {
  const rows = (readiness?.rows || []).filter(isFastFinalActionQueueRow);
  rows.sort((a, b) => {
    if (a.readiness === b.readiness) return a.moraware_name.localeCompare(b.moraware_name);
    if (a.readiness === FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD) return -1;
    return 1;
  });
  return rows;
}

export function finalActionRowToReviewItem(row, extras = {}) {
  const connect = row.readiness === FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD;
  const create = row.readiness === FINAL_ACTION_READINESS.READY_CREATE_FROM_QB_THEN_CONNECT;
  const stagedAfterCreate = Boolean(extras.stagedAfterCreate);
  const accountId = stagedAfterCreate || connect ? row.ad_uuid : null;
  const qbActive = row.qb_active !== false;
  const candidate = {
    accountId: accountId || null,
    displayName: connect || stagedAfterCreate ? row.ad_display_name || row.qb_name : row.qb_name || row.ad_display_name,
    identityKind: stagedAfterCreate || connect ? "EXISTING_AD_QB_BACKED" : "QB_ROOT_NOT_IN_DIRECTORY",
    qbListId: row.qb_list_id || null,
    qbDisplayName: row.qb_name || null,
    qbLinked: Boolean(row.qb_list_id && (connect || stagedAfterCreate)),
    qbActive,
    createFromQuickBooksAllowed: create && !stagedAfterCreate && Boolean(row.qb_list_id) && !accountId,
    confirmQbLinkAllowed: false,
    confirmAllowed: Boolean(accountId),
    confirmMorawareAllowed: Boolean(accountId),
    evidence: [
      { type: "final_action_plan", label: "Human-reviewed final action plan", strength: "supporting" },
      { type: "exact_source_account_id", label: "Exact Moraware source account ID", strength: "very_strong" }
    ]
  };
  return {
    morawareAccountId: row.moraware_account_id,
    morawareName: row.moraware_source_name || row.moraware_name,
    classification: "HIGH_CONFIDENCE_CANDIDATE",
    reviewState: stagedAfterCreate || connect ? "EXISTING_AD_QB_BACKED" : "QB_ROOT_NOT_IN_DIRECTORY",
    finalActionQueue: true,
    finalActionKind: stagedAfterCreate
      ? FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD
      : row.readiness,
    stagedAfterCreate,
    proposedAccountId: accountId,
    proposedAccountName: row.ad_display_name || null,
    primaryQbListId: row.qb_list_id || null,
    qbDisplayName: row.qb_name || null,
    confirmAllowed: Boolean(accountId),
    confirmQbLinkAllowed: false,
    createFromQuickBooksAllowed: candidate.createFromQuickBooksAllowed,
    internalBucket: false,
    currentLink: { linked: false, accountId: null, accountName: null, linkId: null },
    candidates: [candidate],
    evidence: ["final_action_plan", "exact_source_account_id"]
  };
}

/**
 * After create-from-QB, restage the same Moraware row for explicit CONNECT.
 * Does not create a Moraware link.
 */
export function stageMorawareConnectAfterQbCreate(item, created) {
  const accountId = String(created?.accountId || created?.id || "").trim();
  const displayName = trimName(created?.displayName || created?.name || item?.proposedAccountName);
  const qbListId = normalizeQuickBooksListId(created?.qbListId || item?.primaryQbListId);
  if (!item || !accountId) return item;
  return {
    ...item,
    reviewState: "EXISTING_AD_QB_BACKED",
    finalActionKind: FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD,
    stagedAfterCreate: true,
    proposedAccountId: accountId,
    proposedAccountName: displayName,
    primaryQbListId: qbListId || item.primaryQbListId || null,
    confirmAllowed: true,
    createFromQuickBooksAllowed: false,
    candidates: [
      {
        accountId,
        displayName: displayName || "Directory account",
        identityKind: "EXISTING_AD_QB_BACKED",
        qbListId: qbListId || null,
        qbDisplayName: created?.qbDisplayName || item.qbDisplayName || displayName,
        qbLinked: Boolean(qbListId),
        qbActive: created?.qbActive == null ? true : Boolean(created.qbActive),
        createFromQuickBooksAllowed: false,
        confirmQbLinkAllowed: false,
        confirmAllowed: true,
        confirmMorawareAllowed: true,
        evidence: [
          { type: "created_from_qb", label: "Account created from trusted QuickBooks root", strength: "very_strong" },
          { type: "awaiting_moraware_confirm", label: "Moraware connect still requires explicit YES", strength: "supporting" }
        ]
      }
    ]
  };
}

export function buildFinalActionQueueSummary(readiness, pageItems = []) {
  const counts = readiness?.counts || {};
  const readyConnect = counts[FINAL_ACTION_READINESS.READY_CONNECT_EXISTING_AD] || 0;
  const readyCreate = counts[FINAL_ACTION_READINESS.READY_CREATE_FROM_QB_THEN_CONNECT] || 0;
  const already = counts[FINAL_ACTION_READINESS.ALREADY_LINKED_EXACT] || 0;
  const unresolved = readyConnect + readyCreate;
  return {
    totalMorawareAccounts: counts.total || 0,
    alreadyLinked: already,
    unresolved,
    unresolvedBucketSum: unresolved,
    finalActionAvailable: true,
    alreadyLinkedExact: already,
    readyConnectExistingAd: readyConnect,
    readyCreateFromQb: readyCreate,
    blockedMorawareSourceId: counts[FINAL_ACTION_READINESS.BLOCKED_MORAWARE_SOURCE_ID] || 0,
    nonExecutableByPlan: counts[FINAL_ACTION_READINESS.NON_EXECUTABLE_BY_PLAN] || 0,
    existingAdQbBacked: readyConnect,
    qbRootNotInDirectory: readyCreate,
    highConfidenceUnlinked: unresolved,
    reviewRequired: 0,
    unmatched: 0,
    conflicts: 0,
    pageItemCount: pageItems.length
  };
}

export function paginateFinalActionItems(items, page = 1, pageSize = 100) {
  const size = Math.min(100, Math.max(10, Number(pageSize) || 50));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    page: safePage,
    pageSize: size,
    total,
    showingFrom: total === 0 ? 0 : start + 1,
    showingTo: Math.min(start + size, total),
    items: slice
  };
}
