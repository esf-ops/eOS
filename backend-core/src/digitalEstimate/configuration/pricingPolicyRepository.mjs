/**
 * DE.2B pricing-policy repository (memory) + pure resolution helpers.
 * Does not call calculateQuote(). Does not write quote_headers or Admin pricing tables.
 */

import { randomUUID } from "node:crypto";
import {
  FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT,
  FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT,
  FIXTURE_GLOBAL_MATERIAL_USE_TAX,
  FIXTURE_WATTS_PROMO_OVERRIDE,
  FIXTURE_SPAHN_AND_ROSE_ESTIMATE_ADJUSTMENT,
  buildFixtureMaterialGroupRates
} from "./approvedPricingFixtures.mjs";

function createAsyncMutex() {
  let chain = Promise.resolve();
  return {
    runExclusive(fn) {
      const run = chain.then(() => fn());
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }
  };
}

function inEffect(row, at = new Date()) {
  if (!row || row.is_active === false) return false;
  const t = at.getTime();
  if (row.effective_from && new Date(row.effective_from).getTime() > t) return false;
  if (row.effective_to && new Date(row.effective_to).getTime() < t) return false;
  return true;
}

/**
 * Resolve material $/SF for an account using server-side membership only.
 * Never uses customer display name.
 *
 * @param {{
 *   organizationId: string,
 *   partnerAccountId: string|null|undefined,
 *   scheduleCode: 'wholesale'|'direct',
 *   groupCode: string,
 *   at?: Date,
 *   baseRates: Record<string, number>,
 *   memberships: Array<Record<string, unknown>>,
 *   overrides: Array<Record<string, unknown>>,
 *   accountGroups: Array<Record<string, unknown>>
 * }} args
 */
export function resolveMaterialRateForAccount(args) {
  const {
    organizationId,
    partnerAccountId,
    scheduleCode,
    groupCode,
    at = new Date(),
    baseRates,
    memberships,
    overrides,
    accountGroups
  } = args;

  const base = Number(baseRates[groupCode]);
  if (!Number.isFinite(base)) {
    const err = new Error(`Unknown material group_code: ${groupCode}`);
    err.code = "unknown_group";
    throw err;
  }

  if (!partnerAccountId) {
    return {
      ratePerSqft: base,
      source: "base_schedule",
      overrideId: null,
      accountGroupId: null,
      accountGroupCode: null
    };
  }

  const memberGroupIds = new Set(
    memberships
      .filter(
        (m) =>
          m.organization_id === organizationId &&
          m.partner_account_id === partnerAccountId &&
          inEffect(m, at)
      )
      .map((m) => String(m.account_group_id))
  );

  const candidates = overrides
    .filter(
      (o) =>
        o.organization_id === organizationId &&
        memberGroupIds.has(String(o.account_group_id)) &&
        o.schedule_code === scheduleCode &&
        o.group_code === groupCode &&
        inEffect(o, at)
    )
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));

  if (!candidates.length) {
    return {
      ratePerSqft: base,
      source: "base_schedule",
      overrideId: null,
      accountGroupId: null,
      accountGroupCode: null
    };
  }

  const top = candidates[0];
  const group = accountGroups.find((g) => g.id === top.account_group_id);
  return {
    ratePerSqft: Number(top.rate_per_sqft),
    source: "account_material_override",
    overrideId: top.id,
    accountGroupId: top.account_group_id,
    accountGroupCode: group?.group_code ?? null,
    // Freeze fields for future calculation evidence (DE.2C)
    frozen: {
      ruleId: top.id,
      ratePerSqft: Number(top.rate_per_sqft),
      scheduleCode,
      groupCode,
      basis: "material_per_sqft"
    }
  };
}

/**
 * Resolve estimate-level account adjustments for a trusted partner account.
 * Customer-name spoofing is ignored (not an input).
 */
