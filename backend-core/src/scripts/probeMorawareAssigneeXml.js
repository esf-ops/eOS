#!/usr/bin/env node
/**
 * Read-only XML/API probe: jobActivityQuery / jobQuery includes for SDK-aligned assignee
 * shapes (JobActivity.Assignees, Assignee.AssigneeName, …). No Moraware or Supabase writes.
 *
 * Outputs:
 *   debug/moraware/latest/machines-assignee-xml-probe.json
 *   debug/moraware/latest/machines-assignee-xml-probe.txt
 *
 * Env:
 *   MORAWARE_API_URL, MORAWARE_USERNAME, MORAWARE_PASSWORD, MORAWARE_ACCOUNT_ID (same as sync)
 *   MORAWARE_ASSIGNEE_XML_PROBE_JOB_ID (default 38837)
 *   MORAWARE_MACHINES_VIEW_ID (default 146) — metadata only
 *   MORAWARE_MACHINES_EFFDATE (default 2026-05-07) — metadata only
 *   MORAWARE_MACHINES_ASSIGNED_TO — CSV machine labels for token scan (safe paths only)
 *   MORAWARE_ASSIGNEE_XML_PROBE_CAPTURE_XML=1 — include sanitized outgoing command XML (no credentials)
 *   MORAWARE_ASSIGNEE_XML_PROBE_INCLUDE_RAW_RESPONSE=1 — include truncated raw response (debug only)
 *   MORAWARE_DISCOVERY_DELAY_MS (default 350)
 *   MORAWARE_DISCOVERY_QUIET_LOGS=1 — recommended (suppresses client verbose logs)
 *
 * @see docs/MORAWARE_MACHINES_CALENDAR_DISCOVERY.md
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MorawareClient, buildMorawareCommandXml } from "../../../src/morawareClient.js";

process.env.MORAWARE_DISCOVERY_QUIET_LOGS ??= "1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const OUT_DIR = path.join(REPO_ROOT, "debug", "moraware", "latest");
const OUT_JSON = path.join(OUT_DIR, "machines-assignee-xml-probe.json");
const OUT_TXT = path.join(OUT_DIR, "machines-assignee-xml-probe.txt");

/** Single-tag candidates (plus jobActivityQuery baseline). Order preserved; case variants kept where distinct. */
const JOB_ACTIVITY_ASSIGNEE_INCLUDE_CANDIDATES = [
  "assignees",
  "assignee",
  "Assignees",
  "Assignee",
  "jobActivityAssignees",
  "jobActivityAssignee",
  "activityAssignees",
  "activityAssignee",
  "assignedTo",
  "assigned",
  "resources",
  "resource",
  "calendarResource",
  "scheduleResource"
];

const MACHINE_TOKEN_EXTRA = ["robot", "saber", "titan", "titan 1", "titan 2", "saber 1", "saber 2"];

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

