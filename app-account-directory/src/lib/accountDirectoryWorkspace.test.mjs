/**
 * Account Directory workspace helpers — Node tests.
 * Run: node app-account-directory/src/lib/accountDirectoryWorkspace.test.mjs
 */
import assert from "node:assert/strict";
import {
  parseUrlState,
  serializeUrlState,
  formatResultRange,
  buildPageNumbers,
  activityLabel,
  initials,
  ACTIVITY_LABELS
} from "./accountDirectoryWorkspace.mjs";

console.log("\naccountDirectoryWorkspace.test.mjs\n");

// ── parseUrlState ──────────────────────────────────────────────────────────

const defaultState = parseUrlState("");
assert.equal(defaultState.tab, "accounts", "default tab = accounts");
assert.equal(defaultState.page, 1, "default page = 1");
assert.equal(defaultState.pageSize, 50, "default pageSize = 50");
assert.equal(defaultState.search, "", "default search = ''");
assert.equal(defaultState.status, "", "default status = ''");
assert.equal(defaultState.linked, "", "default linked = ''");
assert.equal(defaultState.missingContact, "", "default missingContact = ''");
assert.equal(defaultState.missingLocation, "", "default missingLocation = ''");
assert.equal(defaultState.sort, "name_asc", "default sort = name_asc");
assert.equal(defaultState.account, null, "default account = null");
console.log("ok: parseUrlState defaults");

const fullState = parseUrlState("?tab=prospects&page=3&pageSize=25&search=Smith&status=active&linked=true&missingContact=true&sort=updated_desc&account=abc123");
assert.equal(fullState.tab, "prospects");
assert.equal(fullState.page, 3);
assert.equal(fullState.pageSize, 25);
assert.equal(fullState.search, "Smith");
assert.equal(fullState.status, "active");
assert.equal(fullState.linked, "true");
assert.equal(fullState.missingContact, "true");
assert.equal(fullState.sort, "updated_desc");
assert.equal(fullState.account, "abc123");
console.log("ok: parseUrlState full params");

// Invalid values fall back safely
const invalidState = parseUrlState("?tab=invalid&page=-5&pageSize=999&sort=badSort");
assert.equal(invalidState.tab, "accounts", "invalid tab falls back to accounts");
assert.equal(invalidState.page, 1, "invalid page falls back to 1");
assert.equal(invalidState.pageSize, 50, "invalid pageSize falls back to 50");
assert.equal(invalidState.sort, "name_asc", "invalid sort falls back to name_asc");
console.log("ok: parseUrlState invalid params fall back safely");

// ── serializeUrlState ──────────────────────────────────────────────────────

const emptySerial = serializeUrlState({ tab: "accounts", page: 1, pageSize: 50, search: "", status: "", linked: "", missingContact: "", missingLocation: "", sort: "name_asc", account: null });
assert.equal(emptySerial, "", "defaults serialize to empty string");
console.log("ok: serializeUrlState omits defaults");

const fullSerial = serializeUrlState({ tab: "prospects", page: 3, pageSize: 25, search: "Smith", status: "active", linked: "true", missingContact: "", missingLocation: "", sort: "updated_desc", account: "abc" });
assert.ok(fullSerial.includes("tab=prospects"));
assert.ok(fullSerial.includes("page=3"));
assert.ok(fullSerial.includes("pageSize=25"));
assert.ok(fullSerial.includes("search=Smith"));
assert.ok(fullSerial.includes("status=active"));
assert.ok(fullSerial.includes("linked=true"));
assert.ok(fullSerial.includes("sort=updated_desc"));
assert.ok(fullSerial.includes("account=abc"));
console.log("ok: serializeUrlState includes non-default values");

// round-trip
const rt = parseUrlState(serializeUrlState(fullState));
assert.equal(rt.tab, fullState.tab);
assert.equal(rt.page, fullState.page);
assert.equal(rt.pageSize, fullState.pageSize);
assert.equal(rt.search, fullState.search);
assert.equal(rt.sort, fullState.sort);
assert.equal(rt.account, fullState.account);
console.log("ok: serializeUrlState round-trip");

// ── formatResultRange ──────────────────────────────────────────────────────

assert.equal(formatResultRange(1, 50, 0), "0 results");
assert.equal(formatResultRange(1, 50, 362), "1–50 of 362");
assert.equal(formatResultRange(2, 50, 362), "51–100 of 362");
assert.equal(formatResultRange(8, 50, 362), "351–362 of 362", "last page truncates to total");
assert.equal(formatResultRange(1, 25, 25), "1–25 of 25");
assert.equal(formatResultRange(1, 100, 50), "1–50 of 50", "end capped at total");
console.log("ok: formatResultRange");

// ── buildPageNumbers ───────────────────────────────────────────────────────

assert.deepEqual(buildPageNumbers(1, 1), [], "single page = no page numbers");
assert.deepEqual(buildPageNumbers(1, 5), [1, 2, 3, 4, 5], "<=7 pages = all pages");
assert.deepEqual(buildPageNumbers(1, 7), [1, 2, 3, 4, 5, 6, 7]);

const pagesAt1of20 = buildPageNumbers(1, 20);
assert.ok(pagesAt1of20.includes(1), "includes first");
assert.ok(pagesAt1of20.includes(20), "includes last");
assert.ok(pagesAt1of20.includes("..."), "includes ellipsis");

const pagesAt10of20 = buildPageNumbers(10, 20);
assert.ok(pagesAt10of20.includes(10), "includes current");
assert.ok(pagesAt10of20.includes(9), "includes prev");
assert.ok(pagesAt10of20.includes(11), "includes next");
assert.ok(pagesAt10of20.includes(1), "includes first");
assert.ok(pagesAt10of20.includes(20), "includes last");
console.log("ok: buildPageNumbers");

// ── activityLabel ──────────────────────────────────────────────────────────

assert.equal(activityLabel("create_account"), "Account created");
assert.equal(activityLabel("seed_import_account"), "Imported from QuickBooks directory seed");
assert.equal(activityLabel("archive_account"), "Account archived");
assert.equal(activityLabel("restore_account"), "Account restored");
assert.equal(activityLabel("link_quickbooks"), "Linked to QuickBooks");
assert.equal(activityLabel("add_contact"), "Contact added");
assert.equal(activityLabel("update_location"), "Location updated");
assert.equal(activityLabel("unknown_action"), "unknown action", "unknown action humanized");
console.log("ok: activityLabel");

// All ACTIVITY_LABELS entries are non-empty strings
for (const [key, val] of Object.entries(ACTIVITY_LABELS)) {
  assert.ok(typeof val === "string" && val.length > 0, `ACTIVITY_LABELS["${key}"] should be non-empty string`);
}
console.log("ok: ACTIVITY_LABELS all non-empty");

// ── initials ──────────────────────────────────────────────────────────────

assert.equal(initials("John Smith"), "JS");
assert.equal(initials("Acme Corp"), "AC");
assert.equal(initials("Apple"), "AP");
assert.equal(initials(""), "?");
assert.equal(initials(null), "?");
assert.equal(initials("Elite Stone Fabrication"), "EF");
console.log("ok: initials");

console.log("\nAll workspace tests passed.\n");
