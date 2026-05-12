/**
 * Quote analytics read models (aggregate over quote_headers).
 * Safe when tables are missing (returns empty metrics).
 */

import { tableHasOrganizationId } from "../organizations/organizationContext.js";
function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

async function safeQuoteHeadersQuery(db, buildQuery, organizationScope) {
  if (!db?.from) return { ok: false, rows: [], missing: true };
  try {
    let base = db.from("quote_headers");
    if (organizationScope?.organizationId && organizationScope?.hasOrganizationIdColumn) {
      const filt = `organization_id.eq.${organizationScope.organizationId},organization_id.is.null`;
      base = base.or(filt);
    }
    const q = buildQuery(base);
    const { data, error } = await q;
    if (error) throw error;
    return { ok: true, rows: data ?? [] };
  } catch (e) {
    if (isMissingRelationError(e)) return { ok: false, rows: [], missing: true };
    throw e;
  }
}

function inDateRange(row, startMs, endMs) {
  const t = new Date(row.created_at || 0).getTime();
  return t >= startMs && t <= endMs;
}

function sumField(rows, field) {
  return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

/**
 * @param {{ startDate?: string, endDate?: string, db: import("@supabase/supabase-js").SupabaseClient, organizationScope?: { organizationId?: string|null, hasOrganizationIdColumn?: boolean } }} params
 */
export async function getQuotePipelineSummary(params) {
  const db = params.db;
  const startMs = params.startDate ? new Date(params.startDate).getTime() : 0;
  const endMs = params.endDate ? new Date(params.endDate).getTime() : Date.now();
  const { rows, missing } = await safeQuoteHeadersQuery(db, (q) => q.select("quote_status, grand_total, created_at"), params.organizationScope);
  if (missing) {
    return {
      ok: true,
      installed: false,
      total_quotes: 0,
      total_quote_value: 0,
      by_status: {},
      message: "Quote platform tables not installed."
    };
  }
  const filtered = rows.filter((r) => inDateRange(r, startMs, endMs));
  const byStatus = {};
  for (const r of filtered) {
    const st = String(r.quote_status || "unknown");
    byStatus[st] = (byStatus[st] || 0) + 1;
  }
  return {
    ok: true,
    installed: true,
    total_quotes: filtered.length,
    total_quote_value: sumField(filtered, "grand_total"),
    average_quote_value: filtered.length ? sumField(filtered, "grand_total") / filtered.length : 0,
    by_status: byStatus
  };
}

/**
 * @param {{ startDate?: string, endDate?: string, db: import("@supabase/supabase-js").SupabaseClient, organizationScope?: { organizationId?: string|null, hasOrganizationIdColumn?: boolean } }} params
 */
export async function getQuoteMetricsBySalesRep(params) {
  const db = params.db;
  const startMs = params.startDate ? new Date(params.startDate).getTime() : 0;
  const endMs = params.endDate ? new Date(params.endDate).getTime() : Date.now();
  const { rows, missing } = await safeQuoteHeadersQuery(db, (q) => q.select("sales_rep, grand_total, created_at"), params.organizationScope);
  if (missing) return { ok: true, installed: false, quote_value_by_sales_rep: {} };
  const filtered = rows.filter((r) => inDateRange(r, startMs, endMs));
  const map = {};
  for (const r of filtered) {
    const k = String(r.sales_rep || "Unassigned").trim() || "Unassigned";
    map[k] = (map[k] || 0) + (Number(r.grand_total) || 0);
  }
  return { ok: true, installed: true, quote_value_by_sales_rep: map };
}

/**
 * @param {{ startDate?: string, endDate?: string, db: import("@supabase/supabase-js").SupabaseClient, organizationScope?: { organizationId?: string|null, hasOrganizationIdColumn?: boolean } }} params
 */
export async function getQuoteMetricsByBranch(params) {
  const db = params.db;
  const startMs = params.startDate ? new Date(params.startDate).getTime() : 0;
  const endMs = params.endDate ? new Date(params.endDate).getTime() : Date.now();
  const { rows, missing } = await safeQuoteHeadersQuery(db, (q) => q.select("branch, grand_total, created_at"), params.organizationScope);
  if (missing) return { ok: true, installed: false, quote_value_by_branch: {} };
  const filtered = rows.filter((r) => inDateRange(r, startMs, endMs));
  const map = {};
  for (const r of filtered) {
    const k = String(r.branch || "Unassigned").trim() || "Unassigned";
    map[k] = (map[k] || 0) + (Number(r.grand_total) || 0);
  }
  return { ok: true, installed: true, quote_value_by_branch: map };
}

/**
 * @param {{ startDate?: string, endDate?: string, db: import("@supabase/supabase-js").SupabaseClient, organizationScope?: { organizationId?: string|null, hasOrganizationIdColumn?: boolean } }} params
 */
export async function getQuoteMetricsByPartner(params) {
  const db = params.db;
  const startMs = params.startDate ? new Date(params.startDate).getTime() : 0;
  const endMs = params.endDate ? new Date(params.endDate).getTime() : Date.now();
  const { rows, missing } = await safeQuoteHeadersQuery(
    db,
    (q) => q.select("partner_account_id, grand_total, created_at"),
    params.organizationScope
  );
  if (missing) return { ok: true, installed: false, quote_value_by_partner: {} };
  const filtered = rows.filter((r) => inDateRange(r, startMs, endMs));
  const map = {};
  for (const r of filtered) {
    const k = String(r.partner_account_id || "no_partner");
    map[k] = (map[k] || 0) + (Number(r.grand_total) || 0);
  }
  return { ok: true, installed: true, quote_value_by_partner: map };
}

/**
 * @param {{ quotes: Array<{ quote_status?: string, grand_total?: number }>, wonStatuses?: string[] }} params
 */
export function calculateBidCloseRatio(params) {
  const won = new Set((params.wonStatuses || ["accepted", "won", "closed_won"]).map((s) => String(s).toLowerCase()));
  const lost = new Set(["rejected", "lost", "closed_lost"].map((s) => s.toLowerCase()));
  const quotes = Array.isArray(params.quotes) ? params.quotes : [];
  let closed = 0;
  let wins = 0;
  for (const q of quotes) {
    const st = String(q.quote_status || "").toLowerCase();
    if (won.has(st)) {
      closed++;
      wins++;
    } else if (lost.has(st)) {
      closed++;
    }
  }
  return {
    bid_close_ratio: closed ? wins / closed : null,
    closed_count: closed,
    won_count: wins
  };
}

/**
 * @param {{ startDate?: string, endDate?: string, db: import("@supabase/supabase-js").SupabaseClient, organizationScope?: { organizationId?: string|null, hasOrganizationIdColumn?: boolean } }} params
 */
export async function getForecastValueRollup(params) {
  const db = params.db;
  if (!db?.from) return { ok: true, forecast_value: 0, installed: false };
  try {
    const startMs = params.startDate ? new Date(params.startDate).getTime() : 0;
    const endMs = params.endDate ? new Date(params.endDate).getTime() : Date.now();
    let q = db.from("quote_forecast_events").select("forecast_value, event_at");
    const orgId = params.organizationScope?.organizationId;
    if (orgId) {
      const hasFc = await tableHasOrganizationId(db, "quote_forecast_events");
      if (hasFc) q = q.or(`organization_id.eq.${orgId},organization_id.is.null`);
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []).filter((r) => {
      const t = new Date(r.event_at || 0).getTime();
      return t >= startMs && t <= endMs;
    });
    const forecast_value = rows.reduce((s, r) => s + (Number(r.forecast_value) || 0), 0);
    return { ok: true, installed: true, forecast_value };
  } catch (e) {
    if (isMissingRelationError(e)) return { ok: true, forecast_value: 0, installed: false };
    throw e;
  }
}
