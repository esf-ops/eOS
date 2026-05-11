#!/usr/bin/env node
/**
 * Read-only Moraware WSDL / HTTP API endpoint discovery.
 * - GET and OPTIONS only; no POST/PUT/PATCH/DELETE.
 * - No Moraware mutations; no Supabase writes; never logs API keys or passwords.
 *
 * Outputs:
 *   debug/moraware/latest/moraware-wsdl-discovery.json
 *   debug/moraware/latest/moraware-wsdl-discovery.txt
 *
 * Env:
 *   MORAWARE_API_URL (required for real run)
 *   MORAWARE_WEB_BASE_URL (optional second origin for path candidates)
 *   MORAWARE_API_KEY (optional; enables header variants)
 *   MORAWARE_WSDL_EXTRA_URLS (optional CSV of full URLs or /paths for extra candidates)
 *   MORAWARE_DISCOVERY_ALLOW_INSECURE_TLS (default 0; set 1 for dev/staging only)
 *   MORAWARE_WSDL_DISCOVERY_INCLUDE_BODY_SNIPPETS (default 0)
 *   MORAWARE_WSDL_DISCOVERY_TIMEOUT_MS (default 10000)
 *   MORAWARE_WSDL_MAX_BODY_BYTES (default 2097152)
 *
 * @see docs/MORAWARE_MACHINES_CALENDAR_DISCOVERY.md
 */

import "dotenv/config";

import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const OUT_DIR = path.join(REPO_ROOT, "debug", "moraware", "latest");
const OUT_JSON = path.join(OUT_DIR, "moraware-wsdl-discovery.json");
const OUT_TXT = path.join(OUT_DIR, "moraware-wsdl-discovery.txt");

const SEARCH_TERMS = [
  "JobActivity",
  "JobActivities",
  "GetJobActivity",
  "GetJobActivities",
  "JobActivityQuery",
  "jobActivityQuery",
  "Assignee",
  "Assignees",
  "AssigneeName",
  "assignedTo",
  "assigned",
  "resource",
  "Resource",
  "calendar",
  "Calendar",
  "PageView",
  "schedule",
  "Schedule",
  "machine",
  "Machine",
  "activity",
  "Activity"
];

function toInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

function safeUrlForReport(urlString) {
  try {
    const u = new URL(urlString);
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return "(invalid_url)";
  }
}

function inputSummaryHostPath(urlString) {
  try {
    const u = new URL(urlString);
    return { host: u.host, pathname: u.pathname || "/" };
  } catch {
    return { host: null, pathname: null };
  }
}

function buildHeaderSet(variantId, apiKey) {
  if (variantId === "none" || !apiKey) return {};
  switch (variantId) {
    case "api-key":
      return { "api-key": apiKey };
    case "x-api-key":
      return { "x-api-key": apiKey };
    case "X-API-Key":
      return { "X-API-Key": apiKey };
    case "authorization_bearer":
      return { Authorization: `Bearer ${apiKey}` };
    default:
      return {};
  }
}

