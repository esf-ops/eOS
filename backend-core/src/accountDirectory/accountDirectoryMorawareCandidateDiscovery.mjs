/**
 * Read-only Moraware → Account Directory candidate discovery accelerator.
 * Improves human confirmation UX. Never creates links. Never auto-links.
 *
 * Evidence is inspectable and deterministic. Weak fuzzy name alone never
 * becomes HIGH_CONFIDENCE / identity.
 */

import { normalizeMorawareAccountKey } from "./accountDirectoryMorawareLinkage.mjs";
import { normalizeEmail, normalizePhoneDigits } from "./accountDirectoryMasterList.mjs";
import {
  buildDirectoryNameIndex,
  buildQbDisplayNameIndex,
  collectFuzzyNameAlternatives
} from "./accountDirectoryMorawareMatching.mjs";

/** @typedef {{ type: string, label: string, strength: "very_strong"|"strong"|"supporting" }} EvidenceItem */
/** @typedef {{
 *   accountId: string,
 *   displayName: string,
 *   confidence: number,
 *   evidence: EvidenceItem[],
 *   confirmAllowed: boolean,
 *   city?: string|null,
 *   state?: string|null,
 *   primaryContact?: string|null,
 *   qbLinked?: boolean,
 *   qbDisplayName?: string|null
 * }} CandidateRow */

export const REVIEW_STATES = Object.freeze({
  STRONG_CANDIDATE: "STRONG_CANDIDATE",
  POSSIBLE_CANDIDATE: "POSSIBLE_CANDIDATE",
  NO_DIRECTORY_CANDIDATE: "NO_DIRECTORY_CANDIDATE",
  CONFLICT: "CONFLICT",
  LINKED: "LINKED",
  INTERNAL: "INTERNAL"
});

export const UNMATCHED_REASONS = Object.freeze({
  INTERNAL: "internal_or_house_bucket",
  MULTI_EXACT: "multiple_exact_directory_names",
  FUZZY_ONLY: "fuzzy_name_only_not_identity",
  LOW_VOLUME: "insufficient_or_retail_volume",
  NO_MATCH: "no_deterministic_directory_match",
  NO_CREDIBLE: "no_credible_directory_candidate",
  WEAK_NAME_ONLY: "weak_name_similarity_only",
  MULTI_PLAUSIBLE: "multiple_plausible_candidates",
  LINK_DIFFERS: "active_link_differs_from_name_candidate"
});

const SCORE = Object.freeze({
  EXACT_EMAIL: 120,
  EXACT_PHONE: 120,
  EXACT_NAME: 100,
  EXACT_ALIAS: 100,
  EXACT_QB_NAME: 90,
  TOKEN_SORTED_NAME: 85,
  HIGH_NAME_SIM: 55,
  TOKEN_OVERLAP: 40,
  FUZZY_NEAR: 25,
  SAME_CITY_STATE: 20,
  CONTACT_NAME: 15,
  QB_LINKED_SUPPORT: 12,
  SAME_CITY: 5,
  SAME_STATE: 3
});

const STRONG_FLOOR = 100;
const POSSIBLE_FLOOR = 55;
const WEAK_NAME_CAP = 40;

const STOP_TOKENS = new Set(["and", "the", "of", "for", "a", "an"]);

/**
 * Location market prefix from Moraware display names (before normalize strips it).
 * @param {string} name
 * @returns {{ city: string|null, state: string|null }}
 */
export function extractMorawareLocationHint(name) {
  const raw = String(name ?? "").trim();
  const m = raw.match(/^(dyersville|lisbon|iowa\s*city)\s*[-–—]\s*/i);
  if (!m) return { city: null, state: null };
  const token = m[1].toLowerCase().replace(/\s+/g, " ");
  if (token === "dyersville") return { city: "dyersville", state: "ia" };
  if (token === "lisbon") return { city: "lisbon", state: "ia" };
  if (token === "iowa city") return { city: "iowa city", state: "ia" };
  return { city: null, state: null };
}

export function tokenSortKey(normalizedName) {
  const tokens = String(normalizedName || "")
    .split(/\s+/)
    .filter((t) => t && !STOP_TOKENS.has(t))
    .sort();
  return tokens.join(" ");
}

