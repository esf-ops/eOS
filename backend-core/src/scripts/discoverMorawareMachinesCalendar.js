#!/usr/bin/env node
/**
 * Read-only discovery: Moraware "Machines" calendar view vs job/activity API payloads.
 * - Does NOT write to Supabase (optional read-only Brain queries only).
 * - Does NOT mutate Moraware.
 * - Does NOT implement /api/titans/machines-day.
 *
 * Outputs:
 *   debug/moraware/latest/machines-calendar-discovery.json
 *   debug/moraware/latest/machines-calendar-discovery.txt
 *   debug/moraware/latest/machines-assignment-key-discovery.json
 *   debug/moraware/latest/machines-assignment-key-discovery.txt
 *   (separate script) debug/moraware/latest/machines-assignee-xml-probe.{json,txt} — npm run eos:probe:moraware-assignee-xml
 *
 * @see docs/MORAWARE_MACHINES_CALENDAR_DISCOVERY.md
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { MorawareClient, fetchJobOperationalAll } from "../../../src/morawareClient.js";
import { normalizeJobOperational, mergeActivityFieldsForBrainInsert } from "../../../src/morawareOperational.js";
import { collectGlobalSyncStyleJobListSample } from "../../../src/morawareDiscovery.js";

process.env.MORAWARE_DISCOVERY_QUIET_LOGS ??= "1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const OUT_DIR = path.join(REPO_ROOT, "debug", "moraware", "latest");
const OUT_JSON = path.join(OUT_DIR, "machines-calendar-discovery.json");
const OUT_TXT = path.join(OUT_DIR, "machines-calendar-discovery.txt");
const ASSIGN_JSON = path.join(OUT_DIR, "machines-assignment-key-discovery.json");
const ASSIGN_TXT = path.join(OUT_DIR, "machines-assignment-key-discovery.txt");

/** Include tag names to probe on jobActivityQuery (speculative; Moraware may ignore or error). */
const JOB_ACTIVITY_INCLUDE_PROBE_TAGS = [
  "assignees",
  "Assignees",
  "Assignee",
  "jobActivityAssignees",
  "jobActivityAssignee",
  "activityAssignees",
  "activityAssignee",
  "assignedTo",
  "assignee",
  "resource",
  "resources",
  "employee",
  "employees",
  "machine",
  "machines",
  "equipment",
  "calendar",
  "calendarResource",
  "scheduleResource",
  "activityResource",
  "activityAssignment",
  "assigned",
  "crew",
  "user",
  "userAccount",
  "worker",
  "owner"
];

/** Normalized substring tokens (lowercase) in addition to full machine labels. */
const MACHINE_TOKEN_VARIANTS_EXTRA = [
  "robot 1",
  "saber 1",
  "saber 2",
  "titan 1",
  "titan 2",
  "titan 3",
  "titan 4",
  "titan 7",
  "titan 8",
  "titan1",
  "titan2",
  "titan3",
  "titan4",
  "titan7",
  "titan8"
];

function toInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function delayBetweenCalls() {
  const ms = toInt(process.env.MORAWARE_DISCOVERY_DELAY_MS, 350);
  if (ms > 0) await sleep(ms);
}

function pickJobId(job) {
  if (!job || typeof job !== "object") return "";
  const id = job._attributes?.id ?? job.id ?? job.jobId;
  return id != null ? String(id).trim() : "";
}

