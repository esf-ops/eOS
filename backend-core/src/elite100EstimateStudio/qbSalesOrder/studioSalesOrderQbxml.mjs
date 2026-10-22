/**
 * qbXML for Studio sales orders: SalesOrderAdd, lookup/read-back queries, company check.
 * Element order follows the qbXML schema (SalesOrderAdd / SalesOrderLineAdd sequences).
 */

import { XMLParser } from "fast-xml-parser";

import { extractQueryStatus, extractRetRecords, wrapQbXmlRequest } from "../../quickbooks/live/quickBooksLiveQbxml.js";

// Tag values stay strings: QuickBooks ListIDs such as "8000021E-1635950935" are valid
// scientific notation and would otherwise parse to 0.
const responseParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  isArray: (name) => /Ret$/.test(name) || name === "SalesOrderLineRet"
});

function parseQbXmlResponse(xml) {
  if (typeof xml !== "string" || !xml.trim()) throw new Error("Empty QuickBooks response.");
  const trimmed = xml.replace(/^\uFEFF/, "").trim();
  if (!trimmed.includes("<")) throw new Error(`QuickBooks returned a non-XML response (${trimmed.length} chars).`);
  return responseParser.parse(trimmed);
}

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
  const ref = (tag, r) => (r ? listOrNameRef(tag, r.listId, r.fullName) : "");
  const lines = plan.lines
    .map((l) =>
      l.kind === "description_only"
        ? `<SalesOrderLineAdd><Desc>${esc(l.description)}</Desc></SalesOrderLineAdd>`
        : "<SalesOrderLineAdd>" +
          listOrNameRef("ItemRef", l.itemListId, l.itemFullName) +
          `<Desc>${esc(l.description)}</Desc>` +
          `<Quantity>${l.quantity}</Quantity>` +
          listOrNameRef("ClassRef", l.classListId, l.classFullName) +
          `<Amount>${money(l.amountCents)}</Amount>` +
          listOrNameRef("SalesTaxCodeRef", l.salesTaxCodeListId, l.salesTaxCodeFullName) +
          "</SalesOrderLineAdd>"
    )
    .join("");
  const txnDate = opts.txnDate || plan.txnDate;
  const inner =
    `<SalesOrderAddRq requestID="${esc(opts.requestId || "1")}"><SalesOrderAdd>` +
    listOrNameRef("CustomerRef", plan.customer.listId, plan.customer.fullName) +
    ref("ClassRef", plan.headerClass) +
    ref("TemplateRef", plan.template) +
    (txnDate ? `<TxnDate>${esc(txnDate)}</TxnDate>` : "") +
    ref("TermsRef", plan.terms) +
    ref("ItemSalesTaxRef", plan.itemSalesTax) +
    `<Memo>${esc(plan.memo)}</Memo>` +
    ref("CustomerSalesTaxCodeRef", plan.customerSalesTaxCode) +
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

function refRet(node) {
  return { listId: text(node?.ListID), fullName: text(node?.FullName) };
}

