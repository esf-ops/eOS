/**
 * Studio V2 Slice H — pricing basis / price group / markup controls.
 * Persists scope.pricingBasis + scope.materialGroup (+ optional adjustments)
 * via repository.update only. Does not change calculator math.
 */

import {
  MATERIAL_GROUPS,
  ALLOWED_INTERNAL_MARKUP_PERCENTS
} from "./studioEstimateTypes.mjs";
import {
  normalizeEstimateWideAdjustment,
  resolveEffectiveEstimateWideAdjustment
} from "./studioEstimateWideAdjustment.mjs";
import {
  canApplyInternalMarkup,
  readTrustedPartnerAccountConfig
} from "./studioEstimateTrustedAccounts.mjs";

/** Accepted V2 pricing basis values (retail shares direct/retail rates in calculator). */
export const STUDIO_V2_PRICING_BASES = Object.freeze(["wholesale", "direct", "retail"]);

/** Canonical material groups stored on scope. */
export const STUDIO_V2_MATERIAL_GROUPS = MATERIAL_GROUPS;

/** UI / API aliases → canonical MATERIAL_GROUPS value. */
const MATERIAL_GROUP_ALIASES = Object.freeze({
  promo: "Group Promo",
  "group promo": "Group Promo",
  a: "Group A",
  "group a": "Group A",
  b: "Group B",
  "group b": "Group B",
  c: "Group C",
  "group c": "Group C",
  d: "Group D",
  "group d": "Group D",
  e: "Group E",
  "group e": "Group E",
  f: "Group F",
  "group f": "Group F",
  remnant: "Remnant"
});

/**
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeStudioV2PricingBasis(raw) {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "wholesale") return "wholesale";
  if (v === "direct") return "direct";
  if (v === "retail") return "retail";
  return null;
}

/**
 * @param {string|null|undefined} raw
 * @returns {string|null} canonical MATERIAL_GROUPS value
 */
export function normalizeStudioV2MaterialGroup(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (MATERIAL_GROUPS.includes(v)) return v;
  const alias = MATERIAL_GROUP_ALIASES[v.toLowerCase()];
  return alias || null;
}

/**
 * Display label for material group (Promo / A / … / Remnant).
 * @param {string|null|undefined} group
 */
export function studioV2MaterialGroupLabel(group) {
  const g = String(group || "");
  if (g === "Group Promo") return "Promo";
  if (g === "Remnant") return "Remnant";
  const m = /^Group ([A-F])$/.exec(g);
  return m ? m[1] : g || "—";
}

/**
 * Build editable pricing DTO for Working Draft response.
 * @param {object|null|undefined} estimate
 * @param {{ actorUserId?: string|null, env?: NodeJS.ProcessEnv }} [opts]
 */
export function buildStudioV2EditablePricing(estimate, opts = {}) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const cfg = readTrustedPartnerAccountConfig(opts.env);
  const canEditMarkup = canApplyInternalMarkup(opts.actorUserId, cfg);
  const effective = resolveEffectiveEstimateWideAdjustment({
    scopeAdjustment: scope.estimateWideAdjustment,
    partnerAccountId: scope.partnerAccountId,
    env: opts.env
  });
  const basis = normalizeStudioV2PricingBasis(scope.pricingBasis) || "wholesale";
  const group =
    normalizeStudioV2MaterialGroup(scope.materialGroup) || "Group Promo";
  const markup = Number(scope.internalMarkupPercent ?? 0);
  return {
    pricingBasis: basis,
    materialGroup: group,
    materialGroupLabel: studioV2MaterialGroupLabel(group),
    accountAdjustment: {
      // Only surface account-derived rules here — manual EWA lives under estimateWideAdjustment.
      active:
        effective.active === true &&
        (effective.source === "trusted_account_rule" || effective.spahnTrusted === true),
      percentage:
        effective.source === "trusted_account_rule" || effective.spahnTrusted === true
          ? effective.percentage || 0
          : 0,
      reason:
        effective.source === "trusted_account_rule" || effective.spahnTrusted === true
          ? effective.reason || ""
          : "",
      source:
        effective.source === "trusted_account_rule" || effective.spahnTrusted === true
          ? effective.source || "trusted_account_rule"
          : null,
      readOnly: true,
      available: true,
      spahnTrusted: Boolean(effective.spahnTrusted)
    },
    estimateWideAdjustment: {
      active: Boolean(scope.estimateWideAdjustment?.active),
      percentage: Number(scope.estimateWideAdjustment?.percentage) || 0,
      reason: String(scope.estimateWideAdjustment?.reason || ""),
      source: String(scope.estimateWideAdjustment?.source || "manual"),
      editable: effective.source !== "trusted_account_rule"
    },
    internalMarkupPercent: Number.isFinite(markup) ? markup : 0,
    internalMarkupEditable: canEditMarkup,
    internalMarkupPlaceholder: canEditMarkup
      ? null
      : "Internal material markup editing requires authorized estimator access.",
    allowedPricingBases: [...STUDIO_V2_PRICING_BASES],
    allowedMaterialGroups: [...MATERIAL_GROUPS],
    allowedInternalMarkupPercents: [...ALLOWED_INTERNAL_MARKUP_PERCENTS]
  };
}

