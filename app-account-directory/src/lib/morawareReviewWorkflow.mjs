/**
 * Moraware Links Review Mode — queue/workflow helpers (UI correctness).
 * Does not create links. Primary reviewState is the authority.
 */

export const UNRESOLVED_PRIMARY_STATES = Object.freeze([
  "EXISTING_AD_QB_BACKED",
  "EXISTING_AD_QB_LINK_CANDIDATE",
  "QB_ROOT_NOT_IN_DIRECTORY",
  "EXISTING_AD_PROSPECT",
  "POSSIBLE_CANDIDATE",
  "CONFLICT",
  "NO_CANDIDATE",
  "NO_DIRECTORY_CANDIDATE",
  "INTERNAL",
  "STRONG_CANDIDATE"
]);

export const WORK_QUEUE_FILTERS = Object.freeze([
  { id: "", label: "All remaining" },
  { id: "review:EXISTING_AD_QB_BACKED", label: "Ready" },
  { id: "review:EXISTING_AD_QB_LINK_CANDIDATE", label: "Needs QB connection" },
  { id: "review:QB_ROOT_NOT_IN_DIRECTORY", label: "QB customer found" },
  { id: "review:POSSIBLE_CANDIDATE", label: "Possible" },
  { id: "review:EXISTING_AD_PROSPECT", label: "Prospect" },
  { id: "review:CONFLICT", label: "Conflict" },
  { id: "review:NO_CANDIDATE", label: "No match" },
  { id: "review:INTERNAL", label: "Internal" }
]);

/**
 * @param {{ reviewState?: string|null, currentLink?: { linked?: boolean }|null, classification?: string|null }} row
 */
export function isUnresolvedWorkRow(row) {
  if (!row) return false;
  if (row.currentLink?.linked) return false;
  if (String(row.reviewState || "") === "LINKED") return false;
  // Supporting CONFLICT classification must not pull linked rows into work.
  return true;
}

/**
 * Default API query for the working queue (excludes LINKED).
 * @param {{ filter?: string, search?: string, page?: number, pageSize?: number, mode?: "work"|"linked" }} opts
 */
export function buildMorawareQueueQuery(opts = {}) {
  const mode = opts.mode === "linked" ? "linked" : "work";
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 100));
  const search = String(opts.search || "").trim();
  const filter = String(opts.filter || "");

  if (mode === "linked") {
    return {
      linked: "true",
      reviewState: "LINKED",
      classification: "",
      search,
      page,
      pageSize
    };
  }

  const isReview = filter.startsWith("review:");
  const reviewState = isReview ? filter.slice("review:".length) : "";
  if (reviewState === "LINKED") {
    // Guard: Linked is never a work-queue filter.
    return {
      linked: "false",
      reviewState: "",
      classification: "",
      search,
      page,
      pageSize
    };
  }

  return {
    linked: "false",
    reviewState: reviewState || "",
    classification: "",
    search,
    page,
    pageSize
  };
}

/**
 * @param {{ totalMorawareAccounts?: number, alreadyLinked?: number, unresolved?: number }|null|undefined} summary
 */
export function remainingFromSummary(summary) {
  if (!summary) return 0;
  if (summary.unresolved != null) return Math.max(0, Number(summary.unresolved) || 0);
  const total = Number(summary.totalMorawareAccounts) || 0;
  const linked = Number(summary.alreadyLinked) || 0;
  return Math.max(0, total - linked);
}

/**
 * After YES success: remove row, decrement remaining, pick next unresolved id.
 * @param {Array<{ morawareAccountId: string }>} items
 * @param {string} confirmedId
 * @param {{ unresolved?: number, alreadyLinked?: number, totalMorawareAccounts?: number }} summary
 */
