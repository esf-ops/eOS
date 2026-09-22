/**
 * Centralized hybrid ranking configuration.
 * Lexical + semantic via Reciprocal Rank Fusion, then metadata/authority/exact-id boosts.
 */

export const HYBRID_RANKING = {
  /** Reciprocal Rank Fusion constant */
  rrfK: 60,
  /**
   * Multiply raw RRF (≈0.01–0.03) so it outweighs metadata/authority tie-breakers.
   * Exact-identifier boosts remain large enough to prefer model/SKU hits when close.
   */
  rrfScoreScale: 100,
  lexicalCandidateLimit: 24,
  semanticCandidateLimit: 24,
  finalLimitDefault: 6,
  finalLimitMax: 12,

  /** Post-RRF additive boosts (not opaque magic — documented) */
  boosts: {
    exactIdentifierInPassage: 0.35,
    exactIdentifierInTitle: 0.45,
    manufacturerMatch: 0.12,
    machineModelMatch: 0.2,
    materialMatch: 0.08,
    authority: {
      manufacturer_primary: 0.18,
      company_policy: 0.14,
      tooling_supplier: 0.1,
      internal_training: 0.06,
      general_reference: 0,
    },
  },

  /** Identifiers that look like model/SKU/error codes get exact-match protection */
  identifierMinLength: 3,
};

/**
 * Extract exact-ish identifiers from a query (alphanumeric tokens with digits or hyphens).
 */
export function extractExactIdentifiers(query) {
  const tokens = String(query || "")
    .split(/[^a-zA-Z0-9._\-/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= HYBRID_RANKING.identifierMinLength);
  return tokens.filter((t) => /\d/.test(t) || /[A-Z]{2,}/.test(t) || /-/.test(t));
}

/**
 * Reciprocal Rank Fusion over ranked id lists.
 * @param {Array<{ id: string, rank: number, channel: string }>} rankedItems 1-based ranks per channel
 */
export function reciprocalRankFusion(rankedItems, k = HYBRID_RANKING.rrfK) {
  const scores = new Map();
  for (const item of rankedItems) {
    const prev = scores.get(item.id) || { score: 0, channels: [], lexicalRank: null, semanticRank: null };
    prev.score += 1 / (k + item.rank);
    prev.channels.push(item.channel);
    if (item.channel === "lexical") prev.lexicalRank = item.rank;
    if (item.channel === "semantic") prev.semanticRank = item.rank;
    scores.set(item.id, prev);
  }
  return scores;
}

export function applyHybridBoosts({ rrfScore, passageText, title, authority, manufacturer, machineModel, material, identifiers, filters }) {
  let score = Number(rrfScore || 0) * HYBRID_RANKING.rrfScoreScale;
  const reasons = [];
  const hay = `${title || ""} ${passageText || ""}`.toLowerCase();

  for (const id of identifiers || []) {
    const needle = id.toLowerCase();
    if (String(title || "").toLowerCase().includes(needle)) {
      score += HYBRID_RANKING.boosts.exactIdentifierInTitle;
      reasons.push(`exact title match: ${id}`);
    } else if (hay.includes(needle)) {
      score += HYBRID_RANKING.boosts.exactIdentifierInPassage;
      reasons.push(`exact passage match: ${id}`);
    }
  }

  if (filters?.manufacturer && String(manufacturer || "").toLowerCase().includes(String(filters.manufacturer).toLowerCase())) {
    score += HYBRID_RANKING.boosts.manufacturerMatch;
    reasons.push("manufacturer metadata match");
  }
  if (filters?.machineModel && String(machineModel || "").toLowerCase().includes(String(filters.machineModel).toLowerCase())) {
    score += HYBRID_RANKING.boosts.machineModelMatch;
    reasons.push("machine model metadata match");
  }
  if (filters?.material && String(material || "").toLowerCase().includes(String(filters.material).toLowerCase())) {
    score += HYBRID_RANKING.boosts.materialMatch;
    reasons.push("material metadata match");
  }

  const authBoost = HYBRID_RANKING.boosts.authority[authority] || 0;
  if (authBoost) {
    score += authBoost;
    reasons.push(`authority: ${authority}`);
  }

  return { score, reasons };
}
