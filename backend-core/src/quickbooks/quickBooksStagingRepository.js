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
 * @property {object} [metadata]
 *
 * @typedef {Object} UpsertResult
 * @property {number} inserted
 * @property {number} updated
 * @property {number} total
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
 *   Update the run row with final status/counts.
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
  let runSeq = 0;

  const NUL = "\u0000";
  const conflictKeyOf = (row, conflictColumns) =>
    conflictColumns.map((col) => `${col}=${String(row[col])}`).join(NUL);

  return {
    async createSyncRun(run) {
      const id = `fake-sync-run-${++runSeq}`;
      runs.push({ id, ...run, status: run.status ?? "running" });
      return { id };
    },

    async upsertRows(tableName, rows, conflictColumns, updateColumns) {
      if (!Array.isArray(conflictColumns) || conflictColumns.length === 0) {
        throw new Error(`upsertRows requires conflictColumns for table "${tableName}"`);
      }
      if (!tables.has(tableName)) {
        tables.set(tableName, new Map());
      }
      const table = tables.get(tableName);
      let inserted = 0;
      let updated = 0;

      for (const row of rows) {
        const key = conflictKeyOf(row, conflictColumns);
        if (table.has(key)) {
          const existing = table.get(key);
          const next = { ...existing };
          const cols = Array.isArray(updateColumns) && updateColumns.length > 0 ? updateColumns : Object.keys(row);
          for (const col of cols) {
            next[col] = row[col];
          }
          table.set(key, next);
          updated += 1;
        } else {
          table.set(key, { ...row });
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
