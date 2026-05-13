/**
 * Monday.com quote sync — optional live GraphQL create_item when env is configured.
 *
 * Env (optional):
 * - MONDAY_API_TOKEN
 * - MONDAY_PUBLIC_QUOTES_BOARD_ID (public consumer; preferred)
 * - MONDAY_QUOTES_BOARD_ID (legacy fallback when source-specific board unset)
 * - MONDAY_INTERNAL_QUOTES_BOARD_ID / MONDAY_PARTNER_QUOTES_BOARD_ID (other sources)
 *
 * Public column mapping (optional — values are Monday column IDs). If **none** of the
 * `MONDAY_PUBLIC_COL_*` vars below are set, the server creates **item name only** (no column_values).
 *
 * Safe mappings (see docs/quote-platform/monday-public-quotes-setup.md):
 * - MONDAY_PUBLIC_COL_CITY, MONDAY_PUBLIC_COL_STATE — text
 * - MONDAY_PUBLIC_COL_QUOTE_ID (or legacy MONDAY_PUBLIC_COL_QUOTE_NUMBER) — text
 * - MONDAY_PUBLIC_COL_ESTIMATE_SUMMARY — long_text (plain string)
 * - MONDAY_PUBLIC_COL_QUOTE_VALUE — numbers (`{ number }`)
 * - MONDAY_PUBLIC_COL_ESTIMATED_SQFT — numbers (`{ number }`)
 * - MONDAY_PUBLIC_COL_CREATED_DATE — date (`{ date: "YYYY-MM-DD" }`)
 * - MONDAY_PUBLIC_COL_STATUS — status (`{ label }`); MONDAY_PUBLIC_STATUS_LABEL (default: Lead submitted)
 * - MONDAY_PUBLIC_COL_EMAIL — email (`{ email, text }`) when email present
 * - MONDAY_PUBLIC_COL_PHONE — phone (`{ phone, countryShortName: "US" }`) when 10-digit US local after normalize
 * - MONDAY_PUBLIC_COL_CUSTOMER_NAME, MONDAY_PUBLIC_COL_ZIP, MONDAY_PUBLIC_COL_SOURCE — text (legacy)
 *
 * Intentionally not populated yet (need separate validation / IDs / label matching):
 * - MONDAY_PUBLIC_COL_SALES_REP — people column needs Monday user IDs
 * - MONDAY_PUBLIC_COL_ADDRESS — location column needs Monday location payload format validation
 * - MONDAY_PUBLIC_COL_BRANCH — dropdown requires matching configured labels
 */

import { getMondayBoardEnvKeyForQuoteSource, isPublicQuoteSource } from "../quotes/quoteSourceConfig.js";
import { tableHasOrganizationId } from "../organizations/organizationContext.js";

/**
 * Optional per-tenant Monday board env var names (values still read from process.env).
 * @param {import("@supabase/supabase-js").SupabaseClient|null|undefined} db
 * @param {string|null|undefined} organizationId
 * @param {string} quoteSource
 */
async function resolveMondayBoardEnvKeyName(db, organizationId, quoteSource) {
  const fallback = getMondayBoardEnvKeyForQuoteSource(quoteSource || "partner_portal");
  if (!db?.from || !organizationId) return fallback;
  try {
    const { data, error } = await db
      .from("organization_integration_configs")
      .select("config,is_enabled")
      .eq("organization_id", organizationId)
      .eq("integration_key", "monday")
      .limit(1);
    if (error || !data?.length) return fallback;
    const cfg = data[0].config && typeof data[0].config === "object" ? data[0].config : {};
    const src = String(quoteSource || "").trim();
    if (isPublicQuoteSource(src) && cfg.public_quotes_board_env_key) {
      return String(cfg.public_quotes_board_env_key).trim() || fallback;
    }
    if (src === "internal_quote" && cfg.internal_quotes_board_env_key) {
      return String(cfg.internal_quotes_board_env_key).trim() || fallback;
    }
    if ((src.includes("partner") || src === "partner_portal" || src === "partner_quote") && cfg.partner_quotes_board_env_key) {
      return String(cfg.partner_quotes_board_env_key).trim() || fallback;
    }
    if (cfg.legacy_quotes_board_env_key) {
      return String(cfg.legacy_quotes_board_env_key).trim() || fallback;
    }
  } catch {
    /* table missing */
  }
  return fallback;
}

const MONDAY_API_URL = "https://api.monday.com/v2";

const CREATE_ITEM_MUTATION = `
mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
  create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
    id
  }
}
`;

