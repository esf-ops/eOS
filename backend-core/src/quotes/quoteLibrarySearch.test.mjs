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
  deriveQuoteAccountName,
  resolveQuoteLibrarySortColumn,
  applyQuoteLibraryAccountSort,
  compareQuoteAccountNames,
  sortRowsByDerivedAccount,
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
    "calculation_snapshot->internal_ui->job_info->>account",
    "calculation_snapshot->internal_ui->>account"
  ]) {
    assert.match(clause, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

function testAccountFilterIncludesSnapshotAccount() {
  const clause = quoteAccountFilterOrClause("Interior Elements");
  assert.match(clause, /account_name\.ilike/);
  assert.match(clause, /calculation_snapshot->internal_ui->job_info->>account\.ilike/);
}

function testAccountFilterDoesNotUseCustomerOrProject() {
  const clause = quoteAccountFilterOrClause("Stenrich");
  assert.doesNotMatch(clause, /customer_name\.ilike/);
  assert.doesNotMatch(clause, /project_name\.ilike/);
}

function testResolveSortAccountIsNotCustomerName() {
  const resolved = resolveQuoteLibrarySortColumn("account");
  assert.equal(resolved.kind, "account");
  const customerResolved = resolveQuoteLibrarySortColumn("customer_name");
  assert.equal(customerResolved.kind, "column");
  assert.equal(customerResolved.column, "customer_name");
}

function testApplyAccountSortOrdersAccountColumns() {
  const orders = [];
  const qb = {
    order(col, opts) {
      orders.push({ col, opts });
      return this;
    }
  };
  applyQuoteLibraryAccountSort(qb, true);
  assert.ok(orders.length >= 1);
  assert.equal(orders[0].col, "account_name");
  assert.equal(orders[0].opts.nullsFirst, false);
  assert.ok(orders.every((o) => o.col !== "customer_name"));
  assert.ok(orders.some((o) => o.col.includes("job_info")));
}

function testSortByDerivedAccountUsesSnapshotNotProject() {
  const rows = [
    { account_name: null, customer_name: "Homeowner", project_name: "Stenrich", snapshot_account: "D&M", updated_at: "2026-01-02" },
    { account_name: null, customer_name: "Other", project_name: "Alpha", snapshot_account: "Zebra Co", updated_at: "2026-01-03" }
  ];
  const sorted = sortRowsByDerivedAccount(rows, true);
  assert.equal(deriveQuoteAccountName(sorted[0]), "D&M");
  assert.equal(deriveQuoteAccountName(sorted[1]), "Zebra Co");
}

function testMissingAccountSortsAfterNamedAccounts() {
  const rows = [
    { account_name: null, project_name: "Stenrich", customer_name: "Homeowner", updated_at: "2026-01-02" },
    { account_name: "D&M", project_name: "Job A", updated_at: "2026-01-01" }
  ];
  const sorted = sortRowsByDerivedAccount(rows, true);
  assert.equal(deriveQuoteAccountName(sorted[0]), "D&M");
  assert.equal(deriveQuoteAccountName(sorted[1]), "—");
}

function testGlobalSearchStillFindsProjectName() {
  const clause = quoteSearchOrClauseForTerm("Stenrich");
  assert.match(clause, /project_name\.ilike/);
}

function testDeriveAccountNameUsesJobInfoNotProject() {
  const row = {
    account_name: null,
    customer_name: "Homeowner",
    project_name: "Stenrich",
    snapshot_account: "D&M"
  };
  assert.equal(deriveQuoteAccountName(row), "D&M");
}

function testDeriveAccountNameDoesNotFallbackToProject() {
  const row = {
    account_name: null,
    customer_name: "Homeowner",
    project_name: "Stenrich",
    snapshot_account: null,
    calculation_snapshot: {
      internal_ui: {
        job_info: { account: "D&M" }
      }
    }
  };
  assert.equal(deriveQuoteAccountName(row), "D&M");
}

function testDeriveAccountNameMissingAccountShowsDash() {
  const row = {
    account_name: null,
    customer_name: "Homeowner",
    project_name: "Stenrich"
  };
  assert.equal(deriveQuoteAccountName(row), "—");
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
  assert.match(QUOTE_LIBRARY_LIST_SELECT, /snapshot_account:calculation_snapshot->internal_ui->job_info->>account/);
  assert.doesNotMatch(QUOTE_LIBRARY_LIST_SELECT, /calculation_snapshot[^->]/);
}

const tests = [
  ["S1 multi-word tokenization", testTokenizeMultiWord],
  ["S2 required search fields", testSearchFieldsIncludeRequiredColumns],
  ["S3 account filter snapshot", testAccountFilterIncludesSnapshotAccount],
  ["S4 AND multi-word tokens", testApplySearchAndsTokens],
  ["S5 lightweight list select", testListSelectIsLightweight],
  ["S6 derive account from snapshot alias", testDeriveAccountNameUsesJobInfoNotProject],
  ["S7 derive account from job_info", testDeriveAccountNameDoesNotFallbackToProject],
  ["S8 missing account does not use project", testDeriveAccountNameMissingAccountShowsDash],
  ["S9 account filter excludes customer/project", testAccountFilterDoesNotUseCustomerOrProject],
  ["S10 account sort not customer_name", testResolveSortAccountIsNotCustomerName],
  ["S11 account sort uses account columns", testApplyAccountSortOrdersAccountColumns],
  ["S12 derived account sort D&M not Stenrich", testSortByDerivedAccountUsesSnapshotNotProject],
  ["S13 missing account sorts last", testMissingAccountSortsAfterNamedAccounts],
  ["S14 global search still matches project", testGlobalSearchStillFindsProjectName]
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
