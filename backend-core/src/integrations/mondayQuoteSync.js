/**
 * Monday.com quote sync — staged logging; live API optional when env present.
 *
 * Env (optional):
 * - MONDAY_API_TOKEN
 * - MONDAY_QUOTES_BOARD_ID
 */

/**
 * @param {Record<string, unknown>} quote
 * @param {Record<string, unknown>} snapshot
 */
export function buildMondayQuotePayload(quote, snapshot) {
  const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
  const q = quote && typeof quote === "object" ? quote : {};
  return {
    quote_number: q.quote_number ?? null,
    quote_status: q.quote_status ?? null,
    quote_source: q.quote_source ?? null,
    customer_name: q.customer_name ?? null,
    partner_account: q.account_name ?? q.partner_account_name ?? null,
    sales_rep: q.sales_rep ?? null,
    branch: q.branch ?? null,
    project_type: q.project_type ?? null,
    project_address: [q.project_address, q.city, q.state, q.zip].filter(Boolean).join(", ") || null,
    quote_total: q.grand_total ?? null,
    estimated_square_footage: q.estimated_sqft ?? snap.totals?.estimated_sqft ?? null,
    material_group: q.estimated_material_group ?? snap.inputSummary?.materialGroup ?? null,
    forecast_value: snap.totals?.forecast_value ?? null,
    quote_url: "https://heads.elitestonefabrication.com/quote/TODO",
    created_date: q.created_at ?? null,
    next_follow_up_date: null,
    snapshot_excerpt: {
      pricingStructure: snap.pricingStructure ?? null,
      version: snap.version ?? null
    }
  };
}

/**
 * @param {{ quoteId: string, action: string, db: import("@supabase/supabase-js").SupabaseClient }} params
 */
export async function syncQuoteToMonday(params) {
  const token = String(process.env.MONDAY_API_TOKEN ?? "").trim();
  const boardId = String(process.env.MONDAY_QUOTES_BOARD_ID ?? "").trim();
  const db = params?.db;
  if (!db?.from) {
    return { ok: false, skipped: true, reason: "no_db" };
  }
  if (!token || !boardId) {
    await writeMondaySyncLog({
      quoteId: params.quoteId,
      action: params.action || "sync",
      requestPayload: { boardId: boardId || null },
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
    requestPayload: { boardId, payload },
    responsePayload: { note: "Live Monday GraphQL/API call not implemented in this phase." },
    status: "pending",
    errorMessage: null,
    db
  });
  return { ok: true, skipped: false, status: "pending", note: "TODO: implement Monday mutation when board mapping is approved." };
}

/**
 * @param {{ quoteId: string, action: string, requestPayload?: unknown, responsePayload?: unknown, status: string, errorMessage?: string|null, db: import("@supabase/supabase-js").SupabaseClient }} params
 */
export async function writeMondaySyncLog(params) {
  const db = params.db;
  if (!db?.from) return { ok: false };
  try {
    const { error } = await db.from("quote_monday_sync_log").insert({
      quote_id: params.quoteId,
      action: params.action,
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