function normalizeSalesOrderRet(ret) {
  const lines = asArray(ret.SalesOrderLineRet).map((l) => {
    const qty = text(l?.Quantity);
    return {
      itemListId: text(l?.ItemRef?.ListID),
      itemFullName: text(l?.ItemRef?.FullName),
      description: text(l?.Desc),
      quantity: qty == null ? null : Number(qty),
      amountCents: toCents(l?.Amount),
      classListId: text(l?.ClassRef?.ListID),
      classFullName: text(l?.ClassRef?.FullName),
      salesTaxCodeListId: text(l?.SalesTaxCodeRef?.ListID),
      salesTaxCodeFullName: text(l?.SalesTaxCodeRef?.FullName)
    };
  });
  return {
    txnId: text(ret.TxnID),
    refNumber: text(ret.RefNumber),
    externalGuid: text(ret.ExternalGUID),
    memo: text(ret.Memo),
    txnDate: text(ret.TxnDate),
    isManuallyClosed: text(ret.IsManuallyClosed) === "true",
    customer: refRet(ret.CustomerRef),
    customerFullName: text(ret?.CustomerRef?.FullName),
    headerClass: refRet(ret.ClassRef),
    template: refRet(ret.TemplateRef),
    terms: refRet(ret.TermsRef),
    itemSalesTax: refRet(ret.ItemSalesTaxRef),
    customerSalesTaxCode: refRet(ret.CustomerSalesTaxCodeRef),
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

function norm(v) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** ListID when the plan has one; otherwise FullName. A planned absent ref must be absent. */
function sameRef(planListId, planFullName, retListId, retFullName) {
  if (planListId) return retListId === planListId;
  if (planFullName) return norm(retFullName) === norm(planFullName);
  return !retListId && !retFullName;
}

const refLabel = (listId, fullName) => fullName || listId || "(none)";

/**
 * Compare QuickBooks read-back with the plan field by field: customer, class, template,
 * date, terms, sales tax item, customer tax code, memo, ExternalGUID, open status, every
 * line (description, item, quantity, amount, class, tax code; description-only lines must
 * have no item or amount), subtotal, sales tax and total.
 * @param {ReturnType<import("./studioSalesOrderPlan.mjs").buildStudioSalesOrderPlan>} plan
 * @param {ReturnType<typeof normalizeSalesOrderRet>} ret
 */
export function reconcileSalesOrder(plan, ret) {
  /** @type {Array<{ code: string, field?: string, message: string }>} */
  const mismatches = [];
  const miss = (code, field, message) => mismatches.push({ code, field, message });
  const header = [
    ["customer", plan.customer, ret.customer || { listId: null, fullName: ret.customerFullName }],
    ["class", plan.headerClass, ret.headerClass],
    ["template", plan.template, ret.template],
    ["terms", plan.terms, ret.terms],
    ["itemSalesTax", plan.itemSalesTax, ret.itemSalesTax],
    ["customerSalesTaxCode", plan.customerSalesTaxCode, ret.customerSalesTaxCode]
  ];
  for (const [field, p, r] of header) {
    if (!sameRef(p?.listId, p?.fullName, r?.listId, r?.fullName)) {
      miss("header_mismatch", field, `${field}: QuickBooks ${refLabel(r?.listId, r?.fullName)}; expected ${refLabel(p?.listId, p?.fullName)}.`);
    }
  }
  if (plan.txnDate && ret.txnDate !== plan.txnDate) miss("header_mismatch", "txnDate", `TxnDate: QuickBooks ${ret.txnDate}; expected ${plan.txnDate}.`);
  if ((ret.memo ?? "") !== plan.memo) miss("header_mismatch", "memo", "Memo differs from the planned memo.");
  if (ret.isManuallyClosed === true) miss("header_mismatch", "isManuallyClosed", "Sales order is closed in QuickBooks.");
  if (plan.externalGuid && (ret.externalGuid || "").toUpperCase() !== plan.externalGuid.toUpperCase()) {
    miss("external_guid_mismatch", "externalGuid", "QuickBooks sales order belongs to a different eliteOS request.");
  }

  const qbLines = ret.lines || [];
  if (qbLines.length !== plan.lines.length) {
    miss("line_count", "lines", `QuickBooks has ${qbLines.length} lines; expected ${plan.lines.length}.`);
  } else {
    plan.lines.forEach((l, i) => {
      const q = qbLines[i];
      const at = `Line ${i + 1}`;
      if ((q.description ?? "") !== l.description) miss("line_mismatch", `lines[${i}].description`, `${at}: description differs.`);
      if (l.kind === "description_only") {
        if (q.itemListId || q.itemFullName || (q.amountCents ?? 0) !== 0) {
          miss("line_mismatch", `lines[${i}].item`, `${at}: expected a description-only line; QuickBooks has ${refLabel(q.itemListId, q.itemFullName)} ${money(q.amountCents)}.`);
        }
        return;
      }
      if (!sameRef(l.itemListId, l.itemFullName, q.itemListId, q.itemFullName)) {
        miss("line_mismatch", `lines[${i}].item`, `${at}: QuickBooks item ${refLabel(q.itemListId, q.itemFullName)}; expected ${refLabel(l.itemListId, l.itemFullName)}.`);
      }
      if (q.amountCents !== l.amountCents) miss("line_mismatch", `lines[${i}].amount`, `${at}: QuickBooks ${money(q.amountCents)}; expected ${money(l.amountCents)}.`);
      if (q.quantity != null && q.quantity !== l.quantity) miss("line_mismatch", `lines[${i}].quantity`, `${at}: QuickBooks quantity ${q.quantity}; expected ${l.quantity}.`);
      if (!sameRef(l.classListId, l.classFullName, q.classListId, q.classFullName)) {
        miss("line_mismatch", `lines[${i}].class`, `${at}: QuickBooks class ${refLabel(q.classListId, q.classFullName)}; expected ${refLabel(l.classListId, l.classFullName)}.`);
      }
      if (!sameRef(l.salesTaxCodeListId, l.salesTaxCodeFullName, q.salesTaxCodeListId, q.salesTaxCodeFullName)) {
        miss("line_mismatch", `lines[${i}].salesTaxCode`, `${at}: QuickBooks tax code ${refLabel(q.salesTaxCodeListId, q.salesTaxCodeFullName)}; expected ${refLabel(l.salesTaxCodeListId, l.salesTaxCodeFullName)}.`);
      }
    });
  }

  const expectedTax = plan.expectedSalesTaxCents ?? 0;
  const expectedTotal = plan.expectedTotalCents ?? plan.totalCents;
  if (ret.subtotalCents !== plan.subtotalCents) {
    miss("subtotal_mismatch", "subtotal", `QuickBooks subtotal ${money(ret.subtotalCents)}; expected ${money(plan.subtotalCents)}.`);
  }
  if ((ret.salesTaxTotalCents || 0) !== expectedTax) {
    miss(
      (ret.salesTaxTotalCents || 0) > expectedTax ? "sales_tax_added" : "sales_tax_mismatch",
      "salesTaxTotal",
      `QuickBooks sales tax ${money(ret.salesTaxTotalCents)}; expected ${money(expectedTax)}.`
    );
  }
  if (ret.totalAmountCents != null && ret.totalAmountCents !== expectedTotal) {
    miss("total_mismatch", "totalAmount", `QuickBooks total ${money(ret.totalAmountCents)}; expected ${money(expectedTotal)}.`);
  }
  if (plan.kind !== "synthetic_tax_scenario" && ret.totalAmountCents != null && ret.totalAmountCents > plan.acceptedTotalCents) {
    miss("accepted_total_exceeded", "totalAmount", `QuickBooks total ${money(ret.totalAmountCents)} exceeds the accepted ${money(plan.acceptedTotalCents)}.`);
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
