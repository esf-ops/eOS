/**
 * Offline QuickBooks Estimate + Sales Financial Truth discovery package.
 *
 * READ-ONLY. No QuickBooks / CData connections. No write APIs.
 */

export {
  runEstimateSalesTruthDiscovery,
  buildExportInventory,
  analyzeEstimates,
  analyzeSalesOrders,
  analyzeInvoices,
  analyzePayments,
  resolveExportDir,
} from "./discovery.js";

export {
  extractEstimateRefNumbersFromMemo,
  classifyRefNumberFormat,
  asArray,
  textOf,
  refListId,
  parseQbMoney,
  resolveTxnTotalAmount,
  daysBetween,
  fingerprintExportTree,
  createFieldProfiler,
} from "./helpers.js";

export {
  sanitizeQbValue,
  findObviousPiiLeaks,
  isObviousPiiFieldName,
  buildSyntheticEstimateFixture,
  buildSyntheticSalesOrderFixture,
  buildSyntheticInvoiceFixture,
  buildSyntheticPaymentFixture,
} from "./sanitize.js";

export {
  buildQuickBooksEstimatePreview,
  validateQuickBooksEstimatePreview,
  FORBIDDEN_WRITE_APIS,
  findForbiddenWriteExports,
} from "./contracts.js";

export { buildSlabosQbEstimateFieldMapping } from "./slabosMapping.js";
export { buildSalesFinancialTruthProposal } from "./financialTruthProposal.js";
