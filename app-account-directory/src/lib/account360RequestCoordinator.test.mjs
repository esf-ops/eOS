/**
 * Phase 0D — Account 360 request coordination tests.
 * Run: node app-account-directory/src/lib/account360RequestCoordinator.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAccount360SessionStore,
  isAbortError,
  needsAccount360Fetch
} from "./account360RequestCoordinator.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

{
  assert.equal(isAbortError({ name: "AbortError" }), true);
  assert.equal(isAbortError({ name: "AbortError", message: "The operation was aborted" }), true);
  assert.equal(isAbortError(new Error("network")), false);
  console.log("ok: AbortError detection");
}

{
  const store = createAccount360SessionStore();
  const a = store.beginAccount("acct-a");
  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), true);
  store.markFetch("financials");
  store.setPanel("acct-a", "financials", { openAr: 1 });
  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), false);
  assert.equal(store.getPanel("acct-a", "financials")?.openAr, 1);

  // Tab revisit: still cached — no second fetch needed
  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), false);
  assert.equal(needsAccount360Fetch(store, "acct-a", "relationship"), true);
  store.markFetch("relationship");
  store.setPanel("acct-a", "relationship", { linked: true });
  assert.equal(needsAccount360Fetch(store, "acct-a", "relationship"), false);

  // Insights once per account session (Overview + Insights share cache)
  assert.equal(needsAccount360Fetch(store, "acct-a", "insights"), true);
  store.markFetch("insights");
  store.setPanel("acct-a", "insights", { overview: [{ id: "x" }] });
  assert.equal(needsAccount360Fetch(store, "acct-a", "insights"), false);
  assert.deepEqual(store.requestCounts(), { financials: 1, relationship: 1, insights: 1, abort: 0 });

  // Switch account aborts prior controller and requires new loads
  const b = store.beginAccount("acct-b");
  assert.equal(a.signal.aborted, true);
  assert.equal(b.signal.aborted, false);
  assert.equal(store.isCurrent(a.generation, "acct-a"), false);
  assert.equal(store.isCurrent(b.generation, "acct-b"), true);
  assert.equal(needsAccount360Fetch(store, "acct-b", "financials"), true);
  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), false, "A remains cached");
  store.markFetch("financials");
  store.setPanel("acct-b", "financials", { openAr: 2 });
  assert.deepEqual(store.requestCounts().financials, 2);
  assert.ok(store.requestCounts().abort >= 1);

  // Returning to A reuses session cache
  const a2 = store.beginAccount("acct-a");
  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), false);
  assert.equal(store.getPanel("acct-a", "financials")?.openAr, 1);
  assert.equal(store.isCurrent(a2.generation, "acct-a"), true);

  // Mutation invalidates account
  store.invalidateAccount("acct-a");
  assert.equal(needsAccount360Fetch(store, "acct-a", "financials"), true);
  assert.equal(needsAccount360Fetch(store, "acct-a", "insights"), true);

  // Stale generation cannot apply
  assert.equal(store.isCurrent(a.generation, "acct-a"), false);

  console.log("ok: session cache, abort on switch, invalidate on mutation");
}

{
  // Simulated Overview → Financials → Relationship → Insights request plan
  const store = createAccount360SessionStore();
  store.beginAccount("acct-1");
  const path = ["overview", "financials", "relationship", "insights", "overview", "financials"];
  /** @type {string[]} */
  const fetches = [];
  for (const step of path) {
    if (step === "overview" || step === "financials") {
      if (needsAccount360Fetch(store, "acct-1", "financials")) {
        store.markFetch("financials");
        store.setPanel("acct-1", "financials", {});
        fetches.push("financials");
      }
      if (step === "overview" && needsAccount360Fetch(store, "acct-1", "relationship")) {
        store.markFetch("relationship");
        store.setPanel("acct-1", "relationship", {});
        fetches.push("relationship");
      }
      if (step === "overview" && needsAccount360Fetch(store, "acct-1", "insights")) {
        store.markFetch("insights");
        store.setPanel("acct-1", "insights", {});
        fetches.push("insights");
      }
    }
    if (step === "relationship" && needsAccount360Fetch(store, "acct-1", "relationship")) {
      store.markFetch("relationship");
      store.setPanel("acct-1", "relationship", {});
      fetches.push("relationship");
    }
    if (step === "insights" && needsAccount360Fetch(store, "acct-1", "insights")) {
      store.markFetch("insights");
      store.setPanel("acct-1", "insights", {});
      fetches.push("insights");
    }
  }
  assert.deepEqual(fetches, ["financials", "relationship", "insights"]);
  assert.deepEqual(store.requestCounts(), {
    financials: 1,
    relationship: 1,
    insights: 1,
    abort: 0
  });
  console.log("ok: Overview→Financials→Relationship→Insights fetches once each");
}

{
  const api = readFileSync(join(here, "accountDirectoryApi.ts"), "utf8");
  const apiCore = readFileSync(join(here, "api.ts"), "utf8");
  assert.ok(apiCore.includes("...init"), "apiGet forwards RequestInit/signal");
  assert.ok(api.includes("init: RequestInit"), "account GETs accept RequestInit");
  assert.ok(api.includes("getAccountFinancials"), "financials client present");
  assert.ok(api.includes("getAccountRelationship"), "relationship client present");
  assert.ok(api.includes("getAccountInsights"), "insights client present");

  const app = readFileSync(join(root, "app-account-directory/src/AccountDirectoryApp.tsx"), "utf8");
  assert.ok(app.includes("createAccount360SessionStore") || app.includes("account360"), "app wires 360 session store");
  assert.ok(app.includes("isAbortError"), "app handles abort");
  assert.ok(app.includes("needsAccount360Fetch") || app.includes("hasPanel"), "app reuses panel cache");
  assert.ok(!/detailTab,\s*sessionToken,\s*accountId/.test(app), "financial/relationship effects must not refetch solely on tab change");
  assert.ok(
    app.includes("controller.abort()") && app.includes("getAccount(sessionToken, accountId"),
    "detail load aborts on account switch"
  );

  const insights = readFileSync(join(here, "../ui/AccountInsights.tsx"), "utf8");
  assert.ok(
    insights.includes("insights?:") ||
      insights.includes("insights,") ||
      insights.includes("cachedInsights") ||
      insights.includes("onInsightsLoaded"),
    "Insights panel accepts shared session insights"
  );

  console.log("ok: API signal + app wiring contracts");
}

console.log("account360RequestCoordinator.test.mjs — all passed");
