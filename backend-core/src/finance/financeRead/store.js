import { QB_FINANCE_DOMAINS } from "../quickbooksFinanceFoundation/constants.js";
import { FINANCE_MAX_PAGES, FINANCE_PAGE_SIZE } from "./constants.js";

function isMissingRelation(error) {
  const msg = String(error?.message ?? error ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  if (msg.includes("schema cache") && msg.includes("not find")) return true;
  if (msg.includes("does not exist")) return true;
  return false;
}

export function storeError(error, table) {
  if (!error) return null;
  if (isMissingRelation(error)) {
    return { code: "store_unavailable", table, message: "Finance store is not available yet." };
  }
  return { code: "store_error", table, message: "Finance store read failed." };
}

async function runSelect(query) {
  const { data, error } = await query;
  return { data: data || [], error };
}

export async function pageRows(buildQuery, { pageSize = FINANCE_PAGE_SIZE, maxPages = FINANCE_MAX_PAGES } = {}) {
  const rows = [];
  let truncated = false;
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) return { rows, error, truncated };
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) return { rows, error: null, truncated };
  }
  truncated = true;
  return { rows, error: null, truncated };
}

export function createFinanceReadStore(supabase) {
  return {
    async loadReportSnapshots(organizationId, reportType) {
      let q = supabase
        .from("qb_finance_report_snapshots")
        .select(
          "id, report_type, source_view, report_basis, period_start, period_end, as_of_date, is_opening, control_totals, captured_at"
        )
        .eq("organization_id", organizationId)
        .eq("report_basis", "Accrual")
        .order("captured_at", { ascending: false })
        .limit(200);
      if (reportType) q = q.eq("report_type", reportType);
      const { data, error } = await runSelect(q);
      return { rows: data, error: storeError(error, "qb_finance_report_snapshots") };
    },

    async loadReportLines(organizationId, snapshotId) {
      if (!snapshotId) return { rows: [], error: null };
      const { data, error } = await runSelect(
        supabase
          .from("qb_finance_report_lines")
          .select("line_order, label, amount, row_type")
          .eq("organization_id", organizationId)
          .eq("snapshot_id", snapshotId)
          .order("line_order", { ascending: true })
          .limit(2000)
      );
      return { rows: data, error: storeError(error, "qb_finance_report_lines") };
    },

    async loadLatestSyncRuns(organizationId) {
      const { data, error } = await runSelect(
        supabase
          .from("qb_finance_sync_runs")
          .select(
            "domain, run_kind, status, started_at, completed_at, coverage_start_date, coverage_end_date, warnings, error_summary, report_basis"
          )
          .eq("organization_id", organizationId)
          .order("started_at", { ascending: false })
          .limit(80)
      );
      if (error) return { rows: [], error: storeError(error, "qb_finance_sync_runs") };
      const latest = {};
      for (const domain of QB_FINANCE_DOMAINS) {
        latest[domain] = (data || []).find((r) => r.domain === domain) || null;
      }
      return { rows: latest, error: null };
    },

    async loadReconciliationResults(organizationId) {
      const { data, error } = await runSelect(
        supabase
          .from("qb_finance_reconciliation_results")
          .select(
            "check_type, report_basis, period_start, period_end, as_of_date, eliteos_value, quickbooks_value, delta, tolerance_abs, status, created_at"
          )
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(40)
      );
      return { rows: data, error: storeError(error, "qb_finance_reconciliation_results") };
    },

    async loadOpenAr(organizationId) {
      const result = await pageRows((from, to) =>
        supabase
          .from("sales_quickbooks_open_ar_current")
          .select("customer_name, balance, due_date, invoice_date, reference_number, original_amount, synced_at")
          .eq("organization_id", organizationId)
          .order("balance", { ascending: false })
          .range(from, to)
      );
      return { rows: result.rows, error: storeError(result.error, "sales_quickbooks_open_ar_current"), truncated: result.truncated };
    },

    async loadPaymentApplications(organizationId) {
      const { data, error } = await runSelect(
        supabase
          .from("qb_finance_payment_applications")
          .select(
            "applied_amount, applied_payment_amount, applied_txn_type, applied_txn_date, applied_reference_number, payment_date, customer_name"
          )
          .eq("organization_id", organizationId)
          .order("payment_date", { ascending: false })
          .limit(40)
      );
      return { rows: data, error: storeError(error, "qb_finance_payment_applications") };
    },

    async loadOpenAp(organizationId) {
      const result = await pageRows((from, to) =>
        supabase
          .from("qb_finance_open_ap_current")
          .select(
            "reference_number, bill_date, due_date, terms_name, vendor_name, original_amount, open_amount, synced_at"
          )
          .eq("organization_id", organizationId)
          .order("open_amount", { ascending: false })
          .range(from, to)
      );
      return { rows: result.rows, error: storeError(result.error, "qb_finance_open_ap_current"), truncated: result.truncated };
    },

    async loadBills(organizationId) {
      const { data, error } = await runSelect(
        supabase
          .from("qb_finance_bills")
          .select(
            "reference_number, txn_date, due_date, terms_name, vendor_name, amount, open_amount, is_paid, ap_account_name, memo"
          )
          .eq("organization_id", organizationId)
          .order("txn_date", { ascending: false })
          .limit(80)
      );
      return { rows: data, error: storeError(error, "qb_finance_bills") };
    },

    async loadBillApplications(organizationId) {
      const { data, error } = await runSelect(
        supabase
          .from("qb_finance_bill_applications")
          .select(
            "payment_method, applied_amount, applied_balance_remaining, applied_reference_number, applied_txn_date, applied_txn_type, payment_date, vendor_name, bank_or_cc_account_name"
          )
          .eq("organization_id", organizationId)
          .order("payment_date", { ascending: false })
          .limit(40)
      );
      return { rows: data, error: storeError(error, "qb_finance_bill_applications") };
    },

    async loadCashEvents(organizationId) {
      const result = await pageRows((from, to) =>
        supabase
          .from("qb_finance_cash_events")
          .select(
            "event_role, source_txn_type, source_txn_id, txn_date, amount, account_name, memo, linked_txn_type, linked_txn_id"
          )
          .eq("organization_id", organizationId)
          .order("txn_date", { ascending: false })
          .range(from, to)
      );
      return { rows: result.rows, error: storeError(result.error, "qb_finance_cash_events"), truncated: result.truncated };
    },

    async loadDeposits(organizationId) {
      const { data, error } = await runSelect(
        supabase
          .from("qb_finance_deposits")
          .select("txn_date, deposit_to_account_name, total_deposit, memo")
          .eq("organization_id", organizationId)
          .order("txn_date", { ascending: false })
          .limit(25)
      );
      return { rows: data, error: storeError(error, "qb_finance_deposits") };
    },

    async loadChecks(organizationId) {
      const { data, error } = await runSelect(
        supabase
          .from("qb_finance_checks")
          .select("reference_number, txn_date, payee_name, bank_account_name, amount, memo")
          .eq("organization_id", organizationId)
          .order("txn_date", { ascending: false })
          .limit(25)
      );
      return { rows: data, error: storeError(error, "qb_finance_checks") };
    },

    async loadTransfers(organizationId) {
      const { data, error } = await runSelect(
        supabase
          .from("qb_finance_transfers")
          .select("txn_date, from_account_name, to_account_name, amount, memo")
          .eq("organization_id", organizationId)
          .order("txn_date", { ascending: false })
          .limit(25)
      );
      return { rows: data, error: storeError(error, "qb_finance_transfers") };
    },

    async loadAccountBalances(organizationId) {
      const { data, error } = await runSelect(
        supabase
          .from("qb_finance_account_balances_current")
          .select("account_name, account_type, balance, account_balance, as_of_captured_at")
          .eq("organization_id", organizationId)
          .limit(500)
      );
      return { rows: data, error: storeError(error, "qb_finance_account_balances_current") };
    },

    async loadUndeposited(organizationId) {
      const { data, error } = await runSelect(
        supabase
          .from("qb_finance_undeposited_current")
          .select("txn_type, txn_date, customer_name, amount, reference_number")
          .eq("organization_id", organizationId)
          .limit(200)
      );
      return { rows: data, error: storeError(error, "qb_finance_undeposited_current") };
    }
  };
}
