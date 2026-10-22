/**
 * Phase 1 — load active quote_qb_item_mappings from Supabase (org-scoped).
 * Read-only. Does not change pricing authority.
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @returns {Promise<Array<{
 *   eliteos_concept_key: string,
 *   qb_list_id: string,
 *   qb_full_name: string|null,
 *   pricing_source: string,
 *   customer_facing_name: string|null,
 *   is_active: boolean
 * }>>}
 */
export async function loadActiveQbItemMappings(db, organizationId) {
  const orgId = organizationId != null ? String(organizationId).trim() : "";
  if (!orgId) {
    throw new Error("organizationId is required to load quote_qb_item_mappings.");
  }
  if (!db || typeof db.from !== "function") {
    throw new Error("Supabase client is required to load quote_qb_item_mappings.");
  }

  const { data, error } = await db
    .from("quote_qb_item_mappings")
    .select(
      "eliteos_concept_key,qb_list_id,qb_full_name,pricing_source,customer_facing_name,is_active"
    )
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("eliteos_concept_key", { ascending: true });

  if (error) {
    const msg = String(error.message || error);
    if (/does not exist|42P01/i.test(msg)) {
      throw new Error(
        "quote_qb_item_mappings is not installed. Apply eliteos_quote_qb_item_mapping_and_write_queue_v1.sql."
      );
    }
    throw new Error(`Failed to load quote_qb_item_mappings: ${msg}`);
  }

  return (data || []).map((row) => ({
    eliteos_concept_key: String(row.eliteos_concept_key),
    qb_list_id: String(row.qb_list_id),
    qb_full_name: row.qb_full_name != null ? String(row.qb_full_name) : null,
    pricing_source: String(row.pricing_source),
    customer_facing_name: row.customer_facing_name != null ? String(row.customer_facing_name) : null,
    is_active: row.is_active !== false
  }));
}

/**
 * @param {ReadonlyArray<{ eliteos_concept_key: string, qb_list_id: string, qb_full_name?: string|null, pricing_source: string }>} mappings
 * @param {ReadonlyArray<string>} conceptKeys
 */
export function requireMappedConcepts(mappings, conceptKeys) {
  /** @type {Array<{ eliteos_concept_key: string, qb_list_id: string, qb_full_name: string|null, pricing_source: string }>} */
  const resolved = [];
  /** @type {Array<{ code: string, message: string, field?: string }>} */
  const errors = [];

  for (const key of conceptKeys || []) {
    const concept = String(key || "").trim();
    if (!concept) continue;
    const hit = (mappings || []).find((m) => m && String(m.eliteos_concept_key) === concept);
    if (!hit || !String(hit.qb_list_id || "").trim()) {
      errors.push({
        code: "QB_MAPPING_MISSING",
        message: `Active mapping with qb_list_id missing for concept "${concept}".`,
        field: concept
      });
      continue;
    }
    resolved.push({
      eliteos_concept_key: concept,
      qb_list_id: String(hit.qb_list_id).trim(),
      qb_full_name: hit.qb_full_name != null ? String(hit.qb_full_name) : null,
      pricing_source: String(hit.pricing_source || "none")
    });
  }

  return { ok: errors.length === 0, mappings: resolved, errors };
}
