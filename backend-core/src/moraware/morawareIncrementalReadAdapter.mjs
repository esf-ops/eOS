/**
 * Read-only Moraware source adapter for hybrid incremental dry-run.
 *
 * Reuses canonical clients only:
 *   A) list: collectCompleteIncrementalJobList
 *      → buildJobQueryByProcessInnerXml + sendMorawareCommand
 *      (complete process-paged jobQuery — NOT the sample helper)
 *   B) exact job: MorawareClient.getJobHeader
 *   C) forms: fetchJobFormsAllFields (SDK all-fields jobFormQuery)
 *   D) activities: fetchJobOperationalAll + normalizeJobOperational
 *
 * NO Supabase writes. NO Moraware writes. NO cursor writes. NO View222.
 * NO mutation helpers exported.
 */

import {
  MorawareClient,
  fetchJobFormsAllFields,
  fetchJobOperationalAll
} from "../../../src/morawareClient.js";
import {
  collectCompleteIncrementalJobList,
  collectGlobalSyncStyleJobListSample,
  getText,
  MORAWARE_COMPLETE_LIST_DISCOVERY,
  MORAWARE_CREATION_DISCOVERY_INCOMPLETE
} from "../../../src/morawareDiscovery.js";
import { normalizeJobOperational } from "../../../src/morawareOperational.js";

/** Hard dry-run safety cap before exact refresh. Not bypassable in this phase. */
export const MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP = 100;

const MUTATION_API_NAMES = Object.freeze([
  "write",
  "upsert",
  "insert",
  "update",
  "delete",
  "importBrain",
  "saveCursor",
  "advanceCursor",
  "acquireLock",
  "releaseLock",
  "populateWorksheet",
  "rebuildPrepared"
]);

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function jobIdFromListNode(j) {
  return pickStr(j?._attributes?.id ?? j?.id ?? j?.source_job_id ?? j?.jobId);
}

function creationDateFromListNode(j) {
  const raw = j?.creationDate ?? j?.creation_date ?? null;
  if (raw == null) return "";
  if (typeof raw === "string" || typeof raw === "number") return String(raw).trim();
  return pickStr(getText(raw));
}

/**
 * Normalize raw process-paged list nodes into incremental discovery rows.
 */
export function normalizeMorawareListRowsForIncremental(rawJobs = []) {
  const out = [];
  for (const j of Array.isArray(rawJobs) ? rawJobs : []) {
    const id = jobIdFromListNode(j);
    if (!id) continue;
    out.push({
      id,
      source_job_id: id,
      creationDate: creationDateFromListNode(j),
      name: pickStr(getText(j?.name) || j?.name),
      status: pickStr(getText(j?.jobStatus) || j?.jobStatus),
      account_name: pickStr(getText(j?.account?.name) || j?.account_name),
      salesperson_name: pickStr(getText(j?.salesperson?.name) || j?.salesperson_name)
    });
  }
  return out;
}

/**
 * Create a MorawareClient from env (canonical constructor).
 * Inject `clientFactory` in tests — never contacts network when injected.
 */
export function createMorawareIncrementalReadClient({ clientFactory = null } = {}) {
  if (typeof clientFactory === "function") return clientFactory();
  return new MorawareClient();
}

/**
 * Run with MORAWARE_DISCOVERY_QUIET_LOGS=1 so MorawareClient does not dump
 * FULL SERVER RESPONSE / credentials-adjacent XML to stdout.
 */
export async function withIncrementalMorawareQuietLogs(fn) {
  const prev = process.env.MORAWARE_DISCOVERY_QUIET_LOGS;
  process.env.MORAWARE_DISCOVERY_QUIET_LOGS = "1";
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.MORAWARE_DISCOVERY_QUIET_LOGS;
    else process.env.MORAWARE_DISCOVERY_QUIET_LOGS = prev;
  }
}

/**
 * A) Complete process-paged job list discovery (canonical Foundation pagination).
 *
 * Clears MORAWARE_SYNC_* date filters for the duration so the incremental
 * creation-window filter owns candidate selection.
 *
 * Does NOT use collectGlobalSyncStyleJobListSample (capped sample helper).
 * Incomplete pagination ⇒ CREATION_DISCOVERY_INCOMPLETE (fail-closed).
 */
