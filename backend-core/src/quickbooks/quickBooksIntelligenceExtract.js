/**
 * quickBooksIntelligenceExtract — Phase 4G.4 JS mirror of SQL intel amount helpers.
 *
 * Used for unit tests of the SQL extraction contract with fake/sentinel payloads only.
 * Never logs or returns raw_payload to API callers.
 */

/**
 * Mirror of public.qb_json_scalar_text / qb_json_money (simplified for tests).
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseIntelMoneyScalar(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return null;

  let text = null;
  if (typeof value === "string") {
    text = value;
  } else if (typeof value === "object" && value !== null && "#text" in value) {
    text = /** @type {{ "#text"?: unknown }} */ (value)["#text"];
  } else {
    return null;
  }

  if (typeof text === "number" && Number.isFinite(text)) return text;
  if (typeof text !== "string") return null;

  const cleaned = text
    .trim()
    .replace(/[,$]/g, "")
    .replace(/^[^0-9.-]+/, "");
  if (!cleaned || !/^-?[0-9]+(\.[0-9]+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Mirror of public.qb_intel_extract_total_amount.
 * Priority: TotalAmount → Subtotal → Amount → AppliedAmount.
 *
 * @param {Record<string, unknown>|null|undefined} payload
 * @returns {number|null}
 */
export function extractIntelTotalAmount(payload) {
  if (!payload || typeof payload !== "object") return null;
  return (
    parseIntelMoneyScalar(payload.TotalAmount) ??
    parseIntelMoneyScalar(payload.Subtotal) ??
    parseIntelMoneyScalar(payload.Amount) ??
    parseIntelMoneyScalar(payload.AppliedAmount) ??
    null
  );
}

/**
 * Mirror of public.qb_intel_extract_open_amount.
 * Priority: BalanceRemaining → OpenAmount → AmountDue.
 *
 * @param {Record<string, unknown>|null|undefined} payload
 * @returns {number|null}
 */
export function extractIntelOpenAmount(payload) {
  if (!payload || typeof payload !== "object") return null;
  return (
    parseIntelMoneyScalar(payload.BalanceRemaining) ??
    parseIntelMoneyScalar(payload.OpenAmount) ??
    parseIntelMoneyScalar(payload.AmountDue) ??
    null
  );
}