/**
 * Normalize a pricing PATCH into an updated scope.
 * @param {{
 *   existingScope: object,
 *   pricing: object,
 *   actorUserId?: string|null,
 *   env?: NodeJS.ProcessEnv
 * }} args
 */
export function normalizeStudioV2PricingPatch(args = {}) {
  const existing =
    args.existingScope && typeof args.existingScope === "object" ? { ...args.existingScope } : {};
  const pricing = args.pricing && typeof args.pricing === "object" ? args.pricing : {};
  /** @type {Array<{ field: string, message: string }>} */
  const issues = [];

  let pricingBasis = existing.pricingBasis;
  if (Object.prototype.hasOwnProperty.call(pricing, "pricingBasis")) {
    const next = normalizeStudioV2PricingBasis(pricing.pricingBasis);
    if (!next) {
      issues.push({
        field: "pricing.pricingBasis",
        message: "Pricing basis must be wholesale, direct, or retail."
      });
    } else {
      pricingBasis = next;
    }
  }

  let materialGroup = existing.materialGroup;
  if (
    Object.prototype.hasOwnProperty.call(pricing, "materialGroup") ||
    Object.prototype.hasOwnProperty.call(pricing, "priceGroup")
  ) {
    const raw = pricing.materialGroup ?? pricing.priceGroup;
    const next = normalizeStudioV2MaterialGroup(raw);
    if (!next) {
      issues.push({
        field: "pricing.materialGroup",
        message: "Price group must be Promo, A, B, C, D, E, F, or Remnant."
      });
    } else {
      materialGroup = next;
    }
  }

  let estimateWideAdjustment = existing.estimateWideAdjustment;
  if (Object.prototype.hasOwnProperty.call(pricing, "estimateWideAdjustment")) {
    const incoming = pricing.estimateWideAdjustment;
    if (incoming == null) {
      estimateWideAdjustment = normalizeEstimateWideAdjustment(null);
    } else if (typeof incoming !== "object") {
      issues.push({
        field: "pricing.estimateWideAdjustment",
        message: "Estimate-wide adjustment must be an object."
      });
    } else {
      const effectiveBefore = resolveEffectiveEstimateWideAdjustment({
        scopeAdjustment: existing.estimateWideAdjustment,
        partnerAccountId: existing.partnerAccountId,
        env: args.env
      });
      if (effectiveBefore.source === "trusted_account_rule" && effectiveBefore.active) {
        // Keep account-derived rule; ignore client overwrite of trusted source.
        estimateWideAdjustment = normalizeEstimateWideAdjustment(existing.estimateWideAdjustment);
      } else {
        const normalized = normalizeEstimateWideAdjustment({
          ...incoming,
          source: "manual"
        });
        if (normalized.active && !normalized.reason) {
          issues.push({
            field: "pricing.estimateWideAdjustment.reason",
            message: "A reason is required when estimate-wide adjustment is active."
          });
        } else {
          estimateWideAdjustment = {
            ...normalized,
            updatedAt: new Date().toISOString(),
            updatedByUserId: args.actorUserId || null
          };
        }
      }
    }
  }

  let internalMarkupPercent = Number(existing.internalMarkupPercent ?? 0) || 0;
  if (Object.prototype.hasOwnProperty.call(pricing, "internalMarkupPercent")) {
    const cfg = readTrustedPartnerAccountConfig(args.env);
    const raw = Number(pricing.internalMarkupPercent);
    if (!Number.isFinite(raw) || !ALLOWED_INTERNAL_MARKUP_PERCENTS.includes(raw)) {
      issues.push({
        field: "pricing.internalMarkupPercent",
        message: `Internal markup must be one of: ${ALLOWED_INTERNAL_MARKUP_PERCENTS.join(", ")}.`
      });
    } else if (raw > 0 && !canApplyInternalMarkup(args.actorUserId, cfg)) {
      issues.push({
        field: "pricing.internalMarkupPercent",
        message: "Not authorized to apply internal material markup."
      });
    } else {
      internalMarkupPercent = raw;
    }
  }

  if (issues.length) {
    return { ok: false, issues, scope: existing, warnings: [] };
  }

  return {
    ok: true,
    issues: [],
    warnings: [],
    scope: {
      ...existing,
      pricingBasis,
      materialGroup,
      estimateWideAdjustment,
      internalMarkupPercent
    }
  };
}
