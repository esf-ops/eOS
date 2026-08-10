/**
 * Bounded QuickBooks live read probe.
 *
 * Requests only the data gaps identified in offline Estimate/Sales-truth discovery:
 * LinkedTxn on Estimates/SOs/Invoices, payment applications, and missing reference lists.
 *
 * Writes sanitized artifacts under debug/quickbooks/live-read-probe/ (gitignored).
 * Never logs passwords. Never writes to QuickBooks.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  loadQuickBooksGatewayConfig,
  summarizeGatewayConfig,
  QUICKBOOKS_LIVE_READ_ENV_VARS,
} from "./quickBooksGatewayConfig.js";
import { createQuickBooksLiveReadClient } from "./quickBooksLiveReadClient.js";
import { compareLiveLinksToInferred } from "./compareLiveLinksToInferred.js";

/**
 * Default FromTxnDate = 90 days ago (YYYY-MM-DD) when not configured.
 * @param {Date} [now]
 */
export function defaultProbeFromTxnDate(now = new Date()) {
  const d = new Date(now.getTime() - 90 * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Sanitize a txn link summary for artifact output (no names/memos/addresses).
 * @param {object} record
 */
export function sanitizeLiveTxnArtifact(record) {
  return {
    txnType: record.txnType,
    qb_txn_id: record.qb_txn_id,
    ref_number: record.ref_number,
    txn_date: record.txn_date,
    qb_customer_list_id: record.qb_customer_list_id,
    total_amount: record.total_amount,
    linked_txns: (record.linked_txns || []).map((l) => ({
      qb_txn_id: l.qb_txn_id,
      txn_type: l.txn_type,
    })),
    applied_to_txns: (record.applied_to_txns || []).map((a) => ({
      qb_txn_id: a.qb_txn_id,
      txn_type: a.txn_type,
      amount: a.amount ?? null,
    })),
    memo_estimate_refs: record.memo_estimate_refs || [],
  };
}

/**
 * @param {object} listResult
 */
export function sanitizeListArtifact(listResult) {
  return {
    status: listResult.status,
    recordCount: listResult.recordCount,
    listIds: (listResult.records || [])
      .map((r) => r.qb_list_id)
      .filter(Boolean)
      .sort(),
    activeCount: (listResult.records || []).filter((r) => r.is_active === true).length,
    inactiveCount: (listResult.records || []).filter((r) => r.is_active === false).length,
  };
}

/**
 * @param {{
 *   outputDir?: string,
 *   client?: ReturnType<typeof createQuickBooksLiveReadClient>,
 *   config?: import('./quickBooksGatewayConfig.js').QuickBooksGatewayConfig,
 *   inferredLinks?: import('./compareLiveLinksToInferred.js').InferredEstimateLinks[],
 *   onProgress?: (msg: string) => void,
 * }} [options]
 */
export async function runQuickBooksLiveReadProbe(options = {}) {
  const config = options.config || loadQuickBooksGatewayConfig();
  const log = options.onProgress || (() => {});
  const outputDir =
    options.outputDir ||
    path.resolve(process.cwd(), "debug/quickbooks/live-read-probe");

  await fs.mkdir(outputDir, { recursive: true });

  const client = options.client || createQuickBooksLiveReadClient(config);
  const fromTxnDate = config.probeFromTxnDate || defaultProbeFromTxnDate();
  const txnLimit = config.defaultTxnLimit;
  const listLimit = config.defaultListLimit;

  const connectionSummary = {
    generatedAt: new Date().toISOString(),
    mode: "read-only-probe",
    envVarsExpected: [...QUICKBOOKS_LIVE_READ_ENV_VARS],
    gateway: summarizeGatewayConfig({
      ...config,
      gatewayUrl: config.gatewayUrl,
    }),
    client: client.describe(),
    bounds: { txnLimit, listLimit, fromTxnDate },
    notes: [
      "Transport speaks CData QuickBooks Desktop Gateway HTTP+QBXML (Basic Auth).",
      "No commercial CData JDBC/ODBC/ADO.NET driver package is required in Node for this probe.",
      "Gateway must already be installed/running on the QuickBooks host.",
      "No write operations are available on the live read client.",
    ],
  };

  /** @type {Record<string, object>} */
  const sectionErrors = {};

  async function safe(name, fn) {
    log(name);
    try {
      return await fn();
    } catch (err) {
      const message = String(err?.message || err);
      // Never echo connection strings / passwords if somehow present
      const scrubbed = message
        .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic ***")
        .replace(/password[=:]\s*\S+/gi, "password=***");
      sectionErrors[name] = scrubbed;
      return null;
    }
  }

  const host = await safe("pingHost", () => client.pingHost());
  connectionSummary.hostProbe = host;
  connectionSummary.sectionErrors = sectionErrors;

  const estimates = await safe("queryEstimatesWithLinks", () =>
    client.queryEstimatesWithLinks({ maxReturned: txnLimit, fromTxnDate })
  );
  const salesOrders = await safe("querySalesOrdersWithLinks", () =>
    client.querySalesOrdersWithLinks({ maxReturned: txnLimit, fromTxnDate })
  );
  const invoices = await safe("queryInvoicesWithLinks", () =>
    client.queryInvoicesWithLinks({ maxReturned: txnLimit, fromTxnDate })
  );
  const payments = await safe("queryReceivePayments", () =>
    client.queryReceivePayments({ maxReturned: txnLimit, fromTxnDate })
  );

  const templates = await safe("queryTemplates", () =>
    client.queryTemplates({ maxReturned: listLimit })
  );
  const customerMsgs = await safe("queryCustomerMsgs", () =>
    client.queryCustomerMsgs({ maxReturned: listLimit })
  );
  const paymentMethods = await safe("queryPaymentMethods", () =>
    client.queryPaymentMethods({ maxReturned: listLimit })
  );
  const salesTaxCodes = await safe("querySalesTaxCodes", () =>
    client.querySalesTaxCodes({ maxReturned: listLimit })
  );
  const itemSalesTaxes = await safe("queryItemSalesTaxes", () =>
    client.queryItemSalesTaxes({ maxReturned: listLimit })
  );

  const estimateLinks = {
    generatedAt: new Date().toISOString(),
    query: { maxReturned: txnLimit, fromTxnDate, includeLinkedTxns: true },
    status: estimates?.status ?? null,
    recordCount: estimates?.recordCount ?? 0,
    records: (estimates?.records || []).map(sanitizeLiveTxnArtifact),
    error: sectionErrors.queryEstimatesWithLinks || null,
  };

  const salesOrderLinks = {
    generatedAt: new Date().toISOString(),
    query: { maxReturned: txnLimit, fromTxnDate, includeLinkedTxns: true },
    status: salesOrders?.status ?? null,
    recordCount: salesOrders?.recordCount ?? 0,
    records: (salesOrders?.records || []).map(sanitizeLiveTxnArtifact),
    error: sectionErrors.querySalesOrdersWithLinks || null,
  };

  const invoiceLinks = {
    generatedAt: new Date().toISOString(),
    query: { maxReturned: txnLimit, fromTxnDate, includeLinkedTxns: true },
    status: invoices?.status ?? null,
    recordCount: invoices?.recordCount ?? 0,
    records: (invoices?.records || []).map(sanitizeLiveTxnArtifact),
    error: sectionErrors.queryInvoicesWithLinks || null,
  };

  const paymentApplications = {
    generatedAt: new Date().toISOString(),
    query: { maxReturned: txnLimit, fromTxnDate },
    status: payments?.status ?? null,
    recordCount: payments?.recordCount ?? 0,
    records: (payments?.records || []).map(sanitizeLiveTxnArtifact),
    appliedToCount: (payments?.records || []).reduce(
      (n, r) => n + (r.applied_to_txns?.length || 0),
      0
    ),
    error: sectionErrors.queryReceivePayments || null,
  };

  const referenceListsSummary = {
    generatedAt: new Date().toISOString(),
    listLimit,
    templates: templates ? sanitizeListArtifact(templates) : { error: sectionErrors.queryTemplates },
    customerMsgs: customerMsgs
      ? sanitizeListArtifact(customerMsgs)
      : { error: sectionErrors.queryCustomerMsgs },
    paymentMethods: paymentMethods
      ? sanitizeListArtifact(paymentMethods)
      : { error: sectionErrors.queryPaymentMethods },
    salesTaxCodes: salesTaxCodes
      ? sanitizeListArtifact(salesTaxCodes)
      : { error: sectionErrors.querySalesTaxCodes },
    itemSalesTaxes: itemSalesTaxes
      ? sanitizeListArtifact(itemSalesTaxes)
      : { error: sectionErrors.queryItemSalesTaxes },
  };

  const liveRecords = [
    ...(estimates?.records || []),
    ...(salesOrders?.records || []),
    ...(invoices?.records || []),
    ...(payments?.records || []),
  ].map(sanitizeLiveTxnArtifact);

  const linkComparison = compareLiveLinksToInferred({
    liveRecords,
    inferredLinks: options.inferredLinks || [],
  });

  connectionSummary.sectionErrors = sectionErrors;
  connectionSummary.success =
    Object.keys(sectionErrors).filter((k) => k !== "pingHost").length < 4 &&
    Boolean(estimates || salesOrders || invoices);

  const artifacts = {
    "connection-summary.json": connectionSummary,
    "estimate-links.json": estimateLinks,
    "sales-order-links.json": salesOrderLinks,
    "invoice-links.json": invoiceLinks,
    "payment-applications.json": paymentApplications,
    "reference-lists-summary.json": referenceListsSummary,
    "live-vs-inferred-comparison.json": linkComparison,
  };

  for (const [name, payload] of Object.entries(artifacts)) {
    await fs.writeFile(path.join(outputDir, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  return {
    outputDir,
    artifacts: Object.keys(artifacts),
    connectionSummary,
    counts: {
      estimates: estimateLinks.recordCount,
      salesOrders: salesOrderLinks.recordCount,
      invoices: invoiceLinks.recordCount,
      payments: paymentApplications.recordCount,
    },
    linkComparisonCounts: linkComparison.counts,
    sectionErrors,
  };
}
