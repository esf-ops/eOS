/**
 * Validate Full Finance Foundation ingest payloads.
 */

import {
  QB_FINANCE_DOMAINS,
  QB_FINANCE_RUN_KINDS,
  QB_FINANCE_CHECKPOINT_STATUSES,
  QB_FINANCE_DATASETS,
  QB_FINANCE_SYNC_MAX_ROWS,
  QB_FINANCE_SYNC_MAX_OPEN_AP,
  QB_FINANCE_SYNC_MAX_REPORT_LINES,
  QB_FINANCE_WORKER_VERSION_DEFAULT,
  QB_FINANCE_REPORT_BASIS_CANONICAL,
  QB_FINANCE_OPENING_AS_OF_DATE,
  QB_FINANCE_CASH_EVENT_ROLES
} from "./constants.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(v) {
  return UUID_RE.test(String(v ?? "").trim());
}

export function isYmd(v) {
  return YMD_RE.test(String(v ?? "").trim());
}

export function toNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function pickStr(v, max = 500) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function pickBool(v) {
  if (v === true || v === false) return v;
  if (v == null || v === "") return null;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  return null;
}

function requireOrgRun(body, errors) {
  const organizationId = pickStr(body?.organization_id, 64);
  const syncRunId = pickStr(body?.sync_run_id, 64);
  if (!isUuid(organizationId)) errors.push("organization_id must be a uuid");
  if (!isUuid(syncRunId)) errors.push("sync_run_id must be a uuid");
  return { organizationId, syncRunId };
}

