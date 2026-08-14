import {
  extractBalanceSheetControlTotals,
  extractProfitAndLossControlTotals,
  reconcileBalanceSheetIdentity
} from "../quickbooksFinanceFoundation/reconcileReports.js";
import { QB_FINANCE_OPENING_AS_OF_DATE, QB_FINANCE_REPORT_BASIS_CANONICAL } from "../quickbooksFinanceFoundation/constants.js";
import { FINANCE_BS_SOURCE_VIEW, FINANCE_PNL_SOURCE_VIEW } from "./constants.js";
import { ratioPct, roundMoney, variance } from "./metric.js";

function normLabel(label) {
  return String(label ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isHeader(rowType) {
  const t = String(rowType ?? "").toLowerCase();
  return t === "header" || t === "section" || t === "subtitle";
}

function isTotal(rowType) {
  return String(rowType ?? "").toLowerCase() === "total";
}

/**
 * Preserve QuickBooks report order and nest Header → Data → Total when RowType is present.
 * Does not invent accounts that are not in the snapshot.
 */
export function buildReportHierarchy(lines) {
  const root = [];
  const stack = [{ node: { children: root }, kind: "root" }];

  for (const line of lines || []) {
    const node = {
      label: line.label == null ? "" : String(line.label),
      amount: roundMoney(line.amount),
      row_type: line.row_type == null ? null : String(line.row_type),
      line_order: Number.isFinite(Number(line.line_order)) ? Number(line.line_order) : null,
      children: []
    };
    if (isHeader(line.row_type)) {
      stack[stack.length - 1].node.children.push(node);
      stack.push({ node, kind: "header" });
      continue;
    }
    if (isTotal(line.row_type)) {
      stack[stack.length - 1].node.children.push(node);
      if (stack.length > 1) stack.pop();
      continue;
    }
    stack[stack.length - 1].node.children.push(node);
  }

  return root;
}

export function pnlHeadlineFromLines(lines) {
  const totals = extractProfitAndLossControlTotals(lines);
  const revenue = totals.total_income;
  const cogs = totals.total_cogs;
  let grossProfit = null;
  for (const line of lines || []) {
    const label = normLabel(line.label);
    if (label === "gross profit") {
      grossProfit = roundMoney(line.amount);
      break;
    }
  }
  if (grossProfit == null && revenue != null && cogs != null) {
    grossProfit = roundMoney(revenue - cogs);
  }
  let operatingIncome = null;
  let otherIncome = null;
  let otherExpense = null;
  for (const line of lines || []) {
    const label = normLabel(line.label);
    if (label === "net ordinary income" || label === "operating income") {
      operatingIncome = roundMoney(line.amount);
    }
    if (label === "total other income") otherIncome = roundMoney(line.amount);
    if (label === "total other expense" || label === "total other expenses") {
      otherExpense = roundMoney(line.amount);
    }
  }
  return {
    revenue: roundMoney(revenue),
    cogs: roundMoney(cogs),
    gross_profit: grossProfit,
    gross_margin_pct: ratioPct(grossProfit, revenue),
    operating_expenses: roundMoney(totals.total_expense),
    operating_income: operatingIncome,
    other_income: otherIncome,
    other_expense: otherExpense,
    net_income: roundMoney(totals.net_income)
  };
}

export function selectPnlSnapshot(snapshots, { periodStart, periodEnd }) {
  const eligible = (snapshots || []).filter(
    (s) =>
      s.report_type === "profit_and_loss" &&
      String(s.report_basis) === QB_FINANCE_REPORT_BASIS_CANONICAL &&
      s.source_view === FINANCE_PNL_SOURCE_VIEW &&
      s.is_opening !== true &&
      s.period_start === periodStart
  );
  if (!eligible.length) return null;
  const exact = eligible.filter((s) => s.period_end === periodEnd);
  const pool = exact.length ? exact : eligible.filter((s) => String(s.period_end) <= periodEnd);
  if (!pool.length) return null;
  pool.sort((a, b) => {
    const end = String(b.period_end).localeCompare(String(a.period_end));
    if (end) return end;
    return String(b.captured_at || "").localeCompare(String(a.captured_at || ""));
  });
  return pool[0];
}

export function selectBalanceSheetSnapshot(snapshots, { asOf, allowOpening = false }) {
  const eligible = (snapshots || []).filter(
    (s) =>
      s.report_type === "balance_sheet" &&
      String(s.report_basis) === QB_FINANCE_REPORT_BASIS_CANONICAL &&
      s.source_view === FINANCE_BS_SOURCE_VIEW &&
      (allowOpening || s.is_opening !== true) &&
      String(s.as_of_date || "") <= asOf
  );
  if (!eligible.length) return null;
  const exact = eligible.filter((s) => s.as_of_date === asOf);
  const pool = exact.length ? exact : eligible;
  pool.sort((a, b) => {
    const asof = String(b.as_of_date).localeCompare(String(a.as_of_date));
    if (asof) return asof;
    return String(b.captured_at || "").localeCompare(String(a.captured_at || ""));
  });
  return pool[0];
}

export function selectOpeningBalanceSheet(snapshots) {
  const eligible = (snapshots || []).filter(
    (s) =>
      s.report_type === "balance_sheet" &&
      s.is_opening === true &&
      s.as_of_date === QB_FINANCE_OPENING_AS_OF_DATE &&
      String(s.report_basis) === QB_FINANCE_REPORT_BASIS_CANONICAL
  );
  if (!eligible.length) return null;
  eligible.sort((a, b) => String(b.captured_at || "").localeCompare(String(a.captured_at || "")));
  return eligible[0];
}

export function compareStatementLines(currentLines, priorLines) {
  const priorByLabel = new Map();
  for (const line of priorLines || []) {
    const key = `${normLabel(line.label)}|${line.row_type || ""}`;
    if (!priorByLabel.has(key)) priorByLabel.set(key, line);
  }
  return (currentLines || []).map((line) => {
    const key = `${normLabel(line.label)}|${line.row_type || ""}`;
    const prior = priorByLabel.get(key);
    const priorAmount = prior ? roundMoney(prior.amount) : null;
    const currentAmount = roundMoney(line.amount);
    const v = variance(currentAmount, priorAmount);
    return {
      label: line.label == null ? "" : String(line.label),
      row_type: line.row_type == null ? null : String(line.row_type),
      line_order: Number.isFinite(Number(line.line_order)) ? Number(line.line_order) : null,
      current_amount: currentAmount,
      compare_amount: priorAmount,
      variance_amount: v.dollar,
      variance_pct: v.percent
    };
  });
}

export function balanceSheetPresentation(lines) {
  const identity = reconcileBalanceSheetIdentity(lines);
  const totals = extractBalanceSheetControlTotals(lines);
  const assets = [];
  const liabilities = [];
  const equity = [];
  let bucket = "assets";
  for (const line of lines || []) {
    const label = normLabel(line.label);
    if (label.includes("liabilities") && (isHeader(line.row_type) || label === "liabilities")) {
      bucket = "liabilities";
    } else if (label === "equity" || (label.includes("equity") && isHeader(line.row_type) && !label.includes("liabilities"))) {
      bucket = "equity";
    } else if (label === "assets" || (isHeader(line.row_type) && label.includes("asset") && !label.includes("liab"))) {
      bucket = "assets";
    }
    const row = {
      label: line.label == null ? "" : String(line.label),
      amount: roundMoney(line.amount),
      row_type: line.row_type == null ? null : String(line.row_type),
      line_order: Number.isFinite(Number(line.line_order)) ? Number(line.line_order) : null
    };
    if (bucket === "liabilities") liabilities.push(row);
    else if (bucket === "equity") equity.push(row);
    else assets.push(row);
  }
  return {
    identity,
    totals: {
      total_assets: roundMoney(totals.total_assets),
      total_liabilities_and_equity: roundMoney(totals.total_liabilities_and_equity)
    },
    assets,
    liabilities,
    equity,
    hierarchy: buildReportHierarchy(lines)
  };
}

export { QB_FINANCE_OPENING_AS_OF_DATE };
