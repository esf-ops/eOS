/**
 * quickBooksIntelligenceFacts — Phase 4A safe fact extraction from QB staging rows.
 *
 * Staging tables store financial amounts and relationship details inside raw_payload.
 * This module extracts typed, opaque-ID facts for backend-core intelligence only.
 *
 * Privacy rules:
 *   - Never return raw_payload to callers of the public fact builders.
 *   - Never extract customer/vendor names, addresses, memos, RefNumber, or item
 *     descriptions into fact objects.
 *   - Amounts and dates are typed numbers/ISO strings for aggregation only.
 *   - Consumers identify entities by qb_list_id / qb_txn_id only.
 */

import {
  parseQbBoolean,
  parseQbDate,
  parseQbTimestamp,
  unwrapQbScalar,
} from "./quickBooksStaging.js";

/**
 * Parse a QuickBooks money scalar into a finite number, or null.
 * Accepts bare numbers, numeric strings, and `#text`-wrapped scalars.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseQbMoney(value) {
  const v = unwrapQbScalar(value);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function parseOpaqueId(value) {
  const v = unwrapQbScalar(value);
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * @param {unknown} ref
 * @returns {string|null}
 */
function parseRefListId(ref) {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return null;
  return parseOpaqueId(/** @type {{ ListID?: unknown }} */ (ref).ListID);
}

/**
 * Extract opaque LinkedTxn references (TxnID + TxnType only — no amounts/names).
 *
 * @param {unknown} linked
 * @returns {Array<{ qb_txn_id: string, txn_type: string|null }>}
 */
export function extractLinkedTxnRefs(linked) {
  const items = Array.isArray(linked) ? linked : linked ? [linked] : [];
  /** @type {Array<{ qb_txn_id: string, txn_type: string|null }>} */
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const qbTxnId = parseOpaqueId(/** @type {{ TxnID?: unknown }} */ (item).TxnID);
    if (!qbTxnId) continue;
    const txnType = parseOpaqueId(/** @type {{ TxnType?: unknown }} */ (item).TxnType);
    out.push({ qb_txn_id: qbTxnId, txn_type: txnType });
  }
  return out;
}

/**
 * Prefer named staging columns; fall back to raw_payload only when needed.
 *
 * @param {object} stagingRow
 * @returns {object|null}
 */
function payloadOf(stagingRow) {
  const p = stagingRow?.raw_payload;
  return p && typeof p === "object" && !Array.isArray(p) ? p : null;
}

/**
 * @typedef {{
 *   qb_list_id: string,
 *   is_active: boolean|null,
 *   time_modified: string|null,
 *   time_created: string|null,
 * }} QbCustomerFact
 */

/**
 * @param {object} stagingRow - brain_quickbooks_customers-shaped row
 * @returns {QbCustomerFact|null}
 */
export function extractCustomerFact(stagingRow) {
  if (!stagingRow || typeof stagingRow !== "object") return null;
  const qbListId = parseOpaqueId(stagingRow.qb_list_id);
  if (!qbListId) return null;
  const payload = payloadOf(stagingRow);
  return {
    qb_list_id: qbListId,
    is_active:
      stagingRow.is_active != null
        ? Boolean(stagingRow.is_active)
        : parseQbBoolean(payload?.IsActive),
    time_modified: parseQbTimestamp(stagingRow.time_modified) ?? parseQbTimestamp(payload?.TimeModified),
    time_created: parseQbTimestamp(stagingRow.time_created) ?? parseQbTimestamp(payload?.TimeCreated),
  };
}

/**
 * @typedef {{
 *   qb_txn_id: string,
 *   qb_customer_list_id: string|null,
 *   qb_sales_rep_list_id: string|null,
 *   txn_date: string|null,
 *   due_date: string|null,
 *   time_modified: string|null,
 *   total_amount: number|null,
 *   subtotal: number|null,
 *   balance_remaining: number|null,
 *   is_paid: boolean|null,
 *   linked_txns: Array<{ qb_txn_id: string, txn_type: string|null }>,
 * }} QbInvoiceFact
 */

/**
 * @param {object} stagingRow - brain_quickbooks_invoices-shaped row
 * @returns {QbInvoiceFact|null}
 */
