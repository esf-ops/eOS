/**
 * Phase 1 — EstimateAdd qbXML builder (construction only).
 * Does not transmit. Does not implement Invoice/Customer/Item Add/Mod.
 *
 * qbXML version default 13.0 matches quickbooks-sdk-connector ConnectorSettings /
 * run-extract.ps1 / live-sdk-linked-smoke.ps1 (Desktop SDK QBXMLRP2 path).
 */

export const DEFAULT_QBXML_VERSION = "13.0";

/**
 * @param {unknown} value
 */
function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Currency-safe expected amount = quantity * rate (2 decimal places).
 * @param {number} quantity
 * @param {number} rate
 */
export function expectedLineAmount(quantity, rate) {
  return Math.round(Number(quantity) * Number(rate) * 100) / 100;
}

/**
 * Validate quantity/rate and that expected amount matches quantity*rate within $0.005.
 * @param {{ quantity: number, rate: number, amount?: number|null, lineIndex?: number }} line
 */
export function assertQuantityRateAmountConsistent(line) {
  const idx = line.lineIndex != null ? line.lineIndex : 0;
  const quantity = Number(line.quantity);
  const rate = Number(line.rate);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`EstimateAdd line ${idx + 1} requires positive quantity.`);
  }
  if (!Number.isFinite(rate)) {
    throw new Error(`EstimateAdd line ${idx + 1} requires numeric rate.`);
  }
  const expected = expectedLineAmount(quantity, rate);
  if (line.amount != null && Number.isFinite(Number(line.amount))) {
    const supplied = Number(line.amount);
    if (Math.abs(supplied - expected) > 0.005) {
      throw new Error(
        `EstimateAdd line ${idx + 1}: amount ${supplied} != quantity*rate ${expected}.`
      );
    }
  }
  return { quantity, rate, expectedAmount: expected };
}

/**
 * @param {string} qbXmlVersion
 * @param {string} innerRequest
 */
