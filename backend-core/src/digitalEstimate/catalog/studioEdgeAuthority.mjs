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
 * Authoritative public-safe price effect for one edge profile option.
 * Uses the approved final priced edge LF and pricing basis — never browser math.
 *
 * Review-required only when a governed pricing input is truly missing (LF / rate).
 * Canonical premium profiles never review-required merely for being premium.
 *
 * @param {{
 *   profileToken: string,
 *   originalProfileToken?: string|null,
 *   edgeLinearFeet: number,
 *   pricingBasis?: string|null
 * }} args
 * @returns {{
 *   profileKey: string,
 *   label: string,
 *   original: boolean,
 *   premium: boolean,
 *   available: boolean,
 *   priceEffectCents: number|null,
 *   priceEffectLabel: string,
 *   customerPriceTreatment: string,
 *   visibleDelta: number|null,
 *   visibleSellPrice: number|null,
 *   reviewReasonCode?: string|null
 * }}
 */
export function resolveEdgeOptionPriceEffect(args) {
  const def = resolveEdgeProfileDefinition(args?.profileToken);
  if (!def) {
    return {
      profileKey: normalizeEdgeProfileToken(args?.profileToken),
      label: "Edge profile",
      original: false,
      premium: false,
      available: false,
      priceEffectCents: null,
      priceEffectLabel: "Elite will confirm this option and price.",
      customerPriceTreatment: "review_required",
      visibleDelta: null,
      visibleSellPrice: null,
      reviewReasonCode: "unknown_profile"
    };
  }
  const original = normalizeEdgeProfileToken(args?.originalProfileToken || "edge_eased");
  const isOriginal = def.optionToken === original;
  const premium = def.tier === "premium";
  const lf = Math.max(0, Number(args?.edgeLinearFeet) || 0);
  let priceEffectCents = 0;
  let available = true;
  if (premium) {
    if (!(lf > 0)) {
      available = false;
      return {
        profileKey: def.optionToken,
        label: def.label,
        original: isOriginal,
        premium: true,
        available: false,
        priceEffectCents: null,
        priceEffectLabel: "Elite will confirm this option and price.",
        customerPriceTreatment: "review_required",
        visibleDelta: null,
        visibleSellPrice: null,
        reviewReasonCode: "missing_edge_lf"
      };
    }
    const rate = resolvePremiumEdgeRatePerLf(args?.pricingBasis);
    if (!(Number(rate) > 0)) {
      return {
        profileKey: def.optionToken,
        label: def.label,
        original: isOriginal,
        premium: true,
        available: false,
        priceEffectCents: null,
        priceEffectLabel: "Elite will confirm this option and price.",
        customerPriceTreatment: "review_required",
        visibleDelta: null,
        visibleSellPrice: null,
        reviewReasonCode: "missing_edge_rate"
      };
    }
    // Integer cents: dollars/LF × LF × 100, half-up.
    priceEffectCents = Math.round(rate * lf * 100);
  }
  if (isOriginal) {
    return {
      profileKey: def.optionToken,
      label: def.label,
      original: true,
      premium,
      available: true,
      priceEffectCents: 0,
      priceEffectLabel: "Original selection",
      customerPriceTreatment: "original_selection",
      visibleDelta: null,
      visibleSellPrice: null,
      reviewReasonCode: null
    };
  }
  if (!premium) {
    return {
      profileKey: def.optionToken,
      label: def.label,
      original: false,
      premium: false,
      available: true,
      priceEffectCents: 0,
      priceEffectLabel: "Included",
      customerPriceTreatment: "included_alternate",
      visibleDelta: null,
      visibleSellPrice: null,
      reviewReasonCode: null
    };
  }
  const dollars = priceEffectCents / 100;
  const label = `+$${Math.round(dollars).toLocaleString("en-US")}`;
  return {
    profileKey: def.optionToken,
    label: def.label,
    original: false,
    premium: true,
    available,
    priceEffectCents,
    priceEffectLabel: label,
    customerPriceTreatment: "delta",
    visibleDelta: dollars,
    visibleSellPrice: null,
    reviewReasonCode: null
  };
}

