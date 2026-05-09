import { createClient } from "@supabase/supabase-js";

import { computeNormalizedLabelForBrainFieldRow } from "./brainFieldNormalizedLabel.js";

let _loggedDisabled = false;
let _client = null;

export function isSupabaseEnabled() {
  const url = String(process.env.SUPABASE_URL ?? "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return Boolean(url && key);
}

export function isSupabaseWriteEnabled() {
  return String(process.env.SUPABASE_WRITE_ENABLED ?? "").trim() === "1";
}

function getClientOrNull() {
  if (!isSupabaseWriteEnabled()) {
    if (!_loggedDisabled) {
      _loggedDisabled = true;
      console.log("Supabase disabled; using local JSON store only.");
    }
    return null;
  }

  const url = String(process.env.SUPABASE_URL ?? "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) {
    if (!_loggedDisabled) {
      _loggedDisabled = true;
      console.log("Supabase disabled; using local JSON store only.");
    }
    return null;
  }

  if (_client) return _client;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _client;
}

export function supabaseAdminClientOrThrow() {
  const url = String(process.env.SUPABASE_URL ?? "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseDateOrNull(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Prefer ISO yyyy-mm-dd
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  // Fallback mm/dd/yyyy → yyyy-mm-dd
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = String(us[1]).padStart(2, "0");
    const dd = String(us[2]).padStart(2, "0");
    return `${us[3]}-${mm}-${dd}`;
  }
  return null;
}

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

export async function upsertBrainJob(job) {
  const supabase = getClientOrNull();
  if (!supabase) return { skipped: true };

  const jobId = String(job?.jobInfo?.jobId ?? job?.source?.jobId ?? job?.jobId ?? "").trim();
  if (!jobId) throw new Error("upsertBrainJob: missing jobId");

  const row = {
    job_id: jobId,
    job_name: String(job?.jobInfo?.jobName ?? ""),
    account_id: String(job?.jobInfo?.accountId ?? job?.source?.accountId ?? ""),
    account_name: String(job?.jobInfo?.accountName ?? ""),
    creation_date: parseDateOrNull(job?.jobInfo?.creationDate),
    job_status: String(job?.jobInfo?.jobStatus ?? ""),
    salesperson_name: String(job?.jobInfo?.salespersonName ?? ""),
    notes: String(job?.jobInfo?.notes ?? ""),
    worksheet_sqft: toNumberOrNull(job?.metrics?.worksheetSqFt),
    total_sqft: toNumberOrNull(job?.metrics?.totalSqFt),
    form_count: Number(job?.metrics?.formCount ?? 0) || 0,
    field_count: Number(job?.metrics?.fieldCount ?? 0) || 0,
    job_worksheet_forms: Number(job?.metrics?.jobWorksheetForms ?? job?.metrics?.worksheetCount ?? 0) || 0,
    raw_json: job,
    synced_at: new Date().toISOString()
  };

  const { error } = await supabase.from("brain_jobs").upsert(row, { onConflict: "job_id" });
  if (error) throw new Error(`Supabase upsert brain_jobs failed: ${error.message}`);
  return { skipped: false, count: 1 };
}

export async function upsertBrainForms(job) {
  const supabase = getClientOrNull();
  if (!supabase) return { skipped: true };

  const jobId = String(job?.jobInfo?.jobId ?? job?.source?.jobId ?? job?.jobId ?? "").trim();
  if (!jobId) throw new Error("upsertBrainForms: missing jobId");

  const forms = Array.isArray(job?.forms) ? job.forms : [];
  if (!forms.length) return { skipped: false, count: 0 };

  const rows = forms
    .map((f) => {
      const formId = String(f?.formId ?? f?.id ?? "").trim();
      if (!formId) return null;
      return {
        form_id: formId,
        job_id: jobId,
        form_name: String(f?.formName ?? f?.name ?? ""),
        raw_form_name: String(f?.rawFormName ?? ""),
        form_template_id: String(f?.formTemplateId ?? f?.templateId ?? ""),
        form_template_name: String(f?.formTemplateName ?? f?.formTemplateName ?? f?.templateName ?? ""),
        phase_id: String(f?.phaseId ?? ""),
        phase_name: String(f?.phaseName ?? ""),
        phase_seq_num: f?.phaseSeqNum === "" || f?.phaseSeqNum == null ? null : Number(f.phaseSeqNum),
        raw_json: f,
        synced_at: new Date().toISOString()
      };
    })
    .filter(Boolean);

  if (!rows.length) return { skipped: false, count: 0 };
  const { error } = await supabase.from("brain_forms").upsert(rows, { onConflict: "form_id" });
  if (error) throw new Error(`Supabase upsert brain_forms failed: ${error.message}`);
  return { skipped: false, count: rows.length };
}

export async function upsertBrainFields(job) {
  const supabase = getClientOrNull();
  if (!supabase) return { skipped: true };

  const jobId = String(job?.jobInfo?.jobId ?? job?.source?.jobId ?? job?.jobId ?? "").trim();
  if (!jobId) throw new Error("upsertBrainFields: missing jobId");

  // Delete-first to avoid duplicates across runs.
  const del = await supabase.from("brain_fields").delete().eq("job_id", jobId);
  if (del.error) throw new Error(`Supabase delete brain_fields failed: ${del.error.message}`);

  const forms = Array.isArray(job?.forms) ? job.forms : [];
  const fieldRows = [];
  for (const f of forms) {
    const formId = String(f?.formId ?? f?.id ?? "").trim();
    const fields = Array.isArray(f?.fields) ? f.fields : [];
    for (const fld of fields) {
      fieldRows.push({
        job_id: jobId,
        form_id: formId || null,
        field_id: String(fld?.fieldId ?? ""),
        label: String(fld?.label ?? ""),
        normalized_label: computeNormalizedLabelForBrainFieldRow(fld),
        value: String(fld?.value ?? ""),
        numeric_value: toNumberOrNull(fld?.numericValue),
        field_value_id: String(fld?.fieldValueId ?? ""),
        data_type: String(fld?.dataType ?? ""),
        raw_json: fld,
        synced_at: new Date().toISOString()
      });
    }
  }

  if (!fieldRows.length) return { skipped: false, count: 0 };

  // Insert in chunks to avoid payload limits.
  const chunkSize = 1000;
  for (let i = 0; i < fieldRows.length; i += chunkSize) {
    const chunk = fieldRows.slice(i, i + chunkSize);
    const ins = await supabase.from("brain_fields").insert(chunk);
    if (ins.error) throw new Error(`Supabase insert brain_fields failed: ${ins.error.message}`);
  }
  return { skipped: false, count: fieldRows.length };
}

export async function saveSyncRun(summary, status, errorMessage) {
  const supabase = getClientOrNull();
  if (!supabase) return { skipped: true };

  const existingRunId = String(process.env.EOS_SYNC_RUN_ID ?? "").trim();
  const row = {
    mode: String(summary?.discoveryRuntimeMode ?? summary?.mode ?? ""),
    sync_start_date: summary?.syncStartDate ?? null,
    sync_end_date: summary?.syncEndDate ?? null,
    ingest_operational:
      summary?.ingestOperational == null ? null : Boolean(summary?.ingestOperational),
    started_at: summary?.startedAt ?? null,
    finished_at: summary?.finishedAt ?? null,
    process_count: Number(summary?.processCount ?? summary?.processesUsed?.length ?? 0) || 0,
    job_ids_discovered: Number(summary?.jobIdsDiscovered ?? 0) || 0,
    jobs_detailed: Number(summary?.jobsDetailed ?? 0) || 0,
    jobs_ingested: Number(summary?.jobsWithFormsIngested ?? summary?.jobsIngested ?? 0) || 0,
    forms_extracted: Number(summary?.formsExtracted ?? 0) || 0,
    fields_extracted: Number(summary?.fieldsExtracted ?? 0) || 0,
    activities_extracted: Number(summary?.activitiesExtracted ?? 0) || 0,
    phases_extracted: Number(summary?.phasesExtracted ?? 0) || 0,
    contacts_extracted: Number(summary?.contactsExtracted ?? 0) || 0,
    worksheet_sqft_total: toNumberOrNull(summary?.worksheetSqFtTotalAcrossBatch),
    status: String(status ?? ""),
    stopped_reason: summary?.stoppedReason ? String(summary.stoppedReason) : null,
    error_message: errorMessage ? String(errorMessage) : null,
    raw_summary: summary
  };

  if (existingRunId) {
    const up = await supabase.from("brain_sync_runs").update(row).eq("id", existingRunId);
    if (up.error) throw new Error(`Supabase update brain_sync_runs failed: ${up.error.message}`);
    return { skipped: false, count: 1, updated: true, id: existingRunId };
  }

  const { error } = await supabase.from("brain_sync_runs").insert(row);
  if (error) throw new Error(`Supabase insert brain_sync_runs failed: ${error.message}`);
  return { skipped: false, count: 1, inserted: true };
}

export async function acquireSyncLock({
  lockName,
  lockedBy,
  ttlMs = 2 * 60 * 60 * 1000,
  metadata
}) {
  const supabase = supabaseAdminClientOrThrow();
  const name = String(lockName ?? "").trim();
  if (!name) throw new Error("acquireSyncLock: lockName required");
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs);

  // If existing and not expired -> locked.
  const existing = await supabase.from("eos_sync_locks").select("*").eq("lock_name", name).limit(1);
  if (existing.error) throw new Error(existing.error.message);
  const row = existing.data?.[0] ?? null;
  if (row?.expires_at && Date.parse(String(row.expires_at)) > now.getTime()) {
    return { acquired: false, reason: "locked", lock: row };
  }

  // Upsert (overwrites stale or missing).
  const up = await supabase.from("eos_sync_locks").upsert(
    {
      lock_name: name,
      locked_at: now.toISOString(),
      locked_by: String(lockedBy ?? ""),
      expires_at: expires.toISOString(),
      metadata: metadata ?? null
    },
    { onConflict: "lock_name" }
  );
  if (up.error) throw new Error(up.error.message);
  return { acquired: true, lock: { lock_name: name, locked_at: now.toISOString(), locked_by: lockedBy, expires_at: expires.toISOString(), metadata: metadata ?? null } };
}

