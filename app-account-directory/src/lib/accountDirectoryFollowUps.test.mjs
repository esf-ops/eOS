/**
 * Phase 4 — Account 360 Follow-ups helpers + UX contracts.
 * Run: node app-account-directory/src/lib/accountDirectoryFollowUps.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyHistoryPage,
  AD_360_RENDER_WINDOW,
  shouldApplyHistoryPage
} from "./account360History.mjs";
import {
  ACCOUNT360_DEFAULT_NAV_BUDGET,
  account360FetchesForSurface,
  createAccount360SessionStore,
  replayAccount360Navigation
} from "./account360RequestCoordinator.mjs";
import {
  AD_FOLLOW_UP_DETAILS_MAX,
  AD_FOLLOW_UP_TITLE_MAX,
  AD_FOLLOW_UPS_EMPTY_COMPLETED,
  AD_FOLLOW_UPS_EMPTY_HINT,
  AD_FOLLOW_UPS_EMPTY_OPEN,
  AD_FOLLOW_UPS_PAGE_SIZE,
  AD_FOLLOW_UP_DUE_REQUIRED,
  AD_FOLLOW_UP_TITLE_REQUIRED,
  followUpDueState,
  followUpsCacheKey,
  followUpItemId,
  insertOpenFollowUp,
  prependCompletedFollowUp,
  removeFollowUpFromPage,
  replaceFollowUpInPage,
  validateFollowUpDraft
} from "./accountDirectoryFollowUps.mjs";
import { panelFromTab, parseUrlState, tabFromPanel } from "./accountDirectoryWorkspace.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

console.log("\naccountDirectoryFollowUps.test.mjs\n");

{
  const backend = readFileSync(
    join(root, "backend-core/src/accountDirectory/accountDirectoryFollowUps.mjs"),
    "utf8"
  );
  assert.ok(backend.includes(`AD_FOLLOW_UP_TITLE_MAX = ${AD_FOLLOW_UP_TITLE_MAX}`));
  assert.ok(backend.includes(`AD_FOLLOW_UP_DETAILS_MAX = ${AD_FOLLOW_UP_DETAILS_MAX}`));
  assert.equal(AD_FOLLOW_UPS_PAGE_SIZE, 25);
  assert.equal(validateFollowUpDraft("  ", "2026-08-21T10:00").ok, false);
  assert.equal(validateFollowUpDraft("", "2026-08-21T10:00").error, AD_FOLLOW_UP_TITLE_REQUIRED);
  assert.equal(validateFollowUpDraft("Call Friday", "").error, AD_FOLLOW_UP_DUE_REQUIRED);
  assert.equal(validateFollowUpDraft("Call Friday", "not-a-date").ok, false);
  assert.equal(validateFollowUpDraft("Call Friday", "2026-08-21T10:00").ok, true);
  assert.equal(validateFollowUpDraft("x".repeat(AD_FOLLOW_UP_TITLE_MAX + 1), "2026-08-21T10:00").ok, false);
  assert.equal(validateFollowUpDraft("Call", "2026-08-21T10:00", "d".repeat(AD_FOLLOW_UP_DETAILS_MAX + 1)).ok, false);
  const past = validateFollowUpDraft("Historical", "2020-01-01T00:00");
  assert.equal(past.ok, true);
  console.log("ok: add form requires title + due; max lengths; past due allowed");
}

{
  const now = new Date("2026-08-17T15:00:00");
  assert.equal(followUpDueState("2026-08-16T12:00:00", { now }), "overdue");
  assert.equal(followUpDueState("2026-08-17T18:00:00", { now }), "due_today");
  assert.equal(followUpDueState("2026-08-20T12:00:00", { now }), "upcoming");
  assert.equal(followUpDueState("2026-08-20T12:00:00", { status: "completed", now }), "completed");
  console.log("ok: derived due state uses clock overdue + local calendar due today");
}

{
  const created = { id: "f-new", title: "Call Friday", dueAt: "2026-08-10T12:00:00.000Z", status: "open" };
  const later = { id: "f-later", title: "Later", dueAt: "2026-08-30T12:00:00.000Z", status: "open" };
  const page = insertOpenFollowUp({ items: [later], pagination: { has_more: true } }, created);
  assert.deepEqual(
    page.items.map((row) => row.id),
    ["f-new", "f-later"]
  );
  const edited = replaceFollowUpInPage(page, { id: "f-later", title: "Edited", dueAt: later.dueAt });
  assert.equal(edited.items[1].title, "Edited");
  const completed = removeFollowUpFromPage(edited, "f-new");
  assert.deepEqual(
    completed.items.map((row) => row.id),
    ["f-later"]
  );
  const history = prependCompletedFollowUp({ items: [{ id: "old" }] }, { id: "f-new", status: "completed" });
  assert.equal(history.items[0].id, "f-new");
  console.log("ok: successful add appears; complete leaves open; completed view prepends");
}

{
  const items = Array.from({ length: 250 }, (_, i) => ({ id: `f-${i}` }));
  const bounded = applyHistoryPage(null, { items, pagination: { has_more: true } }, 1, followUpItemId);
  assert.equal(bounded.items.length, AD_360_RENDER_WINDOW);
  const page2 = applyHistoryPage(
    { items: [{ id: "f-0" }, { id: "f-1" }] },
    { items: [{ id: "f-1" }, { id: "f-2" }], pagination: { has_more: false } },
    2,
    followUpItemId
  );
  assert.deepEqual(
    page2.items.map((row) => row.id),
    ["f-0", "f-1", "f-2"]
  );
  console.log("ok: load more dedupes; render window bounds DOM");
}

{
  const store = createAccount360SessionStore();
  const a = store.beginAccount("acct-a");
  const page1 = { items: [{ id: "f1" }], pagination: { has_more: true } };
  await store.loadResource("acct-a", followUpsCacheKey("open"), async () =>
    applyHistoryPage(null, page1, 1, followUpItemId)
  );
  const remount = await store.loadResource("acct-a", followUpsCacheKey("open"), async () => {
    throw new Error("page 1 must not reload");
  });
  assert.equal(remount.items.length, 1);

  store.setPanel("acct-a", "notes:all", { items: [{ id: "n1" }] });
  store.setPanel("acct-a", "financials", { openAr: 1 });
  store.setPanel("acct-a", "relationship", { linked: true });
  store.setPanel("acct-a", "insights", { cards: [] });
  store.setPanel("acct-a", followUpsCacheKey("completed"), { items: [{ id: "done" }] });
  store.clearPanelFamily("acct-a", "followups");
  assert.equal(store.hasPanel("acct-a", followUpsCacheKey("open")), false);
  assert.equal(store.hasPanel("acct-a", followUpsCacheKey("completed")), false);
  assert.equal(store.hasPanel("acct-a", "notes:all"), true);
  assert.equal(store.hasPanel("acct-a", "financials"), true);
  assert.equal(store.hasPanel("acct-a", "relationship"), true);
  assert.equal(store.hasPanel("acct-a", "insights"), true);

  const b = store.beginAccount("acct-b");
  assert.equal(shouldApplyHistoryPage(store, a.generation, "acct-a", "acct-a"), false);
  if (shouldApplyHistoryPage(store, a.generation, "acct-a", "acct-a")) {
    store.setPanel("acct-b", followUpsCacheKey("open"), remount);
  }
  assert.equal(store.hasPanel("acct-b", followUpsCacheKey("open")), false);
  assert.equal(store.isCurrent(b.generation, "acct-b"), true);
  console.log("ok: page 1 cached; mutation invalidates Follow-ups only; Notes cache intact; stale A cannot land on B");
}

{
  assert.deepEqual(account360FetchesForSurface("overview"), ["financials", "relationship", "insights"]);
  assert.deepEqual(account360FetchesForSurface("notes"), ["notes:all"]);
  assert.deepEqual(account360FetchesForSurface("followups"), ["followups:open"]);
  const overview = replayAccount360Navigation(createAccount360SessionStore(), "acct-1", [
    "overview",
    "connections",
    "relationship",
    "financials",
    "insights"
  ]);
  assert.deepEqual(overview, ACCOUNT360_DEFAULT_NAV_BUDGET);
  assert.equal(overview.followups, 0);
  assert.equal(overview.notes, 0);

  const withFollowups = replayAccount360Navigation(createAccount360SessionStore(), "acct-1", [
    "overview",
    "followups",
    "overview",
    "followups"
  ]);
  assert.equal(withFollowups.followups, 1);
  assert.equal(withFollowups.notes, 0);
  assert.equal(withFollowups.financials, 1);
  console.log("ok: Overview does not fetch follow-ups; Follow-ups visit caches page 1 once");
}

{
  assert.equal(panelFromTab("Follow-ups"), "followups");
  assert.equal(tabFromPanel("followups"), "Follow-ups");
  assert.equal(parseUrlState("?account=abc&panel=followups").panel, "followups");
  assert.equal(parseUrlState("?account=abc&panel=notes").panel, "notes");
  assert.equal(parseUrlState("?account=abc&panel=financials").panel, "financials");
  assert.equal(parseUrlState("?account=abc&panel=relationship").panel, "relationship");
  assert.equal(parseUrlState("?account=abc&panel=insights").panel, "insights");
  assert.equal(parseUrlState("?account=abc&panel=connections").panel, "connections");
  console.log("ok: Follow-ups panel routing; existing 360 panels intact");
}

{
  const app = readFileSync(join(root, "app-account-directory/src/AccountDirectoryApp.tsx"), "utf8");
  const followUi = readFileSync(join(root, "app-account-directory/src/ui/AccountFollowUps.tsx"), "utf8");
  const notesUi = readFileSync(join(root, "app-account-directory/src/ui/AccountNotes.tsx"), "utf8");
  const api = readFileSync(join(here, "accountDirectoryApi.ts"), "utf8");
  assert.ok(app.includes('"Follow-ups"'));
  assert.ok(app.includes("AccountFollowUps"));
  assert.ok(app.includes('"Notes"'));
  assert.ok(app.includes("AccountNotes"));
  assert.equal(app.includes("getAccountFollowUps"), false, "Overview/shell must not load follow-up history");
  assert.equal(app.includes("getAccountNotes"), false, "Overview/shell must not load notes history");
  assert.ok(followUi.includes(AD_FOLLOW_UPS_EMPTY_OPEN) || followUi.includes("AD_FOLLOW_UPS_EMPTY_OPEN"));
  assert.ok(followUi.includes(AD_FOLLOW_UPS_EMPTY_COMPLETED) || followUi.includes("AD_FOLLOW_UPS_EMPTY_COMPLETED"));
  assert.ok(followUi.includes(AD_FOLLOW_UPS_EMPTY_HINT) || followUi.includes("AD_FOLLOW_UPS_EMPTY_HINT"));
  assert.ok(followUi.includes("Loading follow-ups"));
  assert.ok(followUi.includes("Could not load follow-ups"));
  assert.ok(followUi.includes("Retry"));
  assert.ok(followUi.includes("canEdit"));
  assert.ok(followUi.includes("Add follow-up"));
  assert.ok(followUi.includes("datetime-local"));
  assert.ok(followUi.includes("Complete"));
  assert.ok(followUi.includes("Reopen"));
  assert.ok(followUi.includes("Edit"));
  assert.ok(followUi.includes("Archive this follow-up?"));
  assert.equal(followUi.includes("Complete this follow-up?"), false, "complete must not use destructive confirm");
  assert.ok(followUi.includes("clearPanelFamily(accountId, \"followups\")") || followUi.includes('clearPanelFamily(accountId, "followups")'));
  assert.ok(followUi.includes("shouldApplyHistoryPage"));
  assert.ok(followUi.includes("Load more"));
  assert.ok(followUi.includes("canEdit && status === \"open\"") || followUi.includes("canEdit && status === 'open'"));
  assert.ok(notesUi.includes('clearPanelFamily(accountId, "notes")') || notesUi.includes("clearPanelFamily(accountId, 'notes')"));
  assert.ok(api.includes("getAccountFollowUps"));
  assert.match(api, /getAccountFollowUps\([\s\S]*?init: RequestInit/, "follow-ups GET accepts AbortSignal");
  assert.ok(api.includes("/follow-ups/${encodeURIComponent(followUpId)}/complete") || api.includes("/complete"));
  assert.ok(api.includes("/reopen"));
  assert.ok(api.includes("/archive"));
  console.log("ok: Follow-ups tab, states, permissions, and API wiring");
}

console.log("accountDirectoryFollowUps.test.mjs — all passed");
