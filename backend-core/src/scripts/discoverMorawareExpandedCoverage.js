#!/usr/bin/env node
/**
 * Safe, read-only live Moraware discovery for expanded Brain coverage.
 *
 * - Uses existing Moraware env (MORAWARE_API_URL, MORAWARE_USERNAME, MORAWARE_PASSWORD; MORAWARE_ACCOUNT_ID optional — same as MorawareClient / sync).
 * - Does NOT write to Supabase.
 * - Does NOT mutate Moraware data.
 * - Does NOT download file binaries (metadata probes only unless extended later).
 * - Limits sample size via env (defaults below).
 *
 * Set MORAWARE_DISCOVERY_QUIET_LOGS=1 (default in this script) to avoid dumping full Moraware payloads to stdout.
 * Set MORAWARE_DISCOVERY_KEY_SHAPES=1 for sanitized key/path reports (see moraware-expanded-key-shapes.*).
 *
 * @see docs/MORAWARE_EXPANDED_DISCOVERY_RESULTS.md
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.MORAWARE_DISCOVERY_QUIET_LOGS ??= "1";

import { MorawareClient, fetchJobFormsAllFields, fetchJobOperationalAll } from "../../../src/morawareClient.js";
import { analyzeJobNotesScope, normalizeJobOperational } from "../../../src/morawareOperational.js";
import { collectGlobalSyncStyleJobListSample } from "../../../src/morawareDiscovery.js";
import { buildKeyShapesTxtReport, createKeyShapeCollector } from "./morawareKeyShapeAudit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const OUT_DIR = path.join(REPO_ROOT, "debug", "moraware", "latest");
const OUT_JSON = path.join(OUT_DIR, "moraware-expanded-discovery.json");
const OUT_TXT = path.join(OUT_DIR, "moraware-expanded-discovery.txt");
const OUT_KEY_SHAPES_JSON = path.join(OUT_DIR, "moraware-expanded-key-shapes.json");
const OUT_KEY_SHAPES_TXT = path.join(OUT_DIR, "moraware-expanded-key-shapes.txt");

function toInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickJobId(job) {
  if (!job || typeof job !== "object") return "";
  const id = job._attributes?.id ?? job.id ?? job.jobId;
  return id != null ? String(id).trim() : "";
}

function xmlishText(node) {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node).trim();
  if (Array.isArray(node)) return xmlishText(node[0]);
  if (typeof node === "object") {
    const t = node._text ?? node["#text"];
    if (t != null) return String(t).trim();
  }
  return "";
}

/** Collect shallow key names from nested objects (breadth-first, capped). */
function collectKeyNames(root, { maxNodes = 800, maxDepth = 6 } = {}) {
  const seen = new Set();
  const q = [{ v: root, d: 0 }];
  let n = 0;
  while (q.length && n < maxNodes) {
    const { v, d } = q.shift();
    if (v == null || typeof v !== "object") continue;
    n += 1;
    if (Array.isArray(v)) {
      for (const x of v.slice(0, 30)) q.push({ v: x, d: d + 1 });
      continue;
    }
    for (const k of Object.keys(v)) {
      if (k.startsWith("@_")) continue;
      seen.add(k);
      if (d < maxDepth) q.push({ v: v[k], d: d + 1 });
    }
  }
  return [...seen].sort();
}

