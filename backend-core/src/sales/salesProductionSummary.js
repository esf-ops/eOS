/**
 * Production flow summary from Moraware prepared job facts.
 */

import { dashboardReportDateForMorawareJob } from "./morawareSqftActuals.js";

function sqftForJob(job) {
  const n = Number(job?.worksheet_sqft ?? job?.sqft ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {Array<object>} jobs — prepared fact rows or enriched rows
 * @param {{ start: string, end: string }} dateRange
 */
export function summarizeProduction(jobs = [], dateRange = null) {
  const inRange = (job) => {
    if (!dateRange) return true;
    const d = str(dashboardReportDateForMorawareJob(job) || job.creation_date).slice(0, 10);
    return d >= dateRange.start && d <= dateRange.end;
  };

  const filtered = jobs.filter(inRange);
  let totalSqft = 0;
  const byMonth = new Map();
  const byBranch = new Map();
  const byStatus = new Map();
  let jobCount = 0;
  let missingSqft = 0;

  for (const job of filtered) {
    jobCount += 1;
    const sqft = sqftForJob(job);
    if (sqft <= 0) {
      missingSqft += 1;
      continue;
    }
    totalSqft += sqft;
    const d = str(dashboardReportDateForMorawareJob(job) || job.creation_date).slice(0, 7);
    byMonth.set(d, (byMonth.get(d) || 0) + sqft);
    const branch = str(job.branch) || "Unmapped";
    byBranch.set(branch, (byBranch.get(branch) || 0) + sqft);
    const status = str(job.status_name || job.job_status) || "Unknown";
    byStatus.set(status, (byStatus.get(status) || 0) + sqft);
  }

  return {
    producedSqft: Math.round(totalSqft * 100) / 100,
    jobCount,
    jobsMissingSqft: missingSqft,
    producedSqftTrend: [...byMonth.entries()]
      .map(([month, sqft]) => ({ month, sqft: Math.round(sqft * 100) / 100 }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    productionByBranch: [...byBranch.entries()]
      .map(([branch, sqft]) => ({ branch, sqft: Math.round(sqft * 100) / 100 }))
      .sort((a, b) => b.sqft - a.sqft),
    productionByStatus: [...byStatus.entries()]
      .map(([status, sqft]) => ({ status, sqft: Math.round(sqft * 100) / 100 }))
      .sort((a, b) => b.sqft - a.sqft),
    backlogSummary: null,
    capacitySignal: null
  };
}

/**
 * Monthly YoY trend from enriched job rows spanning two years.
 * @param {Array<object>} jobs
 * @param {number} currentYear
 * @param {number} priorYear
 */
export function buildMonthlyYoYTrend(jobs, currentYear, priorYear) {
  const cur = new Map();
  const pri = new Map();
  for (const job of jobs) {
    const d = str(dashboardReportDateForMorawareJob(job) || job.creation_date);
    if (!/^\d{4}-\d{2}/.test(d)) continue;
    const year = Number(d.slice(0, 4));
    const month = d.slice(0, 7);
    const sqft = sqftForJob(job);
    if (year === currentYear) cur.set(month, (cur.get(month) || 0) + sqft);
    if (year === priorYear) pri.set(month, (pri.get(month) || 0) + sqft);
  }
  const months = new Set([...cur.keys(), ...pri.keys()]);
  return [...months]
    .sort()
    .map((month) => ({
      month,
      currentSqft: Math.round((cur.get(month) || 0) * 100) / 100,
      priorSqft: Math.round((pri.get(month) || 0) * 100) / 100,
      yoySqft: Math.round(((cur.get(month) || 0) - (pri.get(month) || 0)) * 100) / 100,
      yoyPct:
        (pri.get(month) || 0) > 0
          ? Math.round((((cur.get(month) || 0) - (pri.get(month) || 0)) / (pri.get(month) || 0)) * 10000) / 100
          : null
    }));
}
