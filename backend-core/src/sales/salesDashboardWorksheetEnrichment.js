/**
 * Worksheet fact enrichment — attach color/stone/room to job rows when available.
 */

import { classifySalesColor } from "./salesColorClassification.js";

function normKey(s) {
  return String(s ?? "").trim().toLowerCase();
}

/**
 * Index worksheet rows by job_id and by account+date fallback.
 * @param {Array<object>} worksheetRows
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
    const acct = normKey(row.account_name);
    const d = String(row.job_creation_date ?? "").slice(0, 10);
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
 * @param {Array<object>} jobs — enriched prepared facts
 * @param {Array<object>} worksheetRows
 */
export function attachWorksheetFieldsToJobs(jobs, worksheetRows) {
  const { byJobId, byAccountDate } = indexWorksheetRows(worksheetRows);
  return jobs.map((job) => {
    const jobId = String(job.source_job_id ?? "").trim();
    let wsRows = jobId ? byJobId.get(jobId) : null;
    if (!wsRows?.length) {
      const acct = normKey(job.account_name);
      const d = String(job.reportDate ?? job.created_at_source ?? "").slice(0, 10);
      wsRows = byAccountDate.get(`${acct}|||${d}`) || [];
    }
    if (!wsRows.length) return job;

    const primary = wsRows.reduce((best, r) => {
      const sq = Number(r.total_worksheet_sqft) || 0;
      return sq > (Number(best?.total_worksheet_sqft) || 0) ? r : best;
    }, wsRows[0]);

    const color = String(primary.color ?? "").trim();
    const stone = String(primary.stone ?? "").trim();
    const cls = classifySalesColor(color, stone);

    return {
      ...job,
      color,
      stone,
      room: primary.room ?? null,
      worksheetEnriched: true,
      colorCollectionStatus: cls.collectionStatus === "elite100" ? "elite100" : color ? "out_of_collection" : "unknown",
      eliteGroup: cls.eliteGroup,
      manufacturer: cls.manufacturer,
      catalogDisplayName: cls.catalogDisplayName,
      colorMatchMethod: cls.matchMethod,
      colorConfidence: cls.confidence
    };
  });
}

/**
 * Rich color analytics from worksheet rows (current + prior periods).
 */
export function buildColorAnalytics(worksheetRows, currentRange, priorRange) {
  const inRange = (d, range) => {
    const ymd = String(d ?? "").slice(0, 10);
    return ymd >= range.start && ymd <= range.end;
  };

  const cur = worksheetRows.filter((r) => inRange(r.job_creation_date, currentRange));
  const pri = worksheetRows.filter((r) => inRange(r.job_creation_date, priorRange));

  const aggregatePeriod = (rows) => {
    const byColor = new Map();
    const byMonth = new Map();
    const byAccount = new Map();
    const byRep = new Map();
    let eliteSqft = 0;
    let outSqft = 0;
    let unknownSqft = 0;
    let totalSqft = 0;

    for (const row of rows) {
      const sqft = Number(row.total_worksheet_sqft) || 0;
      if (sqft <= 0) continue;
      totalSqft += sqft;
      const color = String(row.color ?? "").trim();
      const stone = String(row.stone ?? "").trim();
      const cls = classifySalesColor(color, stone);
      const key = `${color}|||${stone}`;

      const slot = byColor.get(key) || {
        color,
        material: stone,
        sqft: 0,
        collectionStatus: cls.collectionStatus === "elite100" ? "elite100" : color ? "out_of_collection" : "unknown",
        eliteGroup: cls.eliteGroup,
        manufacturer: cls.manufacturer,
        catalogDisplayName: cls.catalogDisplayName,
        matchMethod: cls.matchMethod,
        confidence: cls.confidence,
        accountCount: new Set(),
        repCount: new Set()
      };
      slot.sqft += sqft;
      if (row.account_name) slot.accountCount.add(normKey(row.account_name));
      if (row.job_salesperson) slot.repCount.add(String(row.job_salesperson).trim());
      byColor.set(key, slot);

      if (cls.collectionStatus === "elite100") eliteSqft += sqft;
      else if (color) outSqft += sqft;
      else unknownSqft += sqft;

      const month = String(row.job_creation_date ?? "").slice(0, 7);
      if (month) byMonth.set(month, (byMonth.get(month) || 0) + sqft);

      const acct = normKey(row.account_name);
      if (acct) {
        const a = byAccount.get(acct) || { account: row.account_name, eliteSqft: 0, outSqft: 0, totalSqft: 0 };
        a.totalSqft += sqft;
        if (cls.collectionStatus === "elite100") a.eliteSqft += sqft;
        else if (color) a.outSqft += sqft;
        byAccount.set(acct, a);
      }

      const rep = String(row.job_salesperson ?? "").trim();
      if (rep) byRep.set(rep, (byRep.get(rep) || 0) + sqft);
    }

    return { byColor, byMonth, byAccount, byRep, eliteSqft, outSqft, unknownSqft, totalSqft };
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
    worksheetAvailable: worksheetRows.length > 0,
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
 * @param {Map<string, { eliteShare: number, outShare: number }>} shareByAccountKey
 * @param {string} accountName
 */
export function accountColorSharesFor(shareByAccountKey, accountName) {
  const hit = shareByAccountKey?.get(normKey(accountName));
  return hit || { eliteShare: null, outShare: null };
}