function envList(name, defaultCsv) {
  const raw = String(process.env[name] ?? "").trim();
  const s = raw || defaultCsv;
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function hasMorawareCreds() {
  return Boolean(
    String(process.env.MORAWARE_API_URL ?? "").trim() &&
      String(process.env.MORAWARE_USERNAME ?? "").trim() &&
      String(process.env.MORAWARE_PASSWORD ?? "").trim()
  );
}

function morawareErrorsFromResponse(data) {
  const mr = data?.MorawareResponse;
  if (!mr) return null;
  return mr.error ?? mr.errors ?? null;
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

function collectStructuralKeyPaths(value, prefix = "", seen = new Set(), depth = 0, maxDepth = 14, maxPaths = 4000) {
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

function unionPathsForActivities(rows) {
  const u = new Set();
  for (const row of rows.slice(0, 20)) {
    collectStructuralKeyPaths(row, "", u, 0, 14, 4000);
  }
  return [...u].sort();
}

function isUnsafeValuePath(path) {
  return /(^|\.)(notes|note|description|comment|contact|email|phone|address|customer)/i.test(String(path ?? ""));
}

function isAssigneeLikePath(path) {
  return /(^|\.)(assignees?|assignedTo|resources?|calendarResource|scheduleResource|activityAssignee|jobActivityAssignee)/i.test(
    String(path ?? "")
  );
}

function isAssigneeNameLikePath(path) {
  const p = String(path ?? "");
  if (!isAssigneeLikePath(p) || isUnsafeValuePath(p)) return false;
  return /\.(name|assigneeName|AssigneeName|displayName)( =:|$)/i.test(p) || /\.name$/i.test(p);
}

function buildSearchTokens(machineNames) {
  const out = new Set();
  for (const m of machineNames) {
    const s = String(m).trim().toLowerCase();
    if (s) out.add(s);
    const short = s.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (short && short !== s) out.add(short);
  }
  for (const t of MACHINE_TOKEN_EXTRA) out.add(t);
  return [...out].filter(Boolean);
}

/**
 * Count non-empty assignee-ish name/id leaves and machine-token hits on safe paths only (no note/description values).
 */
function analyzeActivityRowsForAssigneeSignals(rows, tokens) {
  let assignee_name_value_hits = 0;
  let assignee_id_value_hits = 0;
  const machine_token_matches = [];
  const seenMatch = new Set();

  const walk = (v, path, depth) => {
    if (depth > 14 || v == null) return;
    if (isUnsafeValuePath(path)) return;

    const typ = typeof v;
    if (typ === "string") {
      const s = v.trim();
      if (!s) return;
      const inAssignee = isAssigneeLikePath(path);
      const underAssigneeNode = /(assignee|assignees)(\.|\[)/i.test(path);
      if (inAssignee && underAssigneeNode && /\.(assigneeName|name)$/i.test(path)) {
        assignee_name_value_hits += 1;
      }
      if (inAssignee && underAssigneeNode && /\.assigneeId$/i.test(path) && /^\d+$/.test(s)) {
        assignee_id_value_hits += 1;
      }
      if (inAssignee && underAssigneeNode && s.length <= 160) {
        const low = s.toLowerCase();
        for (const token of tokens) {
          if (!token || low.length > 800) continue;
          if (low.includes(token)) {
            const k = `${path}\t${token}`;
            if (!seenMatch.has(k)) {
              seenMatch.add(k);
              machine_token_matches.push({
                path_prefix: path.split(/\[0\]/)[0].slice(0, 120),
                token,
                matched_value_length: s.length
              });
            }
          }
        }
      }
      return;
    }
    if (typ === "number" || typ === "boolean") return;
    if (Array.isArray(v)) {
      v.slice(0, 8).forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1));
      return;
    }
    if (typ === "object") {
      for (const key of Object.keys(v)) {
        if (key.startsWith("@_")) continue;
        const next = path ? `${path}.${key}` : key;
        walk(v[key], next, depth + 1);
      }
    }
  };

  for (const row of rows.slice(0, 15)) {
    walk(row, "jobActivity", 0);
  }

  return { assignee_name_value_hits, assignee_id_value_hits, machine_token_matches };
}

function sampleActivityIds(rows, max = 8) {
  const ids = [];
  for (const row of rows.slice(0, 25)) {
    const id = row?._attributes?.id ?? row?.id;
    if (id != null && String(id).trim()) {
      const s = String(id).trim();
      if (!ids.includes(s)) ids.push(s);
    }
    if (ids.length >= max) break;
  }
  return ids;
}

function buildJobActivityQueryInner(jobId, candidateTag) {
  const jid = String(jobId ?? "").trim();
  const tag = String(candidateTag ?? "").trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tag)) {
    throw new Error(`Invalid include tag: ${candidateTag}`);
  }
  return (
    `  <jobActivityQuery>\n` +
    `    <filter>\n` +
    `      <job id="${jid}" />\n` +
    `    </filter>\n` +
    `    <include>\n` +
    `      <activityType />\n` +
    `      <status />\n` +
    `      <startDate />\n` +
    `      <schedTime />\n` +
    `      <duration />\n` +
    `      <notes />\n` +
    `      <jobPhases />\n` +
    `      <${tag} />\n` +
    `    </include>\n` +
    `  </jobActivityQuery>`
  );
}

