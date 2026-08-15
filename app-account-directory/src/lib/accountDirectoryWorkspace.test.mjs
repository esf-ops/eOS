/**
 * Account Directory workspace helpers — Node tests.
 * Run: node app-account-directory/src/lib/accountDirectoryWorkspace.test.mjs
 */
import assert from "node:assert/strict";
import {
  parseUrlState,
  serializeUrlState,
  applySummaryCardPreset,
  isSummaryCardActive,
  applyToolbarFilterPatch,
  SUMMARY_CARD_PRESETS,
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
assert.equal(defaultState.qbEnrichment, "", "default qbEnrichment = ''");
assert.equal(defaultState.intelligence, "", "default intelligence = ''");
assert.equal(defaultState.sort, "name_asc", "default sort = name_asc");
assert.equal(defaultState.account, null, "default account = null");
assert.equal(defaultState.panel, null, "default panel = null");
console.log("ok: parseUrlState defaults");

assert.equal(parseUrlState("?tab=status_review").tab, "status_review");
console.log("ok: parseUrlState status_review tab");

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
assert.equal(fullState.qbEnrichment, "");
console.log("ok: parseUrlState full params");

const qbEnrichState = parseUrlState("?tab=accounts&qbEnrichment=needs_review");
assert.equal(qbEnrichState.tab, "accounts");
assert.equal(qbEnrichState.qbEnrichment, "needs_review");
const qbInvalid = parseUrlState("?qbEnrichment=bogus&tab=needs_review");
assert.equal(qbInvalid.qbEnrichment, "", "invalid qbEnrichment ignored");
assert.equal(qbInvalid.tab, "needs_review", "native needs_review tab unchanged");
console.log("ok: parseUrlState qbEnrichment");

// Invalid values fall back safely
const invalidState = parseUrlState("?tab=invalid&page=-5&pageSize=999&sort=badSort");
assert.equal(invalidState.tab, "accounts", "invalid tab falls back to accounts");
assert.equal(invalidState.page, 1, "invalid page falls back to 1");
assert.equal(invalidState.pageSize, 50, "invalid pageSize falls back to 50");
assert.equal(invalidState.sort, "name_asc", "invalid sort falls back to name_asc");
console.log("ok: parseUrlState invalid params fall back safely");

// ── serializeUrlState ──────────────────────────────────────────────────────

const emptySerial = serializeUrlState({ tab: "accounts", page: 1, pageSize: 50, search: "", status: "", linked: "", missingContact: "", missingLocation: "", qbEnrichment: "", intelligence: "", sort: "name_asc", account: null });
assert.equal(emptySerial, "", "defaults serialize to empty string");
console.log("ok: serializeUrlState omits defaults");

const fullSerial = serializeUrlState({ tab: "prospects", page: 3, pageSize: 25, search: "Smith", status: "active", linked: "true", missingContact: "", missingLocation: "", qbEnrichment: "", sort: "updated_desc", account: "abc" });
assert.ok(fullSerial.includes("tab=prospects"));
assert.ok(fullSerial.includes("page=3"));
assert.ok(fullSerial.includes("pageSize=25"));
assert.ok(fullSerial.includes("search=Smith"));
assert.ok(fullSerial.includes("status=active"));
assert.ok(fullSerial.includes("linked=true"));
assert.ok(fullSerial.includes("sort=updated_desc"));
assert.ok(fullSerial.includes("account=abc"));
console.log("ok: serializeUrlState includes non-default values");

const qbSerial = serializeUrlState({
  tab: "accounts",
  page: 1,
  pageSize: 50,
  search: "",
  status: "",
  linked: "",
  missingContact: "",
  missingLocation: "",
  qbEnrichment: "suggested_match",
  sort: "name_asc",
  account: null
});
assert.equal(qbSerial, "?qbEnrichment=suggested_match");
assert.equal(parseUrlState(qbSerial).qbEnrichment, "suggested_match");
console.log("ok: serializeUrlState qbEnrichment round-trip");

const panelSerial = serializeUrlState({
  tab: "accounts",
  page: 1,
  pageSize: 50,
  search: "",
  status: "",
  linked: "",
  missingContact: "",
  missingLocation: "",
  qbEnrichment: "",
  intelligence: "",
  sort: "name_asc",
  account: "abc",
  panel: "insights"
});
assert.ok(panelSerial.includes("account=abc"));
assert.ok(panelSerial.includes("panel=insights"));
assert.equal(parseUrlState(panelSerial).panel, "insights");
assert.equal(parseUrlState("?account=abc").panel, null);
console.log("ok: workspace panel deep link");

// round-trip
const rt = parseUrlState(serializeUrlState(fullState));
assert.equal(rt.tab, fullState.tab);
assert.equal(rt.page, fullState.page);
assert.equal(rt.pageSize, fullState.pageSize);
assert.equal(rt.search, fullState.search);
assert.equal(rt.sort, fullState.sort);
assert.equal(rt.account, fullState.account);
console.log("ok: serializeUrlState round-trip");

// ── Exclusive summary card presets ─────────────────────────────────────────

const dirtyState = {
  tab: "prospects",
  page: 4,
  pageSize: 25,
  search: "leftover",
  status: "active",
  linked: "true",
  missingContact: "true",
  missingLocation: "true",
  qbEnrichment: "needs_review",
  sort: "updated_desc",
  account: "acct-open"
};

const expectedScopes = {
  total: { tab: "accounts", status: "", linked: "", qbEnrichment: "", missingContact: "", missingLocation: "" },
  active: { tab: "accounts", status: "active", linked: "", qbEnrichment: "", missingContact: "", missingLocation: "" },
  prospects: { tab: "prospects", status: "", linked: "", qbEnrichment: "", missingContact: "", missingLocation: "" },
  needsReview: { tab: "needs_review", status: "", linked: "", qbEnrichment: "", missingContact: "", missingLocation: "" },
  archived: { tab: "archived", status: "", linked: "", qbEnrichment: "", missingContact: "", missingLocation: "" },
  qbLinked: { tab: "accounts", status: "", linked: "true", qbEnrichment: "", missingContact: "", missingLocation: "" },
  qbSuggested: {
    tab: "accounts",
    status: "",
    linked: "",
    qbEnrichment: "suggested_match",
    missingContact: "",
    missingLocation: ""
  },
  qbNeedsReview: {
    tab: "accounts",
    status: "",
    linked: "",
    qbEnrichment: "needs_review",
    missingContact: "",
    missingLocation: ""
  },
  noContact: {
    tab: "accounts",
    status: "",
    linked: "",
    qbEnrichment: "",
    missingContact: "true",
    missingLocation: ""
  },
  noLocation: {
    tab: "accounts",
    status: "",
    linked: "",
    qbEnrichment: "",
    missingContact: "",
    missingLocation: "true"
  }
};

for (const [cardKey, scope] of Object.entries(expectedScopes)) {
  const next = applySummaryCardPreset(dirtyState, cardKey);
  assert.equal(next.search, "", `${cardKey} clears search`);
  assert.equal(next.page, 1, `${cardKey} resets page`);
  assert.equal(next.account, null, `${cardKey} clears account selection`);
  assert.equal(next.tab, scope.tab, `${cardKey} tab`);
  assert.equal(next.status, scope.status, `${cardKey} status`);
  assert.equal(next.linked, scope.linked, `${cardKey} linked`);
  assert.equal(next.qbEnrichment, scope.qbEnrichment, `${cardKey} qbEnrichment`);
  assert.equal(next.missingContact, scope.missingContact, `${cardKey} missingContact`);
  assert.equal(next.missingLocation, scope.missingLocation, `${cardKey} missingLocation`);
  assert.equal(next.pageSize, 25, `${cardKey} preserves pageSize`);
  assert.equal(next.sort, "updated_desc", `${cardKey} preserves sort`);
  assert.equal(isSummaryCardActive(next, cardKey), true, `${cardKey} active after apply`);
  // Same exclusive scope whether prior filters were dirty or clean
  const fromClean = applySummaryCardPreset(
    { ...dirtyState, search: "", status: "", linked: "", missingContact: "", missingLocation: "", qbEnrichment: "", page: 1, account: null, tab: "accounts" },
    cardKey
  );
  assert.equal(serializeUrlState({ ...next, pageSize: 50, sort: "name_asc" }), serializeUrlState({ ...fromClean, pageSize: 50, sort: "name_asc" }));
}
assert.equal(Object.keys(SUMMARY_CARD_PRESETS).length, Object.keys(expectedScopes).length);
console.log("ok: summary cards are exclusive presets and do not inherit prior filters");

// Toolbar remains stackable except contradictory QB filters
const stacked = applyToolbarFilterPatch(
  parseUrlState("?status=active"),
  { missingContact: "true" }
);
assert.equal(stacked.status, "active");
assert.equal(stacked.missingContact, "true");
assert.equal(stacked.page, 1);

const linkedClearsEnrichment = applyToolbarFilterPatch(
  parseUrlState("?qbEnrichment=needs_review"),
  { linked: "true" }
);
assert.equal(linkedClearsEnrichment.linked, "true");
assert.equal(linkedClearsEnrichment.qbEnrichment, "");

const enrichmentClearsLinked = applyToolbarFilterPatch(
  parseUrlState("?linked=true"),
  { qbEnrichment: "suggested_match" }
);
assert.equal(enrichmentClearsLinked.qbEnrichment, "suggested_match");
assert.equal(enrichmentClearsLinked.linked, "");

const pageOnly = applyToolbarFilterPatch(parseUrlState("?page=2&status=active"), { page: 3 });
assert.equal(pageOnly.page, 3);
assert.equal(pageOnly.status, "active");
console.log("ok: toolbar stackable filters + contradictory QB mutual exclusion");

// Dirty leftover filters mean summary card is not active
assert.equal(
  isSummaryCardActive(parseUrlState("?qbEnrichment=needs_review&search=x"), "qbNeedsReview"),
  false
);
assert.equal(
  isSummaryCardActive(parseUrlState("?qbEnrichment=needs_review"), "qbNeedsReview"),
  true
);
console.log("ok: isSummaryCardActive requires exclusive match");

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
