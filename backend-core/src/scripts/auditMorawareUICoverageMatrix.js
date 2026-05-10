#!/usr/bin/env node
/**
 * Static + optional live-count Moraware UI → Brain coverage matrix.
 * Does not call Moraware. Does not mutate sync behavior.
 *
 * Output:
 *   debug/moraware/latest/moraware-ui-coverage-matrix.json
 *   debug/moraware/latest/moraware-ui-coverage-matrix.txt
 *
 * @see docs/MORAWARE_UI_COVERAGE_MAP.md
 */

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const OUT_DIR = path.join(REPO_ROOT, "debug", "moraware", "latest");
const OUT_JSON = path.join(OUT_DIR, "moraware-ui-coverage-matrix.json");
const OUT_TXT = path.join(OUT_DIR, "moraware-ui-coverage-matrix.txt");

/** Evidence-backed matrix rows (no screenshot OCR). */
const MATRIX = [
  {
    id: "job_info",
    coverage_status: "partial",
    source_files_or_functions:
      "src/morawareClient.js (buildJobHeaderByIdQueryInnerXml, buildGlobalPagedJobQueryInnerXml); src/morawareDiscovery.js; backend-core/src/brain/supabaseBrainStore.js (upsertBrainJob)",
    suspected_moraware_api_source: "jobQuery with include: name, jobStatus, creationDate, account, salesperson, notes, jobCustomField",
    current_tables: "brain_jobs",
    current_columns:
      "job_id, job_name, account_id, account_name, creation_date, job_status, salesperson_name, notes, worksheet_sqft, form_count, field_count, job_worksheet_forms, raw_json",
    raw_payload_available: "yes (full job bundle in raw_json when discovery assembles it)",
    future_heads_that_need_it: "Executive, Brain Health, Sales, Production, Titans Flowing, Quote, Customer Service",
    sensitivity_level: "internal",
    recommended_next_action:
      "Denormalize high-value job header fields (e.g. stone/color) only after resolver design; scope notes / room Sq.Ft. lines may remain in notes + brain_fields until parsed",
    confidence: "high",
    known_gaps:
      "Structured stone/color not guaranteed on brain_jobs row; scope note line items (per-room Sq.Ft.) often only in worksheet fields or notes text"
  },
  {
    id: "job_address",
    coverage_status: "no",
    source_files_or_functions:
      "src/morawareDiscovery.js (applyAddresses for discovery artifacts); backend-core/src/brain/supabaseBrainStore.js (upsertBrainJob — no address columns)",
    suspected_moraware_api_source: "jobQuery <all/> or nested jobAddress / shipToAddress / installAddress in operational fetch",
    current_tables: "brain_jobs (notes only); raw_json may embed address strings if present in synced payload",
    current_columns: "no dedicated job_address_* columns",
    raw_payload_available: "partial (only if included in job JSON stored as raw_json)",
    future_heads_that_need_it: "Install, Shop Floor TV, Delivery, Partner portal, Executive map views",
    sensitivity_level: "customer_contact",
    recommended_next_action:
      "Additive columns or brain_job_addresses table; preserve raw address nodes; do not change worksheet Sq.Ft. math",
    confidence: "high",
    known_gaps: "No first-class address table in Brain schema today"
  },
  {
    id: "account_contacts",
    coverage_status: "no",
    source_files_or_functions: "morawareDiscovery probes; no upsert in supabaseBrainStore for account-level contacts",
    suspected_moraware_api_source: "accountQuery / nested contacts on account (not proven in sync path)",
    current_tables: "—",
    current_columns: "—",
    raw_payload_available: "unknown",
    future_heads_that_need_it: "Sales, Install reminders, Partner quoting, Customer Service, automation",
    sensitivity_level: "customer_contact",
    recommended_next_action: "Discovery + additive Supabase model for account contacts when API shape confirmed",
    confidence: "medium",
    known_gaps: "Job-level contacts ingested separately; account-wide rolodex not in Brain"
  },
  {
    id: "job_contacts",
    coverage_status: "partial",
    source_files_or_functions:
      "src/morawareOperational.js (normalizeJobOperational → jobContacts); backend-core/src/brain/supabaseBrainStore.js (replaceJobOperational → brain_job_contacts)",
    suspected_moraware_api_source: "jobQuery includes jobContacts / jobContact nodes from operational bundle",
    current_tables: "brain_job_contacts",
    current_columns: "job_id, contact_name, phone, cell, email, notes, raw_json",
    raw_payload_available: "yes",
    future_heads_that_need_it: "Install, Customer Service, Partner portal, missing-info chasers",
    sensitivity_level: "customer_contact",
    recommended_next_action:
      "Map reminder_instruction / customer-specific comms fields from raw_json if present; extend normalization when verified in payloads",
    confidence: "high",
    known_gaps:
      "Reminder instructions, JWD-specific fields, and multi-contact roles not verified as normalized columns"
  },
  {
    id: "job_activities",
    coverage_status: "partial",
    source_files_or_functions:
      "src/morawareOperational.js (activities extraction); backend-core/src/brain/supabaseBrainStore.js (brain_job_activities)",
    suspected_moraware_api_source: "jobActivity / activity nodes under jobQuery operational fetch",
    current_tables: "brain_job_activities",
    current_columns:
      "job_id, activity_index, activity_type, activity_status, phase_name, start_date, sched_time, duration, description, notes, raw_json",
    raw_payload_available: "yes",
    future_heads_that_need_it: "Titans Flowing, Shop TV, Machine/Programming/Install schedules, Executive capacity",
    sensitivity_level: "internal",
    recommended_next_action:
      "Extract assigned_to / resource / machine / truck from raw_json into typed columns after payload audit",
    confidence: "high",
    known_gaps:
      "assigned_to, machine row, truck row, color-by-type, unscheduled bucket not first-class columns; may exist inside raw_json or description"
  },
  {
    id: "jwd_alerts_reminder_history",
    coverage_status: "unknown",
    source_files_or_functions: "— (not referenced in morawareOperational field extractors)",
    suspected_moraware_api_source: "Possible nested reminder / JWD nodes under activities or separate API — unproven in repo",
    current_tables: "brain_job_activities.raw_json (may contain hints)",
    current_columns: "—",
    raw_payload_available: "unknown",
    future_heads_that_need_it: "Automation heads, Install/Template reminders, double-send prevention",
    sensitivity_level: "sensitive",
    recommended_next_action: "Capture raw samples in discovery mode; document XML paths before normalization",
    confidence: "low",
    known_gaps: "No dedicated reminder_history table"
  },
  {
    id: "job_worksheet_forms",
    coverage_status: "partial",
    source_files_or_functions:
      "src/morawareClient.js (fetchJobFormsAllFields, buildJobFormsAllFieldsCommand); src/morawareJobFormsSdk.js; backend-core/src/brain/supabaseBrainStore.js",
    suspected_moraware_api_source: "jobFormQuery / SDK all-fields",
    current_tables: "brain_forms, brain_fields",
    current_columns:
      "brain_forms: form_id, job_id, form_name, phase_*, raw_json; brain_fields: label, normalized_label, value, numeric_value, raw_json, …",
    raw_payload_available: "yes",
    future_heads_that_need_it: "Quote staging, Production readiness, Install checklist overlap, Gateway validation",
    sensitivity_level: "internal",
    recommended_next_action:
      "Continue normalized_label work; add targeted parsers for install/accounting templates when identified",
    confidence: "high",
    known_gaps:
      "Not every Moraware template field has business semantics in normalized_label; install checklist vs generic worksheet not distinguished at table level"
  },
  {
    id: "install_inspection_checklist",
    coverage_status: "partial",
    source_files_or_functions: "Same as job_worksheet_forms if represented as job forms in Moraware",
    suspected_moraware_api_source: "jobFormQuery",
    current_tables: "brain_forms, brain_fields",
    current_columns: "form_name + field rows",
    raw_payload_available: "yes",
    future_heads_that_need_it: "Install, Quality, Customer Service",
    sensitivity_level: "internal",
    recommended_next_action: "Tag forms by template name / id for checklist-specific views",
    confidence: "medium",
    known_gaps: "No dedicated install_inspection table; semantics inferred from forms"
  },
  {
    id: "accounting_form",
    coverage_status: "partial",
    source_files_or_functions: "brain_fields / brain_forms (if template ingested)",
    suspected_moraware_api_source: "jobFormQuery",
    current_tables: "brain_forms, brain_fields",
    current_columns: "generic field storage",
    raw_payload_available: "yes",
    future_heads_that_need_it: "Finance, Executive revenue readiness",
    sensitivity_level: "financial",
    recommended_next_action: "Identify accounting template IDs; map invoice/sales order fields explicitly with ACL",
    confidence: "medium",
    known_gaps: "No finance-specific schema; PII/financial sensitivity needs head-level access"
  },
  {
    id: "files_attachments",
    coverage_status: "no",
    source_files_or_functions: "src/morawareDiscovery.js (B4-files probes, files collection in discovery brain object)",
    suspected_moraware_api_source: "files/file nodes under jobQuery when included",
    current_tables: "— (not written by supabaseBrainStore)",
    current_columns: "—",
    raw_payload_available: "unknown in production Brain",
    future_heads_that_need_it: "AI takeoff, Quote, Customer Service, Quality",
    sensitivity_level: "sensitive",
    recommended_next_action: "Metadata-only ingest first; Supabase Storage copy policy later; signed URLs TBD",
    confidence: "medium",
    known_gaps: "Discovery can probe files; production sync path does not persist file catalog to Supabase"
  },
  {
    id: "phases",
    coverage_status: "partial",
    source_files_or_functions:
      "src/morawareOperational.js (phases); backend-core/src/brain/supabaseBrainStore.js (brain_job_phases)",
    suspected_moraware_api_source: "jobPhases / jobPhase in jobQuery",
    current_tables: "brain_job_phases",
    current_columns: "job_id, phase_name, phase_id, raw_json",
    raw_payload_available: "yes",
    future_heads_that_need_it: "Production, Executive, Titans",
    sensitivity_level: "internal",
    recommended_next_action: "Add phase dates/status if present in raw_json",
    confidence: "high",
    known_gaps: "Phase status/date not in dedicated columns"
  },
  {
    id: "job_issues",
    coverage_status: "unknown",
    source_files_or_functions: "—",
    suspected_moraware_api_source: "Possible issues collection on job or account — not referenced in morawareOperational",
    current_tables: "—",
    current_columns: "—",
    raw_payload_available: "unknown",
    future_heads_that_need_it: "Customer Service, Quality, Executive exceptions",
    sensitivity_level: "internal",
    recommended_next_action: "Discovery jobQuery include experiments; additive table when XML path known",
    confidence: "low",
    known_gaps: "No brain_job_issues table"
  },
  {
    id: "account_info",
    coverage_status: "partial",
    source_files_or_functions:
      "brain_jobs carries account_id, account_name from job header; deeper account settings not ingested separately",
    suspected_moraware_api_source: "Nested account on jobQuery",
    current_tables: "brain_jobs",
    current_columns: "account_id, account_name",
    raw_payload_available: "partial",
    future_heads_that_need_it: "Sales, Account Performance, Partner",
    sensitivity_level: "internal",
    recommended_next_action: "Optional brain_accounts when accountQuery pipeline exists",
    confidence: "high",
    known_gaps: "Account notes, default template, account-level salesperson nuances not in dedicated Brain tables"
  },
  {
    id: "account_jobs_history",
    coverage_status: "partial",
    source_files_or_functions: "Derived from brain_jobs grouped by account_id (not a Moraware saved search replica)",
    suspected_moraware_api_source: "N/A (SQL aggregation)",
    current_tables: "brain_jobs",
    current_columns: "job_id, account_id, job_status, creation_date, …",
    raw_payload_available: "n/a",
    future_heads_that_need_it: "Executive account views, Sales",
    sensitivity_level: "internal",
    recommended_next_action: "API-level aggregations; optional materialized views",
    confidence: "high",
    known_gaps: "Moraware UI search filters (30+ days, unscheduled) not stored as Moraware definitions"
  },
  {
    id: "search_filters",
    coverage_status: "no",
    source_files_or_functions: "—",
    suspected_moraware_api_source: "Moraware UI saved searches / filters — not replicated",
    current_tables: "—",
    current_columns: "—",
    raw_payload_available: "no",
    future_heads_that_need_it: "Many heads (re-implement filters in eOS)",
    sensitivity_level: "low",
    recommended_next_action: "Replicate filter semantics in eOS queries over Brain tables",
    confidence: "high",
    known_gaps: "No import of Moraware saved search definitions"
  },
  {
    id: "calendar_schedule_views",
    coverage_status: "partial",
    source_files_or_functions:
      "brain_job_activities + Executive/Titans consumers in backend-core/src/server.js; no Moraware view-definition API usage in repo",
    suspected_moraware_api_source:
      "Moraware calendar views likely server-side UI over same activity rows — no evidence of saved-view export API in codebase",
    current_tables: "brain_job_activities, brain_job_operational_summary",
    current_columns: "see job_activities; summary booleans + template_dates/install_dates arrays",
    raw_payload_available: "yes for activities",
    future_heads_that_need_it: "Shop TV, Machine schedule, Programming, Fabrication 30-day, Install, Executive capacity",
    sensitivity_level: "internal",
    recommended_next_action:
      "Reconstruct schedules from activities + dates; validate against Moraware UI with spot checks; document API limitations",
    confidence: "medium",
    known_gaps:
      "view_definition, calendar color rules, layout buckets (day/week/month) not ingested; assigned resources incomplete"
  },
  {
    id: "machine_schedule",
    coverage_status: "unknown",
    source_files_or_functions: "brain_job_activities (reconstruction candidate)",
    suspected_moraware_api_source: "Activity assignment fields — verify in raw_json",
    current_tables: "brain_job_activities",
    current_columns: "machine_assignment: not a column; investigate raw_json",
    raw_payload_available: "unknown",
    future_heads_that_need_it: "Machine Schedule head, Shop TV, Production capacity",
    sensitivity_level: "internal",
    recommended_next_action: "Payload sampling job: extract Titan/Saber/Robot strings to structured fields",
    confidence: "low",
    known_gaps: "Named machines (Titan 1… Robot) not modeled as FKs"
  },
  {
    id: "programming_schedule",
    coverage_status: "partial",
    source_files_or_functions: "brain_job_activities.activity_type + dates; Titans today endpoint",
    suspected_moraware_api_source: "job activities",
    current_tables: "brain_job_activities",
    current_columns: "activity_type, start_date, sched_time, …",
    raw_payload_available: "yes",
    future_heads_that_need_it: "Programming/CAD readiness, Titans",
    sensitivity_level: "internal",
    recommended_next_action: "Filter activities by programming-related types; person assignment from raw",
    confidence: "medium",
    known_gaps: "person_assignment column missing"
  },
  {
    id: "fabrication_schedule",
    coverage_status: "partial",
    source_files_or_functions: "brain_job_activities + operational_summary fabrication flags",
    suspected_moraware_api_source: "job activities",
    current_tables: "brain_job_activities, brain_job_operational_summary",
    current_columns: "has_fabrication_activity, activity rows",
    raw_payload_available: "yes",
    future_heads_that_need_it: "30-day fabrication, Production, Shop TV",
    sensitivity_level: "internal",
    recommended_next_action: "Daily scheduled Sq.Ft.: join activities to worksheet_sqft by job (design doc)",
    confidence: "medium",
    known_gaps: "daily_scheduled_sqft not precomputed; unscheduled bucket not flagged"
  },
  {
    id: "install_schedule",
    coverage_status: "partial",
    source_files_or_functions: "brain_job_activities + operational_summary install_dates",
    suspected_moraware_api_source: "job activities",
    current_tables: "brain_job_activities, brain_job_operational_summary",
    current_columns: "install_dates[], has_install_activity",
    raw_payload_available: "yes",
    future_heads_that_need_it: "Install head, Shop TV, Trucks",
    sensitivity_level: "internal",
    recommended_next_action: "Truck/installer strings from activity description/notes",
    confidence: "medium",
    known_gaps: "truck_assignment not structured"
  },
  {
    id: "template_schedule",
    coverage_status: "partial",
    source_files_or_functions: "brain_job_activities + template_dates on summary",
    suspected_moraware_api_source: "job activities",
    current_tables: "brain_job_activities, brain_job_operational_summary",
    current_columns: "template_dates[], has_template_activity",
    raw_payload_available: "yes",
    future_heads_that_need_it: "Template head, Titans, Executive",
    sensitivity_level: "internal",
    recommended_next_action: "Same as calendar reconstruction",
    confidence: "medium",
    known_gaps: "unscheduled template activities not explicitly tagged"
  },
  {
    id: "delivery_truck_schedule",
    coverage_status: "unknown",
    source_files_or_functions: "brain_job_activities text fields",
    suspected_moraware_api_source: "Activities / install notes mentioning trucks",
    current_tables: "brain_job_activities",
    current_columns: "description, notes, raw_json",
    raw_payload_available: "unknown",
    future_heads_that_need_it: "Install, Delivery, Shop TV",
    sensitivity_level: "internal",
    recommended_next_action: "NLP or pattern match Truck A/B… after sampling raw_json",
    confidence: "low",
    known_gaps: "No truck_id column"
  },
  {
    id: "customer_service_schedule",
    coverage_status: "partial",
    source_files_or_functions: "deriveOperationalSummary + brain_job_operational_summary.has_customer_service_signal",
    suspected_moraware_api_source: "Activities + notes text",
    current_tables: "brain_job_activities, brain_job_operational_summary",
    current_columns: "has_customer_service_signal",
    raw_payload_available: "yes",
    future_heads_that_need_it: "Customer Service head, Executive",
    sensitivity_level: "internal",
    recommended_next_action: "Dedicated CS activity types when Moraware labels stable",
    confidence: "medium",
    known_gaps: "Heuristic text match for CS signal"
  }
];

