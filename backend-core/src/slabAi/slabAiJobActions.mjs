/**
 * AI-safe job context from Brain Moraware prepared facts via Account 360.
 * Never calls Moraware live. Org-wide job search requires sales head — deferred as PARTIAL.
 */
import { resolveAccountDirectoryStore } from "../accountDirectory/accountDirectoryApi.js";
import { getAccountDirectoryRelationship } from "../accountDirectory/accountDirectory360.mjs";
import { requireDomainHead } from "./slabAiPermissionIntersection.mjs";

const DOMAIN_HEAD = "account_directory";

function pickStr(v) {
  return String(v ?? "").trim();
}

function toAiJobSummary(job, accountId, retrievedAt) {
  return {
    jobId: pickStr(job.source_job_id || job.jobId),
    jobName: pickStr(job.job_name || job.jobName) || null,
    status: pickStr(job.status_name || job.status) || null,
    jobDate: job.job_date || job.jobDate || null,
    salesperson: pickStr(job.salesperson_name || job.salesperson) || null,
    accountId: accountId || null,
    retrievedAt,
    sourceSystem: "moraware_prepared",
    sourceUpdatedAt: null,
    authority: "Moraware-derived Brain prepared facts via Account Directory. Not a live vendor call.",
  };
}

/**
 * List recent jobs for a specific account (Account 360 Moraware relationship).
 */
export async function listAccountJobsForAi({ db, getSupabase, user, organizationId, accountId, limit = 10 }) {
  const gate = await requireDomainHead({ db, user, domainHead: DOMAIN_HEAD });
  if (!gate.ok) return gate;
  if (!/^[0-9a-f-]{36}$/i.test(String(accountId || ""))) {
    return { ok: false, status: 400, error: "Invalid account id" };
  }

  const store = resolveAccountDirectoryStore({ getSupabase });
  const retrievedAt = new Date().toISOString();
  try {
    const relationship = await getAccountDirectoryRelationship({
      supabase: getSupabase(),
      store,
      organizationId,
      accountId,
      role: user.role || "viewer",
      embedFinancials: false,
    });
    const recent = relationship?.moraware?.recent_jobs || [];
    const lim = Math.min(20, Math.max(1, Number(limit) || 10));
    const items = recent.slice(0, lim).map((j) => toAiJobSummary(j, accountId, retrievedAt));
    return {
      ok: true,
      items,
      totalMatches: recent.length,
      returned: items.length,
      truncated: recent.length > items.length,
      jobsState: relationship?.moraware?.jobs_state || "unavailable",
      notes: relationship?.jobs?.notes || null,
      retrievedAt,
      sourceSystem: "moraware_prepared",
    };
  } catch (e) {
    return { ok: false, status: e.status || 500, error: String(e.message || e), code: e.code };
  }
}

/**
 * Retrieve one job by Moraware source_job_id within an account context.
 */
export async function retrieveJobForAi({ db, getSupabase, user, organizationId, accountId, jobId }) {
  const listed = await listAccountJobsForAi({
    db,
    getSupabase,
    user,
    organizationId,
    accountId,
    limit: 20,
  });
  if (!listed.ok) return listed;
  const needle = pickStr(jobId);
  const job = (listed.items || []).find((j) => j.jobId === needle);
  if (!job) {
    return {
      ok: false,
      status: 404,
      error: "Job not found in the authorized account Moraware relationship.",
      code: "JOB_NOT_FOUND",
    };
  }
  return { ok: true, job, retrievedAt: listed.retrievedAt };
}

/**
 * Org-wide job search is intentionally unavailable without a dedicated sales prepared-facts AI adapter.
 */
export async function searchJobsForAi() {
  return {
    ok: false,
    status: 501,
    code: "ACTION_UNAVAILABLE",
    error:
      "Org-wide job search is not enabled. Use listAccountJobs with a selected account (Account Directory + Moraware prepared facts).",
  };
}
