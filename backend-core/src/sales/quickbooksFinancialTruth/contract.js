/**
 * Public contract for Sales Dashboard QuickBooks Financial Truth Beta.
 */

export const QB_FINANCIAL_TRUTH_SOURCE = "quickbooks_desktop";
export const QB_FINANCIAL_TRUTH_SOURCE_ODBC = "quickbooks_desktop_odbc";

/** @typedef {"ok"|"stale"|"unavailable"|"disabled"} QuickBooksFinancialTruthStatus */

export const QB_FINANCIAL_TRUTH_STATUSES = Object.freeze({
  OK: "ok",
  STALE: "stale",
  UNAVAILABLE: "unavailable",
  DISABLED: "disabled"
});

/**
 * Open A/R basis when a live provider is connected.
 * Historical as-of end-date A/R is NOT claimed unless a supported provider
 * can compute it reliably. Default: current outstanding as of refresh.
 */
export const OPEN_AR_BASIS_AS_OF_REFRESH = "as_of_refresh";

/**
 * @param {object} [overrides]
 */
export function emptyQuickBooksFinancialTruth(overrides = {}) {
  const start = overrides?.date_range?.start_date ?? null;
  const end = overrides?.date_range?.end_date ?? null;
  return {
    status: QB_FINANCIAL_TRUTH_STATUSES.UNAVAILABLE,
    source: QB_FINANCIAL_TRUTH_SOURCE,
    refreshed_at: null,
    date_range: {
      start_date: start,
      end_date: end
    },
    estimates: { count: null, amount: null },
    sales_orders: { count: null, amount: null },
    invoices: { count: null, amount: null },
    payments: { count: null, amount: null },
    open_ar: {
      invoice_count: null,
      amount: null,
      basis: OPEN_AR_BASIS_AS_OF_REFRESH,
      basis_note:
        "Open A/R is current outstanding invoice balance as of refresh when live data is available. Historical as-of the selected end date is not computed."
    },
    warnings: [],
    diagnostics: {},
    ...overrides,
    date_range: {
      start_date: start,
      end_date: end,
      ...(overrides.date_range || {})
    }
  };
}
