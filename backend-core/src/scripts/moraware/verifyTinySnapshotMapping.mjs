import assert from "node:assert/strict";

import { extractJobProcess, extractJobStatus } from "./generateTinySnapshot.js";

const cases = [
  [{ jobStatus: "In Production" }, "In Production"],
  [{ status_name: "Scheduled" }, "Scheduled"],
  [{ jobInfo: { jobStatus: "Template" } }, "Template"],
  [{ raw: { job: { jobStatus: { name: "Install" } } } }, "Install"],
  [{ raw_payload: { MorawareResponse: { jobQuery: { job: { status: { name: "Complete" } } } } } }, "Complete"]
];

for (const [row, expected] of cases) {
  assert.equal(extractJobStatus(row), expected);
}

const processCases = [
  [{ process_name: "Retail" }, "Retail"],
  [{ processName: "Commercial" }, "Commercial"],
  [{ raw: { job: { process: { name: "Builder" } } } }, "Builder"]
];

for (const [row, expected] of processCases) {
  assert.equal(extractJobProcess(row), expected);
}

console.log("verifyTinySnapshotMapping: OK");
