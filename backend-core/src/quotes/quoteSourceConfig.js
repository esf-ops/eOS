/**
 * Quote source configuration — DB-backed with safe defaults when SQL not applied.
 */

const DEFAULT_ROWS = {
  public_consumer: {
    quote_source: "public_consumer",
    display_name: "Public consumer quote",
    monday_board_env_key: "MONDAY_PUBLIC_QUOTES_BOARD_ID",
    default_pricing_structure_code: "public_retail",
    requires_auth: false,
    public_safe: true,
    is_active: true,
    metadata: {}
  },
  internal_quote: {
    quote_source: "internal_quote",
    display_name: "Internal Elite quote",
    monday_board_env_key: "MONDAY_INTERNAL_QUOTES_BOARD_ID",
    default_pricing_structure_code: null,
    requires_auth: true,
    public_safe: false,
    is_active: true,
    metadata: {}
  },
  partner_quote: {
    quote_source: "partner_quote",
    display_name: "Partner portal quote",
    monday_board_env_key: "MONDAY_PARTNER_QUOTES_BOARD_ID",
    default_pricing_structure_code: null,
    requires_auth: true,
    public_safe: false,
    is_active: true,
    metadata: {}
  }
};

function defaultRow(quoteSource) {
  const k = String(quoteSource || "").trim();
  if (k === "partner_portal") return { ...DEFAULT_ROWS.partner_quote, quote_source: "partner_portal" };
  return DEFAULT_ROWS[k] || {
    quote_source: k || "partner_quote",
    display_name: k || "Partner quote",
    monday_board_env_key: "MONDAY_PARTNER_QUOTES_BOARD_ID",
    default_pricing_structure_code: null,
    requires_auth: true,
    public_safe: false,
    is_active: true,
    metadata: {}
  };
}

/**
 * @param {{ quoteSource: string, db?: { from: Function } }} params
 * @returns {Promise<{ row: Record<string, unknown>, fromDb: boolean }>}
 */
export async function getQuoteSourceConfig({ quoteSource, db }) {
  const k = String(quoteSource || "").trim();
  if (!db || typeof db.from !== "function") {
    return { row: defaultRow(k), fromDb: false };
  }
  try {
    const { data, error } = await db
      .from("quote_source_configs")
      .select("*")
      .eq("quote_source", k)
      .eq("is_active", true)
      .limit(1);
    if (error || !data?.[0]) {
      return { row: defaultRow(k), fromDb: false };
    }
    return { row: data[0], fromDb: true };
  } catch {
    return { row: defaultRow(k), fromDb: false };
  }
}

export function isPublicQuoteSource(quoteSource) {
  return String(quoteSource || "").trim() === "public_consumer";
}

/**
 * Env var **name** for Monday board ID (value read from process.env at sync time).
 * @param {string} quoteSource
 */
export function getMondayBoardEnvKeyForQuoteSource(quoteSource) {
  const d = defaultRow(quoteSource);
  return String(d.monday_board_env_key || "MONDAY_QUOTES_BOARD_ID").trim();
}
