/**
 * Read-only Moraware → Account Directory candidate ranking.
 * Fuzzy/history may propose. Never creates links.
 */

import {
  isInternalMorawareAccountName,
  normalizeMorawareAccountKey
} from "./accountDirectoryMorawareLinkage.mjs";

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 4) return 99;
  const rows = [];
  for (let i = 0; i <= b.length; i++) rows[i] = [i];
  for (let j = 0; j <= a.length; j++) rows[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (b[i - 1] === a[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[b.length][a.length];
}

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ymd(d) {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * @param {{
 *   morawareAccount: { sourceAccountId: string, accountName: string },
 *   jobs?: Array<{ createdAtSource?: string, installAtSource?: string, completedAtSource?: string }>,
 *   directoryAccounts: Array<{ id: string, displayName: string, legalName?: string|null }>,
 *   qbLinksByAccountId?: Map<string, { listId?: string, displayName?: string|null }>,
 *   nameIndex?: Map<string, string[]>
 * }} input
 */
export function rankMorawareDirectoryCandidates(input) {
  const mwName = input.morawareAccount?.accountName || "";
  const mwId = String(input.morawareAccount?.sourceAccountId || "");
  const jobs = input.jobs || [];
  const dates = jobs
    .map((j) => toDate(j.createdAtSource) || toDate(j.installAtSource) || toDate(j.completedAtSource))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const jobs2026 = jobs.filter((j) => {
    const d = toDate(j.createdAtSource) || toDate(j.installAtSource) || toDate(j.completedAtSource);
    return d && d.getUTCFullYear() === 2026;
  }).length;

  const internal = isInternalMorawareAccountName(mwName);
  const nn = normalizeMorawareAccountKey(mwName);
  const ads = input.directoryAccounts || [];
  const qbLinks = input.qbLinksByAccountId || new Map();
  const byName = input.nameIndex || buildDirectoryNameIndex(ads);

  const exactIds = nn ? [...(byName.get(nn) || [])] : [];
  const uniqueExact = [...new Set(exactIds)];
  const alternatives = [];
  const evidence = [];
  const contradictions = [];

  if (internal) {
    return {
      morawareAccountId: mwId,
      morawareName: mwName,
      jobCount: jobs.length,
      jobs2026,
      earliestJobDate: ymd(dates[0]),
      latestJobDate: ymd(dates[dates.length - 1]),
      classification: "UNMATCHED",
      reason: "internal_or_house_bucket",
      internalBucket: true,
      proposedAccountId: null,
      proposedAccountName: null,
      qbLinked: false,
      qbDisplayName: null,
      evidence: ["internal_bucket_policy"],
      contradictions: [],
      alternatives: [],
      confidenceScore: 0
    };
  }

  for (const ad of ads) {
    const adn = normalizeMorawareAccountKey(ad.displayName);
    if (!nn || !adn || adn === nn) continue;
    const dist = levenshtein(nn, adn);
    if (dist > 0 && dist <= 2 && Math.min(nn.length, adn.length) >= 8) {
      alternatives.push({
        accountId: ad.id,
        accountName: ad.displayName,
        evidence: ["fuzzy_name"],
        score: 8
      });
    }
  }

  if (uniqueExact.length > 1) {
    const alts = uniqueExact.map((id) => {
      const ad = ads.find((a) => a.id === id);
      const qb = qbLinks.get(id);
      return {
        accountId: id,
        accountName: ad?.displayName || "",
        evidence: ["exact_name"],
        qbLinked: Boolean(qb),
        score: 45
      };
    });
    return {
      morawareAccountId: mwId,
      morawareName: mwName,
      jobCount: jobs.length,
      jobs2026,
      earliestJobDate: ymd(dates[0]),
      latestJobDate: ymd(dates[dates.length - 1]),
      classification: "CONFLICT",
      reason: "multiple_exact_directory_names",
      internalBucket: false,
      proposedAccountId: null,
      proposedAccountName: null,
      qbLinked: false,
      qbDisplayName: null,
      evidence: ["exact_name"],
      contradictions: ["two_or_more_directory_accounts_share_normalized_name"],
      alternatives: alts,
      confidenceScore: 45
    };
  }

  if (uniqueExact.length === 1) {
    const accountId = uniqueExact[0];
    const ad = ads.find((a) => a.id === accountId);
    const qb = qbLinks.get(accountId);
    evidence.push("exact_name");
    if (qb) evidence.push("quickbooks_linked");
    const classification = qb ? "HIGH_CONFIDENCE_CANDIDATE" : "REVIEW_REQUIRED";
    const reason = qb
      ? "unique_exact_name_and_quickbooks_link"
      : "unique_exact_name_without_quickbooks_link";
    return {
      morawareAccountId: mwId,
      morawareName: mwName,
      jobCount: jobs.length,
      jobs2026,
      earliestJobDate: ymd(dates[0]),
      latestJobDate: ymd(dates[dates.length - 1]),
      classification,
      reason,
      internalBucket: false,
      proposedAccountId: accountId,
      proposedAccountName: ad?.displayName || null,
      qbLinked: Boolean(qb),
      qbDisplayName: qb?.displayName || null,
      evidence,
      contradictions,
      alternatives: alternatives.filter((a) => a.accountId !== accountId).slice(0, 3),
      confidenceScore: qb ? 85 : 45
    };
  }

  const qbNameHits = [];
  for (const [accountId, qb] of qbLinks.entries()) {
    const qn = normalizeMorawareAccountKey(qb?.displayName);
    if (qn && nn && qn === nn) qbNameHits.push(accountId);
  }
  const uniqueQb = [...new Set(qbNameHits)];
  if (uniqueQb.length === 1) {
    const accountId = uniqueQb[0];
    const ad = ads.find((a) => a.id === accountId);
    const qb = qbLinks.get(accountId);
    return {
      morawareAccountId: mwId,
      morawareName: mwName,
      jobCount: jobs.length,
      jobs2026,
      earliestJobDate: ymd(dates[0]),
      latestJobDate: ymd(dates[dates.length - 1]),
      classification: "HIGH_CONFIDENCE_CANDIDATE",
      reason: "unique_exact_quickbooks_customer_name",
      internalBucket: false,
      proposedAccountId: accountId,
      proposedAccountName: ad?.displayName || null,
      qbLinked: true,
      qbDisplayName: qb?.displayName || null,
      evidence: ["exact_qb_name", "quickbooks_linked"],
      contradictions: normalizeMorawareAccountKey(ad?.displayName) === nn ? [] : ["directory_display_name_differs_from_qb"],
      alternatives: [],
      confidenceScore: 70
    };
  }

  if (alternatives.length === 1) {
    return {
      morawareAccountId: mwId,
      morawareName: mwName,
      jobCount: jobs.length,
      jobs2026,
      earliestJobDate: ymd(dates[0]),
      latestJobDate: ymd(dates[dates.length - 1]),
      classification: "UNMATCHED",
      reason: "fuzzy_name_only_not_identity",
      internalBucket: false,
      proposedAccountId: null,
      proposedAccountName: null,
      qbLinked: Boolean(qbLinks.get(alternatives[0].accountId)),
      qbDisplayName: qbLinks.get(alternatives[0].accountId)?.displayName || null,
      evidence: ["fuzzy_name"],
      contradictions: [],
      alternatives: alternatives.slice(0, 3),
      confidenceScore: 8
    };
  }

  return {
    morawareAccountId: mwId,
    morawareName: mwName,
    jobCount: jobs.length,
    jobs2026,
    earliestJobDate: ymd(dates[0]),
    latestJobDate: ymd(dates[dates.length - 1]),
    classification: "UNMATCHED",
    reason: jobs.length <= 1 ? "insufficient_or_retail_volume" : "no_deterministic_directory_match",
    internalBucket: false,
    proposedAccountId: null,
    proposedAccountName: null,
    qbLinked: false,
    qbDisplayName: null,
    evidence: [],
    contradictions: [],
    alternatives: alternatives.slice(0, 3),
    confidenceScore: 0
  };
}

export function buildDirectoryNameIndex(accounts) {
  const map = new Map();
  for (const a of accounts || []) {
    for (const raw of [a.displayName, a.legalName]) {
      const key = normalizeMorawareAccountKey(raw);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a.id);
    }
  }
  return map;
}