export function applySuccessfulYes(items, confirmedId, summary) {
  const remainingItems = (items || []).filter((r) => r.morawareAccountId !== confirmedId);
  const idx = (items || []).findIndex((r) => r.morawareAccountId === confirmedId);
  const next =
    remainingItems[Math.min(Math.max(idx, 0), Math.max(remainingItems.length - 1, 0))] || null;
  const unresolved = Math.max(0, remainingFromSummary(summary) - 1);
  const alreadyLinked = (Number(summary?.alreadyLinked) || 0) + 1;
  return {
    remainingItems,
    nextId: next?.morawareAccountId || null,
    summaryPatch: {
      unresolved,
      alreadyLinked,
      unresolvedBucketSum: unresolved
    }
  };
}

/**
 * SKIP: advance without resolving. Global remaining unchanged.
 * @param {Array<{ morawareAccountId: string }>} items
 * @param {string} currentId
 */
export function applySkip(items, currentId) {
  const list = items || [];
  const idx = list.findIndex((r) => r.morawareAccountId === currentId);
  if (idx < 0) return { nextId: list[0]?.morawareAccountId || null, remainingUnchanged: true };
  const next = list[idx + 1] || list[0] || null;
  // If only one item, stay (or null) — caller may reload next page.
  if (list.length <= 1) return { nextId: null, remainingUnchanged: true, needsNextPage: true };
  if (idx + 1 >= list.length) return { nextId: list[0]?.morawareAccountId || null, remainingUnchanged: true };
  return { nextId: next.morawareAccountId, remainingUnchanged: true };
}

/**
 * NO: cycle candidate index on the same Moraware row.
 * @param {number} candidateIndex
 * @param {number} candidateCount
 */
export function applyNoNextMatch(candidateIndex, candidateCount) {
  const n = Math.max(0, Number(candidateCount) || 0);
  if (n <= 1) return { nextIndex: 0, cycled: false };
  const cur = Math.max(0, Number(candidateIndex) || 0);
  return { nextIndex: (cur + 1) % n, cycled: true };
}

/**
 * Operational labels for summary breakdown.
 */
export function operationalBreakdown(summary) {
  const s = summary || {};
  return [
    { key: "ready", label: "Ready to connect", count: s.existingAdQbBacked ?? 0, hint: "Existing QB-backed Account Directory customer" },
    { key: "needsQb", label: "Needs QB connection", count: s.existingAdQbLinkCandidate ?? 0, hint: "Existing AD account; confirm QuickBooks ListID first" },
    { key: "qbFound", label: "QB customer found", count: s.qbRootNotInDirectory ?? 0, hint: "Create Account Directory customer from trusted QuickBooks root" },
    { key: "prospect", label: "Prospect", count: s.existingAdProspect ?? 0, hint: "AD-native prospect (not QB-backed)" },
    { key: "possible", label: "Possible", count: s.possibleCandidates ?? 0, hint: "Weaker evidence — confirm carefully" },
    { key: "conflict", label: "Conflict", count: s.conflicts ?? 0, hint: "Multiple meaningful candidates" },
    { key: "noMatch", label: "No match", count: s.noCandidate ?? s.noDirectoryCandidate ?? 0, hint: "Search customers or create new" },
    { key: "internal", label: "Internal", count: s.internalBuckets ?? 0, hint: "House/internal Moraware buckets" }
  ];
}

/**
 * Merge AD list + QB root search into labeled result groups. Never auto-link.
 * @param {{ adItems?: Array<object>, qbItems?: Array<object> }} input
 */
export function buildUnifiedCustomerSearchResults(input = {}) {
  const directory = (input.adItems || []).map((a) => ({
    kind: "account_directory",
    id: a.id,
    displayName: a.displayName || a.name || "Account",
    subtitle: [a.status === "prospect" ? "Prospect" : "Account Directory", a.city, a.state]
      .filter(Boolean)
      .join(" · "),
    accountId: a.id,
    qbListId: null,
    status: a.status || null,
    city: a.city || null,
    state: a.state || null
  }));
  const quickbooks = (input.qbItems || [])
    .filter((q) => q && q.listId)
    .map((q) => ({
      kind: "quickbooks_root",
      id: `qb:${q.listId}`,
      displayName: q.displayName || q.listId,
      subtitle: q.active === false ? "QuickBooks customer · Inactive" : "QuickBooks customer · Not yet in Account Directory",
      accountId: null,
      qbListId: q.listId,
      active: q.active !== false
    }));
  return { directory, quickbooks };
}

