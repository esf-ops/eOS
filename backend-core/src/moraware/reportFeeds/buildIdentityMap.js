import { makeIdentityMatchKey } from "./textNormalize.js";

/**
 * Build a best-effort identity map from HTML-derived rows.
 * Duplicate keys are tracked separately — callers must not silently pick one.
 */
export function buildIdentityMapFromHtmlRows(htmlRows) {
  /** @type {Map<string, { jobId: string|null, jobName: string, accountId: string|null, accountName: string }>} */
  const byKey = new Map();
  /** @type {Array<{ key: string, existing: object, incoming: object }>} */
  const duplicateKeys = [];

  for (const row of htmlRows || []) {
    if (!row?.jobName && !row?.accountName) continue;
    const key = makeIdentityMatchKey(row.accountName, row.jobName);
    if (!key.replace(/\|/g, "").trim()) continue;
    if (byKey.has(key)) {
      duplicateKeys.push({ key, existing: byKey.get(key), incoming: row });
      continue;
    }
    byKey.set(key, {
      jobId: row.jobId ?? null,
      jobName: row.jobName ?? "",
      accountId: row.accountId ?? null,
      accountName: row.accountName ?? ""
    });
  }

  return {
    byKey,
    duplicateKeys,
    rowCount: htmlRows?.length ?? 0,
    uniqueKeyCount: byKey.size
  };
}
