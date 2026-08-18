/**
 * QB-first spine overlay for Moraware reconciliation candidates.
 * Read-only ranking/classification. Never creates links or accounts.
 *
 * Permanent identity remains:
 *   QB root ListID → (exact link) → AD UUID → (exact link) → Moraware source_account_id
 */

import { normalizeMorawareAccountKey } from "./accountDirectoryMorawareLinkage.mjs";
import { isAdQbRootCustomerFact, normalizeQuickBooksListId } from "./accountDirectoryQbLinkValidation.mjs";
import { overlayExactQuickBooksLinkOnCandidate } from "./accountDirectoryQbLinkResolution.mjs";
import {
  REVIEW_STATES as BASE_REVIEW_STATES,
  tokenSortKey,
  significantTokens,
  discoverMorawareDirectoryCandidates,
  enrichUnmatchedWithDiscovery,
  evidenceCodeToItem
} from "./accountDirectoryMorawareCandidateDiscovery.mjs";
import { collectFuzzyNameAlternatives } from "./accountDirectoryMorawareMatching.mjs";

export const SPINE_REVIEW_STATES = Object.freeze({
  ...BASE_REVIEW_STATES,
  EXISTING_AD_QB_BACKED: "EXISTING_AD_QB_BACKED",
  EXISTING_AD_QB_LINK_CANDIDATE: "EXISTING_AD_QB_LINK_CANDIDATE",
  QB_ROOT_NOT_IN_DIRECTORY: "QB_ROOT_NOT_IN_DIRECTORY",
  EXISTING_AD_PROSPECT: "EXISTING_AD_PROSPECT",
  NO_CANDIDATE: "NO_CANDIDATE"
});

/**
 * Mutually exclusive primary operational review states (Review Mode + dry-run).
 * Supporting candidate metadata may still list multiple AD/QB facts.
 */
export const PRIMARY_REVIEW_STATE_PRECEDENCE = Object.freeze([
  SPINE_REVIEW_STATES.LINKED,
  SPINE_REVIEW_STATES.INTERNAL,
  SPINE_REVIEW_STATES.CONFLICT,
  SPINE_REVIEW_STATES.EXISTING_AD_QB_BACKED,
  SPINE_REVIEW_STATES.EXISTING_AD_QB_LINK_CANDIDATE,
  SPINE_REVIEW_STATES.QB_ROOT_NOT_IN_DIRECTORY,
  SPINE_REVIEW_STATES.EXISTING_AD_PROSPECT,
  SPINE_REVIEW_STATES.POSSIBLE_CANDIDATE,
  SPINE_REVIEW_STATES.NO_CANDIDATE
]);

const PRIMARY_STATE_SET = new Set(PRIMARY_REVIEW_STATE_PRECEDENCE);

/**
 * Exactly one primary review state per Moraware row.
 * LINKED wins over candidate CONFLICT overlays; INTERNAL wins over candidate kinds.
 *
 * @param {{
 *   currentLink?: { linked?: boolean }|null,
 *   internalBucket?: boolean,
 *   reviewState?: string|null,
 *   classification?: string|null
 * }} row
 * @returns {string}
 */
export function resolvePrimaryMorawareReviewState(row) {
  if (row?.currentLink?.linked) return SPINE_REVIEW_STATES.LINKED;
  if (row?.internalBucket || row?.reviewState === SPINE_REVIEW_STATES.INTERNAL) {
    return SPINE_REVIEW_STATES.INTERNAL;
  }
  const state = String(row?.reviewState || "").trim();
  if (state === SPINE_REVIEW_STATES.CONFLICT || row?.classification === "CONFLICT") {
    return SPINE_REVIEW_STATES.CONFLICT;
  }
  if (state === "NO_DIRECTORY_CANDIDATE") return SPINE_REVIEW_STATES.NO_CANDIDATE;
  if (state === "STRONG_CANDIDATE") return SPINE_REVIEW_STATES.EXISTING_AD_QB_BACKED;
  if (PRIMARY_STATE_SET.has(state)) return state;
  return SPINE_REVIEW_STATES.NO_CANDIDATE;
}

