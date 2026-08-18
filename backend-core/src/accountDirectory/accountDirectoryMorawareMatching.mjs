/**
 * Read-only Moraware → Account Directory candidate ranking.
 * Fuzzy/history may propose. Never creates links.
 *
 * Deterministic exact / multi-exact / QB-name resolution runs before the
 * expensive fuzzy directory scan. Fuzzy still runs for unique-exact rows so
 * near-neighbor `alternatives` stay behavior-identical.
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

function jobActivityDate(job) {
  return (
    toDate(job?.createdAtSource ?? job?.created_at_source) ||
    toDate(job?.installAtSource ?? job?.install_at_source) ||
    toDate(job?.completedAtSource ?? job?.completed_at_source)
  );
}

/**
 * Shared job-stat derivation so array input and compact stats cannot drift.
 * @param {Array<{ createdAtSource?: string, installAtSource?: string, completedAtSource?: string }>|null|undefined} jobs
 */
export function deriveMorawareJobStatsFromJobs(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const dates = list.map((j) => jobActivityDate(j)).filter(Boolean).sort((a, b) => a - b);
  let jobs2026 = 0;
  for (const d of dates) {
    if (d.getUTCFullYear() === 2026) jobs2026 += 1;
  }
  return {
    jobCount: list.length,
    jobs2026,
    earliestJobDate: ymd(dates[0]),
    latestJobDate: ymd(dates[dates.length - 1])
  };
}

/**
 * Resolve ranker job fields from precomputed stats or legacy jobs arrays.
 * @param {{ jobStats?: object|null, jobs?: Array|null|undefined }} input
 */
export function resolveMorawareJobStats(input = {}) {
  if (input.jobStats && typeof input.jobStats === "object") {
    return {
      jobCount: Number(input.jobStats.jobCount) || 0,
      jobs2026: Number(input.jobStats.jobs2026) || 0,
      earliestJobDate: input.jobStats.earliestJobDate ?? null,
      latestJobDate: input.jobStats.latestJobDate ?? null
    };
  }
  return deriveMorawareJobStatsFromJobs(input.jobs);
}

/**
 * Fold one Brain job row into a mutable accumulator (reconciliation load path).
 * @param {Map<string, { jobCount: number, jobs2026: number, earliestMs: number|null, latestMs: number|null }>} map
 * @param {string} sourceAccountId
 * @param {object} jobRow brain_moraware_jobs-shaped row (snake or camel date fields)
 */
export function accumulateMorawareJobStats(map, sourceAccountId, jobRow) {
  const id = String(sourceAccountId || "");
  if (!id) return;
  let acc = map.get(id);
  if (!acc) {
    acc = { jobCount: 0, jobs2026: 0, earliestMs: null, latestMs: null };
    map.set(id, acc);
  }
  acc.jobCount += 1;
  const d = jobActivityDate(jobRow);
  if (!d) return;
  const ms = d.getTime();
  if (d.getUTCFullYear() === 2026) acc.jobs2026 += 1;
  if (acc.earliestMs == null || ms < acc.earliestMs) acc.earliestMs = ms;
  if (acc.latestMs == null || ms > acc.latestMs) acc.latestMs = ms;
}

/**
 * Finalize mutable accumulators into frozen-shape jobStats maps.
 * @param {Map<string, { jobCount: number, jobs2026: number, earliestMs: number|null, latestMs: number|null }>} accMap
 */
export function finalizeMorawareJobStatsMap(accMap) {
  const out = new Map();
  for (const [id, acc] of accMap || []) {
    out.set(id, {
      jobCount: acc.jobCount,
      jobs2026: acc.jobs2026,
      earliestJobDate: acc.earliestMs != null ? ymd(new Date(acc.earliestMs)) : null,
      latestJobDate: acc.latestMs != null ? ymd(new Date(acc.latestMs)) : null
    });
  }
  return out;
}

function indexDirectoryAccountsById(accounts) {
  const map = new Map();
  for (const a of accounts || []) {
    if (a?.id != null) map.set(String(a.id), a);
  }
  return map;
}

/**
 * Normalized QB customer display name → Account Directory account id(s).
 * @param {Map<string, { listId?: string, displayName?: string|null }>|undefined} qbLinksByAccountId
 */