function snippetFromValue(val, maxLen) {
  if (!val) return "";
  const s = typeof val === "string" ? val : JSON.stringify(val);
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

async function delayBetweenCalls() {
  const ms = toInt(process.env.MORAWARE_DISCOVERY_DELAY_MS, 350);
  if (ms > 0) await sleep(ms);
}

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function buildCategoryRow(partial) {
  return {
    available: partial.available ?? "unknown",
    api_method_or_source: partial.api_method_or_source ?? "",
    sample_count: partial.sample_count ?? 0,
    fields_seen: partial.fields_seen ?? [],
    raw_payload_available: partial.raw_payload_available ?? "unknown",
    notes: partial.notes ?? "",
    confidence: partial.confidence ?? "low",
    recommended_ingestion_table: partial.recommended_ingestion_table ?? "",
    recommended_next_action: partial.recommended_next_action ?? ""
  };
}

async function tryDateRangeJobQuery(client, startYmd, endYmd) {
  if (!startYmd) return { ok: false, note: "MORAWARE_DISCOVERY_START_DATE not set — skipped date-range experiment" };
  const end = endYmd || "2099-12-31";
  await client.ensureSession();
  /** Experimental — Moraware schema may differ by tenant; failures are informative only. */
  const inner =
    `<jobQuery>\n` +
    `  <filter xmlns="">\n` +
    `    <creationDate start="${startYmd}" end="${end}"/>\n` +
    `  </filter>\n` +
    `  <include xmlns="">\n` +
    `    <name/>\n` +
    `    <creationDate/>\n` +
    `    <jobStatus/>\n` +
    `  </include>\n` +
    `  <pagingSpec xmlns="">\n` +
    `    <firstRecord>0</firstRecord>\n` +
    `    <pageSize>5</pageSize>\n` +
    `    <calculateTotalRecords>false</calculateTotalRecords>\n` +
    `  </pagingSpec>\n` +
    `</jobQuery>`;
  try {
    const { data } = await client.morawareCommand(inner);
    const jobs = data?.MorawareResponse?.jobQuery?.job;
    const arr = Array.isArray(jobs) ? jobs : jobs ? [jobs] : [];
    return {
      ok: true,
      jobs_returned: arr.length,
      note: "creationDate range filter accepted (verify against Moraware docs for your version)"
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), note: "Date-range filter may be unsupported or needs different XML shape" };
  }
}