function buildJobQueryJobActivityInner(jobId, candidateTag) {
  const jid = String(jobId ?? "").trim();
  const tag = String(candidateTag ?? "").trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tag)) {
    throw new Error(`Invalid include tag: ${candidateTag}`);
  }
  return (
    `<jobQuery>\n` +
    `  <filter xmlns="">\n` +
    `    <job id="${jid}"/>\n` +
    `  </filter>\n` +
    `  <include xmlns="">\n` +
    `    <jobActivity>\n` +
    `      <activityType/>\n` +
    `      <status/>\n` +
    `      <startDate/>\n` +
    `      <schedTime/>\n` +
    `      <duration/>\n` +
    `      <notes/>\n` +
    `      <jobPhases/>\n` +
    `      <${tag}/>\n` +
    `    </jobActivity>\n` +
    `  </include>\n` +
    `</jobQuery>`
  );
}

function pickJobActivityQueryRows(data) {
  const jaq = data?.MorawareResponse?.jobActivityQuery;
  const ja = jaq?.jobActivity;
  return Array.isArray(ja) ? ja : ja ? [ja] : [];
}

function pickJobQueryActivityRows(data) {
  const job = data?.MorawareResponse?.jobQuery?.job;
  const jn = Array.isArray(job) ? job[0] : job;
  const ja = jn?.jobActivity;
  const rows = Array.isArray(ja?.jobActivity) ? ja.jobActivity : ja?.jobActivity ? [ja.jobActivity] : [];
  return rows;
}

function classifyRow(err, parseError, rows, shallowKeys) {
  if (parseError) return "parse_error";
  if (err) return "moraware_error";
  if (!rows.length) return "empty_activities_or_ignored_include";
  const tagHint = shallowKeys.some((k) => /assign|resource|crew|machine|calendar|schedule/i.test(k));
  if (tagHint) return "accepted_response_with_assign_like_keys";
  return "accepted_response_keys_check_payload";
}

async function runJobActivityProbe(client, jobId, includeName, tokens, captureXml, includeRaw) {
  const inner = buildJobActivityQueryInner(jobId, includeName);
  let sanitized_outgoing_xml = null;
  let raw_response_excerpt = null;

  try {
    await client.ensureSession();
    if (captureXml) {
      sanitized_outgoing_xml = buildMorawareCommandXml({ sessionId: "(redacted-session)", innerXml: inner });
    }
    const { rawXml, data } = await client.morawareCommand(inner);
    await delayBetweenCalls();

    const err = morawareErrorsFromResponse(data);
    const rows = pickJobActivityQueryRows(data);
    const shallowKeys = rows[0] && typeof rows[0] === "object" ? collectShallowKeys(rows[0], 200) : [];
    const allPaths = unionPathsForActivities(rows);
    const assignee_like_key_paths = allPaths.filter((p) => isAssigneeLikePath(p) && !p.includes(" =:")).slice(0, 400);
    const assignee_name_like_paths = allPaths.filter((p) => isAssigneeNameLikePath(p)).slice(0, 200);
    const signals = analyzeActivityRowsForAssigneeSignals(rows, tokens);
    const accepted_or_error = classifyRow(err, data?.parseError, rows, shallowKeys);

    if (includeRaw && rawXml) {
      raw_response_excerpt = String(rawXml).replace(/\b(sessionId|password|userName)=["'][^"']*["']/gi, '$1="(redacted)"').slice(0, 1800);
    }

    return {
      probe: "jobActivityQuery",
      include_name: includeName,
      accepted_or_error,
      moraware_error_present: Boolean(err),
      activity_count: rows.length,
      assignee_like_key_paths,
      assignee_name_like_paths,
      assignee_name_value_hits: signals.assignee_name_value_hits,
      assignee_id_value_hits: signals.assignee_id_value_hits,
      machine_token_matches: signals.machine_token_matches.slice(0, 80),
      sample_activity_ids: sampleActivityIds(rows),
      sample_job_ids: [String(jobId)],
      activity_top_keys_sample: shallowKeys.slice(0, 60),
      sanitized_outgoing_xml,
      raw_response_excerpt
    };
  } catch (e) {
    return {
      probe: "jobActivityQuery",
      include_name: includeName,
      accepted_or_error: "transport_or_client_error",
      error: String(e?.message || e),
      activity_count: 0,
      assignee_like_key_paths: [],
      assignee_name_like_paths: [],
      assignee_name_value_hits: 0,
      assignee_id_value_hits: 0,
      machine_token_matches: [],
      sample_activity_ids: [],
      sample_job_ids: [String(jobId)],
      sanitized_outgoing_xml: captureXml ? buildMorawareCommandXml({ sessionId: "(redacted-session)", innerXml: inner }) : null,
      raw_response_excerpt: null
    };
  }
}