/**
 * Exclusive operational summary from primary review states.
 * @param {Array<object>} items
 */
export function buildExclusiveMorawareReviewSummary(items = []) {
  /** @type {Record<string, number>} */
  const byPrimary = Object.fromEntries(PRIMARY_REVIEW_STATE_PRECEDENCE.map((s) => [s, 0]));
  for (const row of items) {
    const primary = resolvePrimaryMorawareReviewState(row);
    byPrimary[primary] = (byPrimary[primary] || 0) + 1;
  }
  const totalMorawareAccounts = items.length;
  const alreadyLinked = byPrimary[SPINE_REVIEW_STATES.LINKED] || 0;
  const unresolved = totalMorawareAccounts - alreadyLinked;
  const unresolvedBucketSum =
    (byPrimary[SPINE_REVIEW_STATES.EXISTING_AD_QB_BACKED] || 0) +
    (byPrimary[SPINE_REVIEW_STATES.EXISTING_AD_QB_LINK_CANDIDATE] || 0) +
    (byPrimary[SPINE_REVIEW_STATES.QB_ROOT_NOT_IN_DIRECTORY] || 0) +
    (byPrimary[SPINE_REVIEW_STATES.EXISTING_AD_PROSPECT] || 0) +
    (byPrimary[SPINE_REVIEW_STATES.POSSIBLE_CANDIDATE] || 0) +
    (byPrimary[SPINE_REVIEW_STATES.CONFLICT] || 0) +
    (byPrimary[SPINE_REVIEW_STATES.NO_CANDIDATE] || 0) +
    (byPrimary[SPINE_REVIEW_STATES.INTERNAL] || 0);

  return {
    totalMorawareAccounts,
    alreadyLinked,
    unresolved,
    unresolvedBucketSum,
    existingAdQbBacked: byPrimary[SPINE_REVIEW_STATES.EXISTING_AD_QB_BACKED] || 0,
    existingAdQbLinkCandidate: byPrimary[SPINE_REVIEW_STATES.EXISTING_AD_QB_LINK_CANDIDATE] || 0,
    qbRootNotInDirectory: byPrimary[SPINE_REVIEW_STATES.QB_ROOT_NOT_IN_DIRECTORY] || 0,
    existingAdProspect: byPrimary[SPINE_REVIEW_STATES.EXISTING_AD_PROSPECT] || 0,
    possibleCandidates: byPrimary[SPINE_REVIEW_STATES.POSSIBLE_CANDIDATE] || 0,
    conflicts: byPrimary[SPINE_REVIEW_STATES.CONFLICT] || 0,
    noCandidate: byPrimary[SPINE_REVIEW_STATES.NO_CANDIDATE] || 0,
    internalBuckets: byPrimary[SPINE_REVIEW_STATES.INTERNAL] || 0,
    // legacy aliases kept for older UI/tests (still exclusive / unlinked-only where applicable)
    strongCandidates:
      (byPrimary[SPINE_REVIEW_STATES.EXISTING_AD_QB_BACKED] || 0) +
      (byPrimary[SPINE_REVIEW_STATES.EXISTING_AD_PROSPECT] || 0),
    noDirectoryCandidate: byPrimary[SPINE_REVIEW_STATES.NO_CANDIDATE] || 0
  };
}

/** Prefer existing AD UUID reuse before JIT QB create. */
const KIND_PRIORITY = Object.freeze({
  EXISTING_AD_QB_BACKED: 1000,
  EXISTING_AD_QB_LINK_CANDIDATE: 900,
  QB_ROOT_NOT_IN_DIRECTORY: 800,
  EXISTING_AD_PROSPECT: 700,
  POSSIBLE_CANDIDATE: 500,
  NO_CANDIDATE: 0
});

function factListId(f) {
  return normalizeQuickBooksListId(f?.qbListId ?? f?.qb_list_id ?? "");
}

function factDisplayName(f) {
  return String(f?.fullName ?? f?.full_name ?? f?.name ?? "").trim();
}

function factActive(f) {
  return f?.isActive !== false && f?.is_active !== false;
}

