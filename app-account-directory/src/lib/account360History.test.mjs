/**
 * Phase 2 — Account 360 history bounds / pagination tests.
 * Run: node app-account-directory/src/lib/account360History.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AD_360_HISTORY_PAGE_SIZE,
  AD_360_INVOICE_PAGE_SIZE,
  AD_360_RENDER_WINDOW,
  AD_360_TIMELINE_PAGE_SIZE,
  appendUniqueBounded,
  applyHistoryPage,
  canLoadMoreHistory,
  historyExhaustedCopy,
  historyItemId,
  invoiceItemId,
  shouldApplyHistoryPage,
  timelineItemId
} from "./account360History.mjs";
import { createAccount360SessionStore } from "./account360RequestCoordinator.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

{
  assert.equal(AD_360_HISTORY_PAGE_SIZE, 25);
  assert.equal(AD_360_INVOICE_PAGE_SIZE, 50);
  assert.equal(AD_360_TIMELINE_PAGE_SIZE, 25);
  assert.equal(AD_360_RENDER_WINDOW, 200);
  console.log("ok: bounded page sizes and render window");
}

{
  const page1 = applyHistoryPage(
    null,
    {
      items: [
        { id: "a" },
        { id: "a" },
        { id: "b" }
      ],
      pagination: { page: 1, limit: 25, has_more: true }
    },
    1,
    historyItemId
  );
  assert.deepEqual(
    page1.items.map((row) => row.id),
    ["a", "b"]
  );
  assert.equal(page1.pagination.has_more, true);

  const page2 = applyHistoryPage(
    page1,
    {
      items: [{ id: "b" }, { id: "c" }],
      pagination: { page: 2, limit: 25, has_more: true }
    },
    2,
    historyItemId
  );
  assert.deepEqual(
    page2.items.map((row) => row.id),
    ["a", "b", "c"]
  );
  assert.equal(page2.pagination.has_more, true);
  console.log("ok: page 1 unique; page 2 appends once; duplicate IDs dropped");
}

{
  const ids = new Set();
  const items = [];
  for (let i = 0; i < AD_360_RENDER_WINDOW; i += 1) {
    items.push({ id: `row-${i}` });
    ids.add(`row-${i}`);
  }
  const filled = applyHistoryPage(null, { items, pagination: { has_more: true } }, 1, historyItemId);
  assert.equal(filled.items.length, AD_360_RENDER_WINDOW);
  assert.equal(filled.pagination.has_more, false, "window cap stops further requests");
  assert.equal(canLoadMoreHistory(filled.pagination, filled.items.length), false);
  assert.match(String(historyExhaustedCopy(filled.pagination, filled.items.length)), /first 200/);

  const extra = applyHistoryPage(
    filled,
    { items: [{ id: "overflow" }], pagination: { has_more: true } },
    2,
    historyItemId
  );
  assert.equal(extra.items.length, AD_360_RENDER_WINDOW);
  assert.equal(
    extra.items.some((row) => row.id === "overflow"),
    false
  );
  console.log("ok: render window bounds DOM growth without dropping page-1 access");
}

{
  const exhausted = applyHistoryPage(
    { items: [{ id: "1" }], pagination: { has_more: true } },
    { items: [{ id: "1" }], pagination: { has_more: true } },
    2,
    historyItemId
  );
  assert.equal(exhausted.pagination.has_more, false, "all-duplicate page 2 stops requesting more");
  assert.equal(canLoadMoreHistory(exhausted.pagination, exhausted.items.length), false);
  assert.equal(historyExhaustedCopy({ has_more: false }, 3), "End of available history.");
  console.log("ok: exhausted history stops requesting more");
}

{
  const store = createAccount360SessionStore();
  const a = store.beginAccount("acct-a");
  assert.equal(shouldApplyHistoryPage(store, a.generation, "acct-a", "acct-a"), true);
  store.beginAccount("acct-b");
  assert.equal(shouldApplyHistoryPage(store, a.generation, "acct-a", "acct-a"), false);
  assert.equal(shouldApplyHistoryPage(store, a.generation, "acct-b", "acct-a"), false);
  console.log("ok: stale page cannot apply to another account");
}

{
  const merged = appendUniqueBounded(
    [{ reference_number: "100" }],
    [
      { reference_number: "100" },
      { reference_number: "101" }
    ],
    invoiceItemId
  );
  assert.equal(merged.items.length, 2);
  assert.equal(merged.duplicates, 1);
  assert.equal(timelineItemId({ id: "evt-1" }), "evt-1");
  console.log("ok: invoice/timeline id helpers dedupe");
}

{
  const store = createAccount360SessionStore();
  store.beginAccount("acct-a");
  const first = applyHistoryPage(
    null,
    { items: [{ id: "p1" }], pagination: { page: 1, limit: 25, has_more: true } },
    1,
    historyItemId
  );
  store.setPanel("acct-a", "history:all", first);
  store.clearPanel("acct-a", "history:all");
  assert.equal(store.hasPanel("acct-a", "history:all"), false);
  const refreshed = applyHistoryPage(
    null,
    { items: [{ id: "p1-refresh" }], pagination: { page: 1, limit: 25, has_more: false } },
    1,
    historyItemId
  );
  store.setPanel("acct-a", "history:all", refreshed);
  assert.equal(store.getPanel("acct-a", "history:all").items[0].id, "p1-refresh");
  console.log("ok: intentional reset/refresh replaces page 1");
}

{
  const backend = readFileSync(
    join(root, "backend-core/src/accountDirectory/accountDirectory360.mjs"),
    "utf8"
  );
  const history = readFileSync(
    join(root, "backend-core/src/accountDirectory/accountDirectoryCustomerHistory.mjs"),
    "utf8"
  );
  const financials = readFileSync(
    join(root, "backend-core/src/accountDirectory/accountDirectoryFinancialIntelligence.mjs"),
    "utf8"
  );
  const moraware = readFileSync(
    join(root, "backend-core/src/accountDirectory/accountDirectoryMorawareLinkage.mjs"),
    "utf8"
  );
  assert.ok(backend.includes("AD_360_PAGE_DEFAULT = 25"));
  assert.ok(backend.includes("AD_360_PAGE_MAX = 50"));
  assert.ok(backend.includes("AD_INVOICE_PAGE_MAX = 100"));
  assert.ok(history.includes("AD_HISTORY_TXN_PAGE_MAX = 50"));
  assert.ok(history.includes("AD_HISTORY_TIMELINE_CAP = 200"));
  assert.ok(financials.includes("slice(0, 50)"));
  assert.ok(moraware.includes("MORAWARE_RECENT_JOB_LIMIT = 8"));
  console.log("ok: backend page bounds remain in place (no Phase 2 backend change required)");
}

{
  const panels = readFileSync(join(root, "app-account-directory/src/ui/Account360Panels.tsx"), "utf8");
  assert.ok(panels.includes("applyHistoryPage"));
  assert.ok(panels.includes("disabled={historyMoreBusy}") || panels.includes("disabled={historyMoreBusy}"));
  assert.ok(panels.includes("disabled={timelineMoreBusy}"));
  assert.ok(panels.includes("invoicePage <= 1"));
  console.log("ok: panels wire bounded append + disabled load more");
}

console.log("account360History.test.mjs — all passed");