export async function releaseSyncLock(lockName) {
  const supabase = supabaseAdminClientOrThrow();
  const name = String(lockName ?? "").trim();
  if (!name) throw new Error("releaseSyncLock: lockName required");
  const del = await supabase.from("eos_sync_locks").delete().eq("lock_name", name);
  if (del.error) throw new Error(del.error.message);
  return { released: true };
}

export async function beginSyncRun({ mode, syncStartDate, syncEndDate, ingestOperational, rawSummary }) {
  const supabase = supabaseAdminClientOrThrow();
  const startedAt = new Date().toISOString();
  const row = {
    mode: String(mode ?? ""),
    sync_start_date: syncStartDate ?? null,
    sync_end_date: syncEndDate ?? null,
    ingest_operational: ingestOperational == null ? null : Boolean(ingestOperational),
    started_at: startedAt,
    finished_at: null,
    status: "running",
    raw_summary: rawSummary ?? null
  };
  const ins = await supabase.from("brain_sync_runs").insert(row).select("id").limit(1);
  if (ins.error) throw new Error(ins.error.message);
  const id = ins.data?.[0]?.id ?? null;
  if (!id) throw new Error("beginSyncRun: failed to retrieve sync run id");
  return { id, startedAt };
}

export async function finishSyncRun(
  syncRunId,
  { status, finishedAt, stoppedReason, errorMessage, rawSummaryPatch, metricsPatch }
) {
  const supabase = supabaseAdminClientOrThrow();
  const id = String(syncRunId ?? "").trim();
  if (!id) throw new Error("finishSyncRun: syncRunId required");
  const patch = {
    finished_at: finishedAt ?? new Date().toISOString(),
    status: String(status ?? ""),
    stopped_reason: stoppedReason ? String(stoppedReason) : null,
    error_message: errorMessage ? String(errorMessage) : null
  };
  if (rawSummaryPatch != null) patch.raw_summary = rawSummaryPatch;
  if (metricsPatch && typeof metricsPatch === "object") Object.assign(patch, metricsPatch);
  const up = await supabase.from("brain_sync_runs").update(patch).eq("id", id);
  if (up.error) throw new Error(up.error.message);
  return { updated: true };
}

