/**
 * elite100-config-delta-v2 — frozen-baseline-anchor configuration delta pricing engine.
 *
 * Preserves elite100-config-delta-v1 as a separate historical identity.
 * New calculations must persist engineVersion elite100-config-delta-v2.
 *
 * Never calls calculateQuote(). Never fetches live Admin tables.
 * Operates only on frozen/trusted server inputs. Money in integer cents.
 */

import { createHash } from "node:crypto";
import {
  ELITE100_CONFIG_DELTA_ENGINE_ID_V2,
  ELITE100_CONFIG_DELTA_SCHEMA_VERSION_V2,
  FORBIDDEN_CLIENT_CALC_FIELDS,
  MATERIAL_USE_TAX_BPS,
  PRICING_BASIS,
  SPAHN_AND_ROSE_ADJUSTMENT_BPS
} from "./elite100ConfigDeltaConstants.mjs";
import {
  applyBasisPointsToCents,
  assertFiniteCents,
  ceilCentsToTenDollars,
  centsToDollars,
  dollarsToCents,
  mulRateCentsByMilliSf,
  sfToMilli
} from "./money.mjs";
import { toPublicConfigurationCalculationDto } from "./elite100ConfigDeltaPublicSerializer.mjs";

function fail(code, message, statusCode = 422) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function fingerprintCanonical(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function rejectForbiddenClientFields(obj, path = "$") {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => rejectForbiddenClientFields(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_CLIENT_CALC_FIELDS.includes(k)) {
      throw fail("forbidden_caller_authority", `Caller must not supply ${k} at ${path}`, 400);
    }
    // Nested clientClaims bag is scanned; trusted server bags are not under clientClaims
    if (k === "clientClaims" || k === "browserPayload") {
      rejectForbiddenClientFields(v, `${path}.${k}`);
    }
  }
}

function inEffect(row, atIso) {
  if (!row || row.isActive === false || row.is_active === false) return false;
  const t = new Date(atIso).getTime();
  const from = row.effectiveFrom || row.effective_from;
  const to = row.effectiveTo || row.effective_to;
  if (from && new Date(from).getTime() > t) return false;
  if (to && new Date(to).getTime() < t) return false;
  return true;
}

function normalizeGroupCode(code) {
  const raw = String(code || "").trim();
  const map = {
    promo: "promo",
    "group promo": "promo",
    group_promo: "promo",
    a: "group_a",
    "group a": "group_a",
    group_a: "group_a",
    b: "group_b",
    "group b": "group_b",
    group_b: "group_b",
    c: "group_c",
    "group c": "group_c",
    group_c: "group_c",
    d: "group_d",
    "group d": "group_d",
    group_d: "group_d",
    e: "group_e",
    "group e": "group_e",
    group_e: "group_e",
    f: "group_f",
    "group f": "group_f",
    group_f: "group_f",
    remnant: "remnant"
  };
  const key = map[raw.toLowerCase()];
  if (!key) throw fail("unknown_material_group", `Unknown material group: ${raw}`);
  return key;
}

function groupDisplayLabel(code) {
  const labels = {
    promo: "Group Promo",
    group_a: "Group A",
    group_b: "Group B",
    group_c: "Group C",
    group_d: "Group D",
    group_e: "Group E",
    group_f: "Group F",
    remnant: "Remnant"
  };
  return labels[code] || code;
}

function rateCentsFromFrozen(scheduleRates, groupCode) {
  const dollars = scheduleRates?.[groupCode];
  if (dollars == null || !Number.isFinite(Number(dollars))) {
    throw fail("missing_material_rate", `Missing material rate for ${groupCode}`);
  }
  return dollarsToCents(Number(dollars));
}

/**
 * Resolve material $/SF for a room selection.
 * Watt's Promo $40 is account-specific (not labeled Direct/Wholesale).
 */