/** Calendar dimension sub-matrix (embedded in report). */
const CALENDAR_DIMENSIONS = [
  { id: "calendar_views", coverage_status: "partial", notes: "Reconstruct from activities; Moraware saved view definitions not used in code" },
  { id: "schedule_rows", coverage_status: "partial", notes: "brain_job_activities rows per job; not pre-joined to machine grid" },
  { id: "assigned_to", coverage_status: "unknown", notes: "Not a Supabase column; check raw_json vs description" },
  { id: "scheduled_time", coverage_status: "partial", notes: "sched_time string column exists" },
  { id: "duration", coverage_status: "partial", notes: "duration string column exists" },
  { id: "unscheduled_bucket", coverage_status: "unknown", notes: "No explicit flag; infer from empty start_date / UI rules" },
  { id: "machine_assignment", coverage_status: "unknown", notes: "See machine_schedule" },
  { id: "person_assignment", coverage_status: "unknown", notes: "Programmer names likely in raw or text" },
  { id: "truck_assignment", coverage_status: "unknown", notes: "See delivery_truck_schedule" },
  { id: "daily_scheduled_sqft", coverage_status: "no", notes: "Not computed in Brain; join design required" },
  { id: "view_definition", coverage_status: "no", notes: "No API usage for Moraware calendar view XML in repo" }
];

