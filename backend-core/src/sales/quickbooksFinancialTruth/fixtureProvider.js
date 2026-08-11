/**
 * Fixture provider for unit tests — never used in production unless
 * QB_FINANCIAL_TRUTH_PROVIDER=fixture is explicitly set (local/dev only).
 */

import {
  emptyQuickBooksFinancialTruth,
  OPEN_AR_BASIS_AS_OF_REFRESH,
  QB_FINANCIAL_TRUTH_STATUSES
} from "./contract.js";

/**
 * @param {object} [fixture]
 */
export function createFixtureQuickBooksFinancialTruthProvider(fixture = {}) {
  return {
    id: "fixture",
    /**
     * @param {{ startDate?: string|null, endDate?: string|null }} params
     */
    async getQuickBooksFinancialTruth({ startDate = null, endDate = null } = {}) {
      const base = emptyQuickBooksFinancialTruth({
        status: QB_FINANCIAL_TRUTH_STATUSES.OK,
        refreshed_at: fixture.refreshed_at || new Date().toISOString(),
        date_range: { start_date: startDate, end_date: endDate },
        estimates: {
          count: fixture.estimates?.count ?? 12,
          amount: fixture.estimates?.amount ?? 125000.5
        },
        sales_orders: {
          count: fixture.sales_orders?.count ?? 8,
          amount: fixture.sales_orders?.amount ?? 98000
        },
        invoices: {
          count: fixture.invoices?.count ?? 7,
          amount: fixture.invoices?.amount ?? 91000.25
        },
        payments: {
          count: fixture.payments?.count ?? 5,
          amount: fixture.payments?.amount ?? 72000
        },
        open_ar: {
          invoice_count: fixture.open_ar?.invoice_count ?? 3,
          amount: fixture.open_ar?.amount ?? 18500.75,
          basis: OPEN_AR_BASIS_AS_OF_REFRESH,
          basis_note:
            "Open A/R is current outstanding invoice balance as of refresh when live data is available. Historical as-of the selected end date is not computed."
        },
        warnings: Array.isArray(fixture.warnings) ? fixture.warnings : [],
        diagnostics: {
          provider: "fixture",
          label_sales_orders: "Sales Orders $",
          ...(fixture.diagnostics || {})
        }
      });
      return base;
    }
  };
}
