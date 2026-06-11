/**
 * Quote Library search helper tests.
 *
 * Run: npm run eos:test:quote-library-search
 */
import assert from "node:assert/strict";

import {
  applyQuoteLibrarySearch,
  quoteAccountFilterOrClause,
  quoteSearchOrClauseForTerm,
  tokenizeQuoteSearchQuery,
  QUOTE_LIBRARY_LIST_SELECT
} from "./quoteLibrarySearch.js";

function testTokenizeMultiWord() {
  assert.deepEqual(tokenizeQuoteSearchQuery("Interior Elements Denger"), [
    "Interior",
    "Elements",
    "Denger"
  ]);
  assert.deepEqual(tokenizeQuoteSearchQuery("  ESF-DYER-000061  "), ["ESF-DYER-000061"]);
}

function testSearchFieldsIncludeRequiredColumns() {
  const clause = quoteSearchOrClauseForTerm("Denger");
  for (const field of [
    "customer_name",
    "account_name",
    "project_name",
    "quote_number",
    "quote_number_base",
    "prepared_by",
    "created_by",
    "sales_rep",
    "calculation_snapshot->internal_ui->>account"
  ]) {
    assert.match(clause, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

function testAccountFilterIncludesSnapshotAccount() {
  const clause = quoteAccountFilterOrClause("Interior Elements");
  assert.match(clause, /account_name\.ilike/);
  assert.match(clause, /calculation_snapshot->internal_ui->>account\.ilike/);
}

function testApplySearchAndsTokens() {
  const calls = [];
  const qb = {
    or(clause) {
      calls.push(clause);
      return this;
    }
  };
  applyQuoteLibrarySearch(qb, "Interior Denger");
  assert.equal(calls.length, 2);
  assert.match(calls[0], /Interior/);
  assert.match(calls[1], /Denger/);
}

function testListSelectIsLightweight() {
  assert.match(QUOTE_LIBRARY_LIST_SELECT, /quote_number_base/);
  assert.match(QUOTE_LIBRARY_LIST_SELECT, /created_by/);
  assert.match(QUOTE_LIBRARY_LIST_SELECT, /snapshot_pricing_mode:/);
  assert.doesNotMatch(QUOTE_LIBRARY_LIST_SELECT, /calculation_snapshot[^->]/);
}

const tests = [
  ["S1 multi-word tokenization", testTokenizeMultiWord],
  ["S2 required search fields", testSearchFieldsIncludeRequiredColumns],
  ["S3 account filter snapshot", testAccountFilterIncludesSnapshotAccount],
  ["S4 AND multi-word tokens", testApplySearchAndsTokens],
  ["S5 lightweight list select", testListSelectIsLightweight]
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
console.log(`quoteLibrarySearch: all ${tests.length} tests passed`);
