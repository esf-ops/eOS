/**
 * Publication-level pricing pin.
 *
 * Every publication freezes the exact rate set its customer options are priced from, so a
 * schedule approved later can only affect new (or explicitly republished) publications.
 *
 * Technical identity and business approval are deliberately separate:
 * - `rateSetId` is a content hash of the rates/tax/option prices. It identifies *which* numbers
 *   were used and says nothing about whether anyone approved them.
 * - Approval lives on `digital_estimate_pricing_policy_versions` (status / approved_at /
 *   approved_by_user_id) and is looked up by `rateSetId` when staff need it. The pin never
 *   stores approval, and resolving a pin never checks approval.
 */
import { sha256CanonicalJson } from "../digitalEstimateToken.mjs";
import {
  SPAHN_ESTIMATE_ADJUSTMENT_PERCENT,
  WATTS_PROMO_RATE_PER_SF
} from "../../elite100EstimateStudio/studioEstimateTrustedAccounts.mjs";

/** Pinned rule: customer changes carry Spahn & Rose's 3% on the selection delta. */
export const PIN_RULE_SPAHN_TRUSTED_ACCOUNT = "spahn_trusted_account";

export const PRICING_PIN_SCHEMA = 1;
export const BUILTIN_ELITE100_RATE_SET_KEY = "elite100-builtin-v1";

export const PRICING_BASIS_UNESTABLISHED_CUSTOMER_MESSAGE =
  "Online changes aren't available for this estimate. Your published total is unchanged. Please contact Elite Stone Fabrication to make changes.";

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v);
  return Object.freeze(o);
}

/**
 * The built-in Elite 100 rate set every production publication has been priced with so far
 * (the v4 calculator tables and the Digital Estimate fixtures are identical). Immutable: a
 * change to any number is a new key, never an edit, or legacy publications would silently move.
 */
const BUILTIN_ELITE100_V1 = deepFreeze({
  rates: {
    direct: { promo: 70, group_a: 77, group_b: 85, group_c: 95, group_d: 105, group_e: 120, group_f: 135, remnant: 50 },
    wholesale: { promo: 45, group_a: 57, group_b: 65, group_c: 75, group_d: 85, group_e: 100, group_f: 115, remnant: 45 }
  },
  materialUseTaxBps: 200,
  optionPrices: {
    "qty-sink": 200,
    "qty-bar": 100,
    "qty-cook": 150,
    "qty-outlet": 30,
    "qty-ss": 160,
    "qty-v-rect": 55,
    "qty-v-oval": 35,
    tearout: 750
  }
});

export const BUILTIN_RATE_SETS = Object.freeze({ [BUILTIN_ELITE100_RATE_SET_KEY]: BUILTIN_ELITE100_V1 });

/** @param {{ rates: {direct: object, wholesale: object}, materialUseTaxBps: number, optionPrices: object }} content */
export function computeRateSetId(content) {
  return `rs1_${sha256CanonicalJson({
    rates: { direct: content.rates.direct, wholesale: content.rates.wholesale },
    materialUseTaxBps: content.materialUseTaxBps,
    optionPrices: content.optionPrices,
    pricingBasis: content.pricingBasis ?? null,
    rules: content.rules ?? [],
    repricingBlockedReasons: content.repricingBlockedReasons ?? []
  })}`;
}

export function normalizePinnedPricingBasis(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "wholesale") return "wholesale";
  if (s === "direct" || s === "direct_retail" || s === "retail") return "direct";
  return null;
}

function pinFromContent(
  content,
  { source, rateSetKey = null, policyVersionId = null, pricingBasis, rules = [], repricingBlockedReasons = [] }
) {
  const copy = structuredClone({
    rates: content.rates,
    materialUseTaxBps: content.materialUseTaxBps,
    optionPrices: content.optionPrices,
    pricingBasis: normalizePinnedPricingBasis(pricingBasis),
    rules: [...new Set(rules)].sort(),
    repricingBlockedReasons: [...new Set(repricingBlockedReasons)].sort()
  });
  return {
    schema: PRICING_PIN_SCHEMA,
    rateSetId: computeRateSetId(copy),
    source,
    rateSetKey,
    policyVersionId,
    ...copy
  };
}

