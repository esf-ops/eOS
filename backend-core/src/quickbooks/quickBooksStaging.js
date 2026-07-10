/**
 * quickBooksStaging — Phase 2 QuickBooks ingestion (staging row builder).
 *
 * Accepts normalized QB record objects (parsed from batch JSON files produced by
 * the quickbooks-sdk-connector) and builds Supabase-ready staging row payloads for
 * the brain_quickbooks_* tables defined in
 * backend-core/supabase/eliteos_quickbooks_staging_v1.sql.
 *
 * DOES NOT write to Supabase — that belongs in the Phase 3 import endpoint.
 * Call buildStagingRow() / buildStagingBatch() to produce plain objects ready for
 * upsert; the caller decides when and where to persist them.
 *
 * Privacy rules (enforced here, not just in the DB schema):
 *   - Only opaque QB identifiers (ListID, TxnID, TxnLineID), monotonic version
 *     numbers (EditSequence), boolean flags (IsActive), and ISO 8601 date/timestamp
 *     strings are extracted as named fields.
 *   - Customer names, vendor names, addresses, phone numbers, email addresses,
 *     invoice reference numbers, dollar amounts, quantities, memo text, and item
 *     descriptions are stored only in raw_payload — never in named columns, never
 *     in error messages or log output, never returned to the browser.
 *   - raw_payload receives the full normalized Ret object unchanged; any field
 *     containing PII lives there and is accessed only by service-role backend code.
 *
 * Change detection:
 *   QuickBooks advances EditSequence each time a record is modified.  Callers
 *   should compare incoming qb_edit_sequence with the stored value and skip
 *   raw_payload updates when the sequence is unchanged, updating only
 *   last_seen_at and sync_run_id.  getStagingUpsertConfig() documents the
 *   recommended conflict-column set for each entity type.
 */

// ── Entity type classification ─────────────────────────────────────────────

/** Entity folders whose records carry a QuickBooks ListID. */
export const QB_LIST_ENTITY_FOLDERS = Object.freeze([
  "customers",
  "items",
  "vendors",
  "accounts",
  "classes",
  "sales-reps",
  "terms",
]);

/** Entity folders whose records carry a QuickBooks TxnID. */
export const QB_TXN_ENTITY_FOLDERS = Object.freeze([
  "invoices",
  "payments",
  "bills",
  "purchase-orders",
  "estimates",
  "sales-orders",
]);

/**
 * @typedef {"company"|"list"|"transaction"|"invoice-lines"|"unknown"} QbEntityKind
 */

/**
 * Classify an entity folder name into its QuickBooks record kind.
 *
 * @param {string} entityFolderName
 * @returns {QbEntityKind}
 */
export function classifyQbEntityKind(entityFolderName) {
  if (entityFolderName === "company") return "company";
  if (entityFolderName === "invoice-lines") return "invoice-lines";
  if (QB_LIST_ENTITY_FOLDERS.includes(entityFolderName)) return "list";
  if (QB_TXN_ENTITY_FOLDERS.includes(entityFolderName)) return "transaction";
  return "unknown";
}

/** Map from entity folder name to staging table name. */
export const STAGING_TABLE_BY_FOLDER = Object.freeze({
  company:          "brain_quickbooks_company",
  customers:        "brain_quickbooks_customers",
  items:            "brain_quickbooks_items",
  vendors:          "brain_quickbooks_vendors",
  accounts:         "brain_quickbooks_accounts",
  classes:          "brain_quickbooks_classes",
  "sales-reps":     "brain_quickbooks_sales_reps",
  terms:            "brain_quickbooks_terms",
  invoices:         "brain_quickbooks_invoices",
  "invoice-lines":  "brain_quickbooks_invoice_lines",
  payments:         "brain_quickbooks_payments",
  bills:            "brain_quickbooks_bills",
  "purchase-orders":"brain_quickbooks_purchase_orders",
  estimates:        "brain_quickbooks_estimates",
  "sales-orders":   "brain_quickbooks_sales_orders",
});

