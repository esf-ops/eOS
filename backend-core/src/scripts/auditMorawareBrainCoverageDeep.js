/**
 * Deep Moraware Brain coverage audit — read-only Supabase aggregates.
 * Output: debug/moraware/latest/deep-brain-coverage.{json,txt}
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (same as other audit scripts)
 */
/* eslint-disable no-console */
import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function fetchAllPaged(queryBuilder, { pageSize = 2000 } = {}) {
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

function nonEmpty(s) {
  return Boolean(String(s ?? "").trim());
}

const ACTIVITY_BUCKET_DEFS = [
  { key: "template", label: "template", re: /template/i },
  { key: "order_stone", label: "order stone", re: /order\s*stone/i },
  { key: "titan_program", label: "Titan program", re: /titan\s*program/i },
  { key: "saw_program", label: "saw program", re: /saw\s*program/i },
  { key: "saw", label: "saw", re: /\bsaw\b/i },
  { key: "fabrication", label: "fabrication", re: /fabrication/i },
  { key: "polish", label: "polish", re: /polish/i },
  { key: "install", label: "install", re: /install/i },
  { key: "customer_service", label: "customer service", re: /customer\s*service|\bservice\b/i },
  { key: "repair", label: "repair", re: /repair/i },
  { key: "remake_signal", label: "remake (type text)", re: /remake/i },
  { key: "change_signal", label: "change (type text)", re: /change/i }
];

const FIELD_CATEGORY_DEFS = [
  { id: "material_color", re: /\b(color|material|slab|granite|quartz|stone)\b/i },
  { id: "slab", re: /\bslab\b/i },
  { id: "square_footage", re: /sq\s*ft|square\s*feet|sf\b|square\s*footage/i },
  { id: "edge", re: /\bedge\b/i },
  { id: "sink", re: /sink/i },
  { id: "faucet", re: /faucet/i },
  { id: "backsplash", re: /backsplash|fhbs|full\s*height/i },
  { id: "template", re: /template/i },
  { id: "install", re: /install/i },
  { id: "contact", re: /contact|phone|email|cell/i },
  { id: "address", re: /address|city|zip|state|street/i },
  { id: "quote", re: /quote|estimate|bid/i },
  { id: "price", re: /price|amount|\$|total\s*cost/i },
  { id: "sales", re: /sales|rep|account executive/i },
  { id: "purchase_order_stone", re: /purchase|order\s*stone|po\b/i }
];

function bucketActivityRow(activityType, activityStatus) {
  const t = `${String(activityType ?? "")} ${String(activityStatus ?? "")}`;
  const out = {};
  for (const d of ACTIVITY_BUCKET_DEFS) {
    if (d.re.test(t)) out[d.key] = true;
  }
  return out;
}

function categorizeLabel(normalizedLabel) {
  const lab = String(normalizedLabel ?? "").trim();
  if (!lab) return [];
  const tags = [];
  for (const d of FIELD_CATEGORY_DEFS) {
    if (d.re.test(lab)) tags.push(d.id);
  }
  return tags;
}

function yearFromCreationDate(d) {
  const s = String(d ?? "").trim();
  if (s.length >= 4) return s.slice(0, 4);
  return "(unknown)";
}

function buildGapAnalysis(reportFragments) {
  return {
    titans_flowing_visibility: {
      intent:
        "Live Titan production visibility — today's saw/Titan queue, material color, phase, stuck indicators.",
      data_we_have: [
        "brain_jobs: job_name, account, salesperson, worksheet_sqft, creation_date, status",
        "brain_job_activities: activity_type/status/start_date for template, saw, fabrication, install, order stone, CS signals (text-derived)",
        "brain_job_operational_summary: boolean flags for signals + template/install/order_stone when operational sync ran"
      ],
      gaps: [
        "No dedicated 'active on Titan today' flag — derive from activities with start_date = today or sched_time parsing (partial).",
        "Material color lives in brain_fields labels, not always denormalized on brain_jobs.",
        "Held/stuck requires business rules (e.g. aging in same activity status) — not a single Brain column.",
        "Completed today / queued today — needs activity status semantics + calendar day filter in API, not raw columns."
      ],
      suggested_next_steps: [
        "Read-only API: GET /api/titans/today filtering brain_job_activities by start_date + activity buckets.",
        "Optional: lightweight material color resolver job reading top color field per job."
      ]
    },
    quoting_revenue: {
      intent: "Quote Head / revenue leverage — quote status, amounts, salesperson, CRM-like project context.",
      data_we_have: [
        "brain_jobs core identifiers",
        "brain_fields / brain_forms for quote-like labels if present in Moraware worksheets"
      ],
      gaps: [
        "Moraware quote/estimate status may map to job_status + form fields — must profile normalized_label distribution.",
        "Numeric quote totals may be fields not guaranteed standardized across forms.",
        "Bid/close ratio needs historical snapshots — typically new Supabase tables, not Brain alone."
      ],
      suggested_next_steps: [
        "Label inventory (this audit) → pick canonical labels for ESF quoting fields.",
        "Future: quote_versions / quote_lines tables in Supabase for Partner Quoting Platform."
      ]
    },
    material_flow_purchasing: {
      intent: "Demand vs slab inventory, order stone, install schedule, material risk.",
      data_we_have: [
        "Order stone / install signals from activities + operational summary",
        "Sq.Ft. on brain_jobs",
        "Slab-related labels in fields + slab_numbers JSON in operational summary when ingested"
      ],
      gaps: [
        "SlabSmith / inventory not connected — placeholders only until integration.",
        "Scheduled production dates depend on activity start_date/sched_time completeness."
      ],
      suggested_next_steps: [
        "Phase 1: Material risk heuristics from Brain only (order stone lag vs install).",
        "Phase 2: ingest SlabSmith or supplier feed into dedicated tables."
      ]
    }
  };
}

function renderTxt(report) {
  const lines = [];
  const w = (s) => lines.push(String(s));

  w("=".repeat(72));
  w("eOS Deep Brain Coverage Audit");
  w(`Generated: ${report.meta.generatedAt}`);
  w("=".repeat(72));

  w("\n--- brain_jobs ---\n");
  const bj = report.brain_jobs;
  w(`total_jobs: ${bj.total_jobs}`);
  w(`jobs_by_year: ${JSON.stringify(bj.jobs_by_year)}`);
  w(`with_job_name: ${bj.with_job_name}`);
  w(`with_account_id: ${bj.with_account_id}`);
  w(`with_account_name: ${bj.with_account_name}`);
  w(`with_salesperson: ${bj.with_salesperson}`);
  w(`with_creation_date: ${bj.with_creation_date}`);
  w(`with_job_status: ${bj.with_job_status}`);
  w(`with_notes: ${bj.with_notes}`);
  w(`with_worksheet_sqft_positive: ${bj.with_worksheet_sqft_positive}`);
  w(`missing_or_zero_worksheet_sqft: ${bj.missing_or_zero_worksheet_sqft}`);
  w(`with_forms_gt0: ${bj.with_forms_gt0}`);
  w(`with_fields_gt0: ${bj.with_fields_gt0}`);
  w(`jobs_with_any_activity_rows: ${bj.jobs_with_any_activity_rows}`);
  w(`jobs_with_operational_summary_row: ${bj.jobs_with_operational_summary_row}`);
  w(`contacts_rows_for_jobs: ${bj.contact_job_rows} (distinct jobs with contact: ${bj.distinct_jobs_with_contacts})`);

  w("\n--- brain_forms ---\n");
  const bf = report.brain_forms;
  w(`total_forms: ${bf.total_forms}`);
  w(`distinct_jobs_with_forms: ${bf.distinct_jobs}`);
  w(`forms_with_synced_at: ${bf.forms_with_synced_at ?? "n/a"}`);
  w(`top_form_names: ${JSON.stringify(bf.top_form_names?.slice(0, 20) || [])}`);
  w(`top_template_names: ${JSON.stringify(bf.top_template_names?.slice(0, 20) || [])}`);
  w(`distinct_jobs_per_template_top: ${JSON.stringify(bf.distinct_jobs_per_template_top?.slice(0, 20) || [])}`);
  w(`note: ${bf.date_coverage_note}`);

  w("\n--- brain_fields ---\n");
  const fld = report.brain_fields;
  w(`total_field_rows: ${fld.total_field_rows}`);
  w(`unique_normalized_labels: ${fld.unique_normalized_labels}`);
  w(`top_100_normalized_labels: (see JSON)`);
  w(`category_match_counts: ${JSON.stringify(fld.category_match_counts)}`);

  w("\n--- brain_job_activities ---\n");
  const act = report.brain_job_activities;
  w(`total_activities: ${act.total_activities}`);
  w(`distinct_jobs_with_activities: ${act.distinct_jobs}`);
  w(`date_range_start_date: ${act.date_range?.min || "n/a"} .. ${act.date_range?.max || "n/a"}`);
  w(`top_activity_types: ${JSON.stringify(act.top_activity_types?.slice(0, 25) || [])}`);
  w(`top_activity_statuses: ${JSON.stringify(act.top_activity_statuses?.slice(0, 25) || [])}`);
  w(`bucket_jobs_matched: ${JSON.stringify(act.bucket_distinct_job_counts)}`);

  w("\n--- brain_job_operational_summary ---\n");
  const os = report.operational_summary;
  w(`total_rows: ${os.total_rows}`);
  w(`flag_counts: ${JSON.stringify(os.flag_counts)}`);
  w(`top_missing_or_empty_columns: ${JSON.stringify(os.top_missing_or_empty_columns || [])}`);

  w("\n--- sync_health ---\n");
  const sh = report.sync_health;
  w(JSON.stringify(sh, null, 2));

  w("\n--- phase1_gap_summary (see JSON for detail) ---\n");
  w("titans_flowing: see gapAnalysis.titans_flowing_visibility");
  w("quoting: see gapAnalysis.quoting_revenue");
  w("material_flow: see gapAnalysis.material_flow_purchasing");

  return lines.join("\n") + "\n";
}

export async function runDeepBrainCoverageAudit() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../..");

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const latestDir = path.join(repoRoot, "debug", "moraware", "latest");
  await fs.mkdir(latestDir, { recursive: true });

  const meta = { generatedAt: new Date().toISOString(), supabase_host: new URL(supabaseUrl).host };

  const errors = [];

  async function safeCount(table, filters) {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filters) q = filters(q);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  let brain_jobs = {
    total_jobs: 0,
    jobs_by_year: {},
    with_job_name: 0,
    with_account_id: 0,
    with_account_name: 0,
    with_salesperson: 0,
    with_creation_date: 0,
    with_job_status: 0,
    with_notes: 0,
    with_worksheet_sqft_positive: 0,
    missing_or_zero_worksheet_sqft: 0,
    with_forms_gt0: 0,
    with_fields_gt0: 0,
    jobs_with_any_activity_rows: 0,
    jobs_with_operational_summary_row: 0,
    contact_job_rows: 0,
    distinct_jobs_with_contacts: 0,
    sample_raw_json_job_keys_note:
      "schema stores job core on columns; address may appear in raw_json or contacts — see contacts + field label categories"
  };

  try {
    brain_jobs.total_jobs = await safeCount("brain_jobs");

    const jobRows = await fetchAllPaged(
      supabase
        .from("brain_jobs")
        .select(
          "job_id,job_name,account_id,account_name,creation_date,job_status,salesperson_name,notes,worksheet_sqft,form_count,field_count"
        )
        .order("job_id", { ascending: true }),
      { pageSize: 3000 }
    );

    const byYear = new Map();
    for (const j of jobRows) {
      const y = yearFromCreationDate(j.creation_date);
      inc(byYear, y, 1);
      if (nonEmpty(j.job_name)) brain_jobs.with_job_name++;
      if (nonEmpty(j.account_id)) brain_jobs.with_account_id++;
      if (nonEmpty(j.account_name)) brain_jobs.with_account_name++;
      if (nonEmpty(j.salesperson_name)) brain_jobs.with_salesperson++;
      if (nonEmpty(j.creation_date)) brain_jobs.with_creation_date++;
      if (nonEmpty(j.job_status)) brain_jobs.with_job_status++;
      if (nonEmpty(j.notes)) brain_jobs.with_notes++;
      const sq = Number(j.worksheet_sqft ?? 0) || 0;
      if (sq > 0) brain_jobs.with_worksheet_sqft_positive++;
      else brain_jobs.missing_or_zero_worksheet_sqft++;
      if (safeNumber(j.form_count) > 0) brain_jobs.with_forms_gt0++;
      if (safeNumber(j.field_count) > 0) brain_jobs.with_fields_gt0++;
    }
    brain_jobs.jobs_by_year = Object.fromEntries([...byYear.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

    const jobIds = new Set(jobRows.map((r) => String(r.job_id)));

    const actDistinct = new Set();
    const actRows = await fetchAllPaged(
      supabase.from("brain_job_activities").select("job_id").order("job_id", { ascending: true }),
      { pageSize: 5000 }
    );
    for (const r of actRows) actDistinct.add(String(r.job_id));
    brain_jobs.jobs_with_any_activity_rows = [...actDistinct].filter((id) => jobIds.has(id)).length;

    const { count: osCount } = await supabase
      .from("brain_job_operational_summary")
      .select("*", { count: "exact", head: true });
    brain_jobs.jobs_with_operational_summary_row = osCount ?? 0;

    const contactRows = await fetchAllPaged(
      supabase.from("brain_job_contacts").select("job_id").order("job_id", { ascending: true }),
      { pageSize: 5000 }
    );
    brain_jobs.contact_job_rows = contactRows.length;
    const cj = new Set(contactRows.map((r) => String(r.job_id)));
    brain_jobs.distinct_jobs_with_contacts = [...cj].filter((id) => jobIds.has(id)).length;
  } catch (e) {
    errors.push({ section: "brain_jobs", message: String(e?.message || e) });
  }

  let brain_forms = {
    total_forms: 0,
    distinct_jobs: 0,
    forms_with_synced_at: 0,
    top_form_names: [],
    top_template_names: [],
    distinct_jobs_per_template_top: [],
    date_coverage_note:
      "brain_forms has synced_at; Moraware form created date may only exist inside raw_json if needed for audit."
  };

  try {
    brain_forms.total_forms = await safeCount("brain_forms");
    const forms = await fetchAllPaged(
      supabase
        .from("brain_forms")
        .select("job_id,form_name,form_template_name,synced_at")
        .order("form_id", { ascending: true }),
      { pageSize: 4000 }
    );
    const jobsW = new Set(forms.map((f) => String(f.job_id)));
    brain_forms.distinct_jobs = jobsW.size;
    const fn = new Map();
    const tn = new Map();
    const jobsByTemplate = new Map();
    for (const f of forms) {
      if (f.synced_at) brain_forms.forms_with_synced_at++;
      const n = String(f.form_name ?? "").trim() || "(blank)";
      const t = String(f.form_template_name ?? "").trim() || "(blank)";
      inc(fn, n, 1);
      inc(tn, t, 1);
      if (!jobsByTemplate.has(t)) jobsByTemplate.set(t, new Set());
      jobsByTemplate.get(t).add(String(f.job_id));
    }
    brain_forms.top_form_names = topNFromMap(fn, 50);
    brain_forms.top_template_names = topNFromMap(tn, 50);
    const jpt = new Map();
    for (const [tpl, set] of jobsByTemplate) jpt.set(tpl, set.size);
    brain_forms.distinct_jobs_per_template_top = topNFromMap(jpt, 50);
  } catch (e) {
    errors.push({ section: "brain_forms", message: String(e?.message || e) });
  }

  let brain_fields = {
    total_field_rows: 0,
    unique_normalized_labels: 0,
    top_100_normalized_labels: [],
    category_match_counts: {}
  };

  try {
    brain_fields.total_field_rows = await safeCount("brain_fields");
    const labelCounts = new Map();
    const catTotals = {};
    for (const d of FIELD_CATEGORY_DEFS) catTotals[d.id] = 0;

    let from = 0;
    const pageSize = 8000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from("brain_fields")
        .select("normalized_label")
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const row of data) {
        const lab = String(row.normalized_label ?? "").trim() || "(blank)";
        inc(labelCounts, lab, 1);
        for (const tag of categorizeLabel(lab)) catTotals[tag] = (catTotals[tag] || 0) + 1;
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
    brain_fields.unique_normalized_labels = labelCounts.size;
    brain_fields.top_100_normalized_labels = topNFromMap(labelCounts, 100);
    brain_fields.category_match_counts = catTotals;
  } catch (e) {
    errors.push({ section: "brain_fields", message: String(e?.message || e) });
  }

  let brain_job_activities = {
    total_activities: 0,
    distinct_jobs: 0,
    date_range: { min: null, max: null },
    top_activity_types: [],
    top_activity_statuses: [],
    bucket_distinct_job_counts: {}
  };

  try {
    brain_job_activities.total_activities = await safeCount("brain_job_activities");

    const typeC = new Map();
    const statC = new Map();
    const bucketJobSets = Object.fromEntries(ACTIVITY_BUCKET_DEFS.map((d) => [d.key, new Set()]));

    let minD = null;
    let maxD = null;

    const arows = await fetchAllPaged(
      supabase
        .from("brain_job_activities")
        .select("job_id,activity_type,activity_status,start_date")
        .order("id", { ascending: true }),
      { pageSize: 4000 }
    );

    const jobSet = new Set();
    for (const a of arows) {
      jobSet.add(String(a.job_id));
      const at = String(a.activity_type ?? "").trim() || "(blank)";
      const as = String(a.activity_status ?? "").trim() || "(blank)";
      inc(typeC, at, 1);
      inc(statC, as, 1);
      const dk = bucketActivityRow(a.activity_type, a.activity_status);
      for (const k of Object.keys(dk)) bucketJobSets[k].add(String(a.job_id));
      const sd = a.start_date ? String(a.start_date) : "";
      if (sd) {
        if (!minD || sd < minD) minD = sd;
        if (!maxD || sd > maxD) maxD = sd;
      }
    }
    brain_job_activities.distinct_jobs = jobSet.size;
    brain_job_activities.date_range = { min: minD, max: maxD };
    brain_job_activities.top_activity_types = topNFromMap(typeC, 100);
    brain_job_activities.top_activity_statuses = topNFromMap(statC, 100);
    const bcounts = {};
    for (const d of ACTIVITY_BUCKET_DEFS) {
      bcounts[d.label] = bucketJobSets[d.key]?.size ?? 0;
    }
    brain_job_activities.bucket_distinct_job_counts = bcounts;
  } catch (e) {
    errors.push({ section: "brain_job_activities", message: String(e?.message || e) });
  }

  let operational_summary = {
    total_rows: 0,
    flag_counts: {},
    notes_empty_or_sparse: { operational_notes_empty: 0, raw_json_empty: 0 },
    top_missing_or_empty_columns: []
  };

  try {
    operational_summary.total_rows = await safeCount("brain_job_operational_summary");
    const sums = await fetchAllPaged(supabase.from("brain_job_operational_summary").select("*"), { pageSize: 2000 });
    const empties = new Map();
    function bumpEmpty(col) {
      inc(empties, col, 1);
    }
    const flags = [
      "has_template_activity",
      "has_install_activity",
      "has_order_stone_activity",
      "has_fabrication_activity",
      "has_saw_activity",
      "has_polish_activity",
      "has_customer_service_signal",
      "has_remake_signal",
      "has_repair_signal",
      "has_change_signal",
      "has_slab_signal"
    ];
    const fc = Object.fromEntries(flags.map((f) => [f, 0]));
    let notesEmpty = 0;
    let rawEmpty = 0;
    const emptyTrackCols = [
      "template_dates",
      "install_dates",
      "slab_numbers",
      "activity_count",
      "phase_count",
      "contact_count",
      "operational_notes_text"
    ];
    for (const r of sums) {
      for (const f of flags) {
        if (r[f] === true) fc[f]++;
      }
      if (!nonEmpty(r.operational_notes_text)) notesEmpty++;
      if (r.raw_json == null || (typeof r.raw_json === "object" && Object.keys(r.raw_json).length === 0)) rawEmpty++;
      for (const c of emptyTrackCols) {
        const v = r[c];
        if (v == null) bumpEmpty(`${c} (null)`);
        else if (typeof v === "string" && !nonEmpty(v)) bumpEmpty(`${c} (blank text)`);
        else if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0)
          bumpEmpty(`${c} (empty object)`);
      }
    }
    operational_summary.flag_counts = fc;
    operational_summary.notes_empty_or_sparse = {
      operational_notes_empty: notesEmpty,
      raw_json_empty: rawEmpty,
      total_sampled: sums.length
    };
    operational_summary.top_missing_or_empty_columns = topNFromMap(empties, 25);
  } catch (e) {
    errors.push({ section: "operational_summary", message: String(e?.message || e) });
  }

  let sync_health = {
    latest_sync_runs: [],
    latest_sync_run: null,
    latest_success_sync: null,
    latest_operational_sync_run: null,
    latest_success_operational_sync_run: null,
    latest_field_form_job_counts: null,
    partial_error_and_failed_counts: {},
    unresolved_failed_jobs: 0,
    latest_lock: null,
    note: "aggregates from brain_sync_runs + eos_failed_job_syncs + eos_sync_locks"
  };

  try {
    const runs = await fetchAllPaged(
      supabase
        .from("brain_sync_runs")
        .select(
          "id,mode,started_at,finished_at,status,jobs_ingested,forms_extracted,fields_extracted,worksheet_sqft_total,ingest_operational,error_message"
        )
        .order("finished_at", { ascending: false }),
      { pageSize: 20 }
    );
    sync_health.latest_sync_runs = runs.slice(0, 15);
    sync_health.latest_sync_run = runs[0] ?? null;

    const okRuns = runs.filter((r) => String(r.status ?? "").toLowerCase() === "success");
    sync_health.latest_success_sync = okRuns[0] ?? null;
    sync_health.latest_operational_sync_run =
      runs.find((r) => r.ingest_operational === true) ?? null;
    sync_health.latest_success_operational_sync_run =
      okRuns.find((r) => r.ingest_operational === true) ?? null;

    const { count: peCount } = await supabase
      .from("brain_sync_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "partial_error");
    const { count: failCount } = await supabase
      .from("brain_sync_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed");

    const uc = await supabase
      .from("eos_failed_job_syncs")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false);
    sync_health.unresolved_failed_jobs = uc.count ?? 0;

    const lastRun = runs[0];
    sync_health.latest_field_form_job_counts = lastRun
      ? {
          jobs_ingested: lastRun.jobs_ingested ?? null,
          forms_extracted: lastRun.forms_extracted ?? null,
          fields_extracted: lastRun.fields_extracted ?? null,
          worksheet_sqft_total: lastRun.worksheet_sqft_total ?? null,
          finished_at: lastRun.finished_at ?? null,
          status: lastRun.status ?? null
        }
      : null;

    sync_health.partial_error_and_failed_counts = {
      partial_error_runs: peCount ?? 0,
      failed_status_runs: failCount ?? 0
    };

    const lock = await supabase.from("eos_sync_locks").select("lock_name,locked_at,locked_by,expires_at").limit(5);
    if (!lock.error) sync_health.latest_lock = lock.data?.[0] ?? null;
  } catch (e) {
    errors.push({ section: "sync_health", message: String(e?.message || e) });
  }

  const gapAnalysis = buildGapAnalysis();

  const report = {
    meta,
    errors,
    brain_jobs,
    brain_forms,
    brain_fields,
    brain_job_activities,
    operational_summary,
    sync_health,
    gapAnalysis,
    ingestion_recommendations: buildIngestionRecommendations()
  };

  const jsonPath = path.join(latestDir, "deep-brain-coverage.json");
  const txtPath = path.join(latestDir, "deep-brain-coverage.txt");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(txtPath, renderTxt(report), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${txtPath}`);
  if (errors.length) console.warn("Sections with errors:", errors);

  return report;
}

function safeNumber(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function buildIngestionRecommendations() {
  return {
    priority1_titans_today: [
      {
        goal: "/api/titans/today & Are the Titans Flowing",
        moraware_source: "jobActivityQuery / synced brain_job_activities rows (already ingested); jobQuery for static job context",
        target_supabase: "brain_job_activities, brain_jobs (read-only API — no new schema strictly required)",
        schema_change: "none for MVP read-only aggregations",
        risk: "low",
        test_plan: "Compare a known shop job's activities vs Moraware UI same day filter."
      }
    ],
    priority2_quote_head: [
      {
        goal: "Partner Quoting Platform — canonical quote fields",
        moraware_source: "jobFormQuery / worksheet fields (already land in brain_fields); may need explicit template IDs whitelist",
        target_supabase: "brain_fields, brain_forms; future quote_* tables for authored quotes",
        schema_change: "likely additive Supabase tables for quotes once labels stabilized",
        risk: "medium",
        test_plan: "Cross-check top quote-related labels from audit vs finance spreadsheet samples."
      }
    ],
    priority3_material_flow: [
      {
        goal: "Material Flow / Purchasing Intelligence",
        moraware_source: "activities for order stone/install + brain_fields color/slab + brain_job_operational_summary.slab_numbers",
        target_supabase: "existing Brain tables; future inventory_bridge table for SlabSmith",
        schema_change: "additive when SlabSmith integration exists",
        risk: "medium",
        test_plan: "Pick jobs with known slab issues; verify signals match PM intuition."
      }
    ],
    priority4_sales_head: [
      {
        goal: "Sales Head cohort reporting",
        moraware_source: "brain_jobs salesperson + creation_date + worksheet_sqft",
        target_supabase: "brain_jobs (+ optional CRM sync later)",
        schema_change: "none for first dashboard",
        risk: "low",
        test_plan: "Match executive /salesperson-performance vs Moraware exports."
      }
    ],
    priority5_production_head: [
      {
        goal: "Production floor visibility",
        moraware_source: "brain_job_activities + operational summary flags",
        target_supabase: "brain_job_activities, brain_job_operational_summary",
        schema_change: "optional materialized views later — not required for MVP",
        risk: "low",
        test_plan: "Spot-check activity buckets vs Moraware job schedule screens."
      }
    ]
  };
}

const runDirect =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (runDirect) {
  runDeepBrainCoverageAudit().catch((e) => {
    console.error(e?.stack || e);
    process.exitCode = 1;
  });
}
