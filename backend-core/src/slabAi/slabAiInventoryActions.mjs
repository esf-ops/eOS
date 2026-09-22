/**
 * AI-safe slab inventory adapters — Brain cache only, never live SlabCloud.
 */
import { requireDomainHead } from "./slabAiPermissionIntersection.mjs";
import {
  INVENTORY_SELECT_COLUMNS,
  SEARCH_COLUMNS,
} from "../slabInventory/slabInventoryApi.js";

const DOMAIN_HEAD = "slab_inventory";
const MIN_QUERY = 2;
const MAX_RESULTS = 10;

function pickStr(v) {
  return String(v ?? "").trim();
}

function escapeIlike(term) {
  return String(term || "").replace(/[%_,]/g, " ").trim().slice(0, 80);
}

export function toAiMaterialSummary(row, retrievedAt) {
  const w = row.width_actual_in != null ? Number(row.width_actual_in) : null;
  const l = row.length_actual_in != null ? Number(row.length_actual_in) : null;
  const dims =
    Number.isFinite(w) && Number.isFinite(l) ? `${w}" × ${l}"` : null;
  return {
    materialId: String(row.id),
    inventoryId: pickStr(row.inventory_id) || null,
    colorName: pickStr(row.color_name) || null,
    materialName: pickStr(row.material_name) || null,
    thickness: pickStr(row.thickness_nominal) || null,
    dimensions: dims,
    rack: pickStr(row.rack) || null,
    lot: pickStr(row.lot) || null,
    distributor: pickStr(row.distributor) || null,
    isActive: row.is_active !== false,
    isRemnant: /remnant/i.test(String(row.source_inventory_type || "")),
    sourceSystem: pickStr(row.external_source) || "slab_inventory",
    retrievedAt,
    freshnessNote: "Inventory quantities reflect the last Brain sync cache — not a live vendor call.",
    authority: "Read-only slab inventory cache. AI must not invent quantities or availability.",
  };
}

/**
 * Search inventory materials/colors (bounded).
 */
export async function searchMaterialsForAi({ db, user, organizationId, query, limit = MAX_RESULTS }) {
  const gate = await requireDomainHead({ db, user, domainHead: DOMAIN_HEAD });
  if (!gate.ok) return gate;

  const q = pickStr(query);
  if (q.length < MIN_QUERY) {
    return {
      ok: true,
      items: [],
      totalMatches: 0,
      returned: 0,
      truncated: false,
      queryTooShort: true,
      minQueryLength: MIN_QUERY,
      retrievedAt: new Date().toISOString(),
    };
  }

  const lim = Math.min(MAX_RESULTS, Math.max(1, Number(limit) || MAX_RESULTS));
  const retrievedAt = new Date().toISOString();
  const term = escapeIlike(q);
  const orExpr = SEARCH_COLUMNS.map((c) => `${c}.ilike.%${term}%`).join(",");

  let qb = db
    .from("slab_inventory")
    .select(INVENTORY_SELECT_COLUMNS.join(","), { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .or(orExpr)
    .order("color_name", { ascending: true })
    .limit(lim);

  const { data, error, count } = await qb;
  if (error) {
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("does not exist") || msg.includes("schema cache")) {
      return { ok: false, installed: false, status: 503, error: "Slab inventory cache not installed." };
    }
    throw error;
  }

  const items = (data || []).map((r) => toAiMaterialSummary(r, retrievedAt));
  const totalMatches = count != null ? Number(count) : items.length;
  return {
    ok: true,
    items,
    totalMatches,
    returned: items.length,
    truncated: totalMatches > items.length,
    retrievedAt,
    sourceSystem: "slab_inventory",
  };
}

export async function retrieveMaterialInventoryForAi({ db, user, organizationId, materialId }) {
  const gate = await requireDomainHead({ db, user, domainHead: DOMAIN_HEAD });
  if (!gate.ok) return gate;
  if (!/^[0-9a-f-]{36}$/i.test(String(materialId || ""))) {
    return { ok: false, status: 400, error: "Invalid material id" };
  }
  const retrievedAt = new Date().toISOString();
  const { data, error } = await db
    .from("slab_inventory")
    .select(INVENTORY_SELECT_COLUMNS.join(","))
    .eq("organization_id", organizationId)
    .eq("id", materialId)
    .maybeSingle();
  if (error) {
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("does not exist")) {
      return { ok: false, installed: false, status: 503, error: "Slab inventory cache not installed." };
    }
    throw error;
  }
  if (!data) return { ok: false, status: 404, error: "Material not found" };
  return { ok: true, material: toAiMaterialSummary(data, retrievedAt), retrievedAt };
}

export async function retrieveRemnantAvailabilityForAi(args) {
  const result = await searchMaterialsForAi(args);
  if (!result.ok) return result;
  const remnants = (result.items || []).filter((m) => m.isRemnant);
  return {
    ...result,
    items: remnants,
    returned: remnants.length,
    note: remnants.length
      ? "Filtered to remnant-flagged inventory rows when source type is present."
      : "No remnant-flagged rows in this result set. Cache may not distinguish remnants for all sources.",
  };
}
