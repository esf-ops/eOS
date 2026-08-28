/**
 * Sales Ops Account Directory identity review.
 * Permanent Monday links are exact IDs only. Name/alias/hint evidence is candidate-only.
 */

import { mondayExternalId } from "./salesOpsConstants.js";
import { normalizeOrgMatchKey } from "../accountDirectory/accountDirectoryMasterList.mjs";

export const IDENTITY_REVIEW_STATUSES = Object.freeze([
  "EXACT_SOURCE_ID",
  "EXACT_AUTO_LINKABLE",
  "REVIEW_REQUIRED",
  "NO_CANDIDATE",
  "CONFLICT"
]);

export const AUTO_LINKABLE_EVIDENCE = Object.freeze(["existing_monday_external_link", "exact_source_id"]);
export const BULK_EXACT_NAME_EVIDENCE = "exact_display_name";
export const WEAK_ALIAS_EVIDENCE = "starter_package_weak_alias";
export const STARTER_PACK_KEY = "starter_handoff_v1";

export function isExactSourceIdStatus(status) {
  return status === "EXACT_SOURCE_ID" || status === "EXACT_AUTO_LINKABLE";
}

function norm(value) {
  return normalizeOrgMatchKey(value);
}

function uniqueIds(ids) {
  return [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
}

function pushCandidate(map, accountId, evidence, extras = {}) {
  const id = String(accountId || "").trim();
  if (!id) return;
  if (!map.has(id)) {
    map.set(id, {
      accountDirectoryAccountId: id,
      displayName: extras.displayName || null,
      evidence: [],
      morawareIds: extras.morawareIds || [],
      quickbooksLinked: Boolean(extras.quickbooksLinked),
      masterListLinked: Boolean(extras.masterListLinked),
      hintStrength: extras.hintStrength || null
    });
  }
  const row = map.get(id);
  if (evidence && !row.evidence.includes(evidence)) row.evidence.push(evidence);
  if (extras.displayName && !row.displayName) row.displayName = extras.displayName;
  if (extras.hintStrength) row.hintStrength = extras.hintStrength;
}

/**
 * Classify one Sales Ops Monday account against exact AD links and candidate-only evidence.
 * Never promotes name/alias/hint to EXACT_AUTO_LINKABLE.
 */
export function classifyIdentityCase({
  account,
  mondayMatches = [],
  directoryByNorm = new Map(),
  aliasesByNorm = new Map(),
  hints = [],
  morawareByAccount = new Map(),
  qbByAccount = new Map(),
  masterListByAccount = new Map(),
  directoryNameById = new Map()
} = {}) {
  const mondayKey = mondayExternalId(account.mondayBoardId, account.mondayItemId);
  const projected = String(account.accountDirectoryAccountId || "").trim();
  const uniqueMonday = uniqueIds(mondayMatches);

  if (uniqueMonday.length > 1) {
    return {
      status: "CONFLICT",
      autoLinkable: false,
      canonicalAccountDirectoryAccountId: null,
      evidence: ["duplicate_monday_external_id"],
      candidates: uniqueMonday.map((id) => ({
        accountDirectoryAccountId: id,
        displayName: directoryNameById.get(id) || null,
        evidence: ["existing_monday_external_link"],
        morawareIds: morawareByAccount.get(id) || [],
        quickbooksLinked: (qbByAccount.get(id) || []).length > 0,
        masterListLinked: (masterListByAccount.get(id) || []).length > 0
      })),
      conflictReason: "monday_external_id_maps_to_multiple_directory_accounts",
      exclusionHint: Boolean(hints.find((h) => h.evidenceKind === "exclusion"))
    };
  }

  if (uniqueMonday.length === 1) {
    const canonical = uniqueMonday[0];
    if (projected && projected !== canonical) {
      return {
        status: "CONFLICT",
        autoLinkable: false,
        canonicalAccountDirectoryAccountId: null,
        evidence: ["projection_disagrees_with_monday_link"],
        candidates: [],
        conflictReason: "sales_ops_projection_disagrees_with_exact_monday_link",
        exclusionHint: Boolean(hints.find((h) => h.evidenceKind === "exclusion"))
      };
    }
    return {
      status: "EXACT_SOURCE_ID",
      autoLinkable: true,
      canonicalAccountDirectoryAccountId: canonical,
      evidence: ["existing_monday_external_link"],
      candidates: [
        {
          accountDirectoryAccountId: canonical,
          displayName: directoryNameById.get(canonical) || null,
          evidence: ["existing_monday_external_link"],
          morawareIds: morawareByAccount.get(canonical) || [],
          quickbooksLinked: (qbByAccount.get(canonical) || []).length > 0,
          masterListLinked: (masterListByAccount.get(canonical) || []).length > 0
        }
      ],
      conflictReason: null,
      exclusionHint: Boolean(hints.find((h) => h.evidenceKind === "exclusion"))
    };
  }

  if (projected) {
    return {
      status: "CONFLICT",
      autoLinkable: false,
      canonicalAccountDirectoryAccountId: null,
      evidence: ["projection_without_exact_monday_link"],
      candidates: [],
      conflictReason: "projection_without_exact_monday_link",
      exclusionHint: Boolean(hints.find((h) => h.evidenceKind === "exclusion"))
    };
  }

  const candidates = new Map();
  const mondayNorm = norm(account.accountName);
  if (mondayNorm) {
    for (const hit of directoryByNorm.get(mondayNorm) || []) {
      pushCandidate(candidates, hit.id, "exact_display_name", {
        displayName: hit.displayName,
        morawareIds: morawareByAccount.get(hit.id) || [],
        quickbooksLinked: (qbByAccount.get(hit.id) || []).length > 0,
        masterListLinked: (masterListByAccount.get(hit.id) || []).length > 0
      });
    }
    for (const hit of aliasesByNorm.get(mondayNorm) || []) {
      pushCandidate(candidates, hit.accountId, "exact_alias", {
        displayName: directoryNameById.get(hit.accountId) || hit.aliasValue,
        morawareIds: morawareByAccount.get(hit.accountId) || [],
        quickbooksLinked: (qbByAccount.get(hit.accountId) || []).length > 0,
        masterListLinked: (masterListByAccount.get(hit.accountId) || []).length > 0
      });
    }
  }

  for (const hint of hints || []) {
    const suggestedNorm = norm(hint.suggestedDirectoryName);
    const suggested = suggestedNorm ? directoryByNorm.get(suggestedNorm) || [] : [];
    const evidence =
      hint.strength === "weak" ? "starter_package_weak_alias" : hint.evidenceKind === "exclusion" ? "exclusion_hint" : "starter_package_alias";
    for (const hit of suggested) {
      pushCandidate(candidates, hit.id, evidence, {
        displayName: hit.displayName,
        hintStrength: hint.strength || "standard",
        morawareIds: morawareByAccount.get(hit.id) || [],
        quickbooksLinked: (qbByAccount.get(hit.id) || []).length > 0,
        masterListLinked: (masterListByAccount.get(hit.id) || []).length > 0
      });
    }
  }

  const list = [...candidates.values()];
  const exclusionHint = Boolean((hints || []).find((h) => h.evidenceKind === "exclusion"));
  if (!list.length) {
    return {
      status: "NO_CANDIDATE",
      autoLinkable: false,
      canonicalAccountDirectoryAccountId: null,
      evidence: exclusionHint ? ["exclusion_hint"] : [],
      candidates: [],
      conflictReason: null,
      exclusionHint
    };
  }
  if (list.length > 1) {
    return {
      status: "CONFLICT",
      autoLinkable: false,
      canonicalAccountDirectoryAccountId: null,
      evidence: uniqueIds(list.flatMap((c) => c.evidence)),
      candidates: list,
      conflictReason: "multiple_directory_candidates",
      exclusionHint
    };
  }
  return {
    status: "REVIEW_REQUIRED",
    autoLinkable: false,
    canonicalAccountDirectoryAccountId: null,
    evidence: list[0].evidence,
    candidates: list,
    conflictReason: null,
    exclusionHint
  };
}

export function buildIdentityIndexes({ directoryAccounts = [], aliases = [], morawareLinks = [], qbLinks = [], masterListLinks = [], hints = [] } = {}) {
  const directoryByNorm = new Map();
  const directoryNameById = new Map();
  for (const row of directoryAccounts) {
    directoryNameById.set(String(row.id), row.displayName || null);
    const key = norm(row.displayName);
    if (!key) continue;
    if (!directoryByNorm.has(key)) directoryByNorm.set(key, []);
    directoryByNorm.get(key).push({ id: String(row.id), displayName: row.displayName });
  }
  const aliasesByNorm = new Map();
  for (const row of aliases) {
    const key = norm(row.normalizedMatchValue || row.aliasValue);
    if (!key) continue;
    if (!aliasesByNorm.has(key)) aliasesByNorm.set(key, []);
    aliasesByNorm.get(key).push({ accountId: String(row.accountId), aliasValue: row.aliasValue });
  }
  const byAccount = (links) => {
    const map = new Map();
    for (const link of links || []) {
      const id = String(link.accountId || "").trim();
      const ext = String(link.externalId || "").trim();
      if (!id || !ext) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(ext);
    }
    return map;
  };
  const hintsByMondayNorm = new Map();
  for (const hint of hints || []) {
    const key = norm(hint.mondayName);
    if (!key) continue;
    if (!hintsByMondayNorm.has(key)) hintsByMondayNorm.set(key, []);
    hintsByMondayNorm.get(key).push(hint);
  }
  return {
    directoryByNorm,
    directoryNameById,
    aliasesByNorm,
    morawareByAccount: byAccount(morawareLinks),
    qbByAccount: byAccount(qbLinks),
    masterListByAccount: byAccount(masterListLinks),
    hintsByMondayNorm
  };
}

export function mondayMatchesForAccount(account, mondayByExternal) {
  const key = mondayExternalId(account.mondayBoardId, account.mondayItemId);
  return [...(mondayByExternal.get(key) || [])];
}

export function groupLinksByExternal(links) {
  const map = new Map();
  for (const link of links || []) {
    const ext = String(link.externalId || "").trim();
    const acc = String(link.accountId || "").trim();
    if (!ext || !acc) continue;
    if (!map.has(ext)) map.set(ext, new Set());
    map.get(ext).add(acc);
  }
  return map;
}

export function summarizeReviewRows(rows) {
  const counts = {
    exactSourceId: 0,
    exactAutoLinkable: 0,
    reviewRequired: 0,
    noCandidate: 0,
    conflict: 0,
    total: rows.length
  };
  for (const row of rows) {
    if (isExactSourceIdStatus(row.status)) {
      counts.exactSourceId += 1;
      counts.exactAutoLinkable += 1;
    } else if (row.status === "REVIEW_REQUIRED") counts.reviewRequired += 1;
    else if (row.status === "NO_CANDIDATE") counts.noCandidate += 1;
    else if (row.status === "CONFLICT") counts.conflict += 1;
  }
  return counts;
}

export function canAutoCommit(classified) {
  return Boolean(
    classified?.autoLinkable &&
      isExactSourceIdStatus(classified.status) &&
      classified.canonicalAccountDirectoryAccountId
  );
}

function candidateEvidence(row) {
  const fromRow = Array.isArray(row?.evidence) ? row.evidence : [];
  const fromCandidates = (row?.candidates || []).flatMap((c) => c.evidence || []);
  return uniqueIds([...fromRow, ...fromCandidates]);
}

export function bulkSkipReason(row) {
  if (!row) return "missing_review";
  if (isExactSourceIdStatus(row.status)) return "already_linked";
  if (row.status === "NO_CANDIDATE") return "no_candidate";
  if (row.status === "CONFLICT") return "conflict";
  if (row.status !== "REVIEW_REQUIRED") return "not_review_required";
  const candidates = row.candidates || [];
  if (candidates.length === 0) return "no_candidate";
  if (candidates.length !== 1) return "not_unique_candidate";
  const evidence = candidateEvidence(row);
  if (evidence.includes(WEAK_ALIAS_EVIDENCE) || candidates[0].hintStrength === "weak") {
    return "weak_alias_not_bulk_eligible";
  }
  if (!evidence.includes(BULK_EXACT_NAME_EVIDENCE)) return "not_exact_display_name";
  return null;
}

/**
 * Unique 1:1 exact-display-name candidates may be bulk *human-approved*.
 * This is not automatic identity. Weak aliases and alias-only hits are excluded.
 */
export function isExactNameBulkEligible(row) {
  return bulkSkipReason(row) == null;
}

export function matchMethodFromReview(row) {
  const evidence = candidateEvidence(row);
  if (evidence.includes("existing_monday_external_link") || evidence.includes("exact_source_id")) {
    return "existing_monday_external_link";
  }
  if (evidence.includes(BULK_EXACT_NAME_EVIDENCE)) return BULK_EXACT_NAME_EVIDENCE;
  if (evidence.includes("exact_alias")) return "exact_alias";
  if (evidence.includes(WEAK_ALIAS_EVIDENCE)) return WEAK_ALIAS_EVIDENCE;
  return (evidence[0] || "human_review");
}

export function baselineMonthTotals(facts) {
  const byMonth = new Map();
  for (const fact of facts || []) {
    if (String(fact.status || "credited") !== "credited") continue;
    const month = String(fact.performanceMonth || "");
    const sf = Number(fact.creditedSf);
    if (!month || !Number.isFinite(sf)) continue;
    byMonth.set(month, Math.round(((byMonth.get(month) || 0) + sf) * 100) / 100);
  }
  const may = byMonth.get("2026-05") ?? 0;
  const june = byMonth.get("2026-06") ?? 0;
  const july = byMonth.get("2026-07") ?? 0;
  const total = Math.round((may + june + july) * 100) / 100;
  return {
    may,
    june,
    july,
    total,
    average: Math.round((total / 3) * 10) / 10
  };
}

/** Sentinel acceptance totals from the approved May–July 2026 baseline package. */
export const COMPLETED_SF_BASELINE_ACCEPTANCE = Object.freeze({
  may: 574.5,
  june: 669.0,
  july: 334.0,
  total: 1577.5,
  average: 525.8
});