export function significantTokens(normalizedName) {
  return String(normalizedName || "")
    .split(/\s+/)
    .filter((t) => t && t.length >= 3 && !STOP_TOKENS.has(t));
}

function tokenOverlapRatio(a, b) {
  const ta = new Set(significantTokens(a));
  const tb = new Set(significantTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}

function nameSimilarityPercent(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const overlap = tokenOverlapRatio(a, b);
  if (overlap >= 0.99) return 99;
  if (overlap >= 0.8) return Math.round(80 + overlap * 15);
  if (overlap >= 0.6) return Math.round(60 + overlap * 20);
  return Math.round(overlap * 100);
}

function pushEvidence(map, accountId, item, points) {
  if (!accountId) return;
  let row = map.get(accountId);
  if (!row) {
    row = { accountId, score: 0, evidence: [], types: new Set() };
    map.set(accountId, row);
  }
  if (row.types.has(item.type)) {
    // Keep strongest label for a type; still allow score only once per type.
    return;
  }
  row.types.add(item.type);
  row.score += points;
  row.evidence.push(item);
}

/**
 * Build O(1) lookup indexes once per reconciliation queue load.
 * @param {{
 *   directoryAccounts: Array<{ id: string, displayName?: string, legalName?: string|null }>,
 *   aliases?: Array<{ accountId: string, aliasValue?: string, alias?: string }>,
 *   contacts?: Array<{ accountId: string, email?: string|null, phone?: string|null, phoneNormalized?: string|null, displayName?: string|null }>,
 *   locations?: Array<{ accountId: string, city?: string|null, state?: string|null, postalCode?: string|null, isPrimaryAccountLocation?: boolean, isActive?: boolean }>,
 *   qbLinksByAccountId?: Map<string, { listId?: string, displayName?: string|null }>
 * }} input
 */
export function buildMorawareEvidenceIndexes(input = {}) {
  const ads = input.directoryAccounts || [];
  const qbLinks = input.qbLinksByAccountId || new Map();
  const nameIndex = buildDirectoryNameIndex(ads);
  const qbNameIndex = buildQbDisplayNameIndex(qbLinks);
  const aliasIndex = new Map();
  const tokenSortedIndex = new Map();
  const tokenIndex = new Map();
  const emailIndex = new Map();
  const phoneIndex = new Map();
  const cityStateIndex = new Map();
  /** @type {Map<string, object>} */
  const byId = new Map();

  for (const a of ads) {
    const id = String(a.id);
    const displayName = a.displayName || "";
    const nn = normalizeMorawareAccountKey(displayName);
    const ln = normalizeMorawareAccountKey(a.legalName);
    const meta = {
      id,
      displayName,
      legalName: a.legalName || null,
      nameKey: nn,
      legalKey: ln,
      tokenSorted: tokenSortKey(nn),
      city: null,
      state: null,
      postalCode: null,
      primaryContact: null,
      emails: [],
      phones: [],
      qbLinked: Boolean(qbLinks.get(id)),
      qbDisplayName: qbLinks.get(id)?.displayName || null
    };
    byId.set(id, meta);
    if (meta.tokenSorted) {
      if (!tokenSortedIndex.has(meta.tokenSorted)) tokenSortedIndex.set(meta.tokenSorted, []);
      tokenSortedIndex.get(meta.tokenSorted).push(id);
    }
    for (const t of significantTokens(nn)) {
      if (!tokenIndex.has(t)) tokenIndex.set(t, new Set());
      tokenIndex.get(t).add(id);
    }
  }

  for (const al of input.aliases || []) {
    const id = String(al.accountId || "");
    if (!id || !byId.has(id)) continue;
    const key = normalizeMorawareAccountKey(al.aliasValue ?? al.alias);
    if (!key) continue;
    if (!aliasIndex.has(key)) aliasIndex.set(key, []);
    aliasIndex.get(key).push(id);
  }

  for (const c of input.contacts || []) {
    const id = String(c.accountId || "");
    if (!id || !byId.has(id)) continue;
    const meta = byId.get(id);
    if (c.displayName && !meta.primaryContact) meta.primaryContact = String(c.displayName);
    const email = normalizeEmail(c.email);
    if (email.ok && email.emails?.length) {
      for (const e of email.emails) {
        if (!emailIndex.has(e)) emailIndex.set(e, []);
        emailIndex.get(e).push(id);
        meta.emails.push(e);
      }
    }
    const phone = normalizePhoneDigits(c.phoneNormalized || c.phone);
    if (phone.ok && phone.digits) {
      if (!phoneIndex.has(phone.digits)) phoneIndex.set(phone.digits, []);
      phoneIndex.get(phone.digits).push(id);
      meta.phones.push(phone.digits);
    }
  }

  for (const loc of input.locations || []) {
    if (loc.isActive === false) continue;
    const id = String(loc.accountId || "");
    if (!id || !byId.has(id)) continue;
    const meta = byId.get(id);
    const city = String(loc.city || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const state = String(loc.state || "")
      .toLowerCase()
      .trim();
    if (loc.isPrimaryAccountLocation || !meta.city) {
      if (city) meta.city = city;
      if (state) meta.state = state;
      if (loc.postalCode) meta.postalCode = String(loc.postalCode);
    }
    if (city && state) {
      const cs = `${city}|${state}`;
      if (!cityStateIndex.has(cs)) cityStateIndex.set(cs, new Set());
      cityStateIndex.get(cs).add(id);
    }
  }

  return {
    directoryAccounts: ads,
    nameIndex,
    qbNameIndex,
    aliasIndex,
    tokenSortedIndex,
    tokenIndex,
    emailIndex,
    phoneIndex,
    cityStateIndex,
    byId,
    qbLinksByAccountId: qbLinks
  };
}

function uniqueIds(ids) {
  return [...new Set((ids || []).map((id) => String(id)))];
}

function collectBoundedFuzzyPool(nn, indexes) {
  const tokens = significantTokens(nn);
  const pool = new Set();
  for (const t of tokens) {
    const set = indexes.tokenIndex.get(t);
    if (set) for (const id of set) pool.add(id);
  }
  // If token index is empty (very short name), fall back to length-bounded full scan subset.
  if (!pool.size) {
    const targetLen = nn.length;
    for (const a of indexes.directoryAccounts) {
      const adn = normalizeMorawareAccountKey(a.displayName);
      if (!adn) continue;
      if (Math.abs(adn.length - targetLen) <= 4) pool.add(String(a.id));
    }
  }
  return [...pool]
    .map((id) => indexes.byId.get(id))
    .filter(Boolean)
    .map((m) => ({ id: m.id, displayName: m.displayName }));
}

/**
 * Discover ranked candidates for one Moraware account using prebuilt indexes.
 * @returns {{
 *   candidates: CandidateRow[],
 *   reviewState: string,
 *   reason: string,
 *   proposedAccountId: string|null,
 *   proposedAccountName: string|null,
 *   evidence: string[],
 *   contradictions: string[],
 *   confidenceScore: number,
 *   fuzzyVisits: number
 * }}
 */
export function discoverMorawareDirectoryCandidates(input = {}) {
  const mw = input.morawareAccount || {};
  const mwName = mw.accountName || mw.morawareName || "";
  const indexes = input.indexes || buildMorawareEvidenceIndexes(input);
  const nn = normalizeMorawareAccountKey(mwName);
  const locHint = extractMorawareLocationHint(mwName);
  const mwEmails = (mw.emails || []).map((e) => normalizeEmail(e)).flatMap((r) => (r.ok ? r.emails : []));
  const mwPhones = (mw.phones || [])
    .map((p) => normalizePhoneDigits(p))
    .filter((r) => r.ok && r.digits)
    .map((r) => r.digits);

  /** @type {Map<string, { accountId: string, score: number, evidence: EvidenceItem[], types: Set<string> }>} */
  const scored = new Map();
  let fuzzyVisits = 0;

  // VERY STRONG: exact email / phone (Moraware-side contact hints when provided)
  for (const email of mwEmails) {
    for (const id of uniqueIds(indexes.emailIndex.get(email) || [])) {
      pushEvidence(scored, id, { type: "email", label: "Exact email", strength: "very_strong" }, SCORE.EXACT_EMAIL);
    }
  }
  for (const phone of mwPhones) {
    for (const id of uniqueIds(indexes.phoneIndex.get(phone) || [])) {
      pushEvidence(scored, id, { type: "phone", label: "Exact phone", strength: "very_strong" }, SCORE.EXACT_PHONE);
    }
  }

  // VERY STRONG / STRONG: exact normalized name + alias + QB name + token reorder
  if (nn) {
    for (const id of uniqueIds(indexes.nameIndex.get(nn) || [])) {
      pushEvidence(
        scored,
        id,
        { type: "name", label: "Exact business-name match", strength: "very_strong" },
        SCORE.EXACT_NAME
      );
    }
    for (const id of uniqueIds(indexes.aliasIndex.get(nn) || [])) {
      pushEvidence(
        scored,
        id,
        { type: "alias", label: "Account alias matches", strength: "very_strong" },
        SCORE.EXACT_ALIAS
      );
    }
    for (const id of uniqueIds(indexes.qbNameIndex.get(nn) || [])) {
      pushEvidence(
        scored,
        id,
        { type: "qb_name", label: "Trusted QuickBooks name matches", strength: "strong" },
        SCORE.EXACT_QB_NAME
      );
    }
    const sorted = tokenSortKey(nn);
    if (sorted) {
      for (const id of uniqueIds(indexes.tokenSortedIndex.get(sorted) || [])) {
        const meta = indexes.byId.get(id);
        if (meta?.nameKey === nn) continue; // already counted as exact name
        pushEvidence(
          scored,
          id,
          { type: "name_reorder", label: "Business-name tokens match (reordered)", strength: "strong" },
          SCORE.TOKEN_SORTED_NAME
        );
      }
    }
  }

  // Bounded fuzzy / token-overlap pool (skip full directory scan when possible)
  const fuzzyPool = nn ? collectBoundedFuzzyPool(nn, indexes) : [];
  const near = collectFuzzyNameAlternatives(nn, fuzzyPool, {
    onFuzzyCandidateVisit: () => {
      fuzzyVisits += 1;
    }
  });
  for (const alt of near) {
    const pct = nameSimilarityPercent(nn, normalizeMorawareAccountKey(alt.accountName));
    pushEvidence(
      scored,
      alt.accountId,
      {
        type: "name_fuzzy",
        label: pct >= 90 ? `${pct}% business-name match` : "Near business-name match",
        strength: "supporting"
      },
      SCORE.FUZZY_NEAR
    );
  }
  for (const ad of fuzzyPool) {
    const adn = normalizeMorawareAccountKey(ad.displayName);
    if (!nn || !adn || adn === nn) continue;
    const overlap = tokenOverlapRatio(nn, adn);
    if (overlap >= 0.8) {
      const pct = nameSimilarityPercent(nn, adn);
      pushEvidence(
        scored,
        ad.id,
        { type: "name_overlap", label: `${pct}% business-name match`, strength: "supporting" },
        SCORE.TOKEN_OVERLAP
      );
    } else if (overlap >= 0.65 && Math.min(nn.length, adn.length) >= 10) {
      const pct = nameSimilarityPercent(nn, adn);
      pushEvidence(
        scored,
        ad.id,
        { type: "name_overlap", label: `${pct}% business-name match`, strength: "supporting" },
        Math.round(SCORE.TOKEN_OVERLAP * 0.7)
      );
    }
  }

  // Location supporting evidence (never identity alone)
  for (const [accountId, row] of scored) {
    const meta = indexes.byId.get(accountId);
    if (!meta) continue;
    if (locHint.city && meta.city === locHint.city && locHint.state && meta.state === locHint.state) {
      pushEvidence(
        scored,
        accountId,
        { type: "location", label: "Same city/state", strength: "supporting" },
        SCORE.SAME_CITY_STATE
      );
    } else if (locHint.city && meta.city === locHint.city) {
      pushEvidence(
        scored,
        accountId,
        { type: "location", label: "Same city", strength: "supporting" },
        SCORE.SAME_CITY
      );
    } else if (locHint.state && meta.state === locHint.state) {
      pushEvidence(
        scored,
        accountId,
        { type: "location", label: "Same state", strength: "supporting" },
        SCORE.SAME_STATE
      );
    }
    if (meta.qbLinked) {
      pushEvidence(
        scored,
        accountId,
        { type: "qb_linked", label: "Directory account has QuickBooks link", strength: "supporting" },
        SCORE.QB_LINKED_SUPPORT
      );
    }
  }

  // Contact-name supporting (Moraware contact hints)
  for (const contactName of mw.contactNames || []) {
    const cn = normalizeMorawareAccountKey(contactName);
    if (!cn || cn.length < 4) continue;
    for (const meta of indexes.byId.values()) {
      const pn = normalizeMorawareAccountKey(meta.primaryContact);
      if (pn && (pn === cn || tokenSortKey(pn) === tokenSortKey(cn))) {
        pushEvidence(
          scored,
          meta.id,
          { type: "contact_name", label: "Matching contact name", strength: "supporting" },
          SCORE.CONTACT_NAME
        );
      }
    }
  }

  const ranked = [...scored.values()]
    .map((row) => {
      const meta = indexes.byId.get(row.accountId);
      const hasVeryStrong = row.evidence.some((e) => e.strength === "very_strong");
      const hasStrong = row.evidence.some((e) => e.strength === "strong");
      const nameOnly =
        row.evidence.every((e) => e.type.startsWith("name")) &&
        !hasVeryStrong &&
        row.score <= WEAK_NAME_CAP;
      return {
        accountId: row.accountId,
        displayName: meta?.displayName || "",
        confidence: Math.min(99, row.score),
        evidence: row.evidence,
        // Weak fuzzy/name-only never gets one-click confirm as "best"; staff can still Choose Different.
        confirmAllowed: !nameOnly && (hasVeryStrong || hasStrong || row.score >= POSSIBLE_FLOOR),
        city: meta?.city || null,
        state: meta?.state || null,
        primaryContact: meta?.primaryContact || null,
        qbLinked: Boolean(meta?.qbLinked),
        qbDisplayName: meta?.qbDisplayName || null,
        _score: row.score,
        _nameOnly: nameOnly
      };
    })
    .sort((a, b) => b._score - a._score || String(a.displayName).localeCompare(String(b.displayName)));

  const top = ranked.slice(0, 3);
  const credible = top.filter((c) => !c._nameOnly && c._score >= POSSIBLE_FLOOR);
  const strong = credible.filter((c) => c._score >= STRONG_FLOOR || c.evidence.some((e) => e.strength === "very_strong"));

  let reviewState = REVIEW_STATES.NO_DIRECTORY_CANDIDATE;
  let reason = UNMATCHED_REASONS.NO_CREDIBLE;
  let proposedAccountId = null;
  let proposedAccountName = null;
  let confidenceScore = 0;
  const contradictions = [];

  if (strong.length > 1 && Math.abs(strong[0]._score - strong[1]._score) <= 15) {
    reviewState = REVIEW_STATES.CONFLICT;
    reason = UNMATCHED_REASONS.MULTI_PLAUSIBLE;
    contradictions.push("multiple_strong_directory_candidates");
  } else if (strong.length >= 1) {
    reviewState = REVIEW_STATES.STRONG_CANDIDATE;
    reason = strong[0].evidence.some((e) => e.type === "alias")
      ? "exact_alias_candidate"
      : strong[0].evidence.some((e) => e.type === "email" || e.type === "phone")
        ? "exact_contact_evidence_candidate"
        : strong[0].evidence.some((e) => e.type === "qb_name")
          ? "trusted_qb_name_candidate"
          : "strong_directory_evidence_candidate";
    proposedAccountId = strong[0].accountId;
    proposedAccountName = strong[0].displayName;
    confidenceScore = strong[0].confidence;
  } else if (credible.length >= 1) {
    reviewState = REVIEW_STATES.POSSIBLE_CANDIDATE;
    reason =
      credible.length > 1 ? UNMATCHED_REASONS.MULTI_PLAUSIBLE : "possible_directory_evidence_candidate";
    proposedAccountId = credible[0].accountId;
    proposedAccountName = credible[0].displayName;
    confidenceScore = credible[0].confidence;
  } else if (top.length >= 1 && top.every((c) => c._nameOnly)) {
    reviewState = REVIEW_STATES.NO_DIRECTORY_CANDIDATE;
    reason = UNMATCHED_REASONS.WEAK_NAME_ONLY;
  } else if (!top.length) {
    reviewState = REVIEW_STATES.NO_DIRECTORY_CANDIDATE;
    reason = UNMATCHED_REASONS.NO_CREDIBLE;
  }

  const evidenceCodes = (top[0]?.evidence || []).map((e) => e.type);

  return {
    candidates: top.map(({ _score, _nameOnly, ...rest }) => rest),
    reviewState,
    reason,
    proposedAccountId,
    proposedAccountName,
    evidence: evidenceCodes,
    contradictions,
    confidenceScore,
    fuzzyVisits
  };
}

/**
 * Map legacy Phase-0A classification rows onto reviewState + candidates without
 * weakening identity rules.
 */
export function attachReviewStateToRanked(ranked, discovery = null) {
  const base = ranked && typeof ranked === "object" ? ranked : {};
  const classification = String(base.classification || "UNMATCHED");
  let reviewState = REVIEW_STATES.NO_DIRECTORY_CANDIDATE;
  let candidates = discovery?.candidates || [];

  if (base.internalBucket) {
    reviewState = REVIEW_STATES.INTERNAL;
  } else if (classification === "CONFLICT") {
    reviewState = REVIEW_STATES.CONFLICT;
  } else if (classification === "HIGH_CONFIDENCE_CANDIDATE") {
    reviewState = REVIEW_STATES.STRONG_CANDIDATE;
  } else if (classification === "REVIEW_REQUIRED") {
    reviewState = REVIEW_STATES.STRONG_CANDIDATE;
  } else if (discovery?.reviewState) {
    reviewState = discovery.reviewState;
  }

  if (!candidates.length && base.proposedAccountId) {
    candidates = [
      {
        accountId: base.proposedAccountId,
        displayName: base.proposedAccountName || "",
        confidence: base.confidenceScore || 0,
        evidence: (base.evidence || []).map((code) => evidenceCodeToItem(code)),
        confirmAllowed:
          classification === "HIGH_CONFIDENCE_CANDIDATE" || classification === "REVIEW_REQUIRED",
        qbLinked: Boolean(base.qbLinked),
        qbDisplayName: base.qbDisplayName || null
      },
      ...(base.alternatives || []).slice(0, 2).map((alt) => ({
        accountId: alt.accountId,
        displayName: alt.accountName || "",
        confidence: alt.score || 0,
        evidence: (alt.evidence || []).map((code) => evidenceCodeToItem(code)),
        confirmAllowed: false
      }))
    ];
  } else if (!candidates.length && (base.alternatives || []).length) {
    candidates = (base.alternatives || []).slice(0, 3).map((alt) => ({
      accountId: alt.accountId,
      displayName: alt.accountName || "",
      confidence: alt.score || 8,
      evidence: (alt.evidence || []).map((code) => evidenceCodeToItem(code)),
      confirmAllowed: false
    }));
  }

  return {
    ...base,
    reviewState,
    unmatchedReason: base.reason || discovery?.reason || null,
    candidates
  };
}

export function evidenceCodeToItem(code) {
  const c = String(code || "");
  if (c === "exact_name") return { type: "name", label: "Exact business-name match", strength: "very_strong" };
  if (c === "exact_qb_name") return { type: "qb_name", label: "Trusted QuickBooks name matches", strength: "strong" };
  if (c === "quickbooks_linked") {
    return { type: "qb_linked", label: "Directory account has QuickBooks link", strength: "supporting" };
  }
  if (c === "fuzzy_name") return { type: "name_fuzzy", label: "Near business-name match", strength: "supporting" };
  if (c === "exact_alias") return { type: "alias", label: "Account alias matches", strength: "very_strong" };
  return { type: c || "other", label: c.replace(/_/g, " ") || "Evidence", strength: "supporting" };
}

/**
 * Merge Phase-0A short-circuit result with discovery when still UNMATCHED.
 * Preserves existing HIGH/REVIEW/CONFLICT authority paths.
 */
export function enrichUnmatchedWithDiscovery(ranked, discovery) {
  if (!ranked || ranked.internalBucket) {
    return attachReviewStateToRanked(ranked, discovery);
  }
  if (ranked.classification === "CONFLICT" || ranked.classification === "HIGH_CONFIDENCE_CANDIDATE") {
    return attachReviewStateToRanked(ranked, discovery);
  }
  if (ranked.classification === "REVIEW_REQUIRED" && ranked.proposedAccountId) {
    return attachReviewStateToRanked(ranked, discovery);
  }

  // UNMATCHED (or empty) — promote using discovery without inventing identity.
  if (!discovery) return attachReviewStateToRanked(ranked, null);

  if (discovery.reviewState === REVIEW_STATES.STRONG_CANDIDATE && discovery.proposedAccountId) {
    const qb = Boolean(
      discovery.candidates.find((c) => c.accountId === discovery.proposedAccountId)?.qbLinked
    );
    return attachReviewStateToRanked(
      {
        ...ranked,
        classification: qb ? "HIGH_CONFIDENCE_CANDIDATE" : "REVIEW_REQUIRED",
        reason: discovery.reason,
        proposedAccountId: discovery.proposedAccountId,
        proposedAccountName: discovery.proposedAccountName,
        evidence: discovery.evidence,
        contradictions: discovery.contradictions,
        confidenceScore: discovery.confidenceScore,
        alternatives: discovery.candidates
          .filter((c) => c.accountId !== discovery.proposedAccountId)
          .map((c) => ({
            accountId: c.accountId,
            accountName: c.displayName,
            evidence: c.evidence.map((e) => e.type),
            score: c.confidence
          }))
      },
      discovery
    );
  }

  if (discovery.reviewState === REVIEW_STATES.POSSIBLE_CANDIDATE && discovery.proposedAccountId) {
    return attachReviewStateToRanked(
      {
        ...ranked,
        classification: "UNMATCHED",
        reason: discovery.reason,
        proposedAccountId: discovery.proposedAccountId,
        proposedAccountName: discovery.proposedAccountName,
        evidence: discovery.evidence,
        contradictions: discovery.contradictions,
        confidenceScore: discovery.confidenceScore,
        alternatives: discovery.candidates
          .filter((c) => c.accountId !== discovery.proposedAccountId)
          .map((c) => ({
            accountId: c.accountId,
            accountName: c.displayName,
            evidence: c.evidence.map((e) => e.type),
            score: c.confidence
          }))
      },
      discovery
    );
  }

  if (discovery.reviewState === REVIEW_STATES.CONFLICT) {
    return attachReviewStateToRanked(
      {
        ...ranked,
        classification: "CONFLICT",
        reason: discovery.reason,
        proposedAccountId: null,
        proposedAccountName: null,
        evidence: discovery.evidence,
        contradictions: discovery.contradictions,
        confidenceScore: discovery.confidenceScore,
        alternatives: discovery.candidates.map((c) => ({
          accountId: c.accountId,
          accountName: c.displayName,
          evidence: c.evidence.map((e) => e.type),
          score: c.confidence
        }))
      },
      discovery
    );
  }

  return attachReviewStateToRanked(
    {
      ...ranked,
      // Preserve Phase-0A unmatched reasons when discovery does not promote.
      reason: ranked.reason || discovery.reason,
      confidenceScore: Math.max(discovery.confidenceScore || 0, ranked.confidenceScore || 0),
      alternatives:
        (ranked.alternatives || []).length > 0
          ? ranked.alternatives
          : discovery.candidates.map((c) => ({
              accountId: c.accountId,
              accountName: c.displayName,
              evidence: c.evidence.map((e) => e.type),
              score: c.confidence
            }))
    },
    {
      ...discovery,
      reason: ranked.reason || discovery.reason,
      // Keep reviewState NO_DIRECTORY; still attach weak candidates for staff visibility.
      candidates:
        discovery.candidates.length > 0
          ? discovery.candidates
          : (ranked.alternatives || []).slice(0, 3).map((alt) => ({
              accountId: alt.accountId,
              displayName: alt.accountName || "",
              confidence: alt.score || 8,
              evidence: (alt.evidence || []).map((code) => ({
                type: code,
                label: String(code).replace(/_/g, " "),
                strength: "supporting"
              })),
              confirmAllowed: false
            }))
    }
  );
}