async function main() {
  const includeRawSnippets = String(process.env.MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS ?? "").trim() === "1";
  const includeFilesProbe = String(process.env.MORAWARE_DISCOVERY_INCLUDE_FILES ?? "").trim() === "1";
  const keyShapesEnabled = String(process.env.MORAWARE_DISCOVERY_KEY_SHAPES ?? "").trim() === "1";
  const keyShapeCollector = keyShapesEnabled
    ? createKeyShapeCollector({
        includeRawSnippets,
        maxDepth: toInt(process.env.MORAWARE_DISCOVERY_KEY_SHAPE_MAX_DEPTH, 12),
        maxPathEntries: toInt(process.env.MORAWARE_DISCOVERY_KEY_SHAPE_MAX_PATHS, 8000)
      })
    : null;
  const jobNotesScopeResearch = [];

  const sampleJobs = toInt(process.env.MORAWARE_DISCOVERY_SAMPLE_JOBS, 5);
  const sampleAccounts = toInt(process.env.MORAWARE_DISCOVERY_SAMPLE_ACCOUNTS, 5);
  const startDate = String(process.env.MORAWARE_DISCOVERY_START_DATE ?? "").trim();
  const endDate = String(process.env.MORAWARE_DISCOVERY_END_DATE ?? "").trim();

  console.log("[discoverMorawareExpandedCoverage] Read-only Moraware discovery");
  console.log(`  sample_jobs=${sampleJobs} sample_accounts=${sampleAccounts}`);
  console.log(`  include_files=${includeFilesProbe ? "1" : "0"} include_raw_snippets=${includeRawSnippets ? "1 (may contain PII)" : "0"}`);
  console.log(`  key_shapes=${keyShapesEnabled ? "1 → moraware-expanded-key-shapes.*" : "0"}`);
  console.log("  (credentials are never printed)");

  requiredEnv("MORAWARE_API_URL");
  requiredEnv("MORAWARE_USERNAME");
  requiredEnv("MORAWARE_PASSWORD");

  const accountIdFromEnv = String(process.env.MORAWARE_ACCOUNT_ID ?? "").trim();
  if (!accountIdFromEnv) {
    console.log(
      "MORAWARE_ACCOUNT_ID: not set; continuing because existing sync path does not require it."
    );
  }

  const client = new MorawareClient();
  const categories = [];
  const errors = [];

  const jobProbeRows = [];
  const accountIdsSeen = new Set();

  const explicitJobIdMoraware = String(process.env.MORAWARE_DISCOVERY_JOB_ID ?? "").trim();
  const explicitJobIdEos = String(process.env.EOS_DISCOVERY_JOB_ID ?? "").trim();
  const explicitJobIds = [];
  if (explicitJobIdMoraware) explicitJobIds.push(explicitJobIdMoraware);
  if (explicitJobIdEos && explicitJobIdEos !== explicitJobIdMoraware) explicitJobIds.push(explicitJobIdEos);

  const jobSampling = {
    explicit_job_ids_requested: [...explicitJobIds],
    strategies_tried: [],
    moraware_sync_style_params: {
      MORAWARE_SYNC_START_DATE: String(process.env.MORAWARE_SYNC_START_DATE ?? "").trim() || null,
      MORAWARE_SYNC_END_DATE: String(process.env.MORAWARE_SYNC_END_DATE ?? "").trim() || null,
      MORAWARE_SYNC_YEAR: String(process.env.MORAWARE_SYNC_YEAR ?? "").trim() || null,
      MORAWARE_MAX_SEARCH_PAGES: String(process.env.MORAWARE_MAX_SEARCH_PAGES ?? "").trim() || null,
      MORAWARE_SEARCH_PAGE_SIZE: String(process.env.MORAWARE_SEARCH_PAGE_SIZE ?? "").trim() || null,
      MORAWARE_PAGE_SIZE: String(process.env.MORAWARE_PAGE_SIZE ?? "").trim() || null,
      MORAWARE_MAX_PROCESSES: String(process.env.MORAWARE_MAX_PROCESSES ?? "").trim() || null,
      MORAWARE_PROCESS_IDS_configured: Boolean(String(process.env.MORAWARE_PROCESS_IDS ?? "").trim())
    },
    global_sync_style: null,
    list_all_jobs_fallback_total: null,
    pages_log_tail: [],
    zero_jobs_hints: []
  };

  let picked = [];

  await client.ensureSession();
    await delayBetweenCalls();

    const seenJobIds = new Set();

    if (explicitJobIds.length) {
      jobSampling.strategies_tried.push("explicit_MORAWARE_DISCOVERY_JOB_ID_or_EOS_DISCOVERY_JOB_ID");
    }
    for (const jidExplicit of explicitJobIds) {
      if (picked.length >= sampleJobs) break;
      if (!jidExplicit || seenJobIds.has(jidExplicit)) continue;
      seenJobIds.add(jidExplicit);
      picked.push({
        _attributes: { id: jidExplicit },
        _samplingSource: "MORAWARE_DISCOVERY_JOB_ID_or_EOS_DISCOVERY_JOB_ID"
      });
    }

    if (picked.length < sampleJobs) {
      jobSampling.strategies_tried.push("collectGlobalSyncStyleJobListSample");
      try {
        const globalSample = await collectGlobalSyncStyleJobListSample(client, {
          collectCap: Math.max(sampleJobs * 25, 80),
          quiet: true,
          skipProbeArtifacts: true
        });
        await delayBetweenCalls();
        jobSampling.global_sync_style = globalSample.diagnostics ?? null;
        jobSampling.pages_log_tail = (globalSample.pagesLog ?? []).slice(-12);
        const pool = Array.isArray(globalSample.jobs) ? globalSample.jobs : [];
        for (const j of pool) {
          if (picked.length >= sampleJobs) break;
          const jid = pickJobId(j);
          if (!jid || seenJobIds.has(jid)) continue;
          seenJobIds.add(jid);
          picked.push(j);
        }
      } catch (e) {
        errors.push({ stage: "collectGlobalSyncStyleJobListSample", error: String(e?.message || e) });
      }
    }

    if (picked.length < sampleJobs) {
      jobSampling.strategies_tried.push("listAllJobs_fallback");
      try {
        const listRes = await client.listAllJobs({ includeCreationDate: true });
        await delayBetweenCalls();
        const jobs = Array.isArray(listRes?.jobs) ? listRes.jobs : [];
        jobSampling.list_all_jobs_fallback_total = jobs.length;
        for (const j of jobs) {
          if (picked.length >= sampleJobs) break;
          const jid = pickJobId(j);
          if (!jid || seenJobIds.has(jid)) continue;
          seenJobIds.add(jid);
          picked.push(j);
        }
      } catch (e) {
        errors.push({ stage: "listAllJobs_fallback", error: String(e?.message || e) });
      }
    }

    if (!picked.length) {
      jobSampling.zero_jobs_hints.push(
        "No jobs matched sampling. Global sync lists jobs per Moraware process: set MORAWARE_PROCESS_IDS if auto process discovery returns none."
      );
      jobSampling.zero_jobs_hints.push(
        "If MORAWARE_SYNC_START_DATE / MORAWARE_SYNC_END_DATE / MORAWARE_SYNC_YEAR are set, list rows must include creationDate matching that window or every candidate is dropped."
      );
      jobSampling.zero_jobs_hints.push(
        "Probe one job directly: MORAWARE_DISCOVERY_JOB_ID=<id> (or EOS_DISCOVERY_JOB_ID=<id>)."
      );
      if (jobSampling.global_sync_style?.hint) {
        jobSampling.zero_jobs_hints.push(String(jobSampling.global_sync_style.hint));
      }
      console.log("[discover] No sample jobs after global-sync-style + listAllJobs fallback.");
      console.log(`[discover] See job_sampling in ${OUT_JSON} (search params, process list, hints).`);
    } else {
      console.log(
        `[discover] Sample jobs=${picked.length} (strategies: ${jobSampling.strategies_tried.join(" → ")})`
      );
    }

    const allJobKeys = new Set();
    const addressHints = new Set();
    const fileHints = new Set();
    const issueHints = new Set();
    const activityKeys = new Set();
    const contactKeys = new Set();
    let activitiesTotal = 0;
    let contactsTotal = 0;
    let phasesTotal = 0;
    let formsTotal = 0;
    let fieldLabels = new Set();
    const assigneeHints = { assigned: 0, resource: 0, employee: 0, machine: 0, truck: 0, reminder: 0, jwd: 0 };

    for (const job of picked) {
      const jid = pickJobId(job);
      if (!jid) continue;

      const row = { job_id: jid, stages: {} };

      try {
        const header = await client.getJobHeader({ jobId: jid });
        await delayBetweenCalls();
        row.stages.job_header = "ok";
        const hj = header?.job ?? null;
        if (hj && typeof hj === "object") {
          for (const k of Object.keys(hj)) allJobKeys.add(k);
          const acct = hj.account;
          const aid = acct?._attributes?.id ?? acct?.id;
          if (aid) accountIdsSeen.add(String(aid));
        }
        if (keyShapeCollector && hj && typeof hj === "object") {
          keyShapeCollector.ingest("job_header", hj);
          jobNotesScopeResearch.push({
            job_id: jid,
            ...analyzeJobNotesScope(xmlishText(hj?.notes), { includeRawSnippets })
          });
        }
        if (includeRawSnippets && hj) {
          const notes = xmlishText(hj?.notes);
          row.notes_snippet = snippetFromValue(notes, 120);
        }
      } catch (e) {
        row.stages.job_header = `error: ${String(e?.message || e)}`;
        errors.push({ job_id: jid, stage: "getJobHeader", error: String(e?.message || e) });
      }

      try {
        const op = await fetchJobOperationalAll(client, jid, {});
        await delayBetweenCalls();
        row.stages.operational_fetch = "ok";
        const opNorm = normalizeJobOperational(jid, op.parsed);
        activitiesTotal += opNorm.activities?.length ?? 0;
        contactsTotal += opNorm.contacts?.length ?? 0;
        phasesTotal += opNorm.phases?.length ?? 0;

        const jobNode = opNorm.raw?.job ?? op.parsed?.MorawareResponse?.jobQuery?.job;
        const jn = Array.isArray(jobNode) ? jobNode[0] : jobNode;
        if (jn && typeof jn === "object") {
          const kn = collectKeyNames(jn, { maxNodes: 1200, maxDepth: 8 });
          for (const k of kn) {
            const lk = k.toLowerCase();
            if (/address|ship|install|postal|zip|city|state/.test(lk)) addressHints.add(k);
            if (lk.includes("file")) fileHints.add(k);
            if (lk.includes("issue")) issueHints.add(k);
          }
          if (includeFilesProbe) {
            const blob = JSON.stringify(jn).toLowerCase();
            if (blob.includes("file")) fileHints.add("(json_contains_file)");
          }
        }

        const actSample = (opNorm.activities ?? []).slice(0, 8);
        for (const act of actSample) {
          if (!act?.raw || typeof act.raw !== "object") continue;
          const ak = collectKeyNames(act.raw, { maxNodes: 400, maxDepth: 5 });
          for (const k of ak) {
            activityKeys.add(k);
            const low = k.toLowerCase();
            if (low.includes("assign")) assigneeHints.assigned += 1;
            if (low.includes("resource")) assigneeHints.resource += 1;
            if (low.includes("employee") || low.includes("person")) assigneeHints.employee += 1;
            if (low.includes("machine") || low.includes("titan") || low.includes("saber") || low.includes("robot"))
              assigneeHints.machine += 1;
            if (low.includes("truck")) assigneeHints.truck += 1;
            if (low.includes("reminder") || low.includes("jwd") || low.includes("alert")) {
              assigneeHints.reminder += 1;
              assigneeHints.jwd += low.includes("jwd") ? 1 : 0;
            }
          }
        }

        const c0 = opNorm.contacts?.[0];
        if (c0?.raw && typeof c0.raw === "object") {
          for (const k of Object.keys(c0.raw)) contactKeys.add(k);
        }

        if (keyShapeCollector) {
          if (jn && typeof jn === "object") {
            keyShapeCollector.ingest("operational_payload", jn);
            if (includeFilesProbe) {
              keyShapeCollector.ingest("files_metadata_probe", {
                _probe: "operational_job_json_subtree",
                keys: collectKeyNames(jn, { maxNodes: 2000, maxDepth: 10 })
              });
            }
          }
          for (const act of opNorm.activities ?? []) {
            if (act?.raw && typeof act.raw === "object") keyShapeCollector.ingest("activities", act.raw);
          }
          for (const ph of opNorm.phases ?? []) {
            if (ph?.raw && typeof ph.raw === "object") keyShapeCollector.ingest("phases", ph.raw);
          }
          for (const ct of opNorm.contacts ?? []) {
            if (ct?.raw && typeof ct.raw === "object") keyShapeCollector.ingest("contacts", ct.raw);
          }
        }
      } catch (e) {
        row.stages.operational_fetch = `error: ${String(e?.message || e)}`;
        errors.push({ job_id: jid, stage: "fetchJobOperationalAll", error: String(e?.message || e) });
      }

      try {
        const forms = await fetchJobFormsAllFields(client, jid, {});
        await delayBetweenCalls();
        row.stages.job_forms = "ok";
        const fl = forms?.forms ?? [];
        formsTotal += fl.length;
        for (const f of fl) {
          const fn = String(f?.formName ?? f?.name ?? "").trim();
          if (fn) fieldLabels.add(`form:${fn}`);
          for (const fld of f?.fields ?? []) {
            const lab = String(fld?.label ?? "").trim();
            if (lab) fieldLabels.add(lab);
          }
        }
        if (keyShapeCollector) {
          if (forms?.parsed && typeof forms.parsed === "object") {
            keyShapeCollector.ingest("forms_raw", forms.parsed);
          }
          if (Array.isArray(fl) && fl.length) {
            keyShapeCollector.ingest("forms_normalized", { forms: fl });
          }
        }
      } catch (e) {
        row.stages.job_forms = `error: ${String(e?.message || e)}`;
        errors.push({ job_id: jid, stage: "fetchJobFormsAllFields", error: String(e?.message || e) });
      }

      jobProbeRows.push(row);
    }

    /** Aggregate category: job details */
    categories.push({
      id: "job_details",
      ...buildCategoryRow({
        available: allJobKeys.size ? "partial" : "unknown",
        api_method_or_source: "MorawareClient.getJobHeader (jobQuery per-job header include)",
        sample_count: picked.length,
        fields_seen: [...allJobKeys].sort().slice(0, 200),
        raw_payload_available: "yes (in operational fetch raw; header job object)",
        notes: `Top-level keys seen on header job nodes (capped). Snippets: ${includeRawSnippets ? "enabled — inspect JSON output in debug/ only" : "disabled"}.`,
        confidence: "high",
        recommended_ingestion_table: "brain_jobs",
        recommended_next_action: "Map additional header fields only after naming audit per tenant"
      })
    });

    categories.push({
      id: "job_addresses",
      ...buildCategoryRow({
        available: addressHints.size ? "partial" : "no",
        api_method_or_source: "fetchJobOperationalAll → jobQuery <all/> payload keys (key-name scan)",
        sample_count: picked.length,
        fields_seen: [...addressHints].sort(),
        raw_payload_available: "yes",
        notes: "Structured city/state/zip not extracted to columns yet — key scan only.",
        confidence: addressHints.size ? "medium" : "low",
        recommended_ingestion_table: "brain_job_addresses (future)",
        recommended_next_action: "Parse jobAddress / shipTo / install nodes from raw_json samples"
      })
    });

    categories.push({
      id: "account_details",
      ...buildCategoryRow({
        available: "partial",
        api_method_or_source: "Nested account object on job header / operational job node",
        sample_count: accountIdsSeen.size,
        fields_seen: [...accountIdsSeen].slice(0, sampleAccounts),
        raw_payload_available: "partial",
        notes: "Account IDs collected from sampled jobs; dedicated accountQuery not in morawareClient.js.",
        confidence: "medium",
        recommended_ingestion_table: "brain_accounts (future)",
        recommended_next_action: "Add read-only accountQuery probe in a later script revision once XML shape is known"
      })
    });

    categories.push({
      id: "contacts_job_and_account",
      ...buildCategoryRow({
        available: contactsTotal > 0 ? "partial" : "unknown",
        api_method_or_source: "normalizeJobOperational → jobContacts / jobContact",
        sample_count: contactsTotal,
        fields_seen: [...contactKeys].sort(),
        raw_payload_available: "yes",
        notes: "Job-scoped contacts ingested in production Brain; account-wide rolodex not probed here.",
        confidence: contactsTotal ? "high" : "medium",
        recommended_ingestion_table: "brain_job_contacts (+ future brain_account_contacts)",
        recommended_next_action: "Extend normalization for reminder instruction fields when found in raw"
      })
    });

    categories.push({
      id: "activities_calendar_signals",
      ...buildCategoryRow({
        available: activitiesTotal > 0 ? "partial" : "unknown",
        api_method_or_source: "normalizeJobOperational activities; MorawareClient.listAllJobs paging",
        sample_count: activitiesTotal,
        fields_seen: [...activityKeys].sort().slice(0, 250),
        raw_payload_available: "yes",
        notes: `Assignee/reminder heuristics on first activity raw keys (counts pseudo): ${JSON.stringify(assigneeHints)}. Saved Moraware calendar view definitions: not queried in repo — reconstruct from activities.`,
        confidence: "medium",
        recommended_ingestion_table: "brain_job_activities + future assignment columns",
        recommended_next_action: "Mine raw_json for assignedTo / machine / truck; validate with shop calendars"
      })
    });

    categories.push({
      id: "forms_worksheets_checklist_accounting",
      ...buildCategoryRow({
        available: formsTotal > 0 ? "partial" : "unknown",
        api_method_or_source: "fetchJobFormsAllFields (jobFormQuery SDK path)",
        sample_count: formsTotal,
        fields_seen: [...fieldLabels].sort().slice(0, 300),
        raw_payload_available: "yes",
        notes: "Install checklist / accounting forms not distinguished without template-id rules.",
        confidence: "high",
        recommended_ingestion_table: "brain_forms, brain_fields",
        recommended_next_action: "Template allowlist for install/accounting forms"
      })
    });

    categories.push({
      id: "files_attachments",
      ...buildCategoryRow({
        available: includeFilesProbe && fileHints.size ? "partial" : includeFilesProbe ? "unknown" : "no",
        api_method_or_source: "Key scan on operational job node JSON (MORAWARE_DISCOVERY_INCLUDE_FILES=1)",
        sample_count: picked.length,
        fields_seen: [...fileHints].sort(),
        raw_payload_available: includeFilesProbe ? "partial" : "not_probed",
        notes: includeFilesProbe
          ? "Metadata only; no binary download. Enable snippets only in controlled debug/ folders."
          : "Set MORAWARE_DISCOVERY_INCLUDE_FILES=1 to run lightweight key/json substring probe.",
        confidence: "low",
        recommended_ingestion_table: "brain_job_files (future)",
        recommended_next_action: "Explicit files include in jobQuery when Moraware schema confirmed"
      })
    });

    categories.push({
      id: "phases_and_issues",
      ...buildCategoryRow({
        available: phasesTotal > 0 || issueHints.size ? "partial" : "unknown",
        api_method_or_source: "normalizeJobOperational phases; key scan for 'issue'",
        sample_count: phasesTotal,
        fields_seen: [...issueHints].sort(),
        raw_payload_available: "partial",
        notes: `Phases observed: ${phasesTotal}; issue-like keys: ${issueHints.size ? [...issueHints].join(", ") : "none in key scan"}.`,
        confidence: "medium",
        recommended_ingestion_table: "brain_job_phases; brain_job_issues (future)",
        recommended_next_action: "Dedicated issue node discovery if Moraware exposes jobIssue/accountIssue"
      })
    });

    /** Calendar / query experiments */
    const dateExp = await tryDateRangeJobQuery(client, startDate, endDate);
    await delayBetweenCalls();

    categories.push({
      id: "calendar_query_experiments",
      ...buildCategoryRow({
        available: dateExp.ok ? "partial" : "unknown",
        api_method_or_source: "Experimental jobQuery filter creationDate range + pagingSpec",
        sample_count: dateExp.jobs_returned ?? 0,
        fields_seen: [],
        raw_payload_available: "n/a",
        notes: JSON.stringify(dateExp),
        confidence: dateExp.ok ? "medium" : "low",
        recommended_ingestion_table: "n/a (query capability)",
        recommended_next_action: "Align filter XML with Moraware v5 docs for your tenant if experiment failed"
      })
    });

    categories.push({
      id: "saved_view_definitions",
      ...buildCategoryRow({
        available: "no",
        api_method_or_source: "none in repo",
        sample_count: 0,
        fields_seen: [],
        raw_payload_available: "no",
        notes: "No Moraware saved calendar view export API referenced in eOS code — assume eOS reconstructs views.",
        confidence: "high",
        recommended_ingestion_table: "n/a",
        recommended_next_action: "Build Shop/Machine/Programming views from brain_job_activities + business rules"
      })
    });

    /** Account-scoped job list (small sample of accounts) */
    const accountList = [...accountIdsSeen].slice(0, sampleAccounts);
    const accountProbe = [];
    for (const aid of accountList) {
      try {
        const rows = await client.listAccountJobs({ accountId: aid, includeCreationDate: true });
        await delayBetweenCalls();
        accountProbe.push({ account_id: aid, jobs_returned: rows?.length ?? 0 });
        if (keyShapeCollector && Array.isArray(rows)) {
          for (const row of rows.slice(0, 5)) {
            if (row && typeof row === "object") keyShapeCollector.ingest("account_jobs_list", row);
          }
        }
      } catch (e) {
        accountProbe.push({ account_id: aid, error: String(e?.message || e) });
        errors.push({ stage: "listAccountJobs", account_id: aid, error: String(e?.message || e) });
      }
    }

    categories.push({
      id: "account_jobs_list",
      ...buildCategoryRow({
        available: accountProbe.some((x) => x.jobs_returned != null) ? "partial" : "unknown",
        api_method_or_source: "MorawareClient.listAccountJobs (account-scoped jobQuery)",
        sample_count: accountProbe.length,
        fields_seen: accountProbe.flatMap((x) => (x.jobs_returned != null ? [`account:${x.account_id}:${x.jobs_returned}`] : [])),
        raw_payload_available: "partial",
        notes: "Lists jobs per account; not a Moraware UI saved-search replica.",
        confidence: "high",
        recommended_ingestion_table: "brain_jobs (existing)",
        recommended_next_action: "Use for account history views in eOS SQL/API"
      })
    });

    const payload = {
      generatedAt: new Date().toISOString(),
      sample_job_count: picked.length,
      coverage_confidence: picked.length ? "normal" : "low",
      job_sampling: {
        ...jobSampling,
        note:
          "Account sampling uses account IDs seen on sampled job headers / operational payloads — no separate account crawl."
      },
      disclaimer:
        "Read-only discovery. No Supabase writes. Output may still contain business-sensitive field names; snippets flag may include PII when enabled.",
      env: {
        moraware_account_id_from_env: Boolean(accountIdFromEnv),
        moraware_account_id_note: accountIdFromEnv
          ? "MORAWARE_ACCOUNT_ID is set (value not echoed in this report)."
          : "MORAWARE_ACCOUNT_ID not set; same optional behavior as MorawareClient / sync (empty accountId on sessionCreate).",
        MORAWARE_DISCOVERY_SAMPLE_JOBS: sampleJobs,
        MORAWARE_DISCOVERY_SAMPLE_ACCOUNTS: sampleAccounts,
        MORAWARE_DISCOVERY_START_DATE: startDate || null,
        MORAWARE_DISCOVERY_END_DATE: endDate || null,
        MORAWARE_DISCOVERY_INCLUDE_FILES: includeFilesProbe,
        MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS: includeRawSnippets,
        MORAWARE_DISCOVERY_KEY_SHAPES: keyShapesEnabled,
        MORAWARE_DISCOVERY_QUIET_LOGS: process.env.MORAWARE_DISCOVERY_QUIET_LOGS
      },
      job_probe_rows: jobProbeRows,
      account_probe: accountProbe,
      categories,
      errors
    };

    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(OUT_JSON, JSON.stringify(payload, null, 2), "utf8");

    const txt = [
      "MORAWARE EXPANDED DISCOVERY (read-only)",
      `generatedAt: ${payload.generatedAt}`,
      `sample_job_count: ${payload.sample_job_count}`,
      `coverage_confidence: ${payload.coverage_confidence}`,
      ...(picked.length
        ? []
        : ["ZERO SAMPLE JOBS — see job_sampling.zero_jobs_hints in JSON.", ""]),
      "",
      ...categories.map((c) => `[${c.id}] ${c.available}\n  source: ${c.api_method_or_source}\n  samples: ${c.sample_count}\n  notes: ${c.notes}\n  next: ${c.recommended_next_action}\n`),
      "",
      "Per-job stages:",
      JSON.stringify(jobProbeRows, null, 2),
      ...(keyShapesEnabled
        ? [
            "",
            `Key-shape reports: ${OUT_KEY_SHAPES_JSON}`,
            `                  ${OUT_KEY_SHAPES_TXT}`,
            ...(includeRawSnippets
              ? [
                  "WARNING: INCLUDE_RAW_SNIPPETS=1 may embed customer text in key-shape example_scalar_kinds — keep under debug/ only; do not commit."
                ]
              : [])
          ]
        : [])
    ].join("\n");
    await fs.writeFile(OUT_TXT, txt, "utf8");

    console.log(`[discover] Wrote ${OUT_JSON}`);
    console.log(`[discover] Wrote ${OUT_TXT}`);

    if (keyShapesEnabled && keyShapeCollector) {
      const ks = keyShapeCollector.finalize();
      ks.job_notes_scope_research = { per_job: jobNotesScopeResearch };
      const fileLikeRe = /file|attach|document|pdf|upload|blob|mime|content/i;
      ks.file_and_attachment_paths = includeFilesProbe
        ? ks.paths.filter((p) => fileLikeRe.test(p.key_path)).slice(0, 400)
        : {
            probed: false,
            note: "Set MORAWARE_DISCOVERY_INCLUDE_FILES=1 to list file/attachment-like key paths (metadata only; no downloads)."
          };
      ks.contacts_key_shapes = {
        paths: ks.paths.filter((p) => p.payload_area === "contacts").slice(0, 500),
        name_phone_email_note_like: ks.paths
          .filter((p) => p.payload_area === "contacts")
          .filter((p) =>
            /name|phone|cell|email|mail|note|instruction|contact/i.test(p.key_path)
          )
          .slice(0, 120),
        note: "Values are not echoed; scalar kinds are length/type hints unless MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS=1."
      };
      ks.fields_area = {
        paths: ks.paths.filter((p) => p.payload_area === "forms_normalized").slice(0, 400)
      };
      await fs.writeFile(OUT_KEY_SHAPES_JSON, JSON.stringify(ks, null, 2), "utf8");
      const ksTxt = buildKeyShapesTxtReport({
        generatedAt: payload.generatedAt,
        keyJsonSummary: ks,
        includeRawSnippets,
        keyShapesEnabled
      });
      await fs.writeFile(OUT_KEY_SHAPES_TXT, ksTxt, "utf8");
      console.log(`[discover] Wrote ${OUT_KEY_SHAPES_JSON}`);
      console.log(`[discover] Wrote ${OUT_KEY_SHAPES_TXT}`);
    }

    if (errors.length) console.log(`[discover] Completed with ${errors.length} non-fatal recorded errors (see JSON).`);
}

main().catch((e) => {
  console.error("[discover] Fatal:", e?.message || e);
  process.exit(1);
});
