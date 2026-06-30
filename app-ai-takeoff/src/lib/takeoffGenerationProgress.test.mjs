import assert from "node:assert/strict";
import {
  deriveGenerationProgress,
  longRunningGenerationHint,
  normalizeGenerationPhase,
  generationElapsedMs,
} from "./takeoffGenerationProgress.mjs";
import { pollIntervalMs, createJobStatusPoller } from "./takeoffGenerationPoll.mjs";

{
  const p = deriveGenerationProgress({ phase: "page_inventory", phaseLabel: "Classifying plan pages" }, "processing");
  assert.equal(p.state, "determinate");
  assert.equal(p.percent, 25);
  assert.equal(p.stepIndex, 2);
  assert.equal(p.stepTotal, 6);
  assert.match(p.label, /Reading plan pages|Classifying plan pages/);
  console.log("ok: deriveGenerationProgress page_inventory");
}

{
  const p = deriveGenerationProgress(null, "processing");
  assert.equal(p.state, "indeterminate");
  assert.equal(p.indeterminate, true);
  assert.equal(p.label, "Starting AI takeoff…");
  console.log("ok: deriveGenerationProgress missing phase");
}

{
  const p = deriveGenerationProgress({ phase: "done" }, "completed");
  assert.equal(p.state, "complete");
  assert.equal(p.percent, 100);
  assert.equal(p.label, "Ready for review");
  console.log("ok: deriveGenerationProgress completed");
}

{
  const p = deriveGenerationProgress({ phase: "failed", error: "provider timeout" }, "failed");
  assert.equal(p.state, "failed");
  console.log("ok: deriveGenerationProgress failed");
}

{
  assert.equal(normalizeGenerationPhase("normalize"), "normalize");
  assert.equal(longRunningGenerationHint(46_000), "Still working — large or detailed plans can take a few minutes.");
  assert.equal(
    longRunningGenerationHint(130_000),
    "Still processing. You can leave this screen open while eliteOS finishes the takeoff."
  );
  assert.equal(longRunningGenerationHint(10_000), null);
  console.log("ok: longRunningGenerationHint");
}

{
  assert.equal(pollIntervalMs(10_000), 2000);
  assert.ok(pollIntervalMs(40_000) >= 4300 && pollIntervalMs(40_000) <= 4700);
  console.log("ok: pollIntervalMs backoff");
}

{
  let polls = 0;
  let overlapping = false;
  let inFlight = false;
  const poller = createJobStatusPoller({
    startedAtMs: Date.now() - 35_000,
    sleep: async () => {},
    poll: async () => {
      if (inFlight) overlapping = true;
      inFlight = true;
      polls += 1;
      await new Promise((r) => setTimeout(r, 5));
      inFlight = false;
      return polls >= 3 ? "completed" : "continue";
    },
  });

  await new Promise((r) => setTimeout(r, 30));
  poller.stop();
  assert.equal(overlapping, false);
  assert.ok(polls >= 1);
  console.log("ok: createJobStatusPoller no overlap");
}

{
  const elapsed = generationElapsedMs(new Date(Date.now() - 5000).toISOString());
  assert.ok(elapsed >= 4900 && elapsed <= 6000);
  console.log("ok: generationElapsedMs");
}

console.log("takeoffGenerationProgress.test.mjs: all passed");
