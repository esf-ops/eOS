/**
 * Account Directory ↔ Moraware identity constants and staff-safe relationship shape.
 * Option B: one Moraware Account ID → at most one AD UUID;
 * one AD UUID → many active Moraware Account IDs.
 * Moraware IDs never attach to account_directory_locations.
 */

import { jobInCurrentMorawareSet } from "../moraware/morawareCurrentPopulation.mjs";
import { extractJobWorksheetCensusSqft } from "../sales/morawareSqftActuals.js";

export const ACCOUNT_DIRECTORY_MORAWARE_SYSTEM = "moraware";

export const INTERNAL_MORAWARE_ACCOUNT_KEYS = Object.freeze([
  "direct",
  "dyersville direct",
  "elite stone fabrication",
  "aceno granite",
  "cambrian granite and stone",
  "cambrian granite stone",
  "retail dyersville"
]);

export function normalizeMorawareAccountKey(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/^(dyersville|lisbon|iowa\s*city)\s*[-–—]\s*/i, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|co|company|corp|corporation)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isInternalMorawareAccountName(name) {
  const key = normalizeMorawareAccountKey(name);
  if (!key) return false;
  if (INTERNAL_MORAWARE_ACCOUNT_KEYS.includes(key)) return true;
  if (key === "direct") return true;
  if (/\belite stone\b/.test(key) && /\bfabrication\b/.test(key)) return true;
  return false;
}

const CANONICAL_MORAWARE_ID_RE = /^\d+$/;

export const MORAWARE_TRUSTED_JOB_YEAR = 2026;
export const MORAWARE_RECENT_JOB_LIMIT = 8;
/** Typed date only — never raw_payload. created_at_source, else install_at_source, else completed_at_source. */
export const MORAWARE_JOB_DATE_RULE = "created_at_source|install_at_source|completed_at_source";

