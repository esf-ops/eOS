import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import xlsx from "xlsx";

import {
  buildAccountTokens,
  normalizeAccountName,
  normalizeAccountNameWithoutLocationPrefix,
  scoreAccountNameSimilarity
} from "../sales/salesAccountNameNormalizer.js";
import {
  SALES_ACCOUNT_MANUAL_RULES,
  SALES_ACCOUNT_MANUAL_RULES_VERSION
} from "../sales/salesAccountManualRules.js";

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

function addToMapSet(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function applyManualRules(morawareAccountName, mondayByNorm) {
  const out = [];
  const raw = String(morawareAccountName ?? "");
  const rawLower = raw.toLowerCase();
  for (const rule of SALES_ACCOUNT_MANUAL_RULES) {
    if (rule.type === "exact") {
      if (normalizeSpaces(raw) !== normalizeSpaces(rule.match)) continue;
    } else if (rule.type === "substring") {
      if (!rawLower.includes(String(rule.match).toLowerCase())) continue;
    } else {
      continue;
    }

    const suggestedMonday = rule.suggestion?.mondayAccountName
      ? mondayByNorm.get(normalizeAccountName(rule.suggestion.mondayAccountName)) || null
      : null;

    out.push({
      ruleId: rule.id,
      ruleApprovedByDefault: Boolean(rule.approvedByRule),
      suggestion: rule.suggestion,
      suggestedMondayFoundInMaster: Boolean(suggestedMonday),
      suggestedMondayAccountName: suggestedMonday?.rawName || null
    });
  }
  return out;
}

function computeMatchDecision({
  morawareRaw,
  morawareNorm,
  morawareNormNoPrefix,
  mondayMatchesExact,
  mondayMatchesNoPrefix,
  bestFuzzy
}) {
  // Auto-approvable only when unambiguous exact-ish match and Monday normalized name isn't duplicated.
  if (mondayMatchesExact.length === 1 && mondayMatchesExact[0].normIsUnique) {
    return { matchType: "exact", confidence: "high", approved: true, chosen: mondayMatchesExact[0], rationale: "Exact normalized match." };
  }
  if (mondayMatchesNoPrefix.length === 1 && mondayMatchesNoPrefix[0].normNoPrefixIsUnique) {
    return {
      matchType: "prefix_stripped_exact",
      confidence: "high",
      approved: true,
      chosen: mondayMatchesNoPrefix[0],
      rationale: "Exact match after stripping location prefix."
    };
  }

  if (mondayMatchesExact.length > 1) {
    return {
      matchType: "normalized_exact",
      confidence: "medium",
      approved: false,
      chosen: mondayMatchesExact[0],
      rationale: `Ambiguous: ${mondayMatchesExact.length} Monday accounts share the same normalized name.`
    };
  }
  if (mondayMatchesNoPrefix.length > 1) {
    return {
      matchType: "prefix_stripped_exact",
      confidence: "medium",
      approved: false,
      chosen: mondayMatchesNoPrefix[0],
      rationale: `Ambiguous after prefix stripping: ${mondayMatchesNoPrefix.length} Monday candidates.`
    };
  }

  if (bestFuzzy && bestFuzzy.score >= 0.7) {
    return {
      matchType: "fuzzy_suggested",
      confidence: bestFuzzy.score >= 0.82 ? "medium" : "low",
      approved: false,
      chosen: bestFuzzy,
      rationale: `Fuzzy suggestion score=${bestFuzzy.score.toFixed(3)} (NOT auto-approved).`
    };
  }

  return { matchType: "no_match", confidence: "none", approved: false, chosen: null, rationale: "No confident match." };
}

async function main() {
  const repoRoot = repoRootFromHere();
  const debugDir = path.join(repoRoot, "debug/sales/latest");
  await fs.mkdir(debugDir, { recursive: true });

  const morawareCsvPath =
    process.env.SALES_MORAWARE_REPORT_CSV || "/Users/chris.henely/Downloads/Report (2).csv";
  const mondayXlsxPath =
    process.env.SALES_MONDAY_ACCOUNT_MASTER_XLSX || "/Users/chris.henely/Downloads/Account_Master_List_1778500823.xlsx";

  const csvText = await fs.readFile(morawareCsvPath, "utf8");
  const parsed = parseCsv(csvText);
  const headers = (parsed[0] || []).map((h) => normalizeSpaces(h));
  const dataRows = parsed.slice(1);

  const accountCol = pickColumn(headers, ["account\\s*name"]);
  const sqftCol = pickColumn(headers, ["sq\\s*\\.?\\s*ft", "sqft", "square\\s*feet"]);
  const jobCol = pickColumn(headers, ["job\\s*name"]);
  const jobSpCol = pickColumn(headers, ["job\\s*salesperson", "salesperson"]);
  const dateCol = pickColumn(headers, ["job\\s*creation\\s*date", "\\bcreation\\s*date\\b", "\\bdate\\b"]);

  if (!accountCol) throw new Error("Moraware CSV: missing Account Name column (detection failed).");
  if (!sqftCol) throw new Error("Moraware CSV: missing Sq.Ft. column (detection failed).");

  const morawareRows = dataRows
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => {
      const obj = {};
      for (let i = 0; i < headers.length; i++) obj[headers[i]] = normalizeSpaces(r[i] ?? "");
      return obj;
    });

  // Group report by Moraware account.
  const byAccount = new Map();
  for (const r of morawareRows) {
    const acct = String(r[accountCol.header] ?? "").trim() || "(blank)";
    const key = acct;
    if (!byAccount.has(key)) {
      byAccount.set(key, {
        morawareAccountName: acct,
        reportTotalSqft: 0,
        reportJobCount: 0,
        morawareJobSalespeople: new Map(),
        exampleJobs: [],
        dateMin: null,
        dateMax: null
      });
    }
    const g = byAccount.get(key);
    const sqft = parseNumberOrZero(r[sqftCol.header]);
    g.reportTotalSqft += sqft;
    g.reportJobCount += 1;
    if (jobSpCol) {
      const sp = String(r[jobSpCol.header] ?? "").trim() || "(blank)";
      g.morawareJobSalespeople.set(sp, (g.morawareJobSalespeople.get(sp) || 0) + 1);
    }
    if (jobCol && g.exampleJobs.length < 3) g.exampleJobs.push(String(r[jobCol.header] ?? ""));
    if (dateCol) {
      const d = parseUsDateToYmd(r[dateCol.header] ?? "");
      if (d) {
        if (!g.dateMin || d < g.dateMin) g.dateMin = d;
        if (!g.dateMax || d > g.dateMax) g.dateMax = d;
      }
    }
  }

  // Read Monday master.
  const wb = xlsx.readFile(mondayXlsxPath, { cellDates: false });
  const sheetName = wb.SheetNames[0];
  const table = readXlsxAsTable(wb, sheetName);
  const mondayRows = table.objects;
  const mondayHeaders = table.headerRow;

  const mondayNameCol = pickColumn(mondayHeaders, ["account\\s*name", "^name$"]);
  const mondayExecCol = pickColumn(mondayHeaders, ["sales\\s*executive", "sales\\s*exec", "owner", "rep"]);
  const mondayBranchCol = pickColumn(mondayHeaders, ["branch", "location", "site"]);
  const mondayStatusCol = pickColumn(mondayHeaders, ["status"]);
  const mondayTypeCol = pickColumn(mondayHeaders, ["account\\s*type", "type", "category"]);

  if (!mondayNameCol) throw new Error("Monday master: missing account name column (detection failed).");

  // Build Monday index.
  const mondayAccounts = [];
  const mondayByNorm = new Map();
  const mondayByNormNoPrefix = new Map();
  const mondayNormCollisions = new Map(); // norm -> set(rawName)
  const mondayNormNoPrefixCollisions = new Map();

  for (const r of mondayRows) {
    const rawName = normalizeSpaces(r[mondayNameCol.header]);
    if (!rawName) continue;
    const norm = normalizeAccountName(rawName);
    const normNoPrefix = normalizeAccountNameWithoutLocationPrefix(rawName);
    const exec = mondayExecCol ? normalizeSpaces(r[mondayExecCol.header]) : "";
    const branch = mondayBranchCol ? normalizeSpaces(r[mondayBranchCol.header]) : "";
    const status = mondayStatusCol ? normalizeSpaces(r[mondayStatusCol.header]) : "";
    const acctType = mondayTypeCol ? normalizeSpaces(r[mondayTypeCol.header]) : "";

    const rec = {
      rawName,
      norm,
      normNoPrefix,
      tokens: buildAccountTokens(rawName),
      salesExecutive: exec,
      branch,
      status,
      accountType: acctType
    };
    mondayAccounts.push(rec);
    if (norm) mondayByNorm.set(norm, rec);
    if (normNoPrefix) mondayByNormNoPrefix.set(normNoPrefix, rec);
    if (norm) addToMapSet(mondayNormCollisions, norm, rawName);
    if (normNoPrefix) addToMapSet(mondayNormNoPrefixCollisions, normNoPrefix, rawName);
  }

  const mondayNormUnique = new Set([...mondayNormCollisions.entries()].filter(([, s]) => s.size === 1).map(([k]) => k));
  const mondayNormNoPrefixUnique = new Set(
    [...mondayNormNoPrefixCollisions.entries()].filter(([, s]) => s.size === 1).map(([k]) => k)
  );

  const suggestions = [];
  let reportTotalSqft = 0;
  for (const g of byAccount.values()) reportTotalSqft += g.reportTotalSqft;

  // Generate suggestions per Moraware account (rank by fuzzy if no exact-ish).
  for (const g of [...byAccount.values()].sort((a, b) => b.reportTotalSqft - a.reportTotalSqft)) {
    const morawareAccountName = g.morawareAccountName;
    const morawareNorm = normalizeAccountName(morawareAccountName);
    const morawareNormNoPrefix = normalizeAccountNameWithoutLocationPrefix(morawareAccountName);

    const mondayMatchesExact = [];
    if (morawareNorm && mondayNormCollisions.has(morawareNorm)) {
      for (const rawName of mondayNormCollisions.get(morawareNorm).values()) {
        const rec = mondayByNorm.get(normalizeAccountName(rawName));
        if (rec) {
          mondayMatchesExact.push({
            ...rec,
            normIsUnique: mondayNormUnique.has(rec.norm)
          });
        }
      }
    }

    const mondayMatchesNoPrefix = [];
    if (morawareNormNoPrefix && mondayNormNoPrefixCollisions.has(morawareNormNoPrefix)) {
      for (const rawName of mondayNormNoPrefixCollisions.get(morawareNormNoPrefix).values()) {
        const rec = mondayByNormNoPrefix.get(normalizeAccountNameWithoutLocationPrefix(rawName));
        if (rec) {
          mondayMatchesNoPrefix.push({
            ...rec,
            normNoPrefixIsUnique: mondayNormNoPrefixUnique.has(rec.normNoPrefix)
          });
        }
      }
    }

    // Fuzzy rank (tokens only).
    let bestFuzzy = null;
    const scored = mondayAccounts
      .map((m) => ({
        ...m,
        score: scoreAccountNameSimilarity(morawareAccountName, m.rawName)
      }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length) bestFuzzy = scored[0];

    const alternateMatches = scored.slice(0, 3).map((m) => ({
      mondayAccountName: m.rawName,
      mondaySalesExecutive: m.salesExecutive || null,
      mondayBranch: m.branch || null,
      score: Math.round(m.score * 1000) / 1000
    }));

    const manualHits = applyManualRules(morawareAccountName, mondayByNorm);
    const anyManual = manualHits.length > 0;

    const decision = computeMatchDecision({
      morawareRaw: morawareAccountName,
      morawareNorm,
      morawareNormNoPrefix,
      mondayMatchesExact,
      mondayMatchesNoPrefix,
      bestFuzzy
    });

    // If a manual rule fires and we didn't already get a high-confidence exact-ish match,
    // label it as alias_rule but keep unapproved by default.
    let matchType = decision.matchType;
    let confidence = decision.confidence;
    let approved = decision.approved;
    let chosen = decision.chosen;
    let rationale = decision.rationale;
    let ruleAppliedButMasterMissing = false;

    if (anyManual && !approved) {
      // If manual rule includes a mondayAccountName, try to pick that for display.
      const withMonday = manualHits.find((h) => h.suggestion?.mondayAccountName);
      if (withMonday) {
        const normKey = normalizeAccountName(withMonday.suggestion.mondayAccountName);
        const rec = mondayByNorm.get(normKey) || null;
        if (rec) {
          chosen = rec;
          matchType = "alias_rule";
          confidence = "medium";
          approved = Boolean(withMonday.ruleApprovedByDefault);
          rationale = `Manual seed rule ${withMonday.ruleId}. ${withMonday.suggestion?.mondayAccountName ? "Targets Monday account by name." : ""}`;
        } else {
          matchType = "alias_rule";
          confidence = "low";
          approved = false;
          ruleAppliedButMasterMissing = true;
          rationale = `Manual seed rule ${withMonday.ruleId} references Monday account that was not found in master list.`;
        }
      } else {
        matchType = "alias_rule";
        confidence = "low";
        approved = false;
        rationale = `Manual seed rule(s) matched (${manualHits.map((h) => h.ruleId).join(", ")}), but no explicit Monday account name was provided.`;
      }
    }

    const jobSalespeopleObserved = [...g.morawareJobSalespeople.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => `${name} (${count})`);

    suggestions.push({
      moraware_account_name: morawareAccountName,
      normalized_moraware_name: morawareNorm,
      normalized_moraware_name_no_prefix: morawareNormNoPrefix,
      report_total_sqft: Math.round(g.reportTotalSqft * 100) / 100,
      report_job_count: g.reportJobCount,
      moraware_job_salespeople_observed: jobSalespeopleObserved.join("; "),
      best_monday_account_name: chosen ? chosen.rawName : null,
      best_monday_normalized_name: chosen ? chosen.norm : null,
      monday_sales_executive: chosen ? chosen.salesExecutive || null : null,
      monday_branch: chosen ? chosen.branch || null : null,
      monday_status: chosen ? chosen.status || null : null,
      monday_account_type: chosen ? chosen.accountType || null : null,
      match_type: matchType,
      confidence,
      approved,
      rationale,
      rule_applied_but_master_missing: ruleAppliedButMasterMissing,
      alternate_matches: alternateMatches,
      manual_rule_hits: manualHits,
      report_date_bounds_for_account: g.dateMin && g.dateMax ? `${g.dateMin}→${g.dateMax}` : null,
      examples: g.exampleJobs
    });
  }

  // Totals for TXT.
  const totals = {
    reportTotalSqft,
    matchedHighSqft: 0,
    matchedAnySqft: 0,
    approvedSqft: 0,
    unmatchedSqft: 0
  };

  for (const s of suggestions) {
    const sqft = Number(s.report_total_sqft || 0);
    if (s.match_type !== "no_match") totals.matchedAnySqft += sqft;
    if (s.confidence === "high") totals.matchedHighSqft += sqft;
    if (s.approved) totals.approvedSqft += sqft;
    if (s.match_type === "no_match") totals.unmatchedSqft += sqft;
  }

  const unmatchedTop = suggestions
    .filter((s) => s.match_type === "no_match")
    .slice()
    .sort((a, b) => Number(b.report_total_sqft) - Number(a.report_total_sqft))
    .slice(0, 25);

  const fuzzyTop = suggestions
    .filter((s) => s.match_type === "fuzzy_suggested")
    .slice()
    .sort((a, b) => Number(b.report_total_sqft) - Number(a.report_total_sqft))
    .slice(0, 25);

  const exactTop = suggestions
    .filter((s) => s.confidence === "high" && s.best_monday_account_name)
    .slice()
    .sort((a, b) => Number(b.report_total_sqft) - Number(a.report_total_sqft))
    .slice(0, 25);

  // Attribution totals by Monday Sales Executive (proposed).
  const byExec = new Map();
  for (const s of suggestions) {
    const exec = s.monday_sales_executive || "(unassigned in master)";
    const sqft = Number(s.report_total_sqft || 0);
    byExec.set(exec, (byExec.get(exec) || 0) + sqft);
  }
  const execRows = [...byExec.entries()].sort((a, b) => b[1] - a[1]);

  const outJsonPath = path.join(debugDir, "sales-account-crosswalk-suggestions.json");
  const outTxtPath = path.join(debugDir, "sales-account-crosswalk-suggestions.txt");
  const outCsvPath = path.join(debugDir, "sales-account-crosswalk-suggestions.csv");

  const payload = {
    generatedAt: new Date().toISOString(),
    inputs: { morawareCsvPath, mondayXlsxPath },
    manualRulesVersion: SALES_ACCOUNT_MANUAL_RULES_VERSION,
    reportTotals: totals,
    suggestionCount: suggestions.length,
    suggestions
  };

  await fs.writeFile(outJsonPath, JSON.stringify(payload, null, 2));

  const txt = [
    "Sales Account Crosswalk Suggestions (PROPOSED — not final until approved)",
    `Generated: ${payload.generatedAt}`,
    "",
    "Inputs:",
    `- Moraware CSV: ${morawareCsvPath}`,
    `- Monday XLSX: ${mondayXlsxPath}`,
    "",
    "Totals:",
    `- Moraware report total Sq.Ft.: ${Math.round(totals.reportTotalSqft * 100) / 100}`,
    `- Approved (auto) Sq.Ft.: ${Math.round(totals.approvedSqft * 100) / 100}`,
    `- Matched (any) Sq.Ft.: ${Math.round(totals.matchedAnySqft * 100) / 100}`,
    `- Unmatched Sq.Ft.: ${Math.round(totals.unmatchedSqft * 100) / 100}`,
    "",
    "Top 25 exact/high-confidence matches by Sq.Ft.:",
    ...exactTop.map(
      (s) =>
        `- ${s.moraware_account_name} => ${s.best_monday_account_name} (${s.monday_sales_executive || "—"}) : ${s.report_total_sqft} sf (${s.match_type})`
    ),
    "",
    "Top 25 unmatched accounts by Sq.Ft.:",
    ...unmatchedTop.map((s) => `- ${s.moraware_account_name}: ${s.report_total_sqft} sf`),
    "",
    "Top 25 fuzzy suggestions needing approval by Sq.Ft.:",
    ...fuzzyTop.map(
      (s) =>
        `- ${s.moraware_account_name}: ${s.report_total_sqft} sf -> ${s.best_monday_account_name || "—"} (${s.monday_sales_executive || "—"}) :: ${s.rationale}`
    ),
    "",
    "Proposed attribution totals by Monday Sales Executive (Sq.Ft.):",
    ...execRows.slice(0, 30).map(([k, v]) => `- ${k}: ${Math.round(v * 100) / 100}`),
    "",
    "Warnings:",
    "- These are suggestions. Only exact-ish unambiguous matches are auto-approved.",
    "- Fuzzy and manual seed rules remain unapproved by default.",
    ""
  ].join("\n");

  await fs.writeFile(outTxtPath, txt);

  const csvRows = suggestions.map((s) => ({
    moraware_account_name: s.moraware_account_name,
    normalized_moraware_name: s.normalized_moraware_name,
    report_total_sqft: s.report_total_sqft,
    report_job_count: s.report_job_count,
    moraware_job_salespeople_observed: s.moraware_job_salespeople_observed,
    best_monday_account_name: s.best_monday_account_name,
    monday_sales_executive: s.monday_sales_executive,
    monday_branch: s.monday_branch,
    match_type: s.match_type,
    confidence: s.confidence,
    approved: s.approved,
    rationale: s.rationale
  }));

  const csvHeaders = [
    "moraware_account_name",
    "normalized_moraware_name",
    "report_total_sqft",
    "report_job_count",
    "moraware_job_salespeople_observed",
    "best_monday_account_name",
    "monday_sales_executive",
    "monday_branch",
    "match_type",
    "confidence",
    "approved",
    "rationale"
  ];

  await fs.writeFile(outCsvPath, toCsv(csvRows, csvHeaders));

  console.log(txt);
  console.log(`Wrote ${outJsonPath}`);
  console.log(`Wrote ${outTxtPath}`);
  console.log(`Wrote ${outCsvPath}`);
}

main().catch((e) => {
  console.error("buildSalesAccountCrosswalkSuggestions failed:", e);
  process.exitCode = 1;
});

