/**
 * qbXML for Studio sales orders: SalesOrderAdd, lookup/read-back queries, company check.
 * Element order follows the qbXML schema (SalesOrderAdd / SalesOrderLineAdd sequences).
 */

import {
  extractQueryStatus,
  extractRetRecords,
  parseQbXmlResponse,
  wrapQbXmlRequest
} from "../../quickbooks/live/quickBooksLiveQbxml.js";

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function money(amountCents) {
  const n = Math.round(Number(amountCents) || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function fullNameRef(tag, fullName) {
  return fullName ? `<${tag}><FullName>${esc(fullName)}</FullName></${tag}>` : "";
}

/** ListID is QuickBooks identity; FullName only when no ListID is mapped. */
function listOrNameRef(tag, listId, fullName) {
  if (listId) return `<${tag}><ListID>${esc(listId)}</ListID></${tag}>`;
  return fullNameRef(tag, fullName);
}

function text(node) {
  if (node == null) return null;
  if (typeof node === "object") return node["#text"] != null ? String(node["#text"]) : null;
  return String(node);
}

function toCents(v) {
  const n = Number(text(v));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function asArray(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/**
 * @param {ReturnType<import("./studioSalesOrderPlan.mjs").buildStudioSalesOrderPlan>} plan
 * @param {{ qbXmlVersion?: string, requestId?: string, txnDate?: string|null }} [opts]
 */
export function buildSalesOrderAddRq(plan, opts = {}) {
  const customerRef = plan.customer.listId
    ? `<CustomerRef><ListID>${esc(plan.customer.listId)}</ListID></CustomerRef>`
    : fullNameRef("CustomerRef", plan.customer.fullName);
  const lines = plan.lines
    .map(
      (l) =>
        "<SalesOrderLineAdd>" +
        listOrNameRef("ItemRef", l.itemListId, l.itemFullName) +
        `<Desc>${esc(l.description)}</Desc>` +
        `<Quantity>${l.quantity}</Quantity>` +
        fullNameRef("ClassRef", l.classFullName) +
        `<Amount>${money(l.amountCents)}</Amount>` +
        fullNameRef("SalesTaxCodeRef", l.salesTaxCodeFullName) +
        "</SalesOrderLineAdd>"
    )
    .join("");
  const inner =
    `<SalesOrderAddRq requestID="${esc(opts.requestId || "1")}"><SalesOrderAdd>` +
    customerRef +
    fullNameRef("ClassRef", plan.classFullName) +
    (opts.txnDate ? `<TxnDate>${esc(opts.txnDate)}</TxnDate>` : "") +
    fullNameRef("TermsRef", plan.termsFullName) +
    `<Memo>${esc(plan.memo)}</Memo>` +
    `<ExternalGUID>${esc(plan.externalGuid)}</ExternalGUID>` +
    lines +
    "</SalesOrderAdd></SalesOrderAddRq>";
  return wrapQbXmlRequest(opts.qbXmlVersion || "16.0", inner);
}

/** Read-only: company identity of the open company file. */
export function buildCompanyQueryRq(qbXmlVersion = "16.0") {
  return wrapQbXmlRequest(qbXmlVersion, `<CompanyQueryRq requestID="1"></CompanyQueryRq>`);
}

/** Read-only: one sales order by TxnID, with lines. */
export function buildSalesOrderByTxnIdRq(txnId, qbXmlVersion = "16.0") {
  return wrapQbXmlRequest(
    qbXmlVersion,
    `<SalesOrderQueryRq requestID="1"><TxnID>${esc(txnId)}</TxnID><IncludeLineItems>true</IncludeLineItems></SalesOrderQueryRq>`
  );
}

/**
 * Read-only: candidate sales orders for a customer:job modified since a date, used to
 * detect a sales order that QuickBooks created even though the acknowledgment was lost.
 */
export function buildSalesOrderLookupRq({ customer, fromModifiedDate, qbXmlVersion = "16.0" }) {
  const entity = customer.listId
    ? `<EntityFilter><ListID>${esc(customer.listId)}</ListID></EntityFilter>`
    : `<EntityFilter><FullName>${esc(customer.fullName)}</FullName></EntityFilter>`;
  return wrapQbXmlRequest(
    qbXmlVersion,
    `<SalesOrderQueryRq requestID="1">` +
      `<ModifiedDateRangeFilter><FromModifiedDate>${esc(fromModifiedDate)}</FromModifiedDate></ModifiedDateRangeFilter>` +
      entity +
      `<IncludeLineItems>true</IncludeLineItems></SalesOrderQueryRq>`
  );
}

function normalizeSalesOrderRet(ret) {
  const lines = asArray(ret.SalesOrderLineRet).map((l) => ({
    itemListId: text(l?.ItemRef?.ListID),
    itemFullName: text(l?.ItemRef?.FullName),
    description: text(l?.Desc),
    amountCents: toCents(l?.Amount),
    classFullName: text(l?.ClassRef?.FullName),
    salesTaxCodeFullName: text(l?.SalesTaxCodeRef?.FullName)
  }));
  return {
    txnId: text(ret.TxnID),
    refNumber: text(ret.RefNumber),
    externalGuid: text(ret.ExternalGUID),
    memo: text(ret.Memo),
    customerFullName: text(ret?.CustomerRef?.FullName),
    subtotalCents: toCents(ret.Subtotal),
    salesTaxTotalCents: toCents(ret.SalesTaxTotal),
    totalAmountCents: toCents(ret.TotalAmount),
    lines
  };
}

/** @returns {{ statusCode: number|null, statusMessage: string|null, ret: ReturnType<typeof normalizeSalesOrderRet>|null }} */
export function parseSalesOrderAddRs(xml) {
  const parsed = parseQbXmlResponse(xml);
  const { statuses, records } = extractRetRecords(parsed, "SalesOrderAddRs", "SalesOrderRet");
  const st = statuses[0] || { statusCode: null, statusMessage: null };
  return { statusCode: st.statusCode, statusMessage: st.statusMessage, ret: records[0] ? normalizeSalesOrderRet(records[0]) : null };
}

export function parseSalesOrderQueryRs(xml) {
  const parsed = parseQbXmlResponse(xml);
  const { statuses, records } = extractRetRecords(parsed, "SalesOrderQueryRs", "SalesOrderRet");
  const st = statuses[0] || { statusCode: null, statusMessage: null };
  return { statusCode: st.statusCode, statusMessage: st.statusMessage, rets: records.map(normalizeSalesOrderRet) };
}

export function parseCompanyQueryRs(xml) {
  const parsed = parseQbXmlResponse(xml);
  const msgs = parsed?.QBXML?.QBXMLMsgsRs ?? {};
  const rs = asArray(msgs.CompanyQueryRs)[0];
  const st = extractQueryStatus(rs);
  const ret = asArray(rs?.CompanyRet)[0] || null;
  return { statusCode: st.statusCode, statusMessage: st.statusMessage, companyName: text(ret?.CompanyName) };
}

/**
 * Compare QuickBooks read-back with the plan. Tax is reported, never assumed: any
 * QuickBooks-computed sales tax is flagged because the tax policy is not yet decided.
 * @param {ReturnType<import("./studioSalesOrderPlan.mjs").buildStudioSalesOrderPlan>} plan
 * @param {ReturnType<typeof normalizeSalesOrderRet>} ret
 */
export function reconcileSalesOrder(plan, ret) {
  /** @type {Array<{ code: string, message: string }>} */
  const mismatches = [];
  const qbLines = (ret.lines || []).filter((l) => l.itemListId || l.itemFullName);
  if (qbLines.length !== plan.lines.length) {
    mismatches.push({ code: "line_count", message: `QuickBooks has ${qbLines.length} lines; expected ${plan.lines.length}.` });
  } else {
    plan.lines.forEach((l, i) => {
      const q = qbLines[i];
      const sameItem = l.itemListId ? q.itemListId === l.itemListId : q.itemFullName === l.itemFullName;
      if (!sameItem || q.amountCents !== l.amountCents) {
        const label = (x) => x.itemFullName || x.itemListId;
        mismatches.push({
          code: "line_mismatch",
          message: `Line ${i + 1}: QuickBooks ${label(q)} ${money(q.amountCents)}; expected ${label(l)} ${money(l.amountCents)}.`
        });
      }
    });
  }
  if (ret.subtotalCents !== plan.totalCents) {
    mismatches.push({
      code: "subtotal_mismatch",
      message: `QuickBooks subtotal ${money(ret.subtotalCents)}; accepted ${money(plan.totalCents)}.`
    });
  }
  if ((ret.salesTaxTotalCents || 0) !== 0) {
    mismatches.push({
      code: "sales_tax_added",
      message: `QuickBooks added ${money(ret.salesTaxTotalCents)} sales tax; tax policy must confirm whether the accepted price includes tax.`
    });
  }
  if (plan.externalGuid && ret.externalGuid && ret.externalGuid.toUpperCase() !== plan.externalGuid.toUpperCase()) {
    mismatches.push({ code: "external_guid_mismatch", message: "QuickBooks sales order belongs to a different eliteOS request." });
  }
  return { ok: mismatches.length === 0, mismatches, taxCents: ret.salesTaxTotalCents ?? null };
}

export function findSalesOrderForPlan(plan, rets) {
  return (
    rets.find((r) => r.externalGuid && r.externalGuid.toUpperCase() === plan.externalGuid.toUpperCase()) ||
    rets.find((r) => r.memo && r.memo.includes(plan.memoMarker)) ||
    null
  );
}
