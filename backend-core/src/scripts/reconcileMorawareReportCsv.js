import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

function normalizeSpaces(s) {
  return String(s ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeNameForMatch(raw) {
  const s = normalizeSpaces(raw).toLowerCase();
  // Strip only trailing ## and ##$ for matching.
  return s.replace(/\s*##\$\s*$/g, "").replace(/\s*##\s*$/g, "");
}

function normalizeSalesperson(raw) {
  const s = normalizeSpaces(raw);
  return s ? s : "(blank)";
}

function normalizeDateToYmd(raw) {
  const s = normalizeSpaces(raw);
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = String(us[1]).padStart(2, "0");
    const dd = String(us[2]).padStart(2, "0");
    return `${us[3]}-${mm}-${dd}`;
  }
  return s; // last resort
}

function parseNumberOrZero(raw) {
  const s = normalizeSpaces(raw);
  if (!s) return 0;
  const m = s.match(/-?[\d,]+(?:\.\d+)?/);
  if (!m) return 0;
  const n = Number.parseFloat(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, headers) {
  const out = [];
  out.push(headers.map(csvEscape).join(","));
  for (const r of rows) {
    out.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  return out.join("\n") + "\n";
}

// Minimal CSV parser: handles quoted fields and commas/newlines in quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // trailing field/row
  pushField();
  pushRow();

  // drop possible last empty row
  while (rows.length && rows[rows.length - 1].every((c) => String(c ?? "").trim() === "")) rows.pop();
  return rows;
}

function buildIdentityKey({ jobNameNorm, creationDateYmd, accountNameNorm, salespersonNorm }) {
  return `${jobNameNorm} | ${creationDateYmd} | ${accountNameNorm} | ${salespersonNorm}`;
}

function buildIdentityKeyNoSales({ jobNameNorm, creationDateYmd, accountNameNorm }) {
  return `${jobNameNorm} | ${creationDateYmd} | ${accountNameNorm}`;
}

function buildIdentityKeyNameDate({ jobNameNorm, creationDateYmd }) {
  return `${jobNameNorm} | ${creationDateYmd}`;
}

function addToCounter(map, key, delta) {
  map.set(key, (map.get(key) || 0) + delta);
}

function mapToSortedRows(map, keyName, valueName, limit = null) {
  const rows = [...map.entries()]
    .map(([k, v]) => ({ [keyName]: k, [valueName]: v }))
    .sort((a, b) => Number(b[valueName]) - Number(a[valueName]));
  return limit ? rows.slice(0, limit) : rows;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function isSupabaseEnabled() {
  const url = String(process.env.SUPABASE_URL ?? "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return Boolean(url && key);
}

function isSupabaseWriteEnabled() {
  return String(process.env.SUPABASE_WRITE_ENABLED ?? "").trim() === "1";
}

async function loadBrainFromLocal(repoRoot) {
  const latestDir = path.join(repoRoot, "debug", "moraware", "latest");
  const indexPath = path.join(latestDir, "jobs", "index.json");
  const indexText = await fs.readFile(indexPath, "utf8");
  const indexRows = JSON.parse(indexText);
  const jobs = [];
  for (const r of indexRows) {
    const jobId = String(r.jobId ?? r.job_id ?? "").trim();
    const artifactPath = r.artifactPath ? path.join(latestDir, r.artifactPath) : path.join(latestDir, "jobs", `${jobId}.json`);
    try {
      const jobText = await fs.readFile(artifactPath, "utf8");
      const job = JSON.parse(jobText);
      jobs.push(job);
    } catch {
      // skip missing artifact
    }
  }
  return { source: "local", jobs };
}

async function loadBrainFromSupabase() {
  if (!isSupabaseEnabled()) return null;
  const url = String(process.env.SUPABASE_URL ?? "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const jobs = [];
  let from = 0;
  const pageSize = 1000;
  // paginate to avoid row limits
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("brain_jobs")
      .select("job_id,job_name,account_id,account_name,creation_date,salesperson_name,worksheet_sqft")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase read brain_jobs failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      jobs.push({
        source: { system: "moraware", jobId: String(r.job_id ?? ""), accountId: String(r.account_id ?? "") },
        jobInfo: {
          jobId: String(r.job_id ?? ""),
          jobName: String(r.job_name ?? ""),
          accountId: String(r.account_id ?? ""),
          accountName: String(r.account_name ?? ""),
          creationDate: r.creation_date ? String(r.creation_date) : "",
          salespersonName: String(r.salesperson_name ?? "")
        },
        metrics: { worksheetSqFt: Number(r.worksheet_sqft ?? 0) || 0 }
      });
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { source: "supabase", jobs };
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../..");

  const envPath = process.env.MORAWARE_REPORT_CSV;
  const defaultA = "/mnt/data/Report (1).csv";
  const csvPath = envPath
    ? path.isAbsolute(envPath)
      ? envPath
      : path.join(repoRoot, envPath)
    : (await fileExists(defaultA))
      ? defaultA
      : path.join(repoRoot, "Report (1).csv");

  const csvText = await fs.readFile(csvPath, "utf8");
  const parsed = parseCsv(csvText);
  const header = parsed[0] || [];
  const dataRows = parsed.slice(1);

  const colIndex = new Map(header.map((h, idx) => [normalizeSpaces(h), idx]));
  const col = (name) => colIndex.get(name);

  const COLS = {
    jobName: "Job Name",
    jobSalesperson: "Job Salesperson",
    jobCreationDate: "Job Creation Date",
    accountName: "Account Name",
    totalSqFt: "Total Job Worksheet - Sq.Ft. by Job Creation Date"
  };

  for (const required of Object.values(COLS)) {
    if (col(required) === undefined) {
      throw new Error(`Missing required CSV column: ${required}. Found columns: ${header.join(" | ")}`);
    }
  }

  const reportRows = [];
  const reportBySalesperson = new Map();
  const reportByAccount = new Map();
  const reportByDate = new Map();
  let reportTotalSqFt = 0;

  const reportByIdentity = new Map(); // key -> { ... , sqftSum, rowCount }
  const reportByKeyNoSales = new Map();
  const reportByKeyNameDate = new Map();

  let earliestReport = "";
  let latestReport = "";

  for (let i = 0; i < dataRows.length; i += 1) {
    const r = dataRows[i];
    const rawJobName = r[col(COLS.jobName)];
    const rawSales = r[col(COLS.jobSalesperson)];
    const rawCreation = r[col(COLS.jobCreationDate)];
    const rawAccount = r[col(COLS.accountName)];
    const rawSqFt = r[col(COLS.totalSqFt)];

    const jobNameRaw = normalizeSpaces(rawJobName);
    const accountNameRaw = normalizeSpaces(rawAccount);
    const salespersonRaw = normalizeSalesperson(rawSales);
    const creationYmd = normalizeDateToYmd(rawCreation);
    const sqft = parseNumberOrZero(rawSqFt);

    const jobNameNorm = normalizeNameForMatch(jobNameRaw);
    const accountNameNorm = normalizeNameForMatch(accountNameRaw);
    const salespersonNorm = normalizeNameForMatch(salespersonRaw);

    reportTotalSqFt += sqft;
    addToCounter(reportBySalesperson, salespersonRaw, sqft);
    addToCounter(reportByAccount, accountNameRaw, sqft);
    addToCounter(reportByDate, creationYmd || "(missing)", sqft);

    if (creationYmd) {
      if (!earliestReport || creationYmd < earliestReport) earliestReport = creationYmd;
      if (!latestReport || creationYmd > latestReport) latestReport = creationYmd;
    }

    const identity = buildIdentityKey({ jobNameNorm, creationDateYmd: creationYmd, accountNameNorm, salespersonNorm });
    const keyNoSales = buildIdentityKeyNoSales({ jobNameNorm, creationDateYmd: creationYmd, accountNameNorm });
    const keyNameDate = buildIdentityKeyNameDate({ jobNameNorm, creationDateYmd: creationYmd });

    const prev = reportByIdentity.get(identity) || {
      identity,
      jobNameRaw,
      accountNameRaw,
      creationYmd,
      salespersonRaw,
      sqftSum: 0,
      rowCount: 0
    };
    prev.sqftSum += sqft;
    prev.rowCount += 1;
    reportByIdentity.set(identity, prev);

    reportByKeyNoSales.set(keyNoSales, true);
    reportByKeyNameDate.set(keyNameDate, true);

    reportRows.push({
      rowIndex: i + 2,
      jobNameRaw,
      accountNameRaw,
      creationYmd,
      salespersonRaw,
      sqft
    });
  }

  const supaReadable = isSupabaseEnabled();
  const brainLoader =
    supaReadable && isSupabaseWriteEnabled()
      ? await loadBrainFromSupabase()
      : null;
  const brain = brainLoader || (await loadBrainFromLocal(repoRoot));

  const brainJobs = brain.jobs;
  const brainByIdentity = new Map();
  const brainByKeyNoSales = new Map();
  const brainByKeyNameDate = new Map();

  const brainBySalesperson = new Map();
  const brainByAccount = new Map();
  const brainByDate = new Map();

  let brainTotalSqFt = 0;
  let earliestBrain = "";
  let latestBrain = "";

  for (const j of brainJobs) {
    const jobInfo = j.jobInfo || {};
    const metrics = j.metrics || {};
    const jobNameRaw = normalizeSpaces(jobInfo.jobName);
    const accountNameRaw = normalizeSpaces(jobInfo.accountName);
    const salespersonRaw = normalizeSalesperson(jobInfo.salespersonName);
    const creationYmd = normalizeDateToYmd(jobInfo.creationDate);
    const worksheetSqFt = Number(metrics.worksheetSqFt ?? 0) || 0;

    const jobNameNorm = normalizeNameForMatch(jobNameRaw);
    const accountNameNorm = normalizeNameForMatch(accountNameRaw);
    const salespersonNorm = normalizeNameForMatch(salespersonRaw);

    const identity = buildIdentityKey({ jobNameNorm, creationDateYmd: creationYmd, accountNameNorm, salespersonNorm });
    const keyNoSales = buildIdentityKeyNoSales({ jobNameNorm, creationDateYmd: creationYmd, accountNameNorm });
    const keyNameDate = buildIdentityKeyNameDate({ jobNameNorm, creationDateYmd: creationYmd });

    brainByIdentity.set(identity, {
      identity,
      jobId: String(jobInfo.jobId ?? j?.source?.jobId ?? ""),
      jobNameRaw,
      accountNameRaw,
      creationYmd,
      salespersonRaw,
      worksheetSqFt
    });
    brainByKeyNoSales.set(keyNoSales, true);
    brainByKeyNameDate.set(keyNameDate, true);

    brainTotalSqFt += worksheetSqFt;
    addToCounter(brainBySalesperson, salespersonRaw, worksheetSqFt);
    addToCounter(brainByAccount, accountNameRaw, worksheetSqFt);
    addToCounter(brainByDate, creationYmd || "(missing)", worksheetSqFt);

    if (creationYmd) {
      if (!earliestBrain || creationYmd < earliestBrain) earliestBrain = creationYmd;
      if (!latestBrain || creationYmd > latestBrain) latestBrain = creationYmd;
    }
  }

  // Matching pass
  const reconciliationRows = [];
  const missing = [];
  const missingByDate = new Map();
  const missingBySalesperson = new Map();
  const missingByAccount = new Map();

  for (const rep of reportByIdentity.values()) {
    let status = "missing";
    let matchType = "";
    if (brainByIdentity.has(rep.identity)) {
      status = "matched";
      matchType = "exact";
    } else {
      const jobNameNorm = normalizeNameForMatch(rep.jobNameRaw);
      const accountNameNorm = normalizeNameForMatch(rep.accountNameRaw);
      const salespersonNorm = normalizeNameForMatch(rep.salespersonRaw);
      const keyNoSales = buildIdentityKeyNoSales({ jobNameNorm, creationDateYmd: rep.creationYmd, accountNameNorm });
      const keyNameDate = buildIdentityKeyNameDate({ jobNameNorm, creationDateYmd: rep.creationYmd });
      if (brainByKeyNoSales.has(keyNoSales)) {
        status = "matched";
        matchType = "fuzzy_no_salesperson";
      } else if (brainByKeyNameDate.has(keyNameDate)) {
        status = "matched";
        matchType = "fuzzy_name_date";
      }
    }

    reconciliationRows.push({
      identity: rep.identity,
      jobName: rep.jobNameRaw,
      accountName: rep.accountNameRaw,
      creationDate: rep.creationYmd,
      salesperson: rep.salespersonRaw,
      reportSqFt: rep.sqftSum,
      reportRows: rep.rowCount,
      match: status,
      matchType
    });

    if (status === "missing") {
      missing.push(rep);
      addToCounter(missingByDate, rep.creationYmd || "(missing)", 1);
      addToCounter(missingBySalesperson, rep.salespersonRaw, 1);
      addToCounter(missingByAccount, rep.accountNameRaw, 1);
    }
  }

  // Extras: brain identities not present in report (strict only)
  const extras = [];
  for (const [idKey, b] of brainByIdentity.entries()) {
    if (!reportByIdentity.has(idKey)) {
      extras.push(b);
    }
  }

  const topMissingBySqFt = [...missing]
    .sort((a, b) => b.sqftSum - a.sqftSum)
    .slice(0, 50)
    .map((m) => ({
      identity: m.identity,
      jobName: m.jobNameRaw,
      accountName: m.accountNameRaw,
      creationDate: m.creationYmd,
      salesperson: m.salespersonRaw,
      reportSqFt: m.sqftSum,
      reportRows: m.rowCount
    }));

  const reportIdentityCount = reportByIdentity.size;
  const brainJobCount = brainJobs.length;
  const missingCount = missing.length;
  const extraCount = extras.length;

  // Diagnostics for early dates
  const earlyStart = "2026-01-01";
  const earlyEnd = "2026-01-04";
  const reportEarly = reconciliationRows.filter((r) => r.creationDate >= earlyStart && r.creationDate <= earlyEnd);
  const brainEarly = [...brainByIdentity.values()].filter((r) => r.creationYmd >= earlyStart && r.creationYmd <= earlyEnd);

  const bySalespersonRows = (() => {
    const allSales = new Set([...reportBySalesperson.keys(), ...brainBySalesperson.keys()]);
    const rows = [];
    for (const sp of allSales) {
      const reportSq = reportBySalesperson.get(sp) || 0;
      const brainSq = brainBySalesperson.get(sp) || 0;
      rows.push({ salesperson: sp, reportSqFt: reportSq, brainSqFt: brainSq, delta: brainSq - reportSq });
    }
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return rows;
  })();

  const latestDir = path.join(repoRoot, "debug", "moraware", "latest");
  await fs.mkdir(latestDir, { recursive: true });

  const jsonOut = {
    csvPath,
    report: {
      rows: reportRows.length,
      uniqueJobIdentities: reportIdentityCount,
      totalSqFt: reportTotalSqFt,
      earliestDate: earliestReport || null,
      latestDate: latestReport || null
    },
    brain: {
      source: brain.source,
      jobs: brainJobCount,
      totalSqFt: brainTotalSqFt,
      earliestDate: earliestBrain || null,
      latestDate: latestBrain || null
    },
    deltaSqFt: brainTotalSqFt - reportTotalSqFt,
    missing: {
      count: missingCount
    },
    extra: {
      count: extraCount
    },
    diagnostics: {
      earlyWindow: { start: earlyStart, end: earlyEnd },
      reportRowsInEarlyWindow: reportEarly.length,
      brainJobsInEarlyWindow: brainEarly.length,
      missingByDateTop: mapToSortedRows(missingByDate, "date", "missingCount", 25),
      missingBySalespersonTop: mapToSortedRows(missingBySalesperson, "salesperson", "missingCount", 25),
      missingByAccountTop: mapToSortedRows(missingByAccount, "account", "missingCount", 25),
      topMissingBySqFt
    }
  };

  await fs.writeFile(
    path.join(latestDir, "report-reconciliation-2026.json"),
    JSON.stringify(jsonOut, null, 2),
    "utf8"
  );

  // CSV exports
  const reconCsvHeaders = [
    "identity",
    "jobName",
    "accountName",
    "creationDate",
    "salesperson",
    "reportSqFt",
    "reportRows",
    "match",
    "matchType"
  ];
  await fs.writeFile(
    path.join(latestDir, "report-reconciliation-2026.csv"),
    toCsv(
      reconciliationRows.sort((a, b) => Number(b.reportSqFt) - Number(a.reportSqFt)),
      reconCsvHeaders
    ),
    "utf8"
  );

  await fs.writeFile(
    path.join(latestDir, "report-missing-from-brain.csv"),
    toCsv(
      reconciliationRows.filter((r) => r.match === "missing").sort((a, b) => Number(b.reportSqFt) - Number(a.reportSqFt)),
      reconCsvHeaders
    ),
    "utf8"
  );

  await fs.writeFile(
    path.join(latestDir, "brain-extra-not-in-report.csv"),
    toCsv(
      extras.map((e) => ({
        identity: e.identity,
        jobId: e.jobId,
        jobName: e.jobNameRaw,
        accountName: e.accountNameRaw,
        creationDate: e.creationYmd,
        salesperson: e.salespersonRaw,
        brainSqFt: e.worksheetSqFt
      })),
      ["identity", "jobId", "jobName", "accountName", "creationDate", "salesperson", "brainSqFt"]
    ),
    "utf8"
  );

  await fs.writeFile(
    path.join(latestDir, "report-vs-brain-by-salesperson.csv"),
    toCsv(bySalespersonRows, ["salesperson", "reportSqFt", "brainSqFt", "delta"]),
    "utf8"
  );

  const txt =
    `=== REPORT VS BRAIN RECONCILIATION ===\n` +
    `report rows: ${reportRows.length}\n` +
    `report unique job identities: ${reportIdentityCount}\n` +
    `report total sqft: ${reportTotalSqFt}\n` +
    `brain jobs: ${brainJobCount}\n` +
    `brain total sqft: ${brainTotalSqFt}\n` +
    `delta: ${brainTotalSqFt - reportTotalSqFt}\n` +
    `missing report job identities: ${missingCount}\n` +
    `extra brain jobs not in report: ${extraCount}\n` +
    `earliest report date: ${earliestReport || "(n/a)"}\n` +
    `latest report date: ${latestReport || "(n/a)"}\n` +
    `earliest brain date: ${earliestBrain || "(n/a)"}\n` +
    `latest brain date: ${latestBrain || "(n/a)"}\n` +
    `\n` +
    `report jobs on 2026-01-01 through 2026-01-04: ${reportEarly.length}\n` +
    `brain jobs on 2026-01-01 through 2026-01-04: ${brainEarly.length}\n` +
    `\n` +
    `Top 50 missing report jobs by Sq.Ft.: written to report-reconciliation-2026.json\n`;

  await fs.writeFile(path.join(latestDir, "report-reconciliation-2026.txt"), txt, "utf8");

  console.log("=== REPORT VS BRAIN RECONCILIATION ===");
  console.log(`report rows: ${reportRows.length}`);
  console.log(`report unique job identities: ${reportIdentityCount}`);
  console.log(`report total sqft: ${reportTotalSqFt}`);
  console.log(`brain jobs: ${brainJobCount}`);
  console.log(`brain total sqft: ${brainTotalSqFt}`);
  console.log(`delta: ${brainTotalSqFt - reportTotalSqFt}`);
  console.log(`missing report job identities: ${missingCount}`);
  console.log(`extra brain jobs not in report: ${extraCount}`);
  console.log(`closest salesperson deltas: see report-vs-brain-by-salesperson.csv`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

