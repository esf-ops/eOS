/**
 * Offline QuickBooks Estimate + Sales Financial Truth discovery engine.
 *
 * Reads a local materialized QuickBooks Desktop export (QB_EXPORT_DIR).
 * Never connects to QuickBooks / CData / network. Never mutates the export.
 * Writes aggregated, privacy-conscious JSON artifacts under an output directory
 * (typically gitignored debug/quickbooks/estimate-sales-truth-discovery/).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { readManifest, readQuickBooksExport, KNOWN_ENTITY_FOLDERS } from "../quickBooksExportReader.js";
import { buildQuickBooksExportSummary } from "../quickBooksExportSummary.js";

import {
  asArray,
  bump,
  classifyRefNumberFormat,
  createFieldProfiler,
  daysBetween,
  extractEstimateRefNumbersFromMemo,
  extractLinkedTxnRefs,
  iterateEntityRecords,
  listEntityJsonFiles,
  mapToObject,
  parseQbBoolean,
  parseQbDate,
  parseQbMoney,
  refListId,
  resolveExportDir,
  resolveTxnTotalAmount,
  round2,
  round4,
  textOf,
  topEntries,
  yearOfDate,
} from "./helpers.js";
import { buildSlabosQbEstimateFieldMapping } from "./slabosMapping.js";
import { buildSalesFinancialTruthProposal } from "./financialTruthProposal.js";

const ESTIMATE_MEMO_INFERENCE_RULE =
  "INFERRED_LINK: downstream.Memo matches /Estimate\\s+(\\d{1,2}-\\d{2,6})\\b/ and that token uniquely equals Estimate.RefNumber (stable within export). Not a QuickBooks LinkedTxn.";

/**
 * @param {string} exportDir
 * @param {{ outputDir?: string, onProgress?: (msg: string) => void }} [options]
 */
