/**
 * quickBooksIntelligenceSupabaseRepository — Phase 4B Supabase read repository.
 *
 * Loads organization-wide current rows from brain_quickbooks_* staging tables and
 * converts them into Phase 4A sanitized facts. PURE LOGIC over an INJECTED
 * `getSupabase` — never constructs a client, never reads env, never holds credentials.
 *
 * SAFETY:
 *   - Public loaders never return raw_payload.
 *   - Errors carry only a safe code + generic message (no DB text, no PII).
 *   - Queries filter by organization_id only (not a single sync_run_id).
 *   - Large tables are read in pages to avoid statement timeouts.
 */

import {
  extractCustomerFact,
  extractEstimateFact,
  extractInvoiceFact,
  extractInvoiceLineFact,
  extractPaymentFact,
  extractSalesOrderFact,
  extractSalesRepFact,
} from "./quickBooksIntelligenceFacts.js";
import { buildIntelligenceDataset } from "./quickBooksIntelligenceDataset.js";

/** Default page size for chunked staging reads (large invoice / line tables). */
export const QB_INTELLIGENCE_DEFAULT_PAGE_SIZE = 500;

/** Hard ceiling so a misconfigured pageSize cannot request huge ranges. */
export const QB_INTELLIGENCE_MAX_PAGE_SIZE = 2000;

export const QB_INTELLIGENCE_TABLES = Object.freeze({
  customers: "brain_quickbooks_customers",
  invoices: "brain_quickbooks_invoices",
  invoiceLines: "brain_quickbooks_invoice_lines",
  payments: "brain_quickbooks_payments",
  estimates: "brain_quickbooks_estimates",
  salesOrders: "brain_quickbooks_sales_orders",
  salesReps: "brain_quickbooks_sales_reps",
});

/** Columns needed for fact extraction (includes raw_payload where amounts live). */
export const QB_INTELLIGENCE_SELECT = Object.freeze({
  customers:
    "organization_id,qb_list_id,is_active,time_created,time_modified,last_seen_at,raw_payload",
  invoices:
    "organization_id,qb_txn_id,qb_customer_list_id,txn_date,time_created,time_modified,last_seen_at,raw_payload",
  // Invoice lines: named opaque columns are enough for Phase 4B facts; omit raw_payload
  // by default to keep ~350k-row transfers smaller. Opt in via includeLineRawPayload.
  invoiceLines:
    "organization_id,qb_txn_id,line_seq_number,qb_txn_line_id,txn_date,qb_item_list_id,line_type,last_seen_at",
  invoiceLinesWithRaw:
    "organization_id,qb_txn_id,line_seq_number,qb_txn_line_id,txn_date,qb_item_list_id,line_type,last_seen_at,raw_payload",
  payments:
    "organization_id,qb_txn_id,qb_customer_list_id,txn_date,time_created,time_modified,last_seen_at,raw_payload",
  estimates:
    "organization_id,qb_txn_id,qb_customer_list_id,txn_date,time_created,time_modified,last_seen_at,raw_payload",
  salesOrders:
    "organization_id,qb_txn_id,qb_customer_list_id,txn_date,time_created,time_modified,last_seen_at,raw_payload",
  salesReps:
    "organization_id,qb_list_id,is_active,time_created,time_modified,last_seen_at,raw_payload",
});

/**
 * @param {unknown} error
 * @param {string} op
 * @returns {Error}
 */
function toRepoError(error, op) {
  const e = new Error(`qb intelligence repository ${op} failed`);
  if (error && typeof error === "object" && "code" in error && error.code != null) {
    // @ts-ignore safe code only
    e.code = String(error.code);
  }
  return e;
}

/**
 * @param {unknown} pageSize
 * @returns {number}
 */
export function resolveIntelligencePageSize(pageSize) {
  const n = Number(pageSize);
  if (!Number.isFinite(n) || n <= 0) return QB_INTELLIGENCE_DEFAULT_PAGE_SIZE;
  return Math.min(QB_INTELLIGENCE_MAX_PAGE_SIZE, Math.floor(n));
}

/**
 * @param {string} organizationId
 */
function assertOrganizationId(organizationId) {
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    throw new Error("organizationId is required");
  }
}

/**
 * Create a Supabase-backed QuickBooks intelligence read repository.
 *
 * @param {{
 *   getSupabase: () => import("@supabase/supabase-js").SupabaseClient,
 *   pageSize?: number,
 * }} deps
 */