async function runJobQueryProbe(client, jobId, includeName, tokens, captureXml, includeRaw) {
  const inner = buildJobQueryJobActivityInner(jobId, includeName);
  try {
    await client.ensureSession();
    const sanitized = captureXml ? buildMorawareCommandXml({ sessionId: "(redacted-session)", innerXml: inner }) : null;
    const { rawXml, data } = await client.morawareCommand(inner);
    await delayBetweenCalls();

    const err = morawareErrorsFromResponse(data);
    const rows = pickJobQueryActivityRows(data);
    const shallowKeys = rows[0] && typeof rows[0] === "object" ? collectShallowKeys(rows[0], 200) : [];
    const allPaths = unionPathsForActivities(rows);
    const assignee_like_key_paths = allPaths.filter((p) => isAssigneeLikePath(p) && !p.includes(" =:")).slice(0, 400);
    const assignee_name_like_paths = allPaths.filter((p) => isAssigneeNameLikePath(p)).slice(0, 200);
    const signals = analyzeActivityRowsForAssigneeSignals(rows, tokens);
    const accepted_or_error = classifyRow(err, data?.parseError, rows, shallowKeys);

    let raw_response_excerpt = null;
    if (includeRaw && rawXml) {
      raw_response_excerpt = String(rawXml).replace(/\b(sessionId|password|userName)=["'][^"']*["']/gi, '$1="(redacted)"').slice(0, 1800);
    }

    return {
      probe: "jobQuery_nested_jobActivity",
      include_name: includeName,
      accepted_or_error,
      moraware_error_present: Boolean(err),
      activity_count: rows.length,
      assignee_like_key_paths,
      assignee_name_like_paths,
      assignee_name_value_hits: signals.assignee_name_value_hits,
      assignee_id_value_hits: signals.assignee_id_value_hits,
      machine_token_matches: signals.machine_token_matches.slice(0, 80),
      sample_activity_ids: sampleActivityIds(rows),
      sample_job_ids: [String(jobId)],
      activity_top_keys_sample: shallowKeys.slice(0, 60),
      sanitized_outgoing_xml: sanitized,
      raw_response_excerpt
    };
  } catch (e) {
    return {
      probe: "jobQuery_nested_jobActivity",
      include_name: includeName,
      accepted_or_error: "transport_or_client_error",
      error: String(e?.message || e),
      activity_count: 0,
      assignee_like_key_paths: [],
      assignee_name_like_paths: [],
      assignee_name_value_hits: 0,
      assignee_id_value_hits: 0,
      machine_token_matches: [],
      sample_activity_ids: [],
      sample_job_ids: [String(jobId)],
      sanitized_outgoing_xml: captureXml ? buildMorawareCommandXml({ sessionId: "(redacted-session)", innerXml: inner }) : null,
      raw_response_excerpt: null
    };
  }
}

