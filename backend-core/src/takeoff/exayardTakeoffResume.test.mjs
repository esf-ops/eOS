/**
 * exayardTakeoffResume — resume/check flow tests.
 *
 * Run: npm run eos:test:takeoff-exayard-resume
 */
import assert from "node:assert/strict";
import { resumeExayardTakeoff, handleExayardWaitingState } from "./exayardTakeoffResume.mjs";

console.log("\nexayardTakeoffResume — resume flow tests\n");

const JOB_ID  = "11111111-1111-4111-8111-111111111111";
const ORG_ID  = "22222222-2222-4222-8222-222222222222";
const FILE_ID = "33333333-3333-4333-8333-333333333333";

function makeQuery(rows, onUpdate) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    limit: () => builder,
    insert: () => ({
      select: () => Promise.resolve({ data: [{ id: "result-row-1" }], error: null }),
    }),
    update: (fields) => {
      if (onUpdate) onUpdate(fields);
      return {
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    },
    then(resolve, reject) {
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
  };
  return builder;
}

function makeSupabase({ job, file, onJobUpdate }) {
  return {
    from(table) {
      if (table === "quote_takeoff_jobs") return makeQuery([job], onJobUpdate);
      if (table === "quote_files") return makeQuery([file]);
      if (table === "quote_takeoff_results") return makeQuery([]);
      return makeQuery([]);
    },
  };
}

function assessmentFetchMock(state) {
  return async (url) => {
    if (!String(url).includes("/assessments/asmt_1")) {
      throw new Error(`unexpected url ${url}`);
    }
    if (state === "rate_limited") {
      return {
        ok: false,
        status: 429,
        text: async () => JSON.stringify({
          type: "x", title: "Too Many Requests", status: 429, detail: "Rate limit exceeded",
          code: "rate_limited", retry_after: 90, request_id: "req_resume_rl",
        }),
        headers: { get: (n) => (String(n) === "Retry-After" ? "90" : "application/problem+json") },
      };
    }
    if (state === "processing") {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ _id: "asmt_1", status: "running" }),
        headers: { get: () => "application/json" },
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ _id: "asmt_1", status: "completed", elements: [{ q: 1 }] }),
      headers: { get: () => "application/json" },
    };
  };
}

const baseJob = {
  id: JOB_ID,
  organization_id: ORG_ID,
  quote_file_id: FILE_ID,
  status: "processing",
  metadata: {
    exayard: {
      projectId: "proj_1",
      fileId: "file_1",
      assessmentId: "asmt_1",
      status: "waiting_on_exayard",
    },
  },
  result_summary: {},
};

const baseFile = {
  id: FILE_ID,
  original_filename: "kitchen.pdf",
  mime_type: "application/pdf",
  storage_bucket: "quote-files",
};

process.env.EXAYARD_API_KEY = "ey-resume-test-key";
process.env.EXAYARD_ORGANIZATION_ID = "org_test_123";
process.env.EXAYARD_API_BASE_URL = "https://api.exayard.com/v1";

// R1 — handleExayardWaitingState stores safe metadata
{
  let updated = null;
  const supabase = makeSupabase({
    job: { ...baseJob },
    file: baseFile,
    onJobUpdate: (f) => { updated = f; },
  });

  const res = await handleExayardWaitingState({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID,
    job: baseJob,
    file: baseFile,
    providerOutput: {
      exayardWorkflow: {
        provider: "exayard",
        status: "waiting_on_exayard",
        pausedStep: "poll_assessment",
        projectId: "proj_1",
        fileId: "file_1",
        assessmentId: "asmt_1",
        retryAfterSeconds: 120,
        retryAfterAt: "2030-01-01T00:02:00.000Z",
        exayardCode: "rate_limited",
        exayardRequestId: "req_abc",
      },
    },
  });

  assert.equal(res.exayardStatus, "waiting_on_exayard");
  assert.equal(res.retryAfterAt, "2030-01-01T00:02:00.000Z");
  assert.equal(res.exayardRequestId, "req_abc");
  assert.equal(updated.status, "processing");
  assert.equal(updated.metadata.exayard.assessmentId, "asmt_1");
  assert.ok(!JSON.stringify(res).includes("ey-resume-test-key"));
  console.log("ok R1: waiting state stores safe metadata");
}

// R2 — resume uses stored assessmentId — still processing
{
  const supabase = makeSupabase({ job: { ...baseJob }, file: baseFile });
  const res = await resumeExayardTakeoff({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID,
    fetchFn: assessmentFetchMock("processing"),
  });
  assert.equal(res.exayardStatus, "waiting_on_exayard");
  assert.equal(res.canResumeExayard, true);
  assert.ok(!JSON.stringify(res).includes("ey-resume-test-key"));
  console.log("ok R2: resume still processing → waiting response");
}

// R3 — resume complete → raw capture
{
  const supabase = makeSupabase({ job: { ...baseJob }, file: baseFile });
  const res = await resumeExayardTakeoff({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID,
    fetchFn: assessmentFetchMock("completed"),
  });
  assert.equal(res.exayardStatus, "completed");
  assert.equal(res.exayardRawCaptured, true);
  assert.ok(res.normalizedTakeoffJson);
  console.log("ok R3: resume complete stores raw result");
}

// R4 — resume rate limited again → updates retryAfterAt
{
  let updated = null;
  const supabase = makeSupabase({
    job: { ...baseJob },
    file: baseFile,
    onJobUpdate: (f) => { updated = f; },
  });
  const res = await resumeExayardTakeoff({
    supabase,
    organizationId: ORG_ID,
    takeoffJobId: JOB_ID,
    fetchFn: assessmentFetchMock("rate_limited"),
  });
  assert.equal(res.exayardStatus, "waiting_on_exayard");
  assert.equal(res.exayardCode, "rate_limited");
  assert.equal(res.retryAfterSeconds, 90);
  assert.ok(res.retryAfterAt);
  assert.equal(res.exayardRequestId, "req_resume_rl");
  assert.equal(updated.metadata.exayard.retryAfterSeconds, 90);
  console.log("ok R4: repeat rate limit updates retryAfterAt");
}

console.log("\nexayardTakeoffResume: all 4 tests passed");
