/**
 * quickBooksIntelligenceDataset — Phase 4A org-scoped current-row dataset builder.
 *
 * Prefer organization-wide current rows (unique natural keys), not a single
 * sync_run_id. Reruns update sync_run_id on every upserted row; filtering to one
 * run would drop entities that were not rewritten in that run or would miss
 * mid-rerun consistency. The staging unique keys already enforce one current row
 * per (organization_id, natural key).
 *
 * This module never connects to Supabase. Callers inject staging-shaped rows
 * (from a future backend-core repository or tests). After fact extraction,
 * raw_payload is discarded from the returned dataset.
 */

import {
  extractCustomerFact,
  extractEstimateFact,
  extractInvoiceFact,
  extractPaymentFact,
  extractSalesOrderFact,
  extractSalesRepFact,
} from "./quickBooksIntelligenceFacts.js";

/**
 * @typedef {{
 *   organizationId: string,
 *   asOfDate: string,
 *   customers: import("./quickBooksIntelligenceFacts.js").QbCustomerFact[],
 *   invoices: import("./quickBooksIntelligenceFacts.js").QbInvoiceFact[],
 *   payments: import("./quickBooksIntelligenceFacts.js").QbPaymentFact[],
 *   estimates: import("./quickBooksIntelligenceFacts.js").QbEstimateFact[],
 *   salesOrders: import("./quickBooksIntelligenceFacts.js").QbSalesOrderFact[],
 *   salesReps: import("./quickBooksIntelligenceFacts.js").QbSalesRepFact[],
 * }} QbIntelligenceDataset
 */

/**
 * @typedef {{
 *   organizationId: string,
 *   asOfDate?: string|null,
 *   customers?: object[],
 *   invoices?: object[],
 *   payments?: object[],
 *   estimates?: object[],
 *   salesOrders?: object[],
 *   salesReps?: object[],
 * }} QbStagingSnapshotInput
 */

/**
 * @param {string|null|undefined} asOfDate
 * @returns {string} YYYY-MM-DD
 */
export function resolveAsOfDate(asOfDate) {
  if (typeof asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return asOfDate;
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Keep rows for one organization. Does not filter by sync_run_id.
 *
 * @param {object[]|null|undefined} rows
 * @param {string} organizationId
 * @returns {object[]}
 */
export function filterOrgCurrentRows(rows, organizationId) {
  if (!Array.isArray(rows) || !organizationId) return [];
  return rows.filter(
    (row) => row && typeof row === "object" && row.organization_id === organizationId,
  );
}

/**
 * Deduplicate by natural key, preferring the row with the latest last_seen_at /
 * time_modified / updated_at when duplicates appear (defensive; unique keys should
 * already prevent this in Postgres).
 *
 * @param {object[]} rows
 * @param {(row: object) => string|null} keyFn
 * @returns {object[]}
 */
export function dedupeCurrentByNaturalKey(rows, keyFn) {
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    if (rowRecencyScore(row) >= rowRecencyScore(prev)) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

/**
 * @param {object} row
 * @returns {number}
 */
function rowRecencyScore(row) {
  const candidates = [row.last_seen_at, row.time_modified, row.updated_at, row.txn_date];
  let best = 0;
  for (const c of candidates) {
    if (typeof c !== "string" || !c) continue;
    const t = Date.parse(c);
    if (Number.isFinite(t) && t > best) best = t;
  }
  return best;
}

/**
 * Build a sanitized intelligence dataset from org-scoped staging rows.
 * Output facts never include raw_payload.
 *
 * @param {QbStagingSnapshotInput} input
 * @returns {QbIntelligenceDataset}
 */
export function buildIntelligenceDataset(input) {
  if (!input || typeof input !== "object") {
    throw new Error("buildIntelligenceDataset requires an input object");
  }
  const organizationId = input.organizationId;
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    throw new Error("organizationId is required");
  }

  const customers = dedupeCurrentByNaturalKey(
    filterOrgCurrentRows(input.customers, organizationId),
    (r) => (typeof r.qb_list_id === "string" ? r.qb_list_id : null),
  )
    .map(extractCustomerFact)
    .filter(Boolean);

  const invoices = dedupeCurrentByNaturalKey(
    filterOrgCurrentRows(input.invoices, organizationId),
    (r) => (typeof r.qb_txn_id === "string" ? r.qb_txn_id : null),
  )
    .map(extractInvoiceFact)
    .filter(Boolean);

  const payments = dedupeCurrentByNaturalKey(
    filterOrgCurrentRows(input.payments, organizationId),
    (r) => (typeof r.qb_txn_id === "string" ? r.qb_txn_id : null),
  )
    .map(extractPaymentFact)
    .filter(Boolean);

  const estimates = dedupeCurrentByNaturalKey(
    filterOrgCurrentRows(input.estimates, organizationId),
    (r) => (typeof r.qb_txn_id === "string" ? r.qb_txn_id : null),
  )
    .map(extractEstimateFact)
    .filter(Boolean);

  const salesOrders = dedupeCurrentByNaturalKey(
    filterOrgCurrentRows(input.salesOrders, organizationId),
    (r) => (typeof r.qb_txn_id === "string" ? r.qb_txn_id : null),
  )
    .map(extractSalesOrderFact)
    .filter(Boolean);

  const salesReps = dedupeCurrentByNaturalKey(
    filterOrgCurrentRows(input.salesReps, organizationId),
    (r) => (typeof r.qb_list_id === "string" ? r.qb_list_id : null),
  )
    .map(extractSalesRepFact)
    .filter(Boolean);

  return {
    organizationId,
    asOfDate: resolveAsOfDate(input.asOfDate),
    customers,
    invoices,
    payments,
    estimates,
    salesOrders,
    salesReps,
  };
}

/**
 * In-memory intelligence source for tests and future DI (no Supabase).
 *
 * @param {QbStagingSnapshotInput} snapshot
 */
export function createInMemoryIntelligenceSource(snapshot) {
  return {
    /**
     * @param {string} organizationId
     * @param {{ asOfDate?: string|null }} [opts]
     */
    async loadOrgCurrentDataset(organizationId, opts = {}) {
      if (organizationId !== snapshot.organizationId) {
        return buildIntelligenceDataset({
          organizationId,
          asOfDate: opts.asOfDate ?? snapshot.asOfDate,
          customers: [],
          invoices: [],
          payments: [],
          estimates: [],
          salesOrders: [],
          salesReps: [],
        });
      }
      return buildIntelligenceDataset({
        ...snapshot,
        asOfDate: opts.asOfDate ?? snapshot.asOfDate,
      });
    },
  };
}