/** Preserve distinct casings (Moraware may treat include tags as case-sensitive). */
function uniqueExactTags(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags) {
    const k = String(t).trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function classifyOverallOutcome(jaProbes, jqProbes) {
  const all = [...jaProbes, ...jqProbes];
  const hasNames = all.some((p) => (p.assignee_name_value_hits ?? 0) > 0);
  const hasIds = all.some((p) => (p.assignee_id_value_hits ?? 0) > 0);
  const hasTokenOnAssigneePath = all.some((p) => (p.machine_token_matches?.length ?? 0) > 0);

  if (hasNames || hasIds || hasTokenOnAssigneePath) {
    return {
      outcome: "A",
      outcome_label: "Outcome A: XML activity assignees found",
      detail:
        "At least one include produced assignee-like name/id fields on activities. Validate tenant stability, then map to Brain (e.g. assignee_names, assigned_machine).",
      winning_probes: all
        .filter((p) => (p.assignee_name_value_hits ?? 0) > 0 || (p.assignee_id_value_hits ?? 0) > 0 || (p.machine_token_matches?.length ?? 0) > 0)
        .map((p) => ({ probe: p.probe, include_name: p.include_name, accepted_or_error: p.accepted_or_error }))
    };
  }

  return {
    outcome: "C2",
    outcome_label: "Outcome C2: SDK surface exposes JobActivity.Assignees, but XML include not found",
    detail:
      "No jobActivityQuery/jobQuery include in this run exposed assignee name/id fields. Live SDK probe may require Windows/.NET Framework (System.Windows.Forms). Ask Moraware for the XML include that mirrors JobActivity.Assignees.",
    winning_probes: []
  };
}

async function writeStub(reason) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const body = {
    generatedAt: new Date().toISOString(),
    source: "probeMorawareAssigneeXml",
    skipped: true,
    reason,
    sdk_context: {
      job_activity_assignees: "JobActivity.Assignees",
      assignee_fields: ["AssigneeId", "AssigneeName", "Description", "DisplayColor", "IsInactive", "SeqNum"]
    },
    assignment_outcome: {
      outcome: "C2",
      outcome_label: "Outcome C2: SDK surface exposes JobActivity.Assignees, but XML include not found (probe not run)",
      detail: reason
    },
    job_activity_query_probes: [],
    job_query_nested_probes: []
  };
  await fs.writeFile(OUT_JSON, JSON.stringify(body, null, 2), "utf8");
  const txt = [
    "MORAWARE — ASSIGNEE XML PROBE (stub / skipped)",
    `generatedAt: ${body.generatedAt}`,
    "",
    reason,
    "",
    `Wrote ${OUT_JSON}`
  ].join("\n");
  await fs.writeFile(OUT_TXT, txt, "utf8");
  console.log(`[probeMorawareAssigneeXml] ${reason}`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const viewId = String(process.env.MORAWARE_MACHINES_VIEW_ID ?? "146").trim() || "146";
  const effdate = String(process.env.MORAWARE_MACHINES_EFFDATE ?? "2026-05-07").trim() || "2026-05-07";
  const jobId = String(process.env.MORAWARE_ASSIGNEE_XML_PROBE_JOB_ID ?? "38837").trim() || "38837";
  const machineNames = envList(
    "MORAWARE_MACHINES_ASSIGNED_TO",
    "Robot 1,Saber 1,Saber 2,Titan 1 (2k),Titan 2 (3k),Titan 3 (3k),Titan 4 (2k),Titan 7 (3k),Titan 8 (3k)"
  );
  const tokens = buildSearchTokens(machineNames);
  const captureXml = String(process.env.MORAWARE_ASSIGNEE_XML_PROBE_CAPTURE_XML ?? "").trim() === "1";
  const includeRaw = String(process.env.MORAWARE_ASSIGNEE_XML_PROBE_INCLUDE_RAW_RESPONSE ?? "").trim() === "1";

  if (!hasMorawareCreds()) {
    await writeStub("Missing MORAWARE_API_URL / MORAWARE_USERNAME / MORAWARE_PASSWORD — probe skipped.");
    return;
  }

  const client = new MorawareClient();
  const includeTags = uniqueExactTags(JOB_ACTIVITY_ASSIGNEE_INCLUDE_CANDIDATES);

  const job_activity_query_probes = [];
  for (const tag of includeTags) {
    const row = await runJobActivityProbe(client, jobId, tag, tokens, captureXml, includeRaw);
    job_activity_query_probes.push(row);
  }

  const job_query_nested_probes = [];
  for (const tag of includeTags) {
    const row = await runJobQueryProbe(client, jobId, tag, tokens, captureXml, includeRaw);
    job_query_nested_probes.push(row);
  }

  const assignment_outcome = classifyOverallOutcome(job_activity_query_probes, job_query_nested_probes);

  const report = {
    generatedAt: new Date().toISOString(),
    source: "probeMorawareAssigneeXml",
    context: {
      job_id: jobId,
      machines_view_id: viewId,
      effdate,
      activity_types_focus: ["Saw", "Polish"],
      machine_row_tokens_used: tokens.slice(0, 40),
      note: "Probe does not filter activities by type server-side; analysis scans returned activities only. No customer note text is copied into this report."
    },
    sdk_context: {
      hypothesis: "Machines calendar row may map to JobActivity.Assignees → Assignee.AssigneeName (.NET SDK)",
      job_activity_assignees: "JobActivity.Assignees",
      assignee_fields: ["AssigneeId", "AssigneeName", "Description", "DisplayColor", "IsInactive", "SeqNum"]
    },
    assignment_outcome,
    job_activity_query_probes,
    job_query_nested_probes,
    options: {
      MORAWARE_ASSIGNEE_XML_PROBE_CAPTURE_XML: captureXml,
      MORAWARE_ASSIGNEE_XML_PROBE_INCLUDE_RAW_RESPONSE: includeRaw
    }
  };

  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), "utf8");

  const txt = [
    "MORAWARE — ASSIGNEE XML PROBE (read-only)",
    `generatedAt: ${report.generatedAt}`,
    `job_id=${jobId} view_id=${viewId} effdate=${effdate}`,
    "",
    `${assignment_outcome.outcome_label}`,
    assignment_outcome.detail,
    "",
    "jobActivityQuery (baseline + one include):",
    ...job_activity_query_probes.map(
      (p) =>
        `  ${p.include_name}: ${p.accepted_or_error} activities=${p.activity_count} name_hits=${p.assignee_name_value_hits ?? 0} id_hits=${p.assignee_id_value_hits ?? 0} assignee_paths=${p.assignee_like_key_paths?.length ?? 0} token_matches=${p.machine_token_matches?.length ?? 0}`
    ),
    "",
    "jobQuery nested jobActivity:",
    ...job_query_nested_probes.map(
      (p) =>
        `  ${p.include_name}: ${p.accepted_or_error} activities=${p.activity_count} name_hits=${p.assignee_name_value_hits ?? 0} id_hits=${p.assignee_id_value_hits ?? 0} assignee_paths=${p.assignee_like_key_paths?.length ?? 0} token_matches=${p.machine_token_matches?.length ?? 0}`
    ),
    "",
    `Full JSON: ${OUT_JSON}`
  ].join("\n");

  await fs.writeFile(OUT_TXT, txt, "utf8");
  console.log(`[probeMorawareAssigneeXml] Wrote ${OUT_JSON}`);
}

main().catch((e) => {
  console.error("[probeMorawareAssigneeXml]", e?.message || e);
  process.exit(1);
});
