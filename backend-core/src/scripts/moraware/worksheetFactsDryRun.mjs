#!/usr/bin/env node
/**
 * DRY-RUN ONLY — Moraware Job Worksheet prepared facts.
 *
 * Reads CURRENT_MORAWARE_JOB_SET, builds sales_moraware_job_worksheet_facts rows
 * in memory, reconciles controls, writes artifacts under /tmp.
 *
 * NEVER inserts/updates/deletes the prepared table.
 *
 * Usage:
 *   npm run eos:moraware:worksheet-facts:dry-run
 *   node backend-core/src/scripts/moraware/worksheetFactsDryRun.mjs
 *   node ... --organization-id=<uuid>
 */

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dryRunMorawareJobWorksheetPreparedFacts,
  WORKSHEET_FACTS_TABLE,
  WORKSHEET_FACTS_UPSERT_ON_CONFLICT
} from "../../moraware/morawareJobWorksheetPreparedFacts.mjs";

const OUT = "/tmp/eliteos-moraware-worksheet-facts-dry-run";

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
}

loadEnv(join(process.cwd(), ".env"));
loadEnv(join(process.cwd(), "backend-core/.env"));

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function parseOrgArg() {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--organization-id=")) return arg.slice("--organization-id=".length).trim();
  }
  return "";
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(name, rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(","));
  }
  writeFileSync(join(OUT, name), `${lines.join("\n")}\n`);
}

function writeJson(name, obj) {
  writeFileSync(join(OUT, name), `${JSON.stringify(obj, null, 2)}\n`);
}

