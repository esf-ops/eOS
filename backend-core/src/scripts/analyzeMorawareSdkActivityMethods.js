#!/usr/bin/env node
/**
 * Offline analyzer: reads moraware-sdk-full-surface.json (reflection export only).
 * No Moraware HTTP calls, no Supabase.
 *
 * Input:  debug/moraware/latest/moraware-sdk-full-surface.json (override via env)
 * Output: debug/moraware/latest/moraware-sdk-activity-method-analysis.{json,txt}
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const DEFAULT_IN = path.join(REPO_ROOT, "debug", "moraware", "latest", "moraware-sdk-full-surface.json");
const OUT_JSON = path.join(REPO_ROOT, "debug", "moraware", "latest", "moraware-sdk-activity-method-analysis.json");
const OUT_TXT = path.join(REPO_ROOT, "debug", "moraware", "latest", "moraware-sdk-activity-method-analysis.txt");

/** Prefix-based: `GetJob` does not match \\bGet\\b in JS. */
const READ_PREFIX_RE = /^(Get|List|Find|Query|Search|Load|Fetch|Download)/i;
const MUT_PREFIX_RE = /^(Create|Update|Delete|Add|Remove|Convert|Import)/i;
const INTEREST_RE = /activity|assignee|calendar|pageview|schedule|resource/i;
const RETURN_FOCUS_RE = /jobactivity|jobactivitycontainer|assignee|assigneecontainer|pageview/i;
const PARAM_CONTEXT_RE = /jobid|jobactivityid|\bdate\b|\bfilter\b/i;

function readEnvPath(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  return path.isAbsolute(raw) ? raw : path.join(REPO_ROOT, raw);
}

function isMutatingName(name) {
  return MUT_PREFIX_RE.test(String(name ?? ""));
}

function isReadLikeName(name) {
  return READ_PREFIX_RE.test(String(name ?? ""));
}

function combinedMethodText(m) {
  return `${m.Name ?? ""} ${m.ReturnType ?? ""} ${m.ParameterSignature ?? ""}`;
}

function matchesInterest(m) {
  return INTEREST_RE.test(combinedMethodText(m));
}

function returnFocusMatch(m) {
  return RETURN_FOCUS_RE.test(String(m.ReturnType ?? ""));
}

function paramContextMatch(m) {
  return PARAM_CONTEXT_RE.test(String(m.ParameterSignature ?? ""));
}

function scoreReadCandidate(m) {
  let s = 0;
  const name = String(m.Name ?? "");
  const ret = String(m.ReturnType ?? "");
  const ps = String(m.ParameterSignature ?? "");
  const lower = combinedMethodText(m).toLowerCase();

  if (/jobactivity/i.test(ret) && !/^system\.void$/i.test(ret.trim())) s += 120;
  if (/\bGetJobActivities\b/i.test(name)) s += 110;
  if (/\bGetJobActivity\b/i.test(name)) s += 105;
  if (/\bGetJobActivitiesForSeries\b/i.test(name)) s += 100;
  if (/\bGetJobActivitySeries\b/i.test(name)) s += 95;
  if (/\bGetJob\b/i.test(name) && /jobid/i.test(ps)) s += 85;
  if (/assignee/i.test(lower)) s += 90;
  if (/jobactivityid/i.test(ps)) s += 75;
  if (/jobid/i.test(ps)) s += 55;
  if (/pageview|calendar|schedule/i.test(lower) && isReadLikeName(name)) s += 45;
  if (/resource/i.test(lower) && /activity/i.test(lower)) s += 35;
  if (paramContextMatch(m) && isReadLikeName(name)) s += 25;
  return s;
}

function whyMayHelp(m, signals) {
  const bits = [];
  if (signals.returns_job_activity) bits.push("Return type mentions JobActivity (or container).");
  if (signals.assignee_in_signature) bits.push("Name or parameters mention Assignee.");
  if (signals.job_activity_id_param) bits.push("Accepts jobActivityId (or similar) — may target a single activity.");
  if (signals.job_id_param) bits.push("Accepts jobId — may return job graph including activities.");
  if (signals.calendar_pageview_schedule) bits.push("Touches calendar/PageView/schedule surface.");
  if (signals.resource_activity) bits.push("Touches Resource in an activity-related API.");
  if (bits.length === 0) bits.push("Keyword overlap with activity/assignee/calendar discovery goals.");
  return bits.join(" ");
}

