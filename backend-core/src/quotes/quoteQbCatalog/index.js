/**
 * Re-exports for Quote ↔ QuickBooks catalog / Phase 0–1 foundation.
 */

export {
  QUOTE_QB_PRICING_SOURCES,
  QUOTE_QB_STRONG_MATCH_SEEDS,
  QUOTE_LINE_CODE_TO_QB_CONCEPT,
  listStrongMatchSeedsForOrganization,
  resolveQbItemMapping,
  inferConceptKeyFromLineItem,
  isQuoteQbPricingSource
} from "./quoteQbItemMappingCatalog.js";

export { loadActiveQbItemMappings, requireMappedConcepts } from "./quoteQbItemMappingStore.js";

export {
  QB_WRITE_ENV_TEST,
  QB_WRITE_ENV_PRODUCTION,
  QB_TEST_QUOTE_PREFIX,
  QB_WRITE_QUEUE_STATUSES,
  validateQbWriteSafetyGate,
  executeQbWriteQueueItem,
  claimQbWriteQueueItem,
  FORBIDDEN_QB_WRITE_PHASE0_APIS
} from "./quoteQbWriteSafety.js";

export { hashQbWritePayload, buildQbWriteQueueRowPreview } from "./quoteQbWriteQueue.js";

export {
  wrapEstimateAddQbXml,
  buildEstimateAddQbXml,
  buildQbtest0001EstimateAdd,
  sanitizeEstimateAddQbXmlForDisplay,
  qbXmlContainsWriteRequest,
  expectedLineAmount,
  assertQuantityRateAmountConsistent,
  DEFAULT_QBXML_VERSION,
  QBTEST_0001_CONCEPT_KEYS,
  QBTEST_CUSTOMER_FULL_NAME,
  QBTEST_REF_NUMBER,
  QBTEST_IDEMPOTENCY_KEY
} from "./quoteQbEstimateAddBuilder.js";

export {
  parseCompanyAllowlist,
  loadQbWriteConfig,
  validateQbWriteConfig,
  assertCompanyAllowlisted
} from "./quoteQbWriteConfig.js";

export {
  transmitEstimateAdd,
  processQbXmlSafely,
  buildCustomerQueryByFullNameQbXml,
  buildCompanyQueryQbXml,
  parseCustomerQueryListId,
  parseCustomerQueryRets,
  resolveExactlyOneActiveTestCustomer,
  parseCompanyIdentity
} from "./quoteQbWriteTransport.js";

export {
  QBTEST_0001_EXPECTED_ITEMS,
  buildItemQueryByListIdQbXml,
  parseItemQueryRet,
  validateExpectedTestItems,
  queryAndValidateTestItems
} from "./quoteQbTestItemValidation.js";

export {
  findQueueRowByIdempotencyKey,
  upsertQbtest0001QueueRow,
  restoreClaimedQbtest0001QueueRowToPending,
  claimSinglePendingQueueRow
} from "./quoteQbWriteQueueStore.js";

export { runQbEstimateDryRun } from "./quoteQbEstimateDryRun.js";