function requiredEnv(name) {
  const v = pickStr(process.env[name]);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const organizationId =
    parseOrgArg() ||
    pickStr(process.env.MORAWARE_DEFAULT_ORGANIZATION_ID) ||
    "89180433-9fab-4024-bec9-a14d870bd0a8";

  const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log("DRY-RUN Moraware Job Worksheet prepared facts");
  console.log(`organization_id=${organizationId}`);
  console.log(`artifacts=${OUT}`);
  console.log("writes=DISABLED (liveWrite=false)\n");

  const result = await dryRunMorawareJobWorksheetPreparedFacts(supabase, organizationId, {
    pageSize: 100,
    checkProductionTable: true
  });

  const coverageRows = Object.entries(result.coverage?.fields || {}).map(([label, row]) => ({
    field: label,
    worksheet_count: row.worksheet_count,
    job_count: row.job_count,
    jobs_without_fact: row.jobs_without_fact
  }));

  const anomalies = (result.mismatches || []).map((m) => ({
    kind: "control_mismatch",
    field: m.field,
    expected: typeof m.expected === "object" ? JSON.stringify(m.expected) : m.expected,
    actual: typeof m.actual === "object" ? JSON.stringify(m.actual) : m.actual
  }));

  if (result.summary?.duplicate_key_count > 0) {
    anomalies.push({
      kind: "duplicate_keys",
      field: "unique(organization_id,import_group_id,source_job_id,source_form_id)",
      expected: 0,
      actual: result.summary.duplicate_key_count
    });
  }

  writeJson("summary.json", {
    verdict: result.verdict,
    status: result.status,
    writes: result.writes,
    table: WORKSHEET_FACTS_TABLE,
    upsert_on_conflict: WORKSHEET_FACTS_UPSERT_ON_CONFLICT,
    expected: result.expected,
    summary: result.summary,
    mismatches: result.mismatches,
    gates: result.gates,
    compute_ms: result.compute_ms,
    write_attempt_status: result.write_attempt_status,
    production_table_row_count: result.summary?.production_table_row_count,
    note: "DRY-RUN ONLY — zero inserts/updates/deletes against sales_moraware_job_worksheet_facts"
  });

  writeJson("broihahn_validation.json", result.broihahn);
  writeJson("coverage.json", {
    jobs_with_worksheet: result.coverage?.jobs_with_worksheet,
    jobs_without_worksheet: result.coverage?.jobs_without_worksheet,
    fields: result.coverage?.fields,
    placeholders: result.placeholders,
    prior_validation_job_targets: {
      Color: 3886,
      Room: 3885,
      Edge: 3898,
      Thickness: 3896,
      "Sink Type": 3508
    }
  });

  writeCsv("worksheet_facts_sample.csv", result.sample_rows || [], [
    "organization_id",
    "import_group_id",
    "source_account_id",
    "source_job_id",
    "source_form_id",
    "form_name_raw",
    "room_raw",
    "color_raw",
    "color_is_placeholder",
    "sqft",
    "edge_raw",
    "thickness_raw",
    "sink_type_raw",
    "backsplash_type_raw",
    "backsplash_height_raw"
  ]);

  writeCsv("coverage_by_field.csv", coverageRows, [
    "field",
    "worksheet_count",
    "job_count",
    "jobs_without_fact"
  ]);

  writeCsv("anomalies.csv", anomalies.length ? anomalies : [{ kind: "none", field: "", expected: "", actual: "" }], [
    "kind",
    "field",
    "expected",
    "actual"
  ]);

  writeFileSync(
    join(OUT, "README.md"),
    `# Moraware Job Worksheet prepared-facts dry-run

Generated: ${new Date().toISOString()}

## Verdict

**${result.verdict}**

## Safety

- Mode: DRY-RUN ONLY
- Table: \`${WORKSHEET_FACTS_TABLE}\`
- Upsert conflict (future live): \`${WORKSHEET_FACTS_UPSERT_ON_CONFLICT}\`
- Writes performed: **0**
- Production row_count at dry-run time: **${result.summary?.production_table_row_count ?? "n/a"}**

## Controls

| Metric | Expected | Actual |
|--------|----------|--------|
| Current jobs | ${result.expected?.current_job_count} | ${result.summary?.current_job_count} |
| Worksheet facts | ${result.expected?.worksheet_fact_count} | ${result.summary?.worksheet_fact_count} |
| Unique keys | ${result.expected?.unique_key_count} | ${result.summary?.unique_key_count} |
| Duplicate keys | 0 | ${result.summary?.duplicate_key_count} |
| SqFt | ${result.expected?.sqft} | ${result.summary?.sqft} |
| Jobs without worksheet | ${result.expected?.jobs_without_worksheet} | ${result.summary?.jobs_without_worksheet} |
| Epoch | (resolved) | ${result.summary?.import_group_id} |

## Broihahn

See \`broihahn_validation.json\` (Color × SqFt rollup for development only — not Account 360).

## Files

- summary.json
- broihahn_validation.json
- coverage.json
- worksheet_facts_sample.csv
- coverage_by_field.csv
- anomalies.csv
`
  );

  console.log(`verdict=${result.verdict}`);
  console.log(`epoch=${result.summary?.import_group_id}`);
  console.log(`jobs=${result.summary?.current_job_count}`);
  console.log(`worksheets=${result.summary?.worksheet_fact_count}`);
  console.log(`unique_keys=${result.summary?.unique_key_count}`);
  console.log(`duplicates=${result.summary?.duplicate_key_count}`);
  console.log(`sqft=${result.summary?.sqft}`);
  console.log(`jobs_without_worksheet=${result.summary?.jobs_without_worksheet}`);
  console.log(
    `broihahn=${result.broihahn?.jobs}/${result.broihahn?.worksheet_facts}/${result.broihahn?.sqft} match=${result.broihahn?.match}`
  );
  console.log(`production_row_count=${result.summary?.production_table_row_count}`);
  console.log(`writes.confirmed_zero=${result.writes?.confirmed_zero}`);
  console.log(`mismatches=${(result.mismatches || []).length}`);
  console.log(`artifacts written under ${OUT}`);

  if (result.verdict !== "SAFE_TO_POPULATE") {
    console.error("\nFIXES_REQUIRED — control reconciliation failed. See anomalies.csv / summary.json");
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
