/**
 * Read-only audit: Titan / saw “today” data readiness in Supabase Brain.
 * Output: debug/moraware/latest/titans-today-readiness.{json,txt}
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

async function fetchAllPaged(queryBuilder, { pageSize = 1500 } = {}) {
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

/** Server local calendar “today” (Node TZ). */
function localTodayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

const TYPE_KEYWORD_RES = [
  { id: "titan", re: /\btitan\b/i },
  { id: "saw", re: /\bsaw\b/i },
  { id: "sawyer", re: /sawyer/i },
  { id: "cutting", re: /cutting/i },
  { id: "cut", re: /\bcut\b/i },
  { id: "cnc", re: /\bcnc\b/i },
  { id: "program", re: /program/i },
  { id: "production", re: /production/i },
  { id: "fab", re: /\bfab\b/i },
  { id: "fabrication", re: /fabrication/i },
  { id: "polish", re: /polish/i },
  { id: "shop", re: /\bshop\b/i }
];

const STATUS_BUCKET_RES = [
  { id: "scheduled", re: /schedule/i },
  { id: "confirmed", re: /confirm/i },
  { id: "active_in_progress", re: /in\s*progress|active|started|processing/i },
  { id: "complete", re: /complete|completed|done|installed/i },
  { id: "hold_delayed", re: /hold|delayed|delay/i },
  { id: "cancelled", re: /cancel/i }
];

function combinedActivityText(row) {
  return [row.activity_type, row.activity_status, row.phase_name, row.description, row.notes].map((x) => String(x ?? "")).join(" | ");
}

function isTitanLikeActivity(row) {
  const blob = combinedActivityText(row);
  return TYPE_KEYWORD_RES.some((d) => d.re.test(blob));
}