const ACTIONABLE_READY_KINDS = new Set(["connect_moraware", "confirm_qb", "create_from_qb"]);

/**
 * Primary reviewer action for the current candidate card.
 *
 * `confirmAllowed` is algorithmic confidence, not a permission to confirm.
 * The governed Moraware link endpoint accepts an explicit human confirmation
 * of an exact Account Directory UUID (same as Search → select).
 *
 * @param {object|null|undefined} item
 * @param {object|null|undefined} candidate
 */
export function primaryReviewAction(item, candidate) {
  if (!item || item.currentLink?.linked || String(item.reviewState || "") === "LINKED") {
    return { kind: "none", label: "" };
  }
  if (item.internalBucket || String(item.reviewState || "") === "INTERNAL") {
    return { kind: "none", label: "" };
  }
  const state = String(item.reviewState || "");
  if (!candidate) return { kind: "search", label: "Search customers" };
  if (candidate.createFromQuickBooksAllowed && candidate.qbListId && !candidate.accountId) {
    return { kind: "create_from_qb", label: "YES — Create from QuickBooks" };
  }
  if (candidate.confirmQbLinkAllowed && candidate.accountId && candidate.qbListId) {
    return { kind: "confirm_qb", label: "YES — Confirm QuickBooks" };
  }
  if (candidate.accountId && state !== "CONFLICT") {
    return { kind: "connect_moraware", label: "YES — Connect" };
  }
  if (state === "CONFLICT") return { kind: "review", label: "Review this account" };
  return { kind: "search", label: "Search customers" };
}

/**
 * Badge copy must match the available primary action.
 * Never label Ready unless YES / create / confirm-QB is available.
 *
 * @param {object|null|undefined} item
 * @param {object|null|undefined} candidate
 */
export function reviewBadgeForItem(item, candidate) {
  const state = String(item?.reviewState || "");
  if (state === "LINKED" || item?.currentLink?.linked) return { label: "Linked", tone: "linked" };
  if (state === "INTERNAL" || item?.internalBucket) return { label: "Internal", tone: "none" };
  if (state === "CONFLICT") return { label: "Conflict", tone: "conflict" };

  const action = primaryReviewAction(item, candidate);
  if (state === "EXISTING_AD_QB_BACKED") {
    if (ACTIONABLE_READY_KINDS.has(action.kind)) return { label: "Ready", tone: "strong" };
    return { label: "Possible match", tone: "possible" };
  }
  if (state === "EXISTING_AD_QB_LINK_CANDIDATE") return { label: "Needs QB connection", tone: "possible" };
  if (state === "QB_ROOT_NOT_IN_DIRECTORY") return { label: "QB customer found", tone: "possible" };
  if (state === "EXISTING_AD_PROSPECT") return { label: "Prospect", tone: "possible" };
  if (state === "POSSIBLE_CANDIDATE" || state === "STRONG_CANDIDATE") return { label: "Possible", tone: "possible" };
  if (state === "NO_CANDIDATE" || state === "NO_DIRECTORY_CANDIDATE") return { label: "No match", tone: "none" };
  return { label: "Remaining", tone: "none" };
}

/**
 * @param {object|null|undefined} item
 * @param {object|null|undefined} candidate
 */
export function readyHasActionablePrimaryPath(item, candidate) {
  const badge = reviewBadgeForItem(item, candidate);
  if (badge.label !== "Ready") return true;
  return ACTIONABLE_READY_KINDS.has(primaryReviewAction(item, candidate).kind);
}

/**
 * Weak name similarity copy — shown when a UUID is suggested without strong evidence.
 * @param {object|null|undefined} candidate
 */
export function weakSuggestionHint(candidate) {
  if (!candidate?.accountId) return null;
  if (candidate.confirmAllowed || candidate.confirmMorawareAllowed) return null;
  return "Name similarity suggests this customer. Verify before connecting.";
}
