/**
 * Canonical sales intelligence layer — all dashboard domains from synced Supabase data.
 * Reads existing tables only; no new sync; no mutations.
 */

import { classifySalesColor } from "./salesColorClassification.js";
import { normalizeAccountNameWithoutLocationPrefix } from "./salesAccountNameNormalizer.js";
import { dashboardReportDateForMorawareJob } from "./morawareSqftActuals.js";
import { dateInInclusiveRange } from "./salesDashboardFilters.js";

export function metricUnavailable(reason) {
  return { value: null, status: "unavailable", reason: String(reason ?? "Data unavailable") };
}

export function metricValue(value, reason) {
  if (value == null || (typeof value === "object" && value.status === "unavailable")) {
    return metricUnavailable(reason ?? value?.reason ?? "Data unavailable");
  }
  if (typeof value === "object" && "value" in value) return value;
  return { value, status: "available" };
}

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
  const n = Number(row?.worksheet_sqft ?? row?.total_worksheet_sqft ?? row?.job_sqft ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeColorLabel(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.replace(/\s+/g, " ");
}

function materialProgramSignal(colorRaw, stoneRaw, roomRaw) {
  const blob = `${colorRaw} ${stoneRaw} ${roomRaw}`.toLowerCase();
  if (/\bremnant\b/.test(blob)) return "remnant";
  if (/\bspecial scope\b/.test(blob)) return "special_scope";
  if (/\bprogram\b/.test(blob)) return "program";
  return "standard";
}

/**
 * A. Production/job facts from sales_moraware_job_facts (+ attribution).
 */
export function buildProductionJobFacts({ organizationId, enrichedFacts = [], syncHealth, factsMeta }) {
  return enrichedFacts.map((job) => ({
    organization_id: organizationId,
    job_id: normJobId(job.source_job_id),
    job_name: String(job.job_name ?? job.source_job_id ?? "").trim() || null,
    job_status: String(job.status_name ?? job.job_status ?? "").trim() || null,
    job_creation_date: String(job.created_at_source ?? "").slice(0, 10) || null,
    report_date: String(job.reportDate ?? dashboardReportDateForMorawareJob(job) ?? "").slice(0, 10) || null,
    account_raw: String(job.account_name ?? "").trim() || null,
    account_canonical: job.canonicalAccountName ?? null,
    salesperson_raw: String(job.salesperson_name ?? "").trim() || null,
    assigned_rep: job.assignedSalesperson ?? job.normalizedSalesperson ?? null,
    normalized_salesperson: job.normalizedSalesperson ?? null,
    branch: job.branch ?? null,
    worksheet_sqft: sqftVal(job),
    source_table: "sales_moraware_job_facts",
    import_group_id: factsMeta?.importGroupId ?? syncHealth?.latestGroupId ?? null,
    latest_sync_at: syncHealth?.lastSyncAt ?? null,
    attribution_status: job.attributionStatus ?? null,
    process_name: job.process_name ?? null
  }));
}

/**
 * B. Worksheet/material facts — one row per worksheet line (deduped).
 */
export function buildWorksheetMaterialFacts(params) {
  const rows = buildWorksheetMaterialFactsInternal(params);
  return rows.map((r) => ({
    ...r,
    color_normalized: normalizeColorLabel(r.color_raw),
    material_program_signal: materialProgramSignal(r.color_raw, r.stone, r.room)
  }));
}

/** Alias used across dashboard loaders */
export function buildSalesIntelligenceRows(params) {
  return buildWorksheetMaterialFacts(params);
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

function buildWorksheetMaterialFactsInternal({ organizationId, enrichedFacts = [], worksheetRows = [] }) {
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

function quoteStatusFlags(status) {
  const s = String(status ?? "").toLowerCase();
  return {
    is_open: /open|pending|sent|review/.test(s),
    is_won: /won|accepted|approved|sold/.test(s),
    is_lost: /lost|declined|cancel/.test(s),
    is_draft: /draft/.test(s)
  };
}

/**
 * D. Quote facts from quote_headers.
 */
export function buildQuoteFacts(quotes = []) {
  return quotes.map((q) => ({
    quote_id: q.id,
    quote_number: q.quote_number ?? null,
    quote_source: q.quote_source ?? null,
    customer_account: q.customer_name ?? null,
    project_name: q.project_name ?? null,
    status: q.quote_status ?? null,
    created_date: String(q.created_at ?? "").slice(0, 10) || null,
    updated_at: q.updated_at ?? null,
    quote_value: Number(q.grand_total ?? q.subtotal) || 0,
    estimated_sqft: Number(q.estimated_sqft) || 0,
    sales_rep: q.sales_rep ?? null,
    branch: q.branch ?? null,
    partner_account_id: q.partner_account_id ?? null,
    source_table: "quote_headers",
    ...quoteStatusFlags(q.quote_status)
  }));
}

/**
 * E. Forecast facts — org-scoped via organization_id or quote_headers linkage.
 */
export function buildForecastFacts(forecastRows = [], quoteFacts = [], organizationId = "") {
  const quoteById = new Map(quoteFacts.map((q) => [String(q.quote_id), q]));
  const orgQuoteIds = new Set(quoteFacts.map((q) => String(q.quote_id)));

  return forecastRows.map((e) => {
    const quoteId = String(e.quote_id ?? "");
    const linkedQuote = quoteById.get(quoteId) ?? null;
    const hasOrg = String(e.organization_id ?? "").trim() === String(organizationId).trim();
    const linkedToOrgQuote = orgQuoteIds.has(quoteId);
    const included = hasOrg || linkedToOrgQuote;

    return {
      forecast_id: e.id ?? null,
      quote_id: e.quote_id,
      event_type: e.event_type ?? null,
      forecast_date: String(e.event_at ?? e.forecast_date ?? e.created_at ?? "").slice(0, 10) || null,
      sales_rep: e.sales_rep ?? linkedQuote?.sales_rep ?? null,
      branch: e.branch ?? linkedQuote?.branch ?? null,
      quote_value: Number(e.quote_value) || linkedQuote?.quote_value || 0,
      probability_percent: Number(e.probability_percent) || 0,
      forecast_value: Number(e.forecast_value) || 0,
      forecast_sqft: Number(e.forecast_sqft ?? e.estimated_sqft) || linkedQuote?.estimated_sqft || 0,
      linked_account: linkedQuote?.customer_account ?? null,
      organization_id: e.organization_id ?? (linkedToOrgQuote ? organizationId : null),
      status: included ? "included" : "excluded_missing_org",
      reason: included ? null : "Missing quote_forecast_events.organization_id and no org quote_headers match"
    };
  });
}

/**
 * C. Account facts — production + color + quote + forecast rollup.
 */
export function buildAccountFacts({ productionJobs = [], worksheetMaterial = [], quoteFacts = [], forecastFacts = [], currentRange, priorRange }) {
  const curMap = new Map();
  const priMap = new Map();

  for (const j of productionJobs) {
    const d = String(j.report_date ?? "").slice(0, 10);
    const k = normKey(j.account_canonical || j.account_raw);
    if (!k) continue;
    if (currentRange && dateInInclusiveRange(d, currentRange)) {
      const slot = curMap.get(k) || {
        account: j.account_canonical || j.account_raw,
        account_raw: j.account_raw,
        branch: j.branch,
        assigned_rep: j.assigned_rep,
        currentSqft: 0,
        jobCount: 0,
        lastJobDate: "",
        attribution_status: j.attribution_status
      };
      slot.currentSqft += j.worksheet_sqft;
      slot.jobCount += 1;
      if (d > slot.lastJobDate) slot.lastJobDate = d;
      curMap.set(k, slot);
    }
    if (priorRange && dateInInclusiveRange(d, priorRange)) {
      priMap.set(k, { priorSqft: (priMap.get(k)?.priorSqft ?? 0) + j.worksheet_sqft, priorJobCount: (priMap.get(k)?.priorJobCount ?? 0) + 1 });
    }
  }

  const colorByAccount = new Map();
  for (const w of worksheetMaterial) {
    const d = String(w.report_date ?? w.job_creation_date ?? "").slice(0, 10);
    if (currentRange && !dateInInclusiveRange(d, currentRange)) continue;
    const k = normKey(w.account_canonical || w.account_raw);
    if (!k) continue;
    const slot = colorByAccount.get(k) || { eliteSqft: 0, outSqft: 0, unknownSqft: 0, totalSqft: 0 };
    slot.totalSqft += w.worksheet_sqft;
    if (w.collection_status === "elite100") slot.eliteSqft += w.worksheet_sqft;
    else if (w.color_raw) slot.outSqft += w.worksheet_sqft;
    else slot.unknownSqft += w.worksheet_sqft;
    colorByAccount.set(k, slot);
  }

  const quoteByAccount = new Map();
  for (const q of quoteFacts) {
    const k = normKey(q.customer_account);
    if (!k) continue;
    quoteByAccount.set(k, (quoteByAccount.get(k) || 0) + 1);
  }

  const forecastByAccount = new Map();
  for (const f of forecastFacts.filter((x) => x.status === "included")) {
    const k = normKey(f.linked_account);
    if (!k) continue;
    forecastByAccount.set(k, (forecastByAccount.get(k) || 0) + (f.forecast_value || 0));
  }

  const keys = new Set([...curMap.keys(), ...priMap.keys()]);
  const accounts = [];
  for (const k of keys) {
    const c = curMap.get(k) || { account: k, currentSqft: 0, jobCount: 0 };
    const p = priMap.get(k) || { priorSqft: 0 };
    const color = colorByAccount.get(k) || {};
    const yoySqft = (c.currentSqft || 0) - (p.priorSqft || 0);
    accounts.push({
      account: c.account || k,
      account_raw: c.account_raw ?? c.account,
      branch: c.branch ?? null,
      assigned_rep: c.assigned_rep ?? null,
      currentSqft: c.currentSqft || 0,
      priorSqft: p.priorSqft || 0,
      yoySqft,
      yoyPct: p.priorSqft > 0 ? (yoySqft / p.priorSqft) * 100 : null,
      jobCount: c.jobCount || 0,
      lastJobDate: c.lastJobDate || null,
      attribution_status: c.attribution_status ?? null,
      quoteCount: quoteByAccount.get(k) || 0,
      forecastValue: forecastByAccount.get(k) || 0,
      eliteShare: color.totalSqft > 0 ? (color.eliteSqft / color.totalSqft) * 100 : null,
      outShare: color.totalSqft > 0 ? (color.outSqft / color.totalSqft) * 100 : null,
      unknownShare: color.totalSqft > 0 ? (color.unknownSqft / color.totalSqft) * 100 : null,
      isDormant: (p.priorSqft || 0) >= 100 && (c.currentSqft || 0) === 0
    });
  }
  return accounts;
}

/**
 * F. Production flow / install signals (honest availability).
 */
export function buildProductionFlowFacts({ productionJobs = [], activities = [], calendarRows = [], currentRange }) {
  const availableSignals = [];
  const missingSignals = [];

  let activeJobCount = 0;
  let completedJobCount = 0;
  for (const j of productionJobs) {
    const d = String(j.report_date ?? "").slice(0, 10);
    if (currentRange && !dateInInclusiveRange(d, currentRange)) continue;
    const st = String(j.job_status ?? "").toLowerCase();
    if (/complete|closed|done/.test(st)) completedJobCount += 1;
    else activeJobCount += 1;
  }
  if (productionJobs.length) availableSignals.push("job_status_from_sales_moraware_job_facts");

  let calendarRowsInRange = 0;
  if (calendarRows.length) {
    availableSignals.push("moraware_calendar_schedule_rows");
    for (const row of calendarRows) {
      const d = String(row.calendar_date ?? "").slice(0, 10);
      if (currentRange && dateInInclusiveRange(d, currentRange)) calendarRowsInRange += 1;
    }
  } else {
    missingSignals.push("moraware_calendar_schedule_rows not loaded or empty");
  }

  let scheduledInstallCount = 0;
  if (activities.length) {
    availableSignals.push("brain_moraware_job_activities");
    scheduledInstallCount = activities.filter((a) => a.scheduled_date).length;
  } else {
    missingSignals.push("brain_moraware_job_activities not loaded or empty");
  }

  return {
    activeJobCount,
    completedJobCount,
    scheduledInstallCount,
    calendarRowsInRange,
    availableSignals,
    missingSignals,
    installSummary:
      calendarRowsInRange > 0
        ? { rowsInRange: calendarRowsInRange, source: "moraware_calendar_schedule_rows" }
        : metricUnavailable("No calendar schedule rows in selected date range"),
    backlogReason: "Production backlog not normalized in synced tables",
    capacityReason: "Capacity utilization not normalized in synced tables"
  };
}

/**
 * G. Data quality fact candidates.
 */
export function buildDataQualityFacts({ productionJobs = [], worksheetMaterial = [], mappings, syncHealth, forecastFacts = [] }) {
  const issues = [];
  const unmapped = productionJobs.filter((j) => j.attribution_status !== "approved_mapped");
  if (unmapped.length) {
    issues.push({ type: "unmapped_account", count: unmapped.length, sqftImpact: unmapped.reduce((s, j) => s + j.worksheet_sqft, 0) });
  }
  const missingSqft = productionJobs.filter((j) => j.worksheet_sqft <= 0);
  if (missingSqft.length) issues.push({ type: "missing_sqft", count: missingSqft.length });
  const missingRep = productionJobs.filter((j) => !j.assigned_rep && !j.normalized_salesperson);
  if (missingRep.length) issues.push({ type: "missing_salesperson", count: missingRep.length });
  const unmatchedWs = worksheetMaterial.filter((w) => !w.join_method);
  if (unmatchedWs.length) issues.push({ type: "unmatched_worksheet_rows", count: unmatchedWs.length, sqftImpact: unmatchedWs.reduce((s, w) => s + w.worksheet_sqft, 0) });
  const missingOrgForecasts = forecastFacts.filter((f) => f.status === "excluded_missing_org");
  if (missingOrgForecasts.length) issues.push({ type: "forecast_missing_org", count: missingOrgForecasts.length });
  if (syncHealth?.latestGroupComplete === false) issues.push({ type: "sync_incomplete", count: 1 });
  const excludedDates = worksheetMaterial.filter((w) => !w.job_creation_date && w.color_raw);
  if (excludedDates.length) issues.push({ type: "date_parse_excluded", count: excludedDates.length });

  return {
    issueCandidates: issues,
    aliasCount: mappings?.aliasesByNormMoraware?.size ?? 0,
    assignmentCount: mappings?.assignments?.length ?? 0
  };
}

function ymdRangeFromRows(rows, field) {
  const dates = rows.map((r) => String(r[field] ?? "").slice(0, 10)).filter(Boolean).sort();
  if (!dates.length) return { min: null, max: null };
  return { min: dates[0], max: dates[dates.length - 1] };
}

/**
 * Full intelligence bundle for dashboard metrics layer.
 */
export function buildSalesIntelligenceBundle(sources) {
  const {
    organizationId,
    enrichedFacts = [],
    worksheet,
    quotes = [],
    forecasts = [],
    mappings,
    syncHealth,
    facts,
    activities = [],
    calendarRows = []
  } = sources;

  const worksheetRows = worksheet?.rows ?? [];
  const productionJobs = buildProductionJobFacts({ organizationId, enrichedFacts, syncHealth, factsMeta: facts });
  const worksheetMaterial = buildWorksheetMaterialFacts({ organizationId, enrichedFacts, worksheetRows });
  const quoteFacts = buildQuoteFacts(quotes);
  const forecastFacts = buildForecastFacts(forecasts, quoteFacts, organizationId);

  const joinDiagnostics = summarizeIntelligenceJoinDiagnostics({
    enrichedFacts,
    worksheetRows,
    intelligenceRows: worksheetMaterial
  });

  return {
    organizationId,
    productionJobs,
    worksheetMaterial,
    quoteFacts,
    forecastFacts,
    accountFacts: [],
    productionFlow: {},
    dataQuality: {},
    syncHealth,
    factsMeta: facts,
    worksheetMeta: { rows: worksheetRows, available: worksheet.available ?? worksheetRows.length > 0 },
    mappings,
    joinDiagnostics,
    activities,
    calendarRows,
    _buildAccountFacts: (currentRange, priorRange) =>
      buildAccountFacts({ productionJobs, worksheetMaterial, quoteFacts, forecastFacts, currentRange, priorRange })
  };
}

/** Attach account facts and production flow once date ranges known. */
export function finalizeIntelligenceBundle(bundle, filters) {
  return {
    ...bundle,
    accountFacts: bundle._buildAccountFacts(filters.dateRange, filters.priorRange),
    productionFlow: buildProductionFlowFacts({
      productionJobs: bundle.productionJobs,
      activities: bundle.activities ?? [],
      calendarRows: bundle.calendarRows ?? [],
      currentRange: filters.dateRange
    }),
    dataQuality: buildDataQualityFacts({
      productionJobs: bundle.productionJobs,
      worksheetMaterial: bundle.worksheetMaterial,
      mappings: bundle.mappings,
      syncHealth: bundle.syncHealth,
      forecastFacts: bundle.forecastFacts
    })
  };
}

/**
 * meta.dataCoverage report for API response.
 */
export function buildDataCoverageReport(bundle, computed = {}) {
  const quotes = bundle.quoteFacts ?? [];
  const forecasts = bundle.forecastFacts ?? [];
  const open = quotes.filter((q) => q.is_open).length;
  const won = quotes.filter((q) => q.is_won).length;
  const lost = quotes.filter((q) => q.is_lost).length;
  const draft = quotes.filter((q) => q.is_draft).length;
  const forecastsWithOrg = forecasts.filter((f) => f.status === "included").length;
  const forecastsMissingOrg = forecasts.filter((f) => f.status === "excluded_missing_org").length;

  const caveats = [];
  if (forecastsMissingOrg > 0 && forecastsWithOrg === 0) {
    caveats.push("Forecast metrics unavailable: quote_forecast_events lack organization_id and quote linkage");
  }
  if (bundle.joinDiagnostics?.worksheetSqftUnmatched > 0) {
    caveats.push("Worksheet sqft exceeds matched job sqft for some rows — line-level vs job rollup difference");
  }
  if (computed.colorMix?.totalSqft != null && computed.production?.producedSqft != null) {
    const jobSqft = computed.production.producedSqft;
    const wsSqft = computed.colorMix.totalSqft;
    if (Math.abs(jobSqft - wsSqft) / Math.max(jobSqft, 1) > 0.25) {
      caveats.push("Job production sqft and worksheet classified sqft differ — both reported honestly");
    }
  }

  return {
    jobFacts: {
      rows: bundle.productionJobs?.length ?? 0,
      sqft: bundle.productionJobs?.reduce((s, j) => s + j.worksheet_sqft, 0) ?? 0,
      dateRange: ymdRangeFromRows(bundle.productionJobs ?? [], "report_date")
    },
    worksheetFacts: {
      rows: bundle.worksheetMeta?.rows?.length ?? 0,
      sqft: bundle.joinDiagnostics?.worksheetSqft ?? 0,
      rowsWithColor: bundle.joinDiagnostics?.worksheetRowsWithColor ?? 0,
      rowsWithRoom: bundle.joinDiagnostics?.worksheetRowsWithRoom ?? 0,
      rowsWithStone: bundle.joinDiagnostics?.worksheetRowsWithStone ?? 0
    },
    quotes: { rows: quotes.length, open, won, lost, draft },
    forecasts: { rows: forecasts.length, rowsWithOrg: forecastsWithOrg, rowsMissingOrg: forecastsMissingOrg },
    accounts: {
      aliases: bundle.dataQuality?.aliasCount ?? bundle.mappings?.aliasesByNormMoraware?.size ?? 0,
      assignments: bundle.dataQuality?.assignmentCount ?? 0,
      unmapped: bundle.dataQuality?.issueCandidates?.find((i) => i.type === "unmapped_account")?.count ?? 0
    },
    colorClassification: {
      classifiedSqft: bundle.joinDiagnostics?.classifiedWorksheetSqft ?? computed.colorMix?.totalSqft ?? null,
      eliteSqft: bundle.joinDiagnostics?.elite100WorksheetSqft ?? computed.colorMix?.eliteSqft ?? null,
      oocSqft: bundle.joinDiagnostics?.outOfCollectionWorksheetSqft ?? computed.colorMix?.outSqft ?? null,
      unknownSqft: bundle.joinDiagnostics?.unknownWorksheetSqft ?? computed.colorMix?.unknownSqft ?? null
    },
    productionFlow: {
      availableSignals: bundle.productionFlow?.availableSignals ?? [],
      missingSignals: bundle.productionFlow?.missingSignals ?? []
    },
    confidenceScore: computed.dataConfidence ?? null,
    caveats
  };
}