function parseYmdDate(s) {
  const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function run() {
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(__filename), "../../..");
  const outDir = path.join(repoRoot, "debug", "moraware", "latest");
  await fs.mkdir(outDir, { recursive: true });

  const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const todayYmd = localTodayYmd();
  const errors = [];

  const activityTypeDiscovery = {};
  const activityStatusDiscovery = {};
  const typeKeywordHits = {};
  for (const d of TYPE_KEYWORD_RES) {
    typeKeywordHits[d.id] = {
      keyword: d.id,
      pattern: String(d.re),
      activity_type_id: "not_in_schema",
      rows_matching: 0,
      distinct_activity_types: new Map(),
      distinct_statuses: new Map(),
      date_range: { min_start_date: null, max_start_date: null },
      latest_synced_at: null,
      sample_job_ids: [],
      sample_job_names: [],
      sample_activity_rows: []
    };
  }

  const activities = await fetchAllPaged(
    supabase
      .from("brain_job_activities")
      .select(
        "id,job_id,activity_index,activity_type,activity_status,phase_name,start_date,sched_time,duration,description,notes,raw_json,synced_at"
      )
      .order("id", { ascending: true }),
    { pageSize: 2000 }
  );

  const byType = new Map();
  const byStatus = new Map();
  let minD = null;
  let maxD = null;

  const todayCandidates = [];
  const todayTitanLike = [];

  for (const row of activities) {
    const at = String(row.activity_type ?? "").trim() || "(blank_type)";
    const st = String(row.activity_status ?? "").trim() || "(blank_status)";
    inc(byType, at, 1);
    inc(byStatus, st, 1);

    const sd = row.start_date ? parseYmdDate(row.start_date) : null;
    if (sd) {
      if (!minD || sd < minD) minD = sd;
      if (!maxD || sd > maxD) maxD = sd;
    }

    const blob = combinedActivityText(row);
    for (const d of TYPE_KEYWORD_RES) {
      if (!d.re.test(blob)) continue;
      const bucket = typeKeywordHits[d.id];
      bucket.rows_matching++;
      inc(bucket.distinct_activity_types, at, 1);
      inc(bucket.distinct_statuses, st, 1);
      if (sd) {
        if (!bucket.date_range.min_start_date || sd < bucket.date_range.min_start_date)
          bucket.date_range.min_start_date = sd;
        if (!bucket.date_range.max_start_date || sd > bucket.date_range.max_start_date)
          bucket.date_range.max_start_date = sd;
      }
      const syncAt = row.synced_at ? String(row.synced_at) : "";
      if (syncAt && (!bucket.latest_synced_at || syncAt > bucket.latest_synced_at))
        bucket.latest_synced_at = syncAt;
      if (bucket.sample_job_ids.length < 12) bucket.sample_job_ids.push(String(row.job_id));
      if (bucket.sample_activity_rows.length < 5) {
        bucket.sample_activity_rows.push({
          id: row.id,
          job_id: row.job_id,
          activity_type: row.activity_type,
          activity_status: row.activity_status,
          start_date: row.start_date,
          sched_time: row.sched_time
        });
      }
    }

    if (sd === todayYmd) {
      todayCandidates.push(row);
      if (isTitanLikeActivity(row)) todayTitanLike.push(row);
    }
  }

  const jobNameCache = new Map();
  async function loadJobMeta(jobIds) {
    const unique = [...new Set(jobIds.map(String))].filter(Boolean);
    for (let i = 0; i < unique.length; i += 200) {
      const chunk = unique.slice(i, i + 200);
      const { data, error } = await supabase
        .from("brain_jobs")
        .select("job_id,job_name,account_name,worksheet_sqft,job_status,creation_date")
        .in("job_id", chunk);
      if (error) {
        errors.push(`brain_jobs chunk: ${error.message}`);
        continue;
      }
      for (const j of data ?? []) jobNameCache.set(String(j.job_id), j);
    }
  }

  for (const k of Object.keys(typeKeywordHits)) {
    const b = typeKeywordHits[k];
    b.distinct_activity_types = topNFromMap(b.distinct_activity_types, 30);
    b.distinct_statuses = topNFromMap(b.distinct_statuses, 30);
    const ids = b.sample_job_ids.slice(0, 15);
    await loadJobMeta(ids);
    b.sample_job_names = ids.map((id) => ({
      job_id: id,
      job_name: jobNameCache.get(id)?.job_name ?? "",
      account_name: jobNameCache.get(id)?.account_name ?? ""
    }));
  }

  const topActivityTypes = topNFromMap(byType, 150);
  const topActivityStatuses = topNFromMap(byStatus, 150);

  for (const row of activities) {
    const st = String(row.activity_status ?? "").trim() || "(blank_status)";
    for (const b of STATUS_BUCKET_RES) {
      if (!b.re.test(st)) continue;
      if (!activityStatusDiscovery[st]) {
        activityStatusDiscovery[st] = {
          status_name: st,
          status_id: "not_in_schema",
          count: 0,
          sample_job_ids: []
        };
      }
      const entry = activityStatusDiscovery[st];
      entry.count++;
      if (entry.sample_job_ids.length < 8) entry.sample_job_ids.push(String(row.job_id));
    }
  }

  const statusDiscoveryList = Object.values(activityStatusDiscovery).sort((a, b) => b.count - a.count);

  function classifyTodayRow(row) {
    const stLow = String(row.activity_status ?? "").toLowerCase();
    if (/complete|done|installed/i.test(stLow)) return "completed";
    if (/hold|delay|cancel/i.test(stLow)) return "held_or_delayed";
    if (/schedule|estimate|confirm/i.test(stLow) && !/complete|installed/i.test(stLow)) return "queued_or_scheduled";
    if (/auto-schedule|processing|fabrication|saw|polish|titan|cut/i.test(stLow)) return "likely_active_or_floor";
    return "other";
  }

  const todayByClass = { completed: [], held_or_delayed: [], queued_or_scheduled: [], likely_active_or_floor: [], other: [] };
  for (const row of todayTitanLike) {
    todayByClass[classifyTodayRow(row)].push(row);
  }

  const candidateJobIds = [...new Set(todayTitanLike.map((r) => String(r.job_id)))];
  await loadJobMeta(candidateJobIds);

  let phasesCount = { table_present: false, rows: 0 };
  try {
    const { count, error } = await supabase.from("brain_job_phases").select("*", { count: "exact", head: true });
    if (error) throw error;
    phasesCount = { table_present: true, rows: count ?? 0 };
  } catch (e) {
    phasesCount = { table_present: false, error: String(e?.message || e) };
  }

  let opRows = [];
  try {
    if (candidateJobIds.length) {
      for (let i = 0; i < candidateJobIds.length; i += 150) {
        const chunk = candidateJobIds.slice(i, i + 150);
        const { data, error } = await supabase.from("brain_job_operational_summary").select("*").in("job_id", chunk);
        if (error) throw new Error(error.message);
        opRows.push(...(data ?? []));
      }
    }
  } catch (e) {
    errors.push(`operational_summary: ${e?.message || e}`);
  }

  const colorRe = /color|material|granite|quartz|slab/i;
  const fieldsForCandidates = [];
  try {
    if (candidateJobIds.length) {
      for (let i = 0; i < candidateJobIds.length; i += 100) {
        const chunk = candidateJobIds.slice(i, i + 100);
        const { data, error } = await supabase
          .from("brain_fields")
          .select("job_id,normalized_label,label,value")
          .in("job_id", chunk)
          .or("normalized_label.ilike.%color%,normalized_label.ilike.%material%,label.ilike.%color%,label.ilike.%material%");
        if (error) throw new Error(error.message);
        fieldsForCandidates.push(...(data ?? []));
      }
    }
  } catch (e) {
    errors.push(`brain_fields color query: ${e?.message || e}`);
  }

  const jobHasColor = new Set();
  const colorValues = new Map();
  for (const f of fieldsForCandidates) {
    const lab = `${f.normalized_label ?? ""} ${f.label ?? ""}`;
    if (!colorRe.test(lab)) continue;
    jobHasColor.add(String(f.job_id));
    const v = String(f.value ?? "").trim();
    if (v) inc(colorValues, v.slice(0, 120), 1);
  }

  let sqftFieldSumByJob = new Map();
  try {
    if (candidateJobIds.length) {
      for (let i = 0; i < candidateJobIds.length; i += 100) {
        const chunk = candidateJobIds.slice(i, i + 100);
        const { data, error } = await supabase
          .from("brain_fields")
          .select("job_id,normalized_label,label,numeric_value,value")
          .in("job_id", chunk)
          .or("normalized_label.ilike.%sq%,normalized_label.ilike.%sqft%,label.ilike.%Sq%,label.ilike.%sq%");
        if (error) throw new Error(error.message);
        for (const r of data ?? []) {
          const n = r.numeric_value != null ? safeNum(r.numeric_value) : safeNum(r.value);
          if (n == null || n <= 0) continue;
          const jid = String(r.job_id);
          sqftFieldSumByJob.set(jid, (sqftFieldSumByJob.get(jid) || 0) + n);
        }
      }
    }
  } catch (e) {
    errors.push(`brain_fields sqft query: ${e?.message || e}`);
  }

  let worksheetSqftOk = 0;
  let worksheetSqftMissing = 0;
  let totalSqftCandidates = 0;
  let sqftFromFieldsOnly = 0;

  for (const jid of candidateJobIds) {
    const j = jobNameCache.get(jid);
    const ws = j?.worksheet_sqft != null ? safeNum(j.worksheet_sqft) : null;
    if (ws != null && ws > 0) {
      worksheetSqftOk++;
      totalSqftCandidates += ws;
    } else {
      worksheetSqftMissing++;
      const fsq = sqftFieldSumByJob.get(jid);
      if (fsq != null && fsq > 0) {
        sqftFromFieldsOnly++;
        totalSqftCandidates += fsq;
      }
    }
  }

  const formsStats = { form_rows_for_candidate_jobs: 0, top_form_templates: [] };
  try {
    const tmpl = new Map();
    if (candidateJobIds.length) {
      for (let i = 0; i < candidateJobIds.length; i += 120) {
        const chunk = candidateJobIds.slice(i, i + 120);
        const { data, error } = await supabase
          .from("brain_forms")
          .select("form_template_name,form_name")
          .in("job_id", chunk);
        if (error) throw new Error(error.message);
        for (const f of data ?? []) {
          formsStats.form_rows_for_candidate_jobs++;
          const t = String(f.form_template_name ?? "").trim() || "(blank_template)";
          inc(tmpl, t, 1);
        }
      }
      formsStats.top_form_templates = topNFromMap(tmpl, 20);
    }
  } catch (e) {
    errors.push(`brain_forms: ${e?.message || e}`);
  }

  const widgetSupport = {
    job_name: candidateJobIds.filter((id) => nonEmpty(jobNameCache.get(id)?.job_name)).length,
    account: candidateJobIds.filter((id) => nonEmpty(jobNameCache.get(id)?.account_name)).length,
    material_color: jobHasColor.size,
    material_color_missing: Math.max(0, candidateJobIds.length - jobHasColor.size),
    worksheet_sqft_brain_jobs: worksheetSqftOk,
    worksheet_sqft_missing: worksheetSqftMissing,
    sqft_from_fields_fallback: sqftFromFieldsOnly,
    job_status_column: candidateJobIds.filter((id) => nonEmpty(jobNameCache.get(id)?.job_status)).length,
    operational_summary_rows: opRows.length,
    template_signal: opRows.filter((r) => r.has_template_activity === true).length,
    order_stone_signal: opRows.filter((r) => r.has_order_stone_activity === true).length,
    install_signal: opRows.filter((r) => r.has_install_activity === true).length,
    slab_signal: opRows.filter((r) => r.has_slab_signal === true).length,
    brain_forms_for_candidates: formsStats
  };

  const statusMappingRecommendation = {
    intent: "Map Moraware activity_status + activity_type (text) to leadership-facing statuses",
    proposed_rules: [
      {
        eos: "Cutting Now",
        when: "activity_status/type suggests active floor work (e.g. Saw, Titan Program, Fabrication, Polish in non-terminal state)"
      },
      {
        eos: "Queued for Titan",
        when: "Scheduled/Estimate/Auto-Schedule for Titan/Saw/Program activities not completed"
      },
      {
        eos: "Cut Complete",
        when: "activity_status indicates Complete/Done/Installed for saw/Titan/fabrication slice"
      },
      {
        eos: "Held / Needs Review",
        when: "Hold, delay, cancel-adjacent statuses or CS/remake signals (cross-check operational summary)"
      },
      {
        eos: "Missing Material",
        when: "operational has_slab_signal / order_stone lag heuristics OR explicit CS material notes (future)"
      },
      {
        eos: "Waiting on Template",
        when: "Template activity not complete before saw/Titan in same job (phase ordering heuristic)"
      },
      {
        eos: "Ready for Next Phase",
        when: "Titan/saw slice complete and downstream install/order_stone not started"
      }
    ],
    caution:
      "Moraware does not expose PLC/machine telemetry in Brain; treat as Titan/Saw Activity Signals, not guaranteed real-time blade state."
  };

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      localTodayYmd: todayYmd,
      timezone_note: "start_date filters use calendar date; server uses Node local TZ for 'today'",
      supabase_host: new URL(requiredEnv("SUPABASE_URL")).host
    },
    errors,
    schema_notes: {
      brain_job_activities: "columns include activity_type, activity_status, start_date, sched_time, synced_at (no activity_type_id in schema)",
      brain_job_phases: phasesCount
    },
    part1_activity_type_discovery: {
      summary: "keyword groups over combined activity_type + activity_status + description + notes",
      by_keyword: typeKeywordHits,
      top_activity_types_global: topActivityTypes,
      top_activity_statuses_global: topActivityStatuses
    },
    part2_activity_status_discovery: {
      statuses_matching_inventory_regex: statusDiscoveryList.slice(0, 80)
    },
    part3_today_activity_candidates: {
      today_ymd: todayYmd,
      all_activities_with_start_date_today: todayCandidates.length,
      titan_like_activities_start_date_today: todayTitanLike.length,
      distinct_jobs_titan_like_today: candidateJobIds.length,
      by_bucket_counts: {
        completed: todayByClass.completed.length,
        held_or_delayed: todayByClass.held_or_delayed.length,
        queued_or_scheduled: todayByClass.queued_or_scheduled.length,
        likely_active_or_floor: todayByClass.likely_active_or_floor.length,
        other: todayByClass.other.length
      },
      samples: {
        today_titan_like_first_15: todayTitanLike.slice(0, 15).map((r) => ({
          job_id: r.job_id,
          activity_type: r.activity_type,
          activity_status: r.activity_status,
          start_date: r.start_date,
          sched_time: r.sched_time
        })),
        completed_today_titan_like: todayByClass.completed.slice(0, 8).map((r) => ({
          job_id: r.job_id,
          activity_type: r.activity_type,
          activity_status: r.activity_status
        })),
        held_delayed: todayByClass.held_or_delayed.slice(0, 8).map((r) => ({
          job_id: r.job_id,
          activity_type: r.activity_type,
          activity_status: r.activity_status
        }))
      },
      activity_date_range_global: { min_start_date: minD, max_start_date: maxD }
    },
    part4_widget_field_support: {
      candidate_job_count: candidateJobIds.length,
      coverage: widgetSupport
    },
    part5_material_color: {
      jobs_with_color_signal: jobHasColor.size,
      jobs_missing_color_signal: Math.max(0, candidateJobIds.length - jobHasColor.size),
      top_color_values: topNFromMap(colorValues, 40)
    },
    part6_sqft: {
      jobs_with_worksheet_sqft: worksheetSqftOk,
      jobs_missing_worksheet_sqft: worksheetSqftMissing,
      jobs_with_sqft_from_fields_fallback: sqftFromFieldsOnly,
      total_sqft_summed_for_candidates: totalSqftCandidates
    },
    part7_status_mapping_recommendation: statusMappingRecommendation,
    brain_forms_for_today_candidates: formsStats
  };

  const txt = renderTxt(report);

  await fs.writeFile(path.join(outDir, "titans-today-readiness.json"), JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(path.join(outDir, "titans-today-readiness.txt"), txt, "utf8");
  console.log(`Wrote ${path.join(outDir, "titans-today-readiness.json")}`);
  console.log(`Wrote ${path.join(outDir, "titans-today-readiness.txt")}`);
  if (errors.length) console.warn("Warnings:", errors);
}

