/**
 * quickBooksStagingSupabaseRepository — Phase 3B QuickBooks ingestion (Supabase-backed repo).
 *
 * Implements the QuickBooksStagingRepository interface (see quickBooksStagingRepository.js)
 * against a Supabase service-role client. It is PURE LOGIC over an INJECTED client — it never
 * constructs the client, never reads env, and never holds credentials. The backend-core
 * server wires the service-role client via `getSupabase` (same pattern as slabsmith/moraware);
 * the QuickBooks VM never imports or uses this module.
 *
 * SAFETY:
 *   - Never logs or returns raw records, raw_payload, names, addresses, amounts, or memos.
 *   - Thrown errors carry only an error `code` and a generic message — never the raw DB error
 *     text — so the orchestrator's error path builds a safe run message from `err.code`.
 *
 * Behaviour notes:
 *   - upsertRows uses each entity's conflict key (from getStagingUpsertConfig via the
 *     orchestrator) as `onConflict`. supabase-js `.upsert()` updates every column present in
 *     the payload; this is equivalent to scoping DO UPDATE SET to updateColumns because the
 *     payload never carries the insert-only columns `first_seen_at`/`created_at` (so they are
 *     preserved on conflict), and `last_seen_at`/`updated_at` are stamped here (and also by
 *     the `qb_staging_touch_timestamps` trigger).
 *   - inserted/updated are best-effort (a Postgres upsert cannot cheaply distinguish them);
 *     `total` is authoritative for control flow. This impl returns inserted:0/updated:0.
 *   - createSyncRun supports resumable chunk semantics: for chunked runs it upserts-or-returns
 *     the existing run on (organization_id, qb_run_id, chunk_index) via select-then-insert
 *     (the partial unique index cannot be targeted by supabase-js `onConflict`).
 */

const AUDIT_BATCH_SIZE = 500;

/**
 * Build a sanitized error that carries only a code and a generic message.
 * @param {unknown} error
 * @param {string} op
 * @returns {Error}
 */
function toRepoError(error, op) {
  const e = new Error(`qb staging repository ${op} failed`);
  if (error && typeof error === "object" && "code" in error && error.code != null) {
    // @ts-ignore attach a safe code for the orchestrator's error-path message
    e.code = String(error.code);
  }
  return e;
}

/**
 * Create a Supabase-backed QuickBooksStagingRepository.
 *
 * @param {{ getSupabase: () => import("@supabase/supabase-js").SupabaseClient }} deps
 * @returns {import("./quickBooksStagingRepository.js").QuickBooksStagingRepository}
 */
export function createQuickBooksStagingSupabaseRepository(deps) {
  if (!deps || typeof deps.getSupabase !== "function") {
    throw new Error("createQuickBooksStagingSupabaseRepository: getSupabase is required");
  }
  const { getSupabase } = deps;

  const findExistingChunkRun = async (db, run) => {
    const { data, error } = await db
      .from("qb_sync_runs")
      .select("id")
      .eq("organization_id", run.organization_id)
      .eq("qb_run_id", run.qb_run_id)
      .eq("chunk_index", run.chunk_index)
      .maybeSingle();
    if (error) throw toRepoError(error, "createSyncRun.lookup");
    return data?.id ?? null;
  };

  return {
    async createSyncRun(run) {
      const db = getSupabase();
      const isChunked = run.chunk_index !== null && run.chunk_index !== undefined;

      // Resumable chunk semantics: return the existing run for this chunk if present.
      if (isChunked) {
        const existingId = await findExistingChunkRun(db, run);
        if (existingId) return { id: existingId };
      }

      const insertRow = {
        organization_id: run.organization_id,
        source_system: run.source_system ?? "quickbooks",
        qb_run_id: run.qb_run_id,
        qb_xml_version: run.qb_xml_version ?? null,
        mode: run.mode,
        status: run.status ?? "running",
        import_group_id: run.import_group_id ?? null,
        chunk_index: run.chunk_index ?? null,
        chunk_count: run.chunk_count ?? null,
      };

      const { data, error } = await db.from("qb_sync_runs").insert(insertRow).select("id").single();
      if (error) {
        // Race on the partial unique index (org, qb_run_id, chunk_index): re-fetch existing.
        if (isChunked && String(error.code) === "23505") {
          const existingId = await findExistingChunkRun(db, run);
          if (existingId) return { id: existingId };
        }
        throw toRepoError(error, "createSyncRun.insert");
      }
      return { id: data.id };
    },

    async upsertRows(tableName, rows, conflictColumns, _updateColumns) {
      if (!Array.isArray(conflictColumns) || conflictColumns.length === 0) {
        throw new Error(`upsertRows requires conflictColumns for table "${tableName}"`);
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        return { inserted: 0, updated: 0, total: 0 };
      }

      const db = getSupabase();
      const stamp = new Date().toISOString();
      // Stamp last_seen_at/updated_at so they advance on conflict even independent of the
      // DB trigger; first_seen_at/created_at are intentionally omitted (DB default on insert,
      // preserved on conflict since they are not in the payload).
      const stampedRows = rows.map((row) => ({ ...row, last_seen_at: stamp, updated_at: stamp }));

      const { error } = await db
        .from(tableName)
        .upsert(stampedRows, { onConflict: conflictColumns.join(",") });
      if (error) throw toRepoError(error, `upsertRows(${tableName})`);

      // inserted/updated are best-effort (see module doc); total is authoritative.
      return { inserted: 0, updated: 0, total: rows.length };
    },

    async recordErrors(rows) {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const db = getSupabase();
      for (let i = 0; i < rows.length; i += AUDIT_BATCH_SIZE) {
        const chunk = rows.slice(i, i + AUDIT_BATCH_SIZE);
        const { error } = await db.from("qb_sync_errors").insert(chunk);
        if (error) throw toRepoError(error, "recordErrors");
      }
    },

    async recordFindings(rows) {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const db = getSupabase();
      for (let i = 0; i < rows.length; i += AUDIT_BATCH_SIZE) {
        const chunk = rows.slice(i, i + AUDIT_BATCH_SIZE);
        const { error } = await db.from("qb_data_quality_findings").insert(chunk);
        if (error) throw toRepoError(error, "recordFindings");
      }
    },

    async finalizeSyncRun(id, patch) {
      const db = getSupabase();
      const update = {};
      // Only forward known, safe columns.
      for (const col of ["status", "finished_at", "error_count", "error_message", "entity_counts", "metadata"]) {
        if (patch[col] !== undefined) update[col] = patch[col];
      }
      const { error } = await db.from("qb_sync_runs").update(update).eq("id", id);
      if (error) throw toRepoError(error, "finalizeSyncRun");
    },
  };
}