/** Retry without column_values when Monday rejects encoded columns (still JSON!-free path). */
const CREATE_ITEM_NAME_ONLY_MUTATION = `
mutation ($boardId: ID!, $itemName: String!) {
  create_item(board_id: $boardId, item_name: $itemName) {
    id
  }
}
`;

/**
 * @param {Record<string, unknown>} quote
 * @param {Record<string, unknown>} snapshot
 * @param {Record<string, unknown>} [extras]
 */
export function buildMondayQuotePayload(quote, snapshot, extras = {}) {
  const snap = snapshot && typeof snapshot === "object" ? { ...snapshot } : {};
  const q = quote && typeof quote === "object" ? quote : {};
  const ex = extras && typeof extras === "object" ? extras : {};
  return {
    quote_number: q.quote_number ?? null,
    quote_status: q.quote_status ?? null,
    quote_source: q.quote_source ?? null,
    customer_name: q.customer_name ?? null,
    customer_phone: q.customer_phone ?? null,
    customer_email: q.customer_email ?? null,
    partner_account: q.account_name ?? q.partner_account_name ?? null,
    sales_rep: q.sales_rep ?? null,
    branch: q.branch ?? null,
    project_type: q.project_type ?? null,
    project_address: [q.project_address, q.city, q.state, q.zip].filter(Boolean).join(", ") || null,
    city: q.city ?? null,
    state: q.state ?? null,
    zip: q.zip ?? null,
    quote_id: q.id ?? null,
    quote_total: q.grand_total ?? null,
    estimated_square_footage: q.estimated_sqft ?? snap.totals?.estimated_sqft ?? null,
    material_group: q.estimated_material_group ?? snap.inputSummary?.materialGroup ?? null,
    estimates_by_group_summary: ex.estimates_by_group_summary ?? null,
    forecast_value: snap.totals?.forecast_value ?? null,
    quote_url: "https://heads.elitestonefabrication.com/quote/TODO",
    created_date: q.created_at ?? null,
    next_follow_up_date: null,
    snapshot_excerpt: {
      pricingStructure: snap.pricingStructure ?? null,
      version: snap.version ?? null,
      public_safe: snap.public_safe ?? null
    }
  };
}

function abbreviateGroupLabel(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  if (/^group\s*promo$/i.test(s)) return "Promo";
  const m = /^group\s+(.+)$/i.exec(s);
  if (m) return String(m[1]).trim();
  return s;
}

/**
 * Compact homeowner-safe summary for a Monday text column, e.g. "Promo $1,234 | A $1,400 | …"
 * @param {Array<{ group?: string, total?: number }>} rows
 */
export function buildPublicEstimateSummaryCompact(rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  return rows
    .map((row) => {
      const label = abbreviateGroupLabel(row.group);
      const t = Number(row.total);
      const n = Number.isFinite(t) ? t : 0;
      const money = `$${Math.round(n).toLocaleString("en-US")}`;
      return `${label} ${money}`;
    })
    .join(" | ");
}

/**
 * Item name for Public board: "{quote_number} - {customer_name} - {city}, {state}"
 * @param {Record<string, unknown>} payload
 */
export function buildPublicMondayItemName(payload) {
  const qn = String(payload.quote_number || "").trim() || "Quote";
  const cn = String(payload.customer_name || "").trim() || "Customer";
  const city = String(payload.city || "").trim();
  const st = String(payload.state || "").trim();
  const loc = city && st ? `${city}, ${st}` : city || st || "";
  return loc ? `${qn} - ${cn} - ${loc}` : `${qn} - ${cn}`;
}

function buildMondayItemNameForSource(quoteSource, payload) {
  if (isPublicQuoteSource(quoteSource)) {
    return buildPublicMondayItemName(payload);
  }
  const qn = String(payload.quote_number || "").trim() || "Quote";
  const cn = String(payload.customer_name || "").trim() || "Customer";
  return `${qn} - ${cn}`;
}