function renderTxt(r) {
  const w = [];
  const ln = (s) => w.push(String(s));
  ln("=".repeat(72));
  ln("Titans / Saw — today readiness audit");
  ln(`Generated: ${r.meta.generatedAt}`);
  ln(`Local today (start_date YMD): ${r.meta.localTodayYmd}`);
  ln("=".repeat(72));
  ln("");
  ln("--- Part 3: Today Titan-like candidates ---");
  ln(`all activities with start_date=today: ${r.part3_today_activity_candidates.all_activities_with_start_date_today}`);
  ln(`titan-like (keywords) start_date=today: ${r.part3_today_activity_candidates.titan_like_activities_start_date_today}`);
  ln(`distinct jobs: ${r.part3_today_activity_candidates.distinct_jobs_titan_like_today}`);
  ln(JSON.stringify(r.part3_today_activity_candidates.by_bucket_counts, null, 2));
  ln("");
  ln("--- Part 4–6: Widget coverage (today Titan-like job set) ---");
  ln(JSON.stringify(r.part4_widget_field_support.coverage, null, 2));
  ln(`Total Sq.Ft. summed: ${r.part6_sqft.total_sqft_summed_for_candidates}`);
  ln("");
  ln("--- Top color values (field subset) ---");
  ln(JSON.stringify(r.part5_material_color.top_color_values.slice(0, 20), null, 2));
  ln("");
  ln("--- Status mapping (summary) ---");
  ln(JSON.stringify(r.part7_status_mapping_recommendation.proposed_rules, null, 2));
  ln("");
  ln(r.meta.timezone_note);
  return w.join("\n") + "\n";
}

run().catch((e) => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});
