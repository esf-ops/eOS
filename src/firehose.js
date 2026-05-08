/**
 * Phase 1: Ingestion (Firehose)
 * Build a single in-memory payload with Jobs, JobActivities, and JobForms.
 *
 * The goal is completeness and debuggability, so this module preserves the raw Moraware objects
 * (including Make.com-style `_attributes`) rather than pre-flattening.
 *
 * Per-job worksheet aggregation (Sq.Ft. across forms) runs in `src/index.js` after this step.
 */

function normalizedJobStatusLower(job) {
  const js = job?.jobStatus;
  if (typeof js === "string") return js.trim().toLowerCase();
  if (js && typeof js === "object") {
    const t = js._text ?? js.name ?? js.value;
    if (t != null) return String(t).trim().toLowerCase();
  }
  const attr = job?._attributes?.jobStatus;
  if (attr != null) return String(attr).trim().toLowerCase();
  return "";
}

function morawareDiscoveryEnvActive() {
  const v = String(process.env.MORAWARE_DISCOVERY ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function ingestFirehose({ client }) {
  if (morawareDiscoveryEnvActive()) {
    throw new Error(
      "ingestFirehose must not run while MORAWARE_DISCOVERY is enabled. Discovery V2 should exit from src/index.js first."
    );
  }
  const excludeDeleted =
    (process.env.MORAWARE_EXCLUDE_DELETED || "true").toLowerCase().trim() === "true";

  let globalResult = await client.listAllJobs({ includeCreationDate: true });
  let jobs = Array.isArray(globalResult?.jobs) ? globalResult.jobs : [];

  if (!jobs || jobs.length === 0) {
    console.warn('Warning: No jobs found in Moraware. Falling back to AccountID="668".');
    const list = await client.listAccountJobs({ accountId: "668", includeCreationDate: true });
    jobs = Array.isArray(list) ? list : [];
    globalResult = { jobs, rawXml: null, jobQuery: null };
  }

  const liveJobs = excludeDeleted
    ? jobs.filter((j) => {
        const s = normalizedJobStatusLower(j);
        return s !== "deleted" && !s.includes("deleted");
      })
    : jobs;

  return {
    source: "Moraware",
    ingestedAt: new Date().toISOString(),
    jobs: liveJobs,
    jobQuery: globalResult?.jobQuery ?? null
  };
}
