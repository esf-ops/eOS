/**
 * Future contracts / TypeScript-oriented interfaces for QuickBooks Estimate writeback
 * and Sales Financial Truth snapshots.
 *
 * THIS MODULE DEFINES TYPES AND STUB CONTRACTS ONLY.
 * It MUST NOT implement EstimateAdd, InvoiceAdd, SalesOrderAdd, ReceivePaymentAdd,
 * CData write transport, or QuickBooks COM write transport.
 *
 * Discovery phase is offline and read-only.
 */

/**
 * Opaque QuickBooks identifiers — prefer ListID / TxnID over display names.
 * @typedef {{ listId: string, fullName?: string|null }} QuickBooksListRef
 */

/**
 * @typedef {{
 *   txnId: string,
 *   txnType: string|null,
 *   linkClass: 'CONFIRMED_LINK'|'INFERRED_LINK',
 *   inferenceRule?: string|null,
 * }} QuickBooksTransactionLink
 */

/**
 * Preview of a QuickBooks Estimate that *would* be written in a future phase.
 * Construction only — never sent to QuickBooks from this package.
 *
 * @typedef {{
 *   customerListId: string,
 *   classListId?: string|null,
 *   templateListId?: string|null,
 *   termsListId?: string|null,
 *   salesRepListId?: string|null,
 *   txnDate?: string|null,
 *   refNumber?: string|null,
 *   poNumber?: string|null,
 *   dueDate?: string|null,
 *   memo?: string|null,
 *   customerMsgListId?: string|null,
 *   itemSalesTaxListId?: string|null,
 *   customerSalesTaxCodeListId?: string|null,
 *   isToBeEmailed?: boolean|null,
 *   dataExt?: Array<{ name: string, value: string, type?: string }>,
 *   lines: QuickBooksEstimatePreviewLine[],
 *   source: {
 *     slabosEstimateId?: string|null,
 *     slabosPublicationId?: string|null,
 *     accountDirectoryAccountId?: string|null,
 *   },
 * }} QuickBooksEstimatePreview
 */

/**
 * @typedef {{
 *   itemListId?: string|null,
 *   desc?: string|null,
 *   quantity?: number|null,
 *   rate?: number|null,
 *   amount?: number|null,
 *   classListId?: string|null,
 *   salesTaxCodeListId?: string|null,
 *   markupRatePercent?: number|null,
 *   lineKind: 'item'|'description_only'|'subtotal'|'discount'|'group'|'other',
 * }} QuickBooksEstimatePreviewLine
 */

/**
 * Validation result for a preview — no side effects.
 * @typedef {{
 *   ok: boolean,
 *   errors: Array<{ code: string, message: string, field?: string }>,
 *   warnings: Array<{ code: string, message: string, field?: string }>,
 * }} QuickBooksEstimatePreviewValidation
 */

/**
 * Write contract placeholder — intentionally unimplemented.
 * Future phases may implement builders that emit qbXML payloads; this discovery
 * package must never execute them.
 *
 * @typedef {{
 *   operation: 'EstimateAdd'|'EstimateMod',
 *   preview: QuickBooksEstimatePreview,
 *   editSequence?: string|null,
 *   transport: 'UNIMPLEMENTED_DISCOVERY_ONLY',
 * }} QuickBooksEstimateWriteContract
 */

/**
 * Point-in-time financial truth snapshot for Sales Dashboard foundations.
 * @typedef {{
 *   asOf: string,
 *   organizationId?: string|null,
 *   quoted: MoneyBucket,
 *   accepted: MoneyBucket,
 *   bookedSold: MoneyBucket,
 *   invoiced: MoneyBucket,
 *   collected: MoneyBucket,
 *   openAr: MoneyBucket,
 *   evidenceNotes: string[],
 * }} QuickBooksSalesTruthSnapshot
 */

/**
 * @typedef {{
 *   amount: number|null,
 *   count: number|null,
 *   source: string,
 *   confidence: 'CONFIRMED_FROM_QB_DATA'|'STRONGLY_SUPPORTED_BY_QB_DATA'|'PROPOSED'|'NEEDS_BUSINESS_DECISION'|'INSUFFICIENT_DATA',
 *   notes?: string[],
 * }} MoneyBucket
 */

/**
 * Intentionally throws — proves no write path exists in discovery.
 * @param {never} [_args]
 * @returns {never}
 */
export function buildQuickBooksEstimatePreview(_args) {
  throw new Error(
    "buildQuickBooksEstimatePreview is a future contract only. Discovery package does not implement QuickBooks writes."
  );
}

/**
 * @param {never} [_preview]
 * @returns {never}
 */
export function validateQuickBooksEstimatePreview(_preview) {
  throw new Error(
    "validateQuickBooksEstimatePreview is a future contract only. Discovery package does not implement QuickBooks writes."
  );
}

/**
 * Sentinel: list of write API names that MUST remain unimplemented here.
 */
export const FORBIDDEN_WRITE_APIS = Object.freeze([
  "EstimateAdd",
  "EstimateMod",
  "InvoiceAdd",
  "SalesOrderAdd",
  "ReceivePaymentAdd",
  "CData",
  "QBXMLRP2",
  "RequestProcessor",
]);

/**
 * Runtime guard used by tests — discovery modules must not export write executors.
 * @param {Record<string, unknown>} moduleExports
 * @returns {string[]}
 */
export function findForbiddenWriteExports(moduleExports) {
  const names = Object.keys(moduleExports);
  return FORBIDDEN_WRITE_APIS.filter((api) =>
    names.some((n) => n.toLowerCase().includes(api.toLowerCase()) && /add|write|exec|send|connect/i.test(n))
  );
}