const PIN_GROUP_KEYS = Object.freeze({
  "group promo": "promo",
  promo: "promo",
  "group a": "group_a",
  "group b": "group_b",
  "group c": "group_c",
  "group d": "group_d",
  "group e": "group_e",
  "group f": "group_f",
  remnant: "remnant"
});

/** "Group B" / "group_b" / "B" → "group_b"; null when not an Elite 100 rate group. */
export function pinGroupKey(label) {
  const s = String(label ?? "").trim().toLowerCase().replace(/_/g, " ");
  if (PIN_GROUP_KEYS[s]) return PIN_GROUP_KEYS[s];
  if (/^[a-f]$/.test(s)) return `group_${s}`;
  return null;
}

/**
 * The pin written into a new publication's frozen pricing evidence, built from the rates and
 * rules the calculation actually used (`calculationSnapshot.pricingRuleEvidence`), not from
 * whatever defaults exist at publish time.
 *
 * - Material $/SF: the calculator's rate table for the basis it used, with per-group rates
 *   actually charged (Pricing Admin override, Watts trusted Promo) applied on top.
 * - Use tax and cutout rates: from the calculation.
 * - Rules the customer pricing engine cannot reproduce (estimate-wide adjustment such as
 *   Spahn +3%, Vanity Program bundle rooms, unknown groups, room rates that do not match)
 *   are recorded in `repricingBlockedReasons`; repricing is then refused, never approximated.
 * - No evidence at all → blocked (`no_rate_evidence`).
 *
 * @param {{ pricingBasis?: string|null, pricingRuleEvidence?: object|null }} args
 */
export function pinForNewPublication({ pricingBasis = null, pricingRuleEvidence = null } = {}) {
  const content = structuredClone({
    rates: BUILTIN_ELITE100_V1.rates,
    materialUseTaxBps: BUILTIN_ELITE100_V1.materialUseTaxBps,
    optionPrices: BUILTIN_ELITE100_V1.optionPrices
  });
  const rules = [];
  const blocked = [];
  const ev = pricingRuleEvidence && typeof pricingRuleEvidence === "object" ? pricingRuleEvidence : null;
  const headerBasis = normalizePinnedPricingBasis(pricingBasis);
  if (!ev) {
    return pinFromContent(content, {
      source: "builtin_unverified",
      rateSetKey: BUILTIN_ELITE100_RATE_SET_KEY,
      pricingBasis: headerBasis,
      repricingBlockedReasons: ["no_rate_evidence"]
    });
  }

  const evBasis = normalizePinnedPricingBasis(ev.pricingBasis);
  if (!evBasis) blocked.push("no_pricing_basis_in_calculation");
  if (evBasis && headerBasis && evBasis !== headerBasis) blocked.push("pricing_basis_mismatch");
  const basis = evBasis || headerBasis;

  if (basis && ev.materialRateTable && typeof ev.materialRateTable === "object") {
    for (const [label, rate] of Object.entries(ev.materialRateTable)) {
      const k = pinGroupKey(label);
      if (!k || !Number.isFinite(Number(rate))) {
        blocked.push(`unknown_rate_group:${label}`);
        continue;
      }
      content.rates[basis][k] = Number(rate);
    }
  } else {
    blocked.push("no_rate_table");
  }

  const taxPct = Number(ev.materialUseTaxPercent);
  if (Number.isFinite(taxPct)) content.materialUseTaxBps = Math.round(taxPct * 100);
  else blocked.push("no_use_tax");

  const cut = ev.cutoutRates && typeof ev.cutoutRates === "object" ? ev.cutoutRates : null;
  if (cut) {
    const map = { kitchenSink: "qty-sink", vanitySink: "qty-bar", cooktop: "qty-cook", electricalOutlet: "qty-outlet" };
    for (const [from, to] of Object.entries(map)) {
      if (Number.isFinite(Number(cut[from]))) content.optionPrices[to] = Number(cut[from]);
      else blocked.push(`no_cutout_rate:${from}`);
    }
  } else {
    blocked.push("no_cutout_rates");
  }

  for (const room of Array.isArray(ev.rooms) ? ev.rooms : []) {
    const where = room?.roomKey || "room";
    if (room?.slabPackage || room?.rateSource === "slab_package") {
      rules.push("custom_slab_package_room");
      continue;
    }
    if (room?.vanityProgram) {
      blocked.push(`vanity_program_room:${where}`);
      continue;
    }
    const k = pinGroupKey(room?.materialGroup);
    if (!k || !basis) {
      blocked.push(`unknown_material_group:${where}`);
      continue;
    }
    if (room.rateSource === "elite100_v4_fallback_default_promo") {
      blocked.push(`material_rate_defaulted:${where}`);
      continue;
    }
    if (room.rateSource === "pricing_admin_override" && Number.isFinite(room.ratePerSf)) {
      content.rates[basis][k] = room.ratePerSf;
      rules.push("pricing_admin_override");
    }
    if (room.wattsOverrideApplied && Number.isFinite(room.ratePerSf)) {
      content.rates[basis][k] = room.ratePerSf;
      rules.push("watts_trusted_promo");
    }
    if (!Number.isFinite(room.ratePerSf) || content.rates[basis][k] !== room.ratePerSf) {
      blocked.push(`room_rate_not_reproducible:${where}`);
    }
    if (room.materialUseTaxPercent != null && Number.isFinite(taxPct) && room.materialUseTaxPercent !== taxPct) {
      blocked.push(`room_use_tax_differs:${where}`);
    }
  }
  // A Watts account pays the trusted Promo rate for any Promo swap, not only existing Promo rooms.
  if (ev.accountRules?.wattsTrusted && basis) {
    content.rates[basis].promo = WATTS_PROMO_RATE_PER_SF;
    rules.push("watts_trusted_account");
  }

  const adjPct = Number(ev.accountRules?.estimateWideAdjustmentPercent) || 0;
  const adjAmt = Number(ev.accountRules?.accountAdjustmentAmount) || 0;
  const adjSource = ev.accountRules?.estimateWideAdjustmentSource || null;
  // Spahn & Rose: the calculation added 3% to the whole estimate, so customer changes carry
  // 3% on the selection delta. A manual estimate-wide % is the estimator's one-off decision
  // and is not extended to customer changes.
  const isSpahnRule =
    ev.accountRules?.spahnTrusted === true &&
    adjSource === "trusted_account_rule" &&
    Math.abs(adjPct - SPAHN_ESTIMATE_ADJUSTMENT_PERCENT) < 0.001;
  if (isSpahnRule) {
    rules.push(PIN_RULE_SPAHN_TRUSTED_ACCOUNT);
  } else if (adjPct !== 0 || adjAmt !== 0) {
    blocked.push(`estimate_wide_adjustment:${adjSource || "unknown"}`);
  }

  return pinFromContent(content, {
    source: "calculation",
    rateSetKey: null,
    pricingBasis: basis,
    rules,
    repricingBlockedReasons: blocked
  });
}

