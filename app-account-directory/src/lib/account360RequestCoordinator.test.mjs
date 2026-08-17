/**
 * Phase 2 — Account 360 request coordination tests.
 * Run: node app-account-directory/src/lib/account360RequestCoordinator.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCOUNT360_DEFAULT_NAV_BUDGET,
  account360FetchesForSurface,
  createAccount360SessionStore,
  isAbortError,
  needsAccount360Fetch,
  replayAccount360Navigation
} from "./account360RequestCoordinator.mjs";
import { applyHistoryPage, historyItemId, shouldApplyHistoryPage } from "./account360History.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

function counts(store) {
  return store.requestCounts();
}

{
  assert.equal(isAbortError({ name: "AbortError" }), true);
  assert.equal(isAbortError({ name: "AbortError", message: "The operation was aborted" }), true);
  assert.equal(isAbortError(new Error("network")), false);
  console.log("ok: AbortError detection");
}

{
  const store = createAccount360SessionStore();
  const a = store.beginAccount("acct-a");
  const aAgain = store.beginAccount("acct-a");
  assert.equal(a.generation, aAgain.generation);
  assert.equal(a.signal.aborted, false);
  assert.equal(counts(store).abort, 0);

  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), true);
  store.markFetch("financials");
  store.setPanel("acct-a", "financials", { openAr: 1 });
  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), false);

  const b = store.beginAccount("acct-b");
  assert.equal(a.signal.aborted, true);
  assert.equal(b.signal.aborted, false);
  assert.equal(store.isCurrent(a.generation, "acct-a"), false);
  assert.equal(store.isCurrent(b.generation, "acct-b"), true);
  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), false, "A remains cached");
  assert.equal(needsAccount360Fetch(store, "acct-b", "financials"), true);
  assert.ok(counts(store).abort >= 1);

  store.beginAccount("acct-a");
  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), false);
  assert.equal(store.getPanel("acct-a", "financials")?.openAr, 1);
  assert.equal(store.getPanel("acct-b", "financials")?.openAr, undefined);

  console.log("ok: same-account begin is a no-op; switch aborts; cache isolated");
}

{
  const store = createAccount360SessionStore();
  store.beginAccount("acct-a");
  let loads = 0;
  const loader = async () => {
    loads += 1;
    return { n: loads };
  };
  const p1 = store.loadResource("acct-a", "financials", loader);
  const p2 = store.loadResource("acct-a", "financials", loader);
  assert.equal(p1, p2);
  const value = await p1;
  const cached = await store.loadResource("acct-a", "financials", loader);
  assert.equal(value.n, 1);
  assert.equal(cached.n, 1);
  assert.equal(loads, 1);
  assert.equal(counts(store).financials, 1);
  console.log("ok: in-flight dedupe + cache hit");
}

{
  const store = createAccount360SessionStore();
  const a = store.beginAccount("acct-a");
  let resolveA;
  let releaseLoader;
  const loaderReady = new Promise((resolve) => {
    releaseLoader = resolve;
  });
  const aLoad = store.loadResource(
    "acct-a",
    "financials",
    () =>
      new Promise((resolve) => {
        resolveA = resolve;
        releaseLoader();
      })
  );
  await loaderReady;
  const b = store.beginAccount("acct-b");
  assert.equal(a.signal.aborted, true);
  resolveA({ from: "A" });
  const stale = await aLoad;
  assert.equal(stale.from, "A");
  assert.equal(store.hasPanel("acct-a", "financials"), false, "aborted/superseded A must not cache");
  assert.equal(store.isCurrent(a.generation, "acct-a"), false);

  await store.loadResource("acct-b", "financials", async () => ({ from: "B" }));
  assert.equal(store.getPanel("acct-b", "financials")?.from, "B");
  assert.notEqual(store.getPanel("acct-b", "financials")?.from, "A");

  const a2 = store.beginAccount("acct-a");
  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), true);
  await store.loadResource("acct-a", "financials", async () => ({ from: "A2" }));
  assert.equal(store.getPanel("acct-a", "financials")?.from, "A2");
  assert.equal(store.getPanel("acct-b", "financials")?.from, "B");
  assert.equal(store.isCurrent(a2.generation, "acct-a"), true);
  assert.equal(store.isCurrent(b.generation, "acct-b"), false);
  console.log("ok: A→B→A stale A cannot land on B; return to A may refetch if first A never cached");
}

{
  const store = createAccount360SessionStore();
  store.beginAccount("acct-a");
  await store.loadResource("acct-a", "financials", async () => ({ from: "A" }));
  store.beginAccount("acct-b");
  await store.loadResource("acct-b", "financials", async () => ({ from: "B" }));
  store.beginAccount("acct-a");
  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), false);
  assert.equal(store.getPanel("acct-a", "financials")?.from, "A");
  const reused = await store.loadResource("acct-a", "financials", async () => ({ from: "SHOULD_NOT" }));
  assert.equal(reused.from, "A");
  assert.equal(counts(store).financials, 2);
  console.log("ok: completed A cache reused after B");
}

{
  const store = createAccount360SessionStore();
  const path = [
    "overview",
    "connections",
    "relationship",
    "financials",
    "insights",
    "overview",
    "relationship",
    "financials"
  ];
  const result = replayAccount360Navigation(store, "acct-1", path);
  assert.deepEqual(result, ACCOUNT360_DEFAULT_NAV_BUDGET);
  assert.deepEqual(account360FetchesForSurface("connections"), []);
  assert.deepEqual(account360FetchesForSurface("insights"), []);
  assert.equal(store.hasPanel("acct-1", "trend:trailing_12"), true);
  assert.equal(store.hasPanel("acct-1", "invoices"), true);
  assert.equal(needsAccount360Fetch(store, "acct-1", "history:all"), false);
  assert.equal(needsAccount360Fetch(store, "acct-1", "timeline:all"), false);
  console.log("ok: Overview→Connections→Relationship→Financials→Insights→Overview→Relationship→Financials budget");
}

{
  const store = createAccount360SessionStore();
  store.beginAccount("acct-a");
  store.setPanel("acct-a", "financials", { openAr: 1 });
  store.setPanel("acct-a", "insights", { cards: [] });
  store.setPanel("acct-a", "history:all", { items: [{ id: "1" }] });
  store.setPanel("acct-a", "trend:trailing_12", { period: "trailing_12" });
  store.clearPanelFamily("acct-a", "financials");
  store.clearPanelFamily("acct-a", "insights");
  store.clearPanelFamily("acct-a", "history");
  store.clearPanelFamily("acct-a", "trend");
  assert.equal(store.hasPanel("acct-a", "financials"), false);
  assert.equal(store.hasPanel("acct-a", "insights"), false);
  assert.equal(store.hasPanel("acct-a", "history:all"), false);
  assert.equal(store.hasPanel("acct-a", "trend:trailing_12"), false);
  store.setPanel("acct-a", "relationship", { linked: true });
  store.setPanel("acct-a", "timeline:all", { items: [] });
  store.clearPanelFamily("acct-a", "relationship");
  store.clearPanelFamily("acct-a", "timeline");
  assert.equal(store.hasPanel("acct-a", "relationship"), false);
  assert.equal(store.hasPanel("acct-a", "timeline:all"), false);
  console.log("ok: identity mutation families clear only relevant keys");
}

{
  const store = createAccount360SessionStore();
  const a = store.beginAccount("acct-a");
  const page1 = { items: [{ id: "t1" }, { id: "t2" }], pagination: { page: 1, limit: 25, has_more: true } };
  await store.loadResource("acct-a", "history:all", async () => applyHistoryPage(null, page1, 1, historyItemId));
  const cached = store.getPanel("acct-a", "history:all");
  assert.equal(cached.items.length, 2);
  const remount = await store.loadResource("acct-a", "history:all", async () => {
    throw new Error("page 1 must not reload");
  });
  assert.equal(remount.items.length, 2);

  const page2 = {
    items: [{ id: "t2" }, { id: "t3" }],
    pagination: { page: 2, limit: 25, has_more: false }
  };
  let local = applyHistoryPage(cached, page2, 2, historyItemId);
  assert.deepEqual(
    local.items.map((row) => row.id),
    ["t1", "t2", "t3"]
  );
  assert.equal(local.pagination.has_more, false);

  const b = store.beginAccount("acct-b");
  assert.equal(shouldApplyHistoryPage(store, a.generation, "acct-a", "acct-a"), false);
  const staleAppend = applyHistoryPage(store.getPanel("acct-b", "history:all"), page2, 2, historyItemId);
  if (shouldApplyHistoryPage(store, a.generation, "acct-a", "acct-a")) {
    store.setPanel("acct-b", "history:all", staleAppend);
  }
  assert.equal(store.hasPanel("acct-b", "history:all"), false);
  assert.equal(store.getPanel("acct-a", "history:all").items.length, 2);
  assert.equal(store.isCurrent(b.generation, "acct-b"), true);

  store.clearPanel("acct-a", "history:all");
  assert.equal(needsAccount360Fetch(store, "acct-a", "history:all"), true);
  console.log("ok: history page 1 cached once; page 2 appends locally; stale page does not land on B");
}

{
  const api = readFileSync(join(here, "accountDirectoryApi.ts"), "utf8");
  const apiCore = readFileSync(join(here, "api.ts"), "utf8");
  assert.ok(apiCore.includes("...init"), "apiGet forwards RequestInit/signal");
  assert.ok(api.includes("init: RequestInit"), "account GETs accept RequestInit");
  assert.ok(api.includes("getAccountHistoryTransactions"));
  assert.ok(api.includes("getAccountOpenInvoices"));
  assert.ok(api.includes("getAccountTimeline"));
  assert.match(
    api,
    /getAccountHistoryTransactions\([\s\S]*?init: RequestInit/,
    "history GET accepts AbortSignal"
  );
  assert.match(api, /getAccountOpenInvoices\([\s\S]*?init: RequestInit/, "invoice GET accepts AbortSignal");
  assert.match(api, /getAccountTimeline\([\s\S]*?init: RequestInit/, "timeline GET accepts AbortSignal");

  const app = readFileSync(join(root, "app-account-directory/src/AccountDirectoryApp.tsx"), "utf8");
  assert.ok(app.includes("createAccount360SessionStore"));
  assert.ok(app.includes("loadResource"));
  assert.ok(app.includes("clearPanelFamily"));
  assert.ok(app.includes("refreshAfterIdentityChange"));
  assert.ok(!/detailTab,\s*sessionToken,\s*accountId/.test(app), "summary effects must not refetch solely on tab change");

  const panels = readFileSync(join(root, "app-account-directory/src/ui/Account360Panels.tsx"), "utf8");
  assert.ok(panels.includes("session360"));
  assert.ok(panels.includes("loadResource"));
  assert.ok(panels.includes("trend:${period}"));
  assert.ok(panels.includes("history:${historyType}"));
  assert.ok(panels.includes("timeline:${family}"));
  assert.ok(panels.includes("monthlyTrend"));
  assert.ok(panels.includes("invoicePage <= 1"));
  assert.ok(panels.includes("disabled={invoiceMoreBusy}"));
  assert.ok(panels.includes("canLoadMoreHistory"));

  const connections = readFileSync(join(root, "app-account-directory/src/ui/AccountConnections.tsx"), "utf8");
  assert.ok(connections.includes("[accountId]"));
  assert.ok(connections.includes("mwAbortRef.current?.abort()"));
  assert.ok(connections.includes("setQbPickerOpen(false)"));

  const picker = readFileSync(join(root, "app-account-directory/src/ui/QuickBooksCustomerPicker.tsx"), "utf8");
  assert.ok(picker.includes("[accountId]"));
  assert.ok(picker.includes("AbortController"));

  console.log("ok: API signal + app/panel/connections wiring contracts");
}

console.log("account360RequestCoordinator.test.mjs — all passed");
