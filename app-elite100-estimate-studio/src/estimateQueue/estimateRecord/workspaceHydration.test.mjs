/**
 * Local edit buffer hydration policy.
 * Run: node app-elite100-estimate-studio/src/estimateQueue/estimateRecord/workspaceHydration.test.mjs
 */
import assert from "node:assert/strict";
import { decideBufferHydration, structuralScopeSignature } from "./workspaceHydration.mjs";

console.log("\nworkspaceHydration.test.mjs\n");

{
  const a = structuralScopeSignature({
    waterfalls: [{ id: "wf-1" }],
    vanityPrograms: [{ roomId: "bath" }],
    customLines: [{ id: "crane" }]
  });
  const b = structuralScopeSignature({
    waterfalls: [{ id: "wf-1" }],
    vanityPrograms: [{ roomId: "bath" }],
    customLines: [{ id: "crane" }],
    // Totals must never appear in the signature.
    estimateAdjustment: { exactAdjustment: 99 },
    customerDisplayTotal: 5000
  });
  assert.equal(a, b, "totals do not change structural signature");
  console.log("ok: structural signature ignores totals");
}

{
  assert.deepEqual(
    decideBufferHydration({ firstLoad: true }),
    { rehydrate: true, reason: "first_load" }
  );
  assert.deepEqual(
    decideBufferHydration({
      previousEstimateId: "r1",
      nextEstimateId: "r2",
      previousSignature: "a",
      nextSignature: "a"
    }),
    { rehydrate: true, reason: "active_revision_changed" }
  );
  assert.deepEqual(
    decideBufferHydration({
      previousEstimateId: "r2",
      nextEstimateId: "r2",
      previousSignature: "a",
      nextSignature: "b",
      hasPendingLocalEdits: true
    }),
    { rehydrate: false, reason: "pending_local_edits" }
  );
  assert.deepEqual(
    decideBufferHydration({
      previousEstimateId: "r2",
      nextEstimateId: "r2",
      previousSignature: "a",
      nextSignature: "b",
      hasPendingLocalEdits: false
    }),
    { rehydrate: true, reason: "server_structural_change" }
  );
  assert.deepEqual(
    decideBufferHydration({
      previousEstimateId: "r2",
      nextEstimateId: "r2",
      previousSignature: "a",
      nextSignature: "a",
      hasPendingLocalEdits: false
    }),
    { rehydrate: false, reason: "totals_only" }
  );
  console.log("ok: buffer rehydrates only on load / revision change / structural change");
}

console.log("\nworkspaceHydration.test.mjs — passed\n");