/**
 * Compact indexes over trusted QB ROOT facts only.
 * @param {Array<object>} qbRootFacts
 * @param {Map<string, { listId?: string, displayName?: string|null }>} qbLinksByAccountId
 */
export function buildQbRootFactIndexes(qbRootFacts = [], qbLinksByAccountId = new Map()) {
  const byName = new Map();
  const byTokenSorted = new Map();
  const byListId = new Map();
  const accountIdByListId = new Map();
  const tokenIndex = new Map();

  for (const [accountId, qb] of qbLinksByAccountId || []) {
    const listId = normalizeQuickBooksListId(qb?.listId || qb?.externalId);
    if (listId) accountIdByListId.set(listId, String(accountId));
  }

  for (const fact of qbRootFacts || []) {
    if (!isAdQbRootCustomerFact(fact)) continue;
    const listId = factListId(fact);
    if (!listId) continue;
    const displayName = factDisplayName(fact);
    const nn = normalizeMorawareAccountKey(displayName);
    const row = {
      listId,
      displayName,
      isActive: factActive(fact),
      nameKey: nn
    };
    byListId.set(listId, row);
    if (nn) {
      if (!byName.has(nn)) byName.set(nn, []);
      byName.get(nn).push(row);
      const sorted = tokenSortKey(nn);
      if (sorted) {
        if (!byTokenSorted.has(sorted)) byTokenSorted.set(sorted, []);
        byTokenSorted.get(sorted).push(row);
      }
      for (const t of significantTokens(nn)) {
        if (!tokenIndex.has(t)) tokenIndex.set(t, new Set());
        tokenIndex.get(t).add(listId);
      }
    }
  }

  return { byName, byTokenSorted, byListId, accountIdByListId, tokenIndex };
}

function uniqueRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const id = r.listId || r.accountId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

function collectQbFuzzyPool(nn, qbIndexes) {
  const tokens = significantTokens(nn);
  const pool = new Set();
  for (const t of tokens) {
    const set = qbIndexes.tokenIndex.get(t);
    if (set) for (const id of set) pool.add(id);
  }
  if (!pool.size && nn) {
    const targetLen = nn.length;
    for (const [listId, row] of qbIndexes.byListId) {
      if (!row.nameKey) continue;
      if (Math.abs(row.nameKey.length - targetLen) <= 4) pool.add(listId);
    }
  }
  return [...pool]
    .map((id) => qbIndexes.byListId.get(id))
    .filter(Boolean)
    .map((r) => ({ id: r.listId, displayName: r.displayName }));
}

/**
 * Classify an AD candidate relative to QB spine.
 */
export function classifyAdCandidateKind({ accountId, qbLinked, status, qbRootMatch }) {
  if (qbLinked) return "EXISTING_AD_QB_BACKED";
  if (qbRootMatch) return "EXISTING_AD_QB_LINK_CANDIDATE";
  if (String(status || "").toLowerCase() === "prospect") return "EXISTING_AD_PROSPECT";
  return "POSSIBLE_CANDIDATE";
}

/**
 * Build spine-aware candidate list for one Moraware account.
 */
