/**
 * Customer-facing product copy — strip internal channel / workbook prose.
 * Used for public DTOs and option seeding. Never invents prices.
 */

const CHANNEL_TERMS = /\b(wholesale|partner|direct)\b/gi;

const KNOWN_SHORT_TITLES = [
  {
    test: /glowback/i,
    title: "Glowback LED Backlighting",
    description:
      "Custom backlighting designed for your stone application.",
    reviewRequired: true
  },
  {
    test: /invisacook/i,
    title: "InvisaCook",
    description:
      "Induction cooking technology installed beneath compatible countertop material.",
    reviewRequired: true
  },
  {
    test: /free\s*power/i,
    title: "FreePower 3-Device Charging Station",
    description: "Wireless charging installed below the countertop surface.",
    reviewRequired: false
  }
];

/**
 * @param {string|null|undefined} raw
 * @returns {string}
 */
export function stripInternalChannelTerms(raw) {
  return String(raw || "")
    .replace(CHANNEL_TERMS, "")
    .replace(/\band\s+and\b/gi, "and")
    .replace(/\s+and\s+(?=[(,])/gi, " ")
    .replace(/\band\s*$/i, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

/**
 * @param {string|null|undefined} raw
 * @param {{ maxLen?: number }} [opts]
 * @returns {string}
 */
export function conciseCustomerTitle(raw, opts = {}) {
  const maxLen = opts.maxLen ?? 72;
  let s = stripInternalChannelTerms(raw);
  // Drop leading SKU-ish tokens (e.g. "221008 Diamond Grid…")
  s = s.replace(/^\d{5,}\s+/, "");
  // Prefer text before the first long sentence for workbook paragraphs
  if (s.length > maxLen && /\.\s/.test(s)) {
    s = s.split(/\.\s/)[0].trim();
  }
  if (s.length > maxLen) {
    s = `${s.slice(0, maxLen - 1).trim()}…`;
  }
  return s || "Option";
}

/**
 * @param {import('./esfPlumbingCatalogContract.mjs').NormalizedCatalogProduct | { displayName?: string, description?: string, manufacturer?: string, pricingTreatment?: string } | null | undefined} product
 * @returns {{ displayName: string, description: string|null, reviewRequired: boolean }}
 */
export function customerFacingProductCopy(product) {
  const rawName = String(product?.displayName || "").trim();
  const rawDesc = String(product?.description || "").trim();
  for (const known of KNOWN_SHORT_TITLES) {
    if (known.test.test(rawName) || known.test.test(rawDesc)) {
      return {
        displayName: known.title,
        description: known.description,
        reviewRequired:
          known.reviewRequired ||
          product?.pricingTreatment === "review_only" ||
          Boolean(product?.estimatorReviewRequired)
      };
    }
  }
  const displayName = conciseCustomerTitle(rawName);
  let description = stripInternalChannelTerms(rawDesc);
  if (description && description.toLowerCase() === displayName.toLowerCase()) {
    description = "";
  }
  if (description.length > 160) {
    description = `${description.slice(0, 157).trim()}…`;
  }
  return {
    displayName,
    description: description || null,
    reviewRequired:
      product?.pricingTreatment === "review_only" ||
      Boolean(product?.estimatorReviewRequired)
  };
}

/**
 * True when a Blanco (or similar) accessory row is a family heading, not a buyable SKU.
 * @param {{ displayName?: string, category?: string, variants?: unknown[] }} product
 */
export function isAccessoryFamilyHeading(product) {
  if (!product) return false;
  const name = String(product.displayName || "");
  if (!/accessories\s*$/i.test(name)) return false;
  return Array.isArray(product.variants) && product.variants.length > 0;
}

/**
 * Human side-splash mode label (no piece name).
 * @param {string} mode
 */
export function sideSplashModeLabel(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "left") return "Left";
  if (m === "right") return "Right";
  if (m === "both") return "Both sides";
  if (m === "none") return "None";
  return "None";
}

/**
 * @param {string|null|undefined} pieceDisplayName
 * @param {number} pieceIndex 1-based
 */
export function sideSplashPieceDisplayName(pieceDisplayName, pieceIndex = 1) {
  const name = String(pieceDisplayName || "").trim();
  if (name && !looksLikeUuid(name)) return name;
  return `Countertop run ${Math.max(1, Number(pieceIndex) || 1)}`;
}

/**
 * @param {string} value
 */
export function looksLikeUuid(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  // UUID with or without hyphens / spaced fragments
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      s
    )
  ) {
    return true;
  }
  if (/^[0-9a-f]{32}$/i.test(s.replace(/[\s-]/g, ""))) return true;
  // Hosted bug shape: "d1c2b3a4 f5e6 4d7c 8b9a 0a1b2c3d4e5f"
  if (/^[0-9a-f]{8}\s+[0-9a-f]{4}\s+[0-9a-f]{4}\s+[0-9a-f]{4}\s+[0-9a-f]{12}$/i.test(s)) {
    return true;
  }
  return false;
}

/**
 * Customer-safe price effect label from public option fields.
 * @param {{
 *   includedInBaseline?: boolean,
 *   customerPriceTreatment?: string,
 *   availabilityState?: string,
 *   visibleSellPrice?: number|null,
 *   visibleDelta?: number|null,
 *   reviewRequired?: boolean
 * }} opt
 * @param {(n: number) => string} [formatMoney]
 */
export function customerPriceEffectLabel(opt, formatMoney = defaultMoney) {
  const treatment = String(opt?.customerPriceTreatment || "");
  if (
    opt?.reviewRequired ||
    treatment === "review_required" ||
    String(opt?.availabilityState || "") === "review_required"
  ) {
    return "Requires estimator review";
  }
  if (treatment === "unavailable" || String(opt?.availabilityState || "") === "unavailable") {
    return "Unavailable";
  }
  // Baseline / current: customer-facing relationship labels (not bare "Included").
  if (opt?.includedInBaseline || treatment === "included") {
    return "Original selection";
  }
  if (treatment === "no_change") {
    return "No change";
  }
  const delta =
    opt?.visibleDelta != null
      ? Number(opt.visibleDelta)
      : opt?.visibleSellPrice != null
        ? Number(opt.visibleSellPrice)
        : null;
  if (delta == null || !Number.isFinite(delta)) {
    return null;
  }
  if (Math.abs(delta) < 0.005) return "No change";
  if (delta < 0) return `−${formatMoney(Math.abs(delta))}`;
  return `+${formatMoney(delta)}`;
}

function defaultMoney(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(n);
}