/** Env vars that count as "public Monday column mapping is configured". */
const PUBLIC_MONDAY_COLUMN_MAPPING_ENV_NAMES = [
  "MONDAY_PUBLIC_COL_STATUS",
  "MONDAY_PUBLIC_COL_QUOTE_VALUE",
  "MONDAY_PUBLIC_COL_CREATED_DATE",
  "MONDAY_PUBLIC_COL_PHONE",
  "MONDAY_PUBLIC_COL_EMAIL",
  "MONDAY_PUBLIC_COL_CITY",
  "MONDAY_PUBLIC_COL_STATE",
  "MONDAY_PUBLIC_COL_ZIP",
  "MONDAY_PUBLIC_COL_ESTIMATED_SQFT",
  "MONDAY_PUBLIC_COL_ESTIMATE_SUMMARY",
  "MONDAY_PUBLIC_COL_QUOTE_ID",
  "MONDAY_PUBLIC_COL_QUOTE_NUMBER",
  "MONDAY_PUBLIC_COL_CUSTOMER_NAME",
  "MONDAY_PUBLIC_COL_SOURCE"
];

export function publicMondayColumnMappingConfigured() {
  return PUBLIC_MONDAY_COLUMN_MAPPING_ENV_NAMES.some((k) => String(process.env[k] || "").trim().length > 0);
}

function envCol(envName) {
  return String(process.env[envName] || "").trim();
}

/**
 * @param {unknown} raw
 * @returns {string|null} 10-digit US local part, or null
 */
export function normalizeMondayUsPhone10(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  return null;
}

function recordSkipped(skippedColumns, reason, detail) {
  skippedColumns.push({ reason, detail: detail ?? null });
}

/**
 * Build Monday `column_values` object (keys = column IDs, values = Monday-native shapes).
 * @param {{ payload: Record<string, unknown>, estimateSummary: string }} input
 * @returns {{ columnValues: Record<string, unknown>, attemptedColumnIds: string[], skippedColumns: Array<{ reason: string, detail?: string|null }> }}
 */
export function buildMondayPublicColumnValues(input) {
  const payload = input?.payload && typeof input.payload === "object" ? input.payload : {};
  const estimateSummary = String(input?.estimateSummary ?? "");
  const skippedColumns = [];
  const o = {};

  const setText = (envName, value) => {
    const id = envCol(envName);
    if (!id) {
      recordSkipped(skippedColumns, "no_column_id", envName);
      return;
    }
    if (value === null || value === undefined) {
      recordSkipped(skippedColumns, "empty_value", envName);
      return;
    }
    const s = String(value).trim();
    if (!s) {
      recordSkipped(skippedColumns, "empty_value", envName);
      return;
    }
    o[id] = s;
  };

  const setNumber = (envName, value) => {
    const id = envCol(envName);
    if (!id) {
      recordSkipped(skippedColumns, "no_column_id", envName);
      return;
    }
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) {
      recordSkipped(skippedColumns, "invalid_number", envName);
      return;
    }
    o[id] = { number: n };
  };

  setText("MONDAY_PUBLIC_COL_CITY", payload.city);
  setText("MONDAY_PUBLIC_COL_STATE", payload.state);
  setText("MONDAY_PUBLIC_COL_CUSTOMER_NAME", payload.customer_name);
  setText("MONDAY_PUBLIC_COL_ZIP", payload.zip);
  setText("MONDAY_PUBLIC_COL_SOURCE", payload.quote_source);

  const quoteIdCol = envCol("MONDAY_PUBLIC_COL_QUOTE_ID");
  if (quoteIdCol) {
    const qn = String(payload.quote_number || "").trim();
    const internal =
      payload.quote_id != null ? String(payload.quote_id).trim() : payload.id != null ? String(payload.id).trim() : "";
    const v = qn || internal;
    if (v) o[quoteIdCol] = v;
    else recordSkipped(skippedColumns, "empty_value", "MONDAY_PUBLIC_COL_QUOTE_ID");
  }

  setText("MONDAY_PUBLIC_COL_QUOTE_NUMBER", payload.quote_number);

  if (estimateSummary.trim()) {
    setText("MONDAY_PUBLIC_COL_ESTIMATE_SUMMARY", estimateSummary.trim());
  }

  setNumber("MONDAY_PUBLIC_COL_QUOTE_VALUE", payload.quote_total);
  setNumber("MONDAY_PUBLIC_COL_ESTIMATED_SQFT", payload.estimated_square_footage);

  const emailCol = envCol("MONDAY_PUBLIC_COL_EMAIL");
  if (emailCol) {
    const em = String(payload.customer_email || "").trim();
    if (em) o[emailCol] = { email: em, text: em };
    else recordSkipped(skippedColumns, "missing_email", "MONDAY_PUBLIC_COL_EMAIL");
  }

  const phoneCol = envCol("MONDAY_PUBLIC_COL_PHONE");
  if (phoneCol) {
    const phone10 = normalizeMondayUsPhone10(payload.customer_phone);
    if (phone10) o[phoneCol] = { phone: phone10, countryShortName: "US" };
    else recordSkipped(skippedColumns, "invalid_or_missing_phone", "MONDAY_PUBLIC_COL_PHONE");
  }

  const statusCol = envCol("MONDAY_PUBLIC_COL_STATUS");
  if (statusCol) {
    const label = String(process.env.MONDAY_PUBLIC_STATUS_LABEL || "Lead submitted").trim() || "Lead submitted";
    o[statusCol] = { label };
  }

  const dateCol = envCol("MONDAY_PUBLIC_COL_CREATED_DATE");
  if (dateCol) {
    const raw = payload.created_date ? new Date(String(payload.created_date)) : new Date();
    const iso = Number.isFinite(raw.getTime()) ? raw.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    o[dateCol] = { date: iso };
  }

  if (envCol("MONDAY_PUBLIC_COL_SALES_REP")) {
    recordSkipped(skippedColumns, "skipped_unimplemented_people_column", "MONDAY_PUBLIC_COL_SALES_REP");
    // TODO: People column requires Monday user IDs — map sales_rep to person IDs before sending.
  }
  if (envCol("MONDAY_PUBLIC_COL_BRANCH")) {
    recordSkipped(skippedColumns, "skipped_unimplemented_dropdown_column", "MONDAY_PUBLIC_COL_BRANCH");
    // TODO: Dropdown requires exact label match to Monday board options for Branch Location.
  }
  if (envCol("MONDAY_PUBLIC_COL_ADDRESS")) {
    recordSkipped(skippedColumns, "skipped_unimplemented_location_column", "MONDAY_PUBLIC_COL_ADDRESS");
    // TODO: Location column requires validated Monday location JSON payload (address / lat / lng per Monday spec).
  }

  const attemptedColumnIds = Object.keys(o);
  return { columnValues: o, attemptedColumnIds, skippedColumns };
}

