/**
 * Phase 3 — Account 360 Notes helpers + UX contracts.
 * Run: node app-account-directory/src/lib/accountDirectoryNotes.test.mjs
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
  AD_NOTE_BODY_MAX,
  AD_NOTES_CACHE_KEY,
  AD_NOTES_EMPTY_COPY,
  AD_NOTES_PAGE_SIZE,
  noteItemId,
  prependCreatedNote,
  removeNoteFromPage,
  replaceNoteInPage,
  validateNoteDraft
} from "./accountDirectoryNotes.mjs";
import { panelFromTab, parseUrlState, tabFromPanel } from "./accountDirectoryWorkspace.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

console.log("\naccountDirectoryNotes.test.mjs\n");

{
  const backend = readFileSync(
    join(root, "backend-core/src/accountDirectory/accountDirectoryNotes.mjs"),
    "utf8"
  );
  assert.ok(backend.includes(`AD_NOTE_BODY_MAX = ${AD_NOTE_BODY_MAX}`));
  assert.equal(AD_NOTES_PAGE_SIZE, 25);
  assert.equal(validateNoteDraft("  ").ok, false);
  assert.equal(validateNoteDraft("").ok, false);
  assert.equal(validateNoteDraft("hello").ok, true);
  assert.equal(validateNoteDraft("x".repeat(AD_NOTE_BODY_MAX + 1)).ok, false);
  console.log("ok: add note requires non-empty content; max length shared with backend");
}

{
  const created = { id: "n-new", body: "fresh" };
  const page = prependCreatedNote({ items: [{ id: "n1" }, { id: "n2" }], pagination: { has_more: true } }, created);
  assert.deepEqual(
    page.items.map((row) => row.id),
    ["n-new", "n1", "n2"]
  );
  const edited = replaceNoteInPage(page, { id: "n1", body: "edited" });
  assert.equal(edited.items[1].body, "edited");
  const archived = removeNoteFromPage(edited, "n-new");
  assert.deepEqual(
    archived.items.map((row) => row.id),
    ["n1", "n2"]
  );
  console.log("ok: successful creation appears; edit/archive update the page");
}

{
  const items = Array.from({ length: 250 }, (_, i) => ({ id: `n-${i}` }));
  const bounded = applyHistoryPage(null, { items, pagination: { has_more: true } }, 1, noteItemId);
  assert.equal(bounded.items.length, AD_360_RENDER_WINDOW);
  const page2 = applyHistoryPage(
    { items: [{ id: "n-0" }, { id: "n-1" }] },
    { items: [{ id: "n-1" }, { id: "n-2" }], pagination: { has_more: false } },
    2,
    noteItemId
  );
  assert.deepEqual(
    page2.items.map((row) => row.id),
    ["n-0", "n-1", "n-2"]
  );
  console.log("ok: load more dedupes; render window bounds DOM");
}

{
  const store = createAccount360SessionStore();
  const a = store.beginAccount("acct-a");
  const page1 = { items: [{ id: "n1" }], pagination: { has_more: true } };
  await store.loadResource("acct-a", AD_NOTES_CACHE_KEY, async () => applyHistoryPage(null, page1, 1, noteItemId));
  const remount = await store.loadResource("acct-a", AD_NOTES_CACHE_KEY, async () => {
    throw new Error("page 1 must not reload");
  });
  assert.equal(remount.items.length, 1);

  store.setPanel("acct-a", "financials", { openAr: 1 });
  store.setPanel("acct-a", "relationship", { linked: true });
  store.setPanel("acct-a", "insights", { cards: [] });
  store.clearPanelFamily("acct-a", "notes");
  assert.equal(store.hasPanel("acct-a", AD_NOTES_CACHE_KEY), false);
  assert.equal(store.hasPanel("acct-a", "financials"), true);
  assert.equal(store.hasPanel("acct-a", "relationship"), true);
  assert.equal(store.hasPanel("acct-a", "insights"), true);

  const b = store.beginAccount("acct-b");
  assert.equal(shouldApplyHistoryPage(store, a.generation, "acct-a", "acct-a"), false);
  if (shouldApplyHistoryPage(store, a.generation, "acct-a", "acct-a")) {
    store.setPanel("acct-b", AD_NOTES_CACHE_KEY, remount);
  }
  assert.equal(store.hasPanel("acct-b", AD_NOTES_CACHE_KEY), false);
  assert.equal(store.isCurrent(b.generation, "acct-b"), true);
  console.log("ok: page 1 cached; mutation invalidates Notes only; stale A cannot land on B");
}

{
  assert.deepEqual(account360FetchesForSurface("overview"), ["financials", "relationship", "insights"]);
  assert.deepEqual(account360FetchesForSurface("notes"), ["notes:all"]);
  const overview = replayAccount360Navigation(createAccount360SessionStore(), "acct-1", [
    "overview",
    "connections",
    "relationship",
    "financials",
    "insights"
  ]);
  assert.deepEqual(overview, ACCOUNT360_DEFAULT_NAV_BUDGET);
  assert.equal(overview.notes, 0);

  const withNotes = replayAccount360Navigation(createAccount360SessionStore(), "acct-1", [
    "overview",
    "notes",
    "overview",
    "notes"
  ]);
  assert.equal(withNotes.notes, 1);
  assert.equal(withNotes.financials, 1);
  console.log("ok: Overview does not fetch notes; Notes visit caches page 1 once");
}

{
  assert.equal(panelFromTab("Notes"), "notes");
  assert.equal(tabFromPanel("notes"), "Notes");
  assert.equal(parseUrlState("?account=abc&panel=notes").panel, "notes");
  assert.equal(parseUrlState("?account=abc&panel=financials").panel, "financials");
  assert.equal(parseUrlState("?account=abc&panel=relationship").panel, "relationship");
  assert.equal(parseUrlState("?account=abc&panel=insights").panel, "insights");
  assert.equal(parseUrlState("?account=abc&panel=connections").panel, "connections");
  console.log("ok: Notes panel routing; existing 360 panels intact");
}

{
  const app = readFileSync(join(root, "app-account-directory/src/AccountDirectoryApp.tsx"), "utf8");
  const notesUi = readFileSync(join(root, "app-account-directory/src/ui/AccountNotes.tsx"), "utf8");
  const api = readFileSync(join(here, "accountDirectoryApi.ts"), "utf8");
  assert.ok(app.includes('"Notes"'));
  assert.ok(app.includes("AccountNotes"));
  assert.equal(app.includes("getAccountNotes"), false, "Overview/shell must not load notes history");
  assert.ok(notesUi.includes(AD_NOTES_EMPTY_COPY) || notesUi.includes("AD_NOTES_EMPTY_COPY"));
  assert.ok(notesUi.includes("Loading notes"));
  assert.ok(notesUi.includes("Could not load notes"));
  assert.ok(notesUi.includes("Retry"));
  assert.ok(notesUi.includes("canEdit"));
  assert.ok(notesUi.includes("Add note"));
  assert.ok(notesUi.includes("Archive this note?"));
  assert.ok(notesUi.includes("clearPanelFamily(accountId, \"notes\")") || notesUi.includes('clearPanelFamily(accountId, "notes")'));
  assert.ok(notesUi.includes("shouldApplyHistoryPage"));
  assert.ok(notesUi.includes("Load more"));
  assert.ok(api.includes("getAccountNotes"));
  assert.match(api, /getAccountNotes\([\s\S]*?init: RequestInit/, "notes GET accepts AbortSignal");
  assert.ok(api.includes("/notes/:noteId/archive") || api.includes("/notes/${encodeURIComponent(noteId)}/archive"));
  console.log("ok: Notes tab, states, permissions, and API wiring");
}

console.log("accountDirectoryNotes.test.mjs — all passed");
