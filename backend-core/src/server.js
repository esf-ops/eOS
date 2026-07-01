import "dotenv/config";

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import express from "express";
import { createClient } from "@supabase/supabase-js";
import cors from "cors";

import { ALLOWED_ROLES, requireAuth, requireRole } from "./auth/authMiddleware.js";
import { requireHeadAccess } from "./auth/headAccessMiddleware.js";
import { logAction, logLoginEvent } from "./auth/auditLog.js";
import { attachAdvancedSystemAdminUserRoutes } from "./admin/systemAdminUserManagement.js";
import { attachMorawareAdminRoutes } from "./admin/morawareAdmin.js";
import { attachOrgDirectoryRoutes } from "./orgDirectory/orgDirectoryApi.js";
import { attachSalesAccountMappingAdminRoutes } from "./admin/salesAccountMappingAdmin.js";
import { attachIdentityResolutionAdminRoutes } from "./admin/identityResolutionAdmin.js";
import { attachQuoteRoutes } from "./quotes/quoteRoutes.js";
import { attachQuoteFileRoutes } from "./files/quoteFileRoutes.js";
import { attachTakeoffWorkspaceRoutes } from "./takeoff/takeoffWorkspaceRoutes.js";
import { attachSlabInventoryRoutes } from "./slabInventory/slabInventoryApi.js";
import { attachInstallDashboardRoutes } from "./install/installDashboardApi.js";
import { attachHrWorkforceRoutes } from "./hr/hrWorkforceApi.js";
import { attachSlabCloudHourlySyncRoutes } from "./slabcloud/slabCloudHourlySyncApi.js";
import { attachSlabsmithIngestRoutes } from "./slabsmith/slabsmithIngestApi.js";
import { attachSlabsmithImageUploadRoutes } from "./slabsmith/slabsmithImageUploadApi.js";
import { collectHeadEnvOriginsForCors } from "./me/headDeploymentUrls.js";
import { buildMeHeadsPayload } from "./me/launcherHeads.js";
import { buildTitansTodayPayload, parseTitansTodayQuery } from "./titans/titansToday.js";
import { attachSalesHeadRoutes } from "./sales/salesHead.js";
import { attachMorawareSyncRoutes } from "./moraware/morawareSyncApi.js";

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function toInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function yearWindow(year) {
  const y = Number.parseInt(String(year ?? ""), 10);
  if (!Number.isFinite(y) || y < 1970 || y > 2100) {
    throw new Error(`Invalid year: ${year}`);
  }
  const start = `${y}-01-01`;
  const endExclusive = `${y + 1}-01-01`;
  return { year: y, start, endExclusive };
}

let _supabaseServerClientInstance = null;
function supabaseServerClient() {
  if (!_supabaseServerClientInstance) {
    const url = requiredEnv("SUPABASE_URL");
    const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    _supabaseServerClientInstance = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _supabaseServerClientInstance;
}

const headAccessExecutive   = requireHeadAccess("executive",   { getSupabase: supabaseServerClient });
const headAccessBrainHealth = requireHeadAccess("brain_health", { getSupabase: supabaseServerClient });
const headAccessSystemAdmin = requireHeadAccess("system_admin", { getSupabase: supabaseServerClient });
const headAccessAiTakeoff   = requireHeadAccess("ai_takeoff",   { getSupabase: supabaseServerClient });

function cronSecretOrNull() {
  const s = String(process.env.EOS_CRON_SECRET ?? "").trim();
  return s ? s : null;
}

function requireCronSecret(req, res) {
  const expected = cronSecretOrNull();
  if (!expected) {
    res.status(500).json({ ok: false, error: "EOS_CRON_SECRET not configured" });
    return false;
  }
  const got = String(req.header("x-eos-cron-secret") ?? "").trim();
  if (!got || got !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

function repoRootFromHere() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // backend-core/src/server.js -> repo root
  return path.resolve(__dirname, "../..");
}

function spawnBackgroundNode(scriptRelFromRepoRoot, envOverrides) {
  const repoRoot = repoRootFromHere();
  const child = spawn(process.execPath, [scriptRelFromRepoRoot], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, ...envOverrides }
  });
  child.unref();
  return { pid: child.pid };
}