export function buildQbDisplayNameIndex(qbLinksByAccountId) {
  const map = new Map();
  for (const [accountId, qb] of qbLinksByAccountId || []) {
    const qn = normalizeMorawareAccountKey(qb?.displayName);
    if (!qn) continue;
    if (!map.has(qn)) map.set(qn, []);
    map.get(qn).push(String(accountId));
  }
  return map;
}

/**
 * Full fuzzy directory scan (Levenshtein near-neighbors). Test hook:
 * `onFuzzyCandidateVisit(ad)` is invoked once per directory account considered.
 *
 * @param {string} nn normalized Moraware name key
 * @param {Array<{ id: string, displayName: string }>} ads
 * @param {{ onFuzzyCandidateVisit?: (ad: object) => void }} [options]
 */
export function collectFuzzyNameAlternatives(nn, ads, options = {}) {
  const alternatives = [];
  const onVisit = typeof options.onFuzzyCandidateVisit === "function" ? options.onFuzzyCandidateVisit : null;
  for (const ad of ads || []) {
    if (onVisit) onVisit(ad);
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
  return alternatives;
}

/**
 * @param {{
 *   morawareAccount: { sourceAccountId: string, accountName: string },
 *   jobs?: Array<{ createdAtSource?: string, installAtSource?: string, completedAtSource?: string }>,
 *   jobStats?: { jobCount?: number, jobs2026?: number, earliestJobDate?: string|null, latestJobDate?: string|null }|null,
 *   directoryAccounts: Array<{ id: string, displayName: string, legalName?: string|null }>,
 *   qbLinksByAccountId?: Map<string, { listId?: string, displayName?: string|null }>,
 *   nameIndex?: Map<string, string[]>,
 *   qbNameIndex?: Map<string, string[]>,
 *   onFuzzyCandidateVisit?: (ad: object) => void
 * }} input
 */
export function rankMorawareDirectoryCandidates(input) {
  const mwName = input.morawareAccount?.accountName || "";
  const mwId = String(input.morawareAccount?.sourceAccountId || "");
  const jobFields = resolveMorawareJobStats(input);

  const internal = isInternalMorawareAccountName(mwName);
  const nn = normalizeMorawareAccountKey(mwName);
  const ads = input.directoryAccounts || [];
  const qbLinks = input.qbLinksByAccountId || new Map();
  const byName = input.nameIndex || buildDirectoryNameIndex(ads);
  const adsById = indexDirectoryAccountsById(ads);
  const fuzzyHook = { onFuzzyCandidateVisit: input.onFuzzyCandidateVisit };

  const exactIds = nn ? [...(byName.get(nn) || [])] : [];
  const uniqueExact = [...new Set(exactIds)];
  const evidence = [];
  const contradictions = [];

  if (internal) {
    return {
      morawareAccountId: mwId,
      morawareName: mwName,
      ...jobFields,
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

  // Deterministic exact-name paths first (no fuzzy when result discards fuzzy).
  if (uniqueExact.length > 1) {
    const alts = uniqueExact.map((id) => {
      const ad = adsById.get(String(id));
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
      ...jobFields,
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
    // Preserve prior alternatives: unique-exact still runs fuzzy solely for near-neighbors.
    const alternatives = collectFuzzyNameAlternatives(nn, ads, fuzzyHook);
    const accountId = uniqueExact[0];
    const ad = adsById.get(String(accountId));
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
      ...jobFields,
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

  // Deterministic unique QB display-name match (fuzzy was previously computed then discarded).
  const qbNameIndex = input.qbNameIndex || buildQbDisplayNameIndex(qbLinks);
  const uniqueQb = nn ? [...new Set(qbNameIndex.get(nn) || [])] : [];
  if (uniqueQb.length === 1) {
    const accountId = uniqueQb[0];
    const ad = adsById.get(String(accountId));
    const qb = qbLinks.get(accountId);
    return {
      morawareAccountId: mwId,
      morawareName: mwName,
      ...jobFields,
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

  // Fuzzy fallback only when still unresolved.
  const alternatives = collectFuzzyNameAlternatives(nn, ads, fuzzyHook);

  if (alternatives.length === 1) {
    return {
      morawareAccountId: mwId,
      morawareName: mwName,
      ...jobFields,
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
    ...jobFields,
    classification: "UNMATCHED",
    reason: jobFields.jobCount <= 1 ? "insufficient_or_retail_volume" : "no_deterministic_directory_match",
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