function envList(name, defaultCsv) {
  const raw = String(process.env[name] ?? "").trim();
  const s = raw || defaultCsv;
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseYmd(s) {
  const m = String(s ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatYmd(d) {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function addDaysYmd(ymd, deltaDays) {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return formatYmd(d);
}

function activityTypeLabel(act) {
  const m = mergeActivityFieldsForBrainInsert(act);
  return String(m.activityTypeName || act?.activityType || "").trim();
}

function activityStatusLabel(act) {
  const m = mergeActivityFieldsForBrainInsert(act);
  return String(m.activityStatusName || act?.activityStatus || "").trim();
}

function matchesActivityTypes(label, types) {
  const t = String(label ?? "").trim().toLowerCase();
  if (!t) return false;
  return types.some((want) => t === want.toLowerCase() || t.includes(want.toLowerCase()));
}

function activityStartYmd(act) {
  const s = act?.startDate;
  if (s == null || String(s).trim() === "") return "";
  const m = String(s).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function inDateRangeInclusive(ymd, startYmd, endYmd) {
  if (!ymd) return false;
  return ymd >= startYmd && ymd <= endYmd;
}

function collectShallowKeys(obj, max = 200) {
  const out = new Set();
  const walk = (v, depth) => {
    if (out.size >= max || v == null || depth > 6) return;
    if (typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v.slice(0, 8)) walk(x, depth + 1);
      return;
    }
    for (const k of Object.keys(v)) {
      if (k.startsWith("@_")) continue;
      out.add(k);
      if (out.size < max && depth < 5) walk(v[k], depth + 1);
    }
  };
  walk(obj, 0);
  return [...out].sort();
}

/** Unique key paths under an activity raw object (array steps normalized as [n]). */
function collectStructuralKeyPaths(value, prefix = "", seen = new Set(), depth = 0, maxDepth = 14, maxPaths = 3500) {
  if (seen.size >= maxPaths || depth > maxDepth) return seen;
  if (value == null) return seen;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    if (prefix) seen.add(`${prefix} =:${t}`);
    return seen;
  }
  if (Array.isArray(value)) {
    if (prefix) seen.add(`${prefix}[]`);
    if (value.length) collectStructuralKeyPaths(value[0], prefix ? `${prefix}[0]` : "[0]", seen, depth + 1, maxDepth, maxPaths);
    return seen;
  }
  if (t === "object") {
    for (const k of Object.keys(value)) {
      if (k.startsWith("@_")) continue;
      const p = prefix ? `${prefix}.${k}` : k;
      seen.add(p);
      collectStructuralKeyPaths(value[k], p, seen, depth + 1, maxDepth, maxPaths);
    }
  }
  return seen;
}

function machineAssignmentKeyCandidates(keys) {
  const re = /assign|resource|employee|machine|crew|calendar|workcenter|work\s*center|installer|truck|jwd|robot|titan|saber/i;
  return keys.filter((k) => re.test(k));
}

function jsonBlobForScan(obj) {
  try {
    return JSON.stringify(obj ?? {}).toLowerCase();
  } catch {
    return "";
  }
}

function matchMachineFromList(blob, machineNames) {
  for (const name of machineNames) {
    const n = String(name).trim().toLowerCase();
    if (!n) continue;
    if (blob.includes(n)) return name;
    const short = n.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (short && short !== n && blob.includes(short)) return name;
  }
  return "";
}

function extractAssignedLikeText(raw) {
  if (!raw || typeof raw !== "object") return "";
  const parts = [];
  const grab = (node) => {
    if (node == null) return;
    if (typeof node === "string" || typeof node === "number") {
      parts.push(String(node).trim());
      return;
    }
    if (Array.isArray(node)) {
      for (const x of node.slice(0, 5)) grab(x);
      return;
    }
    if (typeof node === "object") {
      const t = node._text ?? node["#text"];
      if (t != null) parts.push(String(t).trim());
      if (node.name != null) grab(node.name);
      if (node.contactName != null) grab(node.contactName);
    }
  };
  for (const key of ["assignedTo", "resource", "employee", "machine", "crew", "installer", "calendarRow"]) {
    if (raw[key] != null) grab(raw[key]);
  }
  return parts.filter(Boolean).join(" | ").slice(0, 400);
}

function inferChecklistState({ statusName, machineMatched, hasSchedTime, hasStartDate }) {
  const st = String(statusName ?? "").trim().toLowerCase();
  if (/\bcomplete\b/.test(st)) return "complete";
  if (!hasStartDate && !hasSchedTime) return "needs_review";
  if (!machineMatched) return "needs_review";
  return "scheduled";
}

function hasMorawareCreds() {
  return Boolean(
    String(process.env.MORAWARE_API_URL ?? "").trim() &&
      String(process.env.MORAWARE_USERNAME ?? "").trim() &&
      String(process.env.MORAWARE_PASSWORD ?? "").trim()
  );
}

function hasSupabaseReadCreds() {
  return Boolean(String(process.env.SUPABASE_URL ?? "").trim() && String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim());
}

function buildAllSearchTokens(machineNames) {
  const out = new Set();
  for (const m of machineNames) {
    const s = String(m).trim().toLowerCase();
    if (s) out.add(s);
  }
  for (const t of MACHINE_TOKEN_VARIANTS_EXTRA) out.add(t);
  return [...out];
}

function morawareErrorsFromResponse(data) {
  const mr = data?.MorawareResponse;
  if (!mr) return null;
  return mr.error ?? mr.errors ?? null;
}

function deriveMorawareWebBaseFromApiUrl(apiUrl) {
  const envBase = String(process.env.MORAWARE_WEB_BASE_URL ?? "").trim();
  if (envBase) return envBase.replace(/\/$/, "");
  try {
    const u = new URL(String(apiUrl ?? "").trim());
    const pathname = u.pathname || "";
    if (/\/api\/?$/i.test(pathname)) {
      return `${u.origin}${pathname.replace(/\/api\/?$/i, "").replace(/\/$/, "") || ""}` || u.origin;
    }
    return u.origin;
  } catch {
    return "";
  }
}

function isLikelyStructuredAssignmentPath(path) {
  return /(^|\.)(assignedTo|assignee|resource|resources|employee|employees|machine|machines|equipment|calendar|calendarResource|scheduleResource|activityResource|activityAssignment|assigned|crew|worker|owner)(\.|$)/i.test(
    String(path ?? "")
  );
}

function bumpTokenMatch(map, token, path, area, jobId) {
  const k = `${token}\t${path}\t${area}`;
  if (!map.has(k)) {
    map.set(k, { token, matched_path: path, matched_area: area, match_count: 0, sample_job_ids: [] });
  }
  const rec = map.get(k);
  rec.match_count += 1;
  if (jobId && rec.sample_job_ids.length < 5 && !rec.sample_job_ids.includes(jobId)) {
    rec.sample_job_ids.push(jobId);
  }
}

/**
 * Scan primitives in an object tree for token substrings; record path + area (no raw values in report).
 */
function scanObjectForTokens(value, pathSoFar, area, tokens, matchMap, jobId, maxNodes) {
  let nodes = 0;
  const walk = (v, p) => {
    if (nodes++ > maxNodes) return;
    if (v == null) return;
    const typ = typeof v;
    if (typ === "string") {
      const low = v.toLowerCase();
      for (const token of tokens) {
        if (token && low.includes(token)) bumpTokenMatch(matchMap, token, p || "(root)", area, jobId);
      }
      return;
    }
    if (typ === "number" || typ === "boolean") {
      const low = String(v).toLowerCase();
      for (const token of tokens) {
        if (token && low.includes(token)) bumpTokenMatch(matchMap, token, p || "(root)", area, jobId);
      }
      return;
    }
    if (Array.isArray(v)) {
      v.slice(0, 6).forEach((item, i) => walk(item, `${p}[${i}]`));
      return;
    }
    if (typ === "object") {
      for (const key of Object.keys(v)) {
        if (key.startsWith("@_")) continue;
        const next = p ? `${p}.${key}` : key;
        walk(v[key], next);
      }
    }
  };
  walk(value, pathSoFar);
}

async function probeSavedViewOrCalendarApis(client, viewId) {
  const results = [];
  const vid = String(viewId ?? "").trim() || "146";

  const experiments = [
    {
      id: "calendarQuery_filter_view",
      inner: `<calendarQuery>\n  <filter xmlns="">\n    <view id="${vid}"/>\n  </filter>\n</calendarQuery>`
    },
    {
      id: "viewQuery_filter_view",
      inner: `<viewQuery>\n  <filter xmlns="">\n    <view id="${vid}"/>\n  </filter>\n</viewQuery>`
    },
    {
      id: "savedViewQuery_filter_view",
      inner: `<savedViewQuery>\n  <filter xmlns="">\n    <view id="${vid}"/>\n  </filter>\n</savedViewQuery>`
    }
  ];

  for (const ex of experiments) {
    try {
      await client.ensureSession();
      const { data } = await client.morawareCommand(ex.inner);
      await delayBetweenCalls();
      const mr = data?.MorawareResponse;
      const topKeys = mr && typeof mr === "object" ? Object.keys(mr) : [];
      const errNode = mr?.error ?? mr?.errors;
      const meaningfulKeys = topKeys.filter((k) => k !== "xmlns" && k !== "sessionId" && k !== "session");
      const ok = Boolean(data && !data.parseError && !errNode && meaningfulKeys.length > 0);
      results.push({
        experiment_id: ex.id,
        ok,
        moraware_response_keys: topKeys,
        meaningful_moraware_response_keys: meaningfulKeys,
        error_node_present: Boolean(errNode),
        note:
          "Speculative read-only command. ok=true only if MorawareResponse contains non-empty payload keys (empty object counts as failure)."
      });
    } catch (e) {
      results.push({
        experiment_id: ex.id,
        ok: false,
        error: String(e?.message || e),
        note: "Command rejected or transport error — expected when API shape differs."
      });
    }
  }

  return {
    view_id_probed: vid,
    outcome:
      "No experiment in this script proved access to saved Machines view XML. Treat Machines UI as server-rendered unless a tenant-specific Moraware doc confirms a calendarQuery/viewQuery contract.",
    experiments: results
  };
}

async function probeJobActivityQueryWithAssignIncludes(client, jobId) {
  const jid = String(jobId ?? "").trim();
  if (!jid) return { ok: false, note: "no job id" };
  const inner =
    `  <jobActivityQuery>\n` +
    `    <filter>\n` +
    `      <job id="${jid}" />\n` +
    `    </filter>\n` +
    `    <include>\n` +
    `      <startDate />\n` +
    `      <schedTime />\n` +
    `      <duration />\n` +
    `      <notes />\n` +
    `      <description />\n` +
    `      <status />\n` +
    `      <activityType />\n` +
    `      <assignedTo />\n` +
    `      <resource />\n` +
    `      <employee />\n` +
    `      <jobActivitySeries />\n` +
    `    </include>\n` +
    `  </jobActivityQuery>`;
  try {
    await client.ensureSession();
    const { data } = await client.morawareCommand(inner);
    await delayBetweenCalls();
    const jaq = data?.MorawareResponse?.jobActivityQuery;
    const rows = Array.isArray(jaq?.jobActivity) ? jaq.jobActivity : jaq?.jobActivity ? [jaq.jobActivity] : [];
    const keyUnion = new Set();
    for (const row of rows.slice(0, 15)) {
      for (const k of collectShallowKeys(row, 120)) keyUnion.add(k);
    }
    return {
      ok: true,
      job_id: jid,
      activities_returned: rows.length,
      shallow_keys_union_sample: [...keyUnion].sort(),
      assign_related_keys: machineAssignmentKeyCandidates([...keyUnion])
    };
  } catch (e) {
    return { ok: false, job_id: jid, error: String(e?.message || e) };
  }
}

/**
 * Single-tag include probe: Moraware may accept, ignore, or reject unknown includes.
 */
async function probeJobActivityQuerySingleInclude(client, jobId, includeTag) {
  const jid = String(jobId ?? "").trim();
  const inner =
    `  <jobActivityQuery>\n` +
    `    <filter>\n` +
    `      <job id="${jid}" />\n` +
    `    </filter>\n` +
    `    <include>\n` +
    `      <startDate />\n` +
    `      <activityType />\n` +
    `      <status />\n` +
    `      <${includeTag} />\n` +
    `    </include>\n` +
    `  </jobActivityQuery>`;
  try {
    await client.ensureSession();
    const { data } = await client.morawareCommand(inner);
    await delayBetweenCalls();
    const err = morawareErrorsFromResponse(data);
    const jaq = data?.MorawareResponse?.jobActivityQuery;
    const rows = Array.isArray(jaq?.jobActivity) ? jaq.jobActivity : jaq?.jobActivity ? [jaq.jobActivity] : [];
    const keysFirst = rows[0] && typeof rows[0] === "object" ? collectShallowKeys(rows[0], 200) : [];
    const classification = err
      ? "moraware_error_in_response"
      : rows.length === 0
        ? "empty_activities_maybe_ignored_include"
        : keysFirst.some((k) => k.toLowerCase() === includeTag.toLowerCase() || k.toLowerCase().includes(includeTag.toLowerCase()))
          ? "accepted_include_keys_present"
          : "accepted_command_keys_check_includes";
    return {
      include_tag: includeTag,
      classification,
      moraware_error: err ? true : false,
      activities_returned: rows.length,
      activity_top_keys_sample: keysFirst.slice(0, 60),
      assign_related_keys: machineAssignmentKeyCandidates(keysFirst)
    };
  } catch (e) {
    return { include_tag: includeTag, classification: "transport_or_parse_error", error: String(e?.message || e) };
  }
}

async function probeJobQueryActivityNestedIncludes(client, jobId) {
  const jid = String(jobId ?? "").trim();
  const experiments = [
    {
      id: "jobQuery_jobActivity_assignedTo_resource",
      inner:
        `<jobQuery>\n` +
        `  <filter xmlns="">\n` +
        `    <job id="${jid}"/>\n` +
        `  </filter>\n` +
        `  <include xmlns="">\n` +
        `    <jobActivity>\n` +
        `      <startDate/>\n` +
        `      <schedTime/>\n` +
        `      <assignedTo><name/></assignedTo>\n` +
        `      <resource><name/></resource>\n` +
        `      <employee><name/></employee>\n` +
        `    </jobActivity>\n` +
        `  </include>\n` +
        `</jobQuery>`
    },
    {
      id: "jobQuery_jobActivity_machine_calendarResource",
      inner:
        `<jobQuery>\n` +
        `  <filter xmlns="">\n` +
        `    <job id="${jid}"/>\n` +
        `  </filter>\n` +
        `  <include xmlns="">\n` +
        `    <jobActivity>\n` +
        `      <startDate/>\n` +
        `      <machine/>\n` +
        `      <calendarResource/>\n` +
        `      <scheduleResource/>\n` +
        `      <activityResource/>\n` +
        `    </jobActivity>\n` +
        `  </include>\n` +
        `</jobQuery>`
    }
  ];
  const out = [];
  for (const ex of experiments) {
    try {
      await client.ensureSession();
      const { data } = await client.morawareCommand(ex.inner);
      await delayBetweenCalls();
      const err = morawareErrorsFromResponse(data);
      const job = data?.MorawareResponse?.jobQuery?.job;
      const jn = Array.isArray(job) ? job[0] : job;
      const ja = jn?.jobActivity;
      const rows = Array.isArray(ja?.jobActivity) ? ja.jobActivity : ja?.jobActivity ? [ja.jobActivity] : [];
      const keys = rows[0] ? collectShallowKeys(rows[0], 220) : [];
      out.push({
        experiment_id: ex.id,
        ok: Boolean(!err && data && !data.parseError),
        moraware_error: Boolean(err),
        activities_returned: rows.length,
        activity_keys_sample: keys.slice(0, 80),
        assign_related_keys: machineAssignmentKeyCandidates(keys)
      });
    } catch (e) {
      out.push({ experiment_id: ex.id, ok: false, error: String(e?.message || e) });
    }
  }
  return { job_id: jid, experiments: out };
}

async function probeCalendarHtmlReadOnly(client, viewId, effdate) {
  const tryHtml = String(process.env.MORAWARE_MACHINES_TRY_CALENDAR_HTML ?? "1").trim() === "1";
  if (!tryHtml) {
    return { attempted: false, note: "Set MORAWARE_MACHINES_TRY_CALENDAR_HTML=1 (default) to attempt GET /sys/calendar HTML probe." };
  }
  const apiUrl = String(process.env.MORAWARE_API_URL ?? "").trim();
  const base = deriveMorawareWebBaseFromApiUrl(apiUrl);
  if (!base) {
    return { attempted: false, note: "Could not derive web base URL; set MORAWARE_WEB_BASE_URL explicitly." };
  }
  let sessionId = "";
  try {
    await client.ensureSession();
    sessionId = String(client.sessionId ?? "").trim();
  } catch {
    /* session may still be unavailable */
  }

  const urls = [
    `${base}/sys/calendar?&view=${encodeURIComponent(viewId)}&effdate=${encodeURIComponent(effdate)}`,
    `${base}/sys/calendar?view=${encodeURIComponent(viewId)}&effdate=${encodeURIComponent(effdate)}`
  ];
  if (sessionId) {
    urls.push(
      `${base}/sys/calendar?&view=${encodeURIComponent(viewId)}&effdate=${encodeURIComponent(effdate)}&sessionId=${encodeURIComponent(sessionId)}`
    );
  }

  const machineNeedles = ["titan", "saber", "robot", "calendar", "view="];
  const results = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "text/html,*/*" },
        redirect: "follow"
      });
      const text = await res.text();
      const head = text.slice(0, 6000).toLowerCase();
      const looksLogin = /type=["']password["']|name=["']password["']|log\s*in|sign\s*in/i.test(head);
      const hits = machineNeedles.filter((n) => head.includes(n));
      const jobIdLike = (text.match(/\bjob\s*id\s*[:=]\s*["']?(\d{4,8})/i) || [])[1] || null;
      results.push({
        url: url.replace(/sessionId=[^&]+/i, "sessionId=(redacted)"),
        http_status: res.status,
        html_length: text.length,
        appears_login_or_unauthenticated: looksLogin,
        lowercase_needle_hits_in_head: hits,
        possible_job_id_in_first_80k: jobIdLike,
        note: "Discovery-only GET; not a supported production ingestion path. Session cookie auth may be required vs XML session id."
      });
    } catch (e) {
      results.push({ url, error: String(e?.message || e) });
    }
  }

  const anyRich = results.some((r) => r.html_length && r.html_length > 5000 && !r.appears_login_or_unauthenticated);
  return {
    attempted: true,
    web_base_used: base,
    feasible_for_machine_row_discovery: Boolean(anyRich),
    assessment: anyRich
      ? "possible_but_not_preferred_until_validated — HTML returned without obvious login gate; verify machine rows manually; prefer API field if found."
      : "likely_requires_browser_session_or_different_host — treat calendar HTML as secondary; continue API key-path discovery.",
    fetch_results: results
  };
}

async function optionalSupabaseBrainSample({ effdate, rangeStart, rangeEnd, activityTypes, machineNames, includeRawSnippets }) {
  if (!hasSupabaseReadCreds()) {
    return {
      ran: false,
      note: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipped read-only Brain sample."
    };
  }

  const url = String(process.env.SUPABASE_URL).trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY).trim();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const cols = includeRawSnippets
    ? "id, job_id, activity_type, activity_type_name, activity_status, status_name, start_date, sched_time, duration, notes, description, phase_name, raw_json"
    : "id, job_id, activity_type, activity_type_name, activity_status, status_name, start_date, sched_time, duration, notes, description, phase_name";

  const { data, error } = await supabase
    .from("brain_job_activities")
    .select(cols)
    .gte("start_date", rangeStart)
    .lte("start_date", rangeEnd)
    .order("id", { ascending: false })
    .limit(toInt(process.env.MORAWARE_MACHINES_BRAIN_SAMPLE_LIMIT, 600));

  if (error) {
    return { ran: true, ok: false, error: error.message };
  }

  const typesLc = activityTypes.map((t) => t.toLowerCase());
  const filtered = (data ?? []).filter((row) => {
    const t1 = String(row.activity_type_name ?? row.activity_type ?? "").toLowerCase();
    return typesLc.some((w) => t1.includes(w));
  });

  let machineHits = 0;
  let completeStatuses = 0;
  const machineHitExamples = [];

  for (const row of filtered) {
    const blob = [
      row.activity_type,
      row.activity_type_name,
      row.activity_status,
      row.status_name,
      row.notes,
      row.description,
      row.phase_name,
      includeRawSnippets ? jsonBlobForScan(row.raw_json) : ""
    ]
      .map((x) => String(x ?? "").toLowerCase())
      .join("\n");

    const m = matchMachineFromList(blob, machineNames);
    if (m) {
      machineHits += 1;
      if (machineHitExamples.length < 12) {
        machineHitExamples.push({
          job_id: row.job_id,
          start_date: row.start_date,
          activity_type: row.activity_type_name ?? row.activity_type,
          status_name: row.status_name ?? row.activity_status,
          matched_machine_token: m
        });
      }
    }
    const st = String(row.status_name ?? row.activity_status ?? "").toLowerCase();
    if (/\bcomplete\b/.test(st)) completeStatuses += 1;
  }

  return {
    ran: true,
    ok: true,
    effdate,
    requested_range: { start: rangeStart, end: rangeEnd },
    rows_in_range: data?.length ?? 0,
    rows_matching_activity_types: filtered.length,
    rows_with_machine_token_in_text_or_raw: machineHits,
    rows_status_complete_like: completeStatuses,
    sample_machine_hits: machineHitExamples,
    note: "Read-only; no writes. Token match is substring heuristic, not validated assignment column."
  };
}

async function brainSawPolishDeepAnalysis({ rangeStart, rangeEnd, activityTypes, machineNames }) {
  if (!hasSupabaseReadCreds()) {
    return { ran: false, note: "Supabase env not set." };
  }
  const url = String(process.env.SUPABASE_URL).trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY).trim();
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const cols =
    "id, job_id, activity_type, activity_type_name, activity_status, status_name, start_date, sched_time, duration, notes, description, phase_name, raw_json";

  const { data, error } = await supabase
    .from("brain_job_activities")
    .select(cols)
    .gte("start_date", rangeStart)
    .lte("start_date", rangeEnd)
    .order("id", { ascending: false })
    .limit(toInt(process.env.MORAWARE_MACHINES_BRAIN_SAMPLE_LIMIT, 1200));

  if (error) return { ran: true, ok: false, error: error.message };

  const typesLc = activityTypes.map((t) => t.toLowerCase());
  const filtered = (data ?? []).filter((row) => {
    const t1 = String(row.activity_type_name ?? row.activity_type ?? "").toLowerCase();
    return typesLc.some((w) => t1.includes(w));
  });

  const byDate = {};
  let withSchedule = 0;
  let complete = 0;
  let tokenAnywhere = 0;
  const tokens = buildAllSearchTokens(machineNames);

  for (const row of filtered) {
    const d = row.start_date != null ? String(row.start_date) : "unknown";
    byDate[d] = (byDate[d] || 0) + 1;

    const hasSched = Boolean(String(row.sched_time ?? "").trim());
    const hasDur = Boolean(String(row.duration ?? "").trim());
    const hasStart = Boolean(String(row.start_date ?? "").trim());
    if ((hasSched || hasDur) && hasStart) withSchedule += 1;

    const st = String(row.status_name ?? row.activity_status ?? "").toLowerCase();
    if (/\bcomplete\b/.test(st)) complete += 1;

    const blob = [
      row.activity_type,
      row.activity_type_name,
      row.activity_status,
      row.status_name,
      row.notes,
      row.description,
      row.phase_name,
      jsonBlobForScan(row.raw_json)
    ]
      .join("\n")
      .toLowerCase();

    let hit = false;
    for (const t of tokens) {
      if (t && blob.includes(t)) {
        hit = true;
        break;
      }
    }
    if (hit) tokenAnywhere += 1;
  }

  const missingMachineAssignment = filtered.length - tokenAnywhere;

  const brainTokenMap = new Map();
  for (const row of filtered) {
    if (!row.raw_json || typeof row.raw_json !== "object") continue;
    scanObjectForTokens(row.raw_json, "", "brain_job_activities.raw_json", tokens, brainTokenMap, String(row.job_id ?? ""), 6000);
  }
  const brain_token_matches = [...brainTokenMap.values()].sort((a, b) => b.match_count - a.match_count).slice(0, 200);

  return {
    ran: true,
    ok: true,
    saw_polish_row_count: filtered.length,
    count_by_start_date: byDate,
    count_with_schedule_fields: withSchedule,
    count_status_complete_like: complete,
    count_with_machine_token_anywhere: tokenAnywhere,
    count_missing_machine_token_match: missingMachineAssignment,
    brain_token_matches,
    note: "missing_machine_token_match counts rows with no Titan/Saber/Robot token in typed columns or raw_json substring scan. raw_json selected for path/token discovery only; values are not copied into this report."
  };
}