export function resolveMaterialRateCents(ctx) {
  const {
    pricingBasis,
    groupCode,
    frozenBaseRates,
    accountMemberships = [],
    materialRateOverrides = [],
    asOf,
    organizationId
  } = ctx;

  if (pricingBasis !== PRICING_BASIS.DIRECT && pricingBasis !== PRICING_BASIS.WHOLESALE) {
    throw fail("invalid_pricing_basis", "pricingBasis must be direct or wholesale");
  }

  const scheduleRates =
    pricingBasis === PRICING_BASIS.WHOLESALE
      ? frozenBaseRates.wholesale
      : frozenBaseRates.direct;
  const baseRateCents = rateCentsFromFrozen(scheduleRates, groupCode);

  const memberGroupIds = new Set(
    accountMemberships
      .filter((m) => m.organizationId === organizationId && inEffect(m, asOf))
      .map((m) => String(m.accountGroupId))
  );

  // Ambiguous membership: duplicate active memberships for same group+account
  const membershipKeys = accountMemberships
    .filter((m) => m.organizationId === organizationId && inEffect(m, asOf))
    .map((m) => `${m.accountGroupId}:${m.partnerAccountId}`);
  if (new Set(membershipKeys).size !== membershipKeys.length) {
    throw fail("ambiguous_account_membership", "Ambiguous account-group membership");
  }

  const candidates = materialRateOverrides.filter(
    (o) =>
      o.organizationId === organizationId &&
      memberGroupIds.has(String(o.accountGroupId)) &&
      inEffect(o, asOf) &&
      normalizeGroupCode(o.groupCode) === groupCode
  );

  // Watt's: account-specific Promo override — not schedule-labeled
  const watts = candidates.filter(
    (o) =>
      String(o.accountGroupCode || o.ruleKind) === "watts" ||
      String(o.overrideKind) === "watts_promo" ||
      (normalizeGroupCode(o.groupCode) === "promo" && Number(o.ratePerSqft) === 40)
  );

  if (watts.length > 1) {
    throw fail("conflicting_account_overrides", "Conflicting Watt's Promo overrides");
  }

  if (groupCode === "promo" && watts.length === 1) {
    const w = watts[0];
    return {
      baseScheduleRateCents: baseRateCents,
      accountOverrideRateCents: dollarsToCents(Number(w.ratePerSqft)),
      finalRateCents: dollarsToCents(Number(w.ratePerSqft)),
      source: "account_specific_promo_override",
      accountGroupId: w.accountGroupId,
      accountGroupCode: w.accountGroupCode || "watts",
      overrideId: w.id,
      pricingBasisLabel: null, // not Direct/Wholesale
      frozen: {
        ruleId: w.id,
        ratePerSqftCents: dollarsToCents(Number(w.ratePerSqft)),
        groupCode,
        overrideKind: "watts_promo"
      }
    };
  }

  // Other account material overrides (schedule-scoped)
  const scheduleScoped = candidates.filter(
    (o) =>
      !(
        String(o.accountGroupCode || o.ruleKind) === "watts" ||
        String(o.overrideKind) === "watts_promo" ||
        (normalizeGroupCode(o.groupCode) === "promo" && Number(o.ratePerSqft) === 40)
      ) &&
      (!o.scheduleCode || o.scheduleCode === pricingBasis)
  );

  if (scheduleScoped.length > 1) {
    const topPriority = Math.max(...scheduleScoped.map((o) => Number(o.priority || 0)));
    const tops = scheduleScoped.filter((o) => Number(o.priority || 0) === topPriority);
    if (tops.length > 1) {
      throw fail("conflicting_account_overrides", "Conflicting active account material overrides");
    }
  }

  if (scheduleScoped.length === 1 || (scheduleScoped.length > 1 && true)) {
    const sorted = [...scheduleScoped].sort(
      (a, b) => Number(b.priority || 0) - Number(a.priority || 0)
    );
    if (sorted.length) {
      const top = sorted[0];
      const samePri = sorted.filter((o) => Number(o.priority || 0) === Number(top.priority || 0));
      if (samePri.length > 1) {
        throw fail("conflicting_account_overrides", "Conflicting active account material overrides");
      }
      return {
        baseScheduleRateCents: baseRateCents,
        accountOverrideRateCents: dollarsToCents(Number(top.ratePerSqft)),
        finalRateCents: dollarsToCents(Number(top.ratePerSqft)),
        source: "account_material_override",
        accountGroupId: top.accountGroupId,
        accountGroupCode: top.accountGroupCode || null,
        overrideId: top.id,
        pricingBasisLabel: pricingBasis,
        frozen: {
          ruleId: top.id,
          ratePerSqftCents: dollarsToCents(Number(top.ratePerSqft)),
          groupCode,
          scheduleCode: pricingBasis
        }
      };
    }
  }

  return {
    baseScheduleRateCents: baseRateCents,
    accountOverrideRateCents: null,
    finalRateCents: baseRateCents,
    source: "base_schedule",
    accountGroupId: null,
    accountGroupCode: null,
    overrideId: null,
    pricingBasisLabel: pricingBasis,
    frozen: {
      ruleId: null,
      ratePerSqftCents: baseRateCents,
      groupCode,
      scheduleCode: pricingBasis
    }
  };
}

