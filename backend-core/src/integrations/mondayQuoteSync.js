/**
 * Monday.com quote sync — staged logging; live API optional when env present.
 *
 * Env (optional):
 * - MONDAY_API_TOKEN
 * - MONDAY_QUOTES_BOARD_ID (legacy fallback)
 * - MONDAY_PUBLIC_QUOTES_BOARD_ID
 * - MONDAY_INTERNAL_QUOTES_BOARD_ID
 * - MONDAY_PARTNER_QUOTES_BOARD_ID
 */

import { getMondayBoardEnvKeyForQuoteSource } from "../quotes/quoteSourceConfig.js";

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

/**
 * @param {{ quoteId: string, action: string, db: import("@supabase/supabase-js").SupabaseClient, payload?: Record<string, unknown>, quoteSource?: string }} params
 */
export async function syncQuoteToMonday(params) {
  const token = String(process.env.MONDAY_API_TOKEN ?? "").trim();
  const quoteSource = String(params.quoteSource || params.payload?.quote_source || "").trim();
  const envKeyName = getMondayBoardEnvKeyForQuoteSource(quoteSource || "partner_portal");
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
      requestPayload: { envKeyName, boardId: boardId || null, quote_source: quoteSource || null },
      responsePayload: null,
      status: "skipped_missing_config",
      errorMessage: null,
      db
    });
    return { ok: true, skipped: true, status: "skipped_missing_config" };
  }

  const payload = params.payload || {};
  await writeMondaySyncLog({
    quoteId: params.quoteId,
    action: params.action || "sync",
    mondayBoardId: boardId,
    requestPayload: { boardId, envKeyName, quote_source: quoteSource || null, payload },
    responsePayload: { note: "Live Monday GraphQL/API call not implemented in this phase." },
    status: "pending",
    errorMessage: null,
    db
  });
  return { ok: true, skipped: false, status: "pending", note: "TODO: implement Monday mutation when board mapping is approved." };
}

/**
 * @param {{ quoteId: string, action: string, mondayBoardId?: string|null, requestPayload?: unknown, responsePayload?: unknown, status: string, errorMessage?: string|null, db: import("@supabase/supabase-js").SupabaseClient }} params
 */
export async function writeMondaySyncLog(params) {
  const db = params.db;
  if (!db?.from) return { ok: false };
  try {
    const { error } = await db.from("quote_monday_sync_log").insert({
      quote_id: params.quoteId,
      action: params.action,
      monday_board_id: params.mondayBoardId ?? null,
      request_payload: params.requestPayload ?? null,
      response_payload: params.responsePayload ?? null,
      status: params.status,
      error_message: params.errorMessage ?? null
    });
    if (error) throw error;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