/**
 * Single source of truth for each staging table's upsert conflict key.
 *
 * These MUST stay identical to the `unique (...)` constraints declared in
 * backend-core/supabase/eliteos_quickbooks_staging_v1.sql — if they drift, the
 * Phase 3 `ON CONFLICT` upsert fails at runtime.  `getStagingUpsertConfig`
 * consumes this map rather than re-declaring conflict columns, and the test suite
 * asserts each folder's expected key here.
 *
 * Note invoice-lines keys on `line_seq_number` (always non-null), NOT
 * `qb_txn_line_id` (nullable) — Postgres treats NULLs as distinct in a unique
 * constraint, so a nullable column cannot provide idempotent ON CONFLICT matching.
 */
export const QB_STAGING_UNIQUE_KEYS = Object.freeze({
  company:          ["organization_id"],
  customers:        ["organization_id", "qb_list_id"],
  items:            ["organization_id", "qb_list_id"],
  vendors:          ["organization_id", "qb_list_id"],
  accounts:         ["organization_id", "qb_list_id"],
  classes:          ["organization_id", "qb_list_id"],
  "sales-reps":     ["organization_id", "qb_list_id"],
  terms:            ["organization_id", "qb_list_id", "term_type"],
  invoices:         ["organization_id", "qb_txn_id"],
  "invoice-lines":  ["organization_id", "qb_txn_id", "line_seq_number"],
  payments:         ["organization_id", "qb_txn_id"],
  bills:            ["organization_id", "qb_txn_id"],
  "purchase-orders":["organization_id", "qb_txn_id"],
  estimates:        ["organization_id", "qb_txn_id"],
  "sales-orders":   ["organization_id", "qb_txn_id"],
});

// ── Safe field parsers ─────────────────────────────────────────────────────
//
// NOTE: parseQbDate / parseQbTimestamp validate SHAPE only (regex), not calendar
// reality — e.g. "2026-13-99" passes the shape check.  This is acceptable for
// staging because raw_payload always holds the authoritative record; the named
// date/timestamp columns are convenience/index columns, not the source of truth.

/**
 * Unwrap a QuickBooks scalar element. The connector serializes every scalar QBXML
 * element as an object `{ "@elementName": "<Tag>", "#text": "<value>" }`, so a field
 * like `ListID` arrives as `{ "@elementName": "ListID", "#text": "80000001-..." }`
 * rather than a bare string. This returns the inner `#text` value for that shape and
 * passes bare scalars (already-unwrapped strings/numbers/booleans) through unchanged.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function unwrapQbScalar(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && "#text" in value) {
    return value["#text"];
  }
  return value;
}

/**
 * Safe QB boolean — QB SDK serializes booleans as "true"/"false" strings (possibly
 * wrapped as a `#text` scalar). Returns a JS boolean, or null if absent/unrecognized.
 *
 * @param {unknown} value
 * @returns {boolean|null}
 */
export function parseQbBoolean(value) {
  const v = unwrapQbScalar(value);
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

/**
 * Safe QB date — QB SDK serializes dates as "YYYY-MM-DD" (possibly `#text`-wrapped).
 * Returns the string unchanged if it matches; null otherwise. Never throws.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function parseQbDate(value) {
  const v = unwrapQbScalar(value);
  if (!v || typeof v !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * Safe QB timestamp — QB SDK serializes timestamps as ISO 8601 strings (possibly
 * `#text`-wrapped). Accepts "YYYY-MM-DDTHH:MM:SS" with optional offset/Z suffix.
 * Returns the string unchanged if it looks valid; null otherwise. Never throws.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function parseQbTimestamp(value) {
  const v = unwrapQbScalar(value);
  if (!v || typeof v !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) ? v : null;
}

/**
 * Safe QB string ID — unwraps a `#text` scalar, then accepts only non-empty strings.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function parseQbId(value) {
  const v = unwrapQbScalar(value);
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

// ── Field extractors ───────────────────────────────────────────────────────

/**
 * @typedef {{ valid: true, [key: string]: unknown }|{ valid: false, reason: string }} ExtractionResult
 */

/**
 * Extract staging columns from a QuickBooks list entity Ret record
 * (CustomerRet, VendorRet, AccountRet, ClassRet, SalesRepRet, Item*Ret).
 *
 * Safe fields only: opaque ID, version, dates, boolean flag.
 * All PII remains in raw_payload.
 *
 * @param {object} record - Normalized QB Ret record from the batch JSON.
 * @param {{ termType?: string|null, itemType?: string|null, accountType?: string|null }} [opts]
 * @returns {ExtractionResult}
 */
export function extractListEntityFields(record, opts = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, reason: "record is not a plain object" };
  }

  const qbListId = parseQbId(record.ListID);
  if (!qbListId) {
    return { valid: false, reason: "ListID is missing or empty" };
  }

  const fields = {
    valid: true,
    qb_list_id:       qbListId,
    qb_edit_sequence: parseQbId(record.EditSequence),
    time_created:     parseQbTimestamp(record.TimeCreated),
    time_modified:    parseQbTimestamp(record.TimeModified),
    is_active:        parseQbBoolean(record.IsActive),
  };

  if (opts.termType !== undefined) fields.term_type = opts.termType ?? null;
  if (opts.itemType !== undefined) fields.item_type = opts.itemType ?? null;
  if (opts.accountType !== undefined) fields.account_type = opts.accountType ?? null;

  return fields;
}

