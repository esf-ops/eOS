/**
 * Gate customer-facing quote output (print, email, delivery) on persisted quote identity.
 */

export const UNSAVED_QUOTE_OUTPUT_MESSAGE =
  "Save this quote before printing, emailing, or sending it. This prevents quotes from being lost and ensures a quote number is assigned.";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

/**
 * @param {unknown} value
 */
export function isQuoteHeaderUuid(value) {
  return UUID_RE.test(pickStr(value));
}

/**
 * Validate a quote_headers row is ready for customer-facing output.
 *
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {{
 *   ok: true,
 *   quoteId: string,
 *   quoteNumber: string,
 * } | {
 *   ok: false,
 *   code: string,
 *   error: string,
 *   httpStatus: number,
 * }}
 */
export function validateQuoteReadyForCustomerOutput(row) {
  if (!row || typeof row !== "object") {
    return {
      ok: false,
      code: "quote_not_found",
      error: UNSAVED_QUOTE_OUTPUT_MESSAGE,
      httpStatus: 422
    };
  }

  const quoteId = pickStr(row.id);
  if (!isQuoteHeaderUuid(quoteId)) {
    return {
      ok: false,
      code: "quote_not_saved",
      error: UNSAVED_QUOTE_OUTPUT_MESSAGE,
      httpStatus: 422
    };
  }

  const quoteNumber = pickStr(row.quote_number);
  if (!quoteNumber) {
    return {
      ok: false,
      code: "quote_number_missing",
      error: UNSAVED_QUOTE_OUTPUT_MESSAGE,
      httpStatus: 422
    };
  }

  const snapshot = row.calculation_snapshot;
  if (!snapshot || typeof snapshot !== "object" || !Object.keys(snapshot).length) {
    return {
      ok: false,
      code: "calculation_snapshot_missing",
      error:
        "This quote has no saved calculation snapshot. Save the quote again before printing or emailing.",
      httpStatus: 422
    };
  }

  return { ok: true, quoteId, quoteNumber };
}

/**
 * Safe metadata for logs when output is blocked (no secrets).
 *
 * @param {Record<string, unknown>|null|undefined} row
 * @param {string} [action]
 */
export function quoteOutputGateLogMeta(row, action = "customer_output") {
  const r = row && typeof row === "object" ? row : {};
  return {
    action,
    quoteId: pickStr(r.id) || null,
    quoteNumberPresent: Boolean(pickStr(r.quote_number)),
    quoteSource: pickStr(r.quote_source) || null,
    snapshotPresent:
      r.calculation_snapshot != null &&
      typeof r.calculation_snapshot === "object" &&
      Object.keys(r.calculation_snapshot).length > 0
  };
}
