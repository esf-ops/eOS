import assert from "node:assert/strict";
import { mapAiGenerateError, mapGenerationFinishError, isGenerateInFlight } from "./takeoffGenerateErrors.mjs";

class LabApiError extends Error {
  constructor(message, status, body, headers = {}) {
    super(message);
    this.name = "LabApiError";
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}

{
  const view = mapAiGenerateError(
    new LabApiError("Failed to fetch", 504, null, { "x-vercel-error": "FUNCTION_INVOCATION_TIMEOUT" }),
    {
      endpoint: "/api/takeoff-jobs/x/generate-ai-draft",
      jobId: "job-1",
      provider: "gemini",
      model: "gemini-2.5-pro",
    }
  );
  assert.equal(view.title, "AI takeoff could not start");
  assert.match(view.body, /Try again/);
  assert.equal(view.canRetry, true);
  assert.equal(view.advanced.httpStatus, "504");
  assert.equal(view.advanced["X-Vercel-Error"], "FUNCTION_INVOCATION_TIMEOUT");
  assert.equal(view.advanced.provider, "gemini");
  assert.equal(view.advanced.jobId, "job-1");
  console.log("ok: mapAiGenerateError 504 FUNCTION_INVOCATION_TIMEOUT");
}

{
  const view = mapAiGenerateError(new TypeError("Failed to fetch"), {
    endpoint: "/api/takeoff-jobs/x/generate-ai-draft",
    jobId: "job-2",
  });
  assert.equal(view.title, "AI takeoff could not start");
  assert.equal(view.canRetry, true);
  console.log("ok: mapAiGenerateError network TypeError");
}

{
  assert.equal(isGenerateInFlight("generating"), true);
  assert.equal(isGenerateInFlight("polling"), true);
  assert.equal(isGenerateInFlight("idle"), false);
  assert.equal(isGenerateInFlight("error"), false);
  console.log("ok: isGenerateInFlight");
}

{
  const view = mapGenerationFinishError(new Error("provider timeout"), {
    endpoint: "/api/takeoff-jobs/x/generate-ai-draft",
    jobId: "job-1",
    phase: "extraction",
    provider: "gemini",
    model: "gemini-2.5-pro",
  });
  assert.equal(view.title, "AI takeoff could not finish");
  assert.match(view.body, /plan stayed saved/i);
  assert.equal(view.advanced.phase, "extraction");
  console.log("ok: mapGenerationFinishError");
}

console.log("takeoffGenerateErrors.test.mjs: all passed");