export function discoverMorawareSpineCandidates(input = {}) {
  const mw = input.morawareAccount || {};
  const mwName = mw.accountName || mw.morawareName || "";
  const nn = normalizeMorawareAccountKey(mwName);
  const indexes = input.indexes;
  const qbIndexes = input.qbRootIndexes || buildQbRootFactIndexes(input.qbRootFacts || [], input.qbLinksByAccountId);
  const directoryById = input.directoryById || indexes?.byId || new Map();

  const adDiscovery = discoverMorawareDirectoryCandidates({
    morawareAccount: mw,
    indexes
  });

  /** @type {object[]} */
  const candidates = [];

  // AD candidates first (reuse UUID)
  for (const c of adDiscovery.candidates || []) {
    const meta = directoryById.get(c.accountId) || {};
    const linkedListId = indexes?.qbLinksByAccountId?.get(c.accountId)?.listId || null;
    const qbNameHits = nn ? qbIndexes.byName.get(nn) || [] : [];
    const qbRootMatch =
      !linkedListId &&
      qbNameHits.some((r) => !qbIndexes.accountIdByListId.has(r.listId) || qbIndexes.accountIdByListId.get(r.listId) === c.accountId);
    // Also: AD name matches a QB root that isn't linked to anyone, or linked to this AD
    const unmatchedQbSameName = qbNameHits.filter((r) => !qbIndexes.accountIdByListId.has(r.listId));
    const kind = classifyAdCandidateKind({
      accountId: c.accountId,
      qbLinked: Boolean(c.qbLinked || linkedListId),
      status: meta.status || c.status,
      qbRootMatch: Boolean(qbRootMatch || (unmatchedQbSameName.length && !linkedListId && c.confidence >= 55))
    });
    const qbFact =
      (linkedListId && qbIndexes.byListId.get(linkedListId)) ||
      unmatchedQbSameName[0] ||
      null;
    const confirmMorawareAllowed =
      Boolean(c.confirmAllowed) &&
      (kind === "EXISTING_AD_QB_BACKED" ||
        kind === "EXISTING_AD_PROSPECT" ||
        kind === "POSSIBLE_CANDIDATE");
    candidates.push({
      ...c,
      identityKind: kind,
      qbListId: linkedListId || qbFact?.listId || null,
      qbDisplayName: c.qbDisplayName || qbFact?.displayName || null,
      qbActive: qbFact ? qbFact.isActive : c.qbLinked ? true : null,
      createFromQuickBooksAllowed: false,
      confirmQbLinkAllowed: kind === "EXISTING_AD_QB_LINK_CANDIDATE" && Boolean(qbFact?.listId),
      confirmMorawareAllowed,
      status: meta.status || null
    });
  }

  // Trusted QB roots not yet represented (or needing AD link via existing AD preference already handled)
  const exactQb = nn ? uniqueRows(qbIndexes.byName.get(nn) || []) : [];
  const sortedQb = nn ? uniqueRows(qbIndexes.byTokenSorted.get(tokenSortKey(nn)) || []) : [];
  let qbHits = uniqueRows([...exactQb, ...sortedQb.filter((r) => !exactQb.some((e) => e.listId === r.listId))]);

  if (!qbHits.length && nn && nn.length >= 8) {
    const fuzzyPool = collectQbFuzzyPool(nn, qbIndexes);
    const near = collectFuzzyNameAlternatives(nn, fuzzyPool);
    qbHits = uniqueRows(
      near.map((a) => qbIndexes.byListId.get(a.accountId)).filter(Boolean)
    );
  }

  // Multiple exact QB roots with same normalized name → conflict signal
  if (exactQb.length > 1) {
    for (const row of exactQb.slice(0, 3)) {
      const linkedAd = qbIndexes.accountIdByListId.get(normalizeQuickBooksListId(row.listId)) || null;
      if (linkedAd) continue; // already covered as AD-backed
      candidates.push({
        accountId: null,
        displayName: row.displayName,
        confidence: 90,
        evidence: [{ type: "qb_name", label: "Trusted QuickBooks name matches", strength: "strong" }],
        confirmAllowed: false,
        identityKind: "QB_ROOT_NOT_IN_DIRECTORY",
        qbListId: row.listId,
        qbDisplayName: row.displayName,
        qbActive: row.isActive,
        createFromQuickBooksAllowed: false,
        confirmQbLinkAllowed: false,
        confirmMorawareAllowed: false,
        conflictHint: true
      });
    }
  } else {
    for (const row of qbHits.slice(0, 3)) {
      const linkedAd = qbIndexes.accountIdByListId.get(normalizeQuickBooksListId(row.listId)) || null;
      if (linkedAd) {
        // Ensure QB-backed AD appears even if AD discovery missed it
        if (!candidates.some((c) => c.accountId === linkedAd)) {
          const meta = directoryById.get(linkedAd) || {};
          candidates.push({
            accountId: linkedAd,
            displayName: meta.displayName || row.displayName,
            confidence: 95,
            evidence: [{ type: "qb_name", label: "Trusted QuickBooks name matches", strength: "strong" }],
            confirmAllowed: true,
            identityKind: "EXISTING_AD_QB_BACKED",
            qbListId: row.listId,
            qbDisplayName: row.displayName,
            qbActive: row.isActive,
            createFromQuickBooksAllowed: false,
            confirmQbLinkAllowed: false,
            confirmMorawareAllowed: true,
            qbLinked: true,
            status: meta.status || null
          });
        }
        continue;
      }

      // Prefer existing AD with same name over JIT create
      const sameNameAds = nn ? [...(indexes?.nameIndex?.get(nn) || [])] : [];
      const unlinkedSameName = sameNameAds.filter((id) => !indexes?.qbLinksByAccountId?.get(id));
      if (unlinkedSameName.length === 1) {
        const accountId = unlinkedSameName[0];
        if (!candidates.some((c) => c.accountId === accountId && c.identityKind === "EXISTING_AD_QB_LINK_CANDIDATE")) {
          const meta = directoryById.get(accountId) || {};
          candidates.push({
            accountId,
            displayName: meta.displayName || row.displayName,
            confidence: 92,
            evidence: [
              { type: "name", label: "Exact business-name match", strength: "very_strong" },
              { type: "qb_name", label: "Trusted QuickBooks name matches", strength: "strong" }
            ],
            confirmAllowed: false,
            identityKind: "EXISTING_AD_QB_LINK_CANDIDATE",
            qbListId: row.listId,
            qbDisplayName: row.displayName,
            qbActive: row.isActive,
            createFromQuickBooksAllowed: false,
            confirmQbLinkAllowed: true,
            confirmMorawareAllowed: false,
            status: meta.status || null
          });
        }
        continue;
      }
      if (unlinkedSameName.length > 1) {
        candidates.push({
          accountId: null,
          displayName: row.displayName,
          confidence: 80,
          evidence: [{ type: "qb_name", label: "Trusted QuickBooks name matches", strength: "strong" }],
          confirmAllowed: false,
          identityKind: "CONFLICT",
          qbListId: row.listId,
          qbDisplayName: row.displayName,
          qbActive: row.isActive,
          createFromQuickBooksAllowed: false,
          confirmQbLinkAllowed: false,
          confirmMorawareAllowed: false,
          conflictHint: true
        });
        continue;
      }

      // Weak fuzzy-only QB hits must not unlock create-from-QB as strong
      const isExact = exactQb.some((e) => e.listId === row.listId) || sortedQb.some((e) => e.listId === row.listId);
      candidates.push({
        accountId: null,
        displayName: row.displayName,
        confidence: isExact ? 88 : 40,
        evidence: [
          {
            type: isExact ? "qb_name" : "name_fuzzy",
            label: isExact ? "Trusted QuickBooks name matches" : "Near QuickBooks name match",
            strength: isExact ? "strong" : "supporting"
          }
        ],
        confirmAllowed: false,
        identityKind: isExact ? "QB_ROOT_NOT_IN_DIRECTORY" : "POSSIBLE_CANDIDATE",
        qbListId: row.listId,
        qbDisplayName: row.displayName,
        qbActive: row.isActive,
        createFromQuickBooksAllowed: Boolean(isExact),
        confirmQbLinkAllowed: false,
        confirmMorawareAllowed: false
      });
    }
  }

  const overlaid = candidates.map((c) =>
    overlayExactQuickBooksLinkOnCandidate(c, qbIndexes.accountIdByListId, directoryById)
  );
  candidates.length = 0;
  candidates.push(...overlaid);

  // Sort by operational priority then confidence
  candidates.sort((a, b) => {
    const pa = KIND_PRIORITY[a.identityKind] || 0;
    const pb = KIND_PRIORITY[b.identityKind] || 0;
    if (pb !== pa) return pb - pa;
    return (b.confidence || 0) - (a.confidence || 0);
  });

  const top = candidates.slice(0, 3);
  const strongKinds = new Set([
    "EXISTING_AD_QB_BACKED",
    "EXISTING_AD_QB_LINK_CANDIDATE",
    "QB_ROOT_NOT_IN_DIRECTORY",
    "EXISTING_AD_PROSPECT"
  ]);

  let reviewState = SPINE_REVIEW_STATES.NO_CANDIDATE;
  let reason = adDiscovery.reason || "no_credible_directory_or_qb_candidate";
  let proposedAccountId = null;
  let proposedAccountName = null;
  let confidenceScore = 0;
  const contradictions = [...(adDiscovery.contradictions || [])];

  const conflictish = top.filter((c) => c.identityKind === "CONFLICT" || c.conflictHint);
  const credible = top.filter((c) => strongKinds.has(c.identityKind) || (c.identityKind === "POSSIBLE_CANDIDATE" && (c.confidence || 0) >= 55));

  if (exactQb.length > 1 && exactQb.every((r) => !qbIndexes.accountIdByListId.has(r.listId))) {
    reviewState = SPINE_REVIEW_STATES.CONFLICT;
    reason = "multiple_qb_root_name_matches";
    contradictions.push("multiple_trusted_qb_roots_share_normalized_name");
  } else if (conflictish.length && credible.length > 1) {
    reviewState = SPINE_REVIEW_STATES.CONFLICT;
    reason = "multiple_plausible_ad_or_qb_candidates";
  } else if (top[0]) {
    reviewState = top[0].identityKind === "POSSIBLE_CANDIDATE"
      ? SPINE_REVIEW_STATES.POSSIBLE_CANDIDATE
      : top[0].identityKind === "CONFLICT"
        ? SPINE_REVIEW_STATES.CONFLICT
        : top[0].identityKind;
    // Map NO_DIRECTORY legacy
    if (reviewState === "NO_DIRECTORY_CANDIDATE") reviewState = SPINE_REVIEW_STATES.NO_CANDIDATE;
    reason =
      top[0].identityKind === "QB_ROOT_NOT_IN_DIRECTORY"
        ? "trusted_qb_root_not_in_directory"
        : top[0].identityKind === "EXISTING_AD_QB_LINK_CANDIDATE"
          ? "existing_ad_needs_qb_link"
          : top[0].identityKind === "EXISTING_AD_QB_BACKED"
            ? "existing_qb_backed_ad"
            : top[0].identityKind === "EXISTING_AD_PROSPECT"
              ? "existing_prospect_ad"
              : adDiscovery.reason || reason;
    proposedAccountId = top[0].accountId || null;
    proposedAccountName = top[0].displayName || null;
    confidenceScore = top[0].confidence || 0;
  } else if (adDiscovery.reviewState === "NO_DIRECTORY_CANDIDATE" || !adDiscovery.candidates?.length) {
    reviewState = SPINE_REVIEW_STATES.NO_CANDIDATE;
  }

  // Weak fuzzy-only AD discovery without QB → NO_CANDIDATE
  if (
    reviewState === SPINE_REVIEW_STATES.POSSIBLE_CANDIDATE &&
    top.every((c) => (c.confidence || 0) < 55 && !c.qbListId)
  ) {
    reviewState = SPINE_REVIEW_STATES.NO_CANDIDATE;
    proposedAccountId = null;
    reason = adDiscovery.reason || "weak_name_similarity_only";
  }

  // Preserve Phase-0A unmatched reasons when spine does not promote.
  if (
    (reviewState === SPINE_REVIEW_STATES.NO_CANDIDATE ||
      reviewState === SPINE_REVIEW_STATES.NO_DIRECTORY_CANDIDATE) &&
    adDiscovery.reason
  ) {
    reason = adDiscovery.reason;
  }

  return {
    candidates: top,
    reviewState,
    reason,
    proposedAccountId,
    proposedAccountName,
    evidence: (top[0]?.evidence || []).map((e) => (typeof e === "string" ? e : e.type)),
    contradictions,
    confidenceScore,
    fuzzyVisits: adDiscovery.fuzzyVisits || 0,
    primaryQbListId: top[0]?.qbListId || null,
    primaryIdentityKind: top[0]?.identityKind || null
  };
}

