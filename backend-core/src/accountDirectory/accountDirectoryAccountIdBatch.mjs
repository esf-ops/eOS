/**
 * Bounded account-ID batching for PostgREST `.in("account_id", …)` reads.
 *
 * Large UUID lists in a single GET can exceed URL/proxy limits and surface as
 * `TypeError: fetch failed`. Chunk into small batches — never N+1 per account.
 */

/** Conservative UUID batch size for PostgREST `.in()` query strings. */
export const ACCOUNT_ID_IN_BATCH_SIZE = 100;

/**
 * @param {unknown[]} accountIds
 * @returns {string[]}
 */
export function normalizeAccountIds(accountIds) {
  return [...new Set((accountIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
}

/**
 * @param {unknown[]} accountIds
 * @param {number} [batchSize]
 * @returns {string[][]}
 */
export function chunkAccountIds(accountIds, batchSize = ACCOUNT_ID_IN_BATCH_SIZE) {
  const ids = normalizeAccountIds(accountIds);
  const size = Math.max(1, Math.floor(Number(batchSize) || ACCOUNT_ID_IN_BATCH_SIZE));
  if (!ids.length) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/**
 * Expected `.in()` query count for a given ID list (after dedupe).
 * @param {unknown[]} accountIds
 * @param {number} [batchSize]
 */
export function expectedAccountIdBatchQueryCount(accountIds, batchSize = ACCOUNT_ID_IN_BATCH_SIZE) {
  return chunkAccountIds(accountIds, batchSize).length;
}

/**
 * Run one query per ID chunk. Empty input → zero queries / [].
 * Propagates the first batch failure (no silent partial success).
 *
 * @template T
 * @param {{
 *   accountIds: unknown[],
 *   batchSize?: number,
 *   fetchBatch: (chunkIds: string[]) => Promise<T[]>
 * }} opts
 * @returns {Promise<T[]>}
 */
export async function fetchAllForAccountIdBatches(opts) {
  const chunks = chunkAccountIds(opts.accountIds, opts.batchSize);
  if (!chunks.length) return [];
  /** @type {T[]} */
  const out = [];
  for (const chunk of chunks) {
    const rows = await opts.fetchBatch(chunk);
    if (Array.isArray(rows) && rows.length) out.push(...rows);
  }
  return out;
}
