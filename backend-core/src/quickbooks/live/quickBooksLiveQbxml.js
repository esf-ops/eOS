/**
 * Read-only QBXML builders + response parsers for live Gateway probes.
 *
 * SAFETY: This module only constructs *QueryRq / list query request tags.
 * Any Add/Mod/Del request tag is rejected before transport.
 */

import { XMLParser } from "fast-xml-parser";

import { asArray, resolveTxnTotalAmount, textOf, refListId } from "../estimateSalesTruth/helpers.js";
import { extractLinkedTxnRefs, parseQbMoney } from "../quickBooksIntelligenceFacts.js";
import { unwrapQbScalar } from "../quickBooksStaging.js";

/** Request tags that must never be sent by the live read client. */
export const FORBIDDEN_QBXML_REQUEST_TAGS = Object.freeze([
  "EstimateAddRq",
  "EstimateModRq",
  "InvoiceAddRq",
  "InvoiceModRq",
  "SalesOrderAddRq",
  "SalesOrderModRq",
  "ReceivePaymentAddRq",
  "ReceivePaymentModRq",
  "TxnDelRq",
  "ListDelRq",
  "CustomerAddRq",
  "CustomerModRq",
  "ItemAddRq",
  "ItemModRq",
  "TemplateAddRq",
  "DataExtAddRq",
  "DataExtModRq",
  "DataExtDelRq",
]);

/** Allowed read-only request tags for the live probe surface. */
export const ALLOWED_QBXML_REQUEST_TAGS = Object.freeze([
  "EstimateQueryRq",
  "SalesOrderQueryRq",
  "InvoiceQueryRq",
  "ReceivePaymentQueryRq",
  "TemplateQueryRq",
  "CustomerMsgQueryRq",
  "PaymentMethodQueryRq",
  "SalesTaxCodeQueryRq",
  "ItemSalesTaxQueryRq",
  "HostQueryRq",
  "CompanyQueryRq",
]);

const WRITEISH_PATTERN =
  /<(EstimateAdd|EstimateMod|InvoiceAdd|InvoiceMod|SalesOrderAdd|SalesOrderMod|ReceivePaymentAdd|ReceivePaymentMod|TxnDel|ListDel|CustomerAdd|CustomerMod|ItemAdd|ItemMod|TemplateAdd|DataExtAdd|DataExtMod|DataExtDel)Rq[\s>]/i;

/**
 * @param {string} qbXml
 */
export function assertReadOnlyQbXml(qbXml) {
  if (typeof qbXml !== "string" || !qbXml.trim()) {
    throw new Error("QBXML payload must be a non-empty string.");
  }
  if (WRITEISH_PATTERN.test(qbXml)) {
    throw new Error("Refusing to send write/modify/delete QBXML request through live read transport.");
  }
  const tags = [...qbXml.matchAll(/<([A-Za-z][A-Za-z0-9]*)Rq\b/g)]
    .map((m) => m[1] + "Rq")
    .filter((tag) => tag !== "QBXMLMsgsRq");
  for (const tag of tags) {
    if (FORBIDDEN_QBXML_REQUEST_TAGS.includes(tag)) {
      throw new Error(`Forbidden QBXML request tag: ${tag}`);
    }
    if (!ALLOWED_QBXML_REQUEST_TAGS.includes(tag)) {
      throw new Error(`QBXML request tag not on live-read allowlist: ${tag}`);
    }
  }
  if (tags.length === 0) {
    throw new Error("QBXML payload contains no recognized *Rq request tag.");
  }
  return true;
}

/**
 * @param {string} value
 */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {string} qbXmlVersion
 * @param {string} innerRequest
 */