function priceOptionLine(opt, locked) {
  const availability = String(opt.availabilityState || opt.availability_state || "active");
  if (availability === "unavailable") {
    throw fail("option_unavailable", `Option unavailable: ${opt.optionKey}`);
  }
  if (availability === "review_required") {
    throw fail("requires_estimator_review", `Option requires estimator review: ${opt.optionKey}`);
  }

  const treatment = String(opt.customerPriceTreatment || opt.customer_price_treatment || "absolute");
  if (treatment === "review_required" || treatment === "unavailable") {
    throw fail("requires_estimator_review", `Option not priced: ${opt.optionKey}`);
  }

  const qty = Number(opt.quantity ?? opt.qty ?? 0);
  if (!Number.isFinite(qty) || qty < 0) {
    throw fail("invalid_qty", `Invalid qty for ${opt.optionKey}`);
  }
  const min = Number(opt.minQty ?? opt.min_qty ?? 0);
  const max = opt.maxQty ?? opt.max_qty;
  if (qty < min || (max != null && qty > Number(max))) {
    throw fail("qty_out_of_bounds", `Qty out of bounds for ${opt.optionKey}`);
  }
  if (qty === 0) {
    return { optionKey: opt.optionKey, qty: 0, amountCents: 0, treatment, pricingMode: opt.pricingMode };
  }

  const mode = String(opt.pricingMode || opt.pricing_mode || "fixed");
  const unitCents = dollarsToCents(Number(opt.sellPrice ?? opt.sell_price ?? 0));

  // Included/default options already in the frozen baseline must not become newly chargeable
  // on first save. Only incremental quantity above the included baseline qty is priced.
  const includedInBaseline = Boolean(opt.includedInBaseline ?? opt.included_in_baseline);
  const rawBaselineQty = Number(
    opt.baselineQuantity ?? opt.baseline_quantity ?? opt.defaultQty ?? opt.default_qty ?? 0
  );
  // If marked included without an explicit qty, treat one unit as already in the baseline.
  const effectiveBaselineQty = includedInBaseline
    ? Number.isFinite(rawBaselineQty) && rawBaselineQty > 0
      ? rawBaselineQty
      : 1
    : 0;
  const chargeableQty = includedInBaseline ? Math.max(0, qty - effectiveBaselineQty) : qty;

  let amountCents = 0;
  if (treatment === "included" || treatment === "no_change") {
    amountCents = 0;
  } else if (chargeableQty === 0) {
    amountCents = 0;
  } else if (mode === "fixed" || mode === "per_each" || mode === "absolute" || mode === "delta" || mode === "replacement") {
    amountCents = roundLine(unitCents * chargeableQty);
  } else if (mode === "per_sf") {
    const milli = sfToMilli(Number(locked.chargeableCounterSfTotal || 0));
    amountCents = roundLine(mulRateCentsByMilliSf(unitCents, milli) * chargeableQty);
  } else if (mode === "per_lf") {
    const lfMilli = sfToMilli(Number(locked.edgeLinearFeetTotal || 0));
    amountCents = roundLine(mulRateCentsByMilliSf(unitCents, lfMilli) * chargeableQty);
  } else if (mode === "percentage") {
    throw fail("unsupported_option_mode", `Percentage options require engine support with basis: ${opt.optionKey}`);
  } else {
    throw fail("unsupported_option_mode", `Unsupported pricing mode: ${mode}`);
  }

  return {
    optionKey: String(opt.optionKey),
    displayLabel: opt.displayLabel || opt.optionKey,
    qty,
    chargeableQty,
    amountCents,
    treatment,
    pricingMode: mode,
    includedInBaseline,
    customerFacing: opt.customerFacing !== false
  };
}

function roundLine(n) {
  return Math.trunc(n); // already cents integer from mul; qty*unit is integer
}

/**
 * Validate and normalize trusted calculation input. Throws on fail-closed conditions.
 * @param {Record<string, unknown>} raw
 */