export function extractInvoiceFact(stagingRow) {
  if (!stagingRow || typeof stagingRow !== "object") return null;
  const qbTxnId = parseOpaqueId(stagingRow.qb_txn_id);
  if (!qbTxnId) return null;
  const payload = payloadOf(stagingRow);
  return {
    qb_txn_id: qbTxnId,
    qb_customer_list_id:
      parseOpaqueId(stagingRow.qb_customer_list_id) ?? parseRefListId(payload?.CustomerRef),
    qb_sales_rep_list_id: parseRefListId(payload?.SalesRepRef),
    txn_date: parseQbDate(stagingRow.txn_date) ?? parseQbDate(payload?.TxnDate),
    due_date: parseQbDate(payload?.DueDate),
    time_modified: parseQbTimestamp(stagingRow.time_modified) ?? parseQbTimestamp(payload?.TimeModified),
    total_amount: parseQbMoney(payload?.TotalAmount),
    subtotal: parseQbMoney(payload?.Subtotal),
    balance_remaining: parseQbMoney(payload?.BalanceRemaining),
    is_paid: parseQbBoolean(payload?.IsPaid),
    linked_txns: extractLinkedTxnRefs(payload?.LinkedTxn),
  };
}

/**
 * @typedef {{
 *   qb_txn_id: string,
 *   qb_customer_list_id: string|null,
 *   txn_date: string|null,
 *   time_modified: string|null,
 *   total_amount: number|null,
 *   linked_txns: Array<{ qb_txn_id: string, txn_type: string|null }>,
 * }} QbPaymentFact
 */

/**
 * @param {object} stagingRow
 * @returns {QbPaymentFact|null}
 */
export function extractPaymentFact(stagingRow) {
  if (!stagingRow || typeof stagingRow !== "object") return null;
  const qbTxnId = parseOpaqueId(stagingRow.qb_txn_id);
  if (!qbTxnId) return null;
  const payload = payloadOf(stagingRow);
  return {
    qb_txn_id: qbTxnId,
    qb_customer_list_id:
      parseOpaqueId(stagingRow.qb_customer_list_id) ?? parseRefListId(payload?.CustomerRef),
    txn_date: parseQbDate(stagingRow.txn_date) ?? parseQbDate(payload?.TxnDate),
    time_modified: parseQbTimestamp(stagingRow.time_modified) ?? parseQbTimestamp(payload?.TimeModified),
    total_amount: parseQbMoney(payload?.TotalAmount),
    linked_txns: extractLinkedTxnRefs(payload?.LinkedTxn),
  };
}

/**
 * @typedef {{
 *   qb_txn_id: string,
 *   qb_customer_list_id: string|null,
 *   qb_sales_rep_list_id: string|null,
 *   txn_date: string|null,
 *   time_modified: string|null,
 *   total_amount: number|null,
 *   is_active: boolean|null,
 *   is_fully_invoiced: boolean|null,
 *   linked_txns: Array<{ qb_txn_id: string, txn_type: string|null }>,
 * }} QbEstimateFact
 */

/**
 * @param {object} stagingRow
 * @returns {QbEstimateFact|null}
 */
export function extractEstimateFact(stagingRow) {
  if (!stagingRow || typeof stagingRow !== "object") return null;
  const qbTxnId = parseOpaqueId(stagingRow.qb_txn_id);
  if (!qbTxnId) return null;
  const payload = payloadOf(stagingRow);
  return {
    qb_txn_id: qbTxnId,
    qb_customer_list_id:
      parseOpaqueId(stagingRow.qb_customer_list_id) ?? parseRefListId(payload?.CustomerRef),
    qb_sales_rep_list_id: parseRefListId(payload?.SalesRepRef),
    txn_date: parseQbDate(stagingRow.txn_date) ?? parseQbDate(payload?.TxnDate),
    time_modified: parseQbTimestamp(stagingRow.time_modified) ?? parseQbTimestamp(payload?.TimeModified),
    total_amount: parseQbMoney(payload?.TotalAmount),
    is_active: parseQbBoolean(payload?.IsActive),
    is_fully_invoiced: parseQbBoolean(payload?.IsFullyInvoiced),
    linked_txns: extractLinkedTxnRefs(payload?.LinkedTxn),
  };
}

/**
 * @typedef {{
 *   qb_txn_id: string,
 *   qb_customer_list_id: string|null,
 *   qb_sales_rep_list_id: string|null,
 *   txn_date: string|null,
 *   time_modified: string|null,
 *   total_amount: number|null,
 *   is_fully_invoiced: boolean|null,
 *   is_manually_closed: boolean|null,
 *   linked_txns: Array<{ qb_txn_id: string, txn_type: string|null }>,
 * }} QbSalesOrderFact
 */

