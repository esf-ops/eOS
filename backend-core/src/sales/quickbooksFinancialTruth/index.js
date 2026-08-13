/**
 * QuickBooks Financial Truth — Sales Dashboard Beta (read-only).
 *
 * Production transport: Windows PowerShell ODBC worker → ingest → prepared facts.
 * Backend does not connect to QuickBooks Desktop or Remote Connector.
 */

export {
  getQuickBooksFinancialTruth,
  getQuickBooksFinancialTruthSafe
} from "./getQuickBooksFinancialTruth.js";
export {
  QB_FINANCIAL_TRUTH_ENV_VARS,
  readQuickBooksFinancialTruthConfig,
  detectSupportedCDataQuickBooksClient
} from "./config.js";
export { createFixtureQuickBooksFinancialTruthProvider } from "./fixtureProvider.js";
export { sanitizeFinancialTruthDiagnostics } from "./sanitize.js";
export {
  QB_FINANCIAL_TRUTH_SOURCE,
  QB_FINANCIAL_TRUTH_SOURCE_ODBC,
  QB_FINANCIAL_TRUTH_STATUSES,
  emptyQuickBooksFinancialTruth,
  OPEN_AR_BASIS_AS_OF_REFRESH
} from "./contract.js";
export { getPreparedQuickBooksFinancialTruth, sumTransactionsInRange, sumCurrentOpenAr } from "./preparedFactsProvider.js";
export { attachQuickBooksSalesSyncRoutes } from "./quickbooksSalesSyncApi.js";
export {
  validateBeginPayload,
  validateTransactionChunk,
  validateOpenArReplacePayload,
  validateCompletePayload,
  upsertFinancialTransactions,
  replaceOpenArSnapshot,
  completeSyncRun,
  QB_SALES_SYNC_WRITE_TABLES,
  QB_SALES_SYNC_FORBIDDEN_WRITE_TABLES
} from "./syncIngest.js";
export { constantTimeEqualString, requireQuickBooksSalesSyncToken } from "./syncAuth.js";
export {
  resolveQbRootCustomerListId,
  applyRootListIdsToRows,
  summarizeListIdCoverage,
  enrichFinancialRowsWithRootListIds,
  QB_ROOT_RESOLVE_MAX_DEPTH
} from "./resolveQbRootCustomerListId.js";
