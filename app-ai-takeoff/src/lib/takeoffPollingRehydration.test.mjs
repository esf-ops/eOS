/**
 * Polling/rehydration regression contracts.
 *
 * Run: node app-ai-takeoff/src/lib/takeoffPollingRehydration.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isTakeoffJobTerminal,
  resultVersionOf,
  shouldAcceptServerDraft,
  shouldPollTakeoffJob,
  takeoffPollBackoffMs
} from "./takeoffDraftConcurrency.mjs";
import { createJobStatusPoller } from "./takeoffGenerationPoll.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const consolidated = readFileSync(
  join(root, "components/ConsolidatedTakeoffReview.tsx"),
  "utf8"
);
const inbox = readFileSync(join(root, "components/TakeoffRunInbox.tsx"), "utf8");
const plan = readFileSync(join(root, "components/TakeoffPlanFileSection.tsx"), "utf8");
const studio = readFileSync(
  join(
    root,
    "../../app-elite100-estimate-studio/src/estimateQueue/EstimateTakeoffWorkspace.tsx"
  ),
  "utf8"
);

console.log("\ntakeoffPollingRehydration.test.mjs\n");

// Terminal states stop all editable-workspace status polling.
for (const status of ["completed", "failed", "cancelled", "canceled"]) {
  assert.equal(isTakeoffJobTerminal(status), true, `${status} terminal`);
  assert.equal(
    shouldPollTakeoffJob({
      jobStatus: status,
      reviewStatus: "needs_review",
      visibilityState: "visible"
    }),
    false
  );
}
assert.equal(
  shouldPollTakeoffJob({
    jobStatus: "processing",
    reviewStatus: "approved",
    visibilityState: "visible"
  }),
  false
);
console.log("  ✓ terminal/approved jobs stop polling");

// Hidden/background tabs make zero requests.
assert.equal(
  shouldPollTakeoffJob({
    jobStatus: "processing",
    reviewStatus: "needs_review",
    visibilityState: "hidden"
  }),
  false
);
for (const source of [consolidated, inbox, plan, studio]) {
  assert.ok(source.includes('document.visibilityState === "visible"'));
  assert.ok(source.includes("visibilitychange"));
}
console.log("  ✓ hidden tabs pause all audited polling sources");

// Shared generation poller also makes no request while hidden and wakes once visible.
{
  let visible = false;
  let calls = 0;
  const poller = createJobStatusPoller({
    isVisible: () => visible,
    poll: async () => {
      calls += 1;
      return "completed";
    }
  });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls, 0, "hidden generation poll makes no request");
  visible = true;
  poller.wake();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls, 1, "visible wake performs one request");
  poller.stop();
}
console.log("  ✓ shared generation poller pauses hidden and wakes visible");

// Job poller does not overlap.
{
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const poller = createJobStatusPoller({
    poll: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      calls += 1;
      await new Promise((r) => setTimeout(r, 8));
      active -= 1;
      return calls >= 2 ? "completed" : "continue";
    }
  });
  await new Promise((r) => setTimeout(r, 30));
  poller.stop();
  assert.equal(maxActive, 1);
}
assert.ok(consolidated.includes("if (stopped || inFlight) return"));
assert.ok(inbox.includes("loadInFlightRef.current"));
assert.ok(studio.includes("if (cancelled || inFlight"));
console.log("  ✓ one in-flight request maximum per polling source");

// Corrections is write-only from this review: never continuously GET/read.
assert.ok(!consolidated.includes('labApiGet(\n      `/api/takeoff-jobs/${encodeURIComponent(jobId)}/corrections'));
assert.ok(!/setInterval[\s\S]{0,500}corrections/.test(consolidated));
assert.ok(!/setTimeout[\s\S]{0,500}corrections/.test(consolidated));
console.log("  ✓ corrections endpoint is not continuously reread");

// Full draft hydration rejects stale poll/save data.
assert.equal(
  shouldAcceptServerDraft({
    requestMutationRevision: 2,
    currentMutationRevision: 3,
    requestSequence: 4,
    latestAppliedSequence: 3,
    serverSavedAt: "2026-07-21T15:00:00.000Z",
    latestLocalSaveAt: null
  }),
  false
);
assert.equal(
  shouldAcceptServerDraft({
    requestMutationRevision: 3,
    currentMutationRevision: 3,
    requestSequence: 4,
    latestAppliedSequence: 5,
    serverSavedAt: "2026-07-21T15:00:00.000Z",
    latestLocalSaveAt: null
  }),
  false
);
assert.equal(
  shouldAcceptServerDraft({
    requestMutationRevision: 3,
    currentMutationRevision: 3,
    requestSequence: 5,
    latestAppliedSequence: 4,
    serverSavedAt: "2026-07-21T14:59:59.000Z",
    latestLocalSaveAt: "2026-07-21T15:00:00.000Z"
  }),
  false
);
console.log("  ✓ stale polling and older server revisions are ignored");

// Full latest result is fetched only after a result-version change.
assert.equal(
  resultVersionOf({ latestResult: { id: "r1", createdAt: "2026-07-21T15:00:00Z" } }),
  "r1@2026-07-21T15:00:00Z"
);
assert.ok(consolidated.includes("nextVersion !== lastServerResultVersionRef.current"));
assert.ok(consolidated.includes("Poll job STATUS only"));
assert.ok(!consolidated.includes("window.setInterval(tick, 20_000)"));
console.log("  ✓ full result fetch is version-gated, not interval-driven");

// Successful saves do not immediately reread latest.
const saveSection = consolidated.slice(
  consolidated.indexOf("const persistDraft ="),
  consolidated.indexOf("const scheduleSave")
);
assert.ok(!saveSection.includes("loadWorkspace("));
assert.ok(!saveSection.includes("results/latest"));
console.log("  ✓ successful local save does not immediately reread");

// Abort on unmount/navigation.
for (const source of [consolidated, inbox, plan, studio]) {
  assert.ok(source.includes(".abort()"), "poll source aborts requests");
}
console.log("  ✓ stale requests abort on navigation/unmount");

// Errors back off and request frequency is bounded.
assert.deepEqual(
  [0, 1, 2, 3, 9].map(takeoffPollBackoffMs),
  [5_000, 10_000, 20_000, 40_000, 60_000]
);
assert.ok(consolidated.includes("schedule(10_000)"), "active consolidated poll <= 6/min");
assert.ok(inbox.includes("schedule(10_000)"), "active inbox poll <= 6/min");
assert.ok(studio.includes("schedule(20_000)"), "Studio fallback poll <= 3/min");
console.log("  ✓ error backoff + bounded request frequency");

// Before/after static frequency contract:
// BEFORE: consolidated GET job + GET latest every 20s forever = 6 requests/min,
// plus Studio fallback 3/min and generation 30/min initially.
// AFTER: consolidated status only while processing = 6/min, latest 0/min steady
// (one version-change fetch), Studio 3/min only non-terminal, generation retains
// smart 2s→4.5s processing-only schedule; hidden/terminal steady state = 0/min.
assert.equal(
  shouldPollTakeoffJob({
    jobStatus: "completed",
    reviewStatus: "needs_review",
    visibilityState: "visible"
  }),
  false,
  "steady terminal frequency is zero"
);
console.log("  ✓ before/after request-frequency contract documented and bounded");

console.log("\ntakeoffPollingRehydration.test.mjs — passed\n");