export function createQuickBooksIntelligenceSupabaseRepository(deps) {
  if (!deps || typeof deps.getSupabase !== "function") {
    throw new Error("createQuickBooksIntelligenceSupabaseRepository: getSupabase is required");
  }
  const { getSupabase } = deps;
  const defaultPageSize = resolveIntelligencePageSize(deps.pageSize);

  /**
   * Paginated org-scoped select. Does not filter by sync_run_id.
   * Orders by `id` for stable range pagination.
   *
   * @param {{
   *   table: string,
   *   columns: string,
   *   organizationId: string,
   *   pageSize?: number,
   *   maxRows?: number|null,
   * }} opts
   * @returns {Promise<object[]>}
   */
  async function fetchOrgCurrentRows(opts) {
    assertOrganizationId(opts.organizationId);
    const pageSize = resolveIntelligencePageSize(opts.pageSize ?? defaultPageSize);
    const maxRows =
      opts.maxRows == null
        ? null
        : Number.isFinite(Number(opts.maxRows)) && Number(opts.maxRows) > 0
          ? Math.floor(Number(opts.maxRows))
          : null;

    const db = getSupabase();
    /** @type {object[]} */
    const rows = [];
    let from = 0;

    for (;;) {
      const remaining = maxRows == null ? pageSize : Math.min(pageSize, maxRows - rows.length);
      if (remaining <= 0) break;

      const to = from + remaining - 1;
      const { data, error } = await db
        .from(opts.table)
        .select(opts.columns)
        .eq("organization_id", opts.organizationId)
        .order("id", { ascending: true })
        .range(from, to);

      if (error) throw toRepoError(error, `select.${opts.table}`);

      const batch = Array.isArray(data) ? data : [];
      rows.push(...batch);
      if (batch.length < remaining) break;
      if (maxRows != null && rows.length >= maxRows) break;
      from += remaining;
    }

    return rows;
  }

  /**
   * @template T
   * @param {object[]} stagingRows
   * @param {(row: object) => T|null} extract
   * @returns {T[]}
   */
  function toFacts(stagingRows, extract) {
    /** @type {T[]} */
    const out = [];
    for (const row of stagingRows) {
      const fact = extract(row);
      if (fact) out.push(fact);
    }
    return out;
  }

  return {
    /** @returns {number} */
    getPageSize() {
      return defaultPageSize;
    },

    /**
     * Low-level paginated staging fetch (includes raw_payload when selected).
     * Intended for internal use / tests — prefer the typed load* fact methods.
     */
    fetchOrgCurrentRows,

    /**
     * @param {string} organizationId
     * @param {{ pageSize?: number, maxRows?: number|null }} [opts]
     */
    async loadCustomers(organizationId, opts = {}) {
      const rows = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.customers,
        columns: QB_INTELLIGENCE_SELECT.customers,
        organizationId,
        pageSize: opts.pageSize,
        maxRows: opts.maxRows,
      });
      return toFacts(rows, extractCustomerFact);
    },

    /**
     * @param {string} organizationId
     * @param {{ pageSize?: number, maxRows?: number|null }} [opts]
     */
    async loadInvoices(organizationId, opts = {}) {
      const rows = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.invoices,
        columns: QB_INTELLIGENCE_SELECT.invoices,
        organizationId,
        pageSize: opts.pageSize,
        maxRows: opts.maxRows,
      });
      return toFacts(rows, extractInvoiceFact);
    },

    /**
     * @param {string} organizationId
     * @param {{ pageSize?: number, maxRows?: number|null, includeRawPayload?: boolean }} [opts]
     */
    async loadInvoiceLines(organizationId, opts = {}) {
      const rows = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.invoiceLines,
        columns: opts.includeRawPayload
          ? QB_INTELLIGENCE_SELECT.invoiceLinesWithRaw
          : QB_INTELLIGENCE_SELECT.invoiceLines,
        organizationId,
        pageSize: opts.pageSize,
        maxRows: opts.maxRows,
      });
      return toFacts(rows, extractInvoiceLineFact);
    },

    /**
     * @param {string} organizationId
     * @param {{ pageSize?: number, maxRows?: number|null }} [opts]
     */
    async loadPayments(organizationId, opts = {}) {
      const rows = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.payments,
        columns: QB_INTELLIGENCE_SELECT.payments,
        organizationId,
        pageSize: opts.pageSize,
        maxRows: opts.maxRows,
      });
      return toFacts(rows, extractPaymentFact);
    },

    /**
     * @param {string} organizationId
     * @param {{ pageSize?: number, maxRows?: number|null }} [opts]
     */
    async loadEstimates(organizationId, opts = {}) {
      const rows = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.estimates,
        columns: QB_INTELLIGENCE_SELECT.estimates,
        organizationId,
        pageSize: opts.pageSize,
        maxRows: opts.maxRows,
      });
      return toFacts(rows, extractEstimateFact);
    },

    /**
     * @param {string} organizationId
     * @param {{ pageSize?: number, maxRows?: number|null }} [opts]
     */
    async loadSalesOrders(organizationId, opts = {}) {
      const rows = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.salesOrders,
        columns: QB_INTELLIGENCE_SELECT.salesOrders,
        organizationId,
        pageSize: opts.pageSize,
        maxRows: opts.maxRows,
      });
      return toFacts(rows, extractSalesOrderFact);
    },

    /**
     * @param {string} organizationId
     * @param {{ pageSize?: number, maxRows?: number|null }} [opts]
     */
    async loadSalesReps(organizationId, opts = {}) {
      const rows = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.salesReps,
        columns: QB_INTELLIGENCE_SELECT.salesReps,
        organizationId,
        pageSize: opts.pageSize,
        maxRows: opts.maxRows,
      });
      return toFacts(rows, extractSalesRepFact);
    },

    /**
     * Load staging rows (with raw_payload where selected) and build a Phase 4A
     * sanitized dataset. Invoice lines are omitted from the dataset by default
     * (Phase 4A aggregates do not consume them); pass includeInvoiceLines to load.
     *
     * @param {string} organizationId
     * @param {{
     *   asOfDate?: string|null,
     *   pageSize?: number,
     *   maxRows?: number|null,
     *   includeInvoiceLines?: boolean,
     *   includeLineRawPayload?: boolean,
     * }} [opts]
     */
    async loadOrgCurrentDataset(organizationId, opts = {}) {
      assertOrganizationId(organizationId);
      const pageOpts = { pageSize: opts.pageSize, maxRows: opts.maxRows };

      // Sequential loads reduce peak memory / concurrent statement pressure on large orgs.
      const customers = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.customers,
        columns: QB_INTELLIGENCE_SELECT.customers,
        organizationId,
        ...pageOpts,
      });
      const invoices = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.invoices,
        columns: QB_INTELLIGENCE_SELECT.invoices,
        organizationId,
        ...pageOpts,
      });
      const payments = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.payments,
        columns: QB_INTELLIGENCE_SELECT.payments,
        organizationId,
        ...pageOpts,
      });
      const estimates = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.estimates,
        columns: QB_INTELLIGENCE_SELECT.estimates,
        organizationId,
        ...pageOpts,
      });
      const salesOrders = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.salesOrders,
        columns: QB_INTELLIGENCE_SELECT.salesOrders,
        organizationId,
        ...pageOpts,
      });
      const salesReps = await fetchOrgCurrentRows({
        table: QB_INTELLIGENCE_TABLES.salesReps,
        columns: QB_INTELLIGENCE_SELECT.salesReps,
        organizationId,
        ...pageOpts,
      });

      /** @type {object[]} */
      let invoiceLines = [];
      if (opts.includeInvoiceLines) {
        invoiceLines = await fetchOrgCurrentRows({
          table: QB_INTELLIGENCE_TABLES.invoiceLines,
          columns: opts.includeLineRawPayload
            ? QB_INTELLIGENCE_SELECT.invoiceLinesWithRaw
            : QB_INTELLIGENCE_SELECT.invoiceLines,
          organizationId,
          ...pageOpts,
        });
      }

      const dataset = buildIntelligenceDataset({
        organizationId,
        asOfDate: opts.asOfDate,
        customers,
        invoices,
        payments,
        estimates,
        salesOrders,
        salesReps,
      });

      return {
        ...dataset,
        invoiceLines: toFacts(invoiceLines, extractInvoiceLineFact),
        load_meta: {
          staging_row_counts: {
            customers: customers.length,
            invoices: invoices.length,
            payments: payments.length,
            estimates: estimates.length,
            sales_orders: salesOrders.length,
            sales_reps: salesReps.length,
            invoice_lines: invoiceLines.length,
          },
          page_size: resolveIntelligencePageSize(opts.pageSize ?? defaultPageSize),
          include_invoice_lines: Boolean(opts.includeInvoiceLines),
        },
      };
    },
  };
}
