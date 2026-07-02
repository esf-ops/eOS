/**
 * Worksheet fact enrichment — delegates to salesIntelligenceFacts canonical layer.
 */

import {
  attachIntelligenceFieldsToJobs,
  buildColorAnalyticsFromIntelligenceRows,
  buildSalesIntelligenceRows,
  parseFlexibleDashboardDate
} from "./salesIntelligenceFacts.js";

export { parseFlexibleDashboardDate };

/**
 * @deprecated Prefer buildSalesIntelligenceRows + attachIntelligenceFieldsToJobs
 */
export function indexWorksheetRows(worksheetRows = []) {
  const byJobId = new Map();
  const byAccountDate = new Map();
  for (const row of worksheetRows) {
    const jobId = String(row.job_id ?? "").trim();
    if (jobId) {
      const list = byJobId.get(jobId) || [];
      list.push(row);
      byJobId.set(jobId, list);
    }
    const acct = String(row.account_name ?? "").trim().toLowerCase();
    const d = parseFlexibleDashboardDate(row.job_creation_date) || "";
    if (acct && d) {
      const k = `${acct}|||${d}`;
      const list = byAccountDate.get(k) || [];
      list.push(row);
      byAccountDate.set(k, list);
    }
  }
  return { byJobId, byAccountDate };
}

/**
 * @param {Array<object>} jobs
 * @param {Array<object>} worksheetRows
 * @param {string} [organizationId]
 */
export function attachWorksheetFieldsToJobs(jobs, worksheetRows, organizationId = "") {
  const rows = buildSalesIntelligenceRows({
    organizationId,
    enrichedFacts: jobs,
    worksheetRows
  });
  return attachIntelligenceFieldsToJobs(jobs, rows);
}

/**
 * @param {Array<object>} worksheetRows
 * @param {{ start: string, end: string }} currentRange
 * @param {{ start: string, end: string }} priorRange
 * @param {string} [organizationId]
 */
export function buildColorAnalytics(worksheetRows, currentRange, priorRange, organizationId = "") {
  const intelligenceRows = buildSalesIntelligenceRows({
    organizationId,
    enrichedFacts: [],
    worksheetRows
  });
  return buildColorAnalyticsFromIntelligenceRows(intelligenceRows, currentRange, priorRange);
}

function normKey(s) {
  return String(s ?? "").trim().toLowerCase();
}

/**
 * @param {Map<string, { eliteShare: number, outShare: number }>} shareByAccountKey
 * @param {string} accountName
 */
export function accountColorSharesFor(shareByAccountKey, accountName) {
  const hit = shareByAccountKey?.get(normKey(accountName));
  return hit || { eliteShare: null, outShare: null };
}