export async function recordFailedJobSync({
  jobId,
  syncRunId,
  syncStage,
  errorMessage,
  payload,
  retryCount = 0
}) {
  const supabase = supabaseAdminClientOrThrow();
  const row = {
    job_id: String(jobId ?? ""),
    sync_run_id: syncRunId ?? null,
    sync_stage: String(syncStage ?? ""),
    error_message: String(errorMessage ?? ""),
    payload: payload ?? null,
    retry_count: Number(retryCount ?? 0) || 0,
    resolved: false,
    created_at: new Date().toISOString(),
    last_retry_at: null
  };
  const ins = await supabase.from("eos_failed_job_syncs").insert(row);
  if (ins.error) throw new Error(ins.error.message);
  return { recorded: true };
}

export async function replaceJobOperational(jobId, operational) {
  const supabase = getClientOrNull();
  if (!supabase) return { skipped: true };

  const jid = String(jobId ?? "").trim();
  if (!jid) throw new Error("replaceJobOperational: jobId required");

  const phases = Array.isArray(operational?.phases) ? operational.phases : [];
  const contacts = Array.isArray(operational?.contacts) ? operational.contacts : [];
  const activities = Array.isArray(operational?.activities) ? operational.activities : [];
  const summary = operational?.summary ?? null;

  // Delete-first to avoid duplicates across runs.
  const dels = await Promise.all([
    supabase.from("brain_job_phases").delete().eq("job_id", jid),
    supabase.from("brain_job_activities").delete().eq("job_id", jid),
    supabase.from("brain_job_contacts").delete().eq("job_id", jid),
    supabase.from("brain_job_operational_summary").delete().eq("job_id", jid)
  ]);
  for (const d of dels) {
    if (d.error) throw new Error(`Supabase delete operational rows failed: ${d.error.message}`);
  }

  const nowIso = new Date().toISOString();

  if (phases.length) {
    const rows = phases.map((p) => ({
      job_id: jid,
      phase_name: String(p?.phaseName ?? ""),
      phase_id: String(p?.phaseId ?? ""),
      raw_json: p?.raw ?? p ?? null,
      synced_at: nowIso
    }));
    const ins = await supabase.from("brain_job_phases").insert(rows);
    if (ins.error) throw new Error(`Supabase insert brain_job_phases failed: ${ins.error.message}`);
  }

  if (contacts.length) {
    const rows = contacts.map((c) => ({
      job_id: jid,
      contact_name: String(c?.contactName ?? ""),
      phone: String(c?.phone ?? ""),
      cell: String(c?.cell ?? ""),
      email: String(c?.email ?? ""),
      notes: String(c?.notes ?? ""),
      raw_json: c?.raw ?? c ?? null,
      synced_at: nowIso
    }));
    const ins = await supabase.from("brain_job_contacts").insert(rows);
    if (ins.error) throw new Error(`Supabase insert brain_job_contacts failed: ${ins.error.message}`);
  }

  if (activities.length) {
    const rows = activities.map((a) => ({
      job_id: jid,
      activity_index: toIntOrNull(a?.activityIndex),
      activity_type: String(a?.activityType ?? ""),
      activity_status: String(a?.activityStatus ?? ""),
      phase_name: String(a?.phaseName ?? ""),
      start_date: parseDateOrNull(a?.startDate),
      sched_time: String(a?.schedTime ?? ""),
      duration: String(a?.duration ?? ""),
      description: String(a?.description ?? ""),
      notes: String(a?.notes ?? ""),
      raw_json: a?.raw ?? a ?? null,
      synced_at: nowIso
    }));

    const chunkSize = 1000;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const ins = await supabase.from("brain_job_activities").insert(chunk);
      if (ins.error) throw new Error(`Supabase insert brain_job_activities failed: ${ins.error.message}`);
    }
  }

  if (summary) {
    const row = {
      job_id: jid,
      has_template_activity: Boolean(summary?.has_template_activity),
      template_dates: summary?.template_dates ?? [],
      has_install_activity: Boolean(summary?.has_install_activity),
      install_dates: summary?.install_dates ?? [],
      has_order_stone_activity: Boolean(summary?.has_order_stone_activity),
      has_fabrication_activity: Boolean(summary?.has_fabrication_activity),
      has_saw_activity: Boolean(summary?.has_saw_activity),
      has_polish_activity: Boolean(summary?.has_polish_activity),
      has_customer_service_signal: Boolean(summary?.has_customer_service_signal),
      has_remake_signal: Boolean(summary?.has_remake_signal),
      has_repair_signal: Boolean(summary?.has_repair_signal),
      has_change_signal: Boolean(summary?.has_change_signal),
      has_slab_signal: Boolean(summary?.has_slab_signal),
      slab_numbers: summary?.slab_numbers ?? [],
      activity_count: toIntOrNull(summary?.activity_count) ?? activities.length,
      phase_count: toIntOrNull(summary?.phase_count) ?? phases.length,
      contact_count: toIntOrNull(summary?.contact_count) ?? contacts.length,
      operational_notes_text: String(summary?.operational_notes_text ?? ""),
      raw_json: summary?.raw ?? summary ?? null,
      synced_at: nowIso
    };
    const up = await supabase.from("brain_job_operational_summary").upsert(row, { onConflict: "job_id" });
    if (up.error) throw new Error(`Supabase upsert brain_job_operational_summary failed: ${up.error.message}`);
  }

  return {
    skipped: false,
    count: {
      phases: phases.length,
      contacts: contacts.length,
      activities: activities.length,
      summary: summary ? 1 : 0
    }
  };
}

