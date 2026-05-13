/**
 * Loads Pricing Admin foundation tables when present; otherwise returns documented fallbacks
 * that mirror `quoteCalculator.js` constants. Quote math does **not** call this module yet —
 * wire only after parity tests pass.
 */

import {
  ESF_DIRECT_PRICE_PER_SQFT,
  PROTOTYPE_ADDON_UNIT_PRICES,
  PROTOTYPE_TIER_PRICE_PER_SQFT
} from "./quoteCalculator.js";

/** Maps foundation `group_code` → calculator `materialGroup` label. */
export const PRICING_ADMIN_GROUP_CODE_TO_LABEL = Object.freeze({
  promo: "Group Promo",
  group_a: "Group A",
  group_b: "Group B",
  group_c: "Group C",
  group_d: "Group D",
  group_e: "Group E",
  group_f: "Group F"
});

export const PRICING_ADMIN_LABEL_TO_GROUP_CODE = Object.freeze(
  Object.fromEntries(Object.entries(PRICING_ADMIN_GROUP_CODE_TO_LABEL).map(([k, v]) => [v, k]))
);

const DEFAULT_POLICY_RULES = Object.freeze({
  public_consumer_markup_percent: { percent: 25 },
  public_rounding_rule: { mode: "round_up_nearest_10" },
  public_monday_quote_value_group: { group_code: "promo" },
  internal_default_measurement_mode: { mode: "manual_sqft" },
  internal_allow_rapid_linear: { allowed: false }
});

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

function fallbackDirectByLabel() {
  return { ...ESF_DIRECT_PRICE_PER_SQFT };
}

function fallbackWholesaleByLabel() {
  return { ...PROTOTYPE_TIER_PRICE_PER_SQFT };
}

/** Maps Pricing Admin `addon_code` → prototype global add-on keys (for future calculator wiring). */
export const PRICING_ADMIN_ADDON_CODE_TO_PROTOTYPE_KEY = Object.freeze({
  kitchen_sink_cutout: "qty-sink",
  vanity_bar_sink_cutout: "qty-bar",
  cooktop_cutout: "qty-cook",
  electrical_outlet_cutout: "qty-outlet",
  esf_stainless_kitchen_sink: "qty-ss",
  stock_blanco_sink: "qty-blanco",
  rectangular_vanity_sink: "qty-v-rect",
  oval_vanity_sink: "qty-v-oval",
  tear_out: "tearout"
});