function riskFor(m) {
  if (isMutatingName(m.Name)) return "mutating_do_not_call";
  if (isReadLikeName(m.Name)) return "read_only_likely";
  return "unknown";
}

function buildSignals(m) {
  const text = combinedMethodText(m);
  return {
    returns_job_activity: /jobactivity/i.test(String(m.ReturnType ?? "")),
    assignee_in_signature: /assignee/i.test(text),
    job_activity_id_param: /jobactivityid/i.test(String(m.ParameterSignature ?? "")),
    job_id_param: /jobid/i.test(String(m.ParameterSignature ?? "").toLowerCase()),
    calendar_pageview_schedule: /calendar|pageview|schedule/i.test(text),
    resource_activity: /resource/i.test(text) && /activity/i.test(text)
  };
}

function analyzeConnectionMethods(connectionMethods) {
  const list = Array.isArray(connectionMethods) ? connectionMethods : [];
  const mutatingFlagged = [];
  const interestUnknown = [];

  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    if (!matchesInterest(m) && !returnFocusMatch(m)) continue;
    if (isMutatingName(m.Name)) {
      mutatingFlagged.push({
        method_name: m.Name,
        signature: `${m.Name}${m.ParameterSignature ?? ""}`,
        return_type: m.ReturnType,
        declaring_type: m.DeclaringType,
        risk: "mutating_do_not_call",
        note: "Name matches Create/Update/Delete/Add/Remove/Convert/Import — do not call for discovery."
      });
      continue;
    }
    if (!isReadLikeName(m.Name)) {
      interestUnknown.push({
        method_name: m.Name,
        signature: `${m.Name}${m.ParameterSignature ?? ""}`,
        return_type: m.ReturnType,
        declaring_type: m.DeclaringType,
        risk: "unknown",
        note: "Matches activity/assignee interest but does not start with Get/List/Find/Query/Search/Load/Fetch/Download — verify before any call."
      });
    }
  }

  const readCandidates = [];
  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    if (isMutatingName(m.Name)) continue;
    if (!isReadLikeName(m.Name)) continue;
    const text = combinedMethodText(m);
    const ps = String(m.ParameterSignature ?? "");
    const ret = String(m.ReturnType ?? "");
    const jobishParams = /jobid|jobactivityid/i.test(ps);
    const worthy =
      matchesInterest(m) ||
      returnFocusMatch(m) ||
      (jobishParams && /\.Job\b|JobActivity|Assignee|jobactivity/i.test(`${text} ${ret}`));

    if (!worthy) continue;

    const signals = buildSignals(m);
    const score = scoreReadCandidate(m);
    const risk = riskFor(m);
    readCandidates.push({
      method_name: m.Name,
      signature: `${m.Name}${m.ParameterSignature ?? ""}`,
      return_type: m.ReturnType,
      declaring_type: m.DeclaringType,
      risk,
      score,
      why_it_may_help: whyMayHelp(m, signals),
      signals,
      recommended_probe_priority: 0
    });
  }

  readCandidates.sort((a, b) => b.score - a.score);
  readCandidates.forEach((c, i) => {
    c.recommended_probe_priority = i + 1;
  });

  return { read_ranked: readCandidates, mutating_flagged: mutatingFlagged, interest_non_read: interestUnknown };
}

function augmentFromLikelyReadMethods(likelyRead, connectionNames) {
  const extras = [];
  const connSet = new Set(connectionNames);
  const list = Array.isArray(likelyRead) ? likelyRead : [];
  for (const m of list) {
    if (!m?.Name) continue;
    const dt = String(m.DeclaringType ?? "");
    if (!dt.includes("Connection")) continue;
    if (connSet.has(`${m.Name}${m.ParameterSignature}`)) continue;
    if (!isReadLikeName(m.Name) || isMutatingName(m.Name)) continue;
    if (!INTEREST_RE.test(`${m.Name} ${m.ReturnType} ${m.ParameterSignature}`) && !RETURN_FOCUS_RE.test(String(m.ReturnType ?? "")))
      continue;

    const sig = `${m.Name}${m.ParameterSignature ?? ""}`;
    const row = {
      method_name: m.Name,
      signature: sig,
      return_type: m.ReturnType,
      declaring_type: m.DeclaringType,
      risk: "read_only_likely",
      score: scoreReadCandidate({
        Name: m.Name,
        ReturnType: m.ReturnType,
        ParameterSignature: m.ParameterSignature
      }),
      why_it_may_help: "Listed under LikelyReadMethods on Connection; not deduped in ConnectionMethodsFull export.",
      signals: buildSignals({ Name: m.Name, ReturnType: m.ReturnType, ParameterSignature: m.ParameterSignature }),
      recommended_probe_priority: 0,
      source: "LikelyReadMethods"
    };
    extras.push(row);
  }
  extras.sort((a, b) => b.score - a.score);
  return extras;
}

