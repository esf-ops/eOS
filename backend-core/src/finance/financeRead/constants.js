/**
 * Staff Finance Head read API — governed QuickBooks facts only.
 * Distinct from ingest (`quickbooksFinanceFoundation`) and from `quickbooks_intelligence`.
 */

export const FINANCE_HEAD_SLUG = "finance";

export const FINANCE_ALLOWED_ROLES = Object.freeze([
  "admin",
  "super_admin",
  "executive",
  "finance",
  "accounting"
]);

export const FINANCE_METRIC_STATES = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  STALE: "stale",
  WARNING: "warning"
});

export const FINANCE_PNL_PRESETS = Object.freeze([
  "current_month",
  "previous_month",
  "ytd",
  "prior_ytd"
]);

export const FINANCE_PNL_SOURCE_VIEW = "ProfitAndLossStandard";
export const FINANCE_BS_SOURCE_VIEW = "BalanceSheetStandard";

export const DEFAULT_FINANCE_STALE_AFTER_SECONDS = 4 * 60 * 60;

export const FINANCE_PAGE_SIZE = 1000;
export const FINANCE_MAX_PAGES = 20;
export const FINANCE_LIST_LIMIT = 25;
export const FINANCE_BILL_LIST_LIMIT = 50;
export const FINANCE_DUE_DATE_COVERAGE_MIN = 0.8;

export const BANK_ACCOUNT_TYPES = Object.freeze(["bank", "bank account"]);

export const FINANCE_READ_EXTRA_FORBIDDEN_KEYS = Object.freeze([
  "id",
  "snapshot_id",
  "sync_run_id",
  "organization_id",
  "source_invoice_id",
  "source_id",
  "source_composite_id",
  "edit_sequence",
  "EditSequence",
  "raw_payload",
  "ingest_token",
  "terms_list_id",
  "qb_root_customer_list_id",
  "account_id",
  "linked_txn_id",
  "linked_txn_type"
]);