export function validateBeginPayload(body) {
  const errors = [];
  const organizationId = pickStr(body?.organization_id, 64);
  if (!isUuid(organizationId)) errors.push("organization_id must be a uuid");
  const domain = pickStr(body?.domain, 32);
  if (!QB_FINANCE_DOMAINS.includes(domain || "")) errors.push("domain invalid");
  const runKind = pickStr(body?.run_kind, 32) || "incremental";
  if (!QB_FINANCE_RUN_KINDS.includes(runKind)) errors.push("run_kind invalid");
  const coverageStart = pickStr(body?.coverage_start_date, 16);
  const coverageEnd = pickStr(body?.coverage_end_date, 16);
  if (coverageStart && !isYmd(coverageStart)) errors.push("coverage_start_date must be YYYY-MM-DD");
  if (coverageEnd && !isYmd(coverageEnd)) errors.push("coverage_end_date must be YYYY-MM-DD");
  const reportBasis = pickStr(body?.report_basis, 32) || QB_FINANCE_REPORT_BASIS_CANONICAL;
  if (reportBasis !== "Accrual" && reportBasis !== "Cash") {
    errors.push("report_basis must be Accrual or Cash");
  }
  if (runKind === "opening") {
    const asOf = coverageEnd || coverageStart;
    if (asOf && asOf !== QB_FINANCE_OPENING_AS_OF_DATE) {
      errors.push(`opening run must use as-of ${QB_FINANCE_OPENING_AS_OF_DATE}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    value: {
      organizationId,
      domain,
      runKind,
      workerVersion: pickStr(body?.worker_version, 64) || QB_FINANCE_WORKER_VERSION_DEFAULT,
      companyName: pickStr(body?.company_name, 200),
      coverageStartDate: coverageStart,
      coverageEndDate: coverageEnd,
      reportBasis
    }
  };
}

export function validateCheckpointPayload(body) {
  const errors = [];
  const { organizationId, syncRunId } = requireOrgRun(body, errors);
  const domain = pickStr(body?.domain, 32);
  const dataset = pickStr(body?.dataset, 80);
  if (!QB_FINANCE_DOMAINS.includes(domain || "")) errors.push("domain invalid");
  if (!dataset) errors.push("dataset required");
  const periodStart = pickStr(body?.period_start, 16);
  const periodEnd = pickStr(body?.period_end, 16);
  if (!isYmd(periodStart)) errors.push("period_start must be YYYY-MM-DD");
  if (!isYmd(periodEnd)) errors.push("period_end must be YYYY-MM-DD");
  const status = pickStr(body?.status, 32);
  if (!QB_FINANCE_CHECKPOINT_STATUSES.includes(status || "")) errors.push("status invalid");
  return {
    ok: errors.length === 0,
    errors,
    value: {
      organizationId,
      syncRunId,
      domain,
      dataset,
      periodStart,
      periodEnd,
      status,
      rowCount: toNumber(body?.row_count),
      sourceCount: toNumber(body?.source_count),
      warningCount: toNumber(body?.warning_count) || 0,
      errorSummary: pickStr(body?.error_summary, 500)
    }
  };
}

function stamp(organizationId) {
  const now = new Date().toISOString();
  return { organization_id: organizationId, synced_at: now, updated_at: now };
}

function mapAccounts(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const qbAccountId = pickStr(r.qb_account_id ?? r.ID ?? r.Id, 200);
    if (!qbAccountId) {
      errors.push(`rows[${i}].qb_account_id required`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      qb_account_id: qbAccountId,
      name: pickStr(r.name ?? r.Name, 300),
      full_name: pickStr(r.full_name ?? r.FullName, 500),
      account_number: pickStr(r.account_number ?? r.Number, 80),
      account_type: pickStr(r.account_type ?? r.Type, 80),
      special_type: pickStr(r.special_type ?? r.SpecialType, 80),
      parent_account_id: pickStr(r.parent_account_id ?? r.ParentId, 200),
      parent_account_name: pickStr(r.parent_account_name ?? r.ParentName, 300),
      cash_flow_classification: pickStr(r.cash_flow_classification ?? r.CashFlowClassification, 80),
      is_active: pickBool(r.is_active ?? r.IsActive),
      current_balance: toNumber(r.current_balance ?? r.Balance),
      account_balance: toNumber(r.account_balance ?? r.AccountBalance),
      time_modified: pickStr(r.time_modified ?? r.TimeModified, 40)
    });
  }
  return out;
}

function mapVendors(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const qbVendorId = pickStr(r.qb_vendor_id ?? r.ID ?? r.Id, 200);
    if (!qbVendorId) {
      errors.push(`rows[${i}].qb_vendor_id required`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      qb_vendor_id: qbVendorId,
      name: pickStr(r.name ?? r.Name, 300),
      company_name: pickStr(r.company_name ?? r.CompanyName, 300),
      vendor_type_name: pickStr(r.vendor_type_name ?? r.VendorType, 200),
      is_active: pickBool(r.is_active ?? r.IsActive),
      account_number: pickStr(r.account_number ?? r.AccountNumber, 80),
      time_modified: pickStr(r.time_modified ?? r.TimeModified, 40)
    });
  }
  return out;
}

function mapPaymentApplications(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const receivePaymentId = pickStr(r.receive_payment_id ?? r.ReceivePaymentId, 200);
    const appliedToRefId = pickStr(r.applied_to_ref_id ?? r.AppliedToRefId, 200);
    if (!receivePaymentId || !appliedToRefId) {
      errors.push(`rows[${i}] receive_payment_id and applied_to_ref_id required`);
      continue;
    }
    const paymentDate = pickStr(r.payment_date ?? r.Date, 16);
    if (paymentDate && !isYmd(paymentDate)) {
      errors.push(`rows[${i}].payment_date must be YYYY-MM-DD`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      receive_payment_id: receivePaymentId,
      applied_to_ref_id: appliedToRefId,
      applied_amount: toNumber(r.applied_amount ?? r.AppliedToAmount),
      applied_payment_amount: toNumber(r.applied_payment_amount ?? r.AppliedToPaymentAmount),
      applied_txn_type: pickStr(r.applied_txn_type ?? r.AppliedToTxnType, 80),
      applied_txn_date: pickStr(r.applied_txn_date ?? r.AppliedToTxnDate, 16),
      applied_reference_number: pickStr(r.applied_reference_number ?? r.AppliedToReferenceNumber, 80),
      payment_date: paymentDate,
      qb_customer_list_id: pickStr(r.qb_customer_list_id ?? r.CustomerId, 200),
      customer_name: pickStr(r.customer_name ?? r.CustomerName, 300),
      time_modified: pickStr(r.time_modified ?? r.TimeModified, 40),
      source_composite_id: pickStr(r.source_composite_id ?? r.ID, 255)
    });
  }
  return out;
}

function mapSimpleTxn(organizationId, rows, errors, idKeys) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const qbTxnId = pickStr(idKeys.map((k) => r[k]).find(Boolean), 200);
    const txnDate = pickStr(r.txn_date ?? r.Date, 16);
    if (!qbTxnId) {
      errors.push(`rows[${i}].qb_txn_id required`);
      continue;
    }
    if (txnDate && !isYmd(txnDate)) {
      errors.push(`rows[${i}].txn_date must be YYYY-MM-DD`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      qb_txn_id: qbTxnId,
      reference_number: pickStr(r.reference_number ?? r.ReferenceNumber, 80),
      txn_date: txnDate,
      qb_customer_list_id: pickStr(r.qb_customer_list_id ?? r.CustomerId, 200),
      customer_name: pickStr(r.customer_name ?? r.CustomerName, 300),
      amount: toNumber(r.amount ?? r.Amount ?? r.TotalAmount),
      open_amount: toNumber(r.open_amount ?? r.OpenAmount),
      memo: pickStr(r.memo ?? r.Memo, 2000),
      time_modified: pickStr(r.time_modified ?? r.TimeModified, 40),
      deposit_to_account_id: pickStr(r.deposit_to_account_id ?? r.DepositToAccountId, 200),
      deposit_to_account_name: pickStr(r.deposit_to_account_name ?? r.DepositToAccount, 300)
    });
  }
  return out;
}

function mapBills(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const qbBillId = pickStr(r.qb_bill_id ?? r.ID ?? r.Id, 200);
    const txnDate = pickStr(r.txn_date ?? r.Date, 16);
    if (!qbBillId) {
      errors.push(`rows[${i}].qb_bill_id required`);
      continue;
    }
    if (txnDate && !isYmd(txnDate)) {
      errors.push(`rows[${i}].txn_date must be YYYY-MM-DD`);
      continue;
    }
    const dueDate = pickStr(r.due_date ?? r.DueDate, 16);
    if (dueDate && !isYmd(dueDate)) {
      errors.push(`rows[${i}].due_date must be YYYY-MM-DD`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      qb_bill_id: qbBillId,
      reference_number: pickStr(r.reference_number ?? r.ReferenceNumber, 80),
      txn_date: txnDate,
      due_date: dueDate,
      terms_name: pickStr(r.terms_name ?? r.Terms, 200),
      terms_list_id: pickStr(r.terms_list_id ?? r.TermsId, 200),
      qb_vendor_id: pickStr(r.qb_vendor_id ?? r.VendorId, 200),
      vendor_name: pickStr(r.vendor_name ?? r.VendorName, 300),
      amount: toNumber(r.amount ?? r.Amount),
      open_amount: toNumber(r.open_amount ?? r.OpenAmount),
      is_paid: pickBool(r.is_paid ?? r.IsPaid),
      ap_account_id: pickStr(r.ap_account_id ?? r.AccountsPayableId, 200),
      ap_account_name: pickStr(r.ap_account_name ?? r.AccountsPayable, 300),
      memo: pickStr(r.memo ?? r.Memo, 2000),
      time_created: pickStr(r.time_created ?? r.TimeCreated, 40),
      time_modified: pickStr(r.time_modified ?? r.TimeModified, 40)
    });
  }
  return out;
}

function mapBillApplications(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const billPaymentId = pickStr(r.bill_payment_id ?? r.BillPaymentId, 200);
    const appliedToRefId = pickStr(r.applied_to_ref_id ?? r.AppliedToRefId, 200);
    let paymentMethod = pickStr(r.payment_method, 32);
    if (!paymentMethod) {
      paymentMethod = String(r.source_table || "").includes("CreditCard") ? "credit_card" : "check";
    }
    if (!billPaymentId || !appliedToRefId) {
      errors.push(`rows[${i}] bill_payment_id and applied_to_ref_id required`);
      continue;
    }
    if (!["check", "credit_card"].includes(paymentMethod)) {
      errors.push(`rows[${i}].payment_method invalid`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      bill_payment_id: billPaymentId,
      payment_method: paymentMethod,
      applied_to_ref_id: appliedToRefId,
      applied_amount: toNumber(r.applied_amount ?? r.AppliedToAmount ?? r.AppliedToPaymentAmount),
      applied_balance_remaining: toNumber(r.applied_balance_remaining ?? r.AppliedToBalanceRemaining),
      applied_reference_number: pickStr(r.applied_reference_number ?? r.AppliedToReferenceNumber, 80),
      applied_txn_date: pickStr(r.applied_txn_date ?? r.AppliedToTxnDate, 16),
      applied_txn_type: pickStr(r.applied_txn_type ?? r.AppliedToTxnType, 80),
      payment_date: pickStr(r.payment_date ?? r.Date, 16),
      qb_vendor_id: pickStr(r.qb_vendor_id ?? r.PayeeId, 200),
      vendor_name: pickStr(r.vendor_name ?? r.PayeeName, 300),
      bank_or_cc_account_id: pickStr(r.bank_or_cc_account_id ?? r.BankAccountId ?? r.CreditCardAccountId, 200),
      bank_or_cc_account_name: pickStr(r.bank_or_cc_account_name ?? r.BankAccountName ?? r.CreditCardAccountName, 300),
      time_modified: pickStr(r.time_modified ?? r.TimeModified, 40),
      source_composite_id: pickStr(r.source_composite_id ?? r.ID, 255)
    });
  }
  return out;
}

function mapDeposits(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const qbDepositId = pickStr(r.qb_deposit_id ?? r.ID ?? r.Id, 200);
    const txnDate = pickStr(r.txn_date ?? r.Date, 16);
    if (!qbDepositId) {
      errors.push(`rows[${i}].qb_deposit_id required`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      qb_deposit_id: qbDepositId,
      txn_date: txnDate,
      deposit_to_account_id: pickStr(r.deposit_to_account_id ?? r.DepositToAccountId, 200),
      deposit_to_account_name: pickStr(r.deposit_to_account_name ?? r.DepositToAccount, 300),
      total_deposit: toNumber(r.total_deposit ?? r.TotalDeposit),
      memo: pickStr(r.memo ?? r.Memo, 2000),
      time_created: pickStr(r.time_created ?? r.TimeCreated, 40),
      time_modified: pickStr(r.time_modified ?? r.TimeModified, 40)
    });
  }
  return out;
}

function mapDepositLines(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const qbDepositId = pickStr(r.qb_deposit_id ?? r.DepositId, 200);
    const itemRefId = pickStr(r.item_ref_id ?? r.ItemRefId, 200) || "";
    const itemTxnType = pickStr(r.item_txn_type ?? r.ItemTxnType, 80) || "";
    const sourceLineId =
      pickStr(r.source_line_id ?? r.ID, 255) || `${qbDepositId}|${itemTxnType}|${itemRefId}|${i}`;
    if (!qbDepositId) {
      errors.push(`rows[${i}].qb_deposit_id required`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      qb_deposit_id: qbDepositId,
      source_line_id: sourceLineId,
      total_deposit: toNumber(r.total_deposit ?? r.TotalDeposit),
      item_amount: toNumber(r.item_amount ?? r.ItemAmount),
      item_txn_type: itemTxnType || null,
      item_ref_id: itemRefId || null,
      entity_name: pickStr(r.entity_name ?? r.EntityName ?? r.ReceivedFrom, 300),
      entity_id: pickStr(r.entity_id ?? r.EntityId, 200),
      payment_method_name: pickStr(r.payment_method_name ?? r.PaymentMethod, 120)
    });
  }
  return out;
}

function mapChecks(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const qbCheckId = pickStr(r.qb_check_id ?? r.ID ?? r.Id, 200);
    if (!qbCheckId) {
      errors.push(`rows[${i}].qb_check_id required`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      qb_check_id: qbCheckId,
      reference_number: pickStr(r.reference_number ?? r.ReferenceNumber, 80),
      txn_date: pickStr(r.txn_date ?? r.Date, 16),
      payee_name: pickStr(r.payee_name ?? r.PayeeName ?? r.Payee, 300),
      payee_id: pickStr(r.payee_id ?? r.PayeeId, 200),
      bank_account_id: pickStr(r.bank_account_id ?? r.AccountId ?? r.BankAccountId, 200),
      bank_account_name: pickStr(r.bank_account_name ?? r.Account ?? r.BankAccountName, 300),
      amount: toNumber(r.amount ?? r.Amount),
      memo: pickStr(r.memo ?? r.Memo, 2000),
      time_modified: pickStr(r.time_modified ?? r.TimeModified, 40)
    });
  }
  return out;
}

function mapTransfers(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const qbTransferId = pickStr(r.qb_transfer_id, 200);
    if (!qbTransferId) {
      errors.push(`rows[${i}].qb_transfer_id required`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      qb_transfer_id: qbTransferId,
      txn_date: pickStr(r.txn_date, 16),
      from_account_id: pickStr(r.from_account_id, 200),
      from_account_name: pickStr(r.from_account_name, 300),
      to_account_id: pickStr(r.to_account_id, 200),
      to_account_name: pickStr(r.to_account_name, 300),
      amount: toNumber(r.amount),
      memo: pickStr(r.memo, 2000),
      time_created: pickStr(r.time_created, 40),
      time_modified: pickStr(r.time_modified, 40)
    });
  }
  return out;
}

function mapCashEvents(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const eventRole = pickStr(r.event_role, 40);
    const sourceTxnType = pickStr(r.source_txn_type, 80);
    const sourceTxnId = pickStr(r.source_txn_id, 200);
    if (!QB_FINANCE_CASH_EVENT_ROLES.includes(eventRole || "")) {
      errors.push(`rows[${i}].event_role invalid`);
      continue;
    }
    if (!sourceTxnType || !sourceTxnId) {
      errors.push(`rows[${i}] source_txn_type and source_txn_id required`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      event_role: eventRole,
      source_txn_type: sourceTxnType,
      source_txn_id: sourceTxnId,
      source_line_id: pickStr(r.source_line_id, 255) || "",
      txn_date: pickStr(r.txn_date, 16),
      amount: toNumber(r.amount),
      account_id: pickStr(r.account_id, 200),
      account_name: pickStr(r.account_name, 300),
      linked_txn_type: pickStr(r.linked_txn_type, 80),
      linked_txn_id: pickStr(r.linked_txn_id, 200),
      memo: pickStr(r.memo, 2000)
    });
  }
  return out;
}

function mapJournalLines(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const journalEntryId = pickStr(r.journal_entry_id ?? r.JournalEntryID ?? r.JournalEntryId, 200);
    const lineId = pickStr(r.line_id ?? r.LineId, 200);
    if (!journalEntryId || !lineId) {
      errors.push(`rows[${i}] journal_entry_id and line_id required`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      journal_entry_id: journalEntryId,
      line_id: lineId,
      line_type: pickStr(r.line_type ?? r.LineType, 80),
      txn_date: pickStr(r.txn_date ?? r.Date, 16),
      line_account_id: pickStr(r.line_account_id ?? r.LineAccountId, 200),
      line_account_name: pickStr(r.line_account_name ?? r.LineAccount, 300),
      line_amount: toNumber(r.line_amount ?? r.LineAmount),
      entity_name: pickStr(r.entity_name ?? r.EntityName, 300),
      entity_id: pickStr(r.entity_id ?? r.EntityId, 200),
      memo: pickStr(r.memo ?? r.Memo ?? r.LineMemo, 2000),
      class_name: pickStr(r.class_name ?? r.Class, 200),
      time_modified: pickStr(r.time_modified ?? r.TimeModified, 40)
    });
  }
  return out;
}

function mapTransactionIndex(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const qbTxnId = pickStr(r.qb_txn_id ?? r.ID ?? r.Id, 200);
    if (!qbTxnId) {
      errors.push(`rows[${i}].qb_txn_id required`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      qb_txn_id: qbTxnId,
      txn_line_id: pickStr(r.txn_line_id ?? r.TxnLineId, 200) || "",
      txn_type: pickStr(r.txn_type ?? r.Type, 80),
      txn_date: pickStr(r.txn_date ?? r.Date, 16),
      entity_name: pickStr(r.entity_name ?? r.Entity, 300),
      entity_id: pickStr(r.entity_id ?? r.EntityId, 200),
      account_name: pickStr(r.account_name ?? r.AccountName, 300),
      account_id: pickStr(r.account_id ?? r.AccountId, 200),
      reference_number: pickStr(r.reference_number ?? r.ReferenceNumber, 80),
      amount: toNumber(r.amount ?? r.Amount),
      amount_in_home_currency: toNumber(r.amount_in_home_currency ?? r.AmountInHomeCurrency),
      memo: pickStr(r.memo ?? r.Memo, 2000),
      time_modified: pickStr(r.time_modified ?? r.TimeModified, 40)
    });
  }
  return out;
}

function mapLinked(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const sourceTxnType = pickStr(r.source_txn_type, 80);
    const sourceTxnId = pickStr(r.source_txn_id, 200);
    const linkedTxnType = pickStr(r.linked_txn_type ?? r.LinkedTxnType, 80);
    const linkedTxnId = pickStr(r.linked_txn_id ?? r.LinkedTxnId, 200);
    if (!sourceTxnType || !sourceTxnId || !linkedTxnType || !linkedTxnId) {
      errors.push(`rows[${i}] linked transaction keys required`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      source_txn_type: sourceTxnType,
      source_txn_id: sourceTxnId,
      linked_txn_type: linkedTxnType,
      linked_txn_id: linkedTxnId,
      linked_amount: toNumber(r.linked_amount ?? r.LinkedTxnAmount)
    });
  }
  return out;
}

function mapOpening(organizationId, rows, errors) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const asOf = pickStr(r.as_of_date, 16) || QB_FINANCE_OPENING_AS_OF_DATE;
    const lineLabel = pickStr(r.line_label ?? r.Label, 500);
    if (!lineLabel) {
      errors.push(`rows[${i}].line_label required`);
      continue;
    }
    if (asOf !== QB_FINANCE_OPENING_AS_OF_DATE) {
      errors.push(`rows[${i}].as_of_date must be ${QB_FINANCE_OPENING_AS_OF_DATE}`);
      continue;
    }
    out.push({
      ...stamp(organizationId),
      as_of_date: asOf,
      report_basis: pickStr(r.report_basis, 32) || QB_FINANCE_REPORT_BASIS_CANONICAL,
      line_label: lineLabel,
      amount: toNumber(r.amount ?? r.Total),
      row_type: pickStr(r.row_type ?? r.RowType, 80),
      qb_account_id: pickStr(r.qb_account_id, 200),
      snapshot_id: pickStr(r.snapshot_id, 64)
    });
  }
  return out;
}

const MAPPERS = {
  accounts: mapAccounts,
  vendors: mapVendors,
  account_balances_current: (org, rows, errors) =>
    mapAccounts(org, rows, errors).map((a) => ({
      organization_id: a.organization_id,
      qb_account_id: a.qb_account_id,
      account_name: a.name,
      account_type: a.account_type,
      balance: a.current_balance,
      account_balance: a.account_balance,
      synced_at: a.synced_at,
      updated_at: a.updated_at
    })),
  payment_applications: mapPaymentApplications,
  credit_memos: (org, rows, errors) =>
    mapSimpleTxn(org, rows, errors, ["qb_txn_id", "ID", "Id"]).map((r) => {
      const { deposit_to_account_id, deposit_to_account_name, ...rest } = r;
      return rest;
    }),
  sales_receipts: (org, rows, errors) => mapSimpleTxn(org, rows, errors, ["qb_txn_id", "ID", "Id"]),
  linked_transactions: mapLinked,
  bills: mapBills,
  vendor_credits: (org, rows, errors) =>
    mapBills(org, rows, errors).map((b) => ({
      organization_id: b.organization_id,
      qb_txn_id: b.qb_bill_id,
      reference_number: b.reference_number,
      txn_date: b.txn_date,
      qb_vendor_id: b.qb_vendor_id,
      vendor_name: b.vendor_name,
      amount: b.amount,
      memo: b.memo,
      time_modified: b.time_modified,
      synced_at: b.synced_at,
      updated_at: b.updated_at
    })),
  bill_applications: mapBillApplications,
  deposits: mapDeposits,
  deposit_line_items: mapDepositLines,
  checks: mapChecks,
  transfers: mapTransfers,
  cash_events: mapCashEvents,
  journal_entry_lines: mapJournalLines,
  transaction_index: mapTransactionIndex,
  opening_balances: mapOpening
};

export function validateUpsertPayload(body) {
  const errors = [];
  const { organizationId, syncRunId } = requireOrgRun(body, errors);
  const dataset = pickStr(body?.dataset, 80);
  if (!dataset || !QB_FINANCE_DATASETS[dataset] || !MAPPERS[dataset]) {
    errors.push("dataset invalid");
  }
  const rowsIn = Array.isArray(body?.rows) ? body.rows : null;
  if (!rowsIn) errors.push("rows must be an array");
  if (rowsIn && rowsIn.length > QB_FINANCE_SYNC_MAX_ROWS) {
    errors.push(`rows exceeds max ${QB_FINANCE_SYNC_MAX_ROWS}`);
  }
  let rows = [];
  if (rowsIn && dataset && MAPPERS[dataset]) {
    rows = MAPPERS[dataset](organizationId, rowsIn, errors);
  }
  return {
    ok: errors.length === 0,
    errors,
    value: { organizationId, syncRunId, dataset, rows }
  };
}

export function validateOpenApReplacePayload(body) {
  const errors = [];
  const { organizationId, syncRunId } = requireOrgRun(body, errors);
  const rowsIn = Array.isArray(body?.open_ap) ? body.open_ap : null;
  if (!rowsIn) errors.push("open_ap must be an array");
  if (rowsIn && rowsIn.length > QB_FINANCE_SYNC_MAX_OPEN_AP) {
    errors.push(`open_ap exceeds max ${QB_FINANCE_SYNC_MAX_OPEN_AP}`);
  }
  const allowEmpty = Boolean(body?.allow_empty_open_ap);
  const openAp = [];
  if (rowsIn) {
    for (let i = 0; i < rowsIn.length; i += 1) {
      const r = rowsIn[i];
      const qbBillId = pickStr(r.qb_bill_id ?? r.ID ?? r.Id, 200);
      const openAmount = toNumber(r.open_amount ?? r.OpenAmount);
      if (!qbBillId) {
        errors.push(`open_ap[${i}].qb_bill_id required`);
        continue;
      }
      if (openAmount == null || openAmount <= 0) {
        errors.push(`open_ap[${i}].open_amount must be a positive number`);
        continue;
      }
      openAp.push({
        ...stamp(organizationId),
        qb_bill_id: qbBillId,
        reference_number: pickStr(r.reference_number ?? r.ReferenceNumber, 80),
        bill_date: pickStr(r.bill_date ?? r.Date, 16),
        due_date: pickStr(r.due_date ?? r.DueDate, 16),
        terms_name: pickStr(r.terms_name ?? r.Terms, 200),
        terms_list_id: pickStr(r.terms_list_id ?? r.TermsId, 200),
        qb_vendor_id: pickStr(r.qb_vendor_id ?? r.VendorId, 200),
        vendor_name: pickStr(r.vendor_name ?? r.VendorName, 300),
        original_amount: toNumber(r.original_amount ?? r.Amount),
        open_amount: openAmount
      });
    }
  }
  if (errors.length === 0 && openAp.length === 0 && !allowEmpty) {
    errors.push("open_ap is empty; refusing to wipe current snapshot (set allow_empty_open_ap=true to override)");
  }
  return {
    ok: errors.length === 0,
    errors,
    value: { organizationId, syncRunId, openAp, allowEmpty }
  };
}

export function validateUndepositedReplacePayload(body) {
  const errors = [];
  const { organizationId, syncRunId } = requireOrgRun(body, errors);
  const rowsIn = Array.isArray(body?.undeposited) ? body.undeposited : null;
  if (!rowsIn) errors.push("undeposited must be an array");
  const allowEmpty = Boolean(body?.allow_empty_undeposited);
  const rows = [];
  if (rowsIn) {
    for (let i = 0; i < rowsIn.length; i += 1) {
      const r = rowsIn[i];
      const qbTxnId = pickStr(r.qb_txn_id ?? r.ID, 200);
      if (!qbTxnId) {
        errors.push(`undeposited[${i}].qb_txn_id required`);
        continue;
      }
      rows.push({
        ...stamp(organizationId),
        qb_txn_id: qbTxnId,
        txn_type: pickStr(r.txn_type ?? r.TxnType, 80),
        txn_date: pickStr(r.txn_date ?? r.TxnDate, 16),
        qb_customer_list_id: pickStr(r.qb_customer_list_id ?? r.CustomerRef_ListID, 200),
        customer_name: pickStr(r.customer_name ?? r.CustomerRef_FullName, 300),
        amount: toNumber(r.amount ?? r.Amount),
        reference_number: pickStr(r.reference_number ?? r.RefNumber, 80)
      });
    }
  }
  if (errors.length === 0 && rows.length === 0 && !allowEmpty) {
    errors.push("undeposited is empty; refusing to wipe snapshot (set allow_empty_undeposited=true)");
  }
  return {
    ok: errors.length === 0,
    errors,
    value: { organizationId, syncRunId, rows, allowEmpty }
  };
}

export function validateReportSnapshotPayload(body) {
  const errors = [];
  const { organizationId, syncRunId } = requireOrgRun(body, errors);
  const reportType = pickStr(body?.report_type, 40);
  if (!["profit_and_loss", "balance_sheet"].includes(reportType || "")) {
    errors.push("report_type must be profit_and_loss or balance_sheet");
  }
  const sourceView = pickStr(body?.source_view, 80);
  if (!sourceView) errors.push("source_view required");
  const reportBasis = pickStr(body?.report_basis, 32) || QB_FINANCE_REPORT_BASIS_CANONICAL;
  const isOpening = Boolean(body?.is_opening);
  const asOfDate = pickStr(body?.as_of_date, 16);
  const periodStart = pickStr(body?.period_start, 16);
  const periodEnd = pickStr(body?.period_end, 16);
  if (asOfDate && !isYmd(asOfDate)) errors.push("as_of_date must be YYYY-MM-DD");
  if (periodStart && !isYmd(periodStart)) errors.push("period_start must be YYYY-MM-DD");
  if (periodEnd && !isYmd(periodEnd)) errors.push("period_end must be YYYY-MM-DD");
  if (isOpening && asOfDate && asOfDate !== QB_FINANCE_OPENING_AS_OF_DATE) {
    errors.push(`opening snapshot as_of_date must be ${QB_FINANCE_OPENING_AS_OF_DATE}`);
  }
  const linesIn = Array.isArray(body?.lines) ? body.lines : null;
  if (!linesIn) errors.push("lines must be an array");
  if (linesIn && linesIn.length > QB_FINANCE_SYNC_MAX_REPORT_LINES) {
    errors.push(`lines exceeds max ${QB_FINANCE_SYNC_MAX_REPORT_LINES}`);
  }
  const lines = [];
  if (linesIn) {
    for (let i = 0; i < linesIn.length; i += 1) {
      const r = linesIn[i];
      lines.push({
        organization_id: organizationId,
        line_order: Number.isInteger(r.line_order) ? r.line_order : i,
        label: pickStr(r.label ?? r.Label, 500),
        amount: toNumber(r.amount ?? r.Amount ?? r.Total),
        row_type: pickStr(r.row_type ?? r.RowType, 80)
      });
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    value: {
      organizationId,
      syncRunId,
      reportType,
      sourceView,
      reportBasis,
      periodStart,
      periodEnd,
      asOfDate,
      isOpening,
      controlTotals: body?.control_totals && typeof body.control_totals === "object" ? body.control_totals : {},
      lines
    }
  };
}

export function validateReconciliationPayload(body) {
  const errors = [];
  const { organizationId, syncRunId } = requireOrgRun(body, errors);
  const checkType = pickStr(body?.check_type, 80);
  const status = pickStr(body?.status, 16);
  if (!checkType) errors.push("check_type required");
  if (!["pass", "warn", "fail", "info"].includes(status || "")) errors.push("status invalid");
  return {
    ok: errors.length === 0,
    errors,
    value: {
      organization_id: organizationId,
      sync_run_id: syncRunId,
      check_type: checkType,
      report_basis: pickStr(body?.report_basis, 32) || QB_FINANCE_REPORT_BASIS_CANONICAL,
      period_start: pickStr(body?.period_start, 16),
      period_end: pickStr(body?.period_end, 16),
      as_of_date: pickStr(body?.as_of_date, 16),
      eliteos_value: toNumber(body?.eliteos_value),
      quickbooks_value: toNumber(body?.quickbooks_value),
      delta: toNumber(body?.delta),
      tolerance_abs: toNumber(body?.tolerance_abs),
      status,
      notes: body?.notes && typeof body.notes === "object" ? body.notes : {}
    }
  };
}

export function validateCompletePayload(body) {
  const errors = [];
  const { organizationId, syncRunId } = requireOrgRun(body, errors);
  const status = pickStr(body?.status, 32) || "success";
  if (!["success", "partial", "failed"].includes(status)) {
    errors.push("status must be success|partial|failed");
  }
  const warnings = Array.isArray(body?.warnings)
    ? body.warnings.map((w) => pickStr(w, 400)).filter(Boolean).slice(0, 50)
    : [];
  return {
    ok: errors.length === 0,
    errors,
    value: {
      organizationId,
      syncRunId,
      status,
      rowCounts: body?.row_counts && typeof body.row_counts === "object" ? body.row_counts : {},
      warnings,
      errorSummary: pickStr(body?.error_summary, 500)
    }
  };
}
