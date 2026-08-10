/**
 * QuickBooks live read client — transport boundary for slabOS.
 *
 * Exposes QUERY/READ methods only. No EstimateAdd / InvoiceAdd / SalesOrderAdd /
 * ReceivePaymentAdd / TxnDel / ListAdd / ListMod / raw write escape hatch.
 */

import { loadQuickBooksGatewayConfig, assertQuickBooksLiveReadReady } from "./quickBooksGatewayConfig.js";
import { createQuickBooksGatewayHttpTransport } from "./quickBooksGatewayHttpTransport.js";
import {
  ALLOWED_QBXML_REQUEST_TAGS,
  FORBIDDEN_QBXML_REQUEST_TAGS,
  assertReadOnlyQbXml,
  buildEstimateLinkedQuery,
  buildHostQuery,
  buildInvoiceLinkedQuery,
  buildListQuery,
  buildReceivePaymentQuery,
  buildSalesOrderLinkedQuery,
  extractListSummary,
  extractQueryStatus,
  extractRetRecords,
  extractTxnLinkSummary,
  parseQbXmlResponse,
} from "./quickBooksLiveQbxml.js";

/** Public method names — tests assert write-shaped names are absent. */
export const QUICKBOOKS_LIVE_READ_PUBLIC_METHODS = Object.freeze([
  "describe",
  "pingHost",
  "queryEstimatesWithLinks",
  "querySalesOrdersWithLinks",
  "queryInvoicesWithLinks",
  "queryReceivePayments",
  "queryTemplates",
  "queryCustomerMsgs",
  "queryPaymentMethods",
  "querySalesTaxCodes",
  "queryItemSalesTaxes",
  "executeReadOnlyQbXml",
]);

const WRITE_METHOD_PATTERN =
  /(EstimateAdd|InvoiceAdd|SalesOrderAdd|ReceivePaymentAdd|TxnDel|ListAdd|ListMod|executeWrite|postWrite|sendWrite|rawWrite)/i;

/**
 * @param {object} client
 * @returns {string[]}
 */
export function findForbiddenWriteMethods(client) {
  const names = Object.keys(client || {});
  return names.filter((name) => WRITE_METHOD_PATTERN.test(name));
}

/**
 * @param {import('./quickBooksGatewayConfig.js').QuickBooksGatewayConfig} [config]
 * @param {{ transport?: import('./quickBooksGatewayHttpTransport.js').QuickBooksGatewayTransport }} [options]
 */