function toYmd(value) {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/**
 * Staff-safe Moraware job date. Does not read raw_payload.
 * @param {{ created_at_source?: string|null, install_at_source?: string|null, completed_at_source?: string|null }} job
 */
export function typedMorawareJobDate(job) {
  if (!job || typeof job !== "object") return null;
  return (
    toYmd(job.created_at_source ?? job.createdAtSource) ||
    toYmd(job.install_at_source ?? job.installAtSource) ||
    toYmd(job.completed_at_source ?? job.completedAtSource)
  );
}

function safeJobRow(job) {
  const date = typedMorawareJobDate(job);
  return {
    source_job_id: String(job?.source_job_id ?? job?.sourceJobId ?? "").trim(),
    source_account_id: String(job?.source_account_id ?? job?.sourceAccountId ?? "").trim(),
    job_name: job?.job_name ?? job?.jobName ?? null,
    job_date: date,
    status_name: job?.status_name ?? job?.statusName ?? null,
    salesperson_name: job?.salesperson_name ?? job?.salespersonName ?? null,
    last_seen_at: job?.last_seen_at ?? job?.lastSeenAt ?? null
  };
}

function roundTrustedSqft(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

export function isAccountMorawareLinked(links) {
  if (!Array.isArray(links) || !links.length) return false;
  return links.some((l) => {
    if (!l || l.isActive === false) return false;
    const system = String(l.externalSystem || l.external_system || "").trim();
    return system === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM;
  });
}

function mapSafeJob(job) {
  return { safe: safeJobRow(job), original: job };
}

/**
 * CURRENT_MORAWARE_JOB_SET rows, deduped by source_job_id (newest last_seen_at wins).
 * Does not year-filter. Never puts raw_payload on the safe row.
 */
export function collectCurrentMorawareJobs(jobs, currentPopulation = null) {
  const mapped = (Array.isArray(jobs) ? jobs : []).map(mapSafeJob).filter((row) => row.safe.source_job_id);
  const inSet = mapped.filter((row) =>
    currentPopulation ? jobInCurrentMorawareSet(row.safe, currentPopulation) : true
  );
  const byJobId = new Map();
  for (const row of inSet) {
    const prev = byJobId.get(row.safe.source_job_id);
    if (!prev || String(row.safe.last_seen_at || "") > String(prev.safe.last_seen_at || "")) {
      byJobId.set(row.safe.source_job_id, row);
    }
  }
  return [...byJobId.values()];
}

/**
 * Calendar-year window using typed job_date. asOfYmd (YYYY-MM-DD) caps inclusive YTD.
 */
export function filterMorawareJobsForCalendarWindow(rows, { year = MORAWARE_TRUSTED_JOB_YEAR, asOfYmd = null } = {}) {
  const yearPrefix = `${year}-`;
  const cap = asOfYmd ? String(asOfYmd).slice(0, 10) : null;
  return (rows || []).filter((row) => {
    const date = row?.safe?.job_date;
    if (!date || !date.startsWith(yearPrefix)) return false;
    if (cap && date > cap) return false;
    return true;
  });
}

export function sumTrustedJobWorksheetSqft(rows) {
  let total = 0;
  for (const row of rows || []) {
    total += extractJobWorksheetCensusSqft(row.original).totalSqft || 0;
  }
  return roundTrustedSqft(total);
}

function unavailableTrustedOps(identity) {
  return {
    ...identity,
    job_count_2026: null,
    sqft_state: "unavailable",
    sqft_2026: null,
    earliest_job_date: null,
    latest_job_date: null,
    recent_jobs: [],
    job_date_rule: MORAWARE_JOB_DATE_RULE
  };
}

/**
 * TRUSTED_NOW Account 360 Moraware operations from exact links + typed Brain jobs.
 * Uses CURRENT_MORAWARE_JOB_SET (last_seen_at >= last full-census start) when
 * currentPopulation is provided. Incremental last_seen mix does not shrink history.
 * SqFt = Job Worksheet Sq.Ft. on the same 2026 current set (raw_payload never returned).
 * jobs == null or jobsState unavailable → never a factual zero.
 */
export function buildTrustedMorawareOperations({
  links,
  jobs = null,
  jobsState = "unavailable",
  year = MORAWARE_TRUSTED_JOB_YEAR,
  recentLimit = MORAWARE_RECENT_JOB_LIMIT,
  currentPopulation = null
} = {}) {
  const identity = buildMorawareRelationship(links, null, { jobsState: "unavailable" });
  if (!identity.linked) return unavailableTrustedOps(identity);
  if (jobsState === "unavailable" || jobs == null) return unavailableTrustedOps(identity);

  const linkedIds = new Set(identity.accounts.map((a) => a.source_account_id));
  const unique = collectCurrentMorawareJobs(
    (Array.isArray(jobs) ? jobs : []).filter((job) =>
      linkedIds.has(String(job?.source_account_id ?? job?.sourceAccountId ?? "").trim())
    ),
    currentPopulation
  );
  const inYear = filterMorawareJobsForCalendarWindow(unique, { year });
  const dates = inYear.map((row) => row.safe.job_date).sort();
  const counts = new Map(identity.accounts.map((a) => [a.source_account_id, 0]));
  let sqftTotal = 0;
  for (const row of inYear) {
    counts.set(row.safe.source_account_id, (counts.get(row.safe.source_account_id) || 0) + 1);
    sqftTotal += extractJobWorksheetCensusSqft(row.original).totalSqft || 0;
  }
  const shaped = buildMorawareRelationship(links, counts, { jobsState: "available" });
  const recent = [...inYear]
    .sort(
      (a, b) =>
        String(b.safe.job_date).localeCompare(String(a.safe.job_date)) ||
        String(b.safe.source_job_id).localeCompare(String(a.safe.source_job_id))
    )
    .slice(0, recentLimit)
    .map((row) => ({
      source_job_id: row.safe.source_job_id,
      job_name: row.safe.job_name,
      job_date: row.safe.job_date,
      status_name: row.safe.status_name,
      salesperson_name: row.safe.salesperson_name
    }));
  return {
    ...shaped,
    job_count_2026: inYear.length,
    total_job_count: inYear.length,
    sqft_state: "available",
    sqft_2026: roundTrustedSqft(sqftTotal),
    earliest_job_date: dates[0] || null,
    latest_job_date: dates[dates.length - 1] || null,
    recent_jobs: recent,
    job_date_rule: MORAWARE_JOB_DATE_RULE
  };
}

/**
 * Resolve the canonical Brain Moraware account for an exact numeric Account ID.
 * SELECT-only. Never returns raw_payload.
 * @returns {Promise<{ sourceAccountId: string, accountName: string }|null>}
 */
export async function loadCanonicalMorawareAccount(supabase, organizationId, sourceAccountId) {
  const id = String(sourceAccountId || "").trim();
  if (!CANONICAL_MORAWARE_ID_RE.test(id) || !supabase || !organizationId) return null;
  const { data, error } = await supabase
    .from("brain_moraware_accounts")
    .select("source_account_id,account_name,last_seen_at")
    .eq("organization_id", organizationId)
    .eq("source_account_id", id)
    .order("last_seen_at", { ascending: false })
    .limit(20);
  if (error || !data?.length) return null;
  const latestDay = String(data[0].last_seen_at || "").slice(0, 10);
  const row =
    data.find((r) => !latestDay || String(r.last_seen_at || "").slice(0, 10) === latestDay) || data[0];
  const source = String(row.source_account_id || "").trim();
  if (!CANONICAL_MORAWARE_ID_RE.test(source)) return null;
  return {
    sourceAccountId: source,
    accountName: String(row.account_name || "").trim()
  };
}

/**
 * Staff-safe Moraware relationship. Never includes raw payloads or QuickBooks ListIDs.
 * Pass jobCountsBySourceId only when counts were loaded successfully.
 * Omit/null counts → jobs_state unavailable and job_count null (never a false zero).
 */
export function buildMorawareRelationship(links, jobCountsBySourceId = null, options = {}) {
  const jobsState =
    options.jobsState || (jobCountsBySourceId == null ? "unavailable" : "available");
  const counts =
    jobCountsBySourceId instanceof Map
      ? jobCountsBySourceId
      : jobCountsBySourceId && typeof jobCountsBySourceId === "object"
        ? new Map(Object.entries(jobCountsBySourceId).map(([k, v]) => [String(k), v]))
        : null;
  const available = jobsState === "available" && counts != null;
  const accounts = [];
  for (const link of links || []) {
    if (!link || link.isActive === false) continue;
    const system = String(link.externalSystem || link.external_system || "").trim();
    if (system !== ACCOUNT_DIRECTORY_MORAWARE_SYSTEM) continue;
    const sourceAccountId = String(link.externalId || link.external_id || "").trim();
    if (!sourceAccountId) continue;
    const raw = available ? counts.get(sourceAccountId) : null;
    const jobCount = available ? Number(raw ?? 0) : null;
    accounts.push({
      source_account_id: sourceAccountId,
      display_name: link.externalDisplayName || link.external_display_name || null,
      job_count: jobCount
    });
  }
  accounts.sort((a, b) => a.source_account_id.localeCompare(b.source_account_id));
  const total = available
    ? accounts.reduce((sum, row) => sum + Number(row.job_count || 0), 0)
    : null;
  return {
    linked: accounts.length > 0,
    accounts,
    total_job_count: total,
    jobs_state: available ? "available" : "unavailable"
  };
}
