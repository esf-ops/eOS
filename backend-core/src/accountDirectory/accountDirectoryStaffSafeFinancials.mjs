/**
 * Account 360 staff-safe financial allowlist.
 *
 * VIEW is granted to every Account Directory role. Owner-sensitive and
 * company-wide Finance fields must never enter the browser payload.
 */

export const ACCOUNT_360_FORBIDDEN_KEY =
  /^(qb_customer_list_id|qb_root_customer_list_id|qb_list_id|list_id|listid|external_id|externalid|source_id|source_invoice_id|terms_list_id|termslistid|qb_txn_id|txn_id|txnid|txn_line_id|entity_id|entityid|account_id|accountid|qb_account_id|qb_vendor_id|receive_payment_id|applied_to_ref_id|ingest_token|raw_payload|raw_hash|sync_run_id|net_income|gross_profit|gross_margin|contribution_margin|customer_profit|profitability|markup|cogs|job_cost|cost_basis|payroll|wages|compensation|owner_distribution|tax_|balance_sheet|profit_and_loss|cash_balance|bank_balance|line_of_credit|accounts_payable|vendor_balance)$/i;

export const ACCOUNT_360_FORBIDDEN_SENTINEL_KEYS = Object.freeze([
  "net_income",
  "gross_profit",
  "gross_margin",
  "customer_profit",
  "markup",
  "cogs",
  "job_cost",
  "payroll",
  "wages",
  "owner_distribution",
  "qb_txn_id",
  "qb_customer_list_id",
  "qb_root_customer_list_id",
  "entity_id",
  "account_id",
  "external_id",
  "source_id",
  "ingest_token",
  "raw_payload"
]);

/**
 * Strip forbidden keys recursively. Defense in depth — callers must still
 * select only staff-safe columns from mixed sources.
 * @param {unknown} value
 */
export function scrubAccount360Payload(value) {
  if (Array.isArray(value)) return value.map(scrubAccount360Payload);
  if (!value || typeof value !== "object") return value;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (ACCOUNT_360_FORBIDDEN_KEY.test(k)) continue;
    out[k] = scrubAccount360Payload(v);
  }
  return out;
}

/**
 * @param {unknown} payload
 */
export function payloadContainsForbiddenFinance(payload) {
  const json = JSON.stringify(payload);
  return /net_income|gross_profit|gross_margin|customer_profit|total_assets|balance_sheet|profit_and_loss|payroll|owner_distribution|job_cost|cost_basis|company_revenue|customer_concentration/i.test(
    json
  );
}