/**
 * Extract staging columns from a QuickBooks transaction entity Ret record
 * (InvoiceRet, ReceivePaymentRet, BillRet, PurchaseOrderRet, EstimateRet, SalesOrderRet).
 *
 * Safe fields only: opaque ID, version, dates, FK-like opaque IDs.
 * All amounts, ref numbers, memo text, and names remain in raw_payload.
 *
 * @param {object} record
 * @returns {ExtractionResult}
 */
export function extractTxnEntityFields(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, reason: "record is not a plain object" };
  }

  const qbTxnId = parseQbId(record.TxnID);
  if (!qbTxnId) {
    return { valid: false, reason: "TxnID is missing or empty" };
  }

  const fields = {
    valid: true,
    qb_txn_id:          qbTxnId,
    qb_edit_sequence:   parseQbId(record.EditSequence),
    txn_date:           parseQbDate(record.TxnDate),
    time_created:       parseQbTimestamp(record.TimeCreated),
    time_modified:      parseQbTimestamp(record.TimeModified),
  };

  // Opaque FK-like relationship IDs (not customer/vendor names).
  const customerListId = parseQbId(record.CustomerRef?.ListID);
  if (customerListId) fields.qb_customer_list_id = customerListId;

  const vendorListId = parseQbId(record.VendorRef?.ListID);
  if (vendorListId) fields.qb_vendor_list_id = vendorListId;

  return fields;
}

/**
 * Extract staging columns from a single QuickBooks invoice line record.
 * Lines are child records of invoices; their parentage is supplied separately.
 *
 * `line_seq_number` is the idempotency key component (see QB_STAGING_UNIQUE_KEYS),
 * so it must always be a non-null integer.  `qb_txn_line_id` is kept as a nullable
 * attribute only.  If no stable sequence number can be determined this fails closed
 * rather than emitting a null key that would break ON CONFLICT idempotency.
 *
 * @param {object} line - A single line record from the invoice-lines batch.
 * @param {string} parentTxnId - TxnID of the parent invoice.
 * @param {string|null} parentTxnDate - TxnDate of the parent invoice (inherited).
 * @param {number} lineIndex - Zero-based position of this line within the parent invoice.
 * @returns {ExtractionResult}
 */
export function extractInvoiceLineFields(line, parentTxnId, parentTxnDate, lineIndex) {
  if (!line || typeof line !== "object" || Array.isArray(line)) {
    return { valid: false, reason: "line is not a plain object" };
  }

  const qbTxnId = parseQbId(parentTxnId);
  if (!qbTxnId) {
    return { valid: false, reason: "parentTxnId is missing or empty" };
  }

  if (typeof lineIndex !== "number" || !Number.isInteger(lineIndex) || lineIndex < 0) {
    return { valid: false, reason: "line_seq_number could not be determined (missing/invalid line index)" };
  }

  return {
    valid: true,
    qb_txn_id:       qbTxnId,
    qb_txn_line_id:  parseQbId(line.TxnLineID),
    line_seq_number: lineIndex,
    txn_date:        parseQbDate(parentTxnDate),
    qb_item_list_id: parseQbId(line.ItemRef?.ListID),
    line_type:       parseQbId(line._lineType) ?? parseQbId(line["@elementName"]) ?? null,
  };
}