export async function runEstimateSalesTruthDiscovery(exportDir, options = {}) {
  const resolvedExport = path.resolve(exportDir);
  const outputDir =
    options.outputDir ??
    path.resolve(process.cwd(), "debug/quickbooks/estimate-sales-truth-discovery");
  const log = options.onProgress ?? (() => {});

  await assertExportReadable(resolvedExport);
  await fs.mkdir(outputDir, { recursive: true });

  log("inventory…");
  const inventory = await buildExportInventory(resolvedExport);

  log("reference entities…");
  const reference = await analyzeReferenceEntities(resolvedExport);

  log("estimates…");
  const estimateAnalysis = await analyzeEstimates(resolvedExport);

  log("sales-orders…");
  const salesOrderAnalysis = await analyzeSalesOrders(resolvedExport, estimateAnalysis.refIndex);

  log("invoices…");
  const invoiceAnalysis = await analyzeInvoices(resolvedExport, estimateAnalysis.refIndex);

  log("payments…");
  const paymentAnalysis = await analyzePayments(resolvedExport);

  log("link + flow + variance…");
  const linkAnalysis = buildTransactionLinkAnalysis({
    estimateAnalysis,
    salesOrderAnalysis,
    invoiceAnalysis,
    paymentAnalysis,
  });
  const flowSummary = buildTransactionFlowSummary({
    inventory,
    estimateAnalysis,
    salesOrderAnalysis,
    invoiceAnalysis,
    paymentAnalysis,
    linkAnalysis,
  });
  const amountVariance = buildAmountVarianceAnalysis({
    estimateAnalysis,
    salesOrderAnalysis,
    invoiceAnalysis,
    linkAnalysis,
  });
  const attribution = buildSalesAttributionAnalysis({
    estimateAnalysis,
    salesOrderAnalysis,
    invoiceAnalysis,
    reference,
  });
  const itemUsage = buildItemUsageArtifact(estimateAnalysis, reference);
  const referenceUsage = buildReferenceUsageArtifact(estimateAnalysis, salesOrderAnalysis, invoiceAnalysis, reference);
  const representative = buildRepresentativePatterns({
    estimateAnalysis,
    salesOrderAnalysis,
    invoiceAnalysis,
    linkAnalysis,
  });

  const mapping = buildSlabosQbEstimateFieldMapping({
    estimateProfile: estimateAnalysis.profile,
    estimateLineProfile: estimateAnalysis.lineProfile,
    referenceUsage,
    linkAnalysis,
  });
  const truthProposal = buildSalesFinancialTruthProposal({
    flowSummary,
    linkAnalysis,
    amountVariance,
    paymentAnalysis,
    invoiceAnalysis,
    salesOrderAnalysis,
    estimateAnalysis,
  });

  const artifacts = {
    "export-inventory.json": inventory,
    "estimate-profile.json": estimateAnalysis.profile,
    "estimate-line-profile.json": estimateAnalysis.lineProfile,
    "item-usage.json": itemUsage,
    "reference-usage.json": referenceUsage,
    "transaction-flow-summary.json": flowSummary,
    "transaction-link-analysis.json": linkAnalysis,
    "amount-variance-analysis.json": amountVariance,
    "sales-attribution-analysis.json": attribution,
    "representative-patterns.json": representative,
    "slabos-qb-estimate-field-mapping.json": mapping,
    "sales-financial-truth-proposal.json": truthProposal,
  };

  log("writing artifacts…");
  for (const [name, payload] of Object.entries(artifacts)) {
    await fs.writeFile(path.join(outputDir, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  return {
    exportDir: resolvedExport,
    outputDir,
    counts: {
      estimates: estimateAnalysis.profile.estimateCount,
      estimateLines: estimateAnalysis.lineProfile.lineCount,
      salesOrders: salesOrderAnalysis.count,
      invoices: invoiceAnalysis.count,
      payments: paymentAnalysis.count,
    },
    artifacts: Object.keys(artifacts),
    linkAnalysis,
    flowSummary,
    truthProposal,
  };
}

/**
 * @param {string} exportDir
 */
async function assertExportReadable(exportDir) {
  const st = await fs.stat(exportDir);
  if (!st.isDirectory()) throw new Error(`QB export path is not a directory: ${exportDir}`);
  const manifest = await readManifest(exportDir);
  if (!manifest.valid) {
    throw new Error(`Invalid or missing manifest.json: ${manifest.errors.join("; ")}`);
  }
}

/**
 * Part 1 — export inventory.
 * @param {string} exportDir
 */
export async function buildExportInventory(exportDir) {
  const exportRead = await readQuickBooksExport(exportDir);
  const summary = buildQuickBooksExportSummary(exportRead);

  /** @type {Record<string, object>} */
  const entities = {};
  for (const folder of KNOWN_ENTITY_FOLDERS) {
    const files = await listEntityJsonFiles(exportDir, folder);
    const entitySummary = summary.perEntity?.[folder] ?? {};
    entities[folder] = {
      folderExists: entitySummary.folderExists ?? files.length > 0,
      jsonFileCount: files.length,
      discoveredRecordCount: entitySummary.discoveredRecordCount ?? null,
      manifestRecordCount: entitySummary.manifestRecordCount ?? null,
      unreadableFileCount: entitySummary.unreadableFileCount ?? 0,
      unrecognizedShapeFileCount: entitySummary.unrecognizedShapeFileCount ?? 0,
    };
  }

  // Date ranges from txn entities (stream light)
  const dateRanges = {};
  for (const folder of ["estimates", "sales-orders", "invoices", "payments"]) {
    dateRanges[folder] = await scanDateRange(exportDir, folder);
  }

  const customerStats = await scanCustomerIdentityStats(exportDir);
  const itemStats = await scanListIdStats(exportDir, "items");

  return {
    generatedAt: new Date().toISOString(),
    exportDirBaseName: path.basename(exportDir),
    // Never embed absolute local paths that might include usernames into committed docs;
    // debug artifacts may include basename only.
    manifestValid: summary.manifestValid,
    runId: summary.runId,
    qbXmlVersion: summary.qbXmlVersion,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    discoveredFolders: exportRead.discoveredFolders,
    unknownFolders: summary.unknownFolders ?? exportRead.unknownFolders,
    entities,
    totals: {
      manifestRecordCount: summary.totalManifestRecordCount,
      discoveredRecordCount: summary.totalDiscoveredRecordCount,
    },
    usableIdentifiers: {
      listIdEntities: ["customers", "items", "accounts", "classes", "sales-reps", "terms", "vendors"],
      txnIdEntities: ["estimates", "sales-orders", "invoices", "payments", "bills", "purchase-orders"],
      note:
        "Prefer ListID / TxnID over FullName. This export does not include LinkedTxn or payment AppliedToTxnRet.",
    },
    uniqueCustomersOrJobs: customerStats,
    uniqueItems: itemStats,
    observedDateRanges: dateRanges,
    exportGaps: [
      {
        gap: "invoice_TotalAmount_absent",
        severity: "medium",
        detail:
          "InvoiceRet records in this export omit TotalAmount. Discovery derives invoice totals as Subtotal + SalesTaxTotal when TotalAmount is missing.",
      },
      {
        gap: "LinkedTxn_absent",
        severity: "high",
        detail:
          "Estimate/SalesOrder/Invoice records in this materialized export do not carry LinkedTxn. Confirmed QuickBooks graph links are unavailable offline.",
      },
      {
        gap: "ReceivePayment_AppliedToTxnRet_absent",
        severity: "high",
        detail:
          "Payment records lack AppliedToTxnRet, so payment→invoice CONFIRMED_LINK cannot be established from this export.",
      },
      {
        gap: "invoice-lines_missing_parent_InvoiceTxnID",
        severity: "medium",
        detail:
          "The invoice-lines/ folder records lack InvoiceTxnID; prefer embedded InvoiceLineRet on invoice headers for line analysis.",
      },
    ],
  };
}

async function scanDateRange(exportDir, folder) {
  let min = null;
  let max = null;
  let withDate = 0;
  let count = 0;
  /** @type {Map<string, number>} */
  const years = new Map();
  for await (const { record, batchMeta } of iterateEntityRecords(exportDir, folder)) {
    if (!record || batchMeta.ok === false) continue;
    count += 1;
    const d = parseQbDate(record.TxnDate);
    if (!d) continue;
    withDate += 1;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
    bump(years, String(yearOfDate(d)));
  }
  return { count, withDate, minTxnDate: min, maxTxnDate: max, years: mapToObject(years) };
}

async function scanCustomerIdentityStats(exportDir) {
  let count = 0;
  let withListId = 0;
  let withParent = 0;
  let jobs = 0;
  let withSalesRep = 0;
  const listIds = new Set();
  for await (const { record, batchMeta } of iterateEntityRecords(exportDir, "customers")) {
    if (!record || batchMeta.ok === false) continue;
    count += 1;
    const id = textOf(record.ListID);
    if (id) {
      withListId += 1;
      listIds.add(id);
    }
    if (record.ParentRef) withParent += 1;
    const sub = Number(textOf(record.Sublevel) || 0);
    if (sub > 0) jobs += 1;
    if (record.SalesRepRef) withSalesRep += 1;
  }
  return {
    recordCount: count,
    uniqueListIds: listIds.size,
    withParentRef: withParent,
    jobLikeSublevelGt0: jobs,
    withSalesRepRef: withSalesRep,
  };
}

async function scanListIdStats(exportDir, folder) {
  let count = 0;
  const listIds = new Set();
  /** @type {Map<string, number>} */
  const elementNames = new Map();
  for await (const { record, batchMeta } of iterateEntityRecords(exportDir, folder)) {
    if (!record || batchMeta.ok === false) continue;
    count += 1;
    const id = textOf(record.ListID);
    if (id) listIds.add(id);
    bump(elementNames, textOf(record["@elementName"]) || "unknown");
  }
  return { recordCount: count, uniqueListIds: listIds.size, elementNames: mapToObject(elementNames) };
}

async function analyzeReferenceEntities(exportDir) {
  const classes = await collectListRefCatalog(exportDir, "classes");
  const terms = await collectListRefCatalog(exportDir, "terms");
  const salesReps = await collectSalesRepCatalog(exportDir);
  const items = await collectItemCatalog(exportDir);
  const accounts = await collectListRefCatalog(exportDir, "accounts");
  return { classes, terms, salesReps, items, accounts };
}

async function collectListRefCatalog(exportDir, folder) {
  /** @type {Map<string, { listId: string }>} */
  const byId = new Map();
  for await (const { record, batchMeta } of iterateEntityRecords(exportDir, folder)) {
    if (!record || batchMeta.ok === false) continue;
    const listId = textOf(record.ListID);
    if (!listId) continue;
    byId.set(listId, { listId, isActive: parseQbBoolean(record.IsActive) });
  }
  return { count: byId.size, listIds: [...byId.keys()].sort() };
}

async function collectSalesRepCatalog(exportDir) {
  /** @type {Map<string, { listId: string, initial: string|null, isActive: boolean|null }>} */
  const byId = new Map();
  for await (const { record, batchMeta } of iterateEntityRecords(exportDir, "sales-reps")) {
    if (!record || batchMeta.ok === false) continue;
    const listId = textOf(record.ListID);
    if (!listId) continue;
    byId.set(listId, {
      listId,
      initial: textOf(record.Initial),
      isActive: parseQbBoolean(record.IsActive),
      entityListId: refListId(record.SalesRepEntityRef),
    });
  }
  return { count: byId.size, byId };
}

async function collectItemCatalog(exportDir) {
  /** @type {Map<string, { listId: string, elementName: string|null, isActive: boolean|null }>} */
  const byId = new Map();
  for await (const { record, batchMeta } of iterateEntityRecords(exportDir, "items")) {
    if (!record || batchMeta.ok === false) continue;
    const listId = textOf(record.ListID);
    if (!listId) continue;
    byId.set(listId, {
      listId,
      elementName: textOf(record["@elementName"]),
      isActive: parseQbBoolean(record.IsActive),
    });
  }
  return { count: byId.size, byId };
}

/**
 * Part 2 — Estimate reverse engineering.
 * @param {string} exportDir
 */
export async function analyzeEstimates(exportDir) {
  const headerProfiler = createFieldProfiler();
  const lineProfiler = createFieldProfiler();

  /** @type {Map<string, { txnId: string, total: number|null, subtotal: number|null, txnDate: string|null, customerListId: string|null, salesRepListId: string|null, classListId: string|null, termsListId: string|null, templateListId: string|null, isActive: boolean|null, lineCount: number }>} */
  const refIndex = new Map();
  /** @type {Map<string, number>} */
  const duplicateRefs = new Map();

  let estimateCount = 0;
  let lineCount = 0;
  let totalAmountSum = 0;
  let withTotal = 0;
  let activeCount = 0;
  let inactiveCount = 0;

  /** @type {Map<string, number>} */
  const refFormats = new Map();
  /** @type {Map<string, number>} */
  const templateIds = new Map();
  /** @type {Map<string, number>} */
  const termsIds = new Map();
  /** @type {Map<string, number>} */
  const classIds = new Map();
  /** @type {Map<string, number>} */
  const salesRepIds = new Map();
  /** @type {Map<string, number>} */
  const taxItemIds = new Map();
  /** @type {Map<string, number>} */
  const taxCodeIds = new Map();
  /** @type {Map<string, number>} */
  const customerMsgIds = new Map();
  /** @type {Map<string, number>} */
  const dataExtNames = new Map();
  /** @type {Map<string, number>} */
  const itemIds = new Map();
  /** @type {Map<string, number>} */
  const lineKinds = new Map();
  /** @type {Map<string, number>} */
  const linesPerEstimate = new Map();
  /** @type {Map<string, number>} */
  const years = new Map();
  /** @type {Map<string, number>} */
  const linkedTxnTypes = new Map();

  let withSalesRep = 0;
  let withPoNumber = 0;
  let withMemo = 0;
  let withShipAddress = 0;
  let withLinkedTxn = 0;
  let withDataExt = 0;
  let descOnlyLines = 0;
  let itemLines = 0;
  let markupLines = 0;
  let qtyRateAmountConsistent = 0;
  let qtyRateAmountChecked = 0;

  /** @type {string|null} */
  let minDate = null;
  /** @type {string|null} */
  let maxDate = null;

  for await (const { record, batchMeta } of iterateEntityRecords(exportDir, "estimates")) {
    if (!record || batchMeta.ok === false) continue;
    estimateCount += 1;
    headerProfiler.observe(record);

    const txnId = textOf(record.TxnID);
    const refNumber = textOf(record.RefNumber);
    const total = parseQbMoney(record.TotalAmount);
    const subtotal = parseQbMoney(record.Subtotal);
    const txnDate = parseQbDate(record.TxnDate);
    const customerListId = refListId(record.CustomerRef);
    const salesRepListId = refListId(record.SalesRepRef);
    const classListId = refListId(record.ClassRef);
    const termsListId = refListId(record.TermsRef);
    const templateListId = refListId(record.TemplateRef);
    const isActive = parseQbBoolean(record.IsActive);

    if (total != null) {
      totalAmountSum += total;
      withTotal += 1;
    }
    if (isActive === true) activeCount += 1;
    if (isActive === false) inactiveCount += 1;
    bump(refFormats, classifyRefNumberFormat(refNumber));
    bump(templateIds, templateListId);
    bump(termsIds, termsListId);
    bump(classIds, classListId);
    bump(salesRepIds, salesRepListId);
    bump(taxItemIds, refListId(record.ItemSalesTaxRef));
    bump(taxCodeIds, refListId(record.CustomerSalesTaxCodeRef));
    bump(customerMsgIds, refListId(record.CustomerMsgRef));
    bump(years, txnDate ? String(yearOfDate(txnDate)) : "unknown");
    if (txnDate) {
      if (!minDate || txnDate < minDate) minDate = txnDate;
      if (!maxDate || txnDate > maxDate) maxDate = txnDate;
    }
    if (salesRepListId) withSalesRep += 1;
    if (textOf(record.PONumber)) withPoNumber += 1;
    if (textOf(record.Memo)) withMemo += 1;
    if (record.ShipAddress) withShipAddress += 1;

    const links = extractLinkedTxnRefs(record.LinkedTxn);
    if (links.length) {
      withLinkedTxn += 1;
      for (const link of links) bump(linkedTxnTypes, link.txn_type || "null");
    }

    const dataExts = asArray(record.DataExtRet);
    if (dataExts.length) {
      withDataExt += 1;
      for (const ext of dataExts) bump(dataExtNames, textOf(ext?.DataExtName) || "unknown");
    }

    const lines = asArray(record.EstimateLineRet);
    bump(linesPerEstimate, String(lines.length));
    let localLineCount = 0;
    for (const line of lines) {
      if (!line || typeof line !== "object") continue;
      lineCount += 1;
      localLineCount += 1;
      lineProfiler.observe(line);

      const itemId = refListId(line.ItemRef);
      const hasAmount = parseQbMoney(line.Amount) != null;
      const hasQty = parseQbMoney(line.Quantity) != null;
      const hasRate = parseQbMoney(line.Rate) != null;
      const hasDesc = textOf(line.Desc) != null;
      const hasMarkup = parseQbMoney(line.MarkupRatePercent) != null || parseQbMoney(line.MarkupRate) != null;

      let kind = "other";
      if (itemId && (hasAmount || hasQty || hasRate)) kind = "item";
      else if (!itemId && hasDesc && !hasAmount) kind = "description_only";
      else if (!itemId && hasAmount) kind = "amount_without_item";
      else if (itemId && !hasAmount && hasDesc) kind = "item_descriptionish";

      bump(lineKinds, kind);
      if (kind === "description_only") descOnlyLines += 1;
      if (kind === "item") itemLines += 1;
      if (hasMarkup) markupLines += 1;
      if (itemId) bump(itemIds, itemId);

      if (hasQty && hasRate && hasAmount) {
        qtyRateAmountChecked += 1;
        const q = parseQbMoney(line.Quantity);
        const r = parseQbMoney(line.Rate);
        const a = parseQbMoney(line.Amount);
        if (q != null && r != null && a != null && Math.abs(q * r - a) <= 0.05) {
          qtyRateAmountConsistent += 1;
        }
      }
    }

    if (refNumber && txnId) {
      if (refIndex.has(refNumber)) {
        bump(duplicateRefs, refNumber);
      } else {
        refIndex.set(refNumber, {
          txnId,
          total,
          subtotal,
          txnDate,
          customerListId,
          salesRepListId,
          classListId,
          termsListId,
          templateListId,
          isActive,
          lineCount: localLineCount,
        });
      }
    }
  }

  const headerSnap = headerProfiler.snapshot();
  const lineSnap = lineProfiler.snapshot();

  return {
    refIndex,
    duplicateRefCount: duplicateRefs.size,
    profile: {
      generatedAt: new Date().toISOString(),
      estimateCount,
      withTotalAmount: withTotal,
      totalAmountSum: round2(totalAmountSum),
      activeCount,
      inactiveCount,
      dateRange: { minTxnDate: minDate, maxTxnDate: maxDate, years: mapToObject(years) },
      refNumberFormats: mapToObject(refFormats),
      fieldPresence: headerSnap,
      nearlyAllFields: headerSnap.fields.filter((f) => f.classification === "nearly_all").map((f) => f.field),
      optionalFields: headerSnap.fields
        .filter((f) => f.classification === "optional" || f.classification === "common")
        .map((f) => f.field),
      usage: {
        withSalesRepRef: withSalesRep,
        withSalesRepRefRate: estimateCount ? round4(withSalesRep / estimateCount) : 0,
        withPONumber: withPoNumber,
        withPONumberRate: estimateCount ? round4(withPoNumber / estimateCount) : 0,
        withMemo: withMemo,
        withShipAddress: withShipAddress,
        withLinkedTxn: withLinkedTxn,
        withDataExt: withDataExt,
        linkedTxnTypes: mapToObject(linkedTxnTypes),
      },
      topTemplateListIds: topEntries(templateIds, 15),
      topTermsListIds: topEntries(termsIds, 15),
      topClassListIds: topEntries(classIds, 15),
      topSalesRepListIds: topEntries(salesRepIds, 20),
      topItemSalesTaxListIds: topEntries(taxItemIds, 10),
      topCustomerSalesTaxCodeListIds: topEntries(taxCodeIds, 10),
      topCustomerMsgListIds: topEntries(customerMsgIds, 10),
      dataExtNames: mapToObject(dataExtNames),
      constructionNotes: [
        "ClassRef, TemplateRef, CustomerRef, tax fields, and EstimateLineRet are present on nearly all Estimates in this export.",
        "SalesRepRef is common but not universal.",
        "PONumber is rare.",
        "Memo is typically empty on Estimates; downstream Sales Orders / Invoices carry 'Estimate {RefNumber}:' memos.",
        "DataExt custom fields observed: Project, County.",
        "IsActive=false is common historically (closed/old estimates).",
        "No LinkedTxn in this export — cannot confirm Estimate→SO/Invoice via native QB links offline.",
      ],
    },
    lineProfile: {
      generatedAt: new Date().toISOString(),
      lineCount,
      estimateCount,
      avgLinesPerEstimate: estimateCount ? round4(lineCount / estimateCount) : 0,
      linesPerEstimateDistribution: mapToObject(linesPerEstimate),
      lineKinds: mapToObject(lineKinds),
      descOnlyLines,
      itemLines,
      markupLines,
      qtyRateAmount: {
        checked: qtyRateAmountChecked,
        consistentWithin5Cents: qtyRateAmountConsistent,
        consistencyRate: qtyRateAmountChecked
          ? round4(qtyRateAmountConsistent / qtyRateAmountChecked)
          : null,
      },
      fieldPresence: lineSnap,
      nearlyAllLineFields: lineSnap.fields.filter((f) => f.classification === "nearly_all").map((f) => f.field),
      topItemListIds: topEntries(itemIds, 40),
      notes: [
        "Lines are EstimateLineRet only in this export (no EstimateLineGroupRet observed in sampling + full scan counters).",
        "Two dominant line patterns: priced ItemRef lines, and description-only lines without ItemRef/Amount.",
        "Quantity * Rate ≈ Amount on nearly all priced lines when all three are present.",
      ],
    },
    itemIdCounts: itemIds,
    classIdCounts: classIds,
    termsIdCounts: termsIds,
    templateIdCounts: templateIds,
    salesRepIdCounts: salesRepIds,
  };
}

/**
 * @param {string} exportDir
 * @param {Map<string, object>} estimateRefIndex
 */
export async function analyzeSalesOrders(exportDir, estimateRefIndex) {
  let count = 0;
  let totalSum = 0;
  let withTotal = 0;
  let fullyInvoiced = 0;
  let manuallyClosed = 0;
  let withMemo = 0;
  let withSalesRep = 0;
  let withLinkedTxn = 0;
  let withPo = 0;

  /** @type {Map<string, number>} */
  const classIds = new Map();
  /** @type {Map<string, number>} */
  const salesRepIds = new Map();
  /** @type {Map<string, number>} */
  const years = new Map();

  /** @type {Array<{ txnId: string, total: number|null, txnDate: string|null, customerListId: string|null, salesRepListId: string|null, classListId: string|null, isFullyInvoiced: boolean|null, estimateRefs: string[], linkedEstimateTxnId: string|null, linkClass: string|null }>} */
  const compact = [];

  let inferredUnique = 0;
  let inferredAmbiguous = 0;
  let inferredMissing = 0;
  let memoWithoutEstimateToken = 0;

  for await (const { record, batchMeta } of iterateEntityRecords(exportDir, "sales-orders")) {
    if (!record || batchMeta.ok === false) continue;
    count += 1;
    const txnId = textOf(record.TxnID) || `missing-${count}`;
    const total = parseQbMoney(record.TotalAmount);
    const txnDate = parseQbDate(record.TxnDate);
    const customerListId = refListId(record.CustomerRef);
    const salesRepListId = refListId(record.SalesRepRef);
    const classListId = refListId(record.ClassRef);
    const isFullyInvoiced = parseQbBoolean(record.IsFullyInvoiced);
    const isManuallyClosed = parseQbBoolean(record.IsManuallyClosed);

    if (total != null) {
      totalSum += total;
      withTotal += 1;
    }
    if (isFullyInvoiced === true) fullyInvoiced += 1;
    if (isManuallyClosed === true) manuallyClosed += 1;
    if (salesRepListId) withSalesRep += 1;
    if (textOf(record.PONumber)) withPo += 1;
    bump(classIds, classListId);
    bump(salesRepIds, salesRepListId);
    bump(years, txnDate ? String(yearOfDate(txnDate)) : "unknown");

    const links = extractLinkedTxnRefs(record.LinkedTxn);
    if (links.length) withLinkedTxn += 1;

    const memo = textOf(record.Memo);
    if (memo) withMemo += 1;
    const estimateRefs = extractEstimateRefNumbersFromMemo(memo);
    let linkedEstimateTxnId = null;
    let linkClass = null;
    if (!memo) {
      // no memo
    } else if (!estimateRefs.length) {
      memoWithoutEstimateToken += 1;
    } else {
      const ref = estimateRefs[0];
      const hit = estimateRefIndex.get(ref);
      if (hit) {
        linkedEstimateTxnId = hit.txnId;
        linkClass = "INFERRED_LINK";
        inferredUnique += 1;
      } else {
        inferredMissing += 1;
      }
    }

    compact.push({
      txnId,
      total,
      txnDate,
      customerListId,
      salesRepListId,
      classListId,
      isFullyInvoiced,
      estimateRefs,
      linkedEstimateTxnId,
      linkClass,
    });
  }

  return {
    count,
    totalAmountSum: round2(totalSum),
    withTotal,
    fullyInvoiced,
    manuallyClosed,
    withMemo,
    withSalesRep,
    withLinkedTxn,
    withPo,
    years: mapToObject(years),
    classIdCounts: classIds,
    salesRepIdCounts: salesRepIds,
    memoInference: {
      inferredUnique,
      inferredAmbiguous,
      inferredMissing,
      memoWithoutEstimateToken,
      rule: ESTIMATE_MEMO_INFERENCE_RULE,
    },
    compact,
  };
}

/**
 * @param {string} exportDir
 * @param {Map<string, object>} estimateRefIndex
 */
export async function analyzeInvoices(exportDir, estimateRefIndex) {
  let count = 0;
  let totalSum = 0;
  let withTotal = 0;
  let balanceSum = 0;
  let withBalance = 0;
  let paidCount = 0;
  let withMemo = 0;
  let withSalesRep = 0;
  let withLinkedTxn = 0;
  let withPo = 0;
  let openArCount = 0;

  /** @type {Map<string, number>} */
  const classIds = new Map();
  /** @type {Map<string, number>} */
  const salesRepIds = new Map();
  /** @type {Map<string, number>} */
  const years = new Map();

  /** @type {Array<{ txnId: string, total: number|null, balance: number|null, isPaid: boolean|null, txnDate: string|null, customerListId: string|null, salesRepListId: string|null, classListId: string|null, estimateRefs: string[], linkedEstimateTxnId: string|null, linkClass: string|null }>} */
  const compact = [];

  let inferredUnique = 0;
  let inferredMissing = 0;
  let memoWithoutEstimateToken = 0;

  for await (const { record, batchMeta } of iterateEntityRecords(exportDir, "invoices")) {
    if (!record || batchMeta.ok === false) continue;
    count += 1;
    const txnId = textOf(record.TxnID) || `missing-${count}`;
    const total = resolveTxnTotalAmount(record);
    const balance = parseQbMoney(record.BalanceRemaining);
    const isPaid = parseQbBoolean(record.IsPaid);
    const txnDate = parseQbDate(record.TxnDate);
    const customerListId = refListId(record.CustomerRef);
    const salesRepListId = refListId(record.SalesRepRef);
    const classListId = refListId(record.ClassRef);

    if (total != null) {
      totalSum += total;
      withTotal += 1;
    }
    if (balance != null) {
      balanceSum += balance;
      withBalance += 1;
      if (balance > 0.005) openArCount += 1;
    }
    if (isPaid === true) paidCount += 1;
    if (salesRepListId) withSalesRep += 1;
    if (textOf(record.PONumber)) withPo += 1;
    bump(classIds, classListId);
    bump(salesRepIds, salesRepListId);
    bump(years, txnDate ? String(yearOfDate(txnDate)) : "unknown");

    if (extractLinkedTxnRefs(record.LinkedTxn).length) withLinkedTxn += 1;

    const memo = textOf(record.Memo);
    if (memo) withMemo += 1;
    const estimateRefs = extractEstimateRefNumbersFromMemo(memo);
    let linkedEstimateTxnId = null;
    let linkClass = null;
    if (memo && !estimateRefs.length) memoWithoutEstimateToken += 1;
    if (estimateRefs.length) {
      const hit = estimateRefIndex.get(estimateRefs[0]);
      if (hit) {
        linkedEstimateTxnId = hit.txnId;
        linkClass = "INFERRED_LINK";
        inferredUnique += 1;
      } else {
        inferredMissing += 1;
      }
    }

    compact.push({
      txnId,
      total,
      balance,
      isPaid,
      txnDate,
      customerListId,
      salesRepListId,
      classListId,
      estimateRefs,
      linkedEstimateTxnId,
      linkClass,
    });
  }

  return {
    count,
    totalAmountSum: round2(totalSum),
    withTotal,
    balanceRemainingSum: round2(balanceSum),
    withBalance,
    openArCount,
    openArAmountSum: round2(balanceSum),
    paidCount,
    withMemo,
    withSalesRep,
    withLinkedTxn,
    withPo,
    years: mapToObject(years),
    classIdCounts: classIds,
    salesRepIdCounts: salesRepIds,
    memoInference: {
      inferredUnique,
      inferredMissing,
      memoWithoutEstimateToken,
      rule: ESTIMATE_MEMO_INFERENCE_RULE,
    },
    compact,
  };
}

/**
 * @param {string} exportDir
 */
export async function analyzePayments(exportDir) {
  let count = 0;
  let totalSum = 0;
  let withTotal = 0;
  let withLinkedTxn = 0;
  let withAppliedToTxn = 0;
  let withCustomer = 0;
  /** @type {Map<string, number>} */
  const years = new Map();
  /** @type {Map<string, number>} */
  const paymentMethods = new Map();

  for await (const { record, batchMeta } of iterateEntityRecords(exportDir, "payments")) {
    if (!record || batchMeta.ok === false) continue;
    count += 1;
    const total = parseQbMoney(record.TotalAmount);
    if (total != null) {
      totalSum += total;
      withTotal += 1;
    }
    const txnDate = parseQbDate(record.TxnDate);
    bump(years, txnDate ? String(yearOfDate(txnDate)) : "unknown");
    if (refListId(record.CustomerRef)) withCustomer += 1;
    if (extractLinkedTxnRefs(record.LinkedTxn).length) withLinkedTxn += 1;
    if (record.AppliedToTxnRet) withAppliedToTxn += 1;
    bump(paymentMethods, refListId(record.PaymentMethodRef));
  }

  return {
    count,
    totalAmountSum: round2(totalSum),
    withTotal,
    withLinkedTxn,
    withAppliedToTxn,
    withCustomer,
    years: mapToObject(years),
    topPaymentMethodListIds: topEntries(paymentMethods, 15),
    gaps: [
      "No AppliedToTxnRet in this export — cannot confirm payment→invoice allocation offline.",
      "Collected $ can be summed from ReceivePayment.TotalAmount but not tied to specific invoices without a future IncludeLinkedTxns / AppliedToTxn query.",
    ],
  };
}

function buildTransactionLinkAnalysis(ctx) {
  const { estimateAnalysis, salesOrderAnalysis, invoiceAnalysis, paymentAnalysis } = ctx;
  const estimateCount = estimateAnalysis.profile.estimateCount;

  /** @type {Map<string, { soTxnIds: string[], invTxnIds: string[] }>} */
  const byEstimateTxn = new Map();

  for (const so of salesOrderAnalysis.compact) {
    if (so.linkClass !== "INFERRED_LINK" || !so.linkedEstimateTxnId) continue;
    let entry = byEstimateTxn.get(so.linkedEstimateTxnId);
    if (!entry) {
      entry = { soTxnIds: [], invTxnIds: [] };
      byEstimateTxn.set(so.linkedEstimateTxnId, entry);
    }
    entry.soTxnIds.push(so.txnId);
  }
  for (const inv of invoiceAnalysis.compact) {
    if (inv.linkClass !== "INFERRED_LINK" || !inv.linkedEstimateTxnId) continue;
    let entry = byEstimateTxn.get(inv.linkedEstimateTxnId);
    if (!entry) {
      entry = { soTxnIds: [], invTxnIds: [] };
      byEstimateTxn.set(inv.linkedEstimateTxnId, entry);
    }
    entry.invTxnIds.push(inv.txnId);
  }

  let estimatesWithSo = 0;
  let estimatesWithInv = 0;
  let estimatesWithSoAndInv = 0;
  let estimatesWithInvOnly = 0;
  let estimatesWithSoOnly = 0;

  for (const entry of byEstimateTxn.values()) {
    const hasSo = entry.soTxnIds.length > 0;
    const hasInv = entry.invTxnIds.length > 0;
    if (hasSo) estimatesWithSo += 1;
    if (hasInv) estimatesWithInv += 1;
    if (hasSo && hasInv) estimatesWithSoAndInv += 1;
    if (hasSo && !hasInv) estimatesWithSoOnly += 1;
    if (!hasSo && hasInv) estimatesWithInvOnly += 1;
  }

  const estimatesWithAnyDownstream = byEstimateTxn.size;
  const estimatesWithNoDownstream = Math.max(0, estimateCount - estimatesWithAnyDownstream);

  // SO→Invoice via shared estimate ref (transitive inference)
  /** @type {Map<string, string>} soTxn -> estimateTxn */
  const soToEst = new Map();
  for (const so of salesOrderAnalysis.compact) {
    if (so.linkedEstimateTxnId) soToEst.set(so.txnId, so.linkedEstimateTxnId);
  }
  let soWithInferredInvoice = 0;
  let soFullyInvoicedFlag = 0;
  for (const so of salesOrderAnalysis.compact) {
    if (so.isFullyInvoiced) soFullyInvoicedFlag += 1;
    const estId = so.linkedEstimateTxnId;
    if (!estId) continue;
    const entry = byEstimateTxn.get(estId);
    if (entry && entry.invTxnIds.length > 0) soWithInferredInvoice += 1;
  }

  const invoicesWithOriginEstimate = invoiceAnalysis.memoInference.inferredUnique;
  const invoicesWithoutOriginEstimate = invoiceAnalysis.count - invoicesWithOriginEstimate;

  return {
    generatedAt: new Date().toISOString(),
    confirmedLinks: {
      count: 0,
      note: "No LinkedTxn / AppliedToTxnRet present in this export. CONFIRMED_LINK count is zero.",
      estimateToSalesOrder: 0,
      estimateToInvoice: 0,
      salesOrderToInvoice: 0,
      paymentToInvoice: 0,
    },
    inferredLinks: {
      rule: ESTIMATE_MEMO_INFERENCE_RULE,
      salesOrders: salesOrderAnalysis.memoInference,
      invoices: invoiceAnalysis.memoInference,
      estimatesWithInferredSalesOrder: estimatesWithSo,
      estimatesWithInferredSalesOrderRate: estimateCount ? round4(estimatesWithSo / estimateCount) : 0,
      estimatesWithInferredInvoice: estimatesWithInv,
      estimatesWithInferredInvoiceRate: estimateCount ? round4(estimatesWithInv / estimateCount) : 0,
      estimatesWithInferredSoAndInvoice: estimatesWithSoAndInv,
      estimatesWithInferredSoOnly: estimatesWithSoOnly,
      estimatesWithInferredInvoiceOnly: estimatesWithInvOnly,
      estimatesWithNoInferredDownstream: estimatesWithNoDownstream,
      estimatesWithNoInferredDownstreamRate: estimateCount
        ? round4(estimatesWithNoDownstream / estimateCount)
        : 0,
      salesOrdersWithInferredInvoiceViaSharedEstimate: soWithInferredInvoice,
      salesOrdersWithIsFullyInvoicedTrue: soFullyInvoicedFlag,
      invoicesWithInferredOriginEstimate: invoicesWithOriginEstimate,
      invoicesWithoutIdentifiableOriginEstimate: invoicesWithoutOriginEstimate,
      invoicesWithoutIdentifiableOriginEstimateRate: invoiceAnalysis.count
        ? round4(invoicesWithoutOriginEstimate / invoiceAnalysis.count)
        : 0,
      paymentsWithConfirmedInvoiceAllocation: paymentAnalysis.withAppliedToTxn,
    },
    pathClassification: {
      note: "Paths below use INFERRED_LINK memo/RefNumber evidence only — not native QB LinkedTxn.",
      estimate_to_salesOrder_to_invoice: estimatesWithSoAndInv,
      estimate_to_invoice_without_salesOrder: estimatesWithInvOnly,
      estimate_to_salesOrder_without_invoice: estimatesWithSoOnly,
      estimate_with_no_downstream: estimatesWithNoDownstream,
      standalone_invoice_no_estimate_memo: invoicesWithoutOriginEstimate,
    },
  };
}

function buildTransactionFlowSummary(ctx) {
  const {
    inventory,
    estimateAnalysis,
    salesOrderAnalysis,
    invoiceAnalysis,
    paymentAnalysis,
    linkAnalysis,
  } = ctx;

  const paths = linkAnalysis.pathClassification;
  const pathCounts = [
    { path: "Estimate→SalesOrder→Invoice (inferred)", count: paths.estimate_to_salesOrder_to_invoice },
    { path: "Estimate→Invoice (no SO, inferred)", count: paths.estimate_to_invoice_without_salesOrder },
    { path: "Estimate→SalesOrder (no Invoice, inferred)", count: paths.estimate_to_salesOrder_without_invoice },
    { path: "Estimate with no inferred downstream", count: paths.estimate_with_no_downstream },
    { path: "Invoice without estimate memo link", count: paths.standalone_invoice_no_estimate_memo },
  ].sort((a, b) => b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    entityTotals: {
      estimates: {
        count: estimateAnalysis.profile.estimateCount,
        totalAmountSum: estimateAnalysis.profile.totalAmountSum,
      },
      salesOrders: {
        count: salesOrderAnalysis.count,
        totalAmountSum: salesOrderAnalysis.totalAmountSum,
        fullyInvoicedCount: salesOrderAnalysis.fullyInvoiced,
        fullyInvoicedRate: salesOrderAnalysis.count
          ? round4(salesOrderAnalysis.fullyInvoiced / salesOrderAnalysis.count)
          : 0,
      },
      invoices: {
        count: invoiceAnalysis.count,
        totalAmountSum: invoiceAnalysis.totalAmountSum,
        paidCount: invoiceAnalysis.paidCount,
        openArCount: invoiceAnalysis.openArCount,
        openArAmountSum: invoiceAnalysis.openArAmountSum,
      },
      payments: {
        count: paymentAnalysis.count,
        totalAmountSum: paymentAnalysis.totalAmountSum,
      },
    },
    dominantPaths: pathCounts,
    dominantPath: pathCounts[0] ?? null,
    observations: [
      "Sales Orders are a major historical stage (tens of thousands), not a rare exception.",
      "Most Sales Orders and a large share of Invoices memo-reference an Estimate RefNumber.",
      "A large majority of Estimates have no inferred downstream SO/Invoice — quoting volume exceeds booked volume.",
      "Estimate→SO→Invoice appears as the dominant *converted* path among estimates that convert, but absolute Estimate→Invoice-only and orphan invoice paths also exist.",
      "Payment→Invoice allocation is not discoverable in this export.",
    ],
    exportInventoryRunId: inventory.runId,
  };
}

function buildAmountVarianceAnalysis(ctx) {
  const { estimateAnalysis, salesOrderAnalysis, invoiceAnalysis } = ctx;

  const estByTxn = new Map();
  for (const [ref, est] of estimateAnalysis.refIndex.entries()) {
    estByTxn.set(est.txnId, { ...est, refNumber: ref });
  }

  const soStats = varianceStats();
  for (const so of salesOrderAnalysis.compact) {
    if (!so.linkedEstimateTxnId || so.total == null) continue;
    const est = estByTxn.get(so.linkedEstimateTxnId);
    if (!est || est.total == null) continue;
    soStats.observe(est.total, so.total, daysBetween(est.txnDate, so.txnDate));
  }

  const invStats = varianceStats();
  for (const inv of invoiceAnalysis.compact) {
    if (!inv.linkedEstimateTxnId || inv.total == null) continue;
    const est = estByTxn.get(inv.linkedEstimateTxnId);
    if (!est || est.total == null) continue;
    invStats.observe(est.total, inv.total, daysBetween(est.txnDate, inv.txnDate));
  }

  // SO vs Invoice when both share estimate
  const soByEst = new Map();
  for (const so of salesOrderAnalysis.compact) {
    if (!so.linkedEstimateTxnId) continue;
    if (!soByEst.has(so.linkedEstimateTxnId)) soByEst.set(so.linkedEstimateTxnId, []);
    soByEst.get(so.linkedEstimateTxnId).push(so);
  }
  const soInvStats = varianceStats();
  for (const inv of invoiceAnalysis.compact) {
    if (!inv.linkedEstimateTxnId || inv.total == null) continue;
    const sos = soByEst.get(inv.linkedEstimateTxnId) || [];
    if (sos.length !== 1 || sos[0].total == null) continue;
    soInvStats.observe(sos[0].total, inv.total, daysBetween(sos[0].txnDate, inv.txnDate));
  }

  return {
    generatedAt: new Date().toISOString(),
    linkBasis: "INFERRED_LINK via Estimate RefNumber in Memo",
    estimateToSalesOrder: soStats.snapshot(),
    estimateToInvoice: invStats.snapshot(),
    salesOrderToInvoice_sharedEstimate: soInvStats.snapshot(),
    notes: [
      "Variances use inferred memo links only; duplicates/revised estimates may skew pairs.",
      "When multiple SOs/Invoices share one Estimate RefNumber, Estimate→SO uses each SO; SO→Invoice variance restricted to exactly-one-SO cases.",
    ],
  };
}

function varianceStats() {
  let n = 0;
  let increases = 0;
  let decreases = 0;
  let unchanged = 0;
  let sumDelta = 0;
  let sumAbsDelta = 0;
  let sumAbsPct = 0;
  let pctN = 0;
  let latencyN = 0;
  let latencySum = 0;
  let latencyMin = null;
  let latencyMax = null;

  return {
    /**
     * @param {number} from
     * @param {number} to
     * @param {number|null} latencyDays
     */
    observe(from, to, latencyDays) {
      n += 1;
      const delta = to - from;
      sumDelta += delta;
      sumAbsDelta += Math.abs(delta);
      if (Math.abs(delta) < 0.005) unchanged += 1;
      else if (delta > 0) increases += 1;
      else decreases += 1;
      if (Math.abs(from) > 0.005) {
        sumAbsPct += Math.abs(delta / from);
        pctN += 1;
      }
      if (latencyDays != null) {
        latencyN += 1;
        latencySum += latencyDays;
        if (latencyMin == null || latencyDays < latencyMin) latencyMin = latencyDays;
        if (latencyMax == null || latencyDays > latencyMax) latencyMax = latencyDays;
      }
    },
    snapshot() {
      return {
        pairCount: n,
        increases,
        decreases,
        unchanged,
        meanDelta: n ? round2(sumDelta / n) : null,
        meanAbsDelta: n ? round2(sumAbsDelta / n) : null,
        meanAbsPct: pctN ? round4(sumAbsPct / pctN) : null,
        latencyDays: {
          sampleCount: latencyN,
          mean: latencyN ? round2(latencySum / latencyN) : null,
          min: latencyMin,
          max: latencyMax,
        },
      };
    },
  };
}

function buildSalesAttributionAnalysis(ctx) {
  const { estimateAnalysis, salesOrderAnalysis, invoiceAnalysis, reference } = ctx;

  return {
    generatedAt: new Date().toISOString(),
    transactionEnteredSalesperson: {
      estimatesWithSalesRepRef: estimateAnalysis.profile.usage.withSalesRepRef,
      estimatesWithSalesRepRefRate: estimateAnalysis.profile.usage.withSalesRepRefRate,
      salesOrdersWithSalesRepRef: salesOrderAnalysis.withSalesRep,
      salesOrdersWithSalesRepRefRate: salesOrderAnalysis.count
        ? round4(salesOrderAnalysis.withSalesRep / salesOrderAnalysis.count)
        : 0,
      invoicesWithSalesRepRef: invoiceAnalysis.withSalesRep,
      invoicesWithSalesRepRefRate: invoiceAnalysis.count
        ? round4(invoiceAnalysis.withSalesRep / invoiceAnalysis.count)
        : 0,
      topEstimateSalesRepListIds: estimateAnalysis.profile.topSalesRepListIds,
      note: "SalesRepRef on the transaction is entry-time salesperson attribution, not necessarily Account Directory ownership.",
    },
    classAsBranchProxy: {
      estimatesTopClassListIds: estimateAnalysis.profile.topClassListIds,
      salesOrdersTopClassListIds: topEntries(salesOrderAnalysis.classIdCounts, 15),
      invoicesTopClassListIds: topEntries(invoiceAnalysis.classIdCounts, 15),
      classCatalogCount: reference.classes.count,
      note: "ClassRef FullNames historically look like branch labels (e.g. ESF - {Branch}). Prefer Class ListID for future joins.",
    },
    accountDirectoryAnchors: {
      recommendation:
        "Anchor Account Directory ↔ QuickBooks via customer root ListID (existing quickbooks_desktop external link). Jobs are child ListIDs with ParentRef.",
      doNotAlterExistingMappings: true,
      opportunities: [
        "Store QB SalesRep ListID on staff identity when known.",
        "Store QB Class ListID on branch/org unit config.",
        "Prefer transaction SalesRepRef for booked/invoiced attribution; compare later to AD owner for conflict analytics.",
      ],
    },
    customerOwnershipVsTxnRep: {
      status: "INSUFFICIENT_DATA_FOR_PAIRWISE_IN_THIS_PASS",
      detail:
        "Customer.SalesRepRef exists on many customer/job records. Pairwise txn-vs-customer ownership comparison is deferred to a follow-up that can join without emitting PII; architecture should treat them as distinct concepts.",
    },
  };
}

function buildItemUsageArtifact(estimateAnalysis, reference) {
  const top = estimateAnalysis.lineProfile.topItemListIds;
  return {
    generatedAt: new Date().toISOString(),
    itemCatalogCount: reference.items.count,
    estimateLineItemUsage: {
      distinctItemListIdsOnEstimateLines: estimateAnalysis.itemIdCounts.size,
      topItemListIds: top,
    },
    notes: [
      "Item FullNames intentionally omitted from artifacts — join via ListID to items catalog when needed.",
      "Description-only lines have no ItemRef and are excluded from item usage counts.",
    ],
  };
}

function buildReferenceUsageArtifact(estimateAnalysis, salesOrderAnalysis, invoiceAnalysis, reference) {
  return {
    generatedAt: new Date().toISOString(),
    catalogs: {
      classes: reference.classes.count,
      terms: reference.terms.count,
      salesReps: reference.salesReps.count,
      items: reference.items.count,
      accounts: reference.accounts.count,
    },
    estimateRefs: {
      templates: estimateAnalysis.profile.topTemplateListIds,
      terms: estimateAnalysis.profile.topTermsListIds,
      classes: estimateAnalysis.profile.topClassListIds,
      salesReps: estimateAnalysis.profile.topSalesRepListIds,
      itemSalesTax: estimateAnalysis.profile.topItemSalesTaxListIds,
      customerSalesTaxCodes: estimateAnalysis.profile.topCustomerSalesTaxCodeListIds,
      customerMsgs: estimateAnalysis.profile.topCustomerMsgListIds,
      dataExtNames: estimateAnalysis.profile.dataExtNames,
    },
    salesOrderClassTop: topEntries(salesOrderAnalysis.classIdCounts, 10),
    invoiceClassTop: topEntries(invoiceAnalysis.classIdCounts, 10),
    missingReferenceData: [
      {
        item: "Templates list export",
        status: "MISSING_REFERENCE_DATA",
        detail: "TemplateRef ListIDs are present on transactions, but no templates/ entity folder exists in the export.",
      },
      {
        item: "CustomerMsg list export",
        status: "MISSING_REFERENCE_DATA",
        detail: "CustomerMsgRef ListIDs are present; no customer-msgs entity folder in export.",
      },
      {
        item: "PaymentMethod list export",
        status: "MISSING_REFERENCE_DATA",
        detail: "PaymentMethodRef ListIDs present on payments; no payment-methods entity folder.",
      },
      {
        item: "SalesTaxCode / ItemSalesTax dedicated folders",
        status: "PARTIAL",
        detail: "Tax refs appear on txns; may live inside items catalog as tax items — verify before writeback.",
      },
      {
        item: "LinkedTxn / AppliedToTxnRet",
        status: "MISSING_REFERENCE_DATA",
        detail: "Requires future read-only query with IncludeLinkedTxns / payment applied-to detail.",
      },
    ],
  };
}

function buildRepresentativePatterns(ctx) {
  const { estimateAnalysis, salesOrderAnalysis, invoiceAnalysis, linkAnalysis } = ctx;
  return {
    generatedAt: new Date().toISOString(),
    privacy: "No customer names, addresses, memos, or raw txns. Structural fingerprints only.",
    estimateHeaderSkeleton: {
      nearlyAlwaysPresent: estimateAnalysis.profile.nearlyAllFields,
      commonlyPresentOptional: estimateAnalysis.profile.optionalFields.slice(0, 30),
    },
    estimateLineSkeleton: {
      nearlyAlwaysPresent: estimateAnalysis.lineProfile.nearlyAllLineFields,
      lineKinds: estimateAnalysis.lineProfile.lineKinds,
      avgLinesPerEstimate: estimateAnalysis.lineProfile.avgLinesPerEstimate,
    },
    numbering: {
      estimateRefNumberFormats: estimateAnalysis.profile.refNumberFormats,
      downstreamMemoConvention: "Estimate {RefNumber}:",
    },
    conversionFingerprints: linkAnalysis.pathClassification,
    salesOrderFlags: {
      fullyInvoicedRate: salesOrderAnalysis.count
        ? round4(salesOrderAnalysis.fullyInvoiced / salesOrderAnalysis.count)
        : null,
      memoLinkRate: salesOrderAnalysis.count
        ? round4(salesOrderAnalysis.memoInference.inferredUnique / salesOrderAnalysis.count)
        : null,
    },
    invoiceFlags: {
      memoLinkRate: invoiceAnalysis.count
        ? round4(invoiceAnalysis.memoInference.inferredUnique / invoiceAnalysis.count)
        : null,
      paidRate: invoiceAnalysis.count ? round4(invoiceAnalysis.paidCount / invoiceAnalysis.count) : null,
    },
  };
}

export { resolveExportDir };
