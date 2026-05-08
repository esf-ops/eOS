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

function normalizeSpaces(s) {
  return String(s ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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
  return s;
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function yearWindow(year) {
  const y = Number.parseInt(String(year ?? ""), 10);
  if (!Number.isFinite(y) || y < 1970 || y > 2100) throw new Error(`Invalid year: ${year}`);
  return { year: y, start: `${y}-01-01`, endExclusive: `${y + 1}-01-01` };
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
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function addToCounter(map, key, inc = 1) {
  map.set(key, (map.get(key) || 0) + inc);
}

function addToCounterNum(map, key, inc = 0) {
  map.set(key, (map.get(key) || 0) + (Number(inc) || 0));
}

function addToSetMap(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function safeNumber(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function samplePush(arr, v, limit) {
  if (!v) return;
  if (arr.length >= limit) return;
  if (arr.includes(v)) return;
  arr.push(v);
}

function hasNonEmptyValue(fieldRow) {
  const v = fieldRow?.value;
  if (v == null) return false;
  const s = normalizeSpaces(v);
  return Boolean(s);
}

function conceptMatchers() {
  const rx = (re) => new RegExp(re, "i");
  return [
    { concept: "sqft", re: rx("\\bsq\\s*ft\\b|sqft|square\\s*feet") },
    { concept: "color", re: rx("\\bcolor\\b") },
    { concept: "edge", re: rx("\\bedge\\b") },
    { concept: "thickness", re: rx("\\bthickness\\b") },
    {
      concept: "backsplash",
      re: rx(
        "backsplash|back\\s*splash|back\\s*splash\\s*type|back\\s*splash\\s*height|\\bbs\\b|fhbs|full\\s*height\\s*backsplash"
      )
    },
    { concept: "full height", re: rx("full\\s*height|fhbs|full\\s*height\\s*backsplash") },
    { concept: "sink type", re: rx("sink\\s*type") },
    {
      concept: "sink model",
      re: rx(
        "sink\\s*make|sink\\s*model|make\\s*&\\s*model|esf\\s*provided\\s*sink\\s*make\\s*&\\s*model|not\\s*provided\\s*by\\s*esf\\s*sink\\s*make\\s*&\\s*model|model\\s*#|model\\s*no"
      )
    },
    { concept: "faucet", re: rx("faucet") },
    { concept: "stove", re: rx("stove|range") },
    { concept: "overhang", re: rx("overhang") },
    { concept: "waterfall", re: rx("waterfall|water\\s*fall") },
    { concept: "braces", re: rx("brace") },
    {
      concept: "electrical cutout",
      re: rx("electrical\\s*cutout|electrical\\s*cut-?out|electrical\\s*cut-?outs|electrical\\s*cut-?outs\\s*needed|outlet|switch")
    },
    { concept: "shop comments", re: rx("shop\\s*comment|shop\\s*notes?") },
    { concept: "special worksite conditions", re: rx("special\\s*worksite|worksite\\s*condition|site\\s*condition") },
    { concept: "template", re: rx("\\btemplate\\b") },
    { concept: "templater", re: rx("templater") },
    { concept: "install", re: rx("\\binstall") },
    { concept: "installer", re: rx("installer") },
    { concept: "customer service", re: rx("customer\\s*service") },
    { concept: "service", re: rx("\\bservice\\b") },
    { concept: "repair", re: rx("repair") },
    { concept: "remake", re: rx("remake") },
    { concept: "change order", re: rx("change\\s*order") },
    { concept: "billing", re: rx("billing") },
    { concept: "invoice", re: rx("invoice") },
    { concept: "signed proposal", re: rx("signed\\s*proposal|proposal\\s*signed") },
    { concept: "material", re: rx("material") },
    { concept: "slab", re: rx("slab") },
    { concept: "phase", re: rx("\\bphase\\b|job\\s*phase|jobphases") },
    { concept: "status", re: rx("\\bstatus\\b|job\\s*status|job_status") }
  ];
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../..");
  const latestDir = path.join(repoRoot, "debug", "moraware", "latest");
  await fs.mkdir(latestDir, { recursive: true });

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { year, start, endExclusive } = yearWindow(process.env.MORAWARE_AUDIT_YEAR || "2026");

  // Load 2026 jobs
  const jobs = await fetchAllPaged(
    supabase
      .from("brain_jobs")
      .select("job_id,account_id,account_name,job_name,creation_date,salesperson_name,worksheet_sqft,form_count,field_count,job_worksheet_forms")
      .gte("creation_date", start)
      .lt("creation_date", endExclusive)
      .order("creation_date", { ascending: true }),
    { pageSize: 1000 }
  );

  const jobIds = jobs.map((j) => String(j.job_id));
  const jobCount = jobIds.length;
  const worksheetSqFtTotal = jobs.reduce((s, j) => s + safeNumber(j.worksheet_sqft), 0);
  const earliestDate = jobs.length ? String(jobs[0].creation_date ?? "") : "";
  const latestDate = jobs.length ? String(jobs[jobs.length - 1].creation_date ?? "") : "";
  const accountSet = new Set(jobs.map((j) => String(j.account_id ?? "").trim()).filter(Boolean));
  const salespersonSet = new Set(jobs.map((j) => normalizeSpaces(j.salesperson_name)).filter(Boolean));

  // Load forms and fields for those jobs (chunked by job ids)
  const forms = [];
  const fields = [];
  const jobIdChunks = [];
  const jobChunkSize = 100;
  for (let i = 0; i < jobIds.length; i += jobChunkSize) jobIdChunks.push(jobIds.slice(i, i + jobChunkSize));

  for (const chunk of jobIdChunks) {
    const chunkForms = await fetchAllPaged(
      supabase
        .from("brain_forms")
        .select("form_id,job_id,form_template_name,form_name,raw_form_name")
        .in("job_id", chunk)
        .order("form_id", { ascending: true }),
      { pageSize: 1000 }
    );
    forms.push(...chunkForms);

    const chunkFields = await fetchAllPaged(
      supabase
        .from("brain_fields")
        .select("id,job_id,form_id,field_id,label,normalized_label,value")
        .in("job_id", chunk)
        .order("id", { ascending: true }),
      { pageSize: 5000 }
    );
    fields.push(...chunkFields);
  }

  const formCount = forms.length;
  const fieldCount = fields.length;

  // Form template coverage
  const templateStats = new Map(); // template -> { form_count, field_count, non_empty_field_count, job_set }
  const formById = new Map();
  const templateSet = new Set();
  for (const f of forms) {
    const formId = String(f.form_id);
    const tmpl = normalizeSpaces(f.form_template_name) || "(blank)";
    templateSet.add(tmpl);
    formById.set(formId, f);
    if (!templateStats.has(tmpl)) {
      templateStats.set(tmpl, { form_count: 0, field_count: 0, non_empty_field_count: 0, job_set: new Set() });
    }
    const st = templateStats.get(tmpl);
    st.form_count += 1;
    st.job_set.add(String(f.job_id));
  }

  // Field label coverage
  const labelStats = new Map(); // key -> stats
  const normalizedLabelSet = new Set();
  for (const fld of fields) {
    const label = normalizeSpaces(fld.label);
    const normalizedLabel = normalizeSpaces(fld.normalized_label);
    normalizedLabelSet.add(normalizedLabel);
    const key = `${normalizedLabel}|||${label}`;
    if (!labelStats.has(key)) {
      labelStats.set(key, {
        normalized_label: normalizedLabel,
        label,
        field_count: 0,
        non_empty_count: 0,
        distinct_values: new Set(),
        sample_values: [],
        templates_seen: new Set()
      });
    }
    const st = labelStats.get(key);
    st.field_count += 1;
    const nonEmpty = hasNonEmptyValue(fld);
    if (nonEmpty) st.non_empty_count += 1;
    const v = normalizeSpaces(fld.value);
    if (v) {
      if (st.distinct_values.size < 5000) st.distinct_values.add(v);
      samplePush(st.sample_values, v, 5);
    }
    const form = formById.get(String(fld.form_id));
    const tmpl = normalizeSpaces(form?.form_template_name) || "(unknown)";
    if (st.templates_seen.size < 200) st.templates_seen.add(tmpl);

    const tmplSlot = templateStats.get(tmpl);
    if (tmplSlot) {
      tmplSlot.field_count += 1;
      if (nonEmpty) tmplSlot.non_empty_field_count += 1;
    }
  }

  // Job-level completeness booleans
  const jobCompleteness = new Map(); // job_id -> row
  for (const j of jobs) {
    const jid = String(j.job_id);
    jobCompleteness.set(jid, {
      job_id: jid,
      creation_date: String(j.creation_date ?? ""),
      job_name: String(j.job_name ?? ""),
      account_name: String(j.account_name ?? ""),
      salesperson_name: String(j.salesperson_name ?? ""),
      has_sqft: false,
      has_color: false,
      has_edge: false,
      has_sink_info: false,
      has_backsplash_info: false,
      has_installation_checklist: false,
      has_accounting_form: false,
      has_shop_comments: false,
      form_count: Number(j.form_count ?? 0) || 0,
      field_count: Number(j.field_count ?? 0) || 0
    });
  }
  for (const f of forms) {
    const jid = String(f.job_id);
    const tmpl = normalizeSpaces(f.form_template_name).toLowerCase();
    const row = jobCompleteness.get(jid);
    if (!row) continue;
    if (tmpl.includes("installation inspection")) row.has_installation_checklist = true;
    if (tmpl.includes("accounting form")) row.has_accounting_form = true;
  }

  const labelForCompleteness = (s) => normalizeSpaces(s).toLowerCase();
  for (const fld of fields) {
    const jid = String(fld.job_id);
    const row = jobCompleteness.get(jid);
    if (!row) continue;
    const nl = labelForCompleteness(fld.normalized_label);
    const l = labelForCompleteness(fld.label);
    const any = `${nl} ${l}`;
    if (any.includes("sq ft") || any.includes("sqft")) row.has_sqft = true;
    if (any.includes("color")) row.has_color = true;
    if (any.includes("edge")) row.has_edge = true;
    if (any.includes("backsplash")) row.has_backsplash_info = true;
    if (any.includes("sink")) row.has_sink_info = true;
    if (any.includes("shop comment") || any.includes("shop note")) row.has_shop_comments = true;
  }

  // Critical concept coverage
  const concepts = conceptMatchers();
  const conceptRows = [];
  const notProven = [];

  for (const c of concepts) {
    const labelMatchSet = new Set();
    const formNameMatchSet = new Set();
    const templateMatchSet = new Set();
    let rowsTotal = 0;
    let rowsNonEmpty = 0;
    const jobSet = new Set();
    const sampleValues = [];

    for (const st of labelStats.values()) {
      const n = st.normalized_label;
      const l = st.label;
      if (!c.re.test(n) && !c.re.test(l)) continue;
      labelMatchSet.add(`${n}${l ? ` (${l})` : ""}`);
      rowsTotal += st.field_count;
      rowsNonEmpty += st.non_empty_count;
      for (const v of st.sample_values) samplePush(sampleValues, v, 5);
    }

    // Scan forms for concept mentions in form_name/template_name, and scan fields for job-level coverage.
    for (const f of forms) {
      const formName = normalizeSpaces(f.form_name);
      const rawFormName = normalizeSpaces(f.raw_form_name);
      const tmpl = normalizeSpaces(f.form_template_name);
      if (c.re.test(formName) || c.re.test(rawFormName)) {
        formNameMatchSet.add(`${formName || rawFormName || "(blank)"}`);
      }
      if (c.re.test(tmpl)) {
        templateMatchSet.add(tmpl || "(blank)");
      }
    }

    // job-level coverage percent: scan fields once per concept for distinct jobs
    for (const fld of fields) {
      const n = normalizeSpaces(fld.normalized_label);
      const l = normalizeSpaces(fld.label);
      if (!c.re.test(n) && !c.re.test(l)) continue;
      if (hasNonEmptyValue(fld)) jobSet.add(String(fld.job_id));
    }

    const coveragePct = jobCount ? (jobSet.size / jobCount) * 100 : 0;
    const status =
      labelMatchSet.size || formNameMatchSet.size || templateMatchSet.size ? "found" : "not_found";
    if (status === "not_found" && ["templater", "installer", "customer service", "change order", "slab", "schedule"].includes(c.concept)) {
      notProven.push(c.concept);
    }

    conceptRows.push({
      concept: c.concept,
      status,
      label_matches: [...labelMatchSet].slice(0, 50).join(" | "),
      form_name_matches: [...formNameMatchSet].slice(0, 50).join(" | "),
      template_matches: [...templateMatchSet].slice(0, 50).join(" | "),
      rows: rowsTotal,
      non_empty_rows: rowsNonEmpty,
      job_coverage_percent: Number(coveragePct.toFixed(2)),
      sample_values: sampleValues.join(" | ")
    });
  }

  // Outputs
  const templateRows = [...templateStats.entries()]
    .map(([template, st]) => ({
      form_template_name: template,
      form_count: st.form_count,
      job_count: st.job_set.size,
      field_count: st.field_count,
      non_empty_field_count: st.non_empty_field_count
    }))
    .sort((a, b) => b.field_count - a.field_count);

  const labelRows = [...labelStats.values()]
    .map((st) => ({
      normalized_label: st.normalized_label,
      label: st.label,
      field_count: st.field_count,
      non_empty_count: st.non_empty_count,
      distinct_value_count: st.distinct_values.size,
      sample_values: st.sample_values.join(" | "),
      form_templates_seen_in: [...st.templates_seen].slice(0, 25).join(" | ")
    }))
    .sort((a, b) => b.field_count - a.field_count);

  const jsonOut = {
    year,
    overall: {
      jobs: jobCount,
      forms: formCount,
      fields: fieldCount,
      distinctFormTemplates: templateSet.size,
      distinctNormalizedLabels: normalizedLabelSet.size,
      dateRange: { earliest: earliestDate || null, latest: latestDate || null },
      worksheetSqFt: worksheetSqFtTotal
    },
    templateCoverage: templateRows,
    labelCoverageTop: labelRows.slice(0, 500),
    criticalConcepts: conceptRows,
    notProvenYet: notProven,
    jobCompletenessCounts: {
      has_sqft: [...jobCompleteness.values()].filter((r) => r.has_sqft).length,
      has_color: [...jobCompleteness.values()].filter((r) => r.has_color).length,
      has_edge: [...jobCompleteness.values()].filter((r) => r.has_edge).length,
      has_sink_info: [...jobCompleteness.values()].filter((r) => r.has_sink_info).length,
      has_backsplash_info: [...jobCompleteness.values()].filter((r) => r.has_backsplash_info).length,
      has_installation_checklist: [...jobCompleteness.values()].filter((r) => r.has_installation_checklist).length,
      has_accounting_form: [...jobCompleteness.values()].filter((r) => r.has_accounting_form).length,
      has_shop_comments: [...jobCompleteness.values()].filter((r) => r.has_shop_comments).length
    }
  };

  await fs.writeFile(path.join(latestDir, "brain-field-coverage.json"), JSON.stringify(jsonOut, null, 2), "utf8");

  await fs.writeFile(
    path.join(latestDir, "brain-field-coverage.csv"),
    toCsv(labelRows, [
      "normalized_label",
      "label",
      "field_count",
      "non_empty_count",
      "distinct_value_count",
      "sample_values",
      "form_templates_seen_in"
    ]),
    "utf8"
  );

  await fs.writeFile(
    path.join(latestDir, "job-completeness-2026.csv"),
    toCsv([...jobCompleteness.values()], [
      "job_id",
      "creation_date",
      "job_name",
      "account_name",
      "salesperson_name",
      "has_sqft",
      "has_color",
      "has_edge",
      "has_sink_info",
      "has_backsplash_info",
      "has_installation_checklist",
      "has_accounting_form",
      "has_shop_comments",
      "form_count",
      "field_count"
    ]),
    "utf8"
  );

  const conceptSummaryLines = conceptRows
    .map((r) => `${r.concept} | ${r.status} | ${r.rows} | ${r.non_empty_rows}`)
    .join("\n");

  const txt =
    `=== BRAIN FIELD COVERAGE AUDIT ===\n` +
    `${year} jobs: ${jobCount}\n` +
    `forms: ${formCount}\n` +
    `fields: ${fieldCount}\n` +
    `distinct templates: ${templateSet.size}\n` +
    `distinct field labels: ${normalizedLabelSet.size}\n` +
    `date range: ${earliestDate || "(n/a)"} to ${latestDate || "(n/a)"}\n` +
    `worksheetSqFt: ${worksheetSqFtTotal}\n` +
    `\n` +
    `Critical concepts:\n` +
    `concept | status | rows | non_empty_rows\n` +
    `${conceptSummaryLines}\n` +
    `\n` +
    `Not proven yet:\n` +
    `${notProven.length ? notProven.join(", ") : "(none)"}\n`;

  await fs.writeFile(path.join(latestDir, "brain-field-coverage.txt"), txt, "utf8");

  console.log("=== BRAIN FIELD COVERAGE AUDIT ===");
  console.log(`${year} jobs: ${jobCount}`);
  console.log(`forms: ${formCount}`);
  console.log(`fields: ${fieldCount}`);
  console.log(`distinct templates: ${templateSet.size}`);
  console.log(`distinct field labels: ${normalizedLabelSet.size}`);
  console.log("");
  console.log("Critical concepts:");
  console.log("concept | status | label_matches | form_name_matches | template_matches | non_empty_rows");
  for (const r of conceptRows) {
    const labelMatches = r.label_matches ? r.label_matches.split(" | ").length : 0;
    const formMatches = r.form_name_matches ? r.form_name_matches.split(" | ").length : 0;
    const templateMatches = r.template_matches ? r.template_matches.split(" | ").length : 0;
    console.log(`${r.concept} | ${r.status} | ${labelMatches} | ${formMatches} | ${templateMatches} | ${r.non_empty_rows}`);
  }
  if (notProven.length) {
    console.log("");
    console.log("Not proven yet:");
    console.log(notProven.join(", "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