// ── Staging row builders ───────────────────────────────────────────────────

/**
 * @typedef {{
 *   organizationId: string,
 *   syncRunId: string|null,
 *   qbXmlVersion?: string|null,
 * }} StagingContext
 */

/**
 * Build a staging row object for a single QB record ready to upsert into the
 * appropriate brain_quickbooks_* table.
 *
 * Does NOT write to Supabase.  The caller supplies organizationId and syncRunId,
 * which become the row's org-scoping and audit-trail columns.  organizationId is
 * required and validated — no sentinel/default org is ever silently substituted.
 *
 * @param {string} entityFolderName
 * @param {object} record - Normalized QB Ret record (from batch JSON).
 * @param {StagingContext} ctx
 * @returns {{ ok: true, row: object, tableName: string }|{ ok: false, reason: string, entityFolderName: string }}
 */
export function buildStagingRow(entityFolderName, record, ctx = {}) {
  const { organizationId, syncRunId, qbXmlVersion } = ctx;
  const kind = classifyQbEntityKind(entityFolderName);
  const tableName = STAGING_TABLE_BY_FOLDER[entityFolderName];

  if (typeof organizationId !== "string" || organizationId.trim().length === 0) {
    return { ok: false, reason: "organizationId is required", entityFolderName };
  }

  if (!tableName) {
    return { ok: false, reason: `no staging table mapped for entity folder "${entityFolderName}"`, entityFolderName };
  }

  // Validate the record shape up front — before any entity-specific field access.
  // Guards against (a) a TypeError when terms/items/accounts read record._termType /
  // record._itemType / record.AccountType, and (b) a company row with raw_payload null
  // that would violate the raw_payload NOT NULL constraint at insert time.
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { ok: false, reason: "record is not a plain object", entityFolderName };
  }

  const base = {
    organization_id: organizationId,
    sync_run_id:     syncRunId ?? null,
    source_system:   "quickbooks",
    raw_payload:     record,
  };

  if (kind === "company") {
    // qb_xml_version is sourced from the sync run / manifest context, NOT from the
    // record — a CompanyRet body has no QBXML envelope. qb_sync_runs.qb_xml_version
    // is the authoritative copy; this is a convenience mirror only.
    return { ok: true, tableName, row: { ...base, qb_xml_version: parseQbId(qbXmlVersion) ?? null } };
  }

  if (kind === "list") {
    const opts = {};
    // The connector tags each record's QBXML element name in "@elementName"
    // (e.g. "ItemInventoryRet", "DateDrivenTermsRet"); prefer an explicit synthetic
    // override when present, else derive the discriminator from "@elementName".
    const elementName = parseQbId(record["@elementName"]);
    if (entityFolderName === "terms") {
      opts.termType =
        parseQbId(record._termType) ??
        (elementName === "DateDrivenTermsRet" ? "date-driven" : "standard");
    }
    if (entityFolderName === "items") {
      opts.itemType = parseQbId(record._itemType) ?? elementName ?? null;
    }
    if (entityFolderName === "accounts") {
      opts.accountType = parseQbId(record.AccountType) ?? null;
    }

    const extracted = extractListEntityFields(record, opts);
    if (!extracted.valid) {
      return { ok: false, reason: extracted.reason, entityFolderName };
    }

    const { valid: _valid, ...listFields } = extracted;
    return { ok: true, tableName, row: { ...base, ...listFields } };
  }

  if (kind === "transaction") {
    const extracted = extractTxnEntityFields(record);
    if (!extracted.valid) {
      return { ok: false, reason: extracted.reason, entityFolderName };
    }

    const { valid: _valid, ...txnFields } = extracted;
    return { ok: true, tableName, row: { ...base, ...txnFields } };
  }

  // invoice-lines: each record IS a line (the connector extracts them individually).
  if (kind === "invoice-lines") {
    const parentTxnId   = parseQbId(record?.InvoiceTxnID ?? record?.TxnID);
    const parentTxnDate = record?.InvoiceTxnDate ?? record?.TxnDate ?? null;
    // Prefer the connector-provided 0-based line index. line_seq_number must be
    // non-null (idempotency key), so extractInvoiceLineFields fails closed when
    // no valid index is present rather than emitting a null key.
    const lineIndex     = typeof record?._lineIndex === "number" ? record._lineIndex : null;

    const extracted = extractInvoiceLineFields(record, parentTxnId, parentTxnDate, lineIndex);
    if (!extracted.valid) {
      return { ok: false, reason: extracted.reason, entityFolderName };
    }

    const { valid: _valid, ...lineFields } = extracted;
    return { ok: true, tableName, row: { ...base, ...lineFields } };
  }

  return { ok: false, reason: `entity kind "${kind}" is not stageable`, entityFolderName };
}

