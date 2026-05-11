/**
 * eOS Brain Identity Resolution — resolver helper stubs.
 *
 * NON-INVASIVE: no production connectors call this yet. Safe to import from future jobs/admin APIs.
 * When Supabase tables from `eos_identity_resolution.sql` are missing, functions return graceful empty/false results.
 */

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

async function tableExists(supabase, table) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from(table).select("id").limit(1);
    if (error) throw error;
    return true;
  } catch (e) {
    if (isMissingRelationError(e)) return false;
    return false;
  }
}

/**
 * Normalize a display name for matching (conservative default).
 * @param {string} name
 * @param {{ stripLocationPrefix?: boolean }} [options]
 * @returns {string}
 */
export function normalizeEntityName(name, options = {}) {
  let s = String(name ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (options.stripLocationPrefix) {
    s = s.replace(/^(dyersville|lisbon|iowa\s*city)\s*[-–—]\s*/i, "").trim();
  }
  return s.replace(/[’']/g, "").replace(/&/g, " and ");
}

/**
 * Build a suggestion object from a source record and candidate entities (stub).
 * @param {Record<string, unknown>} sourceRecord
 * @param {ReadonlyArray<Record<string, unknown>>} candidates
 * @param {{ entityType?: string }} [options]
 * @returns {{ entityType: string, sourceRecord: Record<string, unknown>, candidates: ReadonlyArray<Record<string, unknown>>, matchType: string, confidenceLabel: string, rationale: string }}
 */
export function buildIdentitySuggestion(sourceRecord, candidates, options = {}) {
  return {
    entityType: String(options.entityType ?? "unknown"),
    sourceRecord: sourceRecord ?? {},
    candidates: Array.isArray(candidates) ? candidates : [],
    matchType: "stub",
    confidenceLabel: "none",
    rationale: "buildIdentitySuggestion is a stub; implement scoring in a future identity job."
  };
}

/**
 * Return the active approved link for a source key, if identity tables exist.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ sourceSystem: string, sourceRecordType: string, sourceRecordId: string, entityType: string }} params
 * @returns {Promise<{ ok: boolean, link: null | Record<string, unknown>, reason?: string }>}
 */
export async function resolveApprovedEntityLink(supabase, params) {
  if (!supabase) return { ok: false, link: null, reason: "no_supabase_client" };
  const exists = await tableExists(supabase, "eos_entity_links");
  if (!exists) return { ok: true, link: null, reason: "identity_tables_not_installed" };

  const sourceSystem = String(params?.sourceSystem ?? "").trim();
  const sourceRecordType = String(params?.sourceRecordType ?? "").trim();
  const sourceRecordId = String(params?.sourceRecordId ?? "").trim();
  const entityType = String(params?.entityType ?? "").trim();
  if (!sourceSystem || !sourceRecordType || !sourceRecordId || !entityType) {
    return { ok: false, link: null, reason: "missing_params" };
  }

  try {
    const { data: sr, error: srErr } = await supabase
      .from("eos_source_records")
      .select("id")
      .eq("source_system", sourceSystem)
      .eq("source_record_type", sourceRecordType)
      .eq("source_record_id", sourceRecordId)
      .eq("active", true)
      .limit(1);
    if (srErr) throw srErr;
    const sourceRecordPk = sr?.[0]?.id;
    if (!sourceRecordPk) return { ok: true, link: null, reason: "source_record_not_found" };

    const { data: links, error: linkErr } = await supabase
      .from("eos_entity_links")
      .select(
        "id,eos_entity_id,status,approved,link_status,match_type,confidence,effective_start_date,effective_end_date"
      )
      .eq("source_record_id", sourceRecordPk)
      .eq("entity_type", entityType)
      .eq("approved", true)
      .eq("link_status", "active")
      .limit(1);
    if (linkErr) throw linkErr;
    return { ok: true, link: links?.[0] ?? null };
  } catch (e) {
    if (isMissingRelationError(e)) return { ok: true, link: null, reason: "identity_tables_not_installed" };
    return { ok: false, link: null, reason: String(e?.message || e) };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, unknown>} filters
 * @returns {Promise<{ ok: boolean, rows: unknown[], reason?: string }>}
 */
export async function listUnmappedSourceRecords(supabase, filters = {}) {
  if (!supabase) return { ok: false, rows: [], reason: "no_supabase_client" };
  const exists = await tableExists(supabase, "eos_source_records");
  if (!exists) return { ok: true, rows: [], reason: "identity_tables_not_installed" };

  try {
    let q = supabase.from("eos_source_records").select("*").eq("active", true).limit(100);
    const sys = String(filters.sourceSystem ?? "").trim();
    if (sys) q = q.eq("source_system", sys);
    const { data, error } = await q;
    if (error) throw error;
    return { ok: true, rows: data ?? [] };
  } catch (e) {
    if (isMissingRelationError(e)) return { ok: true, rows: [], reason: "identity_tables_not_installed" };
    return { ok: false, rows: [], reason: String(e?.message || e) };
  }
}

/**
 * Map a link or suggestion row to a coarse UI status (stub).
 * @param {Record<string, unknown>} record
 * @returns {string}
 */
export function classifyMappingStatus(record) {
  const status = String(record?.suggestion_status ?? record?.status ?? "").trim();
  if (status) return status;
  if (record?.approved === true) return "approved";
  if (record?.approved === false) return "needs_review";
  return "unknown";
}