export function normalizeTrustedCalculationInput(raw) {
  if (!raw || typeof raw !== "object") {
    throw fail("invalid_input", "Calculation input required", 400);
  }
  rejectForbiddenClientFields(raw.clientClaims || {});
  rejectForbiddenClientFields(raw.browserPayload || {});

  // Top-level must not carry client authority duplicates
  for (const f of [
    "sellPrice",
    "markup",
    "taxRate",
    "configuredTotal",
    "accountGroupCode",
    "wattsRate",
    "spahnAdjustment"
  ]) {
    if (Object.prototype.hasOwnProperty.call(raw, f)) {
      throw fail("forbidden_caller_authority", `Caller must not supply ${f}`, 400);
    }
  }

  const organizationId = String(raw.organizationId || "");
  if (!organizationId) throw fail("missing_organization", "organizationId required", 400);

  const publication = raw.publication || {};
  if (!publication.id) throw fail("missing_publication", "publication.id required");
  if (publication.status && publication.status !== "active") {
    throw fail("publication_not_active", "publication is not active");
  }
  if (!publication.snapshotId) throw fail("missing_publication_snapshot", "publication.snapshotId required");

  const envelope = raw.envelope || {};
  if (!envelope.id || envelope.version == null) {
    throw fail("missing_envelope", "envelope.id/version required");
  }
  if (envelope.status && envelope.status !== "active") {
    throw fail("envelope_not_active", "envelope is not active");
  }
  if (envelope.publicationId && envelope.publicationId !== publication.id) {
    throw fail("envelope_publication_mismatch", "envelope/publication mismatch");
  }

  if (!raw.pricingPolicyFingerprint) {
    throw fail("missing_pricing_policy_fingerprint", "pricingPolicyFingerprint required");
  }
  if (!raw.catalogFingerprint) {
    throw fail("missing_catalog_fingerprint", "catalogFingerprint required");
  }
  if (!raw.engineVersion || raw.engineVersion !== ELITE100_CONFIG_DELTA_ENGINE_ID_V2) {
    throw fail("engine_version_mismatch", `engineVersion must be ${ELITE100_CONFIG_DELTA_ENGINE_ID_V2}`);
  }

  if (raw.pricingValidThrough) {
    const day = String(raw.pricingValidThrough).slice(0, 10);
    const today = (raw.asOf || new Date().toISOString()).slice(0, 10);
    if (day < today) throw fail("pricing_expired", "pricing-valid-through expired");
  }

  if (raw.materialProgram && raw.materialProgram !== "elite_100") {
    throw fail("not_elite_100", "Only Elite 100 material program is supported");
  }
  if (raw.outOfCollection === true || raw.ooc === true) {
    throw fail("ooc_scope", "Out-of-collection scope is not supported");
  }

  const pricingBasis = String(raw.pricingBasis || PRICING_BASIS.DIRECT);
  if (pricingBasis !== PRICING_BASIS.DIRECT && pricingBasis !== PRICING_BASIS.WHOLESALE) {
    throw fail("invalid_pricing_basis", "pricingBasis must be direct or wholesale");
  }

  const rooms = Array.isArray(raw.rooms) ? raw.rooms : [];
  if (!rooms.length) throw fail("missing_locked_measurements", "locked rooms required");

  for (const room of rooms) {
    if (room.chargeableCounterSf == null || !Number.isFinite(Number(room.chargeableCounterSf))) {
      throw fail("invalid_chargeable_sf", `Invalid chargeable SF for room ${room.roomKey || room.name}`);
    }
    if (Number(room.chargeableCounterSf) < 0) {
      throw fail("invalid_chargeable_sf", "chargeable SF cannot be negative");
    }
  }

  const frozenBaseRates = raw.frozenBaseRates;
  if (!frozenBaseRates?.direct || !frozenBaseRates?.wholesale) {
    throw fail("missing_frozen_rates", "frozenBaseRates.direct and .wholesale required");
  }

  const markup = raw.authorizedMaterialMarkup || { bps: 0 };
  if (markup.bps == null || !Number.isInteger(Number(markup.bps)) || Number(markup.bps) < 0) {
    throw fail("invalid_markup", "authorizedMaterialMarkup.bps must be non-negative integer");
  }
  if (Number(markup.bps) > 0 && !markup.authorizedByUserId && !markup.evidence) {
    throw fail("markup_unauthorized", "material markup requires server authorization evidence");
  }

  return {
    organizationId,
    publication,
    envelope,
    pricingPolicyId: raw.pricingPolicyId || null,
    pricingPolicyVersion: raw.pricingPolicyVersion || null,
    pricingPolicyFingerprint: String(raw.pricingPolicyFingerprint),
    catalogFingerprint: String(raw.catalogFingerprint),
    engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID_V2,
    sourceQuoteFamilyId: raw.sourceQuoteFamilyId || publication.quoteFamilyRootId || null,
    sourceQuoteRevision: raw.sourceQuoteRevision || null,
    pricingBasis,
    partnerAccountId: raw.partnerAccountId ?? null,
    accountMemberships: Array.isArray(raw.accountMemberships) ? raw.accountMemberships : [],
    materialRateOverrides: Array.isArray(raw.materialRateOverrides) ? raw.materialRateOverrides : [],
    estimateAdjustments: Array.isArray(raw.estimateAdjustments) ? raw.estimateAdjustments : [],
    rooms,
    lockedScope: raw.lockedScope || {},
    frozenBaseRates,
    authorizedMaterialMarkup: {
      bps: Number(markup.bps) || 0,
      authorizedByUserId: markup.authorizedByUserId || null,
      reason: markup.reason || null,
      evidence: markup.evidence || null
    },
    materialTaxPolicy: {
      bps: Number(raw.materialTaxPolicy?.bps ?? MATERIAL_USE_TAX_BPS),
      taxableBasis: raw.materialTaxPolicy?.taxableBasis || "material_sell_amount",
      policyId: raw.materialTaxPolicy?.policyId || null
    },
    options: Array.isArray(raw.options) ? raw.options : [],
    customLines: Array.isArray(raw.customLines) ? raw.customLines : [],
    credits: Array.isArray(raw.credits) ? raw.credits : [],
    baseline: raw.baseline || null,
    selectionFingerprint: raw.selectionFingerprint || null,
    idempotencyKey: raw.idempotencyKey || null,
    pricingValidThrough: raw.pricingValidThrough || null,
    asOf: raw.asOf || new Date().toISOString(),
    actor: raw.actor || { type: "system" },
    expectedInputFingerprint: raw.expectedInputFingerprint || null
  };
}

/**
 * Run elite100-config-delta-v2 calculation.
 * @param {Record<string, unknown>} rawInput
 */