function fallbackAddonCatalogByCode() {
  /** @type {Record<string, { display_name: string; base_price: number; category: string }>} */
  const out = {};
  out.kitchen_sink_cutout = {
    display_name: PROTOTYPE_ADDON_UNIT_PRICES["qty-sink"].name,
    base_price: PROTOTYPE_ADDON_UNIT_PRICES["qty-sink"].price,
    category: "cutout"
  };
  out.vanity_bar_sink_cutout = {
    display_name: PROTOTYPE_ADDON_UNIT_PRICES["qty-bar"].name,
    base_price: PROTOTYPE_ADDON_UNIT_PRICES["qty-bar"].price,
    category: "cutout"
  };
  out.cooktop_cutout = {
    display_name: PROTOTYPE_ADDON_UNIT_PRICES["qty-cook"].name,
    base_price: PROTOTYPE_ADDON_UNIT_PRICES["qty-cook"].price,
    category: "cutout"
  };
  out.electrical_outlet_cutout = {
    display_name: PROTOTYPE_ADDON_UNIT_PRICES["qty-outlet"].name,
    base_price: PROTOTYPE_ADDON_UNIT_PRICES["qty-outlet"].price,
    category: "cutout"
  };
  out.esf_stainless_kitchen_sink = {
    display_name: PROTOTYPE_ADDON_UNIT_PRICES["qty-ss"].name,
    base_price: PROTOTYPE_ADDON_UNIT_PRICES["qty-ss"].price,
    category: "sink"
  };
  out.stock_blanco_sink = {
    display_name: PROTOTYPE_ADDON_UNIT_PRICES["qty-blanco"].name,
    base_price: PROTOTYPE_ADDON_UNIT_PRICES["qty-blanco"].price,
    category: "sink"
  };
  out.rectangular_vanity_sink = {
    display_name: PROTOTYPE_ADDON_UNIT_PRICES["qty-v-rect"].name,
    base_price: PROTOTYPE_ADDON_UNIT_PRICES["qty-v-rect"].price,
    category: "sink"
  };
  out.oval_vanity_sink = {
    display_name: PROTOTYPE_ADDON_UNIT_PRICES["qty-v-oval"].name,
    base_price: PROTOTYPE_ADDON_UNIT_PRICES["qty-v-oval"].price,
    category: "sink"
  };
  out.tear_out = {
    display_name: PROTOTYPE_ADDON_UNIT_PRICES.tearout.name,
    base_price: PROTOTYPE_ADDON_UNIT_PRICES.tearout.price,
    category: "service"
  };
  out.waterfall = { display_name: "Waterfall edge", base_price: 600, category: "edge" };
  out.polish_waterfall_backside = { display_name: "Polish waterfall backside", base_price: 225, category: "edge" };
  out.popup_outlet_cutout = { display_name: "Pop-up outlet cutout", base_price: 150, category: "cutout" };
  out.specialty_edge_per_lf = { display_name: "Specialty edge (per LF)", base_price: 15, category: "edge" };
  return out;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 */
export async function isPricingAdminFoundationInstalled(db) {
  if (!db?.from) return false;
  try {
    const { error } = await db.from("quote_price_groups").select("id").limit(1);
    if (error) {
      if (isMissingRelationError(error)) return false;
      throw error;
    }
    return true;
  } catch (e) {
    if (isMissingRelationError(e)) return false;
    throw e;
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{ organizationId?: string|null }} opts
 * @returns {Promise<{
 *   source: 'database' | 'fallback',
 *   installed: boolean,
 *   organizationId: string|null,
 *   directByMaterialLabel: Record<string, number>,
 *   wholesaleByMaterialLabel: Record<string, number>,
 *   policyRules: Record<string, unknown>,
 *   addonsByCode: Record<string, { display_name: string; base_price: number; category: string }>,
 *   notes: string[]
 * }>}
 */
export async function resolvePricingAdminConfig(db, opts = {}) {
  const organizationId = opts.organizationId != null ? String(opts.organizationId).trim() || null : null;
  const notes = [];
  const installed = await isPricingAdminFoundationInstalled(db).catch(() => false);
  if (!installed) {
    notes.push("Pricing Admin tables not installed — using quoteCalculator.js fallbacks.");
    return {
      source: "fallback",
      installed: false,
      organizationId,
      directByMaterialLabel: fallbackDirectByLabel(),
      wholesaleByMaterialLabel: fallbackWholesaleByLabel(),
      policyRules: { ...DEFAULT_POLICY_RULES },
      addonsByCode: fallbackAddonCatalogByCode(),
      notes
    };
  }

  const orFilter =
    organizationId ? `organization_id.eq.${organizationId},organization_id.is.null` : "organization_id.is.null";

  const { data: groups, error: gErr } = await db
    .from("quote_price_groups")
    .select("id,group_code,display_name,sort_order,is_active,organization_id")
    .eq("is_active", true)
    .or(orFilter)
    .order("sort_order", { ascending: true });
  if (gErr) {
    if (isMissingRelationError(gErr)) {
      notes.push("quote_price_groups missing at runtime — fallback.");
      return {
        source: "fallback",
        installed: false,
        organizationId,
        directByMaterialLabel: fallbackDirectByLabel(),
        wholesaleByMaterialLabel: fallbackWholesaleByLabel(),
        policyRules: { ...DEFAULT_POLICY_RULES },
        addonsByCode: fallbackAddonCatalogByCode(),
        notes
      };
    }
    throw gErr;
  }

  const filtered = (groups || []).filter((row) => {
    if (organizationId) {
      return row.organization_id == null || String(row.organization_id) === String(organizationId);
    }
    return row.organization_id == null;
  });
  filtered.sort((a, b) => {
    const ao = a.organization_id != null ? 0 : 1;
    const bo = b.organization_id != null ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
  });
  const byGroupCode = new Map();
  for (const row of filtered) {
    const code = String(row.group_code || "");
    if (!code) continue;
    const existing = byGroupCode.get(code);
    if (!existing) byGroupCode.set(code, row);
    else if (row.organization_id != null) byGroupCode.set(code, row);
  }
  const mergedGroups = [...byGroupCode.values()].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
  if (!mergedGroups.length) {
    notes.push("No active price groups in DB for this scope — fallback.");
    return {
      source: "fallback",
      installed: true,
      organizationId,
      directByMaterialLabel: fallbackDirectByLabel(),
      wholesaleByMaterialLabel: fallbackWholesaleByLabel(),
      policyRules: { ...DEFAULT_POLICY_RULES },
      addonsByCode: fallbackAddonCatalogByCode(),
      notes
    };
  }

  const groupIds = mergedGroups.map((g) => g.id);
  const { data: rates, error: rErr } = await db
    .from("quote_price_group_rates")
    .select("price_group_id,rate_type,rate_per_sqft,is_active,organization_id")
    .in("price_group_id", groupIds)
    .eq("is_active", true)
    .or(orFilter);
  if (rErr) throw rErr;

  const ratesFiltered = (rates || []).filter((r) => {
    if (organizationId) {
      return r.organization_id == null || String(r.organization_id) === String(organizationId);
    }
    return r.organization_id == null;
  });

  /** @type {Record<string, { direct?: number; wholesale?: number }>} */
  const byCode = {};
  for (const g of mergedGroups) {
    byCode[g.group_code] = {};
  }
  const ratePick = (gid, type) => {
    const rows = ratesFiltered.filter((r) => String(r.price_group_id) === String(gid) && r.rate_type === type);
    const orgRow = rows.find((r) => r.organization_id != null);
    return orgRow || rows.find((r) => r.organization_id == null) || null;
  };
  for (const g of mergedGroups) {
    const d = ratePick(g.id, "direct");
    const w = ratePick(g.id, "wholesale");
    if (d && Number.isFinite(Number(d.rate_per_sqft))) byCode[g.group_code].direct = Number(d.rate_per_sqft);
    if (w && Number.isFinite(Number(w.rate_per_sqft))) byCode[g.group_code].wholesale = Number(w.rate_per_sqft);
  }

  const directByMaterialLabel = fallbackDirectByLabel();
  const wholesaleByMaterialLabel = fallbackWholesaleByLabel();
  for (const g of mergedGroups) {
    const label = PRICING_ADMIN_GROUP_CODE_TO_LABEL[g.group_code];
    if (!label) continue;
    const pack = byCode[g.group_code];
    if (pack?.direct != null) directByMaterialLabel[label] = pack.direct;
    if (pack?.wholesale != null) wholesaleByMaterialLabel[label] = pack.wholesale;
  }

  const { data: rulesRows, error: polErr } = await db
    .from("quote_pricing_policy_rules")
    .select("rule_key,rule_value,is_active,organization_id")
    .eq("is_active", true)
    .or(orFilter);
  if (polErr) throw polErr;
  const polFiltered = (rulesRows || []).filter((row) => {
    if (organizationId) {
      return row.organization_id == null || String(row.organization_id) === String(organizationId);
    }
    return row.organization_id == null;
  });
  const policyRules = { ...DEFAULT_POLICY_RULES };
  const ruleByKey = new Map();
  for (const row of polFiltered) {
    const k = String(row.rule_key || "");
    if (!k) continue;
    const prev = ruleByKey.get(k);
    if (!prev || (row.organization_id != null && organizationId && String(row.organization_id) === String(organizationId))) {
      ruleByKey.set(k, row);
    }
  }
  for (const [k, row] of ruleByKey) {
    if (row?.rule_value && typeof row.rule_value === "object") policyRules[k] = row.rule_value;
  }

  const { data: addonRows, error: aErr } = await db
    .from("quote_addon_catalog")
    .select("addon_code,display_name,base_price,category,is_active,organization_id")
    .eq("is_active", true)
    .or(orFilter);
  if (aErr) throw aErr;
  const addonFiltered = (addonRows || []).filter((row) => {
    if (organizationId) {
      return row.organization_id == null || String(row.organization_id) === String(organizationId);
    }
    return row.organization_id == null;
  });
  const addonsByCode = fallbackAddonCatalogByCode();
  const addonPick = new Map();
  for (const row of addonFiltered) {
    const c = String(row.addon_code || "");
    if (!c) continue;
    const prev = addonPick.get(c);
    if (!prev || (row.organization_id != null && organizationId && String(row.organization_id) === String(organizationId))) {
      addonPick.set(c, row);
    }
  }
  for (const [code, row] of addonPick) {
    addonsByCode[code] = {
      display_name: String(row.display_name || code),
      base_price: Number(row.base_price) || 0,
      category: String(row.category || "addon")
    };
  }

  notes.push("Merged DB pricing with calculator fallbacks for any missing group or rate.");
  return {
    source: "database",
    installed: true,
    organizationId,
    directByMaterialLabel,
    wholesaleByMaterialLabel,
    policyRules,
    addonsByCode,
    notes
  };
}