export function wrapEstimateAddQbXml(qbXmlVersion, innerRequest) {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<?qbxml version="${escapeXml(qbXmlVersion)}"?>` +
    `<QBXML><QBXMLMsgsRq onError="stopOnError">${innerRequest}</QBXMLMsgsRq></QBXML>`
  );
}

/**
 * @typedef {{
 *   itemListId: string,
 *   desc: string,
 *   quantity: number,
 *   rate: number,
 *   amount?: number|null,
 *   eliteosConceptKey?: string|null,
 * }} EstimateAddLineInput
 */

/**
 * @typedef {{
 *   customerListId: string,
 *   refNumber: string,
 *   txnDate: string,
 *   memo?: string|null,
 *   lines: EstimateAddLineInput[],
 *   qbXmlVersion?: string,
 *   requestId?: string,
 * }} EstimateAddInput
 */

/**
 * Build EstimateAddRq qbXML. Construction only — never sends.
 * Emits Quantity + Rate only (no Amount) so QuickBooks computes Amount.
 * @param {EstimateAddInput} input
 * @returns {{ qbXml: string, validatedAmounts: Array<{ quantity: number, rate: number, expectedAmount: number }> }}
 */
export function buildEstimateAddQbXml(input) {
  const customerListId = String(input?.customerListId || "").trim();
  const refNumber = String(input?.refNumber || "").trim();
  const txnDate = String(input?.txnDate || "").trim();
  const lines = Array.isArray(input?.lines) ? input.lines : [];
  const qbXmlVersion = String(input?.qbXmlVersion || DEFAULT_QBXML_VERSION).trim() || DEFAULT_QBXML_VERSION;
  const requestId = String(input?.requestId || `estimate-add-${Date.now()}`).trim();

  if (!customerListId) throw new Error("EstimateAdd requires customerListId.");
  if (!refNumber) throw new Error("EstimateAdd requires refNumber.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDate)) {
    throw new Error("EstimateAdd requires txnDate as YYYY-MM-DD.");
  }
  if (lines.length === 0) throw new Error("EstimateAdd requires at least one line.");

  /** @type {Array<{ quantity: number, rate: number, expectedAmount: number }>} */
  const validatedAmounts = [];

  const lineXml = lines
    .map((line, idx) => {
      const itemListId = String(line?.itemListId || "").trim();
      if (!itemListId) throw new Error(`EstimateAdd line ${idx + 1} missing itemListId.`);
      const checked = assertQuantityRateAmountConsistent({
        quantity: line.quantity,
        rate: line.rate,
        amount: line.amount,
        lineIndex: idx
      });
      validatedAmounts.push(checked);
      const desc = String(line.desc || "").trim();
      // Do NOT emit Amount when Quantity + Rate are supplied (QB Desktop contract).
      return (
        `<EstimateLineAdd>` +
        `<ItemRef><ListID>${escapeXml(itemListId)}</ListID></ItemRef>` +
        (desc ? `<Desc>${escapeXml(desc)}</Desc>` : "") +
        `<Quantity>${escapeXml(String(checked.quantity))}</Quantity>` +
        `<Rate>${escapeXml(String(checked.rate))}</Rate>` +
        `</EstimateLineAdd>`
      );
    })
    .join("");

  const memo = input?.memo != null ? String(input.memo).trim() : "";
  const inner =
    `<EstimateAddRq requestID="${escapeXml(requestId)}">` +
    `<EstimateAdd>` +
    `<CustomerRef><ListID>${escapeXml(customerListId)}</ListID></CustomerRef>` +
    `<TxnDate>${escapeXml(txnDate)}</TxnDate>` +
    `<RefNumber>${escapeXml(refNumber)}</RefNumber>` +
    (memo ? `<Memo>${escapeXml(memo)}</Memo>` : "") +
    lineXml +
    `</EstimateAdd>` +
    `</EstimateAddRq>`;

  return {
    qbXml: wrapEstimateAddQbXml(qbXmlVersion, inner),
    validatedAmounts
  };
}

/**
 * Controlled QBTEST-0001 fixture lines — fake descriptions only.
 * Rates are explicit test values (not live Pricing Admin reads).
 */
export const QBTEST_0001_CONCEPT_KEYS = Object.freeze([
  "tear_out",
  "cooktop_cutout",
  "kitchen_sink_cutout",
  "waterfall"
]);

export const QBTEST_CUSTOMER_FULL_NAME = "ELITEOS TEST CUSTOMER";
export const QBTEST_REF_NUMBER = "QBTEST-0001";
export const QBTEST_IDEMPOTENCY_KEY = "eliteos:qbtest-0001:EstimateAdd:v1";

/**
 * @param {ReadonlyArray<{ eliteos_concept_key: string, qb_list_id: string, qb_full_name?: string|null }>} resolvedMappings
 * @param {{ txnDate?: string, memo?: string, qbXmlVersion?: string, customerListId: string }} opts
 */
export function buildQbtest0001EstimateAdd(resolvedMappings, opts) {
  const byKey = new Map((resolvedMappings || []).map((m) => [m.eliteos_concept_key, m]));
  /** @type {EstimateAddLineInput[]} */
  const lines = [
    {
      eliteosConceptKey: "tear_out",
      itemListId: byKey.get("tear_out")?.qb_list_id || "",
      desc: "QBTEST fake line — Tear Out (DO NOT USE IN PRODUCTION)",
      quantity: 1,
      rate: 750
    },
    {
      eliteosConceptKey: "cooktop_cutout",
      itemListId: byKey.get("cooktop_cutout")?.qb_list_id || "",
      desc: "QBTEST fake line — Cooktop Cutout (DO NOT USE IN PRODUCTION)",
      quantity: 1,
      rate: 150
    },
    {
      eliteosConceptKey: "kitchen_sink_cutout",
      itemListId: byKey.get("kitchen_sink_cutout")?.qb_list_id || "",
      desc: "QBTEST fake line — Kitchen Sink Cutout (DO NOT USE IN PRODUCTION)",
      quantity: 1,
      rate: 200
    },
    {
      eliteosConceptKey: "waterfall",
      itemListId: byKey.get("waterfall")?.qb_list_id || "",
      desc: "QBTEST fake line — Waterfall (DO NOT USE IN PRODUCTION)",
      quantity: 1,
      rate: 600
    }
  ];

  const built = buildEstimateAddQbXml({
    customerListId: opts.customerListId,
    refNumber: QBTEST_REF_NUMBER,
    txnDate: opts.txnDate || new Date().toISOString().slice(0, 10),
    memo: opts.memo || "eliteOS Phase 1 dry-run — QBTEST-0001 — NOTHING SHOULD BE SENT",
    lines,
    qbXmlVersion: opts.qbXmlVersion || DEFAULT_QBXML_VERSION,
    requestId: "qbtest-0001-estimate-add"
  });

  const linesWithExpected = lines.map((ln, i) => ({
    ...ln,
    expectedAmount: built.validatedAmounts[i]?.expectedAmount ?? expectedLineAmount(ln.quantity, ln.rate)
  }));

  return {
    refNumber: QBTEST_REF_NUMBER,
    customerListId: opts.customerListId,
    lines: linesWithExpected,
    qbXml: built.qbXml
  };
}

/**
 * Sanitize qbXML for operator logs — keep ListIDs/structure; no secrets.
 * @param {string} qbXml
 */
export function sanitizeEstimateAddQbXmlForDisplay(qbXml) {
  return String(qbXml || "").trim();
}

export function qbXmlContainsWriteRequest(qbXml) {
  return /<(EstimateAdd|EstimateMod|InvoiceAdd|InvoiceMod|SalesOrderAdd|CustomerAdd|CustomerMod|ItemAdd|ItemMod)Rq[\s>]/i.test(
    String(qbXml || "")
  );
}