/**
 * @param {object} stagingRow
 * @returns {QbSalesOrderFact|null}
 */
export function extractSalesOrderFact(stagingRow) {
  if (!stagingRow || typeof stagingRow !== "object") return null;
  const qbTxnId = parseOpaqueId(stagingRow.qb_txn_id);
  if (!qbTxnId) return null;
  const payload = payloadOf(stagingRow);
  return {
    qb_txn_id: qbTxnId,
    qb_customer_list_id:
      parseOpaqueId(stagingRow.qb_customer_list_id) ?? parseRefListId(payload?.CustomerRef),
    qb_sales_rep_list_id: parseRefListId(payload?.SalesRepRef),
    txn_date: parseQbDate(stagingRow.txn_date) ?? parseQbDate(payload?.TxnDate),
    time_modified: parseQbTimestamp(stagingRow.time_modified) ?? parseQbTimestamp(payload?.TimeModified),
    total_amount: parseQbMoney(payload?.TotalAmount),
    is_fully_invoiced: parseQbBoolean(payload?.IsFullyInvoiced),
    is_manually_closed: parseQbBoolean(payload?.IsManuallyClosed),
    linked_txns: extractLinkedTxnRefs(payload?.LinkedTxn),
  };
}

/**
 * @typedef {{
 *   qb_list_id: string,
 *   is_active: boolean|null,
 * }} QbSalesRepFact
 */

/**
 * @param {object} stagingRow
 * @returns {QbSalesRepFact|null}
 */
export function extractSalesRepFact(stagingRow) {
  if (!stagingRow || typeof stagingRow !== "object") return null;
  const qbListId = parseOpaqueId(stagingRow.qb_list_id);
  if (!qbListId) return null;
  const payload = payloadOf(stagingRow);
  return {
    qb_list_id: qbListId,
    is_active:
      stagingRow.is_active != null
        ? Boolean(stagingRow.is_active)
        : parseQbBoolean(payload?.IsActive),
  };
}

/**
 * @typedef {{
 *   qb_txn_id: string,
 *   line_seq_number: number,
 *   qb_txn_line_id: string|null,
 *   qb_item_list_id: string|null,
 *   line_type: string|null,
 *   txn_date: string|null,
 * }} QbInvoiceLineFact
 */

/**
 * Opaque invoice-line fact. Prefers named staging columns; does not surface
 * descriptions, quantities, or amounts (those stay in raw_payload server-side).
 *
 * @param {object} stagingRow
 * @returns {QbInvoiceLineFact|null}
 */
export function extractInvoiceLineFact(stagingRow) {
  if (!stagingRow || typeof stagingRow !== "object") return null;
  const qbTxnId = parseOpaqueId(stagingRow.qb_txn_id);
  if (!qbTxnId) return null;
  const seq = stagingRow.line_seq_number;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) return null;
  const payload = payloadOf(stagingRow);
  return {
    qb_txn_id: qbTxnId,
    line_seq_number: seq,
    qb_txn_line_id: parseOpaqueId(stagingRow.qb_txn_line_id) ?? parseOpaqueId(payload?.TxnLineID),
    qb_item_list_id: parseOpaqueId(stagingRow.qb_item_list_id) ?? parseRefListId(payload?.ItemRef),
    line_type: parseOpaqueId(stagingRow.line_type) ?? parseOpaqueId(payload?.["@elementName"]) ?? null,
    txn_date: parseQbDate(stagingRow.txn_date) ?? parseQbDate(payload?.TxnDate),
  };
}

/**
 * Assert a value suitable for frontend/API consumers never carries raw_payload.
 *
 * @param {unknown} value
 * @param {string} [label]
 * @returns {boolean} true when safe
 */
export function assertNoRawPayload(value, label = "value") {
  if (value == null) return true;
  if (Array.isArray(value)) {
    for (const item of value) assertNoRawPayload(item, label);
    return true;
  }
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "raw_payload")) {
      throw new Error(`${label} must not include raw_payload`);
    }
    for (const [k, v] of Object.entries(value)) {
      assertNoRawPayload(v, `${label}.${k}`);
    }
  }
  return true;
}
