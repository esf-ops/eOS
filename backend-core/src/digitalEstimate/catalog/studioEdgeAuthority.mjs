/**
 * Canonical customer-facing edge profiles — same source as Internal Estimate v2
 * (`INCLUDED_EDGE_PROFILES_V2` / `UPGRADED_EDGE_PROFILES_V2` in prototypeQuoteMath /
 * quoteCalculator). Not Studio scope classifications (W/D/included).
 */

import {
  UPGRADED_EDGE_RATE_DIRECT_V2,
  UPGRADED_EDGE_RATE_WHOLESALE_V2
} from "../../quotes/quoteCalculator.js";

/** @typedef {"free"|"premium"} EdgeProfileTier */

/**
 * @typedef {{
 *   profileId: string,
 *   label: string,
 *   tier: EdgeProfileTier,
 *   optionToken: string
 * }} EdgeProfileDefinition
 */

/** Free profiles — $0 (no LF charge). */
export const FREE_EDGE_PROFILES = Object.freeze([
  { profileId: "edge_eased", label: "Eased", tier: "free", optionToken: "edge_eased" },
  { profileId: "edge_large_eased", label: "Large Eased", tier: "free", optionToken: "edge_large_eased" },
  {
    profileId: "edge_full_bullnose",
    label: "Full Bullnose",
    tier: "free",
    optionToken: "edge_full_bullnose"
  },
  { profileId: "edge_large_ogee", label: "Large Ogee", tier: "free", optionToken: "edge_large_ogee" },
  { profileId: "edge_bevel", label: "Bevel", tier: "free", optionToken: "edge_bevel" }
]);

/** Premium profiles — $/LF by account pricing basis (Brain-only). */
export const PREMIUM_EDGE_PROFILES = Object.freeze([
  { profileId: "edge_small_ogee", label: "Small Ogee", tier: "premium", optionToken: "edge_small_ogee" },
  { profileId: "edge_crescent", label: "Crescent", tier: "premium", optionToken: "edge_crescent" },
  { profileId: "edge_knife", label: "Knife", tier: "premium", optionToken: "edge_knife" }
]);

export const ALL_EDGE_PROFILES = Object.freeze([
  ...FREE_EDGE_PROFILES,
  ...PREMIUM_EDGE_PROFILES
]);

const BY_TOKEN = new Map();
for (const p of ALL_EDGE_PROFILES) {
  BY_TOKEN.set(p.optionToken, p);
  BY_TOKEN.set(p.profileId, p);
  BY_TOKEN.set(p.label.toLowerCase(), p);
  BY_TOKEN.set(p.label.toLowerCase().replace(/\s+/g, "_"), p);
}

/** Legacy DE / Studio scope tokens → best-effort profile (never expose W/D labels). */
const LEGACY_SCOPE_TO_PROFILE = Object.freeze({
  eased: "edge_eased",
  included: "edge_eased",
  w_edge: "edge_small_ogee",
  d_edge: "edge_small_ogee",
  waterfall: "edge_small_ogee",
  dupont: "edge_small_ogee"
});

/**
 * @param {unknown} raw
 * @returns {EdgeProfileDefinition|null}
 */
export function resolveEdgeProfileDefinition(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/^edge:/, "");
  if (!key) return null;
  if (BY_TOKEN.has(key)) return BY_TOKEN.get(key);
  if (LEGACY_SCOPE_TO_PROFILE[key]) {
    return BY_TOKEN.get(LEGACY_SCOPE_TO_PROFILE[key]) || null;
  }
  // "edge_eased" already covered; also accept bare "eased"
  const withPrefix = key.startsWith("edge_") ? key : `edge_${key}`;
  if (BY_TOKEN.has(withPrefix)) return BY_TOKEN.get(withPrefix);
  return null;
}

/**
 * Normalize any customer/legacy edge token to a canonical option token.
 * @param {unknown} raw
 * @returns {string} canonical optionToken (defaults to edge_eased)
 */
export function normalizeEdgeProfileToken(raw) {
  return resolveEdgeProfileDefinition(raw)?.optionToken || "edge_eased";
}

/**
 * Customer-safe display label.
 * @param {unknown} raw
 */
export function edgeProfileDisplayLabel(raw) {
  return resolveEdgeProfileDefinition(raw)?.label || "Eased";
}

/**
 * @param {unknown} raw
 */
export function isPremiumEdgeProfile(raw) {
  return resolveEdgeProfileDefinition(raw)?.tier === "premium";
}

/**
 * Resolve $/LF from approved estimate pricing basis — never from the browser.
 * @param {"wholesale"|"direct"|string|null|undefined} pricingBasis
 */
export function resolvePremiumEdgeRatePerLf(pricingBasis) {
  return String(pricingBasis || "").toLowerCase() === "wholesale"
    ? UPGRADED_EDGE_RATE_WHOLESALE_V2
    : UPGRADED_EDGE_RATE_DIRECT_V2;
}