export async function listCandidateRowsViaCanonicalProcessPagedQuery({
  client,
  listImpl = null,
  creationWindowStartMs = null,
  creationWindowEndMs = null,
  safetyMaxPagesPerProcess = null,
  safetyMaxRowsScanned = null,
  processIds = null,
  fetchPage = null
} = {}) {
  if (!client && typeof listImpl !== "function" && typeof fetchPage !== "function") {
    throw new Error("listCandidateRowsViaCanonicalProcessPagedQuery: client, listImpl, or fetchPage required");
  }

  const saved = {
    MORAWARE_SYNC_START_DATE: process.env.MORAWARE_SYNC_START_DATE,
    MORAWARE_SYNC_END_DATE: process.env.MORAWARE_SYNC_END_DATE,
    MORAWARE_SYNC_YEAR: process.env.MORAWARE_SYNC_YEAR
  };

  return withIncrementalMorawareQuietLogs(async () => {
    try {
      delete process.env.MORAWARE_SYNC_START_DATE;
      delete process.env.MORAWARE_SYNC_END_DATE;
      delete process.env.MORAWARE_SYNC_YEAR;

      const complete =
        typeof listImpl === "function"
          ? await listImpl({
              client,
              creationWindowStartMs,
              creationWindowEndMs,
              safetyMaxPagesPerProcess,
              safetyMaxRowsScanned,
              processIds,
              fetchPage
            })
          : await collectCompleteIncrementalJobList(client, {
              quiet: true,
              skipProbeArtifacts: true,
              creationWindowStartMs,
              creationWindowEndMs,
              safetyMaxPagesPerProcess: safetyMaxPagesPerProcess ?? undefined,
              safetyMaxRowsScanned: safetyMaxRowsScanned ?? undefined,
              processIds,
              fetchPage: fetchPage || undefined
            });

      // Guard: sample helper shape must never be treated as complete discovery
      if (complete?.diagnostics?.sample_helper_used === true) {
        return {
          ok: false,
          status: MORAWARE_CREATION_DISCOVERY_INCOMPLETE,
          list_rows: [],
          pagination_complete: false,
          termination_reason: "sample_helper_rejected",
          diagnostics: complete.diagnostics,
          canonical_path: "rejected:collectGlobalSyncStyleJobListSample",
          view222_used: false,
          exact_fetch_allowed: false
        };
      }

      const paginationComplete = complete?.pagination_complete === true && complete?.ok === true;
      const status = paginationComplete
        ? MORAWARE_COMPLETE_LIST_DISCOVERY
        : complete?.status || MORAWARE_CREATION_DISCOVERY_INCOMPLETE;

      const listRows = paginationComplete
        ? complete.list_rows || complete.candidate_rows || []
        : [];

      return {
        ok: paginationComplete,
        status,
        list_rows: listRows,
        pagination_complete: paginationComplete,
        termination_reason: complete?.termination_reason || null,
        diagnostics: {
          ...(complete?.diagnostics || {}),
          pages_fetched: complete?.diagnostics?.pages_fetched ?? null,
          rows_scanned: complete?.diagnostics?.rows_scanned ?? null,
          rows_in_creation_window: complete?.diagnostics?.rows_in_creation_window ?? null,
          duplicate_source_ids: complete?.diagnostics?.duplicate_source_ids ?? null,
          pagination_complete: paginationComplete,
          termination_reason: complete?.termination_reason || null,
          sample_helper_used: false
        },
        pagesLog: complete?.pagesLog || [],
        canonical_path:
          complete?.diagnostics?.canonical_path ||
          "collectCompleteIncrementalJobList → buildJobQueryByProcessInnerXml + sendMorawareCommand",
        view222_used: false,
        exact_fetch_allowed: paginationComplete,
        /** Present only for diagnostics when incomplete — never authoritative candidates. */
        partial_candidate_rows_non_authoritative: paginationComplete
          ? null
          : complete?.partial_candidate_rows_non_authoritative || null
      };
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
}

/**
 * Explicit proof that the sample helper is not the incremental authority.
 * Tests may call this; production discovery must not.
 */
export function assertSampleHelperIsNotIncrementalAuthority() {
  return {
    sample_helper: "collectGlobalSyncStyleJobListSample",
    incremental_authority: "collectCompleteIncrementalJobList",
    sample_is_authority: false,
    note: "Sample helper defaults (maxPages=50 × pageSize=100) produced the live-read 5000-row ceiling."
  };
}

/** Re-export sample name only so tests can prove it is not wired as authority. */
export { collectGlobalSyncStyleJobListSample };

/**
 * Decide forms completeness from canonical SDK fetch outcome ONLY.
 *
 * Successful fetchJobFormsAllFields (assertNoBlockingMorawareErrors + normalize)
 * is the proven bulk-by-job-id forms query — that is the only case we mark
 * forms_authoritative_complete. Returning some forms after a partial/failed
 * path does NOT prove completeness.
 */
export function formsCompletenessFromSdkFetch({ formsFetchOk, formsArray }) {
  if (formsFetchOk !== true) {
    return {
      forms_authoritative_complete: false,
      forms_completeness: {
        proven: false,
        source: null,
        reason: "sdk_fetchJobFormsAllFields_not_successful"
      },
      forms: Array.isArray(formsArray) ? formsArray : []
    };
  }
  return {
    forms_authoritative_complete: true,
    forms_completeness: {
      proven: true,
      source: "sdk_fetchJobFormsAllFields",
      note: "Canonical SDK all-fields jobFormQuery completed without blocking Moraware errors."
    },
    forms: Array.isArray(formsArray) ? formsArray : []
  };
}

function headerFields(jobNode) {
  if (!jobNode || typeof jobNode !== "object") return {};
  return {
    name: pickStr(getText(jobNode?.name) || jobNode?.name),
    status_name: pickStr(getText(jobNode?.jobStatus) || jobNode?.jobStatus),
    created_at_source: pickStr(getText(jobNode?.creationDate) || jobNode?.creationDate) || null,
    account_name: pickStr(getText(jobNode?.account?.name)),
    source_account_id: pickStr(jobNode?.account?._attributes?.id || jobNode?.account?.id) || null,
    salesperson_name: pickStr(getText(jobNode?.salesperson?.name)),
    notes: pickStr(getText(jobNode?.notes))
  };
}

/**
 * B+C+D) Exact job + forms + activities via canonical reads.
 *
 * @returns brain/worksheet-shaped job object for planners (no writes).
 */
export async function fetchExactJobViaCanonicalReads({
  client,
  sourceJobId,
  fetchHeader = null,
  fetchForms = null,
  fetchOperational = null
} = {}) {
  const jobId = pickStr(sourceJobId);
  if (!jobId) {
    return { ok: false, status: "missing_source_job_id", job: null };
  }
  if (!client && !(fetchHeader && fetchForms && fetchOperational)) {
    return { ok: false, status: "client_required", job: null };
  }

  return withIncrementalMorawareQuietLogs(async () => {
    let headerNode = null;
    let headerOk = false;
    try {
      const headerRes =
        typeof fetchHeader === "function"
          ? await fetchHeader({ jobId })
          : await client.getJobHeader({ jobId });
      headerNode = headerRes?.job ?? headerRes ?? null;
      headerOk = Boolean(headerNode);
    } catch (e) {
      return {
        ok: false,
        status: "exact_header_failed",
        error: String(e?.message || e),
        job: null,
        source_job_id: jobId
      };
    }

    let forms = [];
    let formsFetchOk = false;
    let formsError = null;
    try {
      const formsRes =
        typeof fetchForms === "function"
          ? await fetchForms(client, jobId)
          : await fetchJobFormsAllFields(client, jobId);
      forms = Array.isArray(formsRes?.forms) ? formsRes.forms : [];
      formsFetchOk = true;
    } catch (e) {
      formsError = String(e?.message || e);
      formsFetchOk = false;
      forms = [];
    }

    let activities = [];
    let activitiesOk = false;
    let activitiesError = null;
    try {
      const opRes =
        typeof fetchOperational === "function"
          ? await fetchOperational(client, jobId)
          : await fetchJobOperationalAll(client, jobId);
      const operational = normalizeJobOperational(jobId, opRes?.parsed ?? opRes);
      activities = Array.isArray(operational?.activities) ? operational.activities : [];
      activitiesOk = true;
    } catch (e) {
      activitiesError = String(e?.message || e);
      activitiesOk = false;
      activities = [];
    }

    const completeness = formsCompletenessFromSdkFetch({ formsFetchOk, formsArray: forms });
    const header = headerFields(headerNode);

    const job = {
      source_job_id: jobId,
      source_account_id: header.source_account_id,
      account_name: header.account_name,
      status_name: header.status_name,
      salesperson_name: header.salesperson_name,
      created_at_source: header.created_at_source,
      name: header.name,
      forms_authoritative_complete: completeness.forms_authoritative_complete,
      forms_completeness: completeness.forms_completeness,
      raw_payload: {
        forms_authoritative_complete: completeness.forms_authoritative_complete,
        forms_completeness: completeness.forms_completeness,
        forms: completeness.forms,
        activities,
        jobInfo: {
          id: jobId,
          name: header.name,
          creationDate: header.created_at_source,
          jobStatus: header.status_name
        },
        header_ok: headerOk,
        activities_ok: activitiesOk,
        forms_error: formsError,
        activities_error: activitiesError
      }
    };

    return {
      ok: headerOk,
      status: headerOk ? "fetched" : "header_missing",
      source_job_id: jobId,
      job,
      forms_count: completeness.forms.length,
      activities_count: activities.length,
      forms_authoritative_complete: completeness.forms_authoritative_complete,
      forms_fetch_ok: formsFetchOk,
      activities_ok: activitiesOk,
      canonical_paths: {
        job: "MorawareClient.getJobHeader",
        forms: "fetchJobFormsAllFields",
        activities: "fetchJobOperationalAll + normalizeJobOperational"
      },
      view222_used: false
    };
  });
}

/**
 * Exact-fetch many candidates (bounded). Caller must enforce candidate cap first.
 */
export async function fetchExactJobsViaCanonicalReads({
  client,
  sourceJobIds = [],
  fetchExactJob = fetchExactJobViaCanonicalReads
} = {}) {
  const jobs = [];
  const failures = [];
  let formsFetched = 0;
  let activitiesFetched = 0;
  let completeForms = 0;
  let incompleteForms = 0;

  for (const id of sourceJobIds || []) {
    const res = await fetchExactJob({ client, sourceJobId: id });
    if (!res?.ok || !res.job) {
      failures.push({ source_job_id: pickStr(id), status: res?.status || "fetch_failed", error: res?.error || null });
      continue;
    }
    jobs.push(res.job);
    formsFetched += Number(res.forms_count) || 0;
    activitiesFetched += Number(res.activities_count) || 0;
    if (res.forms_authoritative_complete) completeForms += 1;
    else incompleteForms += 1;
  }

  return {
    ok: failures.length === 0,
    status: failures.length ? "partial_or_failed" : "fetched",
    jobs,
    failures,
    exact_jobs_fetched: jobs.length,
    forms_fetched: formsFetched,
    activities_fetched: activitiesFetched,
    jobs_with_complete_authoritative_forms: completeForms,
    jobs_with_incomplete_forms: incompleteForms,
    view222_used: false
  };
}

/**
 * Static proof: this module does not export mutation APIs.
 */
export function listIncrementalReadAdapterExports() {
  return {
    mutation_api_names_forbidden: [...MUTATION_API_NAMES],
    exported_read_functions: [
      "createMorawareIncrementalReadClient",
      "listCandidateRowsViaCanonicalProcessPagedQuery",
      "fetchExactJobViaCanonicalReads",
      "fetchExactJobsViaCanonicalReads",
      "normalizeMorawareListRowsForIncremental",
      "formsCompletenessFromSdkFetch",
      "withIncrementalMorawareQuietLogs",
      "assertSampleHelperIsNotIncrementalAuthority",
      "listIncrementalReadAdapterExports",
      "MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP"
    ],
    moraware_writeback: false,
    view222: false,
    list_authority: "collectCompleteIncrementalJobList",
    sample_helper_not_authority: "collectGlobalSyncStyleJobListSample"
  };
}

export {
  MORAWARE_COMPLETE_LIST_DISCOVERY,
  MORAWARE_CREATION_DISCOVERY_INCOMPLETE
};