export function calculateElite100ConfigDeltaV2(rawInput) {
  const input = normalizeTrustedCalculationInput(rawInput);

  // Cross-org membership/rules fail closed
  for (const m of input.accountMemberships) {
    if (m.organizationId && m.organizationId !== input.organizationId) {
      throw fail("cross_org_account_rule", "Cross-org account membership denied");
    }
  }
  for (const o of input.materialRateOverrides) {
    if (o.organizationId && o.organizationId !== input.organizationId) {
      throw fail("cross_org_account_rule", "Cross-org material override denied");
    }
  }
  for (const a of input.estimateAdjustments) {
    if (a.organizationId && a.organizationId !== input.organizationId) {
      throw fail("cross_org_account_rule", "Cross-org estimate adjustment denied");
    }
  }

  // Customer-name fields must never drive pricing (ignore if present under trusted lock)
  // Explicit reject if someone puts name-based activation flags
  if (rawInput.activateByCustomerName || rawInput.customerNameMatch) {
    throw fail("forbidden_caller_authority", "Customer-name pricing activation is forbidden", 400);
  }

  const lockedTotals = {
    chargeableCounterSfTotal: input.rooms.reduce((s, r) => s + Number(r.chargeableCounterSf || 0), 0),
    edgeLinearFeetTotal: Number(input.lockedScope.edgeLinearFeetTotal || 0)
  };

  const roomResults = [];
  let materialSellCents = 0;
  let materialTaxCents = 0;

  for (const room of input.rooms) {
    const roomKey = String(room.roomKey || room.name || "");
    const selectedGroup = normalizeGroupCode(room.selectedMaterialGroup || room.materialGroup);
    const baselineGroup = room.baselineMaterialGroup
      ? normalizeGroupCode(room.baselineMaterialGroup)
      : selectedGroup;
    const milli = sfToMilli(Number(room.chargeableCounterSf));

    const resolved = resolveMaterialRateCents({
      organizationId: input.organizationId,
      pricingBasis: input.pricingBasis,
      groupCode: selectedGroup,
      frozenBaseRates: input.frozenBaseRates,
      accountMemberships: input.partnerAccountId
        ? input.accountMemberships.filter((m) => m.partnerAccountId === input.partnerAccountId)
        : [],
      materialRateOverrides: input.materialRateOverrides,
      asOf: input.asOf
    });

    const baseMaterialCents = mulRateCentsByMilliSf(resolved.finalRateCents, milli);
    const markupBps = input.authorizedMaterialMarkup.bps;
    const markupCents = markupBps > 0 ? applyBasisPointsToCents(baseMaterialCents, markupBps) : 0;
    const finalMaterialSellCents = baseMaterialCents + markupCents;
    const taxCents = applyBasisPointsToCents(finalMaterialSellCents, input.materialTaxPolicy.bps);

    assertFiniteCents(finalMaterialSellCents, "material");
    assertFiniteCents(taxCents, "tax");

    materialSellCents += finalMaterialSellCents;
    materialTaxCents += taxCents;

    roomResults.push({
      roomKey,
      displayName: room.displayName || room.name || roomKey,
      chargeableCounterSf: Number(room.chargeableCounterSf),
      baselineMaterialGroup: baselineGroup,
      selectedMaterialGroup: selectedGroup,
      selectedMaterialLabel: groupDisplayLabel(selectedGroup),
      resolution: {
        baseScheduleRateCents: resolved.baseScheduleRateCents,
        accountOverrideRateCents: resolved.accountOverrideRateCents,
        finalRateCents: resolved.finalRateCents,
        source: resolved.source,
        pricingBasis: resolved.pricingBasisLabel,
        frozen: resolved.frozen
      },
      markupBps,
      markupCents,
      materialSellCents: finalMaterialSellCents,
      materialUseTaxCents: taxCents
    });
  }

  // Options / products / add-ons
  const optionLines = [];
  let optionsCents = 0;
  for (const opt of input.options) {
    const line = priceOptionLine(opt, lockedTotals);
    optionLines.push(line);
    optionsCents += line.amountCents;
  }

  // Custom lines (server-authorized unit prices only)
  const customLines = [];
  let customCents = 0;
  for (const line of input.customLines) {
    if (line.unitPrice != null && line.clientUnitPrice != null) {
      throw fail("invalid_custom_line_authority", "Custom line must not carry client unit price");
    }
    if (line.browserControlled) {
      throw fail("invalid_custom_line_authority", "Browser-controlled custom lines forbidden");
    }
    const qty = Number(line.quantity ?? 1);
    const unit = dollarsToCents(Number(line.amount ?? line.unitPrice ?? 0));
    const amountCents = Math.trunc(unit * qty);
    customLines.push({
      key: line.key || line.label,
      label: line.label,
      amountCents,
      customerFacing: line.customerFacing !== false,
      internalOnly: line.customerFacing === false
    });
    customCents += amountCents;
  }

  // Credits (negative)
  let creditsCents = 0;
  const creditLines = [];
  for (const c of input.credits) {
    const amountCents = -Math.abs(dollarsToCents(Number(c.amount)));
    creditLines.push({
      key: c.key || c.label,
      label: c.label,
      amountCents,
      customerFacing: c.customerFacing !== false
    });
    creditsCents += amountCents;
  }

  // --- Baseline (frozen publication total) ---
  let baselineExactCents = null;
  let baselineDisplayCents = null;
  if (input.baseline) {
    if (input.baseline.exactTotalCents != null) {
      baselineExactCents = Number(input.baseline.exactTotalCents);
    } else if (input.baseline.exactTotal != null) {
      baselineExactCents = dollarsToCents(Number(input.baseline.exactTotal));
    }
    if (input.baseline.displayTotalCents != null) {
      baselineDisplayCents = Number(input.baseline.displayTotalCents);
    } else if (input.baseline.displayTotal != null) {
      baselineDisplayCents = dollarsToCents(Number(input.baseline.displayTotal));
    } else if (baselineExactCents != null) {
      baselineDisplayCents = ceilCentsToTenDollars(baselineExactCents);
    }
  }

  const useFrozenBaselineAnchor =
    baselineExactCents != null && Number.isFinite(baselineExactCents);

  // Material deltas vs baseline group economics (never silently full-reprice the frozen total).
  const materialGroupDeltas = [];
  let materialDeltaCents = 0;
  for (const r of roomResults) {
    const baselineGroupFromInput = input.baseline?.rooms
      ? input.baseline.rooms.find((x) => (x.roomKey || x.name) === r.roomKey)
      : null;
    const bGroup = normalizeGroupCode(
      baselineGroupFromInput?.materialGroup ||
        baselineGroupFromInput?.selectedMaterialGroup ||
        r.baselineMaterialGroup
    );
    const selectedGroup = r.selectedMaterialGroup;

    let exactMaterialDeltaCents = 0;
    if (!bGroup) {
      if (useFrozenBaselineAnchor && selectedGroup && selectedGroup !== r.baselineMaterialGroup) {
        throw fail(
          "unresolved_baseline_material",
          "Frozen publication lacks reliable baseline material evidence for a material change"
        );
      }
      exactMaterialDeltaCents = 0;
    } else if (selectedGroup === bGroup) {
      // Keeping the original material group never contributes a material reprice delta.
      exactMaterialDeltaCents = 0;
    } else {
      // Rate-difference delta (selected economics − baseline-group economics), including tax.
      const bResolved = resolveMaterialRateCents({
        organizationId: input.organizationId,
        pricingBasis: input.pricingBasis,
        groupCode: bGroup,
        frozenBaseRates: input.frozenBaseRates,
        accountMemberships: input.partnerAccountId
          ? input.accountMemberships.filter((m) => m.partnerAccountId === input.partnerAccountId)
          : [],
        materialRateOverrides: input.materialRateOverrides,
        asOf: input.asOf
      });
      if (bResolved.finalRateCents == null || r.resolution.finalRateCents == null) {
        throw fail(
          "unresolved_baseline_material",
          "Cannot calculate a reliable material delta from frozen evidence"
        );
      }
      const milli = sfToMilli(Number(r.chargeableCounterSf));
      let bSell = mulRateCentsByMilliSf(bResolved.finalRateCents, milli);
      if (input.authorizedMaterialMarkup.bps > 0) {
        bSell += applyBasisPointsToCents(bSell, input.authorizedMaterialMarkup.bps);
      }
      const bTax = applyBasisPointsToCents(bSell, input.materialTaxPolicy.bps);
      exactMaterialDeltaCents = r.materialSellCents + r.materialUseTaxCents - (bSell + bTax);
    }

    materialDeltaCents += exactMaterialDeltaCents;
    materialGroupDeltas.push({
      roomKey: r.roomKey,
      fromGroup: bGroup || r.baselineMaterialGroup,
      toGroup: selectedGroup,
      exactMaterialDeltaCents
    });
  }

  const selectionDeltaSubtotalCents =
    materialDeltaCents + optionsCents + customCents + creditsCents;

  // Spahn & Rose — after complete net pre-rounded (includes use tax)
  const memberGroupIds = new Set(
    (input.partnerAccountId
      ? input.accountMemberships.filter((m) => m.partnerAccountId === input.partnerAccountId)
      : []
    )
      .filter((m) => m.organizationId === input.organizationId && inEffect(m, input.asOf))
      .map((m) => String(m.accountGroupId))
  );

  const spahnCandidates = input.estimateAdjustments.filter(
    (a) =>
      a.organizationId === input.organizationId &&
      memberGroupIds.has(String(a.accountGroupId)) &&
      inEffect(a, input.asOf) &&
      (String(a.accountGroupCode) === "spahn_and_rose" ||
        String(a.adjustmentCode) === "spahn_and_rose_entire_estimate_pct" ||
        Number(a.rate) === 0.03 ||
        Number(a.bps) === SPAHN_AND_ROSE_ADJUSTMENT_BPS)
  );

  if (spahnCandidates.length > 1) {
    throw fail("conflicting_account_overrides", "Conflicting Spahn & Rose adjustments");
  }

  let spahn = null;
  let spahnCents = 0;

  let configuredExactCents;
  let preAdjustmentSubtotalCents;

  if (useFrozenBaselineAnchor) {
    // Frozen publication total is the monetary anchor. Configured = baseline + authorized deltas.
    // Spahn (when applicable) applies only to the incremental selection delta so the frozen
    // baseline is not silently repriced or double-adjusted.
    preAdjustmentSubtotalCents = baselineExactCents + selectionDeltaSubtotalCents;
    assertFiniteCents(preAdjustmentSubtotalCents, "preAdjustmentSubtotal");
    if (spahnCandidates.length === 1 && selectionDeltaSubtotalCents !== 0) {
      const rule = spahnCandidates[0];
      const bps = Number(rule.bps ?? SPAHN_AND_ROSE_ADJUSTMENT_BPS);
      spahnCents = applyBasisPointsToCents(selectionDeltaSubtotalCents, bps);
      spahn = {
        ruleId: rule.id,
        accountGroupId: rule.accountGroupId,
        accountGroupCode: rule.accountGroupCode || "spahn_and_rose",
        rateBps: bps,
        basis: "configuration_selection_delta_only",
        preAdjustmentSubtotalCents: selectionDeltaSubtotalCents,
        amountCents: spahnCents,
        order: "after_selection_delta_before_display_rounding",
        effectiveFrom: rule.effectiveFrom || null,
        effectiveTo: rule.effectiveTo || null
      };
    }
    configuredExactCents = preAdjustmentSubtotalCents + spahnCents;
  } else {
    // Absolute / standalone mode (no frozen baseline) — full material+options reprice.
    preAdjustmentSubtotalCents =
      materialSellCents + materialTaxCents + optionsCents + customCents + creditsCents;
    assertFiniteCents(preAdjustmentSubtotalCents, "preAdjustmentSubtotal");
    if (spahnCandidates.length === 1) {
      const rule = spahnCandidates[0];
      const bps = Number(rule.bps ?? SPAHN_AND_ROSE_ADJUSTMENT_BPS);
      spahnCents = applyBasisPointsToCents(preAdjustmentSubtotalCents, bps);
      spahn = {
        ruleId: rule.id,
        accountGroupId: rule.accountGroupId,
        accountGroupCode: rule.accountGroupCode || "spahn_and_rose",
        rateBps: bps,
        basis: "entire_pre_rounded_estimate_including_material_use_tax",
        preAdjustmentSubtotalCents,
        amountCents: spahnCents,
        order: "after_net_pre_rounded_before_display_rounding",
        effectiveFrom: rule.effectiveFrom || null,
        effectiveTo: rule.effectiveTo || null
      };
    }
    configuredExactCents = preAdjustmentSubtotalCents + spahnCents;
  }

  assertFiniteCents(configuredExactCents, "configuredExact");
  if (configuredExactCents < 0) {
    throw fail("negative_total", "Unauthorized negative configured total");
  }

  const configuredDisplayCents = ceilCentsToTenDollars(configuredExactCents);
  const displayRoundingAdjustmentCents = configuredDisplayCents - configuredExactCents;

  const exactDeltaCents =
    baselineExactCents != null ? configuredExactCents - baselineExactCents : null;
  const displayDeltaCents =
    baselineDisplayCents != null ? configuredDisplayCents - baselineDisplayCents : null;

  const inputFingerprintBody = {
    organizationId: input.organizationId,
    publicationId: input.publication.id,
    snapshotId: input.publication.snapshotId,
    envelopeId: input.envelope.id,
    envelopeVersion: input.envelope.version,
    pricingPolicyFingerprint: input.pricingPolicyFingerprint,
    catalogFingerprint: input.catalogFingerprint,
    engineVersion: input.engineVersion,
    pricingBasis: input.pricingBasis,
    partnerAccountId: input.partnerAccountId,
    rooms: input.rooms
      .map((r) => ({
        roomKey: r.roomKey || r.name,
        chargeableCounterSf: r.chargeableCounterSf,
        selectedMaterialGroup: normalizeGroupCode(r.selectedMaterialGroup || r.materialGroup),
        baselineMaterialGroup: r.baselineMaterialGroup
          ? normalizeGroupCode(r.baselineMaterialGroup)
          : null
      }))
      .sort((a, b) => String(a.roomKey).localeCompare(String(b.roomKey))),
    options: [...input.options]
      .map((o) => ({
        optionKey: o.optionKey,
        quantity: o.quantity ?? o.qty ?? 0,
        sellPrice: o.sellPrice ?? o.sell_price,
        pricingMode: o.pricingMode
      }))
      .sort((a, b) => String(a.optionKey).localeCompare(String(b.optionKey))),
    customLines: input.customLines,
    credits: input.credits,
    markupBps: input.authorizedMaterialMarkup.bps,
    taxBps: input.materialTaxPolicy.bps,
    selectionFingerprint: input.selectionFingerprint,
    frozenBaseRates: input.frozenBaseRates,
    materialRateOverrides: input.materialRateOverrides.map((o) => o.id).sort(),
    estimateAdjustments: input.estimateAdjustments.map((a) => a.id).sort(),
    accountMemberships: input.accountMemberships.map((m) => m.id || `${m.accountGroupId}:${m.partnerAccountId}`).sort()
  };

  const inputFingerprint = fingerprintCanonical(inputFingerprintBody);
  if (input.expectedInputFingerprint && input.expectedInputFingerprint !== inputFingerprint) {
    throw fail("input_fingerprint_mismatch", "Input fingerprint mismatch");
  }

  const internal = {
    schemaVersion: ELITE100_CONFIG_DELTA_SCHEMA_VERSION_V2,
    engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID_V2,
    inputFingerprint,
    calculationFingerprint: null, // filled below
    pricingPolicyFingerprint: input.pricingPolicyFingerprint,
    catalogFingerprint: input.catalogFingerprint,
    publicationId: input.publication.id,
    publicationSnapshotId: input.publication.snapshotId,
    envelopeId: input.envelope.id,
    envelopeVersion: input.envelope.version,
    organizationId: input.organizationId,
    pricingBasis: input.pricingBasis,
    partnerAccountId: input.partnerAccountId,
    lockedQuantities: {
      rooms: roomResults.map((r) => ({
        roomKey: r.roomKey,
        chargeableCounterSf: r.chargeableCounterSf
      })),
      chargeableCounterSfTotal: lockedTotals.chargeableCounterSfTotal
    },
    rooms: roomResults,
    materialSubtotalCents: materialSellCents,
    materialUseTaxCents: materialTaxCents,
    materialDeltaCents,
    selectionDeltaSubtotalCents,
    frozenBaselineAnchor: useFrozenBaselineAnchor,
    materialUseTax: {
      bps: input.materialTaxPolicy.bps,
      taxableBasis: input.materialTaxPolicy.taxableBasis,
      policyId: input.materialTaxPolicy.policyId,
      amountCents: materialTaxCents,
      customerPresentation: "bundled_not_separate_line"
    },
    authorizedMaterialMarkup: {
      bps: input.authorizedMaterialMarkup.bps,
      amountCents: roomResults.reduce((s, r) => s + r.markupCents, 0),
      authorizedByUserId: input.authorizedMaterialMarkup.authorizedByUserId,
      reason: input.authorizedMaterialMarkup.reason,
      evidence: input.authorizedMaterialMarkup.evidence
    },
    options: optionLines,
    optionsTotalCents: optionsCents,
    customLines,
    customLinesTotalCents: customCents,
    credits: creditLines,
    creditsTotalCents: creditsCents,
    preAdjustmentSubtotalCents,
    estimateLevelAdjustments: spahn ? [spahn] : [],
    spahnAndRose: spahn,
    configuredExactTotalCents: configuredExactCents,
    displayRoundingAdjustmentCents,
    configuredDisplayTotalCents: configuredDisplayCents,
    baselineExactTotalCents: baselineExactCents,
    baselineDisplayTotalCents: baselineDisplayCents,
    exactConfigurationDeltaCents: exactDeltaCents,
    customerDisplayTotalDeltaCents: displayDeltaCents,
    materialGroupDeltas,
    warnings: [],
    reviewRequirements: [],
    createdAt: new Date().toISOString(),
    actor: input.actor,
    moneyModel: {
      unit: "integer_cents",
      percentages: "basis_points",
      sfPrecision: "milli_sf_3dp",
      displayRounding: "ceil_to_10_dollars"
    }
  };

  internal.calculationFingerprint = fingerprintCanonical({
    inputFingerprint,
    configuredExactTotalCents: configuredExactCents,
    configuredDisplayTotalCents: configuredDisplayCents,
    materialSellCents,
    materialTaxCents,
    spahnCents,
    optionsCents,
    customCents,
    creditsCents
  });

  const publicDto = toPublicConfigurationCalculationDto({
    estimateIdentity: {
      publicationId: input.publication.id,
      envelopeId: input.envelope.id
    },
    pricingValidThrough: input.pricingValidThrough,
    baselineDisplayTotalCents: baselineDisplayCents,
    configuredDisplayTotalCents: configuredDisplayCents,
    displayTotalDeltaCents: displayDeltaCents,
    rooms: roomResults.map((r) => ({
      roomKey: r.roomKey,
      displayName: r.displayName,
      selectedMaterialLabel: r.selectedMaterialLabel,
      // SF may be shown as locked scope summary — not editable
      chargeableCounterSf: r.chargeableCounterSf
    })),
    options: optionLines
      .filter((o) => o.customerFacing && o.qty > 0)
      .map((o) => ({
        optionKey: o.optionKey,
        displayLabel: o.displayLabel,
        quantity: o.qty,
        // visible exact option price where absolute/delta treatment permits
        visiblePrice:
          o.treatment === "included" || o.treatment === "no_change"
            ? null
            : centsToDollars(o.amountCents),
        included: o.treatment === "included"
      })),
    customFacingLines: customLines
      .filter((c) => c.customerFacing)
      .map((c) => ({
        label: c.label,
        amount: centsToDollars(c.amountCents)
      })),
    reviewRequiredMessages: [],
    disclaimers: [
      "Prices are based on the published Elite 100 estimate configuration and locked professional scope."
    ]
  });

  return {
    engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID_V2,
    inputFingerprint,
    calculationFingerprint: internal.calculationFingerprint,
    internal,
    public: publicDto,
    totals: {
      materialSell: centsToDollars(materialSellCents),
      materialUseTax: centsToDollars(materialTaxCents),
      preAdjustmentSubtotal: centsToDollars(preAdjustmentSubtotalCents),
      spahnAdjustment: centsToDollars(spahnCents),
      configuredExactTotal: centsToDollars(configuredExactCents),
      configuredDisplayTotal: centsToDollars(configuredDisplayCents),
      baselineExactTotal: baselineExactCents != null ? centsToDollars(baselineExactCents) : null,
      baselineDisplayTotal: baselineDisplayCents != null ? centsToDollars(baselineDisplayCents) : null,
      exactDelta: exactDeltaCents != null ? centsToDollars(exactDeltaCents) : null,
      displayDelta: displayDeltaCents != null ? centsToDollars(displayDeltaCents) : null
    }
  };
}


export { ELITE100_CONFIG_DELTA_ENGINE_ID_V2 } from "./elite100ConfigDeltaConstants.mjs";