async function main() {
  const inputPath = readEnvPath("MORAWARE_SDK_FULL_SURFACE_IN_JSON", DEFAULT_IN);
  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });

  let raw;
  try {
    raw = await fs.readFile(inputPath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  } catch (e) {
    const stub = {
      generatedAt: new Date().toISOString(),
      skipped: true,
      reason: `Could not read input: ${inputPath} (${String(e?.message || e)})`,
      input_path: inputPath,
      read_ranked: [],
      mutating_flagged: [],
      interest_non_read: [],
      notes: ["Run npm run eos:inspect:moraware-sdk-assignment or eos:inspect:moraware-sdk-full to generate moraware-sdk-full-surface.json"]
    };
    await fs.writeFile(OUT_JSON, JSON.stringify(stub, null, 2), "utf8");
    await fs.writeFile(
      OUT_TXT,
      ["Moraware SDK — activity method analysis (stub)", stub.reason, "", `Input: ${inputPath}`, `Wrote ${OUT_JSON}`].join("\n"),
      "utf8"
    );
    console.log(`[analyzeMorawareSdkActivityMethods] ${stub.reason}`);
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON: ${inputPath}: ${e?.message || e}`);
  }

  const conn = data.ConnectionMethodsFull ?? [];
  const analysis = analyzeConnectionMethods(conn);
  const connKeys = new Set(conn.map((m) => `${m.Name}${m.ParameterSignature}`));
  const fromLikely = augmentFromLikelyReadMethods(data.LikelyReadMethods, [...connKeys]);

  const merged = [...analysis.read_ranked];
  for (const x of fromLikely) {
    if (!merged.some((m) => m.signature === x.signature)) merged.push(x);
  }
  merged.sort((a, b) => b.score - a.score);
  merged.forEach((c, i) => {
    c.recommended_probe_priority = i + 1;
  });

  const report = {
    generatedAt: new Date().toISOString(),
    input_path: inputPath,
    surface_generated_at: data.GeneratedAt ?? null,
    assembly: {
      name: data.AssemblyName ?? null,
      version: data.AssemblyVersion ?? null,
      dll_path: data.DllPath ?? null
    },
    summary: {
      connection_methods_total: conn.length,
      read_candidates_ranked: merged.length,
      mutating_flagged_on_interest: analysis.mutating_flagged.length,
      interest_non_read_like: analysis.interest_non_read.length,
      note: "Reflection only. read_only_likely means the method name matches common read prefixes — Moraware may still perform side effects; confirm vendor docs before calling."
    },
    read_candidates_ranked: merged,
    mutating_connection_methods_matching_interest: analysis.mutating_flagged,
    interest_connection_methods_not_read_prefixed: analysis.interest_non_read,
    likely_read_connection_extras: fromLikely
  };

  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), "utf8");

  const txt = [
    "Moraware SDK — activity / assignee read-method analysis (offline)",
    `generatedAt: ${report.generatedAt}`,
    `surface: ${report.surface_generated_at ?? "unknown"}`,
    `input: ${inputPath}`,
    "",
    `Read candidates (ranked): ${merged.length}`,
    ...merged.slice(0, 60).map(
      (c) =>
        `${String(c.recommended_probe_priority).padStart(3, " ")}. [${c.risk}] score=${c.score} ${c.signature} -> ${c.return_type}\n     ${c.why_it_may_help}`
    ),
    merged.length > 60 ? `\n(... ${merged.length - 60} more in JSON)` : "",
    "",
    `Mutating + interest (do not call): ${analysis.mutating_flagged.length}`,
    ...analysis.mutating_flagged.slice(0, 25).map((m) => `  - ${m.signature}`),
    "",
    `Full JSON: ${OUT_JSON}`
  ].join("\n");

  await fs.writeFile(OUT_TXT, txt, "utf8");
  console.log(`[analyzeMorawareSdkActivityMethods] Wrote ${OUT_JSON}`);
}

main().catch((e) => {
  console.error("[analyzeMorawareSdkActivityMethods]", e?.message || e);
  process.exit(1);
});