export function resolveEstimateAdjustmentsForAccount(args) {
  const {
    organizationId,
    partnerAccountId,
    at = new Date(),
    memberships,
    adjustments,
    accountGroups
  } = args;

  if (!partnerAccountId) return [];

  const memberGroupIds = new Set(
    memberships
      .filter(
        (m) =>
          m.organization_id === organizationId &&
          m.partner_account_id === partnerAccountId &&
          inEffect(m, at)
      )
      .map((m) => String(m.account_group_id))
  );

  return adjustments
    .filter(
      (a) =>
        a.organization_id === organizationId &&
        memberGroupIds.has(String(a.account_group_id)) &&
        inEffect(a, at)
    )
    .map((a) => {
      const group = accountGroups.find((g) => g.id === a.account_group_id);
      return {
        adjustmentId: a.id,
        accountGroupId: a.account_group_id,
        accountGroupCode: group?.group_code ?? null,
        rate: Number(a.rate),
        adjustmentType: a.adjustment_type,
        basisPolicy: a.basis_policy,
        includesCategories: a.includes_categories,
        excludesCategories: a.excludes_categories,
        calculationOrderHint: a.calculation_order_hint ?? null,
        customerSafeLabel: a.customer_safe_label ?? null,
        frozen: {
          ruleId: a.id,
          rate: Number(a.rate),
          basisPolicy: a.basis_policy,
          adjustmentType: a.adjustment_type
        }
      };
    });
}

/**
 * Apply material use tax to a material sell amount (fixture/helper — not production calc).
 */
export function applyMaterialUseTax(materialSellAmount, taxPolicy = FIXTURE_GLOBAL_MATERIAL_USE_TAX) {
  const base = Number(materialSellAmount) || 0;
  const rate = Number(taxPolicy.rate);
  const amount = Math.round(base * rate * 100) / 100;
  return {
    taxableBasis: taxPolicy.taxableBasis,
    rate,
    taxableAmount: base,
    taxAmount: amount,
    frozen: {
      rate,
      taxableBasis: taxPolicy.taxableBasis,
      calculatedAmount: amount
    }
  };
}

