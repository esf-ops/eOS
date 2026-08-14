/** Full Finance Foundation Phase 1 constants. */

export const QB_FINANCE_DOMAINS = Object.freeze([
  "master",
  "revenue_ar",
  "ap",
  "cash",
  "accounting"
]);

export const QB_FINANCE_RUN_KINDS = Object.freeze([
  "incremental",
  "window",
  "opening",
  "dry_run"
]);

export const QB_FINANCE_CHECKPOINT_STATUSES = Object.freeze([
  "pending",
  "running",
  "success",
  "failed"
]);

export const QB_FINANCE_CASH_EVENT_ROLES = Object.freeze([
  "customer_receipt",
  "bank_deposit",
  "bank_deposit_line",
  "bank_disbursement",
  "transfer",
  "undeposited_queue"
]);

export const QB_FINANCE_REPORT_BASIS_CANONICAL = "Accrual";

export const QB_FINANCE_OPENING_AS_OF_DATE = "2024-12-31";

export const QB_FINANCE_HISTORICAL_START = "2025-01-01";

export const QB_FINANCE_WORKER_VERSION_DEFAULT = "1.0.0";

export const QB_FINANCE_SYNC_MAX_ROWS = 500;

export const QB_FINANCE_SYNC_MAX_OPEN_AP = 5000;

export const QB_FINANCE_SYNC_MAX_REPORT_LINES = 2000;

export const QB_FINANCE_DEFAULT_RECON_TOLERANCE_ABS = 1;

export const QB_FINANCE_DATASETS = Object.freeze({
  accounts: {
    table: "qb_finance_accounts",
    conflict: "organization_id,qb_account_id"
  },
  vendors: {
    table: "qb_finance_vendors",
    conflict: "organization_id,qb_vendor_id"
  },
  account_balances_current: {
    table: "qb_finance_account_balances_current",
    conflict: "organization_id,qb_account_id"
  },
  payment_applications: {
    table: "qb_finance_payment_applications",
    conflict: "organization_id,receive_payment_id,applied_to_ref_id"
  },
  credit_memos: {
    table: "qb_finance_credit_memos",
    conflict: "organization_id,qb_txn_id"
  },
  sales_receipts: {
    table: "qb_finance_sales_receipts",
    conflict: "organization_id,qb_txn_id"
  },
  linked_transactions: {
    table: "qb_finance_linked_transactions",
    conflict: "organization_id,source_txn_type,source_txn_id,linked_txn_type,linked_txn_id"
  },
  bills: {
    table: "qb_finance_bills",
    conflict: "organization_id,qb_bill_id"
  },
  vendor_credits: {
    table: "qb_finance_vendor_credits",
    conflict: "organization_id,qb_txn_id"
  },
  bill_applications: {
    table: "qb_finance_bill_applications",
    conflict: "organization_id,bill_payment_id,payment_method,applied_to_ref_id"
  },
  deposits: {
    table: "qb_finance_deposits",
    conflict: "organization_id,qb_deposit_id"
  },
  deposit_line_items: {
    table: "qb_finance_deposit_line_items",
    conflict: "organization_id,qb_deposit_id,source_line_id"
  },
  checks: {
    table: "qb_finance_checks",
    conflict: "organization_id,qb_check_id"
  },
  transfers: {
    table: "qb_finance_transfers",
    conflict: "organization_id,qb_transfer_id"
  },
  cash_events: {
    table: "qb_finance_cash_events",
    conflict: "organization_id,event_role,source_txn_type,source_txn_id,source_line_id"
  },
  journal_entry_lines: {
    table: "qb_finance_journal_entry_lines",
    conflict: "organization_id,journal_entry_id,line_id"
  },
  transaction_index: {
    table: "qb_finance_transaction_index",
    conflict: "organization_id,qb_txn_id,txn_line_id"
  },
  opening_balances: {
    table: "qb_finance_opening_balances",
    conflict: "organization_id,as_of_date,report_basis,line_label"
  },
  reconciliation_results: {
    table: "qb_finance_reconciliation_results",
    conflict: null
  }
});

export const QB_FINANCE_WRITE_TABLES = Object.freeze([
  "qb_finance_sync_runs",
  "qb_finance_sync_checkpoints",
  "qb_finance_accounts",
  "qb_finance_vendors",
  "qb_finance_account_balances_current",
  "qb_finance_payment_applications",
  "qb_finance_credit_memos",
  "qb_finance_sales_receipts",
  "qb_finance_linked_transactions",
  "qb_finance_bills",
  "qb_finance_vendor_credits",
  "qb_finance_bill_applications",
  "qb_finance_open_ap_current",
  "qb_finance_deposits",
  "qb_finance_deposit_line_items",
  "qb_finance_checks",
  "qb_finance_transfers",
  "qb_finance_cash_events",
  "qb_finance_undeposited_current",
  "qb_finance_journal_entry_lines",
  "qb_finance_transaction_index",
  "qb_finance_report_snapshots",
  "qb_finance_report_lines",
  "qb_finance_opening_balances",
  "qb_finance_reconciliation_results"
]);

export const QB_FINANCE_FORBIDDEN_WRITE_TABLES = Object.freeze([
  "sales_quickbooks_financial_transactions",
  "sales_quickbooks_open_ar_current",
  "sales_quickbooks_sync_runs",
  "ad_qb_customer_facts",
  "ad_qb_customer_sync_runs",
  "ad_qb_link_suggestions",
  "account_directory_accounts",
  "account_directory_external_links",
  "customer_identity_snapshot"
]);

export const QB_FINANCE_BROWSER_FORBIDDEN_KEYS = Object.freeze([
  "qb_account_id",
  "qb_vendor_id",
  "qb_bill_id",
  "qb_txn_id",
  "qb_deposit_id",
  "qb_check_id",
  "qb_transfer_id",
  "qb_customer_list_id",
  "receive_payment_id",
  "applied_to_ref_id",
  "bill_payment_id",
  "terms_list_id",
  "parent_account_id",
  "ap_account_id",
  "deposit_to_account_id",
  "item_ref_id",
  "entity_id",
  "journal_entry_id",
  "line_id",
  "txn_line_id",
  "source_txn_id",
  "linked_txn_id",
  "bank_or_cc_account_id",
  "from_account_id",
  "to_account_id",
  "payee_id",
  "source_composite_id",
  "source_line_id"
]);
