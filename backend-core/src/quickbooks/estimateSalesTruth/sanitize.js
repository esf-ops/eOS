/**
 * Sanitization helpers for fixtures and representative-pattern artifacts.
 *
 * Never persist customer names, addresses, phones, emails, PO numbers, memos,
 * or raw transaction payloads into committed fixtures.
 */

/** Field name patterns treated as PII / sensitive free text. */
const PII_KEY_PATTERN =
  /^(FullName|Name|FirstName|LastName|CompanyName|Contact|Phone|Email|Addr\d*|City|State|PostalCode|Country|Note|Memo|Desc|PONumber|BillAddress|ShipAddress|BillAddressBlock|ShipAddressBlock|CustomerMsg|AdditionalContact|SalesDesc|PurchaseDesc)$/i;

const PII_PATH_PATTERN =
  /(FullName|Name|Phone|Email|Addr|City|State|Postal|Country|Memo|Desc|PONumber|Address|Contact|Msg)/i;

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isObviousPiiFieldName(key) {
  if (!key || key === "@elementName" || key === "#text") return false;
  return PII_KEY_PATTERN.test(key) || PII_PATH_PATTERN.test(key);
}

/**
 * Deep-sanitize a QB-shaped object for fixtures.
 * - Keeps opaque IDs, dates, booleans, amounts, structural keys
 * - Replaces PII strings with length tokens
 * - Preserves array/object shape
 *
 * @param {unknown} value
 * @param {string} [key]
 * @returns {unknown}
 */
export function sanitizeQbValue(value, key = "") {
  if (value == null) return value;
  if (typeof value === "string") {
    if (isObviousPiiFieldName(key) || looksLikeEmail(value) || looksLikePhone(value)) {
      return `<redacted:${value.length}>`;
    }
    // Keep opaque QB IDs and simple codes
    if (/^[0-9A-F-]{5,}$/i.test(value) || /^(true|false)$/i.test(value)) return value;
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
    if (/^-?\d+(\.\d+)?$/.test(value)) return value;
    if (isObviousPiiFieldName(key)) return `<redacted:${value.length}>`;
    // Unknown free text — redact
    if (/[A-Za-z]{3,}/.test(value) && !/^(Estimate|Invoice|SalesOrder|Tax|Non|Non-taxable)$/i.test(value)) {
      return `<redacted:${value.length}>`;
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeQbValue(item, key));
  if (typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "@elementName") {
        out[k] = typeof v === "string" ? v : sanitizeQbValue(v, k);
        continue;
      }
      if (k === "#text") {
        out[k] = sanitizeQbValue(v, key || "text");
        continue;
      }
      out[k] = sanitizeQbValue(v, k);
    }
    return out;
  }
  return null;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function looksLikePhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 && /[\d().\-\s+]{10,}/.test(value);
}

/**
 * Assert a sanitized object contains no obvious PII field values.
 * @param {unknown} value
 * @param {string[]} [path]
 * @returns {string[]} violations
 */
export function findObviousPiiLeaks(value, path = []) {
  /** @type {string[]} */
  const violations = [];
  if (value == null) return violations;
  if (typeof value === "string") {
    const key = path[path.length - 1] || "";
    if (key === "@elementName" || key === "#text") {
      // Structural QBXML tags / already-sanitized scalars — only flag email/phone shapes.
      if (looksLikeEmail(value) || looksLikePhone(value)) {
        violations.push(path.join(".") || "(root)");
      }
      return violations;
    }
    if (looksLikeEmail(value) || looksLikePhone(value)) {
      violations.push(path.join(".") || "(root)");
    } else if (
      isObviousPiiFieldName(key) &&
      !value.startsWith("<redacted:") &&
      /[A-Za-z]{3,}/.test(value) &&
      !/^(true|false|Tax|Non|EstimateLineRet|SalesOrderLineRet|InvoiceLineRet|EstimateRet|SalesOrderRet|InvoiceRet|ReceivePaymentRet)$/i.test(
        value
      )
    ) {
      violations.push(path.join("."));
    }
    return violations;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => violations.push(...findObviousPiiLeaks(item, [...path, String(i)])));
    return violations;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      violations.push(...findObviousPiiLeaks(v, [...path, k]));
    }
  }
  return violations;
}

/**
 * Build a synthetic Estimate-shaped fixture (no real PII).
 * @param {object} [overrides]
 */