/**
 * Build staging rows for every record in a batch.
 * Records that fail extraction are collected in `failures` (with safe reason strings)
 * and do not prevent the rest of the batch from being processed.
 *
 * @param {string} entityFolderName
 * @param {unknown[]} records - Array of normalized QB Ret records.
 * @param {StagingContext} ctx
 * @returns {{ rows: object[], tableName: string|null, failures: Array<{ index: number, reason: string }> }}
 */
export function buildStagingBatch(entityFolderName, records, ctx) {
  const tableName = STAGING_TABLE_BY_FOLDER[entityFolderName] ?? null;
  const rows = [];
  const failures = [];

  if (!Array.isArray(records)) {
    return { rows, tableName, failures: [{ index: -1, reason: "records is not an array" }] };
  }

  for (let i = 0; i < records.length; i++) {
    const result = buildStagingRow(entityFolderName, records[i], ctx);
    if (result.ok) {
      rows.push(result.row);
    } else {
      // Never include the record content in the failure reason.
      failures.push({ index: i, reason: result.reason });
    }
  }

  return { rows, tableName, failures };
}

/**
 * Normalize a QBXML repeating element to an array. The connector serializes a repeating
 * child as an array when there are 2+, as a single object when there is exactly 1, and
 * omits it entirely when there are 0. Returns [] for null/undefined.
 *
 * @param {unknown} value
 * @returns {unknown[]}
 */
function normalizeToArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Collect a parent invoice's nested line elements in document order. Includes both
 * `InvoiceLineRet` and `InvoiceLineGroupRet` (group lines appended after plain lines).
 *
 * @param {object} invoiceRecord
 * @returns {unknown[]}
 */
function collectInvoiceLineElements(invoiceRecord) {
  return [
    ...normalizeToArray(invoiceRecord.InvoiceLineRet),
    ...normalizeToArray(invoiceRecord.InvoiceLineGroupRet),
  ];
}

/**
 * Derive invoice-line staging rows from a single invoice record's nested line elements.
 *
 * This is the authoritative source of invoice lines: the standalone `invoice-lines` export
 * folder is a lossy flattening that drops parent linkage and ordering, whereas each invoice
 * record's nested `InvoiceLineRet` carries both. `line_seq_number` is assigned from the
 * 0-BASED position of the line within the parent invoice's combined line list — stable for a
 * given export, so re-imports match on the (organization_id, qb_txn_id, line_seq_number) key.
 *
 * Fails closed (whole-invoice failure) when organizationId or the parent TxnID is missing.
 * Individual malformed line elements are isolated as per-line failures. Never logs record
 * content. raw_payload holds the original line element only (no injected parent fields).
 *
 * @param {object} invoiceRecord - A single normalized InvoiceRet record.
 * @param {StagingContext} ctx
 * @returns {{ rows: object[], failures: Array<{ index: number, reason: string }>, parentTxnId: string|null }}
 */
