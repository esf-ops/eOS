#!/usr/bin/env node
/**
 * Read-only audit: operational expansion columns / tables (activities, addresses, phases, notes scope).
 * Writes debug/moraware/latest/operational-expansion-coverage.{json,txt}
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (read-only usage; no writes).
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function fetchActivitiesSample(supabase, maxTotal, orderAscending) {
  const rows = [];
  let from = 0;
  const pageSize = 2000;
  while (rows.length < maxTotal) {
    const take = Math.min(pageSize, maxTotal - rows.length);
    const { data, error } = await supabase
      .from("brain_job_activities")
      .select("*")
      .order("id", { ascending: orderAscending })
      .range(from, from + take - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < take) break;
    from += take;
  }
  return rows;
}

async function safeCount(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0, error: null };
}

async function main() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const latestDir = path.join(process.cwd(), "debug", "moraware", "latest");
  await fs.mkdir(latestDir, { recursive: true });
  const outJson = path.join(latestDir, "operational-expansion-coverage.json");
  const outTxt = path.join(latestDir, "operational-expansion-coverage.txt");

  const maxActivitySample = Number.parseInt(String(process.env.MORAWARE_AUDIT_ACTIVITY_MAX_ROWS ?? "25000"), 10) || 25000;
  // Default: newest rows first so expansion columns reflect recent operational syncs, not historical pre-migration rows.
  const orderAscending = String(process.env.MORAWARE_AUDIT_ACTIVITY_ORDER_ASC ?? "").trim() === "1";
  const activities = await fetchActivitiesSample(supabase, maxActivitySample, orderAscending);

  const actWith = (pred) => activities.filter(pred).length;

  const activities_with_start_date = actWith((r) => r.start_date != null && String(r.start_date).trim() !== "");
  const activities_with_sched_time = actWith((r) => r.sched_time != null && String(r.sched_time).trim() !== "");
  const activities_with_duration = actWith((r) => r.duration != null && String(r.duration).trim() !== "");
  const activities_with_notes = actWith((r) => r.notes != null && String(r.notes).trim() !== "");
  const activities_with_description = actWith((r) => r.description != null && String(r.description).trim() !== "");
  const activities_with_phase_name = actWith((r) => r.phase_name != null && String(r.phase_name).trim() !== "");
  const activities_with_phase_id = actWith((r) => r.phase_id != null && String(r.phase_id).trim() !== "");
  const activities_with_activity_type_name = actWith(
    (r) => r.activity_type_name != null && String(r.activity_type_name).trim() !== ""
  );
  const activities_with_status_name = actWith((r) => r.status_name != null && String(r.status_name).trim() !== "");

  const activities_with_legacy_activity_type = actWith(
    (r) => r.activity_type != null && String(r.activity_type).trim() !== ""
  );
  const activities_with_legacy_activity_status = actWith(
    (r) => r.activity_status != null && String(r.activity_status).trim() !== ""
  );
  const activities_with_legacy_phase_name = actWith(
    (r) => r.phase_name != null && String(r.phase_name).trim() !== ""
  );

  const addrCount = await safeCount(supabase, "brain_job_addresses");
  const phaseCount = await safeCount(supabase, "brain_job_phases");
  const scopeCount = await safeCount(supabase, "brain_job_notes_scope_signals");

  let jobs_with_address = null;
  let jobs_with_phase_rows = null;
  let jobs_with_scope_note_signals = null;

  if (!addrCount.error) {
    const { data, error } = await supabase.from("brain_job_addresses").select("job_id");
    if (!error && data) jobs_with_address = new Set(data.map((r) => String(r.job_id))).size;
  }
  if (!phaseCount.error) {
    const { data, error } = await supabase.from("brain_job_phases").select("job_id");
    if (!error && data) jobs_with_phase_rows = new Set(data.map((r) => String(r.job_id))).size;
  }
  if (!scopeCount.error) {
    const { data, error } = await supabase
      .from("brain_job_notes_scope_signals")
      .select("job_id")
      .eq("has_scope_like_lines", true);
    if (!error && data) jobs_with_scope_note_signals = new Set(data.map((r) => String(r.job_id))).size;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    tables: {
      brain_job_activities_row_sample: activities.length,
      brain_job_activities_sample_order: orderAscending ? "id_asc_oldest_first" : "id_desc_newest_first",
      brain_job_activities_sample_cap: maxActivitySample,
      brain_job_addresses_count: addrCount.count,
      brain_job_phases_count: phaseCount.count,
      brain_job_notes_scope_signals_count: scopeCount.count
    },
    counts: {
      activities_with_start_date,
      activities_with_sched_time,
      activities_with_duration,
      activities_with_notes,
      activities_with_description,
      activities_with_phase_name,
      activities_with_phase_id,
      activities_with_activity_type_name,
      activities_with_status_name,
      activities_with_legacy_activity_type,
      activities_with_legacy_activity_status,
      activities_with_legacy_phase_name,
      jobs_with_address,
      jobs_with_phase_rows,
      jobs_with_scope_note_signals
    },
    errors: {
      brain_job_addresses: addrCount.error,
      brain_job_phases: phaseCount.error,
      brain_job_notes_scope_signals: scopeCount.error
    }
  };

  await fs.writeFile(outJson, JSON.stringify(report, null, 2), "utf8");

  const txt = [
    "OPERATIONAL EXPANSION COVERAGE (read-only)",
    `generatedAt: ${report.generatedAt}`,
    "",
    `brain_job_activities rows sampled (cap=${maxActivitySample}, order=${report.tables.brain_job_activities_sample_order}): ${activities.length}`,
    `activities_with_start_date: ${activities_with_start_date}`,
    `activities_with_sched_time: ${activities_with_sched_time}`,
    `activities_with_duration: ${activities_with_duration}`,
    `activities_with_notes: ${activities_with_notes}`,
    `activities_with_description: ${activities_with_description}`,
    `activities_with_phase_name: ${activities_with_phase_name}`,
    `activities_with_phase_id: ${activities_with_phase_id}`,
    `activities_with_activity_type_name: ${activities_with_activity_type_name}`,
    `activities_with_status_name: ${activities_with_status_name}`,
    `activities_with_legacy_activity_type: ${activities_with_legacy_activity_type}`,
    `activities_with_legacy_activity_status: ${activities_with_legacy_activity_status}`,
    `activities_with_legacy_phase_name: ${activities_with_legacy_phase_name}`,
    "",
    `jobs_with_address (distinct): ${jobs_with_address ?? "n/a"}`,
    `jobs_with_phase_rows (distinct job_id): ${jobs_with_phase_rows ?? "n/a"}`,
    `jobs_with_scope_note_signals (has_scope_like_lines): ${jobs_with_scope_note_signals ?? "n/a"}`,
    "",
    "Table row counts:",
    `  brain_job_addresses: ${addrCount.count ?? "error"} ${addrCount.error || ""}`,
    `  brain_job_phases: ${phaseCount.count ?? "error"} ${phaseCount.error || ""}`,
    `  brain_job_notes_scope_signals: ${scopeCount.count ?? "error"} ${scopeCount.error || ""}`
  ].join("\n");

  await fs.writeFile(outTxt, txt, "utf8");
  console.log(`[auditOperationalExpansionCoverage] Wrote ${outJson}`);
  console.log(`[auditOperationalExpansionCoverage] Wrote ${outTxt}`);
}

main().catch((e) => {
  console.error("[auditOperationalExpansionCoverage]", e?.message || e);
  process.exit(1);
});
