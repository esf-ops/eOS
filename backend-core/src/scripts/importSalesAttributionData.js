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

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
      // dry-run intent
      wouldInsertOrUpsertMaster: 0,
      wouldInsertAuditRows: 0,
      wouldInsertAliases: 0,
      wouldUpdateAliases: 0,
      wouldSkipApprovedAliases: 0,
      wouldSkipDuplicateAliases: 0,
      // write-mode actuals
      masterInsertedOrUpserted: 0,
      morawareAuditInserted: 0,
      aliasesInserted: 0,
      aliasesUpdated: 0,
      aliasesSkippedApproved: 0,
      aliasesSkippedDuplicate: 0,
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

  report.counts.wouldInsertOrUpsertMaster = masterUpserts.length;

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

  report.counts.wouldInsertAuditRows = morawareAuditRows.length;

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
        // Only exact-ish suggestions may carry approved=true; fuzzy/manual/no-match default false.
        approved: Boolean(s.approved) && s.match_type !== "fuzzy_suggested",
        notes: "Imported suggestion (review before approving).",
        raw_suggestion: s
      });
    }
  }

  report.counts.wouldInsertAliases = aliasInserts.length;

  // Dry run output regardless of write mode.
  const outJsonPath = path.join(debugDir, writeEnabled ? "sales-attribution-import-write.json" : "sales-attribution-import-dry-run.json");
  const outTxtPath = path.join(debugDir, writeEnabled ? "sales-attribution-import-write.txt" : "sales-attribution-import-dry-run.txt");

  if (!writeEnabled) {
    // Predict alias write decisions without touching Supabase.
    // We cannot know what would be skipped/updated without reading DB, so keep counts at 0 unless overwriteApproved is off and row is "approved".
    for (const r of aliasInserts) {
      if (r.approved && !overwriteApproved) report.counts.wouldSkipApprovedAliases += 1;
    }
    const txt = [
      "Sales Attribution Import (DRY RUN)",
      `Generated: ${report.generatedAt}`,
      "",
      "Would process:",
      `- Monday master rows: ${report.counts.mondayMasterRows} (prepared: ${report.counts.wouldInsertOrUpsertMaster})`,
      `- Moraware audit rows: ${report.counts.wouldInsertAuditRows}`,
      `- Alias suggestion rows: ${report.counts.wouldInsertAliases}`,
      "",
      "Dry-run alias expectations (DB not queried in dry-run):",
      `- wouldSkipApprovedAliases (if DB already has approved): ${report.counts.wouldSkipApprovedAliases}`,
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
    if (error) {
      report.counts.errors += 1;
      throw error;
    }
    report.counts.masterInsertedOrUpserted += withId.length;
  }

  if (withoutId.length) {
    // Best-effort: insert; if duplicates exist, they'll error (manual cleanup needed).
    // We intentionally avoid clever overwrites without stable IDs.
    const { error } = await supabase.from("sales_account_master").insert(withoutId);
    if (error) {
      report.counts.errors += 1;
      report.warnings.push(`Insert sales_account_master (rows without source_account_id) had error: ${String(error.message || error)}`);
    } else {
      report.counts.masterInsertedOrUpserted += withoutId.length;
    }
  }

  // Insert Moraware audit rows (append-only).
  // Idempotency: since we don't have a stable unique key for report rows, we only insert when explicitly allowed.
  // This table is audit/append; duplicates are acceptable but not ideal. Keep small for now.
  const { error: auditErr } = await supabase.from("sales_moraware_report_audit").insert(morawareAuditRows);
  if (auditErr) {
    report.counts.errors += 1;
    report.warnings.push(`Insert sales_moraware_report_audit error: ${String(auditErr.message || auditErr)}`);
  } else {
    report.counts.morawareAuditInserted = morawareAuditRows.length;
  }

  // ---- Alias suggestions (idempotent) ----
  // Policy:
  // - For each normalized_moraware_name, look for existing alias rows
  // - If an approved alias exists and overwriteApproved != 1: skip (do not insert or update)
  // - Else if an unapproved alias exists: update it (avoid duplicates)
  // - Else: insert

  // De-dupe by normalized key (keep first; if any row is approved, prefer approved suggestion).
  const byNormInput = new Map();
  for (const r of aliasInserts) {
    const norm = String(r.normalized_moraware_name ?? "").trim();
    if (!norm) continue;
    const prev = byNormInput.get(norm);
    if (!prev) {
      byNormInput.set(norm, r);
      continue;
    }
    if (prev.approved !== true && r.approved === true) {
      byNormInput.set(norm, r);
    }
  }

  const dedupedAliasInputs = [...byNormInput.values()];
  const normKeys = [...byNormInput.keys()];
  const inputDupesSkipped = Math.max(0, aliasInserts.length - dedupedAliasInputs.length);
  report.counts.wouldSkipDuplicateAliases += inputDupesSkipped;
  /** @type {Map<string, any[]>} */
  const existingByNorm = new Map();

  for (const batch of chunk(normKeys, 500)) {
    const { data, error } = await supabase
      .from("sales_account_aliases")
      .select("id,approved,normalized_moraware_name,moraware_account_name,monday_account_name,assigned_salesperson,branch,match_type,confidence,updated_at,created_at")
      .in("normalized_moraware_name", batch);
    if (error) {
      report.counts.errors += 1;
      report.warnings.push(`Select existing aliases failed: ${String(error.message || error)}`);
      continue;
    }
    for (const row of data ?? []) {
      const k = String(row.normalized_moraware_name ?? "").trim();
      if (!k) continue;
      if (!existingByNorm.has(k)) existingByNorm.set(k, []);
      existingByNorm.get(k).push(row);
    }
  }

  const inserts = [];
  const updates = [];

  for (const r of dedupedAliasInputs) {
    const norm = String(r.normalized_moraware_name ?? "").trim();
    if (!norm) continue;

    const existing = existingByNorm.get(norm) ?? [];
    const existingApproved = existing.find((x) => x.approved === true) ?? null;

    // Extra safety: for approved suggestions, confirm via direct query (avoids any edge case around IN filters).
    if (r.approved === true && !overwriteApproved && !existingApproved) {
      const { data, error } = await supabase
        .from("sales_account_aliases")
        .select("id,approved,normalized_moraware_name,monday_account_name,assigned_salesperson,branch,match_type,confidence")
        .eq("normalized_moraware_name", norm)
        .eq("approved", true)
        .limit(1);
      if (!error && data?.[0]) {
        existingByNorm.set(norm, [...existing, data[0]]);
      }
    }

    const existingApproved2 = (existingByNorm.get(norm) ?? existing).find((x) => x.approved === true) ?? null;

    if (existingApproved2 && !overwriteApproved) {
      report.counts.aliasesSkippedApproved += 1;
      report.warnings.push(
        `Skip approved alias (normalized_moraware_name=${norm}): moraware="${String(r.moraware_account_name ?? "")}" existing monday="${String(existingApproved2.monday_account_name ?? "")}" owner="${String(existingApproved2.assigned_salesperson ?? "")}" branch="${String(existingApproved2.branch ?? "")}"`
      );
      continue;
    }

    const existingUnapproved = existing
      .filter((x) => x.approved !== true)
      .sort((a, b) => String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")))[0];

    if (existingUnapproved) {
      updates.push({
        id: existingUnapproved.id,
        patch: {
          // Keep as unapproved unless explicitly approved and overwriteApproved enabled.
          monday_account_name: r.monday_account_name,
          normalized_monday_name: r.normalized_monday_name,
          assigned_salesperson: r.assigned_salesperson,
          branch: r.branch,
          match_type: r.match_type,
          confidence: r.confidence,
          approved: overwriteApproved ? Boolean(r.approved) : false,
          notes: r.notes,
          raw_suggestion: r.raw_suggestion,
          updated_at: new Date().toISOString()
        }
      });
      continue;
    }

    inserts.push(r);
  }

  // Execute updates individually (safer + clear counts).
  for (const u of updates) {
    const { error } = await supabase.from("sales_account_aliases").update(u.patch).eq("id", u.id);
    if (error) {
      report.counts.errors += 1;
      report.warnings.push(`Update sales_account_aliases id=${u.id} error: ${String(error.message || error)}`);
    } else {
      report.counts.aliasesUpdated += 1;
    }
  }

  // These are duplicates in the *input suggestions* (same normalized key), not DB conflicts.
  report.counts.aliasesSkippedDuplicate += inputDupesSkipped;

  if (inserts.length) {
    const { error } = await supabase.from("sales_account_aliases").insert(inserts);
    if (error) {
      const msg = String(error.message || error);
      // If any unexpected duplicate slipped through, count as skipped duplicate (not an error) when safe.
      if (msg.toLowerCase().includes("duplicate key") && msg.toLowerCase().includes("uq_sales_account_aliases_approved_norm_moraware")) {
        report.counts.aliasesSkippedDuplicate += 1;
        report.warnings.push(`Insert sales_account_aliases skipped duplicate approved alias constraint (unexpected): ${msg}`);
      } else {
        report.counts.errors += 1;
        report.warnings.push(`Insert sales_account_aliases error: ${msg}`);
      }
    } else {
      report.counts.aliasesInserted += inserts.length;
    }
  }

  await fs.writeFile(outJsonPath, JSON.stringify(report, null, 2));
  const txt = [
    "Sales Attribution Import (WRITE MODE)",
    `Generated: ${report.generatedAt}`,
    "",
    "Master:",
    `- prepared: ${report.counts.wouldInsertOrUpsertMaster}`,
    `- insertedOrUpserted: ${report.counts.masterInsertedOrUpserted}`,
    "",
    "Moraware audit:",
    `- prepared: ${report.counts.wouldInsertAuditRows}`,
    `- inserted: ${report.counts.morawareAuditInserted}`,
    "",
    "Aliases:",
    `- prepared: ${report.counts.wouldInsertAliases}`,
    `- inserted: ${report.counts.aliasesInserted}`,
    `- updated: ${report.counts.aliasesUpdated}`,
    `- skippedApproved: ${report.counts.aliasesSkippedApproved}`,
    `- skippedDuplicate: ${report.counts.aliasesSkippedDuplicate}`,
    "",
    `Errors: ${report.counts.errors}`,
    "",
    ...(report.warnings.length ? ["Warnings:", ...report.warnings.slice(0, 60).map((w) => `- ${w}`), report.warnings.length > 60 ? "- (more in JSON)" : "", ""] : [])
  ]
    .filter((x) => x !== "")
    .join("\n");
  await fs.writeFile(outTxtPath, txt + "\n");
  console.log(`Wrote ${outJsonPath}`);
  console.log(`Wrote ${outTxtPath}`);
}

main().catch((e) => {
  console.error("importSalesAttributionData failed:", e);
  process.exitCode = 1;
});