/**
 * Enrich Phase-0A ranked row with QB-spine discovery.
 */
export function enrichWithQbSpine(ranked, spineDiscovery) {
  const base = enrichUnmatchedWithDiscovery(ranked, {
    ...spineDiscovery,
    // Keep legacy enrichment for AD-only promotion when spine says QB-backed / prospect
    reviewState:
      spineDiscovery.reviewState === SPINE_REVIEW_STATES.EXISTING_AD_QB_BACKED ||
      spineDiscovery.reviewState === SPINE_REVIEW_STATES.EXISTING_AD_PROSPECT
        ? spineDiscovery.proposedAccountId
          ? "STRONG_CANDIDATE"
          : spineDiscovery.reviewState
        : spineDiscovery.reviewState === SPINE_REVIEW_STATES.QB_ROOT_NOT_IN_DIRECTORY ||
            spineDiscovery.reviewState === SPINE_REVIEW_STATES.EXISTING_AD_QB_LINK_CANDIDATE
          ? "POSSIBLE_CANDIDATE"
          : spineDiscovery.reviewState === SPINE_REVIEW_STATES.NO_CANDIDATE
            ? "NO_DIRECTORY_CANDIDATE"
            : spineDiscovery.reviewState,
    candidates: (spineDiscovery.candidates || []).filter((c) => c.accountId)
  });

  // Override reviewState with spine states (workflow layer)
  if (ranked?.internalBucket) {
    return { ...base, reviewState: SPINE_REVIEW_STATES.INTERNAL, candidates: spineDiscovery.candidates || [] };
  }
  if (String(ranked?.classification) === "CONFLICT" && !spineDiscovery.primaryIdentityKind) {
    return { ...base, reviewState: SPINE_REVIEW_STATES.CONFLICT, candidates: spineDiscovery.candidates || base.candidates };
  }

  // Promote classification for confirmAllowed paths
  let classification = base.classification;
  if (spineDiscovery.reviewState === SPINE_REVIEW_STATES.EXISTING_AD_QB_BACKED && spineDiscovery.proposedAccountId) {
    classification = "HIGH_CONFIDENCE_CANDIDATE";
  } else if (
    spineDiscovery.reviewState === SPINE_REVIEW_STATES.EXISTING_AD_PROSPECT &&
    spineDiscovery.proposedAccountId
  ) {
    classification = "REVIEW_REQUIRED";
  } else if (spineDiscovery.reviewState === SPINE_REVIEW_STATES.CONFLICT) {
    classification = "CONFLICT";
  } else if (
    spineDiscovery.reviewState === SPINE_REVIEW_STATES.QB_ROOT_NOT_IN_DIRECTORY ||
    spineDiscovery.reviewState === SPINE_REVIEW_STATES.EXISTING_AD_QB_LINK_CANDIDATE
  ) {
    classification = "UNMATCHED";
  }

  return {
    ...base,
    classification,
    reviewState: spineDiscovery.reviewState,
    reason: (() => {
      if (
        (spineDiscovery.reviewState === SPINE_REVIEW_STATES.NO_CANDIDATE ||
          spineDiscovery.reviewState === SPINE_REVIEW_STATES.NO_DIRECTORY_CANDIDATE) &&
        ranked?.reason
      ) {
        return ranked.reason;
      }
      return spineDiscovery.reason || base.reason;
    })(),
    proposedAccountId: spineDiscovery.proposedAccountId ?? base.proposedAccountId,
    proposedAccountName: spineDiscovery.proposedAccountName ?? base.proposedAccountName,
    confidenceScore: spineDiscovery.confidenceScore || base.confidenceScore,
    contradictions: spineDiscovery.contradictions?.length ? spineDiscovery.contradictions : base.contradictions,
    candidates: (spineDiscovery.candidates || []).map((c) => ({
      ...c,
      evidence: Array.isArray(c.evidence)
        ? c.evidence.map((e) => (typeof e === "string" ? evidenceCodeToItem(e) : e))
        : []
    })),
    primaryQbListId: spineDiscovery.primaryQbListId || null,
    primaryIdentityKind: spineDiscovery.primaryIdentityKind || null
  };
}

export { KIND_PRIORITY };
