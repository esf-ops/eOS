#!/usr/bin/env node
/**
 * Phase 2 internal quote policy smoke tests (no DB, no HTTP).
 * Mirrors guardrails in internalQuotePatchPolicy.js + internalQuoteSave save-mode branching intent.
 */
import assert from "node:assert/strict";
import { validateInternalQuotePatchContext } from "../quotes/internalQuotePatchPolicy.js";

// --- PATCH / calculation_snapshot ---
assert.deepEqual(validateInternalQuotePatchContext({}, { is_current_revision: true }), { ok: true });

assert.equal(
  validateInternalQuotePatchContext({ calculation_snapshot: { hacked: true } }, { is_current_revision: true }).ok,
  false
);

assert.equal(
  validateInternalQuotePatchContext({ calculation_snapshot: null }, { is_current_revision: true }).ok,
  false
);

let g = validateInternalQuotePatchContext({}, { is_current_revision: false, archived_at: null });
assert.equal(g.ok, false);
assert.match(String(g.error), /immutable/i);

g = validateInternalQuotePatchContext({}, { is_current_revision: true, archived_at: "2026-01-01T00:00:00Z" });
assert.equal(g.ok, false);
assert.match(String(g.error), /archived/i);

console.log("Phase 2 internal quote patch/snapshot policy smoke OK");