export function buildSyntheticEstimateFixture(overrides = {}) {
  return sanitizeQbValue({
    "@elementName": "EstimateRet",
    TxnID: { "@elementName": "TxnID", "#text": "FAKE-EST-001" },
    TimeCreated: { "@elementName": "TimeCreated", "#text": "2024-03-01T10:00:00-06:00" },
    TimeModified: { "@elementName": "TimeModified", "#text": "2024-03-02T10:00:00-06:00" },
    EditSequence: { "@elementName": "EditSequence", "#text": "100" },
    TxnNumber: { "@elementName": "TxnNumber", "#text": "1" },
    CustomerRef: {
      ListID: { "#text": "FAKE-CUST-001" },
      FullName: { "#text": "Acme Customer:Job One" },
    },
    ClassRef: { ListID: { "#text": "FAKE-CLASS-001" }, FullName: { "#text": "Branch A" } },
    TemplateRef: { ListID: { "#text": "FAKE-TMPL-001" }, FullName: { "#text": "Shop Copy" } },
    TxnDate: { "#text": "2024-03-01" },
    RefNumber: { "#text": "24-1001" },
    BillAddress: {
      Addr1: { "#text": "Acme Customer" },
      Addr2: { "#text": "123 Main St" },
      City: { "#text": "Anytown" },
      State: { "#text": "IA" },
      PostalCode: { "#text": "50000" },
    },
    IsActive: { "#text": "true" },
    TermsRef: { ListID: { "#text": "FAKE-TERM-001" }, FullName: { "#text": "Due prior to Scheduling" } },
    SalesRepRef: { ListID: { "#text": "FAKE-REP-001" }, FullName: { "#text": "AB" } },
    DueDate: { "#text": "2024-03-01" },
    Subtotal: { "#text": "1000.00" },
    SalesTaxPercentage: { "#text": "0.00" },
    SalesTaxTotal: { "#text": "0.00" },
    TotalAmount: { "#text": "1000.00" },
    IsToBeEmailed: { "#text": "false" },
    CustomerSalesTaxCodeRef: { ListID: { "#text": "FAKE-TAXCODE-1" }, FullName: { "#text": "Non" } },
    ItemSalesTaxRef: { ListID: { "#text": "FAKE-TAXITEM-1" }, FullName: { "#text": "Non-taxable" } },
    DataExtRet: [
      {
        DataExtName: { "#text": "Project" },
        DataExtType: { "#text": "STR255TYPE" },
        DataExtValue: { "#text": "Kitchen Remodel" },
      },
    ],
    EstimateLineRet: [
      {
        "@elementName": "EstimateLineRet",
        TxnLineID: { "#text": "FAKE-LINE-1" },
        ItemRef: { ListID: { "#text": "FAKE-ITEM-QUARTZ" }, FullName: { "#text": "Quartz" } },
        Desc: { "#text": "Quartz countertop material" },
        Quantity: { "#text": "45" },
        Rate: { "#text": "20.00" },
        Amount: { "#text": "900.00" },
        ClassRef: { ListID: { "#text": "FAKE-CLASS-001" }, FullName: { "#text": "Branch A" } },
        SalesTaxCodeRef: { ListID: { "#text": "FAKE-TAXCODE-1" }, FullName: { "#text": "Non" } },
      },
      {
        "@elementName": "EstimateLineRet",
        TxnLineID: { "#text": "FAKE-LINE-2" },
        Desc: { "#text": "Description-only note line" },
      },
    ],
    ...overrides,
  });
}

/**
 * Synthetic sales-order fixture with Estimate memo convention.
 */
export function buildSyntheticSalesOrderFixture(overrides = {}) {
  return sanitizeQbValue({
    "@elementName": "SalesOrderRet",
    TxnID: { "@elementName": "TxnID", "#text": "FAKE-SO-001" },
    CustomerRef: { ListID: { "#text": "FAKE-CUST-001" }, FullName: { "#text": "Acme Customer:Job One" } },
    ClassRef: { ListID: { "#text": "FAKE-CLASS-001" }, FullName: { "#text": "Branch A" } },
    TxnDate: { "#text": "2024-03-05" },
    RefNumber: { "#text": "5001" },
    TotalAmount: { "#text": "1050.00" },
    IsFullyInvoiced: { "#text": "true" },
    IsManuallyClosed: { "#text": "false" },
    Memo: { "#text": "Estimate 24-1001:" },
    SalesRepRef: { ListID: { "#text": "FAKE-REP-001" }, FullName: { "#text": "AB" } },
    SalesOrderLineRet: [
      {
        TxnLineID: { "#text": "FAKE-SOL-1" },
        ItemRef: { ListID: { "#text": "FAKE-ITEM-QUARTZ" }, FullName: { "#text": "Quartz" } },
        Quantity: { "#text": "45" },
        Rate: { "#text": "22.00" },
        Amount: { "#text": "990.00" },
        Invoiced: { "#text": "45" },
        IsManuallyClosed: { "#text": "false" },
      },
    ],
    ...overrides,
  });
}

/**
 * Synthetic invoice fixture.
 */
export function buildSyntheticInvoiceFixture(overrides = {}) {
  return sanitizeQbValue({
    "@elementName": "InvoiceRet",
    TxnID: { "@elementName": "TxnID", "#text": "FAKE-INV-001" },
    CustomerRef: { ListID: { "#text": "FAKE-CUST-001" }, FullName: { "#text": "Acme Customer:Job One" } },
    TxnDate: { "#text": "2024-03-20" },
    RefNumber: { "#text": "9001" },
    TotalAmount: { "#text": "1050.00" },
    BalanceRemaining: { "#text": "0.00" },
    IsPaid: { "#text": "true" },
    Memo: { "#text": "Estimate 24-1001:" },
    SalesRepRef: { ListID: { "#text": "FAKE-REP-001" }, FullName: { "#text": "AB" } },
    InvoiceLineRet: [
      {
        TxnLineID: { "#text": "FAKE-IL-1" },
        ItemRef: { ListID: { "#text": "FAKE-ITEM-QUARTZ" }, FullName: { "#text": "Quartz" } },
        Quantity: { "#text": "45" },
        Rate: { "#text": "22.00" },
        Amount: { "#text": "990.00" },
      },
    ],
    ...overrides,
  });
}

/**
 * Synthetic payment fixture (no AppliedToTxnRet — matches observed export gap).
 */
export function buildSyntheticPaymentFixture(overrides = {}) {
  return sanitizeQbValue({
    "@elementName": "ReceivePaymentRet",
    TxnID: { "@elementName": "TxnID", "#text": "FAKE-PAY-001" },
    CustomerRef: { ListID: { "#text": "FAKE-CUST-001" }, FullName: { "#text": "Acme Customer" } },
    TxnDate: { "#text": "2024-03-25" },
    TotalAmount: { "#text": "1050.00" },
    UnusedPayment: { "#text": "0.00" },
    PaymentMethodRef: { ListID: { "#text": "FAKE-PM-001" }, FullName: { "#text": "Check" } },
    ...overrides,
  });
}