async function loadJobsForYear(supabase, year) {
  const { start, endExclusive } = yearWindow(year);
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("brain_jobs")
      .select(
        "job_id,job_name,account_id,account_name,creation_date,job_status,salesperson_name,worksheet_sqft,form_count,field_count,job_worksheet_forms",
        { count: "exact" }
      )
      .gte("creation_date", start)
      .lt("creation_date", endExclusive)
      .order("creation_date", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

const EXEC_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function aggregateJobsByYearMonth(jobs, yearNum) {
  const prefix = `${yearNum}-`;
  const map = new Map();
  for (const j of jobs) {
    const cd = String(j.creation_date ?? "");
    const ym = cd.length >= 7 ? cd.slice(0, 7) : "";
    if (!ym.startsWith(prefix)) continue;
    const slot = map.get(ym) || { jobs: 0, worksheet_sqft: 0 };
    slot.jobs += 1;
    slot.worksheet_sqft += Number(j.worksheet_sqft ?? 0) || 0;
    map.set(ym, slot);
  }
  return map;
}

async function buildExecutiveMonthlyTrendPayload(supabase, yearRaw) {
  const y = Number.parseInt(String(yearRaw ?? ""), 10);
  if (!Number.isFinite(y) || y < 1970 || y > 2100) {
    throw new Error(`Invalid year: ${yearRaw}`);
  }
  const priorYear = y - 1;
  const [curJobs, priJobs] = await Promise.all([
    loadJobsForYear(supabase, y),
    loadJobsForYear(supabase, priorYear)
  ]);

  const curBy = aggregateJobsByYearMonth(curJobs, y);
  const priBy = aggregateJobsByYearMonth(priJobs, priorYear);
  const priorYearAvailable = priJobs.length > 0;

  const months = [];
  for (let mi = 0; mi < 12; mi++) {
    const mm = String(mi + 1).padStart(2, "0");
    const monthKey = `${y}-${mm}`;
    const priMonthKey = `${priorYear}-${mm}`;
    const cur = curBy.get(monthKey) || { jobs: 0, worksheet_sqft: 0 };
    const priSlot = priBy.get(priMonthKey);

    const row = {
      month: monthKey,
      monthLabel: EXEC_MONTH_LABELS[mi],
      jobs: cur.jobs,
      worksheet_sqft: cur.worksheet_sqft,
      prior_jobs: null,
      prior_worksheet_sqft: null,
      sqft_delta: null,
      sqft_delta_pct: null
    };

    if (priorYearAvailable) {
      const pj = priSlot ? priSlot.jobs : 0;
      const psq = priSlot ? priSlot.worksheet_sqft : 0;
      row.prior_jobs = pj;
      row.prior_worksheet_sqft = psq;
      row.sqft_delta = cur.worksheet_sqft - psq;
      row.sqft_delta_pct = psq > 0 ? ((cur.worksheet_sqft - psq) / psq) * 100 : null;
    }
    months.push(row);
  }

  return { year: y, priorYear, priorYearAvailable, months };
}

async function latestSyncRun(supabase) {
  const { data, error } = await supabase
    .from("brain_sync_runs")
    .select("id,mode,started_at,finished_at,status,raw_summary")
    .order("finished_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

async function latestSuccessSyncRun(supabase) {
  const { data, error } = await supabase
    .from("brain_sync_runs")
    .select("id,mode,started_at,finished_at,status,raw_summary")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

async function currentSyncLock(supabase, lockName) {
  const { data, error } = await supabase
    .from("eos_sync_locks")
    .select("lock_name,locked_at,locked_by,expires_at")
    .eq("lock_name", lockName)
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

async function unresolvedFailedJobCount(supabase) {
  const { count, error } = await supabase
    .from("eos_failed_job_syncs")
    .select("id", { count: "exact", head: true })
    .eq("resolved", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function computeHealthColor({ latestSyncStatus, unresolvedFailedJobCount, currentLock, lockExpired }) {
  const status = String(latestSyncStatus ?? "").toLowerCase();
  const unresolved = Number(unresolvedFailedJobCount ?? 0) || 0;
  const hasActiveLock = Boolean(currentLock) && lockExpired !== true;
  if (status === "success" && unresolved === 0 && !hasActiveLock) return "green";
  if (status === "failed") return "red";
  if (status === "partial_error" || unresolved > 0 || hasActiveLock) return "yellow";
  return "yellow";
}

async function loadJobDetail(supabase, jobId) {
  const { data: jobRows, error: jobErr } = await supabase
    .from("brain_jobs")
    .select("*")
    .eq("job_id", jobId)
    .limit(1);
  if (jobErr) throw new Error(jobErr.message);
  const job = jobRows?.[0] ?? null;
  if (!job) return { job: null, forms: [], fields: [] };

  const { data: forms, error: formsErr } = await supabase
    .from("brain_forms")
    .select("*")
    .eq("job_id", jobId);
  if (formsErr) throw new Error(formsErr.message);

  const { data: fields, error: fieldsErr } = await supabase
    .from("brain_fields")
    .select("*")
    .eq("job_id", jobId)
    .order("id", { ascending: true });
  if (fieldsErr) throw new Error(fieldsErr.message);

  return { job, forms: forms ?? [], fields: fields ?? [] };
}

function groupFieldsUnderForms(forms, fields) {
  const byFormId = new Map();
  for (const f of forms) {
    byFormId.set(String(f.form_id), { ...f, fields: [] });
  }
  for (const fld of fields) {
    const fid = String(fld.form_id ?? "");
    if (!byFormId.has(fid)) {
      byFormId.set(fid, { form_id: fid, fields: [] });
    }
    byFormId.get(fid).fields.push(fld);
  }
  return [...byFormId.values()];
}

async function loadSqFtFieldsForYear(supabase, year) {
  const jobs = await loadJobsForYear(supabase, year);
  const jobById = new Map(jobs.map((j) => [String(j.job_id), j]));
  const jobIds = jobs.map((j) => String(j.job_id));

  const out = [];
  const chunkSize = 100;
  for (let i = 0; i < jobIds.length; i += chunkSize) {
    const chunk = jobIds.slice(i, i + chunkSize);
    const { data: fields, error } = await supabase
      .from("brain_fields")
      .select("job_id,form_id,value,numeric_value,normalized_label")
      .in("job_id", chunk)
      .or(
        [
          "normalized_label.ilike.%sq ft%",
          "normalized_label.ilike.%sqft%",
          "normalized_label.ilike.%worksheet_sqft%",
          "normalized_label.ilike.%sq_ft%",
          "normalized_label.ilike.%square_foot%",
          "normalized_label.ilike.%square_footage%"
        ].join(",")
      );
    if (error) throw new Error(error.message);

    const formIds = [...new Set((fields ?? []).map((f) => String(f.form_id ?? "")).filter(Boolean))];
    const formMap = new Map();
    if (formIds.length) {
      const { data: forms, error: formsErr } = await supabase
        .from("brain_forms")
        .select("form_id,form_name,job_id")
        .in("form_id", formIds);
      if (formsErr) throw new Error(formsErr.message);
      (forms ?? []).forEach((f) => formMap.set(String(f.form_id), f));
    }

    for (const f of fields ?? []) {
      const job = jobById.get(String(f.job_id));
      const form = formMap.get(String(f.form_id));
      out.push({
        job_id: String(f.job_id),
        job_name: job?.job_name ?? "",
        account_name: job?.account_name ?? "",
        form_id: String(f.form_id ?? ""),
        form_name: form?.form_name ?? "",
        value: String(f.value ?? ""),
        numeric_value: f.numeric_value
      });
    }
  }

  return out;
}

const app = express();

/** Local Vite dev ports (5173–5179) + common drift; localhost and 127.0.0.1. */
const defaultAllowedOrigins = (() => {
  const out = [];
  for (const host of ["http://localhost", "http://127.0.0.1"]) {
    for (let p = 5173; p <= 5189; p++) {
      out.push(`${host}:${p}`);
    }
  }
  return out;
})();

/**
 * Staging/production browser origins allowed to call this API with cookies + Authorization headers.
 * Comma-separated full origins (scheme + host, no trailing path). Leave unset for localhost-only defaults.
 *
 * Use `ALLOWED_ORIGINS`, `EOS_ALLOWED_ORIGINS`, or `CORS_ALLOWED_ORIGINS` (all merged; same comma-separated format).
 *
 * Examples (staging on Vercel + separate executive app):
 *   EOS_ALLOWED_ORIGINS=https://YOUR-BRAIN-HEALTH-STAGING.vercel.app,https://YOUR-EXECUTIVE-STAGING.vercel.app
 * Production launcher / heads later:
 *   EOS_ALLOWED_ORIGINS=https://eos.elitestonefabrication.com,https://heads.elitestonefabrication.com
 *
 * eliteOSfab production + preview (no trailing slashes). `HEAD_URL_*` values configured on Brain are merged into CORS.
 * Also set `ALLOWED_ORIGINS` / `EOS_ALLOWED_ORIGINS` / `CORS_ALLOWED_ORIGINS` for each Vercel preview URL
 * (e.g. https://app-home-xxxx.vercel.app).
 */
function parseCommaSeparatedOrigins(raw) {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/** Normalize Browser `Origin` values for comparisons (lowercase scheme/host; drops trailing slash). */
function normalizeBrowserOrigin(raw) {
  const s = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!s) return "";
  try {
    const u = new URL(s);
    return `${u.protocol.toLowerCase()}//${u.hostname.toLowerCase()}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return "";
  }
}

/**
 * When enabled, allows `https://*.eliteosfab.com` (and apex) by validating the request Origin hostname —
 * still reflects the exact Origin string via `cors` (never `*`).
 *
 * Default: on when `VERCEL_ENV=production`. Disable with `EOS_TRUST_ELITEOSFAB_SUBDOMAIN_ORIGINS=0`.
 */
function eliteOsFabSubdomainCorsTrustEnabled() {
  const raw = String(process.env.EOS_TRUST_ELITEOSFAB_SUBDOMAIN_ORIGINS ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  return String(process.env.VERCEL_ENV ?? "").trim() === "production";
}

/** @param {string} normalizedOrigin output of normalizeBrowserOrigin */
function isTrustedEliteOsFabHttpsOrigin(normalizedOrigin) {
  try {
    const u = new URL(normalizedOrigin);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return h === "eliteosfab.com" || h.endsWith(".eliteosfab.com");
  } catch {
    return false;
  }
}

const envOriginAdditions = [
  ...parseCommaSeparatedOrigins(process.env.ALLOWED_ORIGINS),
  ...parseCommaSeparatedOrigins(process.env.EOS_ALLOWED_ORIGINS),
  ...parseCommaSeparatedOrigins(process.env.CORS_ALLOWED_ORIGINS)
];

/** Always allow hosted public quote app + common local Vite port (also covered by default range). */
const fixedEliteOsOrigins = [
  "https://eliteos-quote.vercel.app",
  "http://localhost:5179",
  "https://www.eliteosfab.com",
  "https://eliteosfab.com",
  "https://quote.eliteosfab.com",
  "https://internal.eliteosfab.com",
  "https://estimate.eliteosfab.com",
  "https://pricing.eliteosfab.com",
  "https://quotes.eliteosfab.com",
  "https://eliteos-quotes.vercel.app",
  "https://system.eliteosfab.com",
  "https://org.eliteosfab.com",
  "https://org-directory.eliteosfab.com",
  "http://localhost:5177",
  "http://localhost:5185"
];

/** Localhost origins are development-only; exclude in production to reduce attack surface. */
const isProductionDeployment =
  String(process.env.VERCEL_ENV ?? "").trim() === "production" ||
  String(process.env.NODE_ENV ?? "").trim() === "production";

const allowedOrigins = [
  ...new Set(
    [
      ...(isProductionDeployment ? [] : defaultAllowedOrigins),
      ...fixedEliteOsOrigins.filter((o) => !isProductionDeployment || !o.startsWith("http://localhost")),
      ...envOriginAdditions,
      ...collectHeadEnvOriginsForCors()
    ]
      .map(normalizeBrowserOrigin)
      .filter(Boolean)
  )
];

const allowedOriginSet = new Set(allowedOrigins);

/** Dedupe `Vary` field names (case-insensitive) when layering with `cors` + CDN behaviors. */
function appendVaryHeaderField(res, fieldName) {
  const name = String(fieldName ?? "").trim();
  if (!name) return;
  const existingRaw = res.getHeader("Vary");
  if (existingRaw == null || existingRaw === "") {
    res.setHeader("Vary", name);
    return;
  }
  const existingStr = Array.isArray(existingRaw) ? existingRaw.join(", ") : String(existingRaw);
  const parts = existingStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set(parts.map((p) => p.toLowerCase()));
  if (seen.has(name.toLowerCase())) return;
  res.setHeader("Vary", `${existingStr}, ${name}`);
}

/**
 * Shared caches must not reuse `/api/*` responses (or preflight) across Browser origins —
 * otherwise stale `Access-Control-Allow-Origin` can pair with the wrong client Origin.
 *
 * Skips `/api/public-quote*` so public quote tooling/CDN behavior stays unchanged.
 */
function shouldApplyApiNoStoreHeaders(req) {
  const p = req.path || "";
  if (!p.startsWith("/api")) return false;
  if (p.startsWith("/api/public-quote")) return false;
  return true;
}

function applyApiNoStoreHeaders(req, res, next) {
  if (!shouldApplyApiNoStoreHeaders(req)) return next();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  appendVaryHeaderField(res, "Origin");
  appendVaryHeaderField(res, "Access-Control-Request-Method");
  appendVaryHeaderField(res, "Access-Control-Request-Headers");
  next();
}

app.use(applyApiNoStoreHeaders);

/** CORS: reflected `Origin` + `credentials` for allowed Browser clients (`cors` runs after cache/Vary so OPTIONS matches). */
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const norm = normalizeBrowserOrigin(origin);
      if (!norm) return callback(null, false);
      if (allowedOriginSet.has(norm)) return callback(null, true);
      if (eliteOsFabSubdomainCorsTrustEnabled() && isTrustedEliteOsFabHttpsOrigin(norm)) return callback(null, true);
      // Do not throw; missing CORS headers should not become a server 500.
      return callback(null, false);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-eos-cron-secret", "x-eliteos-cron-secret", "x-moraware-sync-secret", "x-organization-key"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  })
);

app.get("/api/debug/cors", (req, res) => {
  const origin = req.headers.origin;
  const originStr = origin != null && String(origin).trim() !== "" ? String(origin) : null;
  res.json({
    ok: true,
    origin: originStr,
    normalizedOrigin: originStr ? normalizeBrowserOrigin(originStr) : null,
    eliteOsFabSubdomainTrust: eliteOsFabSubdomainCorsTrustEnabled(),
    allowedOrigins
  });
});

app.get("/api/health", (_req, res) => {
  const supabaseUrlPresent = Boolean(String(process.env.SUPABASE_URL ?? "").trim());
  const supabaseServerKeyPresent = Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim());
  const mondayTokenPresent = Boolean(String(process.env.MONDAY_API_TOKEN ?? "").trim());
  const mondayPublicBoardPresent = Boolean(
    String(process.env.MONDAY_PUBLIC_QUOTES_BOARD_ID ?? "").trim() ||
      String(process.env.MONDAY_QUOTES_BOARD_ID ?? "").trim()
  );
  const environment = String(process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development").trim() || "development";
  res.json({
    ok: true,
    app: "eliteOS Brain API",
    environment,
    supabaseUrlPresent,
    supabaseServerKeyPresent,
    mondayTokenPresent,
    mondayPublicBoardPresent
  });
});

app.get("/api/brain/sync-plan", (_req, res) => {
  res.json({
    recent: "every 15-30 minutes after deployment",
    nightly: "once per night",
    nightlyOperational: "nightly or weekly",
    retryFailed: "after every scheduled sync",
    note: "Full syncs should not run every 15 minutes."
  });
});

attachMorawareSyncRoutes(app, {
  requireAuth,
  requireRole,
  requireHeadAccess,
  getSupabase: supabaseServerClient
});

// Executive Head: read-only aggregates (admin/executive only)
app.get(
  "/api/executive/summary",
  requireAuth(),
  requireRole(["admin", "executive"]),
  headAccessExecutive,
  async (req, res) => {
  try {
    const year = String(req.query.year ?? "").trim() || "2026";
    const supabase = supabaseServerClient();
    const jobs = await loadJobsForYear(supabase, year);

    const totalJobs = jobs.length;
    const jobsWithSqft = jobs.filter((j) => Number(j.worksheet_sqft ?? 0) > 0).length;
    const jobsMissingSqft = totalJobs - jobsWithSqft;
    const totalSqft = jobs.reduce((sum, j) => sum + (Number(j.worksheet_sqft ?? 0) || 0), 0);
    const avgSqftPerJob = totalJobs ? totalSqft / totalJobs : 0;

    const totalForms = jobs.reduce((sum, j) => sum + (Number(j.form_count ?? 0) || 0), 0);
    const totalFields = jobs.reduce((sum, j) => sum + (Number(j.field_count ?? 0) || 0), 0);

    const latest = await latestSyncRun(supabase);
    const currentLock = await currentSyncLock(supabase, "moraware_global_sync");
    const nowMs = Date.now();
    const lockExpired =
      currentLock?.expires_at != null ? Date.parse(String(currentLock.expires_at)) < nowMs : null;
    const unresolved = await unresolvedFailedJobCount(supabase);

    const latestSyncStatus = latest?.status ?? null;
    const latestSyncFinishedAt = latest?.finished_at ?? null;

    res.json({
      ok: true,
      year: Number.parseInt(year, 10),
      latestSyncStatus,
      latestSyncFinishedAt,
      totalJobs,
      totalSqft,
      avgSqftPerJob,
      jobsWithSqft,
      jobsMissingSqft,
      totalForms,
      totalFields,
      unresolvedFailedJobCount: unresolved,
      healthColor: computeHealthColor({
        latestSyncStatus,
        unresolvedFailedJobCount: unresolved,
        currentLock,
        lockExpired
      })
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get(
  "/api/executive/salesperson-performance",
  requireAuth(),
  requireRole(["admin", "executive"]),
  headAccessExecutive,
  async (req, res) => {
    try {
      const year = String(req.query.year ?? "").trim() || "2026";
      const supabase = supabaseServerClient();
      const jobs = await loadJobsForYear(supabase, year);

      const by = new Map();
      for (const j of jobs) {
        const sp = String(j.salesperson_name ?? "").trim() || "(blank)";
        const slot = by.get(sp) || {
          salesperson_name: sp,
          jobs: 0,
          worksheet_sqft: 0,
          first_job_date: null,
          latest_job_date: null
        };
        slot.jobs += 1;
        slot.worksheet_sqft += Number(j.worksheet_sqft ?? 0) || 0;
        const d = j.creation_date ? String(j.creation_date) : "";
        if (d) {
          if (!slot.first_job_date || d < slot.first_job_date) slot.first_job_date = d;
          if (!slot.latest_job_date || d > slot.latest_job_date) slot.latest_job_date = d;
        }
        by.set(sp, slot);
      }

      const rows = [...by.values()]
        .map((r) => ({
          ...r,
          avg_sqft_per_job: r.jobs ? r.worksheet_sqft / r.jobs : 0
        }))
        .sort((a, b) => b.worksheet_sqft - a.worksheet_sqft);

      res.json({ ok: true, year: Number.parseInt(year, 10), rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }
);

app.get(
  "/api/executive/account-performance",
  requireAuth(),
  requireRole(["admin", "executive"]),
  headAccessExecutive,
  async (req, res) => {
  try {
    const year = String(req.query.year ?? "").trim() || "2026";
    const limit = clamp(toInt(req.query.limit, 25), 1, 200);
    const supabase = supabaseServerClient();
    const jobs = await loadJobsForYear(supabase, year);

    const by = new Map();
    for (const j of jobs) {
      const accountId = String(j.account_id ?? "").trim();
      const accountName = String(j.account_name ?? "").trim() || "(blank)";
      const key = accountId || accountName;
      const slot = by.get(key) || {
        account_id: accountId,
        account_name: accountName,
        jobs: 0,
        worksheet_sqft: 0,
        salesperson_names: new Set()
      };
      slot.jobs += 1;
      slot.worksheet_sqft += Number(j.worksheet_sqft ?? 0) || 0;
      const sp = String(j.salesperson_name ?? "").trim();
      if (sp) slot.salesperson_names.add(sp);
      by.set(key, slot);
    }

    const rows = [...by.values()]
      .map((r) => ({
        account_id: r.account_id,
        account_name: r.account_name,
        jobs: r.jobs,
        worksheet_sqft: r.worksheet_sqft,
        avg_sqft_per_job: r.jobs ? r.worksheet_sqft / r.jobs : 0,
        salesperson_names: [...r.salesperson_names].sort()
      }))
      .sort((a, b) => b.worksheet_sqft - a.worksheet_sqft)
      .slice(0, limit);

    res.json({ ok: true, year: Number.parseInt(year, 10), limit, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get(
  "/api/executive/production-flow",
  requireAuth(),
  requireRole(["admin", "executive"]),
  headAccessExecutive,
  async (req, res) => {
  try {
    const year = String(req.query.year ?? "").trim() || "2026";
    const supabase = supabaseServerClient();
    const jobs = await loadJobsForYear(supabase, year);
    const jobIds = jobs.map((j) => String(j.job_id));
    if (!jobIds.length) return res.json({ ok: true, year: Number.parseInt(year, 10), rows: [], message: "" });

    const byType = new Map();
    const byStatus = new Map();
    let activityRowCount = 0;

    for (const ids of chunk(jobIds, 500)) {
      const { data, error } = await supabase
        .from("brain_job_activities")
        .select("activity_type,activity_status,description,notes")
        .in("job_id", ids);
      if (error) {
        return res.json({
          ok: true,
          year: Number.parseInt(year, 10),
          activityTypeCounts: [],
          activityStatusCounts: [],
          categories: [],
          message: "Operational activity data has not been ingested for this range."
        });
      }
      for (const a of data ?? []) {
        activityRowCount += 1;
        const t = String(a.activity_type ?? "").trim() || "(blank)";
        const s = String(a.activity_status ?? "").trim() || "(blank)";
        byType.set(t, (byType.get(t) || 0) + 1);
        byStatus.set(s, (byStatus.get(s) || 0) + 1);
      }
    }

    const activityTypeCounts = [...byType.entries()]
      .map(([activity_type, count]) => ({ activity_type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
    const activityStatusCounts = [...byStatus.entries()]
      .map(([activity_status, count]) => ({ activity_status, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    const catRx = [
      { key: "template", re: /template/i },
      { key: "install", re: /install/i },
      { key: "order_stone", re: /order\s*stone/i },
      { key: "saw_program", re: /saw\s*program/i },
      { key: "titan_program", re: /titan\s*program/i },
      { key: "saw", re: /\bsaw\b/i },
      { key: "fabrication", re: /fabrication/i },
      { key: "polish", re: /polish/i },
      { key: "customer_service", re: /customer\s*service|\bservice\b/i },
      { key: "waterfalls", re: /waterfall/i },
      { key: "full_height_backsplash", re: /full\s*height|fhbs|backsplash/i }
    ];

    const categories = catRx.map((c) => {
      const count = [...byType.entries()].reduce((sum, [t, n]) => (c.re.test(t) ? sum + n : sum), 0);
      return { category: c.key, count };
    });

    res.json({
      ok: true,
      year: Number.parseInt(year, 10),
      activityRowCount,
      activityTypeCounts,
      activityStatusCounts,
      categories,
      message: activityRowCount ? "" : "Operational activity data has not been ingested for this range."
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get(
  "/api/executive/titan-signals",
  requireAuth(),
  requireRole(["admin", "executive"]),
  headAccessExecutive,
  async (req, res) => {
  try {
    const year = String(req.query.year ?? "").trim() || "2026";
    const supabase = supabaseServerClient();
    const jobs = await loadJobsForYear(supabase, year);
    const jobById = new Map(jobs.map((j) => [String(j.job_id), j]));
    const jobIds = jobs.map((j) => String(j.job_id));

    const summaries = [];
    for (const ids of chunk(jobIds, 500)) {
      const { data, error } = await supabase.from("brain_job_operational_summary").select("*").in("job_id", ids);
      if (error) {
        return res.json({
          ok: true,
          year: Number.parseInt(year, 10),
          counts: {},
          topRiskJobs: [],
          message: "Operational summary data has not been ingested for this range."
        });
      }
      summaries.push(...(data ?? []));
    }

    const countFlag = (k) => summaries.filter((s) => Boolean(s?.[k])).length;
    const counts = {
      jobs_with_template_activity: countFlag("has_template_activity"),
      jobs_with_install_activity: countFlag("has_install_activity"),
      jobs_with_order_stone_activity: countFlag("has_order_stone_activity"),
      jobs_with_slab_signal: countFlag("has_slab_signal"),
      jobs_with_change_signal: countFlag("has_change_signal"),
      jobs_with_remake_signal: countFlag("has_remake_signal"),
      jobs_with_customer_service_signal: countFlag("has_customer_service_signal"),
      jobs_with_repair_signal: countFlag("has_repair_signal")
    };

    const risk = summaries
      .filter(
        (s) =>
          Boolean(s?.has_slab_signal) ||
          Boolean(s?.has_change_signal) ||
          Boolean(s?.has_remake_signal) ||
          Boolean(s?.has_customer_service_signal)
      )
      .map((s) => {
        const j = jobById.get(String(s.job_id));
        return {
          job_id: String(s.job_id),
          job_name: j?.job_name ?? "",
          account_name: j?.account_name ?? "",
          salesperson_name: j?.salesperson_name ?? "",
          worksheet_sqft: j?.worksheet_sqft ?? 0,
          has_slab_signal: Boolean(s?.has_slab_signal),
          has_change_signal: Boolean(s?.has_change_signal),
          has_remake_signal: Boolean(s?.has_remake_signal),
          has_customer_service_signal: Boolean(s?.has_customer_service_signal)
        };
      })
      .sort((a, b) => Number(b.worksheet_sqft ?? 0) - Number(a.worksheet_sqft ?? 0))
      .slice(0, 20);

    res.json({
      ok: true,
      year: Number.parseInt(year, 10),
      counts,
      topRiskJobs: risk,
      message: summaries.length ? "" : "Operational summary data has not been ingested for this range."
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get(
  "/api/executive/field-trends",
  requireAuth(),
  requireRole(["admin", "executive"]),
  headAccessExecutive,
  async (req, res) => {
  try {
    const year = String(req.query.year ?? "").trim() || "2026";
    const supabase = supabaseServerClient();
    const jobs = await loadJobsForYear(supabase, year);
    const jobIds = jobs.map((j) => String(j.job_id));
    if (!jobIds.length) return res.json({ ok: true, year: Number.parseInt(year, 10), trends: {} });

    const matchers = [
      { key: "color", re: /color/i, or: "normalized_label.ilike.%color%" },
      { key: "edge", re: /\bedge\b/i, or: "normalized_label.ilike.%edge%" },
      { key: "thickness", re: /thickness/i, or: "normalized_label.ilike.%thickness%" },
      { key: "sink_type", re: /sink\s*type|sink/i, or: "normalized_label.ilike.%sink%" },
      { key: "faucet", re: /faucet/i, or: "normalized_label.ilike.%faucet%" },
      { key: "backsplash_full_height", re: /backsplash|full\s*height|fhbs/i, or: "normalized_label.ilike.%backsplash%,normalized_label.ilike.%full height%" }
    ];

    const countsByKey = new Map(matchers.map((m) => [m.key, new Map()]));

    for (const ids of chunk(jobIds, 200)) {
      // Pull a reduced subset by label patterns (avoids full brain_fields scan).
      const or = [
        "normalized_label.ilike.%color%",
        "normalized_label.ilike.%edge%",
        "normalized_label.ilike.%thickness%",
        "normalized_label.ilike.%sink%",
        "normalized_label.ilike.%faucet%",
        "normalized_label.ilike.%backsplash%",
        "normalized_label.ilike.%full height%",
        "normalized_label.ilike.%full_height%",
        "normalized_label.ilike.%fhbs%"
      ].join(",");

      const { data, error } = await supabase
        .from("brain_fields")
        .select("normalized_label,value")
        .in("job_id", ids)
        .or(or);
      if (error) throw new Error(error.message);

      for (const row of data ?? []) {
        const label = String(row.normalized_label ?? "");
        const value = String(row.value ?? "").trim();
        if (!value) continue;
        for (const m of matchers) {
          if (!m.re.test(label)) continue;
          const map = countsByKey.get(m.key);
          map.set(value, (map.get(value) || 0) + 1);
        }
      }
    }

    const topValues = (map, n) =>
      [...map.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, n);

    const trends = {};
    for (const [k, map] of countsByKey.entries()) {
      trends[k] = topValues(map, 20);
    }

    res.json({ ok: true, year: Number.parseInt(year, 10), trends });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get(
  "/api/executive/monthly-trend",
  requireAuth(),
  requireRole(["admin", "executive"]),
  headAccessExecutive,
  async (req, res) => {
  try {
    const year = String(req.query.year ?? "").trim() || "2026";
    const supabase = supabaseServerClient();
    const payload = await buildExecutiveMonthlyTrendPayload(supabase, year);
    res.json({ ok: true, ...payload });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/executive/debug", requireAuth(), requireRole(["admin", "executive"]), (_req, res) => {
  res.json({ ok: true, message: "executive routes active" });
});

/** Titan / Saw “today” list (Brain activity signals — not machine telemetry). */
app.get(
  "/api/titans/today",
  requireAuth(),
  requireRole(["admin", "executive"]),
  headAccessExecutive,
  async (req, res) => {
  try {
    const q = parseTitansTodayQuery(req);
    if (q.dateInvalid) {
      return res.status(400).json({ ok: false, error: "Invalid date parameter (use date=YYYY-MM-DD)" });
    }
    const supabase = supabaseServerClient();
    const payload = await buildTitansTodayPayload(supabase, {
      localDateYmd: q.localDateYmd,
      limit: q.limit,
      debug: q.debugRequested
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/auth/roles", (_req, res) => {
  res.json({ ok: true, roles: ALLOWED_ROLES });
});

const authEventThrottle = new Map();

function shouldRecordAuthEvent(userId, eventType, toolSlug, windowMs = 5 * 60 * 1000) {
  const key = `${String(userId ?? "")}|${String(eventType ?? "")}|${String(toolSlug ?? "")}`;
  const now = Date.now();
  const last = authEventThrottle.get(key) || 0;
  if (now - last < windowMs) return false;
  authEventThrottle.set(key, now);
  return true;
}

async function recordThrottledAuthEvent(req, eventType, toolSlug, metadata) {
  if (!shouldRecordAuthEvent(req.user?.id, eventType, toolSlug)) return;
  await logLoginEvent({ user: req.user, eventType, toolSlug, metadata, req });
}

app.get("/api/me", requireAuth(), async (req, res) => {
  await recordThrottledAuthEvent(req, "session_seen", "home", { route: "/api/me" });
  const user = { ...req.user };
  // Enrich with organization display name — graceful if organizations table absent
  if (user.organization_id) {
    try {
      const sb = supabaseServerClient();
      const { data } = await sb
        .from("organizations")
        .select("display_name,organization_key")
        .eq("id", user.organization_id)
        .maybeSingle();
      if (data) {
        user.organization_name = data.display_name ?? null;
        user.organization_slug = data.organization_key ?? null;
      }
    } catch (_) { /* non-fatal — org table may not be applied yet */ }
  }
  res.json({ ok: true, user });
});

// ---------------------------------------------------------------------------
// Profile & Preferences API — safe user-owned UI preferences only.
// Security: requireAuth() only; users can read/update their own row.
// Never allows role, org, head-access, or permission changes.
// Degrades gracefully if user_preferences table is not yet applied
// (returns defaults on GET, no-op on PATCH).
// ---------------------------------------------------------------------------

const _PREF_DEFAULTS = {
  default_landing_head: null,
  table_density: "comfortable",
  open_heads_in_new_tab: true,
  show_advanced_panels_default: false
};

const _PREF_ALLOWED_KEYS = new Set([
  "default_landing_head",
  "table_density",
  "open_heads_in_new_tab",
  "show_advanced_panels_default"
]);

const _PREF_ALLOWED_TABLE_DENSITY = new Set(["comfortable", "compact"]);

const _PREF_ALLOWED_LANDING_HEADS = new Set([
  "quote", "quote_library", "pricing_admin", "system_admin",
  "sales", "executive", "brain_health", "public_quote",
  "production", "shop_tv", "install", "purchasing",
  "customer_service", "hr", "safety", "org_directory"
]);

app.get("/api/me/preferences", requireAuth(), async (req, res) => {
  try {
    const supabase = supabaseServerClient();
    const { data, error } = await supabase
      .from("user_preferences")
      .select("default_landing_head,table_density,open_heads_in_new_tab,show_advanced_panels_default")
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (error) {
      // Table likely not yet applied — return defaults, not an error
      return res.json({ ok: true, preferences: { ..._PREF_DEFAULTS }, source: "defaults" });
    }
    const preferences = data ? { ..._PREF_DEFAULTS, ...data } : { ..._PREF_DEFAULTS };
    return res.json({ ok: true, preferences, source: data ? "db" : "defaults" });
  } catch {
    return res.json({ ok: true, preferences: { ..._PREF_DEFAULTS }, source: "defaults" });
  }
});

app.patch("/api/me/preferences", requireAuth(), async (req, res) => {
  const body = req.body || {};
  const patch = {};

  for (const key of Object.keys(body)) {
    if (!_PREF_ALLOWED_KEYS.has(key)) {
      return res.status(400).json({ ok: false, error: `Unknown preference key: ${key}` });
    }
    const val = body[key];
    if (key === "table_density") {
      if (!_PREF_ALLOWED_TABLE_DENSITY.has(val)) {
        return res.status(400).json({ ok: false, error: "table_density must be comfortable or compact" });
      }
      patch.table_density = val;
    } else if (key === "open_heads_in_new_tab" || key === "show_advanced_panels_default") {
      if (typeof val !== "boolean") {
        return res.status(400).json({ ok: false, error: `${key} must be boolean` });
      }
      patch[key] = val;
    } else if (key === "default_landing_head") {
      if (val !== null && !_PREF_ALLOWED_LANDING_HEADS.has(val)) {
        return res.status(400).json({ ok: false, error: "Unknown landing head slug" });
      }
      patch.default_landing_head = val;
    }
  }

  if (Object.keys(patch).length === 0) {
    return res.json({ ok: true, message: "No changes" });
  }

  patch.updated_at = new Date().toISOString();

  try {
    const supabase = supabaseServerClient();
    const { error } = await supabase
      .from("user_preferences")
      .upsert({ user_id: req.user.id, ...patch }, { onConflict: "user_id" });
    if (error) {
      // Table not yet applied — acknowledge gracefully (localStorage fallback in frontend)
      return res.json({ ok: true, message: "Noted (table pending apply)", source: "no-op" });
    }
    return res.json({ ok: true, message: "Preferences saved", source: "db" });
  } catch {
    return res.json({ ok: true, message: "Noted (table pending apply)", source: "no-op" });
  }
});

attachSalesHeadRoutes(app, {
  requireAuth,
  requireRole,
  requireHeadAccess,
  getSupabase: supabaseServerClient
});

attachAdvancedSystemAdminUserRoutes(app, { supabaseServerClient });

attachSalesAccountMappingAdminRoutes(app, {
  requireAuth,
  requireRole,
  requireHeadAccess,
  getSupabase: supabaseServerClient
});

attachMorawareAdminRoutes(app, {
  requireAuth,
  requireRole,
  requireHeadAccess,
  getSupabase: supabaseServerClient
});

attachOrgDirectoryRoutes(app, {
  requireAuth,
  requireRole,
  requireHeadAccess,
  getSupabase: supabaseServerClient
});

attachIdentityResolutionAdminRoutes(app, {
  requireAuth,
  requireRole,
  requireHeadAccess,
  getSupabase: supabaseServerClient
});

attachQuoteRoutes(app, {
  requireAuth,
  requireRole,
  requireHeadAccess,
  getSupabase: supabaseServerClient
});

attachQuoteFileRoutes(app, {
  requireAuth,
  getSupabase: supabaseServerClient
});

attachTakeoffWorkspaceRoutes(app, {
  requireAuth,
  getSupabase:  supabaseServerClient,
  headAccess:   headAccessAiTakeoff,
});

attachSlabInventoryRoutes(app, {
  requireAuth,
  requireHeadAccess,
  getSupabase: supabaseServerClient
});

attachInstallDashboardRoutes(app, {
  requireAuth,
  requireHeadAccess,
  getSupabase: supabaseServerClient
});

attachHrWorkforceRoutes(app, {
  requireAuth,
  requireHeadAccess,
  getSupabase: supabaseServerClient
});

attachSlabCloudHourlySyncRoutes(app, {
  getSupabase: supabaseServerClient
});

attachSlabsmithIngestRoutes(app, {
  getSupabase: supabaseServerClient
});

attachSlabsmithImageUploadRoutes(app, {
  getSupabase: supabaseServerClient
});

app.post("/api/auth/log-login", requireAuth(), express.json(), async (req, res) => {
  try {
    await logLoginEvent({ user: req.user, eventType: "launcher_opened", toolSlug: "home", metadata: req.body ?? null, req });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/auth/log-event", requireAuth(), express.json(), async (req, res) => {
  try {
    const requested = String(req.body?.event_type ?? req.body?.eventType ?? "").trim();
    const allowed = new Set(["sign_out", "session_seen", "tool_access_loaded"]);
    const eventType = allowed.has(requested) ? requested : "session_seen";
    const toolSlug = String(req.body?.tool_slug ?? req.body?.toolSlug ?? "").trim() || null;
    await logLoginEvent({
      user: req.user,
      eventType,
      toolSlug,
      metadata: { source: "frontend_event", tool_slug: toolSlug },
      req
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get(
  "/api/brain/sync-runs",
  requireAuth(),
  requireRole(["admin", "executive"]),
  headAccessBrainHealth,
  async (req, res) => {
  try {
    const limit = clamp(toInt(req.query.limit, 10), 1, 100);
    const supabase = supabaseServerClient();
    const { data, error } = await supabase
      .from("brain_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    res.json({ ok: true, syncRuns: rows, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get(
  "/api/brain/failed-jobs",
  requireAuth(),
  requireRole(["admin", "executive"]),
  headAccessBrainHealth,
  async (req, res) => {
  try {
    const limit = clamp(toInt(req.query.limit, 50), 1, 500);
    const supabase = supabaseServerClient();
    const { data, error } = await supabase
      .from("eos_failed_job_syncs")
      .select("*")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    res.json({ ok: true, failedJobs: rows, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/admin/sync/recent", requireAuth(), requireRole(["admin", "executive"]), async (req, res) => {
  try {
    const startedAt = new Date().toISOString();
    const env = {
      SUPABASE_WRITE_ENABLED: "1",
      MORAWARE_SYNC_MODE: "global",
      MORAWARE_SYNC_START_DATE: "2026-01-01",
      MORAWARE_MAX_JOBS_TO_INGEST: "100",
      MORAWARE_MAX_SEARCH_PAGES: "50"
    };
    // TODO: move to worker queue if function timeouts are strict.
    const { pid } = spawnBackgroundNode("backend-core/src/scripts/syncMoraware.js", env);
    await logAction({
      user: req.user,
      head: "brain-health",
      actionType: "trigger_sync_recent",
      entityType: "sync",
      entityId: null,
      jobId: null,
      metadata: { env },
      req
    });
    res.json({ accepted: true, syncType: "recent", startedAt, message: "Sync started", pid });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/admin/sync/retry-failed", requireAuth(), requireRole(["admin", "executive"]), async (req, res) => {
  try {
    const startedAt = new Date().toISOString();
    const env = { SUPABASE_WRITE_ENABLED: "1" };
    // TODO: move to worker queue if function timeouts are strict.
    const { pid } = spawnBackgroundNode("backend-core/src/scripts/retryFailedMorawareJobs.js", env);
    await logAction({
      user: req.user,
      head: "brain-health",
      actionType: "trigger_retry_failed",
      entityType: "sync",
      entityId: null,
      jobId: null,
      metadata: { env },
      req
    });
    res.json({ accepted: true, syncType: "retry-failed", startedAt, message: "Retry started", pid });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/internal/sync/recent", (req, res) => {
  if (!requireCronSecret(req, res)) return;
  const startedAt = new Date().toISOString();
  const env = {
    SUPABASE_WRITE_ENABLED: "1",
    MORAWARE_SYNC_MODE: "global",
    MORAWARE_SYNC_START_DATE: "2026-01-01",
    MORAWARE_MAX_JOBS_TO_INGEST: "100",
    MORAWARE_MAX_SEARCH_PAGES: "50"
  };
  // TODO: move to worker queue if function timeouts are strict.
  const { pid } = spawnBackgroundNode("backend-core/src/scripts/syncMoraware.js", env);
  res.json({ accepted: true, syncType: "recent", startedAt, message: "Sync started", pid });
});

app.post("/api/internal/sync/nightly", (req, res) => {
  if (!requireCronSecret(req, res)) return;
  const startedAt = new Date().toISOString();
  const env = {
    SUPABASE_WRITE_ENABLED: "1",
    MORAWARE_SYNC_MODE: "global",
    MORAWARE_SYNC_START_DATE: "2026-01-01",
    MORAWARE_INGEST_ALL_MATCHING_JOBS: "1",
    MORAWARE_MAX_SEARCH_PAGES: "400"
  };
  // TODO: move to worker queue if function timeouts are strict.
  const { pid } = spawnBackgroundNode("backend-core/src/scripts/syncMoraware.js", env);
  res.json({ accepted: true, syncType: "nightly", startedAt, message: "Sync started", pid });
});

app.post("/api/internal/sync/nightly-operational", (req, res) => {
  if (!requireCronSecret(req, res)) return;
  const startedAt = new Date().toISOString();
  const env = {
    SUPABASE_WRITE_ENABLED: "1",
    MORAWARE_SYNC_MODE: "global",
    MORAWARE_SYNC_START_DATE: "2026-01-01",
    MORAWARE_INGEST_ALL_MATCHING_JOBS: "1",
    MORAWARE_INGEST_OPERATIONAL: "1",
    MORAWARE_MAX_SEARCH_PAGES: "400"
  };
  // TODO: move to worker queue if function timeouts are strict.
  const { pid } = spawnBackgroundNode("backend-core/src/scripts/syncMoraware.js", env);
  res.json({
    accepted: true,
    syncType: "nightly-operational",
    startedAt,
    message: "Sync started",
    pid
  });
});

app.post("/api/internal/sync/retry-failed", (req, res) => {
  if (!requireCronSecret(req, res)) return;
  const startedAt = new Date().toISOString();
  const env = {
    SUPABASE_WRITE_ENABLED: "1"
  };
  // TODO: move to worker queue if function timeouts are strict.
  const { pid } = spawnBackgroundNode("backend-core/src/scripts/retryFailedMorawareJobs.js", env);
  res.json({ accepted: true, syncType: "retry-failed", startedAt, message: "Retry started", pid });
});

app.get("/api/brain/sync-health", async (_req, res) => {
  const allowPublic = String(process.env.EOS_ALLOW_PUBLIC_SYNC_HEALTH ?? "").trim() === "1";
  if (!allowPublic) {
    // Auth gate for production: admin/executive + brain_health head assignment
    const auth = requireAuth();
    const role = requireRole(["admin", "executive"]);
    return auth(_req, res, () =>
      role(_req, res, () => headAccessBrainHealth(_req, res, () => void runSyncHealth(_req, res)))
    );
  }
  return runSyncHealth(_req, res);
});

async function runSyncHealth(_req, res) {
  try {
    const url = String(process.env.SUPABASE_URL ?? "").trim();
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
    if (!url || !key) {
      return res.status(500).json({ ok: false, error: "Supabase env vars missing" });
    }

    const supabase = supabaseServerClient();

    const { data: latestRows, error: latestErr } = await supabase
      .from("brain_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1);
    if (latestErr) throw new Error(latestErr.message);
    const latestSyncRun = latestRows?.[0] ?? null;

    const { data: successRows, error: successErr } = await supabase
      .from("brain_sync_runs")
      .select("*")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1);
    if (successErr) throw new Error(successErr.message);
    const lastSuccessSyncRun = successRows?.[0] ?? null;

    const { data: lockRows, error: lockErr } = await supabase
      .from("eos_sync_locks")
      .select("*")
      .eq("lock_name", "moraware_global_sync")
      .limit(1);
    if (lockErr) throw new Error(lockErr.message);
    const currentLock = lockRows?.[0] ?? null;

    const nowMs = Date.now();
    const lockExpired =
      currentLock?.expires_at != null ? Date.parse(String(currentLock.expires_at)) < nowMs : null;

    const { count: unresolvedFailedJobCount, error: failedErr } = await supabase
      .from("eos_failed_job_syncs")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false);
    if (failedErr) throw new Error(failedErr.message);

    const latestWorksheetSqft =
      latestSyncRun?.worksheet_sqft_total ??
      latestSyncRun?.raw_summary?.worksheetSqFtTotalAcrossBatch ??
      latestSyncRun?.raw_summary?.worksheetSqFtTotal ??
      latestSyncRun?.raw_summary?.worksheetSqFt ??
      null;

    res.json({
      ok: true,
      latestSyncRun,
      lastSuccessSyncRun,
      currentLock,
      lockExpired,
      unresolvedFailedJobCount: unresolvedFailedJobCount ?? 0,
      latestWorksheetSqft,
      latestSyncStatus: latestSyncRun?.status ?? null
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

app.get("/api/brain/summary", async (req, res) => {
  try {
    const year = String(req.query.year ?? "").trim() || "2026";
    const supabase = supabaseServerClient();
    const jobs = await loadJobsForYear(supabase, year);
    const jobCount = jobs.length;
    const formCount = jobs.reduce((sum, j) => sum + (Number(j.form_count ?? 0) || 0), 0);
    const fieldCount = jobs.reduce((sum, j) => sum + (Number(j.field_count ?? 0) || 0), 0);
    const worksheetSqFt = jobs.reduce((sum, j) => sum + (Number(j.worksheet_sqft ?? 0) || 0), 0);
    const salespersonSet = new Set(jobs.map((j) => String(j.salesperson_name ?? "").trim()).filter(Boolean));
    const accountSet = new Set(jobs.map((j) => String(j.account_id ?? "").trim()).filter(Boolean));
    const latestSync = await latestSyncRun(supabase);

    res.json({
      year: Number.parseInt(year, 10),
      jobs: jobCount,
      forms: formCount,
      fields: fieldCount,
      worksheetSqFt,
      salespersonCount: salespersonSet.size,
      accountCount: accountSet.size,
      latestSync
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/brain/jobs", async (req, res) => {
  try {
    const year = String(req.query.year ?? "").trim() || "2026";
    const limit = clamp(toInt(req.query.limit, 50), 1, 500);
    const offset = Math.max(0, toInt(req.query.offset, 0));
    const { start, endExclusive } = yearWindow(year);

    const supabase = supabaseServerClient();
    const { data, error, count } = await supabase
      .from("brain_jobs")
      .select(
        "job_id,job_name,account_name,creation_date,job_status,salesperson_name,worksheet_sqft,form_count,field_count",
        { count: "exact" }
      )
      .gte("creation_date", start)
      .lt("creation_date", endExclusive)
      .order("creation_date", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);

    res.json({ year: Number.parseInt(year, 10), limit, offset, total: count ?? null, rows: data ?? [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/brain/jobs/:jobId", async (req, res) => {
  try {
    const jobId = String(req.params.jobId ?? "").trim();
    if (!jobId) return res.status(400).json({ ok: false, error: "jobId required" });
    const supabase = supabaseServerClient();
    const { job, forms, fields } = await loadJobDetail(supabase, jobId);
    if (!job) return res.status(404).json({ ok: false, error: "job not found" });
    const formsWithFields = groupFieldsUnderForms(forms, fields);
    res.json({ job, forms: formsWithFields });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/brain/sales/by-salesperson", async (req, res) => {
  try {
    const year = String(req.query.year ?? "").trim() || "2026";
    const supabase = supabaseServerClient();
    const jobs = await loadJobsForYear(supabase, year);

    const bySp = new Map();
    for (const j of jobs) {
      const sp = String(j.salesperson_name ?? "").trim() || "(blank)";
      const slot =
        bySp.get(sp) ||
        { salesperson_name: sp, job_count: 0, worksheet_sqft: 0, account_set: new Set() };
      slot.job_count += 1;
      slot.worksheet_sqft += Number(j.worksheet_sqft ?? 0) || 0;
      if (j.account_id) slot.account_set.add(String(j.account_id));
      bySp.set(sp, slot);
    }

    const rows = [...bySp.values()]
      .map((r) => ({
        salesperson_name: r.salesperson_name,
        job_count: r.job_count,
        worksheet_sqft: r.worksheet_sqft,
        account_count: r.account_set.size
      }))
      .sort((a, b) => b.worksheet_sqft - a.worksheet_sqft);

    res.json({ year: Number.parseInt(year, 10), rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/brain/fields/sqft", async (req, res) => {
  try {
    const year = String(req.query.year ?? "").trim() || "2026";
    const supabase = supabaseServerClient();
    const rows = await loadSqFtFieldsForYear(supabase, year);
    res.json({ year: Number.parseInt(year, 10), rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/** Launcher: allowed heads derived from `user_head_access`, profile + role defaults (additive; see docs). */
app.get("/api/me/heads", requireAuth(), async (req, res) => {
  try {
    const supabase = supabaseServerClient();
    const payload = await buildMeHeadsPayload(supabase, req.user);
    await recordThrottledAuthEvent(req, "tool_access_loaded", "home", {
      route: "/api/me/heads",
      head_count: Array.isArray(payload?.heads) ? payload.heads.length : null
    });
    res.json(payload);
  } catch (error) {
    console.error("GET /api/me/heads failed", error);
    res.status(500).json({
      ok: false,
      error: "eliteOS Launcher could not load available heads. Try again or contact an administrator."
    });
  }
});

function shouldStartLocalHttpServer() {
  if (String(process.env.EOS_SERVER_SKIP_LISTEN ?? "").trim() === "1") return false;
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    return pathToFileURL(path.resolve(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

/** Exported for Vercel (`api/index.js`) and tests. Default export lives in `api/index.js` to avoid double Express detection. */
export { app };

if (shouldStartLocalHttpServer()) {
  const port = toInt(process.env.PORT, 3001);
  app.listen(port, () => {
    console.log(`backend-core server listening on http://localhost:${port}`);
    console.log(`Allowed CORS origins: ${JSON.stringify(allowedOrigins)}`);
    console.log("Available routes:");
    console.log("- GET /api/health");
    console.log("- GET /api/debug/cors");
    console.log("- GET /api/auth/roles");
    console.log("- GET /api/me");
    console.log("- GET /api/me/heads");
    console.log("- GET /api/sales/summary");
    console.log("- GET /api/sales/salesperson-performance");
    console.log("- GET /api/sales/account-performance");
    console.log("- GET /api/sales/trend");
    console.log("- GET /api/sales/jobs");
    console.log("- GET /api/sales/filters");
    console.log("- GET /api/sales/dashboard-foundation");
    console.log("- GET /api/sales/performance-intelligence");
    console.log("- GET /api/sales/debug");
    console.log("- GET /api/sales/kpi-v1");
    console.log("- GET /api/sales-dashboard/summary");
    console.log("- GET /api/admin/users  (alias: GET /api/system-admin/users)");
    console.log("- GET /api/admin/sales-account-mapping/schema-health");
    console.log("- GET /api/admin/sales-account-mapping/suggestions");
    console.log("- GET /api/admin/sales-account-mapping/master-accounts");
    console.log("- GET /api/admin/sales-account-mapping/reps-branches");
    console.log("- POST /api/admin/sales-account-mapping/approve");
    console.log("- POST /api/admin/sales-account-mapping/reject");
    console.log("- POST /api/admin/sales-account-mapping/mark-unmapped");
    console.log("- POST /api/admin/sales-account-mapping/assign-house");
    console.log("- GET /api/admin/sales-account-mapping/audit-history");
    console.log("- GET /api/admin/identity-resolution/schema-health");
    console.log("- GET /api/admin/identity-resolution/summary");
    console.log("- POST /api/quote/calculate");
    console.log("- POST /api/quote/submit");
    console.log("- GET/PATCH /api/admin/quote-pricing-structures (+/:id)");
    console.log("- POST /api/admin/quote-pricing-structures");
    console.log("- GET/PATCH /api/admin/quote-pricing-rules (+/:id)");
    console.log("- POST /api/admin/quote-pricing-rules");
    console.log("- GET/PATCH /api/admin/quote-partners (+/:id)");
    console.log("- POST /api/admin/quote-partners");
    console.log("- GET/POST /api/admin/quote-partners/:id/pricing-assignment");
    console.log("- GET /api/admin/quotes");
    console.log("- GET /api/admin/quotes/:id");
    console.log("- GET /api/admin/quote-analytics/summary");
    console.log("- GET /api/admin/reference");
    console.log("- GET /api/admin/user-management/schema-health  (alias: /api/system-admin/...)");
    console.log("- POST /api/admin/users/invite  (alias: POST /api/system-admin/users/invite)");
    console.log("- GET /api/admin/users/:userId  (alias: GET /api/system-admin/users/:userId)");
    console.log("- POST /api/admin/users/:userId/profile  (alias: …/system-admin/…)");
    console.log("- POST /api/admin/users/:userId/head-access  (alias: …/system-admin/…)");
    console.log("- POST /api/admin/users/:userId/dealer-access  (alias: …/system-admin/…)");
    console.log("- POST /api/admin/users/:userId/pricing-group  (alias: …/system-admin/…)");
    console.log("- POST /api/admin/users/:userId/send-password-reset  (alias: …/system-admin/…)");
    console.log("- POST /api/admin/users/:userId/resend-invite  (alias: …/system-admin/…)");
    console.log("- PATCH /api/admin/users/:userId/deactivate  (alias: …/system-admin/…)");
    console.log("- PATCH /api/admin/users/:userId/reactivate  (alias: …/system-admin/…)");
    console.log("- DELETE /api/admin/users/:userId  (alias: …/system-admin/…)");
    console.log("- POST /api/admin/users/:userId/role  (alias: …/system-admin/…)");
    console.log("- POST /api/auth/log-login");
    console.log("- GET /api/brain/sync-runs");
    console.log("- GET /api/brain/failed-jobs");
    console.log("- POST /api/admin/sync/recent");
    console.log("- POST /api/admin/sync/retry-failed");
    console.log("- GET /api/brain/sync-health");
    console.log("- GET /api/brain/sync-plan");
    console.log("- POST /api/internal/moraware-sync/import");
    console.log("- POST /api/internal/moraware-sync/rebuild-prepared-facts");
    console.log("- GET /api/moraware-sync/status");
    console.log("- GET /api/admin/moraware/health (and mirror explorer, data-quality, prepared-facts)");
    console.log("- GET /api/executive/summary");
    console.log("- GET /api/executive/salesperson-performance");
    console.log("- GET /api/executive/account-performance");
    console.log("- GET /api/executive/production-flow");
    console.log("- GET /api/executive/titan-signals");
    console.log("- GET /api/executive/field-trends");
    console.log("- GET /api/executive/monthly-trend");
    console.log("- GET /api/executive/debug");
    console.log("- GET /api/titans/today");
    console.log("- POST /api/internal/sync/recent");
    console.log("- POST /api/internal/sync/nightly");
    console.log("- POST /api/internal/sync/nightly-operational");
    console.log("- POST /api/internal/sync/retry-failed");
    console.log("- POST /api/internal/slabcloud/hourly-sync");
  });
}

