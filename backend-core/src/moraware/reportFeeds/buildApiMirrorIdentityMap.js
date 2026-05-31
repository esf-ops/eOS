import { makeIdentityMatchKey } from "./textNormalize.js";

/**
 * Build a normalized identity map from brain_moraware_jobs rows.
 *
 * Used for post-hoc API mirror enrichment — called after staging persists the
 * HTML-enriched raw rows, to resolve the majority of `needs_identity_review` rows
 * using the existing Moraware API sync mirror.
 *
 * Pure function — no DB calls.
 *
 * Duplicate-key rules:
 * - Same key, same source_account_id + source_job_id → harmless duplicate; keep first.
 * - Same key, different IDs → genuinely ambiguous; add to duplicateKeys Set.
 *   The first-seen entry remains in identityMap for operator inspection.
 *
 * @param {Array<{
 *   account_name: string,
 *   job_name: string,
 *   source_account_id: string|null,
 *   source_job_id: string|null
 * }>} jobRows - rows from brain_moraware_jobs
 *
 * @returns {{
 *   identityMap: Map<string, { accountId: string|null, jobId: string|null, accountName: string, jobName: string }>,
 *   duplicateKeys: Set<string>,
 *   summary: { totalJobs: number, usableJobs: number, duplicateKeyCount: number }
 * }}
 */
export function buildApiMirrorIdentityMap(jobRows) {
  /** @type {Map<string, { accountId: string|null, jobId: string|null, accountName: string, jobName: string }>} */
  const identityMap = new Map();
  /** @type {Set<string>} Keys where different rows map to different account/job IDs */
  const duplicateKeys = new Set();
  let usableJobs = 0;

  for (const row of jobRows ?? []) {
    if (!row.account_name || !row.job_name) continue;
    const key = makeIdentityMatchKey(row.account_name, row.job_name);
    if (!key.replace(/\|/g, "").trim()) continue;
    usableJobs++;

    if (identityMap.has(key)) {
      const existing = identityMap.get(key);
      if (
        existing.accountId === (row.source_account_id ?? null) &&
        existing.jobId === (row.source_job_id ?? null)
      ) {
        // Same IDs — harmless duplicate (e.g. same job imported twice)
        continue;
      }
      // Different IDs for the same normalized match key — genuinely ambiguous
      duplicateKeys.add(key);
    } else {
      identityMap.set(key, {
        accountId: row.source_account_id ?? null,
        jobId: row.source_job_id ?? null,
        accountName: row.account_name,
        jobName: row.job_name
      });
    }
  }

  return {
    identityMap,
    duplicateKeys,
    summary: {
      totalJobs: jobRows?.length ?? 0,
      usableJobs,
      duplicateKeyCount: duplicateKeys.size
    }
  };
}
