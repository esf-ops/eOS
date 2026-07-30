/**
 * Coalescing workspace save queue — one in-flight save, newest payload wins.
 * Run: node app-elite100-estimate-studio/src/lib/workspaceSaveQueue.test.mjs
 */
import assert from "node:assert/strict";
import {
  createWorkspaceSaveQueue,
  isFreshCalculationResponse
} from "./workspaceSaveQueue.mjs";

console.log("\nworkspaceSaveQueue.test.mjs\n");

{
  assert.equal(isFreshCalculationResponse(3, 2), true);
  assert.equal(isFreshCalculationResponse(2, 2), true);
  assert.equal(isFreshCalculationResponse(1, 2), false);
  console.log("ok: stale calculation responses are ignored");
}

{
  const states = [];
  const runs = [];
  /** @type {Array<() => void>} */
  const resolvers = [];
  const queue = createWorkspaceSaveQueue({
    debounceMs: 5,
    onStateChange: (s) => states.push(s),
    run: (payload, ctx) =>
      new Promise((resolve) => {
        runs.push({ payload, seq: ctx.seq });
        ctx.onPhase("persisting");
        ctx.onPhase("calculating");
        resolvers.push(resolve);
      })
  });

  queue.queue({ n: 1 });
  queue.queue({ n: 2 });
  assert.equal(queue.state(), "Unsaved changes");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(runs.length, 1, "one in-flight save");
  assert.deepEqual(runs[0].payload, { n: 2 }, "newest payload sent");
  assert.ok(states.includes("Saving…"));
  assert.ok(states.includes("Updating estimate…"));

  queue.queue({ n: 3 });
  resolvers.shift()?.();
  await new Promise((r) => setTimeout(r, 10));
  resolvers.shift()?.();
  await queue.flush();
  assert.equal(runs.length, 2, "retained edit sent after in-flight completes");
  assert.deepEqual(runs[1].payload, { n: 3 });
  assert.equal(queue.state(), "Saved");
  assert.equal(queue.isDirty(), false);
  console.log("ok: one in-flight save; edits coalesce; Saved only for newest");
}

{
  const queue = createWorkspaceSaveQueue({
    debounceMs: 1,
    run: async () => {
      throw new Error("persist failed");
    }
  });
  queue.queue({ n: 1 });
  await queue.flush();
  assert.equal(queue.state(), "Save failed");
  assert.equal(queue.isDirty(), true, "local inputs preserved after failure");
  console.log("ok: failure preserves dirty state and never reports Saved");
}

console.log("\nworkspaceSaveQueue.test.mjs — passed\n");