export function buildInvoiceLineRowsFromInvoiceRecord(invoiceRecord, ctx = {}) {
  const { organizationId, syncRunId } = ctx;
  const rows = [];
  const failures = [];

  if (typeof organizationId !== "string" || organizationId.trim().length === 0) {
    return { rows, failures: [{ index: -1, reason: "organizationId is required" }], parentTxnId: null };
  }

  if (!invoiceRecord || typeof invoiceRecord !== "object" || Array.isArray(invoiceRecord)) {
    return { rows, failures: [{ index: -1, reason: "invoice record is not a plain object" }], parentTxnId: null };
  }

  const parentTxnId = parseQbId(invoiceRecord.TxnID);
  if (!parentTxnId) {
    return { rows, failures: [{ index: -1, reason: "parent invoice TxnID is missing or empty" }], parentTxnId: null };
  }

  const parentTxnDate = invoiceRecord.TxnDate ?? null;
  const lineElements = collectInvoiceLineElements(invoiceRecord);

  for (let i = 0; i < lineElements.length; i++) {
    const extracted = extractInvoiceLineFields(lineElements[i], parentTxnId, parentTxnDate, i);
    if (!extracted.valid) {
      failures.push({ index: i, reason: extracted.reason });
      continue;
    }
    const { valid: _valid, ...lineFields } = extracted;
    rows.push({
      organization_id: organizationId,
      sync_run_id:     syncRunId ?? null,
      source_system:   "quickbooks",
      raw_payload:     lineElements[i],
      ...lineFields,
    });
  }

  return { rows, failures, parentTxnId };
}

// ── Upsert configuration ───────────────────────────────────────────────────

/**
 * @typedef {{
 *   tableName: string,
 *   conflictColumns: string[],
 *   updateColumns: string[],
 * }} UpsertConfig
 */

/**
 * Return the Supabase upsert configuration for a given entity folder.
 * `conflictColumns` are sourced from QB_STAGING_UNIQUE_KEYS (single source of
 * truth, kept in lockstep with the SQL unique constraints).  `updateColumns` are
 * the columns to overwrite on conflict (raw_payload is always included so the
 * latest record body is preserved; qb_edit_sequence comparison happens in
 * application code before calling the upsert).
 *
 * @param {string} entityFolderName
 * @returns {UpsertConfig|null}
 */
export function getStagingUpsertConfig(entityFolderName) {
  const tableName = STAGING_TABLE_BY_FOLDER[entityFolderName];
  const conflictColumns = QB_STAGING_UNIQUE_KEYS[entityFolderName];
  if (!tableName || !conflictColumns) return null;

  const kind = classifyQbEntityKind(entityFolderName);
  const alwaysUpdate = ["sync_run_id", "raw_payload", "last_seen_at", "updated_at"];

  if (kind === "company") {
    return {
      tableName,
      conflictColumns,
      updateColumns: [...alwaysUpdate, "qb_xml_version"],
    };
  }

  if (kind === "list") {
    const updateColumns = [...alwaysUpdate, "qb_edit_sequence", "time_modified", "is_active"];
    if (entityFolderName === "items") {
      updateColumns.push("item_type");
    }
    if (entityFolderName === "accounts") {
      updateColumns.push("account_type");
    }
    // term_type is part of the conflict key for terms, not an updatable column.
    return { tableName, conflictColumns, updateColumns };
  }

  if (kind === "transaction") {
    return {
      tableName,
      conflictColumns,
      updateColumns:   [
        ...alwaysUpdate,
        "qb_edit_sequence",
        "txn_date",
        "time_modified",
        ...(["invoices", "payments", "estimates", "sales-orders"].includes(entityFolderName)
          ? ["qb_customer_list_id"]
          : []),
        ...(["bills", "purchase-orders"].includes(entityFolderName)
          ? ["qb_vendor_list_id"]
          : []),
      ],
    };
  }

  if (kind === "invoice-lines") {
    return {
      tableName,
      conflictColumns,
      // line_seq_number is part of the conflict key, not updated on conflict.
      // qb_txn_line_id is a nullable attribute, refreshed on conflict.
      updateColumns:   [...alwaysUpdate, "txn_date", "qb_item_list_id", "line_type", "qb_txn_line_id"],
    };
  }

  return null;
}

/**
 * Return a human-readable description of whether a record appears changed,
 * based on its edit sequence.  Used by Phase 3 import code to decide whether
 * to skip the raw_payload update on a conflict.
 *
 * @param {string|null} incomingEditSeq
 * @param {string|null} storedEditSeq
 * @returns {"changed"|"unchanged"|"unknown"}
 */
export function detectEditSequenceChange(incomingEditSeq, storedEditSeq) {
  if (!incomingEditSeq || !storedEditSeq) return "unknown";
  return incomingEditSeq === storedEditSeq ? "unchanged" : "changed";
}