function looksLikeWsdl(text, contentType = "") {
  const t = text.slice(0, 8000);
  const ct = contentType.toLowerCase();
  if (ct.includes("xml")) return /\bdefinitions\b/i.test(t) && /\b(wsdl|targetnamespace)\b/i.test(t);
  return (
    /<\s*definitions[^>]*xmlns\s*=\s*["'][^"']*wsdl/i.test(t) ||
    (/\bdefinitions\b/i.test(t) && /\b(wsdl|targetNamespace)\b/i.test(t))
  );
}

function looksLikeXml(text, contentType = "") {
  const ct = contentType.toLowerCase();
  if (ct.includes("xml")) return true;
  const s = text.trimStart().slice(0, 200);
  return s.startsWith("<?xml") || (s.startsWith("<") && /<[^>]+>/.test(s));
}

function looksLikeJson(text, contentType = "") {
  const ct = contentType.toLowerCase();
  if (ct.includes("json")) return true;
  const s = text.trimStart().slice(0, 1);
  return s === "{" || s === "[";
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function messageRequiresApiKey(text) {
  const lower = text.toLowerCase();
  if (/api-key\s+header\s+is\s+required/i.test(text)) return true;
  if (/["']message["']\s*:\s*["'][^"']*api-key[^"']*required/i.test(text)) return true;
  if (lower.includes("api-key") && lower.includes("required")) return true;
  if (lower.includes("api key") && lower.includes("required")) return true;
  return false;
}

function countTermHits(text) {
  const lower = text.toLowerCase();
  const lowerTerms = SEARCH_TERMS.map((t) => ({ term: t, needle: t.toLowerCase() }));
  /** @type {Array<{ term: string; hit_count: number }>} */
  const hits = [];
  for (const { term, needle } of lowerTerms) {
    let c = 0;
    let i = 0;
    while ((i = lower.indexOf(needle, i)) !== -1) {
      c++;
      i += needle.length;
    }
    if (c > 0) hits.push({ term, hit_count: c });
  }
  return hits;
}

const REDACT_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._\-]+\b/gi,
  /\b(api[_-]?key|apikey|token|password|secret)\s*[:=]\s*["']?[^"'\s&]{8,}/gi,
  /\b[0-9a-f]{32,}\b/gi
];

function redactSnippet(s) {
  let out = s;
  for (const re of REDACT_PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  if (out.length > 520) out = `${out.slice(0, 520)}…`;
  return out;
}

function extractSnippetsAroundTerms(text, include) {
  if (!include) return [];
  const lower = text.toLowerCase();
  /** @type {Array<{ term: string; snippet: string }>} */
  const out = [];
  const seen = new Set();
  for (const term of SEARCH_TERMS) {
    const needle = term.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx === -1) continue;
    const key = `${term}:${idx}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const start = Math.max(0, idx - 200);
    const end = Math.min(text.length, idx + term.length + 300);
    const snippet = redactSnippet(text.slice(start, end));
    out.push({ term, snippet });
    if (out.length >= 24) break;
  }
  return out;
}

function classifyAttempt({ status, bodyText, contentType, method }) {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 405) return "method_not_allowed";

  const msg = bodyText ?? "";
  if (messageRequiresApiKey(msg)) return "requires_api_key_header";

  if (looksLikeWsdl(msg, contentType)) return "wsdl_found";
  if (looksLikeXml(msg, contentType)) return "xml_found";
  if (looksLikeJson(msg, contentType) || parseJsonSafe(msg)) return "json_schema_or_rest_response";

  if (status >= 400 && status < 500) return "unknown_response";
  if (status >= 500) return "transport_error";
  if (status > 0) return "unknown_response";
  return "unknown_response";
}

function attemptHasJobActivityTerms(termHits) {
  const jobTerms = new Set([
    "JobActivity",
    "JobActivities",
    "GetJobActivity",
    "GetJobActivities",
    "JobActivityQuery",
    "jobActivityQuery"
  ]);
  return (termHits || []).some((h) => jobTerms.has(h.term));
}

function attemptHasAssigneeTerms(termHits) {
  const s = new Set(["Assignee", "Assignees", "AssigneeName"]);
  return (termHits || []).some((h) => s.has(h.term));
}

function attemptHasCalendarOrPageviewTerms(termHits) {
  const s = new Set(["calendar", "Calendar", "PageView", "schedule", "Schedule"]);
  return (termHits || []).some((h) => s.has(h.term));
}

function errorSafe(err) {
  if (!err || typeof err !== "object") return { message: String(err) };
  const o = {
    name: err.name,
    message: err.message
  };
  if (err.cause && typeof err.cause === "object") {
    if (err.cause.code != null) o.cause_code = String(err.cause.code);
    if (err.cause.hostname != null) o.cause_hostname = String(err.cause.hostname);
  }
  return o;
}

function collectCorsHeaderFlags(allowHeadersRaw) {
  if (!allowHeadersRaw) return { api_key_mentioned: false, x_api_key_mentioned: false, authorization_mentioned: false };
  const h = allowHeadersRaw.toLowerCase();
  return {
    api_key_mentioned: /\bapi-key\b/.test(h),
    x_api_key_mentioned: h.includes("x-api-key"),
    authorization_mentioned: h.includes("authorization")
  };
}

function httpRequest(urlString, { method, headers, timeoutMs, rejectUnauthorized }) {
  return new Promise((resolve, reject) => {
    let done = false;
    const u = new URL(urlString);
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const pathname = u.pathname || "/";
    /** @type {http.RequestOptions} */
    const opts = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: `${pathname}${u.search}`,
      method,
      headers: { ...headers, Accept: "*/*", "User-Agent": "eOS-moraware-wsdl-discovery/1" }
    };
    if (isHttps) {
      opts.rejectUnauthorized = rejectUnauthorized !== false;
    }

    const req = lib.request(opts, (res) => {
      const maxBytes = toInt(process.env.MORAWARE_WSDL_MAX_BODY_BYTES, 2 * 1024 * 1024);
      let total = 0;
      const chunks = [];
      res.on("data", (chunk) => {
        total += chunk.length;
        if (total <= maxBytes) chunks.push(chunk);
      });
      res.on("end", () => {
        if (done) return;
        done = true;
        const body = Buffer.concat(chunks).toString("utf8");
        const truncated = total > maxBytes;
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body,
          truncated
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });

    req.on("error", (err) => {
      if (done) return;
      done = true;
      reject(err);
    });

    req.end();
  });
}

async function fetchOne(urlString, method, headerVariant, apiKey, timeoutMs, insecureTls) {
  const rejectUnauthorized = !insecureTls;
  const headers = buildHeaderSet(headerVariant, apiKey || "");
  /** @type {Record<string, unknown>} */
  const attempt = {
    candidate_url_safe: safeUrlForReport(urlString),
    method,
    header_variant: headerVariant === "authorization_bearer" ? "authorization_bearer" : headerVariant,
    status: null,
    content_type: null,
    classification: "unknown_response",
    looks_like_wsdl: false,
    looks_like_json: false,
    term_hits: [],
    allow_header: null,
    access_control_allow_methods: null,
    access_control_allow_headers: null,
    cors_header_flags: null,
    options_api_key_hint_in_headers: false,
    error_safe: null,
    snippets: [],
    snippet_refs: [],
    body_truncated: false
  };

  try {
    const res = await httpRequest(urlString, {
      method,
      headers,
      timeoutMs,
      rejectUnauthorized
    });

    attempt.status = res.status;
    const ct = res.headers["content-type"];
    attempt.content_type = Array.isArray(ct) ? ct[0] : (ct ?? null);
    attempt.body_truncated = Boolean(res.truncated);

    const body = res.body ?? "";
    attempt.looks_like_wsdl = looksLikeWsdl(body, attempt.content_type || "");
    attempt.looks_like_json = looksLikeJson(body, attempt.content_type || "");

    if (method === "OPTIONS") {
      const allow = res.headers.allow;
      attempt.allow_header = Array.isArray(allow) ? allow.join(", ") : (allow ?? null);
      const acm = res.headers["access-control-allow-methods"];
      attempt.access_control_allow_methods = Array.isArray(acm) ? acm.join(", ") : (acm ?? null);
      const ach = res.headers["access-control-allow-headers"];
      const achStr = Array.isArray(ach) ? ach.join(", ") : (ach ?? null);
      attempt.access_control_allow_headers = achStr;
      attempt.cors_header_flags = collectCorsHeaderFlags(achStr || "");
      const merged = `${achStr || ""} ${attempt.allow_header || ""}`.toLowerCase();
      attempt.options_api_key_hint_in_headers =
        merged.includes("api-key") || merged.includes("x-api-key") || merged.includes("authorization");
    }

    const allHits = countTermHits(body);
    attempt.term_hits = allHits;

    const includeSnippets = String(process.env.MORAWARE_WSDL_DISCOVERY_INCLUDE_BODY_SNIPPETS ?? "").trim() === "1";
    if (includeSnippets && allHits.length) {
      attempt.snippets = extractSnippetsAroundTerms(body, true);
    } else if (allHits.length) {
      attempt.snippet_refs = allHits.map((h) => ({
        term: h.term,
        hit_count: h.hit_count
      }));
    }

    attempt.classification = classifyAttempt({
      status: attempt.status,
      bodyText: body,
      contentType: attempt.content_type || "",
      method
    });

    if (method === "OPTIONS" && attempt.status < 400 && !body?.trim()) {
      attempt.classification = "unknown_response";
    }
  } catch (err) {
    const e = /** @type {Error & { code?: string }} */ (err);
    if (e.message === "timeout" || e.name === "AbortError") {
      attempt.classification = "timeout";
      attempt.error_safe = { name: e.name, message: "Request timed out" };
    } else if (
      e.code === "CERT_HAS_EXPIRED" ||
      e.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
      e.code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
      e.code === "SELF_SIGNED_CERT_IN_CHAIN" ||
      e.code === "ERR_TLS" ||
      (e.message && /certificate|ssl|tls/i.test(e.message))
    ) {
      attempt.classification = "tls_error";
      attempt.error_safe = errorSafe(e);
    } else {
      attempt.classification = "transport_error";
      attempt.error_safe = errorSafe(e);
    }
  }

  return attempt;
}

/**
 * @param {string} apiUrl
 * @param {string | undefined} webBase
 */
function buildCandidates(apiUrl, webBase) {
  /** @type {Array<{ url: string; kind: string }>} */
  const list = [];

  let primaryOrigin;
  try {
    const u = new URL(apiUrl);
    primaryOrigin = u.origin;
  } catch {
    return list;
  }

  /** @type {string[]} */
  const originList = [primaryOrigin];
  if (webBase) {
    try {
      const o2 = new URL(webBase).origin;
      if (o2 && !originList.includes(o2)) originList.push(o2);
    } catch {
      /* ignore */
    }
  }

  // 1: api URL + ?WSDL or &WSDL
  try {
    const u = new URL(apiUrl);
    u.searchParams.set("WSDL", "");
    list.push({ url: u.toString(), kind: "api_url_with_WSDL_query" });
  } catch { /* ignore */ }

  // 2 & 3: replace api.aspx
  try {
    const u = new URL(apiUrl);
    if (u.pathname.toLowerCase().includes("api.aspx")) {
      const u2 = new URL(apiUrl);
      u2.pathname = u.pathname.replace(/api\.aspx$/i, "JobTrackerAPI.asmx");
      u2.search = "?WSDL";
      list.push({ url: u2.toString(), kind: "derived_JobTrackerAPI_as_mx_WSDL" });

      const u3 = new URL(apiUrl);
      u3.pathname = u.pathname.replace(/api\.aspx$/i, "JobTrackerAPI5.asmx");
      u3.search = "?WSDL";
      list.push({ url: u3.toString(), kind: "derived_JobTrackerAPI5_as_mx_WSDL" });
    }
  } catch { /* ignore */ }

  const pathSuffixes = [
    ["/api/JobTrackerAPI.asmx?WSDL", "path_api_JobTrackerAPI_WSDL"],
    ["/api/JobTrackerAPI5.asmx?WSDL", "path_api_JobTrackerAPI5_WSDL"],
    ["/JobTrackerAPI.asmx?WSDL", "path_JobTrackerAPI_WSDL"],
    ["/JobTrackerAPI5.asmx?WSDL", "path_JobTrackerAPI5_WSDL"],
    ["/api/v1", "path_api_v1"],
    ["/api/v1/", "path_api_v1_slash"],
    ["/api/v1/jobs", "path_api_v1_jobs"],
    ["/api/v1/job-activities", "path_api_v1_job_activities"],
    ["/api/job-activities", "path_api_job_activities"],
    ["/api/activities", "path_api_activities"],
    ["/api/calendar", "path_api_calendar"],
    ["/api/page-views", "path_api_page_views"],
    ["/api/assignees", "path_api_assignees"]
  ];

  for (const origin of originList) {
    const isWebOrigin = origin !== primaryOrigin;
    for (const [suffix, kind] of pathSuffixes) {
      list.push({
        url: `${origin}${suffix}`,
        kind: isWebOrigin ? `${kind}_web_base` : kind
      });
    }
  }

  const extra = String(process.env.MORAWARE_WSDL_EXTRA_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const raw of extra) {
    let full = raw;
    if (raw.startsWith("/")) {
      full = `${primaryOrigin}${raw}`;
    }
    try {
      new URL(full);
      list.push({ url: full, kind: "user_supplied_candidate" });
    } catch { /* skip */ }
  }

  const seen = new Set();
  /** @type {typeof list} */
  const uniq = [];
  for (const c of list) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    uniq.push(c);
  }
  return uniq;
}

function computeBestFindings(attempts) {
  const wsdl_candidates = [];
  const api_key_required_candidates = [];
  const assignee_term_candidates = [];
  const job_activity_term_candidates = [];
  const calendar_or_pageview_candidates = [];
  const rest_like_candidates = [];

  const assigneeTerms = new Set(["Assignee", "Assignees", "AssigneeName"]);
  const jobTerms = new Set([
    "JobActivity",
    "JobActivities",
    "GetJobActivity",
    "GetJobActivities",
    "JobActivityQuery",
    "jobActivityQuery"
  ]);
  const calTerms = new Set(["calendar", "Calendar", "PageView", "schedule", "Schedule"]);

  for (const a of attempts) {
    const url = a.candidate_url_safe;
    const entry = { candidate_url_safe: url, method: a.method, header_variant: a.header_variant, classification: a.classification };

    if (a.classification === "wsdl_found" || a.looks_like_wsdl) {
      wsdl_candidates.push({ ...entry, status: a.status });
    }
    if (a.classification === "requires_api_key_header") {
      api_key_required_candidates.push({ ...entry, status: a.status });
    }
    if (a.classification === "json_schema_or_rest_response" && a.status && a.status < 500) {
      rest_like_candidates.push({ ...entry, status: a.status });
    }

    for (const h of a.term_hits || []) {
      if (assigneeTerms.has(h.term)) {
        assignee_term_candidates.push({ ...entry, term: h.term, hit_count: h.hit_count });
      }
      if (jobTerms.has(h.term)) {
        job_activity_term_candidates.push({ ...entry, term: h.term, hit_count: h.hit_count });
      }
      if (calTerms.has(h.term)) {
        calendar_or_pageview_candidates.push({ ...entry, term: h.term, hit_count: h.hit_count });
      }
    }
  }

  return {
    wsdl_candidates,
    api_key_required_candidates,
    assignee_term_candidates,
    job_activity_term_candidates,
    calendar_or_pageview_candidates,
    rest_like_candidates
  };
}

function recommendedNextStep({ hasApiKey, attempts }) {
  const wsdlWithActivityAndAssignee = attempts.some(
    (a) =>
      (a.classification === "wsdl_found" || a.looks_like_wsdl) &&
      attemptHasJobActivityTerms(a.term_hits) &&
      attemptHasAssigneeTerms(a.term_hits)
  );

  if (wsdlWithActivityAndAssignee) {
    return "Use WSDL schema to build the correct read-only SOAP request for JobActivity.Assignees.";
  }

  const anyRequiresKey = attempts.some((a) => a.classification === "requires_api_key_header");
  const keyedWorked = attempts.some(
    (a) =>
      a.header_variant !== "none" &&
      (a.status === 200 || a.status === 204) &&
      (a.classification === "xml_found" || a.classification === "json_schema_or_rest_response" || a.classification === "wsdl_found")
  );

  if (anyRequiresKey && !hasApiKey) {
    return "Obtain Moraware API key and rerun with MORAWARE_API_KEY.";
  }
  if (anyRequiresKey && hasApiKey && !keyedWorked) {
    return "Ask Moraware which header name/auth scheme is required for this endpoint.";
  }

  const restWithRelevantTerms = attempts.some(
    (a) =>
      a.classification === "json_schema_or_rest_response" &&
      a.status != null &&
      a.status < 500 &&
      (attemptHasAssigneeTerms(a.term_hits) ||
        attemptHasJobActivityTerms(a.term_hits) ||
        attemptHasCalendarOrPageviewTerms(a.term_hits))
  );
  if (restWithRelevantTerms) {
    return "Inspect REST schema/endpoint for activity assignee/calendar resource data.";
  }

  return "Use Moraware support or Windows SDK live probe to confirm JobActivity.Assignees access path.";
}

function writeStubReports(reason) {
  const generatedAt = new Date().toISOString();
  const json = {
    generatedAt,
    stub: true,
    reason,
    input_summary: {
      api_url_host: null,
      api_url_pathname: null,
      web_base_url_host: null,
      web_base_url_pathname: null,
      has_api_key: Boolean(String(process.env.MORAWARE_API_KEY ?? "").trim()),
      insecure_tls_enabled: String(process.env.MORAWARE_DISCOVERY_ALLOW_INSECURE_TLS ?? "").trim() === "1",
      candidate_count: 0
    },
    attempts: [],
    best_findings: {
      wsdl_candidates: [],
      api_key_required_candidates: [],
      assignee_term_candidates: [],
      job_activity_term_candidates: [],
      calendar_or_pageview_candidates: [],
      rest_like_candidates: []
    },
    recommended_next_step:
      reason.includes("MORAWARE_API_URL")
        ? "Set MORAWARE_API_URL in the environment and rerun."
        : "Fix configuration and rerun."
  };

  const txt = [
    "moraware-wsdl-discovery (stub)",
    `generatedAt: ${generatedAt}`,
    "",
    reason,
    "",
    "No HTTP requests were made.",
    "",
    json.recommended_next_step
  ].join("\n");

  return { json, txt };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const apiUrl = String(process.env.MORAWARE_API_URL ?? "").trim();
  const webBase = String(process.env.MORAWARE_WEB_BASE_URL ?? "").trim();
  const apiKey = String(process.env.MORAWARE_API_KEY ?? "").trim();
  const hasApiKey = Boolean(apiKey);
  const insecureTls = String(process.env.MORAWARE_DISCOVERY_ALLOW_INSECURE_TLS ?? "").trim() === "1";
  const timeoutMs = toInt(process.env.MORAWARE_WSDL_DISCOVERY_TIMEOUT_MS, 10000);

  if (!apiUrl) {
    const { json, txt } = writeStubReports(
      "MORAWARE_API_URL is not set. This script needs the Moraware API base URL (e.g. https://host/api/jobtracker/api.aspx) to derive WSDL/API candidates."
    );
    await fs.writeFile(OUT_JSON, JSON.stringify(json, null, 2), "utf8");
    await fs.writeFile(OUT_TXT, txt, "utf8");
    console.log(`Wrote stub reports to ${OUT_JSON} and ${OUT_TXT}`);
    return;
  }

  let primaryUrl;
  try {
    primaryUrl = new URL(apiUrl);
  } catch {
    const { json, txt } = writeStubReports("MORAWARE_API_URL is not a valid absolute URL.");
    await fs.writeFile(OUT_JSON, JSON.stringify(json, null, 2), "utf8");
    await fs.writeFile(OUT_TXT, txt, "utf8");
    console.log(`Wrote stub reports (invalid URL) to ${OUT_JSON}`);
    return;
  }

  const candidates = buildCandidates(apiUrl, webBase || undefined);
  const apiInput = inputSummaryHostPath(apiUrl);
  const webInput = webBase ? inputSummaryHostPath(webBase) : { host: null, pathname: null };

  /** @type {string[]} */
  const headerVariantsToRun = ["none"];
  if (hasApiKey) {
    headerVariantsToRun.push("api-key", "x-api-key", "X-API-Key", "authorization_bearer");
  }

  /** @type {Array<object>} */
  const attempts = [];

  for (const { url, kind } of candidates) {
    for (const hv of headerVariantsToRun) {
      if (hv !== "none" && !hasApiKey) continue;
      for (const method of ["GET", "OPTIONS"]) {
        const att = await fetchOne(url, method, hv, hasApiKey ? apiKey : "", timeoutMs, insecureTls);
        attempts.push({
          ...att,
          candidate_kind: kind
        });
      }
    }
  }

  const best_findings = computeBestFindings(attempts);
  const recommended_next_step = recommendedNextStep({ hasApiKey, attempts });

  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    input_summary: {
      api_url_host: primaryUrl.host,
      api_url_pathname: primaryUrl.pathname || "/",
      web_base_url_host: webInput.host,
      web_base_url_pathname: webInput.pathname,
      has_api_key: hasApiKey,
      insecure_tls_enabled: insecureTls,
      candidate_count: candidates.length,
      timeout_ms: timeoutMs,
      header_variants_used: headerVariantsToRun
    },
    attempts,
    best_findings,
    recommended_next_step
  };

  let txtBody = [
    "Moraware WSDL / API discovery (read-only)",
    `generatedAt: ${generatedAt}`,
    `api host: ${primaryUrl.host} path: ${primaryUrl.pathname}`,
    webBase ? `web base host: ${webInput.host} path: ${webInput.pathname}` : null,
    `has_api_key: ${hasApiKey} (key never logged)`,
    `insecure_tls: ${insecureTls}`,
    `candidates: ${candidates.length}, attempts: ${attempts.length}`
  ]
    .filter((line) => line != null)
    .join("\n");

  if (insecureTls) {
    txtBody += "\nWARNING: Insecure TLS was enabled for temporary discovery only. Do not use this setting for production sync.\n\n";
  }

  const wsdlFound = attempts.some((a) => a.classification === "wsdl_found" || a.looks_like_wsdl);
  const needsKey = attempts.some((a) => a.classification === "requires_api_key_header");
  const keyedWorked = attempts.some(
    (a) =>
      a.header_variant !== "none" &&
      hasApiKey &&
      a.status === 200 &&
      (a.classification === "wsdl_found" ||
        a.classification === "xml_found" ||
        a.classification === "json_schema_or_rest_response")
  );

  txtBody += "\n\n" + [
    `WSDL-like response seen: ${wsdlFound ? "yes" : "no"}`,
    `Any endpoint reported api-key required: ${needsKey ? "yes" : "no"}`,
    `Keyed variant returned useful response (heuristic): ${keyedWorked ? "yes" : "no"}`,
    `Assignee / JobActivity terms in bodies: ${best_findings.assignee_term_candidates.length || best_findings.job_activity_term_candidates.length ? "yes" : "no"}`,
    "",
    "Top candidate URLs (dedupe by URL):"
  ].join("\n");

  const byUrl = new Map();
  for (const a of attempts) {
    if (!byUrl.has(a.candidate_url_safe)) byUrl.set(a.candidate_url_safe, a);
  }
  let n = 0;
  for (const [u, a] of byUrl) {
    if (n++ >= 12) break;
    txtBody += `\n- ${u}\n  best classification: ${a.classification} status: ${a.status ?? "—"}`;
  }

  txtBody += `\n\nRecommended next step:\n${recommended_next_step}\n`;

  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(OUT_TXT, txtBody, "utf8");

  console.log(`Wrote ${OUT_JSON} and ${OUT_TXT} (${attempts.length} attempts)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
