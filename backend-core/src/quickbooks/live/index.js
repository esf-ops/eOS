/**
 * QuickBooks live read foundation (CData Gateway / Remote Connector).
 *
 * READ-ONLY. No write APIs. Credentials via env only.
 */

export {
  loadQuickBooksGatewayConfig,
  assertQuickBooksLiveReadReady,
  isQuickBooksLiveReadEnabled,
  summarizeGatewayConfig,
  QUICKBOOKS_LIVE_READ_ENV_VARS,
} from "./quickBooksGatewayConfig.js";

export {
  createQuickBooksGatewayHttpTransport,
  createFakeGatewayTransport,
  buildTlsOptions,
} from "./quickBooksGatewayHttpTransport.js";

export {
  createQuickBooksLiveReadClient,
  findForbiddenWriteMethods,
  QUICKBOOKS_LIVE_READ_PUBLIC_METHODS,
} from "./quickBooksLiveReadClient.js";

export {
  assertReadOnlyQbXml,
  ALLOWED_QBXML_REQUEST_TAGS,
  FORBIDDEN_QBXML_REQUEST_TAGS,
  buildEstimateLinkedQuery,
  buildSalesOrderLinkedQuery,
  buildInvoiceLinkedQuery,
  buildReceivePaymentQuery,
  buildListQuery,
  parseQbXmlResponse,
  extractTxnLinkSummary,
} from "./quickBooksLiveQbxml.js";

export {
  runQuickBooksLiveReadProbe,
  sanitizeLiveTxnArtifact,
  sanitizeListArtifact,
  defaultProbeFromTxnDate,
} from "./quickBooksLiveProbe.js";

export {
  compareLiveLinksToInferred,
  buildInferredLinksFromDiscoveryCompacts,
  LINK_COMPARISON_OUTCOMES,
} from "./compareLiveLinksToInferred.js";
