/**
 * Quote output gate tests — block unsaved/missing quote_number customer output.
 *
 * Run: npm run eos:test:quote-output-gate
 */
import assert from "node:assert/strict";

import {
  UNSAVED_QUOTE_OUTPUT_MESSAGE,
  validateQuoteReadyForCustomerOutput
} from "../quotes/quoteOutputGate.js";

const QUOTE_ID = "a1111111-1111-4111-8111-111111111111";

function baseRow(overrides = {}) {
  return {
    id: QUOTE_ID,
    quote_number: "ESF-DYER-000061",
    quote_source: "internal_quote",
    calculation_snapshot: { totals: { retail: 1000 }, internal_ui: { customer_display_total: 1000 } },
    ...overrides
  };
}

function testMissingRow() {
  const r = validateQuoteReadyForCustomerOutput(null);
  assert.equal(r.ok, false);
  assert.equal(r.code, "quote_not_found");
  assert.equal(r.error, UNSAVED_QUOTE_OUTPUT_MESSAGE);
}

function testMissingQuoteNumber() {
  const r = validateQuoteReadyForCustomerOutput(baseRow({ quote_number: null }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "quote_number_missing");
  assert.equal(r.error, UNSAVED_QUOTE_OUTPUT_MESSAGE);
}

function testBlankQuoteNumber() {
  const r = validateQuoteReadyForCustomerOutput(baseRow({ quote_number: "   " }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "quote_number_missing");
}

function testMissingSnapshot() {
  const r = validateQuoteReadyForCustomerOutput(baseRow({ calculation_snapshot: null }));
  assert.equal(r.ok, false);
  assert.equal(r.code, "calculation_snapshot_missing");
}

function testSavedQuoteAllowed() {
  const r = validateQuoteReadyForCustomerOutput(baseRow());
  assert.equal(r.ok, true);
  assert.equal(r.quoteId, QUOTE_ID);
  assert.equal(r.quoteNumber, "ESF-DYER-000061");
}

const tests = [
  ["G1 missing row blocked", testMissingRow],
  ["G2 missing quote_number blocked", testMissingQuoteNumber],
  ["G3 blank quote_number blocked", testBlankQuoteNumber],
  ["G4 missing snapshot blocked", testMissingSnapshot],
  ["G5 saved quote allowed", testSavedQuoteAllowed]
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}:`, e.message);
  }
}

if (failed) process.exit(1);
console.log(`quoteOutputGate: all ${tests.length} tests passed`);