/**
 * Original profile for a Studio / room scope row.
 * Studio scope historically stored edgeMode (included/w_edge/d_edge) — map to profiles.
 * Prefer explicit edgeProfile / edgeProfileV2 when present.
 *
 * @param {{
 *   edgeProfileV2?: string|null,
 *   edgeProfile?: string|null,
 *   edgeMode?: string|null,
 *   originalEdgeMode?: string|null
 * }|null|undefined} roomOrScope
 */
export function resolveOriginalEdgeProfile(roomOrScope) {
  const explicit =
    roomOrScope?.edgeProfileV2 ||
    roomOrScope?.edgeProfile ||
    null;
  if (explicit) {
    const def = resolveEdgeProfileDefinition(explicit);
    if (def) return def.optionToken;
  }
  return normalizeEdgeProfileToken(
    roomOrScope?.edgeMode || roomOrScope?.originalEdgeMode || "included"
  );
}

/**
 * Build estimator-approved edge option definitions for one room.
 *
 * @param {{
 *   roomKey: string,
 *   groupId?: string|null,
 *   originalProfileToken?: string|null,
 *   approvedProfileTokens?: string[]|null,
 *   includePremium?: boolean,
 *   baseOption: (row: object) => object
 * }} args
 */
export function buildAuthoritativeEdgeOptionDefinitions(args) {
  const roomKey = String(args.roomKey || "").trim();
  const groupId = args.groupId ?? null;
  const original = normalizeEdgeProfileToken(args.originalProfileToken || "edge_eased");
  const includePremium = args.includePremium !== false;
  const catalog = includePremium ? ALL_EDGE_PROFILES : FREE_EDGE_PROFILES;

  let allowed;
  if (Array.isArray(args.approvedProfileTokens) && args.approvedProfileTokens.length) {
    const set = new Set(args.approvedProfileTokens.map(normalizeEdgeProfileToken));
    set.add(original);
    allowed = catalog.filter((p) => set.has(p.optionToken));
  } else {
    allowed = [...catalog];
    if (!allowed.some((p) => p.optionToken === original)) {
      const origDef = resolveEdgeProfileDefinition(original);
      if (origDef) allowed = [origDef, ...allowed];
    }
  }

  // Stable order: free then premium as cataloged
  const order = new Map(ALL_EDGE_PROFILES.map((p, i) => [p.optionToken, i]));
  allowed.sort(
    (a, b) => (order.get(a.optionToken) ?? 99) - (order.get(b.optionToken) ?? 99)
  );

  return allowed.map((def) =>
    args.baseOption({
      groupId,
      optionKey: `edge:${roomKey}:${def.optionToken}`,
      displayLabel: def.label,
      includedInBaseline: def.optionToken === original,
      defaultQty: def.optionToken === original ? 1 : 0,
      sellPrice: 0,
      pricingMode: "per_lf",
      customerPriceTreatment: def.tier === "premium" ? "delta" : "absolute",
      compatibilityJson: {
        roomKey,
        role: "edge_selection",
        edgeProfileId: def.profileId,
        edgeProfileToken: def.optionToken,
        edgeTier: def.tier,
        // Keep edgeMode for legacy readers — never a customer label.
        edgeMode: def.optionToken,
        originalEdgeProfile: original,
        authoritative: true
      }
    })
  );
}

/**
 * When edge customer-choice is enabled, default approved set = full Internal Estimate catalog.
 * @param {string|null|undefined} originalProfileToken
 * @returns {string[]}
 */
export function defaultApprovedEdgeProfileTokens(originalProfileToken) {
  const original = normalizeEdgeProfileToken(originalProfileToken);
  const tokens = ALL_EDGE_PROFILES.map((p) => p.optionToken);
  if (!tokens.includes(original)) tokens.unshift(original);
  return tokens;
}

/**
 * Remap a full option key for legacy eased/included/w_edge/d_edge → profile tokens.
 * @param {string} optionKey
 * @returns {string}
 */
export function remapLegacyEdgeOptionKey(optionKey) {
  const key = String(optionKey || "");
  if (!key.startsWith("edge:")) return key;
  const parts = key.split(":");
  if (parts.length < 3) return key;
  const roomKey = parts[1];
  const token = parts.slice(2).join(":");
  const normalized = normalizeEdgeProfileToken(token);
  return `edge:${roomKey}:${normalized}`;
}

// ── Back-compat aliases used by older Studio edge helpers ───────────────────
/** @deprecated Use resolveOriginalEdgeProfile / normalizeEdgeProfileToken */
export function normalizeStudioEdgeMode(raw) {
  return normalizeEdgeProfileToken(raw);
}

/** @deprecated */
export function studioEdgeDisplayLabel(raw) {
  return edgeProfileDisplayLabel(raw);
}

/** @deprecated */
export function defaultApprovedStudioEdgeModes(originalEdgeMode) {
  return defaultApprovedEdgeProfileTokens(originalEdgeMode);
}
