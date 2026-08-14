/**
 * Cash grain: customer receipt ≠ bank deposit.
 * Live proof: DepositLineItems.ItemTxnType='ReceivePayment' and ItemRefId = ReceivePayment TxnID.
 */

import { QB_FINANCE_CASH_EVENT_ROLES } from "./constants.js";

/**
 * @param {object} input
 * @returns {{ event_role: string, linked_txn_type: string|null, linked_txn_id: string|null }}
 */
export function classifyCashEvent(input) {
  const sourceType = String(input?.source_txn_type ?? "").trim();
  const itemTxnType = String(input?.item_txn_type ?? "").trim();
  const itemRefId = String(input?.item_ref_id ?? "").trim() || null;

  if (sourceType === "ReceivePayment" || sourceType === "receive_payment") {
    return {
      event_role: "customer_receipt",
      linked_txn_type: null,
      linked_txn_id: null
    };
  }
  if (sourceType === "ReceivePaymentToDeposit") {
    return {
      event_role: "undeposited_queue",
      linked_txn_type: "ReceivePayment",
      linked_txn_id: String(input?.source_txn_id ?? "").trim() || null
    };
  }
  if (sourceType === "Deposit") {
    return {
      event_role: "bank_deposit",
      linked_txn_type: null,
      linked_txn_id: null
    };
  }
  if (sourceType === "DepositLineItem" || sourceType === "deposit_line") {
    const isPayment = itemTxnType === "ReceivePayment";
    return {
      event_role: "bank_deposit_line",
      linked_txn_type: isPayment ? "ReceivePayment" : itemTxnType || null,
      linked_txn_id: itemRefId
    };
  }
  if (sourceType === "Check" || sourceType === "BillPaymentCheck" || sourceType === "BillPaymentCreditCard") {
    return {
      event_role: "bank_disbursement",
      linked_txn_type: null,
      linked_txn_id: null
    };
  }
  if (sourceType === "Transfer") {
    return {
      event_role: "transfer",
      linked_txn_type: null,
      linked_txn_id: null
    };
  }
  throw new Error(`unknown cash source_txn_type: ${sourceType}`);
}

/**
 * Build normalized cash events from deposit headers + lines.
 * Does not emit customer_receipt rows from deposit lines — those stay on ReceivePayment.
 *
 * @param {object} args
 * @param {Array<object>} args.deposits
 * @param {Array<object>} args.depositLines
 * @param {string} args.organizationId
 */
export function buildDepositCashEvents({ deposits = [], depositLines = [], organizationId }) {
  const events = [];
  for (const d of deposits) {
    events.push({
      organization_id: organizationId,
      event_role: "bank_deposit",
      source_txn_type: "Deposit",
      source_txn_id: d.qb_deposit_id,
      source_line_id: "",
      txn_date: d.txn_date,
      amount: d.total_deposit,
      account_id: d.deposit_to_account_id ?? null,
      account_name: d.deposit_to_account_name ?? null,
      linked_txn_type: null,
      linked_txn_id: null,
      memo: d.memo ?? null
    });
  }
  for (const line of depositLines) {
    const classified = classifyCashEvent({
      source_txn_type: "DepositLineItem",
      item_txn_type: line.item_txn_type,
      item_ref_id: line.item_ref_id
    });
    events.push({
      organization_id: organizationId,
      event_role: classified.event_role,
      source_txn_type: "DepositLineItem",
      source_txn_id: line.qb_deposit_id,
      source_line_id: line.source_line_id,
      txn_date: line.txn_date ?? null,
      amount: line.item_amount,
      account_id: null,
      account_name: null,
      linked_txn_type: classified.linked_txn_type,
      linked_txn_id: classified.linked_txn_id,
      memo: null
    });
  }
  return events;
}

/**
 * True when a set of events would double-count cash-in if summed indiscriminately.
 * Detection: customer_receipt amount also appears as bank_deposit_line linked to same payment.
 *
 * @param {Array<{ event_role: string, source_txn_id?: string, linked_txn_id?: string, amount?: number }>} events
 */
export function detectReceivePaymentDepositDoubleCount(events) {
  const receipts = new Map();
  const depositLinks = [];
  for (const e of events) {
    if (e.event_role === "customer_receipt") {
      receipts.set(String(e.source_txn_id), Number(e.amount) || 0);
    }
    if (e.event_role === "bank_deposit_line" && e.linked_txn_type === "ReceivePayment") {
      depositLinks.push(e);
    }
  }
  const collisions = [];
  for (const line of depositLinks) {
    const payId = String(line.linked_txn_id ?? "");
    if (payId && receipts.has(payId)) {
      collisions.push({
        receive_payment_id: payId,
        receipt_amount: receipts.get(payId),
        deposit_line_amount: Number(line.amount) || 0
      });
    }
  }
  return {
    would_double_count_if_summed: collisions.length > 0,
    collisions
  };
}

export function cashInRolesForBankKpi() {
  return ["bank_deposit"];
}

export function cashInRolesForbiddenTogether() {
  return ["customer_receipt", "bank_deposit"];
}

export function isKnownCashEventRole(role) {
  return QB_FINANCE_CASH_EVENT_ROLES.includes(role);
}
