/**
 * QuickBooks report snapshots are the authoritative P&L / Balance Sheet.
 * Do not manufacture official statements by summing invoices/bills.
 */

import { QB_FINANCE_DEFAULT_RECON_TOLERANCE_ABS } from "./constants.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeLabel(label) {
  return String(label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * @param {Array<{ label?: string, amount?: number, row_type?: string }>} lines
 */
export function extractProfitAndLossControlTotals(lines) {
  const out = {
    net_income: null,
    total_income: null,
    total_cogs: null,
    total_expense: null
  };
  for (const line of lines || []) {
    const label = normalizeLabel(line.label);
    const amount = num(line.amount);
    if (amount == null) continue;
    if (label === "net income" || label === "net ordinary income") {
      if (out.net_income == null || label === "net income") out.net_income = amount;
    }
    if (label === "total income") out.total_income = amount;
    if (label === "total cogs" || label === "total cost of goods sold") out.total_cogs = amount;
    if (label === "total expense" || label === "total expenses") out.total_expense = amount;
  }
  return out;
}

/**
 * Live proof 2026-08-14: Total Assets = Total Liabilities & Equity = 9987679.41
 * @param {Array<{ label?: string, amount?: number, row_type?: string }>} lines
 */
export function extractBalanceSheetControlTotals(lines) {
  const out = {
    total_assets: null,
    total_liabilities_and_equity: null
  };
  for (const line of lines || []) {
    const label = normalizeLabel(line.label);
    const amount = num(line.amount ?? line.total);
    if (amount == null) continue;
    if (label === "total assets") out.total_assets = amount;
    if (
      label === "total liabilities & equity" ||
      label === "total liabilities and equity" ||
      label === "total liab. & equity"
    ) {
      out.total_liabilities_and_equity = amount;
    }
  }
  return out;
}

export function compareNumeric(eliteosValue, quickbooksValue, toleranceAbs = QB_FINANCE_DEFAULT_RECON_TOLERANCE_ABS) {
  const a = num(eliteosValue);
  const b = num(quickbooksValue);
  if (a == null || b == null) {
    return {
      eliteos_value: a,
      quickbooks_value: b,
      delta: null,
      tolerance_abs: toleranceAbs,
      status: "fail",
      reason: "missing_value"
    };
  }
  const delta = Math.round((a - b) * 100) / 100;
  const abs = Math.abs(delta);
  let status = "pass";
  if (abs > toleranceAbs) status = abs > toleranceAbs * 10 ? "fail" : "warn";
  return {
    eliteos_value: a,
    quickbooks_value: b,
    delta,
    tolerance_abs: toleranceAbs,
    status
  };
}

/**
 * Internal accounting identity: Total Assets ≈ Total L&E on the same Accrual BS snapshot.
 */
export function reconcileBalanceSheetIdentity(lines, toleranceAbs = QB_FINANCE_DEFAULT_RECON_TOLERANCE_ABS) {
  const totals = extractBalanceSheetControlTotals(lines);
  const compared = compareNumeric(totals.total_assets, totals.total_liabilities_and_equity, toleranceAbs);
  return {
    check_type: "balance_sheet_identity",
    report_basis: "Accrual",
    ...compared,
    notes: { totals }
  };
}

export function reconcileAgainstStoredReport({ checkType, eliteosValue, quickbooksValue, toleranceAbs }) {
  return {
    check_type: checkType,
    report_basis: "Accrual",
    ...compareNumeric(eliteosValue, quickbooksValue, toleranceAbs)
  };
}

/**
 * Forms must never be treated as official P&L.
 */
export function officialStatementSource() {
  return {
    profit_and_loss: "ProfitAndLossStandard",
    balance_sheet: "BalanceSheetStandard",
    manufactured_from_forms: false,
    canonical_basis: "Accrual"
  };
}