export function createQuickBooksLiveReadClient(config = loadQuickBooksGatewayConfig(), options = {}) {
  const ready = assertQuickBooksLiveReadReady(config);
  const transport = options.transport || createQuickBooksGatewayHttpTransport(ready);

  /**
   * @param {string} qbXml
   */
  async function send(qbXml) {
    assertReadOnlyQbXml(qbXml);
    const result = await transport.postQbXml(qbXml);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`QuickBooks Gateway HTTP ${result.status} (body ${result.body?.length || 0} chars).`);
    }
    return parseQbXmlResponse(result.body);
  }

  /**
   * @param {object} parsed
   * @param {string} queryRsName
   * @param {string} retName
   * @param {(ret: object) => object} mapRet
   */
  function mapQuery(parsed, queryRsName, retName, mapRet) {
    const { statuses, records } = extractRetRecords(parsed, queryRsName, retName);
    const primary = statuses[0] || extractQueryStatus(null);
    if (primary.statusCode != null && primary.statusCode !== 0 && records.length === 0) {
      // status 1 = no matching objects — treat as empty success for probes
      if (primary.statusCode !== 1) {
        throw new Error(
          `${queryRsName} failed: code=${primary.statusCode} ${primary.statusSeverity || ""} ${primary.statusMessage || ""}`.trim()
        );
      }
    }
    return {
      status: primary,
      statuses,
      records: records.map(mapRet),
      recordCount: records.length,
    };
  }

  const client = {
    describe() {
      return {
        mode: "read-only",
        allowedRequestTags: [...ALLOWED_QBXML_REQUEST_TAGS],
        forbiddenRequestTags: [...FORBIDDEN_QBXML_REQUEST_TAGS],
        transport: typeof transport.describe === "function" ? transport.describe() : { transport: "custom" },
        publicMethods: [...QUICKBOOKS_LIVE_READ_PUBLIC_METHODS],
      };
    },

    async pingHost() {
      const parsed = await send(buildHostQuery(ready.qbXmlVersion));
      const { statuses, records } = extractRetRecords(parsed, "HostQueryRs", "HostRet");
      return {
        status: statuses[0] || null,
        hostPresent: records.length > 0,
        productNamePresent: Boolean(records[0]?.ProductName),
      };
    },

    /**
     * @param {{ maxReturned?: number, fromTxnDate?: string|null }} [opts]
     */
    async queryEstimatesWithLinks(opts = {}) {
      const parsed = await send(
        buildEstimateLinkedQuery({
          qbXmlVersion: ready.qbXmlVersion,
          maxReturned: opts.maxReturned ?? ready.defaultTxnLimit,
          fromTxnDate: opts.fromTxnDate ?? ready.probeFromTxnDate,
        })
      );
      return mapQuery(parsed, "EstimateQueryRs", "EstimateRet", (ret) =>
        extractTxnLinkSummary(ret, "Estimate")
      );
    },

    async querySalesOrdersWithLinks(opts = {}) {
      const parsed = await send(
        buildSalesOrderLinkedQuery({
          qbXmlVersion: ready.qbXmlVersion,
          maxReturned: opts.maxReturned ?? ready.defaultTxnLimit,
          fromTxnDate: opts.fromTxnDate ?? ready.probeFromTxnDate,
        })
      );
      return mapQuery(parsed, "SalesOrderQueryRs", "SalesOrderRet", (ret) =>
        extractTxnLinkSummary(ret, "SalesOrder")
      );
    },

    async queryInvoicesWithLinks(opts = {}) {
      const parsed = await send(
        buildInvoiceLinkedQuery({
          qbXmlVersion: ready.qbXmlVersion,
          maxReturned: opts.maxReturned ?? ready.defaultTxnLimit,
          fromTxnDate: opts.fromTxnDate ?? ready.probeFromTxnDate,
        })
      );
      return mapQuery(parsed, "InvoiceQueryRs", "InvoiceRet", (ret) =>
        extractTxnLinkSummary(ret, "Invoice")
      );
    },

    async queryReceivePayments(opts = {}) {
      const parsed = await send(
        buildReceivePaymentQuery({
          qbXmlVersion: ready.qbXmlVersion,
          maxReturned: opts.maxReturned ?? ready.defaultTxnLimit,
          fromTxnDate: opts.fromTxnDate ?? ready.probeFromTxnDate,
        })
      );
      return mapQuery(parsed, "ReceivePaymentQueryRs", "ReceivePaymentRet", (ret) =>
        extractTxnLinkSummary(ret, "ReceivePayment")
      );
    },

    async queryTemplates(opts = {}) {
      const parsed = await send(
        buildListQuery("TemplateQueryRq", {
          qbXmlVersion: ready.qbXmlVersion,
          maxReturned: opts.maxReturned ?? ready.defaultListLimit,
        })
      );
      return mapQuery(parsed, "TemplateQueryRs", "TemplateRet", (ret) =>
        extractListSummary(ret, "Template")
      );
    },

    async queryCustomerMsgs(opts = {}) {
      const parsed = await send(
        buildListQuery("CustomerMsgQueryRq", {
          qbXmlVersion: ready.qbXmlVersion,
          maxReturned: opts.maxReturned ?? ready.defaultListLimit,
        })
      );
      return mapQuery(parsed, "CustomerMsgQueryRs", "CustomerMsgRet", (ret) =>
        extractListSummary(ret, "CustomerMsg")
      );
    },

    async queryPaymentMethods(opts = {}) {
      const parsed = await send(
        buildListQuery("PaymentMethodQueryRq", {
          qbXmlVersion: ready.qbXmlVersion,
          maxReturned: opts.maxReturned ?? ready.defaultListLimit,
        })
      );
      return mapQuery(parsed, "PaymentMethodQueryRs", "PaymentMethodRet", (ret) =>
        extractListSummary(ret, "PaymentMethod")
      );
    },

    async querySalesTaxCodes(opts = {}) {
      const parsed = await send(
        buildListQuery("SalesTaxCodeQueryRq", {
          qbXmlVersion: ready.qbXmlVersion,
          maxReturned: opts.maxReturned ?? ready.defaultListLimit,
        })
      );
      return mapQuery(parsed, "SalesTaxCodeQueryRs", "SalesTaxCodeRet", (ret) =>
        extractListSummary(ret, "SalesTaxCode")
      );
    },

    async queryItemSalesTaxes(opts = {}) {
      const parsed = await send(
        buildListQuery("ItemSalesTaxQueryRq", {
          qbXmlVersion: ready.qbXmlVersion,
          maxReturned: opts.maxReturned ?? ready.defaultListLimit,
        })
      );
      return mapQuery(parsed, "ItemSalesTaxQueryRs", "ItemSalesTaxRet", (ret) =>
        extractListSummary(ret, "ItemSalesTax")
      );
    },

    /**
     * Escape hatch for additional *read-only* QBXML already validated by assertReadOnlyQbXml.
     * Still rejects write tags. Does not accept arbitrary "send anything" without allowlist.
     * @param {string} qbXml
     */
    async executeReadOnlyQbXml(qbXml) {
      assertReadOnlyQbXml(qbXml);
      const parsed = await send(qbXml);
      return { parsed };
    },
  };

  // Freeze surface so callers cannot monkey-patch write methods onto the instance easily.
  return Object.freeze(client);
}
