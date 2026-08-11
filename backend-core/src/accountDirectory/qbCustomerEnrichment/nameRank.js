/**
 * Name ranking for AD ↔ QB suggestion queue only.
 * Never creates external links. Exact ListID match is handled elsewhere.
 */

/**
 * @param {unknown} raw
 */
export function normalizeMatchKey(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {{ score: number, method: string|null }}
 */
export function scoreDisplayNameSimilarity(a, b) {
  const left = normalizeMatchKey(a);
  const right = normalizeMatchKey(b);
  if (!left || !right) return { score: 0, method: null };
  if (left === right) return { score: 1, method: "exact_norm_name" };
  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    const score = Math.round((0.55 + (shorter / longer) * 0.25) * 1000) / 1000;
    return { score, method: "substring" };
  }
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return { score: 0, method: null };
  let overlap = 0;
  for (const t of leftTokens) if (rightTokens.has(t)) overlap += 1;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = overlap / union;
  if (jaccard >= 0.5) {
    return { score: Math.round(jaccard * 1000) / 1000, method: "token_overlap" };
  }
  return { score: 0, method: null };
}

/**
 * Rank existing AD accounts against a QB full/name for suggestion UI only.
 * @param {{ fullName?: string|null, name?: string|null }} qb
 * @param {Array<{ id: string, displayName?: string|null, legalName?: string|null, quickbooksLinked?: boolean, linkedListId?: string|null }>} accounts
 * @param {{ minScore?: number, limit?: number }} [opts]
 */
export function rankAccountCandidates(qb, accounts, opts = {}) {
  const minScore = opts.minScore ?? 0.5;
  const limit = opts.limit ?? 8;
  const qbLabel = String(qb?.fullName || qb?.name || "").trim();
  /** @type {Array<object>} */
  const ranked = [];
  for (const account of accounts || []) {
    const labels = [account.displayName, account.legalName].filter(Boolean);
    let best = { score: 0, method: null, matchedLabel: null };
    for (const label of labels) {
      const hit = scoreDisplayNameSimilarity(qbLabel, label);
      if (hit.score > best.score) {
        best = { ...hit, matchedLabel: label };
      }
    }
    if (best.score < minScore) continue;
    ranked.push({
      accountId: account.id,
      displayName: account.displayName ?? null,
      score: best.score,
      method: best.method,
      matchedLabel: best.matchedLabel,
      accountAlreadyQbLinked: Boolean(account.quickbooksLinked),
      accountLinkedListId: account.linkedListId ?? null
    });
  }
  ranked.sort((a, b) => b.score - a.score || String(a.displayName || "").localeCompare(String(b.displayName || "")));
  return ranked.slice(0, limit);
}
