import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { normalizeAccountNameWithoutLocationPrefix } from "../sales/salesAccountNameNormalizer.js";

function repoRootFromHere() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

function normalizeSpaces(s) {
  return String(s ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function supabaseServerClient() {
  const url = requiredEnv("SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseNumberOrZero(raw) {
  const s = normalizeSpaces(raw);
  if (!s) return 0;
  const m = s.match(/-?[\d,]+(?:\.\d+)?/);
  if (!m) return 0;
  const n = Number.parseFloat(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseUsDateToYmd(raw) {
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
  return s;
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
  pushField();
  pushRow();
  while (rows.length && rows[rows.length - 1].every((c) => String(c ?? "").trim() === "")) rows.pop();
  return rows;
}

function pickColumn(headers, patterns) {
  const hs = headers.map((h) => normalizeSpaces(h).toLowerCase());
  for (const pat of patterns) {
    const re = typeof pat === "string" ? new RegExp(pat, "i") : pat;
    const idx = hs.findIndex((h) => re.test(h));
    if (idx >= 0) return { index: idx, header: headers[idx] };
  }
  return null;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, headers) {
  const out = [];
  out.push(headers.map(csvEscape).join(","));
  for (const r of rows) out.push(headers.map((h) => csvEscape(r[h])).join(","));
  return out.join("\n") + "\n";
}

async function main() {
  const repoRoot = repoRootFromHere();
  const debugDir = path.join(repoRoot, "debug/sales/latest");
  await fs.mkdir(debugDir, { recursive: true });

  const morawareCsvPath =
    process.env.SALES_MORAWARE_REPORT_CSV || "/Users/chris.henely/Downloads/Report (2).csv";

  const payload = {
    generatedAt: new Date().toISOString(),
    inputs: { morawareCsvPath },
    report: {},
    brain: null,
    reconciliation: null,
    warnings: []
  };

  const csvText = await fs.readFile(morawareCsvPath, "utf8");
  const parsed = parseCsv(csvText);
  const headers = (parsed[0] || []).map((h) => normalizeSpaces(h));
  const dataRows = parsed.slice(1);

  const accountCol = pickColumn(headers, ["account\\s*name"]);
  const dateCol = pickColumn(headers, ["job\\s*creation\\s*date", "\\bcreation\\s*date\\b", "\\bdate\\b"]);
  const sqftCol = pickColumn(headers, ["sq\\s*\\.?\\s*ft", "sqft"]);

  if (!accountCol) throw new Error("Moraware CSV: missing Account Name column (detection failed).");
  if (!dateCol) throw new Error("Moraware CSV: missing Job Creation Date column (detection failed).");
  if (!sqftCol) throw new Error("Moraware CSV: missing Sq.Ft. column (detection failed).");

  const rows = dataRows
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => {
      const obj = {};
      for (let i = 0; i < headers.length; i++) obj[headers[i]] = normalizeSpaces(r[i] ?? "");
      return obj;
    });

  const reportByAccount = new Map();
  let reportTotalSqft = 0;
  let reportJobCount = 0;
  const dates = [];
  for (const r of rows) {
    const acct = String(r[accountCol.header] ?? "").trim() || "(blank)";
    const acctNorm = normalizeAccountNameWithoutLocationPrefix(acct);
    const sqft = parseNumberOrZero(r[sqftCol.header]);
    const d = parseUsDateToYmd(r[dateCol.header]);
    if (d) dates.push(d);
    reportTotalSqft += sqft;
    reportJobCount += 1;
    if (!reportByAccount.has(acctNorm)) {
      reportByAccount.set(acctNorm, { key: acctNorm, reportSqft: 0, reportRows: 0, examples: new Set() });
    }
    const g = reportByAccount.get(acctNorm);
    g.reportSqft += sqft;
    g.reportRows += 1;
    if (g.examples.size < 3 && acct) g.examples.add(acct);
  }

  dates.sort();
  const reportDateMin = dates[0] || null;
  const reportDateMax = dates[dates.length - 1] || null;
  payload.report = {
    rowCount: rows.length,
    dateBasis: "Moraware CSV uses Job Creation Date (as provided in report export).",
    dateWindow: reportDateMin && reportDateMax ? { start: reportDateMin, end: reportDateMax } : null,
    totalSqft: Math.round(reportTotalSqft * 100) / 100,
    jobRowCount: reportJobCount,
    uniqueAccountsNormalizedNoPrefix: reportByAccount.size
  };

  // If Supabase env missing, write stub.
  const hasEnv = String(process.env.SUPABASE_URL ?? "").trim() && String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!hasEnv) {
    payload.warnings.push("Supabase env missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Reconciliation vs Brain skipped.");
    const outJsonPath = path.join(debugDir, "sales-sqft-reconciliation.json");
    const outTxtPath = path.join(debugDir, "sales-sqft-reconciliation.txt");
    const outCsvPath = path.join(debugDir, "sales-sqft-reconciliation.csv");
    await fs.writeFile(outJsonPath, JSON.stringify(payload, null, 2));
    const txt = [
      "Sales Sq.Ft. Reconciliation — Moraware Report vs Brain",
      `Generated: ${payload.generatedAt}`,
      "",
      `Moraware CSV: ${morawareCsvPath}`,
      `Moraware date window: ${payload.report.dateWindow ? `${payload.report.dateWindow.start} → ${payload.report.dateWindow.end}` : "(unknown)"}`,
      `Moraware total Sq.Ft.: ${payload.report.totalSqft}`,
      "",
      "Brain reconciliation:",
      "- Skipped: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
      "",
      "Next step:",
      "- Configure Supabase env and rerun `npm run eos:sales:reconcile-sqft`.",
      ""
    ].join("\n");
    await fs.writeFile(outTxtPath, txt);
    await fs.writeFile(outCsvPath, "note\nSupabase env missing\n");
    console.log(txt);
    console.log(`Wrote ${outJsonPath}`);
    console.log(`Wrote ${outTxtPath}`);
    console.log(`Wrote ${outCsvPath}`);
    return;
  }

  const supabase = supabaseServerClient();

  // Pull brain_jobs in the same date window (creation_date basis).
  const start = reportDateMin;
  const end = reportDateMax;
  if (!start || !end) throw new Error("Cannot reconcile: missing report date bounds.");

  let from = 0;
  const pageSize = 1000;
  let brainTotalSqft = 0;
  let brainJobCount = 0;
  const brainByAccount = new Map();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("brain_jobs")
      .select("job_id,job_name,account_name,creation_date,worksheet_sqft", { count: "exact" })
      .gte("creation_date", start)
      .lte("creation_date", end)
      .order("creation_date", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const r of data) {
      const acct = String(r.account_name ?? "").trim() || "(blank)";
      const acctNorm = normalizeAccountNameWithoutLocationPrefix(acct);
      const sqft = Number(r.worksheet_sqft ?? 0) || 0;
      brainTotalSqft += sqft;
      brainJobCount += 1;
      if (!brainByAccount.has(acctNorm)) brainByAccount.set(acctNorm, { key: acctNorm, brainSqft: 0, brainJobs: 0, examples: new Set() });
      const g = brainByAccount.get(acctNorm);
      g.brainSqft += sqft;
      g.brainJobs += 1;
      if (g.examples.size < 3 && acct) g.examples.add(acct);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  payload.brain = {
    dateBasis: "Brain uses brain_jobs.creation_date in this reconciliation.",
    dateWindow: { start, end },
    totalSqft: Math.round(brainTotalSqft * 100) / 100,
    jobCount: brainJobCount,
    uniqueAccountsNormalizedNoPrefix: brainByAccount.size
  };

  // Compare account totals.
  const allKeys = new Set([...reportByAccount.keys(), ...brainByAccount.keys()]);
  const diffs = [];
  for (const k of allKeys) {
    const rep = reportByAccount.get(k);
    const br = brainByAccount.get(k);
    const reportSqft = rep ? rep.reportSqft : 0;
    const brainSqft = br ? br.brainSqft : 0;
    const delta = brainSqft - reportSqft;
    diffs.push({
      account_key_normalized_no_prefix: k,
      report_sqft: Math.round(reportSqft * 100) / 100,
      brain_sqft: Math.round(brainSqft * 100) / 100,
      delta_brain_minus_report: Math.round(delta * 100) / 100,
      report_rows: rep ? rep.reportRows : 0,
      brain_jobs: br ? br.brainJobs : 0,
      report_examples: rep ? [...rep.examples].join("; ") : "",
      brain_examples: br ? [...br.examples].join("; ") : ""
    });
  }
  diffs.sort((a, b) => Math.abs(Number(b.delta_brain_minus_report)) - Math.abs(Number(a.delta_brain_minus_report)));

  const diffTotal = payload.brain.totalSqft - payload.report.totalSqft;
  const diffPct = payload.report.totalSqft ? (diffTotal / payload.report.totalSqft) * 100 : null;

  payload.reconciliation = {
    reportTotalSqft: payload.report.totalSqft,
    brainTotalSqft: payload.brain.totalSqft,
    differenceSqft: Math.round(diffTotal * 100) / 100,
    differencePct: diffPct != null ? Math.round(diffPct * 1000) / 1000 : null,
    reportJobRowCount: payload.report.jobRowCount,
    brainJobCount: payload.brain.jobCount,
    reportAccountCount: payload.report.uniqueAccountsNormalizedNoPrefix,
    brainAccountCount: payload.brain.uniqueAccountsNormalizedNoPrefix,
    topAccountDeltas: diffs.slice(0, 50)
  };

  const outJsonPath = path.join(debugDir, "sales-sqft-reconciliation.json");
  const outTxtPath = path.join(debugDir, "sales-sqft-reconciliation.txt");
  const outCsvPath = path.join(debugDir, "sales-sqft-reconciliation.csv");

  await fs.writeFile(outJsonPath, JSON.stringify(payload, null, 2));
  await fs.writeFile(
    outCsvPath,
    toCsv(diffs, [
      "account_key_normalized_no_prefix",
      "report_sqft",
      "brain_sqft",
      "delta_brain_minus_report",
      "report_rows",
      "brain_jobs",
      "report_examples",
      "brain_examples"
    ])
  );

  const topOnlyInReport = diffs
    .filter((d) => d.report_sqft > 0 && d.brain_sqft === 0)
    .sort((a, b) => b.report_sqft - a.report_sqft)
    .slice(0, 25);

  const topOnlyInBrain = diffs
    .filter((d) => d.brain_sqft > 0 && d.report_sqft === 0)
    .sort((a, b) => b.brain_sqft - a.brain_sqft)
    .slice(0, 25);

  const txt = [
    "Sales Sq.Ft. Reconciliation — Moraware Report vs Brain",
    `Generated: ${payload.generatedAt}`,
    "",
    `Moraware CSV: ${morawareCsvPath}`,
    `Date basis: ${payload.report.dateBasis}`,
    `Date window: ${start} → ${end}`,
    "",
    `Moraware report total Sq.Ft.: ${payload.report.totalSqft}`,
    `Brain total Sq.Ft. (brain_jobs.worksheet_sqft): ${payload.brain.totalSqft}`,
    `Difference (Brain - Report): ${payload.reconciliation.differenceSqft} (${payload.reconciliation.differencePct}% )`,
    "",
    `Moraware job rows: ${payload.report.jobRowCount}`,
    `Brain jobs: ${payload.brain.jobCount}`,
    "",
    "Top accounts present in report but missing in Brain (by report Sq.Ft.):",
    ...topOnlyInReport.map((r) => `- ${r.account_key_normalized_no_prefix}: ${r.report_sqft} sf :: ${r.report_examples}`),
    "",
    "Top accounts present in Brain but missing in report (by brain Sq.Ft.):",
    ...topOnlyInBrain.map((r) => `- ${r.account_key_normalized_no_prefix}: ${r.brain_sqft} sf :: ${r.brain_examples}`),
    "",
    "Interpretation guidance:",
    "- If totals are close but per-account deltas exist, the mismatch is likely name normalization differences, date cutoff (inclusive/exclusive), or missing rows in either dataset.",
    "- This report compares Moraware Job Creation Date to Brain job creation_date and worksheet_sqft; it does NOT change Sq.Ft. math.",
    ""
  ].join("\n");

  await fs.writeFile(outTxtPath, txt);

  console.log(txt);
  console.log(`Wrote ${outJsonPath}`);
  console.log(`Wrote ${outTxtPath}`);
  console.log(`Wrote ${outCsvPath}`);
}

main().catch((e) => {
  console.error("reconcileSalesSqftReportToBrain failed:", e);
  process.exitCode = 1;
});