export function createInMemoryPricingPolicyRepository() {
  /** @type {Map<string, Record<string, unknown>>} */
  const policyVersions = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const schedules = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const groupRates = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const taxPolicies = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const accountGroups = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const memberships = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const materialOverrides = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const estimateAdjustments = new Map();
  /** @type {Array<Record<string, unknown>>} */
  const estimatorOverrides = [];

  const orgLocks = new Map();
  function lockFor(orgId) {
    const k = String(orgId);
    if (!orgLocks.has(k)) orgLocks.set(k, createAsyncMutex());
    return orgLocks.get(k);
  }

  const api = {
    mode: "memory",

    /**
     * Load confirmed fixtures into an org policy version (tests only — not production seed).
     */
    seedConfirmedElite100Fixtures(organizationId, { createdByUserId = null } = {}) {
      const policyId = randomUUID();
      const now = new Date().toISOString();
      policyVersions.set(policyId, {
        id: policyId,
        organization_id: organizationId,
        version_label: "fixture_elite100_confirmed_de2b",
        status: "active",
        created_by_user_id: createdByUserId,
        created_at: now,
        updated_at: now,
        is_fixture: true
      });

      for (const scheduleCode of /** @type {const} */ (["wholesale", "direct"])) {
        const scheduleId = randomUUID();
        schedules.set(scheduleId, {
          id: scheduleId,
          organization_id: organizationId,
          policy_version_id: policyId,
          schedule_code: scheduleCode,
          display_name: scheduleCode === "wholesale" ? "Wholesale" : "Direct/Retail",
          is_active: true,
          created_at: now,
          updated_at: now
        });
        for (const row of buildFixtureMaterialGroupRates(scheduleCode)) {
          const id = randomUUID();
          groupRates.set(id, {
            id,
            organization_id: organizationId,
            schedule_id: scheduleId,
            group_code: row.groupCode,
            display_name: row.displayName,
            rate_per_sqft: row.ratePerSqft,
            sort_order: row.sortOrder,
            is_active: true,
            created_at: now
          });
        }
      }

      const taxId = randomUUID();
      taxPolicies.set(taxId, {
        id: taxId,
        organization_id: organizationId,
        policy_version_id: policyId,
        tax_code: FIXTURE_GLOBAL_MATERIAL_USE_TAX.taxCode,
        rate: FIXTURE_GLOBAL_MATERIAL_USE_TAX.rate,
        taxable_basis: FIXTURE_GLOBAL_MATERIAL_USE_TAX.taxableBasis,
        applies_to_schedules: [...FIXTURE_GLOBAL_MATERIAL_USE_TAX.appliesAcrossSchedules],
        excludes_categories: [...FIXTURE_GLOBAL_MATERIAL_USE_TAX.excludesCategories],
        customer_presentation: FIXTURE_GLOBAL_MATERIAL_USE_TAX.customerPresentation,
        is_active: true,
        created_at: now,
        updated_at: now
      });

      const wattsId = randomUUID();
      accountGroups.set(wattsId, {
        id: wattsId,
        organization_id: organizationId,
        group_code: FIXTURE_WATTS_PROMO_OVERRIDE.accountGroupCode,
        display_name_internal: "Watt's",
        customer_safe_label: null,
        is_active: true,
        created_at: now,
        updated_at: now
      });
      const wattsOverrideId = randomUUID();
      materialOverrides.set(wattsOverrideId, {
        id: wattsOverrideId,
        organization_id: organizationId,
        policy_version_id: policyId,
        account_group_id: wattsId,
        schedule_code: FIXTURE_WATTS_PROMO_OVERRIDE.scheduleCode,
        group_code: FIXTURE_WATTS_PROMO_OVERRIDE.groupCode,
        rate_per_sqft: FIXTURE_WATTS_PROMO_OVERRIDE.ratePerSqft,
        priority: 200,
        reason_internal: FIXTURE_WATTS_PROMO_OVERRIDE.reasonInternal,
        approval_evidence_json: { fixture: true },
        is_active: true,
        created_at: now,
        updated_at: now
      });

      const spahnId = randomUUID();
      accountGroups.set(spahnId, {
        id: spahnId,
        organization_id: organizationId,
        group_code: FIXTURE_SPAHN_AND_ROSE_ESTIMATE_ADJUSTMENT.accountGroupCode,
        display_name_internal: "Spahn & Rose",
        customer_safe_label: null,
        is_active: true,
        created_at: now,
        updated_at: now
      });
      const adjId = randomUUID();
      estimateAdjustments.set(adjId, {
        id: adjId,
        organization_id: organizationId,
        policy_version_id: policyId,
        account_group_id: spahnId,
        adjustment_code: FIXTURE_SPAHN_AND_ROSE_ESTIMATE_ADJUSTMENT.adjustmentCode,
        display_name_internal: "Spahn & Rose entire-estimate adjustment",
        customer_safe_label: null,
        adjustment_type: FIXTURE_SPAHN_AND_ROSE_ESTIMATE_ADJUSTMENT.adjustmentType,
        rate: FIXTURE_SPAHN_AND_ROSE_ESTIMATE_ADJUSTMENT.rate,
        basis_policy: FIXTURE_SPAHN_AND_ROSE_ESTIMATE_ADJUSTMENT.basisPolicy,
        includes_categories: [
          "material",
          "products",
          "addons",
          "custom_lines",
          "discounts",
          "credits",
          "use_tax"
        ],
        excludes_categories: [],
        calculation_order_hint: null,
        customer_presentation: "unresolved",
        reason_internal: FIXTURE_SPAHN_AND_ROSE_ESTIMATE_ADJUSTMENT.reasonInternal,
        approval_evidence_json: { fixture: true },
        is_active: true,
        created_at: now,
        updated_at: now
      });

      return {
        policyVersionId: policyId,
        wattsAccountGroupId: wattsId,
        spahnAccountGroupId: spahnId,
        wattsOverrideId,
        spahnAdjustmentId: adjId
      };
    },

    async addAccountGroupMember(organizationId, accountGroupId, partnerAccountId, patch = {}) {
      const group = accountGroups.get(String(accountGroupId));
      if (!group || group.organization_id !== organizationId) {
        const err = new Error("account group not found");
        err.code = "not_found";
        err.statusCode = 404;
        throw err;
      }
      const id = randomUUID();
      const row = {
        id,
        organization_id: organizationId,
        account_group_id: accountGroupId,
        partner_account_id: partnerAccountId,
        is_active: true,
        effective_from: patch.effective_from ?? null,
        effective_to: patch.effective_to ?? null,
        created_at: new Date().toISOString(),
        ...patch
      };
      memberships.set(id, row);
      return structuredClone(row);
    },

    getBaseRates(organizationId, scheduleCode) {
      const schedule = [...schedules.values()].find(
        (s) => s.organization_id === organizationId && s.schedule_code === scheduleCode && s.is_active
      );
      if (!schedule) {
        return scheduleCode === "wholesale"
          ? { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT }
          : { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT };
      }
      /** @type {Record<string, number>} */
      const out = {};
      for (const r of groupRates.values()) {
        if (r.schedule_id === schedule.id && r.is_active !== false) {
          out[r.group_code] = Number(r.rate_per_sqft);
        }
      }
      return out;
    },

    resolveMaterialRate(organizationId, partnerAccountId, scheduleCode, groupCode, at) {
      return resolveMaterialRateForAccount({
        organizationId,
        partnerAccountId,
        scheduleCode,
        groupCode,
        at,
        baseRates: this.getBaseRates(organizationId, scheduleCode),
        memberships: [...memberships.values()],
        overrides: [...materialOverrides.values()],
        accountGroups: [...accountGroups.values()]
      });
    },

    resolveEstimateAdjustments(organizationId, partnerAccountId, at) {
      return resolveEstimateAdjustmentsForAccount({
        organizationId,
        partnerAccountId,
        at,
        memberships: [...memberships.values()],
        adjustments: [...estimateAdjustments.values()],
        accountGroups: [...accountGroups.values()]
      });
    },

    getActiveMaterialTaxPolicy(organizationId) {
      const row = [...taxPolicies.values()].find(
        (t) => t.organization_id === organizationId && t.is_active !== false
      );
      return row ? structuredClone(row) : structuredClone({
        ...FIXTURE_GLOBAL_MATERIAL_USE_TAX,
        organization_id: organizationId,
        rate: FIXTURE_GLOBAL_MATERIAL_USE_TAX.rate,
        taxable_basis: FIXTURE_GLOBAL_MATERIAL_USE_TAX.taxableBasis
      });
    },

    async appendEstimatorOverride(row) {
      const full = {
        id: row.id || randomUUID(),
        created_at: new Date().toISOString(),
        ...row
      };
      estimatorOverrides.push(full);
      return structuredClone(full);
    },

    async updateEstimatorOverride() {
      const err = new Error("estimator override records are append-only");
      err.code = "immutable";
      err.statusCode = 403;
      throw err;
    },

    schedulesAreDistinct(organizationId) {
      const w = this.getBaseRates(organizationId, "wholesale");
      const d = this.getBaseRates(organizationId, "direct");
      for (const code of Object.keys(d)) {
        if (code === "remnant") continue;
        if (w[code] === d[code]) return false;
      }
      return w.remnant === 45 && d.remnant === 50;
    },

    _dump() {
      return {
        policyVersions: [...policyVersions.values()],
        schedules: [...schedules.values()],
        groupRates: [...groupRates.values()],
        taxPolicies: [...taxPolicies.values()],
        accountGroups: [...accountGroups.values()],
        memberships: [...memberships.values()],
        materialOverrides: [...materialOverrides.values()],
        estimateAdjustments: [...estimateAdjustments.values()],
        estimatorOverrides: [...estimatorOverrides]
      };
    },

    lockFor
  };

  return api;
}

/**
 * Supabase pricing-policy repository — Brain service role only.
 * Fail closed: requires db; never falls back to memory.
 */
export function createSupabasePricingPolicyRepository({ db }) {
  if (!db) {
    const err = new Error("Supabase pricing policy repository requires db");
    err.code = "supabase_misconfigured";
    throw err;
  }
  return {
    mode: "supabase",
    async getBaseRates(organizationId, scheduleCode) {
      const { data: schedule, error: sErr } = await db
        .from("digital_estimate_material_schedules")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("schedule_code", scheduleCode)
        .eq("is_active", true)
        .limit(1);
      if (sErr) throw sErr;
      const scheduleId = schedule?.[0]?.id;
      if (!scheduleId) return {};
      const { data, error } = await db
        .from("digital_estimate_material_group_rates")
        .select("group_code, rate_per_sqft")
        .eq("organization_id", organizationId)
        .eq("schedule_id", scheduleId)
        .eq("is_active", true);
      if (error) throw error;
      /** @type {Record<string, number>} */
      const out = {};
      for (const r of data || []) out[r.group_code] = Number(r.rate_per_sqft);
      return out;
    }
  };
}