async function optionalSupabaseCounts() {
  const url = String(process.env.SUPABASE_URL ?? "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return { note: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — counts skipped" };

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const out = {};
  const tables = ["brain_jobs", "brain_fields", "brain_forms", "brain_job_activities", "brain_job_contacts", "brain_job_phases", "brain_job_operational_summary"];
  for (const t of tables) {
    try {
      const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
      out[t] = error ? `error: ${error.message}` : count ?? 0;
    } catch (e) {
      out[t] = String(e?.message || e);
    }
  }
  return out;
}

function renderTxt(payload) {
  const lines = [];
  lines.push("MORAWARE UI → eOS BRAIN COVERAGE MATRIX");
  lines.push(`generatedAt: ${payload.generatedAt}`);
  lines.push("");
  lines.push("--- Categories ---");
  for (const row of payload.categories) {
    lines.push(`\n[${row.id}] status=${row.coverage_status} confidence=${row.confidence}`);
    lines.push(`  tables: ${row.current_tables}`);
    lines.push(`  gaps: ${row.known_gaps}`);
    lines.push(`  next: ${row.recommended_next_action}`);
  }
  lines.push("\n--- Calendar dimensions ---");
  for (const d of payload.calendar_dimensions) {
    lines.push(`\n[${d.id}] status=${d.coverage_status}`);
    lines.push(`  ${d.notes}`);
  }
  if (payload.sample_counts && Object.keys(payload.sample_counts).length) {
    lines.push("\n--- Optional table counts ---");
    lines.push(JSON.stringify(payload.sample_counts, null, 2));
  }
  return lines.join("\n");
}

async function main() {
  const generatedAt = new Date().toISOString();
  const sample_counts = await optionalSupabaseCounts();

  const payload = {
    generatedAt,
    repoNote: "Matrix derived from static code paths in repo; not a guarantee of Moraware account completeness.",
    categories: MATRIX,
    calendar_dimensions: CALENDAR_DIMENSIONS,
    sample_counts
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(OUT_TXT, renderTxt(payload), "utf8");
  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_TXT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
