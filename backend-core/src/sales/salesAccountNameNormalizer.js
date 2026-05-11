/**
 * Sales Account Name Normalization + Similarity (conservative).
 *
 * Goals:
 * - Normalize Moraware and Monday account names into a comparable form
 * - Provide tokenization and a *suggestion* similarity score (never auto-approve fuzzy)
 * - Strip obvious location prefixes like "Dyersville- " for matching suggestions
 *
 * Non-goals:
 * - Perfect fuzzy matching
 * - Hardcoding ownership as permanent business logic
 */
 
function normalizeSpaces(s) {
  return String(s ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const LOCATION_PREFIX_RE = /^(dyersville|lisbon|iowa\s*city)\s*[-–—]\s*/i;

function stripLocationPrefix(raw) {
  const s = normalizeSpaces(raw);
  return s.replace(LOCATION_PREFIX_RE, "").trim();
}

function normalizeBase(raw) {
  let s = normalizeSpaces(raw).toLowerCase();
  if (!s) return "";
  // Common separators/punctuation → spaces.
  s = s
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[/\\]/g, " ")
    .replace(/[().,]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/#/g, " ")
    .replace(/\$/g, " ");
  // Strip common Moraware job suffix markers used in exports (keep conservative).
  s = s.replace(/\s*##\s*$/g, "").replace(/\s*##\$\s*$/g, "");
  // Collapse spaces.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Normalizes an account name while keeping enough signal to avoid over-matching.
 * @param {string} name
 */
export function normalizeAccountName(name) {
  return normalizeBase(name);
}

/**
 * Same as normalizeAccountName but first strips a leading location prefix like "Dyersville- ".
 * @param {string} name
 */
export function normalizeAccountNameWithoutLocationPrefix(name) {
  const stripped = stripLocationPrefix(name);
  return normalizeBase(stripped);
}

const STOP_TOKENS = new Set([
  "the",
  "and",
  "of",
  "inc",
  "llc",
  "ltd",
  "co",
  "company",
  "corp",
  "corporation",
  "development",
  "dev",
  "group"
]);

/**
 * Builds conservative token set for similarity. Tokens are normalized and stopwords removed.
 * @param {string} name
 */
export function buildAccountTokens(name) {
  const norm = normalizeAccountNameWithoutLocationPrefix(name);
  if (!norm) return [];
  const tokens = norm
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !STOP_TOKENS.has(t))
    // Keep alphanumerics only per token.
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  // de-dupe while preserving order
  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function containment(aTokens, bTokens) {
  // How much of the smaller set is contained in the larger.
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const t of small) if (large.has(t)) inter += 1;
  return small.size ? inter / small.size : 0;
}

/**
 * Conservative similarity score in [0,1]. Intended for ranking suggestions only.
 *
 * Scoring policy:
 * - exact normalized match: 1.0
 * - exact after location-prefix strip: 0.97
 * - otherwise: weighted token overlap (caps at < 0.95)
 *
 * @param {string} a
 * @param {string} b
 */
export function scoreAccountNameSimilarity(a, b) {
  const aNorm = normalizeAccountName(a);
  const bNorm = normalizeAccountName(b);
  if (aNorm && bNorm && aNorm === bNorm) return 1.0;

  const aStrip = normalizeAccountNameWithoutLocationPrefix(a);
  const bStrip = normalizeAccountNameWithoutLocationPrefix(b);
  if (aStrip && bStrip && aStrip === bStrip) return 0.97;

  const aTok = buildAccountTokens(a);
  const bTok = buildAccountTokens(b);
  const jac = jaccard(aTok, bTok);
  const cont = containment(aTok, bTok);

  // Prefer containment a bit (helps when one side has extra noise words).
  const score = 0.55 * jac + 0.45 * cont;

  // Keep fuzzy suggestions clearly below "exact-ish".
  return Math.min(0.94, Math.max(0, score));
}