/** @param {string|null} pricingBasis */
export function builtinRateSetPin(pricingBasis) {
  return pinFromContent(BUILTIN_ELITE100_V1, {
    source: "builtin",
    rateSetKey: BUILTIN_ELITE100_RATE_SET_KEY,
    pricingBasis
  });
}

/**
 * Resolve the pricing a publication's customer changes must use. Never consults the org's
 * current schedule.
 *
 * - `pinned`: the publication froze a pin; its content hash must still match.
 * - `legacy_builtin`: published before pins existed. Only the built-in set had ever been used
 *   (no database schedule existed, and the calculator never read one), so the basis is
 *   established when the evidence records direct vs wholesale.
 * - Otherwise the basis cannot be established and repricing must be refused.
 *
 * @param {object|null|undefined} pricingEvidence frozen `pricing_evidence_json`
 * @returns {{ ok: true, kind: "pinned"|"legacy_builtin", pin: object }
 *   | { ok: false, code: string, reason: string, pin: object|null }}
 */
export function resolvePublicationPricingPin(pricingEvidence) {
  const ev = pricingEvidence && typeof pricingEvidence === "object" ? pricingEvidence : {};
  const frozen = ev.pricingPin;
  if (frozen && typeof frozen === "object") {
    if (frozen.schema !== PRICING_PIN_SCHEMA || !frozen.rates?.direct || !frozen.rates?.wholesale) {
      return { ok: false, code: "pricing_pin_invalid", reason: "Pricing pin has an unknown shape.", pin: null };
    }
    if (computeRateSetId(frozen) !== frozen.rateSetId) {
      return { ok: false, code: "pricing_pin_invalid", reason: "Pricing pin content does not match its rateSetId.", pin: null };
    }
    const pin = structuredClone(frozen);
    if (Array.isArray(pin.repricingBlockedReasons) && pin.repricingBlockedReasons.length) {
      return {
        ok: false,
        code: "pricing_rules_not_reproducible",
        reason: `Online changes cannot reproduce this estimate's pricing: ${describeRepricingBlockedReasons(pin.repricingBlockedReasons)}.`,
        pin
      };
    }
    if (!pin.pricingBasis) {
      return {
        ok: false,
        code: "pricing_basis_unestablished",
        reason: "The publication does not record whether it was priced at direct/retail or wholesale.",
        pin
      };
    }
    return { ok: true, kind: "pinned", pin };
  }

  const calc = ev.calculationSnapshotCopy && typeof ev.calculationSnapshotCopy === "object" ? ev.calculationSnapshotCopy : {};
  const iu = calc.internal_ui && typeof calc.internal_ui === "object" ? calc.internal_ui : {};
  const legacyPin = builtinRateSetPin(iu.pricing_basis ?? calc.pricingBasis ?? null);
  if (!legacyPin.pricingBasis) {
    return {
      ok: false,
      code: "pricing_basis_unestablished",
      reason: "Published before pricing pins, and the evidence does not record direct/retail vs wholesale.",
      pin: null
    };
  }
  const legacyBlocked = legacyUnreproducibleReasons(calc);
  if (legacyBlocked.length) {
    return {
      ok: false,
      code: "pricing_rules_not_reproducible",
      reason: `Published before pricing pins with pricing the built-in rate set cannot reproduce: ${describeRepricingBlockedReasons(legacyBlocked)}.`,
      pin: null
    };
  }
  return { ok: true, kind: "legacy_builtin", pin: legacyPin };
}

