import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import xlsx from "xlsx";

import {
  normalizeAccountName,
  normalizeAccountNameWithoutLocationPrefix
} from "../sales/salesAccountNameNormalizer.js";

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

function readXlsxAsTable(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
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

  return { headerRow, objects, headerRowIndex: bestIdx };
}

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

async function safeSelectProbe(supabase, table) {
  try {
    const { error } = await supabase.from(table).select("*").limit(1);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    if (isMissingRelationError(e)) return { ok: false, missing: true, error: String(e?.message || e) };
    return { ok: false, missing: false, error: String(e?.message || e) };
  }
}

async function main() {
  const repoRoot = repoRootFromHere();
  const debugDir = path.join(repoRoot, "debug/sales/latest");
  await fs.mkdir(debugDir, { recursive: true });

  const morawareCsvPath =
    process.env.SALES_MORAWARE_REPORT_CSV || "/Users/chris.henely/Downloads/Report (2).csv";
  const mondayXlsxPath =
    process.env.SALES_MONDAY_ACCOUNT_MASTER_XLSX || "/Users/chris.henely/Downloads/Account_Master_List_1778500823.xlsx";
  const suggestionsJsonPath =
    process.env.SALES_ACCOUNT_CROSSWALK_SUGGESTIONS_JSON ||
    path.join(repoRoot, "debug/sales/latest/sales-account-crosswalk-suggestions.json");

  const writeEnabled = String(process.env.SALES_ATTRIBUTION_IMPORT_WRITE ?? "").trim() === "1";
  const overwriteApproved = String(process.env.SALES_ATTRIBUTION_OVERWRITE_APPROVED ?? "").trim() === "1";

  const report = {
    generatedAt: new Date().toISOString(),
    mode: writeEnabled ? "write" : "dry-run",
    inputs: {
      morawareCsvPath,
      mondayXlsxPath,
      suggestionsJsonPath
    },
    env: {
      writeEnabled,
      overwriteApproved
    },
    probes: {},
    counts: {
      mondayMasterRows: 0,
      mondayWouldUpsertMaster: 0,
      morawareWouldInsertAuditRows: 0,
      suggestionsWouldInsertAliases: 0,
      suggestionsWouldSkipApprovedAliases: 0,
      errors: 0
    },
    warnings: []
  };

  const hasEnv = String(process.env.SUPABASE_URL ?? "").trim() && String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (writeEnabled && !hasEnv) {
    throw new Error("Write mode requested but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing.");
  }

  // Parse Monday master (for potential upsert).
  const wb = xlsx.readFile(mondayXlsxPath, { cellDates: false });
  const sheetName = wb.SheetNames[0];
  const table = readXlsxAsTable(wb, sheetName);
  const mondayRows = table.objects;
  report.counts.mondayMasterRows = mondayRows.length;

  const headers = table.headerRow;
  const nameCol = pickColumn(headers, ["account\\s*name", "^name$"]);
  const execCol = pickColumn(headers, ["sales\\s*executive", "sales\\s*exec", "owner", "rep"]);
  const branchCol = pickColumn(headers, ["branch", "location", "site"]);
  const statusCol = pickColumn(headers, ["status"]);
  const typeCol = pickColumn(headers, ["account\\s*type", "type", "category"]);
  const idCol = pickColumn(headers, ["item\\s*id", "monday\\s*id", "board.*id"]);

  if (!nameCol) throw new Error("Monday master: missing account name column (detection failed).");

  const masterUpserts = [];
  for (const r of mondayRows) {
    const rawName = normalizeSpaces(r[nameCol.header]);
    if (!rawName) continue;
    const rec = {
      source: "monday",
      source_account_id: idCol ? normalizeSpaces(r[idCol.header]) || null : null,
      monday_account_name: rawName,
      normalized_account_name: normalizeAccountName(rawName),
      sales_executive: execCol ? normalizeSpaces(r[execCol.header]) || null : null,
      branch: branchCol ? normalizeSpaces(r[branchCol.header]) || null : null,
      account_status: statusCol ? normalizeSpaces(r[statusCol.header]) || null : null,
      account_type: typeCol ? normalizeSpaces(r[typeCol.header]) || null : null,
      raw_json: r
    };
    masterUpserts.push(rec);
  }

  report.counts.mondayWouldUpsertMaster = masterUpserts.length;

  // Parse Moraware report for audit insert.
  const csvText = await fs.readFile(morawareCsvPath, "utf8");
  const parsed = parseCsv(csvText);
  const csvHeaders = (parsed[0] || []).map((h) => normalizeSpaces(h));
  const dataRows = parsed.slice(1);

  const jobCol = pickColumn(csvHeaders, ["job\\s*name"]);
  const acctCol = pickColumn(csvHeaders, ["account\\s*name"]);
  const jobSpCol = pickColumn(csvHeaders, ["job\\s*salesperson", "salesperson"]);
  const acctSpCol = pickColumn(csvHeaders, ["account\\s*salesperson"]);
  const dateCol = pickColumn(csvHeaders, ["job\\s*creation\\s*date", "\\bcreation\\s*date\\b", "\\bdate\\b"]);
  const colorCol = pickColumn(csvHeaders, ["worksheet.*color", "color", "material"]);
  const sqftCol = pickColumn(csvHeaders, ["sq\\s*\\.?\\s*ft", "sqft"]);

  if (!acctCol || !sqftCol) throw new Error("Moraware CSV: missing account/sqft column detection.");

  const morawareAuditRows = dataRows
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => {
      const obj = {};
      for (let i = 0; i < csvHeaders.length; i++) obj[csvHeaders[i]] = normalizeSpaces(r[i] ?? "");
      const acct = String(obj[acctCol.header] ?? "").trim();
      const creation = dateCol ? normalizeSpaces(obj[dateCol.header]) : "";
      const ymd = creation ? creation : "";
      return {
        source_file: path.basename(morawareCsvPath),
        job_name: jobCol ? normalizeSpaces(obj[jobCol.header]) : null,
        moraware_account_name: acct || null,
        normalized_moraware_account_name: acct ? normalizeAccountNameWithoutLocationPrefix(acct) : null,
        moraware_job_salesperson: jobSpCol ? normalizeSpaces(obj[jobSpCol.header]) || null : null,
        account_salesperson: acctSpCol ? normalizeSpaces(obj[acctSpCol.header]) || null : null,
        job_creation_date: ymd ? ymd : null,
        worksheet_color: colorCol ? normalizeSpaces(obj[colorCol.header]) || null : null,
        sqft: parseNumberOrZero(obj[sqftCol.header]),
        raw_json: obj
      };
    });

  report.counts.morawareWouldInsertAuditRows = morawareAuditRows.length;

  // Load suggestions JSON (produced by buildSalesAccountCrosswalkSuggestions).
  let suggestionsPayload = null;
  try {
    const raw = await fs.readFile(suggestionsJsonPath, "utf8");
    suggestionsPayload = JSON.parse(raw);
  } catch (e) {
    report.warnings.push(
      `Could not read suggestions JSON at ${suggestionsJsonPath}. Run buildSalesAccountCrosswalkSuggestions first. (${String(e?.message || e)})`
    );
  }

  const aliasInserts = [];
  if (suggestionsPayload?.suggestions?.length) {
    for (const s of suggestionsPayload.suggestions) {
      aliasInserts.push({
        moraware_account_name: s.moraware_account_name,
        normalized_moraware_name: s.normalized_moraware_name_no_prefix || s.normalized_moraware_name,
        monday_account_name: s.best_monday_account_name,
        normalized_monday_name: s.best_monday_normalized_name,
        assigned_salesperson: s.monday_sales_executive || null,
        branch: s.monday_branch || null,
        match_type: s.match_type,
        confidence: s.confidence,
        approved: Boolean(s.approved) && s.match_type !== "fuzzy_suggested",
        notes: "Imported suggestion (review before approving).",
        raw_suggestion: s
      });
    }
  }

  report.counts.suggestionsWouldInsertAliases = aliasInserts.length;

  // Dry run output regardless of write mode.
  const outJsonPath = path.join(debugDir, writeEnabled ? "sales-attribution-import-write.json" : "sales-attribution-import-dry-run.json");
  const outTxtPath = path.join(debugDir, writeEnabled ? "sales-attribution-import-write.txt" : "sales-attribution-import-dry-run.txt");

  if (!writeEnabled) {
    const txt = [
      "Sales Attribution Import (DRY RUN)",
      `Generated: ${report.generatedAt}`,
      "",
      "Would process:",
      `- Monday master rows: ${report.counts.mondayMasterRows} (upserts prepared: ${report.counts.mondayWouldUpsertMaster})`,
      `- Moraware audit rows: ${report.counts.morawareWouldInsertAuditRows}`,
      `- Alias suggestion rows: ${report.counts.suggestionsWouldInsertAliases}`,
      "",
      "Write mode:",
      "- Disabled (set SALES_ATTRIBUTION_IMPORT_WRITE=1 to enable writes)",
      "",
      "Safety notes:",
      "- Suggestions remain unapproved unless exact-ish auto-approved by suggestion builder.",
      "- Approved aliases/assignments must never be overwritten unless SALES_ATTRIBUTION_OVERWRITE_APPROVED=1.",
      "",
      ...(report.warnings.length ? ["Warnings:", ...report.warnings.map((w) => `- ${w}`), ""] : [])
    ].join("\n");
    await fs.writeFile(outJsonPath, JSON.stringify(report, null, 2));
    await fs.writeFile(outTxtPath, txt);
    console.log(txt);
    console.log(`Wrote ${outJsonPath}`);
    console.log(`Wrote ${outTxtPath}`);
    return;
  }

  // ---- Write mode (explicit) ----
  const supabase = supabaseServerClient();

  // Probe table existence first.
  const probeMaster = await safeSelectProbe(supabase, "sales_account_master");
  const probeAliases = await safeSelectProbe(supabase, "sales_account_aliases");
  const probeAudit = await safeSelectProbe(supabase, "sales_moraware_report_audit");
  report.probes = { sales_account_master: probeMaster, sales_account_aliases: probeAliases, sales_moraware_report_audit: probeAudit };

  if (!probeMaster.ok || !probeAliases.ok || !probeAudit.ok) {
    report.warnings.push("One or more required attribution tables are missing. Apply backend-core/supabase/sales_account_attribution.sql first.");
    await fs.writeFile(outJsonPath, JSON.stringify(report, null, 2));
    await fs.writeFile(outTxtPath, `Write mode aborted due to missing tables.\n\n${JSON.stringify(report.probes, null, 2)}\n`);
    console.log(`Wrote ${outJsonPath}`);
    console.log(`Wrote ${outTxtPath}`);
    return;
  }

  // Upsert master accounts.
  // If source_account_id is available, use that for idempotency; otherwise fall back to (source, normalized_account_name, monday_account_name).
  // NOTE: Supabase upsert requires an explicit onConflict column list. We'll do two passes: with id then without.
  const withId = masterUpserts.filter((r) => r.source_account_id);
  const withoutId = masterUpserts.filter((r) => !r.source_account_id);

  if (withId.length) {
    const { error } = await supabase.from("sales_account_master").upsert(withId, { onConflict: "source,source_account_id" });
    if (error) throw error;
  }

  if (withoutId.length) {
    // Best-effort: insert; if duplicates exist, they'll error (manual cleanup needed).
    // We intentionally avoid clever overwrites without stable IDs.
    const { error } = await supabase.from("sales_account_master").insert(withoutId);
    if (error) report.warnings.push(`Insert sales_account_master (rows without source_account_id) had error: ${String(error.message || error)}`);
  }

  // Insert Moraware audit rows (append-only).
  // Idempotency: since we don't have a stable unique key for report rows, we only insert when explicitly allowed.
  // This table is audit/append; duplicates are acceptable but not ideal. Keep small for now.
  const { error: auditErr } = await supabase.from("sales_moraware_report_audit").insert(morawareAuditRows);
  if (auditErr) report.warnings.push(`Insert sales_moraware_report_audit error: ${String(auditErr.message || auditErr)}`);

  // Insert alias suggestions.
  // If overwriteApproved not enabled, skip insertion of any row that is marked approved=true AND an approved alias already exists for that normalized_moraware_name.
  let existingApproved = new Set();
  if (!overwriteApproved) {
    const { data, error } = await supabase
      .from("sales_account_aliases")
      .select("normalized_moraware_name")
      .eq("approved", true);
    if (error) report.warnings.push(`Select existing approved aliases failed: ${String(error.message || error)}`);
    else {
      existingApproved = new Set((data ?? []).map((r) => String(r.normalized_moraware_name ?? "")).filter(Boolean));
    }
  }

  const aliasToInsert = [];
  for (const r of aliasInserts) {
    if (r.approved && existingApproved.has(String(r.normalized_moraware_name ?? ""))) {
      report.counts.suggestionsWouldSkipApprovedAliases += 1;
      continue;
    }
    // Always insert as unapproved unless explicitly approved in suggestion.
    aliasToInsert.push(r);
  }

  if (aliasToInsert.length) {
    const { error } = await supabase.from("sales_account_aliases").insert(aliasToInsert);
    if (error) report.warnings.push(`Insert sales_account_aliases error: ${String(error.message || error)}`);
  }

  await fs.writeFile(outJsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(outTxtPath, `Write mode completed (see JSON for counts/warnings).\n`);
  console.log(`Wrote ${outJsonPath}`);
  console.log(`Wrote ${outTxtPath}`);
}

main().catch((e) => {
  console.error("importSalesAttributionData failed:", e);
  process.exitCode = 1;
});

