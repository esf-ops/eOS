/**
 * QuickBooks Financial Truth — Sales Dashboard Beta (read-only).
 *
 * Live CData access requires a supported QuickBooks client/provider.
 * This package does NOT invent or reverse-engineer the Remote Connector
 * wire protocol. Raw HTTP QBXML POST is not a validated production transport.
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
  QB_FINANCIAL_TRUTH_STATUSES,
  emptyQuickBooksFinancialTruth,
  OPEN_AR_BASIS_AS_OF_REFRESH
} from "./contract.js";