/**
 * @param {string} token
 * @param {string} query
 * @param {Record<string, unknown>} [variables]
 */
async function mondayGraphql(token, query, variables = {}) {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: String(token).trim()
    },
    body: JSON.stringify({ query, variables })
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Monday returned non-JSON (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`Monday HTTP ${res.status}`);
  }
  const errs = json?.errors;
  if (Array.isArray(errs) && errs.length) {
    const msg = errs
      .map((e) => (e && typeof e.message === "string" ? e.message : JSON.stringify(e)))
      .join("; ");
    throw new Error(msg || "Monday GraphQL error");
  }
  return json;
}

function safeMondayErrorMessage(err) {
  const s = String(err?.message || err || "Unknown error")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 4000);
  return s;
}

/**
 * Dev-safe diagnostics when create_item fails (never logs MONDAY_API_TOKEN).
 * @param {{
 *   boardIdPresent: boolean,
 *   itemName: string,
 *   columnIds: string[],
 *   columnValuesVar: unknown,
 *   typeof_columnValues: string,
 *   columnValuesJson: string,
 *   skipped_columns?: Array<{ reason: string, detail?: string|null }>
 * }} ctx
 */
function logMondayCreateItemDiagnostics(ctx) {
  const preview = String(ctx.columnValuesJson || "").slice(0, 500);
  console.warn("[monday:create_item] diagnostics", {
    board_id_configured: ctx.boardIdPresent,
    item_name: ctx.itemName,
    attempted_column_ids: ctx.columnIds,
    typeof_columnValues: ctx.typeof_columnValues,
    column_values_json_preview: preview,
    skipped_columns: ctx.skipped_columns ?? []
  });
}

function extractCreateItemId(json) {
  const itemIdRaw = json?.data?.create_item?.id;
  return itemIdRaw != null ? String(itemIdRaw) : null;
}

async function patchQuoteHeaderMondayIds(db, quoteId, boardId, itemId) {
  if (!db?.from || !quoteId) return;
  try {
    await db
      .from("quote_headers")
      .update({
        monday_board_id: String(boardId),
        monday_item_id: String(itemId),
        updated_at: new Date().toISOString()
      })
      .eq("id", quoteId);
  } catch {
    /* columns may be missing on older schemas — non-fatal */
  }
}

/**
 * @param {{ quoteId: string, action: string, db: import("@supabase/supabase-js").SupabaseClient, payload?: Record<string, unknown>, quoteSource?: string, organizationId?: string|null }} params
 * @returns {Promise<{ ok: boolean, skipped?: boolean, status?: string, reason?: string, monday_item_id?: string|null, monday_board_id?: string|null, warning?: string|null }>}
 */
