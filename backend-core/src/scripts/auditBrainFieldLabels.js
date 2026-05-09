/**
 * Read-only audit of brain_fields label columns vs normalized_label coverage.
 * Output: debug/moraware/latest/brain-field-label-audit.{json,txt}
 */
/* eslint-disable no-console */
import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function fetchAllPaged(queryBuilder, { pageSize = 1000 } = {}) {
  const rows = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await queryBuilder.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += data.length;
  }
  return rows;
}

function inc(m, k, by = 1) {
  m.set(k, (m.get(k) || 0) + by);
}

function topNFromMap(m, n) {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

function leafish(v) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (Array.isArray(v)) return leafish(v[0]);
  if (typeof v === "object") {
    const t = v._text ?? v["#text"];
    if (t != null) return String(t).trim();
  }
  return "";
}

function rawLabelFromRow(row) {
  const lab = String(row.label ?? "").trim();
  if (lab) return lab;
  const r = row.raw_json;
  if (r && typeof r === "object") {
    return (
      leafish(r.name) ||
      leafish(r.Name) ||
      String(r.label ?? r.Label ?? "").trim() ||
      String(r.fieldName ?? r.FieldName ?? "").trim() ||
      ""
    );
  }
  return "";
}

const SAMPLE_BUCKETS = [
  { id: "sqft", re: /sq\s*\.?\s*ft|sqft|square\s*feet|worksheet/i },
  { id: "material_color", re: /material|color|granite|quartz|stone|slab\s*color/i },
  { id: "slab", re: /\bslab\b/i },
  { id: "edge", re: /\bedge\b|bullnose|eased|bevel/i },
  { id: "sink", re: /sink/i },
  { id: "faucet", re: /faucet/i },
  { id: "backsplash", re: /backsplash|fhbs|full\s*height/i },
  { id: "template", re: /template/i },
  { id: "install", re: /install/i },
  { id: "order_stone", re: /order\s*stone/i },
  { id: "contact", re: /contact|customer|phone|email|cell/i },
  { id: "address", re: /address|street|city|zip|state/i },
  { id: "quote_price", re: /quote|price|total|estimate|bid|\$/i }
];

function mainSummaryTxt(report) {
  const lines = [];
  const w = (s) => lines.push(String(s));
  w("=".repeat(72));
  w("brain_fields label audit");
  w(`Generated: ${report.meta.generatedAt}`);
  w("=".repeat(72));
  w("");
  w(`total_rows: ${report.totals.total_rows}`);
  w(`normalized_label null: ${report.totals.normalized_label_null}`);
  w(`normalized_label empty string: ${report.totals.normalized_label_empty}`);
  w(`rows with usable raw label: ${report.totals.rows_with_raw_label}`);
  w(`rows raw label present but normalized missing: ${report.totals.rows_label_ok_normalized_missing}`);
  w("");
  w("top 50 normalized_label values:");
  w(JSON.stringify(report.top_50_normalized_label, null, 2));
  w("");
  w("top 100 raw label keys (label column + raw_json.name fallback):");
  w(JSON.stringify(report.top_100_raw_labels, null, 2));
  w("");
  w("sample rows (label ok, normalized blank) — first 15:");
  w(JSON.stringify(report.samples.label_ok_normalized_blank.slice(0, 15), null, 2));
  w("");
  w("category samples (by raw label regex):");
  for (const [k, v] of Object.entries(report.samples.by_category)) {
    w(`${k}: ${v.length} samples (showing up to 3)`);
    w(JSON.stringify(v.slice(0, 3), null, 2));
  }
  return lines.join("\n") + "\n";
}

async function run() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../..");
  const latestDir = path.join(repoRoot, "debug", "moraware", "latest");
  await fs.mkdir(latestDir, { recursive: true });

  const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { count: totalCount, error: cErr } = await supabase
    .from("brain_fields")
    .select("*", { count: "exact", head: true });
  if (cErr) throw new Error(cErr.message);

  const rows = await fetchAllPaged(
    supabase
      .from("brain_fields")
      .select("id,job_id,form_id,field_id,label,normalized_label,value,raw_json")
      .order("id", { ascending: true }),
    { pageSize: 1000 }
  );

  let normalizedNull = 0;
  let normalizedEmpty = 0;
  const normHist = new Map();
  const rawHist = new Map();

  const samplesBlank = [];
  const byCat = Object.fromEntries(SAMPLE_BUCKETS.map((b) => [b.id, []]));
  let rowsWithRaw = 0;
  let labelOkNormMissing = 0;

  for (const row of rows) {
    const nl = row.normalized_label;
    if (nl == null) normalizedNull++;
    if (nl === "") normalizedEmpty++;

    const nk = String(nl ?? "").trim() || "(null_or_blank)";
    inc(normHist, nk, 1);

    const rawLab = rawLabelFromRow(row);
    const rawKey = rawLab || "(no_raw_label)";
    if (rawLab) rowsWithRaw++;
    inc(rawHist, rawKey, 1);

    const normMissing = nl == null || String(nl).trim() === "";
    const labOk = Boolean(String(row.label ?? "").trim() || rawLab);
    if (labOk && normMissing) {
      labelOkNormMissing++;
      if (samplesBlank.length < 40) {
        samplesBlank.push({
          id: row.id,
          job_id: row.job_id,
          form_id: row.form_id,
          field_id: row.field_id,
          label_column: row.label,
          raw_label_inferred: rawLab,
          normalized_label: row.normalized_label,
          value_preview: String(row.value ?? "").slice(0, 120)
        });
      }
    }

    if (rawLab) {
      for (const b of SAMPLE_BUCKETS) {
        if (!b.re.test(rawLab)) continue;
        if (byCat[b.id].length < 5) {
          byCat[b.id].push({
            id: row.id,
            job_id: row.job_id,
            raw_label: rawLab,
            normalized_label: row.normalized_label,
            value_preview: String(row.value ?? "").slice(0, 80)
          });
        }
      }
    }
  }

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      supabase_host: new URL(requiredEnv("SUPABASE_URL")).host
    },
    totals: {
      total_rows: totalCount ?? rows.length,
      scanned_rows: rows.length,
      normalized_label_null: normalizedNull,
      normalized_label_empty: normalizedEmpty,
      rows_with_raw_label: rowsWithRaw,
      rows_label_ok_normalized_missing: labelOkNormMissing
    },
    top_50_normalized_label: topNFromMap(normHist, 50),
    top_100_raw_labels: topNFromMap(rawHist, 100),
    samples: {
      label_ok_normalized_blank: samplesBlank,
      by_category: byCat
    },
    notes: [
      "raw_label_inferred uses brain_fields.label, else raw_json.name/Name/label/fieldName when present.",
      "See docs/BRAIN_FIELD_LABEL_NORMALIZATION.md for sync path and fix."
    ]
  };

  const jsonPath = path.join(latestDir, "brain-field-label-audit.json");
  const txtPath = path.join(latestDir, "brain-field-label-audit.txt");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(txtPath, mainSummaryTxt(report), "utf8");
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${txtPath}`);
}

run().catch((e) => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});
