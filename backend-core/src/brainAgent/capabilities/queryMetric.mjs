/**
 * Server-side metrics — authoritative aggregates computed in Brain, not by the LLM.
 */

import { makeEvidence } from "../evidence.mjs";

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? ""));
}

function periodBounds(period) {
  const now = new Date();
  const end = now.toISOString();
  if (!period || period === "all") return { start: null, end };
  if (period === "today") {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: s.toISOString(), end };
  }
  if (period === "week") {
    const s = new Date(now.getTime() - 7 * 86400000);
    return { start: s.toISOString(), end };
  }
  if (period === "month") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: s.toISOString(), end };
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    const s = new Date(now.getFullYear(), q, 1);
    return { start: s.toISOString(), end };
  }
  if (typeof period === "object" && period.from) {
    return { start: String(period.from), end: period.to ? String(period.to) : end };
  }
  return { start: null, end };
}

/**
 * quote_count grouped by account_directory_account_id for an org.
 * Caps scan size; returns truncated flag. Never invents accounts.
 */
export async function queryQuoteCountByAccount({
  db,
  organizationId,
  period = "quarter",
  order = "desc",
  limit = 10,
}) {
  if (!organizationId) {
    return { ok: false, status: 400, error: "Organization context required", code: "ORG_REQUIRED" };
  }
  const lim = Math.min(25, Math.max(1, Number(limit) || 10));
  const { start, end } = periodBounds(period);

  let qb = db
    .from("quote_headers")
    .select("id,account_directory_account_id,customer_name,created_at,updated_at,quote_status")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .limit(4000);

  if (start) qb = qb.gte("created_at", start);
  if (end) qb = qb.lte("created_at", end);

  const { data, error } = await qb;
  if (error) {
    const msg = String(error.message || "");
    if (msg.toLowerCase().includes("does not exist") || msg.includes("schema cache")) {
      return { ok: false, status: 503, installed: false, error: "quote_headers unavailable" };
    }
    throw error;
  }

  const counts = new Map();
  for (const row of data || []) {
    const aid = row.account_directory_account_id ? String(row.account_directory_account_id) : null;
    if (!aid || !isUuid(aid)) continue;
    const cur = counts.get(aid) || {
      accountId: aid,
      quoteCount: 0,
      sampleCustomerName: row.customer_name || null,
      lastCreatedAt: null,
    };
    cur.quoteCount += 1;
    const ca = row.created_at || null;
    if (ca && (!cur.lastCreatedAt || ca > cur.lastCreatedAt)) cur.lastCreatedAt = ca;
    if (!cur.sampleCustomerName && row.customer_name) cur.sampleCustomerName = row.customer_name;
    counts.set(aid, cur);
  }

  let rows = [...counts.values()];
  rows.sort((a, b) => (order === "asc" ? a.quoteCount - b.quoteCount : b.quoteCount - a.quoteCount));
  const truncatedScan = (data || []).length >= 4000;
  rows = rows.slice(0, lim);

  const retrievedAt = new Date().toISOString();
  const evidence = makeEvidence({
    sourceDomain: "quote",
    sourceSystem: "quote_headers",
    entityType: "metric",
    entityId: "quote_count_by_account",
    authoritative: true,
    sourceUpdatedAt: rows[0]?.lastCreatedAt || null,
    freshnessNote: truncatedScan
      ? "Scan capped at 4000 quote rows for this period — ranking may be incomplete."
      : "Server-computed quote_count by Account Directory id for the requested period.",
    data: {
      metric: "quote_count",
      dimension: "account",
      period,
      periodStart: start,
      periodEnd: end,
      order,
      truncatedScan,
      rows,
    },
  });

  return {
    ok: true,
    metric: "quote_count",
    dimension: "account",
    period,
    periodStart: start,
    periodEnd: end,
    rows,
    truncatedScan,
    retrievedAt,
    evidence: [evidence],
  };
}
