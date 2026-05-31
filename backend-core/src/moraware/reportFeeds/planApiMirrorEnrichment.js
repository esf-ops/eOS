import { makeIdentityMatchKey } from "./textNormalize.js";

/**
 * Plan which staged raw rows to enrich using the API mirror identity map.
 *
 * Pure function — no DB calls. Returns a plan object the orchestrator
 * (enrichRunFromApiMirror) uses to decide which DB writes to perform.
 *
 * Matching rules (v1):
 * - Exact normalized account_name + job_name match only. No fuzzy matching.
 * - Only rows with identity_status = "needs_identity_review" are eligible.
 * - Rows already "matched" or "ambiguous_identity" go to toSkip unchanged.
 * - A key in duplicateKeys → toAmbiguous (conflicting IDs in API mirror).
 * - A key found in identityMap (not duplicate) → toMatch.
 * - No match found → toSkip (reason: no_api_mirror_match).
 *
 * @param {Array<{ id: string, account_name: string|null, job_name: string|null, identity_status: string }>} stagedRawRows
 * @param {Map<string, { accountId: string|null, jobId: string|null, accountName: string, jobName: string }>} identityMap
 * @param {Set<string>} duplicateKeys
 *
 * @returns {{
 *   toMatch: Array<{ id: string, matchKey: string, account_id: string|null, job_id: string|null, identity_status: string, identity_reason: string }>,
 *   toAmbiguous: Array<{ id: string, matchKey: string, identity_status: string, identity_reason: string }>,
 *   toSkip: Array<{ id: string, reason: string }>,
 *   summary: { eligible: number, matched: number, ambiguous: number, skipped: number }
 * }}
 */
export function planApiMirrorEnrichment(stagedRawRows, identityMap, duplicateKeys) {
  const toMatch = [];
  const toAmbiguous = [];
  const toSkip = [];
  let eligible = 0;

  for (const row of stagedRawRows ?? []) {
    if (row.identity_status !== "needs_identity_review") {
      toSkip.push({ id: row.id, reason: "already_processed" });
      continue;
    }
    eligible++;

    const key = makeIdentityMatchKey(row.account_name ?? "", row.job_name ?? "");

    if (duplicateKeys.has(key)) {
      toAmbiguous.push({
        id: row.id,
        matchKey: key,
        identity_status: "ambiguous_identity",
        identity_reason: "api_mirror_ambiguous_key"
      });
    } else if (identityMap.has(key)) {
      const identity = identityMap.get(key);
      toMatch.push({
        id: row.id,
        matchKey: key,
        account_id: identity.accountId,
        job_id: identity.jobId,
        identity_status: "matched",
        identity_reason: "api_mirror_exact_account_job"
      });
    } else {
      toSkip.push({ id: row.id, reason: "no_api_mirror_match" });
    }
  }

  return {
    toMatch,
    toAmbiguous,
    toSkip,
    summary: {
      eligible,
      matched: toMatch.length,
      ambiguous: toAmbiguous.length,
      skipped: eligible - toMatch.length - toAmbiguous.length
    }
  };
}
