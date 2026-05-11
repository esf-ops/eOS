import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import xlsx from "xlsx";

import {
  buildAccountTokens,
  normalizeAccountName,
  normalizeAccountNameWithoutLocationPrefix
} from "../sales/salesAccountNameNormalizer.js";

function repoRootFromHere() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // backend-core/src/scripts/*.js -> repo root
  return path.resolve(__dirname, "../../..");
}

function normalizeSpaces(s) {
  return String(s ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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

function parseNumberOrNull(raw) {
  const s = normalizeSpaces(raw);
  if (!s) return null;
  const m = s.match(/-?[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number.parseFloat(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
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

function ensureDir(p) {
  return fs.mkdir(p, { recursive: true });
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

function countBy(arr, getKey) {
  const m = new Map();
  for (const item of arr) {
    const k = String(getKey(item) ?? "").trim() || "(blank)";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function topNCounts(sortedEntries, n) {
  return sortedEntries.slice(0, n).map(([k, v]) => ({ key: k, count: v }));
}

function readXlsxAsTable(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  /** @type {Array<Array<unknown>>} */
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const scanLimit = Math.min(30, rows.length);
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < scanLimit; i++) {
    const r = rows[i] || [];
    const cells = r.map((c) => normalizeSpaces(c)).filter(Boolean);
    const uniq = new Set(cells.map((c) => c.toLowerCase())).size;
    const score = cells.length >= 3 ? cells.length + uniq * 0.5 : 0;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const headerRow = (rows[bestIdx] || []).map((c) => normalizeSpaces(c));
  const dataRows = rows.slice(bestIdx + 1);
  const objects = [];
  for (const r of dataRows) {
    const obj = {};
    let hasAny = false;
    for (let i = 0; i < headerRow.length; i++) {
      const key = headerRow[i] || `__COL_${i}`;
      const v = normalizeSpaces(r?.[i]);
      if (v) hasAny = true;
      obj[key] = v;
    }
    if (hasAny) objects.push(obj);
  }

  return { headerRow, headerRowIndex: bestIdx, objects };
}

async function main() {
  const repoRoot = repoRootFromHere();
  const debugDir = path.join(repoRoot, "debug/sales/latest");
  await ensureDir(debugDir);

  const morawareCsvPath =
    process.env.SALES_MORAWARE_REPORT_CSV || "/Users/chris.henely/Downloads/Report (2).csv";
  const mondayXlsxPath =
    process.env.SALES_MONDAY_ACCOUNT_MASTER_XLSX || "/Users/chris.henely/Downloads/Account_Master_List_1778500823.xlsx";

  const summary = {
    generatedAt: new Date().toISOString(),
    inputs: {
      morawareCsvPath,
      mondayXlsxPath
    },
    moraware: {},
    monday: {},
    warnings: []
  };

  // ---- Moraware CSV ----
  let csvText = "";
  try {
    csvText = await fs.readFile(morawareCsvPath, "utf8");
  } catch (e) {
    summary.warnings.push(`Missing Moraware CSV at ${morawareCsvPath}: ${String(e?.message || e)}`);
  }

  /** @type {Array<Record<string, string>>} */
  let morawareRows = [];
  if (csvText) {
    const parsed = parseCsv(csvText);
    const headers = (parsed[0] || []).map((h) => normalizeSpaces(h));
    const dataRows = parsed.slice(1);
    morawareRows = dataRows
      .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
      .map((r) => {
        /** @type {Record<string, string>} */
        const obj = {};
        for (let i = 0; i < headers.length; i++) obj[headers[i]] = normalizeSpaces(r[i] ?? "");
        return obj;
      });

    const dateCol = pickColumn(headers, ["job\\s*creation\\s*date", "\\bcreation\\s*date\\b", "\\bdate\\b"]);
    const accountCol = pickColumn(headers, ["account\\s*name"]);
    const jobCol = pickColumn(headers, ["job\\s*name"]);
    const jobSpCol = pickColumn(headers, ["job\\s*salesperson", "salesperson"]);
    const acctSpCol = pickColumn(headers, ["account\\s*salesperson"]);
    const sqftCol = pickColumn(headers, ["sq\\s*\\.?\\s*ft", "sqft", "square\\s*feet"]);
    const colorCol = pickColumn(headers, ["worksheet.*color", "color", "material"]);

    const dateVals = dateCol
      ? morawareRows.map((r) => parseUsDateToYmd(r[dateCol.header] || "")).filter(Boolean)
      : [];
    dateVals.sort();
    const bounds = dateVals.length ? { min: dateVals[0], max: dateVals[dateVals.length - 1] } : null;

    let totalSqft = 0;
    let sqftMissing = 0;
    if (sqftCol) {
      for (const r of morawareRows) {
        const n = parseNumberOrNull(r[sqftCol.header]);
        if (n == null) sqftMissing += 1;
        else totalSqft += n;
      }
    } else {
      summary.warnings.push("Moraware CSV: could not detect Sq.Ft. column.");
    }

    const acctNames = accountCol ? morawareRows.map((r) => r[accountCol.header] || "").filter(Boolean) : [];
    const acctUnique = new Set(acctNames.map((n) => normalizeAccountName(n))).size;
    const jobSpCounts = jobSpCol ? countBy(morawareRows, (r) => r[jobSpCol.header]) : [];

    summary.moraware = {
      rowCount: morawareRows.length,
      detectedColumns: {
        jobName: jobCol?.header || null,
        accountName: accountCol?.header || null,
        jobSalesperson: jobSpCol?.header || null,
        accountSalesperson: acctSpCol?.header || null,
        creationDate: dateCol?.header || null,
        worksheetColor: colorCol?.header || null,
        sqft: sqftCol?.header || null
      },
      headers,
      dateBounds: bounds,
      totalSqft: Math.round(totalSqft * 100) / 100,
      sqftMissingCount: sqftMissing,
      uniqueAccountCount: acctUnique,
      topJobSalespeople: topNCounts(jobSpCounts, 20)
    };
  }

  // ---- Monday XLSX ----
  /** @type {Array<Record<string, unknown>>} */
  let mondayRows = [];
  try {
    const wb = xlsx.readFile(mondayXlsxPath, { cellDates: false });
    const sheetName = wb.SheetNames[0];
    const table = readXlsxAsTable(wb, sheetName);
    mondayRows = table.objects;

    const headers = table.headerRow;
    const nameCol = pickColumn(headers, ["account\\s*name", "^name$", "customer"]);
    const execCol = pickColumn(headers, ["sales\\s*exec", "sales\\s*executive", "assigned\\s*sales", "owner", "rep"]);
    const branchCol = pickColumn(headers, ["branch", "location", "site"]);
    const statusCol = pickColumn(headers, ["status"]);
    const idCol = pickColumn(headers, ["item\\s*id", "monday\\s*id", "\\bid\\b", "board.*id"]);
    const typeCol = pickColumn(headers, ["type", "category", "account\\s*type"]);

    const names = nameCol ? mondayRows.map((r) => normalizeSpaces(r[nameCol.header])) : [];
    const uniqueMonday = new Set(names.map((n) => normalizeAccountName(n))).size;

    const execCounts = execCol ? countBy(mondayRows, (r) => normalizeSpaces(r[execCol.header])) : [];

    summary.monday = {
      rowCount: mondayRows.length,
      sheetName: wb.SheetNames[0] || null,
      headerRowIndex: table.headerRowIndex,
      detectedColumns: {
        accountName: nameCol?.header || null,
        salesExecutive: execCol?.header || null,
        branchOrLocation: branchCol?.header || null,
        status: statusCol?.header || null,
        sourceAccountId: idCol?.header || null,
        accountType: typeCol?.header || null
      },
      headers,
      uniqueAccountCount: uniqueMonday,
      topSalesExecutiveCounts: topNCounts(execCounts, 20)
    };
  } catch (e) {
    summary.warnings.push(`Failed to read Monday XLSX at ${mondayXlsxPath}: ${String(e?.message || e)}`);
  }

  // A little sanity proof of tokenizer behavior (helps debugging match quality).
  summary.sanity = {
    exampleNormalizations: [
      {
        raw: "Dyersville- Nichols Home Improvement Center",
        normalized: normalizeAccountName("Dyersville- Nichols Home Improvement Center"),
        normalizedNoPrefix: normalizeAccountNameWithoutLocationPrefix("Dyersville- Nichols Home Improvement Center"),
        tokens: buildAccountTokens("Dyersville- Nichols Home Improvement Center")
      }
    ]
  };

  const outJsonPath = path.join(debugDir, "sales-attribution-input-summary.json");
  const outTxtPath = path.join(debugDir, "sales-attribution-input-summary.txt");

  await fs.writeFile(outJsonPath, JSON.stringify(summary, null, 2));

  const txt = [
    "Sales Attribution Input Summary",
    `Generated: ${summary.generatedAt}`,
    "",
    "Inputs:",
    `- Moraware CSV: ${morawareCsvPath}`,
    `- Monday XLSX: ${mondayXlsxPath}`,
    "",
    "Moraware report:",
    `- Rows: ${summary.moraware?.rowCount ?? 0}`,
    `- Date bounds: ${summary.moraware?.dateBounds ? `${summary.moraware.dateBounds.min} → ${summary.moraware.dateBounds.max}` : "(unknown)"}`,
    `- Total Sq.Ft.: ${summary.moraware?.totalSqft ?? "(unknown)"}`,
    `- Missing Sq.Ft. rows: ${summary.moraware?.sqftMissingCount ?? "(unknown)"}`,
    `- Unique accounts (normalized): ${summary.moraware?.uniqueAccountCount ?? "(unknown)"}`,
    `- Detected columns: ${JSON.stringify(summary.moraware?.detectedColumns ?? {}, null, 0)}`,
    "",
    "Top Moraware Job Salespeople:",
    ...(summary.moraware?.topJobSalespeople ?? []).map((r) => `- ${r.key}: ${r.count}`),
    "",
    "Monday master:",
    `- Rows: ${summary.monday?.rowCount ?? 0}`,
    `- Unique accounts (normalized): ${summary.monday?.uniqueAccountCount ?? "(unknown)"}`,
    `- Detected columns: ${JSON.stringify(summary.monday?.detectedColumns ?? {}, null, 0)}`,
    "",
    "Top Monday Sales Executive values:",
    ...(summary.monday?.topSalesExecutiveCounts ?? []).map((r) => `- ${r.key}: ${r.count}`),
    "",
    "Warnings:",
    ...(summary.warnings.length ? summary.warnings.map((w) => `- ${w}`) : ["- (none)"]),
    ""
  ].join("\n");

  await fs.writeFile(outTxtPath, txt);

  console.log(txt);
  console.log(`Wrote ${outJsonPath}`);
  console.log(`Wrote ${outTxtPath}`);
}

main().catch((e) => {
  console.error("analyzeSalesAccountAttributionInputs failed:", e);
  process.exitCode = 1;
});