export async function syncQuoteToMonday(params) {
  const token = String(process.env.MONDAY_API_TOKEN ?? "").trim();
  const quoteSource = String(params.quoteSource || params.payload?.quote_source || "").trim();
  const envKeyName = await resolveMondayBoardEnvKeyName(params.db, params.organizationId, quoteSource);
  let boardId = String(process.env[envKeyName] ?? "").trim();
  if (!boardId) boardId = String(process.env.MONDAY_QUOTES_BOARD_ID ?? "").trim();

  const db = params?.db;
  if (!db?.from) {
    return { ok: false, skipped: true, reason: "no_db" };
  }
  if (!token || !boardId) {
    await writeMondaySyncLog({
      quoteId: params.quoteId,
      action: params.action || "sync",
      mondayBoardId: null,
      mondayItemId: null,
      requestPayload: { envKeyName, boardId: boardId || null, quote_source: quoteSource || null },
      responsePayload: null,
      status: "skipped_missing_config",
      errorMessage: null,
      db,
      organizationId: params.organizationId ?? null
    });
    return { ok: true, skipped: true, status: "skipped_missing_config" };
  }

  const payload = params.payload && typeof params.payload === "object" ? params.payload : {};
  const itemName = buildMondayItemNameForSource(quoteSource, payload);

  const summaryRows = Array.isArray(payload.estimates_by_group_summary) ? payload.estimates_by_group_summary : [];
  const estimateSummary = isPublicQuoteSource(quoteSource) ? buildPublicEstimateSummaryCompact(summaryRows) : "";

  const isPublic = isPublicQuoteSource(quoteSource);
  const buildResult = isPublic
    ? buildMondayPublicColumnValues({ payload, estimateSummary })
    : { columnValues: {}, attemptedColumnIds: [], skippedColumns: [] };
  const columnValuesObj = buildResult.columnValues;
  const columnIds = buildResult.attemptedColumnIds;
  const skippedCols = buildResult.skippedColumns;
  const columnValuesJson = JSON.stringify(columnValuesObj);

  const mappingEnvConfigured = publicMondayColumnMappingConfigured();
  const hasColumnPayload =
    isPublic && mappingEnvConfigured && Object.keys(columnValuesObj).length > 0;

  const boardIdPresent = Boolean(String(boardId || "").trim());

  const requestPayload = {
    boardId,
    envKeyName,
    quote_source: quoteSource || null,
    item_name: itemName,
    column_values: columnValuesObj,
    column_values_json: columnValuesJson,
    attempted_column_ids: columnIds,
    skipped_columns: skippedCols,
    column_mapping_env_configured: mappingEnvConfigured,
    graphql: hasColumnPayload ? "create_item" : "create_item_name_only"
  };

  let json = null;
  let itemId = null;
  let firstError = null;

  async function createNameOnlyAndFinish(status, extraResponse = {}) {
    const nameJson = await mondayGraphql(token, CREATE_ITEM_NAME_ONLY_MUTATION, {
      boardId: String(boardId),
      itemName
    });
    const id = extractCreateItemId(nameJson);
    if (!id) throw new Error("Monday create_item (name-only) returned no id");
    await patchQuoteHeaderMondayIds(db, params.quoteId, boardId, id);
    await writeMondaySyncLog({
      quoteId: params.quoteId,
      action: params.action || "sync",
      mondayBoardId: String(boardId),
      mondayItemId: id,
      requestPayload,
      responsePayload: { data: nameJson?.data ?? null, ...extraResponse },
      status,
      errorMessage: null,
      db,
      organizationId: params.organizationId ?? null
    });
    return {
      ok: true,
      skipped: false,
      status,
      monday_item_id: id,
      monday_board_id: String(boardId),
      warning: null
    };
  }

  try {
    if (isPublic && !hasColumnPayload) {
      return await createNameOnlyAndFinish("success", {
        note: mappingEnvConfigured ? "name_only_empty_column_values" : "name_only_no_mapping_env"
      });
    }

    json = await mondayGraphql(token, CREATE_ITEM_MUTATION, {
      boardId: String(boardId),
      itemName,
      columnValues: columnValuesJson
    });
    itemId = extractCreateItemId(json);
    if (!itemId) {
      throw new Error("Monday create_item returned no id");
    }

    await patchQuoteHeaderMondayIds(db, params.quoteId, boardId, itemId);

    await writeMondaySyncLog({
      quoteId: params.quoteId,
      action: params.action || "sync",
      mondayBoardId: String(boardId),
      mondayItemId: itemId,
      requestPayload,
      responsePayload: { data: json?.data ?? null },
      status: "success",
      errorMessage: null,
      db,
      organizationId: params.organizationId ?? null
    });

    return {
      ok: true,
      skipped: false,
      status: "success",
      monday_item_id: itemId,
      monday_board_id: String(boardId),
      warning: null
    };
  } catch (e) {
    firstError = safeMondayErrorMessage(e);
    logMondayCreateItemDiagnostics({
      boardIdPresent,
      itemName,
      columnIds,
      columnValuesVar: columnValuesJson,
      typeof_columnValues: typeof columnValuesJson,
      columnValuesJson,
      skipped_columns: skippedCols
    });

    let retryJson = null;
    let retryItemId = null;
    let secondError = null;
    try {
      retryJson = await mondayGraphql(token, CREATE_ITEM_NAME_ONLY_MUTATION, {
        boardId: String(boardId),
        itemName
      });
      retryItemId = extractCreateItemId(retryJson);
      if (!retryItemId) {
        throw new Error("Monday create_item (name-only) returned no id");
      }
    } catch (e2) {
      secondError = safeMondayErrorMessage(e2);
    }

    if (retryItemId) {
      await patchQuoteHeaderMondayIds(db, params.quoteId, boardId, retryItemId);

      const partialWarning =
        "Your Monday item was created with the quote title only; some columns could not be filled automatically. Elite can update the board.";

      await writeMondaySyncLog({
        quoteId: params.quoteId,
        action: params.action || "sync",
        mondayBoardId: String(boardId),
        mondayItemId: retryItemId,
        requestPayload: { ...requestPayload, retry: "create_item_name_only" },
        responsePayload: {
          data: retryJson?.data ?? null,
          monday_column_values_error: firstError.slice(0, 2000),
          attempted_column_ids: columnIds,
          typeof_columnValues: typeof columnValuesJson,
          skipped_columns: skippedCols,
          note: "success_partial_columns — item created without column_values after first attempt failed"
        },
        status: "success_partial_columns",
        errorMessage: firstError.slice(0, 4000),
        db,
        organizationId: params.organizationId ?? null
      });

      return {
        ok: true,
        skipped: false,
        status: "success_partial_columns",
        monday_item_id: retryItemId,
        monday_board_id: String(boardId),
        warning: partialWarning
      };
    }

    const combinedErr = [firstError, secondError ? `name_only_retry: ${secondError}` : "name_only_retry: (no message)"]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 4000);

    await writeMondaySyncLog({
      quoteId: params.quoteId,
      action: params.action || "sync",
      mondayBoardId: String(boardId),
      mondayItemId: null,
      requestPayload,
      responsePayload: {
        error: combinedErr.slice(0, 500),
        attempted_column_ids: columnIds,
        typeof_columnValues: typeof columnValuesJson,
        skipped_columns: skippedCols
      },
      status: "failed",
      errorMessage: combinedErr,
      db,
      organizationId: params.organizationId ?? null
    });

    return {
      ok: true,
      skipped: false,
      status: "failed",
      monday_item_id: null,
      monday_board_id: String(boardId),
      warning:
        "We saved your measurements. We couldn't sync to our Monday board yet — Elite will still follow up."
    };
  }
}

/**
 * @param {{ quoteId: string, action: string, mondayBoardId?: string|null, mondayItemId?: string|null, requestPayload?: unknown, responsePayload?: unknown, status: string, errorMessage?: string|null, db: import("@supabase/supabase-js").SupabaseClient, organizationId?: string|null }} params
 */
export async function writeMondaySyncLog(params) {
  const db = params.db;
  if (!db?.from) return { ok: false };
  try {
    const row = {
      quote_id: params.quoteId,
      action: params.action,
      monday_board_id: params.mondayBoardId ?? null,
      monday_item_id: params.mondayItemId ?? null,
      request_payload: params.requestPayload ?? null,
      response_payload: params.responsePayload ?? null,
      status: params.status,
      error_message: params.errorMessage ?? null
    };
    const orgId = params.organizationId ? String(params.organizationId).trim() : "";
    if (orgId && (await tableHasOrganizationId(db, "quote_monday_sync_log"))) {
      row.organization_id = orgId;
    }
    const { error } = await db.from("quote_monday_sync_log").insert(row);
    if (error) throw error;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
