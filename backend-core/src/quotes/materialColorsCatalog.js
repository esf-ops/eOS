/**
 * Elite Program material / color catalog for Internal Estimate + Pricing Admin.
 * Primary source: `quote_pricing_rules` rows with category `material_color` (prototype seed).
 * Fallback: small static list when DB is unavailable or empty.
 */

/** @type {Array<Record<string, unknown>>} */
const FALLBACK_ELITE_PROGRAM_COLORS = [
  {
    id: "fallback-promo-1",
    colorName: "Carrara Classic",
    supplier: "ASMI",
    materialType: "Quartz",
    priceGroupCode: "promo",
    priceGroupLabel: "Group Promo",
    collectionName: null,
    finish: null,
    thickness: null,
    isActive: true,
    source: "elite_program_seed_fallback"
  },
  {
    id: "fallback-a-1",
    colorName: "Axbridge",
    supplier: "Cambria",
    materialType: "Quartz",
    priceGroupCode: "group_a",
    priceGroupLabel: "Group A",
    collectionName: null,
    finish: null,
    thickness: null,
    isActive: true,
    source: "elite_program_seed_fallback"
  },
  {
    id: "fallback-b-1",
    colorName: "Alabaster",
    supplier: "ESF Quartz",
    materialType: "Quartz",
    priceGroupCode: "group_b",
    priceGroupLabel: "Group B",
    collectionName: null,
    finish: null,
    thickness: null,
    isActive: true,
    source: "elite_program_seed_fallback"
  },
  {
    id: "fallback-f-1",
    colorName: "Skara Brae (example)",
    supplier: "Cambria",
    materialType: "Quartz",
    priceGroupCode: "group_f",
    priceGroupLabel: "Group F",
    collectionName: null,
    finish: null,
    thickness: null,
    isActive: true,
    source: "elite_program_seed_fallback"
  }
];

function groupCodeFromLabel(label) {
  const g = String(label || "").trim().toLowerCase();
  if (!g) return "promo";
  return g.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} db
 * @returns {Promise<{ ok: boolean, colors: Array<Record<string, unknown>>, warnings: string[] }>}
 */
export async function fetchEliteProgramMaterialColors(db) {
  /** @type {string[]} */
  const warnings = [];
  if (!db || typeof db.from !== "function") {
    warnings.push("No Supabase client — using prototype fallback color list.");
    return { ok: true, colors: [...FALLBACK_ELITE_PROGRAM_COLORS], warnings };
  }
  try {
    const { data, error } = await db
      .from("quote_pricing_rules")
      .select("id, item_code, item_name, metadata, is_active")
      .eq("category", "material_color")
      .eq("is_active", true)
      .limit(8000);
    if (error) throw error;
    const seen = new Set();
    /** @type {Array<Record<string, unknown>>} */
    const colors = [];
    for (const row of data || []) {
      const code = String(row.item_code || "").trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      const priceGroupLabel = String(meta.group || "Group Promo").trim() || "Group Promo";
      const priceGroupCode = String(meta.group_code || groupCodeFromLabel(priceGroupLabel)).trim() || groupCodeFromLabel(priceGroupLabel);
      const colorName = String(meta.color_name || row.item_name || "").trim() || String(row.item_name || "").trim();
      colors.push({
        id: String(row.id),
        colorName,
        supplier: meta.supplier != null ? String(meta.supplier) : null,
        materialType: meta.material != null ? String(meta.material) : null,
        priceGroupCode,
        priceGroupLabel,
        collectionName: meta.collection != null ? String(meta.collection) : null,
        finish: meta.finish != null ? String(meta.finish) : null,
        thickness: meta.thickness != null ? String(meta.thickness) : null,
        isActive: true,
        source: "quote_pricing_rules:material_color"
      });
    }
    if (!colors.length) {
      warnings.push("No active material_color rules in Supabase — using fallback catalog. Apply eos_quote_platform_seed_prototype.sql when ready.");
      return { ok: true, colors: [...FALLBACK_ELITE_PROGRAM_COLORS], warnings };
    }
    return { ok: true, colors, warnings };
  } catch (e) {
    warnings.push(`Could not load material colors from Supabase (${String(e?.message || e)}) — using fallback catalog.`);
    return { ok: true, colors: [...FALLBACK_ELITE_PROGRAM_COLORS], warnings };
  }
}