function classifyAssignmentOutcome({
  structuredPathMatches,
  includeProbeStructuredKeys,
  htmlFeasible,
  tokenMatchesInRaw,
  tokenMatchesInNotesOnly
}) {
  if (includeProbeStructuredKeys || structuredPathMatches > 0) {
    return {
      outcome: "A",
      label: "structured_api_field",
      recommended_next_step: "Normalize assigned_machine (and optional work_center) from the proven Moraware path; add column + ingest mapping."
    };
  }
  if (htmlFeasible) {
    return {
      outcome: "B",
      label: "calendar_html_or_view_rendering",
      recommended_next_step:
        "Decide between a controlled calendar-view importer (high maintenance) vs pressing Moraware for an API that exposes resource rows."
    };
  }
  if (tokenMatchesInRaw > 0 && tokenMatchesInNotesOnly === 0) {
    return {
      outcome: "A",
      label: "structured_or_deep_raw_string",
      recommended_next_step: "Drill into matched raw_json paths; confirm stability then normalize."
    };
  }
  return {
    outcome: "C",
    label: "not_found_in_sample",
    recommended_next_step:
      "Validate Moraware API / SDK docs or Moraware support: where calendar resource assignment is exposed for jobActivity rows."
  };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const viewId = String(process.env.MORAWARE_MACHINES_VIEW_ID ?? "146").trim() || "146";
  const effdate = String(process.env.MORAWARE_MACHINES_EFFDATE ?? "2026-05-07").trim() || "2026-05-07";
  const windowDays = toInt(process.env.MORAWARE_MACHINES_DATE_WINDOW_DAYS, 3);
  const rangeStart = addDaysYmd(effdate, -windowDays);
  const rangeEnd = addDaysYmd(effdate, windowDays);
  const activityTypes = envList("MORAWARE_MACHINES_ACTIVITY_TYPES", "Saw,Polish");
  const machineNames = envList(
    "MORAWARE_MACHINES_ASSIGNED_TO",
    "Robot 1,Saber 1,Saber 2,Titan 1 (2k),Titan 2 (3k),Titan 3 (3k),Titan 4 (2k),Titan 7 (3k),Titan 8 (3k)"
  );
  const includeRawSnippets = String(process.env.MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS ?? "0").trim() === "1";
  const sampleJobs = toInt(process.env.MORAWARE_MACHINES_SAMPLE_JOBS, 10);
  const searchTokens = buildAllSearchTokens(machineNames);
  const includeProbeMax = toInt(process.env.MORAWARE_MACHINES_INCLUDE_PROBE_MAX_TAGS, JOB_ACTIVITY_INCLUDE_PROBE_TAGS.length);

  const report = {
    generatedAt: new Date().toISOString(),
    view_id: viewId,
    effdate,
    requested_date_range: { start: rangeStart, end: rangeEnd, window_days_each_side: windowDays },
    machines_requested: machineNames,
    activity_types_requested: activityTypes,
    view_definition_accessible: false,
    view_definition_notes:
      "eOS does not reference a Moraware API to download saved /sys/calendar?view=… definitions. Script runs speculative calendarQuery/viewQuery/savedViewQuery probes; success is unlikely without tenant-specific documentation.",
    activities_reconstructable_from_job_payload: "unknown",
    machine_assignment_key_candidates: [],
    status_key_candidates: ["status", "status.name", "_attributes.id on status", "activityStatus / activityStatusName normalized"],
    start_time_duration_key_candidates: ["startDate", "schedTime", "duration"],
    activity_type_key_candidates: ["activityType", "activityType.name", "_attributes.id on activityType", "activityTypeName normalized"],
    phase_key_candidates: ["jobPhases.jobPhase", "phaseName", "phase_name"],
    notes_description_key_candidates: ["notes", "description", "note", "comment"],
    sample_activities_by_machine: {},
    unmatched_saw_polish_no_machine: [],
    candidate_checklist_states: [
      {
        id: "complete",
        rule: "Moraware activity status name indicates Complete (case-insensitive word boundary).",
        crossed_off_signal: true
      },
      {
        id: "scheduled",
        rule: "Saw/Polish activity exists for the target calendar day with sched_time/start_date and a resolvable machine token — not Complete."
      },
      {
        id: "needs_review",
        rule: "Missing status, missing machine assignment, missing schedule fields, or conflicting duplicate rows."
      }
    ],
    recommended_brain_schema_additions: [
      "assigned_machine (text, nullable) — normalized from Moraware when path proven",
      "work_center (text, nullable) — if Moraware distinguishes work center vs assignee name",
      "sort_order_on_machine_day (int, nullable) — derived from sched_time then job_id/activity_index",
      "checklist_state (text, nullable) — derived enum: complete | scheduled | needs_review"
    ],
    recommended_endpoint_contract: {
      method: "GET",
      path: "/api/titans/machines-day",
      query: { date: "YYYY-MM-DD" },
      reference: "See docs/MORAWARE_MACHINES_CALENDAR_DISCOVERY.md"
    },
    moraware_live: {
      credentials_configured: hasMorawareCreds(),
      calendar_view_api_probes: null,
      job_activity_query_assign_probe: null,
      operational_job_samples: []
    },
    brain_readonly_sample: null,
    errors: []
  };

  /** Accumulators for assignment report (Saw/Polish in date window from operational fetch). */
  const pathUnion = new Set();
  const tokenMatchMap = new Map();
  let assignmentReportWritten = false;

  /** ---- Moraware (optional) ---- */
  if (!hasMorawareCreds()) {
    report.moraware_live.note =
      "Moraware credentials not set (MORAWARE_API_URL, MORAWARE_USERNAME, MORAWARE_PASSWORD). Skipped live Moraware calls.";
    report.activities_reconstructable_from_job_payload =
      "unknown_without_live_payload — set credentials and re-run to analyze jobQuery operational activities.";
  } else {
    const client = new MorawareClient();
    let sawPolishInWindow = 0;
    try {
      report.moraware_live.calendar_view_api_probes = await probeSavedViewOrCalendarApis(client, viewId);
      const anyOk = report.moraware_live.calendar_view_api_probes?.experiments?.some((x) => x.ok);
      report.view_definition_accessible = Boolean(anyOk);
      if (!anyOk) {
        report.view_definition_notes +=
          " Speculative calendar/view commands returned no usable payload keys in this tenant; rely on jobQuery operational reconstruction.";
      }
    } catch (e) {
      report.errors.push({ stage: "calendar_view_api_probes", error: String(e?.message || e) });
    }

    let picked = [];
    try {
      const globalSample = await collectGlobalSyncStyleJobListSample(client, {
        collectCap: Math.max(sampleJobs * 40, 80),
        quiet: true,
        skipProbeArtifacts: true
      });
      await delayBetweenCalls();
      const pool = Array.isArray(globalSample.jobs) ? globalSample.jobs : [];
      const seen = new Set();
      for (const j of pool) {
        if (picked.length >= sampleJobs) break;
        const jid = pickJobId(j);
        if (!jid || seen.has(jid)) continue;
        seen.add(jid);
        picked.push(j);
      }
    } catch (e) {
      report.errors.push({ stage: "collectGlobalSyncStyleJobListSample", error: String(e?.message || e) });
    }

    if (picked.length && picked[0]) {
      const firstJid = pickJobId(picked[0]);
      try {
        report.moraware_live.job_activity_query_assign_probe = await probeJobActivityQueryWithAssignIncludes(client, firstJid);
      } catch (e) {
        report.errors.push({ stage: "job_activity_query_assign_probe", error: String(e?.message || e) });
      }
    }

    const machineBuckets = Object.fromEntries(machineNames.map((m) => [m, []]));
    const unmatched = [];
    const keyCandidateSet = new Set();
    const statusSamples = new Set();

    for (const job of picked) {
      const jid = pickJobId(job);
      if (!jid) continue;
      const row = { job_id: jid, stages: {}, activities_in_window: 0 };
      try {
        const op = await fetchJobOperationalAll(client, jid, { quiet: true });
        await delayBetweenCalls();
        const opNorm = normalizeJobOperational(jid, op.parsed);
        row.stages.operational_fetch = "ok";

        const jobNode = opNorm.raw?.job ?? op.parsed?.MorawareResponse?.jobQuery?.job;
        const jn = Array.isArray(jobNode) ? jobNode[0] : jobNode;
        const jobName = jn?.name != null ? String(jn.name?._text ?? jn.name ?? "").trim() : "";
        const accountName =
          jn?.account?.name != null ? String(jn.account.name?._text ?? jn.account.name ?? "").trim() : "";

        for (const act of opNorm.activities ?? []) {
          const typeLabel = activityTypeLabel(act);
          if (!matchesActivityTypes(typeLabel, activityTypes)) continue;

          const ymd = activityStartYmd(act);
          if (!inDateRangeInclusive(ymd, rangeStart, rangeEnd)) continue;

          sawPolishInWindow += 1;
          row.activities_in_window += 1;

          const raw = act?.raw && typeof act.raw === "object" ? act.raw : {};
          for (const k of machineAssignmentKeyCandidates(collectShallowKeys(raw, 180))) keyCandidateSet.add(k);

          collectStructuralKeyPaths(raw, "", pathUnion, 0, 14, 4000);

          const statusName = activityStatusLabel(act);
          statusSamples.add(statusName || "(empty)");

          scanObjectForTokens(raw, "", "activity_raw_json", searchTokens, tokenMatchMap, jid, 8000);

          const notes = String(act?.notes ?? "").toLowerCase();
          const desc = String(act?.description ?? "").toLowerCase();
          for (const token of searchTokens) {
            if (token && notes.includes(token)) bumpTokenMatch(tokenMatchMap, token, "(normalized_field.notes)", "activity_notes", jid);
            if (token && desc.includes(token)) bumpTokenMatch(tokenMatchMap, token, "(normalized_field.description)", "activity_description", jid);
          }
          const typeBlob = String(typeLabel ?? "").toLowerCase();
          const statBlob = String(statusName ?? "").toLowerCase();
          const phaseBlob = String(act?.phaseName ?? "").toLowerCase();
          for (const token of searchTokens) {
            if (token && typeBlob.includes(token)) bumpTokenMatch(tokenMatchMap, token, "(normalized_field.activity_type)", "activity_type", jid);
            if (token && statBlob.includes(token)) bumpTokenMatch(tokenMatchMap, token, "(normalized_field.status)", "activity_status", jid);
            if (token && phaseBlob.includes(token)) bumpTokenMatch(tokenMatchMap, token, "(normalized_field.phase_name)", "phase_name", jid);
          }

          const blob =
            jsonBlobForScan(raw) +
            "\n" +
            [
              typeLabel,
              statusName,
              act?.notes,
              act?.description,
              extractAssignedLikeText(raw)
            ]
              .map((x) => String(x ?? "").toLowerCase())
              .join("\n");

          const machine = matchMachineFromList(blob, machineNames);
          const checklistState = inferChecklistState({
            statusName,
            machineMatched: Boolean(machine),
            hasSchedTime: Boolean(String(act?.schedTime ?? "").trim()),
            hasStartDate: Boolean(ymd)
          });

          const slim = {
            jobId: jid,
            jobName: jobName || null,
            account: accountName || null,
            activityType: typeLabel,
            status: statusName,
            phaseName: act?.phaseName ?? "",
            scheduledTime: act?.schedTime ?? "",
            duration: act?.duration ?? "",
            notes: includeRawSnippets ? String(act?.notes ?? "").slice(0, 240) : "[redacted — set MORAWARE_DISCOVERY_INCLUDE_RAW_SNIPPETS=1]",
            description: includeRawSnippets ? String(act?.description ?? "").slice(0, 240) : "[redacted]",
            checklistState,
            machine_assignment_guess: machine || null,
            start_date: ymd
          };

          if (machine && machineBuckets[machine]) {
            machineBuckets[machine].push(slim);
          } else if (machine && !machineBuckets[machine]) {
            if (!machineBuckets.__other) machineBuckets.__other = [];
            machineBuckets.__other.push(slim);
          } else {
            unmatched.push({ ...slim, machine_assignment_guess: null });
          }
        }
      } catch (e) {
        row.stages.operational_fetch = `error: ${String(e?.message || e)}`;
        report.errors.push({ job_id: jid, stage: "fetchJobOperationalAll", error: String(e?.message || e) });
      }
      report.moraware_live.operational_job_samples.push(row);
    }

    for (const m of machineNames) {
      report.sample_activities_by_machine[m] = (machineBuckets[m] ?? []).slice(0, 25);
    }
    if (machineBuckets.__other?.length) {
      report.sample_activities_by_machine._unbucketed_label_match = machineBuckets.__other.slice(0, 15);
    }

    report.unmatched_saw_polish_no_machine = unmatched.slice(0, 40);
    report.machine_assignment_key_candidates = [...keyCandidateSet].sort();
    report.status_name_samples_from_activities = [...statusSamples].slice(0, 40);
    report.scheduling_order_hypothesis =
      "Within a machine row and calendar day, sort by sched_time (HH:MM) then duration, then job_id and activity_index as a stable tie-break — pending validation against Moraware UI.";
    report.activities_reconstructable_from_job_payload =
      sawPolishInWindow > 0
        ? "yes_for_date_filtered_types — jobQuery operational payloads include activity type, status, startDate, schedTime, duration; machine row must be inferred from assignee fields or text."
        : "no_matching_rows_in_sample — widen MORAWARE_MACHINES_DATE_WINDOW_DAYS, increase MORAWARE_MACHINES_SAMPLE_JOBS, or set MORAWARE_PROCESS_IDS / date filters so job list includes jobs with Saw/Polish in range.";

    /** ---- Assignment-specific report (same run) ---- */
    let jobActivityIncludeProbes = [];
    let jobQueryNestedProbes = null;
    let calendarHtmlProbe = null;
    try {
      calendarHtmlProbe = await probeCalendarHtmlReadOnly(client, viewId, effdate);
    } catch (e) {
      calendarHtmlProbe = { attempted: true, error: String(e?.message || e) };
    }
    if (picked.length) {
      const probeJid = pickJobId(picked[0]);
      const tags = JOB_ACTIVITY_INCLUDE_PROBE_TAGS.slice(0, includeProbeMax);
      for (const tag of tags) {
        try {
          const r = await probeJobActivityQuerySingleInclude(client, probeJid, tag);
          jobActivityIncludeProbes.push(r);
        } catch (e) {
          jobActivityIncludeProbes.push({ include_tag: tag, classification: "unexpected_error", error: String(e?.message || e) });
        }
      }
      try {
        jobQueryNestedProbes = await probeJobQueryActivityNestedIncludes(client, probeJid);
      } catch (e) {
        jobQueryNestedProbes = { error: String(e?.message || e) };
      }
    }

    const includeProbeStructuredKeys = jobActivityIncludeProbes.some(
      (p) => p.assign_related_keys?.length > 0 && p.classification !== "moraware_error_in_response"
    );

    const tokenRows = [...tokenMatchMap.values()].sort((a, b) => b.match_count - a.match_count);
    const structuredPathMatchCount = tokenRows
      .filter((r) => isLikelyStructuredAssignmentPath(r.matched_path))
      .reduce((s, r) => s + r.match_count, 0);
    const rawAreaMatchCount = tokenRows
      .filter((r) => r.matched_area === "activity_raw_json")
      .reduce((s, r) => s + r.match_count, 0);
    const notesDescMatchCount = tokenRows
      .filter((r) => r.matched_area === "activity_notes" || r.matched_area === "activity_description")
      .reduce((s, r) => s + r.match_count, 0);

    const outcome = classifyAssignmentOutcome({
      structuredPathMatches: structuredPathMatchCount,
      includeProbeStructuredKeys: Boolean(includeProbeStructuredKeys),
      htmlFeasible: Boolean(calendarHtmlProbe?.feasible_for_machine_row_discovery),
      tokenMatchesInRaw: rawAreaMatchCount,
      tokenMatchesInNotesOnly: notesDescMatchCount
    });

    const assignmentReport = {
      generatedAt: new Date().toISOString(),
      view_id: viewId,
      effdate,
      requested_date_range: { start: rangeStart, end: rangeEnd },
      search_tokens_used: searchTokens,
      job_activity_include_probes: {
        job_id: picked.length ? pickJobId(picked[0]) : null,
        probes: jobActivityIncludeProbes,
        note: "Each row: single speculative include tag plus baseline fields. classification interprets Moraware response shape — not guaranteed across versions."
      },
      job_query_nested_activity_probes: jobQueryNestedProbes,
      calendar_html_probe: calendarHtmlProbe,
      activity_key_paths_union: [...pathUnion].sort().slice(0, 5000),
      activity_key_paths_total_unique: pathUnion.size,
      token_matches: tokenRows.slice(0, 400),
      outcome: outcome.outcome,
      outcome_label: outcome.label,
      outcome_interpretation: `Outcome ${outcome.outcome}: ${outcome.label}. ${outcome.recommended_next_step}`,
      recommended_next_step: outcome.recommended_next_step,
      metrics: {
        structured_assignment_path_token_match_count: structuredPathMatchCount,
        raw_json_area_token_match_count: rawAreaMatchCount,
        notes_description_token_match_count: notesDescMatchCount
      },
      brain_saw_polish_deep: await brainSawPolishDeepAnalysis({
        rangeStart,
        rangeEnd,
        activityTypes,
        machineNames
      }),
      warnings: [
        "Eric's machine-row checklist cannot be fully accurate until assigned_machine (or equivalent) is sourced reliably.",
        "Token matches in notes/description are not machine assignment without UI validation.",
        "HTML calendar fetch is discovery-only; not preferred for production until authenticated behavior is validated."
      ]
    };

    await fs.writeFile(ASSIGN_JSON, JSON.stringify(assignmentReport, null, 2), "utf8");
    assignmentReportWritten = true;
    const assignTxt = [
      "MORAWARE MACHINES — ASSIGNMENT / RESOURCE KEY DISCOVERY (read-only)",
      `generatedAt: ${assignmentReport.generatedAt}`,
      "",
      `Outcome ${assignmentReport.outcome} (${assignmentReport.outcome_label})`,
      assignmentReport.outcome_interpretation,
      "",
      `Unique structural key paths (cap 5000 listed in JSON): total_unique=${assignmentReport.activity_key_paths_total_unique}`,
      `Token match records in JSON: ${assignmentReport.token_matches.length} (see machines-assignment-key-discovery.json)`,
      "",
      "Calendar HTML probe:",
      assignmentReport.calendar_html_probe?.assessment ||
        assignmentReport.calendar_html_probe?.note ||
        JSON.stringify(assignmentReport.calendar_html_probe ?? {}),
      "",
      "Brain Saw/Polish (read-only):",
      JSON.stringify(assignmentReport.brain_saw_polish_deep ?? {}),
      "",
      `Wrote ${ASSIGN_JSON}`
    ].join("\n");
    await fs.writeFile(ASSIGN_TXT, assignTxt, "utf8");
    console.log(`[discoverMorawareMachinesCalendar] Wrote ${ASSIGN_JSON}`);
    console.log(`[discoverMorawareMachinesCalendar] Wrote ${ASSIGN_TXT}`);
  }

  if (!assignmentReportWritten) {
    const brainDeep = await brainSawPolishDeepAnalysis({
      rangeStart,
      rangeEnd,
      activityTypes,
      machineNames
    });
    const outcome = classifyAssignmentOutcome({
      structuredPathMatches: 0,
      includeProbeStructuredKeys: false,
      htmlFeasible: false,
      tokenMatchesInRaw: 0,
      tokenMatchesInNotesOnly: 0
    });
    const assignmentReport = {
      generatedAt: new Date().toISOString(),
      view_id: viewId,
      effdate,
      requested_date_range: { start: rangeStart, end: rangeEnd },
      search_tokens_used: searchTokens,
      job_activity_include_probes: {
        job_id: null,
        probes: [],
        note: "Skipped — Moraware credentials not configured."
      },
      job_query_nested_activity_probes: null,
      calendar_html_probe: { attempted: false, note: "Skipped — Moraware credentials not configured." },
      activity_key_paths_union: [],
      activity_key_paths_total_unique: 0,
      token_matches: [],
      outcome: outcome.outcome,
      outcome_label: outcome.label,
      outcome_interpretation: `Outcome ${outcome.outcome}: ${outcome.label}. ${outcome.recommended_next_step}`,
      recommended_next_step: outcome.recommended_next_step,
      metrics: {
        structured_assignment_path_token_match_count: 0,
        raw_json_area_token_match_count: 0,
        notes_description_token_match_count: 0
      },
      brain_saw_polish_deep: brainDeep,
      warnings: [
        "No live Moraware activity payloads in this run — assignment key paths empty.",
        "Eric's machine-row checklist cannot be fully accurate until assigned_machine (or equivalent) is sourced reliably."
      ]
    };
    await fs.writeFile(ASSIGN_JSON, JSON.stringify(assignmentReport, null, 2), "utf8");
    await fs.writeFile(
      ASSIGN_TXT,
      [
        "MORAWARE MACHINES — ASSIGNMENT / RESOURCE KEY DISCOVERY (read-only)",
        `generatedAt: ${assignmentReport.generatedAt}`,
        "",
        "Moraware credentials missing — API/HTML probes skipped. See JSON for Supabase-only analysis if configured.",
        "",
        `Outcome ${assignmentReport.outcome}`,
        assignmentReport.outcome_interpretation,
        "",
        `Wrote ${ASSIGN_JSON}`
      ].join("\n"),
      "utf8"
    );
    console.log(`[discoverMorawareMachinesCalendar] Wrote ${ASSIGN_JSON}`);
    console.log(`[discoverMorawareMachinesCalendar] Wrote ${ASSIGN_TXT}`);
  }

  /** ---- Supabase read-only ---- */
  report.brain_readonly_sample = await optionalSupabaseBrainSample({
    effdate,
    rangeStart,
    rangeEnd,
    activityTypes,
    machineNames,
    includeRawSnippets
  });

  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), "utf8");

  const txt = [
    "MORAWARE MACHINES CALENDAR — READ-ONLY DISCOVERY",
    `generatedAt: ${report.generatedAt}`,
    "",
    "DISCLAIMERS (required):",
    "- This is Moraware activity/status data, not machine telemetry.",
    "- Complete / crossed off means Moraware activity status is Complete (normalized status.name / status_name).",
    "- If machine assignment is unavailable in API payloads, eOS must discover another source or map assignments from the calendar view / shop rules.",
    "",
    `view_id=${viewId} effdate=${effdate} range=${rangeStart}…${rangeEnd}`,
    `activity_types=${activityTypes.join("; ")}`,
    `machines_requested=${machineNames.length} labels`,
    `view_definition_accessible=${report.view_definition_accessible}`,
    `activities_reconstructable_from_job_payload=${report.activities_reconstructable_from_job_payload}`,
    "",
    "Machine assignment key candidates (from activity raw key scan):",
    (report.machine_assignment_key_candidates || []).join(", ") || "(none in sample)",
    "",
    "Also see machines-assignment-key-discovery.{json,txt} for include probes, key paths, token matches, outcome A/B/C.",
    "",
    "Candidate checklist states:",
    ...report.candidate_checklist_states.map((c) => `  - ${c.id}: ${c.rule}`),
    "",
    "Brain read-only sample:",
    report.brain_readonly_sample?.note ||
      [
        `ran=${report.brain_readonly_sample?.ran}`,
        `ok=${report.brain_readonly_sample?.ok}`,
        `rows_in_range=${report.brain_readonly_sample?.rows_in_range ?? "n/a"}`,
        `rows_matching_activity_types=${report.brain_readonly_sample?.rows_matching_activity_types ?? "n/a"}`,
        `rows_with_machine_token=${report.brain_readonly_sample?.rows_with_machine_token_in_text_or_raw ?? "n/a"}`
      ].join(" "),
    "",
    `Wrote ${OUT_JSON}`
  ].join("\n");

  await fs.writeFile(OUT_TXT, txt, "utf8");
  console.log(`[discoverMorawareMachinesCalendar] Wrote ${OUT_JSON}`);
  console.log(`[discoverMorawareMachinesCalendar] Wrote ${OUT_TXT}`);
}

main().catch((e) => {
  console.error("[discoverMorawareMachinesCalendar]", e?.message || e);
  process.exit(1);
});
