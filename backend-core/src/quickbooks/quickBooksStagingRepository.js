/**
 * quickBooksStagingRepository — Phase 3A QuickBooks ingestion (repository boundary).
 *
 * Defines the persistence interface the import orchestrator writes through, plus an
 * in-memory fake implementation used by tests. NO Supabase client exists here yet — a
 * future Phase 3B will add a service-role-backed implementation of this same interface
 * (constructed only inside backend-core, never on the VM). Keeping the boundary abstract
 * lets Phase 3A prove the orchestration end-to-end against a fake repo with zero real
 * writes, zero network, and zero credentials.
 *
 * SAFETY: implementations must treat `raw_payload` (and any row field) as sensitive —
 * never log it. The in-memory fake stores rows only in process memory for assertions and
 * never prints them.
 *
 * @typedef {Object} SyncRunInput
 * @property {string} organization_id
 * @property {string} source_system
 * @property {string} qb_run_id
 * @property {string|null} qb_xml_version
 * @property {string} mode
 * @property {string} status
 * @property {string} [import_group_id]  Chunked/resumable import group id (Phase 3B).
 * @property {number} [chunk_index]      0-based chunk index within the group (Phase 3B).
 * @property {number} [chunk_count]      Total chunk count for the group (Phase 3B).
 * @property {object} [metadata]
 *
 * @typedef {Object} UpsertResult
 * @property {number} inserted  Best-effort insert count (see note below).
 * @property {number} updated   Best-effort update count (see note below).
 * @property {number} total     Authoritative row count for control flow.
 *
 * NOTE on inserted/updated: these are BEST-EFFORT. The in-memory fake reports exact
 * counts, but a real Postgres/Supabase `ON CONFLICT DO UPDATE` cannot cheaply distinguish
 * insert vs update per row (it needs `RETURNING (xmax = 0)` and the Supabase client's
 * upsert does not expose it). A Supabase-backed implementation MAY return `inserted: 0,
 * updated: 0` and rely on `total`. The orchestrator uses inserted/updated only for
 * reporting, never for control flow.
 *
 * NOTE on timestamps: implementations MUST stamp `last_seen_at` and `updated_at` on every
 * upsert (insert and update), and set `first_seen_at`/`created_at` only on insert. A real
 * implementation can do this in SQL (add the columns to the payload / DEFAULT now() on
 * insert / an `updated_at` trigger). The fake models this in memory.
 *
 * @typedef {Object} QuickBooksStagingRepository
 * @property {(run: SyncRunInput) => Promise<{ id: string }>} createSyncRun
 *   Create the audit run row (qb_sync_runs) and return its id.
 * @property {(tableName: string, rows: object[], conflictColumns: string[], updateColumns: string[]) => Promise<UpsertResult>} upsertRows
 *   Upsert a chunk of rows into a staging table using the given ON CONFLICT key.
 * @property {(errors: object[]) => Promise<void>} recordErrors
 *   Append safe error rows (qb_sync_errors) — messages must never contain record content.
 * @property {(findings: object[]) => Promise<void>} recordFindings
 *   Append safe data-quality findings (qb_data_quality_findings).
 * @property {(id: string, patch: object) => Promise<void>} finalizeSyncRun
 *   Update the run row with final status/counts/finished_at.
 */

/**
 * Create an in-memory fake QuickBooksStagingRepository for tests / dry infrastructure.
 * Upserts dedupe by the provided conflict key, so repeated imports are idempotent exactly
 * as a real `ON CONFLICT (conflictColumns) DO UPDATE` would behave.
 *
 * @returns {QuickBooksStagingRepository & {
 *   getTableRows: (t: string) => object[],
 *   getTableCount: (t: string) => number,
 *   getTableNames: () => string[],
 *   getRuns: () => object[],
 *   getErrors: () => object[],
 *   getFindings: () => object[],
 * }}
 */
export function createInMemoryQuickBooksStagingRepository() {
  /** @type {Map<string, Map<string, object>>} tableName -> (conflictKey -> row) */
  const tables = new Map();
  const runs = [];
  const errors = [];
  const findings = [];
  /** @type {Map<string, number>} tableName -> number of upsertRows calls (proves chunking) */
  const upsertCalls = new Map();
  let runSeq = 0;

  // Monotonic clock so repeated upserts always produce strictly increasing timestamps
  // (models `now()` advancing between imports without relying on wall-clock resolution).
  let clock = Date.parse("2026-01-01T00:00:00.000Z");
  const now = () => new Date(++clock).toISOString();

  const NUL = "\u0000";
  const conflictKeyOf = (row, conflictColumns) =>
    conflictColumns.map((col) => `${col}=${String(row[col])}`).join(NUL);

  return {
    async createSyncRun(run) {
      const id = `fake-sync-run-${++runSeq}`;
      runs.push({
        id,
        ...run,
        status: run.status ?? "running",
        // Chunk/resume metadata (Phase 3B) preserved when supplied.
        import_group_id: run.import_group_id ?? null,
        chunk_index: run.chunk_index ?? null,
        chunk_count: run.chunk_count ?? null,
        imported_at: now(),
      });
      return { id };
    },

    async upsertRows(tableName, rows, conflictColumns, updateColumns) {
      if (!Array.isArray(conflictColumns) || conflictColumns.length === 0) {
        throw new Error(`upsertRows requires conflictColumns for table "${tableName}"`);
      }
      upsertCalls.set(tableName, (upsertCalls.get(tableName) ?? 0) + 1);
      if (!tables.has(tableName)) {
        tables.set(tableName, new Map());
      }
      const table = tables.get(tableName);
      let inserted = 0;
      let updated = 0;

      for (const row of rows) {
        const key = conflictKeyOf(row, conflictColumns);
        const stamp = now();
        if (table.has(key)) {
          const existing = table.get(key);
          const next = { ...existing };
          const cols = Array.isArray(updateColumns) && updateColumns.length > 0 ? updateColumns : Object.keys(row);
          for (const col of cols) {
            // Never overwrite an existing value with undefined (models a real upsert that
            // only SETs columns present in the payload).
            if (row[col] !== undefined) next[col] = row[col];
          }
          // Always advance last_seen_at/updated_at on update; preserve first_seen_at/created_at.
          next.last_seen_at = stamp;
          next.updated_at = stamp;
          table.set(key, next);
          updated += 1;
        } else {
          const inserting = {};
          for (const [col, value] of Object.entries(row)) {
            if (value !== undefined) inserting[col] = value;
          }
          inserting.first_seen_at = stamp;
          inserting.created_at = stamp;
          inserting.last_seen_at = stamp;
          inserting.updated_at = stamp;
          table.set(key, inserting);
          inserted += 1;
        }
      }

      return { inserted, updated, total: rows.length };
    },

    async recordErrors(rows) {
      for (const row of rows) errors.push(row);
    },

    async recordFindings(rows) {
      for (const row of rows) findings.push(row);
    },

    async finalizeSyncRun(id, patch) {
      const run = runs.find((r) => r.id === id);
      if (run) Object.assign(run, patch);
    },

    // ── Test accessors (not part of the repository interface) ────────────────
    getTableRows(tableName) {
      return Array.from(tables.get(tableName)?.values() ?? []);
    },
    getTableCount(tableName) {
      return tables.get(tableName)?.size ?? 0;
    },
    getTableNames() {
      return Array.from(tables.keys());
    },
    getUpsertCallCount(tableName) {
      return upsertCalls.get(tableName) ?? 0;
    },
    getRuns() {
      return runs;
    },
    getErrors() {
      return errors;
    },
    getFindings() {
      return findings;
    },
  };
}