/**
 * Customer-safe edge option effects frozen at Studio → Digital Estimate publication.
 * Built from the approved Studio final priced edge LF + pricing basis + original profile.
 * Never includes LF, rate, or pricing basis in the returned rows.
 *
 * @param {{
 *   finalPricedEdgeLf: number,
 *   pricingBasis?: string|null,
 *   originalProfileToken?: string|null,
 *   roomKey?: string|null,
 *   roomName?: string|null
 * }} args
 * @returns {Array<{
 *   profileKey: string,
 *   profile: string,
 *   classification: "included"|"premium",
 *   originalSelection: boolean,
 *   available: boolean,
 *   reviewRequired: boolean,
 *   priceEffectCents: number|null,
 *   priceEffectLabel: string,
 *   customerPriceTreatment: string,
 *   roomKey: string|null,
 *   roomName: string|null
 * }>}
 */
export function buildCustomerSafeEdgeOptionEffects(args) {
  const finalLf = Math.max(0, Number(args?.finalPricedEdgeLf) || 0);
  const pricingBasis = args?.pricingBasis || "direct";
  const original = normalizeEdgeProfileToken(args?.originalProfileToken || "edge_eased");
  const roomKey =
    args?.roomKey != null && String(args.roomKey).trim()
      ? String(args.roomKey).trim()
      : null;
  const roomName =
    args?.roomName != null && String(args.roomName).trim()
      ? String(args.roomName).trim()
      : null;

  return ALL_EDGE_PROFILES.map((def) => {
    const effect = resolveEdgeOptionPriceEffect({
      profileToken: def.optionToken,
      originalProfileToken: original,
      edgeLinearFeet: finalLf,
      pricingBasis
    });
    const reviewRequired = effect.customerPriceTreatment === "review_required";
    return {
      profileKey: def.optionToken,
      profile: def.label,
      classification: def.tier === "premium" ? "premium" : "included",
      originalSelection: Boolean(effect.original),
      available: Boolean(effect.available) && !reviewRequired,
      reviewRequired,
      priceEffectCents:
        effect.priceEffectCents == null ? null : Number(effect.priceEffectCents),
      priceEffectLabel: String(effect.priceEffectLabel || ""),
      customerPriceTreatment: String(effect.customerPriceTreatment || "review_required"),
      roomKey,
      roomName
    };
  });
}

/**
 * Lookup a frozen customer-safe edge effect by profile token.
 * @param {Array<object>|null|undefined} effects
 * @param {string} profileToken
 */
export function findFrozenEdgeOptionEffect(effects, profileToken) {
  const token = normalizeEdgeProfileToken(profileToken);
  if (!Array.isArray(effects) || !effects.length) return null;
  return (
    effects.find(
      (e) => normalizeEdgeProfileToken(e?.profileKey || e?.profile) === token
    ) || null
  );
}

/**
 * Map a frozen publication effect into the runtime edge-effect shape used by
 * public option DTOs. Prefer this over re-resolving LF × rate for published DE.
 * @param {object|null|undefined} frozen
 */
export function edgeEffectFromFrozenPublication(frozen) {
  if (!frozen || typeof frozen !== "object") return null;
  const reviewRequired =
    Boolean(frozen.reviewRequired) ||
    frozen.customerPriceTreatment === "review_required";
  const cents =
    frozen.priceEffectCents == null ? null : Number(frozen.priceEffectCents);
  const premium = frozen.classification === "premium";
  const original = Boolean(frozen.originalSelection);
  let treatment = String(frozen.customerPriceTreatment || "");
  if (!treatment) {
    if (reviewRequired) treatment = "review_required";
    else if (original) treatment = "original_selection";
    else if (!premium) treatment = "included_alternate";
    else treatment = "delta";
  }
  return {
    profileKey: frozen.profileKey || normalizeEdgeProfileToken(frozen.profile),
    label: frozen.profile || edgeProfileDisplayLabel(frozen.profileKey),
    original,
    premium,
    available: Boolean(frozen.available) && !reviewRequired,
    priceEffectCents: Number.isFinite(cents) ? cents : null,
    priceEffectLabel: String(frozen.priceEffectLabel || ""),
    customerPriceTreatment: treatment,
    visibleDelta:
      treatment === "delta" && Number.isFinite(cents) ? cents / 100 : null,
    visibleSellPrice: null,
    reviewReasonCode: reviewRequired ? "frozen_review_required" : null,
    fromFrozenPublication: true
  };
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