const BLOCKED_REASON_LABELS = {
  no_rate_evidence: "no record of the rates the calculation used",
  no_pricing_basis_in_calculation: "no retail/wholesale basis in the calculation",
  pricing_basis_mismatch: "the calculation's retail/wholesale basis differs from the published one",
  unknown_rate_group: "an unrecognized material rate group",
  no_rate_table: "no material rate table",
  no_use_tax: "no material use tax rate",
  no_cutout_rate: "a missing cutout rate",
  no_cutout_rates: "no cutout rates",
  vanity_program_room: "a Vanity Program bundled room",
  unknown_material_group: "a room with an unrecognized material group",
  material_rate_defaulted: "a room whose material rate was defaulted",
  room_rate_not_reproducible: "a room rate the rate table cannot explain",
  room_use_tax_differs: "a room with a different material use tax",
  estimate_wide_adjustment: "an estimate-wide adjustment",
  watts_trusted_account: "Watts trusted-account pricing",
  custom_slab_package: "a custom slab package",
  account_adjustment: "an account adjustment"
};

/** Plain-language list for staff, with the codes kept for support. */
export function describeRepricingBlockedReasons(reasons) {
  const list = (reasons || []).map((code) => {
    const [base, detail] = String(code).split(":");
    const label = BLOCKED_REASON_LABELS[base] || base;
    return `${label}${detail && base === "estimate_wide_adjustment" ? ` (${detail})` : ""}`;
  });
  return `${[...new Set(list)].join("; ")} [${(reasons || []).join(", ")}]`;
}

/** Markers in a pre-pin calculation copy of rules the built-in rate set does not carry. */
function legacyUnreproducibleReasons(calc) {
  const text = JSON.stringify(calc || {});
  const reasons = [];
  if (/"bundled":true/.test(text)) reasons.push("vanity_program_room");
  if (/"wattsOverrideApplied":true|watts_trusted_promo/.test(text)) reasons.push("watts_trusted_account");
  if (/"customSlabPackage":true|"slabPackageId":"[^"]/.test(text)) reasons.push("custom_slab_package");
  if (/"estimateWideAdjustment":\{[^}]*"active":true/.test(text)) reasons.push("estimate_wide_adjustment");
  const adj = Number(calc?.totals?.accountAdjustment ?? calc?.internal_ui?.account_adjustment ?? 0);
  if (Number.isFinite(adj) && adj !== 0) reasons.push("account_adjustment");
  return reasons;
}