export function wrapQbXmlRequest(qbXmlVersion, innerRequest) {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<?qbxml version="${escapeXml(qbXmlVersion)}"?>` +
    `<QBXML><QBXMLMsgsRq onError="stopOnError">${innerRequest}</QBXMLMsgsRq></QBXML>`
  );
}

/**
 * @param {{
 *   requestTag: string,
 *   qbXmlVersion?: string,
 *   maxReturned?: number,
 *   includeLineItems?: boolean,
 *   includeLinkedTxns?: boolean,
 *   fromTxnDate?: string|null,
 *   requestId?: string,
 *   extraInnerXml?: string,
 * }} opts
 */
export function buildBoundedQueryRq(opts) {
  const {
    requestTag,
    qbXmlVersion = "16.0",
    maxReturned = 10,
    includeLineItems = false,
    includeLinkedTxns = false,
    fromTxnDate = null,
    requestId = `live-read-${Date.now()}`,
    extraInnerXml = "",
  } = opts;

  if (!ALLOWED_QBXML_REQUEST_TAGS.includes(requestTag)) {
    throw new Error(`Request tag not allowed: ${requestTag}`);
  }

  const parts = [];
  parts.push(`<MaxReturned>${Math.max(1, Math.min(500, Number(maxReturned) || 10))}</MaxReturned>`);
  if (fromTxnDate) {
    parts.push(
      `<TxnDateRangeFilter><FromTxnDate>${escapeXml(fromTxnDate)}</FromTxnDate></TxnDateRangeFilter>`
    );
  }
  if (includeLineItems) parts.push(`<IncludeLineItems>true</IncludeLineItems>`);
  else if (
    requestTag === "EstimateQueryRq" ||
    requestTag === "SalesOrderQueryRq" ||
    requestTag === "InvoiceQueryRq"
  ) {
    parts.push(`<IncludeLineItems>false</IncludeLineItems>`);
  }
  if (includeLinkedTxns) parts.push(`<IncludeLinkedTxns>true</IncludeLinkedTxns>`);
  if (extraInnerXml) parts.push(extraInnerXml);
  // OwnerID 0 pulls public DataExt on list/txn queries when supported.
  parts.push(`<OwnerID>0</OwnerID>`);

  const inner =
    `<${requestTag} requestID="${escapeXml(requestId)}">` +
    parts.join("") +
    `</${requestTag}>`;

  const xml = wrapQbXmlRequest(qbXmlVersion, inner);
  assertReadOnlyQbXml(xml);
  return xml;
}

export function buildEstimateLinkedQuery({ qbXmlVersion, maxReturned, fromTxnDate }) {
  return buildBoundedQueryRq({
    requestTag: "EstimateQueryRq",
    qbXmlVersion,
    maxReturned,
    includeLineItems: false,
    includeLinkedTxns: true,
    fromTxnDate,
  });
}

export function buildSalesOrderLinkedQuery({ qbXmlVersion, maxReturned, fromTxnDate }) {
  return buildBoundedQueryRq({
    requestTag: "SalesOrderQueryRq",
    qbXmlVersion,
    maxReturned,
    includeLineItems: false,
    includeLinkedTxns: true,
    fromTxnDate,
  });
}

export function buildInvoiceLinkedQuery({ qbXmlVersion, maxReturned, fromTxnDate }) {
  return buildBoundedQueryRq({
    requestTag: "InvoiceQueryRq",
    qbXmlVersion,
    maxReturned,
    includeLineItems: false,
    includeLinkedTxns: true,
    fromTxnDate,
  });
}

export function buildReceivePaymentQuery({ qbXmlVersion, maxReturned, fromTxnDate }) {
  // AppliedToTxnRet is returned on ReceivePaymentRet when present; IncludeLinkedTxns
  // is also requested for gateway/QB versions that surface payment links that way.
  return buildBoundedQueryRq({
    requestTag: "ReceivePaymentQueryRq",
    qbXmlVersion,
    maxReturned,
    includeLinkedTxns: true,
    fromTxnDate,
  });
}

export function buildListQuery(requestTag, { qbXmlVersion, maxReturned }) {
  return buildBoundedQueryRq({
    requestTag,
    qbXmlVersion,
    maxReturned,
    includeLineItems: false,
    includeLinkedTxns: false,
    fromTxnDate: null,
  });
}

export function buildHostQuery(qbXmlVersion = "16.0") {
  const xml = wrapQbXmlRequest(qbXmlVersion, `<HostQueryRq requestID="live-host"></HostQueryRq>`);
  assertReadOnlyQbXml(xml);
  return xml;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) =>
    /Ret$/.test(name) ||
    name === "LinkedTxn" ||
    name === "AppliedToTxnRet" ||
    name === "DataExtRet" ||
    name === "EstimateLineRet" ||
    name === "SalesOrderLineRet" ||
    name === "InvoiceLineRet",
});

/**
 * Parse Gateway/QBXML response into a plain object tree.
 * @param {string} qbXmlResponse
 */
export function parseQbXmlResponse(qbXmlResponse) {
  if (typeof qbXmlResponse !== "string" || !qbXmlResponse.trim()) {
    throw new Error("Empty QuickBooks Gateway response.");
  }
  const trimmed = qbXmlResponse.replace(/^\uFEFF/, "").trim();
  // Some gateways wrap errors as plain text.
  if (!trimmed.includes("<")) {
    throw new Error(`Gateway returned non-XML response (${trimmed.length} chars).`);
  }
  return xmlParser.parse(trimmed);
}

/**
 * Normalize fast-xml-parser scalars / objects to the connector-like `#text` shape
 * expected by existing unwrap helpers where helpful. For simple extraction we use textOf.
 * @param {unknown} node
 */
function scalar(node) {
  if (node == null) return null;
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (typeof node === "object") {
    if ("#text" in node) return textOf(node);
    // Attribute-only or empty
    return null;
  }
  return null;
}

function refListIdFromParsed(ref) {
  if (!ref || typeof ref !== "object") return null;
  const listId = scalar(ref.ListID) || refListId(ref);
  return listId;
}

/**
 * Extract status from a *QueryRs node.
 * @param {object} rs
 */
export function extractQueryStatus(rs) {
  if (!rs || typeof rs !== "object") {
    return { statusCode: null, statusSeverity: null, statusMessage: null };
  }
  return {
    statusCode: rs["@_statusCode"] != null ? Number(rs["@_statusCode"]) : null,
    statusSeverity: rs["@_statusSeverity"] ?? null,
    statusMessage: rs["@_statusMessage"] ?? null,
  };
}

/**
 * Walk response and return Ret records for a given Ret tag under a QueryRs.
 * @param {object} parsed
 * @param {string} queryRsName e.g. EstimateQueryRs
 * @param {string} retName e.g. EstimateRet
 */
export function extractRetRecords(parsed, queryRsName, retName) {
  const msgs = parsed?.QBXML?.QBXMLMsgsRs ?? parsed?.QBXMLMsgsRs ?? null;
  const rsNode = msgs?.[queryRsName];
  const statuses = asArray(rsNode).map(extractQueryStatus);
  const records = [];
  for (const rs of asArray(rsNode)) {
    for (const ret of asArray(rs?.[retName])) {
      if (ret && typeof ret === "object") records.push(ret);
    }
  }
  return { statuses, records };
}

/**
 * @param {object} ret
 * @param {'Estimate'|'SalesOrder'|'Invoice'|'ReceivePayment'} txnType
 */
export function extractTxnLinkSummary(ret, txnType) {
  const txnId = scalar(ret.TxnID);
  const refNumber = scalar(ret.RefNumber);
  const txnDate = scalar(ret.TxnDate);
  const customerListId = refListIdFromParsed(ret.CustomerRef);
  const total =
    resolveTxnTotalAmount({
      TotalAmount: ret.TotalAmount,
      Subtotal: ret.Subtotal,
      SalesTaxTotal: ret.SalesTaxTotal,
    }) ?? parseQbMoney(ret.TotalAmount);

  const linked = extractLinkedTxnRefs(ret.LinkedTxn).map((l) => ({
    qb_txn_id: l.qb_txn_id,
    txn_type: l.txn_type,
  }));

  /** @type {Array<{ qb_txn_id: string, txn_type: string|null, amount: number|null }>} */
  const appliedTo = [];
  for (const app of asArray(ret.AppliedToTxnRet)) {
    const id = scalar(app?.TxnID);
    if (!id) continue;
    appliedTo.push({
      qb_txn_id: id,
      txn_type: scalar(app?.TxnType),
      amount: parseQbMoney(app?.Amount),
    });
  }

  return {
    txnType,
    qb_txn_id: txnId,
    ref_number: refNumber,
    txn_date: txnDate,
    qb_customer_list_id: customerListId,
    total_amount: total,
    linked_txns: linked,
    applied_to_txns: appliedTo,
    memo_estimate_refs: extractMemoEstimateRefs(scalar(ret.Memo)),
  };
}

/**
 * Soft reuse of discovery memo rule for comparison helpers (sanitized — refs only).
 * @param {string|null} memo
 */
export function extractMemoEstimateRefs(memo) {
  if (!memo) return [];
  const out = [];
  const re = /Estimate\s+([0-9]{1,2}-[0-9]{2,6})\b/gi;
  let m;
  while ((m = re.exec(memo))) out.push(m[1]);
  return out;
}

/**
 * @param {object} ret
 * @param {string} listKind
 */
export function extractListSummary(ret, listKind) {
  return {
    listKind,
    qb_list_id: scalar(ret.ListID),
    is_active: (() => {
      const v = scalar(ret.IsActive);
      if (v === "true") return true;
      if (v === "false") return false;
      return null;
    })(),
    // Name is useful for operator debugging in live probe but must be redacted in artifacts.
    has_name: Boolean(scalar(ret.Name) || scalar(ret.FullName)),
  };
}

export { unwrapQbScalar };
