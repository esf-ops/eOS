/**
 * Quote pipeline summary for Sales Command Center.
 */

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Array<object>} quoteRows
 * @param {{ start: string, end: string }} dateRange
 */
export function summarizeQuotePipeline(quoteRows = [], dateRange = null) {
  const inRange = (d) => {
    if (!dateRange?.start || !dateRange?.end) return true;
    const ymd = str(d).slice(0, 10);
    return ymd >= dateRange.start && ymd <= dateRange.end;
  };

  const filtered = quoteRows.filter((q) => inRange(q.created_at || q.updated_at));
  const byStatus = new Map();
  const bySource = new Map();
  let openValue = 0;
  let wonValue = 0;
  let openCount = 0;
  let totalValue = 0;
  let totalSqft = 0;

  for (const q of filtered) {
    const status = str(q.quote_status) || "Unknown";
    const source = str(q.quote_source) || "Unknown";
    const value = num(q.grand_total ?? q.subtotal);
    const sqft = num(q.estimated_sqft);
    byStatus.set(status, (byStatus.get(status) || 0) + 1);
    bySource.set(source, (bySource.get(source) || 0) + 1);
    totalValue += value;
    totalSqft += sqft;
    if (/open|pending|sent|draft|review/i.test(status)) {
      openValue += value;
      openCount += 1;
    }
    if (/won|accepted|approved|sold/i.test(status)) {
      wonValue += value;
    }
  }

  const statusSummary = [...byStatus.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
  const sourceSummary = [...bySource.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  return {
    quoteCount: filtered.length,
    openQuoteCount: openCount,
    openPipelineValue: Math.round(openValue),
    wonValue: Math.round(wonValue),
    totalQuoteValue: Math.round(totalValue),
    estimatedSqft: Math.round(totalSqft * 100) / 100,
    quoteStatusSummary: statusSummary,
    quoteSourceSummary: sourceSummary,
    quoteRows: filtered.slice(0, 100).map(mapQuoteRow)
  };
}

function mapQuoteRow(q) {
  return {
    id: q.id,
    quoteNumber: q.quote_number,
    customerName: q.customer_name,
    projectName: q.project_name,
    status: q.quote_status,
    source: q.quote_source,
    salesRep: q.sales_rep,
    branch: q.branch,
    grandTotal: num(q.grand_total),
    estimatedSqft: num(q.estimated_sqft),
    createdAt: q.created_at,
    updatedAt: q.updated_at
  };
}

/**
 * Accounts with quotes in range but no production sqft in range.
 * @param {Array<object>} quoteRows
 * @param {Set<string>} producedAccountKeys
 */
export function findQuotedNotProduced(quoteRows, producedAccountKeys) {
  const byAccount = new Map();
  for (const q of quoteRows) {
    const key = str(q.customer_name || q.partner_account_id).toLowerCase();
    if (!key) continue;
    const slot = byAccount.get(key) || { account: q.customer_name, quoteCount: 0, quoteValue: 0 };
    slot.quoteCount += 1;
    slot.quoteValue += num(q.grand_total);
    byAccount.set(key, slot);
  }
  return [...byAccount.values()]
    .filter((a) => !producedAccountKeys.has(str(a.account).toLowerCase()))
    .sort((a, b) => b.quoteValue - a.quoteValue)
    .slice(0, 50);
}
