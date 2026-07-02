/**
 * Canonical sales intelligence rows — joins synced job facts with worksheet color/material facts.
 * Reads existing Supabase tables only; no new sync.
 */

import { classifySalesColor } from "./salesColorClassification.js";
import { normalizeAccountNameWithoutLocationPrefix } from "./salesAccountNameNormalizer.js";
import { dashboardReportDateForMorawareJob } from "./morawareSqftActuals.js";
import { dateInInclusiveRange } from "./salesDashboardFilters.js";

function normKey(s) {
  return String(s ?? "").trim().toLowerCase();
}

function normJobName(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normJobId(id) {
  const s = String(id ?? "").trim();
  return s || null;
}

/**
 * Parse Moraware date strings into ISO YYYY-MM-DD.
 * Supports ISO dates and US M/D/YYYY (worksheet facts often use the latter).
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function parseFlexibleDashboardDate(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const y = us[3];
    const m = String(us[1]).padStart(2, "0");
    const d = String(us[2]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) {
    const dt = new Date(parsed);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

function sqftVal(row) {
  const n = Number(row?.worksheet_sqft ?? row?.total_worksheet_sqft ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {Array<object>} enrichedFacts
 */
export function buildJobFactIndexes(enrichedFacts = []) {
  const byJobId = new Map();
  const byAccountDateName = new Map();

  for (const job of enrichedFacts) {
    const jobId = normJobId(job.source_job_id);
    if (jobId) {
      const list = byJobId.get(jobId) || [];
      list.push(job);
      byJobId.set(jobId, list);
    }

    const acct = normKey(normalizeAccountNameWithoutLocationPrefix(job.account_name) || job.account_name);
    const d = String(job.reportDate ?? dashboardReportDateForMorawareJob(job) ?? "").slice(0, 10);
    const name = normJobName(job.job_name ?? job.source_job_id);
    if (acct && d) {
      const k = `${acct}|||${d}|||${name}`;
      const list = byAccountDateName.get(k) || [];
      list.push(job);
      byAccountDateName.set(k, list);
    }
    if (acct && d) {
      const k2 = `${acct}|||${d}`;
      const list2 = byAccountDateName.get(k2) || [];
      list2.push(job);
      byAccountDateName.set(k2, list2);
    }
  }

  return { byJobId, byAccountDateName };
}

/**
 * Match one worksheet row to a prepared job fact row.
 * @returns {{ job: object|null, method: "job_id"|"account_date_job_name"|"account_date"|null }}
 */
export function matchWorksheetRowToJob(wsRow, indexes) {
  const jobId = normJobId(wsRow.job_id);
  if (jobId && indexes.byJobId.has(jobId)) {
    const jobs = indexes.byJobId.get(jobId);
    return { job: jobs[0], method: "job_id" };
  }

  const acct = normKey(normalizeAccountNameWithoutLocationPrefix(wsRow.account_name) || wsRow.account_name);
  const d =
    parseFlexibleDashboardDate(wsRow.job_creation_date) ||
    parseFlexibleDashboardDate(wsRow.reportDate) ||
    null;
  const name = normJobName(wsRow.job_name);

  if (acct && d && name) {
    const k = `${acct}|||${d}|||${name}`;
    const jobs = indexes.byAccountDateName.get(k);
    if (jobs?.length) return { job: jobs[0], method: "account_date_job_name" };
  }

  if (acct && d) {
    const jobs = indexes.byAccountDateName.get(`${acct}|||${d}`);
    if (jobs?.length === 1) return { job: jobs[0], method: "account_date" };
  }

  return { job: null, method: null };
}

/**
 * Build canonical intelligence rows — one row per active worksheet fact (never double-counted).
 * @param {object} params
 * @param {string} params.organizationId
 * @param {Array<object>} params.enrichedFacts
 * @param {Array<object>} params.worksheetRows
 */
export function buildSalesIntelligenceRows({ organizationId, enrichedFacts = [], worksheetRows = [] }) {
  const indexes = buildJobFactIndexes(enrichedFacts);
  const seen = new Set();
  const rows = [];

  for (const ws of worksheetRows) {
    const dedupeKey = String(ws.id ?? ws.row_hash ?? "").trim() || JSON.stringify([ws.job_id, ws.color, ws.room, ws.total_worksheet_sqft, ws.job_creation_date]);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const wsSqft = sqftVal(ws);
    if (wsSqft <= 0) continue;

    const { job, method } = matchWorksheetRowToJob(ws, indexes);
    const colorRaw = String(ws.color ?? "").trim();
    const stone = String(ws.stone ?? "").trim();
    const cls = classifySalesColor(colorRaw, stone);
    const collectionStatus =
      cls.collectionStatus === "elite100" ? "elite100" : colorRaw ? "out_of_collection" : "unknown";

    const jobCreationIso = parseFlexibleDashboardDate(ws.job_creation_date);
    const reportDate = job
      ? String(job.reportDate ?? dashboardReportDateForMorawareJob(job) ?? "").slice(0, 10) || jobCreationIso
      : jobCreationIso;

    rows.push({
      organization_id: organizationId,
      worksheet_row_id: ws.id ?? null,
      row_hash: ws.row_hash ?? null,
      job_id: normJobId(ws.job_id) || normJobId(job?.source_job_id),
      job_name: String(ws.job_name ?? job?.job_name ?? "").trim() || null,
      job_status: String(ws.job_status ?? job?.status_name ?? "").trim() || null,
      job_creation_date: jobCreationIso,
      report_date: reportDate,
      account_raw: String(ws.account_name ?? job?.account_name ?? "").trim() || null,
      account_canonical: job?.canonicalAccountName ?? null,
      assigned_rep: job?.assignedSalesperson ?? job?.normalizedSalesperson ?? null,
      job_salesperson: String(ws.job_salesperson ?? job?.salesperson_name ?? "").trim() || null,
      branch: String(ws.branch_or_process ?? job?.branch ?? "").trim() || null,
      room: ws.room ?? null,
      color_raw: colorRaw || null,
      color_matched: cls.catalogDisplayName ?? (colorRaw || null),
      manufacturer: cls.manufacturer ?? (stone || null),
      elite_group: cls.eliteGroup ?? null,
      collection_status: collectionStatus,
      match_confidence: cls.confidence ?? null,
      stone: stone || null,
      edge: ws.edge ?? null,
      worksheet_sqft: wsSqft,
      job_worksheet_sqft: job ? sqftVal(job) : null,
      source: "worksheet_fact",
      join_method: method,
      attribution_status: job?.attributionStatus ?? null,
      normalized_salesperson: job?.normalizedSalesperson ?? null
    });
  }

  return rows;
}

/**
 * Join diagnostics for operators.
 */
export function summarizeIntelligenceJoinDiagnostics({ enrichedFacts = [], worksheetRows = [], intelligenceRows = [] }) {
  const indexes = buildJobFactIndexes(enrichedFacts);
  let byJobId = 0;
  let byFallback = 0;
  let unmatchedWsSqft = 0;
  let matchedWsSqft = 0;
  const seen = new Set();

  for (const ws of worksheetRows) {
    const dedupeKey = String(ws.id ?? ws.row_hash ?? "").trim() || JSON.stringify([ws.job_id, ws.color, ws.room, ws.total_worksheet_sqft]);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const sq = sqftVal(ws);
    if (sq <= 0) continue;
    const { job, method } = matchWorksheetRowToJob(ws, indexes);
    if (job && method === "job_id") {
      byJobId += 1;
      matchedWsSqft += sq;
    } else if (job) {
      byFallback += 1;
      matchedWsSqft += sq;
    } else {
      unmatchedWsSqft += sq;
    }
  }

  const jobIds = new Set(enrichedFacts.map((j) => normJobId(j.source_job_id)).filter(Boolean));
  const wsJobIds = new Set(worksheetRows.map((w) => normJobId(w.job_id)).filter(Boolean));
  let jobIdOverlap = 0;
  for (const id of wsJobIds) if (jobIds.has(id)) jobIdOverlap += 1;

  const classified = intelligenceRows.reduce(
    (acc, r) => {
      acc.total += r.worksheet_sqft;
      if (r.collection_status === "elite100") acc.elite += r.worksheet_sqft;
      else if (r.collection_status === "out_of_collection") acc.out += r.worksheet_sqft;
      else acc.unknown += r.worksheet_sqft;
      return acc;
    },
    { total: 0, elite: 0, out: 0, unknown: 0 }
  );

  return {
    jobFactCount: enrichedFacts.length,
    jobFactSqft: enrichedFacts.reduce((s, j) => s + sqftVal(j), 0),
    worksheetRowCount: worksheetRows.length,
    worksheetSqft: worksheetRows.reduce((s, w) => s + sqftVal(w), 0),
    worksheetRowsWithColor: worksheetRows.filter((r) => String(r.color ?? "").trim()).length,
    worksheetRowsWithStone: worksheetRows.filter((r) => String(r.stone ?? "").trim()).length,
    worksheetRowsWithRoom: worksheetRows.filter((r) => String(r.room ?? "").trim()).length,
    distinctJobIdsInJobFacts: jobIds.size,
    distinctJobIdsInWorksheets: wsJobIds.size,
    jobIdOverlapCount: jobIdOverlap,
    worksheetRowsMatchedByJobId: byJobId,
    worksheetRowsMatchedByFallback: byFallback,
    worksheetSqftMatched: matchedWsSqft,
    worksheetSqftUnmatched: unmatchedWsSqft,
    intelligenceRowCount: intelligenceRows.length,
    classifiedWorksheetSqft: classified.total,
    elite100WorksheetSqft: classified.elite,
    outOfCollectionWorksheetSqft: classified.out,
    unknownWorksheetSqft: classified.unknown
  };
}

/**
 * Color/material analytics from canonical intelligence rows.
 */
export function buildColorAnalyticsFromIntelligenceRows(intelligenceRows, currentRange, priorRange) {
  const inRange = (row, range) => {
    const d = String(row.report_date ?? row.job_creation_date ?? "").slice(0, 10);
    return d && dateInInclusiveRange(d, range);
  };

  const cur = intelligenceRows.filter((r) => inRange(r, currentRange));
  const pri = intelligenceRows.filter((r) => inRange(r, priorRange));

  const aggregatePeriod = (rows) => {
    const byColor = new Map();
    const byMonth = new Map();
    const byAccount = new Map();
    let eliteSqft = 0;
    let outSqft = 0;
    let unknownSqft = 0;
    let totalSqft = 0;

    for (const row of rows) {
      const sqft = row.worksheet_sqft;
      if (sqft <= 0) continue;
      totalSqft += sqft;
      const color = String(row.color_raw ?? "").trim();
      const stone = String(row.stone ?? "").trim();
      const key = `${color}|||${stone}`;

      const slot = byColor.get(key) || {
        color,
        material: stone,
        sqft: 0,
        collectionStatus: row.collection_status,
        eliteGroup: row.elite_group,
        manufacturer: row.manufacturer,
        catalogDisplayName: row.color_matched,
        matchMethod: row.match_confidence != null ? "catalog" : "none",
        confidence: row.match_confidence,
        accountCount: new Set(),
        repCount: new Set()
      };
      slot.sqft += sqft;
      if (row.account_raw) slot.accountCount.add(normKey(row.account_raw));
      if (row.job_salesperson) slot.repCount.add(String(row.job_salesperson).trim());
      byColor.set(key, slot);

      if (row.collection_status === "elite100") eliteSqft += sqft;
      else if (color) outSqft += sqft;
      else unknownSqft += sqft;

      const month = String(row.report_date ?? row.job_creation_date ?? "").slice(0, 7);
      if (month) byMonth.set(month, (byMonth.get(month) || 0) + sqft);

      const acct = normKey(row.account_raw);
      if (acct) {
        const a = byAccount.get(acct) || { account: row.account_raw, eliteSqft: 0, outSqft: 0, totalSqft: 0 };
        a.totalSqft += sqft;
        if (row.collection_status === "elite100") a.eliteSqft += sqft;
        else if (color) a.outSqft += sqft;
        byAccount.set(acct, a);
      }
    }

    return { byColor, byMonth, byAccount, eliteSqft, outSqft, unknownSqft, totalSqft };
  };

  const curAgg = aggregatePeriod(cur);
  const priAgg = aggregatePeriod(pri);

  const colorRows = [...curAgg.byColor.entries()].map(([key, slot]) => {
    const priSlot = priAgg.byColor.get(key);
    const priorSqft = priSlot?.sqft ?? 0;
    const yoySqft = slot.sqft - priorSqft;
    return {
      key,
      color: slot.color,
      material: slot.material,
      sqft: Math.round(slot.sqft * 100) / 100,
      priorSqft: Math.round(priorSqft * 100) / 100,
      yoySqft: Math.round(yoySqft * 100) / 100,
      yoyPct: priorSqft > 0 ? Math.round((yoySqft / priorSqft) * 10000) / 100 : null,
      collectionStatus: slot.collectionStatus,
      eliteGroup: slot.eliteGroup,
      manufacturer: slot.manufacturer,
      catalogDisplayName: slot.catalogDisplayName,
      matchMethod: slot.matchMethod,
      confidence: slot.confidence,
      accountCount: slot.accountCount.size,
      repCount: slot.repCount.size,
      share: curAgg.totalSqft > 0 ? (slot.sqft / curAgg.totalSqft) * 100 : 0
    };
  });

  return {
    worksheetAvailable: intelligenceRows.length > 0,
    currentRowCount: cur.length,
    colorRows: colorRows.sort((a, b) => b.sqft - a.sqft),
    topEliteColors: colorRows.filter((c) => c.collectionStatus === "elite100").slice(0, 25),
    topOutOfCollectionColors: colorRows.filter((c) => c.collectionStatus === "out_of_collection").slice(0, 25),
    unknownColors: colorRows.filter((c) => c.collectionStatus === "unknown").slice(0, 25),
    colorTrendsByMonth: [...curAgg.byMonth.entries()]
      .map(([month, sqftVal]) => ({ month, sqft: Math.round(sqftVal * 100) / 100 }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    accountColorShares: [...curAgg.byAccount.entries()].map(([k, a]) => ({
      accountKey: k,
      account: a.account,
      eliteShare: a.totalSqft > 0 ? (a.eliteSqft / a.totalSqft) * 100 : 0,
      outShare: a.totalSqft > 0 ? (a.outSqft / a.totalSqft) * 100 : 0,
      totalSqft: a.totalSqft
    }))
  };
}

/**
 * Attach primary worksheet color fields onto job rows for explorer/detail views.
 */
export function attachIntelligenceFieldsToJobs(jobs, intelligenceRows) {
  const byJobId = new Map();
  for (const row of intelligenceRows) {
    const jobId = normJobId(row.job_id);
    if (!jobId) continue;
    const list = byJobId.get(jobId) || [];
    list.push(row);
    byJobId.set(jobId, list);
  }

  return jobs.map((job) => {
    const jobId = normJobId(job.source_job_id);
    const rows = jobId ? byJobId.get(jobId) : null;
    if (!rows?.length) return job;

    const primary = rows.reduce((best, r) => (r.worksheet_sqft > (best?.worksheet_sqft ?? 0) ? r : best), rows[0]);

    return {
      ...job,
      color: primary.color_raw,
      stone: primary.stone,
      room: primary.room,
      worksheetEnriched: true,
      colorCollectionStatus: primary.collection_status,
      eliteGroup: primary.elite_group,
      manufacturer: primary.manufacturer,
      catalogDisplayName: primary.color_matched,
      colorMatchMethod: primary.match_confidence != null ? "catalog" : "none",
      colorConfidence: primary.match_confidence
    };
  });
}

/**
 * Top raw colors and unmatched jobs for diagnostics.
 */
export function topWorksheetColorsBySqft(worksheetRows, limit = 10) {
  const byColor = new Map();
  const seen = new Set();
  for (const ws of worksheetRows) {
    const dedupeKey = String(ws.id ?? ws.row_hash ?? "").trim();
    if (dedupeKey && seen.has(dedupeKey)) continue;
    if (dedupeKey) seen.add(dedupeKey);
    const sq = sqftVal(ws);
    if (sq <= 0) continue;
    const color = String(ws.color ?? "").trim() || "(missing color)";
    byColor.set(color, (byColor.get(color) || 0) + sq);
  }
  return [...byColor.entries()]
    .map(([color, sqftTotal]) => ({ color, sqft: sqftTotal }))
    .sort((a, b) => b.sqft - a.sqft)
    .slice(0, limit);
}

export function topUnmatchedJobsBySqft(intelligenceRows, limit = 10) {
  const byKey = new Map();
  for (const r of intelligenceRows) {
    if (r.join_method) continue;
    const k = `${r.account_raw ?? "?"}|||${r.job_id ?? r.job_name ?? "?"}`;
    const slot = byKey.get(k) || {
      account: r.account_raw,
      jobId: r.job_id,
      jobName: r.job_name,
      sqft: 0
    };
    slot.sqft += r.worksheet_sqft;
    byKey.set(k, slot);
  }
  return [...byKey.values()].sort((a, b) => b.sqft - a.sqft).slice(0, limit);
}
