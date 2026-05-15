#!/usr/bin/env node
/**
 * Contract for POST /api/internal-quotes/save success JSON (Phase 2 revision UX + QA).
 * No DB — documents keys the Internal Estimate client relies on.
 */
import assert from "node:assert/strict";

const REQUIRED_KEYS = [
  "ok",
  "quoteId",
  "quote_id",
  "quote_number",
  "save_mode",
  "revision_number",
  "revision_label",
  "quote_family_root_id",
  "quote_number_base",
  "is_current_revision",
  "totals",
  "snapshot",
  "warnings"
];

const sampleSaveRevision = {
  ok: true,
  quoteId: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
  quote_id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
  quote_number: "ESF-DYER-000001-R2",
  revision_number: 2,
  revision_label: "R2",
  quote_family_root_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  quote_number_base: "ESF-DYER-000001",
  is_current_revision: true,
  save_mode: "save_revision",
  totals: { retail: 1, wholesale: 1, estimated_sqft: 1 },
  snapshot: {},
  warnings: [],
  monday_sync_status: null,
  monday_item_id: null
};

for (const k of REQUIRED_KEYS) {
  assert.ok(k in sampleSaveRevision, `missing contract key: ${k}`);
}
assert.equal(sampleSaveRevision.quoteId, sampleSaveRevision.quote_id);
assert.match(String(sampleSaveRevision.quote_number), /-R2$/);
assert.equal(sampleSaveRevision.revision_number, 2);

console.log("internal quote save response contract OK");
